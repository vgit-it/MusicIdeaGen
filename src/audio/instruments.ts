// Sampled instruments with synth fallbacks.

import * as Tone from 'tone';
import type { Stroke } from '../idea';
import type { SoundId } from '../sounds';
import { MultiSampler, type Voice } from './multisampler';
import { type DrumPiece, DRUM_PIECES, RoundRobin, loadCab, loadDrums, loadPitched } from './samples';
import { inContext } from './context';
import { SampleVoice } from './voice';

const midiNote = (m: number) => Tone.Frequency(m, 'midi').toNote();
const jitter = (ms: number) => (Math.random() - 0.5) * 2 * (ms / 1000);

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

/* ---------------------------------------------------------------- chords */

export type ChordInstrumentId = SoundId;

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
  /** Guitar string (0 = low E) for each note, when the voicing is a guitar shape. */
  strings?: number[];
  time: number;
  /** How long the chord may ring, in seconds. */
  dur: number;
  vel: number;
  /** Length of a 16th note in seconds (scales strum speed). */
  sixteenth: number;
  /** Quiet section: clean channel even when the amp is driven. */
  clean?: boolean;
  /** Let other strings ring (arpeggios). */
  letRing?: boolean;
  /** Slide into the note from this many semitones away. */
  slide?: number;
  /** Fade the note in (volume swell). */
  swell?: boolean;
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
  private sampler: MultiSampler | null = null;
  /** Stand-in synth, made only if it's needed (an idle synth keeps the audio graph busy). */
  private _fallback?: Tone.PolySynth;
  private get fallback() {
    return (this._fallback ??= inContext(this.ctx, () => new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.3, release: 0.8 }, volume: -12,
    }).connect(this.out)));
  }
  /** The audio context it was made in (nodes made later go there too, not into whichever is current). */
  private ctx = Tone.getContext();
  /** Last voice per key, so re-striking a key replaces it. */
  private keys = new Map<number, Voice>();

  /** `trim`: extra level in dB (a piano carrying Guitar 2's melody needs to be heard over the band). */
  constructor(private out: Tone.InputNode, private trim = 0) {}

  private loading?: Promise<void>;
  /** Load the samples (calling again returns the same promise, so callers can wait for it). */
  load(): Promise<void> {
    return (this.loading ??= this.loadNow());
  }

  private async loadNow() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const set = await loadPitched('piano');
      this.sampler = inContext(this.ctx, () => new MultiSampler(set, new Tone.Volume(-6 + this.trim).connect(this.out), 0.35, this.ctx));
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  strum({ stroke, notes, time, dur, vel }: StrumArgs) {
    let order = notes, d = dur, v = vel, spread = 0.012;
    if (stroke === 'U') order = [...notes].reverse();
    if (stroke === 'x') { order = notes.slice(-3); d = 0.06; v = 0.3; spread = 0.004; }
    if (stroke === 'p') { order = notes.slice(0, 2); d = Math.min(dur, 0.14); v = vel * 0.8; spread = 0.004; }
    order.forEach((m, i) => {
      const t = time + i * spread + jitter(2);
      const nv = v * (1 - i * 0.04) * (0.94 + Math.random() * 0.06);
      if (!this.sampler) return this.fallback.triggerAttackRelease(midiNote(m), d, t, nv);
      this.sampler.choke(this.keys.get(m), t, 0.03);
      this.keys.set(m, this.sampler.play(m, t, d, nv));
    });
  }

  releaseAll() {
    this.sampler?.stopAll();
    this._fallback?.releaseAll();
  }
}

export type AmpTone = 'clean' | 'crunch' | 'dist';

interface AmpSettings {
  /** Sustainer before the drive: compressor threshold (dB), ratio and make-up gain (dB). */
  comp: [number, number, number];
  /** High-pass before the drive: keeps distortion tight instead of muddy. */
  tight: number;
  /** Mid push before the drive [Hz, dB] (the classic overdrive-pedal trick). */
  push: [number, number];
  /** Gain of the two clipping stages (1 = barely breaking up). */
  drive1: number;
  drive2: number;
  /** Tone stack, dB. */
  bass: number;
  middle: number;
  treble: number;
  /** Presence after the cabinet, dB. */
  presence: number;
  /** Corrective EQ after the cabinet: low shelf and high shelf [Hz, dB]. */
  lowShelf: [number, number];
  highShelf: [number, number];
  /** Output trim. */
  level: number;
  /** Final high-pass and low-pass (Hz): leaves the lows to bass and kick, and keeps fizz out. */
  lowCut: number;
  top: number;
  /** Cut where driven guitars get harsh in a mix [Hz, dB]. */
  bite: [number, number];
}

