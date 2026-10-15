// The Guide line (experiment, docs/GUIDE.md): one note line through the whole song, in its key, shaped
// by the mood. Kept apart from the vocals on purpose: once it sounds right it can feed them.
//
// How it moves (Paul's rules, and what melody research finds in real tunes):
// - it starts on a note picked for the mood and moves now and then, mostly by small amounts
//   (a step, sometimes a 3rd), holding notes for as long as the mood likes
// - a big leap only after a pause, and after a leap it steps back the other way (gap-fill)
// - it stays in the scale, except a few out-of-key notes a mood is known for
// - it rises and falls with the song's tension curve, settles on stable notes at section ends and
//   ends the song on home
// - with the chords: lean in (strong beats on the chord's notes) or out (the key only)

import type { Idea, SectionKind } from '../idea';
import { groupStarts } from '../rhythm';
import { Rng } from '../rng';
import { type Mood, MOOD_LABEL, autoMood } from '../tension';
import { SCALES, chordPc } from '../theory';
import { chordTones } from '../parts/guitar2';
import { HIGH_VOICES, type HighVoice } from '../parts/singers';
import type { Genre } from '../genres';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export type Lean = 'in' | 'out';
/** Quick notes on the long ones: how many. */
export type Flicks = 'off' | 'sparse' | 'some' | 'lots';
export const FLICK_LEVELS: [Flicks, string][] = [['off', 'Off'], ['sparse', 'Sparse'], ['some', 'Some'], ['lots', 'Lots']];

/** A quick note on a held one: `at` steps into it, `len` steps long (an 8th), then back. */
export interface Flick {
  at: number; len: number; midi: number;
  /** A 16th's silence (in steps) after it before the held note comes back (the quick note then a 16th itself). */
  gap?: number;
  /** Pitch by words: a new stressed word (true, going up) or a word's soft last syllable (false, going down). */
  starts?: boolean;
  /** At the held note's end: bent up (or down) to, and the line moves on from there. */
  bend?: boolean;
}

export interface GuideNote {
  /** Step in its section, length in steps, the note, and its scale degree (0 home, 1 the 2nd ... any octave). */
  step: number; len: number; midi: number; deg: number;
  /** Out of the key (a mood's colour note). */
  colour?: boolean;
  /** A leap after a pause. */
  leap?: boolean;
  /** Bent into from the note before (no new attack): the bend's length in steps (an 8th, a quarter, half a bar). */
  bend?: number;
  /** Quick notes on it. */
  flicks?: Flick[];
  /** Pushes and pulls on it: `at` steps in. */
  marks?: Mark[];
}

/** A push (a lift, like a word starting) or a pull (a dip, like a word ending) inside a held note. */
/** A push or a pull on a held note. A pull falls away to silence, the note back on the next beat (`back` steps after `at`; at the note's end, not back). */
export interface Mark { at: number; kind: 'push' | 'pull'; back?: number }

/**
 * New ideas from the other melody writers, each its own switch (Paul: never break what's there). All off:
 * the line exactly as before (checked: npm run guide-check).
 * - `motif`: a short idea repeated (Shaped, Melody first): a section's phrases follow a form, A B A b: the
 *   first phrase comes back (moved to suit the section's height and the chords), the second comes back
 *   with a new ending.
 */
export interface GuideIdeas {
  motif?: boolean; spine?: boolean; speech?: boolean; qa?: boolean;
  /** Breaths (Paul: "imagine a person is singing it"): a pause, of a random length, after a tiring stretch (long, or high) and before a big section. */
  breath?: boolean;
  /** Section change: each kind of section its own phrase lengths or pace, or a jump in the notes where it comes in. */
  shift?: boolean;
  /** Lead-ins: now and then the next section's first note comes in before the section starts, held into it. */
  leadIn?: boolean;
  /** Carry over: now and then the last note runs on into a section the line sits out (a solo), held or bent. */
  carry?: boolean;
  /** Sung hard or soft (dynamics.ts): the words' levels by tension, section and height; soft quiet sections, belted peaks. */
  dynamics?: boolean;
  /** Anchor line (anchor.ts, docs/GUIDE-ANCHOR.md): a different writer: one strong note per 4 bars, sung in a rhythm pattern, broken by an accent. */
  anchor?: boolean;
  /** Human feel (feel.ts, docs/GUIDE-FEEL.md): how the line is played and sung (glides, scoops, swells, fades, falls, vibrato, breaths); the written line unchanged. */
  feel?: boolean;
}

/**
 * Section change (Paul: "a noticeable shift in either phrase lengths or notes"): how each kind of section
 * sings, picked the first time it comes, unlike the section before it: its phrase length (bars), its pace
 * (how long notes are held, against the mood's), or the same feel with a jump in the notes where it comes in.
 */
interface Feel { phrase: number; pace: number; jump: boolean }
const PACES = [0.55, 1, 1.45];

/** Breaths: how tiring the stretch just sung is (bars, a high note counting more), from which a breath is likely. */
export const TIRED = 2.5;
/** Lead-ins: how often, and how early (steps before the section: an 8th, a beat, two beats). */
export const LEAD_IN_P = 0.35;
export const LEAD_INS: [number, number][] = [[2, 0.3], [4, 0.45], [8, 0.25]];
/** Carry over: how often the line runs on into a section it sits out. */
const CARRY_P = 0.5;

/**
 * Question and answer (Words first's pairs): how often a pair of phrases is sung as a question (ending up)
 * and its answer (falling to a settled note), by mood: open, hopeful moods ask; angry and dark ones state.
 */
const QA_CHANCE: Record<Mood, number> = { happy: 0.6, dreamy: 0.6, nostalgic: 0.5, tense: 0.5, triumphant: 0.45, melancholic: 0.4, dark: 0.3, angry: 0.25 };

/**
 * How often a quick note starts a new word (else it ends one), by genre: a little more in busier genres
 * (words.ts; with Pitch by words, how often quick notes go up).
 */
export const WORD_STARTS: Record<Genre, number> = { funk: 0.6, hardrock: 0.55, rock: 0.5, pop: 0.5, metal: 0.5, altmetal: 0.5, grunge: 0.4 };

/**
 * Slow line (Melody first's "spine", after Schenker): a slow shape under each section that the line follows,
 * in scale steps above or below the section's height, by where it is in the section (0 to 1); phrases end on it.
 */
export type Spine = 'fall' | 'rise' | 'arch' | 'drone' | 'wide' | 'hold' | 'drop';
export const SPINES: Record<Spine, { f: (x: number) => number; says: string }> = {
  fall: { f: (x) => 2 - 3 * x, says: 'falls' },
  rise: { f: (x) => -1 + 3 * x, says: 'climbs' },
  arch: { f: (x) => (x < 0.35 ? (2 * x) / 0.35 : 2 - (3 * (x - 0.35)) / 0.65), says: 'arches (up early, then home)' },
  drone: { f: (x) => (x > 0.75 ? 1 : 0), says: 'stays around one note, lifting at the end' },
  wide: { f: (x) => 3 * Math.sin(Math.PI * x), says: 'a slow wide arch' },
  hold: { f: (x) => (x < 0.8 ? 2 : 0), says: 'holds high, then settles' },
  drop: { f: (x) => (x < 0.75 ? 1 : -2), says: 'high and flat, then drops' },
};
/** By section and mood (Melody first's table: happy rises, sad falls, dark and tense drone, dreamy wide arches, angry high then a drop). */
export const SPINE_BY: Partial<Record<SectionKind, Partial<Record<Mood, Spine>> & { all: Spine }>> = {
  verse: { all: 'fall', happy: 'rise', triumphant: 'rise', dark: 'drone', tense: 'drone', angry: 'drone', dreamy: 'wide' },
  prechorus: { all: 'rise' },
  chorus: { all: 'arch', triumphant: 'hold', angry: 'drop', melancholic: 'fall', dreamy: 'wide' },
  bridge: { all: 'wide', dark: 'drone', tense: 'rise' },
  interlude: { all: 'fall' }, breakdown: { all: 'drone' }, outro: { all: 'fall' },
};
/** Genre leans (now and then, per song): grunge drones its verses, metal holds its choruses high, pop arches. */
export const SPINE_GENRE: Partial<Record<Genre, Partial<Record<SectionKind, Spine>>>> = {
  grunge: { verse: 'drone' }, metal: { chorus: 'hold' }, altmetal: { chorus: 'hold' }, pop: { chorus: 'arch' }, hardrock: { chorus: 'hold' },
};

export interface GuideLine {
  /** Notes per section, in play order. */
  parts: GuideNote[][];
  /** Sections the line sits out (intros, solos, and some interludes, bridges, breakdowns and outros). */
  silent: boolean[];
  mood: Mood;
  /** What it did, in plain words. */
  notes: string[];
}

/** A degree's place in its scale (0-6). */
const deg7 = (d: number) => mod(d, 7);
const DEG_NAME = ['1st (home)', '2nd', '3rd', '4th', '5th', '6th', '7th'];

type Colour = 'lead' | 'sigh' | 'dark' | 'float' | null;

interface GuideMood {
  /** Start degrees to pick from. */
  start: number[];
  /** How much it likes to rest on each degree (1st ... 7th). */
  rest: number[];
  /** Beats a note lasts, about (at calm; busier as the tension rises). */
  beats: number;
  /** A 3rd instead of a step; the same note again. */
  third: number; same: number;
  /** Leans down (<0) or up (>0). */
  lean: number;
  /** Chance of a pause at the end of a phrase; bars a phrase lasts. */
  pause: number; phrase: number;
  /** After a pause: chance of a leap, and how far (scale steps). */
  leap: number; leapMax: number;
  /** Range (scale steps) and where it sits (scale steps from home). */
  span: number; low: number;
  /** Chance a step is bent into rather than played, and how it likes its bends: an 8th, a quarter, half a bar. */
  bend: number; bendLen: [number, number, number];
  /** An out-of-key colour note and how often. */
  colour: Colour; colourP: number;
  /** In plain words. */
  desc: string;
}

