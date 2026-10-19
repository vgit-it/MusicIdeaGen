// The demo singer's voice: a Klatt formant synthesizer (klatt-syn, MIT, Christian d'Heureuse) driven
// frame by frame from the sung notes (research: docs/VOCAL.md). Each sung line is rendered ahead of
// time into a buffer, so it plays the same live, in exports and on phones.
// - a glottal pulse (with the synth's slow flutter) through five oral formants: sung vowel targets for a
//   low (tenor-baritone) or high (alto) voice, F1 kept above the pitch on high notes, diphthongs held
//   on their first vowel and glided at the end
// - consonants as a singer places them: onsets before the beat so the vowel lands on it, codas at the
//   end of the note; stops (closure, burst, aspiration), fricatives (shaped noise), nasals (the nasal
//   pole and zero), liquids and glides (formant targets), with formant transitions into the vowel
// - pitch: glides between legato notes (quicker in fast runs), scoops up into the notes the singer slides
//   into, vibrato that grows on long notes, falls off the ends of lines; a breath of aspiration at phrase ends
// - the voices: clear (the first voice, as it was, on klatt-syn's own pulse), or a voice recipe
//   (voices.ts: one per genre, made with Paul in the voice lab, docs/VOICES.md) on the voice box
//   (voicebox.ts: the LF model of the vocal folds): a rock singer, not an opera singer; three registers
//   (deep, mid, high) sounding together and mixed by pitch, vowel and loudness; their way up past the
//   break (a belt, a scream, a squeal or falsetto); grit, breath and drive growing on the loud notes

import { type FrameParms, Generator } from 'klatt-syn';
import type { Cons, Syllable, Vowel } from '../parts/lyrics';
import { ride } from './level';
import { type VoiceFrame, VoiceBox } from './voicebox';

export const SING_RATE = 22050;
const FRAME = 0.004;

export type F3 = [number, number, number];
/** Sung vowel formants (F1-F3, low voice; front vowels' F2 a little darker than speech). [vowel, glide target] */
export const VOWELS: Record<Vowel, [F3, F3?]> = {
  IY: [[280, 2100, 2900]], IH: [[400, 1850, 2550]], EY: [[470, 1950, 2600], [400, 1850, 2550]], EH: [[540, 1720, 2500]],
  AE: [[650, 1650, 2450]], AA: [[700, 1100, 2550]], AO: [[580, 880, 2500]], OW: [[490, 920, 2450], [450, 1050, 2350]],
  UH: [[450, 1050, 2350]], UW: [[330, 880, 2300]], AH: [[620, 1200, 2500]], AX: [[500, 1400, 2500]],
  AY: [[700, 1150, 2550], [420, 1800, 2550]], AW: [[700, 1150, 2550], [450, 1050, 2350]], OY: [[580, 880, 2500], [420, 1800, 2550]],
  // (the r-coloured vowel of "bird", "never": F3 pulled down to about 1.7 kHz; held steady: the colour is the whole of it)
  ER: [[500, 1320, 1680]],
};

type Kind = 'stop' | 'fric' | 'nasal' | 'liquid' | 'h' | 'affric';
export interface ConsSpec { kind: Kind; voiced: boolean; /** liquids: dB under the vowel (left out: -3 or -5) */ lvl?: number; /** liquids: its formants held through the sound, not just touched in the middle */ hold?: boolean; f: F3; /** stop/fricative noise shape */ shape?: 'lab' | 'alv' | 'vel' | 's' | 'sh' | 'flat'; anti?: number; dur: number }
export const CONS: Record<Cons, ConsSpec> = {
  P: { kind: 'stop', voiced: false, f: [250, 900, 2300], shape: 'lab', dur: 0.075 }, B: { kind: 'stop', voiced: true, f: [250, 900, 2300], shape: 'lab', dur: 0.06 },
  T: { kind: 'stop', voiced: false, f: [280, 1750, 2700], shape: 'alv', dur: 0.075 }, D: { kind: 'stop', voiced: true, f: [280, 1750, 2700], shape: 'alv', dur: 0.06 },
  K: { kind: 'stop', voiced: false, f: [300, 1900, 2400], shape: 'vel', dur: 0.08 }, G: { kind: 'stop', voiced: true, f: [300, 1900, 2400], shape: 'vel', dur: 0.065 },
  M: { kind: 'nasal', voiced: true, f: [260, 1100, 2400], anti: 750, dur: 0.06 }, N: { kind: 'nasal', voiced: true, f: [260, 1500, 2600], anti: 1450, dur: 0.055 },
  NG: { kind: 'nasal', voiced: true, f: [260, 2100, 2700], anti: 2600, dur: 0.06 },
  F: { kind: 'fric', voiced: false, f: [300, 1000, 2300], shape: 'flat', dur: 0.08 }, V: { kind: 'fric', voiced: true, f: [300, 1000, 2300], shape: 'flat', dur: 0.08 },
  TH: { kind: 'fric', voiced: false, f: [350, 1500, 2600], shape: 'flat', dur: 0.08 }, DH: { kind: 'fric', voiced: true, f: [350, 1500, 2600], shape: 'flat', dur: 0.06 },
  S: { kind: 'fric', voiced: false, f: [320, 1700, 2700], shape: 's', dur: 0.065 }, Z: { kind: 'fric', voiced: true, f: [320, 1700, 2700], shape: 's', dur: 0.07 },
  SH: { kind: 'fric', voiced: false, f: [300, 1700, 2400], shape: 'sh', dur: 0.09 },
  CH: { kind: 'affric', voiced: false, f: [300, 1800, 2400], shape: 'sh', dur: 0.1 }, JH: { kind: 'affric', voiced: true, f: [300, 1800, 2400], shape: 'sh', dur: 0.08 },
  HH: { kind: 'h', voiced: false, f: [500, 1400, 2500], dur: 0.06 },
  L: { kind: 'liquid', voiced: true, f: [360, 1150, 2800], dur: 0.075, lvl: -2, hold: true }, R: { kind: 'liquid', voiced: true, f: [350, 1150, 1650], dur: 0.065 },
  W: { kind: 'liquid', voiced: true, f: [300, 700, 2200], dur: 0.07 }, Y: { kind: 'liquid', voiced: true, f: [260, 2200, 3000], dur: 0.06 },
  // (the flap of "water", "better": the tongue taps the ridge once, the voice dipping for 25-30 ms and going on; no burst)
  DX: { kind: 'liquid', voiced: true, f: [330, 1650, 2700], dur: 0.03, lvl: -9 },
};

/**
 * The "l" at the end of a syllable ("all", "cold", "bell", "little"): dark, the back of the tongue pulled down, so F2 falls to about
 * 1 kHz (a real voice saying "bell": F2 1350 -> 800, but taken lower here it sounded rounded, like "oo" or "w", Paul), with its upper
 * formants kept strong (fof.ts, `hold`) so it stays an l and not a w; the "l" that starts a syllable ("love") keeps F2 near 1150.
 */
export const DARK_L: ConsSpec = { kind: 'liquid', voiced: true, f: [480, 1000, 2900], dur: 0.15, lvl: -1.5, hold: true };

/**
 * A note to sing, in seconds from the line's start (its vowel lands at `t`); `slide`: scooped up into from
 * so many semitones below; `fall`: falls off its end by so many (left out: the line's own way).
 */
export interface SungNote {
  t: number; end: number; midi: number; vel: number; syl: Syllable; slide?: number; fall?: number; bend?: number;
  /** The scoop into the note lasts this many seconds (left out: the voice's own). */
  slideLen?: number;
  /** Human feel (the guide line, src/guide/feel.ts; left out: as before): `glide` seconds from the note before; `swell` seconds rising into it; `fade` seconds fading out at its end; `sharp` cents over. */
  glide?: number; swell?: number; fade?: number; sharp?: number;
  /** How many dB the `fade` takes the level down by (left out: 18). */
  fadeBy?: number;
  /** A quieter note: its level times this (0.8: a fifth quieter in amplitude); the fades and the rest apply on top. */
  gain?: number;
}

