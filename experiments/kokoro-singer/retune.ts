// Retuning the app's voices on the pulse (Paul: "lets just do the 3rd one"). Each voice keeps every dial
// Paul set (its formants, rasp, breath, vibrato, register; the tone dials mapped onto the pulse: brighter
// or edgier: a lower Rd, softer: higher, body: a low shelf, twang: F3-F4 narrower). Then its balance up to
// 2.5 kHz matched to the old voice (held vowels, third-octave bands): the pulse's Rd searched, then an
// octave EQ (125 Hz - 2 kHz); Rd kept within 0.6-1.4 (a real chest pulse: higher matched the old dullness); above that the pulse's own, as a real voice's. Writes out/retune/<voice>.json
// and the voice singing its genre's lines, old (A) and on the pulse (B). Run from the repo root:
//   npx rolldown experiments/kokoro-singer/retune.ts --platform node --format esm -o node_modules/.cache/retune.mjs && node node_modules/.cache/retune.mjs [voice ...]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FOF_RATE, type FofVoice, renderFof } from '../../src/audio/fof';
import type { SungNote } from '../../src/audio/sing';
import { fofFor } from '../../src/audio/voices';
import type { Vowel } from '../../src/parts/lyrics';

const DIR = 'experiments/kokoro-singer/out';
const print = (p: string) => JSON.parse(readFileSync(`${DIR}/print/${p}.json`, 'utf8'));
const clean = { grit: 0.08, breath: -42, tract: 1, size: 1 };
// (each voice: the old one, and which lines it sings)
const VOICES: Record<string, [(s: number) => FofVoice, 'rock' | 'grunge']> = {
  rock: [(s) => fofFor('rock', s, false), 'rock'],
  grunge: [(s) => fofFor('grunge', s, false), 'grunge'],
  pop: [(s) => fofFor('pop', s, false), 'rock'],
  funk: [(s) => fofFor('funk', s, false), 'rock'],
  hardrock: [(s) => fofFor('hardrock', s, false), 'rock'],
  metal: [(s) => fofFor('metal', s, false), 'rock'],
  altmetal: [(s) => fofFor('altmetal', s, false), 'grunge'],
  'rock-tenor': [(s) => fofFor('rock', s, true), 'rock'],
  deep: [(s) => fofFor('grunge', s, false, 'deep'), 'grunge'],
  nasal: [(s) => fofFor('grunge', s, false, 'nasal'), 'grunge'],
  cornell: [(s) => fofFor('grunge', s, false, 'cornell'), 'grunge'],
  chester: [(s) => fofFor('rock', s, false, 'scream'), 'rock'],
  woman: [(s) => fofFor('rock', s, false, 'woman'), 'rock'],
  michael: [(s) => ({ ...fofFor('rock', s, false), print: print('am_michael'), tract: 1, size: 1 }), 'rock'],
  'onyx-clean': [(s) => ({ ...fofFor('grunge', s, false), ...clean, print: print('am_onyx') }), 'grunge'],
};
const pick = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VOICES);

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
const CENTRES = Array.from({ length: 21 }, (_, k) => 100 * 2 ** (k / 3));
function bands(x: Float32Array, t0: number, t1: number): number[] {
  const N = 4096, pw = new Float64Array(N / 2);
  for (let s = Math.floor(t0 * FOF_RATE); s + N <= Math.floor(t1 * FOF_RATE); s += N / 4) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pw[k] += re[k] * re[k] + im[k] * im[k];
  }
  const e = CENTRES.map((c) => { let sum = 0; for (let k = Math.ceil((c / 2 ** (1 / 6)) * N / FOF_RATE); k < (c * 2 ** (1 / 6) * N) / FOF_RATE; k++) sum += pw[k]; return sum + 1e-20; });
  const tot = e.reduce((a, b) => a + b);
  return e.map((v) => 10 * Math.log10(v / tot));
}
const MONO: Vowel[] = ['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UH', 'UW', 'AH'];
const syl = (vowel: Vowel) => ({ onset: ['HH'], vowel, coda: ['D'], stress: true, text: 'x', wordStart: true }) as unknown as SungNote['syl'];
// (two notes: a quiet one low, a pushed one higher)
const TESTS: [number, number][] = [[50, 0.6], [57, 0.85]];
function tone(v: FofVoice): number[][] {
  const o: number[][] = [];
  for (const [midi, vel] of TESTS) for (const w of MONO) o.push(bands(renderFof([{ t: 0, end: 0.8, midi, vel, syl: syl(w) }], v, 0.3), 0.55, 0.9));
  return o;
}
/** How clean (harmonics over noise, dB): each 40 ms frame's autocorrelation at the pitch's period, as Praat's, median over the held vowels. */
function hnr(v: FofVoice): number {
  const out: number[] = [];
  for (const [midi, vel] of TESTS) for (const w of ['AA', 'IY', 'UW', 'EH'] as Vowel[]) {
    const x = renderFof([{ t: 0, end: 0.8, midi, vel, syl: syl(w) }], v, 0.3), P = FOF_RATE / (440 * 2 ** ((midi + (v.shift ?? (v.high ? 12 : 0)) - 69) / 12));
    for (let t = 0.5; t < 0.9; t += 0.04) {
      const s0 = Math.floor(t * FOF_RATE), W = Math.round(0.04 * FOF_RATE);
      let best = 0;
      for (let lag = Math.floor(P * 0.97); lag <= Math.ceil(P * 1.03); lag++) {
        let xy = 0, xx = 0, yy = 0;
        for (let i = 0; i < W; i++) { const a = x[s0 + i], b = x[s0 + i + lag]; xy += a * b; xx += a * a; yy += b * b; }
        best = Math.max(best, xy / Math.sqrt(xx * yy + 1e-20));
      }
      out.push(10 * Math.log10(Math.min(0.99999, best) / (1 - Math.min(0.99999, best))));
    }
  }
  out.sort((a, b) => a - b);
  return out[out.length >> 1];
}
const loss = (a: number[][], b: number[][]) => {
  let s = 0, n = 0;
  a.forEach((r, j) => r.forEach((t, i) => { if (CENTRES[i] > 2500 || t < -45) return; s += (b[j][i] - t) ** 2; n++; }));
  return Math.sqrt(s / n);
};

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(FOF_RATE, 24); b.writeUInt32LE(FOF_RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}
function sing(lines: SungNote[][], voice: (s: number) => FofVoice): Float32Array {
  const parts = lines.map((L, i) => renderFof(L, voice(17 + i), 0.3));
  const gap = Math.round(0.6 * FOF_RATE);
  const all = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length + gap; }
  const rms = Math.sqrt(all.reduce((a, x) => a + x * x, 0) / all.length);
  return all.map((x) => Math.tanh((x * 0.1) / rms));
}

