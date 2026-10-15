// The Guide line's sound: a soft synth (a sine with a little triangle on top, a gentle attack and
// release), one note at a time. Plain Web Audio oscillators made per note, like the pad.

import * as Tone from 'tone';

/**
 * Human feel on one note (feel.ts; left out: as before): `from` the note before's pitch to glide from over
 * `glide` seconds (joined notes), else a `scoop` (semitones) up into it over `scoopLen`; `swell` seconds
 * rising in, `fade` seconds fading out; `fall` semitones off its end; `vib` cents of vibrato on a held note,
 * in late; `sharp` cents over (a pushed note); `breath` a breath in before it (0-1).
 */
export interface SynthFeel { from?: number; glide: number; scoop: number; scoopLen: number; swell: number; fade: number; fall: number; vib: number; sharp: number; breath: number }

export class GuideSynth {
  private noise: AudioBuffer | null = null;
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
   * (a quick dip and a lift, like a word starting) and pulls (falling away to silence, like a word ending;
   * the note comes back with a tap on the next beat).
   */
  play(midi: number, time: number, dur: number, vel = 0.8, bends: { at: number; to: number; over: number }[] = [], taps: number[] = [], rests: { at: number; len: number }[] = [], marks: { at: number; kind: 'push' | 'pull' }[] = [], feel?: SynthFeel) {
    const raw = this.ctx.rawContext as BaseAudioContext;
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const freq = hz(midi);
    const g = raw.createGain();
    const peak = 0.22 * vel, end = time + Math.max(0.08, dur - 0.03);
    // (human feel: rising in over the swell, fading out over the fade)
    const att = feel ? Math.max(0.01, Math.min(feel.swell, dur * 0.4)) : 0.035;
    const fade = feel ? Math.min(feel.fade, Math.max(0, end - time - att - 0.02)) : 0;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + att);
    g.gain.setTargetAtTime(peak * 0.8, time + att, 0.3);
    if (fade > 0.01) g.gain.setTargetAtTime(0, end - fade, fade / 2.5);
    g.gain.setTargetAtTime(0, end, fade > 0.01 ? 0.03 : 0.06);
    const acc = raw.createGain();
    acc.gain.setValueAtTime(1, time);
    const evs = [...taps.map((at) => ({ at, rest: 0, kind: '' })), ...rests.map((r) => ({ at: r.at, rest: r.len, kind: '' })), ...marks.map((m) => ({ at: m.at, rest: 0, kind: m.kind }))].sort((a, b) => a.at - b.at || b.rest - a.rest);
    for (const m of evs) {
      const t = time + m.at;
      if (m.kind === 'push') {
        // (a breath of a dip, then louder, settling back)
        acc.gain.setTargetAtTime(0.35, Math.max(time, t - 0.045), 0.01);
        acc.gain.setValueAtTime(2.2, t);
        acc.gain.setTargetAtTime(1, t + 0.04, 0.18);
      } else if (m.kind === 'pull') {
        // (falling away to silence; the note is struck again on the next beat)
        acc.gain.setTargetAtTime(0, t, 0.03);
      } else if (m.rest) {
        // (silence, cut quickly, until the note comes back)
        acc.gain.setTargetAtTime(0, t, 0.006);
        acc.gain.setValueAtTime(0, t + m.rest - 0.002);
      } else { acc.gain.setValueAtTime(1.4, t); acc.gain.setTargetAtTime(1, t + 0.01, 0.05); }
    }
    g.connect(acc);
    Tone.connect(acc, this.lp);
    // (human feel: vibrato and pushed-sharp and the fall in cents, shared by both oscillators)
    let cents: GainNode | null = null, lfo: OscillatorNode | null = null;
    if (feel) {
      cents = raw.createGain();
      const c = raw.createConstantSource();
      c.offset.setValueAtTime(0, time);
      if (feel.sharp) c.offset.linearRampToValueAtTime(feel.sharp, time + 0.15);
      if (feel.fall) {
        const fl = Math.min(0.25, dur * 0.35);
        c.offset.setValueAtTime(feel.sharp, end - fl);
        c.offset.linearRampToValueAtTime(-100 * feel.fall, end);
      }
      c.connect(cents);
      c.start(time);
      c.stop(end + 0.5);
      if (feel.vib && dur > 0.5) {
        lfo = raw.createOscillator();
        lfo.frequency.value = 5.2 + 0.6 * ((midi * 7) % 5) / 5;
        const depth = raw.createGain(), into = Math.min(0.4, dur * 0.4);
        depth.gain.setValueAtTime(0, time);
        depth.gain.setValueAtTime(0, time + into);
        depth.gain.linearRampToValueAtTime(feel.vib, time + into + 0.3);
        lfo.connect(depth).connect(cents);
        lfo.start(time);
        lfo.stop(end + 0.5);
      }
      if (feel.breath) this.breathIn(time, feel.breath, peak);
    }
    const oscs = (['sine', 'triangle'] as const).map((type, i) => {
      const o = raw.createOscillator();
      o.type = type;
      // (human feel: glided from the note before, or scooped up into)
      const glided = feel?.from !== undefined && feel.from !== midi, scooped = !glided && !!feel?.scoop;
      o.frequency.setValueAtTime(glided ? hz(feel!.from!) : scooped ? freq * 2 ** (-feel!.scoop / 12) : freq, time);
      if (glided || scooped) o.frequency.exponentialRampToValueAtTime(freq, time + Math.min(glided ? feel!.glide : feel!.scoopLen, dur * 0.4));
      if (cents) cents.connect(o.detune);
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

  /** A breath in just before `time`: filtered noise, a quarter second, cut 50 ms before the note. */
  private breathIn(time: number, amount: number, peak: number) {
    const raw = this.ctx.rawContext as BaseAudioContext;
    if (!this.noise) {
      this.noise = raw.createBuffer(1, Math.round(raw.sampleRate * 0.3), raw.sampleRate);
      const d = this.noise.getChannelData(0);
      let x = 1;
      for (let i = 0; i < d.length; i++) { x = (x * 16807) % 2147483647; d[i] = x / 1073741823.5 - 1; }
    }
    const t0 = time - 0.3;
    if (t0 < raw.currentTime) return;
    const src = raw.createBufferSource();
    src.buffer = this.noise;
    const bp = raw.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    bp.Q.value = 0.8;
    const g = raw.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak * 0.5 * amount, t0 + 0.2);
    g.gain.linearRampToValueAtTime(0, t0 + 0.25);
    src.connect(bp).connect(g);
    Tone.connect(g, this.lp);
    src.start(t0);
    src.stop(t0 + 0.3);
    src.onended = () => g.disconnect();
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