export const AMP: Record<AmpTone, AmpSettings> = {
  clean: { comp: [-24, 3, 4], tight: 70, push: [800, 0], drive1: 1.3, drive2: 1, bass: 0, middle: 0, treble: 1.5, presence: 1, lowShelf: [450, -11], highShelf: [3000, 4], level: 28, lowCut: 75, top: 7500, bite: [3000, 0] },
  crunch: { comp: [-32, 4, 10], tight: 150, push: [750, 3], drive1: 4, drive2: 2.5, bass: 1, middle: 2, treble: 0, presence: 0, lowShelf: [400, -3], highShelf: [3000, 1], level: 2.9, lowCut: 110, top: 5500, bite: [2800, -3] },
  dist: { comp: [-40, 8, 22], tight: 180, push: [720, 6], drive1: 8.5, drive2: 5, bass: 3, middle: -1.5, treble: 0, presence: 0.5, lowShelf: [450, -3], highShelf: [3000, -1.5], level: 1.96, lowCut: 110, top: 5000, bite: [2700, -5] },
};

/**
 * A lead guitar's voicing of the driven settings: a little mid push and sustain, a smoother top,
 * less gain than the rhythm sound (single notes through rhythm-level gain turn into a square-wave
 * buzz), and the note's body kept. An earlier voicing cut everything under 400 Hz before the drive
 * and pushed 850 Hz by 8 dB: lead notes lost their fundamental (11 dB under the 2nd harmonic on an
 * E4) and came out thin, nasal and buzzy. Now the fundamental leads and the harmonics taper off.
 */
export const LEAD: Partial<Record<AmpTone, AmpSettings>> = {
  crunch: { ...AMP.crunch, presence: 1.5, drive1: 6, drive2: 3.5, comp: [-32, 4, 12], tight: 150, push: [850, 3], lowShelf: [300, -2], highShelf: [3000, 3], level: 2.05, lowCut: 100, top: 6500, bite: [3000, -2] },
  dist: { ...AMP.dist, presence: 2, comp: [-32, 4, 14], tight: 150, push: [800, 3], drive1: 9, drive2: 6, lowShelf: [300, -2], highShelf: [3000, -1], level: 1.98, lowCut: 100, top: 6000, bite: [3000, -3] },
};

/**
 * The guitar chain uses plain biquad filters, not Tone.Filter: Tone.Filter drives its settings from
 * always-running signal sources, which kept every amp (two 4x-oversampled drive stages) processing
 * silence even when its guitar wasn't playing.
 */
const steep = (type: BiquadFilterType, frequency: number, Q: number, stages: number) =>
  Array.from({ length: stages }, () => new Tone.BiquadFilter({ type, frequency, Q }));

/**
 * Points in a drive curve. Odd, so silence (x = 0) falls exactly on a point where the curve is 0.
 * With an even count, silence fell between two points of the lopsided curve and came out as a tiny
 * constant offset, which kept every amp (and everything after it) processing even when silent.
 */
const CURVE_LEN = 4097;

/** Soft clipping, normalized so full input gives full output; `asym` makes it tube-like. */
const clipCurve = (drive: number, asym = 0) => (x: number) =>
  (Math.tanh(drive * (x + asym)) - Math.tanh(drive * asym)) / Math.tanh(drive);

/**
 * Amp + speaker cabinet for a direct-recorded electric guitar:
 * tight → mid push → clip stage 1 → interstage filter → clip stage 2 → tone stack → cabinet IR → presence.
 * Until the cabinet impulse response loads (or if it fails) a filter-based cabinet stands in.
 */
class Amp {
  readonly input = new Tone.Gain();
  // sustainer: evens out the note's decay before it hits the drive, like a compressor pedal
  private comp = new Tone.Compressor({ threshold: -24, ratio: 3, attack: 0.004, release: 0.3, knee: 6 });
  private makeup = new Tone.Gain(1);
  private tight = new Tone.BiquadFilter({ type: 'highpass', frequency: 70 });
  private push = new Tone.BiquadFilter({ type: 'peaking', frequency: 750, Q: 0.9, gain: 0 });
  private stage1 = new Tone.WaveShaper(clipCurve(1.3), CURVE_LEN);
  private stage2 = new Tone.WaveShaper(clipCurve(1, 0.05), CURVE_LEN);
  private bass = new Tone.BiquadFilter({ type: 'lowshelf', frequency: 120, gain: 0 });
  private middle = new Tone.BiquadFilter({ type: 'peaking', frequency: 650, Q: 0.8, gain: 0 });
  private treble = new Tone.BiquadFilter({ type: 'highshelf', frequency: 2800, gain: 0 });
  private convolver = new Tone.Convolver({ normalize: true });
  private irPath = new Tone.Gain(0);
  private filterPath = new Tone.Gain(1);
  private presence = new Tone.BiquadFilter({ type: 'peaking', frequency: 3500, Q: 1, gain: 0 });
  private lowShelf = new Tone.BiquadFilter({ type: 'lowshelf', frequency: 400, gain: 0 });
  private highShelf = new Tone.BiquadFilter({ type: 'highshelf', frequency: 3000, gain: 0 });
  private level = new Tone.Gain(1);
  private lowCut = new Tone.BiquadFilter({ type: 'highpass', frequency: 75 });
  private top = new Tone.BiquadFilter({ type: 'lowpass', frequency: 9000 });
  private bite = new Tone.BiquadFilter({ type: 'peaking', frequency: 3000, Q: 1.2, gain: 0 });
  private cabs: Partial<Record<AmpTone, AudioBuffer>> = {};
  private tone: AmpTone = 'clean';
  private drives = '';
  /** First filter of the stand-in cabinet (disconnected once a real IR is in, so it stops costing CPU). */
  private fallbackCab: Tone.BiquadFilter;

