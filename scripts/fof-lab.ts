// The FOF lab: the same sung lines (a verse and a chorus of a generated rock song, as the flow lab)
// by the current voice and by the FOF singer on trial (src/audio/fof.ts), as WAV files in voice-lab/
// to compare by ear, with a few measures behind them. Run: npm run fof-lab

import { mkdirSync, writeFileSync } from 'node:fs';
import { lagFor, perform } from '../src/audio/feel';
import { type FofVoice, FOF_RATE, renderFof } from '../src/audio/fof';
import { SING_RATE, type SungNote, renderLine } from '../src/audio/sing';
import { recipeFor } from '../src/audio/voices';
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { buildTrack, defaultTrackOptions } from '../src/track';

const GENRE: Genre = 'rock';
/** The first two sung lines of a seeded song's first verse and first chorus, as notes in seconds. */
function linesOf(seed: string): SungNote[][] {
  const idea = generate({ genre: GENRE, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], {
    song: seed, chords: `${seed}c`, drums: `${seed}d`, strum: `${seed}s`, bass: `${seed}b`, vocal: `${seed}v`,
  });
  const track = buildTrack(idea, defaultTrackOptions(idea)) as unknown as { sections?: typeof idea[] } & (typeof idea)[];
  const sections = track.sections ?? track;
  const out: SungNote[][] = [];
  for (const kind of ['verse', 'chorus']) {
    const sec = sections.find((s) => s.section?.kind === kind && s.vocal?.length);
    if (!sec) continue;
    const groups: NonNullable<typeof sec.vocal>[] = [];
    for (const n of sec.vocal!) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
    const six = 15 / sec.song.bpm;
    // (as the app sings them: with the singer's feel)
    for (const L of groups.slice(0, 2)) out.push(perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7));
  }
  return out;
}
const lines = linesOf('flow-1');
// (a second song, in a major key)
const lines2 = linesOf('smoke-rock-0');

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

/** Energy by band (dB, relative to the total) over the whole clip. */
function bands(a: Float32Array, rate: number) {
  const edges = [0, 300, 800, 1500, 2500, 4000, 6000, 11000];
  const n = 4096, e = edges.slice(1).map(() => 0);
  for (let s = 0; s + n <= a.length; s += n) {
    for (let bi = 0; bi < e.length; bi++) {
      // a crude DFT energy by band, coarse bins
      for (let f = edges[bi] + 25; f < edges[bi + 1]; f += 50) {
        let re = 0, im = 0;
        const w = (2 * Math.PI * f) / rate;
        for (let k = 0; k < n; k += 2) { re += a[s + k] * Math.cos(w * k); im += a[s + k] * Math.sin(w * k); }
        e[bi] += re * re + im * im;
      }
    }
  }
  const tot = e.reduce((x, y) => x + y, 0);
  return e.map((x, i) => `${edges[i]}-${edges[i + 1]}: ${(10 * Math.log10(x / tot)).toFixed(0)}`).join('  ');
}

