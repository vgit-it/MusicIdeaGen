// Signature moves for the Shaped melody (docs/VOCAL-MOVES.md): melodic tricks real songs are known for,
// abstracted as rules. Each song gets a few, by its genre (its signature), so no two songs sing the same
// way; or one chosen in the vocal row (Moves). Paul: Shaped "mostly too tame ... not much variation from
// song to song"; "read up on some cool vocal melody things that some specific songs might have employed".

import type { Genre } from '../genres';
import { Rng } from '../rng';

export type MoveId =
  | 'sigh' | 'ninth' | 'suspension' | 'appoggiatura' | 'cliche' | 'lydian' | 'flat7' | 'nohome' | 'sour' | 'blue' | 'phrygian' | 'falls'
  | 'pedal' | 'monotone' | 'octave' | 'whoop' | 'flip' | 'sequence' | 'upupdown' | 'belt';

/** A move: its name and the song it's known from (for the notes and the menu). */
export const MOVES: Record<MoveId, { label: string; from: string }> = {
  sigh: { label: 'The 6-5 sigh', from: 'Bowie, "Space Oddity"' },
  ninth: { label: 'The 9th, falling to the root', from: 'the Beatles, "You Never Give Me Your Money"' },
  suspension: { label: 'The 4-3 over V', from: 'Bon Jovi, "Livin\' on a Prayer"' },
  appoggiatura: { label: 'Chills at the peak (appoggiaturas)', from: 'Adele, "Someone Like You"' },
  cliche: { label: 'The line cliché (1, 7, b7, 6)', from: 'the Beatles, "Something"' },
  lydian: { label: 'The Lydian #4', from: 'Fleetwood Mac, "Dreams"' },
  flat7: { label: 'Landing on the b7', from: 'Lorde, "Royals"' },
  nohome: { label: 'Never landing home', from: 'Katy Perry, "Teenage Dream"' },
  sour: { label: 'Sour endings', from: 'Nirvana (In Utero)' },
  blue: { label: 'Blue notes bent up', from: 'the Rolling Stones, "Satisfaction"' },
  phrygian: { label: 'The dark flat 2nd', from: 'Pink Floyd, "Set the Controls..."' },
  falls: { label: 'Slides and falls', from: 'Layne Staley, Chris Cornell' },
  pedal: { label: 'One note over moving chords', from: 'Oasis, "Wonderwall"' },
  monotone: { label: 'The one-note verse', from: 'the Killers, "Mr. Brightside"' },
  octave: { label: 'The octave-leap hook', from: '"Over the Rainbow"' },
  whoop: { label: 'The whoop (5-3-5-3)', from: 'Katy Perry, "California Gurls"' },
  flip: { label: 'Verse falls, chorus rises', from: 'Adele, "Rolling in the Deep"' },
  sequence: { label: 'The sequence (a line, a step lower)', from: 'Train, "50 Ways to Say Goodbye"' },
  upupdown: { label: 'Up, up, up, down', from: 'Nirvana, "Lithium"' },
  belt: { label: 'A low talky verse, a belted chorus', from: 'Linkin Park, "Numb"' },
};
export const MOVE_IDS = Object.keys(MOVES) as MoveId[];

/** By genre: the colour moves (notes against the chord), the shapes, the extras a song picks from. */
const BY_GENRE: Record<Genre, { colour: MoveId[]; shape: MoveId[]; extra: MoveId[] }> = {
  pop: { colour: ['sigh', 'nohome', 'lydian', 'ninth', 'cliche'], shape: ['flip', 'octave', 'whoop', 'sequence'], extra: ['monotone', 'pedal'] },
  rock: { colour: ['suspension', 'flat7', 'blue', 'sigh'], shape: ['octave', 'flip', 'sequence'], extra: ['monotone', 'falls'] },
  funk: { colour: ['flat7', 'blue'], shape: ['monotone', 'flip', 'sequence'], extra: ['pedal'] },
  hardrock: { colour: ['suspension', 'blue', 'flat7'], shape: ['octave', 'belt', 'flip'], extra: ['falls'] },
  metal: { colour: ['phrygian', 'suspension'], shape: ['belt', 'octave', 'upupdown'], extra: ['falls'] },
  grunge: { colour: ['sour', 'ninth', 'phrygian'], shape: ['pedal', 'upupdown', 'belt'], extra: ['falls', 'monotone'] },
  altmetal: { colour: ['sour', 'phrygian', 'ninth'], shape: ['belt', 'monotone', 'upupdown'], extra: ['falls', 'pedal'] },
};

/**
 * A song's signature: one colour move, one shape, maybe an extra (half the songs), and now and then the
 * chills at its peak; or the one move chosen in the menu. (The borrowed chord's b6 is always on: it isn't
 * a signature, it's what makes a borrowed chord heard.)
 */
export function pickMoves(seed: string, genre: Genre, chosen?: MoveId): MoveId[] {
  if (chosen) return [chosen];
  const rng = new Rng(`${seed}-moves`);
  const G = BY_GENRE[genre];
  const out: MoveId[] = [rng.pick(G.colour), rng.pick(G.shape)];
  if (G.extra.length && rng.chance(0.5)) out.push(rng.pick(G.extra));
  if (genre !== 'funk' && rng.chance(0.3)) out.push('appoggiatura');
  return [...new Set(out)];
}

/** For the notes: "the 6-5 sigh (Bowie, "Space Oddity"), ...". */
export const movesDesc = (ms: MoveId[]) => ms.map((m) => `${MOVES[m].label.toLowerCase()} (${MOVES[m].from})`).join('; ');
