// Self-hosted sample files (public/samples). Keep in sync with scripts/prepare-samples.mjs.

import * as Tone from 'tone';

const BASE = `${import.meta.env.BASE_URL}samples/`;

export const PITCHED_SAMPLES = {
  piano: ['A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5'],
  'guitar-acoustic': ['E2', 'G2', 'As2', 'Cs3', 'E3', 'G3', 'As3', 'Cs4', 'E4', 'G4', 'As4', 'Cs5'],
  'guitar-electric': ['E2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5'],
  'bass-electric': ['E1', 'G1', 'As1', 'Cs2', 'E2', 'G2', 'As2', 'Cs3', 'E3', 'G3'],
};
export type PitchedSet = keyof typeof PITCHED_SAMPLES;

/** Number of velocity layers per drum piece (files are <piece>-<n>.mp3). */
export const DRUM_LAYERS = {
  kick: 2, snare: 3, hat: 2, hatOpen: 1, crash: 1, ride: 2, tom1: 1, tom2: 1, tom3: 1,
};
export type DrumPiece = keyof typeof DRUM_LAYERS;

const LOAD_TIMEOUT = 15000;

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out loading ${what}`)), LOAD_TIMEOUT)),
  ]);
}

/** Loads a pitched set as { 'C#3': AudioBuffer, ... } ready for Tone.Sampler. */
export async function loadPitched(set: PitchedSet): Promise<Record<string, AudioBuffer>> {
  const entries = await withTimeout(
    Promise.all(PITCHED_SAMPLES[set].map(async (file) => {
      const buf = await Tone.ToneAudioBuffer.load(`${BASE}${set}/${file}.mp3`);
      return [file.replace('s', '#'), buf] as const;
    })),
    set,
  );
  return Object.fromEntries(entries);
}

export async function loadDrums(): Promise<Record<DrumPiece, AudioBuffer[]>> {
  const pieces = Object.entries(DRUM_LAYERS) as [DrumPiece, number][];
  const loaded = await withTimeout(
    Promise.all(pieces.map(async ([piece, n]) => {
      const layers = await Promise.all(
        Array.from({ length: n }, (_, i) => Tone.ToneAudioBuffer.load(`${BASE}drums/${piece}-${i + 1}.mp3`)),
      );
      return [piece, layers] as const;
    })),
    'drums',
  );
  return Object.fromEntries(loaded) as Record<DrumPiece, AudioBuffer[]>;
}
