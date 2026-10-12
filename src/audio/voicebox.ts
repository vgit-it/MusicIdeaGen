// The voice box: the engine behind the raspy and deep voices (docs/VOICES.md). The vocal tract is
// Klatt's (cascade and parallel formant filters, ported from klatt-syn: MIT, (c) 2019 Christian
// d'Heureuse), so the consonants are made as before; the sound source is new: the vocal folds' pulse
// by the LF model (Liljencrants-Fant), shaped by one dial, Rd, from pressed (a belt, low Rd) to lax and
// breathy (head voice, falsetto: high Rd), made period by period with a singer's own roughness (jitter,
// shimmer) and their false folds (a growl: every other cycle softer and longer, an undertone below the
// note; and an uneven, harsh edge), and breath noise on each pulse.
// Same frame parameters as klatt-syn's, plus the source's own (VoiceFrame). Seeded: a line sounds the
// same every time it's sung.

import type { FrameParms } from 'klatt-syn';

export interface VoiceFrame extends FrameParms {
  /** The pulse's shape: 0.3 (pressed, bright) to 2.7 (lax, breathy, nearly a sine). */
  rd: number;
  /** Cycle-to-cycle roughness: pitch (fraction) and level (fraction). */
  jitter: number;
  shimmer: number;
  /** False folds: 0-1, every other cycle softer and longer (an undertone an octave down). */
  sub: number;
  /** 0-1: an uneven, harsh edge (the false folds vibrating irregularly). */
  harsh: number;
  /**
   * Other registers mixed in (up to two): the same folds' cycles, in step, each through its own
   * vocal-tract setting with its own pulse shape and brightness, at its share (0-1; the frame's own
   * register gets what's left). One voice carrying several registers' sound at once: e.g. a deep chest
   * register under a mid one, or a belt's ringing vowel over them near the top.
   */
  layers?: { w: number; rd: number; tilt: number; formants: number[]; bws: number[] }[];
}

/* ---- the LF pulse: one period's shape per Rd, made once */

const RD_MIN = 0.3, RD_MAX = 2.7, RD_STEP = 0.05, SHAPE_N = 1024;
let shapes: Float32Array[] | null = null;

/**
 * The glottal flow derivative over one period (0-1) for an Rd (Fant 1995: Rd to the LF timing; the
 * return phase's constant and the open phase's growth solved so no air is left over each cycle).
 * Normalized: its sharp negative peak (the folds closing) is -1.
 */
function lfShape(rd: number): Float32Array {
  const ra = (-1 + 4.8 * rd) / 100;
  const rk = (22.4 + 11.8 * rd) / 100;
  const rg = (0.25 * rk) / ((0.11 * rd) / (0.5 + 1.2 * rk) - ra);
  const tp = 1 / (2 * rg), te = Math.min(0.95, tp * (1 + rk)), ta = Math.max(0.002, ra);
  // the return phase: e * ta = 1 - exp(-e * (1 - te))
  let eps = 1 / ta;
  for (let i = 0; i < 40; i++) eps = (1 - Math.exp(-eps * (1 - te))) / ta;
  const wg = Math.PI / tp;
  const ret = (t: number) => -(Math.exp(-eps * (t - te)) - Math.exp(-eps * (1 - te))) / (eps * ta);
  // the open phase's growth (alpha), so the flow returns to where it started
  const M = 4096;
  const area = (alpha: number) => {
    const e0 = -1 / (Math.exp(alpha * te) * Math.sin(wg * te));
    let a = 0;
    for (let i = 0; i < M; i++) {
      const t = (i + 0.5) / M;
      a += t < te ? e0 * Math.exp(alpha * t) * Math.sin(wg * t) : ret(t);
    }
    return a;
  };
  let lo = -50, hi = 200;
  const sLo = Math.sign(area(lo));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(area(mid)) === sLo) lo = mid; else hi = mid;
  }
  const alpha = (lo + hi) / 2;
  const e0 = -1 / (Math.exp(alpha * te) * Math.sin(wg * te));
  const out = new Float32Array(SHAPE_N + 1);
  for (let i = 0; i <= SHAPE_N; i++) {
    const t = i / SHAPE_N;
    out[i] = t < te ? e0 * Math.exp(alpha * t) * Math.sin(wg * t) : ret(t);
  }
  return out;
}