mkdirSync(`${DIR}/retune`, { recursive: true });
const LINES = { rock: JSON.parse(readFileSync(`${DIR}/lines.json`, 'utf8')), grunge: JSON.parse(readFileSync(`${DIR}/lines-grunge.json`, 'utf8')) };
for (const name of pick) {
  const [old, which] = VOICES[name];
  const target = tone({ ...old(17), vib: 0 });
  const p = { rd: 1.1, noise: 0, eq: [125, 250, 500, 1000, 2000].map((f) => [f, 0]) as [number, number][] };
  const mk = (s: number, q = p): FofVoice => ({ ...old(s), lab: { cascade: { rd: q.rd, rdLoud: q.rd * 0.7, dials: true, noise: q.noise, eq: q.eq.map(([f, g]) => [f, g] as [number, number]) } } });
  const test = (q: typeof p) => loss(target, tone({ ...mk(17, q), vib: 0 }));
  let best = test(p);
  const start = best;
  for (const dir of [1, -1]) for (;;) { const rd = +(p.rd + dir * 0.1).toFixed(2); if (rd < 0.6 || rd > 1.4) break; const l = test({ ...p, rd }); if (l >= best) break; best = l; p.rd = rd; }
  for (const st of [3, 1.5]) for (let j = 0; j < p.eq.length; j++) for (const dir of [1, -1]) for (;;) {
    const old = p.eq[j][1]; p.eq[j][1] = old + dir * st; if (Math.abs(p.eq[j][1]) > 12) { p.eq[j][1] = old; break; }
    const l = test(p); if (l >= best) { p.eq[j][1] = old; break; } best = l;
  }
  // (its noise (breath, rasp) brought to the old voice's cleanness, which Paul set by ear)
  const want = hnr({ ...old(17), vib: 0 });
  for (let k = 0; k < 6; k++) { const got = hnr({ ...mk(17), vib: 0 }); if (Math.abs(got - want) < 0.75) break; p.noise = Math.max(-30, Math.min(10, p.noise + (got - want))); }
  // (and 3 dB cleaner again: on sung lines the pulse measured about 4 dB noisier than the old voice; and
  // the top above 5 kHz 6 dB down: the old voices sat about 15 dB under a real voice there, the pulse 5 over)
  p.noise -= 3;
  p.eq.push([8000, -6]);
  const hB = hnr({ ...mk(17), vib: 0 });
  writeFileSync(`${DIR}/retune/${name}.json`, JSON.stringify({ rd: p.rd, rdLoud: +(p.rd * 0.7).toFixed(2), noise: +p.noise.toFixed(1), eq: p.eq }, null, 1));
  writeFileSync(`${DIR}/retune/${name}-A-old.wav`, wav(sing(LINES[which], old)));
  writeFileSync(`${DIR}/retune/${name}-B-pulse.wav`, wav(sing(LINES[which], (s) => mk(s))));
  console.log(`${name}: ${start.toFixed(1)} -> ${best.toFixed(1)} dB off (to 2.5 kHz), rd ${p.rd}, cleanness ${want.toFixed(1)} -> ${hB.toFixed(1)} dB (noise ${p.noise.toFixed(1)}), eq ${p.eq.map(([f, g]) => `${f}:${g}`).join(' ')}`);
}
