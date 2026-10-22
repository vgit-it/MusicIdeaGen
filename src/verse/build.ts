// The verse melody, built (experiment): the whole rule pipeline over a verse, one leaf of the form at a time (form.ts).
// Pure: the same input gives the same notes.

import { SCALES, type Chord, type Mode } from '../theory';
import { planForm, leafSeeds, RULES, type Leaf, type Rule, type Variation } from './form';
import { EMO_PULL, pullTo, toneBias, withColour, withEndDegrees, withSuspensions, withSurprise, type EmoBuild, type EmoCtx } from './emotion';
import type { Genre } from '../genres';
import { BarGrid, gridOf } from './grid';
import { shortTarget, withLonger } from './longer';
import { withSpace } from './space';
import { withShapes, type ShapeInfo, type Skips } from './shapes';
import { VERSE, phraseLenFor, type Dials } from './profile';
import {
  addBends, addNoteBends, addNeighbours, fitSilence, fixUnits, foldIntoRange, limitSame, phraseEndings, planCall, planPhrases, pushNotes, randomHolds, randomRuns, randomTones, rerollTones, smallBreaks,
  pentatonic, thirdBars, trimOverlaps, verseOverBand, voiceLead, walkToNext, withGaps, withHolds, withLeadIn, withLongHolds, withOpeners, withRuns, withStretch,
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
  /** Steps in a bar (the nominal one: the mean), and bars in the verse. */
  bar: number;
  bars: number;
  /** The bars as they are (their lengths and beat groups, where the song changes meter); left out: equal bars of `bar`. */
  grid?: BarGrid;
  range: Range;
  bends: BendAmount;
  /** Group the bars into meta-phrases (4+4, 8+8...) with the second answering the first. */
  meta: boolean;
  variation: Variation;
  /** A verse, chorus or bridge: 8 and 16 bars always split into 4-bar leaves, half 1 asks and half 2 answers (form.ts). */
  call?: boolean;
  seed: string;
  /** Whether a bar may be three even notes (a third of a bar a note): only where a third of the bar is whole 16ths. */
  thirds?: boolean;
  /** The dials the rules roll against (a section kind in a song's personality; left out: the verse's own). */
  dials?: Dials;
  /** Limit every note to the key's pentatonic scale (chosen so at every step: chord notes, steps, endings, bends). */
  pentatonic?: boolean;
  /** Dice borrowed from another section for some rules (a pre-chorus takes the verse's phrasing). */
  borrow?: Partial<Record<Rule, string>>;
  /** The try each leaf was written on in another build (a chorus built like its master starts there, so they match). */
  tries?: number[];
  /** The mood notes this section is written with (src/verse/emotion.ts); left out: none, the line as it always was. */
  emo?: EmoCtx;
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
  /** The try each leaf was written on (0: the first dice; more: it was written again for rule 20). */
  tries: number[];
  /** Rule 39: the shapes repeated inside phrases (steps from the section's start). */
  shapes: ShapeInfo[];
  /** Why phrases got no shape (counts, for the check). */
  skips: Skips;
}

