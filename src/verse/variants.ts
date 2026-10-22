// The form, phrasing and variants of a built section, read back for the melody view (pure; the writer is untouched).
// A leaf that answers another one (A' for A) is compared note by note with its source, by position inside the leaf.

import type { Leaf } from './form';
import type { BandNote, Gap } from './verse';

/** A leaf in steps: from (inclusive) to (exclusive). */
export interface LeafSpan { leaf: Leaf; from: number; to: number }

/** The leaves of a section as step ranges; `barStart(i)` is the first step of bar i, `bars` the bars in the section. */
export function leafSpans(leaves: Leaf[], barStart: (bar: number) => number, bars: number, total: number): LeafSpan[] {
  return leaves.map((leaf) => ({
    leaf, from: barStart(leaf.from), to: leaf.from + leaf.bars >= bars ? total : barStart(leaf.from + leaf.bars),
  }));
}

/** How an answering note compares with its source: the same, another pitch, another length, or with no note there in the source. */
export type Diff = 'same' | 'pitch' | 'rhythm' | 'new';

export interface LeafCompare {
  /** The answer's note against the source's (built notes). */
  diffs: Map<BandNote, Diff>;
  /** The source's notes with no note starting there in the answer (steps are the answer's). */
  dropped: BandNote[];
  count: Record<Diff | 'dropped', number>;
}

const EPS = 1e-6;

/** The answering leaf `ans` against its source `src`, note by note, by the step inside the leaf. */
export function compareLeaf(notes: BandNote[], src: LeafSpan, ans: LeafSpan): LeafCompare {
  const inside = (s: LeafSpan) => notes.filter((n) => n.step >= s.from - EPS && n.step < s.to - EPS);
  const from = inside(src), to = inside(ans);
  const at = new Map<string, BandNote>(from.map((n) => [(n.step - src.from).toFixed(3), n]));
  const diffs = new Map<BandNote, Diff>();
  const used = new Set<BandNote>();
  const count = { same: 0, pitch: 0, rhythm: 0, new: 0, dropped: 0 };
  for (const n of to) {
    const s = at.get((n.step - ans.from).toFixed(3));
    const d: Diff = !s ? 'new' : Math.abs(s.len - n.len) > EPS ? 'rhythm' : s.midi !== n.midi ? 'pitch' : 'same';
    if (s) used.add(s);
    diffs.set(n, d);
    count[d]++;
  }
  const dropped = from
    .filter((s) => !used.has(s) && s.step - src.from < ans.to - ans.from - EPS)
    .map((s) => ({ ...s, step: s.step - src.from + ans.from }));
  count.dropped = dropped.length;
  return { diffs, dropped, count };
}

/** The ending a phrase has, from its last note: how it stops (held, open, hang, punch, sync) and the degree role (home, open, hang); plain when nothing was set. */
export function endingOf(notes: BandNote[], ph: Gap): { style: string; role?: string } {
  const last = [...notes].reverse().find((n) => n.step >= ph.step - EPS && n.step < ph.step + ph.len - EPS);
  return { style: last?.style ?? 'plain', role: last?.endRole };
}
