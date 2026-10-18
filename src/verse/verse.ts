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

/** A stretch of the verse: `step` and `len` in 16ths. */
export interface Gap { step: number; len: number }

const overlaps = (a: Gap, b: Gap) => a.step < b.step + b.len && b.step < a.step + a.len;

/**
 * Rule 2: gaps, each a half bar or a quarter bar, at random. At least `MIN_GAPS` in every 4 bars (and up to `MAX_GAPS`),
 * never touching. A half bar sits on a half-bar line, a quarter on a beat.
 * `bar`: 16ths in a bar.
 */
export const MIN_GAPS = 2;
export const MAX_GAPS = 4;
export function randomGaps(totalSteps: number, bar: number, seed: string): Gap[] {
  const rng = new Rng(seed + '|gaps');
  const gaps: Gap[] = [];
  const block = bar * 4;
  for (let from = 0; from < totalSteps; from += block) {
    const to = Math.min(totalSteps, from + block);
    const want = rng.int(MIN_GAPS, MAX_GAPS);
    let got = 0;
    for (let tries = 0; got < want && tries < 60; tries++) {
      const len = Math.round(rng.chance(0.5) ? bar / 2 : bar / 4);
      const step = from + rng.int(0, Math.floor((to - from) / len) - 1) * len;
      if (step + len > to) continue;
      // (touching counts: two gaps side by side would read as one long one)
      if (gaps.some((g) => step <= g.step + g.len && g.step <= step + len)) continue;
      gaps.push({ step, len });
      got++;
    }
  }
  return gaps.sort((a, b) => a.step - b.step);
}

/** The line without the notes that start inside a gap. */
export function withGaps(notes: BandNote[], gaps: Gap[]): BandNote[] {
  return notes.filter((n) => !gaps.some((g) => n.step >= g.step && n.step < g.step + g.len));
}

/**
 * Rule 3: stretches of 16th notes, an eighth of a bar, a quarter or a half, at random, in the open spaces between the gaps.
 * The higher the verse's energy (1-5), the fewer.
 */
export function randomRuns(totalSteps: number, bar: number, energy: number, gaps: Gap[], seed: string): Gap[] {
  const rng = new Rng(seed + '|runs');
  const runs: Gap[] = [];
  const p = Math.max(0.05, (6 - energy) / 6); // energy 1: 83%, 3: 50%, 5: 17% (of 4 tries every 4 bars)
  const block = bar * 4;
  for (let from = 0; from < totalSteps; from += block) {
    const to = Math.min(totalSteps, from + block);
    for (let k = 0; k < 4; k++) {
      if (!rng.chance(p)) continue;
      const r = rng.next();
      const len = Math.max(2, Math.round(r < 0.5 ? bar / 8 : r < 0.85 ? bar / 4 : bar / 2));
      for (let tries = 0; tries < 20; tries++) {
        const step = from + rng.int(0, Math.floor((to - from) / len) - 1) * len;
        const run = { step, len };
        if (step + len > to || gaps.some((g) => overlaps(g, run)) || runs.some((o) => overlaps(o, run))) continue;
        runs.push(run);
        break;
      }
    }
  }
  return runs.sort((a, b) => a.step - b.step);
}

/** The 8th notes inside each run swapped for 16ths on the 5th of the chord at each step. */
export function withRuns(notes: BandNote[], runs: Gap[], key: number, chordAt: Chord[], centre = 67): BandNote[] {
  const inRun = (s: number) => runs.some((r) => s >= r.step && s < r.step + r.len);
  const out = notes.filter((n) => !inRun(n.step));
  for (const r of runs) {
    for (let s = r.step; s < r.step + r.len && s < chordAt.length; s++) {
      const c = chordAt[s];
      out.push({ step: s, len: 1, midi: nearest((key + c.root + fifth(c)) % 12, centre) });
    }
  }
  return out.sort((a, b) => a.step - b.step);
}
