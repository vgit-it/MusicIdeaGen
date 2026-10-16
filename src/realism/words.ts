// How real singers set their words (docs/WORDS-REAL.md, src/realism/words.json, mined by scripts/study/lakh-words.ts
// from songs with timed syllables): syllables a second, how much slower a chorus's lines are, lines ending on a soft
// syllable, syllables stretched over 2+ notes. By genre, thin genres leaning on all songs. For Rhythm Words with the
// Real songs switch.

import type { Genre } from '../genres';
import data from './words.json';

export interface RealWords { rate: number; chorus: number; fem: number; melisma: number }

const G = data.genres as Record<string, Record<string, number>>;
/** How many songs a genre needs to stand on its own (fewer: leaning on all songs). */
const OWN = 40;

export function realWords(genre: Genre): RealWords {
  const all = G.all, g = G[genre];
  const w = g?.rate !== undefined && g.chorusRate !== undefined ? g.songs / (g.songs + OWN) : 0;
  const v = (k: string) => w * (g?.[k] ?? all[k]) + (1 - w) * all[k];
  return { rate: v('rate'), chorus: v('chorusRate'), fem: v('fem'), melisma: v('melisma') };
}
