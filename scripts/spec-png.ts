// Spectrogram pictures of words, spoken (Kokoro) against sung, to see what a consonant looks like: one row per word, columns spoken | sung at --midi | sung 12 higher.
// Each cell: 0.45 s from the first sound, 0-8 kHz upward, brighter = louder (60 dB range, against the loudest of the whole cell).
// Run: npm run spec-png -- out.png pat bat tin [rock] [--midi=55] [--char=woman]

import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { type Character, fofFor } from '../src/audio/voices';
import { loadDictionary, wordsOf } from '../src/lab/words';
import { fft } from '../src/lab/measure';
import type { Genre } from '../src/genres';

await loadDictionary();
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const plain = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outPath = plain[0];
const GENRES = ['rock', 'pop', 'grunge', 'metal', 'country', 'hiphop', 'jazz', 'folk', 'blues', 'funk', 'reggae', 'edm', 'latin', 'punk', 'rnb', 'soul', 'indie'];
const genre = (plain.find((a, i) => i > 0 && GENRES.includes(a)) ?? 'rock') as Genre;
const words = plain.slice(1).filter((a) => a !== genre);
const base = Number(arg('midi') ?? 55), char = arg('char') as Character | undefined;
const CW = 360, CH = 150, SPAN = 0.28, HOP = 0.003, WIN = 0.012;

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
// (db per frame and bin, 0-8 kHz, from the first sound)
function sgram(x: Float32Array, rate: number) {
  const N = 1024, w = Math.round(WIN * rate), hop = Math.round(HOP * rate);
  let first = 0, peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  while (first < x.length && Math.abs(x[first]) < peak * 0.02) first++;
  first = Math.max(0, first);
  // (--tail: the last SPAN seconds of the sound instead, for a word's end)
  if (process.argv.includes('--tail')) { let last = x.length - 1; while (last > 0 && Math.abs(x[last]) < peak * 0.02) last--; first = Math.max(0, last - Math.round(SPAN * rate)); }
  const bins = Math.round((8000 * N) / rate), frames: number[][] = [];
  for (let at = first; at < first + SPAN * rate; at += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < w; i++) { const s = at + i < x.length ? x[at + i] : 0; re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (w - 1))); }
    fft(re, im);
    frames.push(Array.from({ length: bins }, (_, k) => 10 * Math.log10(re[k] ** 2 + im[k] ** 2 + 1e-12)));
  }
  return frames;
}
const sung = (w: string, m: number) => {
  const syls = wordsOf(w).flatMap((q) => q.syllables);
  let t = 0;
  const notes: SungNote[] = syls.map((s) => { const d = s.stress ? 0.5 : 0.35; const n: SungNote = { t, end: t + d * 0.95, midi: m + (s.stress ? 2 : 0), vel: 0.7, syl: s }; t += d; return n; });
  return renderFof(notes, { ...fofFor(genre, 17, false, char), human: 0, vib: 0, drift: 0, energy: 0.5 }, 0.3);
};

const cols = 3, W = CW * cols + (cols - 1) * 4, H = (CH + 4) * words.length;
const img = new Uint8Array(W * H * 3).fill(40);
words.forEach((w, row) => {
  const cells: number[][][] = [];
  const p = `experiments/kokoro-singer/out/words/am_michael-${w}.wav`;
  if (existsSync(p)) { const { x, rate } = readWav(p); cells.push(sgram(x, rate)); } else cells.push([]);
  cells.push(sgram(sung(w, base), FOF_RATE), sgram(sung(w, base + 12), FOF_RATE));
  // (each cell against its own loudest, 66 dB down)
  cells.forEach((fr, c) => {
    if (!fr.length) return;
    const mx = Math.max(...fr.map((f) => Math.max(...f)));
    for (let px = 0; px < CW; px++) {
      const f = fr[Math.min(fr.length - 1, Math.floor((px / CW) * fr.length))];
      for (let py = 0; py < CH; py++) {
        const v = f[Math.min(f.length - 1, Math.floor(((CH - 1 - py) / CH) * f.length))];
        const g = Math.max(0, Math.min(1, (v - (mx - 54)) / 54));
        // (dark blue -> orange -> white)
        const r = Math.min(255, g * 2.2 * 255), gr = Math.max(0, Math.min(255, (g - 0.35) * 2.2 * 255)), b = Math.min(255, g * 3 * 255) * (g < 0.5 ? 1 : Math.max(0, 1 - (g - 0.5) * 2) + (g > 0.85 ? (g - 0.85) * 6 : 0));
        const o = ((row * (CH + 4) + py) * W + c * (CW + 4) + px) * 3;
        img[o] = r; img[o + 1] = gr; img[o + 2] = Math.min(255, b);
      }
    }
  });
});
// (a PNG by hand)
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', outPath, `rows: ${words.join(', ')}; columns: spoken | sung ${base} | sung ${base + 12}; 0-8 kHz up, ${SPAN * 1000} ms across`);
