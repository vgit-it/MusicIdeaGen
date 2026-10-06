// Strumming / comping pattern on the 16th grid.

import type { Genre } from '../genres';
import type { ChordPart, Song, Stroke } from '../idea';
import type { Rng } from '../rng';
import { type Variant, groupStarts, phrasePlan } from '../rhythm';

function strumBar(rng: Rng, len: number, groups: number[], genre: Genre, w: number): Stroke[] {
  const st = groupStarts(groups);
  const a: Stroke[] = new Array(len).fill('.');
  // rock: some bars chug palm-muted 8ths with open accents on the beat groups
  const chug = genre === 'rock' && rng.chance(0.4);
  for (let i = 0; i < len; i++) {
    const isStart = st.includes(i), even = i % 2 === 0;
    if (genre === 'rock') {
      if (chug) {
        if (isStart) a[i] = 'D';
        else if (even) a[i] = rng.chance(0.85) ? 'p' : 'D';
      } else if (even) a[i] = !isStart && rng.chance(0.12 + w * 0.2) ? 'x' : 'D';
      else if (rng.chance(0.08 + w * 0.2)) a[i] = 'U';
    }
    if (genre === 'pop') {
      if (isStart) a[i] = 'D';
      else if (even && rng.chance(0.4)) a[i] = 'D';
      else if (!even && rng.chance(0.22)) a[i] = 'U';
    }
    if (genre === 'funk') {
      if (isStart && rng.chance(0.6)) a[i] = 'D';
      else if (rng.chance(0.55)) a[i] = rng.chance(0.28) ? (even ? 'D' : 'U') : 'x';
    }
  }
  if (w < 0.5) a[0] = 'D';
  return a;
}

function varyStrum(rng: Rng, p: Stroke[], genre: Genre, w: number): Stroke[] {
  const pool: Stroke[] = genre === 'rock' ? ['D', 'U', 'x', 'p'] : ['D', 'U', 'x'];
  return p.map((ch, i) => (i > 0 && rng.chance(0.12 + w * 0.2) ? (ch === '.' ? rng.pick(pool) : '.') : ch));
}

export function generateStrum(rng: Rng, song: Song, chords: ChordPart): Stroke[] {
  const { w, bars, total, groupsFor } = song;
  const genre = song.partGenres.strum;

  const sVar: Record<string, Record<Variant, Stroke[]>> = {};
  for (const [m, gr] of Object.entries(groupsFor)) {
    const len = gr.reduce((a, b) => a + b, 0);
    const A = strumBar(rng, len, gr, genre, w);
    sVar[m] = {
      A,
      A2: varyStrum(rng, A, genre, w),
      B: strumBar(rng, len, gr, genre, w),
      C: varyStrum(rng, strumBar(rng, len, gr, genre, w), genre, w),
    };
  }
  const plan = rng.chance(0.5) ? song.plan : phrasePlan(rng, w);
  const strum = bars.flatMap((b, i) => sVar[b.meter][plan[i]]);

  for (const c of song.cycles) {
    if (c.part !== 'strum') continue;
    const cyc: Stroke[] = ['D', ...Array.from({ length: c.len - 1 }, () => rng.pick<Stroke>(['.', '.', 'x', 'U', 'D']))];
    for (let g = 0; g < total; g++) strum[g] = cyc[g % c.len];
  }

  // every chord change should be heard
  for (const e of chords.timeline) if (strum[e.step] === '.' || strum[e.step] === 'x') strum[e.step] = 'D';
  return strum;
}
