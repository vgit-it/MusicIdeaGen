// Rule 46, intervals by mood (docs/INTERVALS.md): which intervals the vocal sings, so the mood is in how the line moves, not only
// in its hooks, endings and register. Small steps are calm, sad and intimate; leaps are excited, dramatic or angry; falling relaxes
// and mourns, rising reaches and hopes; a big leap wants a step back the other way; minor 2nds and tritones are rough, 3rds and
// 6ths warm. The scale decides the colour; the intervals decide the energy and the feeling.
// It stands alone: it reads the mood, the section's kind and the song's tension curve, and nothing from the other mood notes.
//   - the octave a core note is sung in is chosen by how much the mood likes the interval from the note before (voiceLead, rule 6/25)
//   - the neighbour notes (rule 8) go the way the mood likes, and a quiet mood has more of them (fewer repeated notes)

import type { Mood } from '../tension';

/** One mood's five dials, and how much it leans on the neighbour notes (a share of the usual: fewer repeats when above 1). */
export interface Profile {
  /** How much the mood likes each interval, 0 (a repeat) to 12 (an octave or more). 1 = no opinion. */
  w: readonly number[];
  /** The size of a move it aims at, in semitones (repeats not counted). */
  size: number;
  /** The share of moves that go up. */
  up: number;
  /** The chance a leap (5 semitones or more) is followed by a step back the other way. */
  fill: number;
  /** How hard the profile leans against the smoothest step, 0-1. */
  strength: number;
  /** Times the chance of a neighbour note. */
  nb: number;
}

//                          0    1    2    3    4    5    6    7    8    9   10   11   12
const W: Record<Mood, number[]> = {
  happy:       [1.0, 0.4, 1.2, 0.8, 1.6, 1.4, 0.1, 1.3, 0.4, 1.3, 0.3, 0.1, 0.8],
  melancholic: [1.0, 1.5, 1.4, 1.6, 0.6, 0.7, 0.2, 0.4, 1.2, 0.4, 0.3, 0.2, 0.2],
  nostalgic:   [0.8, 0.8, 1.3, 1.1, 1.0, 1.0, 0.1, 0.7, 1.2, 1.5, 0.4, 0.3, 0.4],
  tense:       [1.6, 1.8, 0.9, 1.0, 0.5, 0.7, 1.2, 0.5, 0.6, 0.3, 0.5, 0.6, 0.3],
  angry:       [1.8, 1.2, 0.8, 1.0, 0.6, 1.5, 0.8, 1.5, 0.5, 0.3, 0.7, 0.3, 1.2],
  dreamy:      [0.6, 0.4, 1.5, 0.9, 1.1, 1.0, 0.2, 0.9, 0.7, 1.4, 0.6, 1.2, 0.6],
  triumphant:  [0.9, 0.3, 1.1, 0.6, 1.4, 1.6, 0.1, 1.7, 0.4, 1.0, 0.3, 0.1, 1.3],
  dark:        [1.3, 1.7, 1.0, 1.3, 0.4, 0.8, 1.1, 0.7, 1.3, 0.2, 0.6, 0.4, 0.4],
};
const BASE: Record<Mood, Omit<Profile, 'w'>> = {
  happy:       { size: 3.5, up: 0.60, fill: 0.80, strength: 0.95, nb: 1.0 },
  melancholic: { size: 2.2, up: 0.40, fill: 0.90, strength: 0.95, nb: 1.2 },
  nostalgic:   { size: 3.0, up: 0.45, fill: 0.90, strength: 0.95, nb: 1.1 },
  tense:       { size: 2.5, up: 0.60, fill: 0.50, strength: 0.95, nb: 0.7 },
  angry:       { size: 4.5, up: 0.50, fill: 0.60, strength: 0.95, nb: 0.6 },
  dreamy:      { size: 3.2, up: 0.50, fill: 0.50, strength: 0.95, nb: 1.3 },
  triumphant:  { size: 4.8, up: 0.65, fill: 0.75, strength: 0.95, nb: 0.9 },
  dark:        { size: 2.6, up: 0.35, fill: 0.80, strength: 0.95, nb: 0.8 },
};
const ROUGH = [1, 6, 11];

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * The profile of a mood in a kind of section, at a tension (0-1; left out: no change). A chorus reaches further and higher, a verse
 * stays closer, a pre-chorus climbs; the more tension, the rougher the intervals, the bigger and the higher.
 */
export function profileFor(mood: Mood, kind: string, tension?: number): Profile {
  const b = BASE[mood];
  let size = b.size, up = b.up;
  if (kind === 'chorus') { size *= 1.2; up += 0.05; } else if (kind === 'verse') size *= 0.9; else if (kind === 'prechorus') up += 0.1;
  let w = W[mood];
  if (tension !== undefined) {
    size *= 0.85 + 0.3 * tension;
    up += 0.1 * (tension - 0.5);
    const f = 0.6 + 0.8 * tension;
    w = w.map((x, i) => (ROUGH.includes(i) ? x * f : x));
  }
  return { w, size, up: clamp(up, 0.1, 0.9), fill: b.fill, strength: b.strength, nb: b.nb };
}

/** What the writer holds for one leaf: the profile at a step (the tension moves it), and the dice. */
export interface IntervalCtx {
  at: (step: number) => Profile;
  seed: string;
  /** The key, and the notes of its scale (or the pentatonic option's): a core note may be sung on any chord note that is in them. */
  key: number;
  scale: ReadonlySet<number>;
  /** The phrases of the leaf: the last core note of each is reached in the direction the mood leans. */
  phrases: { step: number; len: number }[];
}

/** The pitch is picked by weighted chance among the chord notes in the key, each in every octave, `exp(-cost / TEMP)`. */
export const TEMP = 2;
/** What the chord note drawn earlier (by the tone weights, the mood notes, the bass) is worth against another one: a lead, in the same units as the costs. */
export const STICK = 0.5;

/**
 * The cost (lower is better) of singing `m` after `prev`, in the mood's terms: how little it likes the interval, how far the size is
 * from the one it aims at, going the way it doesn't lean, going on after a leap instead of stepping back. `lastMove` is the move into
 * `prev`; `end` marks the last core note of a phrase, which leans harder on direction.
 */
export function intervalCost(P: Profile, prev: number, m: number, lastMove: number, end: boolean): number {
  const d = m - prev, a = Math.abs(d);
  let c = -Math.log(P.w[Math.min(12, a)]) + (a > 12 ? 0.7 : 0);
  if (a > 0) {
    c += 0.3 * Math.abs(a - P.size);
    c -= 3 * Math.log(d > 0 ? P.up : 1 - P.up);
    if (Math.abs(lastMove) >= 5) c += lastMove * d > 0 ? 2 * P.fill : a <= 3 ? -0.8 * P.fill : 0;
    if (end) { const u = clamp(0.5 + (P.up - 0.5) * 1.6, 0.1, 0.9); c -= 1.2 * Math.log(d > 0 ? u : 1 - u); }
  }
  return c;
}
