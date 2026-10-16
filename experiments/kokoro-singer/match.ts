// Tone match, step 2: our FOF singer tuned to sound like the new man speaking (Kokoro, new_size84). Both
// say the same held vowels ("h_d" words, at his speaking pitch); each one's tone is measured in third-
// octave bands over the middle of the vowel; the singer's settings are searched (a few rounds, one
// setting at a time) to bring its bands to his; what is left over becomes the print's tone-match EQ.
// Writes out/print/<voice>-matched.json (the print with its eq) and out/print/<voice>-match.json (the
// settings found). Run from the repo root:
//   npx rolldown experiments/kokoro-singer/match.ts --platform node --format esm -o node_modules/.cache/match.mjs && node node_modules/.cache/match.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { FOF_RATE, type FofVoice, type VoicePrint, renderFof } from '../../src/audio/fof';
import type { SungNote } from '../../src/audio/sing';
import { fofFor } from '../../src/audio/voices';
import type { Vowel } from '../../src/parts/lyrics';

const VOICE = process.env.VOICE ?? 'new_size84';
const DIR = 'experiments/kokoro-singer/out/print';
const print: VoicePrint = JSON.parse(readFileSync(`${DIR}/${VOICE}.json`, 'utf8'));
const spans: Record<string, { t0: number; t1: number; f0: number }> = JSON.parse(readFileSync(`${DIR}/${VOICE}/spans.json`, 'utf8'));
const MONO: Vowel[] = ['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UH', 'UW', 'AH'];

function readWav(p: string): { x: Float32Array; rate: number } {
  const b = readFileSync(p);
  const rate = b.readUInt32LE(24), n = (b.length - 44) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { x, rate };
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(a * k), wi = Math.sin(a * k);
      const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}

// third-octave bands, 100 Hz - 10 kHz
const CENTRES = Array.from({ length: 21 }, (_, k) => 100 * 2 ** (k / 3));
/** The tone of x between t0 and t1 (s): dB per band, relative to the whole. */
function bands(x: Float32Array, rate: number, t0: number, t1: number): number[] {
  const N = rate > 30000 ? 4096 : 2048, hop = N / 4;
  const pw = new Float64Array(N / 2);
  for (let s = Math.floor(t0 * rate); s + N <= Math.floor(t1 * rate); s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pw[k] += re[k] * re[k] + im[k] * im[k];
  }
  const e = CENTRES.map((c) => {
    let sum = 0;
    for (let k = Math.ceil((c / 2 ** (1 / 6)) * N / rate); k < Math.min(N / 2, (c * 2 ** (1 / 6) * N) / rate); k++) sum += pw[k];
    return sum + 1e-20;
  });
  const tot = e.reduce((a, b) => a + b);
  return e.map((v) => 10 * Math.log10(v / tot));
}

// his tone, per vowel (both takes)
const target: Record<string, number[]> = {};
for (const v of MONO) {
  const per = [0, 1].map((n) => {
    const { x, rate } = readWav(`${DIR}/${VOICE}/${v}-${n}.wav`);
    const s = spans[`${v}-${n}`];
    return bands(x, rate, s.t0 + 0.3 * (s.t1 - s.t0), s.t0 + 0.7 * (s.t1 - s.t0));
  });
  target[v] = per[0].map((a, i) => (a + per[1][i]) / 2);
}
const f0 = Object.values(spans).map((s) => s.f0).sort((a, b) => a - b)[Object.keys(spans).length >> 1];
const midi = 69 + 12 * Math.log2(f0 / 440);

const PRE = 0.3;
const syl = (vowel: Vowel) => ({ onset: ['HH'], vowel, coda: ['D'], stress: true, text: 'x', wordStart: true }) as unknown as SungNote['syl'];
function ours(v: FofVoice): Record<string, number[]> {
  const o: Record<string, number[]> = {};
  for (const w of MONO) {
    const x = renderFof([{ t: 0, end: 0.8, midi, vel: 0.6, syl: syl(w) }], v, PRE);
    o[w] = bands(x, FOF_RATE, PRE + 0.25, PRE + 0.6);
  }
  return o;
}
// (the difference: mean squared dB over the bands that matter, below 8 kHz, his louder bands weighted more)
function loss(o: Record<string, number[]>): number {
  let s = 0, n = 0;
  for (const w of MONO) target[w].forEach((t, i) => {
    if (CENTRES[i] > 8000 || t < -45) return;
    const wt = t > -25 ? 1 : 0.5;
    s += wt * (o[w][i] - t) ** 2; n += wt;
  });
  return s / n;
}

