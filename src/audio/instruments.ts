// Sampled instruments with synth fallbacks.

import * as Tone from 'tone';
import type { Stroke } from '../idea';
import { type DrumPiece, DRUM_LAYERS, loadDrums, loadPitched } from './samples';

const midiNote = (m: number) => Tone.Frequency(m, 'midi').toNote();
const jitter = (ms: number) => (Math.random() - 0.5) * 2 * (ms / 1000);

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

/* ---------------------------------------------------------------- chords */

export type ChordInstrumentId = 'piano' | 'acoustic' | 'electric-clean' | 'electric-crunch' | 'electric-dist';

export const CHORD_INSTRUMENTS: { id: ChordInstrumentId; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'acoustic', label: 'Acoustic guitar' },
  { id: 'electric-clean', label: 'Electric guitar · Clean' },
  { id: 'electric-crunch', label: 'Electric guitar · Crunch' },
  { id: 'electric-dist', label: 'Electric guitar · Distortion' },
];

export interface StrumArgs {
  stroke: Exclude<Stroke, '.'>;
  /** Chord notes low to high. */
  notes: number[];
  time: number;
  /** How long the chord may ring, in seconds. */
  dur: number;
  vel: number;
  /** Length of a 16th note in seconds (scales strum speed). */
  sixteenth: number;
}

export interface ChordInstrument {
  readonly kind: 'piano' | 'guitar';
  state: LoadState;
  load(): Promise<void>;
  strum(a: StrumArgs): void;
  releaseAll(): void;
}

export class Piano implements ChordInstrument {
  readonly kind = 'piano';
  state: LoadState = 'idle';
  private sampler: Tone.Sampler | null = null;
  private fallback: Tone.PolySynth;

  constructor(private out: Tone.InputNode) {
    this.fallback = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.3, release: 0.8 }, volume: -12,
    }).connect(out);
  }

  async load() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const urls = await loadPitched('piano');
      this.sampler = new Tone.Sampler({ urls, release: 1, volume: -4 }).connect(this.out);
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  strum({ stroke, notes, time, dur, vel }: StrumArgs) {
    const inst = this.sampler ?? this.fallback;
    let order = notes, d = dur, v = vel, spread = 0.014;
    if (stroke === 'U') order = [...notes].reverse();
    if (stroke === 'x') { order = notes.slice(-3); d = 0.04; v = 0.28; spread = 0.004; }
    if (stroke === 'p') { order = notes.slice(0, 2); d = Math.min(dur, 0.12); v = vel * 0.8; spread = 0.004; }
    order.forEach((m, i) => inst.triggerAttackRelease(midiNote(m), d, time + i * spread, v * (1 - i * 0.04)));
  }

  releaseAll() {
    this.sampler?.releaseAll();
    this.fallback.releaseAll();
  }
}

export type AmpTone = 'clean' | 'crunch' | 'dist';

/** Small amp + cabinet simulation for the electric guitar. */
class Amp {
  readonly input = new Tone.Gain();
  private pre = new Tone.Gain(1);
  private drive = new Tone.Distortion({ distortion: 0, oversample: '4x', wet: 0 });
  private eq = new Tone.EQ3();
  private hp = new Tone.Filter({ type: 'highpass', frequency: 90 });
  private cab = new Tone.Filter({ type: 'lowpass', frequency: 7000, rolloff: -24, Q: 0.7 });
  private post = new Tone.Gain(1);

  constructor(out: Tone.InputNode) {
    const comp = new Tone.Compressor({ threshold: -22, ratio: 3, attack: 0.005, release: 0.15 });
    this.input.chain(comp, this.pre, this.drive, this.eq, this.hp, this.cab, this.post, out);
  }

  set(tone: AmpTone) {
    const s = {
      clean: { pre: 1, dist: 0, wet: 0, low: 0, mid: 0, high: 1, hp: 90, cab: 7000, post: 1.6 },
      crunch: { pre: 2.5, dist: 0.35, wet: 1, low: -2, mid: 2, high: -2, hp: 100, cab: 4800, post: 0.78 },
      dist: { pre: 5, dist: 0.85, wet: 1, low: -1, mid: 3, high: -4, hp: 110, cab: 3800, post: 0.55 },
    }[tone];
    this.pre.gain.value = s.pre;
    this.drive.distortion = s.dist;
    this.drive.wet.value = s.wet;
    this.eq.set({ low: s.low, mid: s.mid, high: s.high });
    this.hp.frequency.value = s.hp;
    this.cab.frequency.value = s.cab;
    this.post.gain.value = s.post;
  }
}