function lfShapes(): Float32Array[] {
  if (!shapes) {
    shapes = [];
    for (let rd = RD_MIN; rd <= RD_MAX + 1e-9; rd += RD_STEP) shapes.push(lfShape(rd));
  }
  return shapes;
}

/** Where the folds close (the end of the open phase) for an Rd, as a fraction of the period. */
function openPart(rd: number): number {
  const ra = (-1 + 4.8 * rd) / 100, rk = (22.4 + 11.8 * rd) / 100;
  const rg = (0.25 * rk) / ((0.11 * rd) / (0.5 + 1.2 * rk) - ra);
  return Math.min(0.95, (1 / (2 * rg)) * (1 + rk));
}

/* ---- seeded noise */

function seeded(seed: number) {
  let a = (seed * 2654435761 + 7) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- the filters (as klatt-syn's) */

const dbToLin = (db: number) => (db <= -99 || Number.isNaN(db) ? 0 : 10 ** (db / 20));

class LpFilter1 {
  private a = 1; private b = 0; private y1 = 0; private pass = true;
  constructor(private rate: number) {}
  set(f: number, g: number, extraGain = 1) {
    const w = (2 * Math.PI * f) / this.rate;
    const q = (1 - g ** 2 * Math.cos(w)) / (1 - g ** 2);
    this.b = q - Math.sqrt(q ** 2 - 1);
    this.a = (1 - this.b) * extraGain;
    this.pass = false;
  }
  setPassthrough() { this.pass = true; this.y1 = 0; }
  step(x: number) {
    if (this.pass) return x;
    const y = this.a * x + this.b * this.y1;
    this.y1 = y;
    return y;
  }
}

class Resonator {
  private a = 1; private b = 0; private c = 0; private r = 0; private y1 = 0; private y2 = 0;
  private pass = true; private muted = false;
  constructor(private rate: number) {}
  set(f: number, bw: number) {
    this.r = Math.exp((-Math.PI * bw) / this.rate);
    const w = (2 * Math.PI * Math.min(f, this.rate / 2 - 1)) / this.rate;
    this.c = -(this.r ** 2);
    this.b = 2 * this.r * Math.cos(w);
    this.a = 1 - this.b - this.c;
    this.pass = false; this.muted = false;
  }
  setPassthrough() { this.pass = true; this.muted = false; this.y1 = this.y2 = 0; }
  setMute() { this.pass = false; this.muted = true; this.y1 = this.y2 = 0; }
  peakGain(g: number) { this.a = g * (1 - this.r); }
  step(x: number) {
    if (this.pass) return x;
    if (this.muted) return 0;
    const y = this.a * x + this.b * this.y1 + this.c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

class AntiResonator {
  private a = 1; private b = 0; private c = 0; private x1 = 0; private x2 = 0; private pass = true;
  constructor(private rate: number) {}
  set(f: number, bw: number) {
    const r = Math.exp((-Math.PI * bw) / this.rate);
    const w = (2 * Math.PI * f) / this.rate;
    const c0 = -(r * r), b0 = 2 * r * Math.cos(w), a0 = 1 - b0 - c0;
    if (a0 === 0) { this.a = this.b = this.c = 0; return; }
    this.a = 1 / a0; this.b = -b0 / a0; this.c = -c0 / a0;
    this.pass = false;
  }
  setPassthrough() { this.pass = true; this.x1 = this.x2 = 0; }
  step(x: number) {
    if (this.pass) return x;
    const y = this.a * x + this.b * this.x1 + this.c * this.x2;
    this.x2 = this.x1;
    this.x1 = x;
    return y;
  }
}

/** Low-passed white noise (Klatt's aspiration and frication source). */
class Noise {
  private lp: LpFilter1;
  constructor(rate: number, private rnd: () => number) {
    const oldB = 0.75, f = 1000;
    const g = (1 - oldB) / Math.sqrt(1 - 2 * oldB * Math.cos((2 * Math.PI * f) / 10000) + oldB ** 2);
    this.lp = new LpFilter1(rate);
    this.lp.set(f, g, 2.5 * (rate / 10000) ** 0.33);
  }
  next() { return this.lp.step(this.rnd() * 2 - 1); }
}

/* ---- the generator */

/** How the voice box runs: its pulse (the LF model, or Klatt's own, as klatt-syn's), and Klatt's output low-pass on or off. */
export interface VoiceBoxOptions {
  pulse?: 'lf' | 'klatt';
  outLp?: boolean;
  /** No nasal pole and zero at all (m, n, ng made by the mouth's formants alone). */
  noNasal?: boolean;
}

export class VoiceBox {
  private rnd: () => number;
  private fr!: VoiceFrame;
  private next: VoiceFrame | null = null;
  private tilt: LpFilter1;
  private outLp: Resonator;
  private aspC: Noise; private aspP: Noise; private fric: Noise;
  private nasalC: Resonator; private antiC: AntiResonator; private oralC: Resonator[];
  private nasalP: Resonator; private oralP: Resonator[];
  private diffX1 = 0;
  private lin = { breath: 0, gain: 1, voiceC: 0, aspC: 0, voiceP: 0, aspP: 0, fric: 0, bypass: 0 };
  /** Where the levels are heading: they glide there over a few milliseconds (a step in level clicks). */
  private to = { voiceC: 0, aspC: 0, voiceP: 0, aspP: 0, fric: 0, bypass: 0 };
  private glide: number;
  /** The noise branch is still sounding (it fades out through its last formants). */
  private parOn = false;
  // the period now sounding
  private pos = 0; private len = 0; private open = 0; private amp = 1; private rd = 1;
  private odd = false; private abs = 0; private flutterT: number;
  /** The false folds' irregular wobble (smoothed noise, period by period). */
  private wobble = 0;
  /** The other registers: each its tract, its pulse's brightness filter, its pulse shape and its share (eased). */
  private lay: { oral: Resonator[]; tilt: LpFilter1; rd: number; w: number; to: number }[];
  /** The nasal pole and zero now (eased toward each frame's, so a nasal consonant doesn't click in and out). */
  private nasF = 0; private antiF = 0;

  // (Klatt's pulse: its slope and curve this period)
  private ka = 0; private kb = 0; private kx = 0;

  constructor(private rate: number, seed: number, private opts: VoiceBoxOptions = {}) {
    this.rnd = seeded(seed);
    this.glide = 1 - Math.exp(-1 / (0.003 * rate));
    this.flutterT = this.rnd() * 1000;
    this.tilt = new LpFilter1(rate);
    this.lay = [0, 1].map(() => ({ oral: Array.from({ length: 9 }, () => new Resonator(rate)), tilt: new LpFilter1(rate), rd: 1, w: 0, to: 0 }));
    this.outLp = new Resonator(rate);
    this.outLp.set(0, rate / 2);
    this.aspC = new Noise(rate, this.rnd);
    this.aspP = new Noise(rate, this.rnd);
    this.fric = new Noise(rate, this.rnd);
    this.nasalC = new Resonator(rate);
    this.antiC = new AntiResonator(rate);
    // (up to 9 in the cascade: Klatt's 6, and up to 3 more above 5 kHz at the higher sample rate, so the top isn't cut off)
    this.oralC = Array.from({ length: 9 }, () => new Resonator(rate));
    this.nasalP = new Resonator(rate);
    this.oralP = Array.from({ length: 6 }, () => new Resonator(rate));
    lfShapes();
  }

  /** Roughly bell-shaped noise, -1.5 to 1.5. */
  private gauss() { return this.rnd() + this.rnd() + this.rnd() - 1.5; }

  generateFrame(fr: VoiceFrame, out: Float64Array) {
    this.next = fr;
    for (let i = 0; i < out.length; i++) {
      if (!this.fr || this.pos >= this.len) this.startPeriod();
      out[i] = this.sample();
      this.pos++;
      this.abs++;
    }
  }

  private startPeriod() {
    if (this.next) { this.fr = this.next; this.next = null; this.useFrame(); }
    const fr = this.fr;
    // the singer's slow flutter (as Klatt's), then this cycle's own roughness
    const w = 2 * Math.PI * (this.abs / this.rate + this.flutterT);
    let f0 = fr.f0 * (1 + ((Math.sin(12.7 * w) + Math.sin(7.1 * w) + Math.sin(4.7 * w)) * fr.flutterLevel) / 50);
    if (f0 <= 0) { this.len = 1; this.open = 0; this.pos = 0; this.amp = 0; return; }
    f0 *= 1 + fr.jitter * this.gauss();
    let amp = 1 + fr.shimmer * this.gauss();
    // the false folds: every other cycle longer and softer (an undertone), and an irregular edge
    this.odd = !this.odd;
    if (fr.sub > 0) {
      f0 *= this.odd ? 1 - 0.07 * fr.sub : 1 + 0.07 * fr.sub;
      if (this.odd) amp *= 1 - 0.65 * fr.sub;
    }
    if (fr.harsh > 0) {
      this.wobble += (this.gauss() - this.wobble) * 0.5;
      // (rough, not cracking: the level never dips too far)
      amp *= Math.max(0.45, 1 + 0.4 * fr.harsh * this.wobble);
    }
    this.rd = Math.max(RD_MIN, Math.min(RD_MAX, fr.rd + (fr.harsh > 0 ? 0.25 * fr.harsh * this.gauss() : 0)));
    this.lay.forEach((l, i) => { l.rd = Math.max(RD_MIN, Math.min(RD_MAX, fr.layers?.[i]?.rd ?? fr.rd)); });
    this.len = Math.max(2, Math.round(this.rate / f0));
    if (this.opts.pulse === 'klatt') {
      // klatt-syn's natural pulse (KLGLOTT88): a falling slope over the open phase
      this.open = Math.round(this.len * fr.openPhaseRatio);
      this.kb = -5 / this.open ** 2;
      this.ka = (-this.kb * this.open) / 3;
      this.kx = 0;
    } else this.open = Math.round(this.len * openPart(this.rd));
    this.amp = amp;
    this.pos = 0;
  }

  /** This period's pulse at its current position (the two nearest Rd shapes, blended). */
  private pulse(): number {
    if (!this.amp) return 0;
    if (this.opts.pulse === 'klatt') {
      if (this.pos >= this.open) return 0;
      this.ka += this.kb;
      this.kx += this.ka;
      return this.amp * this.kx;
    }
    return this.shapeAt(this.rd);
  }

  /** The LF pulse for an Rd at this period's position. */
  private shapeAt(rd: number): number {
    if (!this.amp) return 0;
    const S = shapes!;
    const k = (rd - RD_MIN) / RD_STEP;
    const i0 = Math.min(S.length - 2, Math.floor(k)), fk = k - i0;
    const x = (this.pos / this.len) * SHAPE_N;
    const j = Math.min(SHAPE_N - 1, Math.floor(x)), fx = x - j;
    const a = S[i0][j] + (S[i0][j + 1] - S[i0][j]) * fx;
    const b = S[i0 + 1][j] + (S[i0 + 1][j + 1] - S[i0 + 1][j]) * fx;
    // (scaled to Klatt's natural pulse, so the consonant levels set for it still fit)
    return 0.83 * this.amp * (a + (b - a) * fk);
  }

  private sample(): number {
    const fr = this.fr, L = this.lin, T = this.to, g = this.glide;
    L.voiceC += (T.voiceC - L.voiceC) * g;
    L.aspC += (T.aspC - L.aspC) * g;
    L.voiceP += (T.voiceP - L.voiceP) * g;
    L.aspP += (T.aspP - L.aspP) * g;
    L.fric += (T.fric - L.fric) * g;
    L.bypass += (T.bypass - L.bypass) * g;
    let voice = this.tilt.step(this.pulse());
    if (this.pos < this.open) voice += (this.rnd() * 2 - 1) * L.breath;
    const late = this.pos >= this.len / 2;
    // cascade: voice and breath through the tract
    let v = voice * L.voiceC + this.aspC.next() * L.aspC * (1 - (late ? fr.cascadeAspirationMod : 0));
    v = this.nasalC.step(this.antiC.step(v));
    const oc = this.oralC;
    for (let k = 0; k < oc.length; k++) v = oc[k].step(v);
    // the other registers, in step with this one, mixed in at their shares
    // (plain loops: this runs for every sample)
    let others = 0, share = 0;
    for (let i = 0; i < this.lay.length; i++) {
      const l = this.lay[i];
      l.w += (l.to - l.w) * g;
      if (l.w < 1e-4 && !l.to) continue;
      const p2 = this.opts.pulse === 'klatt' ? voice : l.tilt.step(this.shapeAt(l.rd));
      let v2 = p2 * L.voiceC;
      const lo = l.oral;
      for (let k = 0; k < lo.length; k++) v2 = lo[k].step(v2);
      others += l.w * v2;
      share += l.w;
    }
    if (share) v = (1 - share) * v + others;
    let out = fr.cascadeEnabled ? v : 0;
    // parallel: the noise of consonants through their own formants
    if (fr.parallelEnabled) this.parOn = true;
    else if (this.parOn && L.fric + L.aspP + L.bypass + L.voiceP < 1e-6) this.parOn = false;
    if (this.parOn) {
      const src = voice * L.voiceP + this.aspP.next() * L.aspP * (1 - (late ? fr.parallelAspirationMod : 0));
      const diff = src - this.diffX1;
      this.diffX1 = src;
      const src2 = diff + this.fric.next() * L.fric * (1 - (late ? fr.fricationMod : 0));
      let p = this.nasalP.step(src) + this.oralP[0].step(src);
      for (let i = 1; i < 6; i++) p += (i % 2 === 0 ? 1 : -1) * this.oralP[i].step(src2);
      out += p + L.bypass * src2;
    }
    return (this.opts.outLp === false ? out : this.outLp.step(out)) * L.gain;
  }

  private useFrame() {
    const fr = this.fr, L = this.lin, rate = this.rate;
    L.breath = dbToLin(fr.breathinessDb);
    L.gain = dbToLin(fr.gainDb || 0);
    // (no filter is ever switched off and back on mid-line: that resets it, and it clicks)
    this.tilt.set(3000, dbToLin(-Math.max(0.05, fr.tiltDb || 0)));
    this.lay.forEach((l, i) => { l.to = fr.layers?.[i]?.w ?? 0; });
    fr.layers?.forEach((ly, i) => {
      const l = this.lay[i];
      if (!l) return;
      l.tilt.set(3000, dbToLin(-Math.max(0.05, ly.tilt)));
      l.oral.forEach((r, k) => { const f = ly.formants[k], bw = ly.bws[k]; if (f && bw) r.set(f, bw); });
    });
    const T = this.to;
    T.voiceC = dbToLin(fr.cascadeVoicingDb);
    T.aspC = dbToLin(fr.cascadeAspirationDb);
    if (this.opts.noNasal) { /* left as passthrough */ } else if (fr.nasalFormantFreq && fr.nasalFormantBw) {
      this.nasF = this.nasF ? this.nasF + (fr.nasalFormantFreq - this.nasF) * 0.5 : fr.nasalFormantFreq;
      this.nasalC.set(this.nasF, fr.nasalFormantBw);
    }
    if (this.opts.noNasal) { /* left as passthrough */ } else if (fr.nasalAntiformantFreq && fr.nasalAntiformantBw) {
      this.antiF = this.antiF ? this.antiF + (fr.nasalAntiformantFreq - this.antiF) * 0.5 : fr.nasalAntiformantFreq;
      this.antiC.set(this.antiF, fr.nasalAntiformantBw);
    }
    this.oralC.forEach((r, i) => {
      const f = fr.oralFormantFreq[i], bw = fr.oralFormantBw[i];
      // (a formant a frame leaves out keeps its last setting)
      if (f && bw) r.set(f, bw);
    });
    T.voiceP = dbToLin(fr.parallelVoicingDb);
    T.aspP = dbToLin(fr.parallelAspirationDb);
    T.fric = dbToLin(fr.fricationDb);
    T.bypass = dbToLin(fr.parallelBypassDb);
    // (frames without consonant noise leave the noise formants as they were, to fade out through)
    if (!fr.parallelEnabled) return;
    if (fr.nasalFormantFreq && fr.nasalFormantBw && dbToLin(fr.nasalFormantDb)) {
      this.nasalP.set(fr.nasalFormantFreq, fr.nasalFormantBw);
      this.nasalP.peakGain(dbToLin(fr.nasalFormantDb));
    } else this.nasalP.setMute();
    this.oralP.forEach((r, i) => {
      const f = fr.oralFormantFreq[i], bw = fr.oralFormantBw[i], g = dbToLin(fr.oralFormantDb[i]);
      if (f && bw && g) {
        r.set(f, bw);
        const diffGain = Math.sqrt(2 - 2 * Math.cos((2 * Math.PI * f) / rate));
        r.peakGain(i >= 1 ? g / diffGain : g);
      } else r.setMute();
    });
  }
}
