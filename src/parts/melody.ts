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

import type { ChordPart, Idea, SectionKind, Song } from '../idea';
import type { Genre } from '../genres';
import { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import type { Mood } from '../tension';
import { SCALES, chordPc } from '../theory';
import { MINORISH, chordTones } from './guitar2';
import { type Band, bandScore, harmonyOf } from './fit';
import type { Syllable } from './lyrics';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The low voice's comfortable range (a rock tenor-baritone): C3 to E4, the climax up to A4. */
export const LOW: [number, number] = [48, 64];
export const PEAK = 69;

/** A line's shape: recite (one note, falling at the end), arch, rise (peak late), fall, valley, climb, wave. */
export type Contour = 'recite' | 'arch' | 'rise' | 'fall' | 'valley' | 'climb' | 'wave';
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
    verse: [['wave', 3], ['recite', 2], ['arch', 2]], chorus: [['arch', 4], ['rise', 2], ['wave', 1]], bridge: [['rise', 2], ['arch', 2]],
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
    verse: [['fall', 3], ['recite', 2], ['wave', 1]], chorus: [['arch', 3], ['fall', 3]], bridge: [['valley', 2], ['fall', 1], ['arch', 1]],
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
    verse: [['recite', 4], ['wave', 1]], chorus: [['climb', 3], ['rise', 2], ['arch', 1]], bridge: [['climb', 2], ['recite', 1]],
    lift: [2, 5], register: 0, span: 0.75, leap: 0.1, leaps: [3, 4], repeat: 0.45, stable: 0.45, lean: 0.1, melisma: 0.03,
    busy: 1.1, legato: 0.72, sync: 0.45, verseStart: [['after', 3], ['pickup', 2]], chorusStart: [['pickup', 2], ['down', 2]],
    dark: 0.2, hookLeap: [[0, 3], [3, 1]], ends: 'open',
  },
  angry: {
    verse: [['recite', 3], ['rise', 1]], chorus: [['rise', 3], ['arch', 2]], bridge: [['climb', 2], ['rise', 1]],
    lift: [4, 7], register: 1, span: 0.9, leap: 0.25, leaps: [3, 4], repeat: 0.4, stable: 0.6, lean: 0.03, melisma: 0,
    busy: 1.15, legato: 0.6, sync: 0.4, verseStart: [['down', 3], ['after', 1]], chorusStart: [['down', 4]],
    dark: 0.15, hookLeap: [[3, 2], [0, 2]], ends: 'fall',
  },
  dark: {
    verse: [['recite', 3], ['fall', 2]], chorus: [['arch', 2], ['valley', 2], ['fall', 1]], bridge: [['valley', 2], ['recite', 1]],
    lift: [2, 5], register: -2, span: 0.8, leap: 0.1, leaps: [3, 4], repeat: 0.35, stable: 0.6, lean: 0.2, melisma: 0.06,
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
export function melodyStyle(seed: string, mood: Mood, genre: Genre): MelodyStyle {
  const rng = new Rng(`${seed}-melody`);
  const M = MOOD_MELODY[mood], G = GENRE_MELODY[genre];
  const s: MelodyStyle = {
    verse: rng.weighted(M.verse), chorus: rng.weighted(M.chorus), bridge: rng.weighted(M.bridge),
    verseForm: rng.weighted(VERSE_FORMS), chorusForm: rng.weighted(CHORUS_FORMS),
    lift: rng.int(M.lift[0], M.lift[1]) + G.lift, bridgeLift: 0,
    register: M.register + G.register, span: jitter(rng, M.span * G.span, 0.1),
    leap: clamp01(jitter(rng, M.leap)), leaps: M.leaps, repeat: clamp01(jitter(rng, M.repeat + G.repeat)), stable: clamp01(jitter(rng, M.stable, 0.08)),
    lean: clamp01(jitter(rng, M.lean, 0.3)), melisma: clamp01(M.melisma + G.melisma),
    busyVerse: jitter(rng, M.busy * G.busy, 0.1), busyChorus: jitter(rng, M.busy * G.busy, 0.1), legato: Math.min(1, M.legato * G.legato),
    sync: clamp01(M.sync + G.sync), verseStart: rng.weighted(M.verseStart), chorusStart: rng.weighted(M.chorusStart),
    blue: clamp01(G.blue * (['happy', 'triumphant', 'angry'].includes(mood) ? 1 : 0.6)), dark: clamp01(M.dark + G.dark),
    hookLeap: rng.weighted(M.hookLeap), ends: rng.chance(0.8) ? M.ends : M.ends === 'fall' ? 'open' : 'fall',
    twist: null,
  };
  // the bridge goes somewhere else: higher than the chorus, or (in the sadder moods) down low and quiet
  s.bridgeLift = ['melancholic', 'dark', 'dreamy'].includes(mood) && rng.chance(0.4) ? -2 : s.lift + rng.int(0, 2);
  // a twist about a third of the time
  if (rng.chance(0.35)) {
    const twists = Object.keys(TWIST_FIT) as Twist[];
    const t = rng.weighted(twists.map((k) => [k, TWIST_FIT[k](mood, genre)] as [Twist, number]));
    s.twist = t;
    if (t === 'octave') { s.register -= 2; s.lift = Math.max(s.lift + 5, 9); s.verse = 'recite'; s.span *= 0.9; }
    else if (t === 'chant') { s.verse = 'recite'; s.repeat = Math.max(s.repeat, 0.7); s.leap *= 0.3; }
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
  climb: 'climbing', wave: 'rolling up and down',
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

/** Rhythm cells per beat group, by how busy (positions within the group, 16ths). */
const CELLS: Record<number, number[][][]> = {
  // [sparse, medium, busy]
  4: [[[0], [0, 2], [2]], [[0, 2], [0, 2], [0, 3], [0, 1, 2], [2, 3]], [[0, 2, 3], [0, 1, 2], [0, 1, 2, 3], [0, 2]]],
  3: [[[0], [0, 2]], [[0, 2], [0, 1, 2], [0]], [[0, 1, 2], [0, 2]]],
  2: [[[0]], [[0], [0, 1]], [[0, 1]]],
};
const cellsFor = (g: number) => CELLS[g] ?? CELLS[g >= 4 ? 4 : g === 3 ? 3 : 2];

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

/** The notes the melody may use: verses pentatonic, choruses the mode with the pentatonic leaning. */
function scaleFor(song: Song, kind: SectionKind): number[] {
  const minor = MINORISH.includes(song.mode);
  const pent = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  return kind === 'verse' ? pent : [...new Set([...pent, ...SCALES[song.mode]])].sort((a, b) => a - b);
}

/** A two-bar line's rhythm: onsets (absolute steps) with stress, and where its last (held) note ends. */
interface LineRhythm { onsets: { g: number; stress: boolean }[]; end: number }

function lineRhythm(rng: Rng, bars: Bar[], busy: number, start: Start, sync: number, changes: number[] = []): LineRhythm {
  const onsets: { g: number; stress: boolean }[] = [];
  const level = (x: number) => Math.max(0, Math.min(2, Math.round(x + (rng.next() - 0.5) * 0.8)));
  const [b1, b2] = bars;
  const g1 = groupStarts(b1.groups);
  // a pickup: an 8th or two before the line, in the gap the last line left
  if (start === 'pickup' && b1.start >= 2 && rng.chance(0.8)) {
    const n = rng.chance(0.5) ? 2 : 1;
    for (let k = n; k >= 1; k--) onsets.push({ g: b1.start - 2 * k, stress: false });
  }
  b1.groups.forEach((len, gi) => {
    const cell = rng.pick(cellsFor(len)[level(busy)]);
    for (const p of cell) onsets.push({ g: b1.start + g1[gi] + p, stress: p === 0 });
  });
  // back-heavy: the line starts after the downbeat (on its "and", or the next beat)
  if (start === 'after') {
    const first = onsets.findIndex((o) => o.g === b1.start);
    if (first >= 0) onsets.splice(first, 1);
    const nextGroup = b1.start + (g1[1] ?? b1.len);
    if (!onsets.some((o) => o.g > b1.start && o.g < nextGroup) && b1.groups[0] >= 3) onsets.push({ g: b1.start + 2, stress: false });
  }
  // anticipations: a strong beat inside the bar sung an 8th early
  for (const o of onsets) {
    if (!o.stress || o.g === b1.start || !rng.chance(sync * 0.5)) continue;
    const to = o.g - 2;
    if (to > b1.start && !onsets.some((x) => x.g >= to && x.g < o.g)) o.g = to;
  }
  if (!b2) {
    // a one-bar line: hold its last note to the bar's last group
    const last = onsets[onsets.length - 1];
    const seen = new Set<number>();
    const os = onsets.filter((o) => (seen.has(o.g) ? false : (seen.add(o.g), true))).sort((a, b) => a.g - b.g);
    return { onsets: os, end: Math.max(last.g + 2, b1.start + g1[Math.max(1, g1.length - 1)]) };
  }
  // the second bar: a group or two more, then the held note on a strong beat, then a breath
  const g2 = groupStarts(b2.groups);
  const sungGroups = Math.max(0, Math.min(b2.groups.length - 2, rng.weighted([[0, 2], [1, 3], [2, 1]])));
  for (let gi = 0; gi < sungGroups; gi++) {
    const cell = rng.pick(cellsFor(b2.groups[gi])[level(busy - 0.5)]);
    for (const p of cell) onsets.push({ g: b2.start + g2[gi] + p, stress: p === 0 });
  }
  let hold = b2.start + g2[sungGroups];
  // (the held note lands with a chord change nearby: the voice moves with the band)
  const near = changes.filter((c) => c >= b2.start && c <= b2.start + b2.len - 4 && c !== hold && Math.abs(c - hold) <= 4);
  if (near.length && !changes.includes(hold) && rng.chance(0.75)) {
    hold = near.reduce((a, c) => (Math.abs(c - hold) < Math.abs(a - hold) ? c : a));
    for (let k = onsets.length - 1; k >= 0; k--) if (onsets[k].g >= hold) onsets.splice(k, 1);
  }
  // (rock's anticipation: the held note lands an 8th early)
  if (rng.chance(0.1 + sync * 0.5) && hold - 2 > Math.max(...onsets.map((o) => o.g))) hold -= 2;
  onsets.push({ g: hold, stress: true });
  const breath = b2.groups.length >= 4 ? b2.groups[b2.groups.length - 1] + (rng.chance(0.4) ? b2.groups[b2.groups.length - 2] : 0) : b2.groups[b2.groups.length - 1];
  const end = Math.max(hold + 2, b2.start + b2.len - breath);
  // no two notes on one step, sorted
  const seen = new Set<number>();
  return { onsets: onsets.filter((o) => (seen.has(o.g) ? false : (seen.add(o.g), true))).sort((a, b) => a.g - b.g), end };
}

/** One note of a tune; `tie`: sung on the last note's vowel (a sigh or a turn), no new syllable. */
export interface TuneNote { step: number; len: number; midi: number; stress: boolean; start: boolean; line: number; tie?: boolean }
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
  }
}

/** A line's onsets split by bar: the first bar's (the motif), the rest (its answer). */
const firstBar = (rh: LineRhythm, b2: number) => rh.onsets.filter((o) => o.g < b2);

interface Motif { rh: LineRhythm; start: number; b2: number; lens: number[]; shape: number[]; alt: number[] }

/**
 * The tune of a block: lines of two bars written by the style's form and contour for `kind`; `base`:
 * the verse's centre pitch (the song's anchor). Steps are relative to the block's start.
 */
export function writeTune(rng: Rng, song: Song, chords: ChordPart, kind: SectionKind, base: number, genre: Genre, style: MelodyStyle, band?: Band): Tune {
  const H = harmonyOf(song, chords);
  const P = PLANS[kind] ?? PLANS.verse!;
  const G = GENRE_LEAN[genre];
  const { key, bars, total, mode } = song;
  const scale = scaleFor(song, kind);
  const big = kind === 'chorus' || kind === 'outro';
  const lift = big ? style.lift : kind === 'prechorus' ? Math.round(style.lift / 2) : kind === 'bridge' ? style.bridgeLift : 0;
  const center = Math.max(LOW[0] + 2, Math.min(PEAK - 5, base + G.center + style.register + lift));
  const span = Math.max(5, Math.round(P.span * G.span * style.span));
  const lo = Math.max(LOW[0] - 3, center - Math.ceil(span / 2)), hi = Math.min(PEAK - 2, center + Math.floor(span / 2));
  const pool: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(mod(m - key, 12))) pool.push(m);
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
  const busy = P.busy * G.busy * (kind === 'verse' || kind === 'prechorus' ? style.busyVerse : style.busyChorus) * (kind === 'prechorus' ? 1.1 : 1);
  const start: Start = kind === 'verse' ? style.verseStart : big ? style.chorusStart : rng.pick<Start>(['down', 'pickup']);
  const height = Math.max(2, Math.round((kind === 'verse' ? (contour === 'recite' ? 1 : 2.5) : kind === 'prechorus' ? 3 : rng.pick([3, 4, 4, 5])) * Math.min(1.25, style.span)));
  const peak = rng.pick([0.35, 0.5, 0.6]);
  const minorish = MINORISH.includes(mode);

  const lines: Bar[][] = [];
  for (let i = 0; i < bars.length; i += 2) lines.push(bars.slice(i, i + 2));
  // (a pre-chorus's last line breaks off busier: the motif fragmenting into the chorus)
  const form = kind === 'verse' ? style.verseForm : big || kind === 'bridge' ? style.chorusForm : 'AAAB';
  // a pre-chorus climbs by sequence: the same line, a step higher each time
  const seq = kind === 'prechorus' ? rng.pick([1, 1, 2]) : 0;
  const motifs = new Map<string, Motif>();
  const notes: TuneNote[] = [];
  const last = lines.length - 1;

  lines.forEach((L, li) => {
    const letter = form[li % form.length];
    const name = letter.toUpperCase();
    const prev = motifs.get(name);
    const b2 = L[1]?.start ?? L[0].start + L[0].len;
    const lineStart = L[0].start;
    // a few tries at the line, the one that sits best with the band kept
    const attempt = (rng: Rng) => {
      const lineNotes: TuneNote[] = [];
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
          const head = firstBar(prev.rh, prev.b2).map((o) => ({ ...o, g: o.g + off }));
          const fresh = lineRhythm(rng, L, busy, 'down', style.sync, H.changes);
          rh = { onsets: [...head, ...fresh.onsets.filter((o) => o.g >= b2)], end: fresh.end };
          keep = head.length;
        }
      } else rh = lineRhythm(rng, L, busy * (kind === 'prechorus' && li === last ? 1.25 : 1), li === 0 && start === 'pickup' ? 'down' : start, style.sync, H.changes);
      // the line's anchor: the centre (answer lines a step lower in verses; a call-and-response chorus
      // answers well below), climbing by sequence through a pre-chorus
      const call = style.twist === 'call' && big && li % 2 === 1 ? -4 : 0;
      const anchor = clampIdx(nearestIdx(center + (kind === 'verse' && li % 2 === 1 ? -1 : 0)) + seq * li + call);
      const n = rh.onsets.length;
      const shape: number[] = [];
      const alt: number[] = [];
      let prevIdx = anchor;
      let leapDir = 0;
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
            else if (rng.chance(style.repeat)) move = 0;
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
        // (snapping back toward the last note: no bigger jump than written)
        if (want) { idx = nearTone(idx, g, undefined, idx > prevIdx && !hookNote); a = 0; }
        // the line's ending: closed on the root (the key's, if the chord has it), open on the 3rd or 5th
        if (isLast) {
          const tones = tonesAt(g);
          const home = tones.includes(key) ? key : tones[0];
          const fallIn = style.ends === 'fall' || contour === 'fall';
          idx = closed ? nearTone(idx, g, (m) => mod(m, 12) === home, fallIn) : nearTone(idx, g, (m) => mod(m, 12) !== key || tones.length < 3, fallIn);
          a = 0;
        }
        if (len >= 4 && rubs(pool[idx], g)) idx = Math.max(0, idx - 1);
        prevIdx = idx;
        shape.push(idx - anchor);
        alt.push(a);
        lineNotes.push({ step: g, len: Math.max(1, len), midi: pool[idx] + a, stress: o.stress, start: oi === 0, line: li });
      });
      return { rh, shape, alt, lineNotes };
    };
    const tries = band ? TRIES : 1;
    const seed = rng.next();
    let best = attempt(tries > 1 ? new Rng(`${seed}-0`) : rng);
    let bestScore = band ? bandScore(best.lineNotes, H, band, total) : 0;
    for (let c = 1; c < tries; c++) {
      const t = attempt(new Rng(`${seed}-${c}`));
      const sc = bandScore(t.lineNotes, H, band!, total);
      if (sc > bestScore) { best = t; bestScore = sc; }
    }
    const { rh, shape, alt } = best;
    notes.push(...best.lineNotes);
    if (!prev) motifs.set(name, { rh, start: lineStart, b2, lens: L.map((b) => b.len), shape, alt });
  });

  // nothing before the block or past it, nothing overlapping
  let out = notes.filter((n) => n.step >= 0 && n.step < total).sort((a, b) => a.step - b.step);
  out = out.filter((n, i) => i === 0 || n.step !== out[i - 1].step);
  out.forEach((n, i) => { const nx = out[i + 1]; n.len = Math.max(1, Math.min(n.len, (nx?.step ?? total) - n.step)); });
  // detached or joined: notes inside a line hold for the style's share of their gap
  out.forEach((n, i) => {
    const nx = out[i + 1];
    if (nx && nx.line === n.line && n.len >= 2 && n.len < 6) n.len = Math.max(1, Math.round(n.len * style.legato));
  });
  return { notes: ornament(rng, out, style, pool, tonesAt), lines: lines.length };
}

