// What's missing for deep voices: his held vowels (Kokoro, new_size84) and ours, compared harmonic by
// harmonic at his pitch: the harmonics' levels (H1, H2, the formant peaks), how deep the valleys between
// formants go, how sharp each pulse is (crest factor), and the tone left over. Variants of the singer test
// suspected causes (lab knobs in fof.ts). Run from the repo root:
//   npx rolldown experiments/kokoro-singer/diag.ts --platform node --format esm -o node_modules/.cache/diag.mjs && node node_modules/.cache/diag.mjs

import { readFileSync } from 'node:fs';
import { FOF_RATE, type FofVoice, type VoicePrint, renderFof } from '../../src/audio/fof';
import type { SungNote } from '../../src/audio/sing';
import { fofFor } from '../../src/audio/voices';
import type { Vowel } from '../../src/parts/lyrics';

const DIR = 'experiments/kokoro-singer/out/print';
const VOICE = 'new_size84';
const spans: Record<string, { t0: number; t1: number; f0: number }> = JSON.parse(readFileSync(`${DIR}/${VOICE}/spans.json`, 'utf8'));
const MONO: Vowel[] = ['IY', 'EH', 'AE', 'AA', 'AO', 'UW', 'AH'];

function readWav(p: string): { x: Float32Array; rate: number } {
  const b = readFileSync(p);
  const rate = b.readUInt32LE(24), n = (b.length - 44) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { x, rate };
}
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(a * k), wi = Math.sin(a * k);
      const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}
/** Each frame's pitch found from its own spectrum near f0, then harmonic levels (dB re the loudest), averaged. */
function harmonics(x: Float32Array, rate: number, t0: number, t1: number, f0: number, H = 40): number[] {
  const N = 8192, hop = 1024;
  const acc = new Float64Array(H);
  let frames = 0;
  for (let s = Math.floor(t0 * rate); s + Math.round(0.06 * rate) <= Math.floor(t1 * rate); s += Math.round(0.01 * rate)) {
    const re = new Float64Array(N), im = new Float64Array(N);
    const W = Math.round(0.06 * rate);
    for (let i = 0; i < W && s + i < x.length; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W));
    fft(re, im);
    const mag = (k: number) => re[k] * re[k] + im[k] * im[k];
    // (the frame's own pitch: the comb of harmonics 1-8 summed, searched about the median)
    let bestF = f0, bestE = -1;
    for (let f = f0 * 0.94; f <= f0 * 1.06; f += 0.1) { let e = 0; for (let h = 1; h <= 8; h++) e += mag(Math.round((h * f * N) / rate)); if (e > bestE) { bestE = e; bestF = f; } }
    for (let h = 1; h <= H; h++) {
      const c = (h * bestF * N) / rate; let m = 0;
      for (let k = Math.floor(c - 2); k <= Math.ceil(c + 2); k++) if (k > 0 && k < N / 2) m = Math.max(m, mag(k));
      acc[h - 1] += m;
    }
    frames++;
  }
  const db = Array.from(acc, (e) => 10 * Math.log10(e / frames + 1e-20));
  const top = Math.max(...db);
  return db.map((d) => d - top);
}
/** Crest factor (peak / rms, dB) per pitch period, median: how sharp the pulses are. */
function crest(x: Float32Array, rate: number, t0: number, t1: number, f0: number): number {
  const P = Math.round(rate / f0), out: number[] = [];
  for (let s = Math.floor(t0 * rate); s + P <= Math.floor(t1 * rate); s += P) {
    let pk = 0, e = 0;
    for (let i = s; i < s + P; i++) { pk = Math.max(pk, Math.abs(x[i])); e += x[i] * x[i]; }
    out.push(20 * Math.log10(pk / Math.sqrt(e / P)));
  }
  out.sort((a, b) => a - b);
  return out[out.length >> 1];
}

const f0 = Object.values(spans).map((s) => s.f0).sort((a, b) => a - b)[Object.keys(spans).length >> 1];
const midi = 69 + 12 * Math.log2(f0 / 440);
const his: Record<string, { h: number[]; c: number }> = {};
for (const v of MONO) {
  const take = (n: number) => { const { x, rate } = readWav(`${DIR}/${VOICE}/${v}-${n}.wav`); const s = spans[`${v}-${n}`]; const a = s.t0 + 0.25 * (s.t1 - s.t0), b = s.t0 + 0.75 * (s.t1 - s.t0); return { h: harmonics(x, rate, a, b, s.f0), c: crest(x, rate, a, b, s.f0) }; };
  const A = take(0), B = take(1);
  his[v] = { h: A.h.map((d, i) => (d + B.h[i]) / 2), c: (A.c + B.c) / 2 };
}

const syl = (vowel: Vowel) => ({ onset: ['HH'], vowel, coda: ['D'], stress: true, text: 'x', wordStart: true }) as unknown as SungNote['syl'];
function ours(v: FofVoice) {
  const o: Record<string, { h: number[]; c: number }> = {};
  for (const w of MONO) {
    const x = renderFof([{ t: 0, end: 0.8, midi, vel: 0.6, syl: syl(w) }], v, 0.3);
    o[w] = { h: harmonics(x, FOF_RATE, 0.55, 0.9, f0), c: crest(x, FOF_RATE, 0.55, 0.9, f0) };
  }
  return o;
}
const print: VoicePrint = JSON.parse(readFileSync(`${DIR}/${VOICE}.json`, 'utf8'));
const base: FofVoice = { ...fofFor('grunge', 17, false, 'deep'), grit: 0, breath: -54, print, tract: 1, size: 1, expr: 0, human: 0.5, vib: 0 };
const matched: FofVoice = { ...base, ...JSON.parse(readFileSync(`${DIR}/${VOICE}-match.json`, 'utf8')), print: JSON.parse(readFileSync(`${DIR}/${VOICE}-matched.json`, 'utf8')), size: 1 };
const VARIANTS: [string, FofVoice][] = [
  ['base', base], ['matched', matched],
  ['base+sharp', { ...base, lab: { tex: 0.4 } }],
  ...[0.4, 0.6, 0.9, 1.2].flatMap((rd): [string, FofVoice][] => [[`cascade rd${rd}`, { ...base, lab: { cascade: { rd } } }], [`cascade rd${rd} bw1`, { ...base, bw: 1, lab: { cascade: { rd } } }]]),
];