export interface VoiceShape {
  high: boolean;
  /** 0-1: how much it scoops into lines and falls off their ends (by the song's style). */
  slides: number;
  /** A fixed random-ish identity (tract length, vibrato rate). */
  seed: number;
  /** Another person (the backing singer): vocal tract length (x), more breath (dB), vibrato depth (x). */
  person?: { tract: number; breath: number; vibrato: number };
  /** The voice's recipe (voices.ts; the voice lab tries them out); left out: the clear voice. */
  recipe?: VoiceRecipe;
  /** How the syllables join (left out: as written, each note starting and stopping on its own). */
  flow?: Flow;
}

/**
 * How sung syllables join, as a language is spoken or sung (Paul: "a lot of unnatural start-stops"):
 * legato (flowing: the vowel carries on into the next syllable), words (flowing within a word, a short
 * lift between words, a catch in the throat on a word starting with a vowel), phrases (flowing, the
 * words told apart by a small dip in level instead of a stop). In all three the voice fades in and out
 * instead of switching, its loudness follows one line across the notes, and consonants are shorter.
 */
export type Flow = 'legato' | 'words' | 'phrases';

/**
 * The notes as joined: short gaps (under a quarter second) filled so the vowel runs into the next
 * syllable, or (words) a lift of about 60 ms kept before each new word. Longer gaps are rests: kept.
 */
export function joinNotes(notes: SungNote[], flow: Flow): SungNote[] {
  return notes.map((n, i) => {
    const nx = notes[i + 1];
    if (!nx || nx.t - n.end >= 0.25) return n;
    const newWord = nx.syl.wordStart && nx.syl.text !== '~';
    if (flow === 'words' && newWord) return { ...n, end: Math.max(n.t + 0.6 * (nx.t - n.t), Math.min(n.end, nx.t - 0.06)) };
    return { ...n, end: nx.t };
  });
}

/** A voice: how it's made, aspect by aspect (each left out: as the clear voice). */
export interface VoiceRecipe {
  /** The clear voice on the voice box (the LF pulse), with registers like the raspy and deep voices'. */
  lf?: boolean;
  /** A natural, slow wander in pitch (cents), and a vibrato a little uneven from note to note. */
  drift?: number;
  /** Vibrato depth (x) and rate (Hz, added). */
  vib?: number;
  vibHz?: number;
  /** Formant bandwidths (x): wider is softer and warmer, narrower buzzier. */
  bw?: number;
  /** The vocal tract (formants x: below 1 a bigger, darker person). */
  formants?: number;
  /** More breath (dB). */
  breath?: number;
  /** The singer's ring (0-1): the 3rd-5th formants drawn together near 3 kHz. */
  ring?: number;
  /** Samples a second (more room up top: 44100); Klatt's output low-pass off (the clear voice then on the voice box, with Klatt's own pulse). */
  rate?: number;
  crisp?: boolean;
  /** The formants above 5 kHz (Klatt's design stops at 5 kHz: everything above it falls away steeply). */
  top?: boolean;
  /** Brightness (dB of tilt, added: below 0 brighter); presence (dB at 3.5 kHz); air (dB, a shelf above 8 kHz). */
  tilt?: number;
  presence?: number;
  air?: number;
  /** A rock singer, not an opera singer (docs/VOICES.md, section 7): vowels as spoken, the mouth open
   * (0-1: F1 up, front vowels' F2 up); folds pressed (0-1: closed longer); vibrato starting late (s)
   * and uneven (0-1); a harder start to a line (s: how long it fades in); grit (0-1: rough cycles, an
   * undertone, a harsh edge as they push); drive (0-1: saturated, as rock vocals are recorded). */
  speech?: number;
  /** Body: dB around 250 Hz (warmth, chest); low: dB of a shelf below 180 Hz (the voice's weight). */
  body?: number;
  low?: number;
  /** The upper formants' bandwidths only (x, F3-F5): softer edge without blurring F1 and F2 (a wide F1 sounds nasal). */
  bwUpper?: number;
  /**
   * How they go up past their break (the same person, higher; docs/VOICES.md): a power belt (chest
   * carried up, vowels opened, grit growing with height, wide vibrato on the held notes), a squeal
   * (lighter and twangy up top, the rasp growing fast, quick narrow vibrato), a scream (a clean belt
   * that tears into distortion on the hardest top notes), or falsetto (light, airy, clean).
   */
  high?: 'belt' | 'squeal' | 'scream' | 'falsetto';
  /**
   * Depth in the belt and the middle (0-1): the larynx raised less, the vowel opened less, the folds
   * less pressed, the throat a little wider, and chest voice kept a couple of notes longer before mixing.
   */
  depth?: number;
  /**
   * Registers mixed (0-1): chest voice (the singer's natural vowel and pulse) sounding under the
   * register they're in, most around the break and the middle, giving way at the top.
   */
  mix?: number;
  /**
   * Three registers (deep, mid, high), each its own pulse and vocal tract, all sounding at once in
   * step and mixed by the pitch: the deep one (a bigger, darker throat, a relaxed chest pulse) most on
   * low notes, the mid one (the natural vowel, gently opened) through the middle, the high one (by
   * their way up: belt, scream, squeal or falsetto) at the top.
   */
  three?: boolean;
  /**
   * Edge (0-1): the folds closing faster (a lower Rd) and less tilt, so the upper range (1.5-4 kHz)
   * comes through: what an open vowel ("ah", "oh") lacks when it sounds hollow.
   */
  edge?: number;
  /**
   * The three registers' shares set by hand (the voice lab, voice-rc.html): [MIDI, deep, mid, high]
   * points, interpolated between by the pitch sung; left out: by where the pitch sits against the break.
   */
  regPoints?: [number, number, number, number][];
  /** The voice's own register mix on Auto (REGISTER_MIX; default the grunge one). */
  regMix?: 'grunge' | 'rock';
  /** How far a chest or belt vowel opens on higher notes (x, default 1; less: less of a small, cartoon voice). */
  open?: number;
  /** The vocal folds' slow natural flutter (x Klatt's own, about 1.5% at 5-13 Hz; 0: none). */
  flutter?: number;
  /** Their break (MIDI), if not the person's own. */
  brk?: number;
  /** No nasal resonance anywhere (m, n, ng by the mouth alone). */
  noNasal?: boolean;
  /** "s" and "sh" (dB, added: below 0 softer). */
  ess?: number;
  /** Breathy (dB): air through every vowel (against the voice's level, e.g. -22), not only a breath at a line's end. */
  airy?: number;
  pressed?: number;
  vibStart?: number;
  vibVary?: number;
  attack?: number;
  grit?: number;
  drive?: number;
}

/** A voice-box singer: their own range and how they sing across it (docs/VOICES.md, section 3). */
interface Person {
  /** Formants (x: the size of their vocal tract), the upper formants (x). */
  formants: number;
  f45: number;
  /** Their break (MIDI, low voice): chest voice below, belt or head voice above (the high voice's is 9 notes up). */
  brk: number;
  /** The pulse (Rd): chest voice soft to loud, a belt, head voice. */
  chest: [number, number];
  belt: number;
  head: number;
  /** Rasp (their false folds, 0-1), the chance of vocal fry at the bottom of a line's end. */
  rasp: number;
  fry: number;
  /** Darker (dB of tilt); vibrato rate (Hz, added) and depth (x). */
  tilt: number;
  vibHz: number;
  vib: number;
}
/** The voice-box singer every recipe starts from: a tenor-baritone (each recipe sets their break, grit and so on). */
const PERSON: Person = { formants: 1, f45: 1, brk: 65, chest: [1.4, 0.85], belt: 0.6, head: 1.9, rasp: 0, fry: 0, tilt: 0, vibHz: 0, vib: 1 };

/**
 * Edge by vowel (x the recipe's): full on the open and back vowels, where the 1.5-4 kHz range is
 * otherwise empty ("ah" sounded hollow to Paul; edge fixed it), half on the front ones, which have a
 * resonance up there already (edge brought them up much more: harsh).
 */
