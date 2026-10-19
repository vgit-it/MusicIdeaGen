// The formant check: each vowel held on one note by a voice, and the three strongest resonance peaks found in its
// spectrum (smoothed over 220 Hz), so a new sound can be checked against what it should be (the r-coloured vowel:
// F3 down near 1.7 kHz). Run: npm run formant-check  (no audio is played); optional: vowel names to check, e.g. ER AX AA

import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { fft } from '../src/lab/measure';
import type { Syllable, Vowel } from '../src/parts/lyrics';
import { fofFor } from '../src/audio/voices';

const ALL: Vowel[] = ['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'OW', 'UH', 'UW', 'AH', 'AX', 'ER'];
const want = process.argv.slice(2).filter((a) => !a.startsWith('--')) as Vowel[];
const midi = 52, f0 = 440 * 2 ** ((midi - 69) / 12);
const v = { ...fofFor('rock', 17, false), human: 0, vib: 0, drift: 0 };

/** The resonances of a steady stretch: a linear-prediction envelope (order 14, on a 11 kHz copy), its peaks in Hz. */
function peaks(a: Float32Array, at: number) {
  const D = 4, rate = FOF_RATE / D, N = 1400, s0 = Math.round(at * FOF_RATE);
  const x: number[] = [];
  for (let i = 0; i < N; i++) { let m = 0; for (let k = 0; k < D; k++) m += a[s0 + i * D + k] ?? 0; x.push(m / D); }
  for (let i = N - 1; i > 0; i--) x[i] -= 0.97 * x[i - 1];
  const w = x.map((v, i) => v * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1))));
  const P = 14, r: number[] = [];
  for (let k = 0; k <= P; k++) { let t = 0; for (let i = k; i < N; i++) t += w[i] * w[i - k]; r.push(t); }
  const A = [1]; let err = r[0];
  for (let i = 1; i <= P; i++) {
    let acc = r[i]; for (let j = 1; j < i; j++) acc += A[j] * r[i - j];
    const k = -acc / err, nx = A.slice(); nx[i] = k;
    for (let j = 1; j < i; j++) nx[j] = A[j] + k * A[i - j];
    A.splice(0, A.length, ...nx); err *= 1 - k * k;
  }
  const env = (f: number) => { let re = 1, im = 0; for (let j = 1; j <= P; j++) { re += A[j] * Math.cos((2 * Math.PI * f * j) / rate); im -= A[j] * Math.sin((2 * Math.PI * f * j) / rate); } return 1 / (re * re + im * im); };
  const out: number[] = [];
  let prev = env(150), cur = env(160);
  for (let f = 170; f < 4500; f += 10) { const nx = env(f); if (cur > prev && cur >= nx && f - 10 > 250) out.push(f - 10); prev = cur; cur = nx; }
  return out.slice(0, 4);
}

for (const vowel of want.length ? want : ALL) {
  const syl = { onset: [], vowel, coda: [], stress: true, text: '', wordStart: true } as unknown as Syllable;
  const notes: SungNote[] = [{ t: 0, end: 1.5, midi, vel: 0.7, syl }];
  const out = renderFof(notes, v, 0);
  console.log(vowel.padEnd(4), 'peaks (Hz) at 0.3 s:', peaks(out, 0.3).join('  ').padEnd(22), 'at 1.0 s:', peaks(out, 1.0).join('  '));
}