const clicks = (a: Float32Array) => {
  const d = Array.from(a.slice(2), (x, i) => Math.abs(x - 2 * a[i + 1] + a[i]));
  const med = [...d].sort((x, y) => x - y)[Math.floor(d.length * 0.5)] + 1e-9;
  return d.filter((x) => x > 40 * med).length;
};
const syl = (vowel: string) => ({ onset: [], vowel, coda: [], stress: true, text: 'ah', wordStart: true }) as unknown as SungNote['syl'];
const PRE = 0.3;
mkdirSync('voice-lab', { recursive: true });
const recipe = recipeFor(GENRE);
const takes: [string, number, (n: SungNote[]) => Float32Array][] = [
  ['F0-current', recipe.rate ?? SING_RATE, (n) => renderLine(n, { high: false, slides: 0.5, seed: 17, recipe, flow: 'phrases' }, PRE)],
];
const FOF: [string, FofVoice][] = [
  ['F1-fof-clean', { seed: 17 }],
  ['F2-fof-rock', { seed: 17, grit: 0.6, breath: -20, bw: 1.2, tract: 0.96, bright: 1.5 }],
];
for (const [name, v] of FOF) takes.push([name, FOF_RATE, (n) => renderFof(n, v, PRE)]);
for (const [name, rate, render] of takes) {
  const t0 = Date.now();
  const parts = lines.map(render);
  const ms = Date.now() - t0;
  const gap = Math.round(0.6 * rate);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p.map((x) => x * 0.8), at); at += p.length + gap; }
  writeFileSync(`voice-lab/${name}.wav`, wav(out, rate));
  const secs = out.length / rate;
  console.log(name.padEnd(14), `${secs.toFixed(1)} s in ${ms} ms |`, bands(out, rate));
}
// registers: a climb on "yeah" from A2 to C5 and back, and the chorus line low, as written, higher and past the break,
// by three ways up (rock: belt; pop: falsetto; alt metal: scream)
const yeah = { onset: ['Y'], vowel: 'EH', coda: [], stress: true, text: 'yeah', wordStart: true } as unknown as SungNote['syl'];
const climb: SungNote[] = [];
const steps = [45, 48, 52, 55, 57, 60, 62, 64, 65, 67, 69, 72, 69, 67, 64, 60, 57, 52, 48];
steps.forEach((m, i) => climb.push({ t: i * 0.6, end: i * 0.6 + 0.5, midi: m, vel: lerp01(0.65, 0.95, (m - 45) / 27), syl: i % 3 === 2 ? { ...yeah, vowel: 'AA' as SungNote['syl']['vowel'] } : yeah }));
function lerp01(a: number, b: number, x: number) { return a + (b - a) * Math.max(0, Math.min(1, x)); }
const chorus = lines[2] ?? lines[0];
const REG: [string, FofVoice][] = [
  ['R1-rock-belt', { seed: 17, grit: 0.6, breath: -20, bw: 1.2, tract: 0.96, bright: 1.5, brk: 64, up: 'belt' }],
  ['R2-pop-falsetto', { seed: 17, grit: 0.15, breath: -18, bw: 1.1, bright: 1, brk: 65, up: 'falsetto' }],
  ['R3-altmetal-scream', { seed: 17, grit: 0.7, breath: -20, bw: 1.2, tract: 0.97, bright: 2, brk: 64, up: 'scream' }],
  // more edge (Paul: "increase the edge on the rock and alt metal voices")
  ['R4-rock-edge', { seed: 17, grit: 0.6, breath: -20, bw: 1.2, tract: 0.96, bright: 1.5, brk: 64, up: 'belt', edge: 0.6 }],
  ['R5-rock-more-edge', { seed: 17, grit: 0.6, breath: -20, bw: 1.2, tract: 0.96, bright: 1.5, brk: 64, up: 'belt', edge: 1 }],
  ['R6-altmetal-edge', { seed: 17, grit: 0.7, breath: -20, bw: 1.2, tract: 0.97, bright: 2, brk: 64, up: 'scream', edge: 0.6 }],
  ['R7-altmetal-more-edge', { seed: 17, grit: 0.7, breath: -20, bw: 1.2, tract: 0.97, bright: 2, brk: 64, up: 'scream', edge: 1 }],
];
for (const [name, v] of REG) {
  const parts = [renderFof(climb, v, PRE), ...[-5, 0, 7, 14].map((k) => renderFof(chorus.map((n) => ({ ...n, midi: n.midi + k })), v, PRE))];
  const gap = Math.round(0.6 * FOF_RATE);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p.map((x) => x * 0.8), at); at += p.length + gap; }
  writeFileSync(`voice-lab/${name}.wav`, wav(out, FOF_RATE));
  // (each climb note's level, dB: no jumps at the break)
  const lv = climb.map((n) => { const s0 = Math.round((PRE + n.t + 0.15) * FOF_RATE), s1 = Math.round((PRE + n.end - 0.05) * FOF_RATE); let e = 0; for (let i = s0; i < s1; i++) e += parts[0][i] ** 2; return (10 * Math.log10(e / (s1 - s0))).toFixed(0); });
  console.log(name.padEnd(22), 'climb levels', lv.join(' '), '|', bands(out, FOF_RATE));
}
// human or machine (Paul: "sounding a bit like a robot"): the song lines and a held "ah", the rock voice
// with edge, machine-steady (H0) and with a real voice's unevenness (H1); harmonics-to-noise (dB, a
// real singer about 15-25) and the pulse-to-pulse change in pitch (%, about 0.3-1) on the held "ah"
const ROCK: FofVoice = { seed: 17, grit: 0.45, breath: -27, bw: 1.25, tract: 0.96, bright: 0.5, brk: 64, up: 'belt', edge: 0.25 };
function hnr(a: Float32Array, f0: number) {
  const s = Math.round(0.6 * FOF_RATE), n = Math.round(0.08 * FOF_RATE), T = FOF_RATE / f0;
  let best = 0;
  for (let lag = Math.floor(T * 0.95); lag <= Math.ceil(T * 1.05); lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = s; i < s + n; i++) { xy += a[i] * a[i + lag]; xx += a[i] * a[i]; yy += a[i + lag] ** 2; }
    best = Math.max(best, xy / Math.sqrt(xx * yy));
  }
  return 10 * Math.log10(best / (1 - best));
}
for (const [name, hu] of [['H0-rock-machine', 0], ['H1-rock-human', 1]] as const) {
  const v = { ...ROCK, human: hu };
  const parts = [...lines.map((n) => renderFof(n, v, PRE)), ...lines2.map((n) => renderFof(n, v, PRE)), renderFof(climb, v, PRE)];
  const gap = Math.round(0.6 * FOF_RATE);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p.map((x) => x * 0.8), at); at += p.length + gap; }
  writeFileSync(`voice-lab/${name}.wav`, wav(out, FOF_RATE));
  const held = [50, 57, 62].map((m) => hnr(renderFof([{ t: 0, end: 1.4, midi: m, vel: 0.8, syl: syl('AA') }], v, PRE), 440 * 2 ** ((m - 69) / 12)).toFixed(0));
  // (the floor: the quietest 50 ms stretches inside each line, dB under its loudest: noise between the sounds?)
  const floor = parts.map((p) => { const w = Math.round(0.05 * FOF_RATE), r: number[] = []; for (let i = Math.round(0.25 * FOF_RATE); i + w < p.length - Math.round(0.3 * FOF_RATE); i += w) { let e = 0; for (let k = i; k < i + w; k++) e += p[k] * p[k]; r.push(10 * Math.log10(e / w + 1e-12)); } const mx = Math.max(...r); return r.filter((x) => x < mx - 30).length + '/' + r.length; });
  console.log(name.padEnd(18), 'HNR on a held "ah" (D3, A3, D4):', held.join(' '), '| quiet stretches', floor.join(' '), '|', bands(out, FOF_RATE));
}
console.log('lines:', lines.map((l) => l.map((n) => n.syl.text).join(' ')).join(' / '));

