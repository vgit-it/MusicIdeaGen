// Genre settings. rock/pop/funk are ported from the spike (strummed); the others are riff-based.

import type { Rng } from './rng';
import type { Chord, Mode } from './theory';

export type Genre = 'rock' | 'pop' | 'funk' | 'hardrock' | 'metal' | 'grunge' | 'altmetal';
export type GenreSel = Genre | 'random';
export const GENRE_LIST: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
export const GENRE_LABEL: Record<Genre, string> = {
  rock: 'Rock', pop: 'Pop', funk: 'Funk', hardrock: 'Hard rock', metal: 'Heavy metal', grunge: 'Grunge', altmetal: 'Alt metal',
};

export interface DrumStyle {
  fourFloor: number;
  halfTime: number;
  kick8: number;
  kick16: number;
  ghost: number;
  hats: HatPattern[];
  /** Chance of an open hat on the last off-beat of a bar. */
  openHat: number;
  /** Chance a B/C section moves from hi-hat to ride. */
  ride: number;
}

export type HatPattern = '8' | '16' | 'off';

export interface BassStyle {
  lock: number;
  oct: number;
  fifth: number;
  six: number;
}

/**
 * How a riff section is played:
 * - single: single-note riff on the low strings (with the odd power chord)
 * - chug: palm-muted chugs with power-chord stabs
 * - big: open, ringing power chords (chorus)
 * - arp: clean picked arpeggios (quiet verse / intro)
 * - picked: a chord shape picked string by string with a moving top note, as a hook (driven, not clean)
 * - lick: chord stabs with space, answered by a single-note lick (hard rock)
 * - pedal: a melody bouncing off a palm-muted low pedal note
 * - gallop: the 8th + two 16ths gallop, on a moving line or on power chords (heavy metal)
 */
export type RiffStyle = 'single' | 'chug' | 'big' | 'arp' | 'picked' | 'lick' | 'pedal' | 'gallop';

/** Quiet styles play on the clean channel. */
export const QUIET_STYLES: readonly RiffStyle[] = ['arp'];

export interface RiffGenre {
  /** Chord roots as semitones above the tonic. */
  progs: number[][];
  /** Tuning ids (see theory/fretboard) with weights. */
  tunings: [string, number][];
  /** First half / second half of the 8 bars, with weights. */
  arrangements: [RiffStyle, RiffStyle, number][];
  /** Chance of 16th-note chugs instead of 8ths. */
  sixteenths: number;
  /** Chance a riff note slides in from below. */
  slide: number;
  /** Chance a section's drums play half-time. */
  halfTime: number;
  /** How often the kick doubles the guitar chugs. */
  kickChug: number;
  /** Tracks: verse styles when the idea uses one style throughout. */
  verse: [RiffStyle, number][];
  /** Tracks: bridge styles (a quiet clean bridge is also possible). */
  bridge: [RiffStyle, number][];
  /** Tracks: the bridge is a half-time chug breakdown. */
  breakdown?: boolean;
}

export interface GenreDef {
  bpm: [number, number];
  swing: number;
  modes: Mode[];
  altMeters: string[];
  seventh?: boolean;
  prog: number[][];
  flavor: (c: Chord, rng: Rng) => Chord;
  drum: DrumStyle;
  bass: BassStyle;
  riff?: RiffGenre;
}