  /** `lead`: the lead guitar voicing of driven tones (see LEAD). */
  constructor(out: Tone.InputNode, private readonly lead = false) {
    this.stage1.oversample = '4x';
    this.stage2.oversample = '4x';
    // between the stages: shave fizz going into stage 2, and the lows that make it farty
    const inter = [
      new Tone.Gain(0.5),
      new Tone.BiquadFilter({ type: 'lowpass', frequency: 6500 }),
      new Tone.BiquadFilter({ type: 'highpass', frequency: 90 }),
      new Tone.Gain(0.7),
    ];
    this.input.chain(this.comp, this.makeup, new Tone.Gain(0.5), this.tight, this.push, this.stage1, ...inter, this.stage2, this.bass, this.middle, this.treble);
    // cabinet: real IR, with a filter cabinet as fallback
    this.treble.chain(this.convolver, this.irPath, this.presence);
    this.fallbackCab = new Tone.BiquadFilter({ type: 'highpass', frequency: 85 });
    this.treble.chain(
      this.fallbackCab,
      new Tone.BiquadFilter({ type: 'peaking', frequency: 2000, Q: 1.2, gain: 3 }),
      ...steep('lowpass', 4800, 0.5, 4),
      this.filterPath, this.presence,
    );
    // the IRs are close-miked 4x12s: trim the boom and the very top
    this.presence.chain(
      this.lowShelf, this.highShelf,
      this.lowCut, this.bite, this.top,
      this.level, out,
    );
  }

  /** Provide the cabinet impulse responses once loaded. */
  setCabs(cabs: Partial<Record<AmpTone, AudioBuffer>>) {
    this.cabs = cabs;
    this.applyCab();
  }

  private applyCab() {
    const ir = this.cabs[this.tone];
    if (!ir) return;
    this.convolver.buffer = new Tone.ToneAudioBuffer(ir);
    this.irPath.gain.value = 1;
    this.filterPath.gain.value = 0;
    if (!this.cabOn) {
      this.treble.disconnect(this.fallbackCab);
      this.cabOn = true;
    }
  }

  private cabOn = false;

  set(tone: AmpTone) {
    const s = (this.lead && LEAD[tone]) || AMP[tone];
    const changed = tone !== this.tone;
    this.tone = tone;
    this.comp.threshold.value = s.comp[0];
    this.comp.ratio.value = s.comp[1];
    this.makeup.gain.value = 10 ** (s.comp[2] / 20);
    this.tight.frequency.value = s.tight;
    this.push.frequency.value = s.push[0];
    this.push.gain.value = s.push[1];
    const drives = `${s.drive1}/${s.drive2}`;
    if (drives !== this.drives) {
      this.drives = drives;
      this.stage1.setMap(clipCurve(s.drive1), CURVE_LEN);
      this.stage2.setMap(clipCurve(s.drive2, 0.05), CURVE_LEN);
    }
    this.bass.gain.value = s.bass;
    this.middle.gain.value = s.middle;
    this.treble.gain.value = s.treble;
    this.presence.gain.value = s.presence;
    this.lowShelf.frequency.value = s.lowShelf[0];
    this.lowShelf.gain.value = s.lowShelf[1];
    this.highShelf.frequency.value = s.highShelf[0];
    this.highShelf.gain.value = s.highShelf[1];
    this.level.gain.value = s.level;
    this.lowCut.frequency.value = s.lowCut;
    this.top.frequency.value = s.top;
    this.bite.frequency.value = s.bite[0];
    this.bite.gain.value = s.bite[1];
    if (changed) this.applyCab();
  }
}

/** One guitar "take": a sampler, a palm-mute sampler and per-string voices. */
interface Take {
  ring: MultiSampler;
  muted: MultiSampler;
  strings: (Voice | undefined)[];
  /** The notes of the last chord strummed (a repeat of it rings on instead of being stopped). */
  last: number[];
}

