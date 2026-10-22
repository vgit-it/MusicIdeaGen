// Mood notes for the verse melody writer (docs/VOCAL-EMOTION.md, section 7): what music research says about how scale degrees,
// contour, endings and surprise carry feeling, as rules on top of the writer. Every rule is its own switch (EMO_IDS), on in the app by
// default; with a switch off the line is note for note what it was. Nothing here is fixed: each rule only leans, rolling its own dice.
//
// The four axes (valence, arousal, tension, surprise) are the thin layer under all of it:
//   valence  - from the mood against the mode (a Happy song in a minor key leans bright)         -> `tiltOf`
//   arousal  - from the mood, the tempo and the section's energy                                 -> `arousalOf`
//   tension  - the song's tension curve, bar by bar (the band already follows it)                -> `tensionAt`
//   surprise - the mood's budget of unexpected things per section                                -> `withSurprise`
//
// Rules (each a switch):
//   colour    - the mood's signature scale degrees (b6 yearning, #4 wonder, 7 pull, b2 menace, 6 warmth) as short neighbour notes
//               between two of the same note, so each resolves by step at once
//   endings   - each phrase end gets a degree by its role: home (1), open (5, 3...) or hanging (7, 2, 4), question then answer
//   suspend   - a long note starts on the note above (or the leading tone) and glides onto the chord note: a delayed resolution
//   contour   - phrases rise, fall or arch by mood; the leaps and steps by mood
//   arousal   - register, busyness and pace from the mood, the tempo and the energy
//   tension   - the tension curve: more colour and hanging ends as it rises, home ends as it falls, the register follows it
//   moodmode  - the mood against the mode: bright degrees favoured when the mood is brighter than the key, dark when it is darker
//   surprise  - 0 to 2 unexpected things per section, late in it: a push, a note off the scale, a deceptive ending

import type { Idea } from '../idea';
import type { Mood } from '../tension';
import { SCALES, type Chord, type Mode } from '../theory';
import type { BarGrid } from './grid';
import { cumulative, type Dials } from './profile';
import { fifth, roll, third, type BandNote, type Gap, type Range, type ToneBias } from './verse';

export const EMO_IDS = ['colour', 'endings', 'suspend', 'contour', 'arousal', 'tension', 'moodmode', 'surprise', 'longer', 'space'] as const;
export type EmoId = (typeof EMO_IDS)[number];

export const EMO_INFO: Record<EmoId, { name: string; hint: string }> = {
  colour: { name: 'Colour notes', hint: "The mood's own scale degrees as short notes that resolve at once: a flat 6th sigh (sad), a raised 7th pull (tense), a sharp 4th wonder (dreamy), a flat 2nd menace (dark, angry)" },
  endings: { name: 'Ending degrees', hint: 'Each phrase ends on a degree by its job: home (the 1) to close a chorus, open (5th, 3rd) for a question, hanging (7th, 2nd, 4th) into the next section' },
  suspend: { name: 'Delayed resolution', hint: 'A long note starts one step off (a 2nd over the 1, a 4th over the 3rd) and glides onto the chord note: the expected note arrives late' },
  contour: { name: 'Contour & leaps', hint: 'Phrases rise (hope, tension), fall (sorrow, release) or arch by mood; angry and triumphant leap more, sad and dreamy move by step' },
  arousal: { name: 'Arousal', hint: "Register, busyness and pace from the mood, the tempo and the energy: fast and intense sits higher and busier, slow and calm lower and longer" },
  tension: { name: 'Tension curve', hint: "Follows the song's tension, bar by bar: more colour notes and hanging ends as it builds, home ends as it eases, the line drifting up and down with it" },
  moodmode: { name: 'Mood over mode', hint: "When the mood is brighter or darker than the key (a Happy song in minor), the line leans to the bright or dark degrees. Off: the mode's own feel only" },
  surprise: { name: 'Surprise', hint: 'Now and then, late in a section: a note pushed early, a note off the scale, a deceptive ending. Calm moods fewer, tense and dreamy more, the climax one extra' },
  longer: { name: 'Longer notes', hint: 'Fewer 8th-note-or-shorter notes: neighbouring short notes are joined until about 35 to 50% of the notes are short, by genre and section (funk busiest, grunge calmest; verses busier than choruses and breaks)' },
  space: { name: 'Use the space', hint: 'A short note before a big gap, and a held ending, are held on into the gap (a breath left), the end of a repeated phrase most; notes of 3/4 bar or more bend more often, sometimes there and back, even a held ending' },
};

/** The switches that are on: all of them, except those listed (what the app stores). */
export const emoOn = (off?: readonly string[]): Set<EmoId> => new Set(EMO_IDS.filter((id) => !off?.includes(id)));

