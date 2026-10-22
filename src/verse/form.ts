// The verse melody's form (experiment): how the bars are grouped above the phrases.
// A block of 8 bars or more splits into two halves; the second half is the first one again, with variations; a half that
// is 8 bars or more splits the same way. Where the form is called (`call`: a verse, chorus or bridge of exactly 8 or 16 bars) the split
// is always made and every answer writes its ending again: 8 bars are A A' (4+4), 16 bars (A A')(A A')' = A A' A'' A''' (A'' answers A,
// A''' answers A'). Other lengths (and the other sections) split by chance, as before.
// The leaves, 4 bars each (or whatever a block that doesn't split has), are what the phrases are written in.
// A leaf that answers another one writes itself with the other's seeds, so its rhythm and notes are the same, except for
// the rules drawn to vary: those take a seed of their own.

import { Rng } from '../rng';

export type Rule = 'phrases' | 'runs' | 'tones' | 'holds' | 'small' | 'neighbours' | 'walk' | 'endings' | 'thirds' | 'bends';
export const RULES: Rule[] = ['phrases', 'runs', 'tones', 'holds', 'small', 'neighbours', 'walk', 'endings', 'thirds', 'bends'];
export type Variation = 'little' | 'some' | 'lots';

/** The chance, at "Some", that an answering leaf draws its own version of a rule. The phrasing mostly stays; the ending usually changes. */
const VARY: Record<Rule, number> = { phrases: 0.2, runs: 0.35, tones: 0.3, holds: 0.35, small: 0.3, neighbours: 0.3, walk: 0.25, endings: 0.75, thirds: 0.35, bends: 0.5 };
const LEVEL: Record<Variation, number> = { little: 0.25, some: 0.65, lots: 1.3 };

export interface Leaf {
  id: number;
  /** First bar (0-based) and length in bars. */
  from: number;
  bars: number;
  /** The leaf it answers (its id), or null for a leaf written fresh. */
  source: number | null;
  /** The rules it draws its own version of (the others repeat the source's). */
  varied: Rule[];
  /** A, A', B, B'... */
  name: string;
}

const LETTERS = 'ABCDEFGH';

/**
 * Cut `totalBars` into leaves. `meta` off: one leaf, as before. Blocks of 8 bars or more split in two (8 bars: 85% of the time,
 * 16 and over: 90%); the second half answers the first, leaf by leaf, varied by `variation`. `call`: a block of exactly 8 or 16
 * bars always splits (the dice are still rolled, so nothing else moves), and an answer always writes its ending again.
 */
export function planForm(totalBars: number, meta: boolean, variation: Variation, seed: string, call = false): Leaf[] {
  const rng = new Rng(seed + '|form');
  let nextId = 0, nextLetter = 0;
  const layout = (from: number, bars: number, depth: number): Leaf[] => {
    const rolled = meta && bars >= 8 && rng.chance(bars >= 16 ? 0.9 : 0.85);
    const split = rolled || (meta && call && (totalBars === 8 || totalBars === 16) && bars >= 8 && bars % 8 === 0);
    if (!split) return [{ id: nextId++, from, bars, source: null, varied: [], name: LETTERS[nextLetter++ % LETTERS.length] }];
    const half = Math.ceil(bars / 2);
    // (a called 8 or 16: every leaf is 4 bars, named A with a prime for each leaf before it)
    const called = call && meta && (totalBars === 8 || totalBars === 16);
    const left = layout(from, half, depth + 1);
    // (the right half: each leaf of the left again, with the bars that fit; the further apart the repeat, the more it varies)
    const letters = new Map<string, string>();
    const right = left.filter((l) => l.from - from < bars - half).map((l): Leaf => {
      const base = l.name[0], primes = l.name.slice(1);
      // (a block of 16 bars or more answers with a new letter, B for A; a smaller one with a prime, A' for A; a called one is all A, A' A'' A''')
      if (bars >= 16 && !letters.has(base) && !called) letters.set(base, LETTERS[nextLetter++ % LETTERS.length]);
      const p = LEVEL[variation] * (depth === 0 ? 1.15 : 1);
      const varied = RULES.filter((r) => rng.chance(Math.min(0.95, VARY[r] * p)));
      if (called && !varied.includes('endings')) varied.push('endings');
      return {
        id: nextId++, from: from + half + (l.from - from), bars: Math.min(l.bars, bars - half - (l.from - from)), source: l.id,
        varied, name: called ? '' : bars >= 16 ? letters.get(base)! + primes : l.name + "'",
      };
    });
    if (called) for (const l of right) l.name = 'A' + "'".repeat(left.length + right.indexOf(l));
    return [...left, ...right];
  };
  return layout(0, totalBars, 0);
}

/** The seed each rule of each leaf writes with: the leaf's own, or the one it answers (all the way back). */
export function leafSeeds(leaves: Leaf[], base: string): Map<number, Record<Rule, string>> {
  const seeds = new Map<number, Record<Rule, string>>();
  for (const l of leaves) {
    const own = `${base}#${l.id}`;
    const src = l.source === null ? null : seeds.get(l.source)!;
    seeds.set(l.id, Object.fromEntries(RULES.map((r) => [r, src && !l.varied.includes(r) ? src[r] : own])) as Record<Rule, string>);
  }
  return seeds;
}
