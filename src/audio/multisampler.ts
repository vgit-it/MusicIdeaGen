// Plays multi-sampled instruments: velocity layers, round robins and repitching
// from the nearest sampled note, plus slides, vibrato and tiny tuning differences.
// Samples that were measured out of tune are corrected as they play (see scripts/measure-tuning.mjs).

import * as Tone from 'tone';
import { RoundRobin, type SampleSet } from './samples';
import { SampleVoice } from './voice';

export interface Voice {
  src: SampleVoice;
  /** When the note is scheduled to stop (seconds, audio clock). */
  endAt: number;
  /** For legato notes on the same string: the sample's own note, tuning offset (cents) and length. */
  root?: number;
  tune?: number;
  len?: number;
  /** When it started, and its playback rate now. */
  at?: number;
  rate?: number;
  /** Its pitch can be moved from here on (a vibrato curve can't be interrupted). */
  free?: number;
}

export interface PlayOptions {
  release?: number;
  /** Start this many semitones away and glide onto the note. */
  slide?: number;
  /** Bend up into the note from this many semitones below. */
  bend?: number;
  /** Slide off the end of the note, down this many semitones. */
  fall?: number;
  /** The next note comes legato out of this one (keep its pitch free for it). */
  tied?: boolean;
  /** Vibrato depth in cents on held notes (0 = none). */
  vibrato?: number;
  /** Random tuning spread in cents (strings are never perfectly in tune). */
  detune?: number;
  /** Fade-in time in seconds (volume swell). */
  fadeIn?: number;
  /** Start this far (seconds) into the sample, past its attack. */
  offset?: number;
  /** Always play this velocity layer (0 = softest), whatever the velocity. */
  layer?: number;
}

