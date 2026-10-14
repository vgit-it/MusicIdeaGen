// The Guide line's sound: a soft synth (a sine with a little triangle on top, a gentle attack and
// release), one note at a time. Plain Web Audio oscillators made per note, like the pad.

import * as Tone from 'tone';

export class GuideSynth {
  private ctx = Tone.getContext();
  private vol: Tone.Volume;
  private lp: Tone.BiquadFilter;
  private voices = new Set<{ g: GainNode; oscs: OscillatorNode[] }>();

  /** `out`: after the band's mix bus (so the band can be switched off under it). */
  constructor(out: Tone.InputNode) {
    this.vol = new Tone.Volume(-6).connect(out);
    this.lp = new Tone.BiquadFilter({ type: 'lowpass', frequency: 2400, Q: 0.3 }).connect(this.vol);
  }

  /** Fader 0-100 (0: off). */
  setLevel(v: number) {
    this.vol.volume.value = v <= 0 ? -Infinity : 20 * Math.log10((v / 100) ** 2) - 2;
  }

  /**
   * A note from `time` for `dur` seconds. `bends`: the pitch glides on to other notes without a new
   * attack (`at` seconds in, over `over` seconds), the way a guitarist bends a string; `over` 0: a jump.
   * `taps`: a little accent at these seconds in (the quick notes, struck like a drum hit). `rests`: a
   * split second of silence (`at` seconds in, `len` long), the note struck again after it. `marks`: pushes
   * (a quick dip and a lift, like a word starting) and pulls (a dip that comes back softly, like a word ending).
   */
  play(midi: number, time: number, dur: number, vel = 0.8, bends: { at: number; to: number; over: number }[] = [], taps: number[] = [], rests: { at: number; len: number }[] = [], marks: { at: number; kind: 'push' | 'pull' }[] = []) {
    const raw = this.ctx.rawContext as BaseAudioContext;
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const freq = hz(midi);
    const g = raw.createGain();
    const peak = 0.22 * vel, end = time + Math.max(0.08, dur - 0.03);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.035);
    g.gain.setTargetAtTime(peak * 0.8, time + 0.035, 0.3);
    g.gain.setTargetAtTime(0, end, 0.06);
    const acc = raw.createGain();
    acc.gain.setValueAtTime(1, time);
    const evs = [...taps.map((at) => ({ at, rest: 0, kind: '' })), ...rests.map((r) => ({ at: r.at, rest: r.len, kind: '' })), ...marks.map((m) => ({ at: m.at, rest: 0, kind: m.kind }))].sort((a, b) => a.at - b.at || b.rest - a.rest);
    for (const m of evs) {
      const t = time + m.at;
      if (m.kind === 'push') {
        // (a breath of a dip, then louder, settling back)
        acc.gain.setTargetAtTime(0.55, Math.max(time, t - 0.035), 0.01);
        acc.gain.setValueAtTime(1.6, t);
        acc.gain.setTargetAtTime(1, t + 0.02, 0.12);
      } else if (m.kind === 'pull') {
        // (falling away, then back softly)
        acc.gain.setTargetAtTime(0.3, t, 0.04);
        acc.gain.setTargetAtTime(1, t + 0.14, 0.1);
      } else if (m.rest) {
        // (silence, cut quickly, until the note comes back)
        acc.gain.setTargetAtTime(0, t, 0.006);
        acc.gain.setValueAtTime(0, t + m.rest - 0.002);
      } else { acc.gain.setValueAtTime(1.4, t); acc.gain.setTargetAtTime(1, t + 0.01, 0.05); }
    }
    g.connect(acc);
    Tone.connect(acc, this.lp);
    const oscs = (['sine', 'triangle'] as const).map((type, i) => {
      const o = raw.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, time);
      let cur = freq;
      for (const b of [...bends].sort((x, y) => x.at - y.at)) {
        o.frequency.setValueAtTime(cur, time + b.at);
        cur = hz(b.to);
        if (b.over > 0) o.frequency.exponentialRampToValueAtTime(cur, time + b.at + b.over);
        else o.frequency.setValueAtTime(cur, time + b.at + 0.002);
      }
      const lvl = raw.createGain();
      lvl.gain.value = i ? 0.35 : 1;
      o.connect(lvl).connect(g);
      o.start(time);
      o.stop(end + 0.5);
      return o;
    });
    const v = { g, oscs };
    this.voices.add(v);
    oscs[0].onended = () => this.voices.delete(v);
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
