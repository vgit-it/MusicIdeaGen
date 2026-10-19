// The singer's voices (docs/VOICES.md): one per genre. Each is sung by the FOF singer (fof.ts, made
// with Paul by ear in the FOF lab, scripts/fof-lab.ts: his rock voice with a little edge, warm, not
// ringing, a real voice's unevenness), with its break and its way up past it. The recipes below are the
// earlier voice-box voices (made in the voice lab, voice-lab.html; the app sang them until 2026-10-13,
// git tag voices-v2-voicebox), kept for the voice lab. The clear voice (the first one) has neither.

import type { Genre } from '../genres';
import type { Vowel } from '../parts/lyrics';
import { HIGH_VOICES, type HighVoice, VOICE_DOWN } from '../parts/singers';
import type { FofVoice } from './fof';
import { ONYX } from './prints';
import { type VoiceRecipe, autoRegisters } from './sing';

/** Clip 73: the base every voice starts from (Edge: Paul, "excellent", the hollow "ah" filled). */
export const BASE: VoiceRecipe = {
  rate: 44100, crisp: true, top: true, lf: true, tilt: 0, presence: 0, air: 2, formants: 1, speech: 0.4, pressed: 0,
  vib: 0.35, vibStart: 0.55, vibVary: 0.3, attack: 0.03, drift: 12, grit: 0.5, drive: 0.2, low: 4, airy: -20, breath: 4,
  bwUpper: 1.3, ess: -8, edge: 0.6,
};

export type WayUp = NonNullable<VoiceRecipe['high']>;

export interface GenreVoice {
  label: string;
  /** What this voice changes from the base. */
  recipe: VoiceRecipe;
  /** Their break (MIDI) and their way up past it. */
  brk: number;
  up: WayUp;
  /** Three registers mixed by pitch (the rock voices); pop and funk sing a plain chest voice and falsetto. */
  three: boolean;
  /** The voice as the FOF singer sings it (the app's). */
  fof: Omit<FofVoice, 'seed' | 'high'>;
  /** The genre's own high singer (fofFor with `high`; left out: the same person an octave up). The app's high singers: singers.ts. */
  high?: { fof: Partial<FofVoice> };
}

export const VOICES: Record<Genre, GenreVoice> = {
  // (rock: the FOF lab's voice Paul signed off; the others leaning off it as their voice-box recipes did)
  rock: { label: 'Rock', recipe: { regMix: 'rock' }, brk: 64, up: 'belt', three: true,
    fof: { grit: 0.45, breath: -34, bw: 1.25, tract: 0.96, bright: 0.5, edge: 0.25, brk: 64, up: 'belt', lowBuzz: 1, closeFill: 1.5 },
    // (the high voice: a tenor Paul tuned in the voice creator, 2026-10-13, about a minor 6th over the low
    // voice (tunes 4 semitones lower, an octave up): a slightly smaller person with a big low end and his
    // weight kept up high, purer, a strong scream on pushed notes and little rasp, a forward ring, very
    // bright, a little covered, fairly raw, soft; a wide vibrato, a lot of drift, scoops and sags)
    high: { fof: {
      tract: 1.03, body: 10, heft: 0.9, bw: 1.05, grit: 0.15, distort: 0.85, fry: 0.15, breath: -33, twang: 0.75, edge: 0.45, nasal: 0,
      bright: 3, cover: 0.4, spread: 0.5, raw: 0.7, plain: 0.25, soft: 0.7, softPushed: 0.8, expr: 1, scoop: 0.55, sag: 0.85, life: 1,
      vib: 60, vibHz: 5.6, drift: 10.5, brk: 64, shift: 12, size: 0.99, brkUp: 4, up: 'belt',
    } } },
  pop: { label: 'Pop', recipe: { grit: 0.1, drive: 0, airy: -17, air: 4, tilt: -2, speech: 0.6, vib: 0.3, attack: 0.02 }, brk: 65, up: 'falsetto', three: false,
    fof: { grit: 0.12, breath: -28, bw: 1.15, bright: 1, brk: 65, up: 'falsetto', vib: 25 } },
  funk: { label: 'Funk', recipe: { grit: 0.25, drive: 0.1, pressed: 0.2, tilt: -2, speech: 0.6, attack: 0.01, vib: 0.25 }, brk: 64, up: 'falsetto', three: false,
    // (Paul: "the funk voice breaks at the pushed parts": its pushed notes sat right on its break, flipping
    // into falsetto and back, a high note dropping 11 dB; now chest voice up to G4 and a mix past it)
    fof: { grit: 0.25, breath: -31, bw: 1.15, bright: 1, edge: 0.1, brk: 67, up: 'belt', vib: 22 } },
  hardrock: { label: 'Hard rock', recipe: { regMix: 'rock', grit: 0.7, drive: 0.35, pressed: 0.3, tilt: -1, vib: 0.5, vibStart: 0.45 }, brk: 65, up: 'squeal', three: true,
    fof: { grit: 0.6, breath: -33, bw: 1.2, tract: 0.97, bright: 1, edge: 0.3, brk: 65, up: 'squeal', vib: 35 } },
  metal: { label: 'Metal', recipe: { regMix: 'rock', grit: 0.6, drive: 0.4, pressed: 0.4, tilt: -3, vib: 0.6, vibStart: 0.4 }, brk: 65, up: 'belt', three: true,
    fof: { grit: 0.55, breath: -34, bw: 1.2, tract: 0.96, bright: 0.5, edge: 0.3, brk: 65, up: 'belt', vib: 38 } },
  grunge: { label: 'Grunge', recipe: { grit: 0.7, drive: 0.3, formants: 0.97, tilt: 1, vib: 0.25, vibHz: -0.5, drift: 18 }, brk: 63, up: 'belt', three: true,
    fof: { grit: 0.6, breath: -31, bw: 1.3, tract: 0.94, bright: 0, edge: 0.2, brk: 63, up: 'belt', vib: 20, drift: 6 } },
  altmetal: { label: 'Alt metal', recipe: { grit: 0.6, drive: 0.35, pressed: 0.2, formants: 0.98, vib: 0.3 }, brk: 64, up: 'scream', three: true,
    fof: { grit: 0.55, breath: -33, bw: 1.25, tract: 0.96, bright: 0.5, edge: 0.25, brk: 64, up: 'scream' } },
};