export const GENRES: Record<Genre, GenreDef> = {
  rock: {
    bpm: [100, 150], swing: 0, modes: ['major', 'minor', 'mixolydian'], altMeters: ['6/8', '3/4'],
    prog: [[0, 3, 4, 3], [0, 6, 3, 0], [0, 4, 3, 3], [5, 3, 0, 4], [0, 2, 3, 4], [0, 5, 3, 4]],
    flavor: (c, rng) => ((c.q === 'maj' || c.q === 'min') && rng.chance(0.55) ? { ...c, q: '5' } : c),
    drum: { fourFloor: 0.05, halfTime: 0.2, kick8: 0.22, kick16: 0.04, ghost: 0, hats: ['8', '8', '16'], openHat: 0.3, ride: 0.35 },
    bass: { lock: 0.85, oct: 0.1, fifth: 0.15, six: 0 },
  },
  pop: {
    bpm: [90, 128], swing: 0, modes: ['major', 'major', 'minor'], altMeters: ['6/8', '3/4'],
    prog: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 0, 4, 5], [0, 3, 5, 4], [0, 2, 3, 4]],
    flavor: (c, rng) => (c.q === 'maj' && rng.chance(0.3) ? { ...c, q: rng.pick(['add9', 'sus2', 'sus4', 'maj7'] as const) } : c),
    drum: { fourFloor: 0.4, halfTime: 0.25, kick8: 0.18, kick16: 0.06, ghost: 0.05, hats: ['8', 'off', '16'], openHat: 0.25, ride: 0.2 },
    bass: { lock: 0.7, oct: 0.15, fifth: 0.2, six: 0.05 },
  },
  funk: {
    bpm: [95, 115], swing: 0.18, modes: ['dorian', 'mixolydian', 'minor'], altMeters: ['3/4', '5/4'], seventh: true,
    prog: [[0, 0, 0, 0], [0, 3, 0, 3], [0, 0, 3, 3], [0, 6, 3, 0], [0, 0, 0, 3]],
    flavor: (c, rng) => {
      const s = c.q === 'maj' ? '7' : c.q === 'min' ? 'm7' : c.q;
      const r: Chord = { ...c, q: s };
      if (rng.chance(0.35)) r.q = s === '7' ? rng.pick(['9', '7#9'] as const) : s === 'm7' ? 'm9' : s;
      return r;
    },
    drum: { fourFloor: 0, halfTime: 0, kick8: 0.25, kick16: 0.2, ghost: 0.32, hats: ['16', '16', '8'], openHat: 0.4, ride: 0.1 },
    bass: { lock: 0.85, oct: 0.35, fifth: 0.15, six: 0.22 },
  },
  // Alice in Chains, Soundgarden, Nirvana: slow and heavy, single-note riffs, dark minor/phrygian moves
  grunge: {
    bpm: [72, 118], swing: 0, modes: ['minor', 'minor', 'phrygian', 'dorian'], altMeters: ['6/8', '7/8'],
    prog: [[0, 2, 5, 6]], flavor: (c) => c,
    drum: { fourFloor: 0, halfTime: 0.45, kick8: 0.2, kick16: 0.05, ghost: 0.04, hats: ['8', '8', '16'], openHat: 0.35, ride: 0.4 },
    bass: { lock: 0.9, oct: 0.1, fifth: 0.05, six: 0 },
    riff: {
      progs: [
        [0, 3, 5, 3], [0, 1, 0, 10], [0, 6, 5, 3], [0, 8, 10, 0], [0, 3, 10, 5],
        [0, 0, 1, 3], [0, 5, 8, 7], [0, 10, 8, 10], [0, 3, 0, 6], [0, 0, 5, 3],
      ],
      tunings: [['dropD', 5], ['eb', 4], ['standard', 1]],
      arrangements: [
        ['single', 'single', 3], ['single', 'big', 3], ['arp', 'big', 2], ['chug', 'big', 2],
        ['big', 'big', 1], ['single', 'chug', 1], ['arp', 'single', 1],
      ],
      sixteenths: 0.25, slide: 0.35, halfTime: 0.45, kickChug: 0.25,
      verse: [['single', 2], ['arp', 1], ['chug', 1]],
      bridge: [['single', 1], ['big', 1], ['chug', 1]],
    },
  },
  // Linkin Park, Deftones, Korn: drop tunings, tight chugs and stabs, quiet verses into huge choruses
  altmetal: {
    bpm: [84, 112], swing: 0, modes: ['minor', 'minor', 'phrygian'], altMeters: ['6/8', '7/8'],
    prog: [[0, 5, 2, 6]], flavor: (c) => c,
    drum: { fourFloor: 0, halfTime: 0.35, kick8: 0.25, kick16: 0.12, ghost: 0.03, hats: ['16', '8', '16'], openHat: 0.2, ride: 0.25 },
    bass: { lock: 0.95, oct: 0.05, fifth: 0.05, six: 0 },
    riff: {
      progs: [
        [0, 8, 3, 10], [0, 8, 10, 10], [0, 3, 8, 10], [0, 1, 0, 1], [0, 10, 8, 7],
        [0, 5, 8, 10], [0, 8, 5, 10], [0, 0, 8, 10], [0, 3, 1, 0],
      ],
      tunings: [['dropD', 5], ['dropCs', 3], ['d', 2]],
      arrangements: [
        ['chug', 'chug', 3], ['arp', 'chug', 3], ['arp', 'big', 3], ['chug', 'big', 3],
        ['big', 'big', 1], ['single', 'chug', 1],
      ],
      sixteenths: 0.5, slide: 0.08, halfTime: 0.35, kickChug: 0.55,
      verse: [['chug', 2], ['arp', 2]],
      bridge: [['chug', 1]],
      breakdown: true,
    },
  },
  // Guns N' Roses, AC/DC, Van Halen, Aerosmith: hooky picked riffs, chord stabs with licks, I–bVII–IV
  hardrock: {
    bpm: [92, 138], swing: 0, modes: ['mixolydian', 'mixolydian', 'major', 'minor'], altMeters: ['6/8', '3/4'],
    prog: [[0, 6, 3, 0]], flavor: (c) => c,
    drum: { fourFloor: 0, halfTime: 0.1, kick8: 0.15, kick16: 0.02, ghost: 0.04, hats: ['8', '8', '16'], openHat: 0.3, ride: 0.35 },
    bass: { lock: 0.85, oct: 0.1, fifth: 0.1, six: 0 },
    riff: {
      progs: [
        [0, 10, 5, 0], [0, 10, 5, 5], [0, 5, 0, 10], [0, 7, 10, 0], [0, 0, 10, 5],
        [0, 5, 7, 5], [0, 10, 0, 5], [0, 3, 5, 0], [0, 5, 10, 7],
      ],
      tunings: [['standard', 3], ['eb', 3]],
      arrangements: [
        ['picked', 'big', 3], ['picked', 'picked', 2], ['lick', 'lick', 3], ['lick', 'big', 2],
        ['picked', 'lick', 2], ['pedal', 'big', 1], ['single', 'big', 1], ['arp', 'lick', 1],
      ],
      sixteenths: 0.15, slide: 0.3, halfTime: 0.1, kickChug: 0.2,
      verse: [['lick', 2], ['picked', 2], ['pedal', 1], ['single', 1]],
      bridge: [['big', 1], ['single', 1], ['picked', 1]],
    },
  },
  // Iron Maiden, Judas Priest, early Metallica: gallops, pedal riffs, twin harmony leads, minor keys
  metal: {
    bpm: [112, 176], swing: 0, modes: ['minor', 'minor', 'dorian', 'phrygian'], altMeters: ['6/8', '3/4'],
    prog: [[0, 5, 6, 0]], flavor: (c) => c,
    drum: { fourFloor: 0, halfTime: 0.08, kick8: 0.2, kick16: 0.06, ghost: 0, hats: ['8', '8', '16'], openHat: 0.2, ride: 0.4 },
    bass: { lock: 0.95, oct: 0.05, fifth: 0.05, six: 0 },
    riff: {
      progs: [
        [0, 8, 10, 0], [0, 10, 8, 10], [0, 8, 3, 10], [0, 5, 8, 10], [0, 0, 8, 10],
        [0, 3, 10, 8], [0, 7, 8, 10], [0, 10, 0, 8], [0, 3, 5, 7],
      ],
      tunings: [['standard', 4], ['eb', 2], ['dropD', 1]],
      arrangements: [
        ['gallop', 'gallop', 3], ['gallop', 'big', 3], ['pedal', 'gallop', 2], ['pedal', 'big', 2],
        ['chug', 'gallop', 1], ['single', 'gallop', 1], ['arp', 'gallop', 1], ['pedal', 'pedal', 1],
      ],
      sixteenths: 0.5, slide: 0.1, halfTime: 0.08, kickChug: 0.45,
      verse: [['gallop', 2], ['pedal', 2], ['chug', 1]],
      bridge: [['big', 1], ['single', 1], ['gallop', 1]],
    },
  },
};
