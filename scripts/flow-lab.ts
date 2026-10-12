// The flow lab: real sung lines (a verse and a chorus of a generated rock song) in each way of joining
// syllables (sing.ts, Flow), written as WAV files to voice-lab/ to compare, with the measures of start-
// stop behind them (docs/VOCAL.md). Run: npm run flow-lab

import { mkdirSync, writeFileSync } from 'node:fs';
import { type Flow, SING_RATE, type SungNote, renderLine } from '../src/audio/sing';
import { recipeFor } from '../src/audio/voices';
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { buildTrack, defaultTrackOptions } from '../src/track';

const GENRE: Genre = 'rock';
const idea = generate({ genre: GENRE, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], {
  song: 'flow-1', chords: 'flow-1c', drums: 'flow-1d', strum: 'flow-1s', bass: 'flow-1b', vocal: 'flow-1v',
});
const track = buildTrack(idea, defaultTrackOptions(idea)) as unknown as { sections?: typeof idea[] } & (typeof idea)[];
const sections = track.sections ?? track;

/** The first two sung lines of the first verse and the first chorus, as notes in seconds. */
const lines: SungNote[][] = [];
for (const kind of ['verse', 'chorus']) {
  const sec = sections.find((s) => s.section?.kind === kind && s.vocal?.length);
  if (!sec) continue;
  const groups: NonNullable<typeof sec.vocal>[] = [];
  for (const n of sec.vocal!) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
  const six = 15 / sec.song.bpm;
  for (const L of groups.slice(0, 2)) lines.push(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })));
}

const recipe = recipeFor(GENRE);
const rate = recipe.rate ?? SING_RATE;
const PRE = 0.3;

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

/** Start-stop measures of one rendered line: silences inside it, sudden starts and stops, level steps between notes. */
function measure(a: Float32Array, notes: SungNote[]) {
  const F = Math.round(0.005 * rate), db: number[] = [];
  for (let s = 0; s + F <= a.length; s += F) { let e = 0; for (let i = s; i < s + F; i++) e += a[i] * a[i]; db.push(10 * Math.log10(e / F + 1e-12)); }
  const first = Math.round((PRE + notes[0].t) / 0.005), last = Math.round((PRE + notes[notes.length - 1].t) / 0.005);
  const ref = [...db.slice(first, last + 1)].sort((x, y) => x - y)[Math.floor((last - first) * 0.7)];
  let silences = 0, starts = 0, stops = 0, run = 0;
  for (let k = first; k <= last; k++) {
    if (db[k] < ref - 40) run++; else { if (run >= 3) silences++; run = 0; }
    if (db[k] - db[k - 1] > 15) starts++;
    if (db[k] - db[k - 1] < -15) stops++;
  }
  const steps = notes.slice(1).map((n, i) => { const p = notes[i]; return Math.abs(db[Math.round((PRE + (n.t + n.end) / 2) / 0.005)] - db[Math.round((PRE + (p.t + p.end) / 2) / 0.005)]); }).filter(Number.isFinite);
  return { silences, starts, stops, bigSteps: steps.filter((x) => x > 6).length, notes: notes.length };
}

mkdirSync('voice-lab', { recursive: true });
const FLOWS: [string, Flow | undefined][] = [['D0-as-now', undefined], ['D1-flowing', 'legato'], ['D2-word-breaks', 'words'], ['D3-phrased', 'phrases']];
for (const [name, flow] of FLOWS) {
  const parts = lines.map((notes) => renderLine(notes, { high: false, slides: 0.5, seed: 17, recipe, flow }, PRE));
  const m = parts.map((p, i) => measure(p, flow ? lines[i] : lines[i]));
  const sum = (k: keyof ReturnType<typeof measure>) => m.reduce((a, x) => a + x[k], 0);
  const gap = Math.round(0.6 * rate);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p.map((x) => x * 0.8), at); at += p.length + gap; }
  writeFileSync(`voice-lab/${name}.wav`, wav(out));
  console.log(name.padEnd(18), `silences ${sum('silences')}, sudden starts ${sum('starts')}, sudden stops ${sum('stops')}, level steps >6 dB ${sum('bigSteps')} (of ${sum('notes')} notes)`);
}
console.log('lines:', lines.map((l) => l.map((n) => n.syl.text).join(' ')).join(' / '));
