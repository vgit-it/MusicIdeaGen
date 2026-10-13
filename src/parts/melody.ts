// How the singer's tunes are written (research: docs/VOCAL.md, section 6). A song gets a melody style
// from its mood and genre (plus a little chance, and now and then a twist), and every section's tune is
// built from motifs the way songwriters build them:
// - a line is two bars: a motif in the first, its answer in the second, ending on a held note
// - lines follow a form (verse A A' B A, chorus A B A B...): a letter that comes back sings the same
//   rhythm and shape again; a primed letter (a) keeps the first bar and changes the ending
// - pre-choruses climb by sequence (the same line, a step higher each time) and get busier
// - each kind of section has a contour: verses recite or wave, choruses arch or rise, bridges go
//   somewhere else; the chorus sits higher than the verse by the style's lift
// - line endings: open ones (on the 3rd or 5th: a question) and closed ones (on the root: the answer)
// - mostly steps and repeated notes; a leap is followed by a step back the other way (gap-fill)
// - strong beats on chord notes (less so when tense: unstable notes rub), held notes leaning in from a
//   step above (the sigh of sad songs) or turning through a few notes on one vowel (pop's melisma)
// - blue notes (a flat 3rd or 7th in passing) in rock, a flat 2nd's dark colour in minor keys
// - the singer (singers.ts) phrases it: lines of one to four bars by their phrase plan, wordy patter or
//   drawn-out words, notes held through the bar line, runs on one vowel, wails up high, slides and falls

