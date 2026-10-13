// The level lab: how steady the singer's loudness is through whole songs (Paul: "the max volume of vocals
// to remain more or less similar throughout the song and not jump around wildly"). Every lead line of a
// few songs rendered as the app sings them (the FOF singer, polished), measured note by note (each note's
// loudest 50 ms, dB) and line by line; plus the high notes (belts, screams, jumps up) and how long they
// hold. Run: npm run level-lab (SONGS: how many per genre, default 1; RAW=1: not polished)
import { lagFor, perform } from '../src/audio/feel';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import { polishVoice } from '../src/audio/polish';
import { polishFor } from '../src/audio/singer';
import { fofFor } from '../src/audio/voices';
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { buildTrack, defaultTrackOptions } from '../src/track';

const GENRES: Genre[] = (process.env.GENRES?.split(",") as Genre[] | undefined) ?? ['rock', 'pop', 'grunge', 'metal'];
const SONGS = Number(process.env.SONGS ?? 1);
const PRE = 0.3;
const db = (x: number) => 20 * Math.log10(x + 1e-9);
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const allSec: number[] = [];
let all: number[] = [], allLine: number[] = [];
for (const g of GENRES) for (let s = 0; s < SONGS; s++) {
  const seed = `${g}-${s}`;
  const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], { song: seed, chords: `${seed}c`, drums: `${seed}d`, strum: `${seed}s`, bass: `${seed}b`, vocal: `${seed}v` });
  const tr = buildTrack(idea, defaultTrackOptions(idea)) as any;
  const noteDb: number[] = [], lineDb: number[] = [], rows: string[] = [], secBody: number[] = [];
  for (const sec of tr.sections ?? tr) {
    const v = (sec.vocal ?? []) as any[];
    if (!v.length) continue;
    const six = 15 / sec.song.bpm;
    const energy = (sec.section.energy - 1) / 4;
    const secNotes: number[] = [];
    const groups: any[][] = [];
    for (const n of v) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
    for (const L of groups) {
      const notes = perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7);
      let pcm = renderFof(notes, { ...fofFor((sec.vocalTimbre && sec.vocalTimbre !== 'clear' ? sec.vocalTimbre : g) as Genre, 3, false), energy }, PRE);
      if (!process.env.RAW) pcm = polishVoice(pcm, FOF_RATE, polishFor(sec, true));
      const W = Math.round(0.05 * FOF_RATE);
      const loud = (a: number, b: number) => { let best = 0; for (let i = Math.max(0, a); i + W <= Math.min(pcm.length, b); i += W >> 1) { let e = 0; for (let k = i; k < i + W; k++) e += pcm[k] * pcm[k]; best = Math.max(best, Math.sqrt(e / W)); } return db(best); };
      const per = notes.map((n) => loud(Math.round((PRE + n.t) * FOF_RATE), Math.round((PRE + n.end) * FOF_RATE)));
      const lmax = Math.max(...per.filter(Number.isFinite));
      lineDb.push(lmax);
      per.forEach((d) => { if (d > -60) { noteDb.push(d); secNotes.push(d); } });
      rows.push(`  ${sec.section.kind.padEnd(9)} line max ${lmax.toFixed(1)}  notes ${per.map((d, k) => `${Math.round(d)}${L[k].belt ? "B" : ""}${process.env.MIDI ? `(${L[k].midi},${L[k].vel},${L[k].syl.vowel})` : ""}`).join(" ")}`);
    }
    if (secNotes.length) secBody.push(pct(secNotes, 0.75));
  }
  allSec.push(Math.max(...secBody) - Math.min(...secBody));
  console.log(`${seed}: sections' loud body (75th pct of notes) range ${(Math.max(...secBody) - Math.min(...secBody)).toFixed(1)} dB, line max spread (90th-10th) ${(pct(lineDb, 0.9) - pct(lineDb, 0.1)).toFixed(1)} dB, note loudest-quarter spread ${(pct(noteDb, 0.95) - pct(noteDb, 0.5)).toFixed(1)} dB (95th-50th)`);
  if (process.env.SHOW) console.log(rows.join('\n'));
  all = all.concat(noteDb); allLine = allLine.concat(lineDb.map((x) => x - Math.max(...lineDb)));
}
console.log(`ALL: sections' body range avg ${(allSec.reduce((a, b) => a + b, 0) / allSec.length).toFixed(1)} dB; line max 10th-90th ${(pct(allLine, 0.9) - pct(allLine, 0.1)).toFixed(1)} dB; notes 50th-95th ${(pct(all, 0.95) - pct(all, 0.5)).toFixed(1)} dB, 10th-95th ${(pct(all, 0.95) - pct(all, 0.1)).toFixed(1)} dB`);
