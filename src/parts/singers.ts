// Who sings the song (research: docs/VOCAL.md, section 7). Melodies alone don't make songs sound
// different: singers do. Each song gets a singer whose phrasing is their own: how long their lines run
// (a short hook said twice then a long answer, or four bars on one breath), how many words they pack in,
// whether they hold notes through the bar, slide into them, run down off them, or wail up high. The
// mood still writes the tune's shape (melody.ts); the singer decides how it's phrased and delivered.
// Characters, not impressions: each is a kind of singer heard across rock and pop (examples in the docs).

import type { Genre } from '../genres';
import type { SectionKind } from '../idea';
import { Rng } from '../rng';
import type { Mood } from '../tension';
import type { Contour } from './melody';

export type SingerKind = 'wailer' | 'storyteller' | 'drawler' | 'brooder' | 'popvoice' | 'chanter' | 'crooner' | 'shouter';

/**
 * A run on one vowel: down from above into a note, up into it, an R&B wave, a blues fall, or off a held
 * note's end. The singers use only the Western rock and soul ones for now, down into a note, the blues
 * fall and the tail, and fewer of them (Paul: the runs sounded Chinese; climbing and waving runs on a
 * vowel are the closest to that).
 */
export type RunKind = 'cascade' | 'climb' | 'wave' | 'blues' | 'tail';

type W<T> = [T, number][];

/**
 * Phrase plans: the bars each sung line takes, e.g. "1124" (a short line, the same again, then a long
 * answer: the "sentence" form), "44" (two long lines on one breath each), "2222" (the even two-bar lines).
 */
type Plans = Partial<Record<SectionKind, W<string>>>;

export interface Singer {
  kind: SingerKind;
  desc: string;
  plans: Plans;
  /** Words per beat (x), verses and choruses. */
  density: [number, number];
  /** Chance a beat is a patter of 16ths (wordy, tumbling lines). */
  flow: number;
  /** Chance a beat is syncopated (a word on the "a" pushing over the beat, or only on the "and"). */
  syncop: number;
  /** Chance a note inside a line is held through the next beat (long notes mid-line, drawn-out words). */
  hold: number;
  /** How long the last note of a line is held: a beat, to the breath, or through the bar line (a bar and a half). */
  holdLen: W<'short' | 'mid' | 'long'>;
  /**
   * Chance a held note gets a run on its vowel; how many notes; which kinds. Long runs, and runs from
   * high above the note, are the wailer's own (Paul: "too many long runs ... this could be a singer
   * characteristic rather than giving this to all songs"); the others' are few and short.
   */
  runs: number;
  runLen: [number, number];
  runKinds: W<RunKind>;
  /** Chance a big line (chorus, bridge) peaks on a high held note (a wail); semitones it may go above the usual top. */
  belt: number;
  top: number;
  /** Range (x) and register (semitones). */
  span: number;
  register: number;
  /** Chances: scooping up into a held note (and from how far), falling off a line's end. */
  slide: number;
  fall: number;
  /** More (or fewer) repeated notes and leaps than the mood's own. */
  repeat: number;
  leap: number;
  /** Their own way with the contours (taken over the mood's about half the time). */
  contours?: { verse?: W<Contour>; chorus?: W<Contour> };
}