export class Guitar implements ChordInstrument {
  readonly kind = 'guitar';
  state: LoadState = 'idle';
  /** Electric crunch/distortion is double-tracked: a second take panned to the other side. */
  private takes: Take[] = [];
  private outs: Tone.Gain[] = [];
  private panners: Tone.Panner[] = [];
  /** Amps for the main and double takes (follow the chosen tone). */
  private amps: Amp[] = [];
  private cleanAmp: Amp | null = null;
  /** Which take is the clean one (electric). */
  private cleanIdx = -1;
  private doubled = false;
  /** Built with a double-tracked take (driven rhythm guitars). */
  private hasDouble = false;
  private tone: AmpTone = 'clean';
  private _fallback?: Tone.PolySynth;
  /** Stand-in synth, made only if the samples fail (an idle synth keeps the amps processing silence). */
  private get fallback() {
    return (this._fallback ??= inContext(this.ctx, () => new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.3 }, volume: -14,
    }).connect(this.outs[0])));
  }
  /** The audio context it was made in (nodes made after the samples load go there too). */
  private ctx = Tone.getContext();

  /**
   * double: double-track driven tones (rhythm). A lead guitar plays a single take.
   * tone: an electric guitar's amp setting, fixed for good (it then builds only the amps it needs).
   * lead: voice driven tones as a lead guitar (Guitar 2).
   */
  constructor(readonly type: 'acoustic' | 'electric', out: Tone.InputNode, double = true, pan = 0, fixed?: AmpTone, lead = false) {
    // electric: main take, double-tracked take (rhythm only), and a clean take for quiet sections
    const driven = type === 'electric' && fixed !== 'clean';
    // rhythm guitars are double-tracked (two takes, panned apart), as on records; driven electrics
    // also keep a clean take for quiet sections
    const roles = ['main', ...(double ? ['double'] : []), ...(driven ? ['clean'] : [])];
    this.cleanIdx = roles.indexOf('clean');
    this.hasDouble = roles.includes('double');
    roles.forEach((role) => {
      const panner = new Tone.Panner(pan).connect(out);
      const head = new Tone.Gain(role === 'double' ? 0 : 1);
      if (type === 'electric') {
        const amp = new Amp(panner, lead && role !== 'clean');
        head.connect(amp.input);
        if (role !== 'clean') this.amps.push(amp);
        else { amp.set('clean'); this.cleanAmp = amp; }
      } else {
        // the archtop samples are thin at the bottom and dip around 2.5 kHz: add body and sparkle
        head.chain(
          new Tone.BiquadFilter({ type: 'lowshelf', frequency: 180, gain: 7 }),
          new Tone.BiquadFilter({ type: 'peaking', frequency: 2600, Q: 1, gain: 6 }),
          new Tone.BiquadFilter({ type: 'highshelf', frequency: 6000, gain: 2 }),
          new Tone.Volume(-2.5), panner,
        );
      }
      this.outs.push(head);
      this.panners.push(panner);
    });
    this.setTone(fixed ?? 'clean');
  }

  setTone(tone: AmpTone) {
    this.tone = tone;
    this.amps.forEach((a) => a.set(tone));
    this.doubled = this.hasDouble;
    if (this.hasDouble) {
      // driven guitars hard left and right; clean and acoustic a little less wide, and each take
      // a little quieter (two takes of a clean guitar add up louder than two distorted ones)
      const driven = this.type === 'electric' && tone !== 'clean';
      const width = driven ? 0.75 : 0.65;
      const take = driven ? 1 : this.type === 'acoustic' ? 0.85 : 0.75;
      this.outs[0].gain.value = take;
      this.outs[1].gain.value = take;
      this.panners[0].pan.value = -width;
      this.panners[1].pan.value = width;
    }
  }

  private loading?: Promise<void>;
  /** Load the samples (calling again returns the same promise, so callers can wait for it). */
  load(): Promise<void> {
    return (this.loading ??= this.loadNow());
  }

  private async loadNow() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    // the cabinet impulse responses load alongside the samples, so the guitar is never
    // "ready" with the fallback cabinet (which is much louder, and offline renders start at once)
    const cabs = this.type === 'electric'
      ? Promise.all((['clean', 'crunch', 'dist'] as const).map(loadCab)).catch(() => null)
      : Promise.resolve(null);
    try {
      const set = await loadPitched(this.type === 'acoustic' ? 'guitar-acoustic' : 'guitar-electric');
      const irs = await cabs;
      if (irs) {
        const [clean, crunch, dist] = irs;
        this.amps.forEach((a) => a.setCabs({ clean, crunch, dist }));
        this.cleanAmp?.setCabs({ clean });
      }
      this.takes = inContext(this.ctx, () => this.outs.map((head) => {
        // palm mute: the string is damped, so the highs die almost at once
        const pm = new Tone.BiquadFilter({ type: 'lowpass', frequency: 950, Q: 0.5 }).connect(head);
        return {
          ring: new MultiSampler(set, head, 0.08, this.ctx),
          muted: new MultiSampler(set, pm, 0.04, this.ctx),
          strings: [] as (Voice | undefined)[],
          last: [] as number[],
        };
      }));
      // the double never plays the exact same recording as the main take
      if (this.hasDouble) {
        this.takes[1].ring.partner = this.takes[0].ring;
        this.takes[1].muted.partner = this.takes[0].muted;
      }
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  strum(a: StrumArgs) {
    if (!this.takes.length) return this.fallbackStrum(a);
    if (a.clean && this.type === 'electric' && this.tone !== 'clean') return this.strumTake(this.takes[this.cleanIdx], a, false);
    const takes = this.takes.slice(0, this.doubled ? 2 : 1);
    takes.forEach((take, i) => {
      // the double is a separate performance: slightly late, slightly different
      const offset = i === 0 ? 0 : 0.006 + Math.random() * 0.012;
      this.strumTake(take, { ...a, time: a.time + offset, vel: a.vel * (i === 0 ? 1 : 0.95) }, this.tone !== 'clean');
    });
  }

  private strumTake(take: Take, a: StrumArgs, driven: boolean) {
    const { stroke, notes, strings, time, dur, vel, sixteenth, letRing, slide, swell } = a;
    const fadeIn = swell ? Math.min(0.6, dur * 0.4) : 0;
    const str = strings ?? notes.map((_, i) => 6 - notes.length + i);
    // time between strings: faster at quicker tempos, ~25-45 ms across six strings; a hand never
    // strums at exactly the same speed twice
    const gap = Math.min(0.009, Math.max(0.005, sixteenth * 0.06)) * (0.75 + Math.random() * 0.6);
    const detune = this.type === 'electric' ? 4 : 3;
    // a held single note gets real vibrato (chords none: a wobbling chord through an amp sounds like a toy)
    const vibrato = this.type !== 'electric' || letRing || notes.length > 1 ? 0 : driven ? 16 : 10;
    // strummed chords: the pick brushes the strings rather than clicking each one (a few ms of fade-in
    // takes the click off), and each string comes out a little louder or softer
    const chord = notes.length > 1 && !letRing && !swell;
    const brush = () => (chord ? 0.003 + Math.random() * 0.006 : 0);
    const touch = () => (chord ? 0.85 + Math.random() * 0.25 : 0.9 + Math.random() * 0.1);

    // stopping ringing strings makes a little damping noise, like a real hand (but not between the
    // notes of a single-note line: the fingers just move on, and the drive would blow the noise up)
    const line = notes.length === 1 && stroke === 'D';
    const muteAll = (t: number, fade = 0.015, noise = 0.6) => {
      const ringing = take.strings.some((v) => MultiSampler.ringing(v, t));
      take.strings.forEach((v) => take.ring.choke(v, t, line ? 0.025 : fade));
      if (ringing && !line && Math.random() < noise) take.ring.releaseNoise(t, (0.18 + Math.random() * 0.1) * (driven ? 0.3 : 1));
    };
    // the same chord strummed again: the strings ring on into the new strum (only the ones hit restart)
    const same = chord && take.last.length === notes.length && take.last.every((m, i) => m === notes[i]);
    if (stroke === 'D' || stroke === 'U') take.last = [...notes];

    if (stroke === 'D') {
      // fretting hand lifts: anything still ringing stops as the new chord sounds. Driven chords
      // hand over smoothly (the old chord fades under the new one), so the wall of sound never drops out
      if (!letRing && !same) {
        if (driven && notes.length > 1) take.strings.forEach((v) => take.ring.choke(v, time + gap * 2, 0.06));
        else muteAll(time + 0.002, chord ? 0.03 : 0.015, chord ? 0.2 : 0.6);
      }
      // sometimes the pick misses the top string
      const n = chord && notes.length > 4 && Math.random() < 0.2 ? notes.length - 1 : notes.length;
      for (let i = 0; i < n; i++) {
        const m = notes[i];
        const t = time + i * gap + jitter(1.5);
        if (letRing || same) take.ring.choke(take.strings[str[i]], t, same ? 0.02 : undefined);
        const v = vel * touch() * (1 - (notes.length - 1 - i) * 0.015);
        take.strings[str[i]] = take.ring.play(m, t, dur, v, { slide, vibrato, detune, fadeIn: fadeIn || brush() });
      }
    } else if (stroke === 'U') {
      // up-strokes catch the top 2-4 strings, a little lighter; lower strings keep ringing
      const n = Math.min(notes.length, 2 + Math.floor(Math.random() * 3));
      for (let k = 0; k < n; k++) {
        const i = notes.length - 1 - k;
        const t = time + k * gap * 0.8 + jitter(1.5);
        take.ring.choke(take.strings[str[i]], t, 0.02);
        take.strings[str[i]] = take.ring.play(notes[i], t, dur, vel * 0.8 * (1 - k * 0.06) * touch(), { detune, fadeIn: brush() });
      }
    } else if (stroke === 'x') {
      // fretting hand mutes the strings: chord stops, pick scrapes dead strings
      take.last = [];
      muteAll(time, 0.01);
      if (take.ring.hasNoises) {
        take.ring.noise(time, Math.min(1, vel * 0.9));
        if (Math.random() < 0.5) take.ring.noise(time + gap * 2, vel * 0.6);
      } else {
        notes.forEach((m, i) => take.muted.play(m, time + i * gap * 0.5, 0.03, 0.25));
      }
    } else if (stroke === 'p') {
      // palm mute: low strings only, short and dark
      take.last = [];
      muteAll(time, 0.01);
      notes.slice(0, Math.min(3, notes.length)).forEach((m, i) =>
        take.muted.play(m, time + i * gap * 0.6 + jitter(1), Math.min(dur, 0.18), Math.min(1, vel * 1.1), { detune }));
    }
  }

  private fallbackStrum({ stroke, notes, time, dur, vel }: StrumArgs) {
    const order = stroke === 'U' ? notes.slice(-3).reverse() : stroke === 'p' ? notes.slice(0, 3) : notes;
    const d = stroke === 'x' ? 0.03 : stroke === 'p' ? 0.12 : dur;
    order.forEach((m, i) => this.fallback.triggerAttackRelease(midiNote(m), d, time + i * 0.008, stroke === 'x' ? 0.2 : vel));
  }

  releaseAll() {
    this.takes.forEach((t) => { t.ring.stopAll(); t.muted.stopAll(); t.strings = []; t.last = []; });
    this._fallback?.releaseAll();
  }
}

