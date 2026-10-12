// The voice lab: the same three sung lines in the clear voice as it is and in variants (one aspect
// changed at a time), written as WAV files to voice-lab/ to listen to side by side (docs/VOICES.md).
// Run: npm run voice-lab

import { mkdirSync, writeFileSync } from 'node:fs';
import type { Cons, Syllable, Vowel } from '../src/parts/lyrics';
import { SING_RATE, type SungNote, type VoiceRecipe, renderLine } from '../src/audio/sing';

const syl = (onset: Cons[], vowel: Vowel, coda: Cons[] = [], text = ''): Syllable => ({ onset, vowel, coda, stress: false, text, wordStart: true });

/** [syllable, MIDI (low voice), start and end (seconds), loudness] per note. */
type Line = [Syllable, number, number, number, number][];
const LINES: Line[] = [
  // a low, conversational line ending on a held note
  [[syl([], 'AY', ['V']), 55, 0, 0.25, 0.85], [syl(['B'], 'IH', ['N']), 57, 0.25, 0.5, 0.75], [syl(['W'], 'AO'), 59, 0.5, 0.75, 0.85],
    [syl(['K'], 'IH', ['NG']), 57, 0.75, 1, 0.75], [syl([], 'AO', ['L']), 55, 1, 1.25, 0.85], [syl(['N'], 'AY', ['T']), 59, 1.25, 1.5, 0.75],
    [syl(['L'], 'AO', ['NG']), 60, 1.5, 2.6, 0.85]],
  // climbing to a belted high note
  [[syl(['HH'], 'OW', ['L', 'D']), 60, 0, 0.375, 0.85], [syl([], 'AA', ['N']), 62, 0.375, 0.75, 0.75], [syl(['T'], 'UW'), 64, 0.75, 1, 0.85],
    [syl(['M'], 'IY'), 65, 1, 1.25, 0.85], [syl(['N'], 'AW'), 67, 1.25, 2.9, 0.95]],
  // the same height, sung softly
  [[syl(['S'], 'OW'), 64, 0, 0.5, 0.75], [syl(['F'], 'AA', ['R']), 65, 0.5, 1, 0.75], [syl([], 'AX'), 64, 1, 1.25, 0.75],
    [syl(['W'], 'EY'), 67, 1.25, 2.8, 0.75]],
];

const CRISP: VoiceRecipe = { rate: 44100, crisp: true, top: true, tilt: -4, presence: 4, air: 4 };
/** A rock singer, not an opera singer: the larynx up, vowels as spoken, folds pressed, little and uneven vibrato, harder starts. */
const ROCK: VoiceRecipe = { ...CRISP, formants: 1.07, speech: 1, pressed: 0.6, vib: 0.35, vibStart: 0.55, vibVary: 0.3, attack: 0.01, drift: 12 };
/** Round 4 (Paul: closer, but nasal; clicks and cracks; deeper): the larynx up less, vowels less spread, wider formants, less presence, more body. */
const ROCK2: VoiceRecipe = { ...ROCK, formants: 1.03, speech: 0.6, pressed: 0.4, bw: 1.25, presence: 1, tilt: -3, body: 3 };
/** Round 5 (Paul: 44 and 46 are decent; more low end, breathy throughout, crackle at the start and on "s"). */
const R44: VoiceRecipe = { ...ROCK2, lf: true, grit: 0.5, drive: 0.3 };
const R46: VoiceRecipe = { ...ROCK2, formants: 0.99, grit: 0.5, drive: 0.2 };
const FULL: VoiceRecipe = { body: 5, low: 4, airy: -22, breath: 4, attack: 0.03 };
/**
 * Round 6 (Paul: still nasal; the "s" too strong). A wide F1 and a bump near 250 Hz are what nasal vowels
 * have (the nose's resonance), and a raised larynx and pressed folds add twang: so F1 and F2 kept sharp,
 * no 250 Hz bump (the weight from a lower shelf and a laxer pulse instead), the larynx not raised, less
 * pressed, no presence lift; the "s" softer and less air on top.
 */
const OPEN: VoiceRecipe = { formants: 1, bw: undefined, bwUpper: 1.3, body: 0, low: 4, pressed: 0.15, presence: 0, tilt: -2, speech: 0.4, air: 2, ess: -8 };
const B61: VoiceRecipe = { ...R46, ...FULL, ...OPEN };
/** Paul's pick (round 7, clip 73): relaxed, not pressed, on the new source, breathy, 7 notes deeper. */
const V73: VoiceRecipe = { ...B61, pressed: 0, lf: true, tilt: 0, airy: -20 };
/** [name, the voice, semitones the lines are sung lower] */
const VARIANTS: [string, VoiceRecipe, number][] = [];

/**
 * Round 9 (Paul: the same voices, higher too: up like Tyler or Axl, like Cornell or Staley, like
 * Bennington): each voice's own low line, then a climb past their break to a belted A4, then a wail
 * up to C5 (not transposed: the same person going up).
 */
