// The voice's polish: a sung line's clean-up and vocal chain, run once over its rendered audio when
// the sound is prepared (the Prepare button, with the real amps), the way an engineer would treat a
// recorded vocal. Paul: "start with 1 and 2" (a vocal chain for warmth and glue; a clean-up pass).
// No capture of a studio vocal chain was found among the Neural Amp Modeler collection the amps come
// from (guitar gear only), so the chain is our own, modelled on the classic one:
//   1. clean-up: clicks and crackle (single-sample spikes) smoothed over; the fizz above 7 kHz held
//      down when it flares; esses (5-9 kHz) tamed when they stick out over the voice
//   2. a tube preamp: a gentle, uneven saturation (warmth: mostly the 2nd harmonic)
//   3. an opto compressor (LA-2A-like): slow and smooth, a release that's quick after short peaks and
//      slow after long ones, about 3-5 dB off the loudest notes (the glue: an even, close vocal)
// then the line is brought back to its level (as the singer's renders are).

class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(type: 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'highshelf', f: number, q: number, rate: number, gainDb = 0) {
    const w = (2 * Math.PI * f) / rate, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
    if (type === 'peaking' || type === 'highshelf') {
      const A = 10 ** (gainDb / 40);
      let b0, b1, b2, a0, a1, a2;
      if (type === 'peaking') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
      else {
        const k = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * cw + k); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - k);
        a0 = A + 1 - (A - 1) * cw + k; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - k;
      }
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
      return;
    }
    const a0 = 1 + al;
    if (type === 'lowpass') { this.b0 = (1 - cw) / 2; this.b1 = 1 - cw; this.b2 = (1 - cw) / 2; }
    else if (type === 'highpass') { this.b0 = (1 + cw) / 2; this.b1 = -(1 + cw); this.b2 = (1 + cw) / 2; }
    else { this.b0 = al; this.b1 = 0; this.b2 = -al; }
    this.b0 /= a0; this.b1 /= a0; this.b2 /= a0; this.a1 = (-2 * cw) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const coef = (sec: number, rate: number) => 1 - Math.exp(-1 / (sec * rate));
const db = (x: number) => 10 ** (x / 20);

/** Clicks and crackle: a sample far off the line its neighbours draw (against the local roughness) is put back on it. */
function declick(a: Float32Array, rate: number) {
  let rough = 0;
  const k = coef(0.005, rate);
  let fixed = 0;
  for (let i = 2; i < a.length - 2; i++) {
    const d = Math.abs(a[i] - (a[i - 1] + a[i + 1]) / 2);
    if (rough > 1e-6 && d > 9 * rough && d > 0.02) {
      // (over two samples, from the ones either side)
      const p = a[i - 2], n = a[i + 2];
      a[i - 1] = p + (n - p) * 0.25; a[i] = p + (n - p) * 0.5; a[i + 1] = p + (n - p) * 0.75;
      fixed++;
      continue;
    }
    rough += (d - rough) * k;
  }
  return fixed;
}

/** The voice's top end: the fizz above 7 kHz and the esses (5-9 kHz) held down where they stick out. */
function tame(a: Float32Array, rate: number) {
  const lp = new Biquad('lowpass', 7000, 0.7, rate);
  const ess = new Biquad('bandpass', 6800, 1.1, rate);
  const kA = coef(0.002, rate), kR = coef(0.06, rate), kE = coef(0.01, rate);
  let eAll = 1e-6, eHi = 0, eEss = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const lo = lp.run(x), hi = x - lo, s = ess.run(x);
    eAll += (x * x - eAll) * kE;
    const h2 = hi * hi, s2 = s * s;
    eHi += (h2 - eHi) * (h2 > eHi ? kA : kR);
    eEss += (s2 - eEss) * (s2 > eEss ? kA : kR);
    // (the fizz: always a little down, more when over -14 dB of the voice)
    const hiOver = Math.sqrt(eHi / eAll) / db(-14);
    const gHi = 0.85 / Math.max(1, hiOver ** 0.6);
    // (an ess: over -8 dB of the voice in its band, brought down toward it)
    const essOver = Math.sqrt(eEss / eAll) / db(-8);
    const cut = essOver > 1 ? 1 - 1 / essOver ** 0.5 : 0;
    a[i] = lo + hi * gHi - s * cut * 0.8;
  }
}

/** A tube preamp: a gentle, uneven saturation, its offset taken out again (`hot`: driven harder, tape-like). */
function tube(a: Float32Array, rate: number, peak: number, hot = 1) {
  const drive = (1.2 * hot) / peak;
  const hp = new Biquad('highpass', 25, 0.7, rate);
  for (let i = 0; i < a.length; i++) {
    const x = a[i] * drive;
    a[i] = hp.run(Math.tanh(x + 0.18 * x * x) / drive);
  }
}