export const EDGE_VOWEL: Record<Vowel, number> = {
  AA: 1, AO: 1, AW: 1, AY: 0.9, OY: 0.9, OW: 1, UH: 0.9, UW: 0.9, AH: 0.9, AX: 0.8, AE: 0.7, EH: 0.5, EY: 0.5, IH: 0.5, IY: 0.45, ER: 0.6,
};

/**
 * The three registers' shares by where a note sits against the singer's break (semitones): [place,
 * deep, mid, high], from Paul's mixes in the voice lab (2026-10-12). In all of them the mid register
 * is the backbone (a third to a half); deep and high share the rest, and the balance between them is
 * the voice's brightness.
 * - Grunge (soft, "uh"): darker; deep never leaves (more at the bottom, at the break and at the very
 *   top), high only seasons it (a third at most), least at the break.
 * - Rock ("ah", normal): brighter; high leads (about half), deep kept in (a quarter to 40%), mid low
 *   on "ah" (it sounds hollow there; other vowels bring it back, MID_FIT).
 */
export const REGISTER_MIX: Record<'grunge' | 'rock', [number, number, number, number][]> = {
  grunge: [[-23, 0.59, 0.41, 0], [-4, 0.16, 0.5, 0.34], [1, 0.27, 0.56, 0.18], [9, 0.15, 0.51, 0.34], [13, 0.41, 0.41, 0.18]],
  // (Paul's later rock mix kept: deep stays in around the break, G4 "ah" 39/11/50; the bottom from the first)
  rock: [[-12, 0.26, 0.35, 0.38], [-6, 0.25, 0.25, 0.5], [3, 0.39, 0.11, 0.5], [8, 0.37, 0.13, 0.5], [12, 0.35, 0.15, 0.5]],
};

/**
 * How much the mid register suits a vowel (0: "ah", where it doesn't; up to "ee"): Paul's G4 rock mixes
 * at the same loudness: "eh" 17/50/33, "ah" 39/11/50: on "ah" the mid register all but replaced by deep
 * and high, on "eh" carrying the voice. (Measured: "ah", "eh"; the others placed between, by how close
 * and front the vowel is, until tried.)
 */
const MID_FIT: Record<Vowel, number> = {
  AA: 0, AY: 0.1, AW: 0.1, AO: 0.2, OY: 0.2, OW: 0.3, UH: 0.3, UW: 0.35, AH: 0.3, AX: 0.3, AE: 0.35, EH: 0.44, EY: 0.44, IH: 0.44, IY: 0.5, ER: 0.35,
};
/** The vowel each voice's mix was made on (REGISTER_MIX). */
const MIX_VOWEL: Record<keyof typeof REGISTER_MIX, Vowel> = { grunge: 'AH', rock: 'AA' };

/**
 * The registers' shares on Auto: the voice's own mix at that place, the mid register's share moved by
 * how well it suits the vowel (against the vowel the mix was made on), and a little less of the high
 * one on the hardest notes (Paul's "ah" at G4: normal 39/11/50, belted 37/22/41: louder wanted more grit,
 * breath and drive far more than another mix).
 */
export function autoRegisters(mix: keyof typeof REGISTER_MIX, place: number, vowel: Vowel, vel: number): [number, number, number] {
  let [d, m, h] = regAt(REGISTER_MIX[mix], place);
  const fit = MID_FIT[vowel] - MID_FIT[MIX_VOWEL[mix]];
  const m2 = fit >= 0 ? m + fit * (1 - m) : m * (1 + fit / Math.max(0.01, MID_FIT[MIX_VOWEL[mix]]));
  // (deep and high fill the rest in the same proportion as before)
  const rest = d + h || 1;
  d = ((1 - m2) * d) / rest;
  h = ((1 - m2) * h) / rest;
  m = m2;
  const harder = Math.max(0, Math.min(1, (vel - 0.85) / 0.1));
  const move = Math.min(h, 0.09 * harder);
  return [d, m + move, h - move];
}

/** The hand-set register shares at a pitch: [deep, mid, high], straight between the points around it. */
export function regAt(points: [number, number, number, number][], midi: number): [number, number, number] {
  const ps = [...points].sort((a, b) => a[0] - b[0]);
  if (midi <= ps[0][0]) return [ps[0][1], ps[0][2], ps[0][3]];
  const last = ps[ps.length - 1];
  if (midi >= last[0]) return [last[1], last[2], last[3]];
  const i = ps.findIndex((p) => p[0] > midi);
  const a = ps[i - 1], b = ps[i], k = (midi - a[0]) / (b[0] - a[0]);
  return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
}