import type { ChordPart, Idea, SectionKind, Song } from '../idea';
import type { Genre } from '../genres';
import { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import type { Mood } from '../tension';
import { SCALES, chordPc } from '../theory';
import { MINORISH, chordTones } from './guitar2';
import { type Band, bandScore, harmonyOf } from './fit';
import type { Syllable } from './lyrics';
import type { MoveId } from './moves';
import { type FirstStyle, spineAt } from './first';
import { type RunKind, type Singer, type Timbre, VOICE_DOWN, phrasePlan, pickSinger, pickTimbre } from './singers';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The low voice's comfortable range (a rock tenor-baritone): C3 to E4, the climax up to A4. */
export const LOW: [number, number] = [48, 64];
export const PEAK = 69;
/**
 * The lowest a sung note goes (B2; plus a higher singer's lift): under it the voice sinks into the band
 * and is barely heard (Paul: "very low register ... barely audible").
 */
export const FLOOR = 47;

/** A line's shape: recite (one note, falling at the end), arch, rise (peak late), fall, valley, climb, wave, tumble (from up high all the way down, lifting at the end). */
export type Contour = 'recite' | 'arch' | 'rise' | 'fall' | 'valley' | 'climb' | 'wave' | 'tumble';
type Start = 'down' | 'after' | 'pickup';

/** How a song's tunes are written. */
export interface MelodyStyle {
  verse: Contour;
  chorus: Contour;
  bridge: Contour;
  /** Line forms, a letter per line (lowercase: the same line with a new ending). */
  verseForm: string;
  chorusForm: string;
  /** Semitones the chorus sits above the verse; the bridge's lift. */
  lift: number;
  bridgeLift: number;
  /** Semitones the whole melody moves; how wide it goes (x). */
  register: number;
  /** Semitones a higher singer's range sits above the low voice's (its floor, ceiling and wail move with it). */
  up: number;
  span: number;
  /** Chances: a leap (a 4th or more), a repeated note, a strong beat on a chord note. */
  leap: number;
  leaps: number[];
  repeat: number;
  stable: number;
  /** Chances: a held note leaning in from a step above; a line's last note turning through a few notes. */
  lean: number;
  melisma: number;
  /** How busy verses and choruses are (x); how joined the notes are (1: legato, lower: detached). */
  busyVerse: number;
  busyChorus: number;
  legato: number;
  /** Chance of anticipations (a strong note an 8th early). */
  sync: number;
  /** Where lines start: on the downbeat, after it (back-heavy), or with a pickup before it. */
  verseStart: Start;
  chorusStart: Start;
  /** Chances of blue notes (flat 3rd, flat 7th in passing) and a dark flat 2nd. */
  blue: number;
  dark: number;
  /** The hook opens with a leap up of this many scale steps (0: none). */
  hookLeap: number;
  /** Line endings: falling to the root (settled, resigned) or left open until the last line. */
  ends: 'fall' | 'open';
  twist: Twist | null;
  /** Who sings it (how it's phrased and delivered), and how far above the usual top their wails go. */
  singer: Singer;
  top: number;
  /** Their voice on Auto (a deep voice sings a little lower). */
  timbre: Timbre;
  /** The rhythm written on the metronome grid (docs/VOCAL-RHYTHM.md), not the classic speech rhythm. */
  grid?: boolean;
  /** The pitches written the shaped way (docs/VOCAL-MELODY.md): a chord-note path, a motif on it, by genre. */
  shaped?: boolean;
  /** Melody first (docs/VOCAL-FIRST.md, src/parts/first.ts): the tune's own spine and idea, fitted to the chords last (on shaped's range and moves). */
  first?: FirstStyle;
  /** How far the chorus jumps above the verse, shaped: subtle, clear or dramatic (the song's pick). */
  contrast?: 'subtle' | 'clear' | 'dramatic';
  /** Shaped: the song's signature moves (src/parts/moves.ts, docs/VOCAL-MOVES.md). */
  moves?: MoveId[];
  /** The energy style's grip on the band (src/parts/energy.ts): stressed words with the kick and snare (x), words in the riff's gaps. */
  grip?: { lock: number; gaps: number };
  /** Semitones a section's tune moves for its energy (energy.ts), after the verse-to-chorus lift (so a voice near its floor still moves). */
  energyReg?: number;
  /** Chance a line leaves its first words out, starting later (energy.ts: a Drifter's space). */
  space?: number;
}

type W<T> = [T, number][];
interface MoodMelody {
  verse: W<Contour>; chorus: W<Contour>; bridge: W<Contour>;
  lift: [number, number]; register: number; span: number; leap: number; leaps: number[]; repeat: number; stable: number;
  lean: number; melisma: number; busy: number; legato: number; sync: number;
  verseStart: W<Start>; chorusStart: W<Start>; dark: number; hookLeap: W<number>; ends: 'fall' | 'open';
}

/**
 * Moods (research [M]: happy melodies higher, wider, rising, with leaps; sad ones lower, narrower,
 * stepwise and falling, slower and joined; anger angular and rising, short and accented, unstable notes;
 * tenderness falling, stepwise, stable notes; [P] appoggiaturas, the "sigh", in sad and longing songs).
 */
const MOOD_MELODY: Record<Mood, MoodMelody> = {
  happy: {
    verse: [['wave', 3], ['recite', 1], ['arch', 2]], chorus: [['arch', 4], ['rise', 2], ['wave', 1]], bridge: [['rise', 2], ['arch', 2]],
    lift: [4, 7], register: 1, span: 1.15, leap: 0.18, leaps: [3, 4], repeat: 0.2, stable: 0.82, lean: 0.05, melisma: 0.08,
    busy: 1.05, legato: 0.8, sync: 0.25, verseStart: [['down', 3], ['pickup', 2]], chorusStart: [['down', 4], ['pickup', 1]],
    dark: 0, hookLeap: [[0, 2], [2, 2], [3, 2]], ends: 'open',
  },
  triumphant: {
    verse: [['climb', 2], ['wave', 2], ['recite', 1]], chorus: [['rise', 4], ['arch', 3]], bridge: [['climb', 2], ['rise', 2]],
    lift: [5, 8], register: 1, span: 1.2, leap: 0.22, leaps: [3, 4], repeat: 0.18, stable: 0.88, lean: 0.05, melisma: 0.05,
    busy: 0.9, legato: 0.9, sync: 0.15, verseStart: [['down', 3], ['pickup', 1]], chorusStart: [['down', 5], ['pickup', 1]],
    dark: 0, hookLeap: [[3, 3], [4, 2], [0, 1]], ends: 'open',
  },
  nostalgic: {
    verse: [['arch', 3], ['wave', 2], ['fall', 1]], chorus: [['arch', 4], ['fall', 2]], bridge: [['arch', 2], ['valley', 1]],
    lift: [3, 6], register: 0, span: 1.05, leap: 0.14, leaps: [3, 5], repeat: 0.2, stable: 0.75, lean: 0.2, melisma: 0.15,
    busy: 0.95, legato: 0.9, sync: 0.2, verseStart: [['pickup', 3], ['down', 2]], chorusStart: [['down', 2], ['pickup', 2]],
    dark: 0, hookLeap: [[5, 2], [0, 2], [3, 1]], ends: 'fall',
  },
  melancholic: {
    verse: [['fall', 3], ['recite', 1], ['wave', 2]], chorus: [['arch', 3], ['fall', 3]], bridge: [['valley', 2], ['fall', 1], ['arch', 1]],
    lift: [2, 5], register: -1, span: 0.85, leap: 0.07, leaps: [3, 5], repeat: 0.22, stable: 0.68, lean: 0.32, melisma: 0.22,
    busy: 0.82, legato: 0.95, sync: 0.15, verseStart: [['pickup', 3], ['after', 2], ['down', 1]], chorusStart: [['pickup', 2], ['down', 2]],
    dark: 0.05, hookLeap: [[0, 3], [5, 1]], ends: 'fall',
  },
  dreamy: {
    verse: [['wave', 3], ['arch', 2]], chorus: [['arch', 3], ['wave', 2], ['valley', 1]], bridge: [['wave', 2], ['valley', 1]],
    lift: [3, 6], register: 1, span: 1.1, leap: 0.24, leaps: [4, 3], repeat: 0.15, stable: 0.58, lean: 0.15, melisma: 0.28,
    busy: 0.7, legato: 1, sync: 0.2, verseStart: [['after', 3], ['pickup', 2]], chorusStart: [['after', 2], ['down', 2]],
    dark: 0, hookLeap: [[4, 3], [0, 1]], ends: 'open',
  },
  tense: {
    verse: [['recite', 1.5], ['wave', 2], ['valley', 1]], chorus: [['climb', 3], ['rise', 2], ['arch', 1]], bridge: [['climb', 2], ['recite', 1]],
    lift: [2, 5], register: 0, span: 0.75, leap: 0.1, leaps: [3, 4], repeat: 0.3, stable: 0.45, lean: 0.1, melisma: 0.03,
    busy: 1.1, legato: 0.72, sync: 0.45, verseStart: [['after', 3], ['pickup', 2]], chorusStart: [['pickup', 2], ['down', 2]],
    dark: 0.2, hookLeap: [[0, 3], [3, 1]], ends: 'open',
  },
  angry: {
    verse: [['recite', 1.5], ['rise', 1.5], ['wave', 1]], chorus: [['rise', 3], ['arch', 2]], bridge: [['climb', 2], ['rise', 1]],
    lift: [4, 7], register: 1, span: 0.9, leap: 0.25, leaps: [3, 4], repeat: 0.3, stable: 0.6, lean: 0.03, melisma: 0,
    busy: 1.15, legato: 0.6, sync: 0.4, verseStart: [['down', 3], ['after', 1]], chorusStart: [['down', 4]],
    dark: 0.15, hookLeap: [[3, 2], [0, 2]], ends: 'fall',
  },
  dark: {
    verse: [['recite', 1.5], ['fall', 2], ['valley', 1]], chorus: [['arch', 2], ['valley', 2], ['fall', 1]], bridge: [['valley', 2], ['recite', 1]],
    lift: [2, 5], register: -2, span: 0.8, leap: 0.1, leaps: [3, 4], repeat: 0.28, stable: 0.6, lean: 0.2, melisma: 0.06,
    busy: 0.9, legato: 0.85, sync: 0.25, verseStart: [['after', 3], ['pickup', 2]], chorusStart: [['down', 2], ['pickup', 2]],
    dark: 0.35, hookLeap: [[0, 3], [4, 1]], ends: 'fall',
  },
};

/** Genres lean the style ([P]: rock's blue notes and anticipations; pop's symmetry and melisma; funk's short, syncopated chant; metal high, long and minor; grunge low and narrow, then a big jump to the chorus). */
const GENRE_MELODY: Record<Genre, { register: number; span: number; lift: number; blue: number; dark: number; melisma: number; sync: number; legato: number; repeat: number; busy: number }> = {
  rock: { register: 0, span: 1, lift: 0, blue: 0.18, dark: 0, melisma: 0, sync: 0.1, legato: 1, repeat: 0, busy: 1 },
  pop: { register: 0, span: 1.1, lift: 1, blue: 0.03, dark: 0, melisma: 0.1, sync: 0.05, legato: 1, repeat: 0, busy: 1 },
  funk: { register: 0, span: 0.85, lift: 0, blue: 0.22, dark: 0, melisma: -1, sync: 0.25, legato: 0.75, repeat: 0.15, busy: 1.1 },
  hardrock: { register: 1, span: 1.05, lift: 1, blue: 0.25, dark: 0, melisma: 0, sync: 0.1, legato: 1, repeat: 0, busy: 1 },
  metal: { register: 1, span: 1.05, lift: 1, blue: 0, dark: 0.2, melisma: -1, sync: 0, legato: 1.08, repeat: 0.05, busy: 0.9 },
  grunge: { register: -1, span: 0.8, lift: 2, blue: 0.1, dark: 0.1, melisma: -0.05, sync: 0.05, legato: 1, repeat: 0.1, busy: 0.95 },
  altmetal: { register: 0, span: 0.9, lift: 1, blue: 0.05, dark: 0.15, melisma: -0.05, sync: 0.1, legato: 1, repeat: 0.1, busy: 1 },
};

const VERSE_FORMS: W<string> = [['AaBA', 3], ['ABAB', 2], ['AAaB', 2], ['ABAC', 1], ['AABB', 1]];
const CHORUS_FORMS: W<string> = [['ABAB', 3], ['ABAC', 2], ['AaAB', 2], ['ABaB', 1]];

/** Now and then, something to make a song's tune its own. */
export type Twist = 'octave' | 'chant' | 'leap' | 'call' | 'offbeat' | 'long' | 'rapid';
export const TWIST_DESC: Record<Twist, string> = {
  octave: 'quiet low verses, then the chorus jumps way up',
  chant: 'verses chanted on nearly one note',
  leap: 'the hook opens with a big leap',
  call: 'chorus lines call high and answer low',
  offbeat: 'every line starts after the beat',
  long: 'a chorus of long held notes',
  rapid: 'rapid-fire verses',
};
/** Which twists suit a mood or genre. */
const TWIST_FIT: Record<Twist, (m: Mood, g: Genre) => number> = {
  octave: (m, g) => (['grunge', 'altmetal', 'rock'].includes(g) ? 2 : 0.5) * (['dreamy'].includes(m) ? 0.3 : 1),
  chant: (m, g) => (['tense', 'angry', 'dark'].includes(m) ? 2 : 0.4) * (['funk', 'grunge', 'altmetal', 'metal'].includes(g) ? 1.5 : 1),
  leap: (m) => (['happy', 'triumphant', 'nostalgic', 'dreamy'].includes(m) ? 2 : 0.3),
  call: (m, g) => (g === 'funk' ? 2.5 : 0.8) * (m === 'melancholic' ? 0.5 : 1),
  offbeat: (m, g) => (['tense', 'dreamy', 'dark'].includes(m) ? 1.5 : 0.6) * (g === 'funk' ? 1.5 : 1),
  long: (m, g) => (['triumphant', 'dreamy', 'melancholic'].includes(m) ? 1.5 : 0.5) * (['metal', 'hardrock'].includes(g) ? 1.5 : 1),
  rapid: (m, g) => (['happy', 'angry', 'tense'].includes(m) ? 1 : 0.3) * (['funk', 'pop', 'rock'].includes(g) ? 1.5 : 0.6),
};

/** How many times each line is written, the best fit with the band kept. */
const TRIES = 6;

/** A leap of so many scale steps, in semitones. */
const LEAP_SEMIS: Record<number, number> = { 2: 4, 3: 5, 4: 7, 5: 9, 6: 10, 7: 12 };

const jitter = (rng: Rng, x: number, by = 0.15) => x * (1 - by + rng.next() * 2 * by);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A song's melody style: its mood's ways, leaned by its genre, a little chance, and maybe a twist. */
export function melodyStyle(seed: string, mood: Mood, genre: Genre, lift = 0): MelodyStyle {
  const rng = new Rng(`${seed}-melody`);
  const M = MOOD_MELODY[mood], G = GENRE_MELODY[genre];
  const singer = pickSinger(seed, mood, genre);
  const s: MelodyStyle = {
    verse: rng.weighted(M.verse), chorus: rng.weighted(M.chorus), bridge: rng.weighted(M.bridge),
    verseForm: rng.weighted(VERSE_FORMS), chorusForm: rng.weighted(CHORUS_FORMS),
    lift: rng.int(M.lift[0], M.lift[1]) + G.lift, bridgeLift: 0, up: 0,
    register: M.register + G.register, span: jitter(rng, M.span * G.span, 0.1),
    leap: clamp01(jitter(rng, M.leap)), leaps: M.leaps, repeat: clamp01(jitter(rng, M.repeat + G.repeat)), stable: clamp01(jitter(rng, M.stable, 0.08)),
    lean: clamp01(jitter(rng, M.lean, 0.3)), melisma: clamp01(M.melisma + G.melisma),
    busyVerse: jitter(rng, M.busy * G.busy, 0.1), busyChorus: jitter(rng, M.busy * G.busy, 0.1), legato: Math.min(1, M.legato * G.legato),
    sync: clamp01(M.sync + G.sync), verseStart: rng.weighted(M.verseStart), chorusStart: rng.weighted(M.chorusStart),
    blue: clamp01(G.blue * (['happy', 'triumphant', 'angry'].includes(mood) ? 1 : 0.6)), dark: clamp01(M.dark + G.dark),
    hookLeap: rng.weighted(M.hookLeap), ends: rng.chance(0.8) ? M.ends : M.ends === 'fall' ? 'open' : 'fall',
    twist: null, singer, top: singer.top, timbre: pickTimbre(genre),
  };
  // the singer: their range, register, words per beat, and (about half the time) their own contours
  s.span *= singer.span;
  s.register += singer.register;
  // (a genre's voice: its tunes written where it sits best, lower than the clear voice's)
  if (s.timbre !== 'clear') s.register -= VOICE_DOWN[s.timbre];
  // (a higher singer chosen: the tunes written that much higher, in key)
  s.register += lift;
  s.up = lift;
  s.repeat = clamp01(s.repeat + singer.repeat);
  s.leap = clamp01(s.leap + singer.leap);
  s.busyVerse *= singer.density[0];
  s.busyChorus *= singer.density[1];
  if (singer.contours?.verse && rng.chance(0.55)) s.verse = rng.weighted(singer.contours.verse);
  if (singer.contours?.chorus && rng.chance(0.55)) s.chorus = rng.weighted(singer.contours.chorus);
  // the bridge goes somewhere else: higher than the chorus, or (in the sadder moods) down low and quiet
  s.bridgeLift = ['melancholic', 'dark', 'dreamy'].includes(mood) && rng.chance(0.4) ? -2 : s.lift + rng.int(0, 2);
  // a twist about a third of the time
  if (rng.chance(0.35)) {
    const twists = Object.keys(TWIST_FIT) as Twist[];
    const t = rng.weighted(twists.map((k) => [k, TWIST_FIT[k](mood, genre)] as [Twist, number]));
    s.twist = t;
    if (t === 'octave') { s.register -= 2; s.lift = Math.max(s.lift + 5, 9); s.verse = 'recite'; s.span *= 0.9; }
    else if (t === 'chant') { s.verse = 'recite'; s.repeat = Math.max(s.repeat, 0.55); s.leap *= 0.3; }
    else if (t === 'leap') s.hookLeap = rng.pick([5, 7]);
    else if (t === 'call') s.chorusForm = 'ABAB';
    else if (t === 'offbeat') { s.verseStart = 'after'; s.chorusStart = 'after'; s.sync = Math.max(s.sync, 0.4); }
    else if (t === 'long') { s.busyChorus *= 0.6; s.legato = 1; s.melisma = Math.max(s.melisma, 0.15); }
    else if (t === 'rapid') { s.busyVerse *= 1.35; s.legato = Math.min(s.legato, 0.75); }
  }
  return s;
}

const CONTOUR_DESC: Record<Contour, string> = {
  recite: 'reciting on a note', arch: 'arching', rise: 'rising to a late peak', fall: 'falling', valley: 'dipping and coming back up',
  climb: 'climbing', wave: 'rolling up and down', tumble: 'tumbling down from up high',
};
const START_DESC: Record<Start, string> = { down: 'on the beat', after: 'after the beat', pickup: 'with a pickup' };

/** The style in a line for the notes. */
export function melodyDesc(s: MelodyStyle): string {
  const bits = [`verses ${CONTOUR_DESC[s.verse]} (${s.verseForm}, starting ${START_DESC[s.verseStart]})`, `choruses ${CONTOUR_DESC[s.chorus]} (${s.chorusForm}), ${s.lift} up`];
  if (s.hookLeap >= 3) bits.push(`the hook leaps a ${['', '', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'][s.hookLeap]}`);
  if (s.lean >= 0.2) bits.push('sighs into held notes');
  if (s.melisma >= 0.15) bits.push('line ends turn on one vowel');
  if (s.blue >= 0.15) bits.push('blue notes');
  if (s.dark >= 0.2) bits.push('a dark flat 2nd');
  if (s.repeat >= 0.4) bits.push('lots of repeated notes');
  if (s.leap >= 0.2) bits.push('leaps');
  bits.push(s.ends === 'fall' ? 'lines fall home' : 'lines left open');
  return `${bits.join(', ')}${s.twist ? `; twist: ${TWIST_DESC[s.twist]}` : ''}`;
}

/** What a block of the song sings like. */
interface Plan { busy: number; span: number; toneStrong: number }
const PLANS: Partial<Record<SectionKind, Plan>> = {
  verse: { busy: 1.1, span: 7, toneStrong: 0.62 },
  prechorus: { busy: 1.2, span: 8, toneStrong: 0.7 },
  chorus: { busy: 0.8, span: 10, toneStrong: 0.82 },
  bridge: { busy: 0.9, span: 9, toneStrong: 0.75 },
  outro: { busy: 0.8, span: 10, toneStrong: 0.82 },
};

/** Genres lean the plan: grunge low, narrow and drawled; funk busy and short; metal long notes; pop wide. */
const GENRE_LEAN: Record<Genre, { busy: number; span: number; center: number }> = {
  rock: { busy: 1, span: 1, center: 0 },
  pop: { busy: 1, span: 1.05, center: 1 },
  funk: { busy: 1.2, span: 0.9, center: 0 },
  hardrock: { busy: 0.95, span: 1.05, center: 1 },
  metal: { busy: 0.9, span: 1.1, center: 1 },
  grunge: { busy: 0.95, span: 0.95, center: -1 },
  altmetal: { busy: 0.95, span: 1, center: 0 },
};

/**
 * The notes the melody may use, in the Western (English-language) way only for now (Paul: the tunes
 * "sound very much like Chinese vocals"; other traditions maybe later, docs/VOCAL.md): a major key's
 * tune walks the whole major scale, half steps and all (the major pentatonic alone, do-re-mi-so-la
 * stepped through, is the sound of East Asian folk and pop); a minor one's verse keeps the minor
 * pentatonic (the blues-rock singer's scale), its other sections the mode.
 */
function scaleFor(song: Song, kind: SectionKind): number[] {
  const minor = MINORISH.includes(song.mode);
  if (!minor) return [...SCALES[song.mode]];
  const pent = [0, 3, 5, 7, 10];
  return kind === 'verse' ? pent : [...new Set([...pent, ...SCALES[song.mode]])].sort((a, b) => a - b);
}

/**
 * Where `k` light syllables go between two stresses `gap` 16ths apart (offsets from the first), as
 * they're said: the stress held longest, the light ones bunched before the next stress (DUM . da-DUM).
 * Never quicker than 8ths, and on the 8ths (Paul: quick syllables "on beat... at the 1/8th at most").
 */
function spoken(rng: Rng, gap: number, k: number): number[] {
  if (k <= 0) return [];
  const T: Record<number, [number[], number][][]> = {
    4: [[], [[[2], 1]]],
    6: [[], [[[4], 2], [[2], 1]], [[[2, 4], 1]]],
    8: [[], [[[4], 2], [[6], 1.5], [[2], 0.5]], [[[4, 6], 2], [[2, 4], 0.7], [[2, 6], 0.5]], [[[2, 4, 6], 1]]],
  };
  if (T[gap]?.[k]) return rng.weighted(T[gap][k]);
  // (other gaps: bunched before the next stress, an 8th apart)
  return Array.from({ length: k }, (_, i) => gap - 2 * (k - i));
}

/** How much lower a genre's voice's range sits (its tunes are written that much lower: VOICE_DOWN). */
export const floorDown = (style: MelodyStyle) => (style.timbre !== 'clear' ? VOICE_DOWN[style.timbre] : 0);

/** The grid's step for a song (docs/VOCAL-RHYTHM.md): 8ths; 16ths under about 90 bpm (Paul: the grid tightens in slow songs). */
export const gridUnit = (bpm: number) => (bpm < 90 ? 1 : 2);

/**
 * A line's rhythm on the metronome grid (docs/VOCAL-RHYTHM.md; Paul: "akin to time signature
 * metronome's rhythm", a word's syllables "on 1/8ths ... with a nice sounding rhythm"; "if the song has
 * a different complex time signature, it may have to adapt to that"). The beats are the bar's own
 * groups, as its metronome counts them (4/4: four quarters; 6/8: two dotted quarters; 7/8: 2+2+3 or
 * another grouping; 7/4: 4+3+4+3 8ths), ranked like a metronome's accents: beat 1, the middle beat, the
 * others. Each beat is cut into its 8ths (16ths in a slow song): two in a quarter, three in a dotted
 * quarter, four in a half; a beat's own pattern of which ones are sung: its first nearly always on a
 * strong beat, a quarter inside a long group often, the 8ths between by how busy the section is
 * (verses busier, choruses open); now and then the last 8th before a strong beat sung as a push,
 * carrying its stress over the beat. The first half-bar's patterns come back through the line (its
 * motif) where the beats are the same size. Every new syllable on the grid. Verses start with a pickup
 * or just after the downbeat now and then, choruses on 1; the last syllable lands on beat 1 or the
 * middle beat of the last bar and holds to a beat before the next line (the breath).
 */
function gridRhythm(rng: Rng, bars: Bar[], o: PhraseOpts, u: number, kind: SectionKind): LineRhythm {
  const verse = kind === 'verse' || kind === 'prechorus';
  const dens = o.busy * (verse ? 1.2 : 0.75);
  // the beats: the bar's groups, by strength (3: the downbeat, 2: the middle beat, 1: the others)
  const beats: { g: number; len: number; st: number }[] = [];
  for (const b of bars) {
    const gs = groupStarts(b.groups);
    const mid = b.groups.length >= 4 && b.groups.length % 2 === 0 ? b.groups.length / 2 : -1;
    gs.forEach((x, gi) => beats.push({ g: b.start + x, len: b.groups[gi], st: gi === 0 ? 3 : gi === mid ? 2 : 1 }));
  }
  const b1 = bars[0], bl = bars[bars.length - 1];
  const lineEnd = bl.start + bl.len;
  // the held last syllable: beat 1 or the middle beat of the last bar (a one-bar line: its middle beat, or its last beat)
  const mids = beats.filter((x) => x.g >= bl.start && x.st === 2);
  let hold = bars.length === 1 ? (mids[0]?.g ?? beats.filter((x) => x.g >= bl.start).slice(-1)[0].g)
    : rng.chance(mids.length ? 0.6 : 1) ? bl.start : mids[0].g;
  if (hold - 2 > b1.start + 2 && rng.chance(o.sync * 0.4)) hold -= 2;
  const breath = bl.groups[bl.groups.length - 1];
  const end = Math.max(hold + 2, lineEnd - breath);
  // where the line starts, by section: verses a pickup or just after the downbeat now and then, choruses on 1
  const start: Start = verse ? rng.weighted<Start>([['pickup', 2], ['after', 1.5], ['down', 1.5]]) : kind === 'chorus' || kind === 'outro' ? 'down' : o.start;
  const onsets: { g: number; stress: boolean; quick?: boolean }[] = [];
  if (start === 'pickup') { onsets.push({ g: b1.start - u, stress: false }); if (rng.chance(0.35)) onsets.push({ g: b1.start - 2 * u, stress: false }); }
  // a slot's weight inside its beat: its first (the beat's own), a quarter inside a long group, an 8th, a 16th
  const slotSt = (off: number, st: number) => (off === 0 ? st : off % 4 === 0 ? 1 : off % 2 === 0 ? 0.5 : 0.2);
  // a beat's pattern: a cell real vocal lines use, by its size in grid steps (Paul: the grid gave "a bunch
  // of back to back 1/4 bar length notes": each 8th between the beats was a rare coin toss, so nearly
  // every beat sang one quarter note): a quarter, two 8ths, the "and" after a rest, held over; in a
  // three-8th beat, its own cells. Busier sections pick the quicker cells; a strong beat starts on its
  // beat nearly always. Beats of other sizes are cut into twos and threes.
  const CELLS: Record<number, [string, number][]> = {
    2: [['x.', 0.8], ['xx', 1.2 * dens], ['.x', 0.4], ['..', 0.5 / dens]],
    3: [['x..', 0.8], ['x.x', 0.8], ['xx.', 0.35 * dens], ['xxx', 0.3 * dens], ['..x', 0.2], ['...', 0.3 / dens]],
  };
  const cell = (slots: number, st: number): boolean[] => {
    if (!CELLS[slots]) {
      const a = slots % 2 && slots > 3 ? 3 : 2;
      return slots <= 1 ? [rng.chance(st >= 2 ? 0.95 : 0.6)] : [...cell(a, st), ...cell(slots - a, 0)];
    }
    const ws = CELLS[slots].map(([c, w]): [string, number] => [c, c[0] === '.' ? w * (st >= 3 ? 0.08 : st >= 2 ? 0.2 : 1) : w]);
    return [...rng.weighted(ws)].map((c) => c === 'x');
  };
  const pattern = (bt: { len: number; st: number }) => cell(Math.max(1, Math.ceil(bt.len / u)), bt.st);
  const before = beats.filter((x) => x.g < hold);
  const half = Math.max(1, before.filter((x) => x.g < b1.start + b1.len / 2).length);
  const motif: boolean[][] = [];
  let tiedIn = false;
  before.forEach((bt, i) => {
    const m = motif[i % half];
    let p = i >= half && m && m.length === Math.floor(bt.len / u) + (bt.len % u ? 1 : 0) && rng.chance(0.65) ? [...m] : pattern(bt);
    if (i < half) motif.push([...p]);
    // (a beat pushed into: its stress came early, nothing on the beat itself)
    if (tiedIn) p[0] = false;
    tiedIn = false;
    // (back-heavy verses: nothing on the downbeat they start after)
    if (i === 0 && start === 'after') p[0] = false;
    const next = before[i + 1] ?? { g: hold, st: 3, len: 0 };
    // (a push: the last 8th before a strong beat, now and then)
    const lastSlot = p.length - 1;
    if (lastSlot > 0 && next.st >= 2 && next.g === bt.g + bt.len && !p[lastSlot] && i > 0 && rng.chance(o.syncop * 0.25)) p[lastSlot] = true;
    p.forEach((on, j) => {
      if (!on) return;
      const off = j * u;
      const push = j === lastSlot && j > 0 && next.st >= 2 && next.g === bt.g + bt.len && rng.chance(0.5);
      onsets.push({ g: bt.g + off, stress: push || slotSt(off, bt.st) >= 1 });
      if (push) tiedIn = true;
    });
  });
  // (a push straight into the held note: the held note itself comes on the 8th before it)
  if (tiedIn) { const k = onsets.findIndex((x) => x.g === hold - u); if (k >= 0) { onsets.splice(k, 1); hold -= u; } }
  const seen = new Set<number>();
  const os = [...onsets.filter((x) => x.g < hold), { g: hold, stress: true }]
    .filter((x) => (seen.has(x.g) ? false : (seen.add(x.g), true))).sort((a, b) => a.g - b.g)
    .map((x) => (x.g % 2 ? { ...x, quick: true } : x));
  return { onsets: os, end };
}

/** A line's rhythm: onsets (absolute steps) with stress (`quick`: a light syllable on a 16th, see `fine`), and where its last (held) note ends. */
interface LineRhythm { onsets: { g: number; stress: boolean; quick?: boolean }[]; end: number }

type HoldLen = 'short' | 'mid' | 'long';
interface PhraseOpts { busy: number; start: Start; sync: number; flow: number; syncop: number; hold: number; holdLen: HoldLen; changes: number[]; fine: boolean; slow: number }

/**
 * A sung line's rhythm over one to four bars: words from the top (or a pickup, or after the beat) up to
 * the held note, then a breath. The held note lands in the last bar after a beat or two; a short one
 * lasts a beat; a long one lands in the bar before and is held through the bar line (a bar and a half:
 * the wail). The words are set as spoken (stresses on beats, light syllables between them, see below),
 * by the singer's ways: how busy, pushed, drawn out. A four-bar line catches a quick breath halfway.
 */
function phraseRhythm(rng: Rng, bars: Bar[], o: PhraseOpts): LineRhythm {
  const onsets: { g: number; stress: boolean; quick?: boolean }[] = [];
  const b1 = bars[0], bl = bars[bars.length - 1];
  const g1 = groupStarts(b1.groups), gl = groupStarts(bl.groups);
  const nl = bl.groups.length;
  // a pickup: an 8th or two before the line, in the gap the last line left
  if (o.start === 'pickup' && b1.start >= 2 && rng.chance(0.8)) {
    const n = rng.chance(0.5) ? 2 : 1;
    for (let k = n; k >= 1; k--) onsets.push({ g: b1.start - 2 * k, stress: false });
  }
  // where the held note lands, and where the line ends (the breath after it)
  const breath = nl >= 4 ? bl.groups[nl - 1] + (rng.chance(0.4) ? bl.groups[nl - 2] : 0) : bl.groups[nl - 1];
  let hold: number, end: number;
  if (o.holdLen === 'long' && bars.length >= 2) {
    const pen = bars[bars.length - 2], gp = groupStarts(pen.groups);
    hold = pen.start + gp[Math.max(1, pen.groups.length - rng.weighted([[1, 2], [2, 2]]))];
    end = bl.start + bl.len - (rng.chance(0.5) ? breath : bl.groups[nl - 1]);
  } else if (bars.length === 1) {
    hold = b1.start + g1[Math.max(1, b1.groups.length - (o.holdLen === 'short' ? 1 : 2))];
    end = o.holdLen === 'short' ? hold + Math.min(3, b1.start + b1.len - hold) : b1.start + b1.len - (rng.chance(0.5) ? 2 : 0);
  } else {
    // (a slow song: more of the line sung, the held note later)
    const sung = Math.max(0, Math.min(nl - 2, rng.weighted([[0, 2 * (1 - o.slow * 0.6)], [1, 3], [2, 1 + 3 * o.slow]])));
    hold = bl.start + gl[sung];
    end = o.holdLen === 'short' ? hold + bl.groups[sung] : bl.start + bl.len - breath;
  }
  // (the held note lands with a chord change nearby: the voice moves with the band)
  const near = o.changes.filter((c) => c > b1.start + 2 && c < end - 2 && c !== hold && Math.abs(c - hold) <= 4);
  if (near.length && !o.changes.includes(hold) && rng.chance(0.75)) hold = near.reduce((a, c) => (Math.abs(c - hold) < Math.abs(a - hold) ? c : a));
  // (rock's anticipation: the held note lands an 8th early)
  if (rng.chance(0.1 + o.sync * 0.5) && hold - 2 > b1.start + 2) hold -= 2;
  // the words up to the held note, set as English is spoken (Paul: the rhythm "like it's running on a
  // drum beat", then "still weird and unnatural": every beat filled with a cell made even 8ths): the
  // stressed syllables land on beats (nearly every strong beat, some weak ones, by how busy), now and
  // then pushed an 8th early; between two stresses go none to three light syllables, placed as
  // they're said (long on the stress, short before the next: DUM-da, DUM . da-da), so the gaps between
  // syllables vary the way speech does
  const mid = bars.length >= 4 && rng.chance(0.6) ? bars[Math.floor(bars.length / 2)].start : -1;
  const beats: { g: number; strong: boolean }[] = [];
  bars.forEach((b) => groupStarts(b.groups).forEach((x, gi) => {
    const g = b.start + x;
    if (g < hold && !(mid > 0 && g < mid && g + b.groups[gi] >= mid)) beats.push({ g, strong: gi === 0 || (b.groups.length >= 4 && gi === b.groups.length / 2) });
    // (a fine line is sung in double time: its 8ths are its beats, the light syllables on the 16ths)
    const h = g + 2;
    if (o.fine && b.groups[gi] >= 4 && h < hold && !(mid > 0 && h < mid && g + b.groups[gi] >= mid)) beats.push({ g: h, strong: false });
  }));
  beats.sort((a, c) => a.g - c.g);
  const pWeak = Math.max(0.1, Math.min(0.6, 0.3 + 0.4 * (o.busy - 1))) * (o.fine ? 1.3 : 1);
  const stresses: number[] = [];
  let drawn = false;
  for (const bt of beats) {
    // (a word drawn out over the beat after it)
    if (drawn) { drawn = false; continue; }
    if (o.start === 'after' && bt.g === b1.start) continue;
    if (!rng.chance(bt.strong ? 0.9 : pWeak)) continue;
    let g = bt.g;
    // (pushed: sung ahead of the beat)
    const last = stresses[stresses.length - 1] ?? -99;
    if (stresses.length && rng.chance(o.syncop * 0.35) && g - 2 - last >= 2) g -= 2;
    stresses.push(g);
    if (rng.chance(o.hold * 0.6)) drawn = true;
  }
  // the light syllables between: how many by the gap and how busy; where, as said
  const kWeights = (gap: number): [number, number][] => [
    [0, gap >= 4 ? 0.5 + o.hold : 0.25], [1, 1.6], [2, gap >= 3 ? 0.8 * o.busy : 0], [3, gap >= 4 ? 0.12 * o.busy + 0.4 * o.flow : 0],
  ];
  const setLight = (from: number, to: number, lead: boolean) => {
    const gap = to - from;
    if (gap < 2) return;
    // a fine line (a slow song): the light syllables on 16ths, said twice as quick
    if (o.fine) {
      const k = rng.weighted(kWeights(gap * 2).filter(([x]) => x <= Math.min(3, gap - 1)));
      const ps = [...new Set(spoken(rng, gap * 2, k).map((p) => Math.round(p / 2)))].filter((p) => p > 0 && p < gap);
      for (const p of ps) onsets.push({ g: from + p, stress: false, quick: p % 2 === 1 });
      return;
    }
    const most = Math.min(3, Math.floor(gap / 2) - 1);
    if (most < 0) return;
    const k = rng.weighted(kWeights(gap).filter(([x]) => x <= most));
    for (const p of spoken(rng, gap, k)) onsets.push({ g: from + p, stress: false });
    if (lead && !k && gap >= 3 && rng.chance(0.5)) onsets.push({ g: to - 2, stress: false });
  };
  if (stresses.length) {
    // (before the first stress: a lead-in of light words, or a rest)
    const first = stresses[0];
    if (first > b1.start + 1) setLight(b1.start, first, true);
    stresses.forEach((g, i) => {
      onsets.push({ g, stress: true });
      setLight(g, stresses[i + 1] ?? hold, false);
    });
  } else setLight(b1.start, hold, true);
  // back-heavy: the line starts after the downbeat (on its "and", or the next beat)
  if (o.start === 'after') {
    const first = onsets.findIndex((x) => x.g === b1.start);
    if (first >= 0) onsets.splice(first, 1);
    const nextGroup = b1.start + (g1[1] ?? b1.len);
    if (!onsets.some((x) => x.g > b1.start && x.g < nextGroup) && b1.groups[0] >= 3) onsets.push({ g: b1.start + 2, stress: false });
  }
  // anticipations: a strong beat inside the line sung an 8th early
  for (const x of onsets) {
    if (!x.stress || x.g === b1.start || !rng.chance(o.sync * 0.5)) continue;
    const to = x.g - 2;
    if (to > b1.start && !onsets.some((y) => y.g >= to && y.g < x.g)) x.g = to;
  }
  // the held note, nothing after it, no two notes on one step
  const seen = new Set<number>();
  const os = [...onsets.filter((x) => x.g < hold), { g: hold, stress: true }]
    .filter((x) => (seen.has(x.g) ? false : (seen.add(x.g), true))).sort((a, b) => a.g - b.g);
  return { onsets: os, end: Math.max(hold + 2, end) };
}

/**
 * One note of a tune; `tie`: sung on the last note's vowel (a sigh, a turn, a run), no new syllable;
 * `slide`: scooped up into from so many semitones below; `fall`: falls off its end by so many; `belt`: a wail;
 * `peak`: a high note held (a belt, or a jump up to the line's top: held half a bar, never falling off).
 */
export interface TuneNote { step: number; len: number; midi: number; stress: boolean; start: boolean; line: number; tie?: boolean; slide?: number; fall?: number; belt?: boolean; quick?: boolean; run?: boolean; colour?: boolean; peak?: boolean }
/** A melody block (one section's worth), before its words. */
export interface Tune { notes: TuneNote[]; lines: number }

/** Where a contour sits at x (0-1 through the line), in scale steps from the line's anchor. */
function contourAt(c: Contour, x: number, h: number, peak: number): number {
  switch (c) {
    case 'recite': return x > 0.7 ? -2 * (x - 0.7) / 0.3 : 0;
    case 'arch': return x <= peak ? h * (x / peak) - h / 3 : h * (1 - (x - peak) / (1 - peak)) * 0.8 - h / 3;
    case 'rise': return x < 0.85 ? h * (x / 0.85) - h / 2 : h / 2 - 1;
    case 'fall': return h / 2 - h * x;
    case 'valley': return h * Math.abs(x - 0.5) * 1.6 - h / 3;
    case 'climb': return h * x - h / 3;
    case 'wave': return (h / 2) * Math.sin(2 * Math.PI * x);
    case 'tumble': return x < 0.8 ? h * 0.7 - h * 1.2 * (x / 0.8) : -h / 2 + h * 0.3 * ((x - 0.8) / 0.2);
  }
}

/** A line's onsets before its split (its first half: the motif; the rest is its answer). */
const headOf = (rh: LineRhythm, split: number) => rh.onsets.filter((o) => o.g < split);
/** Where a line splits into motif and answer: its middle bar line (a one-bar line: its middle beat). */
const splitOf = (L: Bar[]) => (L.length > 1 ? L[Math.floor(L.length / 2)].start : L[0].start + groupStarts(L[0].groups)[Math.floor(L[0].groups.length / 2)]);

interface Motif { rh: LineRhythm; start: number; split: number; lens: number[]; shape: number[]; alt: number[] }

/**
 * The tune of a block: lines of one to four bars (the singer's phrase plan) written by the style's form
 * and contour for `kind`; `base`: the verse's centre pitch (the song's anchor). Steps are relative to
 * the block's start.
 */
export function writeTune(rng: Rng, song: Song, chords: ChordPart, kind: SectionKind, base: number, genre: Genre, style: MelodyStyle, band?: Band): Tune {
  const H = harmonyOf(song, chords);
  const P = PLANS[kind] ?? PLANS.verse!;
  const G = GENRE_LEAN[genre];
  const { key, bars, total, mode } = song;
  const scale = scaleFor(song, kind);
  const big = kind === 'chorus' || kind === 'outro';
  const lift = big ? style.lift : kind === 'prechorus' ? Math.round(style.lift / 2) : kind === 'bridge' ? style.bridgeLift : 0;
  // (shaped: a genre's voice, written lower, has its floor and ceiling lower too: its range not squeezed
  // against the clear voice's floor, which left a low voice's verse two notes wide)
  const off = style.up - (style.shaped ? Math.min(3, floorDown(style)) : 0);
  const spanX = !style.shaped ? 1 : kind === 'verse' ? 0.75 : big ? (style.contrast === 'dramatic' ? 1.5 : style.contrast === 'subtle' ? 1.1 : 1.3) : 1;
  // (at least about a 6th: narrower, a low voice's lines circled two or three notes)
  const span = Math.max(style.shaped ? (big ? 10 : 8) : 8, Math.round(P.span * G.span * style.span * spanX));
  // (shaped: the centre high enough off the floor for the whole range to fit above it)
  const floorC = Math.max(FLOOR + style.up + Math.ceil(span / 2), style.shaped ? LOW[0] + off - 3 + Math.ceil(span / 2) : LOW[0] + off + 2);
  let center = Math.max(floorC, Math.min(PEAK + off - 5, base + G.center + style.register + lift));
  // (the lift measured from where the verse really sits, so a floor can't flatten it: a low voice's
  // verse and chorus both pressed onto the floor sang on the same few notes)
  if (lift) {
    const vSpan = style.shaped ? Math.max(8, Math.round(P.span * G.span * style.span * 0.75)) : Math.max(8, Math.round((PLANS.verse ?? P).span * G.span * style.span));
    const verseC = Math.max(FLOOR + style.up + Math.ceil(vSpan / 2), style.shaped ? LOW[0] + off - 3 + Math.ceil(vSpan / 2) : LOW[0] + off + 2, base + G.center + style.register);
    center = Math.max(center, Math.min(PEAK + off - 5, verseC + lift));
  }
  // (the energy style's height for this section: after the lift, within the voice)
  if (style.energyReg) center = Math.max(floorC, Math.min(PEAK + off - 4, center + style.energyReg));
  // (shaped: verses low and narrow, choruses wide, more so in a dramatic song: spanX above)
  // (never under the floor; a range pushed up off it keeps its width)
  let lo = Math.max(FLOOR + style.up, LOW[0] + off - 3, center - Math.ceil(span / 2)), hi = Math.min(PEAK + off - 2, Math.max(center + Math.floor(span / 2), lo + span));
  // (at least six notes to sing, seven in a chorus: a pentatonic verse over a 6th had four, two of them
  // the chord's, so its strong notes could only rock between two pitches; Paul: "notes are almost always
  // just repeating"): the range widened a scale note at a time, up first, then down, within the voice)
  const inScale = (m: number) => scale.includes(mod(m - key, 12));
  const count = () => { let c = 0; for (let m = lo; m <= hi; m++) if (inScale(m)) c++; return c; };
  const next = (m: number, d: number) => { do m += d; while (!inScale(m)); return m; };
  // (melody first: two more, room for the tune's own line: its idea's leap and the spine's travel)
  for (let k = 0; k < 24 && count() < (big ? 7 : 6) + (style.first ? 2 : 0); k++) {
    if (k % 2 === 0 && next(hi, 1) <= PEAK + off) hi = next(hi, 1);
    else if (next(lo, -1) >= FLOOR + style.up) lo = next(lo, -1);
    else if (next(hi, 1) <= PEAK + off) hi = next(hi, 1);
    else break;
  }
  const pool: number[] = [];
  for (let m = lo; m <= hi; m++) if (inScale(m)) pool.push(m);
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(Math.max(0, g), total - 1)]].chord;
  const tonesAt = (g: number) => chordTones(key, chordAt(g));
  const isTone = (m: number, g: number) => tonesAt(g).includes(mod(m, 12));
  const rubs = (m: number, g: number) => !isTone(m, g) && (tonesAt(g).some((c) => [1, 11].includes(mod(m - c, 12))) || mod(m - chordPc(key, chordAt(g)), 12) === 6);
  const nearestIdx = (m: number) => pool.reduce((bi, x, i) => (Math.abs(x - m) < Math.abs(pool[bi] - m) ? i : bi), 0);
  const clampIdx = (i: number) => Math.max(0, Math.min(pool.length - 1, i));
  // a leap of so many scale steps (a 4th, 5th, 6th...), in semitones whatever the scale (verses are pentatonic)
  const leapTo = (from: number, steps: number) => nearestIdx(pool[from] + Math.sign(steps) * (LEAP_SEMIS[Math.abs(steps)] ?? 12));
  const nearTone = (idx: number, g: number, ok: (m: number) => boolean = () => true, below = false) => {
    if (isTone(pool[idx], g) && ok(pool[idx])) return idx;
    for (let d = 1; d < pool.length; d++) {
      const cands = below ? [idx - d, idx + d] : [idx + d, idx - d];
      const j = cands.find((x) => x >= 0 && x < pool.length && isTone(pool[x], g) && ok(pool[x]));
      if (j !== undefined) return j;
    }
    return idx;
  };

  const contour: Contour = kind === 'verse' ? style.verse : kind === 'prechorus' ? 'climb' : kind === 'bridge' ? style.bridge : style.chorus;
  // (by tempo: singers phrase in longer notes over a fast band and fill a slow one with words, so the
  // syllables per second stay singable)
  const pace = Math.max(0.7, Math.min(1.35, (110 / song.bpm) ** 0.6));
  // (a slow song isn't sung slowly: now and then a line's words come on 16ths, the way a singer
  // phrases over a ballad; more in verses, not every line; Paul: "some inherent base energy")
  const eighth = 30 / song.bpm;
  const slow = Math.max(0, Math.min(1, (eighth - 0.3) / 0.14));
  const fineChance = slow * 0.8 * (kind === 'verse' || kind === 'prechorus' ? 1 : 0.6);
  const busy = P.busy * G.busy * (kind === 'verse' || kind === 'prechorus' ? style.busyVerse : style.busyChorus) * (kind === 'prechorus' ? 1.1 : 1) * pace;
  const start: Start = kind === 'verse' ? style.verseStart : big ? style.chorusStart : rng.pick<Start>(['down', 'pickup']);
  const height0 = (kind === 'verse' ? (contour === 'recite' ? 1 : 2.5) : kind === 'prechorus' ? 3 : rng.pick([3, 4, 4, 5])) * Math.min(1.35, style.span);
  const peak = rng.pick([0.35, 0.5, 0.6]);
  const minorish = MINORISH.includes(mode);
  const singer = style.singer;

  // the lines: the singer's phrase plan (a long line travels further, a short one less)
  const plan = phrasePlan(rng, singer, kind, bars.length);
  const lines: Bar[][] = [];
  for (let i = 0, k = 0; k < plan.length; i += plan[k++]) lines.push(bars.slice(i, i + plan[k]));
  // the form: a letter per line (a line as long as an earlier one sings it again, or the same start with a
  // new ending); even lines follow the style's form (one-bar lines in pairs: a call, then its answer, the
  // same start with a new ending)
  const even = plan.every((x) => x === plan[0]);
  // (the grid: lines in pairs, 1 and 3 one rhythm, 2 and 4 another, or A A B A; Paul's pick)
  // (shaped: repeat, then vary: the idea, its answer, the idea again on the new chords, the answer with a new ending)
  const styleForm = style.shaped && (kind === 'verse' || big) ? 'ABAb'
    : style.grid && (kind === 'verse' || big) ? rng.weighted([['ABAB', 0.7], ['AABA', 0.3]])
    : kind === 'verse' ? style.verseForm : big || kind === 'bridge' ? style.chorusForm : 'AAAB';
  let form = '';
  if (even && plan[0] === 1) for (let li = 0; li < lines.length; li++) { const x = styleForm[(li >> 1) % styleForm.length]; form += li % 2 ? x.toLowerCase() : x; }
  else if (even) for (let li = 0; li < lines.length; li++) form += styleForm[li % styleForm.length];
  else {
    let nextLetter = 0;
    plan.forEach((len, li) => {
      const j = plan.findIndex((x, k) => k < li && x === len);
      form += j < 0 ? 'ABCDEFGH'[nextLetter++] : rng.chance(0.65) ? form[j].toUpperCase() : form[j].toLowerCase();
    });
  }
  // a pre-chorus climbs by sequence: the same line, a step higher each time
  const seq = kind === 'prechorus' ? rng.pick([1, 1, 2]) : 0;
  const motifs = new Map<string, Motif>();
  const notes: TuneNote[] = [];
  const last = lines.length - 1;

  /**
   * A line's pitches, shaped (docs/VOCAL-MELODY.md; Paul: melodies "too samey / flat", not fitting the
   * chords, not genre-like): first a path of chord notes on its strong notes (each the chord's own, moving
   * smoothly: a common tone, or the nearest new chord note, under the line's arc), then the notes between
   * by step (passing and neighbour notes); a repeated line's motif moved to sit on the new chord; each
   * genre's colour (pop's pentatonic sing-song, rock's blue notes, grunge's drone over moving chords, alt
   * metal's one-note verses, metal's roots and 5ths, funk's chromatic approach notes).
   */
  const shapedLine = (rng: Rng, rh: LineRhythm, anchor: number, keep: number, li: number) => {
    const n = rh.onsets.length;
    const lens = rh.onsets.map((o, oi) => (oi === n - 1 ? rh.end : rh.onsets[oi + 1].g) - o.g);
    const idxs: number[] = new Array(n).fill(-1);
    const alts: number[] = new Array(n).fill(0);
    const prevM = lineMotif.get(form[li].toUpperCase());
    // a repeated line: its motif, moved to sit on the new chord (its first strong note on a chord note)
    if (prevM && keep) {
      const fs = rh.onsets.findIndex((o, oi) => oi < keep && oi < prevM.shape.length && o.stress);
      let d0 = 0;
      if (fs >= 0) d0 = [0, 1, -1, 2, -2].find((d) => isTone(pool[clampIdx(anchor + prevM.shape[fs] + d)], rh.onsets[fs].g)) ?? 0;
      for (let oi = 0; oi < Math.min(keep, prevM.shape.length, n); oi++) { idxs[oi] = clampIdx(anchor + d0 + prevM.shape[oi]); alts[oi] = prevM.alt[oi]; }
    }
    const closed = li === last || (style.ends === 'fall' && li % 2 === 1);
    const heavy = genre === 'metal' || genre === 'hardrock' || genre === 'altmetal';
    // a drone (grunge; alt metal's verses): the strong notes held on one note as the chords move under it
    // (short lines only: a long one on one note wears thin)
    const drone = n <= 10 && rng.chance(genre === 'grunge' ? 0.4 : genre === 'altmetal' && kind === 'verse' ? 0.55 : 0)
      ? nearestIdx(pool.reduce((b, m) => ([7, minorish ? 3 : 4].includes(mod(m - key, 12)) && Math.abs(m - pool[anchor]) < Math.abs(b - pool[anchor]) ? m : b), pool[anchor])) : -1;
    // the path: the strong notes (and the first, the last, the long ones) on chord notes
    let prevStrong = anchor, prevG = rh.onsets[0]?.g ?? 0, sameRun = 0;
    for (let oi = 0; oi < n; oi++) {
      if (idxs[oi] >= 0) { prevStrong = idxs[oi]; prevG = rh.onsets[oi].g; continue; }
      const o = rh.onsets[oi], isLast = oi === n - 1;
      if (!(o.stress || isLast || oi === 0 || lens[oi] >= 4)) continue;
      if (drone >= 0 && !isLast) { idxs[oi] = drone; prevStrong = drone; continue; }
      const x = n > 1 ? oi / (n - 1) : 1;
      const target = anchor + contourAt(contour, x, height0 * (big ? 1.3 : 1), peak);
      const tones = tonesAt(o.g);
      let best = -1, bestC = Infinity;
      for (let j = 0; j < pool.length; j++) {
        const pc = mod(pool[j], 12), deg = mod(pool[j] - key, 12);
        if (!tones.includes(pc)) continue;
        // (moving a step or two is the norm, a leap costs more by its size (less in a heavy chorus); the same note
        // again only pays off as a common tone over a new chord, or in grunge's drones: a line that moves, not one note)
        const dist = Math.abs(j - prevStrong);
        const newChord = tonesAt(prevG).join() !== tones.join();
        let c = Math.abs(j - target) * 0.6 + Math.max(0, dist - 2) * (heavy && big ? 0.22 : 0.45);
        if (dist === 0) c += (genre === 'grunge' ? -0.4 : newChord ? 0.15 : 0.9) + sameRun * 0.8;
        if (heavy && (deg === 0 || deg === 7)) c -= 0.35;
        if (isLast) c += closed ? (deg === 0 ? -2 : 1) : deg === 0 ? 0.8 : genre === 'pop' && (deg === 4 || deg === 7) ? -0.6 : 0;
        c += rng.next() * 0.5;
        if (c < bestC) { bestC = c; best = j; }
      }
      idxs[oi] = best >= 0 ? best : clampIdx(Math.round(target));
      sameRun = idxs[oi] === prevStrong ? sameRun + 1 : 0;
      prevStrong = idxs[oi];
      prevG = o.g;
    }
    // pop's hook: the chorus's first line sings 5-6-5-3 on its first notes now and then
    if (genre === 'pop' && big && li === 0 && !minorish && rng.chance(0.5)) {
      const degs = [7, 9, 7, 4];
      let k = 0;
      for (let oi = 0; oi < n - 1 && k < degs.length; oi++) {
        if (oi >= 1 && !rh.onsets[oi].stress && k === 0) continue;
        const want = degs[k++];
        const near = pool.reduce((b, m, j) => (mod(m - key, 12) === want && (b < 0 || Math.abs(j - anchor) < Math.abs(b - anchor)) ? j : b), -1);
        if (near >= 0) { idxs[oi] = near; alts[oi] = 0; }
      }
    }
    // the notes between: by step, passing toward the next path note, or a neighbour and back
    let lastTurn = '';
    for (let oi = 0; oi < n; oi++) {
      if (idxs[oi] >= 0) continue;
      const before = oi > 0 ? idxs[oi - 1] : anchor;
      let ni = oi + 1;
      while (ni < n && idxs[ni] < 0) ni++;
      const to = ni < n ? idxs[ni] : before;
      const d = Math.sign(to - before);
      // (between two of the same note: the note again, the one above or below; never the same turn twice running: no zig-zag)
      let j = before;
      if (d) j = before + d;
      else {
        const opts = ([['same', 0.35], ['up', 0.4], ['down', 0.25]] as [string, number][]).filter(([k]) => k !== lastTurn);
        const t = rng.weighted(opts);
        lastTurn = t;
        j = t === 'up' ? before + 1 : t === 'down' ? before - 1 : before;
      }
      // (arriving early on the next path note would sing it twice: a neighbour instead, past it or back)
      if (d && (j - to) * d >= 0) j = rng.chance(0.5) ? to + d : before - d;
      j = clampIdx(j);
      const deg = mod(pool[j] - key, 12);
      // pop: sing-song, the pentatonic (and the 6th) between the path notes
      if (genre === 'pop' && !minorish && (deg === 5 || deg === 11)) j = clampIdx(j + (d || 1));
      idxs[oi] = j;
      const short = lens[oi] <= 2;
      // rock and grunge: a blue 3rd or 7th in passing over major chords
      if ((genre === 'rock' || genre === 'grunge' || genre === 'hardrock') && short && !minorish && (deg === 4 || deg === 11) && rng.chance(Math.min(0.6, style.blue * 1.6))) alts[oi] = -1;
      // funk: a chromatic step into the next strong note
      if (genre === 'funk' && short && ni === oi + 1 && ni < n && rng.chance(0.35)) { idxs[oi] = idxs[ni]; alts[oi] = rng.chance(0.6) ? -1 : 1; }
    }
    // one clear high point: a later note matching the line's top (not the path's) steps down
    const top = Math.max(...idxs.map((x, k) => pool[x] + alts[k]));
    let seenTop = false;
    idxs.forEach((x, k) => { if (pool[x] + alts[k] !== top) return; if (seenTop && !rh.onsets[k].stress && k !== n - 1) idxs[k] = clampIdx(x - 1); seenTop = true; });
    const lineNotes: TuneNote[] = rh.onsets.map((o, oi) => ({ step: o.g, len: Math.max(1, lens[oi]), midi: pool[idxs[oi]] + alts[oi], stress: o.stress, start: oi === 0, line: li, ...(o.quick ? { quick: true } : {}) }));
    return { rh, shape: idxs.map((x) => x - anchor), alt: alts, lineNotes };
  };
  const lineMotif = motifs;

  // Melody first (docs/VOCAL-FIRST.md): the section's spine, the song's idea, now and then a loop
  const fs = style.first;
  const spine = fs ? fs.spine[kind === 'outro' ? 'chorus' : kind === 'prechorus' || kind === 'bridge' || kind === 'chorus' ? kind : 'verse'] : 'arch';
  const home = clampIdx(nearestIdx(center));
  const spineX = big ? 1.2 : 1;
  const spineIdx = (t: number) => clampIdx(home + Math.round(spineAt(spine, t) * spineX));
  // (scale steps a leap of so many semitones spans, in this section's scale)
  const leapSteps = (semis: number) => Math.sign(semis) * Math.max(2, Math.round((Math.abs(semis) * scale.length) / 12));
  /** The idea from pool index `from` (inverted: the answer, its leap the other way), kept inside the range. */
  const realize = (from: number, inv: boolean): number[] => {
    const a = realizeAs(from, inv), b = realizeAs(from, !inv);
    // (an answer that won't fit the range its way round leaps the idea's way instead: moved whole, it started far from the spine)
    return Math.abs(a[0] - from) <= 1 || Math.abs(b[0] - from) >= Math.abs(a[0] - from) ? a : b;
  };
  const realizeAs = (from: number, inv: boolean, steps = pool.length) => {
    const f = inv ? -1 : 1;
    const out = [from];
    let cur = from;
    for (const d of fs!.idea.pre) out.push((cur += f * d));
    out.push((cur += f * leapSteps(fs!.idea.sig)));
    for (const d of fs!.idea.post) out.push((cur += f * d));
    const top = Math.max(...out), bot = Math.min(...out);
    const shift = top > steps - 1 ? steps - 1 - top : bot < 0 ? -bot : 0;
    return out.map((x) => x + shift);
  };
  // the loop (rock genres, now and then: Temperley's melodic-harmonic divorce): the idea on the pentatonic,
  // the same notes every bar whatever the chord
  const looping = !!fs && (kind === 'verse' || big) && rng.chance(fs.loop);
  const pent = pool.map((m, i) => [m, i] as const).filter(([m]) => (minorish ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]).includes(mod(m - key, 12))).map(([, i]) => i);
  // (the cell in pentatonic steps, from the root or 5th nearest the centre, kept inside the range)
  const loopCell: number[] = [0];
  if (looping) {
    const ps = (semis: number) => Math.sign(semis) * Math.max(1, Math.round((Math.abs(semis) * 5) / 12));
    let cur = 0;
    for (const d of fs.idea.pre) loopCell.push((cur += d));
    loopCell.push((cur += ps(fs.idea.sig)));
    for (const d of fs.idea.post) loopCell.push((cur += d));
  }
  const loopFrom = (() => {
    if (!looping || !pent.length) return 0;
    let f = pent.reduce((b, i, k) => ([0, 7].includes(mod(pool[i] - key, 12)) && (b < 0 || Math.abs(i - home) < Math.abs(pent[b] - home)) ? k : b), -1);
    if (f < 0) f = 0;
    const top = Math.max(...loopCell), bot = Math.min(...loopCell);
    return Math.max(-bot, Math.min(pent.length - 1 - top, f));
  })();
  // (a real clash: a half step against a chord note, or a tritone off the root)
  const grindsAt = (m: number, g: number) => !isTone(m, g) && (tonesAt(g).some((c) => [1, 11].includes(mod(m - c, 12))) || mod(m - chordPc(key, chordAt(g)), 12) === 6);

  /**
   * A line's pitches, melody first (docs/VOCAL-FIRST.md): its head the song's idea (an answer line: the idea
   * inverted; a repeated line: its motif, moved to where the spine now is), then by step toward the spine's
   * next note (gap-fill after a leap, a neighbour when there already); only then fitted to the chords: the
   * strong notes, the first and the last moved to the nearest chord note (keeping the line's direction),
   * now and then a 9th or 4th left as a colour; the line's end closed on the root, or open.
   */
  const firstLine = (rng: Rng, rh: LineRhythm, keep: number, li: number) => {
    const n = rh.onsets.length;
    const lens = rh.onsets.map((o, oi) => (oi === n - 1 ? rh.end : rh.onsets[oi + 1].g) - o.g);
    const idxs: number[] = new Array(n).fill(0);
    const colour: boolean[] = new Array(n).fill(false);
    const nl = lines.length;
    const s0 = spineIdx(li / nl);
    // (a closed section's last line comes home: its spine's end, the root nearest it)
    let goal = spineIdx((li + 1) / nl);
    const closed = li === last || (style.ends === 'fall' && li % 2 === 1);
    const prevM = lineMotif.get(form[li].toUpperCase());
    if (looping) {
      // the loop: the cell from the bar's first note, the same pitches every bar
      let k = 0, bar = -1;
      rh.onsets.forEach((o, oi) => {
        const b = bars.findIndex((x) => o.g >= x.start && o.g < x.start + x.len);
        if (b !== bar) { bar = b; k = 0; }
        const pi = Math.max(0, Math.min(pent.length - 1, loopFrom + loopCell[k++ % loopCell.length]));
        idxs[oi] = pent[pi] ?? home;
      });
    } else {
      // the head: the motif moved to the spine, or the idea (an answer: inverted)
      const letter = 'ABCDEFGH'.indexOf(form[li].toUpperCase());
      const head = prevM && keep ? prevM.shape.slice(0, Math.min(keep, n)).map((x) => s0 + x) : realize(s0, letter % 2 === 1).slice(0, Math.max(1, n - 1));
      head.forEach((x, k) => { idxs[k] = clampIdx(x); });
      // the rest: by step toward the spine's next note (Narmour: steps keep going, a leap turns back)
      let cur = idxs[head.length - 1], same = 0, lastTurn = 0;
      let leapBack = head.length >= 2 && Math.abs(idxs[head.length - 1] - idxs[head.length - 2]) >= 2 && !fs!.idea.post.length ? -Math.sign(idxs[head.length - 1] - idxs[head.length - 2]) : 0;
      for (let oi = head.length; oi < n; oi++) {
        const left = n - 1 - oi;
        const dist = goal - cur;
        let move: number;
        if (leapBack) { move = leapBack; leapBack = 0; }
        else if (Math.abs(dist) > left + 1) move = Math.sign(dist) * 2;
        else if (dist && (left === 0 || rng.chance(0.75))) move = Math.sign(dist);
        else if (!dist && left > 0) {
          // (there already: a neighbour above or below and back, never the same turn twice, no long one-note runs)
          const t = same < 1 && rng.chance(0.35) ? 0 : lastTurn > 0 ? -1 : lastTurn < 0 ? 1 : rng.pick([1, -1]);
          move = t; if (t) lastTurn = t;
        } else move = same >= 1 ? (rng.pick([1, -1])) : 0;
        if (oi === n - 1) move = goal - cur;
        // (against the range's edge: the other way, not the same note again)
        else if (move && clampIdx(cur + move) === cur) move = -move;
        const nx = clampIdx(cur + move);
        same = nx === cur ? same + 1 : 0;
        cur = nx;
        idxs[oi] = cur;
      }
    }
    // fitted to the chords, last: the strong notes (and the first, the long ones) on chord notes, moving the
    // way the line moves; now and then a 9th or 4th on a strong beat left as a colour (pop, dreamy songs)
    for (let oi = 0; oi < n; oi++) {
      const o = rh.onsets[oi], m = pool[idxs[oi]], isLast = oi === n - 1;
      const strong = o.stress || lens[oi] >= 4 || oi === 0 || isLast;
      if (looping) {
        // (a loop keeps its notes: only real clashes on held or strong notes move, to the nearest pentatonic note that doesn't grind)
        if (!isLast && (strong || lens[oi] >= 3) && grindsAt(m, o.g)) {
          const alt = [1, -1, 2, -2].map((d) => clampIdx(idxs[oi] + d)).find((j) => !grindsAt(pool[j], o.g));
          if (alt !== undefined) idxs[oi] = alt;
        }
        if (!isTone(pool[idxs[oi]], o.g)) colour[oi] = true;
        if (!isLast) continue;
      }
      if (!strong) { if (lens[oi] >= 4 && rubs(m, o.g)) idxs[oi] = clampIdx(idxs[oi] - 1); continue; }
      if (isLast) {
        // the ending: closed on the root (the key's, if the chord has it), open on another chord note
        const tones = tonesAt(o.g);
        const homePc = tones.includes(mod(key, 12)) ? mod(key, 12) : tones[0];
        let best = idxs[oi], bc = Infinity;
        pool.forEach((x, j) => {
          if (!tones.includes(mod(x, 12))) return;
          const c = Math.abs(j - idxs[oi]) + (closed ? (mod(x, 12) === homePc ? -1.2 : 0.5) : mod(x, 12) === mod(key, 12) && tones.length >= 3 ? 1.5 : 0);
          if (c < bc) { bc = c; best = j; }
        });
        idxs[oi] = best;
        continue;
      }
      // (over a power chord, two notes only, any scale note that doesn't grind will do: snapped to its two, the line sat on one)
      if (isTone(m, o.g) || (tonesAt(o.g).length < 3 && !grindsAt(m, o.g))) continue;
      const deg = mod(m - chordPc(key, chordAt(o.g)), 12);
      if (fs!.colour && [2, 5].includes(deg) && lens[oi] <= 6 && !grindsAt(m, o.g) && rng.chance(fs!.colour)) { colour[oi] = true; continue; }
      const up = oi > 0 && idxs[oi] >= idxs[oi - 1];
      const order = up ? [1, -1, 2, -2] : [-1, 1, -2, 2];
      const prev = oi > 0 ? idxs[oi - 1] : -1;
      const cands = [...order, 3, -3].map((d) => idxs[oi] + d).filter((j) => j >= 0 && j < pool.length && isTone(pool[j], o.g));
      // (the chord note that isn't the last note again; only that one near: a passing note that doesn't grind stays, the line moving on)
      const fresh = cands.find((j) => j !== prev && Math.abs(j - idxs[oi]) <= 2);
      if (fresh !== undefined) idxs[oi] = fresh;
      else if (grindsAt(m, o.g) || !o.stress) idxs[oi] = cands[0] ?? idxs[oi];
    }
    // one clear high point: a later weak note matching the line's top steps down
    const top = Math.max(...idxs);
    let seenTop = false;
    idxs.forEach((x, k) => { if (x !== top) return; if (seenTop && !rh.onsets[k].stress && k !== n - 1 && !colour[k]) idxs[k] = clampIdx(x - 1); seenTop = true; });
    const lineNotes: TuneNote[] = rh.onsets.map((o, oi) => ({ step: o.g, len: Math.max(1, lens[oi]), midi: pool[idxs[oi]], stress: o.stress, start: oi === 0, line: li, ...(o.quick ? { quick: true } : {}), ...(colour[oi] ? { colour: true } : {}) }));
    return { rh, shape: idxs.map((x) => x - s0), alt: new Array(n).fill(0), lineNotes };
  };

  /**
   * Planned clashes (melody first, by mood; docs/VOCAL-FIRST.md): on some strong chord notes, a note against
   * the chord that steps into it: from a step above (a sigh: 4-3, 9-8, 6-5), held over from the last chord,
   * from a half step below (a lean), or a 9th left hanging. A long note sings both on one vowel; a short
   * one leans, the next note resolving it. Marked `colour`: fitting to the band leaves them be.
   */
  const planClashes = (ns: TuneNote[]) => {
    const full = SCALES[mode].map((x) => mod(key + x, 12));
    const above = (m: number) => (full.includes(mod(m + 1, 12)) ? m + 1 : m + 2);
    const rootOf = (g: number) => mod(chordPc(key, chordAt(g)), 12);
    const nearPc = (m: number, pc: number) => { for (let d = 0; d < 7; d++) for (const x of [m - d, m + d]) if (mod(x, 12) === mod(pc, 12)) return x; return m; };
    const harsh = fs!.kinds.some(([k]) => k === 'lean');
    const extra: TuneNote[] = [];
    const byLine: TuneNote[][] = [];
    for (const n of ns) if (!n.tie) (byLine[n.line] ??= []).push(n);
    byLine.forEach((L) => {
      if (!L?.length) return;
      // (the mood's rate is for a two-bar line: a one-bar line about half as likely)
      const barsIn = (L[L.length - 1].step + L[L.length - 1].len - L[0].step) / 16;
      let count = Math.min(2, Math.floor(fs!.clash * Math.max(0.5, Math.min(1.5, barsIn / 2)) + rng.next()));
      const cands = rng.shuffle(L.filter((n, k) => (n.stress || n.len >= 3) && !n.colour && isTone(n.midi, n.step) && (k < L.length - 1 || n.len >= 6)));
      for (const n of cands) {
        if (count <= 0) break;
        const k = L.indexOf(n), last = k === L.length - 1, prev = L[k - 1], next = L[k + 1];
        let kind = rng.weighted(fs!.kinds);
        const res = n.midi;
        if (kind === 'ninth') {
          if (last) kind = 'sigh';
          else { const m = nearPc(res, rootOf(n.step) + 2); if (Math.abs(m - res) <= 2) { n.midi = m; n.colour = true; count--; } continue; }
        }
        let clash = kind === 'lean' ? res - 1 : above(res);
        if (kind === 'held') {
          if (prev && chordAt(prev.step) !== chordAt(n.step) && [1, 2].includes(prev.midi - res)) clash = prev.midi;
          else clash = above(res);
        }
        // (a half step above the chord's root, the flat 9th, only in the dark and tense songs: elsewhere it sounds wrong, not sad)
        if (mod(clash - rootOf(n.step), 12) === 1 && !harsh) continue;
        // (a long note: the clash held a quarter, then the resolution on its vowel: a quicker turn is merged away, settle() in vocal.ts)
        if (n.len >= 6) {
          const h = Math.max(4, Math.floor(n.len / 2));
          extra.push({ step: n.step + h, len: n.len - h, midi: res, stress: false, start: false, line: n.line, tie: true });
          n.len = h; n.midi = clash; n.colour = true; count--;
        } else if (next && next.step - n.step <= 4 && isTone(res, next.step) && !next.colour) {
          n.midi = clash; n.colour = true; next.midi = res; count--;
        }
      }
    });
    ns.push(...extra);
    ns.sort((a, b) => a.step - b.step || (a.tie ? 1 : 0) - (b.tie ? 1 : 0));
  };

  lines.forEach((L, li) => {
    const letter = form[li];
    const name = letter.toUpperCase();
    const prev = motifs.get(name);
    const split = splitOf(L);
    const height = Math.max(L.length >= 4 ? 3 : 1, Math.round(height0 * (L.length >= 4 ? 1.5 : L.length === 1 ? 0.65 : 1)));
    const lineStart = L[0].start;
    // a few tries at the line, the one that sits best with the band kept
    const attempt = (rng: Rng) => {
      const lineNotes: TuneNote[] = [];
      // (a pre-chorus's last line breaks off busier: the motif fragmenting into the chorus)
      const opts = (st: Start, b: number): PhraseOpts => ({
        busy: b, start: st, sync: style.sync, flow: singer.flow * (kind === 'verse' ? 1 : 0.5), syncop: singer.syncop, hold: singer.hold,
        changes: H.changes, fine: rng.chance(fineChance), slow,
        // (a slow song: held notes shorter more often, so the line doesn't stall)
        holdLen: rng.chance(slow * 0.45) ? 'short' : L.length === 1 && li < lines.length - 1 && singer.holdLen.length > 1 ? 'short' : rng.weighted(singer.holdLen),
      });
      // the rhythm: a letter that comes back sings the same rhythm; a primed one keeps its first bar
      let rh: LineRhythm;
      let keep = 0;
      const fits = prev && L.length === prev.lens.length && L.every((b, k) => b.len === prev.lens[k]);
      if (prev && fits) {
        const off = lineStart - prev.start;
        if (letter === name) {
          rh = { onsets: prev.rh.onsets.map((o) => ({ ...o, g: o.g + off })), end: prev.rh.end + off };
          keep = rh.onsets.length;
        } else {
          const head = headOf(prev.rh, prev.split).map((o) => ({ ...o, g: o.g + off }));
          const fresh = style.grid ? gridRhythm(rng, L, opts('down', busy), gridUnit(song.bpm), kind) : phraseRhythm(rng, L, opts('down', busy));
          const tail = fresh.onsets.filter((o) => o.g >= split);
          rh = tail.length ? { onsets: [...head, ...tail], end: fresh.end } : { onsets: prev.rh.onsets.map((o) => ({ ...o, g: o.g + off })), end: prev.rh.end + off };
          keep = head.length;
        }
      } else {
        const o = opts(li === 0 && start === 'pickup' ? 'down' : start, busy * (kind === 'prechorus' && li === last ? 1.25 : 1));
        rh = style.grid ? gridRhythm(rng, L, o, gridUnit(song.bpm), kind) : phraseRhythm(rng, L, o);
        rh = holdInside(rng, rh, L, 0.3 + singer.hold);
      }

      // the line's anchor: the centre (answer lines a step lower in verses; a call-and-response chorus
      // answers well below), climbing by sequence through a pre-chorus
      const call = style.twist === 'call' && big && li % 2 === 1 ? -4 : 0;
      const anchor = clampIdx(nearestIdx(center + (kind === 'verse' && li % 2 === 1 ? -1 : 0)) + seq * li + call);
      if (style.first) return firstLine(rng, rh, keep, li);
      if (style.shaped) return shapedLine(rng, rh, anchor, keep, li);
      const n = rh.onsets.length;
      const shape: number[] = [];
      const alt: number[] = [];
      let prevIdx = anchor;
      let leapDir = 0;
      // (how many times running the line has stayed on one note: Paul, "the vocal melody is sitting at
      // one note most of the time"; about half the syllables were repeats, a third now; a recited line
      // may stay a little longer)
      let same = 0;
      const sameMax = contour === 'recite' ? 3 : 2;
      const closed = li === last || (style.ends === 'fall' && li % 2 === 1);
      rh.onsets.forEach((o, oi) => {
        const isLast = oi === n - 1;
        const len = (isLast ? rh.end : rh.onsets[oi + 1].g) - o.g;
        const g = o.g;
        let idx: number;
        let a = 0;
        const copied = !!prev && oi < keep && oi < prev.shape.length;
        let hookNote = false;
        if (copied) {
          idx = anchor + prev.shape[oi];
          a = prev.alt[oi];
        } else {
          const x = n > 1 ? oi / (n - 1) : 1;
          const target = anchor + contourAt(contour, x, height, peak);
          hookNote = big && li === 0 && oi === 1 && style.hookLeap > 0;
          if (oi === 0 && !prev) {
            idx = Math.round(target);
            // (the hook's first note low enough for its leap to fit)
            if (big && li === 0 && style.hookLeap) idx = Math.min(idx, nearestIdx(pool[pool.length - 1] - (LEAP_SEMIS[style.hookLeap] ?? 12)));
          }
          else {
            let move: number;
            const dir = Math.sign(target - prevIdx) || (rng.chance(0.5) ? 1 : -1);
            if (leapDir) { move = -leapDir; leapDir = 0; } // after a leap, a step back (gap-fill)
            else if (same < sameMax && rng.chance(style.repeat * 0.55)) move = 0;
            else if (rng.chance(style.leap * (contour === 'recite' ? 0.4 : 1))) { move = leapTo(prevIdx, dir * rng.pick(style.leaps)) - prevIdx; leapDir = Math.sign(move); }
            else move = (rng.chance(0.8) ? dir : -dir) * (Math.abs(target - prevIdx) >= 3 && rng.chance(0.4) ? 2 : 1);
            idx = prevIdx + move;
          }
          // the hook: the chorus's first line opens with a leap up
          if (hookNote) { idx = leapTo(clampIdx(shape[0] + anchor), style.hookLeap); leapDir = 1; }
          // colour on short weak notes: a blue 3rd or 7th in passing, a dark flat 2nd
          if (!o.stress && len <= 2) {
            const pc = mod(pool[clampIdx(idx)] - key, 12);
            if (!minorish && (pc === 4 || pc === 11) && rng.chance(style.blue)) a = -1;
            else if (minorish && pc === 2 && rng.chance(style.dark)) a = -1;
          }
        }
        idx = clampIdx(idx);
        // strong beats on chord notes (by the style: tense songs leave more of them rubbing)
        const want = isLast || len >= 6 || (!copied && o.stress && rng.chance((P.toneStrong + style.stable) / 2));
        // (snapping back toward the last note: no bigger jump than written; but a note that moved isn't
        // snapped back onto the note before: that left a third of the stressed notes singing the last note
        // again, the line stuck on one pitch (Paul: "notes are almost always just repeating"); the chord
        // note the other way instead, if it's near)
        if (want) {
          const was = idx, moved = oi > 0 && idx !== prevIdx;
          idx = nearTone(idx, g, undefined, idx > prevIdx && !hookNote); a = 0;
          if (moved && idx === prevIdx) {
            const on = nearTone(idx, g, (m) => m !== pool[prevIdx], was < prevIdx);
            if (on !== prevIdx && Math.abs(on - prevIdx) <= 3) idx = on;
          }
        }
        // the line's ending: closed on the root (the key's, if the chord has it), open on the 3rd or 5th
        if (isLast) {
          const tones = tonesAt(g);
          const home = tones.includes(key) ? key : tones[0];
          const fallIn = style.ends === 'fall' || contour === 'fall';
          idx = closed ? nearTone(idx, g, (m) => mod(m, 12) === home, fallIn) : nearTone(idx, g, (m) => mod(m, 12) !== key || tones.length < 3, fallIn);
          a = 0;
        }
        if (len >= 4 && rubs(pool[idx], g)) idx = Math.max(0, idx - 1);
        same = oi > 0 && idx === prevIdx ? same + 1 : 0;
        prevIdx = idx;
        shape.push(idx - anchor);
        alt.push(a);
        lineNotes.push({ step: g, len: Math.max(1, len), midi: pool[idx] + a, stress: o.stress, start: oi === 0, line: li, ...(o.quick ? { quick: true } : {}) });
      });
      return { rh, shape, alt, lineNotes };
    };
    const tries = band ? TRIES : 1;
    const seed = rng.next();
    // (on the grid, a try that sings beat after beat in even quarter notes scores less: every note on a kick
    // or snare scored, so the try with the most beats sung won, a line of back to back quarter notes; Paul:
    // the grid gave "a bunch of back to back 1/4 bar length notes")
    const plodding = (ns: TuneNote[]) => { let r = 0, p = 0; for (let k = 1; k < ns.length; k++) { r = ns[k].step - ns[k - 1].step === 4 && ns[k].line === ns[k - 1].line ? r + 1 : 0; if (r >= 3) p++; } return p; };
    const score = (ns: TuneNote[]) => bandScore(ns, H, band!, total, style.grip) - (style.grid ? 1.5 * plodding(ns) : 0);
    let best = attempt(tries > 1 ? new Rng(`${seed}-0`) : rng);
    let bestScore = band ? score(best.lineNotes) : 0;
    for (let c = 1; c < tries; c++) {
      const t = attempt(new Rng(`${seed}-${c}`));
      const sc = score(t.lineNotes);
      if (sc > bestScore) { best = t; bestScore = sc; }
    }
    const { rh, shape, alt } = best;
    notes.push(...best.lineNotes);
    if (!prev) motifs.set(name, { rh, start: lineStart, split, lens: L.map((b) => b.len), shape, alt });
  });

  /**
   * The song's signature moves (src/parts/moves.ts, docs/VOCAL-MOVES.md), on the written tune: colour notes
   * against the chord (marked `colour`, so fitting to the band leaves them be), drones, hooks and shapes.
   * Always: a borrowed chord's b6 (Radiohead "Creep", the Beatles "Nowhere Man": the note that makes it heard).
   */
  const applyMoves = (ns: TuneNote[]) => {
    const moves = new Set(style.moves ?? []);
    const has = (m: MoveId) => moves.has(m);
    const rootOf = (g: number) => mod(chordPc(key, chordAt(g)), 12);
    const majorAt = (g: number) => tonesAt(g).includes(mod(rootOf(g) + 4, 12));
    // the nearest pitch of a pitch class to m (in the singer's reach)
    const nearPc = (m: number, pc: number, below = false) => {
      let best = m, bd = 99;
      for (let x = m - 7; x <= m + 7; x++) {
        if (mod(x, 12) !== mod(pc, 12) || x < lo - 3 || x > hi + 4) continue;
        const d = Math.abs(x - m) + (below && x > m ? 3 : 0);
        if (d < bd) { bd = d; best = x; }
      }
      return best;
    };
    const stepFrom = (m: number, k: number) => pool[clampIdx(nearestIdx(m) + k)];
    const extra: TuneNote[] = [];
    // a held note sung as one note, then (on its vowel) another: 9-8, 4-3, an appoggiatura's resolution
    const split = (n: TuneNote, first: number, then: number) => {
      if (n.len < 4) return;
      const h = Math.max(2, Math.floor(n.len / 2));
      extra.push({ step: n.step + h, len: n.len - h, midi: then, stress: false, start: false, line: n.line, tie: true });
      n.len = h; n.midi = first; n.colour = true;
    };
    const lineNs: TuneNote[][] = [];
    for (const n of ns) { if (n.tie) continue; (lineNs[n.line] ??= []).push(n); }
    const verse = kind === 'verse' || kind === 'prechorus';
    lineNs.forEach((L, li) => {
      if (!L?.length) return;
      const strong = L.filter((n) => n.stress || n.len >= 4);
      const last = L[L.length - 1];
      // shapes and drones first, colour after
      if (has('monotone') && kind === 'verse') {
        const recite = nearPc(pool[nearestIdx(center)], minorish ? key + 3 : key);
        for (const n of L) {
          const ok = tonesAt(n.step).includes(mod(recite, 12)) || !n.stress;
          n.midi = ok ? recite : pool[nearTone(nearestIdx(recite), n.step)];
          n.colour = true;
        }
      }
      if (has('pedal') && verse && li % 2 === 0) {
        const cands = [key, key + 7, key + (minorish ? 3 : 4)];
        const shared = (pc: number) => strong.filter((n) => tonesAt(n.step).includes(mod(pc, 12)) || [2, 5].includes(mod(pc - rootOf(n.step), 12))).length;
        const pc = cands.reduce((b, c) => (shared(c) > shared(b) ? c : b), cands[0]);
        const m = nearPc(pool[nearestIdx(center)], pc);
        for (const n of strong) { n.midi = m; n.colour = true; }
      }
      if (has('upupdown') && strong.length >= 4) {
        const base = nearestIdx(strong[0].midi);
        strong.forEach((n, k) => { const step = k % 4 === 3 ? -2 : k % 4; n.midi = pool[nearTone(clampIdx(base + step + Math.floor(k / 4)), n.step)]; });
      }
      if (has('sequence') && kind === 'verse' && li % 2 === 1 && lineNs[li - 1]?.length) {
        const P = lineNs[li - 1];
        L.forEach((n, k) => {
          const src = P[Math.min(k, P.length - 1)];
          const j = clampIdx(nearestIdx(src.midi) - 1);
          n.midi = n.stress ? pool[nearTone(j, n.step)] : pool[j];
        });
      }
      if (has('octave') && big && li === 0 && strong.length >= 2) {
        const a = strong[0], b = strong[1];
        const want = a.midi + (a.midi + 12 <= hi + 4 ? 12 : 7);
        b.midi = nearPc(want, tonesAt(b.step).reduce((x, pc) => (Math.abs(mod(pc - want, 12)) < Math.abs(mod(x - want, 12)) ? pc : x), tonesAt(b.step)[0]));
        b.colour = true;
        // (then down by step, filling the leap)
        const after = L.slice(L.indexOf(b) + 1, L.indexOf(b) + 4);
        let m = b.midi;
        for (const n of after) { m = stepFrom(m, -1); n.midi = m; }
      }
      if (has('whoop') && big && li === lineNs.length - 1) {
        L.slice(0, 4).forEach((n, k) => { n.midi = nearPc(k ? L[0].midi : pool[nearestIdx(center)], k % 2 ? key + 4 : key + 7); n.colour = true; });
      }
      // colour against the chord
      if (has('sigh')) {
        const n = strong.find((x, k) => k > 0 && rootOf(x.step) !== rootOf(strong[k - 1].step) && majorAt(x.step) && x !== last);
        if (n) {
          const r = rootOf(n.step);
          n.midi = nearPc(n.midi, r + 9); n.colour = true;
          const nx = L[L.indexOf(n) + 1];
          if (nx && nx !== last) nx.midi = nearPc(n.midi, r + 7, true);
        }
      }
      if (has('cliche')) {
        const run = strong.filter((n) => rootOf(n.step) === mod(key, 12) && majorAt(n.step));
        if (run.length >= 3) run.slice(0, 4).forEach((n, k) => { n.midi = nearPc(k ? run[0].midi : n.midi, key + [0, 11, 10, 9][k], k > 0); n.colour = true; });
      }
      if (has('lydian')) {
        for (const n of strong) if (rootOf(n.step) === mod(key + 2, 12) && majorAt(n.step)) n.midi = nearPc(n.midi, key + 6);
        const onI = strong.find((n) => rootOf(n.step) === mod(key, 12) && n !== last);
        if (onI && li % 2 === 0) { onI.midi = nearPc(onI.midi, key + 6); onI.colour = true; }
      }
      if (has('blue')) for (const n of strong) if (majorAt(n.step) && mod(n.midi - rootOf(n.step), 12) === 4 && [0, 5].includes(mod(rootOf(n.step) - key, 12))) n.slide = 1;
      if (has('phrygian')) {
        const k = L.findIndex((n, j) => j > 0 && j < L.length - 1 && !n.stress && n.len <= 2);
        if (k > 0) { L[k].midi = nearPc(L[k - 1].midi, key + 1); L[k].colour = true; }
      }
      if (has('falls')) for (const n of L) { if (n.len >= 6 && !n.fall && rng.chance(0.6)) n.fall = rng.pick([3, 4]); else if (n.start && rng.chance(0.4)) n.slide = 2; }
      // line endings
      const r = rootOf(last.step);
      if (has('ninth') && last.len >= 4) split(last, nearPc(last.midi, r + 2), nearPc(last.midi, r, true));
      if (has('suspension') && last.len >= 4 && r === mod(key + 7, 12)) split(last, nearPc(last.midi, key), nearPc(last.midi, key + 11, true));
      if (has('flat7')) {
        if (r === mod(key + 10, 12)) last.midi = nearPc(last.midi, key + 10);
        else if (r === mod(key, 12) && rng.chance(0.4)) { last.midi = nearPc(last.midi, key + 10); last.colour = true; }
      }
      if (has('nohome') && (r === mod(key + 5, 12) || r === mod(key + 7, 12))) { last.midi = nearPc(last.midi, key); last.colour = r === mod(key + 7, 12); }
      if (has('sour') && (li % 4 === 3 || rng.chance(0.2))) { last.midi = nearPc(last.midi, r + rng.pick([5, 2])); last.colour = true; }
      if (has('appoggiatura') && big && li === lineNs.length - 1) {
        let made = 0;
        for (const n of strong) { if (made >= 3 || n.len < 4) continue; const to = n.midi; split(n, stepFrom(to, 1), to); made++; }
      }
      // always: a borrowed chord's b6 (in a major key)
      if (!minorish) for (const n of strong) if (tonesAt(n.step).includes(mod(key + 8, 12)) && !tonesAt(n.step).includes(mod(key + 9, 12))) n.midi = nearPc(n.midi, key + 8);
    });
    ns.push(...extra);
    ns.sort((a, b) => a.step - b.step || (a.tie ? 1 : 0) - (b.tie ? 1 : 0));
  };

  // nothing before the block or past it, nothing overlapping
  let out = notes.filter((n) => n.step >= 0 && n.step < total).sort((a, b) => a.step - b.step);
  out = out.filter((n, i) => i === 0 || n.step !== out[i - 1].step);
  out.forEach((n, i) => { const nx = out[i + 1]; n.len = Math.max(1, Math.min(n.len, (nx?.step ?? total) - n.step)); });
  // detached or joined: notes inside a line hold for the style's share of their gap
  out.forEach((n, i) => {
    const nx = out[i + 1];
    if (nx && nx.line === n.line && n.len >= 2 && n.len < 6) n.len = Math.max(1, Math.round(n.len * style.legato));
  });
  if (fs) planClashes(out);
  if (style.shaped) applyMoves(out);
  wail(rng, out, form, kind, style, tonesAt);
  singable(out, pool);
  out = holdHighs(out, bars, total);
  const sung = ornament(rng, out, style, pool, tonesAt, { key, minorish, kind, step: 60 / song.bpm / 4 });
  deliver(rng, sung, style);
  // (a held high note never falls off its end: it fades, as held notes do; Paul)
  let inPeak = false;
  for (const n of sung) { if (!n.tie) inPeak = !!n.peak; if (inPeak) n.fall = undefined; }
  return { notes: sung, lines: lines.length };
}

