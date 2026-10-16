// Rhythm guitar study (docs/STUDY-RHYTHM.md): the app's own songs as MIDI files, to be measured by the same code as the real
// songs (scripts/study/rhythm-measure.cjs). Run: npm run rhythm-study (N songs per genre, default 24; OUT: the folder)
import { mkdirSync, writeFileSync } from 'node:fs';
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';
import { toMidi } from '../../src/export/midi';

const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const N = Number(process.env.N ?? 24), OUT = process.env.OUT ?? 'app-midi';
for (const g of GENRES) {
  mkdirSync(`${OUT}/${g}`, { recursive: true });
  for (let i = 0; i < N; i++) {
    const s = `${g}-study-${i}`;
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...(process.env.STRUM_MIX ? { strumMix: true } : {}) } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, { ...defaultTrackOptions(idea), ...(process.env.GUITAR_PLAN ? { guitarPlan: 'on' as const } : {}) });
    const id = g === 'pop' || g === 'funk' ? 'electric-clean' : g === 'rock' ? 'electric-crunch' : 'electric-dist';
    const bytes = toMidi(tr.sections, { chordIdFor: () => id, guitar2IdFor: () => id, vocal: 'off', backing: 'off' });
    writeFileSync(`${OUT}/${g}/${s}.mid`, bytes);
  }
}
console.log('wrote', GENRES.length * N, 'files to', OUT);
