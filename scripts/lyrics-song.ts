// A whole song's sung words, as the app writes them (the verse writer by default): build an idea, make a track, print each section's lines.
// Run: npm run lyrics-song -- [seed] [genre]

import { MAIN_METHOD, generate, randomSeeds } from '../src/generator';
import { buildTrack } from '../src/track';
import { spell } from '../src/parts/lyrics';
import type { GenreSel } from '../src/idea';

const seed = process.argv[2] ?? 'words1';
const genre = (process.argv[3] ?? 'rock') as GenreSel;
const seeds = { ...randomSeeds(), chords: seed, song: seed };
const idea = generate({ genre, meter: '4/4', weirdness: 0.3, bpm: 110, chords: undefined, ...MAIN_METHOD } as never, seeds);
const track = buildTrack(idea);
for (const sec of track.sections) {
  const v = sec.vocal;
  if (!v?.length) continue;
  console.log(`\n${sec.kind} (${v.length} notes)`);
  let line: typeof v = [];
  let last = -1;
  for (const n of v) {
    if (last >= 0 && n.step - last > 6) { console.log('  ' + spell(line.map((x) => x.syl!))); line = []; }
    line.push(n); last = n.step;
  }
  if (line.length) console.log('  ' + spell(line.map((x) => x.syl!)));
}
