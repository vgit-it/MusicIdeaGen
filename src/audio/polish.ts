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
  constructor(type: 'lowpass' | 'highpass' | 'bandpass', f: number, q: number, rate: number) {
    const w = (2 * Math.PI * f) / rate, cw = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
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

/** A tube preamp: a gentle, uneven saturation, its offset taken out again. */
function tube(a: Float32Array, rate: number, peak: number) {
  const drive = 1.2 / peak;
  const hp = new Biquad('highpass', 25, 0.7, rate);
  for (let i = 0; i < a.length; i++) {
    const x = a[i] * drive;
    a[i] = hp.run(Math.tanh(x + 0.18 * x * x) / drive);
  }
}

/** An opto compressor: smooth, quick to let go after short peaks and slow after long ones. */
function opto(a: Float32Array, rate: number, ref: number) {
  const thr = ref * db(-7), ratio = 3;
  const kAtt = coef(0.012, rate), kFast = coef(0.08, rate), kSlow = coef(0.9, rate), kHold = coef(0.5, rate);
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

/** A sung line, polished: cleaned up, through the tube preamp and the opto compressor, back at its level. */
export function polishVoice(pcm: Float32Array, rate: number): Float32Array {
  const a = pcm.slice();
  const before = levels(a);
  if (before.best <= 0) return a;
  declick(a, rate);
  tame(a, rate);
  tube(a, rate, before.peak);
  opto(a, rate, levels(a).best);
  const after = levels(a);
  if (after.best <= 0 || after.peak <= 0) return a;
  const g = Math.min(before.best / after.best, 0.95 / after.peak);
  for (let i = 0; i < a.length; i++) a[i] *= g;
  return a;
}
