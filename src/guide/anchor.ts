// Anchor line (experiment, docs/GUIDE-ANCHOR.md): another way of writing the Guide line, behind its own
// switch. Paul's idea: one strong note (the anchor) for every 4 bars, most words sung on it, in a rhythm
// pattern by genre (a cell of 3-6 beats, repeated); the pattern broken for an accent near the anchor, in
// the classic small figures (two up and one down, a step up and back, a turn, a fall), ending on a strong
// note that may be held into the next bar or two; then a rest. Sparse: phrases of 1, 2 or 4 bars, a word
// on each note of the rhythm, now and then two in a beat. Bends into the accents by chance.
// The same output as writeGuide (line.ts), so the drawing, the synth, the words and the voice all work.

import type { Idea, SectionKind } from '../idea';
import { groupStarts } from '../rhythm';
import { Rng } from '../rng';
import { type Mood, MOOD_LABEL, autoMood } from '../tension';
import { chordTones } from '../parts/guitar2';
import type { Genre } from '../genres';
import { GUIDE_SCALES, HEIGHT, LEAD_INS, LEAD_IN_P, SPINES, SPINE_BY, SPINE_GENRE, TIRED, type GuideIdeas, type AnchorRhythm, type Spine, MID_AUTO, NAMES, PEAK_AUTO, PEAK_T, PLAY_CHANCE, REPEATS, SCALE_LABEL, MAX_PER_SECOND, type GuideLine, type GuideNote, type GuideRange, type GuideTonality, type Lean, homeMidi, noteName } from './line';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Slow line: how far the shape moves the anchors (times the guide line's own shapes, in scale steps). */
const SPINE_DEPTH = 1.3;
/** Breaths inside a section: after a stretch this tiring (bars, high notes counting more; the guide line's is 2.5). */
const TIRED_IN = 1;
/** Lead-ins inside a section: how often a phrase comes in early (held into it, or a quick pickup word). */
const PICKUP_P = 0.35;

/** A held note may run into the next bar or two (Paul), so up to 2 bars here (the line's own limit is a bar). */
export const ANCHOR_HOLD_BARS = 2;

/**
 * What one beat of a rhythm cell does: a note the whole beat (`one`), two notes (`two`: on the beat and its
 * last 8th), a push on the offbeat (`off`), three quick ones (`run`: the "more than one word a beat", rare),
 * long-short (`dot`: a dotted 8th and a 16th), short-long (`snap`: a 16th and a dotted 8th), two quick ones
 * on the offbeat (`and`), a 16th late (`late`), the note before held on (`tie`) or silence (`rest`).
 * More (Paul: "too limited"): an 8th and two 16ths (`gallop`), two 16ths and an 8th (`rgallop`), 16th-8th-16th
 * (`syn`, the syncopated middle), four 16ths (`four`, talky, rare), a 16th late then an 8th (`skip`), the
 * beat's last 16th pushed into the next (`ant`, held on by a `tie` after it), a clipped word (`short`), and in
 * the long beats of 6/8 three 8ths (`three`; a plain beat sings it as a run).
 */
type Beat = 'one' | 'two' | 'off' | 'run' | 'dot' | 'snap' | 'and' | 'late' | 'tie' | 'rest'
  | 'gallop' | 'rgallop' | 'syn' | 'four' | 'skip' | 'ant' | 'short' | 'three';
/** Where a beat's notes fall (step in the beat, length), for a beat of `L` steps (4: a quarter; 6: a dotted quarter). */
const BEAT_NOTES: Record<Exclude<Beat, 'tie' | 'rest'>, (L: number) => [number, number][]> = {
  one: (L) => [[0, L]],
  two: (L) => (L >= 6 ? [[0, L - 2], [L - 2, 2]] : [[0, L / 2], [L / 2, L / 2]]),
  off: (L) => [[L - 2, 2]],
  run: (L) => (L >= 6 ? [[0, 2], [2, 2], [4, L - 4]] : [[0, 1], [1, 1], [2, L - 2]]),
  dot: (L) => (L >= 6 ? [[0, 3], [3, L - 3]] : [[0, 3], [3, L - 3]]),
  snap: (L) => (L >= 6 ? [[0, 2], [2, L - 2]] : [[0, 1], [1, L - 1]]),
  and: (L) => [[L - 2, 1], [L - 1, 1]],
  late: (L) => (L >= 6 ? [[2, L - 2]] : [[1, L - 1]]),
  gallop: (L) => (L >= 6 ? [[0, 2], [2, 2], [4, L - 4]] : [[0, 2], [2, 1], [3, 1]]),
  rgallop: (L) => (L >= 6 ? [[0, 1], [1, 1], [2, L - 2]] : [[0, 1], [1, 1], [2, 2]]),
  syn: (L) => (L >= 6 ? [[0, 1], [1, 3], [4, L - 4]] : [[0, 1], [1, 2], [3, 1]]),
  four: (L) => (L >= 6 ? [[0, 1], [1, 1], [2, 2], [4, L - 4]] : [[0, 1], [1, 1], [2, 1], [3, 1]]),
  skip: (L) => (L >= 6 ? [[1, 1], [2, L - 2]] : [[1, 1], [2, 2]]),
  ant: (L) => [[L - 1, 1]],
  short: (L) => [[0, Math.min(2, L)]],
  three: (L) => (L >= 6 ? [[0, 2], [2, 2], [4, L - 4]] : [[0, 1], [1, 1], [2, L - 2]]),
};

/**
 * Rhythm cells by genre, 3-6 beats each (Paul: a standard rhythm for 3-4 or 5-6 beats, then a break; and
 * more of them to build phrases from). Every genre also draws on the shared ones (`SHARED`), a little less.
 */
const CELLS: Record<Genre, Beat[][]> = {
  pop: [['two', 'one', 'one', 'rest'], ['one', 'two', 'one', 'rest'], ['one', 'one', 'tie', 'rest'], ['off', 'tie', 'two', 'one'], ['two', 'one', 'tie'],
    ['dot', 'one', 'two', 'rest'], ['two', 'snap', 'one', 'rest'], ['rest', 'two', 'two', 'one'], ['one', 'and', 'one', 'rest'], ['two', 'two', 'short', 'rest'], ['rgallop', 'one', 'two', 'rest'], ['one', 'ant', 'tie', 'two', 'rest'], ['skip', 'two', 'one', 'rest'], ['two', 'one', 'rest', 'and', 'one', 'rest']],
  rock: [['one', 'one', 'two', 'one', 'rest', 'rest'], ['two', 'one', 'tie', 'rest'], ['one', 'two', 'one', 'tie'], ['one', 'one', 'one', 'rest'],
    ['dot', 'dot', 'one', 'rest'], ['one', 'off', 'one', 'rest'], ['two', 'two', 'one', 'tie', 'rest'], ['gallop', 'one', 'one', 'rest'], ['one', 'one', 'ant', 'tie', 'rest'], ['short', 'short', 'two', 'one', 'rest'], ['two', 'rgallop', 'one', 'tie'], ['one', 'syn', 'one', 'rest']],
  hardrock: [['one', 'off', 'tie', 'rest'], ['two', 'one', 'one', 'rest'], ['one', 'one', 'one', 'tie'], ['one', 'one', 'off', 'tie', 'rest'],
    ['snap', 'one', 'off', 'tie'], ['dot', 'one', 'one', 'rest'], ['one', 'rest', 'two', 'one'], ['gallop', 'gallop', 'one', 'rest'], ['one', 'ant', 'tie', 'off', 'tie'], ['short', 'one', 'short', 'one', 'rest'], ['rgallop', 'one', 'one', 'tie'], ['syn', 'one', 'off', 'tie', 'rest']],
  funk: [['off', 'two', 'off', 'rest'], ['two', 'off', 'tie', 'rest'], ['off', 'one', 'two', 'rest'], ['run', 'off', 'rest'], ['off', 'off', 'one', 'rest'],
    ['late', 'and', 'one', 'rest'], ['snap', 'off', 'two', 'rest'], ['and', 'two', 'off', 'tie'], ['dot', 'late', 'one', 'rest'], ['syn', 'syn', 'off', 'rest'], ['four', 'off', 'tie', 'rest'], ['skip', 'and', 'one', 'rest'], ['short', 'off', 'short', 'off'], ['rgallop', 'syn', 'one', 'rest'], ['ant', 'tie', 'skip', 'two', 'rest']],
  grunge: [['one', 'tie', 'one', 'tie', 'rest'], ['one', 'one', 'tie', 'rest', 'rest'], ['off', 'tie', 'tie', 'rest'], ['one', 'tie', 'rest'],
    ['dot', 'one', 'tie', 'rest'], ['late', 'tie', 'one', 'rest'], ['one', 'one', 'rest', 'off', 'tie'], ['short', 'rest', 'one', 'tie', 'rest'], ['ant', 'tie', 'tie', 'rest'], ['one', 'tie', 'skip', 'tie', 'rest'], ['rest', 'late', 'tie', 'one', 'tie'], ['dot', 'tie', 'one', 'rest', 'rest']],
  metal: [['one', 'one', 'one', 'rest'], ['two', 'one', 'one', 'tie', 'rest'], ['one', 'off', 'tie', 'rest'], ['one', 'one', 'tie'],
    ['dot', 'dot', 'one', 'rest'], ['two', 'two', 'two', 'one'], ['one', 'rest', 'one', 'one'], ['gallop', 'gallop', 'gallop', 'one'], ['short', 'short', 'short', 'one', 'rest'], ['rgallop', 'rgallop', 'one', 'rest'], ['one', 'one', 'ant', 'tie'], ['gallop', 'one', 'gallop', 'one', 'rest']],
  altmetal: [['one', 'one', 'off', 'tie', 'rest'], ['two', 'two', 'one', 'rest'], ['off', 'tie', 'one', 'rest'], ['one', 'one', 'one', 'tie', 'rest', 'rest'],
    ['snap', 'snap', 'one', 'rest'], ['late', 'one', 'off', 'tie'], ['two', 'rest', 'two', 'one'], ['syn', 'one', 'ant', 'tie', 'rest'], ['four', 'one', 'short', 'rest'], ['short', 'skip', 'one', 'rest'], ['rgallop', 'off', 'tie', 'rest'], ['gallop', 'syn', 'one', 'tie', 'rest']],
};
/** Classic vocal rhythms any genre can use: a pickup into the beat, a call that breathes, long-short swing, a dotted push. */
const SHARED: Beat[][] = [
  ['rest', 'off', 'one', 'one'], ['one', 'rest', 'one', 'two'], ['dot', 'dot', 'two', 'rest'], ['two', 'one', 'rest', 'off', 'tie'],
  ['one', 'one', 'one', 'one', 'rest'], ['off', 'one', 'off', 'one', 'rest'], ['snap', 'one', 'one', 'rest'], ['two', 'dot', 'one', 'rest', 'rest'],
  ['two', 'two', 'ant', 'tie', 'rest'], ['short', 'rest', 'two', 'one'], ['gallop', 'one', 'two', 'rest'], ['one', 'skip', 'one', 'rest'],
];

/**
 * Rhythm styles (the Rhythm menu; Paul: "more options of rhythms"), each a pool of cells: Straight (words on
 * the beats), Pushed (syncopated: offbeats, notes pushed ahead of the beat), Busy (talky: 16ths, gallops),
 * Sparse (few words, held and late), Bouncy (long-short: dotted and gallops), Mixed (a bit of everything,
 * conversational). Auto: the genre's own, the shared ones and a little of the styles that suit the genre.
 */
const STYLES: Record<Exclude<AnchorRhythm, 'auto'>, Beat[][]> = {
  straight: [['one', 'one', 'one', 'rest'], ['two', 'two', 'one', 'rest'], ['one', 'two', 'one', 'two', 'one', 'rest'], ['two', 'one', 'two', 'one'],
    ['one', 'short', 'one', 'short'], ['two', 'two', 'two', 'rest'], ['one', 'one', 'two', 'one', 'tie', 'rest'], ['short', 'short', 'one', 'tie']],
  pushed: [['off', 'tie', 'off', 'tie'], ['ant', 'tie', 'one', 'rest'], ['one', 'off', 'tie', 'off'], ['skip', 'off', 'one', 'rest'], ['syn', 'syn', 'one', 'rest'],
    ['and', 'ant', 'tie', 'rest'], ['off', 'one', 'ant', 'tie', 'rest'], ['two', 'ant', 'tie', 'off', 'tie'], ['late', 'off', 'tie', 'rest']],
  busy: [['four', 'two', 'gallop', 'one', 'rest'], ['run', 'run', 'one', 'rest'], ['gallop', 'gallop', 'two', 'rest'], ['rgallop', 'two', 'four', 'one', 'rest'],
    ['two', 'four', 'two', 'rest'], ['syn', 'gallop', 'one', 'rest'], ['two', 'two', 'rgallop', 'one'], ['gallop', 'two', 'syn', 'one', 'rest']],
  sparse: [['one', 'tie', 'rest', 'rest'], ['short', 'rest', 'one', 'tie'], ['late', 'tie', 'tie', 'rest'], ['one', 'rest', 'rest', 'off', 'tie'],
    ['dot', 'tie', 'rest'], ['rest', 'one', 'tie', 'tie'], ['ant', 'tie', 'tie', 'rest', 'rest'], ['one', 'tie', 'short', 'rest']],
  bouncy: [['dot', 'dot', 'dot', 'rest'], ['gallop', 'one', 'gallop', 'rest'], ['snap', 'dot', 'one', 'rest'], ['dot', 'snap', 'two', 'rest'],
    ['rgallop', 'dot', 'one', 'rest'], ['gallop', 'rgallop', 'one', 'rest'], ['dot', 'dot', 'ant', 'tie'], ['snap', 'snap', 'dot', 'one', 'rest']],
  mixed: [['two', 'rest', 'syn', 'one'], ['short', 'short', 'two', 'one', 'rest'], ['one', 'skip', 'tie', 'rest'], ['and', 'two', 'rest', 'gallop', 'one'],
    ['ant', 'tie', 'rgallop', 'one', 'rest'], ['dot', 'off', 'short', 'rest'], ['two', 'late', 'ant', 'tie', 'rest'], ['rest', 'skip', 'two', 'one']],
};
/** The styles that suit each genre (Auto mixes a little of them in). */
const GENRE_STYLES: Record<Genre, Exclude<AnchorRhythm, 'auto'>[]> = {
  pop: ['straight', 'bouncy'], rock: ['straight', 'pushed'], hardrock: ['bouncy', 'pushed'], funk: ['pushed', 'busy'],
  grunge: ['sparse', 'pushed'], metal: ['straight', 'bouncy'], altmetal: ['busy', 'pushed'],
};
/** A beat's near relations: a repeat of the cell now and then swaps one beat for one (a variation, not a copy). */
const VARY: Partial<Record<Beat, Beat[]>> = {
  one: ['two', 'short', 'late', 'dot'], two: ['one', 'dot', 'snap', 'gallop', 'rgallop'], off: ['and', 'skip', 'ant'], dot: ['two', 'snap', 'gallop'],
  snap: ['dot', 'rgallop', 'two'], and: ['off', 'skip'], late: ['one', 'skip'], gallop: ['two', 'dot', 'rgallop'], rgallop: ['two', 'snap', 'gallop'],
  syn: ['two', 'skip'], four: ['run', 'gallop'], skip: ['off', 'late', 'syn'], short: ['one', 'two'], run: ['four', 'gallop'],
};
/** Busier beats (16ths) a fast song, or a low-energy section, sings plainer. */
const PLAINER: Partial<Record<Beat, Beat>> = { four: 'two', gallop: 'two', rgallop: 'two', syn: 'one', skip: 'late', run: 'two', three: 'two' };
/** Notes a beat in a cell, about (how busy it is). */
const busy = (c: Beat[]) => c.reduce((n, b) => n + (b === 'tie' || b === 'rest' ? 0 : BEAT_NOTES[b](4).length), 0) / c.length;

/** The accents: a few notes near the anchor (scale steps from it), then the strong last note (`fin`). */
interface Fig { id: string; pre: number[]; fin: number; settle: boolean; says: string; leap?: boolean }
const FIGS: Fig[] = [
  { id: 'upback', pre: [1], fin: 0, settle: true, says: 'a step up and back' },
  { id: 'twoup', pre: [2], fin: 1, settle: false, says: 'two up, one down' },
  { id: 'climb', pre: [1, 2], fin: 1, settle: false, says: 'up, up, one down' },
  { id: 'dip', pre: [-1], fin: 0, settle: true, says: 'a dip and back' },
  { id: 'turn', pre: [1, 0, -1], fin: 0, settle: true, says: 'a turn around it' },
  { id: 'reach', pre: [1], fin: 2, settle: false, says: 'a reach up two' },
  { id: 'fall', pre: [], fin: -1, settle: true, says: 'a fall of a step' },
  { id: 'over', pre: [1], fin: -1, settle: true, says: 'up, then down past it' },
  { id: 'home2', pre: [2, 1], fin: 0, settle: true, says: 'two up, stepping home' },
  { id: 'drop2', pre: [], fin: -2, settle: true, says: 'a fall of two' },
  { id: 'leap', pre: [], fin: 4, settle: false, leap: true, says: 'a leap up a 5th (after a breath)' },
];
/** Which accents a mood likes (others 1). */
const FIG_MOOD: Record<Mood, Partial<Record<string, number>>> = {
  happy: { twoup: 1.5, reach: 1.6, climb: 1.4, drop2: 0.5, leap: 1.3 },
  triumphant: { reach: 1.8, climb: 1.6, twoup: 1.4, leap: 1.8, drop2: 0.4 },
  melancholic: { fall: 1.8, drop2: 1.6, over: 1.5, dip: 1.3, reach: 0.5, leap: 0.4 },
  nostalgic: { twoup: 1.6, home2: 1.5, over: 1.3 },
  tense: { turn: 1.8, twoup: 1.4, dip: 1.4, leap: 0.6 },
  angry: { upback: 1.6, fall: 1.5, turn: 0.6, reach: 1.2 },
  dreamy: { reach: 1.5, upback: 1.4, turn: 0.6, leap: 0.5 },
  dark: { dip: 1.6, fall: 1.6, drop2: 1.4, reach: 0.6, leap: 0.4 },
};
/** How the rhythm breaks for the accent: each accent note a beat (`even`), two to a beat (`quick`), or the last note pushed an 8th early (`push`). */
type Brk = 'even' | 'quick' | 'push';
const BREAKS: [Brk, number][] = [['even', 0.45], ['quick', 0.25], ['push', 0.3]];
/** Bends into an accent note, by mood (Paul: now and then, not always). */
const BEND_P: Record<Mood, number> = { melancholic: 0.45, dreamy: 0.45, nostalgic: 0.4, dark: 0.4, tense: 0.35, angry: 0.3, triumphant: 0.3, happy: 0.25 };
/** The last note held long (half a bar to a bar; two bars only to close a chorus or the song), by mood; fewer as the energy rises. */
const HOLD_P: Record<Mood, number> = { dreamy: 0.4, melancholic: 0.32, triumphant: 0.3, nostalgic: 0.28, dark: 0.25, happy: 0.2, tense: 0.15, angry: 0.15 };
/** Long holds at most per section (Paul: too many long runs). */
const HOLDS_MAX = 2;
/**
 * The section's energy, 0 to 1, from the song (Paul: "follow the song"): its energy level (1-5) and its
 * tension, with the mood's lean (angry, tense and triumphant push; dreamy and melancholic hold back).
 */
const MOOD_PUSH: Record<Mood, number> = { angry: 0.12, tense: 0.08, triumphant: 0.08, happy: 0.04, nostalgic: -0.04, dark: -0.02, melancholic: -0.08, dreamy: -0.12 };
/** Which accents high energy likes (bigger) and low energy likes (smaller): weight times 1 + x * (energy - 0.5) * 2. */
const FIG_ENERGY: Partial<Record<string, number>> = { reach: 0.6, climb: 0.5, twoup: 0.3, leap: 0.8, upback: -0.3, dip: -0.3, fall: -0.4, drop2: -0.2 };
/**
 * How a long held note moves (Paul: "more dynamic"): bent away to a step near the end (`away`), started a step
 * above on the accent and bent down onto it (`above`), scooped up from a step below (`scoop`), a fall off at
 * the very end (`fall`), sung again as new words on the same note (`again`), or simply held (`plain`).
 */
type Shape = 'away' | 'above' | 'scoop' | 'fall' | 'again' | 'plain';
const SHAPE_SAYS: Record<Shape, string> = { away: 'bent away to the next step', above: 'started a step above, bent down', scoop: 'scooped up from below', fall: 'falling off at the end', again: 'sung again on the same note', plain: 'held' };
const SHAPE_MOOD: Record<Mood, Partial<Record<Shape, number>>> = {
  melancholic: { fall: 1.6, above: 1.5, scoop: 0.5 }, dark: { fall: 1.5, above: 1.4, scoop: 0.6 },
  happy: { scoop: 1.5, away: 1.3 }, triumphant: { scoop: 1.6, away: 1.2, plain: 1.3 },
  angry: { again: 1.7, plain: 1.2, away: 0.6 }, tense: { again: 1.5, away: 1.2 },
  dreamy: { away: 1.7, fall: 1.2, again: 0.4 }, nostalgic: { above: 1.4, away: 1.2 },
};
/** By energy: high likes to scoop and sing again, low to fall off and bend away (weight times 1 + x * (energy - 0.5) * 2). */
const SHAPE_ENERGY: Record<Shape, number> = { scoop: 0.6, again: 0.7, plain: 0.2, away: -0.3, fall: -0.6, above: -0.1 };
/** How a 4-bar block is split into phrases (bars). */
const PLANS: [number[], number][] = [[[4], 0.35], [[2, 2], 0.45], [[1, 1, 2], 0.1], [[2, 1, 1], 0.1]];

/**
 * Hook (switch; Paul: the tune repeating itself, a hook): a section's phrases in a form, by mood. A letter's
 * rhythm comes back (on the anchor of its block, so a sequence when the anchor has moved); its accent comes back
 * when it ends the same way (open or settled), else a new one: the answer. A second round ends anew (C).
 */
const FORMS: Record<Mood, [string, number][]> = {
  happy: [['AABA', 0.5], ['ABAB', 0.35], ['AABB', 0.15]], triumphant: [['AABA', 0.5], ['ABAB', 0.3], ['AABB', 0.2]],
  melancholic: [['ABAB', 0.45], ['AABA', 0.4], ['AABB', 0.15]], nostalgic: [['ABAB', 0.45], ['AABA', 0.45], ['AABB', 0.1]],
  dreamy: [['ABAB', 0.5], ['AABA', 0.4], ['AABB', 0.1]], dark: [['AABA', 0.4], ['AABB', 0.35], ['ABAB', 0.25]],
  tense: [['AABB', 0.4], ['AABA', 0.4], ['ABAB', 0.2]], angry: [['AABB', 0.45], ['AABA', 0.4], ['ABAB', 0.15]],
};
/** The chorus's hook: its first phrase's accent leaning to the ones that stand out (open, reaching up). */
const HOOK_FIG: Partial<Record<string, number>> = { reach: 2.2, climb: 1.8, twoup: 1.6, leap: 2.5, home2: 1.3 };
/**
 * Less one-note (switch; Paul: "can sound like chanting"): the words on the main note decorated. A weak note
 * (off the beat) a step up (mostly) or down and back; the last word before the accent a step into it; a phrase
 * now and then coming in from a 3rd or 4th away (a leap into the main note); the strong last note now and then
 * sung a step above first, a clash with the chord, settling down onto a chord note. By mood.
 */
const NEIGHBOR_P = 0.4;
const LEAP_IN_P = 0.2;
const APPOG_P: Record<Mood, number> = { melancholic: 0.4, nostalgic: 0.4, dreamy: 0.35, dark: 0.3, tense: 0.3, happy: 0.2, triumphant: 0.2, angry: 0.12 };
/** Best of several (switch): how many lines are written; the best scoring one kept. */
const BEST_TRIES = 8;

export function writeAnchor(list: Idea[], moodIn: Mood | undefined, lean: Lean, salt = 0, range: GuideRange | null = null, tonality: GuideTonality | null = null, ideas: GuideIdeas = {}): GuideLine {
  if (!ideas.best) return writeOnce(list, moodIn, lean, salt, range, tonality, ideas, '');
  // Best of several: each try its own dice (the first the line as without the switch), the best scoring kept
  const tries = Array.from({ length: BEST_TRIES }, (_, k) => writeOnce(list, moodIn, lean, salt, range, tonality, ideas, k ? `-try${k}` : ''));
  const scores = tries.map((t) => scoreLine(list, t));
  let bi = 0;
  scores.forEach((s, k) => { if (s.total > scores[bi].total) bi = k; });
  const s = scores[bi], pc = (x: number) => `${Math.round(100 * x)}%`;
  const line = tries[bi];
  line.notes.splice(line.notes.length - 1, 0,
    `Best of ${BEST_TRIES}: kept try ${bi + 1} (score ${s.total.toFixed(2)}, the others ${scores.filter((_, k) => k !== bi).map((x) => x.total.toFixed(2)).join(', ')}): strong notes on the chord ${pc(s.fit)}, phrase ends on the chord ${pc(s.ends)}, easy steps ${pc(s.easy)}, bars repeating ${pc(s.repeat)}, words on the main note ${pc(s.same)}, the song's top ${s.topInChorus ? 'in a chorus' : 'not in a chorus'}`);
  return line;
}

/**
 * How good a line sounds, roughly (Best of several): strong notes on the chord, phrases ending on it, easy steps
 * (no big jumps without a pause, no tritones), some bars repeating (about half: memory, not a loop), not too
 * many words on one note (nor too few), each section's top note once or twice and not right at its start, the
 * choruses higher than the verses and the song's top in a chorus.
 */
export function scoreLine(list: Idea[], line: GuideLine) {
  let strong = 0, strongOk = 0, ends = 0, endsOk = 0, steps = 0, easy = 0, bars = 0, repeats = 0, shape = 0, shapes = 0, sameSum = 0, sameN = 0;
  let songTop = -1, topKind: SectionKind | undefined;
  const mean: Partial<Record<SectionKind, number[]>> = {};
  line.parts.forEach((p, si) => {
    if (!p.length) return;
    const { song, chords } = list[si];
    const kind = (list[si].section?.kind ?? 'verse') as SectionKind;
    const tonesAt = (g: number) => chordTones(song.key, chords.timeline[chords.chordIdx[Math.min(song.total - 1, Math.max(0, g))]].chord);
    const beatStarts = new Set(song.bars.flatMap((b) => groupStarts(b.groups).map((x) => b.start + x)));
    p.forEach((n, j) => {
      const next = p[j + 1], prev = p[j - 1];
      if (beatStarts.has(n.step) || n.len >= 4) { strong++; if (tonesAt(Math.max(0, n.step)).includes(n.midi % 12)) strongOk++; }
      if (!next || next.step - (n.step + n.len) >= 4) { ends++; if (tonesAt(Math.max(0, n.step)).includes(n.midi % 12)) endsOk++; }
      if (prev && n.step - (prev.step + prev.len) < 4) {
        steps++;
        const d = Math.abs(n.midi - prev.midi);
        easy += d === 6 || d > 7 ? 0 : d > 4 ? 0.6 : 1;
      }
      if (n.midi > songTop) { songTop = n.midi; topKind = kind; }
    });
    // (bars by their rhythm: the onsets inside the bar)
    const sig = song.bars.map((b) => p.filter((n) => n.step >= b.start && n.step < b.start + b.len).map((n) => n.step - b.start).join(','));
    const sung = sig.filter((x) => x);
    bars += sung.length;
    repeats += sung.length - new Set(sung).size;
    // (words on the most used note)
    const count = new Map<number, number>();
    for (const n of p) count.set(n.midi, (count.get(n.midi) ?? 0) + 1);
    sameSum += Math.max(...count.values()) / p.length;
    sameN++;
    // (the section's top: once or twice, not in its first part)
    const top = Math.max(...p.map((n) => n.midi));
    const tops = p.filter((n) => n.midi === top);
    shapes++;
    shape += (tops.length <= 2 ? 0.6 : 0.2) + (tops[0].step >= song.total * 0.2 ? 0.4 : 0);
    (mean[kind] ??= []).push(p.reduce((a, n) => a + n.midi, 0) / p.length);
  });
  const fit = strongOk / Math.max(1, strong), endFit = endsOk / Math.max(1, ends), easyR = easy / Math.max(1, steps);
  const repeat = repeats / Math.max(1, bars), same = sameSum / Math.max(1, sameN);
  const avg = (k: SectionKind) => (mean[k]?.length ? mean[k]!.reduce((a, b) => a + b, 0) / mean[k]!.length : null);
  const ch = avg('chorus'), vs = avg('verse');
  const topInChorus = topKind === 'chorus';
  const total = 2 * fit + 1.5 * endFit + 3 * easyR - 2 * Math.abs(repeat - 0.5) - 3 * Math.max(0, same - 0.7) - 2 * Math.max(0, 0.4 - same)
    + shape / Math.max(1, shapes) + (topInChorus ? 0.5 : 0) + (ch !== null && vs !== null && ch > vs ? 0.3 : 0);
  return { total, fit, ends: endFit, easy: easyR, repeat, same, topInChorus };
}

function writeOnce(list: Idea[], moodIn: Mood | undefined, lean: Lean, salt: number, range: GuideRange | null, tonality: GuideTonality | null, ideas: GuideIdeas, tag: string): GuideLine {
  const first = list[0];
  const mood = moodIn ?? autoMood(first.song, first.seeds.song);
  const genre = first.song.genre as Genre;
  const MID: [number, number] = range ? [range[0], Math.max(range[0] + 5, range[1] - 2)] : MID_AUTO;
  const PEAK = range ? range[1] : PEAK_AUTO;
  const tone = tonality && (tonality.key !== null || tonality.scale) ? tonality : null;
  const keyOf = (s: Idea['song']) => (tone?.key != null ? mod(s.key + tone.key - first.song.key, 12) : s.key);
  const scaleOf = (s: Idea['song']) => GUIDE_SCALES[tone?.scale ?? s.mode] as readonly number[];
  const rng = new Rng(`anchor-${first.seeds.song}-${mood}-${lean}-${salt}${tag}`);
  const stat2 = { forms: [] as string[], hooks: 0, back: 0, neighbors: 0, passing: 0, leapsIn: 0, appogs: 0 };
  // (where it sits out: the same dice as the guide line, so the same sections)
  const srng = new Rng(`guide-silent-${first.seeds.song}-${salt}`);
  const silent = list.map((i) => {
    const pc = i.section ? PLAY_CHANCE[i.section.kind] : undefined;
    return pc !== undefined && !srng.chance(pc);
  });
  const lastSung = silent.lastIndexOf(false);
  // (Slow line: a shape under each kind of section that the anchors follow, by mood, now and then the genre's lean; its own dice)
  const sprng = new Rng(`anchor-spine-${first.seeds.song}-${mood}-${salt}`);
  const spineOf = new Map<SectionKind, Spine>();
  const spineFor = (kind: SectionKind): Spine | null => {
    if (!ideas.spine || !SPINE_BY[kind]) return null;
    if (!spineOf.has(kind)) {
      const by = SPINE_BY[kind]!, gl = SPINE_GENRE[first.song.genre]?.[kind];
      const sp = gl && sprng.chance(0.5) ? gl : by[mood] ?? by.all;
      // (the anchor already stays on one note: "around one note" would change nothing, so a clear shape instead)
      spineOf.set(kind, sp === 'drone' ? (mood === 'tense' ? 'rise' : 'drop') : sp);
    }
    return spineOf.get(kind)!;
  };
  // (the rhythm style: Auto, the genre's cells, the shared ones and a little of the styles that suit it; or one style's)
  const style = ideas.rhythm ?? 'auto';
  const pool: [Beat[], number][] = style === 'auto'
    ? [...(CELLS[genre] ?? CELLS.pop).map((c) => [c, 1] as [Beat[], number]), ...SHARED.map((c) => [c, 0.6] as [Beat[], number]),
      ...(GENRE_STYLES[genre] ?? []).flatMap((st) => STYLES[st].map((c) => [c, 0.35] as [Beat[], number]))]
    : STYLES[style].map((c) => [c, 1] as [Beat[], number]);
  // (each kind of section its own pace: choruses busier, pre-choruses driving, verses a little sparer)
  const KIND_BUSY: Partial<Record<SectionKind, number>> = { chorus: 0.1, prechorus: 0.06, verse: -0.05, bridge: -0.03, outro: -0.05 };
  const stat = { phrases: 0, holds: 0, bends: 0, merged: 0, figs: new Map<string, number>(), anchors: [] as string[], beats: 0, notes: 0, strongFin: 0, strongTone: 0, repeats: 0, shapes: new Map<Shape, number>(), energy: [] as string[] };
  const firstOf = new Map<string, { degs: { step: number; len: number; deg: number; bend?: number; acc: boolean }[]; total: number; bars: number }>();
  const parts: GuideNote[][] = [];
  const roles = new Map<GuideNote, 'cell' | 'acc'>();
  /** Each section's scale-note to MIDI (for the pickups added afterwards). */
  const midiOfs: ((x: number) => number)[] = [];
  let prevAnchor: number | null = null;

  list.forEach((idea, si) => {
    const { song, chords } = idea;
    if (silent[si]) { parts.push([]); prevAnchor = null; return; }
    const home = homeMidi(keyOf(song), MID[0]);
    const scale = scaleOf(song);
    const midiOf = (x: number) => home + 12 * Math.floor(x / 7) + scale[mod(x, 7)];
    midiOfs[si] = midiOf;
    const tonesAt = (g: number) => chordTones(song.key, chords.timeline[chords.chordIdx[Math.min(song.total - 1, Math.max(0, g))]].chord);
    const kind = (idea.section?.kind ?? 'verse') as SectionKind;
    const tension = (bar: number) => idea.section?.tension?.[bar] ?? 0.5;
    const top = (bar: number) => (tension(bar) >= PEAK_T ? PEAK : MID[1]);
    const fits = (x: number, bar: number) => midiOf(x) >= MID[0] && midiOf(x) <= top(bar);
    const out: GuideNote[] = [];
    const lastSection = si === lastSung;
    // (the section's energy, 0-1: its level and tension, the mood's lean)
    const level = ((idea.section?.energy ?? 3) - 1) / 4;
    const energyAt = (bar: number) => Math.max(0, Math.min(1, 0.6 * level + 0.4 * tension(bar) + MOOD_PUSH[mood]));
    const longFins = new Set<GuideNote>();
    let holdsLeft = HOLDS_MAX + (kind === 'chorus' ? 1 : 0);
    stat.beats += song.bars.reduce((n, b) => n + b.groups.length, 0);

    // a verse, pre-chorus or chorus sung before: its notes again (in this section's key)
    const again = REPEATS.includes(kind) ? firstOf.get(kind) : undefined;
    if (again && again.total === song.total && again.bars === song.bars.length) {
      const sh = [0, -7, 7].find((s) => again.degs.every((n) => midiOf(n.deg + s) >= MID[0] && midiOf(n.deg + s) <= PEAK)) ?? 0;
      for (const n of again.degs) {
        const note: GuideNote = { step: n.step, len: n.len, midi: midiOf(n.deg + sh), deg: n.deg + sh, ...(n.bend ? { bend: n.bend } : {}) };
        out.push(note);
        roles.set(note, n.acc ? 'acc' : 'cell');
      }
      stat.repeats++;
      prevAnchor = null;
    } else {
      // the beats, bar by bar
      const beats = song.bars.flatMap((b, bi) => {
        const starts = groupStarts(b.groups);
        const mid = starts.reduce((x, p) => (Math.abs(p - b.len / 2) < Math.abs(x - b.len / 2) ? p : x), starts[0]);
        return starts.map((p, k) => ({ step: b.start + p, len: b.groups[k], bar: bi, first: p === 0, strong: p === 0 || (p === mid && starts.length > 2) }));
      });
      const barLen = song.bars[0].len;
      const short = song.bars[0].groups.length <= 3;
      // (the section's height in the voice, as a scale note: by its kind and the tension)
      const heightD = (bar: number) => {
        let h = (HEIGHT[kind] ?? 0.4) + (tension(bar) - 0.5) * 0.4;
        if (kind === 'prechorus') h += 0.3 * (bar / Math.max(1, song.bars.length - 1));
        const m = MID[0] + Math.max(0, Math.min(1, h)) * (MID[1] - MID[0]);
        let best = 0;
        for (let x = -35; x <= 42; x++) if (Math.abs(midiOf(x) - m) < Math.abs(midiOf(best) - m)) best = x;
        return best;
      };
      /** Slow line: the shape's note at a bar (the section's height, moved by its shape there). */
      const spineAt = (bar: number) => {
        const sp = spineFor(kind);
        return heightD(bar) + (sp ? Math.round(SPINE_DEPTH * SPINES[sp].f(bar / Math.max(1, song.bars.length - 1))) : 0);
      };
      const push = (step: number, len: number, deg: number, role: 'cell' | 'acc') => {
        if (len <= 0) return;
        const note: GuideNote = { step, len, midi: midiOf(deg), deg };
        out.push(note);
        roles.set(note, role);
      };
      // Hook: the section's form (its own dice), each letter's rhythm and accents as first sung
      const hrng = new Rng(`anchor-hook-${first.seeds.song}-${mood}-${salt}${tag}-${si}`);
      const form = ideas.hook ? hrng.weighted(FORMS[mood]) : '';
      if (ideas.hook) stat2.forms.push(`${idea.section?.label ?? kind} ${form.split('').join(' ')}`);
      type Recipe = { cell: Beat[]; varied: Beat[]; r: number; long: boolean; twoBars: boolean; h: number };
      const recipes = new Map<string, Recipe>();
      const figsOf = new Map<string, [Fig, Brk]>();
      let pIdx = 0;
      const beatSet = new Set(beats.map((x) => x.step));
      // block by block (4 bars, the anchor each), phrase by phrase
      for (let b0 = 0; b0 < song.bars.length; b0 += 4) {
        const nBars = Math.min(4, song.bars.length - b0);
        const lastBlock = b0 + 4 >= song.bars.length;
        const songEnd = lastSection && lastBlock;
        // the anchor: near the section's height, a chord note through the block (leaning in), moving from the last
        // (Slow line: the section's shape moves the height, by where the block sits in the section)
        const spine = spineFor(kind);
        const lift = spine ? Math.round(SPINE_DEPTH * SPINES[spine].f(b0 / Math.max(1, song.bars.length - nBars))) : 0;
        const target = songEnd ? Math.round((heightD(b0) + 0) / 2) : heightD(b0) + lift;
        const blockSteps = [song.bars[b0].start, song.bars[b0 + nBars - 1].start + song.bars[b0 + nBars - 1].len];
        const chordFit = (x: number) => {
          let n = 0, k = 0;
          for (let g = blockSteps[0]; g < blockSteps[1]; g += 4) { k++; if (tonesAt(g).includes(mod(midiOf(x), 12))) n++; }
          return n / Math.max(1, k);
        };
        const cands: number[] = [];
        for (let x = target - 4; x <= target + 4; x++) {
          if (!fits(x, b0) || !fits(x + 1, b0) || !fits(x - 1, b0)) continue;
          if (prevAnchor !== null) { const dx = Math.abs(x - prevAnchor); if (dx < 1 || dx > 2) continue; }
          cands.push(x);
        }
        if (!cands.length) for (let x = target - 4; x <= target + 4; x++) if (fits(x, b0)) cands.push(x);
        if (!cands.length) cands.push(target);
        let anchor = cands[0], best = -Infinity;
        for (const x of cands) {
          const sc = -(spine ? 1.1 : 0.5) * Math.abs(x - target) + (lean === 'in' ? 1.5 * chordFit(x) : 0) + rng.next() * 0.6;
          if (sc > best) { best = sc; anchor = x; }
        }
        prevAnchor = anchor;
        stat.anchors.push(`${idea.section?.label ?? kind} ${b0 + 1}: ${noteName(midiOf(anchor))}`);
        // the phrases of the block (6/8 and 7/8, with fewer beats a bar: 2 or 4 bars)
        let plan = nBars === 4 ? rng.weighted(short ? [[[4], 0.65], [[2, 2], 0.35]] as [number[], number][] : PLANS) : nBars === 3 ? (short ? [3] : rng.pick([[3], [2, 1]])) : nBars === 2 ? (short ? [2] : rng.pick([[2], [1, 1], [2]])) : [1];
        plan = [...plan];
        // (Hook: even 2-bar phrases, so a phrase can come back as it was)
        if (ideas.hook && nBars === 4 && !short) plan = [2, 2];
        // the block's rhythm cell (now and then its own for a phrase), as busy as the energy: more words when it's up
        const E = energyAt(b0);
        if (b0 === 0 && !again) stat.energy.push(`${idea.section?.label ?? kind} ${E < 0.35 ? 'low' : E < 0.65 ? 'mid' : 'high'}`);
        const want = 0.35 + 1.0 * E + (KIND_BUSY[kind] ?? 0);
        // (a chosen style: the energy steers less, so the style is heard)
        const pickCell = () => rng.weighted(pool.map(([c, w]) => [c, w * Math.exp(-(style === 'auto' ? 3 : 1.5) * Math.abs(busy(c) - want))] as [Beat[], number]));
        const blockCell = pickCell();
        let pb = b0;
        plan.forEach((pBars, pi) => {
          const lastPhrase = pi === plan.length - 1;
          const settle = lastPhrase;
          const ending = songEnd && lastPhrase;
          // (Hook: the phrase's letter in the form; a second round ends anew)
          const letter = ideas.hook ? (pIdx >= form.length && pIdx % form.length === form.length - 1 ? 'C' : form[pIdx % form.length]) : '';
          pIdx++;
          const rec = ideas.hook ? recipes.get(letter) : undefined;
          let cell: Beat[], varied: Beat[];
          if (rec) { stat2.back++; cell = rec.cell; varied = rec.varied; }
          else {
            cell = rng.chance(0.25) ? pickCell() : blockCell;
            // (fast songs: fewer notes in a beat)
            if (song.bpm > 125) cell = cell.map((x) => (PLAINER[x] && (x === 'run' || x === 'four' || rng.chance(0.6)) ? PLAINER[x]! : (x === 'two' || x === 'and') && rng.chance(0.5) ? 'one' : x));
            // (long beats (6/8, 7/8): now and then two words in one)
            else if (short) cell = cell.map((x) => (x === 'one' && rng.chance(0.5) ? 'two' : x));
            // (the energy: fewer words in a beat when it's low, more when it's high)
            if (E < 0.45) cell = cell.map((x) => (PLAINER[x] && rng.chance((0.45 - E) * 2) ? PLAINER[x]! : x)).map((x) => ((x === 'two' || x === 'dot' || x === 'snap' || x === 'and') && rng.chance((0.45 - E) * 2) ? 'one' : x));
            // (the cell's repeats now and then a variation: one beat swapped for a near relation, Paul: more rhythms)
            varied = cell.slice();
            if (rng.chance(0.55)) {
              const at = cell.map((x, i) => (VARY[x] ? i : -1)).filter((i) => i >= 0);
              for (let v = 0; v < (at.length > 3 && rng.chance(0.3) ? 2 : 1) && at.length; v++) {
                const i = at.splice(rng.int(0, at.length - 1), 1)[0];
                const opts = VARY[cell[i]]!.filter((x) => !(song.bpm > 125 && PLAINER[x]));
                if (opts.length) varied[i] = rng.pick(opts);
              }
            }
            else if (E > 0.65 && song.bpm <= 125) cell = cell.map((x) => (x === 'one' && rng.chance((E - 0.65) * 1.5) ? 'two' : x));
          }
          const pbeats = beats.filter((x) => x.bar >= pb && x.bar < pb + pBars);
          const nb = pbeats.length;
          pb += pBars;
          if (nb < 2) return;
          stat.phrases++;
          // the rest at the end (sparse: verses rest longer), and the last note: a beat or two, or held long
          const quiet = kind === 'verse' || kind === 'bridge' || kind === 'outro';
          const r = Math.max(1, Math.min(rec ? rec.r : rng.int(E < 0.35 ? 2 : 1, quiet || E < 0.35 ? 3 : E > 0.7 ? 1 : 2), Math.floor(nb / 4)));
          // (held long, now and then, fewer as the energy rises and only a few a section: half a bar to a bar;
          // two bars only to close a chorus or the song)
          const perBar = nb / pBars;
          const long = rec ? rec.long && pBars >= 2 && holdsLeft > 0 : pBars >= 2 && holdsLeft > 0 && rng.chance(HOLD_P[mood] * (1.3 - 0.8 * E) + (kind === 'chorus' ? 0.1 : 0) + (lastPhrase ? 0.05 : 0));
          const closing = lastPhrase && lastBlock && (kind === 'chorus' || songEnd);
          const twoBars = rec ? rec.twoBars && long && pBars >= 4 && closing : long && pBars >= 4 && closing && rng.chance(0.5);
          if (long) holdsLeft--;
          let h = rec ? (long ? rec.h : Math.min(2, rec.h)) : long ? Math.round(perBar * (twoBars ? 2 : rng.pick([0.5, 0.75, 1]))) : rng.int(1, 2);
          if (ideas.hook && !rec) recipes.set(letter, { cell, varied, r, long, twoBars, h });
          h = Math.max(1, Math.min(nb - r - 2, h));
          // (the last note on a strong beat)
          let f = nb - r - h;
          while (f > 1 && !pbeats[f].strong) f--;
          if (f < 1) f = Math.max(1, nb - r - 1);
          // (no more than 2 bars long; more rest after)
          let finLen = pbeats.slice(f, nb - r).reduce((n, x) => n + x.len, 0);
          finLen = Math.min(finLen, (twoBars ? ANCHOR_HOLD_BARS : 1) * barLen);
          if (finLen >= barLen) stat.holds++;
          // the accent: a figure in the voice, its last note on a chord note (leaning in), the mood's choice
          const finStep = pbeats[f].step;
          const ok = FIGS.filter((g) => (ending ? g.settle && !g.leap : true) && (!g.leap || (['chorus', 'prechorus', 'bridge'].includes(kind) && !settle))
            && [...g.pre, g.fin].every((x) => fits(anchor + x, pbeats[f].bar)));
          // (Hook: the letter's accent again when it ends the same way and still fits; the chorus's first its hook)
          const figKey = `${letter}-${settle}`;
          const figBack = ideas.hook ? figsOf.get(figKey) : undefined;
          const hookHere = ideas.hook && kind === 'chorus' && letter === 'A' && !settle && !figBack;
          if (hookHere) stat2.hooks++;
          const fig = figBack && ok.includes(figBack[0]) ? figBack[0] : rng.weighted((ok.length ? ok : [FIGS[0]]).map((g) => {
            let w = (FIG_MOOD[mood][g.id] ?? 1) * (g.leap ? 0.25 : 1) * Math.max(0.15, 1 + (FIG_ENERGY[g.id] ?? 0) * (E - 0.5) * 2);
            if (hookHere) w *= HOOK_FIG[g.id] ?? 1;
            w *= settle === g.settle ? 1.6 : 0.6;
            if (lean === 'in') w *= tonesAt(finStep).includes(mod(midiOf(anchor + g.fin), 12)) ? 2.5 : 0.5;
            // (Slow line: the phrase's last note leans to the shape's note there too)
            if (spine && !ending) w *= Math.exp(-0.8 * Math.abs(anchor + g.fin - spineAt(pbeats[f].bar)));
            return [g, w] as [Fig, number];
          }));
          stat.figs.set(fig.says, (stat.figs.get(fig.says) ?? 0) + 1);
          let finDeg = anchor + fig.fin;
          // (the song's last note: home)
          if (ending) {
            const homes = [-14, -7, 0, 7, 14, 21].filter((x) => fits(x, pbeats[f].bar));
            finDeg = homes.reduce((bst, x) => (Math.abs(x - anchor) < Math.abs(bst - anchor) ? x : bst), homes[0] ?? 0);
          }
          // the break: its beats before the last note
          const brk: Brk = fig.leap ? 'even' : figBack && figBack[0] === fig ? figBack[1] : rng.weighted(BREAKS);
          if (ideas.hook && !figsOf.has(figKey)) figsOf.set(figKey, [fig, brk]);
          // (as many of its notes as there's room for before the last one)
          // (and the pattern first, at least about half the phrase: Paul's "most of the words on that note")
          const room = Math.max(0, f - Math.ceil((f + h) * 0.45));
          const pre = fig.leap ? [] : fig.pre.slice(Math.max(0, fig.pre.length - (brk === 'quick' ? 2 * room : room)));
          const k = pre.length;
          const preBeats = fig.leap ? 1 : brk === 'quick' ? Math.ceil(k / 2) : k;
          const cellEnd = Math.max(0, f - preBeats);
          // the cell, repeated from the phrase's start up to the break (all on the anchor)
          const p0 = out.length;
          for (let j = 0; j < cellEnd; j++) {
            const bt = pbeats[j], rep = Math.floor(j / cell.length), kindB = (rep % 2 ? varied : cell)[j % cell.length], L = bt.len;
            const last = out[out.length - 1];
            if (kindB === 'tie') { if (last && last.step + last.len === bt.step && last.len + L <= barLen) last.len += L; }
            else if (kindB !== 'rest') for (const [o, l] of BEAT_NOTES[kindB](L)) push(bt.step + o, l, anchor, 'cell');
          }
          const a0 = out.length;
          // the accent notes, in the broken rhythm
          if (!fig.leap) {
            if (brk === 'quick') {
              for (let q = 0; q < k; q++) {
                const bt = pbeats[cellEnd + Math.floor(q / 2)];
                const two = q % 2 === 0 && q + 1 < k;
                const a = bt.len >= 6 ? bt.len - 2 : bt.len / 2;
                if (q % 2 === 0) push(bt.step, two ? a : bt.len, anchor + pre[q], 'acc');
                else push(bt.step + a, bt.len - a, anchor + pre[q], 'acc');
              }
            } else for (let q = 0; q < k; q++) { const bt = pbeats[cellEnd + q]; push(bt.step, bt.len, anchor + pre[q], 'acc'); }
          }
          // the strong last note (pushed an 8th early, now and then: into the beat before's last 8th)
          let at = finStep, len = finLen;
          const before = out[out.length - 1];
          if (brk === 'push' && before && before.step + before.len === at && before.len >= 4 && len + 2 <= ANCHOR_HOLD_BARS * barLen) { before.len -= 2; at -= 2; len += 2; }
          // Less one-note: the phrase's own dice (a phrase that comes back, its letter's: decorated alike)
          const crng = ideas.color ? new Rng(`anchor-color-${first.seeds.song}-${mood}-${salt}${tag}-${si}-${ideas.hook ? letter : `${b0}-${pi}`}`) : null;
          // (the strong last note now and then a step above first, a clash with the chord, settling down onto it)
          const fm = mod(midiOf(finDeg), 12), am = mod(midiOf(finDeg + 1), 12);
          if (crng && !long && !ending && len >= 4 && crng.chance(APPOG_P[mood]) && tonesAt(at).includes(fm) && !tonesAt(at).includes(am)
            && fits(finDeg + 1, pbeats[f].bar) && out[out.length - 1]?.deg !== finDeg + 1) {
            const a = len >= 8 ? 4 : 2;
            push(at, a, finDeg + 1, 'acc');
            push(at + a, len - a, finDeg, 'acc');
            stat2.appogs++;
          } else push(at, len, finDeg, 'acc');
          if (long && !ending) longFins.add(out[out.length - 1]);
          // (the words on the main note: a weak one a step up or down and back, the last a step into the accent,
          // now and then a leap into the phrase from a 3rd or 4th away)
          if (crng) {
            const C = out.slice(p0, a0);
            const next = out[a0];
            const pN = NEIGHBOR_P + 0.15 * E;
            let skip = false;
            C.forEach((n, i) => {
              if (n.deg !== anchor) return;
              const set = (d: number) => { if (fits(d, pbeats[0].bar)) { n.deg = d; n.midi = midiOf(d); return true; } return false; };
              const after = C[i + 1] ?? next;
              if (i === 0 && C.length >= 3 && crng.chance(LEAP_IN_P + (kind === 'chorus' || kind === 'prechorus' ? 0.1 : 0))) {
                if (set(anchor + crng.weighted<number>([[-3, 0.35], [-2, 0.25], [2, 0.2], [3, 0.2]]))) { stat2.leapsIn++; skip = true; return; }
              }
              if (i === C.length - 1 && next && Math.abs(next.deg - anchor) === 2 && next.step === n.step + n.len && crng.chance(0.6)) {
                if (set(anchor + Math.sign(next.deg - anchor))) { stat2.passing++; return; }
              }
              if (skip) { skip = false; return; }
              if (i > 0 && !beatSet.has(n.step) && after && after.deg === anchor && C[i - 1].deg === anchor && crng.chance(pN)) {
                if (set(anchor + (crng.chance(0.65) ? 1 : -1))) { stat2.neighbors++; skip = true; }
              }
            });
          }
        });
      }
      // bends into the accents, now and then (into a step: a half or whole step, straight on)
      out.forEach((n, j) => {
        const p = out[j - 1];
        if (!p || roles.get(n) !== 'acc' || p.step + p.len !== n.step || n.len < 4) return;
        const dm = Math.abs(n.midi - p.midi);
        if (dm < 1 || dm > 2) return;
        const fin = !out[j + 1] || out[j + 1].step > n.step + n.len;
        if (!rng.chance(BEND_P[mood] * (fin ? 1.3 : 1))) return;
        const opts = [2, 4, 8].filter((x) => x <= n.len / 2);
        if (!opts.length) return;
        n.bend = rng.pick(opts);
      });
      // the long notes move (Paul: "more dynamic"): bent away, started above, scooped, falling off, sung again, or held
      for (const n of longFins) {
        const j = out.indexOf(n);
        if (j < 0 || n.len < 8) continue;
        const bar = song.bars.findIndex((b) => b.start + b.len > n.step);
        const E = energyAt(Math.max(0, bar));
        const near = (dd: number) => {
          const m = midiOf(n.deg + dd);
          return Math.abs(m - n.midi) >= 1 && Math.abs(m - n.midi) <= 2 && m >= MID[0] && m <= PEAK;
        };
        const nextN = out[j + 1];
        const awayDir = nextN && nextN.midi !== n.midi ? Math.sign(nextN.midi - n.midi) : -1;
        const can: Record<Shape, boolean> = { away: near(awayDir), above: !n.bend && near(1), scoop: !n.bend && near(-1), fall: near(-1), again: true, plain: true };
        const shape = rng.weighted((Object.keys(can) as Shape[]).filter((x) => can[x])
          .map((x) => [x, (SHAPE_MOOD[mood][x] ?? 1) * (x === 'plain' ? 0.6 : 1) * Math.max(0.15, 1 + SHAPE_ENERGY[x] * (E - 0.5) * 2)] as [Shape, number]));
        stat.shapes.set(shape, (stat.shapes.get(shape) ?? 0) + 1);
        const piece = (step: number, len: number, deg: number, bend?: number): GuideNote => {
          const x: GuideNote = { step, len, midi: midiOf(deg), deg, ...(bend ? { bend } : {}) };
          roles.set(x, 'acc');
          return x;
        };
        if (shape === 'away' || shape === 'fall') {
          // (the end bent a step: toward the next note, or falling off, over its last quarter or half bar)
          const b = shape === 'fall' ? 4 : n.len >= 16 && rng.chance(0.5) ? 8 : 4;
          const dd = shape === 'fall' ? -1 : awayDir;
          n.len -= b;
          out.splice(j + 1, 0, piece(n.step + n.len, b, n.deg + dd, b === 8 && rng.chance(0.5) ? 4 : 2));
        } else if (shape === 'above' || shape === 'scoop') {
          // (the accent's own note a step above (or below) first, then bent onto it)
          const a = n.len >= 12 && rng.chance(0.5) ? 4 : 2;
          const dd = shape === 'above' ? 1 : -1;
          out.splice(j, 1, piece(n.step, a, n.deg + dd), piece(n.step + a, n.len - a, n.deg, (n.len - a) >= 8 && rng.chance(0.4) ? 4 : 2));
        } else if (shape === 'again') {
          // (new words on the same note, on the beats)
          const parts2 = n.len >= 16 && rng.chance(0.5) ? 3 : 2;
          const unit = Math.max(4, 4 * Math.round(n.len / parts2 / 4));
          const xs: GuideNote[] = [];
          for (let at = 0; at < n.len; at += unit) xs.push(piece(n.step + at, Math.min(unit, n.len - at), n.deg, at === 0 ? n.bend : undefined));
          if (xs.length > 1 && xs[xs.length - 1].len < 2) { xs[xs.length - 2].len += xs[xs.length - 1].len; xs.pop(); }
          out.splice(j, 1, ...xs);
        }
      }
      if (REPEATS.includes(kind) && !firstOf.has(kind)) firstOf.set(kind, { degs: out.map((n) => ({ step: n.step, len: n.len, deg: n.deg, ...(n.bend ? { bend: n.bend } : {}), acc: roles.get(n) === 'acc' })), total: song.total, bars: song.bars.length });
    }
    // the song's last note: home
    if (lastSection && out.length) {
      const n = out[out.length - 1];
      if (mod(n.deg, 7) !== 0) {
        const homes = [-14, -7, 0, 7, 14, 21].filter((x) => midiOf(x) >= MID[0] && midiOf(x) <= PEAK);
        const to = homes.reduce((b, x) => (Math.abs(x - n.deg) < Math.abs(b - n.deg) ? x : b), homes[0] ?? 0);
        n.deg = to; n.midi = midiOf(to);
      }
    }
    // (a bend only into a step, straight on)
    out.forEach((n, j) => {
      const p = out[j - 1];
      if (n.bend && (!p || p.step + p.len !== n.step || Math.abs(n.midi - p.midi) > 2 || n.midi === p.midi)) delete n.bend;
    });
    parts.push(out);
  });

  // Breaths and Lead-ins (switches; each its own dice, so the line elsewhere stays put)
  const nb = { before: 0, tired: 0, beats: 0, leadIns: 0, pickups: 0 };
  if (ideas.breath || ideas.leadIn) {
    const brng = new Rng(`anchor-breath-${first.seeds.song}-${mood}-${salt}`);
    const lrng = new Rng(`anchor-leadin-${first.seeds.song}-${mood}-${salt}`);
    /** Shortened by `by` steps, if it keeps at least a beat (and room for its bend). */
    const cut = (n: GuideNote, by: number) => {
      if (by <= 0) return true;
      if (n.len - by < Math.max(4, 2 * (n.bend ?? 0))) return false;
      n.len -= by;
      return true;
    };
    /** How tiring a stretch is, in bars (high notes count more): sung time since the last silence of 2 beats or more. */
    const effortTo = (p: GuideNote[], j: number, bar: number) => {
      let e = 0;
      for (let k = j; k >= 0; k--) {
        e += (p[k].len / bar) * (1 + Math.max(0, p[k].midi - 57) / 5);
        if (k > 0 && p[k].step - (p[k - 1].step + p[k - 1].len) >= 8) break;
      }
      return e;
    };
    parts.forEach((p, si) => {
      if (!p.length) return;
      const song = list[si].song, bar = song.bars[0].len, kind = list[si].section?.kind ?? 'verse';
      // Breaths after a tiring stretch, inside the section: the rest before the next phrase made longer
      if (ideas.breath) for (let j = 1; j < p.length; j++) {
        const gap = p[j].step - (p[j - 1].step + p[j - 1].len);
        if (gap < 4 || gap >= 16 || effortTo(p, j - 1, bar) < TIRED_IN || !brng.chance(0.8)) continue;
        const by = 4 * brng.int(1, 2);
        if (cut(p[j - 1], by)) { nb.tired++; nb.beats += by / 4; }
      }
      // Lead-ins inside the section: a phrase comes in early, its first note held into it (an 8th or a beat), or a
      // quick pickup word an 8th before it (a step below, or on it); a beat's silence kept before (an 8th's before a pickup)
      if (ideas.leadIn) for (let j = 1; j < p.length; j++) {
        const n = p[j], before = p[j - 1];
        const gap = n.step - (before.step + before.len);
        if (gap < 4 || n.bend || n.step % 2 !== 0 || !lrng.chance(PICKUP_P)) continue;
        if (gap >= 6 && lrng.chance(0.5)) {
          const L = gap >= 8 && lrng.chance(0.5) ? 4 : 2;
          if (n.len + L > ANCHOR_HOLD_BARS * bar) continue;
          n.step -= L; n.len += L;
        } else {
          const midiOf = midiOfs[si];
          const deg = midiOf(n.deg - 1) >= MID[0] && lrng.chance(0.6) ? n.deg - 1 : n.deg;
          const x: GuideNote = { step: n.step - 2, len: 2, midi: midiOf(deg), deg };
          roles.set(x, 'cell');
          p.splice(j, 0, x);
          j++;
        }
        nb.pickups++;
      }
      const prevP = si > 0 ? parts[si - 1] : undefined, prevIdea = list[si - 1];
      const pLast = prevP?.[prevP.length - 1];
      // the gap (steps) between the section before's last note and this one's first
      const gapIn = () => (pLast && prevIdea ? prevIdea.song.total - (pLast.step + pLast.len) + p[0].step : Infinity);
      // Breaths before a big section (a chorus, or one sung higher), or after a tiring stretch: a silence of 1-4 beats
      if (ideas.breath && pLast && prevIdea) {
        const big = kind === 'chorus' || (HEIGHT[kind as SectionKind] ?? 0.4) - (HEIGHT[prevIdea.section?.kind ?? 'verse'] ?? 0.4) >= 0.25;
        const tired = effortTo(prevP!, prevP!.length - 1, prevIdea.song.bars[0].len) >= TIRED;
        if (brng.chance((big ? 0.55 : 0.1) + (tired ? 0.3 : 0))) {
          const want = 4 * brng.int(1, big && tired ? 4 : 3);
          const by = want - gapIn();
          if (by > 0 && cut(pLast, by)) { nb.before++; nb.beats += by / 4; }
        }
      }
      // Lead-ins: the section's first note comes in early (an 8th, a beat or two), held into it, a beat's breath before it
      const f = p[0];
      if (ideas.leadIn && si > 0 && f.step < 4 && !f.bend && lrng.chance(LEAD_IN_P)) {
        let r = lrng.next();
        const L = (LEAD_INS.find(([, w]) => (r -= w) <= 0) ?? LEAD_INS[0])[0];
        const prevBar = prevIdea?.song.bars[prevIdea.song.bars.length - 1].len ?? bar;
        const need = L + f.step + 4 - gapIn();
        if (L < prevBar && f.len + f.step + L <= ANCHOR_HOLD_BARS * bar && (!pLast || need <= 0 || cut(pLast, need))) {
          f.len += f.step + L; f.step = -L;
          nb.leadIns++;
        }
      }
    });
  }

  // a cap (Paul's): at most 4 new sounds in any second; in a busy spot the anchor notes are tied together
  // (the one before held on), keeping the accents
  {
    let t0 = 0;
    const kept: number[] = [];
    parts.forEach((p, si) => {
      const sec = 15 / list[si].song.bpm;
      for (let j = 0; j < p.length; j++) {
        const n = p[j], t = t0 + n.step * sec;
        const busy = () => kept.length >= MAX_PER_SECOND && t - kept[kept.length - MAX_PER_SECOND] < 1 - 1e-6;
        if (busy()) {
          // (an anchor note in the window tied into the one before it)
          for (let c = j - 1; c > 0 && busy(); c--) {
            const cn = p[c], pn = p[c - 1];
            if (t - (t0 + cn.step * sec) >= 1) break;
            if (roles.get(cn) !== 'cell' || pn.step + pn.len !== cn.step || pn.midi !== cn.midi || p[c + 1]?.bend || pn.len + cn.len > list[si].song.bars[0].len) continue;
            pn.len += cn.len;
            p.splice(c, 1);
            j--;
            const ti = kept.lastIndexOf(t0 + cn.step * sec);
            if (ti >= 0) kept.splice(ti, 1);
            stat.merged++;
          }
        }
        if (busy()) {
          // (still busy: this one tied into the one before, or left out)
          const pn = p[j - 1];
          if (pn && pn.step + pn.len === n.step && pn.len + n.len <= ANCHOR_HOLD_BARS * list[si].song.bars[0].len && (pn.midi === n.midi || roles.get(n) === 'cell') && !p[j + 1]?.bend) pn.len += n.len;
          p.splice(j, 1);
          j--;
          stat.merged++;
          continue;
        }
        kept.push(t);
      }
      t0 += list[si].song.total * sec;
    });
    // (bends checked again after ties)
    for (const p of parts) p.forEach((n, j) => {
      const q = p[j - 1];
      if (n.bend && (!q || q.step + q.len !== n.step || Math.abs(n.midi - q.midi) > 2 || n.midi === q.midi)) delete n.bend;
    });
  }

  for (const p of parts) for (const n of p) {
    stat.notes++;
    if (n.bend) stat.bends++;
  }
  const lo = Math.min(...parts.flat().map((n) => n.midi)), hi = Math.max(...parts.flat().map((n) => n.midi));
  const figs = [...stat.figs].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ');
  const k0 = keyOf(first.song), sc0 = tone?.scale ?? first.song.mode;
  const notes = [
    `Anchor line: one strong note every 4 bars, most words sung on it in a ${genre} rhythm pattern, broken by an accent near it, then a rest`,
    `Mood: ${MOOD_LABEL[mood]}${moodIn ? '' : ' (auto)'}`,
    stat.notes ? `Range ${noteName(lo)} to ${noteName(hi)}; key ${NAMES[k0]} ${SCALE_LABEL[sc0].toLowerCase()}; ends on home` : 'No notes: the line sits out here',
    `Anchors: ${stat.anchors.join('; ') || 'none'}`,
    `${stat.phrases} phrases; accents: ${figs || 'none'}`,
    `Energy, following the song: ${stat.energy.join(', ')} (low: fewer words, longer rests, small accents, long notes falling off; high: more words, bigger accents, long notes scooped or sung again)`,
    `${stat.holds} last notes held a bar or more (at most ${HOLDS_MAX} long ones a section, ${HOLDS_MAX + 1} in a chorus; two bars only to close a chorus or the song); ${stat.bends} bends`,
    `Long notes: ${[...stat.shapes].sort((a, b) => b[1] - a[1]).map(([x, n]) => `${SHAPE_SAYS[x]} ${n}`).join(', ') || 'none'}`,
    `${stat.notes} notes (a word each), ${(stat.notes / Math.max(1, stat.beats)).toFixed(2)} a beat; ${stat.repeats} sections sung like the first verse, pre-chorus or chorus`,
    `Busy spots: at most ${MAX_PER_SECOND} new sounds in any second (${stat.merged} anchor notes tied into the one before)`,
    `Sits out: ${list.map((i, si) => (silent[si] ? i.section?.label ?? '' : '')).filter(Boolean).join(', ') || 'nothing'}`,
    ...(ideas.spine ? [`Slow line: the anchors follow ${[...spineOf].map(([k, sp]) => `the ${k === 'prechorus' ? 'pre-chorus' : k} (${SPINES[sp].says})`).join(', ') || 'no shape here'}`] : []),
    ...(ideas.breath ? [`Breaths: ${nb.before} before a big section or after a tiring one, ${nb.tired} more after a tiring stretch; ${nb.beats} beats in all`] : []),
    ...(ideas.leadIn ? [`Lead-ins: ${nb.leadIns} ${nb.leadIns === 1 ? 'section comes' : 'sections come'} in early, the first note held into it; ${nb.pickups} phrases come in early inside a section (held into it, or a quick pickup word)`] : []),
    ...(ideas.hook ? [`Hook: sections in a form (${stat2.forms.join('; ') || 'none'}); ${stat2.back} phrases coming back (the same rhythm, its accent again when it ends the same way); ${stat2.hooks} chorus hooks (its first phrase reaching up)`] : []),
    ...(ideas.color ? [`Less one-note: ${stat2.neighbors} words a step up or down and back, ${stat2.passing} steps into the accent, ${stat2.leapsIn} phrases leaping in from a 3rd or 4th, ${stat2.appogs} last notes sung a step above first (a clash settling onto the chord)`] : []),
    'Not used here: quick notes, pushes and pulls, Repeat idea, Pitch by words, Question & answer, Section change, Carry over (Slow line, Breaths, Lead-ins, Hard & soft, Human feel, Range and Key & scale apply)',
  ];
  return { parts, silent, mood, notes };
}