/* ---------------------------------------------------------------- bass */

export type BassId = 'electric' | 'synth';
export const BASS_INSTRUMENTS: { id: BassId; label: string }[] = [
  { id: 'electric', label: 'Electric bass' },
  { id: 'synth', label: 'Synth bass' },
];

export type BassTone = 'clean' | 'warm' | 'grit' | 'heavy';

const BASS_TONE: Record<BassTone, { grit: number; drive: number; clank: number; level: number }> = {
  // grit = how much of the distorted "growl" path is blended in; clank = string/pick definition (dB).
  // Every tone stays close to clean: heavier styles get only a touch more growl (level keeps them even)
  clean: { grit: 0.12, drive: 2, clank: 5, level: 0.9 },
  warm: { grit: 0.14, drive: 2.5, clank: 4.5, level: 0.79 },
  grit: { grit: 0.17, drive: 3, clank: 4.5, level: 0.67 },
  heavy: { grit: 0.2, drive: 3.5, clank: 5, level: 0.58 },
};

/**
 * Rock bass rig: compressor, then a clean low-end path blended with a distorted "growl" path
 * (how most rock bass is recorded), string clank, and a final glue compressor.
 */
class BassRig {
  readonly input = new Tone.Gain();
  private grit = new Tone.Gain(0.3);
  private shaper = new Tone.WaveShaper((x) => Math.tanh(4 * x) / Math.tanh(4), 4096);
  private clank = new Tone.Filter({ type: 'peaking', frequency: 2400, Q: 0.9, gain: 5 });
  private level = new Tone.Gain(1);
  private drive = 4;

