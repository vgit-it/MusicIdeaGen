// Synth pad: three detuned saws per note (one left, one right, one centre), slow attack and long
// release, so chords swell in and glide into each other.
//
// Voices are plain Web Audio oscillators made per note and stopped after the release: nothing runs
// while the pad is silent, and it's light enough for audio exports (Tone's synth voices carry several
// always-on signal nodes each, which made exports with a pad 70% slower).

import * as Tone from 'tone';
import type { Genre } from '../genres';
import { inContext } from './context';

export type PadTone = 'warm' | 'bright' | 'dark';
export type PadChoice = PadTone | 'auto';
export const PAD_TONES: { id: PadChoice; label: string }[] = [
  { id: 'auto', label: 'Auto (by genre)' },
  { id: 'warm', label: 'Warm' },
  { id: 'bright', label: 'Bright' },
  { id: 'dark', label: 'Dark' },
];
export const AUTO_PAD: Record<Genre, PadTone> = {
  rock: 'warm', pop: 'warm', funk: 'warm', hardrock: 'warm', metal: 'dark', grunge: 'dark', altmetal: 'dark',
};

/** Low-pass cutoff (Hz) at energy 4, detune of the side voices (cents), and level (dB). */
const TONE: Record<PadTone, { cutoff: number; spread: number; level: number }> = {
  warm: { cutoff: 1700, spread: 14, level: 0 },
  bright: { cutoff: 4200, spread: 18, level: -2 },
  dark: { cutoff: 900, spread: 11, level: 2 },
};

/** Cutoff by section energy: verses darker, choruses open up. */
const ENERGY_CUTOFF = [1, 0.55, 0.65, 0.8, 1, 1.15];

const ATTACK = 0.45, DECAY = 0.5, SUSTAIN = 0.75, RELEASE = 0.45; // DECAY and RELEASE are time constants
/** Per-voice level (matched to the old Tone synth pad: about 6 dB under the guitars in a chorus). */
const VOICE = 0.1;

interface PadVoice { gains: GainNode[]; oscs: OscillatorNode[] }

export class Pad {
  readonly kind = 'pad';
  state: 'ready' = 'ready';
  private ctx = Tone.getContext();
  private left!: Tone.Gain;
  private right!: Tone.Gain;
  private lp!: Tone.BiquadFilter;
  private vol!: Tone.Volume;
  private tone: PadTone = 'warm';
  private energy = 4;
  private voices = new Set<PadVoice>();

  constructor(out: Tone.InputNode) {
    inContext(this.ctx, () => {
      this.vol = new Tone.Volume(0).connect(out);
      const hp = new Tone.BiquadFilter({ type: 'highpass', frequency: 160, Q: 0.6 }).connect(this.vol);
      this.lp = new Tone.BiquadFilter({ type: 'lowpass', frequency: 1700, Q: 0.4 }).connect(hp);
      this.left = new Tone.Gain(1).connect(new Tone.Panner(-0.6).connect(this.lp));
      this.right = new Tone.Gain(1).connect(new Tone.Panner(0.6).connect(this.lp));
    });
    this.setTone('warm');
  }

  load() { return Promise.resolve(); }

  setTone(t: PadTone) {
    this.tone = t;
    this.vol.volume.value = TONE[t].level;
    this.applyCutoff(this.ctx.now());
  }

  /** Follow the section's energy (darker when quiet), gliding at `time`. */
  setEnergy(e: number, time: number) {
    this.energy = e;
    this.applyCutoff(time);
  }

  private applyCutoff(time: number) {
    this.lp.frequency.setTargetAtTime(TONE[this.tone].cutoff * ENERGY_CUTOFF[this.energy], time, 0.4);
  }

  /** Hold a chord from `time` for `dur` seconds (the release rings on after). */
  play(notes: number[], time: number, dur: number, vel: number) {
    const raw = this.ctx.rawContext as BaseAudioContext;
    const spread = TONE[this.tone].spread;
    const end = time + dur;
    const attack = Math.min(ATTACK, dur * 0.6);
    const peak = VOICE * vel;
    for (const m of notes) {
      const freq = 440 * 2 ** ((m - 69) / 12);
      // an envelope per side; the centre saw feeds both
      const gains = [this.left, this.right].map((bus) => {
        const g = raw.createGain();
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(peak, time + attack);
        g.gain.setTargetAtTime(peak * SUSTAIN, time + attack, DECAY);
        g.gain.setTargetAtTime(0, end, RELEASE);
        Tone.connect(g, bus);
        return g;
      });
      const oscs = [-spread, spread, 0].map((cents, i) => {
        const o = raw.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        // a random start phase and a hair of extra drift, so repeated chords never phase the same way
        o.detune.value = cents + (Math.random() - 0.5) * 4;
        if (i < 2) o.connect(gains[i]);
        else {
          const c = raw.createGain();
          c.gain.value = 0.7;
          o.connect(c);
          gains.forEach((g) => c.connect(g));
        }
        o.start(time + Math.random() * 0.01);
        o.stop(end + RELEASE * 7);
        return o;
      });
      const v = { gains, oscs };
      this.voices.add(v);
      oscs[0].onended = () => this.voices.delete(v);
    }
  }

  releaseAll() {
    const now = this.ctx.rawContext.currentTime;
    for (const v of this.voices) {
      for (const g of v.gains) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.setTargetAtTime(0, now, 0.08);
      }
      for (const o of v.oscs) { try { o.stop(now + 0.5); } catch { /* already stopped */ } }
    }
    this.voices.clear();
  }
}
