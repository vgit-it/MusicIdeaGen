// The realism targets (docs/REALISM.md): the Lakh MIDI collection's vocal lines measured per genre (artists
// tagged by hand), written to src/realism/targets.json. Numbers only: no notes, phrases or lyrics leave
// the collection. Songs read by lakh-songs.ts (docs/STUDY-LAKH.md).
// Run: npm run realism-targets [-- <MidiCollection>]   (default experiments/MidiCollection)
import fs from 'node:fs';
import { type SongMeasure, measureSong, profile } from '../../src/realism/measure';
import { forEachSong } from './lakh-songs';

const root = process.argv[2] ?? 'experiments/MidiCollection';
const by: Record<string, SongMeasure[]> = { all: [] };
const empty = new Set<number>();
const files = forEachSong(root, ({ genre: g, mel, tonic, minor, slots }) => {
  const ms = measureSong({ notes: mel, tonic, minor, bandAt: (t) => slots[Math.round(t * 4)] ?? empty });
  // (per genre, and per genre and mode: major or minor)
  const mode = minor ? 'minor' : 'major';
  for (const k of ['all', `all/${mode}`, ...(g ? [g, `${g}/${mode}`] : [])]) (by[k] ??= []).push(ms);
});
const out: Record<string, unknown> = {
  source: 'Lakh MIDI Dataset, clean set (Colin Raffel, CC-BY 4.0): vocal/melody tracks, 4/4, one version per song. Aggregate numbers only (docs/REALISM.md).',
};
for (const [g, ms] of Object.entries(by)) out[g] = profile(ms);
fs.writeFileSync('src/realism/targets.json', JSON.stringify(out, null, 1));
console.log(`${files} files read; songs per genre:`, Object.fromEntries(Object.entries(by).map(([g, m]) => [g, m.length])));
