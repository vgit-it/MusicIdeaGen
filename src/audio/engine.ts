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
import { GuitarPrep, type PrepItem, type Prepared } from './prep';
import { REAL_PARTS, realAmpsSupported } from './realamp';

export interface EngineSettings {
  chord: ChordChoice;
  guitar2: ChordChoice;
  bass: BassId;
  drumSynth: boolean;
  mix: MixState;
  layers: LayerSettings;
  /** Real amps (Neural Amp Modeler) for driven electric guitars: prepared ahead live, and in exports. */
  realAmps?: boolean;
}

/** The layers you've added (left out = removed) and their style or tone. */
export interface LayerSettings {
  keys?: KeysChoice; pad?: PadChoice; strings?: StringsChoice; perc?: PercChoice;
  /** Layers that play every bar of every section (the rest come and go with the arrangement). */
  throughout?: LayerPart[];
}

export type ChordChoice = ChordInstrumentId | 'auto';

/** Bass sound per genre (Auto): a distorted preamp blended in for the heavier styles. */
const BASS_TONES: Record<Genre, BassTone> = {
  rock: 'clean',
  pop: 'clean',
  funk: 'clean',
  hardrock: 'driven',
  metal: 'driven',
  grunge: 'driven',
  altmetal: 'driven',
};


/** Silent steps after a track ends, so the last chord can ring out. */
const TAIL_STEPS = 32;
/** Crossfade into a prepared section (ending on its downbeat). */
const PREP_XFADE = 0.03;
/**
 * How far ahead notes are scheduled (s): the usual, and if guitars are being prepared during playback
 * (building each render holds up the page for a moment, which made live notes late).
 */