/** What a song hands the writer: its mood (the one picked, or Auto's), the switches that are on, and its climax section. */
export interface EmoOptions { mood: Mood; on: ReadonlySet<EmoId>; climax?: Idea }

/** What one section is written with. */
export interface EmoCtx {
  mood: Mood;
  on: ReadonlySet<EmoId>;
  /** Section kind: verse, prechorus, chorus, bridge, interlude, outro. */
  kind: string;
  key: number;
  mode: Mode;
  bpm: number;
  /** 1-5. */
  energy: number;
  /** Tension per bar of the section (0-1), when the song's arc is known. */
  tension?: number[];
  /** This is the song's climax. */
  climax: boolean;
  /** The last bar is the end of the track. */
  ending: boolean;
}

/** What one leaf of a section is written with. */
export interface EmoBuild {
  E: EmoCtx;
  key: number;
  mode: Mode;
  bar: number;
  /** The section's bars (all of them, not just this leaf's). */
  grid?: BarGrid;
  /** Steps in the leaf, and where it starts in the section. */
  total: number;
  leafFrom: number;
  /** The leaf holds the section's last bar. */
  lastLeaf: boolean;
  chordAt: Chord[];
  range: Range;
  /** The pentatonic option's scale (the mood notes that leave it stand down). */
  pent?: ReadonlySet<number>;
}

const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const DEG = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];

// ── the moods, as coordinates and ways ──────────────────────────────────────────────────────────

interface MoodWay {
  /** Valence (-1 dark … +1 bright), arousal (-1 calm … +1 intense) and the budget of surprise (0-1). */
  v: number; a: number; s: number;
  /** How strongly the colour notes and the delayed resolutions are wanted. */
  colour: number; susp: number;
  /** Times the leaps (octave jumps): drama against calm. */
  leap: number;
  /** Phrase contour weights, and how far they lean. */
  contour: Record<'rise' | 'fall' | 'arch' | 'level', number>;
  strength: number;
  /** Ending role weights: home, open, hang. */
  end: [number, number, number];
  /** Surprise kinds: a push, a note off the scale, a deceptive ending. */
  surp: [number, number, number];
}

const MOOD: Record<Mood, MoodWay> = {
  happy: { v: 0.8, a: 0.5, s: 0.15, colour: 0, susp: 0.5, leap: 1.1, contour: { rise: 1.5, fall: 0.7, arch: 1.3, level: 0.6 }, strength: 0.6, end: [1.15, 1, 0.7], surp: [3, 0.5, 0.5] },
  triumphant: { v: 0.6, a: 0.6, s: 0.2, colour: 0.9, susp: 0.6, leap: 1.3, contour: { rise: 2.4, fall: 0.3, arch: 1, level: 0.4 }, strength: 1, end: [1.25, 0.95, 0.6], surp: [2, 0.4, 1] },
  nostalgic: { v: 0.1, a: -0.2, s: 0.25, colour: 0.8, susp: 1.1, leap: 0.8, contour: { rise: 0.8, fall: 1.2, arch: 1.5, level: 0.6 }, strength: 0.6, end: [1, 1.15, 0.9], surp: [1, 1, 1.2] },
  dreamy: { v: 0.3, a: -0.6, s: 0.5, colour: 1, susp: 1, leap: 0.8, contour: { rise: 0.8, fall: 0.8, arch: 1.2, level: 1.4 }, strength: 0.5, end: [0.8, 1.2, 1.3], surp: [0.5, 2, 1.5] },
  tense: { v: -0.4, a: 0.3, s: 0.55, colour: 1.2, susp: 1.2, leap: 1.2, contour: { rise: 2, fall: 0.5, arch: 0.7, level: 1 }, strength: 0.9, end: [0.75, 1, 1.5], surp: [1.5, 2, 0.8] },
  angry: { v: -0.5, a: 0.8, s: 0.35, colour: 0.8, susp: 0.6, leap: 1.4, contour: { rise: 1.2, fall: 1, arch: 0.6, level: 1.6 }, strength: 0.8, end: [1.05, 0.9, 1.1], surp: [2.5, 1.2, 0.3] },
  melancholic: { v: -0.7, a: -0.5, s: 0.25, colour: 1.2, susp: 1.2, leap: 0.6, contour: { rise: 0.4, fall: 2.4, arch: 0.9, level: 1 }, strength: 0.9, end: [0.9, 1.1, 1.15], surp: [0.5, 1, 1.5] },
  dark: { v: -0.8, a: 0, s: 0.4, colour: 1.1, susp: 0.9, leap: 0.9, contour: { rise: 0.5, fall: 2, arch: 0.6, level: 1.2 }, strength: 0.7, end: [0.9, 1, 1.2], surp: [1, 1.8, 1] },
};