// (degree feel, after David Huron's "Sweet Anticipation": the 1st home, the 5th strong and open, the 3rd
// warm (major or minor), the 2nd, 4th and 6th unsettled, the 7th yearning; higher and rising brighter,
// lower and falling darker; long notes calm, quick ones restless)
const MOODS: Record<Mood, GuideMood> = {
  happy: { start: [2, 4, 0], rest: [1.4, 0.6, 1.5, 0.6, 1.3, 1, 0.3], beats: 1.5, third: 0.3, same: 0.15, lean: 0.15, pause: 0.45, phrase: 2, leap: 0.5, leapMax: 4, span: 9, low: -2, bend: 0.2, bendLen: [1, 0.8, 0.3], colour: null, colourP: 0,
    desc: 'bright: sits on the 3rd and 5th, lively, leans up, leaps up after a pause' },
  melancholic: { start: [4, 2], rest: [1.2, 0.8, 1.5, 0.7, 1.1, 0.9, 0.4], beats: 2.5, third: 0.15, same: 0.1, lean: -0.35, pause: 0.55, phrase: 2, leap: 0.35, leapMax: 5, span: 7, low: -3, bend: 0.35, bendLen: [0.6, 1, 1], colour: 'sigh', colourP: 0.35,
    desc: 'falls more than it rises, slow, sighs down by step; a 6th leap now and then' },
  nostalgic: { start: [2, 4], rest: [1.2, 0.7, 1.4, 0.8, 1.1, 1.3, 0.4], beats: 2, third: 0.25, same: 0.1, lean: -0.1, pause: 0.5, phrase: 2, leap: 0.55, leapMax: 5, span: 8, low: -2, bend: 0.3, bendLen: [0.8, 1, 0.6], colour: 'sigh', colourP: 0.2,
    desc: 'warm: rests on the 3rd and 6th, gentle waves, a leap up of a 6th after a pause' },
  tense: { start: [1, 4, 6], rest: [0.6, 1.2, 0.8, 1.2, 1, 1, 1.3], beats: 1, third: 0.2, same: 0.35, lean: 0.1, pause: 0.3, phrase: 2, leap: 0.4, leapMax: 3, span: 6, low: -2, bend: 0.25, bendLen: [1, 0.6, 0.4], colour: 'lead', colourP: 0.5,
    desc: 'restless: the busiest, repeats itself, rests on unsettled notes (2nd, 4th, 7th), rarely home' },
  angry: { start: [0, 4], rest: [1.4, 0.5, 1, 0.8, 1.4, 0.7, 0.6], beats: 1, third: 0.2, same: 0.4, lean: 0, pause: 0.35, phrase: 2, leap: 0.6, leapMax: 4, span: 7, low: -3, bend: 0.2, bendLen: [1.5, 0.5, 0.2], colour: 'dark', colourP: 0.3,
    desc: 'hammers: busy, insistent repeats on the 1st and 5th, punches up after a pause' },
  dreamy: { start: [4, 2], rest: [1, 0.9, 1.3, 0.8, 1.3, 1.2, 0.8], beats: 4, third: 0.3, same: 0.05, lean: 0, pause: 0.6, phrase: 4, leap: 0.3, leapMax: 3, span: 6, low: -1, bend: 0.35, bendLen: [0.5, 1, 1.5], colour: 'float', colourP: 0.4,
    desc: 'floats: long held notes, wanders gently, never quite lands' },
  triumphant: { start: [0, 4], rest: [1.5, 0.5, 1.2, 0.6, 1.5, 0.8, 0.3], beats: 1.5, third: 0.35, same: 0.1, lean: 0.3, pause: 0.45, phrase: 2, leap: 0.7, leapMax: 4, span: 10, low: -3, bend: 0.25, bendLen: [1, 1, 0.5], colour: 'lead', colourP: 0.25,
    desc: 'climbs: home and the 5th, rises through the song, bold leaps after a pause' },
  dark: { start: [0, 2], rest: [1.4, 0.7, 1.3, 0.8, 1, 1, 0.5], beats: 2, third: 0.2, same: 0.2, lean: -0.25, pause: 0.45, phrase: 2, leap: 0.35, leapMax: 4, span: 7, low: -3, bend: 0.3, bendLen: [0.6, 1, 0.8], colour: 'dark', colourP: 0.4,
    desc: 'low and heavy: stays down, falls back, a dark half step above home' },
};

/** Quick notes per bar of a held note, by how many; and how often they're a 16th (else an 8th), by mood. */
// (Paul: the old Lots "working best" becomes Some; Sparse and Lots retuned around it)
const FLICK_RATE: Record<Flicks, number> = { off: 0, sparse: 1.2, some: 4, lots: 12 };
/** Levels that may start an 8th into a note and come an 8th apart in any cluster. */
const DENSE: Flicks[] = ['some', 'lots'];
/** They come in clusters of 2 bars, frequent, then moderate, then sparse (Paul): how many in each, times the rate. */
type Cluster = 'frequent' | 'moderate' | 'sparse';
const CLUSTERS: Cluster[] = ['frequent', 'moderate', 'sparse'];
const CLUSTER_RATE: Record<Cluster, number> = { frequent: 2.2, moderate: 1, sparse: 0.3 };
const CLUSTER_BARS = 2;
/** How often a quick note is a 16th with a 16th's silence after it (an 8th in all), then the held note again. */
const GAP_P = 0.35;
/**
 * Quick notes go one scale step up or down, always in the key (Paul: no two-step jumps, no off-key half
 * steps any more).
 */

/**
 * Where the line sits out (Paul): intros (no note at all) and solos always; interludes, bridges,
 * breakdowns and outros by chance, per song. Missing kinds always play.
 */
export const PLAY_CHANCE: Partial<Record<string, number>> = { intro: 0, solo: 0, interlude: 0.5, bridge: 0.7, breakdown: 0.5, outro: 0.5 };

/**
 * What Sparse, Some and Lots mean in each genre (Paul): the levels keep their order, the genre scales them
 * (`rate`) and gives the quick notes its own feel: how many have a pause after them (`gap`), how much they like the offbeat 8ths (`off`: 1 even, above 1 more), how much more often
 * the end of a note is bent to (`endBend`), the clusters' own weights (`clusters`), and whether they may
 * come an 8th apart at every level (`close`).
 */
interface GenreFlicks { rate: number; gap: number; off: number; endBend: number; clusters?: Record<Cluster, number>; close?: boolean; feel: string }
const GENRE_FLICKS: Record<Genre, GenreFlicks> = {
  pop: { rate: 1, gap: GAP_P, off: 1, endBend: 1, feel: 'as set, smooth' },
  rock: { rate: 1.2, gap: GAP_P, off: 1, endBend: 1, feel: 'a little busier' },
  hardrock: { rate: 1.3, gap: 0.5, off: 1, endBend: 1, feel: 'busier and punchy (more pauses after them)' },
  funk: { rate: 1.6, gap: 0.65, off: 2.2, endBend: 0.6, close: true, feel: 'much busier, stabby, on the offbeats' },
  grunge: { rate: 0.6, gap: 0.15, off: 1, endBend: 3, feel: 'lazier, more bent to at a note\'s end' },
  altmetal: { rate: 1.2, gap: 0.5, off: 1, endBend: 1, clusters: { frequent: 3.6, moderate: 0.5, sparse: 0.12 }, feel: 'in bursts: busy clusters, little between' },
  metal: { rate: 1.4, gap: 0.5, off: 1, endBend: 1, feel: 'busier' },
};

/** How much longer notes are held than the first version's pace. */
const STEADY = 2.5;
/**
 * Limits on held runs (Paul: "some held note runs go on for multiple bars, while there's no pause in others"):
 * a note held at most a bar (the same note again is struck again after that), and never more than MAX_RUN bars
 * sung without a pause (a pause then comes at the next note).
 */
const MAX_RUN = 4;
/** Bends: only into a step (a half or whole step: a guitar's bend, and what MIDI's pitch bend can carry). */
const BEND_SEMIS = 2;

export const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (m: number) => `${NAMES[mod(m, 12)]}${Math.floor(m / 12) - 1}`;

/** A high voice's top, written an octave under where it's sung (the woman's voice sings the line back up an octave, voice.ts). */
export const DOWN = 12;
/** Home at the bottom of the voice: the first home note from its lowest (E3 to D#4 by the key, in Auto). */
export const homeMidi = (key: number, lo = 48) => lo + mod(key - lo, 12);
/**
 * The voice, E3 to E5 (Paul; was C3 to E4 with peaks to F#4, before that C3-C5, C2-C4, A2-C4): the usual top D5,
 * the song's peaks (tension from PEAK_T) reach E5; a high voice (the singer's high voice, or High) goes up to its own
 * top, an octave down, in the song's high parts. Limits the line is written within, not a shift afterwards.
 */
export const MID_AUTO: [number, number] = [52, 74];
export const PEAK_AUTO = 76, PEAK_T = 0.8;
/** A range set by hand (Paul, to see how far it stretches): its lowest and highest notes, MIDI; at least an octave apart (narrower, the home note can fall outside it). */
export type GuideRange = [number, number];

/**
 * The line's own key and scale (Paul: "see if I can get away with a different scale for the vocals"): the
 * scales it can be written in (seven notes each, so steps, quick notes and homes work as in the song's).
 */
export const GUIDE_SCALES = {
  ...SCALES,
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 9, 11],
} as const satisfies Record<string, readonly number[]>;
export type GuideScale = keyof typeof GUIDE_SCALES;
export const SCALE_LABEL: Record<GuideScale, string> = { major: 'Major', minor: 'Minor', dorian: 'Dorian', mixolydian: 'Mixolydian', phrygian: 'Phrygian', lydian: 'Lydian', locrian: 'Locrian', harmonic: 'Harmonic minor', melodic: 'Melodic minor' };
/**
 * Key: a key (0-11, C to B) for the song's first section, the line moving with the song's key changes from
 * there; null: the song's. Scale: null, the song's. Guard: steering the held notes and the strong beats away
 * from a clash with the band (a semitone against a note of the chord playing, or a tritone against its root).
 */