// the singer as W1 (the Big & dark character, clean, with his print), then searched
const base = (): FofVoice => ({ ...fofFor('grunge', 17, false, 'deep'), grit: 0.08, breath: -42, print, tract: 1, size: 1, expr: 0, human: 0.5 });
if (process.env.DEBUG) { const o = ours(base()); for (const w of ["AA", "IY"]) { console.log(w, "his ", target[w].map((x) => x.toFixed(0)).join(" ")); console.log(w, "ours", o[w].map((x) => x.toFixed(0)).join(" ")); } console.log("midi", midi.toFixed(1)); process.exit(0); }
type Knob = { k: keyof FofVoice; lo: number; hi: number; step: number };
const KNOBS: Knob[] = [
  { k: 'bright', lo: -5, hi: 20, step: 0.5 }, { k: 'soft', lo: 0, hi: 1, step: 0.1 }, { k: 'softPushed', lo: 0, hi: 1, step: 0.1 }, { k: 'body', lo: 0, hi: 14, step: 1 }, { k: 'bw', lo: 0.7, hi: 3.5, step: 0.1 },
  { k: 'edge', lo: 0, hi: 1, step: 0.05 }, { k: 'twang', lo: 0, hi: 1, step: 0.1 }, { k: 'nasal', lo: 0, hi: 0.4, step: 0.04 },
  { k: 'heft', lo: 0, hi: 1, step: 0.1 }, { k: 'tract', lo: 0.9, hi: 1.05, step: 0.01 },
];
const v: FofVoice = base();
let best = loss(ours(v));
console.log(`start: ${Math.sqrt(best).toFixed(2)} dB off`);
for (let round = 0; round < 3; round++) {
  for (const kn of KNOBS) {
    const cur = (v[kn.k] as number | undefined) ?? (kn.k === 'tract' ? 1 : 0);
    for (const dir of [1, -1]) {
      let x = cur;
      for (;;) {
        const nx = +(x + dir * kn.step).toFixed(3);
        if (nx < kn.lo || nx > kn.hi) break;
        const l = loss(ours({ ...v, [kn.k]: nx }));
        if (l >= best) break;
        best = l; x = nx; (v as Record<string, unknown>)[kn.k] = nx;
      }
    }
  }
  console.log(`round ${round + 1}: ${Math.sqrt(best).toFixed(2)} dB off`, KNOBS.map((kn) => `${kn.k} ${v[kn.k]}`).join(', '));
}

// what's left: an octave EQ, searched the same way (one band at a time)
const OCT = [125, 250, 500, 1000, 2000, 4000, 8000];
const eq: [number, number][] = OCT.map((f) => [f, 0]);
const withEq = () => ({ ...v, print: { ...print, eq: eq.map(([f, g]) => [f, g] as [number, number]) } });
for (const step of [3, 1.5, 0.75]) {
  for (let j = 0; j < OCT.length; j++) {
    for (const dir of [1, -1]) {
      for (;;) {
        const old = eq[j][1], nx = old + dir * step;
        if (Math.abs(nx) > 20) break;
        eq[j][1] = nx;
        const l = loss(ours(withEq()));
        if (l >= best) { eq[j][1] = old; break; }
        best = l;
      }
    }
  }
  console.log(`eq (steps of ${step} dB): ${Math.sqrt(best).toFixed(2)} dB off`, eq.map(([f, g]) => `${f}:${g}`).join(' '));
}
writeFileSync(`${DIR}/${VOICE}-matched.json`, JSON.stringify({ ...print, eq }, null, 1));
const settings = Object.fromEntries(KNOBS.map((kn) => [kn.k, v[kn.k]]));
writeFileSync(`${DIR}/${VOICE}-match.json`, JSON.stringify(settings, null, 1));
