// The band plays a written track: each player reads the whole song and plays their part their way
// (drummer first, then the bassist listening to them, then the guitarists). On top, the band shares
// one groove: straight, or a slight lilt (the in-between 16ths a touch late), and the strummer sits
// with the drummer (a little behind a laid-back drummer, a little ahead of a pushing one).

import type { Genre } from '../genres';
import type { Idea } from '../idea';
import { Rng } from '../rng';
import { playBass } from './bassist';
import { type Feel, playDrums } from './drummer';
import { playGuitars } from './guitarists';

/** How much the band lilts, as a share of a 16th (genres that already swing don't). */
const LILT: Record<Genre, [number, number][]> = {
  rock: [[0, 2], [0.06, 2], [0.12, 1]],
  pop: [[0, 2], [0.06, 2], [0.12, 1]],
  grunge: [[0, 1], [0.06, 1]],
  funk: [[0, 1]],
  hardrock: [[0, 3], [0.06, 1]],
  metal: [[0, 1]],
  altmetal: [[0, 3], [0.06, 1]],
};
const STRUM_MS: Record<Feel, number> = { ahead: -3, on: 0, behind: 6 };

/** The band plays every section of a track (in place). `seed`: who's in the band. */
export function playBand(sections: Idea[], seed: string) {
  const drummer = playDrums(sections, seed);
  playBass(sections, seed, drummer);
  playGuitars(sections, seed);
  const song = sections[0].song;
  const lilt = song.swing ? 0 : new Rng(`${seed}-groove`).weighted(LILT[song.partGenres.drums]);
  for (const idea of sections) {
    idea.lilt = lilt;
    if (!idea.guitar) idea.strumFeel = STRUM_MS[drummer];
  }
  if (lilt) sections[0].notes.push(`Band feel: the band ${lilt > 0.1 ? 'lilts' : 'lilts a little'}: the in-between 16ths come a touch late`);
}
