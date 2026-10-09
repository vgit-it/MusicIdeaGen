// Plays a list of ideas back to back: one idea on a loop, a whole track once, or one section on a loop.

import * as Tone from 'tone';
import type { Genre } from '../genres';
import type { GuitarHit, Idea } from '../idea';
import { cymbalAccent, groupStarts } from '../rhythm';
import { pianoVoicing } from '../theory';
import { type GuitarVoicing, guitarVoicings } from '../theory/guitar';
import {
  Bass, type BassId, type BassTone, type ChordInstrument, type ChordInstrumentId, DrumKit, type DrumKitId, Guitar, Piano,
} from './instruments';
import { DYNAMICS, SECTION_DB } from './dynamics';
import { inContext } from './context';
import { LAYER_PARTS, type LayerPart, type MixPart, type MixState, Mixer } from './mixer';
import { Percussion } from './percussion';
import { Strings } from './strings';
import { AUTO_PAD, Pad, type PadChoice } from './pad';
import { AUTO_CHORDS, AUTO_GUITAR2 } from '../sounds';
import { type KeysChoice, type Layer, type LayerNote, type PercChoice, type StringsChoice, byStep, writeLayer } from '../parts/layers';

export interface EngineSettings {
  chord: ChordChoice;
  guitar2: ChordChoice;
  bassSynth: boolean;
  drumSynth: boolean;
  mix: MixState;
  layers: LayerSettings;
}

/** The layers you've added (left out = removed) and their style or tone. */
export interface LayerSettings {
  keys?: KeysChoice; pad?: PadChoice; strings?: StringsChoice; perc?: PercChoice;
  /** Layers that play every bar of every section (the rest come and go with the arrangement). */
  throughout?: LayerPart[];
}

export type ChordChoice = ChordInstrumentId | 'auto';

/** Bass sound per genre: more growl for heavier styles. */
const BASS_TONES: Record<Genre, BassTone> = {
  rock: 'grit',
  pop: 'warm',
  funk: 'clean',
  hardrock: 'grit',
  metal: 'grit',
  grunge: 'heavy',
  altmetal: 'heavy',
};


/** Silent steps after a track ends, so the last chord can ring out. */
const TAIL_STEPS = 32;

export const INSTRUMENT_NAMES: Record<string, string> = {
  piano: 'piano', pad: 'synth pad', acoustic: 'acoustic guitar', electric: 'electric guitar', bass: 'bass', drums: 'drums',
  strings: 'strings', perc: 'percussion',
};

type Voicing = { notes: number[]; strings?: number[] };

export class Engine {
  readonly mixer = new Mixer();
  // rhythm instruments are built when first used (unused ones would still cost CPU, live and offline)
  // electric guitars: one per amp setting, never re-voiced while playing (see instFor)
  private rhythmInsts = new Map<ChordInstrumentId, ChordInstrument>();
  readonly bass = new Bass(this.mixer.input('bass'));
  readonly drums = new DrumKit(this.mixer.input('drums'));

  /** What's playing: one idea (looped), a track, or one section (looped). */
  private list: Idea[] = [];
  private idx = 0;
  private loop = true;
  /** Per item: guitar hits indexed by step. */
  private hitsAt: (GuitarHit[][] | null)[] = [];
  private hitsAt2: GuitarHit[][][] = [];
  /** Chord voicings per item and instrument, computed when first needed. */
  private voicingCache = new WeakMap<Idea, Map<ChordInstrumentId, { voicings: Voicing[]; shapes: GuitarVoicing[] | null }>>();

  private chordChoice: ChordChoice = 'auto';
  private chordInst: ChordInstrument | null = null;
  private chordId: ChordInstrumentId = 'piano';

