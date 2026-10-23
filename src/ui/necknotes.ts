// The neck view for a solo: where each of Guitar 2's notes sits on the neck (string and fret, as the player's hands
// play it) with the curves the solo writer followed (energy, the height it aimed at, the pace), on one time line.
// Pure; the viewer draws it.

import type { Idea, Move } from '../idea';
import { TUNINGS } from '../theory/fretboard';

/** A note on the neck. */
export interface NeckNote {
  step: number; len: number; midi: number;
  /** 0 = the lowest string. */
  string: number;
  fret: number;
  /** How it is reached from the last note. */
  move: Move;
  /** The melody note of its hit (the others are double-stops). */
  top: boolean;
  /** Bent up into the note from this many semitones below; picked low and bent up later; a bend let down. */
  bend?: number; late?: number; unbend?: number;
  /** Slid into from this many semitones away (positive: from below). */
  slide?: number;
  fall?: number;
  vib?: boolean; trill?: boolean; tremolo?: boolean;
}

/** Where the hand sits through a bar (the frets its notes use). */
export interface NeckBar { from: number; to: number; lo: number; hi: number; mid: number }

export interface NeckView {
  notes: NeckNote[];
  bars: NeckBar[];
  /** The frets the whole solo uses. */
  lo: number; hi: number;
  /** The tuning's open strings, low to high. */
  open: number[];
  /** How many times the hand moves to another position between bars (a move of 3 frets or more), and the strings used. */
  shifts: number;
  strings: number[];
  counts: Record<string, number>;
}

/** The hand has moved when a bar's middle fret differs from the last bar's by this many frets. */
const SHIFT = 3;

/** Whether a section is a solo or lead break with the writer's curves and notes to show. */
export function hasNeck(idea: Idea): boolean {
  return !!idea.soloCurve && idea.guitar2.some((h) => !h.mute && h.notes.length);
}

/** Where a note goes if the part gave no string: the lowest fret on the highest string that reaches it. */
function place(midi: number, open: number[]): { string: number; fret: number } {
  for (let s = open.length - 1; s >= 0; s--) { const f = midi - open[s]; if (f >= 0 && f <= 24) return { string: s, fret: f }; }
  return { string: 0, fret: Math.max(0, midi - open[0]) };
}

export function neckView(idea: Idea): NeckView {
  const open = (idea.song.tuning ?? TUNINGS.standard).strings;
  const hits = idea.guitar2.filter((h) => !h.mute && h.notes.length).sort((a, b) => a.step - b.step);
  const notes: NeckNote[] = [];
  const counts: Record<string, number> = {};
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  let prev: NeckNote | undefined;
  for (const h of hits) {
    const t = h.touch;
    const topIx = h.pedal ? -1 : h.notes.length - 1;
    h.notes.forEach((midi, j) => {
      // (a single note: the hands' own place; a double-stop: the strings it was written on)
      let spot: { string: number; fret: number };
      if (t && h.notes.length === 1) spot = { string: t.string, fret: t.fret };
      else {
        const s = h.strings[j];
        spot = s !== undefined && midi - open[s] >= 0 ? { string: s, fret: midi - open[s] } : place(midi, open);
      }
      const bend = h.bend || t?.bend;
      const n: NeckNote = {
        step: h.step + (h.shift ?? 0), len: h.len, midi, string: spot.string, fret: spot.fret,
        move: t?.move ?? (h.art === 'legato' ? 'hammer' : h.art === 'slide' ? 'slide' : 'pick'), top: j === topIx,
      };
      // (the hammer-on or pull-off direction, from the last melody note)
      if (n.move === 'hammer' && prev && midi < prev.midi) n.move = 'pull';
      if (bend) n.bend = bend;
      if (h.lateBend) n.late = h.lateBend;
      if (h.unbend) n.unbend = h.unbend;
      if (h.slide) n.slide = h.slide;
      if (t?.fall) n.fall = t.fall;
      if (h.vib ?? t?.vib) n.vib = true;
      if (h.trill) n.trill = true;
      if (h.tremolo) n.tremolo = true;
      notes.push(n);
      if (n.top) {
        if (bend) count('bends');
        if (n.late) count('late bends');
        if (n.unbend) count('bends let down');
        if (n.slide || n.move === 'slide') count('slides');
        if (n.move === 'hammer') count('hammer-ons');
        if (n.move === 'pull') count('pull-offs');
        if (n.trill) count('trills');
        if (n.tremolo) count('tremolo');
        prev = n;
      }
    });
  }

  // the hand through each bar (open strings don't count: they say nothing of where the hand is)
  const bars: NeckBar[] = idea.song.bars.map((b) => {
    const fretted = notes.filter((n) => n.fret > 0 && n.step >= b.start && n.step < b.start + b.len).map((n) => n.fret).sort((a, c) => a - c);
    const lo = fretted[0] ?? 0, hi = fretted[fretted.length - 1] ?? 0;
    return { from: b.start, to: b.start + b.len, lo, hi, mid: fretted.length ? fretted[Math.floor(fretted.length / 2)] : 0 };
  });
  let shifts = 0, last = -1;
  for (const b of bars) {
    if (!b.hi) continue;
    if (last >= 0 && Math.abs(b.mid - last) >= SHIFT) shifts++;
    last = b.mid;
  }
  const fr = notes.map((n) => n.fret);
  return {
    notes, bars, lo: Math.min(...fr), hi: Math.max(...fr), open, shifts,
    strings: [...new Set(notes.map((n) => n.string))].sort((a, b) => a - b), counts,
  };
}