  constructor(out: Tone.InputNode) {
    this.shaper.oversample = '4x';
    const comp = new Tone.Compressor({ threshold: -26, ratio: 4, attack: 0.006, release: 0.12, knee: 6 });
    const sum = new Tone.Gain(1);
    this.input.connect(comp);
    // clean path: solid lows only
    comp.chain(new Tone.Filter({ type: 'lowpass', frequency: 320, rolloff: -24 }), sum);
    // growl path: no lows into the distortion (keeps it tight), speaker-ish top roll-off
    comp.chain(
      new Tone.Filter({ type: 'highpass', frequency: 220, rolloff: -24 }),
      new Tone.Gain(3), this.shaper,
      new Tone.Filter({ type: 'peaking', frequency: 800, Q: 0.8, gain: 4 }),
      new Tone.Filter({ type: 'lowpass', frequency: 4200, rolloff: -24 }),
      this.grit, sum,
    );
    sum.chain(
      // the recordings have weak fundamentals: put the weight back down low, less 250 Hz mud
      new Tone.Filter({ type: 'lowshelf', frequency: 110, gain: 6 }),
      new Tone.Filter({ type: 'peaking', frequency: 250, Q: 1, gain: -5 }),
      this.clank,
      new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.15 }),
      this.level, out,
    );
  }

  set(tone: BassTone) {
    const s = BASS_TONE[tone];
    this.grit.gain.value = s.grit;
    this.clank.gain.value = s.clank;
    this.level.gain.value = s.level;
    if (s.drive !== this.drive) {
      this.drive = s.drive;
      this.shaper.setMap((x) => Math.tanh(s.drive * x) / Math.tanh(s.drive), 4096);
    }
  }
}

