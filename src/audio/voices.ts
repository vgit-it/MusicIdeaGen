// The singer's voices (docs/VOICES.md): one per genre. Each is sung by the FOF singer (fof.ts, made
// with Paul by ear in the FOF lab, scripts/fof-lab.ts: his rock voice with a little edge, warm, not
// ringing, a real voice's unevenness), with its break and its way up past it. The recipes below are the
// earlier voice-box voices (made in the voice lab, voice-lab.html; the app sang them until 2026-10-13,
// git tag voices-v2-voicebox), kept for the voice lab. The clear voice (the first one) has neither.

import type { Genre } from '../genres';
import type { Vowel } from '../parts/lyrics';
import { VOICE_DOWN } from '../parts/singers';
import type { FofVoice } from './fof';
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
}

export const VOICES: Record<Genre, GenreVoice> = {
  // (rock: the FOF lab's voice Paul signed off; the others leaning off it as their voice-box recipes did)
  rock: { label: 'Rock', recipe: { regMix: 'rock' }, brk: 64, up: 'belt', three: true,
    fof: { grit: 0.45, breath: -34, bw: 1.25, tract: 0.96, bright: 0.5, edge: 0.25, brk: 64, up: 'belt' } },
  pop: { label: 'Pop', recipe: { grit: 0.1, drive: 0, airy: -17, air: 4, tilt: -2, speech: 0.6, vib: 0.3, attack: 0.02 }, brk: 65, up: 'falsetto', three: false,
    fof: { grit: 0.12, breath: -28, bw: 1.15, bright: 1, brk: 65, up: 'falsetto', vib: 25 } },
  funk: { label: 'Funk', recipe: { grit: 0.25, drive: 0.1, pressed: 0.2, tilt: -2, speech: 0.6, attack: 0.01, vib: 0.25 }, brk: 64, up: 'falsetto', three: false,
    fof: { grit: 0.25, breath: -31, bw: 1.15, bright: 1, edge: 0.1, brk: 64, up: 'falsetto', vib: 22 } },
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
export type Character = 'deep' | 'nasal';
export const CHARACTERS: Record<Character, { label: string; fof: Partial<FofVoice> }> = {
  // big and dark (Vedder-like): a long throat, round vowels, a full low end, a slow wobble, scoops and sags
  // (less operatic in its normal range, Paul: a less low throat, rounder vowels only a little, brighter, wider)
  deep: { label: 'Big & dark', fof: { tract: 0.93, bw: 1.4, body: 6, bright: 0, breath: -35, edge: 0.3, cover: 0.2, vib: 24, vibHz: 4.8, drift: 6, scoop: 0.6, sag: 0.5, brk: 66 } },
  // dark and pinched (Staley-like): nasal, a metallic edge, a tight narrow vibrato, bends into notes
  nasal: { label: 'Dark & nasal', fof: { tract: 0.93, bw: 1.15, bright: 0.5, edge: 0.55, nasal: 0.5, cover: 0.2, vib: 12, vibHz: 6, breath: -30, scoop: 0.4, sag: 0.2, brk: 65 } },
};
/**
 * Every voice sings with expression (the tone moving with the moment), less of the operatic sound, and
 * raw: the throat rising with the pitch as a rock singer's does (Paul: "much better").
 */
const SUNG: Partial<FofVoice> = { expr: 1, plain: 0.6, raw: 1 };

/** A genre's voice for the FOF singer (`high`: an octave up, the high voice type), or a character on top of it. */
export const fofFor = (g: Genre, seed: number, high: boolean, character?: Character): FofVoice =>
  // (the low voice less rounded, Paul; the high voice left for its own round of work)
  ({ ...VOICES[g].fof, ...SUNG, ...(character ? CHARACTERS[character].fof : {}), spread: high ? 0 : 1, seed, high });

/** A voice's full recipe for the voice box (the base, its own changes, its break and way up; the voice lab's). */
export function recipeFor(g: Genre): VoiceRecipe {
  const v = VOICES[g];
  return { ...BASE, ...v.recipe, brk: v.brk, high: v.up, three: v.three };
}

/** The registers' shares on Auto for a voice at a pitch, vowel and loudness (as sing.ts mixes them): [deep, mid, high]. */
export function autoShares(voice: GenreVoice, midi: number, vowel: Vowel, vel: number): [number, number, number] {
  return autoRegisters(voice.recipe.regMix ?? 'grunge', midi - voice.brk, vowel, vel);
}
