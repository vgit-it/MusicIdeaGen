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