export class Bass {
  state: LoadState = 'idle';
  useSynth = false;
  private sampler: MultiSampler | null = null;
  private last: Voice | undefined;
  private synth: Tone.MonoSynth;
  private rig: BassRig;
  /** The audio context it was made in (its voices play there, whichever context is current). */
  private ctx = Tone.getContext();

  constructor(out: Tone.InputNode) {
    this.rig = new BassRig(out);
    this.synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' }, filter: { Q: 1, type: 'lowpass' },
      filterEnvelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.2, baseFrequency: 70, octaves: 2.6 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.12 }, volume: -9,
    }).connect(out);
  }

  /** Bass sound to match the style (more growl for heavier genres). */
  setTone(tone: BassTone) {
    this.rig.set(tone);
  }

  private loading?: Promise<void>;
  /** Load the samples (calling again returns the same promise, so callers can wait for it). */
  load(): Promise<void> {
    return (this.loading ??= this.loadNow());
  }

  private async loadNow() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      // a finger mute, not a click, when a note stops
      this.sampler = new MultiSampler(await loadPitched('bass-electric'), this.rig.input, 0.09, this.ctx);
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  play(midi: number, time: number, dur: number, vel: number) {
    if (this.sampler && !this.useSynth) {
      // a player sits a few milliseconds behind the beat, never exactly on the grid
      const t = time + 0.004 + Math.random() * 0.006;
      // one string at a time: a new note takes over from the last one
      this.sampler.choke(this.last, t, 0.02);
      this.last = this.sampler.play(midi, t, dur, vel * (0.9 + Math.random() * 0.1), { detune: 3 });
    } else this.synth.triggerAttackRelease(midiNote(midi), dur, time, vel);
  }

  releaseAll() {
    this.sampler?.stopAll();
    this.last = undefined;
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
  kick: 1, snare: 1, hat: 0.42, hatOpen: 0.36, crash: 0.42, ride: 0.38, tom1: 0.8, tom2: 0.8, tom3: 0.85,
};

type Band = [BiquadFilterType, number, number, number]; // type, Hz, dB, Q

const CYMBALS: readonly DrumPiece[] = ['hat', 'hatOpen', 'crash', 'ride'];
/** dB: what the bus compressors' make-up gain gave the cymbals before they had their own path. */
const CYMBAL_MAKEUP = 7;
/** Per-drum EQ, the usual rock-mix moves. */
const PIECE_EQ: Record<DrumPiece, Band[]> = {
  // thump, less cardboard, beater click
  kick: [['highpass', 42, 0, 0.8], ['peaking', 70, 2, 1], ['peaking', 260, -6, 0.9], ['peaking', 3500, 6, 1.2]],
  // body and crack
  snare: [['peaking', 200, 4, 1], ['peaking', 600, -3, 1.2], ['peaking', 2500, 2, 1], ['highshelf', 6000, -2, 0.7]],
  hat: [['highpass', 300, 0, 0.7], ['highshelf', 7000, 1, 0.7]],
  hatOpen: [['highpass', 300, 0, 0.7], ['highshelf', 7000, 1, 0.7]],
  crash: [['highpass', 250, 0, 0.7], ['highshelf', 7000, 1, 0.7]],
  ride: [['highpass', 250, 0, 0.7], ['highshelf', 7000, 1, 0.7]],
  tom1: [['peaking', 450, -4, 1], ['highshelf', 4000, 4, 0.7]],
  tom2: [['peaking', 400, -4, 1], ['highshelf', 4000, 4, 0.7]],
  tom3: [['peaking', 350, -4, 1], ['highshelf', 4000, 4, 0.7]],
};

/** Drum bus settings (tuned by measuring against the guitars). */
const DRUM_SMASH = 0.5;
const DRUM_DRIVE = 1;
const DRUM_LEVEL = 0.75;
const PIECE_PAN: Record<DrumPiece, number> = {
  kick: 0, snare: 0.05, hat: 0.4, hatOpen: 0.4, crash: -0.5, ride: -0.45, tom1: 0.35, tom2: 0, tom3: -0.4,
};

export class DrumKit {
  state: LoadState = 'idle';
  useSynth = false;
  private bufs: Record<DrumPiece, AudioBuffer[][]> | null = null;
  private rr = new RoundRobin();
  private outs = {} as Record<DrumPiece, Tone.ToneAudioNode>;
  private openHat: SampleVoice | null = null;
  private fb: {
    kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hat: Tone.MetalSynth; crash: Tone.MetalSynth; tom: Tone.MembraneSynth;
  };

