// Plays an Idea in a loop with the chosen instruments.

import * as Tone from 'tone';
import type { Genre } from '../genres';
import type { Idea } from '../idea';
import { groupStarts } from '../rhythm';
import { pianoVoicing } from '../theory';
import { type GuitarVoicing, guitarVoicings } from '../theory/guitar';
import {
  Bass, type BassId, type ChordInstrument, type ChordInstrumentId, DrumKit, type DrumKitId, Guitar, Piano,
} from './instruments';
import { type MixPart, Mixer } from './mixer';

export type ChordChoice = ChordInstrumentId | 'auto';

const AUTO_CHORDS: Record<Genre, ChordInstrumentId> = {
  rock: 'electric-crunch',
  pop: 'acoustic',
  funk: 'electric-clean',
};

export const INSTRUMENT_NAMES: Record<string, string> = {
  piano: 'piano', acoustic: 'acoustic guitar', electric: 'electric guitar', bass: 'bass', drums: 'drums',
};

export class Engine {
  readonly mixer = new Mixer();
  private piano = new Piano(this.mixer.input('chords'));
  private acoustic = new Guitar('acoustic', this.mixer.input('chords'));
  private electric = new Guitar('electric', this.mixer.input('chords'));
  readonly bass = new Bass(this.mixer.input('bass'));
  readonly drums = new DrumKit(this.mixer.input('drums'));

  private idea: Idea | null = null;
  private chordChoice: ChordChoice = 'auto';
  private chordInst: ChordInstrument = this.piano;
  /** Notes per timeline entry for the current chord instrument. */
  private voicings: number[][] = [];
  /** Guitar shapes per timeline entry (null when piano). */
  guitarShapes: GuitarVoicing[] | null = null;

  private step = 0;
  playing = false;
  onBar: (bar: number) => void = () => {};
  onStatus: (msg: string) => void = () => {};

  constructor() {
    Tone.getTransport().scheduleRepeat((t) => this.tick(t), '16n');
  }

  /** Resolve 'auto' to a concrete instrument for the current idea. */
  get chordInstrumentId(): ChordInstrumentId {
    if (this.chordChoice !== 'auto') return this.chordChoice;
    return AUTO_CHORDS[this.idea?.song.partGenres.strum ?? 'pop'];
  }

  setIdea(idea: Idea) {
    this.idea = idea;
    const tr = Tone.getTransport();
    tr.bpm.value = idea.song.bpm;
    tr.swing = idea.song.swing;
    tr.swingSubdivision = '16n';
    this.step = 0;
    this.applyChordInstrument();
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

  private applyChordInstrument() {
    const id = this.chordInstrumentId;
    const prev = this.chordInst;
    if (id === 'piano') this.chordInst = this.piano;
    else if (id === 'acoustic') this.chordInst = this.acoustic;
    else {
      this.chordInst = this.electric;
      this.electric.setTone(id === 'electric-clean' ? 'clean' : id === 'electric-crunch' ? 'crunch' : 'dist');
    }
    if (prev !== this.chordInst) prev.releaseAll();
    this.computeVoicings();
    void this.ensureLoaded(this.chordInst, id === 'piano' ? 'piano' : id === 'acoustic' ? 'acoustic' : 'electric');
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

  private computeVoicings() {
    if (!this.idea) return;
    const { key } = this.idea.song;
    const chords = this.idea.chords.timeline.map((e) => e.chord);
    const id = this.chordInstrumentId;
    if (id === 'piano') {
      this.guitarShapes = null;
      this.voicings = chords.map((c) => pianoVoicing(key, c));
    } else {
      this.guitarShapes = guitarVoicings(key, chords, { preferOpen: id === 'acoustic', powerChords: id === 'electric-dist' });
      this.voicings = this.guitarShapes.map((v) => v.notes);
    }
  }

  async start() {
    await Tone.start();
    if (this.playing) return;
    this.step = 0;
    Tone.getTransport().start('+0.1');
    this.playing = true;
  }

  stop() {
    Tone.getTransport().stop();
    this.playing = false;
    this.chordInst.releaseAll();
    this.bass.releaseAll();
    this.onBar(-1);
  }

  private tick(time: number) {
    const idea = this.idea;
    if (!idea) return;
    const { song, chords, drums, strum, bass } = idea;
    const total = song.total;
    const g = this.step % total;
    this.step++;
    const six = Tone.Time('16n').toSeconds();

    // how many steps until the next non-empty step in a lane
    const gapUntil = (lane: ArrayLike<unknown>, empty: unknown, cap: number) => {
      let n = 1;
      while (n < cap && lane[(g + n) % total] === empty) n++;
      return n;
    };

    const st = strum[g];
    if (st !== '.') {
      const notes = this.voicings[chords.chordIdx[g]];
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      const accent = groupStarts(bar.groups).includes(g - bar.start) ? 0.12 : 0;
      const n = gapUntil(strum, '.', 16);
      const maxRing = this.chordInst.kind === 'guitar' ? 2.4 : 1.6;
      this.chordInst.strum({
        stroke: st,
        notes,
        time,
        dur: Math.min(n * six * 0.97, maxRing),
        vel: (st === 'U' ? 0.55 : 0.68) + accent,
        sixteenth: six,
      });
    }

    const d = this.drums;
    if (drums.kick[g]) d.hit('kick', time, drums.kick[g]);
    if (drums.snare[g]) d.hit('snare', time, drums.snare[g]);
    if (drums.hat[g]) d.hit('hat', time, drums.hat[g]);
    if (drums.hatOpen[g]) d.hit('hatOpen', time, drums.hatOpen[g]);
    if (drums.ride[g]) d.hit('ride', time, drums.ride[g]);
    if (drums.crash[g]) d.hit('crash', time, drums.crash[g]);
    if (drums.tom[g]) d.hit('tom', time, 0.8, drums.tom[g]);

    if (bass[g]) {
      const n = gapUntil(bass, 0, 16);
      this.bass.play(bass[g], time, Math.min(n * six * 0.92, 1.2), 0.85);
    }

    const bi = song.bars.findIndex((b) => b.start === g);
    if (bi >= 0) Tone.getDraw().schedule(() => this.onBar(bi), time);
  }
}