/**
 * A held note inside a long line (Paul: "some more longer held notes"): now and then a stressed syllable
 * on a bar's downbeat or middle beat is held half a bar or more, the words after it coming later (those
 * in its way left out); never the line's first or last note, and leaving the last its own room.
 */
function holdInside(rng: Rng, rh: LineRhythm, bars: Bar[], chance: number): LineRhythm {
  const os = rh.onsets;
  if (bars.length < 2 || os.length < 5 || !rng.chance(chance)) return rh;
  const strong = new Set(bars.flatMap((b) => [b.start, ...(b.groups.length >= 4 ? [b.start + groupStarts(b.groups)[Math.floor(b.groups.length / 2)]] : [])]));
  const lastG = os[os.length - 1].g;
  const cands = os.map((_, i) => i).filter((i) => i > 0 && i < os.length - 2 && os[i].stress && strong.has(os[i].g) && lastG - os[i].g >= 10);
  if (!cands.length) return rh;
  const i = rng.pick(cands), g = os[i].g;
  const len = Math.min(rng.pick([6, 8, 8, 12]), lastG - 2 - g);
  if (len < 6) return rh;
  return { ...rh, onsets: os.filter((o, k) => k <= i || o.g >= g + len) };
}

/**
 * High notes held (Paul: a jump up to a pushed scream or a belt "should not fall off immediately -- it
 * should be held for at least half a bar"): a belt, or a jump of a major 3rd or more up to the line's top
 * (or within a semitone of it), is held at least half its bar; the words in its way are left out (the
 * line's next words come after it), a beat's breath before the next line (or, no room, sung into it). Marked `peak`: it never falls off.
 */
