// Verse vs chorus from real songs (docs/ARC.md, src/realism/arc.json, mined by scripts/study/lakh-sections.ts):
// how a song's chorus differs from its verse, as real songs spread it. Each song gets its own, drawn from that
// spread (by genre, thin genres leaning on all songs): most choruses only a little higher than the verse (median
// under a semitone; a quarter 2 or more higher, a quarter a little lower), a little sparser, notes a little longer;
// the song's top note in its last chorus only now and then.

import type { Genre } from '../genres';
import type { Rng } from '../rng';
import data from './arc.json';

/** A song's chorus against its verse: `height` semitones higher, `pace` x as many notes a beat, `len` x as long; its top note saved for the last chorus (`climax`). */
export interface RealArc { height: number; pace: number; len: number; climax: boolean }

type Row = Record<string, number>;
const G = data.genres as Record<string, Row>;
/** How many songs a genre needs to stand on its own (fewer: leaning on all songs). */
const OWN = 40;

/** A value drawn from a measured spread (its quartiles; the tails as far again as half the middle). */
function draw(r: Row, k: string, u: number): number {
  const lo = r[`${k}P25`], m = r[k], hi = r[`${k}P75`];
  const pts: [number, number][] = [[0, lo - 1.5 * (m - lo)], [0.25, lo], [0.5, m], [0.75, hi], [1, hi + 1.5 * (hi - m)]];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((u - x0) / (x1 - x0)) * (y1 - y0); }
  return pts[pts.length - 1][1];
}

export function realArc(genre: Genre, rng: Rng): RealArc {
  const all = G.all, g = G[genre];
  const w = g?.heightP25 !== undefined ? g.songs / (g.songs + OWN) : 0;
  const pick = (k: string) => { const u = rng.next(); return w * draw(g ?? all, k, u) + (1 - w) * draw(all, k, u); };
  return { height: pick('height'), pace: Math.max(0.6, pick('pace')), len: Math.max(0.7, pick('len')), climax: rng.chance(all.topInLastChorus) };
}
