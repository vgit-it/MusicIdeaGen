// Tags for the solo writer's licks (docs/SOLO-PLAN.md): what a shape and a rhythm are like, computed from the library, nothing
// tagged by hand. The plan layer will pick paths between landings by these: how busy, how the line moves, how well the mood
// likes its intervals (the vocal's table and cost, src/verse/intervals.ts), where it ends.

import data from '../realism/solo-licks.json';
import type { Mood } from '../tension';
import { TEMP, intervalCost, profileFor } from '../verse/intervals';
import type { Rhythm } from './reallicks';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** A note shape as the library holds it: the first note's degree above the key's root, then the steps. */
export interface ShapeLike { minor: boolean; deg: number; steps: number[] }
export interface LibShape extends ShapeLike { n: number; songs: number; genres: number[] }

export const LIB_SHAPES: LibShape[] = (data.shapes as [string, number, number[], number, number[]][])
  .map(([m, deg, steps, songs, genres]) => ({ minor: m === 'm', deg, steps, n: steps.length + 1, songs, genres }));

/** The notes of a shape above the key's root. */
export const shapeRel = (s: ShapeLike): number[] => {
  const rel = [s.deg];
  for (const d of s.steps) rel.push(rel[rel.length - 1] + d);
  return rel;
};

export type Contour = 'rise' | 'fall' | 'arch' | 'dip' | 'level';

export interface ShapeTags {
  n: number;
  /** Last note minus first, in semitones. */
  net: number;
  /** Highest minus lowest. */
  span: number;
  /** Mean size of the moves (repeats left out). */
  meanMove: number;
  maxLeap: number;
  /** Shares of the moves (repeats left out): half steps, and the rough ones (half step, tritone, major 7th). */
  halfShare: number;
  roughShare: number;
  /** Notes that repeat the one before. */
  repeats: number;
  /** Share of the moves that go up. */
  up: number;
  contour: Contour;
  /** Changes of direction. */
  turns: number;
  /** A leap of 5 or more, stepped back from. */
  leapFill: boolean;
  /** Share of the notes outside the pentatonic box of the shape's mode. */
  outside: number;
  startDeg: number;
  endDeg: number;
  /** Ends on the root, 3rd or 5th. */
  strongEnd: boolean;
}

const BOX = { m: [0, 3, 5, 7, 10], M: [0, 2, 4, 7, 9] };
const ROUGH = [1, 6, 11];

export function shapeTags(s: ShapeLike): ShapeTags {
  const p = shapeRel(s), n = p.length;
  const moves = p.slice(1).map((x, i) => x - p[i]).filter((d) => d !== 0);
  const sizes = moves.map(Math.abs);
  const hi = Math.max(...p), lo = Math.min(...p), net = p[n - 1] - p[0];
  const hiAt = p.indexOf(hi), loAt = p.indexOf(lo);
  let contour: Contour = 'level';
  if (hi - lo >= 1) {
    if (hiAt > 0 && hiAt < n - 1 && hi - Math.max(p[0], p[n - 1]) >= 2) contour = 'arch';
    else if (loAt > 0 && loAt < n - 1 && Math.min(p[0], p[n - 1]) - lo >= 2) contour = 'dip';
    else if (net >= 2) contour = 'rise';
    else if (net <= -2) contour = 'fall';
  }
  let turns = 0, leapFill = false;
  for (let i = 1; i < moves.length; i++) {
    if (moves[i] * moves[i - 1] < 0) turns++;
    if (Math.abs(moves[i - 1]) >= 5 && moves[i] * moves[i - 1] < 0 && Math.abs(moves[i]) <= 3) leapFill = true;
  }
  const box = BOX[s.minor ? 'm' : 'M'];
  const k = Math.max(1, moves.length);
  return {
    n, net, span: hi - lo,
    meanMove: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
    maxLeap: sizes.length ? Math.max(...sizes) : 0,
    halfShare: sizes.filter((d) => d === 1).length / k,
    roughShare: sizes.filter((d) => ROUGH.includes(d % 12)).length / k,
    repeats: n - 1 - moves.length,
    up: moves.length ? moves.filter((d) => d > 0).length / moves.length : 0.5,
    contour, turns, leapFill,
    outside: p.filter((x) => !box.includes(mod(x, 12))).length / n,
    startDeg: mod(p[0], 12), endDeg: mod(p[n - 1], 12),
    strongEnd: [0, 3, 4, 7].includes(mod(p[n - 1], 12)),
  };
}