const SINGERS: Record<SingerKind, Singer> = {
  wailer: {
    kind: 'wailer', desc: 'a wailer: long lines climbing to high held notes, runs cascading down off them',
    plans: {
      verse: [['2222', 3], ['224', 2], ['44', 1]], chorus: [['1124', 3], ['44', 2], ['224', 2], ['2222', 1]],
      prechorus: [['2211', 2], ['1111', 1], ['22', 1]], bridge: [['44', 2], ['224', 1]],
    },
    density: [1, 0.75], flow: 0.12, syncop: 0.25, hold: 0.2, holdLen: [['short', 1], ['mid', 3], ['long', 3]],
    runs: 0.2, runLen: [4, 7], runKinds: [['cascade', 3], ['blues', 3], ['tail', 4]],
    belt: 0.6, top: 2, span: 1.35, register: 1, slide: 0.35, fall: 0.25, repeat: -0.05, leap: 0.08,
    contours: { chorus: [['rise', 3], ['arch', 2]] },
  },
  storyteller: {
    kind: 'storyteller', desc: 'a storyteller: wordy verse lines tumbling down on one breath, then a chorus that opens up',
    plans: {
      verse: [['44', 3], ['224', 2], ['2222', 1]], chorus: [['1124', 3], ['2222', 2], ['224', 1]],
      prechorus: [['22', 2], ['2211', 1]], bridge: [['224', 1], ['44', 1]],
    },
    density: [1.4, 0.9], flow: 0.45, syncop: 0.3, hold: 0.08, holdLen: [['short', 2], ['mid', 3], ['long', 1]],
    runs: 0.05, runLen: [3, 4], runKinds: [['cascade', 2], ['tail', 1], ['blues', 1]],
    belt: 0.35, top: 1, span: 1.2, register: 0, slide: 0.15, fall: 0.2, repeat: 0.05, leap: 0.03,
    contours: { verse: [['tumble', 4], ['fall', 1]] },
  },
  drawler: {
    kind: 'drawler', desc: 'a low drawl: few words stretched long, sliding into notes, behind the beat, swelling late',
    plans: {
      verse: [['44', 2], ['2222', 2], ['224', 1]], chorus: [['44', 2], ['224', 2], ['1124', 1]],
      prechorus: [['22', 2], ['4', 1]], bridge: [['44', 2]],
    },
    density: [0.6, 0.5], flow: 0, syncop: 0.4, hold: 0.45, holdLen: [['mid', 2], ['long', 3]],
    runs: 0.08, runLen: [3, 4], runKinds: [['tail', 5], ['cascade', 1]],
    belt: 0.35, top: 1, span: 1.1, register: -1, slide: 0.55, fall: 0.5, repeat: 0.05, leap: 0.05,
    contours: { verse: [['fall', 2], ['arch', 2]], chorus: [['arch', 2], ['rise', 1]] },
  },
  brooder: {
    kind: 'brooder', desc: 'a brooding voice: long notes held through the chords, slid into, a narrow dark line that suddenly wails',
    plans: {
      verse: [['2222', 3], ['44', 2], ['1111', 1]], chorus: [['44', 3], ['224', 2], ['2222', 1]],
      prechorus: [['22', 1], ['1111', 1]], bridge: [['44', 2], ['2222', 1]],
    },
    density: [0.75, 0.55], flow: 0.03, syncop: 0.3, hold: 0.4, holdLen: [['mid', 2], ['long', 4]],
    runs: 0.05, runLen: [3, 4], runKinds: [['tail', 4]],
    belt: 0.35, top: 1, span: 0.85, register: 0, slide: 0.65, fall: 0.35, repeat: 0.2, leap: -0.03,
    contours: { verse: [['recite', 1], ['valley', 2]], chorus: [['arch', 2], ['valley', 1]] },
  },
  popvoice: {
    kind: 'popvoice', desc: 'a pop voice: tight syncopated hooks said twice, little runs at the line ends',
    plans: {
      verse: [['2222', 2], ['1124', 2], ['1111', 1]], chorus: [['1111', 2], ['1124', 3], ['2222', 1]],
      prechorus: [['1111', 2], ['2211', 1]], bridge: [['224', 1], ['2222', 1]],
    },
    density: [1.1, 1], flow: 0.3, syncop: 0.5, hold: 0.1, holdLen: [['short', 2], ['mid', 3], ['long', 1]],
    runs: 0.1, runLen: [3, 4], runKinds: [['cascade', 2], ['tail', 4]],
    belt: 0.3, top: 1, span: 1.1, register: 0, slide: 0.15, fall: 0.1, repeat: 0.05, leap: 0.03,
  },
  chanter: {
    kind: 'chanter', desc: 'a chanter: short punchy rhythmic lines, call and answer, close to one note',
    plans: {
      verse: [['1111', 3], ['2222', 1], ['1124', 1]], chorus: [['1124', 2], ['1111', 2], ['2222', 1]],
      prechorus: [['1111', 2]], bridge: [['1111', 1], ['224', 1]],
    },
    density: [1.3, 1], flow: 0.35, syncop: 0.55, hold: 0.05, holdLen: [['short', 4], ['mid', 2]],
    runs: 0.01, runLen: [3, 3], runKinds: [['tail', 1]],
    belt: 0.15, top: 0, span: 0.7, register: 0, slide: 0.1, fall: 0.15, repeat: 0.25, leap: -0.05,
    contours: { verse: [['recite', 2], ['wave', 1]] },
  },
  crooner: {
    kind: 'crooner', desc: 'a crooner: long legato arcs, gentle wide leaps, few words, turns on the held notes',
    plans: {
      verse: [['44', 2], ['2222', 2]], chorus: [['44', 2], ['224', 2], ['2222', 1]],
      prechorus: [['22', 1]], bridge: [['44', 1]],
    },
    density: [0.7, 0.55], flow: 0, syncop: 0.2, hold: 0.3, holdLen: [['short', 1], ['mid', 3], ['long', 2]],
    runs: 0.08, runLen: [3, 4], runKinds: [['cascade', 2], ['tail', 3]],
    belt: 0.25, top: 1, span: 1.25, register: 0, slide: 0.3, fall: 0.1, repeat: -0.05, leap: 0.1,
    contours: { verse: [['arch', 3], ['wave', 1]], chorus: [['arch', 3], ['rise', 1]] },
  },
  shouter: {
    kind: 'shouter', desc: 'a shouter: short hard lines up high, held screams on the peaks',
    plans: {
      verse: [['1111', 2], ['2222', 2], ['1124', 1]], chorus: [['1124', 2], ['2222', 2], ['224', 1]],
      prechorus: [['1111', 2], ['22', 1]], bridge: [['224', 1], ['1111', 1]],
    },
    density: [1.1, 0.8], flow: 0.2, syncop: 0.2, hold: 0.05, holdLen: [['short', 2], ['mid', 2], ['long', 2]],
    runs: 0.03, runLen: [3, 4], runKinds: [['tail', 1], ['blues', 1]],
    belt: 0.5, top: 1, span: 1, register: 1, slide: 0.2, fall: 0.3, repeat: 0.15, leap: 0.05,
  },
};

