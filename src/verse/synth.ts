// The verse melody's sound for now: a soft synth (a sine with a little triangle on top), one note at a
// time, plain Web Audio oscillators made per note.

import * as Tone from 'tone';

export class VerseSynth {
  private ctx = Tone.getContext();
  private vol: Tone.Volume;
  private lp: Tone.BiquadFilter;
  private voices = new Set<{ g: GainNode; oscs: OscillatorNode[] }>();

  constructor(out: Tone.InputNode) {
    this.vol = new Tone.Volume(-6).connect(out);
    this.lp = new Tone.BiquadFilter({ type: 'lowpass', frequency: 2400, Q: 0.3 }).connect(this.vol);
  }

  /** Fader 0-100 (0: off). */
  setLevel(v: number) {
    this.vol.volume.value = v <= 0 ? -Infinity : 20 * Math.log10((v / 100) ** 2) - 2;
  }

  play(midi: number, time: number, dur: number, vel = 0.8) {
    const raw = this.ctx.rawContext as BaseAudioContext;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const g = raw.createGain();
    const peak = 0.22 * vel, end = time + Math.max(0.08, dur - 0.03);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.02);
    g.gain.setTargetAtTime(0, end, 0.05);
    Tone.connect(g, this.lp);
    const oscs = (['sine', 'triangle'] as const).map((type, i) => {
      const o = raw.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const og = raw.createGain();
      og.gain.value = i ? 0.35 : 1;
      o.connect(og).connect(g);
      o.start(time);
      o.stop(end + 0.4);
      return o;
    });
    const v = { g, oscs };
    this.voices.add(v);
    oscs[0].onended = () => { this.voices.delete(v); g.disconnect(); };
  }

  releaseAll() {
    const now = this.ctx.rawContext.currentTime;
    for (const v of this.voices) {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setTargetAtTime(0, now, 0.03);
      for (const o of v.oscs) { try { o.stop(now + 0.3); } catch { /* already stopped */ } }
    }
    this.voices.clear();
  }
}