  constructor(out: Tone.InputNode) {
    // drum bus: glue compression, parallel "smash" compression for weight, soft saturation for the peaks
    const bus = new Tone.Gain(1);
    const glue = new Tone.Compressor({ threshold: -22, ratio: 4, attack: 0.012, release: 0.14, knee: 6 });
    const smash = new Tone.Compressor({ threshold: -40, ratio: 12, attack: 0.002, release: 0.1 });
    const sum = new Tone.Gain(1);
    bus.chain(glue, sum);
    bus.chain(smash, new Tone.Filter({ type: 'highpass', frequency: 60 }), new Tone.Gain(DRUM_SMASH), sum);
    const sat = new Tone.WaveShaper((x) => Math.tanh(1.6 * x) / Math.tanh(1.6), 2048);
    sum.chain(new Tone.Gain(DRUM_DRIVE), sat, new Tone.Gain(DRUM_LEVEL), out);

    // the bus compressors add make-up gain (built into the browser's compressor); the cymbals' own path matches it
    const cymbals = new Tone.Gain(Tone.dbToGain(CYMBAL_MAKEUP)).connect(sum);
    for (const p of DRUM_PIECES) {
      // cymbals skip the bus compressors: the kick and snare ducked every on-beat hi-hat, turning the
      // drummer's accents around (off-beats came out louder) and making the groove pump
      const pan = new Tone.Panner(PIECE_PAN[p]).connect(CYMBALS.includes(p) ? cymbals : bus);
      const eq = PIECE_EQ[p].map(([type, frequency, gain, Q]) => new Tone.Filter({ type, frequency, gain, Q }));
      this.outs[p] = eq.length ? eq[0] : pan;
      if (eq.length) Tone.connectSeries(...eq, pan);
    }
    this.fb = {
      kick: new Tone.MembraneSynth({ volume: -2 }).connect(out),
      snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -12 }).connect(out),
      hat: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5, volume: -28 }).connect(out),
      crash: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 1.2, release: 0.5 }, harmonicity: 5.1, modulationIndex: 40, resonance: 5000, octaves: 2, volume: -30 }).connect(out),
      tom: new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, volume: -8 }).connect(out),
    };
  }

  private loading?: Promise<void>;
  /** Load the samples (calling again returns the same promise, so callers can wait for it). */
  load(): Promise<void> {
    return (this.loading ??= this.loadNow());
  }

  private async loadNow() {
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
    // a drummer is never perfectly on the grid (the kick anchors the time)
    const t = time + (piece === 'kick' ? 0 : jitter(piece === 'hat' || piece === 'ride' ? 4 : 2.5));
    // closed hat (or a new open hat) chokes the ringing open hat
    if ((what === 'hat' || what === 'hatOpen') && this.openHat) {
      const src = this.openHat;
      try { src.stop(t); } catch { /* already stopped */ }
      this.openHat = null;
    }
    const layers = this.bufs[piece];
    const li = Math.min(layers.length - 1, Math.floor(vel * layers.length * 0.999));
    const buf = this.rr.pick(`${piece}:${li}`, layers[li]);
    // played in the kit's own context (an offline render plays in its own, not the live one)
    const src = new SampleVoice(this.outs[piece].context, buf, this.outs[piece], { fadeOut: 0.02 });
    // cymbals respond more to how hard they're hit (accents carry the groove)
    const curve = CYMBALS.includes(piece) ? 0.2 + 0.8 * vel : 0.35 + 0.65 * vel;
    const gain = PIECE_LEVEL[piece] * curve * (0.92 + Math.random() * 0.16);
    src.start(t, gain);
    if (what === 'hatOpen') this.openHat = src;
  }

  private reversed: AudioBuffer | null = null;

  /**
   * A reversed crash cymbal that swells up and stops right on `end` (the next section's downbeat),
   * `len` seconds long: the loud end of the reversed crash, trimmed to fit.
   */
  swell(end: number, len: number, vel: number) {
    if (!this.bufs || this.useSynth || len < 0.2) return;
    const layers = this.bufs.crash;
    const top = layers[layers.length - 1];
    if (!top?.length) return;
    if (!this.reversed) {
      const src = top[0];
      const rev = new AudioBuffer({ length: src.length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
      for (let c = 0; c < src.numberOfChannels; c++) rev.getChannelData(c).set(src.getChannelData(c).slice().reverse());
      this.reversed = rev;
    }
    const rev = this.reversed;
    const n = Math.min(rev.length, Math.round(len * rev.sampleRate));
    const buf = new AudioBuffer({ length: n, numberOfChannels: rev.numberOfChannels, sampleRate: rev.sampleRate });
    for (let c = 0; c < rev.numberOfChannels; c++) buf.getChannelData(c).set(rev.getChannelData(c).subarray(rev.length - n));
    const v = new SampleVoice(this.outs.crash.context, buf, this.outs.crash, { fadeIn: Math.min(0.3, n / rev.sampleRate / 3), fadeOut: 0.01 });
    v.start(end - n / rev.sampleRate, PIECE_LEVEL.crash * 0.7 * vel);
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