function holdHighs(notes: TuneNote[], bars: Bar[], total: number): TuneNote[] {
  const gone = new Set<TuneNote>();
  const sung = notes.filter((n) => !n.tie);
  const top = new Map<number, number>();
  for (const n of sung) top.set(n.line, Math.max(top.get(n.line) ?? -99, n.midi));
  sung.forEach((n, k) => {
    if (gone.has(n)) return;
    const prev = sung[k - 1];
    const high = n.belt || (prev && prev.line === n.line && !gone.has(prev) && n.midi - prev.midi >= 4 && n.midi >= top.get(n.line)! - 1);
    if (!high) return;
    n.peak = true;
    const bar = bars.find((b) => n.step >= b.start && n.step < b.start + b.len) ?? bars[bars.length - 1];
    const half = Math.max(4, Math.round(bar.len / 4) * 2);
    if (n.len >= half) return;
    const nextLine = sung.find((x) => x.line > n.line && !gone.has(x));
    // (a beat's breath before the next line; no room for one: sung through into it)
    const limit = Math.min(total, !nextLine ? total : nextLine.step - 4 >= n.step + half ? nextLine.step - 4 : nextLine.step);
    const end = Math.min(n.step + half, limit);
    if (end <= n.step + n.len) return;
    // (the line's own notes in its way left out, ties and all)
    for (const x of notes) if (x !== n && x.line === n.line && x.step > n.step && x.step < end) gone.add(x);
    n.len = end - n.step;
  });
  return notes.filter((n) => !gone.has(n));
}