/**
 * Sighs and turns on held notes (one syllable over two or three notes): an appoggiatura (the held note
 * sung a step above first, falling into the chord note: [M] the device behind "tears" in sad songs) or,
 * at a line's end, a little turn down onto the note.
 */
function ornament(rng: Rng, notes: TuneNote[], style: MelodyStyle, pool: number[], tonesAt: (g: number) => number[]): TuneNote[] {
  const out: TuneNote[] = [];
  const up = (m: number) => pool.find((x) => x > m) ?? m + 2;
  notes.forEach((n, i) => {
    const lineEnd = !notes[i + 1] || notes[i + 1].line !== n.line;
    const onTone = tonesAt(n.step).includes(mod(n.midi, 12));
    if (n.len >= 6 && onTone && rng.chance(style.lean)) {
      const above = up(n.midi);
      if (!tonesAt(n.step).includes(mod(above, 12))) {
        const a = n.len >= 8 ? 4 : 2;
        out.push({ ...n, len: a, midi: above }, { ...n, step: n.step + a, len: n.len - a, start: false, tie: true });
        return;
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
export function followTension(idea: Idea, ref: number, mood: Mood, style: MelodyStyle, rng: Rng): { up: number; down: number; turns: number } {
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
    const d = (bs.reduce((a, b) => a + t[b], 0) / bs.length - ref) * FOLLOW[mood];
    const p = clamp01((Math.abs(d) - 0.04) / 0.18);
    if (!p) continue;
    // which notes move: the held ones, and (going up) the line's top note
    const free = L.filter((i) => v[i].syl.text !== '~' && !tied(i));
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
        if (!tones.includes(mod(m, 12)) || m > PEAK - 2 || m < LOW[0] - 3) continue;
        n.midi = m;
        if (d > 0) out.up++; else out.down++;
        break;
      }
    }
    // a big lift: the line's last held note turns (up a step and back) on its vowel
    const last = L[L.length - 1];
    if (d > 0.15 && style.melisma > 0.05 && v[last].len >= 6 && v[last].syl.text !== '~' && rng.chance(p * 0.6)) {
      const n = v[last];
      const up = n.midi + (mod(n.midi + 1, 12) === scale.find((x) => x === mod(n.midi + 1, 12)) ? 1 : 2);
      const cont = (coda: Syllable['coda']): Syllable => ({ onset: [], vowel: n.syl.vowel, coda, stress: false, text: '~', wordStart: false });
      v.splice(last, 1,
        { ...n, len: 2, syl: { ...n.syl, coda: [] } },
        { ...n, step: n.step + 2, len: 1, midi: Math.min(up, PEAK), start: false, syl: cont([]) },
        { ...n, step: n.step + 3, len: n.len - 3, start: false, syl: cont(n.syl.coda) });
      out.turns++;
    }
  }
  return out;
}