/** 0 below `a`, 1 above `b`, smoothly between. */
const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A small seeded random source (a voice-box line's rasp comes and goes the same way each time). */
function seededRnd(seed: number) {
  let a = (seed * 2654435761 + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A segment of the line's timeline: a consonant, or a vowel (with an optional glide target at its end). */
export interface Seg { t0: number; t1: number; /** the first consonant of a stressed word's start, if a stop: the one with the bite ("pat" and "bat", not "spat") */ init?: boolean; cons?: ConsSpec; vowel?: [F3, F3?]; next?: F3; midi: number; vel: number }

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.max(0, Math.min(1, x));
const lerp3 = (a: F3, b: F3, x: number): F3 => [lerp(a[0], b[0], x), lerp(a[1], b[1], x), lerp(a[2], b[2], x)];

/** Lay the line out as segments: onset consonants before each note's vowel, codas at its end. */
export function layout(notes: SungNote[], cScale = 1, vowels: Partial<Record<Vowel, [F3, F3?]>> = VOWELS): Seg[] {
  const segs: Seg[] = [];
  notes.forEach((n, i) => {
    const room = Math.max(0.03, Math.min(0.2, (n.t - (i > 0 ? notes[i - 1].t : n.t - 0.4)) * 0.45));
    // (a diphthong sung over a run glides only on its last note)
    const own = vowels[n.syl.vowel] ?? VOWELS[n.syl.vowel];
    const vow: [F3, F3?] = notes[i + 1]?.syl.text === '~' ? [own[0]] : own;
    const firstF = vow[0];
    // onset consonants before the beat (shrunk to fit the room the last note leaves)
    const initStop = (c: Cons, ci: number) => ci === 0 && !!n.syl.wordStart && n.syl.stress && CONS[c].kind === 'stop';
    const on = n.syl.onset.map((c, ci) => ({ ...CONS[c], dur: CONS[c].dur * cScale * (initStop(c, ci) ? (CONS[c].voiced ? 1.2 : 1.5) : 1), init: initStop(c, ci) }));
    const want = on.reduce((a, c) => a + c.dur, 0);
    const k = want > room ? room / want : 1;
    let t = n.t - want * k;
    for (const c of on) { segs.push({ t0: t, t1: t + c.dur * k, cons: c, init: c.init, next: firstF, midi: n.midi, vel: n.vel }); t += c.dur * k; }
    // the vowel, then the coda at the note's end (no longer than 40% of the note)
    const len = n.end - n.t;
    const coda = n.syl.coda.map((c) => { const spec = c === 'L' ? DARK_L : CONS[c]; return { ...spec, dur: spec.dur * cScale }; });
    const cw = coda.reduce((a, c) => a + c.dur * (c.hold ? 1 : 0.8), 0);
    const kc = cw > len * 0.4 ? (len * 0.4) / cw : 1;
    // (a syllabic l or n carries the syllable: a hint of vowel, then the l or n held to the note's end)
    const syllabic = n.syl.syllabic && coda.length > 0;
    const vEnd = syllabic ? n.t + Math.max(0.03, 0.2 * len) : n.end - cw * kc;
    const kc2 = syllabic ? (n.end - vEnd) / Math.max(0.01, cw) : kc;
    segs.push({ t0: n.t, t1: vEnd, vowel: vow, midi: n.midi, vel: n.vel });
    let tc = vEnd;
    for (const c of coda) { const d = c.dur * (c.hold ? 1 : 0.8) * kc2; segs.push({ t0: tc, t1: tc + d, cons: c, midi: n.midi, vel: n.vel }); tc += d; }
  });
  // nothing overlaps: a segment ends where the next starts
  segs.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i + 1 < segs.length; i++) if (segs[i].t1 > segs[i + 1].t0) segs[i].t1 = Math.max(segs[i].t0 + 0.005, segs[i + 1].t0);
  return segs;
}

function blankFrame(): FrameParms {
  return {
    duration: FRAME, f0: 0, flutterLevel: 0.25, openPhaseRatio: 0.6, breathinessDb: -30, tiltDb: 4, gainDb: 0, agcRmsLevel: 0,
    nasalFormantFreq: 270, nasalFormantBw: 100, oralFormantFreq: [500, 1500, 2500, 3300, 3750, 4900], oralFormantBw: [70, 90, 130, 200, 250, 1000],
    cascadeEnabled: true, cascadeVoicingDb: -99, cascadeAspirationDb: -99, cascadeAspirationMod: 0.5, nasalAntiformantFreq: 270, nasalAntiformantBw: 100,
    parallelEnabled: false, parallelVoicingDb: -99, parallelAspirationDb: -99, parallelAspirationMod: 0.5, fricationDb: -99, fricationMod: 0.5,
    parallelBypassDb: -99, nasalFormantDb: -99, oralFormantDb: [-99, -99, -99, -99, -99, -99],
  };
}

/** The parallel (noise) branch's shape for a fricative or a stop's burst: [formant freqs F2-F6 and their levels]. */
function noiseShape(fr: FrameParms, shape: NonNullable<ConsSpec['shape']>, vowelF2: number, high: boolean) {
  fr.parallelEnabled = true;
  const up = high ? 1.15 : 1;
  if (shape === 's') { fr.oralFormantFreq = [fr.oralFormantFreq[0], 1700, 2600, 3900 * up, 5300 * up, 6800 * up]; fr.oralFormantDb = [-99, -99, -99, -18, -4, -2]; fr.oralFormantBw = [70, 90, 200, 400, 500, 900]; }
  else if (shape === 'sh') { fr.oralFormantFreq = [fr.oralFormantFreq[0], 1800, 2600 * up, 3300 * up, 4300 * up, 5600]; fr.oralFormantDb = [-99, -99, -4, -6, -12, -20]; fr.oralFormantBw = [70, 90, 250, 350, 450, 900]; }
  else if (shape === 'alv') { fr.oralFormantFreq = [fr.oralFormantFreq[0], 1700, 2700, 3600 * up, 4600 * up, 6000]; fr.oralFormantDb = [-99, -99, -99, -10, -6, -6]; fr.oralFormantBw = [70, 90, 200, 400, 500, 900]; }
  else if (shape === 'vel') { fr.oralFormantFreq = [fr.oralFormantFreq[0], vowelF2, 2500, 3300, 4200, 5600]; fr.oralFormantDb = [-99, -4, -10, -99, -99, -99]; fr.oralFormantBw = [70, 200, 300, 400, 500, 900]; }
  else fr.parallelBypassDb = shape === 'lab' ? -14 : -20;
}

/**
 * Render a sung line into samples (SING_RATE, mono). `pre`: seconds of lead-in before the first vowel
 * (where its onset consonants and a breath go); the buffer's time 0 is `pre` before notes' time 0.
 */
export function renderLine(notes: SungNote[], voice: VoiceShape, pre: number): Float32Array {
  const flow = voice.flow;
  // (joined: the gaps filled, the consonants shorter, as a singer joins syllables)
  if (flow) notes = joinNotes(notes, flow);
  const segs = layout(notes.map((n) => ({ ...n, t: n.t + pre, end: n.end + pre })), flow === 'words' ? 0.85 : flow ? 0.7 : 1);
  const endT = segs[segs.length - 1].t1 + 0.25;
  // (the raspy and deep voices: a person on the voice box; clear: klatt-syn's pulse, as it was)
  const rc = voice.recipe ?? {};
  const P = rc.lf ? PERSON : null;
  const rate = rc.rate ?? SING_RATE;
  const gen = P ? new VoiceBox(rate, voice.seed * 31 + notes.length, { outLp: !rc.crisp, noNasal: rc.noNasal })
    : rc.crisp ? new VoiceBox(rate, voice.seed * 31 + notes.length, { pulse: 'klatt', outLp: false, noNasal: rc.noNasal })
      : new Generator({ sampleRate: rate, glottalSourceType: 1 });
  const frameLen = Math.round(FRAME * rate);
  const nFrames = Math.ceil(endT / FRAME);
  const out = new Float32Array(nFrames * frameLen);
  const buf = new Float64Array(frameLen);
  const fscale = voice.high ? 1.17 : 1;
  const tract = (0.97 + (voice.seed % 7) * 0.01) * (voice.person?.tract ?? 1) * (P?.formants ?? 1) * (rc.formants ?? 1);
  const vibDepth = (voice.person?.vibrato ?? 1) * (P?.vib ?? 1) * (rc.vib ?? 1);
  const F45 = (voice.high ? [4100, 4800, 5700] : [3300, 3750, 4900]).map((f) => f * (P?.f45 ?? 1) * (rc.formants ?? 1));
  const vibHz = 5.2 + (voice.seed % 5) * 0.15 + (P?.vibHz ?? 0) + (rc.vibHz ?? 0);
  // (the recipe's drift: a slow wander in pitch)
  let drift = 0, driftTo = 0;
  // a voice-box singer: where their break is, their rasp coming and going, fry at the end of this line?
  const brk = P ? (rc.brk ?? P.brk) + (voice.high ? 9 : 0) : 0;
  const hs = P ? rc.high : undefined;
  const dp = P ? rc.depth ?? 0 : 0;
  const rnd = seededRnd(voice.seed * 7 + notes.length);
  let crackle = 0.6, crackleTo = 0.6;
  const fryLine = !!P && rnd() < P.fry;
  const lineEffort = Math.max(0, Math.min(1, (Math.max(...notes.map((n) => n.vel)) - 0.7) / 0.25));
  const scale = (f: F3): F3 => [f[0] * fscale * tract, f[1] * fscale * tract, f[2] * fscale * tract];
  const firstVowelT = segs.find((s) => s.vowel)?.t0 ?? pre;
  // which notes slide in or fall off (deterministic per line)
  const scoop = voice.slides > 0.3 && (voice.seed + notes.length) % 3 === 0;
  const fall = voice.slides > 0.2 && (voice.seed + notes.length) % 2 === 0;
  const vowelNotes = notes.map((n) => ({ ...n, t: n.t + pre, end: n.end + pre }));
  let si = 0;
  let lastF: F3 = scale(segs[0].next ?? [500, 1500, 2500]);
  // (joined: the voicing level now, easing in and out; the loudness now, following one line)
  let vNow = -60, ampNow: number | null = null;
  for (let fi = 0; fi < nFrames; fi++) {
    const t = fi * FRAME;
    while (si + 1 < segs.length && segs[si + 1].t0 <= t) { lastF = currentF(segs[si], segs[si].t1); si++; }
    const s = segs[si];
    const fr: FrameParms = P ? ({ ...blankFrame(), rd: 1, jitter: 0.003, shimmer: 0.02, sub: 0, harsh: 0 } as VoiceFrame)
      : gen instanceof VoiceBox ? ({ ...blankFrame(), rd: 1, jitter: 0, shimmer: 0, sub: 0, harsh: 0 } as VoiceFrame) : blankFrame();
    if (rc.flutter !== undefined) fr.flutterLevel = 0.25 * rc.flutter;
    // pitch: the note sounding (or about to), a glide over the change, vibrato on long notes
    let ni = 0;
    for (let k = 0; k < vowelNotes.length; k++) if (vowelNotes[k].t - 0.03 <= t) ni = k;
    const note = vowelNotes[ni];
    let midi = note.midi + (voice.high ? 12 : 0);
    const prevN = vowelNotes[ni - 1];
    const into = t - note.t, held = note.end - note.t;
    if (note.bend && prevN) {
      // a bend from the last note, over `bend` seconds (the guide line's bends)
      midi = lerp(prevN.midi + (voice.high ? 12 : 0), midi, Math.max(0, Math.min(1, into / note.bend)));
    } else if (note.slide) {
      // a scoop up into the note (easing in), over up to a fifth of a second
      const sd = note.slideLen ?? Math.min(0.22, held * 0.35);
      midi -= note.slide * (1 - Math.max(0, Math.min(1, (into + 0.02) / sd))) ** 2;
    } else if (prevN && prevN.end >= note.t - 0.12) {
      // a glide from the last note (quicker between the quick notes of a run)
      const gl = Math.min(note.glide ?? 0.09, Math.max(0.025, (note.t - prevN.t) * 0.4));
      if (t < note.t + gl * 0.67) midi = lerp(prevN.midi + (voice.high ? 12 : 0), midi, (t - (note.t - gl / 3)) / gl);
    }
    if (ni === 0 && note.slide === undefined && scoop && t < note.t + 0.1) midi -= lerp(1, 0, (t - note.t + 0.02) / 0.12);
    // (with the recipe's drift, each note's vibrato a little faster or slower, deeper or shallower)
    const vibVary = rc.vibVary ? 1 + rc.vibVary * Math.sin(ni * 2.3 + voice.seed) : rc.drift ? 1 + 0.08 * Math.sin(ni * 2.3 + voice.seed) : 1;
    const vs = rc.vibStart ?? 0.3;
    // (an uneven vibrato also wavers in depth within the note)
    const vibWaver = rc.vibVary ? 1 + 0.5 * rc.vibVary * Math.sin(2 * Math.PI * 0.7 * into + ni) : 1;
    // (how far above their break this note is, for the recipe's ways up; and their vibrato up there)
    const upW = hs ? smooth(-1 + 2 * dp, 3 + 2 * dp, note.midi + (voice.high ? 12 : 0) - brk) : 0;
    const vD = vibDepth * (hs === 'belt' ? 1 + 0.6 * upW : hs === 'squeal' ? 1 - 0.3 * upW : hs === 'scream' ? 1 - 0.5 * upW : hs === 'falsetto' ? 1 + 0.2 * upW : 1);
    const vH = vibHz + (hs === 'squeal' ? 0.8 * upW : 0);
    if (held > vs + 0.15 && into > vs) midi += (Math.min(1, (into - vs) / 0.25) * (0.28 + 0.1 * note.vel) * vD * vibVary * vibWaver) * Math.sin(2 * Math.PI * vH * vibVary * into);
    if (rc.drift) {
      if (fi % 15 === 0) driftTo = (rnd() * 2 - 1) * rc.drift;
      drift += (driftTo - drift) * 0.06;
      midi += drift / 100;
    }
    const lastNote = ni === vowelNotes.length - 1;
    // a fall off the note's end (accelerating, fading), or the line's own little fall
    const fallBy = note.fall ?? (lastNote && fall ? 2 : 0);
    const fw = note.fall ? Math.min(0.3, held * 0.35) : 0.14;
    const fx = fallBy && t > note.end - fw ? Math.min(1, (t - (note.end - fw)) / fw) : 0;
    midi -= fallBy * (note.fall ? fx * fx : fx);
    if (note.sharp) midi += (note.sharp / 100) * smooth(0, 0.15, into);
    fr.f0 = mtof(midi);
    // loud notes brighter (less tilt), soft ones breathier
    fr.tiltDb = lerp(9, 2, note.vel);
    fr.breathinessDb = lerp(-22, -32, note.vel) + (voice.person?.breath ?? 0);
    const F = currentF(s, t);
    // (the voice-box voices shape their vowels by the note's own pitch, not the pitch of this moment: a
    // mouth holds its vowel while the pitch wobbles, slides and falls; tied to the moment's pitch, the
    // vowel wah-ed with every glide and vibrato, "underwater")
    const vf0 = P ? mtof(note.midi + (voice.high ? 12 : 0)) : fr.f0;
    const labRing = rc.ring ?? 0;
    // (the recipe's spoken vowels: the mouth more open, front vowels brighter)
    if (rc.speech && s.vowel) {
      F[0] *= 1 + 0.12 * rc.speech;
      if (F[1] > 1500 * tract) F[1] *= 1 + 0.08 * rc.speech;
    }
    if (rc.pressed) fr.openPhaseRatio = 0.6 - 0.22 * rc.pressed;
    // a voice-box singer changes gear across their range (docs/VOICES.md, section 3)
    let belt = 0, headW = 0, rasp = 0, fry = 0, scream = 0;
    // (the recipe's mixed registers: the natural vowel, the chest pulse and how much of them)
    const Fnat: F3 = [F[0], F[1], F[2]];
    let chestRdNow = 1, chestShare = 0;
    // (the recipe's three registers this frame: deep and high as layers, with their shares, vowels and pulses)
    let three: { wD: number; wH: number; deep: F3; high: F3; deepRd: number; highRd: number; highTilt: number; twang: number } | null = null;
    if (P) {
      // how hard they sing it, where it sits against their break, and which way they go above it
      const effort = Math.max(0, Math.min(1, (note.vel - 0.7) / 0.25));
      const x = note.midi + (voice.high ? 12 : 0) - brk;
      // (above the break a singer keeps to one gear through a line: belting it, mixing, or in head voice)
      const above = smooth(-1 + 2 * dp, 3 + 2 * dp, x), push = smooth(0.3, 0.9, 0.7 * lineEffort + 0.3 * effort);
      belt = above * push;
      headW = above * (1 - push);
      let rd = lerp(lerp(P.chest[0], P.chest[1], effort), lerp(P.head, P.belt, push), above);
      // (the recipe's ways up: the gear they take above the break, whatever the line)
      const chestRd = lerp(P.chest[0], P.chest[1], effort);
      chestRdNow = Math.max(0.35, chestRd - 0.45 * (rc.pressed ?? 0));
      chestShare = (rc.mix ?? 0) * (1 - smooth(3, 7, x));
      if (hs === 'belt' || hs === 'scream') {
        const p2 = Math.max(push, 0.85);
        belt = above * p2; headW = above * (1 - p2);
        rd = lerp(chestRd, 0.55 + 0.3 * dp, above);
      } else if (hs === 'falsetto') {
        belt = 0; headW = above;
        rd = lerp(chestRd, 1.6, above);
      } else if (hs === 'squeal') {
        belt = above * 0.5; headW = above * 0.15;
        rd = lerp(chestRd, 1.1, above);
      }
      // (a scream: the hardest notes at the top tear into distortion, coming and going)
      if (hs === 'scream') scream = above * smooth(2, 4, x) * smooth(0.8, 0.95, effort) * Math.max(0.5, crackle);
      // (the bottom of the range: laxer, darker)
      if (x < -9) rd += 0.25 * Math.min(1, (-9 - x) / 4);
      // the rasp: a little on quiet lines, most as they push near the top; it comes and goes
      if (fi % 12 === 0) crackleTo = rnd() < 0.7 ? 0.6 + 0.4 * rnd() : 0.25;
      crackle += (crackleTo - crackle) * 0.2;
      rasp = P.rasp * (0.15 + 0.85 * effort ** 1.3) * (0.6 + 0.4 * smooth(-6, 3, x)) * Math.max(crackle, effort > 0.85 ? 0.6 : 0);
      // vocal fry: the line's last low note creaking down at its end (not where it falls away)
      if (fryLine && lastNote && !note.fall && x < -5 && held > 0.3) fry = smooth(note.end - 0.22, note.end - 0.04, t);
      const vf = fr as VoiceFrame;
      vf.rd = lerp(rd - 0.25 * rasp, 0.35, fry);
      vf.jitter = 0.003 + 0.012 * rasp + 0.05 * fry;
      vf.shimmer = 0.02 + 0.12 * rasp;
      vf.sub = Math.max(rasp > 0.4 ? ((rasp - 0.4) / 0.6) * 0.8 : 0, fry);
      vf.harsh = Math.max(0.5 * rasp, 0.7 * fry);
      if (rc.pressed) vf.rd = Math.max(0.35, vf.rd - 0.45 * rc.pressed);
      if (rc.edge) vf.rd = Math.max(0.35, vf.rd - 0.5 * rc.edge * EDGE_VOWEL[note.syl.vowel]);
      if (scream) {
        vf.rd = lerp(vf.rd, 0.4, scream);
        vf.sub = Math.max(vf.sub, 0.85 * scream);
        vf.harsh = Math.max(vf.harsh, 0.9 * scream);
        vf.jitter += 0.03 * scream;
        vf.shimmer += 0.15 * scream;
      }
      fr.f0 *= 1 - 0.35 * fry;
      if (rc.three) {
        // each register's share by the pitch: deep below, mid through the middle, high at the top
        let [d0, m0, h0] = autoRegisters(rc.regMix ?? 'grunge', x, note.syl.vowel, note.vel);
        if (rc.regPoints?.length) [d0, m0, h0] = regAt(rc.regPoints, note.midi + (voice.high ? 12 : 0));
        const sum = d0 + h0 + m0 || 1, f0 = vf0;
        // (a vowel opens on higher notes so F1 sits above the note, never on it: no hoot)
        const opened = (v: F3, k: number, cap: number): F3 => { const o: F3 = [...v]; if (o[0] < k * f0) o[0] = Math.min(k * f0, cap); o[1] = Math.max(o[1], o[0] + 250); return o; };
        // (the source's roughness, fry and scream, the same for every register)
        const src = (r: number) => {
          let v = lerp(r - 0.25 * rasp, 0.35, fry);
          if (rc.pressed) v = Math.max(0.35, v - 0.45 * rc.pressed);
          if (rc.edge) v = Math.max(0.35, v - 0.5 * rc.edge * EDGE_VOWEL[note.syl.vowel]);
          return scream ? lerp(v, 0.4, scream) : v;
        };
        const mid = opened(Fnat, 1.45, 1000);
        let high: F3, highRd: number, highTilt: number, twang: number;
        if (hs === 'falsetto') { high = [Math.max(Fnat[0] - 65, f0 * 1.05), Fnat[1] - 90, Fnat[2]]; highRd = 1.7; highTilt = 3; twang = 0; }
        else if (hs === 'squeal') { high = opened([Fnat[0] * 1.06, Fnat[1] * 1.06, Fnat[2] * 1.06], 1.7, 1050); highRd = 1; highTilt = -3; twang = 1; }
        else { high = opened([Fnat[0] * 1.02, Fnat[1] * 1.02, Fnat[2] * 1.02], 1.75, 1050); highRd = 0.6; highTilt = -1; twang = 0.5; }
        three = {
          wD: d0 / sum, wH: h0 / sum,
          deep: opened([Fnat[0] * 0.92, Fnat[1] * 0.92, Fnat[2] * 0.93], 1.2, 900), high,
          deepRd: src(Math.min(2.2, chestRd + 0.2)), highRd: src(highRd), highTilt, twang,
        };
        // the frame's own register is the mid one
        (fr as VoiceFrame).rd = src(chestRd);
        F[0] = mid[0]; F[1] = mid[1]; F[2] = mid[2];
        belt = 0; headW = 0;
        fr.tiltDb = lerp(5, 1, effort) + P.tilt;
      }
      // the LF pulse brings its own brightness: less tilt than klatt-syn's; head voice darker and airier
      fr.tiltDb = lerp(5, 1, effort) + P.tilt + 3 * headW - 6 * (rc.edge ?? 0) * EDGE_VOWEL[note.syl.vowel];
      fr.breathinessDb = lerp(-26, -36, effort) + 8 * headW;
      // the vowel: a belt opens it (F1 up toward the 2nd harmonic, the larynx up a little), head voice
      // drops F1 and F2 a little (Henrich et al.)
      const op = rc.open ?? 1;
      if (belt > 0) {
        F[0] = lerp(F[0], Math.max(F[0], Math.min(1.9 * vf0, 1150)), belt * 0.85 * (1 - 0.6 * dp) * op);
        for (let k = 0; k < 3; k++) F[k] *= 1 + (0.04 - 0.06 * dp) * belt * op;
      }
      if (!three) F[0] -= 65 * headW;
      // (in chest and mixed voice the vowel's F1 never sits on the note itself: that makes a hoot,
      // falsetto-like, the fundamental alone; it opens toward the 2nd harmonic as chest and belt singers
      // do, so the note has its lows and highs together; head voice and falsetto keep F1 on the note)
      if (!three && F[0] < 1.6 * vf0) F[0] = lerp(F[0], Math.min(lerp(1.05, 1.9, op) * vf0, 1150), 1 - headW);
      if (!three) F[1] = Math.max(F[1] - 90 * headW, F[0] + 250);
      // (a squeal: the larynx high and the throat narrowed, a bright twang; falsetto airy and darker)
      if (three) { /* (the registers carry their own vowels) */ } else if (hs === 'squeal') {
        for (let k = 0; k < 3; k++) F[k] *= 1 + 0.07 * above;
        fr.tiltDb -= 3 * above;
        fr.breathinessDb += 3 * above;
      } else if (hs === 'falsetto') {
        // (airy, but not dull: it keeps the voice's brightness)
        fr.breathinessDb += 6 * above;
        fr.tiltDb -= 5 * above;
      }
    }
    // F1 never under the pitch (it would go silent), F2 clear of it too
    F[0] = Math.max(F[0], vf0 * 1.05);
    if (F[1] < vf0 * 1.9) F[1] = vf0 * 1.9;
    fr.oralFormantFreq = [F[0], F[1], F[2], F45[0], F45[1], F45[2]];
    // (a belt's "twang": the 3rd and 4th formants sharper and closer together, a ring around 3 kHz)
    if (belt > 0) {
      // (the recipe's ways up: a squeal all twang; a power belt or scream only half, so it doesn't go nasal)
      const tw = hs === 'squeal' ? Math.min(1, belt * 2) : hs ? belt * 0.5 : belt;
      fr.oralFormantFreq[3] = lerp(F45[0], F[2] + 550, 0.5 * tw);
      fr.oralFormantBw = [70, 90, 130 * (1 - 0.45 * tw), 200 * (1 - 0.45 * tw), 250, 1000];
    }
    // the recipe: the singer's ring, wider or narrower formants, more breath
    if (labRing) {
      fr.oralFormantFreq[2] = Math.max(F[2], lerp(F[2], 2500 * tract, labRing));
      fr.oralFormantFreq[3] = lerp(fr.oralFormantFreq[3], fr.oralFormantFreq[2] + 400, labRing);
      fr.oralFormantFreq[4] = lerp(F45[1], fr.oralFormantFreq[2] + 850, labRing);
      fr.oralFormantBw = fr.oralFormantBw.map((b, k) => (k === 2 || k === 3 ? b * (1 - 0.35 * labRing) : b));
    }
    if (rc.top && gen instanceof VoiceBox) {
      const up = (voice.high ? 1.12 : 1) * tract;
      fr.oralFormantFreq = [...fr.oralFormantFreq, 5600 * up, 6800 * up, 8000 * up];
      fr.oralFormantBw = [...fr.oralFormantBw, 500, 700, 900];
    }
    // (the recipe's mixed registers: the chest voice's natural vowel as a second register)
    if (chestShare > 0 && !three && s.vowel && gen instanceof VoiceBox) {
      const n0 = Math.max(Fnat[0], vf0 * 1.05), n1 = Math.max(Fnat[1], n0 + 250, vf0 * 1.9);
      (fr as VoiceFrame).layers = [{ w: chestShare, rd: chestRdNow, tilt: fr.tiltDb, formants: [n0, n1, Fnat[2], ...fr.oralFormantFreq.slice(3)], bws: [...fr.oralFormantBw] }];
    }
    // (the recipe's three registers: deep and high as layers, the mid one the frame's own)
    if (three && s.vowel && gen instanceof VoiceBox) {
      const up = fr.oralFormantFreq.slice(3);
      const floor = (v: F3): F3 => { const a = Math.max(v[0], vf0 * 1.05); return [a, Math.max(v[1], a + 250, vf0 * 1.9), v[2]]; };
      const hi = floor(three.high), tw = three.twang;
      (fr as VoiceFrame).layers = [
        { w: three.wD, rd: three.deepRd, tilt: fr.tiltDb + 2, formants: [...floor(three.deep), ...up.map((f, k) => f * (k < 3 ? 0.95 : 1))], bws: [...fr.oralFormantBw] },
        {
          w: three.wH, rd: three.highRd, tilt: fr.tiltDb + three.highTilt,
          formants: [...hi, lerp(up[0], hi[2] + 550, 0.5 * tw), ...up.slice(1)],
          bws: fr.oralFormantBw.map((b, k) => (k === 2 || k === 3 ? b * (1 - 0.45 * tw) : b)),
        },
      ];
    }
    if (rc.bw) fr.oralFormantBw = fr.oralFormantBw.map((b, k) => (k < 5 ? b * rc.bw! : b));
    if (rc.bwUpper) fr.oralFormantBw = fr.oralFormantBw.map((b, k) => (k >= 2 && k < 5 ? b * rc.bwUpper! : b));
    if (rc.breath) fr.breathinessDb += rc.breath;
    if (rc.tilt) fr.tiltDb = Math.max(0, fr.tiltDb + rc.tilt);
    // the recipe's grit: rough cycles, an undertone and a harsh edge, growing as they push, coming and going
    if (rc.grit && gen instanceof VoiceBox) {
      const effort = Math.max(0, Math.min(1, (note.vel - 0.7) / 0.25));
      if (fi % 12 === 0) crackleTo = rnd() < 0.7 ? 0.6 + 0.4 * rnd() : 0.25;
      crackle += (crackleTo - crackle) * 0.2;
      // (not on the line's first moments, nor on consonants: grit lives on the held vowels)
      const settle = smooth(firstVowelT, firstVowelT + 0.15, t) * (s.vowel ? 1 : 0.3);
      // (the ways up: grit growing with height in a belt, fast in a squeal; a scream's clean below the
      // break; falsetto clean)
      const up = hs === 'belt' ? 1 + 0.6 * upW : hs === 'squeal' ? 1 + 1.2 * upW : hs === 'scream' ? 0.6 + 0.4 * upW : hs === 'falsetto' ? 1 - 0.85 * upW : 1;
      // (louder, grittier: Paul's belted settings had about four times the grit of his normal ones)
      const harder = Math.max(0, Math.min(1, (note.vel - 0.85) / 0.1));
      const g = Math.min(1, rc.grit * (0.3 + 0.7 * effort) * (1 + 2 * harder) * crackle * settle * up);
      const vf = fr as VoiceFrame;
      vf.jitter += 0.01 * g;
      vf.shimmer += 0.1 * g;
      vf.sub = Math.max(vf.sub, g > 0.35 ? (g - 0.35) * 1.1 : 0);
      vf.harsh = Math.max(vf.harsh, 0.5 * g);
      if (s.vowel) fr.cascadeAspirationDb = Math.max(fr.cascadeAspirationDb, lerp(-8, 0, note.vel) - 34 + 12 * g);
    }
    let amp = lerp(-8, 0, note.vel) - (note.fall ? 9 * fx : 0) - 6 * fry;
    // (human feel: rising into the word, fading at its end)
    if (note.swell) amp -= 10 * (1 - smooth(-0.01, note.swell, into));
    if (note.fade) amp -= (note.fadeBy ?? 18) * smooth(note.end - note.fade, note.end, t);
    if (note.gain) amp += 20 * Math.log10(note.gain);
    if (flow) {
      // (the loudness glides from note to note, not in steps)
      ampNow = ampNow === null ? amp : ampNow + (amp - ampNow) * 0.12;
      amp = ampNow;
      // (phrases: each new word marked by a small dip, about 6 dB over 90 ms, instead of a stop)
      if (flow === 'phrases' && ni > 0 && note.syl.wordStart && note.syl.text !== '~') amp -= 6 * Math.max(0, 1 - Math.abs(t - (note.t - 0.01)) / 0.045);
    }
    if (t < s.t0) fr.cascadeVoicingDb = -99;
    else if (s.vowel && t <= s.t1) {
      fr.cascadeVoicingDb = amp;
      // a breath of air as the line ends
      if (lastNote && t > s.t1 - 0.12) fr.cascadeAspirationDb = -30;
      // a voice-box singer's breath on each pulse: more in head voice, more as the rasp grows
      if (P) {
        fr.cascadeAspirationDb = Math.max(fr.cascadeAspirationDb, amp - 34 + 10 * headW + 10 * rasp + 20 * scream);
        fr.cascadeAspirationMod = 0.7;
      }
    } else if (s.cons && t <= s.t1) {
      const tractF = fr.oralFormantFreq, tractBw = fr.oralFormantBw;
      consonant(fr, s, t, amp, voice.high);
      // (on the voice box, a consonant's hiss gets its own formants: the vocal tract's stay as they were)
      if (gen instanceof VoiceBox && fr.parallelEnabled) {
        const vf = fr as VoiceFrame;
        // (a hiss swells in over its first third and tapers off at its end, as a real "s" or "f" does:
        // switched on at nearly full strength, it crackled)
        if (s.cons.kind === 'fric' || s.cons.kind === 'affric') {
          const x = (t - s.t0) / Math.max(0.005, s.t1 - s.t0);
          fr.fricationDb += lerp(-18, 0, x / 0.33) + lerp(0, -12, (x - 0.75) / 0.25);
        }
        vf.parFormants = fr.oralFormantFreq; vf.parBws = fr.oralFormantBw;
        fr.oralFormantFreq = tractF; fr.oralFormantBw = tractBw;
      }
      // (on the voice box, a voiceless consonant's hiss isn't chopped by the vocal folds' cycles: it crackles)
      if (gen instanceof VoiceBox && !s.cons.voiced) { fr.fricationMod = 0; fr.parallelAspirationMod = 0; fr.cascadeAspirationMod = 0; }
      if (rc.ess && (s.cons.shape === 's' || s.cons.shape === 'sh')) fr.fricationDb += rc.ess;
    }
    else {
      // silence after the line (the last vowel's ring decays in the filters)
      fr.cascadeVoicingDb = -99;
    }
    // the recipe's breathiness: air on every vowel, with the folds' pulses
    if (rc.airy && s.vowel && t >= s.t0 && t <= s.t1) {
      // (less air in a belt: the folds close firmly)
      // (louder, airier: about 14 dB more breath belted than normal, as Paul set them)
      const harder = Math.max(0, Math.min(1, (note.vel - 0.85) / 0.1));
      fr.cascadeAspirationDb = Math.max(fr.cascadeAspirationDb, fr.cascadeVoicingDb + rc.airy - 8 * belt + 14 * harder);
      fr.cascadeAspirationMod = 0.5;
    }
    // the very start of the line: a soft attack
    const att = rc.attack ?? 0.03;
    if (t < firstVowelT + att && s.vowel) fr.cascadeVoicingDb += lerp(-18, 0, (t - firstVowelT + 0.0) / att);
    if (flow) {
      // joined: the voice fades in (about 20 ms) and out (about 50 ms) instead of switching; a consonant
      // keeps its own quick shape (a burst starts at once, a closure shuts within about 25 ms)
      const want = Math.max(-60, fr.cascadeVoicingDb);
      const inCons = !!s.cons && t >= s.t0 && t <= s.t1;
      // (words: a word starting on a vowel starts with a catch in the throat, quicker)
      const catchNow = flow === 'words' && s.vowel && ni > 0 && !note.syl.onset.length && note.syl.wordStart && note.syl.text !== '~' && t >= note.t && t < note.t + 0.035;
      if (catchNow) {
        vNow = Math.max(vNow, want - 12);
        if (gen instanceof VoiceBox) { const vf = fr as VoiceFrame; vf.harsh = Math.max(vf.harsh, 0.7); vf.sub = Math.max(vf.sub, 0.4); }
      }
      // (a voiceless one ("s", "f", "t") stops the voice within about 15 ms: voice left buzzing under the
      // hiss crackled)
      if (inCons) vNow = want < vNow ? Math.max(want, vNow - (s.cons!.voiced ? 7 : 16)) : want;
      else vNow = want > vNow ? Math.min(want, vNow + 9) : Math.max(want, vNow - 4);
      fr.cascadeVoicingDb = vNow <= -59 ? -99 : vNow;
    }
    if (gen instanceof VoiceBox) gen.generateFrame(fr as VoiceFrame, buf);
    else gen.generateFrame(fr, buf);
    for (let k = 0; k < frameLen; k++) out[fi * frameLen + k] = buf[k];
  }
  // (the recipe's presence and air: a peak at 3.5 kHz, a shelf above 8 kHz)
  if (rc.presence) biquad(out, peaking(rate, 3500, 1, rc.presence));
  if (rc.body) biquad(out, peaking(rate, 250, 0.8, rc.body));
  if (rc.low) biquad(out, lowShelf(rate, 180, rc.low));
  // (the recipe's drive: saturated as a rock vocal is recorded, the louder the more)
  if (rc.drive) {
    normalize(out);
    // (gently: a soft curve, so consonants' bursts don't crack)
    // (a belted line driven harder: half as much again)
    const k = 1 + 2.5 * rc.drive * (1 + 0.5 * Math.max(0, Math.min(1, (lineEffort - 0.6) / 0.4)));
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(k * out[i] * 1.5) / k;
  }
  if (rc.air) biquad(out, highShelf(rate, 8000, rc.air));
  // (the level ridden, so the line's notes sit at about one level: level.ts)
  ride(out, rate);
  normalize(out);
  return out;

  // formants at time t: a consonant's own target (its transition into the next vowel), a vowel's (with
  // the transition from what came before and the diphthong's glide at the end)
  function currentF(sg: Seg, t: number): F3 {
    if (sg.cons) {
      const tgt = scale(sg.cons.f);
      return lerp3(lastF, tgt, (t - sg.t0) / 0.025);
    }
    const [a, b] = sg.vowel!;
    const A = scale(a);
    let f = lerp3(lastF, A, (t - sg.t0) / 0.04);
    if (b) {
      const dur = sg.t1 - sg.t0;
      const glide = Math.min(0.25, Math.max(0.08, dur * 0.25));
      f = lerp3(f, scale(b), (t - (sg.t1 - glide)) / glide);
    }
    return f;
  }
}

/** A consonant's frame: closure, burst and aspiration (stops), shaped noise (fricatives), murmur (nasals)... */
function consonant(fr: FrameParms, s: Seg, t: number, amp: number, high: boolean) {
  const c = s.cons!;
  const x = (t - s.t0) / Math.max(0.005, s.t1 - s.t0);
  const vowelF2 = (s.next ?? [500, 1500, 2500])[1] * (high ? 1.17 : 1);
  switch (c.kind) {
    case 'liquid':
      fr.cascadeVoicingDb = amp - (c.f[2] < 2000 ? 3 : 5);
      break;
    case 'nasal':
      fr.cascadeVoicingDb = amp - 6;
      fr.nasalFormantFreq = 270; fr.nasalFormantBw = 100;
      fr.nasalAntiformantFreq = (c.anti ?? 1000) * (high ? 1.15 : 1); fr.nasalAntiformantBw = 120;
      fr.oralFormantBw = [80, 200, 300, 300, 300, 1000];
      break;
    case 'h':
      fr.cascadeAspirationDb = amp - 4;
      break;
    case 'fric':
    case 'affric': {
      const closure = c.kind === 'affric' ? 0.3 : 0;
      if (x < closure) break; // the stop part: silence
      noiseShape(fr, c.shape!, vowelF2, high);
      // (levels measured against a sung vowel: s about 12 dB under it, sh 14, f and th 22)
      const level = c.shape === 's' ? 30 : c.shape === 'sh' ? 17 : 4;
      fr.fricationDb = amp + level + (c.voiced ? -6 : 0) + lerp(-12, 0, (x - closure) / 0.25);
      if (c.voiced) fr.cascadeVoicingDb = amp - 12;
      break;
    }
    case 'stop': {
      // closure (a low voice bar if voiced), a short burst, then aspiration before a voiceless stop's vowel
      const closeEnd = c.voiced ? 0.75 : 0.5, burstEnd = closeEnd + (c.voiced ? 0.12 : 0.14);
      if (x < closeEnd) { if (c.voiced) fr.cascadeVoicingDb = amp - 24; break; }
      if (x < burstEnd) { noiseShape(fr, c.shape!, vowelF2, high); fr.fricationDb = amp + (c.shape === 'lab' ? 16 : c.shape === 'vel' ? -6 : 18); break; }
      if (!c.voiced) fr.cascadeAspirationDb = amp - 6;
      else fr.cascadeVoicingDb = amp - 4;
      break;
    }
  }
}

type Biquad = [number, number, number, number, number];
/** A peaking EQ (RBJ cookbook): [b0, b1, b2, a1, a2], normalized. */
function peaking(rate: number, f: number, q: number, db: number): Biquad {
  const A = 10 ** (db / 40), w = (2 * Math.PI * f) / rate, al = Math.sin(w) / (2 * q), a0 = 1 + al / A;
  return [(1 + al * A) / a0, (-2 * Math.cos(w)) / a0, (1 - al * A) / a0, (-2 * Math.cos(w)) / a0, (1 - al / A) / a0];
}
/** A low shelf (RBJ cookbook, slope 1). */
function lowShelf(rate: number, f: number, db: number): Biquad {
  const A = 10 ** (db / 40), w = (2 * Math.PI * f) / rate, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, sq = 2 * Math.sqrt(A) * al;
  const a0 = A + 1 + (A - 1) * c + sq;
  return [(A * (A + 1 - (A - 1) * c + sq)) / a0, (2 * A * (A - 1 - (A + 1) * c)) / a0, (A * (A + 1 - (A - 1) * c - sq)) / a0, (-2 * (A - 1 + (A + 1) * c)) / a0, (A + 1 + (A - 1) * c - sq) / a0];
}
/** A high shelf (RBJ cookbook, slope 1). */
function highShelf(rate: number, f: number, db: number): Biquad {
  const A = 10 ** (db / 40), w = (2 * Math.PI * f) / rate, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, sq = 2 * Math.sqrt(A) * al;
  const a0 = A + 1 - (A - 1) * c + sq;
  return [(A * (A + 1 + (A - 1) * c + sq)) / a0, (-2 * A * (A - 1 + (A + 1) * c)) / a0, (A * (A + 1 + (A - 1) * c - sq)) / a0, (2 * (A - 1 - (A + 1) * c)) / a0, (A + 1 - (A - 1) * c - sq) / a0];
}
function biquad(a: Float32Array, [b0, b1, b2, a1, a2]: Biquad) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    a[i] = y;
  }
}

/** Bring a line to a set level (the loudest stretch of singing), so every line sits the same in the mix. */
function normalize(a: Float32Array) {
  const win = 1024;
  let best = 0;
  for (let i = 0; i + win <= a.length; i += win / 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += a[k] * a[k];
    best = Math.max(best, Math.sqrt(e / win));
  }
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  if (best <= 0 || peak <= 0) return;
  const g = Math.min(0.2 / best, 0.95 / peak);
  for (let i = 0; i < a.length; i++) a[i] *= g;
}