/**
 * Singable (Paul: "too much sudden movement in the vocal melody... like a robot"): a singer doesn't
 * jump about on quick notes. On a quick weak note (an 8th or less from its neighbours; not a line's
 * first): there and back again (a zig-zag) by a leap of 3 semitones or more, or between two 16ths by
 * any step, is sung on the note before instead; a leap of 3 or more into it, going on the same way,
 * becomes a passing note (the scale note between the notes either side).
 */
function singable(notes: TuneNote[], pool: number[]) {
  for (let i = 1; i + 1 < notes.length; i++) {
    const p = notes[i - 1], n = notes[i], nx = notes[i + 1];
    if (n.stress || n.start || n.line !== p.line || nx.line !== n.line) continue;
    const gapIn = n.step - p.step, gapOut = nx.step - n.step;
    if (gapIn > 2 && gapOut > 2) continue;
    const dIn = n.midi - p.midi, dOut = nx.midi - n.midi;
    const zig = dIn !== 0 && Math.sign(dOut) === -Math.sign(dIn);
    // (a leap there and back: a step there and back instead, a neighbour note, not the note before again:
    // that made a moving line one note; between two 16ths, the note before)
    if (zig && Math.abs(dIn) >= 3) {
      const j = pool.reduce((b, m, k) => (Math.abs(m - p.midi) < Math.abs(pool[b] - p.midi) ? k : b), 0);
      const nb = pool[j + Math.sign(dIn)];
      n.midi = nb !== undefined && nb !== p.midi && Math.abs(nb - p.midi) < Math.abs(dIn) ? nb : p.midi;
      continue;
    }
    if (zig && gapIn <= 1 && gapOut <= 1) { n.midi = p.midi; continue; }
    if (Math.abs(dIn) >= 3) {
      const lo = Math.min(p.midi, nx.midi), hi = Math.max(p.midi, nx.midi);
      const between = pool.filter((m) => m > lo && m < hi);
      n.midi = between.length ? between[Math.floor(between.length / 2)] : p.midi;
    }
  }
}

