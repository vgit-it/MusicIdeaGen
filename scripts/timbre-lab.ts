// The timbre lab: one sample vocal (a verse low and soft, a chorus high and loud, a long held top note)
// sung by the rock voice and by voices on trial, as MP3s in voice-lab/ to pick from by ear.
// Run: npm run timbre-lab

import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { lagFor, perform } from '../src/audio/feel';
import { type FofVoice, FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { fofFor } from '../src/audio/voices';
import { generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';

/** A seeded rock song's sung lines, by section kind, as notes in seconds (with the singer's feel). */
function linesOf(seed: string) {
  const idea = generate({ genre: 'rock', meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], {
    song: seed, chords: `${seed}c`, drums: `${seed}d`, strum: `${seed}s`, bass: `${seed}b`, vocal: `${seed}v`,
  });
  const track = buildTrack(idea, defaultTrackOptions(idea)) as unknown as { sections?: typeof idea[] } & (typeof idea)[];
  const sections = track.sections ?? track;
  const out: Record<string, SungNote[][]> = {};
  for (const kind of ['verse', 'chorus']) {
    const sec = sections.find((s) => s.section?.kind === kind && s.vocal?.length);
    if (!sec) continue;
    const groups: NonNullable<typeof sec.vocal>[] = [];
    for (const n of sec.vocal!) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
    const six = 15 / sec.song.bpm;
    out[kind] = groups.map((L) => perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7));
  }
  return out;
}

// the sample: the song (of a few) whose verse and chorus span the widest range, with a long note up top
let best: SungNote[][] = [], span = 0;
for (const seed of ['rasp-1', 'rasp-2', 'rasp-3', 'rasp-4', 'rasp-5', 'flow-1', 'smoke-rock-0']) {
  const L = linesOf(seed);
  if (!L.verse || !L.chorus) continue;
  // (long lines cut at a note's end, about 5 s in)
  const cut = (l: SungNote[]) => { const k = l.findIndex((n) => n.end - l[0].t > 5); return k < 0 ? l : l.slice(0, Math.max(3, k)); };
  const pick = [...L.verse.slice(0, 2), ...L.chorus.slice(0, 3)].map(cut);
  const ms = pick.flat().map((n) => n.midi), lo = Math.min(...ms), hi = Math.max(...ms);
  const longTop = pick.slice(2).flat().some((n) => n.midi >= hi - 2 && n.end - n.t > 0.6);
  const s = hi - lo + (longTop ? 3 : 0);
  if (s > span) { span = s; best = pick; console.log(seed, 'range', lo, '-', hi, longTop ? '(long top note)' : ''); }
}
const verseLen = 2;
// (the verse sung softer, the chorus pushed: as a band would)
const sample = best.map((L, i) => L.map((n) => ({ ...n, vel: i < verseLen ? Math.min(n.vel, 0.7) : Math.max(n.vel, 0.85) })));

// (the voices as the app sings them: fofFor, with expression and less of the operatic sound)
// (the voices as the app sings them, low and high)
// (Clean & scream, Chester Bennington-like: the nasal feel (twang) at three amounts)
const scream = fofFor('rock', 17, false, 'scream');
const TAKES: [string, FofVoice][] = [
  ['clean-and-scream-up3', scream],
  ['clean-and-scream-up5', { ...scream, shift: 5, size: 1.03, brkUp: 5 }],
];

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

mkdirSync('voice-lab', { recursive: true });
const PRE = 0.3;
const ffmpeg: string = createRequire(import.meta.url)('ffmpeg-static');
for (const [name, v] of TAKES) {
  // (each line its own seed, as the app sings them; the verse's level under the chorus's)
  const parts = sample.map((L, i) => renderFof(L, { ...v, seed: 17 + i, energy: i < verseLen ? 0.3 : 0.85 }, PRE).map((x) => x * (i < verseLen ? 0.6 : 0.85)));
  const gap = Math.round(0.5 * FOF_RATE);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length + gap; }
  const w = `voice-lab/timbre-${name}.wav`;
  writeFileSync(w, wav(out, FOF_RATE));
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', w, '-b:a', '160k', `voice-lab/timbre-${name}.mp3`]);
  unlinkSync(w);
  console.log(name, `${(out.length / FOF_RATE).toFixed(1)} s`);
}
console.log('lines:', sample.map((l) => l.map((n) => n.syl.text).join(' ')).join(' / '));