/** How bright a mode feels: more raised notes, brighter (Lydian … Phrygian). */
const MODE_BRIGHT: Record<Mode, number> = { lydian: 1, major: 0.7, mixolydian: 0.35, dorian: -0.1, minor: -0.5, phrygian: -0.8 };

/** How bright each degree (semitones above the tonic) is: raised notes up, flat notes down. */
const DEG_BRIGHT = [0, -1, 0.2, -0.6, 0.5, -0.1, 0.9, 0.1, -0.7, 0.4, -0.2, 0.6];

/** A mood's signature scale degrees: each a neighbour note one semitone off the note it resolves to (`core`, semitones above the tonic). */
const COLOURS: Record<string, { core: number; off: number; bright: number }> = {
  '7': { core: 0, off: -1, bright: 1 }, // the leading tone under the tonic: pulls up
  b6: { core: 7, off: 1, bright: -1 }, // over the 5th: yearning, sighs down
  '#4': { core: 7, off: -1, bright: 1 }, // under the 5th: wonder, unease
  b2: { core: 0, off: 1, bright: -1 }, // over the tonic: dread, menace
  '6': { core: 10, off: -1, bright: 1 }, // the natural 6th under the b7: hope, warmth in minor
};
const MOOD_COLOUR: Record<Mood, Record<string, number>> = {
  happy: {},
  triumphant: { '7': 3 },
  nostalgic: { b6: 2, '6': 2 },
  dreamy: { '#4': 3, '6': 1 },
  tense: { '7': 3, b2: 1.5, '#4': 1 },
  angry: { b2: 2, '7': 1 },
  melancholic: { b6: 3, '6': 0.5 },
  dark: { b2: 3, b6: 1.5 },
};
/** How much each kind of section wants colour: building and contrasting sections more, the chorus (the steadiest) less. */
const KIND_COLOUR: Record<string, number> = { verse: 1, prechorus: 1.2, chorus: 0.8, bridge: 1.25, interlude: 0.8, outro: 0.8 };
/** Surprises per section, by kind. */
const KIND_SURPRISE: Record<string, number> = { verse: 0.8, prechorus: 1, chorus: 0.8, bridge: 1.3, interlude: 0.5, outro: 0.6 };

// ── the axes ────────────────────────────────────────────────────────────────────────────────────

/** Arousal (-1 calm … +1 intense): the mood, the tempo (fast against 110 bpm) and the section's energy. */
export const arousalOf = (E: EmoCtx): number => clamp(0.55 * MOOD[E.mood].a + 0.45 * clamp((E.bpm - 110) / 50) + (0.35 * (E.energy - 3)) / 2);

/** Valence tilt (-1 … +1): how far the mood is brighter (+) or darker (-) than the mode; 0 with the switch off. */
export const tiltOf = (E: EmoCtx): number => (E.on.has('moodmode') ? clamp((MOOD[E.mood].v - MODE_BRIGHT[E.mode]) * 0.8) : 0);

/** The section's tension (0-1) at a step of a leaf, if the song's arc is known and the switch is on. */
function tensionAt(X: EmoBuild): ((step: number) => number | undefined) {
  const t = X.E.tension;
  if (!X.E.on.has('tension') || !t?.length) return () => undefined;
  return (step) => t[Math.max(0, Math.min(t.length - 1, X.grid ? X.grid.index(X.leafFrom + step + 1e-6) : Math.floor((X.leafFrom + step + 1e-6) / X.bar)))];
}

const chordPcs = (key: number, c: Chord): number[] => [0, third(c), fifth(c)].map((x) => mod12(key + c.root + x));
const chordAtStep = (X: EmoBuild, step: number): Chord => X.chordAt[Math.max(0, Math.min(X.chordAt.length - 1, Math.floor(step + 1e-6)))];
const scaleOf = (key: number, mode: Mode): Set<number> => new Set(SCALES[mode].map((i) => mod12(key + i)));

// ── the dials: arousal and leaps ────────────────────────────────────────────────────────────────

/** The section's dials moved by arousal (register, busyness, pace) and by the mood's leaps. */
export function emoDials(d: Dials, E: EmoCtx): Dials {
  let out = d;
  if (E.on.has('arousal')) {
    const a = arousalOf(E);
    out = {
      ...out,
      lift: out.lift + Math.round(2.4 * a),
      runs: out.runs * (1 + 0.35 * a),
      holdBar: clamp(out.holdBar * (1 - 0.3 * a), 0.1, 0.95),
      holdLong: out.holdLong * (1 - 0.3 * a),
      stretch: clamp(out.stretch - 0.12 * a, 0, 0.85),
      push: clamp(out.push + 0.08 * Math.max(0, a), 0, 0.6),
    };
  }
  // (a pre-chorus keeps its own octave jumps: rule 22's climb already pulls it up, and more jumps would climb it too often)
  if (E.on.has('contour') && E.kind !== 'prechorus') {
    const L = MOOD[E.mood].leap;
    out = { ...out, octave: Math.min(1, out.octave * L), neighbour: clamp(out.neighbour / Math.sqrt(L), 0, 0.8) };
  }
  return out;
}