/** The highest a song's wails go (the climax gets a little more). */
export const wailTop = (style: MelodyStyle) => PEAK + style.up - 2 + style.top;

/**
 * Wails: a big line (chorus, bridge, outro; now and then a pre-chorus's last line) peaking on a high
 * held note near the top of the singer's range, sung full out. Lines that share a letter wail alike.
 */
function wail(rng: Rng, notes: TuneNote[], form: string, kind: SectionKind, style: MelodyStyle, tonesAt: (g: number) => number[]) {
  const chance = style.singer.belt * (kind === 'chorus' || kind === 'outro' ? 1 : kind === 'bridge' ? 1.1 : kind === 'prechorus' ? 0.35 : 0.12);
  if (!chance) return;
  const byLetter = new Map<string, boolean>();
  for (let li = 0; li < form.length; li++) {
    const name = form[li].toUpperCase();
    if (!byLetter.has(name)) byLetter.set(name, rng.chance(Math.min(0.9, chance * (li === form.length - 1 ? 1.4 : 0.7))));
    if (!byLetter.get(name)) continue;
    const L = notes.filter((n) => n.line === li);
    const hi = L.findIndex((n, k) => k === L.length - 1 || (n.len >= 6 && !L.slice(k + 1).some((x) => x.len >= 6)));
    const held = L[hi];
    if (!held || held.len < 6) continue;
    const tones = tonesAt(held.step);
    // (no further than an octave over the note before it)
    let m = Math.min(wailTop(style), (L[hi - 1]?.midi ?? held.midi) + 12);
    while (m > held.midi + 2 && !tones.includes(mod(m, 12))) m--;
    if (m <= held.midi + 2) continue;
    held.midi = m;
    held.belt = true;
  }
}