export class Guitar implements ChordInstrument {
  readonly kind = 'guitar';
  state: LoadState = 'idle';
  private ring: Tone.Sampler | null = null;
  /** Same samples through a low-pass for palm mutes. */
  private muted: Tone.Sampler | null = null;
  private fallback: Tone.PolySynth;
  private scratch: Tone.NoiseSynth;
  private amp: Amp | null = null;
  private head: Tone.Gain;

  constructor(readonly type: 'acoustic' | 'electric', out: Tone.InputNode) {
    this.head = new Tone.Gain();
    if (type === 'electric') {
      this.amp = new Amp(out);
      this.head.connect(this.amp.input);
    } else {
      // acoustic: a little body EQ
      const body = new Tone.EQ3({ low: -1, mid: 0, high: 1.5 });
      this.head.chain(body, out);
    }
    this.fallback = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.3 }, volume: -14,
    }).connect(this.head);
    // pick/string noise for muted scratches
    const bp = new Tone.Filter({ type: 'bandpass', frequency: 2200, Q: 0.8 }).connect(this.head);
    this.scratch = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -18 }).connect(bp);
  }

  setTone(tone: AmpTone) {
    this.amp?.set(tone);
  }

  async load() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const urls = await loadPitched(this.type === 'acoustic' ? 'guitar-acoustic' : 'guitar-electric');
      this.ring = new Tone.Sampler({ urls, release: 0.12, volume: this.type === 'acoustic' ? 1 : -2 }).connect(this.head);
      const pm = new Tone.Filter({ type: 'lowpass', frequency: 900, Q: 0.5 }).connect(this.head);
      this.muted = new Tone.Sampler({ urls, release: 0.05, volume: 0 }).connect(pm);
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  strum({ stroke, notes, time, dur, vel, sixteenth }: StrumArgs) {
    const ring = this.ring ?? this.fallback;
    const muted = this.muted ?? this.fallback;
    // time between strings: faster at quicker tempos, ~25-45 ms across six strings
    const gap = Math.min(0.009, Math.max(0.005, sixteenth * 0.06));

    if (stroke === 'D') {
      notes.forEach((m, i) => ring.triggerAttackRelease(
        midiNote(m), dur, time + i * gap + jitter(1.5), vel * (0.92 + Math.random() * 0.08)));
    } else if (stroke === 'U') {
      // up-strokes catch the top 3-4 strings, a little lighter
      const top = notes.slice(-Math.min(notes.length, Math.random() < 0.5 ? 3 : 4)).reverse();
      top.forEach((m, i) => ring.triggerAttackRelease(
        midiNote(m), dur, time + i * gap * 0.8 + jitter(1.5), vel * 0.78 * (1 - i * 0.05)));
    } else if (stroke === 'x') {
      // fretting hand muting the strings: short ghost of the chord + pick noise
      notes.forEach((m, i) => muted.triggerAttackRelease(midiNote(m), 0.03, time + i * gap * 0.5, 0.18));
      this.scratch.triggerAttackRelease(0.03, time, Math.min(1, vel + 0.2));
    } else if (stroke === 'p') {
      // palm mute: low strings only, short and dark
      notes.slice(0, Math.min(3, notes.length)).forEach((m, i) => muted.triggerAttackRelease(
        midiNote(m), Math.min(dur, 0.16), time + i * gap * 0.6 + jitter(1), vel * 0.95));
    }
  }

  releaseAll() {
    this.ring?.releaseAll();
    this.muted?.releaseAll();
    this.fallback.releaseAll();
  }
}

/* ---------------------------------------------------------------- bass */

export type BassId = 'electric' | 'synth';
export const BASS_INSTRUMENTS: { id: BassId; label: string }[] = [
  { id: 'electric', label: 'Electric bass' },
  { id: 'synth', label: 'Synth bass' },
];

export class Bass {
  state: LoadState = 'idle';
  useSynth = false;
  private sampler: Tone.Sampler | null = null;
  private synth: Tone.MonoSynth;

  constructor(private out: Tone.InputNode) {
    this.synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' }, filter: { Q: 1, type: 'lowpass' },
      filterEnvelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.2, baseFrequency: 70, octaves: 2.6 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.12 }, volume: -9,
    }).connect(out);
  }

  async load() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const urls = await loadPitched('bass-electric');
      const tone = new Tone.Filter({ type: 'lowpass', frequency: 2500 }).connect(this.out);
      this.sampler = new Tone.Sampler({ urls, release: 0.08, volume: 2 }).connect(tone);
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  play(midi: number, time: number, dur: number, vel: number) {
    if (this.sampler && !this.useSynth) this.sampler.triggerAttackRelease(midiNote(midi), dur, time, vel);
    else this.synth.triggerAttackRelease(midiNote(midi), dur, time, vel);
  }

  releaseAll() {
    this.sampler?.releaseAll();
    this.synth.triggerRelease();
  }
}

