// Chords you set yourself: a chord sheet with two cells per bar (first half, second half).
// A cell holds a chord (pinned), '-' (the chord before carries on, also pinned), or nothing (left to
// the generator). The generator writes the free cells around the pinned ones: its own progression,
// with the chord before a pinned one sometimes turned to lead into it. Everything else (strumming,
// bass, Guitar 2, layers) is then written to the result as usual. Pure and deterministic.

import { GENRES } from '../genres';
import type { ChordEvent, ChordPart, ChordSheet, SheetCell, Song } from '../idea';
import { groupStarts, zeros } from '../rhythm';
import type { Rng } from '../rng';
import { type Chord, type Mode, type Quality, QUALITIES, SCALES, degreeChord } from '../theory';

/** Cells per bar: the first half and the second half. */
export const CELLS_PER_BAR = 2;

/** Where each half of a bar starts (the second half on the beat group nearest the middle). */
export function cellSteps(song: Song): number[] {
  return song.bars.flatMap((b) => {
    const half = groupStarts(b.groups).find((p) => p >= b.len / 2) ?? Math.floor(b.len / 2);
    return [b.start, b.start + half - (half % 2)];
  });
}

export const hasPins = (sheet: ChordSheet | undefined): sheet is ChordSheet => !!sheet?.some((c) => c !== null);

/** Riff genres write chords from the riff: chords can't be set there (yet). */
export const canSetChords = (song: Song) => !GENRES[song.genre].riff;

const same = (a: Chord, b: Chord) => a.root === b.root && a.q === b.q;
export const cellChord = (c: SheetCell): Chord | null => (Array.isArray(c) ? { root: c[0], q: c[1] } : null);

function chordIdxFor(timeline: ChordEvent[], total: number) {
  const idx = zeros(total);
  for (let t = 0, g = 0; g < total; g++) {
    while (t + 1 < timeline.length && timeline[t + 1].step <= g) t++;
    idx[g] = t;
  }
  return idx;
}

/** A chord on `root` that fits the key: the scale's own chord there, else a major chord (or a 7th leading somewhere). */
function inKey(mode: Mode, root: number, seventh = false): Chord | null {
  const scale = SCALES[mode] as readonly number[];
  const d = scale.indexOf(root);
  if (d < 0) return null;
  const c = degreeChord(scale, d, seventh);
  return c.q === 'dim' || c.q === 'aug' || c.q === 'm7b5' ? null : c;
}

/** A chord that leads into `to`: its V (in the key, else a dominant 7th), or its IV. */
function approach(rng: Rng, mode: Mode, to: Chord): Chord {
  const five = (to.root + 7) % 12, four = (to.root + 5) % 12;
  const opts: [Chord, number][] = [];
  const v = inKey(mode, five);
  opts.push([v ?? { root: five, q: '7' }, 3]);
  const iv = inKey(mode, four);
  if (iv) opts.push([iv, 2]);
  return rng.weighted(opts);
}

/**
 * The chords for an idea with a chord sheet: pinned cells as set, free cells from the generated
 * progression. A bar left entirely free keeps the generated chords as written (pushes and all).
 */
export function applySheet(rng: Rng, song: Song, gen: ChordPart, sheet: ChordSheet): ChordPart {
  const cells = cellSteps(song);
  const n = cells.length;
  const genAt = (i: number) => gen.timeline[gen.chordIdx[cells[i]]].chord;
  const pinned = (i: number) => (sheet[i] ?? null) !== null && !(i === 0 && sheet[i] === '-');

  // a chord per cell
  const out: Chord[] = [];
  for (let i = 0; i < n; i++) {
    const c = sheet[i] ?? null;
    out.push(Array.isArray(c) ? { root: c[0], q: c[1] } : c === '-' && i > 0 ? out[i - 1] : genAt(i));
  }
  // ideas around your chords: the free chord right before a pinned change often leads into it
  const led = new Set<number>();
  for (let i = 0; i + 1 < n; i++) {
    if (pinned(i) || !pinned(i + 1) || sheet[i + 1] === '-') continue;
    const to = out[i + 1];
    // a free chord that already is the pinned one would just hold it: change it too
    if (same(out[i], to) || rng.chance(0.5)) {
      out[i] = approach(rng, song.mode, to);
      led.add(i);
    }
  }

  // free bars (both cells free, nothing changed) keep the generated events as written
  const timeline: ChordEvent[] = [];
  const push = (step: number, chord: Chord) => {
    const prev = timeline[timeline.length - 1];
    if (prev && same(prev.chord, chord)) return;
    if (prev && prev.step >= step) timeline.pop();
    timeline.push({ step, chord });
  };
  const freeBar = (bi: number) => {
    const a = bi * CELLS_PER_BAR;
    return bi < song.bars.length && !pinned(a) && !pinned(a + 1) && !led.has(a) && !led.has(a + 1);
  };
  song.bars.forEach((b, bi) => {
    const a = bi * CELLS_PER_BAR;
    if (freeBar(bi)) {
      const end = b.start + b.len;
      // a generated push into the next bar stays only if that bar is free too, or starts on the same chord
      const into = bi + 1 < song.bars.length && !freeBar(bi + 1) ? out[a + CELLS_PER_BAR] : null;
      push(b.start, genAt(a));
      for (const e of gen.timeline) {
        if (e.step <= b.start || e.step >= end) continue;
        if (into && e.step >= end - 2 && !same(e.chord, into)) continue;
        push(e.step, e.chord);
      }
    } else {
      push(cells[a], out[a]);
      push(cells[a + 1], out[a + 1]);
    }
  });
  if (!timeline.length || timeline[0].step !== 0) timeline.unshift({ step: 0, chord: out[0] });

  const set = sheet.filter((c) => c !== null).length;
  const notes = [`Chords: ${set} of ${n} half-bars set by you, the rest written around them`];
  return { timeline, chordIdx: chordIdxFor(timeline, song.total), notes };
}