// the summary per voice: H1-H2, the deepest valley between F1 and F2 (dB under the lower of the two
// peaks), the levels in bands of harmonics (1-2, 3-5, 6-10, 11-20, 21-40), crest; and the overall
// difference from him (rms dB over harmonics 1-30, each vowel's levels re its loudest)
const bandsOf = (h: number[]) => [[0, 2], [2, 5], [5, 10], [10, 20], [20, 40]].map(([a, b]) => 10 * Math.log10(h.slice(a, b).reduce((s, d) => s + 10 ** (d / 10), 0)));
function valley(h: number[], w: Vowel): number {
  const F = print.vowels[w][0];
  const k1 = Math.round(F[0] / f0) - 1, k2 = Math.round(F[1] / f0) - 1;
  if (k2 - k1 < 2) return NaN;
  const p1 = Math.max(...h.slice(Math.max(0, k1 - 1), k1 + 2)), p2 = Math.max(...h.slice(k2 - 1, k2 + 2));
  return Math.min(p1, p2) - Math.min(...h.slice(k1 + 1, k2));
}
function row(name: string, o: Record<string, { h: number[]; c: number }>) {
  const m = (f: (w: Vowel) => number) => MONO.map(f).filter((x) => !Number.isNaN(x)).reduce((a, b, _, l) => a + b / l.length, 0);
  const bs = MONO.map((w) => bandsOf(o[w].h)), bm = bs[0].map((_, j) => bs.reduce((a, b) => a + b[j] / bs.length, 0));
  const diff = Math.sqrt(m((w) => o[w].h.slice(0, 30).reduce((a, d, i) => a + (d - his[w].h[i]) ** 2 / 30, 0)));
  console.log(`${name.padEnd(16)} H1-H2 ${m((w) => o[w].h[0] - o[w].h[1]).toFixed(1).padStart(5)}  valley ${m((w) => valley(o[w].h, w)).toFixed(1).padStart(5)}  bands ${bm.map((x) => x.toFixed(0).padStart(4)).join('')}  crest ${m((w) => o[w].c).toFixed(1)}  off ${diff.toFixed(1)}`);
}
console.log(`his pitch ${f0.toFixed(0)} Hz`);
row('HIM', his);
for (const [n, v] of VARIANTS) row(n, ours(v));
// (per vowel, him vs matched: harmonics 1-24)
if (process.env.DETAIL) {
  const o = ours(VARIANTS.find(([n]) => n === process.env.DETAIL)![1]);
  for (const w of MONO) {
    console.log(`${w} him ${his[w].h.slice(0, 24).map((d) => d.toFixed(0).padStart(4)).join('')}`);
    console.log(`${w} us  ${o[w].h.slice(0, 24).map((d) => d.toFixed(0).padStart(4)).join('')}`);
  }
}

// (SEARCH=1: the cascade's few settings searched to him (rd, rdLoud, bw, tract), then an octave EQ, as match.ts does the FOF's)
if (process.env.SEARCH) {
  const off = (o: Record<string, { h: number[] }>) => Math.sqrt(MONO.reduce((a, w) => a + o[w].h.slice(0, 30).reduce((s, d, i) => s + (d - his[w].h[i]) ** 2 / 30, 0) / MONO.length, 0));
  let p = { rd: 1, bw: 1, tract: 1 };
  const mk = (q: typeof p, eq?: [number, number][]): FofVoice => ({ ...base, bw: q.bw, tract: q.tract, lab: { cascade: { rd: q.rd } }, ...(eq ? { print: { ...print, eq } } : {}) });
  let best = off(ours(mk(p)));
  const KN: [keyof typeof p, number, number, number][] = [['rd', 0.3, 2.6, 0.1], ['bw', 0.5, 2.5, 0.1], ['tract', 0.9, 1.06, 0.01]];
  for (let r = 0; r < 2; r++) for (const [k, lo, hi, st] of KN) for (const dir of [1, -1]) for (;;) {
    const nx = +(p[k] + dir * st).toFixed(3); if (nx < lo || nx > hi) break;
    const l = off(ours(mk({ ...p, [k]: nx }))); if (l >= best) break; best = l; p = { ...p, [k]: nx };
  }
  console.log(`cascade searched: ${best.toFixed(2)} dB off`, p);
  const eq: [number, number][] = [125, 250, 500, 1000, 2000, 4000, 8000].map((f) => [f, 0]);
  for (const st of [3, 1.5]) for (let j = 0; j < eq.length; j++) for (const dir of [1, -1]) for (;;) {
    const old = eq[j][1]; eq[j][1] = old + dir * st; if (Math.abs(eq[j][1]) > 15) { eq[j][1] = old; break; }
    const l = off(ours(mk(p, eq))); if (l >= best) { eq[j][1] = old; break; } best = l;
  }
  console.log(`cascade + eq: ${best.toFixed(2)} dB off`, eq.map(([f, g]) => `${f}:${g}`).join(' '));
  row('cascade best', ours(mk(p, eq)));
}