  // guitar 2: its own instruments (single take, slightly right), created when first needed
  private g2Insts = new Map<ChordInstrumentId, ChordInstrument>();
  private g2Choice: ChordChoice = 'auto';
  private g2Inst: ChordInstrument | null = null;
  private g2Id: ChordInstrumentId = 'electric-clean';
  // added layers: built when first added
  private layers: LayerSettings = {};
  private keysInst: Piano | null = null;
  private padInst: Pad | null = null;
  private stringsInst: Strings | null = null;
  private percInst: Percussion | null = null;
  /** Layer parts per item, written when first needed (and again if the style changes). */
  private layerCache = new WeakMap<Idea, Map<string, { layer: Layer; at: LayerNote[][] }>>();
  private step = 0;
  /** Steps since a track ended (-1 while playing). */
  private tail = -1;
  playing = false;
  onBar: (bar: number) => void = () => {};
  /** A new item in the list started (index into the list). */
  onSection: (i: number) => void = () => {};
  /** A track finished playing. */
  onEnd: () => void = () => {};
  onStatus: (msg: string) => void = () => {};

  /** This engine's own clock and context (an offline render has its own, separate from the live ones). */
  private ctx = Tone.getContext();
  private transport = Tone.getTransport();

  /** `offline`: built inside Tone.Offline to render audio files. */
  constructor(private readonly offline = false) {
    this.transport.scheduleRepeat((t) => this.tick(t), '16n');
  }

  /** Instrument choices and the mix, to copy into an offline render. */
  settings(): EngineSettings {
    return {
      chord: this.chordChoice, guitar2: this.g2Choice, bassSynth: this.bass.useSynth, drumSynth: this.drums.useSynth,
      mix: this.mixer.state(), layers: this.layerSettings,
    };
  }

  /** Copy settings (`openAll`: ignore mutes and solos, for stems). */
  applySettings(s: EngineSettings, openAll = false) {
    this.chordChoice = s.chord;
    this.g2Choice = s.guitar2;
    this.bass.useSynth = s.bassSynth;
    this.drums.useSynth = s.drumSynth;
    const mix = openAll
      ? (Object.fromEntries(Object.entries(s.mix).map(([p, v]) => [p, { ...v, mute: false, solo: false }])) as MixState)
      : s.mix;
    this.mixer.restore(mix);
    for (const p of LAYER_PARTS) this.setLayer(p, s.layers[p] ?? null);
    this.layers.throughout = [...(s.layers.throughout ?? [])];
  }

  /* ---- layers you can add and remove */

  get layerSettings(): LayerSettings {
    const { throughout, ...rest } = this.layers;
    return throughout?.length ? { ...rest, throughout: [...throughout] } : rest;
  }

  /** A layer plays every bar (true) or comes and goes with the arrangement (false, the default). */
  setLayerThroughout(part: LayerPart, on: boolean) {
    const t = new Set(this.layers.throughout ?? []);
    if (on) t.add(part); else t.delete(part);
    this.layers.throughout = [...t];
    if (!this.layers.throughout.length) delete this.layers.throughout;
  }

  /** Add a layer (or change its style/tone), or remove it with null. */
  setLayer(part: LayerPart, choice: KeysChoice | PadChoice | StringsChoice | PercChoice | null) {
    if (part === 'strings') {
      if (choice === null) { delete this.layers.strings; this.stringsInst?.releaseAll(); return; }
      this.layers.strings = choice as StringsChoice;
      this.stringsInst ??= inContext(this.ctx, () => new Strings(this.mixer.input('strings')));
      this.stringsInst.setEnergy(this.idea?.section?.energy ?? 4, this.ctx.now());
      if (!this.offline) void this.ensureLoaded(this.stringsInst, 'strings');
    } else if (part === 'perc') {
      if (choice === null) { delete this.layers.perc; return; }
      this.layers.perc = choice as PercChoice;
      this.percInst ??= inContext(this.ctx, () => new Percussion(this.mixer.input('perc')));
      if (!this.offline) void this.ensureLoaded(this.percInst, 'perc');
    } else if (part === 'keys') {
      if (choice === null) { delete this.layers.keys; this.keysInst?.releaseAll(); return; }
      this.layers.keys = choice as KeysChoice;
      this.keysInst ??= inContext(this.ctx, () => new Piano(this.mixer.input('keys')));
      if (!this.offline) void this.ensureLoaded(this.keysInst, 'piano');
    } else {
      if (choice === null) { delete this.layers.pad; this.padInst?.releaseAll(); return; }
      this.layers.pad = choice as PadChoice;
      this.padInst ??= inContext(this.ctx, () => new Pad(this.mixer.input('pad')));
      this.applyPadTone();
    }
  }

