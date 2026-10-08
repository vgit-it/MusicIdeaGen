// Motifs: a short musical idea that gets repeated and developed. This is what makes a riff or a
// hook memorable: not new random notes every bar, but the same few notes moved to fit each chord
// (a sequence), varied, and brought home at the end of the phrase.
//
// Pitches are scale steps (not semitones) above an anchor, so a motif moved onto another chord
// stays in key: steps 0, 2, 4 are always root, 3rd and 5th of whatever chord it sits on.

import type { Rng } from '../rng';
import { type Chord, type Mode, SCALES } from '../theory';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The 7-note scale of a chord, as semitones above its root: the mode's notes when the chord is in key. */
export function chordScale(mode: Mode, c: Chord): number[] {
  const scale: readonly number[] = SCALES[mode];
  const d = scale.indexOf(c.root);
  if (d >= 0) return Array.from({ length: 7 }, (_, i) => mod(scale[(d + i) % 7] - c.root, 12));
  // out-of-key chords (bVI, bII...): a major or minor scale on the chord, by its 3rd
  const minor = c.q === 'min' || c.q === 'm7' || c.q === 'm9' || c.q === 'dim' || c.q === 'm7b5';
  return minor || c.q === '5' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 10];
}

/** Semitones for `step` scale steps above the root (negative steps go below). */
export const stepSemis = (cs: number[], step: number) => cs[mod(step, 7)] + 12 * Math.floor(step / 7);

/**
 * A pitch cell of `n` notes, as scale steps from 0. Built from shapes melodies actually use
 * (steps, neighbour notes, arpeggios, a leap filled in by steps back) rather than a random walk.
 */
export function pitchCell(rng: Rng, n: number, range = 7): number[] {
  const shapes: [number[], number][] = [
    [[0, 1, 2, 3, 4], 2], // run up
    [[4, 3, 2, 1, 0], 2], // run down
    [[0, 2, 4, 2, 0], 2], // arpeggio and back
    [[0, 1, 0, -1, 0], 2], // neighbour notes
    [[0, 4, 3, 2, 1], 3], // leap up, step back down
    [[4, 0, 1, 2, 3], 1], // leap down, step back up
    [[0, 0, 2, 1, 0], 2], // repeat, then turn
    [[2, 1, 0, 1, 2], 1], // dip
    [[0, 2, 1, 3, 2], 2], // climbing thirds
    [[0, 7, 4, 2, 0], 1], // octave leap and fall
  ];
  const base = rng.weighted(shapes);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < base.length) out.push(base[i]);
    else {
      // longer cells continue by step, turning back after a leap
      const a = out[i - 1], b = out[i - 2];
      out.push(a + (a - b > 1 ? -1 : a - b < -1 ? 1 : rng.pick([-1, 1, 0])));
    }
  }
  // the odd note nudged, so cells from the same shape differ
  if (n > 2 && rng.chance(0.4)) out[rng.int(1, n - 1)] += rng.pick([-1, 1]);
  return out.map((s) => Math.max(-3, Math.min(range, s)));
}

/** How a phrase of four bars develops its motif. */
export type Form = 'loop' | 'sentence' | 'period';

/**
 * Pitch offsets (in scale steps) and ending changes for each bar of a phrase:
 * - loop: the riff repeats, the last bar turns around
 * - sentence: idea, idea moved, idea broken into pieces, ending
 * - period: question (ends open), answer (ends home)
 */
export interface BarPlan {
  /** Added to every note of the motif in this bar (a sequence). */
  shift: number;
  /** Replace the last notes with an ending: 'open' (lands on the 5th/2nd), 'home' (lands on the root), 'turn' (walks to the next bar). */
  ending?: 'open' | 'home' | 'turn';
  /** Play only the first half of the motif, twice (fragment). */
  fragment?: boolean;
}

export function formPlan(rng: Rng, form: Form): BarPlan[] {
  if (form === 'loop') return [{ shift: 0 }, { shift: 0 }, { shift: 0 }, { shift: 0, ending: 'turn' }];
  if (form === 'sentence') {
    const s = rng.pick([1, -1, 2]);
    return [{ shift: 0 }, { shift: s }, { shift: 0, fragment: true }, { shift: 0, ending: 'home' }];
  }
  return [{ shift: 0 }, { shift: 0, ending: 'open' }, { shift: 0 }, { shift: 0, ending: 'home' }];
}

/** Apply a bar plan to a pitch cell: shift, fragment, and rewrite the ending. */
export function developCell(cell: number[], plan: BarPlan): number[] {
  let c = cell.map((s) => s + plan.shift);
  if (plan.fragment) {
    const half = cell.slice(0, Math.max(1, Math.ceil(cell.length / 2)));
    c = [...half, ...half.map((s) => s + 1)].slice(0, cell.length);
  }
  const n = c.length;
  if (plan.ending === 'home' && n >= 2) {
    // step into the root from the nearest side
    const prev = c[n - 2];
    c[n - 1] = Math.abs(prev - 0) <= Math.abs(prev - 7) ? 0 : 7;
    if (Math.abs(c[n - 1] - prev) > 2) c[n - 2] = c[n - 1] + (prev > c[n - 1] ? 1 : -1);
  } else if (plan.ending === 'open' && n >= 1) {
    c[n - 1] = c[n - 1] >= 3 ? 4 : 1; // 5th or 2nd: sounds unfinished
  } else if (plan.ending === 'turn' && n >= 2) {
    // the last notes walk away (up or down by step), so the loop comes round again
    const dir = c[n - 2] > 2 ? -1 : 1;
    if (n >= 3) c[n - 2] = c[n - 3] + dir;
    c[n - 1] = c[n - 2] + dir;
  }
  return c;
}

/** Rhythm figures (positions in 16ths inside a beat group of 4 or 6) that styles are built from. */
export type Figure = 'eighths' | 'gallop' | 'revgallop' | 'sixteenths' | 'push' | 'quarter';

export function figure(f: Figure, g: number): { pos: number; len: number }[] {
  if (g === 6) {
    if (f === 'gallop') return [{ pos: 0, len: 2 }, { pos: 2, len: 1 }, { pos: 3, len: 1 }, { pos: 4, len: 2 }];
    if (f === 'revgallop') return [{ pos: 0, len: 1 }, { pos: 1, len: 1 }, { pos: 2, len: 2 }, { pos: 4, len: 2 }];
    if (f === 'sixteenths') return [0, 1, 2, 3, 4, 5].map((p) => ({ pos: p, len: 1 }));
    if (f === 'quarter') return [{ pos: 0, len: 6 }];
    return [0, 2, 4].map((p) => ({ pos: p, len: 2 }));
  }
  if (f === 'gallop') return [{ pos: 0, len: 2 }, { pos: 2, len: 1 }, { pos: 3, len: 1 }];
  if (f === 'revgallop') return [{ pos: 0, len: 1 }, { pos: 1, len: 1 }, { pos: 2, len: 2 }];
  if (f === 'sixteenths') return [0, 1, 2, 3].map((p) => ({ pos: p, len: 1 }));
  if (f === 'push') return [{ pos: 0, len: 3 }, { pos: 3, len: 1 }];
  if (f === 'quarter') return [{ pos: 0, len: 4 }];
  return [{ pos: 0, len: 2 }, { pos: 2, len: 2 }];
}
