// The consonant check: the start of each word (its first consonant) as a spectrum, for a spoken recording (Kokoro) and for the sung voice, side by side.
// Per word: how long the consonant lasts before the vowel takes over, and its level in five bands (0-0.5, 0.5-1.5, 1.5-3, 3-5, 5-9 kHz) in dB
// against the vowel that follows it (its first 80 ms of steady sound), the sum of the high bands' share, and the share of voicing.
// Run: npm run cons-check [-- rock --midi=60 --char=woman pat bat ...]   (spoken files: experiments/kokoro-singer/out/words/am_michael-<word>.wav)

import { existsSync, readFileSync } from 'node:fs';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { type Character, fofFor } from '../src/audio/voices';
import { loadDictionary, wordsOf } from '../src/lab/words';
import { fft } from '../src/lab/measure';
import type { Genre } from '../src/genres';

await loadDictionary();
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const plain = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const GENRES = ['rock', 'pop', 'grunge', 'metal', 'country', 'hiphop', 'jazz', 'folk', 'blues', 'funk', 'reggae', 'edm', 'latin', 'punk', 'rnb', 'soul', 'indie'];
const genre = (plain.find((a) => GENRES.includes(a)) ?? 'rock') as Genre;
const words = plain.filter((a) => a !== genre).length ? plain.filter((a) => a !== genre) : ['pat', 'bat', 'tin', 'din', 'cat', 'gap', 'fin', 'van', 'thin', 'this', 'sin', 'zoo', 'shin', 'chin', 'jam', 'man', 'nap', 'hat', 'lap', 'ray', 'wet', 'yes'];
const base = Number(arg('midi') ?? 55), char = arg('char') as Character | undefined;
const BANDS = [[0, 500], [500, 1500], [1500, 3000], [3000, 5000], [5000, 9000]];

function readWav(path: string) {
  const b = readFileSync(path);
  const fmt = b.readUInt16LE(20), bits = b.readUInt16LE(34), rate = b.readUInt32LE(24);
  let at = 12;
  while (b.toString('ascii', at, at + 4) !== 'data') at += 8 + b.readUInt32LE(at + 4);
  const n = b.readUInt32LE(at + 4) / (bits / 8);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = fmt === 3 ? b.readFloatLE(at + 8 + i * 4) : b.readInt16LE(at + 8 + i * 2) / 32768;
  return { x, rate };
}
// (power in each band over one 20 ms window starting at `at`)
function spectrum(x: Float32Array, rate: number, at: number) {
  const N = 1024, re = new Float64Array(N), im = new Float64Array(N), w = Math.min(N, Math.round(0.02 * rate));
  for (let i = 0; i < w; i++) { const s = at + i < x.length ? x[at + i] : 0; re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (w - 1))); }
  fft(re, im);
  return BANDS.map(([lo, hi]) => { let e = 0; for (let k = Math.ceil((lo * N) / rate); k < Math.min(N / 2, (hi * N) / rate); k++) e += re[k] ** 2 + im[k] ** 2; return e; });
}
// (the lowest band alone tells voicing, every 5 ms: the consonant ends where the 0.5-1.5 kHz band reaches within 9 dB of its peak in the next 150 ms)
function analyse(x: Float32Array, rate: number) {
  const step = Math.round(0.005 * rate), frames: number[][] = [];
  for (let at = 0; at + 0.02 * rate < x.length; at += step) frames.push(spectrum(x, rate, at));
  const tot = frames.map((f) => f.reduce((a, b) => a + b, 0)), mx = Math.max(...tot);
  const first = Math.max(0, tot.findIndex((v) => v > mx * 1e-4) - 1);
  const mid = frames.map((f) => f[1] + f[2]), mm = Math.max(...mid.slice(first, first + 60));
  let vow = first;
  while (vow < frames.length && mid[vow] < mm * 0.125) vow++;
  const vs = Array.from({ length: 16 }, (_, i) => frames[Math.min(frames.length - 1, vow + 4 + i)]);
  const vref = BANDS.map((_, b) => vs.reduce((a, f) => a + f[b], 0) / vs.length);
  const vtot = vref.reduce((a, b) => a + b, 0);
  const cons = frames.slice(first, Math.max(first + 1, vow - 1));
  const ctot = cons.map((f) => f.reduce((a, b) => a + b, 0));
  const cband = BANDS.map((_, b) => cons.reduce((a, f) => a + f[b], 0) / Math.max(1, cons.length));
  const peak = cons.length ? cons[ctot.indexOf(Math.max(...ctot))] : cband;
  return {
    ms: Math.round(((vow - first) * 5)),
    lvl: peak.map((e, b) => Math.round(10 * Math.log10(e / vref[b] + 1e-9))),
    low: Math.round(100 * (cband[0] / (cband.reduce((a, b) => a + b, 0) + 1e-9))),
    tot: Math.round(10 * Math.log10(Math.max(...ctot, 1e-12) / vtot)),
  };
}

const f = (n: number) => String(n).padStart(4);
console.log(`ms = consonant length; bands (dB re the vowel): <0.5k  .5-1.5k  1.5-3k  3-5k  5-9k; tot = loudest 20 ms of the consonant re the vowel; low% = share of power under 500 Hz`);
console.log('word  who        ms |   <.5   .5-1.5  1.5-3   3-5   5-9 | tot low%');
for (const w of words) {
  const rows: [string, ReturnType<typeof analyse>][] = [];
  const path = `experiments/kokoro-singer/out/words/am_michael-${w}.wav`;
  if (existsSync(path)) { const { x, rate } = readWav(path); rows.push(['spoken', analyse(x, rate)]); }
  const syls = wordsOf(w).flatMap((q) => q.syllables);
  for (const m of [base, base + 12]) {
    let t = 0;
    const notes: SungNote[] = syls.map((s) => { const d = s.stress ? 0.5 : 0.35; const n: SungNote = { t, end: t + d * 0.95, midi: m + (s.stress ? 2 : 0), vel: 0.7, syl: s }; t += d; return n; });
    const out = renderFof(notes, { ...fofFor(genre, 17, false, char), human: 0, vib: 0, drift: 0, energy: 0.5 }, 0.3);
    rows.push([`sung ${m}`, analyse(out, FOF_RATE)]);
  }
  for (const [who, r] of rows) console.log(w.padEnd(5), who.padEnd(9), f(r.ms), '|', r.lvl.map(f).join('  '), '|', f(r.tot), f(r.low));
}