// ── contour: which way each phrase goes, and the lean it puts on the pitches ────────────────────

type Dir = 'rise' | 'fall' | 'arch' | 'level';
const DIRS: Dir[] = ['rise', 'fall', 'arch', 'level'];
/** Section kinds lean their contours: a chorus rises or arches, a verse recites or falls, a bridge falls or stays; a pre-chorus is left to its own climb. */
const KIND_DIR: Record<string, Record<Dir, number>> = {
  verse: { rise: 0.9, fall: 1.1, arch: 1, level: 1.2 },
  prechorus: { rise: 0, fall: 0, arch: 0, level: 1 }, // (rule 22's climb already pulls it up)
  chorus: { rise: 1.2, fall: 0.8, arch: 1.3, level: 0.7 },
  bridge: { rise: 0.8, fall: 1.3, arch: 0.8, level: 1.4 },
  interlude: { rise: 0.8, fall: 1.2, arch: 1, level: 1 },
  outro: { rise: 0.5, fall: 1.6, arch: 0.8, level: 1.2 },
};

function dirFor(E: EmoCtx, seed: string, step: number): Dir {
  const m = MOOD[E.mood].contour, k = KIND_DIR[E.kind] ?? KIND_DIR.verse;
  return DIRS[cumulative(DIRS.map((x) => m[x] * k[x]), roll(seed, 'emo-contour', step))];
}

/** The height a step wants inside its phrase (-1 low … +1 high), or undefined where the phrase stays level. */
function contourOf(E: EmoCtx, phrases: Gap[], seed: string): (step: number) => number | undefined {
  const dirs = phrases.map((ph) => dirFor(E, seed, ph.step));
  return (step) => {
    let k = phrases.findIndex((ph) => step < ph.step + ph.len - 1e-9);
    if (k < 0) k = phrases.length - 1;
    const ph = phrases[k], dir = dirs[k];
    const p = clamp((step - ph.step) / Math.max(1, ph.len), 0, 1);
    return dir === 'rise' ? 2 * p - 1 : dir === 'fall' ? 1 - 2 * p : dir === 'arch' ? 1 - 4 * Math.abs(p - 0.5) : undefined;
  };
}

/**
 * How the chord note a bar or phrase sits on is leaned: toward the bright or dark degrees (mood over mode), and along the phrase's
 * contour (a rising phrase from the root toward the 5th, a falling one the other way). Undefined when neither is on.
 */
export function toneBias(X: EmoBuild, phrases: Gap[], seed: string): ToneBias | undefined {
  const { E } = X;
  const tilt = tiltOf(E), contour = E.on.has('contour') ? contourOf(E, phrases, seed) : undefined;
  if (!tilt && !contour) return undefined;
  const strength = MOOD[E.mood].strength;
  return (step, tone) => {
    let w = 1;
    const c = chordAtStep(X, step);
    if (tilt && c) w *= Math.exp(0.55 * tilt * DEG_BRIGHT[mod12(c.root + (tone === 'root' ? 0 : tone === 'third' ? third(c) : fifth(c)))]);
    const h = contour?.(step);
    if (h !== undefined) w *= Math.exp(1.6 * strength * h * (tone === 'root' ? -1 : tone === 'third' ? 0 : 1));
    return w;
  };
}

/** How hard the mood notes' register pull leans against the smoothest step (the pre-chorus climb pulls much harder). */
export const EMO_PULL = { leap: 0.7, w: 1.2 };

/**
 * The register the line leans toward at a step (for the octave choice): up and down with the phrase's contour, and with the section's
 * tension (above its own average when it builds). Undefined where neither says anything, so the line stays as smooth as it was.
 */
export function pullTo(X: EmoBuild, phrases: Gap[], seed: string): ((step: number) => number | undefined) | undefined {
  const { E } = X;
  const contour = E.on.has('contour') ? contourOf(E, phrases, seed) : undefined;
  const ten = tensionAt(X);
  const t = E.on.has('tension') ? E.tension : undefined;
  if (!contour && !t?.length) return undefined;
  const mean = t?.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
  const mid = (X.range.lo + X.range.hi) / 2, amp = 3 + 5 * MOOD[E.mood].strength;
  return (step) => {
    const h = contour?.(step), tt = ten(step);
    const lean = tt === undefined ? 0 : (tt - mean) * 7;
    if (h === undefined && Math.abs(lean) < 0.75) return undefined;
    return mid + (h ?? 0) * amp + lean;
  };
}