/** Semitones lower than the clear voice a voice's tunes are written. */
export const voiceDown = (g: Genre) => VOICE_DOWN[g];

/**
 * Characters: a singer's own tone on top of a genre's voice (Paul, by ear: "more Alice in Chains, or a
 * voice like Eddie Vedder"), picked in the Voice menu.
 */
export type Character = 'deep' | 'nasal' | 'scream' | 'cornell' | 'woman' | 'onyx';
export const CHARACTERS: Record<Character, { label: string; fof: Partial<FofVoice> }> = {
  // big and dark (Vedder-like): a long throat, round vowels, a full low end, a slow wobble, scoops and sags
  // (less operatic in its normal range, Paul: a less low throat, rounder vowels only a little, brighter, wider)
  deep: { label: 'Big & dark', fof: { tract: 0.93, bw: 1.4, body: 6, bright: 0, breath: -35, edge: 0.3, cover: 0.2, vib: 24, vibHz: 4.8, drift: 6, scoop: 0.6, sag: 0.5, brk: 66 } },
  // dark and pinched (Staley-like): nasal, a metallic edge, a tight narrow vibrato, bends into notes
  // clean and scream (Chester Bennington-like): bright and forward, a little nasal, little vibrato, breathy
  // when quiet, a distorted scream on pushed notes (Paul: medium distortion, "a bit of nasal feel": strong twang; less breathy; his break a few semitones higher (a tenor's: full voice further up; not the tune moved up 3 semitones, which took it out of the song's key: Paul, "out of tune"); the scream from the distortion, over a belt, not the rough 'scream' register: cracks and noise)
  // (then tuned by Paul in the voice creator, 2026-10-13: a smaller, brighter person with a big low end
  // and weight kept up high, purer (narrow formants), a creak into lines, breathier, plain, softer, scoops
  // and sags; his break lower, around D#4 with the tenor's lift)
  scream: { label: 'Chester (clean & scream)', fof: {
    tract: 1.04, body: 10, heft: 0.65, bw: 0.9, grit: 0.35, distort: 0.65, fry: 0.65, breath: -27, twang: 1, edge: 0.2, nasal: 0.12,
    bright: 1, plain: 1, soft: 0.7, expr: 0.5, scoop: 0.65, sag: 0.7, vib: 15, vibHz: 5.8, brk: 60, up: 'belt', size: 1.02, brkUp: 3, lowBuzz: 1, closeFill: 1.8, lowTop: 66,
  } },
  // dark and soaring (Chris Cornell-like): built from Paul's notes on what the rock voice was missing (a
  // dark baritone's weight carried up into a full belt, a bluesy rasp and fry, a forward ring), then
  // tuned by him in the voice creator (voice-creator.html): "close to Cornell". A longer throat, a
  // moderate low end with weight kept up high, rasp and a scream on pushed notes, a creak into and out
  // of the lines; nasal and bright, open vowels, less operatic, soft but full when pushing; expressive,
  // sagging held notes, scoops; a break around D#4 and a belt past it. Then retuned by Paul (2026-10-13):
  // a longer throat and a much bigger low end, wider formants (less ring), less rasp and more scream,
  // more fry, brighter yet rounder (covered) with the lips spread, plainer, more life, a wider vibrato;
  // and again: a little more rasp and fry, less low end and brightness, a little less raw and spread
  cornell: { label: 'Cornell (dark & soaring)', fof: {
    tract: 0.88, body: 6.5, heft: 0.55, bw: 1.55, grit: 0.5, distort: 0.6, fry: 0.7, breath: -35, twang: 0.45, edge: 0.25, nasal: 0.22,
    bright: 0.75, cover: 0.5, spread: 0.65, raw: 0.65, plain: 0.8, soft: 0.5, softPushed: 0.9, expr: 0.75, scoop: 0.65, sag: 0.6, life: 0.8,
    vib: 47, vibHz: 5.6, drift: 5, brk: 63, up: 'belt', size: 1.03,
  } },
  // (then tuned by Paul in the voice creator, 2026-10-13: a much longer, darker throat with no extra low
  // end, weight kept up high, some rasp and a little fry, a forward ring rather than the nose, fully
  // covered vowels, half raw, plain, big scoops and sags)
  // a woman, soaring (Paul, in the voice creator, 2026-10-13: the Cornell voice sung by a woman an octave
  // up, then tuned): her own singer, whatever the voice type (an octave up, a much smaller person, her
  // break 12 semitones up); dark (a long throat for her size) yet very bright with a strong forward
  // ring, a big low end and her weight kept up high; little rasp, a scream on pushed notes, barely any
  // fry, not breathy; round vowels with the lips spread, trained (not raw), soft, fully expressive, a
  // little steadier than most; a wide, quick vibrato, scoops and sags
  woman: { label: 'Woman (soaring)', fof: {
    tract: 0.86, body: 10, heft: 0.9, bw: 1.55, grit: 0.15, distort: 0.35, fry: 0.05, breath: -39, twang: 1, edge: 0, nasal: 0,
    bright: 3, cover: 0.55, spread: 0.85, raw: 0, plain: 0.05, soft: 1, softPushed: 1, expr: 1, human: 0.65, scoop: 0.65, sag: 0.75,
    life: 0.8, vib: 43, vibHz: 6.2, drift: 5, brk: 63, up: 'belt', shift: 12, size: 1.23, brkUp: 12, lowBuzz: 1, closeFill: 1.8, lowTop: 68,
  } },
  // Onyx (Paul: "Onyx clean is a good voice"): a real man's vowels, measured from Kokoro's Onyx (prints.ts),
  // as measured (his own size: tract and size 1); clean: little rasp and breath
  onyx: { label: 'Onyx (clean)', fof: { print: ONYX, tract: 1, size: 1, grit: 0.08, breath: -42 } },
  nasal: { label: 'Dark & nasal', fof: {
    tract: 0.86, body: 0, heft: 0.45, bw: 1.3, grit: 0.3, fry: 0.15, breath: -29, twang: 0.5, edge: 0.25, nasal: 0.16, bright: -1.25,
    cover: 1, spread: 0.65, raw: 0.5, plain: 1, scoop: 0.9, sag: 0.7, vib: 12, vibHz: 6, brk: 65,
  } },
};
/**
 * Every voice sings with expression (the tone moving with the moment), less of the operatic sound, and
 * raw: the throat rising with the pitch as a rock singer's does (Paul: "much better"), and soft: a
 * singer, not someone shouting (medium on the normal notes, strong on pushed and low ones: Paul's pick; then "softer across the board").
 */
