// Verse melody writer, step 1: one verse (8 bars), built up one rule at a time.
// Rule 1: an 8th note on the 5th of the chord, all the way through.
// Pure and deterministic given the seed (nothing random yet; the seed is here for the next rules).

import { Rng } from '../rng';
import { QUALITIES, SCALES, degreeChord, type Chord, type Mode } from '../theory';

export const BARS = 8;
export const STEPS_PER_BAR = 8; // 8th notes, 4/4

export interface VerseInput {
  key: number; // pitch class of the tonic, 0-11
  mode: Mode;
  /** One chord per bar, 8 of them. */
  chords: Chord[];
  seed: string;
  /** MIDI note the tune sits around. */
  centre?: number;
}

export interface VerseNote {
  /** 8th-note step from the start of the verse (0-63). */
  step: number;
  /** In 8ths. */
  len: number;
  midi: number;
  /** Which bar's chord it's on. */
  bar: number;
}

export interface Verse {
  input: VerseInput;
  notes: VerseNote[];
}

/** Chord progressions as scale degrees (0 = I), by mode. */
export const PROGRESSIONS: Record<Mode, { name: string; degrees: number[] }[]> = {
  major: [
    { name: 'I V vi IV', degrees: [0, 4, 5, 3] },
    { name: 'vi IV I V', degrees: [5, 3, 0, 4] },
    { name: 'I vi IV V', degrees: [0, 5, 3, 4] },
    { name: 'I IV vi V', degrees: [0, 3, 5, 4] },
  ],
  minor: [
    { name: 'i VI III VII', degrees: [0, 5, 2, 6] },
    { name: 'i iv VII III', degrees: [0, 3, 6, 2] },
    { name: 'i VII VI VII', degrees: [0, 6, 5, 6] },
    { name: 'i III VII iv', degrees: [0, 2, 6, 3] },
  ],
  dorian: [{ name: 'i IV i VII', degrees: [0, 3, 0, 6] }, { name: 'i ii IV i', degrees: [0, 1, 3, 0] }],
  mixolydian: [{ name: 'I bVII IV I', degrees: [0, 6, 3, 0] }, { name: 'I IV bVII IV', degrees: [0, 3, 6, 3] }],
  phrygian: [{ name: 'i bII i bVII', degrees: [0, 1, 0, 6] }],
  lydian: [{ name: 'I II I V', degrees: [0, 1, 0, 4] }],
};

/** 8 bars of chords from a progression: each chord held `barsEach` bars, the progression looped to fill. */
export function chordsFor(mode: Mode, degrees: number[], barsEach: number): Chord[] {
  const scale = SCALES[mode];
  const out: Chord[] = [];
  for (let b = 0; b < BARS; b++) out.push(degreeChord(scale, degrees[Math.floor(b / barsEach) % degrees.length]));
  return out;
}

/** Semitones of the chord's 5th above its root (7, or 6 / 8 for dim / aug). */
function fifth(c: Chord): number {
  const iv = QUALITIES[c.q] as readonly number[];
  return iv.find((i) => i === 6 || i === 7 || i === 8) ?? 7;
}

/** The pitch class nearest to `centre`. */
function nearest(pc: number, centre: number): number {
  let m = Math.round((centre - pc) / 12) * 12 + pc;
  if (m > centre + 6) m -= 12;
  if (m < centre - 6) m += 12;
  return m;
}

export function writeVerse(input: VerseInput): Verse {
  new Rng(input.seed); // reserved for the rules to come
  const centre = input.centre ?? 67;
  const notes: VerseNote[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const c = input.chords[bar];
    const midi = nearest((input.key + c.root + fifth(c)) % 12, centre);
    for (let s = 0; s < STEPS_PER_BAR; s++) notes.push({ step: bar * STEPS_PER_BAR + s, len: 1, midi, bar });
  }
  return { input, notes };
}

/** A verse note on the band's own grid: `step` in 16ths from the start of the idea, `len` in 16ths. */
export interface BandNote { step: number; len: number; midi: number }

/**
 * Rule 1 over a generated song: an 8th note on the 5th of whatever chord the band is playing.
 * `chordAt[s]`: the chord sounding on 16th step s (the idea's chord timeline, spread per step).
 */
export function verseOverBand(key: number, chordAt: Chord[], centre = 67): BandNote[] {
  const notes: BandNote[] = [];
  for (let s = 0; s < chordAt.length; s += 2) {
    const c = chordAt[s];
    notes.push({ step: s, len: 2, midi: nearest((key + c.root + fifth(c)) % 12, centre) });
  }
  return notes;
}

/** A rest left in the line: `step` and `len` in 16ths. */
export interface Gap { step: number; len: number }

/**
 * Rule 2: one or more gaps, each a half bar or a quarter bar, dropped in at random (never touching, never the whole verse).
 * `bar`: 16ths in a bar. Gaps sit on their own grid (a half bar on a half-bar line, a quarter on a beat).
 */
export function randomGaps(totalSteps: number, bar: number, seed: string): Gap[] {
  const rng = new Rng(seed + '|gaps');
  const gaps: Gap[] = [];
  const want = rng.int(1, 3);
  for (let tries = 0; gaps.length < want && tries < 40; tries++) {
    const len = rng.chance(0.5) ? bar / 2 : bar / 4;
    const step = rng.int(0, Math.floor(totalSteps / len) - 1) * len;
    if (gaps.some((g) => step <= g.step + g.len && g.step <= step + len)) continue;
    gaps.push({ step, len });
  }
  return gaps.sort((a, b) => a.step - b.step);
}

/** The line without the notes that start inside a gap. */
export function withGaps(notes: BandNote[], gaps: Gap[]): BandNote[] {
  return notes.filter((n) => !gaps.some((g) => n.step >= g.step && n.step < g.step + g.len));
}