/** Who sings which genre ([P]: the singers each scene is known for). */
const BY_GENRE: Record<Genre, W<SingerKind>> = {
  rock: [['storyteller', 3], ['wailer', 2], ['drawler', 2], ['popvoice', 1], ['crooner', 1], ['shouter', 0.5]],
  hardrock: [['wailer', 4], ['shouter', 2], ['storyteller', 2], ['brooder', 0.5]],
  metal: [['shouter', 3], ['wailer', 3], ['brooder', 1], ['chanter', 1]],
  altmetal: [['brooder', 3], ['chanter', 2], ['wailer', 2], ['drawler', 1], ['shouter', 1]],
  grunge: [['brooder', 3], ['drawler', 3], ['wailer', 2], ['shouter', 0.5]],
  pop: [['popvoice', 4], ['crooner', 2], ['storyteller', 1], ['wailer', 0.5]],
  funk: [['chanter', 3], ['popvoice', 3], ['wailer', 0.5]],
};

/** Moods lean who sings: sad songs drawn out and brooding, angry ones shouted and chanted. */
const BY_MOOD: Record<Mood, Partial<Record<SingerKind, number>>> = {
  happy: { popvoice: 1.6, storyteller: 1.4, brooder: 0.4 },
  triumphant: { wailer: 1.8, shouter: 1.3, brooder: 0.5 },
  nostalgic: { storyteller: 1.6, crooner: 1.5, drawler: 1.2 },
  melancholic: { drawler: 1.8, crooner: 1.8, brooder: 1.4, shouter: 0.3, chanter: 0.4 },
  dreamy: { crooner: 2, drawler: 1.4, shouter: 0.2, chanter: 0.5 },
  tense: { chanter: 1.6, brooder: 1.5 },
  angry: { shouter: 2, chanter: 1.8, crooner: 0.3 },
  dark: { brooder: 2, drawler: 1.3, popvoice: 0.4 },
};

/** The song's singer, by its genre and mood (and a little chance). */
export function pickSinger(seed: string, mood: Mood, genre: Genre): Singer {
  const w = BY_GENRE[genre].map(([k, x]) => [k, x * (BY_MOOD[mood][k] ?? 1)] as [SingerKind, number]);
  return SINGERS[new Rng(`${seed}-singer`).weighted(w)];
}