/**
 * A run's scale, Western: the blues scale (minor, with its flat 5th), the minor pentatonic, or in a
 * major key the major blues scale (the pentatonic with the flat 3rd slid through to the 3rd: the soul
 * and gospel run; the plain major pentatonic sounds East Asian).
 */
function runScale(key: number, minor: boolean, blues: boolean): (m: number) => boolean {
  const pcs = blues ? [0, 3, 5, 6, 7, 10] : minor ? [0, 3, 5, 7, 10] : [0, 2, 3, 4, 7, 9];
  return (m: number) => pcs.includes(mod(m - key, 12));
}

/** The `k`th scale note above (k > 0) or below (k < 0) `m`. */
function scaleStep(m: number, k: number, inScale: (m: number) => boolean): number {
  let x = m;
  for (let i = 0; i < Math.abs(k); i++) { x += Math.sign(k); while (!inScale(x)) x += Math.sign(k); }
  return x;
}

/** A run of `n` notes on one vowel around `m`: where each note sits (into `m`, or from it for a tail). */
function runNotes(kind: RunKind, m: number, n: number, key: number, minor: boolean): number[] {
  const sc = runScale(key, minor || kind === 'blues', kind === 'blues');
  const rel = (k: number) => scaleStep(m, k, sc);
  switch (kind) {
    case 'cascade': case 'blues': return Array.from({ length: n }, (_, i) => (i === n - 1 ? m : rel(n - 1 - i)));
    case 'climb': return Array.from({ length: n }, (_, i) => (i === n - 1 ? m : rel(-(n - 1 - i))));
    case 'wave': return [...[0, 1, 0, -1, -2, -1, 1].slice(0, n - 1).map(rel), m];
    case 'tail': return Array.from({ length: n }, (_, i) => rel(-i));
  }
}

