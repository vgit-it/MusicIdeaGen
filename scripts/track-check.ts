// The track check: a word sung by a voice, and its resonances (F1-F3 by a linear-prediction envelope) every 40 ms, to see what a sound does
// through the word (the r-colour of "bird": F3 should sit near 1.7 kHz through the vowel). Run: npm run track-check -- bird [rock]

import { readFileSync } from 'node:fs';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { fofFor } from '../src/audio/voices';
import { loadDictionary, wordsOf } from '../src/lab/words';
import type { Genre } from '../src/genres';

await loadDictionary();
const wavArg = process.argv.indexOf('--wav');
let word = process.argv[2] ?? 'bird', out: Float32Array, RATE = FOF_RATE;
if (wavArg > 0) {
  // (a WAV: 16-bit or 32-bit float PCM, mono)
  const b = readFileSync(process.argv[wavArg + 1]);
  const fmt = b.readUInt16LE(20), bits = b.readUInt16LE(34);
  RATE = b.readUInt32LE(24);
  let at = 12;
  while (b.toString('ascii', at, at + 4) !== 'data') at += 8 + b.readUInt32LE(at + 4);
  const n = b.readUInt32LE(at + 4) / (bits / 8);
  out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fmt === 3 ? b.readFloatLE(at + 8 + i * 4) : b.readInt16LE(at + 8 + i * 2) / 32768;
  word = process.argv[wavArg + 1];
} else {
  const genre = (process.argv[3] as Genre) || 'rock';
  const syls = wordsOf(word).flatMap((w) => w.syllables);
  let t = 0;
  const notes: SungNote[] = syls.map((s) => { const d = s.stress ? 0.5 : 0.35; const n: SungNote = { t, end: t + d * 0.95, midi: 55 + (s.stress ? 2 : 0), vel: 0.7, syl: s }; t += d; return n; });
  out = renderFof(notes, { ...fofFor(genre, 17, false), human: 0, vib: 0, drift: 0, energy: 0.5 }, 0.3);
  console.log(word, syls.map((s) => [...s.onset, s.vowel, ...s.coda].join(' ')).join(' | '), ' (time s: level, resonances Hz)');
}

function formants(a: Float32Array, at: number) {
  const D = Math.max(1, Math.round(RATE / 11000)), rate = RATE / D, N = Math.round(0.08 * rate), s0 = Math.round(at * RATE);
  const x: number[] = [];
  for (let i = 0; i < N; i++) { let m = 0; for (let k = 0; k < D; k++) m += a[s0 + i * D + k] ?? 0; x.push(m / D); }
  for (let i = N - 1; i > 0; i--) x[i] -= 0.97 * x[i - 1];
  const w = x.map((v, i) => v * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1))));
  const P = 14, r: number[] = [];
  for (let k = 0; k <= P; k++) { let q = 0; for (let i = k; i < N; i++) q += w[i] * w[i - k]; r.push(q); }
  if (r[0] < 1e-9) return null;
  const A = [1]; let err = r[0];
  for (let i = 1; i <= P; i++) {
    let acc = r[i]; for (let j = 1; j < i; j++) acc += A[j] * r[i - j];
    const k = -acc / err, nx = A.slice(); nx[i] = k;
    for (let j = 1; j < i; j++) nx[j] = A[j] + k * A[i - j];
    A.splice(0, A.length, ...nx); err *= 1 - k * k;
  }
  const env = (f: number) => { let re = 1, im = 0; for (let j = 1; j <= P; j++) { re += A[j] * Math.cos((2 * Math.PI * f * j) / rate); im -= A[j] * Math.sin((2 * Math.PI * f * j) / rate); } return 1 / (re * re + im * im); };
  const pk: [number, number][] = [];
  let prev = env(150), cur = env(160);
  for (let f = 170; f < 4500; f += 10) { const nx = env(f); if (cur > prev && cur >= nx && f - 10 > 250) pk.push([f - 10, cur]); prev = cur; cur = nx; }
  const e = Math.sqrt(r[0] / N), top = pk[0]?.[1] ?? 1;
  // (each peak: its frequency, and its height in dB against the first)
  return { pk: pk.slice(0, 4).map(([f, h]) => `${f}(${Math.round(10 * Math.log10(h / top))})`), e };
}
for (let at = wavArg > 0 ? 0.0 : 0.3; at < out.length / RATE - 0.1; at += 0.04) {
  const f = formants(out, at);
  console.log(at.toFixed(2), f ? `${f.e.toFixed(3)}  ${f.pk.join('  ')}` : '-');
}