// ── colour notes ────────────────────────────────────────────────────────────────────────────────

/**
 * Colour notes: where the line has the same note three times running in one phrase (touching), the middle one, an 8th or a 16th, is
 * now and then the mood's colour degree a semitone off it: the line goes away and comes straight back, so every colour resolves by
 * step at once (a sigh, a pull). Run after the bends, on notes no bend moves. Not against a chord note other than the one it resolves to (no half-step rub), at most about one a
 * bar and two bars in five, never in the pentatonic option, more when the section is building.
 */
export function withColour(notes: BandNote[], phrases: Gap[], X: EmoBuild, seed: string): BandNote[] {
  const { E } = X;
  const table = MOOD_COLOUR[E.mood], strength = MOOD[E.mood].colour;
  if (!E.on.has('colour') || X.pent || !strength || !Object.keys(table).length) return notes;
  const tilt = tiltOf(E), ten = tensionAt(X);
  const cap = Math.ceil(X.total / X.bar / 2.5);
  const out = notes.map((n) => ({ ...n }));
  const used: number[] = [];
  for (let i = 1; i < out.length - 1 && used.length < cap; i++) {
    const p = out[i - 1], n = out[i], q = out[i + 1];
    if (n.len > 2 + 1e-6 || n.nb || n.walk || n.land || n.third || n.end || n.bendTo !== undefined || n.slide) continue;
    if (Math.abs(p.step + p.len - n.step) > 1e-6 || Math.abs(n.step + n.len - q.step) > 1e-6) continue;
    if (p.midi !== n.midi || q.midi !== n.midi || p.nb || q.nb || p.third || q.third || p.bendTo !== undefined) continue;
    const ph = phrases.find((g) => n.step >= g.step - 1e-6 && n.step < g.step + g.len - 1e-6);
    if (!ph || p.step < ph.step - 1e-6 || q.step + q.len > ph.step + ph.len + 1e-6) continue;
    if (used.some((s) => Math.abs(s - n.step) < X.bar)) continue;
    const core = mod12(n.midi - X.key);
    const cands = Object.entries(table).filter(([name]) => COLOURS[name].core === core).map(([name, w]) => ({ name, w: w * Math.exp(0.9 * tilt * COLOURS[name].bright) }));
    const W = cands.reduce((a, c) => a + c.w, 0);
    if (!W) continue;
    const t = ten(n.step);
    const pr = 0.3 * strength * Math.min(1, W / 3) * (KIND_COLOUR[E.kind] ?? 1) * (t === undefined ? 1 : 0.55 + 0.9 * t);
    if (roll(seed, 'emo-colour', n.step) >= pr) continue;
    const pick = cands[cumulative(cands.map((c) => c.w), roll(seed, 'emo-colourpick', n.step))];
    const midi = n.midi + COLOURS[pick.name].off;
    if (midi < X.range.xlo || midi > X.range.xhi) continue;
    // (no half-step rub against a chord note other than the one it resolves to)
    const cpc = mod12(midi), corePc = mod12(n.midi);
    if (chordPcs(X.key, chordAtStep(X, n.step)).some((c) => c !== corePc && [1, 11].includes(mod12(cpc - c)))) continue;
    out[i] = { ...n, midi, nb: true, colour: pick.name };
    used.push(n.step);
  }
  return out;
}

// ── ending degrees ──────────────────────────────────────────────────────────────────────────────

type Role = 'home' | 'open' | 'hang';
const ROLES: Role[] = ['home', 'open', 'hang'];

/** Ending role weights (home, open, hang) for the last phrase of a section, by kind. */
const SECTION_END: Record<string, [number, number, number]> = {
  chorus: [0.8, 0.15, 0.05], verse: [0.3, 0.4, 0.3], prechorus: [0.1, 0.35, 0.55], bridge: [0.1, 0.3, 0.6], interlude: [0.3, 0.4, 0.3], outro: [0.75, 0.2, 0.05],
};
const QUESTION: [number, number, number] = [0.25, 0.5, 0.25];
const ANSWER: [number, number, number] = [0.8, 0.17, 0.03];

/** The octave of the pitch class `pc` nearest `near`, within `maxStep` semitones of it, in the main range if it can be. */
function place(pc: number, near: number, r: Range, maxStep = 5, prev?: number, fromPrev = 4): number | undefined {
  const base = near + mod12(pc - near);
  // (and, with a note before it, no bigger a step from that than `fromPrev`, unless the note it replaces was already further)
  const cs = [base - 12, base, base + 12].filter((m) => Math.abs(m - near) <= maxStep && (prev === undefined || Math.abs(m - prev) <= Math.max(fromPrev, Math.abs(near - prev))));
  const main = cs.filter((m) => m >= r.lo && m <= r.hi), ext = cs.filter((m) => m >= r.xlo && m <= r.xhi);
  return (main.length ? main : ext).sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0];
}