/* ---------------------------------------------------------------- drums */

export type DrumKitId = 'acoustic' | 'synth';
export const DRUM_KITS: { id: DrumKitId; label: string }[] = [
  { id: 'acoustic', label: 'Acoustic kit' },
  { id: 'synth', label: 'Synth kit' },
];

export type DrumHit = 'kick' | 'snare' | 'hat' | 'hatOpen' | 'ride' | 'crash' | 'tom';

const PIECE_LEVEL: Record<DrumPiece, number> = {
  kick: 1, snare: 0.85, hat: 0.4, hatOpen: 0.35, crash: 0.42, ride: 0.38, tom1: 0.75, tom2: 0.75, tom3: 0.8,
};
const PIECE_PAN: Record<DrumPiece, number> = {
  kick: 0, snare: 0.05, hat: 0.3, hatOpen: 0.3, crash: -0.35, ride: -0.3, tom1: 0.25, tom2: -0.05, tom3: -0.3,
};

export class DrumKit {
  state: LoadState = 'idle';
  useSynth = false;
  private bufs: Record<DrumPiece, AudioBuffer[]> | null = null;
  private outs = {} as Record<DrumPiece, Tone.Panner>;
  private openHat: Tone.ToneBufferSource | null = null;
  private fb: {
    kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hat: Tone.MetalSynth; crash: Tone.MetalSynth; tom: Tone.MembraneSynth;
  };

  constructor(out: Tone.InputNode) {
    for (const p of Object.keys(DRUM_LAYERS) as DrumPiece[]) {
      this.outs[p] = new Tone.Panner(PIECE_PAN[p]).connect(out);
    }
    this.fb = {
      kick: new Tone.MembraneSynth({ volume: -2 }).connect(out),
      snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -12 }).connect(out),
      hat: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5, volume: -28 }).connect(out),
      crash: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 1.2, release: 0.5 }, harmonicity: 5.1, modulationIndex: 40, resonance: 5000, octaves: 2, volume: -30 }).connect(out),
      tom: new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, volume: -8 }).connect(out),
    };
  }

  async load() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      this.bufs = await loadDrums();
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  /** vel 0-1; for toms, `tom` is 1 (high) to 3 (floor). */
  hit(what: DrumHit, time: number, vel: number, tom = 1) {
    if (!this.bufs || this.useSynth) return this.synthHit(what, time, vel, tom);
    const piece: DrumPiece = what === 'tom' ? (`tom${tom}` as DrumPiece) : what;
    // closed hat (or a new open hat) chokes the ringing open hat
    if ((what === 'hat' || what === 'hatOpen') && this.openHat) {
      const src = this.openHat;
      try { src.stop(time); } catch { /* already stopped */ }
      this.openHat = null;
    }
    const layers = this.bufs[piece];
    const layer = layers[Math.min(layers.length - 1, Math.floor(vel * layers.length * 0.999))];
    const src = new Tone.ToneBufferSource({ url: layer, fadeOut: 0.02 }).connect(this.outs[piece]);
    src.onended = () => src.dispose();
    const gain = PIECE_LEVEL[piece] * (0.35 + 0.65 * vel) * (0.95 + Math.random() * 0.1);
    src.start(time, 0, undefined, gain);
    if (what === 'hatOpen') this.openHat = src;
  }

  private synthHit(what: DrumHit, time: number, vel: number, tom: number) {
    const fb = this.fb;
    if (what === 'kick') fb.kick.triggerAttackRelease('C1', '8n', time, vel);
    else if (what === 'snare') fb.snare.triggerAttackRelease('16n', time, vel);
    else if (what === 'hat' || what === 'ride') fb.hat.triggerAttackRelease('C6', '32n', time, vel);
    else if (what === 'hatOpen') fb.hat.triggerAttackRelease('C6', '8n', time, vel);
    else if (what === 'crash') fb.crash.triggerAttackRelease('C5', '2n', time, vel);
    else fb.tom.triggerAttackRelease(['G2', 'D2', 'A1'][tom - 1], '8n', time, vel);
  }
}
