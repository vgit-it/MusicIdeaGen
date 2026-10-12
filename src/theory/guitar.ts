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
  /** A capo on this fret: open shapes played above it (rhythm.ts picks one for open-chord players). */
  capo?: number;
  /** Stay near this position on the neck (above the capo): a section played higher up. */
  near?: number;
  /** Keep the top note moving smoothly from chord to chord (voice leading). */
  smooth?: boolean;
}

/** A shape played with a capo on `capo`: every fret (open strings too) moves up. */
const withCapo = (v: GuitarVoicing, capo: number): GuitarVoicing => (capo ? toVoicing(v.frets.map((f) => (f === null ? null : f + capo))) : v);
const withoutCapo = (v: GuitarVoicing, capo: number): GuitarVoicing => (capo ? toVoicing(v.frets.map((f) => (f === null ? null : f - capo))) : v);

/** Can this chord be played as an open-position shape (open strings ringing)? */
function hasOpen(pc: number, q: Quality): boolean {
  return !!OPEN[`${pc}:${q}`] || (SHAPES[q] ?? []).some((sh) => TUNING[sh.root] % 12 === pc);
}

/**
 * The capo an open-chord player would use for these chords (0: none): the fret (up to 5, lower
 * preferred) that turns the most chords into open shapes, if it beats no capo by at least one chord.
 */
export function pickCapo(key: number, chords: Chord[]): number {
  const n = Math.max(1, chords.length);
  const score = (capo: number) => chords.filter((c) => hasOpen(mod12(chordPc(key, c) - capo), c.q)).length / n - capo * 0.02;
  let best = 0, bestScore = score(0) + 1 / n - 0.001;
  for (let capo = 1; capo <= 5; capo++) {
    const k = score(capo);
    if (k > bestScore) { best = capo; bestScore = k; }
  }
  return best;
}
const mod12 = (n: number) => ((n % 12) + 12) % 12;

const POWERABLE: Quality[] = ['maj', 'min', '7', 'm7', 'maj7', 'sus2', 'sus4', 'add9', '9', 'm9'];

/** Pick one voicing per chord, keeping the hand close to the previous shape. */
export function guitarVoicings(key: number, chords: Chord[], opts: VoicingOptions = {}): GuitarVoicing[] {
  // with a capo: choose the shapes as if the capo were the nut, then move them up
  if (opts.capo) return guitarVoicings(mod12(key - opts.capo), chords, { ...opts, capo: 0 }).map((v) => withCapo(v, opts.capo!));
  let prevPos: number | null = null;
  let prevTop: number | null = null;
  return chords.map((c) => {
    const pc = chordPc(key, c);
    const q: Quality = opts.powerChords && POWERABLE.includes(c.q) ? '5' : c.q;
    let cands = guitarCandidates(pc, q);
    if (!cands.length) cands = guitarCandidates(pc, c.q.startsWith('m') ? 'min' : 'maj');
    let best = cands[0];
    let bestCost = Infinity;
    for (const v of cands) {
      let k = cost(v, prevPos, !!opts.preferOpen && opts.near === undefined);
      if (opts.near !== undefined) k += Math.abs(position(v) - opts.near) * 0.7;
      if (opts.smooth && prevTop !== null) k += Math.min(5, Math.abs(v.notes[v.notes.length - 1] - prevTop)) * 0.35;
      if (k < bestCost) { best = v; bestCost = k; }
    }
    prevPos = position(best);
    prevTop = best.notes[best.notes.length - 1];
    return best;
  });
}

/**
 * How a strum voices its chord, besides the usual shape (rhythm guitar, src/players/rhythm.ts):
 * - sus4 / sus2 / add9: the shape with one finger moved (the 3rd up to the 4th or down to the 2nd,
 *   or a root up to the 9th), the embellishment players add on a held chord and take off again
 * - top: a three-string triad on the top strings, up the neck (small funk and pop voicings)
 * - power: root and 5th (and octave) on the low strings
 * - drone: a power chord on the low strings with the open B and E strings ringing over it (indie,
 *   alt rock; only in keys where those notes belong, rhythm.ts checks)
 */
export type StrumColour = 'sus4' | 'sus2' | 'add9' | 'top' | 'power' | 'drone';

const span = (frets: Frets) => { const f = frets.filter((x): x is number => x !== null && x > 0); return f.length ? Math.max(...f) - Math.min(...f) : 0; };