/**
 * Ending degrees: the last note of every phrase gets a degree by its job. A section's last phrase: a chorus comes home, a pre-chorus
 * or bridge hangs into what follows, a verse leans open or hanging, the song's last bar comes home (or stays open, in dreamy and
 * nostalgic songs). The phrases inside go in pairs: a question (open: the 5th, the 3rd) then an answer (home: the 1). The mood
 * leans the weights (tense hangs, happy and triumphant come home) and so does the tension (hanging as it builds, home as it eases).
 * A phrase the writer already ended open or hanging keeps that role. Home is only the tonic when the chord has it; open picks the
 * chord's 5th, 3rd or other root; hanging a scale note off the chord (the 7th, 2nd, 4th). Within a 4th of the note it replaces.
 */
export function withEndDegrees(notes: BandNote[], phrases: Gap[], X: EmoBuild, seed: string): BandNote[] {
  const { E } = X;
  if (!E.on.has('endings')) return notes;
  const out = notes.map((n) => ({ ...n }));
  const scale = scaleOf(X.key, X.mode), ten = tensionAt(X), M = MOOD[E.mood];
  phrases.forEach((ph, k) => {
    let idx = -1;
    for (let i = 0; i < out.length; i++) if (out[i].step >= ph.step - 1e-6 && out[i].step < ph.step + ph.len - 1e-6) idx = i;
    if (idx < 0) return;
    const n = out[idx];
    if (n.third || n.walk || n.land) return;
    const last = X.lastLeaf && k === phrases.length - 1;
    let role: Role;
    // (a phrase the writer already ended open or hanging keeps that role, except the section's last: that one has a job of its own)
    if (!last && n.end && (n.style === 'open' || n.style === 'hang')) role = n.style;
    else {
      const question = !last && (k % 2 === 0 || k === phrases.length - 1);
      let w = last ? (E.ending ? (E.mood === 'dreamy' || E.mood === 'nostalgic' ? [0.5, 0.4, 0.1] : [0.9, 0.08, 0.02]) : SECTION_END[E.kind] ?? SECTION_END.verse) : question ? QUESTION : ANSWER;
      const t = ten(ph.step + ph.len - 1);
      w = w.map((x, j) => x * M.end[j] * (t === undefined ? 1 : j === 0 ? 1.3 - 0.6 * t : j === 2 ? 0.6 + 0.8 * t : 1));
      role = ROLES[cumulative(w, roll(seed, 'emo-role', ph.step))];
    }
    const c = chordAtStep(X, n.step), pcs = chordPcs(X.key, c);
    const pent = X.pent;
    const cands: { pc: number; w: number }[] = [];
    if (role === 'home') {
      const tonic = mod12(X.key);
      if (pcs.includes(tonic)) cands.push({ pc: tonic, w: 1 });
    } else if (role === 'open') {
      for (const pc of pcs) {
        const deg = mod12(pc - X.key);
        if (deg === 0) continue;
        cands.push({ pc, w: deg === 7 ? 3 : deg === 3 || deg === 4 ? 2.5 : 0.8 });
      }
    } else {
      for (const pc of scale) {
        if (pcs.includes(pc)) continue;
        const deg = mod12(pc - X.key);
        cands.push({ pc, w: deg === 2 || (deg === 1 && X.mode === 'phrygian') ? 3 : deg === 10 || deg === 11 ? 2.2 : deg === 5 ? 1.4 : deg === 8 || deg === 9 ? 1.5 : 0.5 });
      }
    }
    const ok = cands.filter((x) => !pent || pent.has(x.pc));
    if (!ok.length) return;
    const pick = ok[cumulative(ok.map((x) => x.w), roll(seed, 'emo-endpick', ph.step))];
    const before = out[idx - 1] && out[idx - 1].step >= ph.step - 1e-6 ? out[idx - 1].midi : undefined;
    const midi = place(pick.pc, n.midi, X.range, 5, before, role === 'home' ? 5 : 4);
    if (midi === undefined) return;
    out[idx] = { ...n, midi, endRole: role, endDeg: DEG[mod12(midi - X.key)] };
  });
  return out;
}

// ── delayed resolution ──────────────────────────────────────────────────────────────────────────

/**
 * Delayed resolution: a long note (two beats or more) now and then starts one step off the chord note, a scale step above it (the
 * 2nd over the 1, the 4th over the 3rd), or the leading tone under the tonic, and glides onto the chord note after its first part:
 * the expected note arrives late. Run after the bends: not near another bend, not on a long hold, a lead-in, or a note a colour note
 * leans on. More on held endings, in tense, melancholic and nostalgic moods and as the tension builds.
 */
