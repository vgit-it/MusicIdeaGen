// Bass line: follows chord roots, locks to the kick, approaches the next chord.

import { GENRES } from '../genres';
import type { ChordPart, DrumPart, Song } from '../idea';
import type { Rng } from '../rng';
import { zeros } from '../rhythm';
import { type Chord, chordPc } from '../theory';

export function generateBass(rng: Rng, song: Song, chords: ChordPart, drums: DrumPart): number[] {
  const { w, total, key } = song;
  const bs = GENRES[song.partGenres.bass].bass;
  const { timeline, chordIdx } = chords;
  const B = zeros(total);

  // root between G1 and G2
  const bassRoot = (c: Chord) => {
    let m = 36 + chordPc(key, c);
    if (m > 43) m -= 12;
    return m;
  };

  for (let g = 0; g < total; g++) {
    const c = timeline[chordIdx[g]].chord, r = bassRoot(c);
    const change = g === 0 || chordIdx[g] !== chordIdx[g - 1];
    const nxtI = chordIdx[(g + 1) % total], nextChange = nxtI !== chordIdx[g];
    if (change) B[g] = r;
    else if (nextChange && rng.chance(0.25 + w * 0.4)) B[g] = bassRoot(timeline[nxtI].chord) + rng.pick([-1, -1, 1, 2]);
    else if (drums.kick[g] && rng.chance(bs.lock)) B[g] = rng.chance(bs.oct) ? r + 12 : rng.chance(bs.fifth) ? r + 7 : r;
    else if (g % 2 === 1 && rng.chance(bs.six * (0.6 + w))) B[g] = rng.chance(0.5) ? r + 12 : r;
    if (B[g] && !change && rng.chance(w * 0.12)) B[g] = r + rng.pick([2, 3, 5, 10]);
  }
  return B;
}
