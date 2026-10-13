// Melody first (docs/VOCAL-FIRST.md): the vocal's pitches written as a tune of their own, then fitted to
// the chords. Paul: the melody "seems generic and not really saying anything on its own"; it outlines the
// chords but needs "its own flow". A song gets, by its mood and genre:
// - a spine per kind of section: the slow line under the tune (Schenker, simplified): verses falling
//   5-4-3-2-1, pre-choruses climbing, choruses arching or held high; each line starts and ends on it
// - an idea (motif): a short shape with one signature leap and a step back the other way after it
//   (Narmour's gap-fill; the catchy hook: a familiar shape with one unusual interval, Jakubowski et al.)
// - planned clashes: strong notes against the chord that step into it (appoggiaturas, held-over notes,
//   leans from below, unresolved 9ths), how many and which by mood (Sloboda, Huron: where the chills are)
// - rock genres, now and then: the idea looped on the pentatonic over the changing chords (Temperley's
//   melodic-harmonic divorce), only real clashes avoided

import type { Genre } from '../genres';
import { Rng } from '../rng';
import type { Mood } from '../tension';

type W<T> = [T, number][];

/** The slow line under a section's tune: its height (scale steps from the centre) through the section. */
export type Spine = 'fall' | 'drone' | 'climb' | 'rise' | 'arch' | 'held' | 'dip';
/** A planned clash: from a step above (a sigh), held over from the last chord, from a half step below (a lean), or a 9th left hanging. */
export type Clash = 'sigh' | 'held' | 'lean' | 'ninth';

/** The spines as points through the section (start to end), interpolated. */
const SPINES: Record<Spine, number[]> = {
  fall: [2, 1, 0, -1, -2],
  drone: [0, 0, 0, 0, -1],
  climb: [-2, -1, 0, 1, 2],
  rise: [-1, 0, 1, 2, 3],
  arch: [0, 2, 3, 1, -1],
  held: [3, 3, 3, 2, 0],
  dip: [1, -1, -2, -1, 1],
};

/** Where a spine sits at t (0-1 through the section). */
export function spineAt(s: Spine, t: number): number {
  const p = SPINES[s];
  const x = Math.max(0, Math.min(1, t)) * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(x));
  return p[i] + (p[i + 1] - p[i]) * (x - i);
}

type SpineKind = 'verse' | 'prechorus' | 'chorus' | 'bridge';

/** Spines by mood (sad falls; hopeful rises; dark a narrow drone; angry high and flat, then a drop; dreamy wide arches). */
const MOOD_SPINE: Record<Mood, Record<SpineKind, W<Spine>>> = {
  happy: { verse: [['rise', 2], ['arch', 2], ['drone', 1]], prechorus: [['climb', 3], ['rise', 1]], chorus: [['arch', 3], ['held', 1], ['rise', 1]], bridge: [['rise', 2], ['dip', 1]] },
  triumphant: { verse: [['climb', 2], ['rise', 2], ['arch', 1]], prechorus: [['climb', 3]], chorus: [['held', 3], ['arch', 2]], bridge: [['climb', 2], ['rise', 1]] },
  nostalgic: { verse: [['fall', 3], ['arch', 2]], prechorus: [['climb', 2], ['rise', 1]], chorus: [['arch', 3], ['fall', 2]], bridge: [['dip', 2], ['arch', 1]] },
  melancholic: { verse: [['fall', 4], ['drone', 1]], prechorus: [['climb', 2], ['arch', 1]], chorus: [['fall', 3], ['arch', 2]], bridge: [['dip', 2], ['fall', 1]] },
  dreamy: { verse: [['arch', 3], ['dip', 1], ['fall', 1]], prechorus: [['rise', 2], ['climb', 1]], chorus: [['arch', 3], ['dip', 1]], bridge: [['dip', 2], ['arch', 1]] },
  tense: { verse: [['drone', 3], ['climb', 2]], prechorus: [['climb', 3]], chorus: [['climb', 2], ['held', 2]], bridge: [['climb', 2], ['drone', 1]] },
  angry: { verse: [['held', 2], ['drone', 2], ['fall', 1]], prechorus: [['climb', 3]], chorus: [['held', 3], ['fall', 1]], bridge: [['climb', 2], ['held', 1]] },
  dark: { verse: [['drone', 3], ['fall', 2]], prechorus: [['climb', 2], ['drone', 1]], chorus: [['arch', 2], ['fall', 2], ['dip', 1]], bridge: [['dip', 2], ['drone', 1]] },
};

/** Genres lean the spines: grunge drones its verses, metal holds its choruses high, pop arches. */
const GENRE_SPINE: Partial<Record<Genre, Partial<Record<SpineKind, Partial<Record<Spine, number>>>>>> = {
  grunge: { verse: { drone: 2 }, chorus: { held: 1.5 } },
  altmetal: { verse: { drone: 1.5 } },
  metal: { chorus: { held: 1.5 }, prechorus: { climb: 1.5 } },
  hardrock: { chorus: { held: 1.3 } },
  pop: { chorus: { arch: 1.5 }, verse: { rise: 1.3 } },
  funk: { verse: { drone: 1.5 } },
};

/** The idea's signature leap, in semitones, by genre (pop's 6th; rock's 4th; metal's 5th; funk's small ones). */
const GENRE_SIG: Record<Genre, W<number>> = {
  pop: [[9, 2], [7, 1.5], [5, 1], [4, 1]],
  rock: [[5, 3], [3, 1.5], [7, 1]],
  funk: [[3, 2], [5, 1], [4, 1]],
  hardrock: [[5, 2], [7, 2], [3, 1]],
  metal: [[7, 2], [5, 2], [12, 0.6]],
  grunge: [[5, 3], [7, 1], [3, 1]],
  altmetal: [[5, 2], [7, 2], [3, 1]],
};

