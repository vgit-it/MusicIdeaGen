// Guitar-shaped chord voicings (standard tuning).
// Strings are indexed low to high: 0 = low E ... 5 = high E. null = string not played.

import { type Chord, type Quality, chordPc } from './index';

export const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

type Frets = (number | null)[];

export interface GuitarVoicing {
  frets: Frets;
  /** MIDI notes, low string to high string (muted strings left out). */
  notes: number[];
}

const x = null;

/** Moveable shapes as fret offsets from the root fret, per root string (E, A or D string). */
const SHAPES: Partial<Record<Quality, { root: 0 | 1 | 2; frets: Frets }[]>> = {
  maj: [{ root: 0, frets: [0, 2, 2, 1, 0, 0] }, { root: 1, frets: [x, 0, 2, 2, 2, 0] }, { root: 2, frets: [x, x, 0, 2, 3, 2] }],
  min: [{ root: 0, frets: [0, 2, 2, 0, 0, 0] }, { root: 1, frets: [x, 0, 2, 2, 1, 0] }, { root: 2, frets: [x, x, 0, 2, 3, 1] }],
  '7': [{ root: 0, frets: [0, 2, 0, 1, 0, 0] }, { root: 1, frets: [x, 0, 2, 0, 2, 0] }, { root: 2, frets: [x, x, 0, 2, 1, 2] }],
  m7: [{ root: 0, frets: [0, 2, 0, 0, 0, 0] }, { root: 1, frets: [x, 0, 2, 0, 1, 0] }, { root: 2, frets: [x, x, 0, 2, 1, 1] }],
  maj7: [{ root: 0, frets: [0, x, 1, 1, 0, x] }, { root: 1, frets: [x, 0, 2, 1, 2, 0] }, { root: 2, frets: [x, x, 0, 2, 2, 2] }],
  sus2: [{ root: 1, frets: [x, 0, 2, 2, 0, 0] }, { root: 2, frets: [x, x, 0, 2, 3, 0] }],
  sus4: [{ root: 0, frets: [0, 2, 2, 2, 0, 0] }, { root: 1, frets: [x, 0, 2, 2, 3, 0] }, { root: 2, frets: [x, x, 0, 2, 3, 3] }],
  '5': [{ root: 0, frets: [0, 2, 2, x, x, x] }, { root: 1, frets: [x, 0, 2, 2, x, x] }],
  '9': [{ root: 0, frets: [0, 2, 0, 1, 0, 2] }, { root: 1, frets: [x, 0, -1, 0, 0, 0] }],
  m9: [{ root: 0, frets: [0, 2, 0, 0, 0, 2] }, { root: 1, frets: [x, 0, -2, 0, 0, x] }],
  add9: [{ root: 0, frets: [0, 2, 2, 1, 0, 2] }, { root: 1, frets: [x, 0, 2, 4, 2, 0] }],
  '7#9': [{ root: 1, frets: [x, 0, -1, 0, 1, x] }, { root: 0, frets: [0, x, 0, 1, 3, 3] }],
  dim: [{ root: 1, frets: [x, 0, 1, 2, 1, x] }],
  m7b5: [{ root: 1, frets: [x, 0, 1, 0, 1, x] }],
  aug: [{ root: 1, frets: [x, 0, -1, -2, -2, x] }],
};

/** Classic open chords that aren't covered by the moveable shapes at fret 0. Key: "pc:quality". */
const OPEN: Record<string, Frets> = {
  '0:maj': [x, 3, 2, 0, 1, 0], // C
  '7:maj': [3, 2, 0, 0, 0, 3], // G
  '0:7': [x, 3, 2, 3, 1, 0], // C7
  '7:7': [3, 2, 0, 0, 0, 1], // G7
  '11:7': [x, 2, 1, 2, 0, 2], // B7
  '0:maj7': [x, 3, 2, 0, 0, 0], // Cmaj7
  '5:maj7': [x, x, 3, 2, 1, 0], // Fmaj7
  '0:add9': [x, 3, 2, 0, 3, 0], // Cadd9
  '7:5': [3, 5, 5, x, x, x], // G5
  '2:sus2': [x, x, 0, 2, 3, 0], // Dsus2
};

const MAX_FRET = 15;

function toVoicing(frets: Frets): GuitarVoicing {
  const notes: number[] = [];
  frets.forEach((f, s) => { if (f !== null) notes.push(TUNING[s] + f); });
  return { frets, notes };
}

/** All playable voicings for a chord (pitch class + quality). */
export function guitarCandidates(pc: number, q: Quality): GuitarVoicing[] {
  const out: GuitarVoicing[] = [];
  for (const shape of SHAPES[q] ?? []) {
    const base = (pc - (TUNING[shape.root] % 12) + 12) % 12;
    for (const rootFret of [base, base + 12]) {
      const frets = shape.frets.map((o) => (o === null ? null : o + rootFret));
      if (frets.every((f) => f === null || (f >= 0 && f <= MAX_FRET))) out.push(toVoicing(frets));
    }
  }
  const open = OPEN[`${pc}:${q}`];
  if (open) out.push(toVoicing(open));
  return out;
}

const fretted = (v: GuitarVoicing) => v.frets.filter((f): f is number => f !== null && f > 0);

/** Average hand position (0 = open position). */
function position(v: GuitarVoicing): number {
  const f = fretted(v);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
}

function cost(v: GuitarVoicing, prevPos: number | null, preferOpen: boolean): number {
  const f = fretted(v);
  const span = f.length ? Math.max(...f) - Math.min(...f) : 0;
  const pos = position(v);
  const hasOpen = v.frets.some((fr) => fr === 0);
  let c = 0;
  c += span > 3 ? (span - 3) * 3 : 0; // hard stretches
  c += pos > 9 ? (pos - 9) * 1.5 : 0; // way up the neck sounds thin
  c += (6 - v.notes.length) * 0.4; // fuller chords strum better
  if (preferOpen) c += hasOpen && pos < 4 ? -2 : pos * 0.25;
  if (prevPos !== null) c += Math.abs(pos - prevPos) * 0.8; // stay in one area of the neck
  return c;
}

export interface VoicingOptions {
  /** Favour open-position chords (acoustic guitar). */
  preferOpen?: boolean;
  /** Turn triads and 7ths into power chords (high-gain electric). */
  powerChords?: boolean;
}

const POWERABLE: Quality[] = ['maj', 'min', '7', 'm7', 'maj7', 'sus2', 'sus4', 'add9', '9', 'm9'];

/** Pick one voicing per chord, keeping the hand close to the previous shape. */
export function guitarVoicings(key: number, chords: Chord[], opts: VoicingOptions = {}): GuitarVoicing[] {
  let prevPos: number | null = null;
  return chords.map((c) => {
    const pc = chordPc(key, c);
    const q: Quality = opts.powerChords && POWERABLE.includes(c.q) ? '5' : c.q;
    let cands = guitarCandidates(pc, q);
    if (!cands.length) cands = guitarCandidates(pc, c.q.startsWith('m') ? 'min' : 'maj');
    let best = cands[0];
    let bestCost = Infinity;
    for (const v of cands) {
      const k = cost(v, prevPos, !!opts.preferOpen);
      if (k < bestCost) { best = v; bestCost = k; }
    }
    prevPos = position(best);
    return best;
  });
}
