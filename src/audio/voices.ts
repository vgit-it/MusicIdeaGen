// The singer's voices (docs/VOICES.md): one per genre, made with Paul by ear in the voice lab
// (voice-lab.html) from the clip he picked (round 7, clip 73: relaxed, on the voice box, breathy, a rock
// singer and not an opera singer), each with their break, their way up past it (round 9) and their
// register mix (REGISTER_MIX in sing.ts). The clear voice (the first one) has no recipe.

import type { Genre } from '../genres';
import type { Vowel } from '../parts/lyrics';
import { VOICE_DOWN } from '../parts/singers';
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
}

export const VOICES: Record<Genre, GenreVoice> = {
  rock: { label: 'Rock', recipe: { regMix: 'rock' }, brk: 64, up: 'belt', three: true },
  pop: { label: 'Pop', recipe: { grit: 0.1, drive: 0, airy: -17, air: 4, tilt: -2, speech: 0.6, vib: 0.3, attack: 0.02 }, brk: 65, up: 'falsetto', three: false },
  funk: { label: 'Funk', recipe: { grit: 0.25, drive: 0.1, pressed: 0.2, tilt: -2, speech: 0.6, attack: 0.01, vib: 0.25 }, brk: 64, up: 'falsetto', three: false },
  hardrock: { label: 'Hard rock', recipe: { regMix: 'rock', grit: 0.7, drive: 0.35, pressed: 0.3, tilt: -1, vib: 0.5, vibStart: 0.45 }, brk: 65, up: 'squeal', three: true },
  metal: { label: 'Metal', recipe: { regMix: 'rock', grit: 0.6, drive: 0.4, pressed: 0.4, tilt: -3, vib: 0.6, vibStart: 0.4 }, brk: 65, up: 'belt', three: true },
  grunge: { label: 'Grunge', recipe: { grit: 0.7, drive: 0.3, formants: 0.97, tilt: 1, vib: 0.25, vibHz: -0.5, drift: 18 }, brk: 63, up: 'belt', three: true },
  altmetal: { label: 'Alt metal', recipe: { grit: 0.6, drive: 0.35, pressed: 0.2, formants: 0.98, vib: 0.3 }, brk: 64, up: 'scream', three: true },
};

/** Semitones lower than the clear voice a voice's tunes are written. */
export const voiceDown = (g: Genre) => VOICE_DOWN[g];

/** A voice's full recipe (the base, its own changes, its break and way up). */
export function recipeFor(g: Genre): VoiceRecipe {
  const v = VOICES[g];
  return { ...BASE, ...v.recipe, brk: v.brk, high: v.up, three: v.three };
}

/** The registers' shares on Auto for a voice at a pitch, vowel and loudness (as sing.ts mixes them): [deep, mid, high]. */
export function autoShares(voice: GenreVoice, midi: number, vowel: Vowel, vel: number): [number, number, number] {
  return autoRegisters(voice.recipe.regMix ?? 'grunge', midi - voice.brk, vowel, vel);
}