const HIGH_LINES: Line[] = [
  [[syl(['HH'], 'OW', ['L', 'D']), 62, 0, 0.375, 0.85], [syl([], 'AA', ['N']), 64, 0.375, 0.75, 0.75], [syl(['T'], 'UW'), 66, 0.75, 1, 0.85],
    [syl(['M'], 'IY'), 67, 1, 1.25, 0.85], [syl(['N'], 'AW'), 69, 1.25, 2.9, 0.95]],
  [[syl(['Y'], 'EH'), 67, 0, 0.375, 0.9], [syl([], 'EH'), 69, 0.375, 0.75, 0.9], [syl([], 'EH', ['Y']), 71, 0.75, 1.1, 0.95],
    [syl(['Y'], 'EH'), 72, 1.1, 3.0, 0.95]],
];
/** Their break: a baritone's, around E4. */
const BRK = 64;
/** [name, the voice, semitones their low line is sung lower] */
const HIGH_VARIANTS: [string, VoiceRecipe, number][] = [
  // round 13 (Paul: better, not good yet; try three registers, deep, mid and high, mixed by pitch)
  ['C0-rock-three-belt', { ...V73, brk: BRK, high: 'belt', three: true }, 6],
  ['C1-rock-three-scream', { ...V73, brk: BRK, high: 'scream', three: true }, 6],
  ['C2-hard-rock-three-squeal', { ...V73, grit: 0.7, drive: 0.35, pressed: 0.3, tilt: -1, vib: 0.5, vibStart: 0.45, brk: BRK + 1, high: 'squeal', three: true }, 3],
  ['C3-metal-three-belt', { ...V73, grit: 0.6, drive: 0.4, pressed: 0.4, tilt: -3, vib: 0.6, vibStart: 0.4, brk: BRK + 1, high: 'belt', three: true }, 2],
  ['C4-grunge-three-belt', { ...V73, grit: 0.7, drive: 0.3, formants: 0.97, tilt: 1, vib: 0.25, vibHz: -0.5, drift: 18, brk: BRK - 1, high: 'belt', three: true }, 8],
  ['C5-alt-metal-three-scream', { ...V73, grit: 0.6, drive: 0.35, pressed: 0.2, formants: 0.98, vib: 0.3, brk: BRK, high: 'scream', three: true }, 6],
];

const PRE = 0.3, GAP = 0.5;

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

/** Where the sound's energy sits: dB of the total in each band (low to high), as the brightness check. */
function bands(x: Float32Array, rate: number): string {
  const N = 2048, acc = new Float64Array(N / 2);
  const cos = Float64Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * i) / N)), sin = Float64Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * i) / N));
  for (let s = 0; s + N < x.length; s += N) {
    let e = 0;
    for (let i = 0; i < N; i++) e += x[s + i] ** 2;
    if (e < 1e-4) continue;
    const w = Float64Array.from({ length: N }, (_, i) => x[s + i] * (0.5 - 0.5 * cos[i]));
    for (let k = 0; k < N / 2; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < N; i++) { const j = (k * i) % N; re += w[i] * cos[j]; im -= w[i] * sin[j]; }
      acc[k] += re * re + im * im;
    }
  }
  const band = (a: number, b: number) => acc.reduce((t, v, k) => { const f = (k * rate) / N; return f >= a && f < b ? t + v : t; }, 0);
  const tot = band(0, rate / 2);
  return [[0, 300], [300, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 12000], [12000, 22050]]
    .map(([a, b]) => `${a / 1000}-${b / 1000}k ${band(a, b) > 0 ? Math.round(10 * Math.log10(band(a, b) / tot)) : '-'}`).join('  ');
}

mkdirSync('voice-lab', { recursive: true });
const render = (name: string, lab: VoiceRecipe, lines: Line[], downs: number[]) => {
  const parts = lines.map((line, li) => {
    const notes: SungNote[] = line.map(([s, midi, t, end, vel]) => ({ t, end, midi: midi - downs[li], vel, syl: s }));
    return renderLine(notes, { high: false, slides: 0, seed: 11, recipe: lab }, PRE);
  });
  const rate = lab.rate ?? SING_RATE;
  const total = parts.reduce((a, p) => a + p.length, 0) + Math.round(GAP * rate) * parts.length;
  const out = new Float32Array(total);
  let at = 0;
  for (const p of parts) { out.set(p.map((x) => x * 0.8), at); at += p.length + Math.round(GAP * rate); }
  writeFileSync(`voice-lab/${name}.wav`, wav(out, rate));
  console.log(name.padEnd(34), bands(out, rate));
};
for (const [name, lab, down] of VARIANTS) render(name, lab, LINES, LINES.map(() => down));
for (const [name, lab, down] of HIGH_VARIANTS) render(name, lab, [LINES[0], ...HIGH_LINES], [down, 0, 0]);