export function withSuspensions(notes: BandNote[], X: EmoBuild, seed: string): BandNote[] {
  const { E } = X;
  if (!E.on.has('suspend') || X.pent) return notes;
  const M = MOOD[E.mood], ten = tensionAt(X), scale = scaleOf(X.key, X.mode);
  const beat = Math.round(X.bar / 4), eighth = X.bar / 8, glide = 1;
  const cap = Math.ceil(X.total / X.bar / 3);
  const out = notes.map((n) => ({ ...n }));
  const used: number[] = [];
  for (let i = 0; i < out.length && used.length < cap; i++) {
    const n = out[i], prev = out[i - 1];
    if (n.bendTo !== undefined || n.slide || n.longHold || n.lead || n.nb || n.walk || n.third || n.land || prev?.colour) continue;
    const atMax = n.len - glide - beat;
    if (atMax < eighth - 1e-6) continue;
    if (out.some((o, j) => j !== i && (o.bendTo !== undefined || o.slide) && Math.abs(o.step - n.step) < X.bar)) continue;
    if (used.some((s) => Math.abs(s - n.step) < 2 * X.bar)) continue;
    const c = chordAtStep(X, n.step), pcs = chordPcs(X.key, c), res = mod12(n.midi);
    if (!pcs.includes(res)) continue;
    const t = ten(n.step);
    const p = 0.45 * M.susp * (n.end ? 1.5 : 1) * (E.kind === 'chorus' ? 0.8 : 1) * (t === undefined ? 1 : 0.4 + 1.2 * t);
    if (roll(seed, 'emo-susp', n.step) >= p) continue;
    // the note it starts on: a scale step above (a 2nd or a 4th over the chord note), or the leading tone under the tonic
    const up = [2, 1].filter((k) => scale.has(mod12(n.midi + k)) && !pcs.includes(mod12(n.midi + k)));
    const lead = mod12(n.midi - X.key) === 0 && !pcs.includes(mod12(n.midi - 1)) ? [-1] : [];
    const opts = [...up.map((k) => ({ k, w: k === 2 ? 0.6 : 0.4 })), ...lead.map((k) => ({ k, w: up.length ? 0.3 : 1 }))];
    if (!opts.length) continue;
    const o = opts[cumulative(opts.map((x) => x.w), roll(seed, 'emo-susppick', n.step))];
    const sus = n.midi + o.k;
    if (sus < X.range.xlo || sus > X.range.xhi) continue;
    const at = clamp(Math.round(n.len * 0.5), eighth, atMax);
    // (the note it glides onto must still be a chord note when the glide lands: the chord may change under a long note)
    if (!chordPcs(X.key, chordAtStep(X, n.step + at + glide)).includes(res) || !pcs.includes(res)) continue;
    out[i] = {
      ...n, midi: sus, bendTo: n.midi, bendAt: at, bendLen: glide, inner: `suspension ${DEG[mod12(sus - X.key)]}→${DEG[mod12(n.midi - X.key)]}`,
      ...(n.fadeBy ? { fadeBy: Math.round(n.fadeBy / 2) } : {}),
    };
    used.push(n.step);
  }
  return out;
}

// ── surprise ────────────────────────────────────────────────────────────────────────────────────

/**
 * Surprise: the mood's budget (0 to 2 a section, one more at the climax) of unexpected things, kept for the second half of a section
 * (what is expected has been set up by then): a note on a beat pushed a 16th early; a note off the scale (a semitone out and straight
 * back, between two of the same note); a deceptive ending (the last phrase, ending on the tonic, lands on the chord's 6th or 3rd).
 */