const LOOKAHEAD = 0.1;
const LOOKAHEAD_PREP = 0.6;

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
  private bassChoice: BassId = 'auto';
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

  /** Offline: play only the guitars (preparing them with real amps), and the bass if `prepBass`. */
  guitarsOnly = false;
  prepBass = false;
  /** Real amps: driven guitars play from prepared buffers (see prepareRealAmps) where they're ready. */
  private realAmps = false;
  private prep: GuitarPrep | null = null;
  /** Prepared guitars playing now, and which parts they cover (those parts don't play live). */
  private realSrcs: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  private realNow = { chords: false, guitar2: false, bass: false };
  private ids = new WeakMap<Idea, number>();
  private nextId = 1;

  /** `offline`: built inside Tone.Offline to render audio files. */
  constructor(private readonly offline = false) {
    this.transport.scheduleRepeat((t) => this.tick(t), '16n');
  }

  /** Instrument choices and the mix, to copy into an offline render. */
  settings(): EngineSettings {
    return {
      chord: this.chordChoice, guitar2: this.g2Choice, bass: this.bassChoice, drumSynth: this.drums.useSynth,
      mix: this.mixer.state(), layers: this.layerSettings, realAmps: this.realAmps,
    };
  }

  /** Copy settings (`openAll`: ignore mutes and solos, for stems). */
  applySettings(s: EngineSettings, openAll = false) {
    this.chordChoice = s.chord;
    this.g2Choice = s.guitar2;
    this.realAmps = !!s.realAmps;
    this.setBass(s.bass);
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
      if (choice === null) { delete this.layers.keys; this.keysInst?.releaseAll(); this.onRealChange(); return; }
      this.layers.keys = choice as KeysChoice;
      this.onRealChange();
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
    const changed = Math.abs(this.transport.bpm.value - bpm) > 1e-6;
    this.transport.bpm.value = bpm;
    this.mixer.setTempo(bpm);
    // prepared guitars are at the old tempo: back to live until they're ready again
    if (changed && this.playing && this.realSrcs.length) this.endPrepared(this.ctx.now() + 0.05);
    if (changed) this.onRealChange();
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
    this.applyBassTone();
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
    // new music: what's prepared for the item playing now may no longer match it
    if (this.playing && this.realSrcs.length && this.keyNow !== this.prepPlaying) this.endPrepared(this.ctx.now() + 0.05);
    this.onRealChange();
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
    this.realChanged();
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
    this.realChanged();
  }

  /* ---- real amps: electric guitars prepared ahead */

  get realAmpsOn(): boolean {
    return this.realAmps;
  }

  /** What can change whether real amps are ready (a new idea, another sound, the tempo): the UI checks again. */
  onRealChange: () => void = () => {};

  /** Back to the app's own amp (prepared guitars are kept, for turning them back on). */
  setRealAmps(on: boolean) {
    this.realAmps = on && realAmpsSupported();
    if (!this.realAmps && this.realSrcs.length) this.endPrepared(this.ctx.now() + 0.05);
    if (!this.realAmps) this.prep?.cancel();
    this.onRealChange();
  }

  /** The sound changed under what's playing: back to live until it's prepared again. */
  private realChanged() {
    if (this.playing && this.realSrcs.length && this.keyNow !== this.prepPlaying) this.endPrepared(this.ctx.now() + 0.05);
    this.onRealChange();
  }

  /**
   * Real amps for a list (a track, or one idea): 'none' (no crunch or distortion in it), 'ready'
   * (every section with them is prepared), 'failed' (they can't run here) or 'todo'.
   */
  realStateFor(list: Idea[]): 'none' | 'ready' | 'failed' | 'todo' {
    if (!realAmpsSupported()) return 'failed';
    const items = this.prepItems(list, false, 0);
    if (!items.length) return 'none';
    const got = items.map((i) => this.prep?.get(i.key));
    if (got.every((p) => p)) return 'ready';
    return got.some((p) => p === null) ? 'failed' : 'todo';
  }

  /**
   * Prepare real amps for a list (a track, or one idea), then play with them: every section with
   * crunch or distortion, up front (nothing is prepared while music plays).
   */
  async prepareRealAmps(list: Idea[], onProgress: (p: number) => void = () => {}) {
    if (!realAmpsSupported()) return 'failed' as const;
    this.realAmps = true;
    await this.prepareFor(list, onProgress);
    this.onRealChange();
    return this.realStateFor(list);
  }

  private idOf(idea: Idea) {
    let id = this.ids.get(idea);
    if (id === undefined) this.ids.set(idea, (id = this.nextId++));
    return id;
  }

  /** The items around item i of a list as it plays: the one before (lead-in) and after. */
  private around(list: Idea[], loop: boolean, i: number) {
    const n = list.length;
    const prev = i > 0 ? list[i - 1] : loop ? list[n - 1] : null;
    const next = i + 1 < n ? list[i + 1] : loop ? list[0] : null;
    return { prev, next };
  }

  /** Which parts of an item need real amps. */
  private realParts(idea: Idea) {
    return {
      chords: electric(this.chordIdFor(idea)),
      guitar2: electric(this.guitar2IdFor(idea)) && idea.guitar2.length > 0,
      bass: this.bassChoice !== 'synth' && this.bassToneFor(idea) === 'driven' && idea.bass.some((n) => n),
    };
  }

  /** What a prepared item's sound depends on: the item itself, its sounds and tempo. */
  private prepCore(idea: Idea): string {
    return [this.idOf(idea), this.chordIdFor(idea), this.guitar2IdFor(idea), this.realParts(idea).bass, idea.song.bpm, idea.song.swing].join('|');
  }

  /** Everything a prepared item depends on: its core, then the items around it (lead-in and ring-over). */
  private prepKey(list: Idea[], loop: boolean, i: number): string {
    const idea = list[i];
    if (!idea) return '';
    const { prev, next } = this.around(list, loop, i);
    const id = (x: Idea | null) => (x ? this.idOf(x) : 0);
    return `${this.prepCore(idea)}#${id(prev)}|${id(next)}`;
  }

  /** Key of the prepared item playing now. */
  private prepPlaying = '';
  private get keyNow() {
    return this.prepKey(this.list, this.loop, this.idx);
  }

  /** What to prepare for a list, from item `from` onward (wrapping round). */
  private prepItems(list: Idea[], loop: boolean, from: number): (PrepItem & { index: number })[] {
    const n = list.length, items: (PrepItem & { index: number })[] = [];
    for (let k = 0; k < n; k++) {
      const i = (from + k) % n;
      const parts = this.realParts(list[i]);
      if (!parts.chords && !parts.guitar2 && !parts.bass) continue;
      const { prev, next } = this.around(list, loop, i);
      const sub = [prev, list[i], next].filter((x): x is Idea => !!x);
      // a channel per amp its render builds: two per rhythm sound (double-tracked), one per Guitar 2
      // sound, a driven guitar's clean channel, and the bass preamp
      const rhythm = [...new Set(sub.map((x) => this.chordIdFor(x)).filter(electric))];
      const lead = [...new Set(sub.map((x) => this.guitar2IdFor(x)).filter(electric))];
      const amps = rhythm.reduce((a, id) => a + 2 + (driven(id) ? 1 : 0), 0) + lead.reduce((a, id) => a + 1 + (driven(id) ? 1 : 0), 0);
      items.push({
        key: this.prepKey(list, loop, i), list: sub, at: prev ? 1 : 0, ...parts, last: !next,
        amps: amps + 2, index: i,
      });
    }
    return items;
  }

  private makePrep() {
    const prep = new GuitarPrep(() => this.settings());
    prep.onBusy = () => this.applyLookAhead();
    return prep;
  }

  private applyLookAhead() {
    if (!this.offline) this.ctx.lookAhead = this.playing && this.prep?.busy ? LOOKAHEAD_PREP : LOOKAHEAD;
  }

  /**
   * For an export: prepare a list's driven guitars (played once, start to end) and hand back each
   * item's, by index (null: real amps are off, or that item plays on the app's own amp).
   */
  async prepareFor(list: Idea[], onProgress: (p: number) => void = () => {}): Promise<((i: number) => Prepared | null) | null> {
    if (!this.realAmps || !list.length) return null;
    this.prep ??= this.makePrep();
    const items = this.prepItems(list, false, 0);
    this.prep.plan(items);
    await this.prep.all(items.map((i) => i.key), onProgress);
    const byIndex = new Map(items.map((i) => [i.index, i.key]));
    const prep = this.prep;
    return (i) => { const k = byIndex.get(i); return (k && prep.get(k)) || null; };
  }

  /** Offline (an export): the prepared guitars for each item of the list. */
  preparedAt: ((i: number) => Prepared | null) | null = null;

  /** At an item's first step: play its prepared guitars if they're ready (the parts they cover don't play live). */
  private enterPrepared(time: number) {
    this.endPrepared(time);
    let p: Prepared | null | undefined;
    if (this.offline) p = this.preparedAt?.(this.idx);
    else {
      if (!this.realAmps || !this.prep) return;
      const parts = this.realParts(this.list[this.idx]);
      if (!parts.chords && !parts.guitar2 && !parts.bass) return;
      // prepared for this spot, or for the same item elsewhere (a section looped on its own was
      // prepared with the track's sections around it: only its first moment's ring-over differs)
      p = this.prep.get(this.keyNow) ?? this.prep.find(`${this.prepCore(this.list[this.idx])}#`);
    }
    if (!p) return;
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    const at = Math.max(time - PREP_XFADE, this.ctx.now());
    for (const part of REAL_PARTS) {
      const buf = p[part];
      if (!buf) continue;
      // what the live part is still ringing is in the prepared lead-in too
      if (part === 'bass') this.bass.releaseAll(time);
      else for (const inst of (part === 'chords' ? this.rhythmInsts : this.g2Insts).values()) inst.releaseAll(time);
      const src = raw.createBufferSource();
      src.buffer = buf;
      const gain = raw.createGain();
      // (an offline render's clock can already be a moment past `time`: the fade still ends after it starts)
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(1, Math.max(time, at + 0.005));
      src.connect(gain);
      Tone.connect(gain, this.mixer.input(part));
      src.start(at, Math.max(0, p.offset - (time - at)));
      src.onended = () => { try { gain.disconnect(); } catch { /* already */ } };
      this.realSrcs.push({ src, gain });
      this.realNow[part] = true;
    }
    if (!this.offline) this.prepPlaying = this.keyNow;
  }

  /** Fade out the prepared guitars, ending at `time` (from then on everything plays live). */
  private endPrepared(time: number) {
    for (const { src, gain } of this.realSrcs) {
      const g = gain.gain;
      const from = Math.max(time - PREP_XFADE, this.ctx.now());
      g.cancelScheduledValues(from);
      g.setValueAtTime(g.value, from);
      g.linearRampToValueAtTime(0, Math.max(time, from + 0.005));
      try { src.stop(Math.max(time, from + 0.005) + 0.01); } catch { /* already */ }
    }
    this.realSrcs = [];
    this.realNow = { chords: false, guitar2: false, bass: false };
    this.prepPlaying = '';
  }

  /** Bass sound: Auto (by the bass part's genre), Clean, Driven or the synth. */
  setBass(id: BassId) {
    this.bassChoice = id;
    this.bass.useSynth = id === 'synth';
    this.applyBassTone();
    this.realChanged();
  }

  private applyBassTone() {
    this.bass.setTone(this.bassToneFor(this.list[0]));
  }

  /** The bass sound an item plays with (Auto: by the bass part's genre). */
  private bassToneFor(idea: Idea | undefined): BassTone {
    const c = this.bassChoice;
    return c === 'clean' || c === 'driven' ? c : BASS_TONES[idea?.song.partGenres.bass ?? 'rock'];
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
    // driven guitars sit in more room: a wall of sound rather than a dry, close-miked part (the shared
    // reverb, not a reverb of their own: a second long reverb made phones crackle and drop out)
    this.mixer.setReverbExtra('chords', driven(id) ? 7 : 0);
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
    const at = this.ctx.now() + 0.1;
    this.mixer.open(at - 0.005);
    this.transport.start(at);
    this.playing = true;
    this.applyLookAhead();
    this.onSection(this.idx);
  }

  stop() {
    // at once: notes are scheduled ahead (more so while guitars are being prepared)
    if (!this.offline) this.mixer.silence();
    this.transport.stop();
    this.playing = false;
    this.endPrepared(this.ctx.now() + 0.03);
    this.applyLookAhead();
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
      // driven guitars sustain into the next hit (a gap is loud through the drive); others breathe.
      // The player's hands: a note rings right into a legato note after it, or stops as the finger lifts
      dur: ring ?? (h.touch?.tied ? h.len * six + 0.03
        : (legato ? Math.min(h.len * six + 0.05, 5) : Math.min(h.len * six * 0.97, 4)) - (h.touch?.lift ?? 0) / 1000),
      vel: h.vel * dyn,
      sixteenth: six,
      clean: h.clean,
      letRing: h.letRing,
      slide: h.slide,
      swell: h.swell,
      touch: h.touch,
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
    const { song, chords, drums, strum } = idea;
    const total = song.total;
    const g = this.step++;
    if (g === 0) this.enterPrepared(time);
    const six = 15 / this.transport.bpm.value;
    // the band's lilt: the in-between 16ths come a touch late, for everyone
    if (g % 2 && idea.lilt) time += idea.lilt * six;
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
    // (guitar-only renders, for real amps, skip everything else)
    const others = !this.guitarsOnly;
    if (others && idea.section?.riser && after && !ending) {
      const R = Math.min(2, song.bars[song.bars.length - 1].len * six);
      if (stepsLeft * six <= R && (stepsLeft + 1) * six > R) this.drums.swell(time + stepsLeft * six, stepsLeft * six, 0.9);
    }

    // (parts playing from prepared buffers don't play live)
    const ci = this.realNow.chords ? null : this.chordInst;
    // steps until a part's next hit, looking on into what plays next
    const nextIdx = this.idx + 1 < this.list.length ? this.idx + 1 : this.loop ? 0 : -1;
    const toNext = (lanes: (GuitarHit[][] | null)[]) => {
      for (let n = 1; n < 16; n++) {
        const k = g + n;
        if ((k < total ? lanes[this.idx]?.[k] : nextIdx >= 0 ? lanes[nextIdx]?.[k - total] : undefined)?.length) return n;
      }
      return 16;
    };
    if (ci) {
      const hits = this.hitsAt[this.idx]?.[g] ?? [];
      const next = hits.length ? toNext(this.hitsAt) : 0;
      for (const h of hits) this.playHit(ci, held(h, next), time, six, dyn, ending ? 6 : undefined, driven(this.chordId));
    }
    if (this.g2Inst && !this.realNow.guitar2) {
      const hits = this.hitsAt2[this.idx][g] ?? [];
      const next = hits.length ? toNext(this.hitsAt2) : 0;
      for (const h of hits) this.playHit(this.g2Inst, held(h, next), time + (idea.g2Feel ?? 0) / 1000, six);
    }
    const keys = others && this.keysInst && this.layerAt(idea, 'keys');
    if (keys) for (const n of keys.at[g]) {
      this.keysInst!.strum({ stroke: 'D', notes: n.notes, time, dur: n.len * six * 0.97, vel: n.vel, sixteenth: six });
    }
    const pad = others && this.padInst && this.layerAt(idea, 'pad');
    if (pad) for (const n of pad.at[g]) this.padInst!.play(n.notes, time, n.len * six * 0.98, n.vel);
    const strings = others && this.stringsInst && this.layerAt(idea, 'strings');
    if (strings) for (const n of strings.at[g]) this.stringsInst!.play(n.notes, time, n.len * six, n.vel, n.swell);
    // the tambourine's off-beat 8ths are up strokes
    const perc = others && this.percInst && this.layerAt(idea, 'perc');
    if (perc) for (const n of perc.at[g]) for (const note of n.notes) this.percInst!.play(note, time, n.vel, g % 4 === 2);

    let st = strum[g];
    // after a muted scratch the strumming hand keeps moving: muted scrapes on the 8ths until the next
    // chord (a scratch and then dead air sounded like a sequencer)
    let ghost = false;
    if (st === '.' && g % 2 === 0) {
      let k = g - 1;
      while (k >= 0 && g - k <= 6 && strum[k] === '.') k--;
      if (k >= 0 && strum[k] === 'x' && (g - k) % 2 === 0) { st = 'x'; ghost = true; }
    }
    if (st !== '.' && !idea.guitar && ci) {
      const voicings = this.voicingsFor(idea).voicings;
      let { notes, strings } = voicings[chords.chordIdx[g]];
      // the player's hands at chord changes (guitars)
      const hands = idea.changeTouch;
      let open = false;
      if (hands && ci.kind === 'guitar' && st !== 'x' && !ghost) {
        const ci0 = chords.chordIdx[g];
        // a squeak as the fingers move over the wound strings to the new shape (louder when the hand
        // shifts along the neck)
        if (hands[g]?.squeak && ci0 > 0 && chords.timeline[ci0].step === g) {
          const from = position(voicings[ci0 - 1]), to = position(voicings[ci0]);
          if (from !== null && to !== null) ci.squeak?.(time - 0.05 - Math.random() * 0.03, (Math.abs(to - from) >= 2 ? 0.8 : 0.5) * dyn, to >= from);
        }
        // the last strum before a change: the hand has let go, the open strings ring
        const c = chords.timeline[ci0 + 1]?.step;
        if (c !== undefined && c - g <= 2 && hands[c]?.open && this.chordId !== 'electric-dist' && strum.slice(g + 1, c).every((x) => x === '.')) {
          notes = OPEN_STRINGS.slice(2);
          strings = [2, 3, 4, 5];
          open = true;
        }
      }
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
        time: Math.max(0, time + (idea.strumFeel ?? 0) / 1000),
        dur: ending ? 6 : Math.min(n * six * (legato ? 1 : 0.97) + (legato ? 0.05 : 0), maxRing),
        vel: ((st === 'U' ? 0.55 : 0.68) + accent) * dyn * (idea.strumGain ?? 1) * (ghost ? 0.6 : 1) * (open ? 0.8 : 1),
        sixteenth: six,
      });
    }

    if (others || this.prepBass) this.playRhythmSection(idea, g, time, six, dyn, ending, gapUntil, others);

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

  /** Drums and bass for one step. */
  private playRhythmSection(idea: Idea, g: number, time: number, six: number, dyn: number, ending: boolean,
    gapUntil: (lane: (i: Idea) => ArrayLike<unknown>, empty: unknown, cap: number) => number, others: boolean) {
    const { song, drums, bass } = idea;
    // (a render preparing the bass's real amp plays only the bass)
    if (others) {
      const d = this.drums;
      // the drummer's feel: snare and cymbals sit a little ahead of or behind the kick
      const sn = Math.max(0, time + (drums.feel?.snare ?? 0) / 1000), cy = Math.max(0, time + (drums.feel?.cym ?? 0) / 1000);
      if (drums.kick[g]) d.hit('kick', time, drums.kick[g]);
      if (drums.snare[g]) d.hit('snare', sn, drums.snare[g]);
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      const acc = cymbalAccent(bar.groups, g - bar.start);
      if (drums.hat[g]) d.hit('hat', cy, Math.min(1, drums.hat[g] * acc));
      if (drums.hatOpen[g]) d.hit('hatOpen', cy, drums.hatOpen[g]);
      if (drums.ride[g]) d.hit('ride', cy, Math.min(1, drums.ride[g] * acc));
      if (drums.crash[g]) d.hit('crash', time, drums.crash[g]);
      if (drums.tom[g]) d.hit('tom', time, 0.8, drums.tom[g]);
    }

    // (the bass playing from a prepared buffer doesn't play live)
    if (bass[g] && !this.realNow.bass) {
      // a note rings until the next one takes over (legato), unless it's written shorter (a rest after
      // it); a bassist holds it through a short rest (an 8th or less), as on records
      const next = gapUntil((i) => i.bass, 0, 64);
      const written = idea.bassLen?.[g] || next;
      const n = next - written <= 2 ? next : written;
      // pluck harder on the beat
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      const onBeat = groupStarts(bar.groups).includes(g - bar.start);
      const touch = idea.bassTouch?.[g];
      const dur = ending ? 5 : Math.min(n >= next ? next * six + 0.03 : n * six * 0.95, 4.5) - (touch?.lift ?? 0) / 1000;
      this.bass.play(bass[g], time + (idea.bassFeel ?? 0) / 1000, dur, (onBeat ? 0.9 : 0.74) * dyn, touch);
    }
  }
}

/**
 * How a player plays a written note: held through a short rest (an 8th or less) into their next
 * note, as on records (a riff written with a 16th of air between notes came out choppy, like a
 * sequencer). Longer rests stay rests; palm mutes and dead notes stay short.
 */
function held(h: GuitarHit, next: number): GuitarHit {
  return !h.mute && next > h.len && next - h.len <= 2 ? { ...h, len: next } : h;
}

/** Open strings of a standard-tuned guitar (strummed parts are in standard tuning). */
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

/** Where a chord shape sits on the neck: its lowest fretted fret (0: all open; null: not a guitar shape). */
function position(v: { notes: number[]; strings?: number[] }): number | null {
  if (!v.strings) return null;
  const frets = v.notes.map((n, i) => n - OPEN_STRINGS[v.strings![i]]).filter((f) => f > 0);
  return frets.length ? Math.min(...frets) : 0;
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
/** Electric guitars play through amps (real amps when prepared); acoustic and piano don't. */
const electric = (id: ChordInstrumentId) => id.startsWith('electric');
const ampOf = (id: ChordInstrumentId) => (id === 'electric-clean' ? 'clean' : id === 'electric-crunch' ? 'crunch' : 'dist');