/** A section's phrase plan: the bars each line takes, fitted to the section's length. */
export function phrasePlan(rng: Rng, singer: Singer, kind: SectionKind, bars: number): number[] {
  const plans = singer.plans[kind] ?? singer.plans[kind === 'outro' ? 'chorus' : 'verse']!;
  const pattern = [...rng.weighted(plans)].map(Number);
  const out: number[] = [];
  let left = bars;
  for (let i = 0; left > 0; i++) {
    const want = pattern[i % pattern.length];
    out.push(Math.min(want, left));
    left -= out[out.length - 1];
  }
  return out;
}

/**
 * The voice itself: clear (the first voice, kept as it was) or a genre's voice (src/audio/voices.ts:
 * made with Paul in the voice lab; on Auto, the song's genre's).
 */
export type Timbre = 'clear' | Genre;

/** Semitones lower than the clear voice each genre's voice has its tunes written (where it sits best, by ear in the voice lab). */
export const VOICE_DOWN: Record<Genre, number> = { rock: 6, pop: 3, funk: 4, hardrock: 3, metal: 2, grunge: 8, altmetal: 6 };

/** The singer's voice on Auto: the song's genre's. */
export function pickTimbre(genre: Genre): Timbre {
  return genre;
}

/**
 * The high singers (Paul: "only Chester, the high rock and the female to be the higher voices"): every
 * song sung high has one of them, made in the voice creator. Chester (clean & scream): a tenor singing
 * at the low voice's pitch, its tunes written 3 semitones higher. The rock tenor: an octave up, its tunes
 * written 4 lower (about a minor 6th over the low voice). The woman: an octave up, the tunes written 3
 * lower (Paul: "avoid very high notes consistently"). (The tunes rewritten in key: a shift by anything
 * but octaves would take them out of the key.) Each has a top they sing to (sung MIDI), and a higher one
 * only for belted or pushed notes: over it the voice thins into a whistle (Paul: "sounding like a
 * whistle at points"); the tunes are kept under them (vocal.ts, fitHigh).
 */
export type HighVoice = 'chester' | 'tenor' | 'woman';
export const HIGH_VOICES: Record<HighVoice, { label: string; lift: number; octave: boolean; top: number; beltTop: number }> = {
  // (G4 sung clean, A#4 belted or screamed)
  chester: { label: 'Chester (clean & scream)', lift: 3, octave: false, top: 67, beltTop: 70 },
  // (A4, C5)
  tenor: { label: 'the rock tenor', lift: -4, octave: true, top: 69, beltTop: 72 },
  // (C5, D#5)
  woman: { label: 'a woman (soaring)', lift: -3, octave: true, top: 72, beltTop: 75 },
};
/** Who sings high in each genre, by how well they fit it. */
const HIGH_BY_GENRE: Record<Genre, W<HighVoice>> = {
  rock: [['tenor', 3], ['chester', 2], ['woman', 2]],
  pop: [['woman', 3], ['tenor', 2], ['chester', 0.5]],
  funk: [['woman', 3], ['tenor', 2]],
  hardrock: [['tenor', 3], ['chester', 2], ['woman', 1]],
  metal: [['chester', 3], ['tenor', 2], ['woman', 0.5]],
  grunge: [['tenor', 3], ['chester', 1], ['woman', 1]],
  altmetal: [['chester', 4], ['tenor', 1], ['woman', 0.5]],
};
/** A song's high singer (used when it's sung high), at random by its genre. */
export function pickHigh(seed: string, genre: Genre): HighVoice {
  return new Rng(`${seed}-high`).weighted(HIGH_BY_GENRE[genre]);
}
/** The low singers among the characters: chosen with the voice on Auto, they sing low. */
const LOW_CHARACTERS = ['deep', 'nasal', 'cornell', 'onyx'];
/**
 * Who sings the lead high, if anyone: Chester or the woman when chosen as the voice; otherwise, sung
 * high (the voice type High, or Auto and the song's own), the song's high singer. The clear voice keeps
 * its own high voice; a low character on Auto sings low.
 */
export function leadHigh(i: { vocalVoice?: 'low' | 'high'; vocalHigh?: HighVoice }, voice: string, timbre: string): HighVoice | null {
  if (voice === 'off' || timbre === 'clear') return null;
  if (timbre === 'scream') return 'chester';
  if (timbre === 'woman') return 'woman';
  const high = voice === 'high' || (voice !== 'low' && !LOW_CHARACTERS.includes(timbre) && i.vocalVoice === 'high');
  return high ? i.vocalHigh ?? 'tenor' : null;
}
