// Meters, beat groupings and phrase plans. Grid unit = one 16th note.

import type { Rng } from '../rng';

export interface MeterDef {
  /** Bar length in 16ths. */
  len: number;
  /** Possible beat groupings (in 16ths), e.g. 7/8 as 4+4+6. */
  groups: number[][];
}

export const METERS: Record<string, MeterDef> = {
  '2/4': { len: 8, groups: [[4, 4]] },
  '4/4': { len: 16, groups: [[4, 4, 4, 4]] },
  '3/4': { len: 12, groups: [[4, 4, 4]] },
  '6/8': { len: 12, groups: [[6, 6]] },
  '5/4': { len: 20, groups: [[4, 4, 4, 4, 4], [6, 4, 6, 4]] },
  '5/8': { len: 10, groups: [[6, 4], [4, 6]] },
  '7/8': { len: 14, groups: [[4, 4, 6], [6, 4, 4], [4, 6, 4]] },
  '9/8': { len: 18, groups: [[4, 4, 4, 6], [6, 6, 6]] },
  '7/4': { len: 28, groups: [[4, 4, 4, 4, 4, 4, 4], [8, 6, 8, 6]] },
  '11/8': { len: 22, groups: [[4, 4, 6, 4, 4], [6, 6, 4, 6]] },
};

export const METER_CHOICES = ['4/4', '3/4', '6/8', '5/4', '5/8', '7/8', '9/8', '7/4', '11/8'];

const MIXES = [
  ['4/4', '3/4'], ['3/4', '4/4', '4/4'], ['7/8', '4/4'], ['5/4', '4/4'],
  ['7/8', '7/8', '7/8', '2/4'], ['6/8', '5/8'], ['4/4', '4/4', '4/4', '2/4'],
];

/** 'auto' picks by weirdness, 'mixed' picks a repeating meter sequence. */
export function pickMeters(rng: Rng, sel: string, w: number, altMeters: string[]): string[] {
  if (sel === 'mixed') return rng.pick(MIXES);
  if (sel !== 'auto') return [sel];
  const r = rng.next();
  if (w < 0.3) return r < 0.85 ? ['4/4'] : [rng.pick(altMeters)];
  if (w < 0.65) {
    return r < 0.5 ? ['4/4'] : r < 0.82 ? [rng.pick(['3/4', '6/8', '5/4', ...altMeters])] : [rng.pick(['7/8', '5/8'])];
  }
  return r < 0.15 ? ['4/4'] : r < 0.7 ? [rng.pick(['5/4', '7/8', '9/8', '7/4', '5/8', '11/8'])] : rng.pick(MIXES);
}

/** Start positions of each beat group within a bar. */
/**
 * How hard a drummer plays a hi-hat or ride at a spot in the bar (multiplies the pattern's velocity):
 * beats strongest, 8th off-beats medium, 16ths in between soft. Without it, steady 16ths sound machine-like.
 */
export function cymbalAccent(groups: number[], pos: number): number {
  if (groupStarts(groups).includes(pos)) return 1.35;
  return pos % 2 === 0 ? 0.75 : 0.45;
}

export function groupStarts(groups: number[]): number[] {
  const s: number[] = [];
  let p = 0;
  for (const g of groups) { s.push(p); p += g; }
  return s;
}

export interface Bar {
  meter: string;
  len: number;
  /** Absolute start step in the 8-bar loop. */
  start: number;
  groups: number[];
}

/** Which bar variant plays in each of the 8 bars, e.g. A A A A2 A A B A2. */
export type Variant = 'A' | 'A2' | 'B' | 'C';

export function phrasePlan(rng: Rng, w: number): Variant[] {
  const low: Variant[][] = [['A', 'A', 'A', 'A2'], ['A', 'A', 'A2', 'A']];
  const mid: Variant[][] = [['A', 'A2', 'A', 'B'], ['A', 'B', 'A', 'B'], ['A', 'A', 'B', 'B'], ['A', 'A2', 'B', 'A2']];
  const half = (): Variant[] =>
    w < 0.3 ? [...rng.pick(low)]
      : w < 0.7 ? [...rng.pick([...low, ...mid])]
        : [0, 1, 2, 3].map((i) => (i === 0 ? 'A' : rng.pick(['A', 'A2', 'B', 'C'] as Variant[])));
  const first = half();
  const second = rng.chance(0.25 + w * 0.6) ? half() : [...first];
  if (second.join() === first.join()) second[3] = second[3] === 'A' ? 'A2' : second[3];
  return [...first, ...second];
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
export const lcm = (a: number, b: number) => (a * b) / gcd(a, b);
export const zeros = (n: number) => new Array<number>(n).fill(0);