export interface GuideTonality { key: number | null; scale: GuideScale | null; guard: boolean }
/** Notes two scales share, of seven. */
export const shared = (k1: number, s1: readonly number[], k2: number, s2: readonly number[]) => s1.filter((x) => s2.some((y) => mod(k2 + y, 12) === mod(k1 + x, 12))).length;
/** A note clashing with a chord (its pitch classes; root first): a semitone off any of its notes, or a tritone off its root. */
const clashes = (pc: number, tones: number[], root: number) => !tones.includes(pc) && (tones.some((t) => mod(pc - t, 12) === 1 || mod(t - pc, 12) === 1) || mod(pc - root, 12) === 6);
export const RANGE_MIN_SPAN = 12;
/**
 * Height by section, not wandering (Paul: a narrow range "without making it too monotonous"): where each kind of
 * section sits in the voice (0 its bottom, 1 its top), moved by the tension and the mood's lean; a pre-chorus climbs
 * through itself. Within a phrase the line keeps near that height: the mood's span sets how many scale notes either side.
 */
export const HEIGHT: Partial<Record<SectionKind, number>> = { intro: 0.3, verse: 0.25, prechorus: 0.35, chorus: 0.7, interlude: 0.4, bridge: 0.55, breakdown: 0.25, solo: 0.5, outro: 0.4 };
/** A high voice goes past its usual top (Paul: "open up more of the higher range"). */
const HIGH_EXTRA = 2;
const HIGH_T = 0.6;
/** Section kinds sung alike each time (Paul: "the verses should be similar and the choruses similar"). */
export const REPEATS = ['verse', 'prechorus', 'chorus'];
/** How many notes of a repeat change, a step up or down (similar, not a copy). */
const VARY = 0.15;
/** How often quick notes go up: evenly (Paul: more up again). */
const FLICK_UP = 0.5;
/** How likely a quick note lands on an in-between 16th (the e and the a), against an 8th's 1. */
const SIXTEENTH = 0.8;
/** At most this many changes you hear in any one second: notes, quick notes out and back, pushes, pulls and the note back after them (Paul). */
export const MAX_PER_SECOND = 4;

/**
 * Pushes (a lift, like a word starting) and pulls (a dip, like a word ending) on the held notes (Paul),
 * either one by chance. Spread unevenly across the song: the gap to the next one is short, medium or long,
 * so some held stretches run long untouched and others are broken up.
 */
const MARK_GAPS: { w: number; steps: [number, number] }[] = [
  { w: 0.35, steps: [2, 4] }, { w: 0.4, steps: [6, 10] }, { w: 0.25, steps: [12, 28] },
];

/**
 * The out-of-key colour a mood is known for, if this note can carry it (moving into `next` direction):
 * the raised 7th pulling up home (tense, triumphant), the flat 6th sighing down to the 5th in a major key
 * (melancholy, nostalgia), the flat 2nd above home (dark, angry), the raised 4th floating up (dreamy).
 */
function colourShift(c: Colour, s: readonly number[], d: number, up: boolean): number {
  const at = s[deg7(d)];
  if (c === 'lead' && deg7(d) === 6 && at === 10 && up) return 1;
  if (c === 'sigh' && deg7(d) === 5 && at === 9 && !up) return -1;
  if (c === 'dark' && deg7(d) === 1 && at === 2 && !up) return -1;
  if (c === 'float' && deg7(d) === 3 && at === 5 && up) return 1;
  return 0;
}

