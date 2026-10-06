// Notes, chord qualities and scales.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const QUALITIES = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '5': [0, 7, 12],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  m7b5: [0, 3, 6, 10],
  '7#9': [0, 4, 7, 10, 15],
} as const satisfies Record<string, readonly number[]>;

export type Quality = keyof typeof QUALITIES;

export const QUALITY_LABEL: Record<Quality, string> = {
  maj: '', min: 'm', dim: 'dim', aug: '+', '5': '5', maj7: 'maj7', m7: 'm7', '7': '7', '9': '9',
  m9: 'm9', sus2: 'sus2', sus4: 'sus4', add9: 'add9', m7b5: 'm7b5', '7#9': '7#9',
};

/** A chord relative to the key: root is 0-11 semitones above the tonic. */
export interface Chord {
  root: number;
  q: Quality;
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const satisfies Record<string, readonly number[]>;

export type Mode = keyof typeof SCALES;

/** Diatonic chord on scale degree d (0-based), optionally with a 7th. */
export function degreeChord(scale: readonly number[], d: number, seventh = false): Chord {
  const n = (i: number) => scale[(d + i) % 7] + (d + i >= 7 ? 12 : 0);
  const r = n(0), t = n(2) - r, f = n(4) - r, s = n(6) - r;
  let q: Quality = t === 4 && f === 7 ? 'maj' : t === 3 && f === 7 ? 'min' : t === 3 && f === 6 ? 'dim' : 'aug';
  if (seventh) {
    q = q === 'maj' ? (s === 11 ? 'maj7' : '7') : q === 'min' ? 'm7' : q === 'dim' ? 'm7b5' : q;
  }
  return { root: r % 12, q };
}

export function chordName(key: number, c: Chord): string {
  return NOTE_NAMES[(key + c.root) % 12] + QUALITY_LABEL[c.q];
}

/** Pitch class (0-11) of a chord in a given key. */
export const chordPc = (key: number, c: Chord) => (key + c.root) % 12;

/** Close piano voicing between E3 and ~E5 (from the spike). */
export function pianoVoicing(key: number, c: Chord): number[] {
  let base = 48 + chordPc(key, c);
  if (base < 52) base += 12;
  return QUALITIES[c.q].map((i) => base + i);
}