  private applyPadTone() {
    const p = this.layers.pad;
    if (!p || !this.padInst) return;
    this.padInst.setTone(p === 'auto' ? AUTO_PAD[this.idea?.song.genre ?? 'pop'] : p);
    this.padInst.setEnergy(this.idea?.section?.energy ?? 4, this.ctx.now());
  }

  /** A layer's part for an item (null when the layer is off). */
  layerFor(idea: Idea, part: LayerPart): Layer | null {
    return this.layerAt(idea, part)?.layer ?? null;
  }

  private layerAt(idea: Idea, part: LayerPart) {
    const choice = this.layers[part];
    if (!choice) return null;
    let m = this.layerCache.get(idea);
    if (!m) this.layerCache.set(idea, (m = new Map()));
    const all = !!this.layers.throughout?.includes(part);
    const k = `${part}:${part === 'pad' ? '' : choice}:${all}`;
    let v = m.get(k);
    if (!v) {
      const seed = idea.seeds[part] ?? `${idea.seeds.chords}-${part}`;
      const layer = writeLayer(part, idea, choice, seed, all);
      m.set(k, (v = { layer, at: byStep(layer.notes, idea.song.total) }));
    }
    return v;
  }

  /** Every instrument the list plays on (sections can use different ones). */
  private instsNeeded() {
    const chords = new Map(this.list.map((i) => [this.instFor(this.chordIdFor(i)), this.chordIdFor(i)]));
    const g2 = new Map(this.list.filter((i) => i.guitar2.length).map((i) => [this.g2InstFor(this.guitar2IdFor(i)), this.guitar2IdFor(i)]));
    return [...chords, ...g2];
  }

  /** Offline: wait until every instrument the list needs has its samples. */
  async loadAll() {
    const insts = [this.drums, this.bass, this.g2Inst, this.keysInst, this.stringsInst, this.percInst, ...this.instsNeeded().map(([inst]) => inst)]
      .filter((x): x is NonNullable<typeof x> => !!x);
    // load() hands back the same promise while loading, so this waits for loads already under way
    await Promise.all(insts.map((inst) => inst.load()));
  }

  /** Offline: play the list from the top, or from a step into the first item (the offline clock drives it). */
  startOffline(fromStep = 0) {
    this.step = fromStep;
    this.tail = -1;
    this.playing = true;
    // a moment in, so notes played slightly early (human timing) never land before zero
    this.transport.start(0.05);
  }

  private get idea(): Idea | null {
    return this.list[this.idx] ?? null;
  }

  /** Resolve 'auto' to a concrete instrument for an item (default: the current one): a track section's own sound, or the genre's. */
  chordIdFor(idea = this.idea): ChordInstrumentId {
    if (this.chordChoice !== 'auto') return this.chordChoice;
    const id = idea?.section?.sound?.chords ?? AUTO_CHORDS[idea?.song.partGenres.strum ?? 'pop'];
    // with the piano layer on, the guitarist plays guitar (two pianos would play over each other)
    return id === 'piano' && this.layers.keys ? (idea?.song.partGenres.strum === 'funk' ? 'electric-clean' : 'acoustic') : id;
  }

  /** The same for Guitar 2. */
  guitar2IdFor(idea = this.idea): ChordInstrumentId {
    if (this.g2Choice !== 'auto') return this.g2Choice;
    const id = idea?.section?.sound?.guitar2 ?? AUTO_GUITAR2[idea?.song.partGenres.strum ?? 'pop'];
    return id === 'piano' && this.layers.keys ? 'electric-clean' : id;
  }

  /** True when the rhythm part is on Auto (so track sections pick their own sound). */
  get rhythmAuto(): boolean {
    return this.chordChoice === 'auto';
  }

  get chordInstrumentId(): ChordInstrumentId {
    return this.chordIdFor();
  }

  /** Guitar shapes for the current item (null for piano and riff ideas). */
  shapesFor(idea: Idea): GuitarVoicing[] | null {
    return this.voicingsFor(idea).shapes;
  }