/** Which way the idea leaps: up in the brighter moods, down (a falling 4th or 5th) in the sadder ones. */
const LEAP_UP: Record<Mood, number> = { happy: 0.85, triumphant: 0.9, nostalgic: 0.6, melancholic: 0.35, dreamy: 0.7, tense: 0.55, angry: 0.65, dark: 0.4 };

/** Planned clashes a line, and which kinds, by mood (Paul: "by mood"; sad and tender most, happy few, tense the harshest). */
const MOOD_CLASH: Record<Mood, { rate: number; kinds: W<Clash> }> = {
  happy: { rate: 0.5, kinds: [['ninth', 2], ['sigh', 1]] },
  triumphant: { rate: 0.6, kinds: [['sigh', 1], ['ninth', 1], ['lean', 1]] },
  nostalgic: { rate: 1.1, kinds: [['sigh', 2], ['held', 2], ['ninth', 1]] },
  melancholic: { rate: 1.4, kinds: [['sigh', 3], ['held', 2]] },
  dreamy: { rate: 1.1, kinds: [['ninth', 2], ['held', 2], ['sigh', 1]] },
  tense: { rate: 1, kinds: [['lean', 3], ['held', 1]] },
  angry: { rate: 0.8, kinds: [['lean', 2], ['sigh', 1]] },
  dark: { rate: 1, kinds: [['lean', 2], ['sigh', 1], ['held', 1]] },
};

/** How often a section loops the idea over the chords (Paul: "now and then"); only the riff genres. */
const LOOP: Partial<Record<Genre, number>> = { rock: 0.25, hardrock: 0.25, grunge: 0.35, metal: 0.2, altmetal: 0.3 };

/** A 9th or a 4th left on a strong beat unresolved (pop's and dreamy songs' colour), as a chance. */
const COLOUR_GENRE: Partial<Record<Genre, number>> = { pop: 0.25, rock: 0.1, grunge: 0.15, altmetal: 0.1 };

/** The idea: steps before its leap, the leap (semitones, signed), the steps after (scale steps, signed). */
export interface Motto { pre: number[]; sig: number; post: number[] }

/** A song's Melody first ways. */
export interface FirstStyle {
  spine: Record<SpineKind, Spine>;
  idea: Motto;
  /** Planned clashes per line, and their kinds. */
  clash: number;
  kinds: W<Clash>;
  /** Chance a verse or chorus loops the idea over the chords. */
  loop: number;
  /** Chance a strong note off the chord on its 9th or 4th is left there (a colour). */
  colour: number;
}

/** A song's Melody first style, by mood and genre (its own seed: the other ways' notes unchanged). */
export function firstStyle(seed: string, mood: Mood, genre: Genre): FirstStyle {
  const rng = new Rng(`${seed}-first`);
  const pick = (k: SpineKind) => {
    const lean = GENRE_SPINE[genre]?.[k] ?? {};
    return rng.weighted(MOOD_SPINE[mood][k].map(([s, w]) => [s, w * (lean[s] ?? 1)] as [Spine, number]));
  };
  const spine = { verse: pick('verse'), prechorus: pick('prechorus'), chorus: pick('chorus'), bridge: pick('bridge') };
  // (the verse and chorus not on the same spine: the chorus somewhere new)
  if (spine.chorus === spine.verse) spine.chorus = spine.verse === 'arch' ? 'held' : 'arch';
  // the idea: a step or a repeat into the leap (or straight in), the leap, then a step or two back
  const up = rng.chance(LEAP_UP[mood]);
  const sig = rng.weighted(GENRE_SIG[genre]) * (up ? 1 : -1);
  const d = Math.sign(sig);
  const pre = rng.weighted<number[]>([[[], 1.5], [[d], 1.5], [[0], 1], [[-d], 0.8]]);
  const post = rng.weighted<number[]>([[[-d, -d], 2.5], [[-d], 1.5], [[-d, 0], 1], [[-d, -d, -d], Math.abs(sig) >= 7 ? 1.5 : 0.4]]);
  const M = MOOD_CLASH[mood];
  return { spine, idea: { pre, sig, post }, clash: M.rate, kinds: M.kinds, loop: LOOP[genre] ?? 0, colour: (COLOUR_GENRE[genre] ?? 0) + (mood === 'dreamy' ? 0.2 : 0) };
}

const SPINE_DESC: Record<Spine, string> = {
  fall: 'falls home', drone: 'circles one note', climb: 'climbs', rise: 'rises', arch: 'arches', held: 'holds high, then drops', dip: 'dips and comes back',
};
const SIG_NAME: Record<number, string> = { 3: 'a 3rd', 4: 'a 3rd', 5: 'a 4th', 7: 'a 5th', 9: 'a 6th', 12: 'an octave' };
const CLASH_DESC: Record<Clash, string> = { sigh: 'sighs from above', held: 'notes held over the chord change', lean: 'leans from a half step below', ninth: 'hanging 9ths' };

/** For the notes. */
export function firstDesc(f: FirstStyle): string {
  const kinds = f.kinds.map(([k]) => CLASH_DESC[k]).join(', ');
  return `melody first: verses ${SPINE_DESC[f.spine.verse]}, choruses ${SPINE_DESC[f.spine.chorus]}; the idea leaps ${SIG_NAME[Math.abs(f.idea.sig)] ?? 'a leap'} ${f.idea.sig > 0 ? 'up' : 'down'}, then steps back; `
    + `against the chord about ${f.clash >= 1 ? `${Math.round(f.clash)} a line` : 'every other line'} (${kinds})${f.loop ? '; now and then a loop over the chords' : ''}`;
}