const SUNG: Partial<FofVoice> = {
  expr: 1, plain: 0.6, raw: 1, soft: 0.75, softPushed: 1, life: 1,
  // (deep notes keep their overtones and "ee" its body, so neither is one bare tone: fof.ts, the voice creator's Scale check)
  lowBuzz: 1, closeFill: 1.5, falFill: 1,
  // (no fuzz between syllables, Paul's pick of the ess lab's takes, C5: the vowel fading into s, t, k, f;
  // those shorter toward the beat, quieter and darker; p, t, k, b, d, g with barely a burst)
  cons: { blend: 0.04, short: 1, level: 3, dark: 1 },
  stops: { burst: -22, voiced: -20, asp: -14, len: 0.05, hold: 24, initial: 16, final: 10 },
};

/** A genre's voice for the FOF singer (`high`: an octave up, the high voice type), or a character on top of it. */
export const fofFor = (g: Genre, seed: number, high: boolean, character?: Character): FofVoice =>
  // (a genre's own high singer, tuned by Paul)
  high && !character && VOICES[g].high ? { ...VOICES[g].fof, ...SUNG, ...VOICES[g].high!.fof, seed, high } :
  // (the low voice less rounded, Paul; the high voice left for its own round of work)
  // (a character's own spread kept: the Cornell voice's, tuned by Paul; a character that is its own singer
  // (the woman: her own shift) keeps hers on either voice type)
  ({ ...VOICES[g].fof, ...SUNG, ...(character ? CHARACTERS[character].fof : {}), spread: high && !(character && CHARACTERS[character].fof.shift !== undefined) ? 0 : (character ? CHARACTERS[character].fof.spread : undefined) ?? 0.5, seed, high });