  /** Change tempo without restarting. */
  setTempo(bpm: number) {
    this.transport.bpm.value = bpm;
    this.mixer.setTempo(bpm);
  }

  /** Play one idea on a loop (`keepPlace`: carry on from the same bar, for rerolls). */
  setIdea(idea: Idea, keepPlace = false) {
    this.setList([idea], true, 0, keepPlace);
  }

  /**
   * Play a list of ideas back to back from `start`, looping or once. Jumps straight there if playing,
   * unless `keepPlace`: then playback carries on from the same spot in the new music (rerolls).
   */
  setList(list: Idea[], loop: boolean, start = 0, keepPlace = false) {
    const place = keepPlace && this.playing && this.tail < 0 && start === this.idx && list[start] ? this.step : 0;
    this.list = list;
    this.loop = loop;
    this.idx = start;
    this.step = place < list[start].song.total ? place : 0;
    this.tail = -1;
    const { song } = list[0];
    const tr = this.transport;
    tr.swing = song.swing;
    tr.swingSubdivision = '16n';
    this.setTempo(song.bpm);
    this.bass.setTone(BASS_TONES[song.partGenres.bass]);
    const index = (hits: GuitarHit[], total: number) => {
      const at = Array.from({ length: total }, () => [] as GuitarHit[]);
      for (const h of hits) at[h.step]?.push(h);
      return at;
    };
    this.hitsAt = list.map((i) => (i.guitar ? index(i.guitar, i.song.total) : null));
    this.hitsAt2 = list.map((i) => index(i.guitar2, i.song.total));
    this.applyChordInstrument();
    this.applyGuitar2();
    this.applyPadTone();
    // start loading the instruments later sections play on
    if (!this.offline) for (const [inst, id] of this.instsNeeded()) void this.ensureLoaded(inst, kindOf(id));
    this.applyLevel(this.ctx.now());
    if (this.playing) this.onSection(start);
  }

  /** Index of the item playing now (in the current list). */
  get position(): number {
    return this.idx;
  }

  private applyLevel(time: number) {
    const e = this.idea?.section?.energy ?? 4;
    this.mixer.setSectionLevel(SECTION_DB[e], time);
    this.padInst?.setEnergy(e, time);
    this.stringsInst?.setEnergy(e, time);
  }

  get guitar2InstrumentId(): ChordInstrumentId {
    return this.guitar2IdFor();
  }

  setGuitar2Instrument(choice: ChordChoice) {
    this.g2Choice = choice;
    this.applyGuitar2();
  }

  /** Guitar 2's instrument for a sound: its own (a single take, slightly right), so it never shares an amp with the rhythm part. */
  private g2InstFor(id: ChordInstrumentId): ChordInstrument {
    // a little right of centre, apart from the double-tracked rhythm part
    return getOrMake(this.g2Insts, id, () => inContext(this.ctx, () => makeInst(id, this.mixer.input('guitar2'), false, 0.15, true)));
  }

  /** `release`: stop what the old instrument is playing (not at a section change, where it rings on). */
  private applyGuitar2(release = true) {
    const id = this.guitar2InstrumentId;
    const inst = this.g2InstFor(id);
    if (release && this.g2Inst && this.g2Inst !== inst) this.g2Inst.releaseAll();
    this.g2Inst = inst;
    this.g2Id = id;
    void this.ensureLoaded(inst, kindOf(id));
  }

  setChordInstrument(choice: ChordChoice) {
    this.chordChoice = choice;
    this.applyChordInstrument();
  }

  setBass(id: BassId) {
    this.bass.useSynth = id === 'synth';
  }

  setDrums(id: DrumKitId) {
    this.drums.useSynth = id === 'synth';
  }

  setVolume(part: MixPart, v: number) { this.mixer.setVolume(part, v); }
  setMute(part: MixPart, on: boolean) { this.mixer.setMute(part, on); }
  setSolo(part: MixPart, on: boolean) { this.mixer.setSolo(part, on); }

  /**
   * The rhythm instrument for a sound. Each amp setting is its own guitar: switching an amp while
   * notes ring (or are already scheduled) made a loud burst and a lopsided first chord at section changes.
   */
  private instFor(id: ChordInstrumentId): ChordInstrument {
    return getOrMake(this.rhythmInsts, id, () => inContext(this.ctx, () => makeInst(id, this.mixer.input('chords'), true, 0)));
  }