export function buildVerse(inp: BuildInput): Built {
  const { key, mode } = inp;
  const G0 = inp.grid ?? gridOf(inp.bar), bar = G0.bar;
  const d0 = inp.dials ?? VERSE;
  const pent = inp.pentatonic ? pentatonic(key, mode) : undefined;
  // (calm sections lean toward longer phrases, driving ones toward shorter)
  const d: Dials = { ...(inp.thirds === false ? { ...d0, third: 0 } : d0), phraseLen: phraseLenFor(d0.phraseLen, inp.energy), ...(pent ? { pent } : {}) };
  // (a lift moves the band the line lives in, not the extended limits: those are the voice's, and a lift stops at them)
  const width = inp.range.hi - inp.range.lo;
  const lo = Math.max(inp.range.xlo, Math.min(inp.range.xhi - width, inp.range.lo + d.lift));
  const range: Range = d.lift ? { ...inp.range, lo, hi: lo + width } : inp.range;
  const total = inp.chordAt.length;
  const leaves = planForm(inp.bars, inp.meta, inp.variation, inp.seed, inp.call);
  const seeds = leafSeeds(leaves, inp.seed);
  const out: Built = { notes: [], phrases: [], breaks: [], runs: [], holds: [], tones: [], bars: [], leaves, tries: [], shapes: [], skips: {} };
  // (what a rule looks at in the band: an answering leaf's rhythm rules look at the band under the leaf they answer, so the
  // rhythm repeats even where the band under it doesn't; the rules about notes look at the band under the leaf itself)
  const rootFrom = (leaf: Leaf, rule: Rule): number => {
    let l = leaf;
    while (l.source !== null && !l.varied.includes(rule)) l = leaves.find((x) => x.id === l.source)!;
    return G0.start(l.from);
  };
  const win = <T,>(arr: T[], from: number, len: number, pad: T): T[] => {
    const w = arr.slice(from, from + len);
    while (w.length < len) w.push(w.length ? w[w.length - 1] : pad);
    return w;
  };
  // (how many times a leaf repeats an earlier one: A' once, A'' twice)
  const repeatsOf = (leaf: Leaf): number => { let n = 0, l = leaf; while (l.source !== null) { n++; l = leaves.find((x) => x.id === l.source)!; } return n; };
  // (the try each leaf was written on: an answering leaf starts on its source's, so the two still match)
  const tryOf = new Map<number, number>();
  for (const leaf of leaves) {
    const from = G0.start(leaf.from);
    const end = leaf.from + leaf.bars >= inp.bars ? total : G0.start(leaf.from + leaf.bars);
    const len = end - from;
    // (the bars of this leaf, from its own start)
    const G = G0.slice(from, end);
    const sd0 = { ...seeds.get(leaf.id)!, ...(leaf.source === null ? inp.borrow : undefined) };
    const chordAt = inp.chordAt.slice(from, end);
    // (rule 4 and 21 keep the core notes in the section's own key)
    const fit = { key, mode, chordAt };
    // (the mood notes' view of this leaf)
    const X: EmoBuild | undefined = inp.emo && { E: inp.emo, key, mode, bar, grid: G0, total: len, leafFrom: from, lastLeaf: end >= total, call: !!inp.call, chordAt, range, pent };
    const accOf = (rule: Rule) => win(inp.acc, rootFrom(leaf, rule), len, 0.5);
    const write = (sd: Record<Rule, string>, final: boolean) => {
      // (a leaf that isn't the last leaves a beat of silence at its end: the phrases stop before it)
      // (a beat of the leaf's last bar: its last beat group, so the phrases stop on a beat)
      const tail = end < total ? Math.max(1, G.backLen(len, 1)) : 0;
      // (call and response: a 4-bar leaf of a called section is two phrases, bars 1-2 and bars 3-4)
      const planned = inp.emo?.on.has('call') && inp.call && leaf.bars === 4 && (inp.bars === 8 || inp.bars === 16) ? planCall(len - tail, G, sd.phrases, d) : planPhrases(len - tail, G, sd.phrases, accOf('phrases'), d);
      const phrases = planned.phrases, breaks = planned.breaks;
      if (tail) {
        const last = breaks[breaks.length - 1];
        if (last && last.step + last.len >= len - tail) last.len = len - last.step;
        else breaks.push({ step: phrases[phrases.length - 1].step + phrases[phrases.length - 1].len, len: tail });
      }
      const runs = randomRuns(len, G, inp.energy, breaks, sd.runs, accOf('runs'), d);
      // (rule 21: each phrase starts on a freshly drawn core note)
      // (mood notes: the chord note a bar or phrase sits on leans to the mood's degrees and the phrase's contour)
      const bias = X && toneBias(X, phrases, sd.phrases);
      const drawn = randomTones(len, G, sd.tones, accOf('tones'), d, { from, total }, fit, bias);
      const { tones, bars } = rerollTones(drawn.tones, drawn.bars, phrases, G, sd.tones, d, fit, bias);
      const holds = randomHolds(len, G, breaks, runs, tones, win(inp.chordAt, rootFrom(leaf, 'holds'), len, inp.chordAt[0]), sd.holds, accOf('holds'), d);
      // (rule 22: a climbing section pulls toward a register that rises from just over the bottom of its range by `climb` + 2 semitones)
      // (rule 24: a dwelling section pulls toward one home pitch instead)
      const climbTo = d.climb ? (step: number) => range.lo + 2 + (d.climb! + 2) * Math.min(1, (from + step) / Math.max(1, total - bar))
        : d.dwell !== undefined ? () => range.lo + d.dwell! * (range.hi - range.lo) : undefined;
      const plain = withRuns(withGaps(verseOverBand(key, chordAt, tones, undefined, pent), breaks), runs, key, chordAt, tones, undefined, pent);
      // (a phrase may open on one long note; the short notes after it stay short)
      const held = withOpeners(withHolds(plain, holds), phrases, chordAt, G, sd.phrases, accOf('phrases'), d);
      // (mood notes: where the climb and the dwell don't pull, the phrase's contour and the tension lean the register, gently)
      const emoPull = X && !climbTo ? pullTo(X, phrases, sd.phrases) : undefined;
      const walked = walkToNext(addNeighbours(voiceLead(withStretch(held.notes, tones, chordAt, G, sd.holds, accOf('holds'), d, held.opened), range, climbTo ?? emoPull, { tones, chordAt, bar: G, chance: d.octave, up: d.octaveUp, seed: `${sd.tones}|oct` }, emoPull ? EMO_PULL : undefined), key, mode, G, sd.neighbours, d), phrases, key, mode, G, sd.walk, d);
      const pushed = pushNotes(limitSame(smallBreaks(foldIntoRange(walked, range), phrases, G, sd.small, accOf('small'), d)), phrases, G, sd.small, accOf('small'), d);
      const ended = phraseEndings(pushed, phrases, G, sd.endings, d, { key, mode, chordAt, range });
      // (mood notes: each phrase end gets a degree by its job: home, open, hanging)
      const shaped = trimOverlaps(thirdBars(X ? withEndDegrees(ended, phrases, X, `${sd.endings}|emo`) : ended, phrases, G, sd.thirds, d));
      // (rule 23: the section's last phrase leads into the next section)
      const led = end >= total ? withLeadIn(shaped, phrases, G, len, sd.endings, d, { key, mode, chordAt, range }) : shaped;
      // (rule 28: a phrase now and then holds one note for 1 to 2 bars)
      const longed = withLongHolds(led, phrases, chordAt, G, len, { key, range, moreLeaves: end < total }, sd.holds, accOf('holds'), d);
      // (use the space: a short note or a held ending with a big gap after it is held on into it, a repeat most; the silence fit below
      // has the last word on a chorus's rests)
      const changes = inp.changes.filter((c) => c >= from && c < end).map((c) => c - from);
      const spaced = X?.E.on.has('space') ? withSpace(longed, G, len, key, chordAt, `${sd.holds}|space|${leaf.id}`, { repeat: repeatsOf(leaf), final: end >= total }) : longed;
      // (the chorus: fitted to the song's share of silence)
      const fitted = d.silence === undefined ? spaced : fitSilence(spaced, phrases, G, len, d.silence, sd.small, accOf('small'), d.silenceTol);
      // (longer notes: neighbouring 8ths joined until the share of short notes is the genre's and the section's; a section fitted to a
      // share of silence keeps its rests)
      const stretched = X?.E.on.has('longer') ? withLonger(fitted, phrases, G, shortTarget(inp.genre as Genre, X.E.kind), changes, `${sd.holds}|longer`, d.silence === undefined) : fitted;
      // (rule 20: no unit shorter than a quarter bar with silence on either side; unfixable: another try, the last try drops it)
      const units = fixUnits(stretched, phrases, chordAt, G, final);
      if (!units.ok) return null;
      const bent = addBends(units.notes, phrases, G, { amount: inp.bends, energy: inp.energy, genre: inp.genre, chordAt, tones, changes, mult: d.bends }, sd.bends);
      const noted = addNoteBends(bent, G, { amount: inp.bends, energy: inp.energy, key, mode, chordAt, range, mult: d.bends, pent, space: X?.E.on.has('space') }, `${sd.bends}|in`);
      // (mood notes, on the line as it will sound, after the bends: colour notes and surprises, then a long note that starts one step off
      // and glides onto the chord note)
      const flavoured = X ? withSurprise(withColour(noted, phrases, X, `${sd.neighbours}|emo`), phrases, X, `${sd.small}|emo`) : noted;
      const moods = X ? withSuspensions(flavoured, X, `${sd.bends}|emo`) : flavoured;
      // (repeat shapes: last, on the line as it will sound, so nothing after it can pull a repeat apart)
      const rep = X?.E.on.has('shape')
        ? withShapes(moods, phrases, G, len, sd.phrases, { key, scale: pent ?? new Set(SCALES[mode].map((i) => (key + i) % 12)), chordAt, range, silence: d.silence, silenceTol: d.silenceTol, short: X.E.on.has('longer') })
        : undefined;
      const notes = rep ? rep.notes : moods;
      return { notes, phrases, breaks, runs, holds, tones, bars, shapes: rep?.shapes ?? [], skips: rep?.skips ?? {} };
    };
    const MAX_TRIES = 40;
    const t0 = Math.max(inp.tries?.[leaves.indexOf(leaf)] ?? 0, leaf.source === null ? 0 : tryOf.get(leaf.source) ?? 0);
    let w: ReturnType<typeof write> = null;
    for (let t = t0; !w; t++) {
      const sd = t === 0 ? sd0 : (Object.fromEntries(RULES.map((r) => [r, `${sd0[r]}|try${t}`])) as Record<Rule, string>);
      w = write(sd, t >= t0 + MAX_TRIES);
      if (w) { tryOf.set(leaf.id, t); out.tries.push(t); }
    }
    const { notes, phrases, breaks, runs, holds, tones, bars, shapes, skips } = w;
    const shift = (g: Gap): Gap => ({ ...g, step: g.step + from });
    out.notes.push(...notes.map((n) => ({ ...n, step: n.step + from })));
    out.phrases.push(...phrases.map(shift));
    out.breaks.push(...breaks.map(shift));
    out.runs.push(...runs.map(shift));
    out.holds.push(...holds.map(shift));
    out.tones.push(...tones);
    out.bars.push(...bars);
    for (const [k, v] of Object.entries(skips)) out.skips[k] = (out.skips[k] ?? 0) + v;
    out.shapes.push(...shapes.map((x) => ({ ...x, phrase: x.phrase + from, step: x.step + from })));
  }
  return out;
}