/** An opto compressor: smooth, quick to let go after short peaks and slow after long ones. */
function opto(a: Float32Array, rate: number, ref: number, under = 7, ratio = 3, att = 0.012, fast = 0.08, slow = 0.9) {
  const thr = ref * db(-under);
  const kAtt = coef(att, rate), kFast = coef(fast, rate), kSlow = coef(slow, rate), kHold = coef(0.5, rate);
  let env = 0, gr = 1, held = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    env += (x * x - env) * kAtt;
    const lvl = Math.sqrt(env);
    // (how long it's been pressed: the longer, the slower it lets go, as the opto cell does)
    const over = lvl > thr;
    held += ((over ? 1 : 0) - held) * kHold;
    const want = over ? (thr * (lvl / thr) ** (1 / ratio)) / lvl : 1;
    gr += (want - gr) * (want < gr ? kAtt : kFast + (kSlow - kFast) * held);
    a[i] = x * gr;
  }
}

/** The loudest 46 ms stretch's level (RMS) and the peak. */
function levels(a: Float32Array) {
  const win = 2048;
  let best = 0, peak = 0;
  for (let i = 0; i + win <= a.length; i += win / 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += a[k] * a[k];
    best = Math.max(best, Math.sqrt(e / win));
  }
  for (const x of a) peak = Math.max(peak, Math.abs(x));
  return { best, peak };
}

/**
 * How a genre's vocals are compressed and coloured (Paul: "compressor vocals ... for specific genre"):
 * natural (rock: the opto alone), radio (pop: the opto, then a fast peak compressor, as a 1176 after an
 * LA-2A; bright and loud, up front, with air on top), heavy (hard rock, metal, alt metal: harder and
 * quicker, the voice flat out in front of the guitars), tight (funk: quick and dry, every syllable
 * even), dark (grunge: the opto into tape-like saturation, the top rolled off).
 */
export type VocalComp = 'natural' | 'radio' | 'heavy' | 'tight' | 'dark';
/**
 * An effect on a line, sprinkled (a section of the song, not all of it): telephone (pop: a thin, boxy
 * small speaker, 400 Hz-3.2 kHz, a little drive), megaphone (grunge: a horn, narrower and honky, a
 * resonance at 1.8 kHz, driven hard), radio (alt metal: an old radio, wider, gritty).
 */
export type VocalFx = 'telephone' | 'megaphone' | 'radio';
export interface PolishOpts { comp?: VocalComp; fx?: VocalFx }

/** A small speaker: the band (two filters each side), a resonance, and drive. */
function speaker(a: Float32Array, rate: number, fx: VocalFx, peak: number) {
  const [lo, hi, res, resDb, drive] = fx === 'telephone' ? [400, 3200, 1500, 4, 2] : fx === 'megaphone' ? [600, 4000, 1800, 9, 4.5] : [300, 4500, 1200, 3, 3];
  const f = [new Biquad('highpass', lo, 0.7, rate), new Biquad('highpass', lo, 0.7, rate), new Biquad('lowpass', hi, 0.7, rate), new Biquad('lowpass', hi, 0.7, rate), new Biquad('peaking', res, fx === 'megaphone' ? 2 : 1, rate, resDb)];
  // (the speaker's band again after the drive: its grit stays inside it)
  const post = [new Biquad('lowpass', hi, 0.7, rate), new Biquad('lowpass', hi, 0.7, rate), new Biquad('highpass', lo * 0.8, 0.7, rate)];
  const g = drive / peak;
  for (let i = 0; i < a.length; i++) {
    let x = a[i];
    for (const b of f) x = b.run(x);
    x = Math.tanh(x * g) / g;
    for (const b of post) x = b.run(x);
    a[i] = x;
  }
}

/** A sung line, polished: cleaned up, through the tube preamp and its genre's compression, an effect if it has one, back at its level. */
export function polishVoice(pcm: Float32Array, rate: number, opts: PolishOpts = {}): Float32Array {
  const a = pcm.slice();
  const before = levels(a);
  if (before.best <= 0) return a;
  const comp = opts.comp ?? 'natural';
  declick(a, rate);
  tame(a, rate);
  tube(a, rate, before.peak, comp === 'dark' ? 2 : comp === 'heavy' ? 1.4 : 1);
  if (comp === 'tight') opto(a, rate, levels(a).best, 9, 4, 0.004, 0.05, 0.2);
  else if (comp === 'heavy') opto(a, rate, levels(a).best, 12, 6, 0.006, 0.06, 0.5);
  else opto(a, rate, levels(a).best);
  // (pop: a fast peak compressor after the opto, and air)
  if (comp === 'radio') {
    opto(a, rate, levels(a).best, 6, 4, 0.002, 0.05, 0.12);
    const air = new Biquad('highshelf', 9000, 0.7, rate, 2.5);
    for (let i = 0; i < a.length; i++) a[i] = air.run(a[i]);
  }
  if (comp === 'dark') {
    const lp = new Biquad('lowpass', 8000, 0.7, rate);
    for (let i = 0; i < a.length; i++) a[i] = lp.run(a[i]);
  }
  if (opts.fx) speaker(a, rate, opts.fx, levels(a).peak);
  const after = levels(a);
  if (after.best <= 0 || after.peak <= 0) return a;
  const g = Math.min(before.best / after.best, 0.95 / after.peak);
  for (let i = 0; i < a.length; i++) a[i] *= g;
  return a;
}