/** Write the line for a list of sections played back to back (one idea, or a track). */
export function writeGuide(list: Idea[], moodIn: Mood | undefined, lean: Lean, salt = 0, flicks: Flicks = 'off', high: HighVoice | null = null, ideas: GuideIdeas = {}, range: GuideRange | null = null, tonality: GuideTonality | null = null): GuideLine {
  const first = list[0];
  // (the voice: as tuned by ear, or a range set by hand: its top the peaks, the usual top 2 under it)
  const MID: [number, number] = range ? [range[0], Math.max(range[0] + 5, range[1] - 2)] : MID_AUTO;
  const PEAK = range ? range[1] : PEAK_AUTO;
  if (range) high = null;
  // (the line's key and scale, per section: the song's, or set by hand, moving with the song's key changes)
  const tone = tonality && (tonality.key !== null || tonality.scale) ? tonality : null;
  const keyOf = (s: Idea['song']) => (tone?.key != null ? mod(s.key + tone.key - first.song.key, 12) : s.key);
  const scaleOf = (s: Idea['song']) => GUIDE_SCALES[tone?.scale ?? s.mode] as readonly number[];
  const guard = !!tone?.guard;
  const mood = moodIn ?? autoMood(first.song, first.seeds.song);
  const M = MOODS[mood];
  const rng = new Rng(`guide-${first.seeds.song}-${mood}-${lean}-${salt}`);
  // (how far either side of the section's height a phrase goes, in scale notes)
  const W = Math.max(2, Math.round(M.span / 2) - 1);
  let d = rng.pick(M.start);
  const parts: GuideNote[][] = [];
  const stat = { notes: 0, same: 0, step: 0, third: 0, leap: 0, colour: 0, pauses: 0, bends: 0, bendLens: [0, 0, 0], flicks: 0, flickBends: 0, flickGaps: 0, push: 0, pull: 0, capped: 0, byCluster: { frequent: 0, moderate: 0, sparse: 0 } as Record<Cluster, number>, strong: 0, strongTone: 0, lowM: 999, hiM: 0, repeats: 0, varied: 0, highNotes: 0, ideaA: 0, ideaB: 0, spineEnds: 0, phraseEnds: 0, qaPairs: 0, qN: 0, qUp: 0, aN: 0, aDown: 0, held: 0, clash: 0 };
  let afterPause = false, lastLeap = 0, sameRun = 0;
  const songBeats = list.reduce((n, i) => n + i.song.bars.reduce((b, x) => b + x.groups.length, 0), 0);
  let beatNo = 0;
  // (the quick notes have their own dice: the line stays the same whatever their number)
  const frng = new Rng(`guide-flicks-${first.seeds.song}-${mood}-${salt}`);
  // (the clusters: the cycle starts at a random place in each song)
  const phase = frng.int(0, 2);
  const clusterAt = (bar: number) => CLUSTERS[(Math.floor(bar / CLUSTER_BARS) + phase) % 3];
  let barBase = 0;
  /** A note cut a beat short (a pause after it), its quick notes in the cut gone. */
  const cutBeat = (n: GuideNote) => cutBy(n, 4);
  /** A note cut `by` steps short, its quick notes, pushes and pulls in the cut gone. */
  const cutBy = (n: GuideNote, by: number) => {
    n.len -= by;
    if (n.flicks) {
      const keep = n.flicks.filter((f) => f.at + f.len + (f.gap ?? 0) <= n.len - (f.bend ? 0 : 1));
      stat.flicks -= n.flicks.length - keep.length;
      if (keep.length) n.flicks = keep; else delete n.flicks;
    }
    if (n.marks) {
      const keep = n.marks.filter((m) => m.at <= n.len - 4);
      for (const m of keep) if (m.back && m.at + m.back > n.len) m.back = n.len - m.at;
      for (const m of n.marks) if (!keep.includes(m)) stat[m.kind]--;
      if (keep.length) n.marks = keep; else delete n.marks;
    }
  };
  // the first verse, pre-chorus and chorus, kept to sing again (their notes, and each note's colour shift)
  const firstOf = new Map<string, { notes: GuideNote[]; cs: number[]; total: number; bars: number }>();
  const top = high ? Math.max(PEAK, HIGH_VOICES[high].beltTop + HIGH_EXTRA - DOWN) : PEAK;
  // pushes and pulls: their own dice (the line and the quick notes stay the same), and the next one's place
  const mrng = new Rng(`guide-marks-${first.seeds.song}-${mood}-${salt}`);
  const markGap = () => {
    let r = mrng.next() * MARK_GAPS.reduce((x, g) => x + g.w, 0);
    const g = MARK_GAPS.find((x) => (r -= x.w) <= 0) ?? MARK_GAPS[0];
    return 2 * Math.round(mrng.int(g.steps[0], g.steps[1]) / 2);
  };
  let markAt = markGap(), stepBase = 0;
  // where it sits out (its own dice, so the line elsewhere stays put; Reroll rolls again)
  const srng = new Rng(`guide-silent-${first.seeds.song}-${salt}`);
  const silent = list.map((i) => {
    const pc = i.section ? PLAY_CHANCE[i.section.kind] : undefined;
    return pc !== undefined && !srng.chance(pc);
  });
  // (the last section it sings ends the song on home)
  const lastSung = silent.lastIndexOf(false);
  // (the new ideas: their own dice, so switching one on doesn't reshuffle the others)
  const irng = new Rng(`guide-ideas-${first.seeds.song}-${mood}-${salt}`);
  // (Slow line: a shape per kind of section, by mood, now and then the genre's lean; its own dice)
  const sprng = new Rng(`guide-spine-${first.seeds.song}-${mood}-${salt}`);
  const spineOf = new Map<string, Spine>();
  const spineFor = (kind: SectionKind | undefined): Spine | null => {
    if (!ideas.spine || !kind || !SPINE_BY[kind]) return null;
    if (!spineOf.has(kind)) {
      const by = SPINE_BY[kind]!, lean = SPINE_GENRE[first.song.genre]?.[kind];
      spineOf.set(kind, lean && sprng.chance(0.5) ? lean : by[mood] ?? by.all);
    }
    return spineOf.get(kind)!;
  };
  // (Question and answer: its own dice)
  const qrng = new Rng(`guide-qa-${first.seeds.song}-${mood}-${salt}`);
  // (Breaths, Section change, Lead-ins, Carry over: each its own dice)
  const brng = new Rng(`guide-breath-${first.seeds.song}-${mood}-${salt}`);
  const crng = new Rng(`guide-shift-${first.seeds.song}-${mood}-${salt}`);
  const lrng = new Rng(`guide-leadin-${first.seeds.song}-${mood}-${salt}`);
  const orng = new Rng(`guide-carry-${first.seeds.song}-${mood}-${salt}`);
  const feelOf = new Map<string, Feel>();
  let lastFeel: Feel | null = null;
  const nb = { breaths: 0, breathBeats: 0, before: 0, leadIns: 0, carries: 0, carryBends: 0, jumps: 0, feels: [] as string[] };
  /** Breaths: how tiring the stretch sung up to the end of `notes` is (in bars; high notes count more), 0 after a pause. */
  const effort = (notes: GuideNote[], barLen: number, at: number) => {
    let e = 0, k = notes.length - 1;
    if (k < 0 || notes[k].step + notes[k].len < at) return 0;
    for (; k >= 0; k--) {
      const n = notes[k];
      e += (n.len / barLen) * (1 + Math.max(0, n.midi - 57) / 5);
      if (k > 0 && notes[k - 1].step + notes[k - 1].len !== n.step) break;
    }
    return e;
  };
  const G = GENRE_FLICKS[first.song.genre] ?? GENRE_FLICKS.pop;
  const clusterRate = G.clusters ?? CLUSTER_RATE;

  list.forEach((idea, si) => {
    const { song, chords } = idea;
    const home = homeMidi(keyOf(song), MID[0]);
    const scale = scaleOf(song);
    const midiOf = (x: number) => home + 12 * Math.floor(x / 7) + scale[deg7(x)];
    const tonesAt = (g: number) => chordTones(song.key, chords.timeline[chords.chordIdx[Math.min(song.total - 1, g)]].chord);
    const rootAt = (g: number) => chordPc(song.key, chords.timeline[chords.chordIdx[Math.min(song.total - 1, g)]].chord);
    /** A pitch class clashing with any chord the band plays from step `a` to `b`. */
    const clashOver = (pc: number, a: number, b: number) => {
      for (let g = Math.max(0, a); g < Math.min(b, song.total); g++) if (g === Math.max(0, a) || chords.chordIdx[g] !== chords.chordIdx[g - 1]) { if (clashes(pc, tonesAt(g), rootAt(g))) return true; }
      return false;
    };
    // the beats, and which are strong (a bar's first, and the one nearest its middle)
    const beats = song.bars.flatMap((b, bi) => {
      const starts = groupStarts(b.groups);
      const mid = starts.reduce((x, p) => (Math.abs(p - b.len / 2) < Math.abs(x - b.len / 2) ? p : x), starts[0]);
      return starts.map((p) => ({ step: b.start + p, bar: bi, first: p === 0, strong: p === 0 || (p === mid && starts.length > 2) }));
    });
    const tension = (bar: number) => idea.section?.tension?.[bar] ?? 0.3 + 0.3 * Math.sin((Math.PI * (beatNo / Math.max(1, songBeats))));
    const out: GuideNote[] = [];
    const lastSection = si === lastSung;
    // sitting out: nothing, and the line comes back after it as after a pause
    if (silent[si]) {
      // (Carry over: the last note runs on into it, held, or bent a step, for up to a bar)
      const pv = parts[si - 1], pIdea = list[si - 1];
      const last = pv?.[pv.length - 1];
      if (ideas.carry && last && pIdea && last.step + last.len === pIdea.song.total && song.bars.length >= 2 && orng.chance(CARRY_P)
        && !(last.flicks ?? []).some((f) => f.at + f.len >= last.len) && !(last.marks ?? []).some((m) => m.at + (m.back ?? 0) >= last.len)) {
        const bar = pIdea.song.bars[0].len;
        // (never past the run limit: the stretch sung without a pause so far)
        let from = last.step;
        for (let k = pv.length - 1; k > 0 && pv[k - 1].step + pv[k - 1].len === pv[k].step; k--) from = pv[k - 1].step;
        const room = Math.min(bar, MAX_RUN * bar - (pIdea.song.total - from), song.bars[0].len);
        const x = Math.min(room, 4 * orng.int(1, Math.max(1, Math.floor(bar / 4))));
        const pScale = scaleOf(pIdea.song), pHome = homeMidi(keyOf(pIdea.song), MID[0]);
        const pMidi = (y: number) => pHome + 12 * Math.floor(y / 7) + pScale[deg7(y)];
        const to = last.deg + (orng.chance(0.7) ? -1 : 1);
        // (held, while it stays within a bar; else, or by chance, bent a step (never off the song's last note, home))
        const canHold = last.len + x <= bar;
        const canBend = si - 1 !== lastSung && !last.colour && Math.abs(pMidi(to) - last.midi) <= BEND_SEMIS && pMidi(to) >= MID[0] && pMidi(to) <= top && x >= 4;
        if (x >= 4 && (canHold || canBend)) {
          if (canHold && (!canBend || orng.chance(0.5))) last.len += x;
          else {
            const bl = x >= 8 && orng.chance(0.5) ? 4 : 2;
            pv.push({ step: pIdea.song.total, len: x, midi: pMidi(to), deg: to, bend: bl });
            nb.carryBends++;
          }
          nb.carries++;
        }
      }
      parts.push([]);
      beatNo += beats.length;
      barBase += song.bars.length;
      stepBase += song.total;
      afterPause = true; lastLeap = 0; sameRun = 0;
      return;
    }
    // (the voice: mid, up to the high voice's top where the song is high)
    const ceil = (t: number) => (high && t >= HIGH_T ? top : t >= PEAK_T ? PEAK : MID[1]);
    const inVoice = (x: number, t: number) => midiOf(x) >= MID[0] && midiOf(x) <= ceil(t);
    // (the section's height in the voice, as a scale note: by its kind, the tension, the mood's lean; a pre-chorus climbing)
    const heightD = (t: number, bar: number) => {
      let h = (HEIGHT[idea.section?.kind ?? 'verse'] ?? 0.4) + (t - 0.5) * 0.4 + M.lean * 0.15;
      if (idea.section?.kind === 'prechorus') h += 0.3 * (bar / Math.max(1, song.bars.length - 1));
      const m = MID[0] + Math.max(0, Math.min(1, h)) * (MID[1] - MID[0]);
      let best = 0;
      for (let x = -35; x <= 42; x++) if (Math.abs(midiOf(x) - m) < Math.abs(midiOf(best) - m)) best = x;
      return best;
    };
    // (the section's slow line, if on: the height moved by it, by where in the section)
    const spine = spineFor(idea.section?.kind);
    const targetD = (t: number, bar: number) => {
      const h = heightD(t, bar);
      return spine ? h + Math.round(SPINES[spine].f(bar / Math.max(1, song.bars.length - 1))) : h;
    };
    const kind = idea.section?.kind ?? '';
    const again = REPEATS.includes(kind) ? firstOf.get(kind) : undefined;
    let i = 0;
    // (Section change: this kind's feel, picked the first time it comes, unlike the section before)
    let feel: Feel = { phrase: M.phrase, pace: 1, jump: false };
    if (ideas.shift) {
      const known = feelOf.get(kind);
      if (known) feel = known;
      else {
        if (lastFeel) {
          const prevF: Feel = lastFeel;
          const bars = song.bars.length;
          const phr = [1, 2, 4].filter((x) => x !== prevF.phrase && x <= bars && bars % x === 0);
          const pcs = PACES.filter((x) => Math.abs(x - prevF.pace) >= 0.4);
          // (always its own phrase lengths or pace, so every return of it differs too; now and then a jump coming in as well)
          const jump = crng.chance(0.4);
          if ((crng.chance(0.5) || !pcs.length) && phr.length) feel = { phrase: crng.pick(phr), pace: prevF.pace, jump };
          else if (pcs.length) feel = { phrase: prevF.phrase, pace: crng.pick(pcs), jump };
          else feel = { phrase: prevF.phrase, pace: 1, jump: true };
        }
        feelOf.set(kind, feel);
        nb.feels.push(`${kind === 'prechorus' ? 'pre-chorus' : kind}: ${feel.phrase}-bar phrases, ${feel.pace < 1 ? 'busier' : feel.pace > 1 ? 'longer notes' : 'usual pace'}${feel.jump ? ', a jump coming in' : ''}`);
      }
      lastFeel = feel;
    }
    // (the section before: its last note, if it sings through to the end)
    const pv = si > 0 && !silent[si - 1] ? parts[si - 1] : undefined;
    const pIdea = list[si - 1];
    const pLast = pv?.[pv.length - 1];
    const pBar = pIdea?.song.bars[0].len ?? 16;
    const cutRoom = (n: GuideNote) => n.len - Math.max(4, (n.bend ?? 0) + 2);
    // Breaths: before a big section (a chorus, or one sung higher than the last), or after a tiring stretch, a pause of a random length
    let breathed = false;
    if (ideas.breath && pLast && pIdea && pLast.step + pLast.len === pIdea.song.total) {
      const big = kind === 'chorus' || (HEIGHT[kind as SectionKind] ?? 0.4) - (HEIGHT[pIdea.section?.kind ?? 'verse'] ?? 0.4) >= 0.25;
      const tired = effort(pv!, pBar, pIdea.song.total) >= TIRED;
      if (brng.chance((big ? 0.55 : 0.1) + (tired ? 0.3 : 0))) {
        const by = Math.min(4 * brng.int(1, big && tired ? 4 : 3), 4 * Math.floor(cutRoom(pLast) / 4));
        if (by >= 4) { cutBy(pLast, by); breathed = true; afterPause = true; nb.before++; nb.breathBeats += by / 4; stat.pauses++; }
      }
    }
    // Lead-ins: the section's first note comes in early, at the end of the section before (after a breath), held into this one
    let leadL = 0;
    if (ideas.leadIn && pLast && pIdea && lrng.chance(LEAD_IN_P)) {
      let r = lrng.next();
      const L = (LEAD_INS.find(([, w]) => (r -= w) <= 0) ?? LEAD_INS[0])[0];
      // (a copy's first note must start on the 1 and leave room in the bar)
      const entryOk = !again || (again.total === song.total && again.bars === song.bars.length && again.notes[0].step === 0 && again.notes[0].len + L <= song.bars[0].len);
      const room = pIdea.song.total - L - 4;
      const pEnd = pLast.step + pLast.len;
      const by = pEnd - room;
      const beat1 = groupStarts(song.bars[0].groups)[1] ?? song.bars[0].len;
      if (entryOk && (again || L + beat1 <= song.bars[0].len) && L < pIdea.song.bars[pIdea.song.bars.length - 1].len && (by <= 0 || (by % 2 === 0 && by <= cutRoom(pLast)))) {
        if (by > 0) { cutBy(pLast, by); if (!breathed) stat.pauses++; }
        leadL = L; afterPause = true; nb.leadIns++;
      }
    }
    // a verse, pre-chorus or chorus sung before: the same notes (in this section's key), a few a step away
    if (again && again.total === song.total && again.bars === song.bars.length) {
      const fit = (x: number) => midiOf(x) >= MID[0] && midiOf(x) <= top;
      const shift = [0, -7, 7].find((sh) => again.notes.every((n) => fit(n.deg + sh))) ?? 0;
      // (a leap into it straight on: the note before is cut a beat short, a pause before the leap)
      const before = parts[si - 1]?.[parts[si - 1].length - 1];
      const prevSong = list[si - 1]?.song;
      const entry = again.notes[0];
      let lateIn = 0;
      if (before && prevSong && entry.step === 0 && before.step + before.len === prevSong.total && Math.abs(entry.deg + shift - d) >= 3) {
        if (before.len >= 8) { cutBeat(before); stat.pauses++; }
        // (else the repeat comes in a beat late)
        else if (entry.len >= 8) lateIn = 4;
      }
      again.notes.forEach((n0, k) => {
        let deg = n0.deg + shift, cs = again.cs[k];
        let homeLeap = false, homeLate = 0;
        const inner = k > 0 && k < again.notes.length - 1 && !n0.bend && !again.notes[k + 1]?.bend;
        if (inner && rng.chance(VARY)) {
          const to = deg + (rng.chance(0.5) ? 1 : -1);
          // (still small moves either side: a changed note never makes a leap)
          const near = (o?: GuideNote) => !o || Math.abs(o.deg + shift - to) <= 2 || o === again.notes[k + 1] && !!o.leap;
          const before = out[out.length - 1];
          if (fit(to) && (!before || Math.abs(before.deg - to) <= 2) && (near(again.notes[k + 1]) || !!again.notes[k + 1]?.leap)) { deg = to; cs = 0; stat.varied++; }
        }
        // (out of the voice (a repeat in a higher key): brought back in, a step at a time)
        while (!fit(deg) && midiOf(deg) > top) deg--;
        while (!fit(deg) && midiOf(deg) < MID[0]) deg++;
        // (the song's last note: home)
        if (lastSection && k === again.notes.length - 1) {
          deg = [-35, -28, -21, -14, -7, 0, 7, 14, 21, 28, 35, 42].map((h) => h).filter((h) => fit(h)).reduce((b, h) => (Math.abs(h - deg) < Math.abs(b - deg) ? h : b), 0);
          cs = 0;
          // (a leap home straight on (this chorus ends the song when the outro sits out): a pause before it)
          const p = out[out.length - 1];
          if (p && p.step + p.len === n0.step && Math.abs(deg - p.deg) >= 3) {
            if (p.len >= 8) { cutBeat(p); stat.pauses++; homeLeap = true; }
            else if (n0.len >= 8) { homeLate = 4; homeLeap = true; }
          }
        }
        if (cs && (midiOf(deg) + cs > top || midiOf(deg) + cs < MID[0])) cs = 0;
        const lp = n0.leap || homeLeap || (k === 0 && Math.abs(deg - d) >= 3);
        const late = k === 0 ? lateIn : homeLate;
        const lead = k === 0 ? leadL : 0;
        const note: GuideNote = { step: n0.step + late - lead, len: n0.len - late + lead, midi: midiOf(deg) + cs, deg, ...(cs ? { colour: true } : {}), ...(lp ? { leap: true } : {}), ...(n0.bend ? { bend: n0.bend } : {}) };
        // (a bend only into a step: a key change or a changed note can make it more)
        const prev = out[out.length - 1];
        if (note.bend && (!prev || Math.abs(note.midi - prev.midi) > BEND_SEMIS || note.midi === prev.midi)) delete note.bend;
        out.push(note);
        stat.notes++;
        stat.lowM = Math.min(stat.lowM, note.midi); stat.hiM = Math.max(stat.hiM, note.midi);
        if (note.midi > MID[1]) stat.highNotes++;
      });
      stat.repeats++;
      d = out[out.length - 1].deg;
      afterPause = false; lastLeap = 0; sameRun = 0;
      beatNo += beats.length;
      i = beats.length;
    }
    // (Repeat idea: the section's phrases, for its form; and the beats as steps from a phrase's start)
    const phraseBars = feel.phrase;
    const phrases = Math.floor(song.bars.length / phraseBars);
    const phraseStep = (p: number) => song.bars[p * phraseBars]?.start ?? song.total;
    const phraseShape = (p: number) => beats.filter((x) => x.bar >= p * phraseBars && x.bar < (p + 1) * phraseBars).map((x) => `${x.step - phraseStep(p)}${x.strong ? 's' : ''}`).join(',');
    /** Which phrase this one sings again, and whether with a new ending: A B A b (two phrases: A then a). */
    const formOf = (p: number): { from: number; newEnd: boolean } | null => {
      if (phrases < 2 || p === 0) return null;
      if (phrases === 2 || phrases === 3) return p === 1 ? { from: 0, newEnd: true } : null;
      if (p % 4 === 1) return p >= 4 ? { from: p - 4, newEnd: false } : null;
      return p % 4 === 2 ? { from: p - 2, newEnd: false } : p % 4 === 3 ? { from: p - 2, newEnd: true } : { from: p - 4, newEnd: false };
    };
    // (Question and answer: which pairs of phrases ask and answer (never the song's last note))
    const asks = new Set<number>();
    if (ideas.qa) for (let p = 0; p + 1 < phrases; p += 2) if (qrng.chance(QA_CHANCE[mood])) { asks.add(p); stat.qaPairs++; }
    const qaRole = (bar: number): 'q' | 'a' | null => {
      const p = Math.floor(bar / phraseBars);
      return asks.has(p) ? 'q' : asks.has(p - 1) && p % 2 === 1 ? 'a' : null;
    };
    while (i < beats.length) {
      const b = beats[i];
      const t = tension(b.bar);
      // a phrase that comes back (Repeat idea): its notes again, moved as a whole to suit the height and the chords
      if (ideas.motif && b.first && b.bar % phraseBars === 0) {
        const p = b.bar / phraseBars;
        const form = formOf(p);
        const p0 = phraseStep(p), pEnd = phraseStep(p + 1);
        const closing = lastSection && (p + 1) * phraseBars > song.bars.length - 4;
        if (form && (p + 1) * phraseBars <= song.bars.length && !closing && phraseShape(form.from) === phraseShape(p)) {
          const s0 = phraseStep(form.from), sEnd = phraseStep(form.from + 1);
          let src = out.filter((n) => n.step >= s0 && n.step < sEnd).map((n) => ({ ...n, len: Math.min(n.len, sEnd - n.step) }));
          if (form.newEnd) src = src.slice(0, -1);
          const prev = out[out.length - 1] ?? (i === 0 ? parts[si - 1]?.[parts[si - 1].length - 1] : undefined);
          const endOfPrev = () => (prev ? (out.length ? prev.step + prev.len : prev.step + prev.len - (list[si - 1]?.song.total ?? 0)) : -Infinity);
          // (every phrase within the run limits: joined to the notes before, how long it is sung without a pause)
          const runOk = (joinBefore: boolean) => {
            if (!src.length) return false;
            const at0 = p0 + (src[0].step - s0);
            let from = at0;
            if (joinBefore && out.length && endOfPrev() === at0) {
              from = prev!.step;
              for (let k = out.length - 1; k > 0 && out[k - 1].step + out[k - 1].len === out[k].step; k--) from = out[k - 1].step;
            }
            return src.every((n, k) => {
              const at = p0 + (n.step - s0);
              if (k > 0 && src[k - 1].step + src[k - 1].len !== n.step) from = at;
              return at + n.len - from <= MAX_RUN * song.bars[0].len;
            });
          };
          let fits = runOk(true);
          // (too long joined to the notes before: a beat's breath before it, the note before cut short)
          if (!fits && runOk(false) && out.length && prev!.len >= 8 && endOfPrev() === p0 + (src[0].step - s0)) { cutBeat(prev!); stat.pauses++; fits = true; }
          const prevEnd = endOfPrev();
          // (each way of moving it: in the voice, no leap in without a pause, near the height, on the chords)
          let best: { sh: number; score: number } | null = null;
          if (fits) for (let sh = -3; sh <= 3; sh++) {
            const f = src[0].deg + sh;
            const gap = p0 + (src[0].step - s0) - prevEnd;
            if (prev && Math.abs(f - d) >= 3 && gap < 4) continue;
            if (!src.every((n) => inVoice(n.deg + sh, tension(song.bars.findIndex((x) => x.start + x.len > p0 + (n.step - s0)))))) continue;
            let score = -0.3 * Math.abs(sh) + irng.next() * 0.2;
            for (const n of src) {
              const at = p0 + (n.step - s0);
              const bi = song.bars.findIndex((x) => x.start + x.len > at);
              score -= 0.5 * Math.abs(n.deg + sh - targetD(tension(bi), bi)) / src.length;
              const bt = beats.find((x) => x.step === at);
              if (lean === 'in' && bt?.strong) score += tonesAt(at).includes(mod(midiOf(n.deg + sh), 12)) ? 1 : -1;
            }
            // (not on the note just sung (Paul: no plodding repeats); after a leap, step back the other way)
            if (prev && midiOf(f) === prev.midi) score -= 1;
            if (lastLeap && Math.sign(f - d) === -Math.sign(lastLeap) && Math.abs(f - d) <= 2) score += 1;
            if (!best || score > best.score) best = { sh, score };
          }
          if (best) {
            const sh = best.sh;
            for (const [k, n0] of src.entries()) {
              const at = p0 + (n0.step - s0);
              const deg = n0.deg + sh;
              const cs = sh === 0 && n0.colour ? n0.midi - midiOf(n0.deg) : 0;
              const before = out[out.length - 1];
              const joinedIn = before && before.step + before.len === at;
              const note: GuideNote = { step: at, len: n0.len, midi: midiOf(deg) + cs, deg, ...(cs ? { colour: true } : {}) };
              if (k === 0 ? Math.abs(deg - d) >= 3 : n0.leap) note.leap = true;
              if (n0.bend && joinedIn && before.midi !== note.midi && Math.abs(note.midi - before.midi) <= BEND_SEMIS) note.bend = n0.bend;
              out.push(note);
              stat.notes++;
              const bt = beats.find((x) => x.step === at);
              if (bt?.strong) { stat.strong++; if (tonesAt(at).includes(mod(note.midi, 12))) stat.strongTone++; }
              stat.lowM = Math.min(stat.lowM, note.midi); stat.hiM = Math.max(stat.hiM, note.midi);
              if (note.midi > MID[1]) stat.highNotes++;
            }
            const last = out[out.length - 1], before = out[out.length - 2];
            d = last.deg;
            lastLeap = last.leap && before ? last.deg - before.deg : 0;
            sameRun = 0;
            if (form.newEnd) {
              // (the ending written anew, from the beat where the phrase's last note was)
              const j = beats.findIndex((x) => x.step >= last.step + last.len);
              const to = j < 0 ? beats.length : j;
              afterPause = false;
              beatNo += to - i; i = to;
              stat.ideaB++;
            } else {
              const j = beats.findIndex((x) => x.step >= pEnd);
              const to = j < 0 ? beats.length : j;
              afterPause = last.step + last.len < pEnd;
              beatNo += to - i; i = to;
              stat.ideaA++;
            }
            continue;
          }
        }
      }
      // a pause at the end of a phrase (never before the first note, never in the last bar of the song)
      const phraseStart = b.first && b.bar > 0 && b.bar % phraseBars === 0;
      const lastBar = lastSection && b.bar === song.bars.length - 1;
      // (sung too long without a pause: one now)
      const joined = out.length > 0 && out[out.length - 1].step + out[out.length - 1].len === b.step;
      let runFrom = joined ? out[out.length - 1].step : b.step;
      for (let k = out.length - 1; joined && k > 0 && out[k - 1].step + out[k - 1].len === out[k].step; k--) runFrom = out[k - 1].step;
      const runMax = MAX_RUN * song.bars[b.bar].len;
      const tooLong = joined && b.step - runFrom >= runMax - 2;
      // (Section change: a jump in the notes coming in, after a beat's breath)
      const jumpIn = feel.jump && !leadL && si > 0 && out.length === 0 && stat.notes > 0 && !again;
      if (jumpIn && !afterPause && i === 0) { i += 1; beatNo += 1; afterPause = true; stat.pauses++; continue; }
      const canPause = (phraseStart || tooLong || (si > 0 && i === 0 && out.length === 0)) && !afterPause && !lastBar && (stat.notes > 0);
      // (Breaths: after a tiring stretch, a breath is likely, and longer)
      const tired = !!ideas.breath && canPause && phraseStart && effort(out, song.bars[b.bar].len, b.step) >= TIRED;
      let pauseNow = canPause && (tooLong || rng.chance(M.pause * (si > 0 && i === 0 ? 0.5 : 1)));
      let rb = pauseNow ? (rng.chance(0.6) ? 1 : 2) : 0;
      if (!pauseNow && tired && brng.chance(0.7)) { pauseNow = true; rb = brng.int(1, 2); }
      if (pauseNow) {
        if (tired) { rb += brng.int(0, 2); nb.breaths++; nb.breathBeats += rb; }
        i += rb; beatNo += rb;
        afterPause = true;
        stat.pauses++;
        continue;
      }
      // how long: the mood's pace (steady: Paul, "too many shifts, almost every beat"), a little quicker as
      // the tension rises; notes change only on strong beats (a bar's first, or its middle)
      const mean = STEADY * M.beats * (1.15 - 0.3 * t) * feel.pace;
      const want = Math.max(1, Math.round(mean * (0.7 + rng.next() * 0.6)));
      // (up to the next phrase start, so pauses can come there)
      const phraseAt = (j: number) => beats[j].first && beats[j].bar % phraseBars === 0;
      let n = 1;
      // (never held past a bar)
      // (a lead-in: held from before the section, so within a bar all told)
      const leading = leadL > 0 && out.length === 0 && i === 0;
      const maxHold = song.bars[b.bar].len - (leading ? leadL : 0);
      while (i + n < beats.length && !phraseAt(i + n) && (n < want || !beats[i + n].strong) && beats[i + n].step - b.step < maxHold && beats[i + n].step - runFrom <= runMax) n++;
      while (leading && n > 1 && (i + n < beats.length ? beats[i + n].step : song.total) - b.step + leadL > song.bars[b.bar].len) n--;
      const end = i + n >= beats.length;
      const phraseEnd = end || phraseAt(i + n);
      const qa = ideas.qa ? qaRole(b.bar) : null;
      const songEnd = lastSection && end;
      // (the song's last two bars head for home, the nearest one)
      const homes = [-35, -28, -21, -14, -7, 0, 7, 14, 21, 28, 35, 42].filter((h) => midiOf(h) >= MID[0] && midiOf(h) <= MID[1]);
      const homeD = (homes.length ? homes : [0]).reduce((bh, h) => (Math.abs(h - d) < Math.abs(bh - d) ? h : bh));
      const closing = lastSection && b.bar >= song.bars.length - 4;
      // (the height the tension asks for, within the voice; a high voice reaches for its top where it's high)
      const voiceDs = Array.from({ length: 78 }, (_, k) => k - 35).filter((x) => inVoice(x, t));
      const dBot = Math.min(...voiceDs), dTop = Math.max(...voiceDs);
      let want0 = targetD(t, b.bar);
      if (high && t >= HIGH_T) want0 = Math.max(want0, dTop - 1);
      const target = closing ? homeD : Math.max(dBot, Math.min(dTop, want0));
      const strong = b.strong || n >= 2;
      const spanEnd = i + n < beats.length ? beats[i + n].step : song.total;
      // every candidate move, weighted
      const cands: { d: number; w: number }[] = [];
      const reach = afterPause ? M.leapMax : 2;
      for (let s = -reach; s <= reach; s++) {
        const x = d + s;
        if (jumpIn && Math.abs(s) < 3 && reach >= 3) continue;
        // (above the voice where the song calms down: only on the way down, a step at a time)
        if (!inVoice(x, t) && !(x < d && midiOf(x) <= midiOf(d) && midiOf(x) >= MID[0])) continue;
        // (near the section's height: a phrase keeps within W scale notes of it, or heads back toward it)
        if (Math.abs(x - target) > W && Math.abs(x - target) >= Math.abs(d - target) && !songEnd) continue;
        const a = Math.abs(s);
        let w = a === 0 ? (sameRun >= 2 || stat.notes === 0 ? 0 : M.same) : a === 1 ? 1 : a === 2 ? M.third : M.leap * (afterPause ? 2.5 : 0) / (a - 2);
        if (stat.notes === 0) w = s === 0 ? 1 : 0;
        // after a leap: step back the other way
        if (lastLeap && s !== 0) w *= Math.sign(s) === -Math.sign(lastLeap) && a <= 2 ? 3 : 0.15;
        // toward the tension's height, and the mood's lean
        if (s !== 0) {
          const toward = Math.sign(target - d) === Math.sign(s);
          w *= toward ? 1 + Math.min(2, Math.abs(target - d) / 2) : 0.7;
          w *= 1 + M.lean * Math.sign(s);
        }
        // where it likes to rest (more on long notes and strong beats)
        w *= M.rest[deg7(x)] ** (strong ? 1.6 : 0.6);
        // with the chords: strong beats on the chord's notes
        if (lean === 'in' && strong) w *= tonesAt(b.step).includes(mod(midiOf(x), 12)) ? 3 : 0.35;
        // (a key or scale set by hand, guarded: away from a clash with the band, the held notes and strong beats most)
        if (guard && clashOver(mod(midiOf(x), 12), b.step, spanEnd)) w *= strong || spanEnd - b.step >= 4 ? 0.03 : 0.25;
        // (Question and answer: a question's last note goes up, onto an open note; its answer falls to a settled one)
        if (qa && phraseEnd && !songEnd) {
          if (qa === 'q') w *= (s > 0 ? 8 : 0.08) * (deg7(x) === 0 ? 0.4 : 1);
          else w *= (s < 0 ? 8 : 0.08) * ([0, 2, 4].includes(deg7(x)) ? 2.5 : 0.5);
        }
        // (Slow line: a phrase ends on it)
        if (spine && phraseEnd && x === target) w *= 3;
        // a section's last note settles (1st, 3rd, 5th); the song's last note is home
        if (end && [0, 2, 4].includes(deg7(x))) w *= 3;
        if (songEnd) w = deg7(x) === 0 ? w + 100 : 0;
        if (w > 0) cands.push({ d: x, w });
      }
      // (the last note: home, even out of a step's reach)
      if (songEnd && !cands.some((c) => deg7(c.d) === 0)) { cands.length = 0; cands.push({ d: homeD, w: 1 }); }
      // (nothing in reach within the voice (a key change): the nearest note that is)
      if (!cands.length) cands.push({ d: voiceDs.reduce((bx, x) => (Math.abs(x - d) < Math.abs(bx - d) ? x : bx), voiceDs[0] ?? 0), w: 1 });
      let r = rng.next() * cands.reduce((s, c) => s + c.w, 0);
      const pick = cands.find((c) => (r -= c.w) <= 0) ?? cands[cands.length - 1];
      const s = pick.d - d;
      const a = Math.abs(s);
      // (a forced jump (home at the end, back into the voice): a pause before it, the note before cut a beat)
      let forced = false;
      if (a >= 3 && !afterPause && stat.notes > 0) {
        const pv = out[out.length - 1] ?? (i === 0 ? parts[si - 1]?.[parts[si - 1].length - 1] : undefined);
        const pvEnd = pv ? pv.step + pv.len : -1;
        const joins = pv && (out.length ? pvEnd === b.step : pvEnd === list[si - 1].song.total && b.step === 0);
        if (joins && pv.len >= 8) { cutBeat(pv); stat.pauses++; forced = true; }
        // (else a beat's pause here, and the note after it)
        else if (joins && n > 1) { i += 1; beatNo += 1; afterPause = true; stat.pauses++; continue; }
      }
      if (stat.notes > 0) { if (a === 0) stat.same++; else if (a === 1) stat.step++; else if (a === 2) stat.third++; else stat.leap++; }
      if (qa && phraseEnd && !songEnd) { if (qa === 'q') { stat.qN++; if (pick.d > d) stat.qUp++; } else { stat.aN++; if (pick.d < d) stat.aDown++; } }
      if (spine && phraseEnd) { stat.phraseEnds++; if (pick.d === target) stat.spineEnds++; }
      d = pick.d;
      lastLeap = a >= 3 ? s : 0;
      sameRun = a === 0 ? sameRun + 1 : 0;
      let midi = midiOf(d);
      // a mood's colour note (not on the chord's root, never against a held strong chord note when leaning in)
      const shift = M.colour && !songEnd ? colourShift(M.colour, scale, d, target > d) : 0;
      let colour = false;
      if (shift && rng.chance(M.colourP) && midi + shift <= ceil(t) && midi + shift >= MID[0] && mod(midi + shift - rootAt(b.step), 12) !== 6 && !(lean === 'in' && b.strong) && !(guard && clashOver(mod(midi + shift, 12), b.step, spanEnd))) { midi += shift; colour = true; stat.colour++; }
      let stepEnd = i + n < beats.length ? beats[i + n].step : song.total;
      // (a run that would pass its limit at the section's end: the note stops there, a pause after it)
      if (stepEnd - runFrom > runMax && !songEnd) stepEnd = Math.max(b.step + 4, runFrom + runMax);
      const prev = out[out.length - 1];
      // (the same note again, straight on: held on, not struck again)
      if (prev && a === 0 && prev.midi === midi && prev.step + prev.len === b.step && stepEnd - prev.step <= maxHold) {
        prev.len = stepEnd - prev.step;
        i += n; beatNo += n;
        continue;
      }
      // a bend into the next step: straight on from the note before (no pause), by a half or whole step,
      // over an 8th, a quarter or half a bar (never more than half the note)
      let bend = 0;
      if (prev && prev.step + prev.len === b.step && a === 1 && Math.abs(midi - prev.midi) <= BEND_SEMIS && rng.chance(M.bend)) {
        const opts = [2, 4, Math.round(song.bars[b.bar].len / 2)].map((len, j) => ({ len, w: len * 2 <= stepEnd - b.step ? M.bendLen[j] : 0 }));
        let r2 = rng.next() * opts.reduce((x, o) => x + o.w, 0);
        if (r2 > 0) { bend = (opts.find((o) => (r2 -= o.w) <= 0) ?? opts[0]).len; stat.bends++; stat.bendLens[opts.findIndex((o) => o.len === bend)]++; }
      }
      if (jumpIn && a >= 3) nb.jumps++;
      out.push({ step: b.step - (leading ? leadL : 0), len: stepEnd - b.step + (leading ? leadL : 0), midi, deg: d, ...(colour ? { colour } : {}), ...(a >= 3 || forced ? { leap: true } : {}), ...(bend ? { bend } : {}) });
      stat.notes++;
      if (b.strong) { stat.strong++; if (tonesAt(b.step).includes(mod(midi, 12))) stat.strongTone++; }
      stat.lowM = Math.min(stat.lowM, midi); stat.hiM = Math.max(stat.hiM, midi);
      if (midi > MID[1]) stat.highNotes++;
      afterPause = false;
      i += n; beatNo += n;
    }
    // (the first of its kind: kept, to sing again (a lead-in kept as if it started on the 1))
    // (clashes with the band: held notes, a beat or more, against any chord they're held over)
    if (tone) for (const nt of out) if (nt.len >= 4) { stat.held++; if (clashOver(mod(nt.midi, 12), nt.step, nt.step + nt.len)) stat.clash++; }
    if (REPEATS.includes(kind) && !firstOf.has(kind) && out.length) firstOf.set(kind, { notes: out.map((n) => (n.step < 0 ? { ...n, step: 0, len: n.len + n.step } : { ...n })), cs: out.map((n) => n.midi - midiOf(n.deg)), total: song.total, bars: song.bars.length });
    // (a lead-in: sung from the section before, so it's that section's note, running on into this one)
    if (out[0] && out[0].step < 0 && pv && pIdea) {
      const ld = out.shift()!;
      pv.push({ ...ld, step: pIdea.song.total + ld.step });
      // (the next note not bent from it: the words of the two sections are sung apart)
      if (out[0]?.bend) delete out[0].bend;
    }
    // pushes and pulls on the held notes, on the 8th grid (before the quick notes, which keep clear of them)
    out.forEach((n, k) => {
      const next = out[k + 1];
      const from = stepBase + n.step, to = from + n.len;
      while (markAt < from) markAt += markGap();
      if (n.len < 8 || n.bend || next?.bend) return;
      const mk: Mark[] = [];
      while (markAt < to) {
        const at0 = markAt - from + (markAt - from) % 2;
        // (a beat of the note held first, Paul: not straight away)
        const at = at0 >= 4 && at0 <= n.len - 4 ? at0 : undefined;
        if (at !== undefined) {
          // (never a pull on the song's last note: it rings to the end)
          const kind = mrng.chance(0.5) && !(lastSection && k === out.length - 1) ? 'pull' : 'push';
          // (a pull: a 16th falling away, then silence until the next beat, where the note comes back)
          const beat = beats.find((b) => b.step >= n.step + at + 2)?.step ?? Infinity;
          const back = kind === 'pull' ? Math.min(n.len, beat - n.step) - at : undefined;
          mk.push({ at, kind, ...(back ? { back } : {}) }); stat[kind]++;
          markAt = from + at + (back ?? 0);
        }
        markAt += markGap();
      }
      if (mk.length) n.marks = mk;
    });
    // quick notes on the long ones (Paul): one note a scale step up or down (in the key), for an 8th, on any 16th (random spots),
    // then back to the line, like a drum hit (now and then a 16th and a 16th's silence); at a held
    // note's very end, a bend to it instead (and on from there). They come in 2-bar clusters: frequent,
    // moderate, sparse. Not on notes in a bend, never the song's last note's end.
    const barOf = (g: number) => barBase + Math.max(0, song.bars.findIndex((b) => b.start + b.len > g));
    out.forEach((n, k) => {
      const next = out[k + 1];
      if (n.len < 8 || n.bend || next?.bend) return;
      const songLast = lastSection && k === out.length - 1;
      const barLen = song.bars.find((b) => b.start + b.len > n.step)?.len ?? 16;
      const fl: Flick[] = [];
      // (a beat of the note held first, Paul: "too many very short held lines")
      for (let at = 4; at < n.len; at++) {
        const r = frng.next(), gap = frng.chance(G.gap);
        // (Pitch by words, as English is said: up, a new stressed word; down, a word's soft last syllable, the
        // line coming back up into the next stress; one with a pause after it ends a word, so falls)
        const speech = !!ideas.speech;
        let up = frng.chance(speech ? WORD_STARTS[first.song.genre] ?? 0.5 : FLICK_UP);
        if (speech && gap) up = false;
        const cl = clusterAt(barOf(n.step + at));
        // (the genre: how many, offbeats, bends at a note's end)
        // (any 16th: the offbeat 8ths by the genre's taste, the in-between 16ths a little less often)
        const pos = mod(n.step + at, 4);
        const where = pos === 2 ? G.off : pos === 0 ? 1 / Math.sqrt(G.off) : SIXTEENTH;
        const atEnd = at + 2 >= n.len;
        const p0 = Math.min(1, (FLICK_RATE[flicks] * clusterRate[cl] * 1.2 * where * (atEnd ? G.endBend : 1)) / barLen);
        // (scaled after the level, so it still counts where the level is near full: fewer, or more of the gaps filled)
        const pOn = G.rate <= 1 ? p0 * G.rate : 1 - (1 - p0) ** G.rate;
        // (apart: a beat, an 8th in a frequent cluster or on Some and Lots (Paul: "much more frequent"))
        const last = fl[fl.length - 1];
        if (last && at < last.at + last.len + (last.gap ?? 0) + (cl === 'frequent' || DENSE.includes(flicks) || G.close ? 2 : 4)) continue;
        if (r >= pOn) continue;
        // (with a pause: a 16th, a 16th's silence, then the line again on the 8th)
        // (back to the line on the 8th grid: one started on an in-between 16th is a 16th long, no pause)
        const odd = mod(n.step + at, 2) === 1;
        const len = gap || odd ? 1 : 2;
        if (at + len > n.len) continue;
        const end = at + len === n.len;
        if (end && songLast) continue;
        const m = midiOf(n.deg + (up ? 1 : -1));
        // (never more than a whole step away: a scale with a wider step (harmonic minor's) skips it)
        if (m === n.midi || Math.abs(m - n.midi) > 2 || m < MID[0] - 2 || m > (high ? top : MID[1]) + 2) continue;
        // (a 16th's silence before the note comes back: only with room after it)
        const rest = !end && gap && !odd && at + len + 1 < n.len;
        if (gap && !odd && !rest) continue;
        // (clear of the pushes and pulls)
        if ((n.marks ?? []).some((mk) => mk.at < at + len + (rest ? 1 : 0) && mk.at + (mk.back ?? 1) > at)) continue;
        fl.push({ at, len, midi: m, ...(end ? { bend: true } : {}), ...(rest ? { gap: 1 } : {}), ...(speech && !end ? { starts: up && !rest } : {}) });
        if (rest) stat.flickGaps++;
        stat.byCluster[cl]++;
        stat.flicks++;
        if (end) stat.flickBends++;
      }
      if (fl.length) n.flicks = fl;
    });
    // the song's last note rings to the end
    parts.push(out);
    barBase += song.bars.length;
    stepBase += song.total;
  });

  // a cap (Paul): never more than MAX_PER_SECOND changes you hear in any second, in real time (by the tempo):
  // every note's start, a quick note (out and back again), a push, a pull (and the note back after it); the
  // notes' starts stay, and in a busy spot the later quick notes, pushes and pulls are left out
  {
    const fixed: number[] = [];
    const opts: { t: number[]; n: GuideNote; f?: Flick; m?: Mark }[] = [];
    let t0 = 0;
    parts.forEach((p, si) => {
      const sec = 15 / list[si].song.bpm, at = (st: number) => t0 + st * sec;
      for (const n of p) {
        if (!n.bend) fixed.push(at(n.step));
        for (const f of n.flicks ?? []) opts.push({ t: [at(n.step + f.at), ...(f.bend ? [] : [at(n.step + f.at + f.len + (f.gap ?? 0))])], n, f });
        for (const m of n.marks ?? []) opts.push({ t: [at(n.step + m.at), ...(m.back && m.at + m.back < n.len ? [at(n.step + m.at + m.back)] : [])], n, m });
      }
      t0 += list[si].song.total * sec;
    });
    opts.sort((a, b) => a.t[0] - b.t[0]);
    const kept = [...fixed];
    // (the most in any second around these times, with them in)
    const fits = (add: number[]) => {
      const all = [...kept, ...add].filter((x) => x > add[0] - 1.001 && x < add[add.length - 1] + 1.001).sort((a, b) => a - b);
      for (let a = 0, b = 0; b < all.length; b++) { while (all[b] - all[a] >= 1 - 1e-6) a++; if (b - a + 1 > MAX_PER_SECOND) return false; }
      return true;
    };
    for (const e of opts) {
      if (fits(e.t)) { kept.push(...e.t); continue; }
      stat.capped++;
      if (e.f) {
        e.n.flicks = e.n.flicks!.filter((x) => x !== e.f);
        if (!e.n.flicks.length) delete e.n.flicks;
        stat.flicks--;
        if (e.f.gap) stat.flickGaps--;
        if (e.f.bend) stat.flickBends--;
      } else if (e.m) {
        e.n.marks = e.n.marks!.filter((x) => x !== e.m);
        if (!e.n.marks.length) delete e.n.marks;
        stat[e.m.kind]--;
      }
    }
  }

  const moves = Math.max(1, stat.step + stat.third + stat.same + stat.leap);
  const pc = (x: number) => `${Math.round((100 * x) / moves)}%`;
  const startDeg = deg7(parts.find((p) => p.length)?.[0].deg ?? 0);
  const colourWord: Record<Exclude<Colour, null>, string> = {
    lead: 'the raised 7th pulling up home', sigh: 'the flat 6th sighing down to the 5th', dark: 'the flat 2nd, dark, just above home', float: 'the raised 4th, floating',
  };
  const notes = [
    `Mood: ${MOOD_LABEL[mood]}${moodIn ? '' : ' (auto)'}: ${M.desc}`,
    stat.notes ? `Starts on the ${DEG_NAME[startDeg]}, ends on home. Range ${noteName(stat.lowM)} to ${noteName(stat.hiM)}` : 'No notes: the line sits out here',
    `Voice: ${range ? `range set by hand: ${noteName(MID[0])} to ${noteName(MID[1])}, the song's peaks to ${noteName(PEAK)}` : high ? `high (${HIGH_VOICES[high].label}): mid range, up to ${noteName(top)} where the song is high (${stat.highNotes} notes up there)` : `mid (${noteName(MID[0])} to ${noteName(MID[1])}, the song's peaks to ${noteName(PEAK)}; verses low, choruses lifted)`}`,
    ...(tone ? [(() => {
      const k = keyOf(first.song), sc = tone.scale ?? first.song.mode;
      const same = shared(k, scaleOf(first.song), first.song.key, GUIDE_SCALES[first.song.mode]);
      return `Key & scale: ${NAMES[k]} ${SCALE_LABEL[sc].toLowerCase()} (the band: ${NAMES[first.song.key]} ${first.song.mode}; ${same} of 7 notes shared)${tone.guard ? ', steered away from clashes' : ''}; ${stat.clash} of ${stat.held} held notes clash with a chord under them`;
    })()] : []),
    ...(ideas.qa ? [`Question and answer: ${stat.qaPairs} pairs of phrases (${mood}: about ${Math.round(QA_CHANCE[mood] * 100)}% of pairs); ${stat.qUp} of ${stat.qN} questions ending up, ${stat.aDown} of ${stat.aN} answers falling to a settled note`] : []),
    ...(ideas.speech ? [`Pitch by words: quick notes going up start a new stressed word (then the light rest of it, back down); going down, a word's soft last syllable, the line coming back up into the next stress`] : []),
    ...(ideas.spine ? [`Slow line: ${[...spineOf].map(([k, sp]) => `${k === 'prechorus' ? 'pre-chorus' : k} ${SPINES[sp].says}`).join('; ')}; ${stat.spineEnds} of ${stat.phraseEnds} phrases end on it`] : []),
    ...(ideas.breath ? [`Breaths: ${nb.before} before a big section or after a tiring one, ${nb.breaths} more after a tiring stretch (long or high); ${nb.breathBeats} beats in all, of random lengths`] : []),
    ...(ideas.shift ? [`Section change: ${nb.feels.join('; ') || 'one kind of section only'}${nb.jumps ? ` (${nb.jumps} ${nb.jumps === 1 ? 'jump' : 'jumps'} coming in)` : ''}`] : []),
    ...(ideas.leadIn ? [`Lead-ins: ${nb.leadIns} ${nb.leadIns === 1 ? 'section comes' : 'sections come'} in early, their first note held over the line`] : []),
    ...(ideas.carry ? [`Carry over: ${nb.carries} last ${nb.carries === 1 ? 'note runs' : 'notes run'} on into a section the line sits out (${nb.carryBends} bent a step)`] : []),
    ...(ideas.motif ? [`Repeat idea: phrases in the form A B A b, ${stat.ideaA} sung again (moved to suit the height and chords), ${stat.ideaB} again with a new ending`] : []),
    `Repeats: ${stat.repeats} ${stat.repeats === 1 ? 'section' : 'sections'} sung like the first verse, pre-chorus or chorus (${stat.varied} notes changed a step)`,
    `Moves: steps ${pc(stat.step)}, 3rds ${pc(stat.third)}, held on ${pc(stat.same)}, leaps after a pause ${pc(stat.leap)} (${stat.leap})`,
    `Bends: ${stat.bends} (into a step: ${stat.bendLens[0]} over an 8th, ${stat.bendLens[1]} over a quarter, ${stat.bendLens[2]} over half a bar)`,
    `Sits out: ${list.map((i, si) => (silent[si] ? i.section?.label ?? '' : '')).filter(Boolean).join(', ') || 'nothing'} (always the intro and solos; interludes, bridges, breakdowns and outros by chance)`,
    ...(flicks === 'off' ? [] : [`Quick notes for ${first.song.genre}: ${G.feel}`]),
    ...(flicks === 'off' ? [] : [`Quick notes: ${stat.flicks} in 2-bar clusters (frequent ${stat.byCluster.frequent}, moderate ${stat.byCluster.moderate}, sparse ${stat.byCluster.sparse}); ${stat.flickGaps} as a 16th with a 16th's pause before the note comes back, ${stat.flickBends} bent to at a note's end; one scale step up or down, in the key`]),
    `Pushes and pulls on the held notes: ${stat.push} pushes (a lift, like a word starting), ${stat.pull} pulls (a dip, like a word ending), spread unevenly; a pull falls to silence and the note comes back on the next beat`,
    `Busy spots: at most ${MAX_PER_SECOND} changes you hear in any second (notes, quick notes out and back, pushes, pulls and the note back after them; ${stat.capped} quick notes, pushes and pulls left out)`,
    `${stat.notes} notes, about ${(songBeats / Math.max(1, stat.notes)).toFixed(1)} beats each; ${stat.pauses} pauses`,
    `Chords: ${lean === 'in' ? 'leaning in' : 'leaning out (key only)'}: strong beats on a chord note ${Math.round((100 * stat.strongTone) / Math.max(1, stat.strong))}%`,
    M.colour ? `Out of key: ${colourWord[M.colour]} (${stat.colour}${stat.colour === 1 ? ' time' : ' times'})` : 'Out of key: none (this mood stays in the scale)',
  ];
  return { parts, silent, mood, notes };
}
