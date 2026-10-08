// Fretboard helpers for alternate tunings: power chords, low-string riff notes and chord shapes.

import type { Chord } from './index';
import { chordPc } from './index';
import { type GuitarVoicing, guitarVoicings, type VoicingOptions } from './guitar';

export interface Tuning {
  id: string;
  name: string;
  /** MIDI note of each open string, low to high. */
  strings: number[];
}

export const TUNINGS: Record<string, Tuning> = {
  standard: { id: 'standard', name: 'Standard', strings: [40, 45, 50, 55, 59, 64] },
  eb: { id: 'eb', name: 'Eb standard', strings: [39, 44, 49, 54, 58, 63] },
  d: { id: 'd', name: 'D standard', strings: [38, 43, 48, 53, 57, 62] },
  dropD: { id: 'dropD', name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
  dropCs: { id: 'dropCs', name: 'Drop C#', strings: [37, 44, 49, 54, 58, 63] },
};

/** A set of fretted notes: MIDI notes and the string each is on (low to high). */
export interface Fretted {
  notes: number[];
  strings: number[];
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const isDrop = (t: Tuning) => t.strings[1] - t.strings[0] === 7;

/** Power chord (root, 5th, octave) low on the neck, rooted on the 6th or 5th string. */
export function powerChord(pc: number, t: Tuning, octave = true): Fretted {
  const s = t.strings;
  const f0 = mod(pc - s[0], 12);
  const f1 = mod(pc - s[1], 12);
  // one-finger drop shape on the low string is the heavy default
  const low: Fretted = isDrop(t)
    ? { notes: [s[0] + f0, s[1] + f0, s[2] + f0], strings: [0, 1, 2] }
    : { notes: [s[0] + f0, s[1] + f0 + 2, s[2] + f0 + 2], strings: [0, 1, 2] };
  const mid: Fretted = { notes: [s[1] + f1, s[2] + f1 + 2, s[3] + f1 + 2], strings: [1, 2, 3] };
  const pick = f0 <= 7 || f1 + 2.5 >= f0 ? low : mid;
  return octave ? pick : { notes: pick.notes.slice(0, 2), strings: pick.strings.slice(0, 2) };
}

/** A single riff note on the lowest strings that can reach it comfortably. */
export function riffNote(midi: number, t: Tuning): Fretted {
  let best: Fretted | null = null;
  let bestCost = Infinity;
  for (let s = 0; s < 4; s++) {
    const fret = midi - t.strings[s];
    if (fret < 0 || fret > 12) continue;
    const cost = fret + s * 2.2; // favour the low strings
    if (cost < bestCost) { best = { notes: [midi], strings: [s] }; bestCost = cost; }
  }
  return best ?? { notes: [midi], strings: [0] };
}

/** Lowest MIDI note of a pitch class that the low string can play. */
export const lowestOf = (pc: number, t: Tuning) => t.strings[0] + mod(pc - t.strings[0], 12);

/**
 * Chord shapes in any tuning. Standard-shaped tunings are standard shapes shifted;
 * drop tunings move the 6th-string note up two frets (or drop it) and add the open low root.
 */
export function voicingsInTuning(key: number, chords: Chord[], t: Tuning, opts: VoicingOptions = {}): GuitarVoicing[] {
  const shift = t.strings[5] - 64;
  const drop = isDrop(t);
  return guitarVoicings(mod(key - shift, 12), chords, opts).map((v, i) => {
    const frets = [...v.frets];
    if (drop) {
      if (frets[0] !== null) frets[0] = frets[0] + 2 <= 12 ? frets[0] + 2 : null;
      if (frets[0] === null && chordPc(key, chords[i]) === mod(t.strings[0], 12)) frets[0] = 0;
    }
    const notes: number[] = [];
    frets.forEach((f, s) => { if (f !== null) notes.push(t.strings[s] + f); });
    return { frets, notes };
  });
}
