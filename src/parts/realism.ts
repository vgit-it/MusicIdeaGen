// Real songs (docs/REALISM.md): behind a switch, the melody writers lean toward what real vocal lines do in
// each genre, measured in the Lakh MIDI collection (src/realism/targets.json, numbers only; scored by
// `npm run realism-lab`). Real singers sing the same note again about twice as often as the writers did,
// leave more strong beats off the chord in the heavy genres (grunge and metal under half on it, pop three
// quarters), peak early in a phrase (about 60%) and fall from there, sit in a narrower range (metal
// about a 6th), turn back after a leap a little less often (singing the note again instead) and end
// more phrases on the root.

import type { Genre } from '../genres';

export interface RealLean {
  /** Added to the chance of the same note again (and less pull away from it). */
  repeat: number;
  /** How likely a strong note is put on a chord note, x (1: as before). */
  onChord: number;
  /** Chance a line peaks early (its top in its first third). */
  early: number;
  /** The tune's range, x. */
  span: number;
  /** Chance the note after a leap is the leap's note again (not a step back). */
  leapRepeat: number;
  /** Chance an open line ends on the root after all. */
  home: number;
  /** Chance a strong chord note is sung off the chord instead (the note before held over, or the one next to it). */
  hold: number;
}

export const REAL_LEAN: Record<Genre, RealLean> = {
  rock: { hold: 0.25, repeat: 0.18, onChord: 0.72, early: 0.6, span: 0.8, leapRepeat: 0.3, home: 0.35 },
  pop: { hold: 0.22, repeat: 0.12, onChord: 0.75, early: 0.55, span: 0.95, leapRepeat: 0.25, home: 0.3 },
  funk: { hold: 0.35, repeat: 0.15, onChord: 0.65, early: 0.55, span: 0.95, leapRepeat: 0.3, home: 0.3 },
  hardrock: { hold: 0.4, repeat: 0.18, onChord: 0.6, early: 0.6, span: 0.9, leapRepeat: 0.3, home: 0.35 },
  metal: { hold: 0.45, repeat: 0.22, onChord: 0.45, early: 0.6, span: 0.65, leapRepeat: 0.35, home: 0.35 },
  grunge: { hold: 0.45, repeat: 0.22, onChord: 0.45, early: 0.65, span: 0.9, leapRepeat: 0.3, home: 0.3 },
  altmetal: { hold: 0.45, repeat: 0.22, onChord: 0.45, early: 0.75, span: 1, leapRepeat: 0.3, home: 0.3 },
};