// held vowels: the first five harmonics' levels (dB, from the strongest), and sudden jumps (clicks)
const harm = (a: Float32Array, rate: number, f0: number) => {
  const s = Math.round(0.5 * rate), n = Math.round(0.4 * rate);
  const h = [1, 2, 3, 4, 5, 8, 12, 20].map((k) => {
    let re = 0, im = 0;
    const w = (2 * Math.PI * k * f0) / rate;
    for (let i = 0; i < n; i++) { const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); re += a[s + i] * win * Math.cos(w * i); im += a[s + i] * win * Math.sin(w * i); }
    return 10 * Math.log10(re * re + im * im + 1e-20);
  });
  const top = Math.max(...h);
  return h.map((x) => (x - top).toFixed(0).padStart(4)).join('');
};
console.log('held vowel, harmonics 1 2 3 4 5 8 12 20 (dB from strongest):');
for (const [name, rate, render] of takes) for (const [vw, m] of [['AA', 50], ['AA', 57], ['IY', 57], ['AA', 64]] as const) {
  const a = render([{ t: 0, end: 1.2, midi: m, vel: 0.8, syl: syl(vw) }]);
  console.log(name.padEnd(14), vw, m, harm(a, rate, 440 * 2 ** ((m - 69) / 12)), ' clicks', clicks(a));
}