/** Semitones the tunes are written higher for a voice's own high singer (the rock tenor's; 0: the same person an octave up). */
export const highLift = (t: string | undefined): number => (t && t in VOICES && VOICES[t as Genre].high ? HIGH_VOICES.tenor.lift : 0);
/** A high singer's voice for the FOF singer, on the song's genre (Chester and the woman are characters on it; the tenor is the rock voice's). */
export function fofHighVoice(h: HighVoice, base: Genre, seed: number): FofVoice {
  return h === 'tenor' ? fofFor('rock', seed, true) : fofFor(base, seed, false, h === 'chester' ? 'scream' : 'woman');
}

/** A voice's full recipe for the voice box (the base, its own changes, its break and way up; the voice lab's). */
export function recipeFor(g: Genre): VoiceRecipe {
  const v = VOICES[g];
  return { ...BASE, ...v.recipe, brk: v.brk, high: v.up, three: v.three };
}

/** The registers' shares on Auto for a voice at a pitch, vowel and loudness (as sing.ts mixes them): [deep, mid, high]. */
export function autoShares(voice: GenreVoice, midi: number, vowel: Vowel, vel: number): [number, number, number] {
  return autoRegisters(voice.recipe.regMix ?? 'grunge', midi - voice.brk, vowel, vel);
}

/** The singers on trial for the high voice (Paul: "both"): a tenor, or a woman. */
export type HighSinger = 'tenor' | 'female';
/**
 * A high singer's voice. The tenor: the same kind of singer, a 4th up (a touch smaller, his break with
 * him). The woman: her own voice an octave up: a smaller person (formants about 16% up), breathier (a
 * glottal chink), a softer buzz (a steeper tilt, more of the first harmonic), less grit, a quicker,
 * lighter vibrato, her break a little higher than his in the melody's terms (she belts and mixes up there).
 */
export function fofHigh(g: Genre, seed: number, who: HighSinger, character?: Character): FofVoice {
  const v = fofFor(g, seed, false, character);
  if (who === 'tenor') return { ...v, shift: 5, size: 1.03, brkUp: 4 };
  return {
    ...v, shift: 12, size: 1.16, brkUp: 6, spread: 0.5,
    breath: (v.breath ?? -24) + 5, grit: (v.grit ?? 0) * 0.4, bright: (v.bright ?? 0) - 1, body: (v.body ?? 5) + 2,
    vib: (v.vib ?? 30) * 0.8, vibHz: (v.vibHz ?? 5.5) + 0.4, sag: (v.sag ?? 0) * 0.5,
  };
}