/** The shape `base` (of `chord`) played with a colour; null when the hand can't (it then plays the shape). */
export function colourVoicing(base: GuitarVoicing, key: number, chord: Chord, colour: StrumColour): GuitarVoicing | null {
  const pc = chordPc(key, chord);
  const minor = chord.q === 'min' || chord.q === 'm7';
  const plain = chord.q === 'maj' || chord.q === 'min' || chord.q === '5';
  if (colour === 'power') {
    const pos = position(base);
    const c = guitarCandidates(pc, '5').sort((a, b) => Math.abs(position(a) - pos) - Math.abs(position(b) - pos))[0];
    return c ?? null;
  }
  if (colour === 'top') return topTriad(pc, chord, position(base));
  if (colour === 'drone') {
    // root on the low E or A string (open or up to fret 9), nearest where the hand is
    let best: GuitarVoicing | null = null, bestD = Infinity;
    for (const r of [0, 1]) {
      const f = mod12(pc - TUNING[r]);
      if (f > 9 || Math.abs(f - position(base)) >= bestD) continue;
      const frets: Frets = [x, x, x, x, 0, 0];
      frets[r] = f; frets[r + 1] = f + 2; frets[r + 2] = f + 2;
      best = toVoicing(frets);
      bestD = Math.abs(f - position(base));
    }
    return best;
  }
  if (!plain || chord.q === '5') return null;
  const third = (pc + (minor ? 3 : 4)) % 12;
  const frets = [...base.frets];
  let moved = false;
  if (colour === 'add9') {
    // a root above the bass note goes up a whole step (the highest one: it's what the ear hears)
    for (let s = 5; s >= 1 && !moved; s--) {
      const f = frets[s];
      if (f === null || (TUNING[s] + f) % 12 !== pc || base.notes[0] === TUNING[s] + f) continue;
      frets[s] = f + 2;
      moved = true;
    }
  } else {
    const shift = colour === 'sus4' ? (minor ? 2 : 1) : (minor ? -1 : -2);
    for (let s = 0; s < 6; s++) {
      const f = frets[s];
      if (f === null || (TUNING[s] + f) % 12 !== third) continue;
      if (f + shift < 0) return null;
      frets[s] = f + shift;
      moved = true;
    }
  }
  if (!moved || span(frets) > 4) return null;
  return toVoicing(frets);
}

/** A triad on the G, B and high E strings (or D, G, B), between frets 2 and 14, near fret 7 (or the chord's position + 5). */
function topTriad(pc: number, chord: Chord, near: number): GuitarVoicing | null {
  const tones = [0, chord.q === 'min' || chord.q === 'm7' || chord.q === 'm9' || chord.q === 'dim' || chord.q === 'm7b5' ? 3 : 4, chord.q === 'dim' || chord.q === 'm7b5' ? 6 : chord.q === 'aug' ? 8 : 7]
    .map((i) => (pc + i) % 12);
  const want = Math.max(5, Math.min(9, near + 5));
  let best: GuitarVoicing | null = null, bestCost = Infinity;
  for (const set of [[3, 4, 5], [2, 3, 4]]) {
    const opts = set.map((s) => Array.from({ length: 13 }, (_, i) => i + 2).filter((f) => tones.includes((TUNING[s] + f) % 12)));
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) {
      const fs = [a, b, c];
      const pcs = new Set(fs.map((f, i) => (TUNING[set[i]] + f) % 12));
      if (pcs.size < 3 || Math.max(...fs) - Math.min(...fs) > 3) continue;
      const k = Math.abs((a + b + c) / 3 - want) + (set[0] === 2 ? 1.5 : 0);
      if (k < bestCost) {
        bestCost = k;
        const frets: Frets = [x, x, x, x, x, x];
        set.forEach((s, i) => { frets[s] = fs[i]; });
        best = toVoicing(frets);
      }
    }
  }
  return best;
}

/**
 * The shape a stroke plays (playback and MIDI export alike): the chord's shape, or its colour.
 * Power chords only on an electric guitar; an electric's palm mutes chug on the power chord (the low
 * strings of an open shape, muted, were mud).
 */
export function strokeShape(shape: GuitarVoicing, key: number, chord: Chord, colour: StrumColour | undefined,
  o: { electric: boolean; palm: boolean; capo?: number }): GuitarVoicing {
  // (with a capo: worked out as if the capo were the nut)
  if (o.capo) return withCapo(strokeShape(withoutCapo(shape, o.capo), mod12(key - o.capo), chord, colour, { ...o, capo: 0 }), o.capo);
  const c = o.palm && o.electric ? 'power' : colour === 'power' && !o.electric ? undefined : colour;
  return (c && colourVoicing(shape, key, chord, c)) || shape;
}