  /** `release`: stop what the old instrument is playing (not at a section change, where it rings on). */
  private applyChordInstrument(release = true) {
    const id = this.chordInstrumentId;
    const prev = this.chordInst;
    this.chordInst = this.instFor(id);
    this.chordId = id;
    // driven guitars sit in more room: a wall of sound rather than a dry, close-miked part
    this.mixer.setReverbExtra('chords', driven(id) ? 5 : 0);
    this.mixer.setHall('chords', driven(id) ? -12 : -Infinity);
    if (release && prev && prev !== this.chordInst && !this.offline) prev.releaseAll();
    void this.ensureLoaded(this.chordInst, kindOf(id));
  }

  private async ensureLoaded(inst: { state: string; load(): Promise<void> }, name: string) {
    if (inst.state !== 'idle') return;
    this.onStatus(`Loading ${INSTRUMENT_NAMES[name]}…`);
    await inst.load();
    const loaded = (inst.state as string) === 'ready'; // state changed during load()
    this.onStatus(loaded ? '' : `Couldn't load ${INSTRUMENT_NAMES[name]} samples — using a synth instead.`);
  }

  /** Load the samples needed right now. Resolves when done (or failed). */
  async loadCore() {
    await Promise.all([
      this.ensureLoaded(this.drums, 'drums'),
      this.ensureLoaded(this.bass, 'bass'),
    ]);
    const failed = [this.drums.state === 'failed' && 'drums', this.bass.state === 'failed' && 'bass'].filter(Boolean);
    return failed as string[];
  }

  private voicingsFor(idea: Idea) {
    const id = this.chordIdFor(idea);
    let byId = this.voicingCache.get(idea);
    if (!byId) this.voicingCache.set(idea, (byId = new Map()));
    let v = byId.get(id);
    if (!v) {
      const chords = idea.chords.timeline.map((e) => e.chord);
      if (id === 'piano' || idea.guitar) {
        // riff ideas carry their own fingering, so there are no chord shapes to show
        v = { shapes: null, voicings: chords.map((c) => ({ notes: pianoVoicing(idea.song.key, c) })) };
      } else {
        const shapes = guitarVoicings(idea.song.key, chords, { preferOpen: id === 'acoustic', powerChords: id === 'electric-dist' });
        v = { shapes, voicings: shapes.map((s) => ({ notes: s.notes, strings: s.frets.flatMap((f, n) => (f === null ? [] : [n])) })) };
      }
      byId.set(id, v);
    }
    return v;
  }

  async start() {
    await Tone.start();
    if (this.playing) return;
    this.step = 0;
    this.tail = -1;
    if (this.chordIdFor() !== this.chordId) this.applyChordInstrument();
    if (this.guitar2IdFor() !== this.g2Id) this.applyGuitar2();
    this.transport.start('+0.1');
    this.playing = true;
    this.onSection(this.idx);
  }

  stop() {
    this.transport.stop();
    this.playing = false;
    // every instrument: the last notes of an earlier section can still be ringing
    for (const inst of [...this.rhythmInsts.values(), ...this.g2Insts.values()]) inst.releaseAll();
    this.bass.releaseAll();
    this.keysInst?.releaseAll();
    this.padInst?.releaseAll();
    this.stringsInst?.releaseAll();
    this.onBar(-1);
  }

  /** `ring` overrides how long the hit rings (the final chord of a track). */
  private playHit(inst: ChordInstrument, h: GuitarHit, time: number, six: number, dyn = 1, ring?: number, legato = false) {
    inst.strum({
      stroke: h.mute === 'palm' ? 'p' : h.mute === 'dead' ? 'x' : 'D',
      notes: h.notes,
      strings: h.strings,
      time,
      // driven guitars sustain into the next hit (a gap is loud through the drive); others breathe
      dur: ring ?? (legato ? Math.min(h.len * six + 0.05, 5) : Math.min(h.len * six * 0.97, 4)),
      vel: h.vel * dyn,
      sixteenth: six,
      clean: h.clean,
      letRing: h.letRing,
      slide: h.slide,
      swell: h.swell,
    });
  }