export type Busyness = 'sparse' | 'steady' | 'busy' | 'frantic';

export interface RhythmTags {
  n: number;
  /** Notes a beat over the whole lick (its last note counted for its tail). */
  perBeat: number;
  busyness: Busyness;
  /** The shortest note, in 16ths. */
  shortest: number;
  /** Share of the gaps that are a 16th. */
  quick: number;
  /** Share of the notes off the beat (the lick starts `off` 16ths past a beat). */
  offBeat: number;
  /** The last note is held a beat or more. */
  endsLong: boolean;
  /** How many different note lengths. */
  lengths: number;
}

/** Cut at about the library's quarters (median 1.6 a beat, 90th percentile 2.7). */
export const busynessOf = (perBeat: number): Busyness => (perBeat < 1.4 ? 'sparse' : perBeat < 1.9 ? 'steady' : perBeat < 2.6 ? 'busy' : 'frantic');

export function rhythmTags(r: Pick<Rhythm, 'off' | 'ons' | 'tail'>): RhythmTags {
  const ons = r.ons, n = ons.length;
  const lens = ons.map((o, i) => (i + 1 < n ? ons[i + 1] - o : r.tail));
  const perBeat = (n * 4) / (ons[n - 1] + r.tail);
  return {
    n, perBeat, busyness: busynessOf(perBeat),
    shortest: Math.min(...lens),
    quick: n > 1 ? lens.slice(0, -1).filter((g) => g <= 1).length / (n - 1) : 0,
    offBeat: ons.filter((o) => mod(r.off + o, 4) !== 0).length / n,
    endsLong: r.tail >= 4,
    lengths: new Set(lens).size,
  };
}

/**
 * The shape's intervals scored by the mood (the vocal's table and cost, rule 46): the mean cost of its moves, lower is better.
 * `tension` (0-1) makes the rough intervals count less against it and the size bigger. Repeated notes are left out: the cost
 * of a repeat has no size or direction in it, so they would win for every mood (a repeat is for the variety rules to weigh).
 */
export function moodCost(s: ShapeLike, mood: Mood, tension = 0.5): number {
  const p = shapeRel(s), P = profileFor(mood, 'solo', tension);
  let c = 0, k = 0;
  for (let i = 1; i < p.length; i++) {
    if (p[i] === p[i - 1]) continue;
    c += intervalCost(P, p[i - 1], p[i], i >= 2 ? p[i - 1] - p[i - 2] : 0, i === p.length - 1);
    k++;
  }
  return k ? c / k : 0;
}

const MEAN = new Map<string, number>();
const meanCost = (mood: Mood, tension: number) => {
  const key = `${mood}|${tension}`;
  let m = MEAN.get(key);
  if (m === undefined) { m = LIB_SHAPES.reduce((a, s) => a + moodCost(s, mood, tension), 0) / LIB_SHAPES.length; MEAN.set(key, m); }
  return m;
};

/**
 * How well the mood likes the shape's intervals against the library's average: 1 is average, above 1 suits the mood, below doesn't
 * (a weight to multiply a pick's chance by). `tension` is rounded to a quarter.
 */
export function moodFit(s: ShapeLike, mood: Mood, tension = 0.5): number {
  const t = Math.round(tension * 4) / 4;
  return Math.exp(-(moodCost(s, mood, t) - meanCost(mood, t)) / TEMP);
}
