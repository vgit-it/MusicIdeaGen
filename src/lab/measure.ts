// Measuring a sung note (the scale check, scripts/fof-scale.ts and the voice creator's Scale check tab): its
// level as heard, and how much of its sound is the plain fundamental (a high share: a thin, whistling or humming note).

import { FOF_RATE } from '../audio/fof';

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** In-place radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + xr; im[i + k] = ui + xi; re[i + k + len / 2] = ur - xr; im[i + k + len / 2] = ui - xi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/** Level (dB) and the fundamental's share (0-1) of the harmonic energy up to 5 kHz, over the steady part of a note. */
export function measure(a: Float32Array, f0: number, at: number) {
  const n = 16384, s0 = Math.round(at * FOF_RATE);
  const re = new Float64Array(n), im = new Float64Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n), x = a[s0 + i] ?? 0; re[i] = x * w; im[i] = 0; e += x * x; }
  fft(re, im);
  const bin = FOF_RATE / n, pw = (k: number) => re[k] ** 2 + im[k] ** 2;
  // (A-weighted level: how loud the ear hears it, the bass notes' fundamental counting for little)
  const aw = (f: number) => { const f2 = f * f; return (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); };
  let ap = 0;
  for (let k = 1; k < n / 2; k++) ap += pw(k) * aw(k * bin) ** 2;
  let h1 = 0, tot = 0;
  for (let h = 1; h * f0 < 5000; h++) {
    let p = 0;
    const lo = Math.floor((h * f0 * 0.965) / bin), hi = Math.ceil((h * f0 * 1.035) / bin);
    for (let k = lo; k <= hi; k++) p += pw(k);
    tot += p;
    if (h === 1) h1 = p;
  }
  // (noise: the power per bin between the first ten harmonics against on them; a clean tone is 25 dB or more)
  let on = 0, onN = 0, off = 0, offN = 0;
  for (let h = 1; h <= 10; h++) {
    for (let k = Math.floor((h * f0 * 0.965) / bin); k <= Math.ceil((h * f0 * 1.035) / bin); k++) { on += pw(k); onN++; }
    for (let k = Math.ceil(((h + 0.3) * f0) / bin); k <= Math.floor(((h + 0.7) * f0) / bin); k++) { off += pw(k); offN++; }
  }
  // (hiss: the power above 5 kHz, against the whole, dB; a sung vowel is about -35 or lower)
  let hf = 0, all = 0, mid = 0;
  for (let k = 1; k < n / 2; k++) { const q = pw(k); all += q; if (k * bin > 5000) hf += q; else if (k * bin > 2000) mid += q; }
  const bite = 10 * Math.log10((mid + 1e-12) / (all + 1e-12));
  const hiss = 10 * Math.log10((hf + 1e-12) / (all + 1e-12));
  const hnr = 10 * Math.log10((on / Math.max(1, onN) + 1e-12) / (off / Math.max(1, offN) + 1e-12));
  return { db: 10 * Math.log10(e / n + 1e-12), a: 10 * Math.log10(ap + 1e-12), h1: h1 / (tot + 1e-12), hnr, hiss, bite };
}

/** Each harmonic's level (dB, relative to the loudest) of a note's steady part, up to `top` Hz: for a bar chart of what a voice does to a note. */
export function harmonics(a: Float32Array, f0: number, at: number, top = 5000): number[] {
  const n = 16384, s0 = Math.round(at * FOF_RATE);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = (a[s0 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)); im[i] = 0; }
  fft(re, im);
  const bin = FOF_RATE / n, out: number[] = [];
  for (let h = 1; h * f0 < top; h++) {
    let p = 0;
    for (let k = Math.floor((h * f0 * 0.965) / bin); k <= Math.ceil((h * f0 * 1.035) / bin); k++) p += re[k] ** 2 + im[k] ** 2;
    out.push(10 * Math.log10(p + 1e-12));
  }
  const peak = Math.max(...out);
  return out.map((x) => x - peak);
}
