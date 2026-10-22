// Rule 43: a limit on the sets of notes in a stretch of 4 bars. A set is notes with no rest between them; a rest of a 16th or more
// ends it. The writer closes the smallest gaps (the note before holds on into the gap) and drops a lone short note, until the leaf has
// no more sets than the slider allows. Phrase breaks, phrase starts and ends, held endings and shapes are left alone where they can be.
// Pure; a leaf already within the limit comes out note for note.

import { gridOf, type BarArg } from './grid';
import type { BandNote, Gap } from './verse';

/** A rest of at least this many steps ends a set (a 16th). */
const GAP = 0.99;
const EPS = 1e-6;

/** The sets in a line: notes with a rest of a 16th or more between them. */
export function countSets(notes: BandNote[]): number {
  let n = 0, end = -Infinity;
  for (const x of notes) {
    if (x.step - end >= GAP) n++;
    end = Math.max(end, x.step + x.len);
  }
  return n;
}

/** The most sets a leaf of `bars` bars may have: the slider's, for 4 bars, in proportion for other lengths (never under 1). */
export const setsAllowed = (max: number, bars: number): number => Math.max(1, Math.ceil((max * bars) / 4 - EPS));

/**
 * The line with no more than `max` sets, where it can: cheapest change first. Closing a gap inside a phrase costs its length (twice
 * that when it is over a beat); dropping a lone note costs 3 plus its length. A note is left alone when it opens or ends its phrase,
 * is a held ending, third-bar note, opener, long hold, walk or landing. A gap of over a bar is not closed.
 * Gaps between phrases are never closed. Stops when nothing is left to change.
 */
export function limitSets(notes: BandNote[], phrases: Gap[], barArg: BarArg, max: number): BandNote[] {
  if (max <= 0 || countSets(notes) <= max) return notes;
  const G = gridOf(barArg), beat = G.beat, bar = G.bar;
  const out = notes.map((n) => ({ ...n }));
  const phraseOf = (n: BandNote) => phrases.findIndex((p) => n.step >= p.step - EPS && n.step < p.step + p.len - EPS);
  const edge = new Set<BandNote>();
  for (const [k] of phrases.entries()) {
    const inside = out.filter((n) => phraseOf(n) === k);
    if (inside.length) { edge.add(inside[0]); edge.add(inside[inside.length - 1]); }
  }
  const gapAfter = (i: number) => (i + 1 < out.length ? out[i + 1].step - (out[i].step + out[i].len) : Infinity);
  const gapBefore = (i: number) => (i > 0 ? out[i].step - (out[i - 1].step + out[i - 1].len) : Infinity);
  const keep = (n: BandNote) => n.third || n.opener || n.longHold || n.walk || n.land || n.lead || n.end;
  while (countSets(out) > max) {
    let best: { cost: number; run: () => void } | undefined;
    const take = (cost: number, run: () => void) => { if (!best || cost < best.cost) best = { cost, run }; };
    for (let i = 0; i < out.length; i++) {
      const n = out[i], g = gapAfter(i), next = out[i + 1];
      // (close a gap inside a phrase: the note holds on to the next one)
      if (next && g >= GAP && g <= bar && phraseOf(n) >= 0 && phraseOf(n) === phraseOf(next) && !n.third) {
        take(g <= beat ? g : 2 * g, () => { n.len += g; });
      }
      // (drop a lone note: a rest either side, in the middle of a phrase)
      if (!edge.has(n) && !keep(n) && gapBefore(i) >= GAP && g >= GAP && phraseOf(n) >= 0) take(3 + n.len, () => { out.splice(i, 1); });
    }
    if (!best) break;
    (best as { run: () => void }).run();
  }
  return out;
}
