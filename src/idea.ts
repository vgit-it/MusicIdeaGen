// Shared types for a generated idea.

import type { Genre, GenreSel, RiffStyle } from './genres';
import type { SectionSound } from './sounds';
import type { Bar, Variant } from './rhythm';
import type { Chord, Mode } from './theory';
import type { BassLine } from './parts/bass';
import type { Tuning } from './theory/fretboard';

export type PartName = 'chords' | 'drums' | 'strum' | 'bass';

/** One seed per part so parts can be rerolled independently later (M3). */
export interface Seeds {
  song: string;
  chords: string;
  drums: string;
  strum: string;
  bass: string;
  /** Optional so older seed sets still work. */
  guitar2?: string;
  /** Piano, pad, strings and percussion layers (optional, like guitar2). */
  keys?: string;
  pad?: string;
  strings?: string;
  perc?: string;
}

export interface GenOptions {
  genre: GenreSel;
  meter: string; // 'auto' | 'mixed' | '4/4' ...
  weirdness: number; // 0..1
  /** Fixed tempo; leave out for the genre's own range. */
  bpm?: number;
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
  /** Riff genres only: guitar tuning and the riff style of each bar. */
  tuning?: Tuning;
  sections?: RiffStyle[];
  /** Tracks: force the drums into (or out of) half-time. */
  forceHalf?: boolean;
  /** Tracks: drums never wait out the first bars of a quiet intro. */
  noTacet?: boolean;
  /** Tracks: a groove the drums shouldn't pick (the verse plays a different groove from the chorus). */
  avoidGroove?: string;
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
  /** The groove's name (strummed genres), for the notes. */
  groove?: string;
}

/**
 * Strum lane symbols:
 * D down, U up, x muted scratch, p palm-muted down, . rest
 */
export type Stroke = 'D' | 'U' | 'x' | 'p' | '.';

/** One thing the guitar plays in a riff: a note, power chord or chord. */
export interface GuitarHit {
  step: number;
  /** MIDI notes, low to high, and the string each is on. */
  notes: number[];
  strings: number[];
  /** Length in 16ths. */
  len: number;
  vel: number;
  /** palm = palm-muted chug, dead = muted scratch. */
  mute?: 'palm' | 'dead';
  /** Quiet section: play on the clean channel even when the amp is driven. */
  clean?: boolean;
  /** Let other strings keep ringing (arpeggios). */
  letRing?: boolean;
  /** Slide into the note from this many semitones away. */
  slide?: number;
  /** Fade the note in (volume swell). */
  swell?: boolean;
  /** The low pedal note of a pedal riff (a harmony part skips it). */
  pedal?: boolean;
}

export interface Idea {
  seeds: Seeds;
  opts: GenOptions;
  song: Song;
  chords: ChordPart;
  drums: DrumPart;
  strum: Stroke[];
  /** MIDI note per step, 0 = rest. */
  bass: number[];
  /** Optional note length in 16ths per step (otherwise a note lasts until the next one). */
  bassLen?: number[];
  /** Strummed genres: how the bass plays (locked to the kick, held, flowing or driving). */
  bassLine?: BassLine;
  /** Riff genres: the guitar part as explicit hits (replaces the strum lane for playback). */
  guitar?: GuitarHit[];
  /** Second guitar: lead, harmony, octaves, arpeggios or swells. */
  guitar2: GuitarHit[];
  notes: string[];
  /** Set when this is one section of a track. */
  section?: SectionInfo;
}

export type SectionKind = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'interlude' | 'bridge' | 'breakdown' | 'outro';

export interface SectionInfo {
  kind: SectionKind;
  /** e.g. "Verse 2" */
  label: string;
  /** 1 (quiet) to 5 (everything). */
  energy: number;
  /** The last bar is one held chord: the end of the track. */
  ending?: boolean;
  /** The instruments it plays on (when the parts are on Auto). */
  sound?: SectionSound;
  /** Step where the band comes in (intros that start with the guitar alone); layers like the piano wait for it. */
  bandFrom?: number;
  /** How the section ends into the next one, so added layers stop or hit with the band. */
  tail?: { stop: number } | { hits: number[] } | { build: number } | { push: number } | { ring: number };
  /** The previous section pushed this one's first chord early: its downbeat isn't struck again. */
  pushedIn?: boolean;
  /** Where it sits in its track (and what the track is), so added layers can plan where they play. */
  pos?: { index: number; all: { kind: SectionKind; energy: number }[] };
}