export function withSurprise(notes: BandNote[], phrases: Gap[], X: EmoBuild, seed: string): BandNote[] {
  const { E } = X;
  if (!E.on.has('surprise') || !X.lastLeaf) return notes;
  const M = MOOD[E.mood];
  const budget = M.s * (KIND_SURPRISE[E.kind] ?? 1) * (E.climax ? 1.6 : 1) * (1 + 0.6 * (tensionAt(X)(X.total - 1) ?? 0.5));
  const count = Math.min(2, Math.floor(budget) + (roll(seed, 'emo-sn', 0) < budget - Math.floor(budget) ? 1 : 0));
  if (!count) return notes;
  const out = notes.map((n) => ({ ...n }));
  const half = X.total / 2, scale = scaleOf(X.key, X.mode), beat = Math.round(X.bar / 4);
  const kinds = (['push', 'chromatic', 'deceptive'] as const).map((k, j) => ({ k, w: M.surp[j] }));
  const order: ('push' | 'chromatic' | 'deceptive')[] = [];
  const pool = [...kinds];
  while (pool.length && order.length < 3) { const j = cumulative(pool.map((x) => x.w), roll(seed, 'emo-skind', order.length)); order.push(pool[j].k); pool.splice(j, 1); }
  let done = 0;
  const near = (step: number) => out.some((n) => (n.surprise || n.colour) && Math.abs(n.step - step) < X.bar);
  for (const kind of order) {
    if (done >= count) break;
    if (kind === 'push') {
      const c = out.map((n, i) => ({ n, i })).filter(({ n, i }) => {
        const prev = out[i - 1];
        const onBeat = X.grid ? X.grid.isBeat(X.leafFrom + n.step) : Math.abs(n.step / beat - Math.round(n.step / beat)) < 1e-6;
        return n.step >= half && onBeat && n.len >= 2 && !n.walk && !n.land && !n.nb && !n.third && !n.end && !n.longHold && !n.lead && !n.slide && n.bendTo === undefined && !near(n.step)
          && !phrases.some((p) => Math.abs(p.step - n.step) < 1e-6) && (!prev || prev.step + prev.len <= n.step - 1 + 1e-6);
      });
      if (!c.length) continue;
      const pick = c.reduce((a, b) => (roll(seed, 'emo-spush', b.n.step) < roll(seed, 'emo-spush', a.n.step) ? b : a));
      out[pick.i] = { ...pick.n, step: pick.n.step - 1, len: pick.n.len + 1, surprise: 'push' };
      done++;
    } else if (kind === 'chromatic') {
      if (X.pent) continue;
      let hit = false;
      for (let i = 1; i < out.length - 1 && !hit; i++) {
        const p = out[i - 1], n = out[i], q = out[i + 1];
        if (n.step < half || n.len > 2 + 1e-6 || n.nb || n.walk || n.land || n.third || n.end || n.bendTo !== undefined || n.slide || near(n.step)) continue;
        if (Math.abs(p.step + p.len - n.step) > 1e-6 || Math.abs(n.step + n.len - q.step) > 1e-6 || p.midi !== n.midi || q.midi !== n.midi || p.nb || q.nb || p.bendTo !== undefined) continue;
        const ph = phrases.find((g) => n.step >= g.step - 1e-6 && n.step < g.step + g.len - 1e-6);
        if (!ph || p.step < ph.step - 1e-6 || q.step + q.len > ph.step + ph.len + 1e-6) continue;
        const dirs = [roll(seed, 'emo-sdir', n.step) < 0.5 ? 1 : -1];
        dirs.push(-dirs[0]);
        const d = dirs.find((x) => !scale.has(mod12(n.midi + x)) && n.midi + x >= X.range.xlo && n.midi + x <= X.range.xhi);
        if (d === undefined || roll(seed, 'emo-schrom', n.step) > 0.5) continue;
        out[i] = { ...n, midi: n.midi + d, nb: true, surprise: 'off the scale' };
        hit = true;
      }
      if (hit) done++;
    } else {
      const lastPh = phrases[phrases.length - 1];
      let idx = -1;
      for (let i = 0; i < out.length; i++) if (lastPh && out[i].step >= lastPh.step - 1e-6 && out[i].step < lastPh.step + lastPh.len - 1e-6) idx = i;
      const n = out[idx];
      if (!n || n.third || n.lead || n.surprise || n.bendTo !== undefined || n.slide || out[idx - 1]?.colour || mod12(n.midi - X.key) !== 0) continue;
      const pcs = chordPcs(X.key, chordAtStep(X, n.step));
      const opts = pcs.filter((pc) => [9, 8, 3, 4].includes(mod12(pc - X.key)));
      if (!opts.length) continue;
      const pc = opts[Math.floor(roll(seed, 'emo-sdec', n.step) * opts.length)];
      const midi = place(pc, n.midi, X.range, 5);
      if (midi === undefined) continue;
      out[idx] = { ...n, midi, surprise: 'deceptive ending', endRole: 'deceptive', endDeg: DEG[mod12(midi - X.key)] };
      done++;
    }
  }
  return out;
}

/** The mood notes in a section's notes, counted for the card and the check. */
export function emoSummary(notes: BandNote[]): { colour: string[]; ends: string[]; suspensions: number; surprises: string[] } {
  return {
    colour: notes.filter((n) => n.colour).map((n) => n.colour!),
    ends: notes.filter((n) => n.endDeg).map((n) => `${n.endDeg} (${n.endRole})`),
    suspensions: notes.filter((n) => n.inner?.startsWith('suspension')).length,
    surprises: notes.filter((n) => n.surprise).map((n) => n.surprise!),
  };
}
