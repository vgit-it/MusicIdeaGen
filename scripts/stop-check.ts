// The stop check: the start of a word (its consonant into the vowel) as two level traces every 10 ms, a voiced one (below 600 Hz: the voice) and a noisy
// one (above 1.5 kHz: the burst and the breath), in dB against the loudest of each, for a word sung by a voice and for a spoken recording, so the bite
// of a p, t or k can be compared. Run: npm run stop-check -- pat [rock] [--midi=72] [--char=woman]   or   -- --wav experiments/kokoro-singer/out/words/am_michael-pat.wav

import { readFileSync } from 'node:fs';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { type Character, fofFor } from '../src/audio/voices';
import { loadDictionary, wordsOf } from '../src/lab/words';
import type { Genre } from '../src/genres';

await loadDictionary();
const wavArg = process.argv.indexOf('--wav');
let out: Float32Array, RATE = FOF_RATE, title = process.argv[2] ?? 'pat';
if (wavArg > 0) {
  const b = readFileSync(process.argv[wavArg + 1]);
  const fmt = b.readUInt16LE(20), bits = b.readUInt16LE(34);
  RATE = b.readUInt32LE(24);
  let at = 12;
  while (b.toString('ascii', at, at + 4) !== 'data') at += 8 + b.readUInt32LE(at + 4);
  const n = b.readUInt32LE(at + 4) / (bits / 8);
  out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fmt === 3 ? b.readFloatLE(at + 8 + i * 4) : b.readInt16LE(at + 8 + i * 2) / 32768;
  title = process.argv[wavArg + 1].split(/[\/]/).pop()!;
} else {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const genre = (process.argv[3]?.startsWith('--') ? 'rock' : (process.argv[3] as Genre)) || 'rock', base = Number(arg('midi') ?? 55), char = arg('char') as Character | undefined;
  const syls = wordsOf(title).flatMap((w) => w.syllables);
  let t = 0;
  const notes: SungNote[] = syls.map((s) => { const d = s.stress ? 0.5 : 0.35; const n: SungNote = { t, end: t + d * 0.95, midi: base + (s.stress ? 2 : 0), vel: 0.7, syl: s }; t += d; return n; });
  out = renderFof(notes, { ...fofLike(genre), human: 0, vib: 0, drift: 0, energy: 0.5 }, 0.3);
}
function fofLike(g: Genre) { return fofFor(g, 17, false, (process.argv.find((a) => a.startsWith('--char='))?.split('=')[1] as Character | undefined)); }

// (two one-pole filters each way: a low band and a high band)
function band(x: Float32Array, lo: boolean) {
  const y = new Float32Array(x.length);
  const k = 1 - Math.exp((-2 * Math.PI * (lo ? 600 : 1500)) / RATE);
  let a = 0, b = 0;
  for (let i = 0; i < x.length; i++) { a += (x[i] - a) * k; b += (a - b) * k; y[i] = lo ? b : x[i] - a; }
  if (!lo) { let c = 0; for (let i = 0; i < x.length; i++) { c += (y[i] - c) * k; y[i] -= c; } }
  return y;
}
const lf = band(out, true), hf = band(out, false);
const win = Math.round(0.01 * RATE), n = Math.floor(out.length / win);
const env = (y: Float32Array) => Array.from({ length: n }, (_, i) => { let e = 0; for (let k = i * win; k < (i + 1) * win; k++) e += y[k] ** 2; return Math.sqrt(e / win); });
const el = env(lf), eh = env(hf);
const ml = Math.max(...el), mh = Math.max(...eh);
// (from where any sound begins)
const start = Math.max(0, el.findIndex((v, i) => v > ml * 0.01 || eh[i] > mh * 0.01) - 1);
console.log(title, ' (ms from the first sound: voice dB, noise dB, each against its own loudest)');
for (let i = start; i < Math.min(n, start + 22); i++) {
  const l = 20 * Math.log10(el[i] / ml + 1e-6), h = 20 * Math.log10(eh[i] / mh + 1e-6);
  console.log(String((i - start) * 10).padStart(4), String(Math.round(l)).padStart(5), String(Math.round(h)).padStart(5), '#'.repeat(Math.max(0, Math.round((h + 40) / 3))));
}
