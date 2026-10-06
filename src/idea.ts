// Shared types for a generated idea.

import type { Genre, GenreSel } from './genres';
import type { Bar, Variant } from './rhythm';
import type { Chord, Mode } from './theory';

export type PartName = 'chords' | 'drums' | 'strum' | 'bass';

/** One seed per part so parts can be rerolled independently later (M3). */
export interface Seeds {
  song: string;
  chords: string;
  drums: string;
  strum: string;
  bass: string;
}

export interface GenOptions {
  genre: GenreSel;
  meter: string; // 'auto' | 'mixed' | '4/4' ...
  weirdness: number; // 0..1
}

/** A rhythm that repeats every `len` 16ths regardless of the bar line. */
export interface Cycle {
  part: 'hat' | 'kick' | 'strum';
  len: number;
}

/** Song-level decisions every part builds on. */
export interface Song {
  genreSel: GenreSel;
  genre: Genre;
  partGenres: { drums: Genre; strum: Genre; bass: Genre };
  key: number;
  mode: Mode;
  bpm: number;
  swing: number;
  w: number;
  meters: string[];
  meterLabel: string;
  groupsFor: Record<string, number[]>;
  bars: Bar[];
  total: number;
  plan: Variant[];
  cycles: Cycle[];
}

export interface ChordEvent {
  step: number;
  chord: Chord;
}

export interface ChordPart {
  timeline: ChordEvent[];
  /** For each step, the index into timeline of the chord sounding. */
  chordIdx: number[];
  notes: string[];
}

/** Drum lanes, one value per 16th step. 0 = silent, otherwise velocity (toms: 1-3 = which tom). */
export interface DrumPart {
  kick: number[];
  snare: number[];
  hat: number[];
  hatOpen: number[];
  ride: number[];
  crash: number[];
  tom: number[];
  fills: { bar: number; len: number }[];
  halfTime: boolean;
  fourFloor: boolean;
}

/**
 * Strum lane symbols:
 * D down, U up, x muted scratch, p palm-muted down, . rest
 */
export type Stroke = 'D' | 'U' | 'x' | 'p' | '.';

export interface Idea {
  seeds: Seeds;
  opts: GenOptions;
  song: Song;
  chords: ChordPart;
  drums: DrumPart;
  strum: Stroke[];
  /** MIDI note per step, 0 = rest. */
  bass: number[];
  notes: string[];
}
