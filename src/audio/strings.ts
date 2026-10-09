// String section (cellos, violas, violins: VSCO 2 CE sustains). Chords swell in and cross-fade into
// each other; the section is spread wide (a short delay on one side) and opens up in louder sections.

import * as Tone from 'tone';
import { inContext } from './context';
import { MultiSampler } from './multisampler';
import { loadPitched } from './samples';

/** Low-pass cutoff (Hz) by section energy: verses darker and softer, choruses brighter. */
const ENERGY_CUTOFF = [6000, 2600, 3400, 4800, 7000, 9000];

export class Strings {
  readonly kind = 'strings';
  state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private ctx = Tone.getContext();
  private sampler: MultiSampler | null = null;
  private input!: Tone.Gain;
  private lp!: Tone.Filter;
  private loading?: Promise<void>;

  constructor(out: Tone.InputNode) {
    inContext(this.ctx, () => {
      const vol = new Tone.Volume(0).connect(out);
      this.lp = new Tone.Filter({ type: 'lowpass', frequency: ENERGY_CUTOFF[4], rolloff: -12 });
      const hp = new Tone.Filter({ type: 'highpass', frequency: 70, rolloff: -12 });
      this.input = new Tone.Gain(1);
      this.input.chain(hp, this.lp);
      // width: the section left, and a few milliseconds later on the right
      this.lp.connect(new Tone.Panner(-0.45).connect(vol));
      this.lp.chain(new Tone.Delay(0.014), new Tone.Panner(0.45), vol);
    });
  }

  load(): Promise<void> {
    return (this.loading ??= this.loadNow());
  }

  private async loadNow() {
    this.state = 'loading';
    try {
      // a bowed note fades out over half a second or so when it stops
      this.sampler = new MultiSampler(await loadPitched('strings'), this.input, 0.6, this.ctx);
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  setEnergy(e: number, time: number) {
    this.lp.frequency.setTargetAtTime(ENERGY_CUTOFF[e] ?? ENERGY_CUTOFF[4], time, 0.5);
  }

  /** Hold a chord: `swell` fades it in slowly instead of bowing it straight in. */
  play(notes: number[], time: number, dur: number, vel: number, swell = false) {
    if (!this.sampler) return;
    const fadeIn = swell ? Math.min(1.4, dur * 0.6) : 0.09;
    // a chord of any size at about the same loudness (three high violins or six notes with cellos)
    const g = (0.3 + 0.7 * vel) ** 1.5 * Math.sqrt(4 / notes.length);
    const v = Math.max(0, Math.min(1, (g ** (1 / 1.5) - 0.3) / 0.7));
    // short stabs stop quickly; held chords fade out like a bow leaving the string
    const release = dur < 0.4 ? 0.15 : 0.6;
    for (const n of notes) this.sampler.play(n, time, Math.min(dur, 7.6), v, { fadeIn, detune: 5, release });
  }

  releaseAll() {
    this.sampler?.stopAll();
  }
}
