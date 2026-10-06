// Genre settings (ported from the spike).

import type { Rng } from './rng';
import type { Chord, Mode } from './theory';

export type Genre = 'rock' | 'pop' | 'funk';
export type GenreSel = Genre | 'random';
export const GENRE_LIST: Genre[] = ['rock', 'pop', 'funk'];

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
};