/** The chord sounding at each cell (for the editor). */
export function chordsAtCells(song: Song, chords: ChordPart): Chord[] {
  return cellSteps(song).map((s) => chords.timeline[chords.chordIdx[s]].chord);
}

/* ------------------------------------------------------------ names and picks */

const NUMERAL = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const MINOR_Q: Quality[] = ['min', 'm7', 'm9', 'dim', 'm7b5'];
const SUFFIX: Partial<Record<Quality, string>> = {
  dim: '°', aug: '+', '5': '5', maj7: 'maj7', m7: '7', '7': '7', '9': '9', m9: '9', sus2: 'sus2', sus4: 'sus4', add9: 'add9', m7b5: 'ø7', '7#9': '7#9',
};

const DEGREE = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Roman numeral in the key: its own scale's degrees ("III" in a minor key), else against major ("bVII"); "vi", "V7". */
export function numeral(c: Chord, mode?: Mode): string {
  const d = mode ? (SCALES[mode] as readonly number[]).indexOf(c.root) : -1;
  const n = d >= 0 ? DEGREE[d] : NUMERAL[c.root];
  return (MINOR_Q.includes(c.q) ? n.toLowerCase() : n) + (SUFFIX[c.q] ?? '');
}

/** The key's own chords (I ii iii IV V vi …), as triads or with 7ths. */
export function keyChords(mode: Mode, seventh = false): Chord[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => degreeChord(SCALES[mode], d, seventh));
}

/** Chord types offered in the "any chord" picker, most common first. */
export const PICK_QUALITIES: Quality[] = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', '5', 'dim', 'aug', '9', 'm9', 'm7b5'];

const tones = (c: Chord) => new Set(QUALITIES[c.q].map((i) => (c.root + i) % 12));
const shared = (a: Chord, b: Chord) => { const t = tones(b); let k = 0; for (const x of tones(a)) if (t.has(x)) k++; return k; };

/**
 * Chords that would fit a cell, best first, with why: ones that lead into the next chord, ones that
 * share notes with the chord there now (a softer or darker swap), and a borrowed colour.
 */
export function suggest(mode: Mode, now: Chord, prev: Chord | null, next: Chord | null, count = 6): { chord: Chord; why: string }[] {
  const out: { chord: Chord; why: string; score: number }[] = [];
  const add = (chord: Chord | null, why: string, score: number) => {
    if (!chord || same(chord, now) || (prev && same(chord, prev))) return;
    const have = out.find((o) => same(o.chord, chord));
    if (have) { have.score = Math.max(have.score, score); return; }
    out.push({ chord, why, score });
  };
  if (next && !same(next, now)) {
    const five = (next.root + 7) % 12;
    add(inKey(mode, five) ?? { root: five, q: '7' }, 'leads into the next chord', 5);
    add({ root: five, q: '7' }, 'pulls hard into the next chord', 3.5);
    add(inKey(mode, (next.root + 5) % 12), 'leads gently into the next chord', 3);
  }
  for (const c of keyChords(mode)) {
    if (c.q === 'dim' || c.q === 'aug') continue;
    const k = shared(c, now);
    if (k >= 2) add(c, 'same notes, different mood', 4);
    else add(c, 'in the key', 1 + (c.root === 0 ? 0.5 : 0));
  }
  // colour: the same chord with a twist, and a chord borrowed from the parallel key
  if (now.q === 'maj' || now.q === 'min') {
    add({ ...now, q: now.q === 'maj' ? 'sus4' : 'm7' }, 'same chord, more colour', 2.5);
    add({ ...now, q: now.q === 'maj' ? 'maj7' : 'sus2' }, 'same chord, softer', 2.2);
  }
  const borrow: Chord = ['major', 'lydian', 'mixolydian'].includes(mode) ? { root: 10, q: 'maj' } : { root: 5, q: 'maj' };
  add(borrow, 'borrowed colour', 2);
  return out.sort((a, b) => b.score - a.score).slice(0, count).map(({ chord, why }) => ({ chord, why }));
}
