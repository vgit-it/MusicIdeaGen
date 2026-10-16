// The Kokoro singer test, step 1: the sung lines of two generated rock songs (as the FOF lab takes
// them) to lines.json, and the same lines by the app's FOF singer to out/fof.wav, for comparison.
// Run from the repo root: npx rolldown experiments/kokoro-singer/lines.ts --platform node --format esm -o node_modules/.cache/kokoro-lines.mjs && node node_modules/.cache/kokoro-lines.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { lagFor, perform } from '../../src/audio/feel';
import { FOF_RATE, renderFof } from '../../src/audio/fof';
import type { SungNote } from '../../src/audio/sing';
import { fofFor } from '../../src/audio/voices';
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';

// (GENRE=grunge for another genre's lines: out/lines-grunge.json, no FOF take)
const GENRE = (process.env.GENRE ?? 'rock') as Genre;
const OUT = 'experiments/kokoro-singer/out';

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
    for (const L of groups.slice(0, 2)) out.push(perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7));
  }
  return out;
}

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

const lines = GENRE === 'rock' ? [...linesOf('flow-1'), ...linesOf('smoke-rock-0')] : [...linesOf(`${GENRE}-1`), ...linesOf(`${GENRE}-2`)];
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/lines${GENRE === 'rock' ? '' : `-${GENRE}`}.json`, JSON.stringify(lines, null, 1));
if (GENRE !== 'rock') { console.log(lines.map((L) => L.map((n) => n.syl.text).join(' ')).join('\n')); process.exit(0); }

// (the FOF singer, as the app sings a rock song: lines 0.6 s apart)
const PRE = 0.3;
const parts = lines.map((L, i) => renderFof(L, fofFor(GENRE, 17 + i, false), PRE));
const gap = Math.round(0.6 * FOF_RATE);
const all = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
let at = 0;
for (const p of parts) { all.set(p, at); at += p.length + gap; }
const peak = all.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
writeFileSync(`${OUT}/fof.wav`, wav(all.map((x) => (x / peak) * 0.8), FOF_RATE));
console.log(lines.map((L) => L.map((n) => n.syl.text).join(' ')).join('\n'));