/**
 * Sighs, runs and turns on held notes (one syllable over several notes): an appoggiatura (the held note
 * sung a step above first, falling into the chord note: [M] the device behind "tears" in sad songs); the
 * singer's runs (down into the note from above, up into it, an R&B wave, a blues fall, or a held note
 * running down off its end); or, at a line's end, a little turn onto the note.
 */
function ornament(rng: Rng, notes: TuneNote[], style: MelodyStyle, pool: number[], tonesAt: (g: number) => number[], c: { key: number; minorish: boolean; kind: SectionKind; step: number }): TuneNote[] {
  const out: TuneNote[] = [];
  const up = (m: number) => pool.find((x) => x > m) ?? m + 2;
  const singer = style.singer;
  // (a run's notes are 16ths, 8ths where 16ths would be too quick to sing)
  const unit = c.step < 0.1 ? 2 : 1;
  // (a slow song leaves room for more runs: they're sung quicker than its beat, see quicken() in vocal.ts)
  const slow = 1 + 0.8 * Math.max(0, Math.min(1, (c.step * 2 - 0.3) / 0.15));
  const where = c.kind === 'chorus' || c.kind === 'outro' || c.kind === 'bridge' ? 1.2 : c.kind === 'verse' ? 0.6 : 0.9;
  notes.forEach((n, i) => {
    const lineEnd = !notes[i + 1] || notes[i + 1].line !== n.line;
    const onTone = tonesAt(n.step).includes(mod(n.midi, 12));
    if (n.len >= 6 && onTone && !n.belt && rng.chance(style.lean)) {
      const above = up(n.midi);
      if (!tonesAt(n.step).includes(mod(above, 12))) {
        const a = n.len >= 8 ? 4 : 2;
        out.push({ ...n, len: a, midi: above }, { ...n, step: n.step + a, len: n.len - a, start: false, tie: true });
        return;
      }
    }
    if (n.len >= 6 && rng.chance(singer.runs * where * slow * (lineEnd ? 1 : 0.4) * (n.belt ? 1.3 : 1))) {
      const kind = rng.weighted(singer.runKinds);
      const want = rng.int(singer.runLen[0], singer.runLen[1]);
      const inRange = (m: number) => m >= FLOOR + style.up && m <= wailTop(style) + 1;
      if (kind === 'tail') {
        // the note held for at least half its length, then down off its end a unit a note (the last two
        // units), no deeper than the singer goes
        let ms = runNotes(kind, n.midi, Math.min(want, 5, Math.floor(n.len / 2 / unit)), c.key, c.minorish);
        ms = ms.slice(0, Math.max(1, ms.findIndex((m) => !inRange(m)) < 0 ? ms.length : ms.findIndex((m) => !inRange(m))));
        const k = ms.length;
        if (k >= 3) {
          const hold = n.len - k * unit;
          out.push({ ...n, len: hold });
          ms.slice(1).forEach((m, j) => out.push({ ...n, step: n.step + hold + j * unit, len: j === k - 2 ? n.len - hold - j * unit : unit, midi: m, start: false, tie: true, run: j < k - 2, belt: false, slide: undefined }));
          return;
        }
      } else {
        // into the note, after it's been held a beat (Paul: no quick turns right after a syllable
        // starts): the syllable held, then the run a unit a note, landing back on the note for the rest
        const hold = 4;
        const ms = runNotes(kind, n.midi, Math.min(want, Math.floor((n.len - hold - 2) / unit) + 1), c.key, c.minorish);
        // (a run starting out of the singer's reach starts later, shorter; nor more than an octave over the note)
        // (a wailer's from up to an octave over it; the others' from no more than a 4th)
        while (ms.length && (!inRange(ms[0]) || ms[0] > n.midi + (singer.kind === 'wailer' ? 12 : 5))) ms.shift();
        const k = ms.length;
        if (k >= 3 && ms[0] !== n.midi) {
          out.push({ ...n, len: hold, belt: false });
          ms.forEach((m, j) => {
            const lastOne = j === k - 1;
            out.push({ ...n, step: n.step + hold + j * unit, len: lastOne ? n.len - hold - j * unit : unit, midi: m, start: false, tie: true, run: !lastOne, belt: lastOne && n.belt, slide: undefined });
          });
          return;
        }
      }
    }
    if (lineEnd && n.len >= 6 && rng.chance(style.melisma)) {
      // a turn: up a step and back down, or a fall of two steps onto the note
      const a = up(n.midi), b = up(a);
      const run = rng.chance(0.5) ? [n.midi, a, n.midi] : [b, a, n.midi];
      out.push({ ...n, len: 2, midi: run[0] }, { ...n, step: n.step + 2, len: 1, midi: run[1], start: false, tie: true }, { ...n, step: n.step + 3, len: n.len - 3, midi: run[2], start: false, tie: true });
      return;
    }
    out.push(n);
  });
  return out;
}

/**
 * How the singer delivers the notes: held ones scooped up into from a semitone to a third below (more
 * often on the wails), lines falling off their last note.
 */
function deliver(rng: Rng, notes: TuneNote[], style: MelodyStyle) {
  const s = style.singer;
  notes.forEach((n, i) => {
    const nx = notes[i + 1];
    const lineEnd = !nx || nx.line !== n.line;
    // (inside a run, the run itself is the movement)
    // (scoops sparingly and small, on held notes: one on nearly every syllable bends each word like a
    // tone in a tonal language, part of what sounded Chinese to Paul)
    if (!n.tie && !nx?.tie && n.len >= 4 && rng.chance(Math.min(0.6, 0.5 * s.slide + (n.belt ? 0.2 : 0)))) n.slide = rng.weighted([[1, 3], [2, 3], [3, 1], [5, n.belt ? 0.5 : 0]]);
    if (lineEnd && n.len >= 3 && !n.peak && rng.chance(s.fall)) n.fall = rng.weighted([[2, 2], [3, 2], [5, 1], [7, n.belt ? 1 : 0.3]]);
  });
}

/**
 * How closely each mood's tune follows the tension curve: a triumphant or angry singer pushes up as
 * the song builds; a melancholic or dreamy one barely moves.
 */
const FOLLOW: Record<Mood, number> = { happy: 1, triumphant: 1.3, nostalgic: 0.8, melancholic: 0.6, dreamy: 0.6, tense: 1.1, angry: 1.2, dark: 0.7 };

/**
 * The tune follows the tension curve, line by line (docs/VOCAL.md, section 6): the same tune, sung with
 * more (or less) push than where it first came. A line above the tension the tune was written at lifts
 * its held notes and its top note to the next chord note up (the singer reaching), and at a big lift
 * turns its last held note; a calmer line lets its held notes down to the chord note below. Every note
 * gets louder (and brighter) with its bar's tension. `ref`: the tension where the tune was first sung.
 */
export function followTension(idea: Idea, ref: number, mood: Mood, style: MelodyStyle, rng: Rng, follow = 1): { up: number; down: number; turns: number } {
  const out = { up: 0, down: 0, turns: 0 };
  const t = idea.section?.tension;
  const v = idea.vocal;
  if (!t?.length || !v?.length) return out;
  const { key, mode, bars, total } = idea.song;
  const barAt = (g: number) => Math.min(t.length - 1, bars.reduce((b, x, i) => (x.start <= g ? i : b), 0));
  const tonesAt = (g: number) => chordTones(key, idea.chords.timeline[idea.chords.chordIdx[Math.min(total - 1, Math.max(0, g))]].chord);
  const scale = (SCALES[mode] as readonly number[]).map((x) => (key + x) % 12);
  const tied = (i: number) => v[i + 1]?.syl.text === '~';
  // the sung lines (each starts with a `start` note)
  const lines: number[][] = [];
  v.forEach((n, i) => { if (n.start || !lines.length) lines.push([]); lines[lines.length - 1].push(i); });
  for (const L of lines) {
    for (const i of L) v[i].vel = Math.max(0.45, Math.min(1, v[i].vel * (0.86 + 0.3 * t[barAt(v[i].step)])));
    const bs = [...new Set(L.map((i) => barAt(v[i].step)))];
    const d = (bs.reduce((a, b) => a + t[b], 0) / bs.length - ref) * FOLLOW[mood] * follow;
    const p = clamp01((Math.abs(d) - 0.04) / 0.18);
    if (!p) continue;
    // which notes move: the held ones, and (going up) the line's top note
    // (a colour note, a signature move's, stays where it is)
    const free = L.filter((i) => v[i].syl.text !== '~' && !tied(i) && !v[i].colour);
    const held = free.filter((i) => v[i].len >= 4);
    const top = free.reduce((b, i) => (b < 0 || v[i].midi > v[b].midi ? i : b), -1);
    const moving = new Set(d > 0 && top >= 0 && v[top].len >= 2 ? [...held, top] : held);
    for (const i of moving) {
      if (!rng.chance(p)) continue;
      const n = v[i];
      const tones = tonesAt(n.step);
      for (let s = 2; s <= 5; s++) {
        const m = n.midi + (d > 0 ? s : -s);
        // (the song's top notes kept for its climax)
        if (!tones.includes(mod(m, 12)) || m > wailTop(style) || m < FLOOR + style.up) continue;
        n.midi = m;
        if (d > 0) out.up++; else out.down++;
        break;
      }
    }
    // a big lift: the line's last held note turns (up a step and back) on its vowel, unhurried: held a
    // quarter first, the step up an 8th (Paul: quick turns right after a syllable starts sound weird)
    const last = L[L.length - 1];
    if (d > 0.15 && style.melisma > 0.05 && v[last].len >= 8 && v[last].syl.text !== '~' && rng.chance(p * 0.6)) {
      const n = v[last];
      const up = n.midi + (mod(n.midi + 1, 12) === scale.find((x) => x === mod(n.midi + 1, 12)) ? 1 : 2);
      const cont = (coda: Syllable['coda']): Syllable => ({ onset: [], vowel: n.syl.vowel, coda, stress: false, text: '~', wordStart: false });
      v.splice(last, 1,
        { ...n, len: 4, syl: { ...n.syl, coda: [] } },
        { ...n, step: n.step + 4, len: 2, midi: Math.min(up, PEAK + style.up), start: false, syl: cont([]) },
        { ...n, step: n.step + 6, len: n.len - 6, start: false, syl: cont(n.syl.coda) });
      out.turns++;
    }
  }
  return out;
}