  /** A new item starts: on Auto, instruments follow the section's sound. */
  private enterItem(time: number) {
    // a different instrument (or amp setting) from here on; what's still ringing carries on
    if (this.chordIdFor() !== this.chordId) this.applyChordInstrument(false);
    if (this.guitar2IdFor() !== this.g2Id) this.applyGuitar2(false);
    this.applyLevel(time);
    if (this.offline) return;
    // a timer, not Tone's Draw: Draw skips callbacks while the tab is in the background
    const i = this.idx;
    setTimeout(() => { if (this.playing && this.idx === i) this.onSection(i); }, Math.max(0, (time - this.ctx.now()) * 1000));
  }

  private tick(time: number) {
    if (!this.list.length) return;
    if (this.tail >= 0) {
      // the track has ended: let the last chord ring, then report
      if (++this.tail === TAIL_STEPS && !this.offline) setTimeout(() => this.onEnd(), Math.max(0, (time - this.ctx.now()) * 1000));
      return;
    }
    if (this.step >= this.list[this.idx].song.total) {
      this.step = 0;
      const prev = this.idx;
      if (this.idx + 1 < this.list.length) this.idx++;
      else if (this.loop) this.idx = 0;
      else { this.tail = 0; return; }
      if (this.idx !== prev) this.enterItem(time);
    }
    const idea = this.list[this.idx];
    const { song, chords, drums, strum, bass } = idea;
    const total = song.total;
    const g = this.step++;
    const six = 15 / this.transport.bpm.value;
    const dyn = DYNAMICS[idea.section?.energy ?? 4];
    // the final held chord of a track rings out
    const lastBar = song.bars[song.bars.length - 1];
    const ending = !!idea.section?.ending && g >= lastBar.start;

    // what plays after this item: the next section (or the same one again, on a loop)
    const after = this.list[this.idx + 1] ?? (this.loop ? this.list[0] : null);
    // how many steps until the next non-empty step in a lane, looking on into what plays next
    // (a chord pushed early or left ringing sounds on over the bar line)
    const gapUntil = (lane: (i: Idea) => ArrayLike<unknown>, empty: unknown, cap: number) => {
      let n = 1;
      while (n < cap) {
        const k = g + n;
        const v = k < total ? lane(idea)[k] : after ? lane(after)[k - total] : empty;
        if (v !== empty) break;
        n++;
      }
      return n;
    };

    // a big lift: a reversed cymbal swells up into the next section
    const stepsLeft = total - g;
    if (idea.section?.riser && after && !ending) {
      const R = Math.min(2, song.bars[song.bars.length - 1].len * six);
      if (stepsLeft * six <= R && (stepsLeft + 1) * six > R) this.drums.swell(time + stepsLeft * six, stepsLeft * six, 0.9);
    }

    const ci = this.chordInst;
    if (ci) for (const h of this.hitsAt[this.idx]?.[g] ?? []) this.playHit(ci, h, time, six, dyn, ending ? 6 : undefined, driven(this.chordId));
    if (this.g2Inst) for (const h of this.hitsAt2[this.idx][g] ?? []) this.playHit(this.g2Inst, h, time, six);
    const keys = this.keysInst && this.layerAt(idea, 'keys');
    if (keys) for (const n of keys.at[g]) {
      this.keysInst!.strum({ stroke: 'D', notes: n.notes, time, dur: n.len * six * 0.97, vel: n.vel, sixteenth: six });
    }
    const pad = this.padInst && this.layerAt(idea, 'pad');
    if (pad) for (const n of pad.at[g]) this.padInst!.play(n.notes, time, n.len * six * 0.98, n.vel);
    const strings = this.stringsInst && this.layerAt(idea, 'strings');
    if (strings) for (const n of strings.at[g]) this.stringsInst!.play(n.notes, time, n.len * six, n.vel, n.swell);
    // the tambourine's off-beat 8ths are up strokes
    const perc = this.percInst && this.layerAt(idea, 'perc');
    if (perc) for (const n of perc.at[g]) for (const note of n.notes) this.percInst!.play(note, time, n.vel, g % 4 === 2);

    const st = strum[g];
    if (st !== '.' && !idea.guitar && ci) {
      const { notes, strings } = this.voicingsFor(idea).voicings[chords.chordIdx[g]];
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      // accents on the beat, and a little extra where the kick or snare lands (the band hits together)
      const accent = (groupStarts(bar.groups).includes(g - bar.start) ? 0.12 : 0) + (drums.kick[g] || drums.snare[g] >= 0.5 ? 0.06 : 0);
      const n = gapUntil((i) => i.strum, '.', 16);
      // driven guitars sustain right into the next strum (a gap is loud through the drive) and hold
      // sparse chords longer; other sounds breathe between strums
      const legato = driven(this.chordId);
      const maxRing = legato ? 4.5 : ci.kind === 'guitar' ? 2.4 : 1.6;
      ci.strum({
        stroke: st,
        notes,
        strings,
        time,
        dur: ending ? 6 : Math.min(n * six * (legato ? 1 : 0.97) + (legato ? 0.05 : 0), maxRing),
        vel: ((st === 'U' ? 0.55 : 0.68) + accent) * dyn,
        sixteenth: six,
      });
    }

    const d = this.drums;
    if (drums.kick[g]) d.hit('kick', time, drums.kick[g]);
    if (drums.snare[g]) d.hit('snare', time, drums.snare[g]);
    const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
    const acc = cymbalAccent(bar.groups, g - bar.start);
    if (drums.hat[g]) d.hit('hat', time, Math.min(1, drums.hat[g] * acc));
    if (drums.hatOpen[g]) d.hit('hatOpen', time, drums.hatOpen[g]);
    if (drums.ride[g]) d.hit('ride', time, Math.min(1, drums.ride[g] * acc));
    if (drums.crash[g]) d.hit('crash', time, drums.crash[g]);
    if (drums.tom[g]) d.hit('tom', time, 0.8, drums.tom[g]);

    if (bass[g]) {
      // a note rings until the next one takes over (legato), unless it's written shorter (a rest after it)
      const next = gapUntil((i) => i.bass, 0, 64);
      const n = idea.bassLen?.[g] || next;
      // pluck harder on the beat
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      const onBeat = groupStarts(bar.groups).includes(g - bar.start);
      const dur = ending ? 5 : Math.min(n >= next ? next * six + 0.03 : n * six * 0.95, 4.5);
      this.bass.play(bass[g], time, dur, (onBeat ? 0.9 : 0.74) * dyn);
    }

    // the last beat swells toward a louder next section (the drummer's fill builds into it); before a
    // big lift the whole last bar does
    const rise = idea.section?.riser ? lastBar.len : lastBar.groups[lastBar.groups.length - 1];
    if (after && after !== idea && g === lastBar.start + lastBar.len - rise) {
      const now = SECTION_DB[idea.section?.energy ?? 4], then = SECTION_DB[after.section?.energy ?? 4];
      if (then > now) this.mixer.setSectionLevel((now + then) / 2, time, rise * six / 2);
    }

    const bi = song.bars.findIndex((b) => b.start === g);
    if (bi >= 0 && !this.offline) Tone.getDraw().schedule(() => this.onBar(bi), time);
  }
}

function getOrMake<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) m.set(k, (v = make()));
  return v;
}

/** `double`: double-track driven electric tones (a rhythm part). `lead`: Guitar 2's lead voicing. */
function makeInst(id: ChordInstrumentId, out: Tone.InputNode, double: boolean, pan: number, lead = false): ChordInstrument {
  if (id === 'piano') return new Piano(out, lead ? 4 : 0);
  if (id === 'acoustic') return new Guitar('acoustic', out, double, pan);
  return new Guitar('electric', out, double, pan, ampOf(id), lead);
}

const kindOf = (id: ChordInstrumentId) => (id === 'piano' ? 'piano' : id === 'acoustic' ? 'acoustic' : 'electric');
const driven = (id: ChordInstrumentId) => id === 'electric-crunch' || id === 'electric-dist';
const ampOf = (id: ChordInstrumentId) => (id === 'electric-clean' ? 'clean' : id === 'electric-crunch' ? 'crunch' : 'dist');
