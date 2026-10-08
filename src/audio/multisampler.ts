// Plays multi-sampled instruments: velocity layers, round robins and repitching
// from the nearest sampled note, plus slides, vibrato and tiny tuning differences.

import * as Tone from 'tone';
import { RoundRobin, type SampleSet } from './samples';
import { SampleVoice } from './voice';

export interface Voice {
  src: SampleVoice;
  /** When the note is scheduled to stop (seconds, audio clock). */
  endAt: number;
}

export interface PlayOptions {
  release?: number;
  /** Start this many semitones away and glide onto the note. */
  slide?: number;
  /** Vibrato depth in cents on held notes (0 = none). */
  vibrato?: number;
  /** Random tuning spread in cents (strings are never perfectly in tune). */
  detune?: number;
  /** Fade-in time in seconds (volume swell). */
  fadeIn?: number;
}

export class MultiSampler {
  private rr = new RoundRobin();
  private active = new Set<Voice>();
  /** Last buffer played per note/layer slot. */
  private lastBuf = new Map<string, AudioBuffer>();
  /** A double-tracking partner: avoid playing the exact take it just played. */
  partner: MultiSampler | null = null;

  /** `ctx`: the audio context its instrument belongs to (an offline render plays its voices there, not in the live one). */
  constructor(private set: SampleSet, private out: Tone.InputNode, private release = 0.1, private ctx: Tone.BaseContext = Tone.getContext()) {}

  /** Velocity 0-1 -> layer. The bottom of the range always gets the softest layer. */
  private layerFor(vel: number, layers: number) {
    const t = Math.min(0.999, Math.max(0, (vel - 0.3) / 0.6));
    return Math.floor(t * layers);
  }

  play(midi: number, time: number, dur: number, vel: number, opts: PlayOptions = {}): Voice {
    const { notes, buffers } = this.set;
    let ni = 0;
    for (let i = 1; i < notes.length; i++) if (Math.abs(notes[i] - midi) < Math.abs(notes[ni] - midi)) ni = i;
    const layers = buffers[ni];
    const li = this.layerFor(vel, layers.length);
    const slot = `${ni}:${li}`;
    const taken = this.partner?.lastBuf.get(slot);
    const pool = taken && layers[li].length > 1 ? layers[li].filter((b) => b !== taken) : layers[li];
    const buf = this.rr.pick(slot, pool);
    this.lastBuf.set(slot, buf);

    const cents = opts.detune ? (Math.random() - 0.5) * 2 * opts.detune : 0;
    const rate = 2 ** ((midi - notes[ni]) / 12 + cents / 1200);
    const v = this.start(buf, time, dur, (0.3 + 0.7 * vel) ** 1.5, rate, opts.release ?? this.release, opts.fadeIn);
    const pr = v.src.playbackRate;
    let settle = time;
    if (opts.slide) {
      settle = time + 0.07 + Math.abs(opts.slide) * 0.03;
      pr.setValueAtTime(rate * 2 ** (opts.slide / 12), time);
      pr.linearRampToValueAtTime(rate, settle);
    }
    // vibrato fades in after the note has spoken, like a player's wrist
    const vibStart = Math.max(settle, time + 0.28);
    const vibLen = time + dur - vibStart;
    if (opts.vibrato && vibLen > 0.25) {
      const hz = 4.8 + Math.random() * 1.2;
      const n = Math.max(16, Math.ceil(vibLen * 120));
      const curve: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) * vibLen;
        const depth = opts.vibrato * Math.min(1, t / 0.35);
        curve[i] = rate * 2 ** ((depth * Math.sin(2 * Math.PI * hz * t)) / 1200);
      }
      pr.setValueCurveAtTime(curve, vibStart, vibLen);
    }
    return v;
  }

  /** Play one of the extra one-shots (e.g. a muted scratch). */
  noise(time: number, vel: number): Voice | null {
    if (!this.set.noises.length) return null;
    const buf = this.rr.pick('noise', this.set.noises);
    return this.start(buf, time, buf.duration, vel, 1, 0.02);
  }

  /** String-damping noise when a ringing chord is stopped. */
  releaseNoise(time: number, vel: number) {
    if (!this.set.releases.length) return;
    const buf = this.rr.pick('release', this.set.releases);
    this.start(buf, time, buf.duration, vel, 1, 0.02);
  }

  get hasNoises() {
    return this.set.noises.length > 0;
  }

  private start(buf: AudioBuffer, time: number, dur: number, gain: number, rate: number, release: number, fadeIn = 0): Voice {
    const src = new SampleVoice(this.ctx, buf, this.out, { rate, fadeIn, fadeOut: release });
    const voice: Voice = { src, endAt: time + dur };
    src.onended = () => this.active.delete(voice);
    src.start(time, gain);
    src.stop(time + dur);
    this.active.add(voice);
    return voice;
  }

  /** Cut a ringing voice early, e.g. when the same string is played again. */
  choke(v: Voice | undefined, time: number, fade = 0.012) {
    if (!v || v.endAt <= time) return;
    v.src.fadeOut = fade;
    v.src.stop(time);
    v.endAt = time;
  }

  /** Is this voice still sounding at `time`? */
  static ringing(v: Voice | undefined, time: number) {
    return !!v && v.endAt > time;
  }

  stopAll() {
    const now = this.ctx.now();
    for (const v of this.active) this.choke(v, now, 0.05);
  }
}