/** How the hand moves to a legato note on the same string. */
export type LegatoMove = 'hammer' | 'pull' | 'slide';

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
    const li = opts.layer !== undefined ? Math.min(opts.layer, layers.length - 1) : this.layerFor(vel, layers.length);
    const slot = `${ni}:${li}`;
    const taken = this.partner?.lastBuf.get(slot);
    const pool = taken && layers[li].length > 1 ? layers[li].filter((b) => b !== taken) : layers[li];
    const buf = this.rr.pick(slot, pool);
    this.lastBuf.set(slot, buf);

    const cents = opts.detune ? (Math.random() - 0.5) * 2 * opts.detune : 0;
    // a sample measured out of tune is played back in tune
    const tuning = this.set.tuning.get(buf);
    const rate = 2 ** ((midi - notes[ni]) / 12 + (cents - (tuning?.settle ?? 0)) / 1200);
    const offset = opts.offset ?? 0;
    const v = this.start(buf, time, dur, (0.3 + 0.7 * vel) ** 1.5, rate, opts.release ?? this.release, opts.fadeIn, offset);
    Object.assign(v, { root: notes[ni], tune: cents - (tuning?.settle ?? 0), len: buf.duration - offset, at: time, rate, free: 0 });
    const pr = v.src.playbackRate;
    const bend = opts.bend ?? 0;
    // (a bend gets up to pitch quickly: a slow one sounds out of tune)
    const settle = opts.slide ? time + 0.07 + Math.abs(opts.slide) * 0.03 : bend ? time + 0.05 + bend * 0.025 : time;
    // vibrato fades in after the note has spoken, like a player's wrist
    const vibStart = Math.max(settle, time + 0.28);
    const until = this.pitchEnd(time + dur, settle, opts);
    const vibrato = !!opts.vibrato && Math.min(until, time + dur) - 0.003 - vibStart > 0.25;
    if (opts.slide) {
      pr.setValueAtTime(rate * 2 ** (opts.slide / 12), time);
      pr.linearRampToValueAtTime(rate, settle);
    } else if (bend) {
      // picked a step or two flat, then pushed up to the note
      const low = rate * 2 ** (-bend / 12);
      pr.setValueAtTime(low, time);
      pr.setValueAtTime(low, time + 0.02);
      pr.linearRampToValueAtTime(rate, settle);
    } else if (tuning?.curve.length && !offset) this.untwang(pr, tuning.curve, time, rate, Math.min(vibrato ? vibStart : Infinity, until));
    this.tail(v, rate, vibStart, time + dur, opts);
    return v;
  }

  /** Until when the note's own pitch moves may run (a tie or a fall-off takes over after). */
  private pitchEnd(end: number, from: number, o: PlayOptions) {
    return o.tied ? end - 0.045 : o.fall ? Math.max(from, end - Math.min(0.18, (end - from) * 0.5)) : Infinity;
  }

  /** A held note's vibrato (from `from`) and fall-off (at its end, `end`). */
  private tail(v: Voice, rate: number, from: number, end: number, o: PlayOptions) {
    const pr = v.src.playbackRate;
    const until = Math.min(this.pitchEnd(end, from, o), end) - 0.003;
    const len = until - from;
    if (o.vibrato && len > 0.25) {
      const hz = 4.8 + Math.random() * 1.2;
      const n = Math.max(16, Math.ceil(len * 120));
      const curve: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) * len;
        const depth = o.vibrato * Math.min(1, t / 0.35);
        curve[i] = rate * 2 ** ((depth * Math.sin(2 * Math.PI * hz * t)) / 1200);
      }
      pr.setValueCurveAtTime(curve, from, len);
      v.free = until + 0.001;
    }
    if (o.fall && !o.tied) {
      // the finger slides down the string as the note is let go
      const f0 = Math.max(v.free ?? 0, until);
      pr.setValueAtTime(rate, f0);
      pr.exponentialRampToValueAtTime(rate * 2 ** (-o.fall / 12), end + 0.06);
    }
  }

  /** Can `v` (still ringing) move on to `midi` without a new pick, for `dur` more seconds? */
  canLegato(v: Voice | undefined, midi: number, time: number, dur: number): v is Voice {
    if (!v || v.root === undefined || v.endAt < time - 0.005 || Math.abs(midi - v.root) > 9) return false;
    const rate = 2 ** ((midi - v.root) / 12 + v.tune! / 1200);
    // enough of the sample left to ring through the new note
    return (time - v.at!) * v.rate! + dur * rate < v.len! - 0.15;
  }

  /**
   * A legato note: the same string keeps ringing and changes pitch (hammer-on, pull-off, slide),
   * instead of a new pick. Call canLegato first.
   */
  legato(v: Voice, midi: number, time: number, dur: number, move: LegatoMove, o: PlayOptions = {}) {
    const rate = 2 ** ((midi - v.root!) / 12 + v.tune! / 1200);
    const semis = Math.abs(12 * Math.log2(rate / v.rate!));
    const pr = v.src.playbackRate;
    // a slide starts a little before the note lands; a hammer-on or pull-off is instant
    const glide = move === 'slide' ? Math.min(0.12, 0.035 + 0.012 * semis) : 0.005;
    const from = Math.max(v.free ?? 0, move === 'slide' ? time - glide * 0.6 : time);
    pr.cancelScheduledValues(from);
    pr.setValueAtTime(v.rate!, from);
    pr.exponentialRampToValueAtTime(rate, from + glide);
    v.rate = rate;
    v.free = 0;
    // a hammer-on taps the string, a pull-off plucks it a little
    v.src.hold(from, time + dur, move === 'pull' ? 1.2 : move === 'hammer' ? 1.08 : 1);
    v.endAt = time + dur;
    this.tail(v, rate, Math.max(from + glide, time + 0.28), time + dur, o);
  }

  /**
   * A plucked string starts sharp and falls into pitch (distortion turns that into a bend on every
   * note): follow the sample's measured start with the opposite pitch, back to `rate` by `until`.
   */
  private untwang(pr: AudioParam, curve: [number, number][], time: number, rate: number, until: number) {
    // (the sample's own time runs faster or slower when it's repitched)
    const at = (t: number) => time + t / rate;
    const end = Math.min(at(curve[curve.length - 1][0] + 0.3), until - 0.01);
    pr.setValueAtTime(rate * 2 ** (-curve[0][1] / 1200), time);
    for (const [t, c] of curve) if (at(t) < end) pr.linearRampToValueAtTime(rate * 2 ** (-c / 1200), at(t));
    pr.linearRampToValueAtTime(rate, end);
  }

  /** Play one of the extra one-shots (e.g. a muted scratch). */
  noise(time: number, vel: number): Voice | null {
    if (!this.set.noises.length) return null;
    const buf = this.rr.pick('noise', this.set.noises);
    return this.start(buf, time, buf.duration, vel, 1, 0.02);
  }

  /** Play any one-shot (e.g. a finger squeak) through this instrument. */
  shot(buf: AudioBuffer, time: number, gain: number) {
    this.start(buf, time, buf.duration, gain, 1, 0.02);
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

  private start(buf: AudioBuffer, time: number, dur: number, gain: number, rate: number, release: number, fadeIn = 0, offset = 0): Voice {
    const src = new SampleVoice(this.ctx, buf, this.out, { rate, fadeIn, fadeOut: release });
    const voice: Voice = { src, endAt: time + dur };
    src.onended = () => this.active.delete(voice);
    src.start(time, gain, offset);
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

  /** Stop every voice (at `time`, or now). */
  stopAll(time = this.ctx.now()) {
    for (const v of this.active) this.choke(v, time, 0.05);
  }
}
