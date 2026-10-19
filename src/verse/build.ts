// The verse melody, built (experiment): the whole rule pipeline over a verse, one leaf of the form at a time (form.ts).
// Pure: the same input gives the same notes.

import type { Chord, Mode } from '../theory';
import { planForm, leafSeeds, type Leaf, type Rule, type Variation } from './form';
import { VERSE, type Dials } from './profile';
import {
  addBends, addNoteBends, addNeighbours, fitSilence, foldIntoRange, limitSame, phraseEndings, planPhrases, pushNotes, randomHolds, randomRuns, randomTones, smallBreaks,
  thirdBars, trimOverlaps, verseOverBand, voiceLead, walkToNext, withGaps, withHolds, withRuns, withStretch,
  type BandNote, type BarTone, type BendAmount, type ChordNote, type Gap, type Range,
} from './verse';

export interface BuildInput {
  key: number;
  mode: Mode;
  genre: string;
  /** The section's energy, 1-5. */
  energy: number;
  /** The chord sounding on each 16th step, and how hard the band hits there (bandAccents). */
  chordAt: Chord[];
  acc: number[];
  /** Steps where a chord starts. */
  changes: number[];
  /** Steps in a bar, and bars in the verse. */
  bar: number;
  bars: number;
  range: Range;
  bends: BendAmount;
  /** Group the bars into meta-phrases (4+4, 8+8...) with the second answering the first. */
  meta: boolean;
  variation: Variation;
  seed: string;
  /** Whether a bar may be three even notes (a third of a bar a note): only where a third of the bar is whole 16ths. */
  thirds?: boolean;
  /** The dials the rules roll against (a section kind in a song's personality; left out: the verse's own). */
  dials?: Dials;
}

export interface Built {
  notes: BandNote[];
  phrases: Gap[];
  breaks: Gap[];
  runs: Gap[];
  holds: Gap[];
  tones: ChordNote[];
  bars: BarTone[];
  leaves: Leaf[];
}

export function buildVerse(inp: BuildInput): Built {
  const { bar, key, mode } = inp;
  const d0 = inp.dials ?? VERSE;
  const d = inp.thirds === false ? { ...d0, third: 0 } : d0;
  const range: Range = d.lift ? { lo: inp.range.lo + d.lift, hi: inp.range.hi + d.lift, xlo: inp.range.xlo + d.lift, xhi: inp.range.xhi + d.lift } : inp.range;
  const total = inp.chordAt.length;
  const leaves = planForm(inp.bars, inp.meta, inp.variation, inp.seed);
  const seeds = leafSeeds(leaves, inp.seed);
  const out: Built = { notes: [], phrases: [], breaks: [], runs: [], holds: [], tones: [], bars: [], leaves };
  // (what a rule looks at in the band: an answering leaf's rhythm rules look at the band under the leaf they answer, so the
  // rhythm repeats even where the band under it doesn't; the rules about notes look at the band under the leaf itself)
  const rootFrom = (leaf: Leaf, rule: Rule): number => {
    let l = leaf;
    while (l.source !== null && !l.varied.includes(rule)) l = leaves.find((x) => x.id === l.source)!;
    return l.from * bar;
  };
  const win = <T,>(arr: T[], from: number, len: number, pad: T): T[] => {
    const w = arr.slice(from, from + len);
    while (w.length < len) w.push(w.length ? w[w.length - 1] : pad);
    return w;
  };
  for (const leaf of leaves) {
    const from = leaf.from * bar;
    const end = leaf.from + leaf.bars >= inp.bars ? total : from + leaf.bars * bar;
    const len = end - from;
    const sd = seeds.get(leaf.id)!;
    const chordAt = inp.chordAt.slice(from, end);
    const accOf = (rule: Rule) => win(inp.acc, rootFrom(leaf, rule), len, 0.5);
    // (a leaf that isn't the last leaves a beat of silence at its end: the phrases stop before it)
    const tail = end < total ? Math.round(bar / 4) : 0;
    const planned = planPhrases(len - tail, bar, sd.phrases, accOf('phrases'), d);
    const phrases = planned.phrases, breaks = planned.breaks;
    if (tail) {
      const last = breaks[breaks.length - 1];
      if (last && last.step + last.len >= len - tail) last.len = len - last.step;
      else breaks.push({ step: phrases[phrases.length - 1].step + phrases[phrases.length - 1].len, len: tail });
    }
    const runs = randomRuns(len, bar, inp.energy, breaks, sd.runs, accOf('runs'), d);
    const { tones, bars } = randomTones(len, bar, sd.tones, accOf('tones'), d);
    const holds = randomHolds(len, bar, breaks, runs, tones, win(inp.chordAt, rootFrom(leaf, 'holds'), len, inp.chordAt[0]), sd.holds, accOf('holds'), d);
    const plain = withRuns(withGaps(verseOverBand(key, chordAt, tones), breaks), runs, key, chordAt, tones);
    const walked = walkToNext(addNeighbours(voiceLead(withStretch(withHolds(plain, holds), tones, chordAt, bar, sd.holds, accOf('holds'), d), range), key, mode, bar, sd.neighbours, d), phrases, key, mode, bar, sd.walk, d);
    const pushed = pushNotes(limitSame(smallBreaks(foldIntoRange(walked, range), phrases, bar, sd.small, accOf('small'), d)), phrases, bar, sd.small, accOf('small'), d);
    const shaped = trimOverlaps(thirdBars(phraseEndings(pushed, phrases, bar, sd.endings, d, { key, mode, chordAt }), phrases, bar, sd.thirds, d));
    // (the chorus: fitted to the song's share of silence)
    const fitted = d.silence === undefined ? shaped : fitSilence(shaped, phrases, bar, len, d.silence, sd.small, accOf('small'));
    const changes = inp.changes.filter((c) => c >= from && c < end).map((c) => c - from);
    const bent = addBends(fitted, phrases, bar, { amount: inp.bends, energy: inp.energy, genre: inp.genre, chordAt, tones, changes, mult: d.bends }, sd.bends);
    const notes = addNoteBends(bent, bar, { amount: inp.bends, energy: inp.energy, key, chordAt, range, mult: d.bends }, `${sd.bends}|in`);
    const shift = (g: Gap): Gap => ({ step: g.step + from, len: g.len });
    out.notes.push(...notes.map((n) => ({ ...n, step: n.step + from })));
    out.phrases.push(...phrases.map(shift));
    out.breaks.push(...breaks.map(shift));
    out.runs.push(...runs.map(shift));
    out.holds.push(...holds.map(shift));
    out.tones.push(...tones);
    out.bars.push(...bars);
  }
  return out;
}
