// Voice prints, step 3: the same 8 rock lines by the app's FOF singer, with the textbook vowels (as the
// app sings now) and with each measured Kokoro voice's vowels; everything else the same recipe. With a
// print the voice is as measured (tract and size 1: the person's own size is in the print).
// Run from the repo root:
//   npx rolldown experiments/kokoro-singer/print-sing.ts --platform node --format esm -o node_modules/.cache/print-sing.mjs && node node_modules/.cache/print-sing.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { FOF_RATE, type FofVoice, type VoicePrint, renderFof } from '../../src/audio/fof';
import type { SungNote } from '../../src/audio/sing';
import { fofFor } from '../../src/audio/voices';

const DIR = 'experiments/kokoro-singer/out';
// (SET=grunge: grunge lines, the grunge voice and Cornell with the darker prints)
const SET = process.env.SET ?? 'rock';
const lines: SungNote[][] = JSON.parse(readFileSync(`${DIR}/lines${SET === 'rock' ? '' : '-grunge'}.json`, 'utf8'));
const print = (voice: string): VoicePrint => JSON.parse(readFileSync(`${DIR}/print/${voice}.json`, 'utf8'));

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

const asMeasured = (p: VoicePrint): Partial<FofVoice> => ({ print: p, tract: 1, size: 1 });
const rockTakes: [string, (seed: number) => FofVoice][] = [
  ['P1-rock-textbook', (s) => fofFor('rock', s, false)],
  ['P2-rock-michael', (s) => ({ ...fofFor('rock', s, false), ...asMeasured(print('am_michael')) })],
  ['P3-rock-fenrir', (s) => ({ ...fofFor('rock', s, false), ...asMeasured(print('am_fenrir')) })],
  ['P4-woman-textbook', (s) => fofFor('rock', s, false, 'woman')],
  ['P5-woman-heart', (s) => ({ ...fofFor('rock', s, false, 'woman'), ...asMeasured(print('af_heart')) })],
];

const grungeTakes: [string, (seed: number) => FofVoice][] = [
  ['G0-grunge-textbook', (s) => fofFor('grunge', s, false)],
  ...['am_michael', 'am_onyx', 'bm_daniel', 'bm_lewis', 'am_puck'].map((p, i): [string, (seed: number) => FofVoice] =>
    [`G${i + 1}-grunge-${p.slice(3)}`, (s) => ({ ...fofFor('grunge', s, false), ...asMeasured(print(p)) })]),
  ['G6-cornell-textbook', (s) => fofFor('grunge', s, false, 'cornell')],
  ['G7-cornell-michael', (s) => ({ ...fofFor('grunge', s, false, 'cornell'), ...asMeasured(print('am_michael')) })],
];
// (Paul: Onyx and Daniel, "a lot of noise": the grunge recipe's rasp and breath, halved and nearly off)
const cleanTakes: [string, (seed: number) => FofVoice][] = ['am_onyx', 'bm_daniel'].flatMap((p) => [
  [`H-${p.slice(3)}-grunge`, (s: number) => ({ ...fofFor('grunge', s, false), ...asMeasured(print(p)) })],
  [`H-${p.slice(3)}-half-grit`, (s: number) => ({ ...fofFor('grunge', s, false), grit: 0.3, breath: -36, ...asMeasured(print(p)) })],
  [`H-${p.slice(3)}-clean`, (s: number) => ({ ...fofFor('grunge', s, false), grit: 0.08, breath: -42, ...asMeasured(print(p)) })],
] as [string, (seed: number) => FofVoice][]);
// (Paul: "Onyx clean is a good voice"; now one much deeper, Eddie Vedder deep: a bigger throat on
// Onyx's print, covered vowels, a heavy low end kept up high, a slow wide wobble, sung lower)
const onyxClean = (s: number): FofVoice => ({ ...fofFor('grunge', s, false), grit: 0.08, breath: -42, ...asMeasured(print('am_onyx')) });
const deepTakes: [string, (seed: number) => FofVoice, number][] = [
  ['V1-onyx-clean', onyxClean, 0],
  ['V2-onyx-deep', (s) => ({ ...onyxClean(s), tract: 0.92, spread: 0, cover: 0.4, body: 8, heft: 0.6, bright: -0.5, vib: 55, vibHz: 4.8, sag: 0.5 }), -3],
  ['V3-onyx-deeper', (s) => ({ ...onyxClean(s), tract: 0.88, spread: 0, cover: 0.6, body: 10, heft: 0.8, bright: -1, bw: 1.5, fry: 0.3, vib: 70, vibHz: 4.6, sag: 0.6, scoop: 0.6 }), -5],
  ['V4-onyx-deeper-grain', (s) => ({ ...onyxClean(s), tract: 0.88, spread: 0, cover: 0.6, body: 10, heft: 0.8, bright: -1, bw: 1.5, fry: 0.3, vib: 70, vibHz: 4.6, sag: 0.6, scoop: 0.6, grit: 0.3, breath: -38 }), -5],
];
// (Paul: keep Onyx clean as is; a new voice from scratch, Vedder-like: a new man blended from Kokoro's
// deep men and grown along the 13 men's size direction (blend.mjs: new_size84, measured 10% bigger
// than the textbook), on the Big & dark character (Vedder-like), clean as Onyx's, then with grain, then lower)
const newVoice = (s: number): FofVoice => ({ ...fofFor('grunge', s, false, 'deep'), grit: 0.08, breath: -42, ...asMeasured(print('new_size84')) });
const newTakes: [string, (seed: number) => FofVoice, number][] = [
  ['W1-new-clean', newVoice, 0],
  ['W2-new-grain', (s) => ({ ...newVoice(s), grit: 0.3, breath: -38 }), 0],
  ['W3-new-clean-lower', newVoice, -3],
];
// (Paul: "match the speaking clip": the settings and tone EQ found by match.ts to sound like him speaking)
const matched = (s: number): FofVoice => ({
  ...newVoice(s), ...JSON.parse(readFileSync(`${DIR}/print/new_size84-match.json`, 'utf8')),
  print: JSON.parse(readFileSync(`${DIR}/print/new_size84-matched.json`, 'utf8')), size: 1,
});
const matchTakes: [string, (seed: number) => FofVoice, number][] = [
  ['M0-new-W1', newVoice, 0],
  ['M1-new-matched', matched, 0],
  ['M2-new-matched-cleaner', (s) => ({ ...matched(s), breath: -54, grit: 0 }), 0],
];
// (Paul: his "go" vs ours. His "o" measured again (the misread check had thrown out his forward "o" and
// "oo" for the textbook's), and his diphthongs gliding through more of the vowel, as he says them)
const glided = (s: number): FofVoice => { const v = matched(s); return { ...v, print: { ...v.print!, glide: 0.6 } }; };
const goTakes: [string, (seed: number) => FofVoice, number][] = [
  ['O1-new-o-fixed', (s) => ({ ...matched(s), breath: -54, grit: 0 }), 0],
  ['O2-new-o-fixed-glide', (s) => ({ ...glided(s), breath: -54, grit: 0 }), 0],
];
// (Paul: "not able to do deep textures": the FOF's grains vs a real fold pulse (LF, Rd) through the
// formants in series, the breath and rasp made at the folds and shaped by the same tract; clean and grainy)
const cascade = (s: number, q: Partial<FofVoice> = {}): FofVoice => ({ ...newVoice(s), tract: 0.95, breath: -54, grit: 0, ...q, lab: { cascade: { rd: 1.1, rdLoud: 0.75 } } });
const texTakes: [string, (seed: number) => FofVoice, number][] = [
  ['T0-fof-clean', (s) => ({ ...matched(s), breath: -54, grit: 0 }), 0],
  ['T1-pulse-clean', (s) => cascade(s), 0],
  ['T2-fof-grain', (s) => ({ ...matched(s), breath: -38, grit: 0.3 }), 0],
  ['T3-pulse-grain', (s) => cascade(s, { breath: -38, grit: 0.3 }), 0],
  ['T4-pulse-breathy', (s) => cascade(s, { breath: -30, grit: 0.1 }), 0],
];
// (Paul: the clean pulse "interesting, but open his mouth a bit more": the jaw dropped (F1 up) and the
// throat back to his own size (tract 1, was 0.95), by so much)
const opened = (o: number, tract = 1) => (s: number): FofVoice => { const v = cascade(s, { tract }); return { ...v, lab: { ...v.lab, open: o } }; };
const openTakes: [string, (seed: number) => FofVoice, number][] = [
  ['U0-pulse-clean', (s) => cascade(s), 0],
  ['U1-pulse-open-some', opened(0.5), 0],
  ['U2-pulse-open-more', opened(1), 0],
  ['U3-pulse-open-wide', opened(1.6), 0],
];
// (Paul: "open it further", and "some roundedness coming in: avoid that": the character's covering (front
// vowels' F2 pulled back) off, the F2 pull gone, then lips spread a little)
const wide = (o: number, lips = 0) => (s: number): FofVoice => { const v = cascade(s, { tract: 1, cover: 0 }); return { ...v, lab: { ...v.lab, open: o, lips } }; };
const wideTakes: [string, (seed: number) => FofVoice, number][] = [
  ['X1-pulse-open-2', wide(2), 0],
  ['X2-pulse-open-2.5', wide(2.5), 0],
  ['X3-pulse-open-2.5-spread', wide(2.5, 1), 0],
  ['X4-pulse-open-2.5-spread-more', wide(2.5, 2), 0],
];
// (Paul, on X4: "now reduce the frequency": its resonances lower (a bigger throat, the same mouth), and
// its pitch lower (the tune moved down, out of the song's key for now))
const x4 = (tract: number) => (s: number): FofVoice => ({ ...wide(2.5, 2)(s), tract });
const lowTakes: [string, (seed: number) => FofVoice, number][] = [
  ['Y1-x4-throat-bigger', x4(0.95), 0],
  ['Y2-x4-throat-biggest', x4(0.9), 0],
  ['Y3-x4-pitch-down-3', x4(1), -3],
];
const takes: [string, (seed: number) => FofVoice, number?][] = SET === 'low' ? lowTakes : SET === 'wide' ? wideTakes : SET === 'open' ? openTakes : SET === 'tex' ? texTakes : SET === 'go' ? goTakes : SET === 'match' ? matchTakes : SET === 'new' ? newTakes : SET === 'grunge' ? grungeTakes : SET === 'clean' ? cleanTakes : SET === 'deep' ? deepTakes : rockTakes;

// his sentence ("I've been waiting here so long, I don't know where to go"), said: a speaking pitch
// (about his, 128 Hz) with a speaker's rise and fall, for side by side with Kokoro saying it
const S = (onset: string[], vowel: string, coda: string[], stress = true) => ({ onset, vowel, coda, stress, text: vowel, wordStart: true }) as unknown as SungNote['syl'];
const SAID: [SungNote['syl'], number, number][] = [
  [S([], 'AY', ['V']), 0.24, 48.5], [S(['B'], 'IH', ['N'], false), 0.16, 47.5], [S(['W'], 'EY', ['T']), 0.26, 50.5], [S([], 'IH', ['NG'], false), 0.15, 48],
  [S(['HH'], 'IH', ['R']), 0.3, 48.5], [S(['S'], 'OW', []), 0.24, 48], [S(['L'], 'AO', ['NG']), 0.5, 49.5],
  [S([], 'AY', []), 0.2, 48.5], [S(['D'], 'OW', ['N', 'T']), 0.3, 50.5], [S(['N'], 'OW', []), 0.28, 49], [S(['W'], 'EH', ['R']), 0.28, 48.5],
  [S(['T'], 'AX', [], false), 0.14, 47], [S(['G'], 'OW', []), 0.6, 47.5],
];
const sentence: SungNote[] = [];
{
  let t = 0;
  SAID.forEach(([syl, len, m], i) => {
    sentence.push({ t, end: t + len * 0.92, midi: m, vel: 0.6, syl, fall: i === 6 || i === SAID.length - 1 ? 2 : undefined });
    t += len + (i === 6 ? 0.35 : 0);
  });
}

const PRE = 0.3;
if (SET === 'match' || SET === 'go' || SET === 'tex' || SET === 'open' || SET === 'wide') for (const [name, voice] of takes) {
  const x = renderFof(sentence, voice(17), PRE);
  const rms = Math.sqrt(x.reduce((a, y) => a + y * y, 0) / x.length);
  writeFileSync(`${DIR}/${name}-speech.wav`, wav(x.map((y) => Math.tanh((y * 0.1) / rms)), FOF_RATE));
}
for (const [name, voice, by = 0] of takes) {
  // (a take's own key: the tune moved down so many semitones)
  const parts = lines.map((L, i) => renderFof(L.map((n) => ({ ...n, midi: n.midi + by })), voice(17 + i), PRE));
  const gap = Math.round(0.6 * FOF_RATE);
  const all = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length + gap; }
  // (all at one loudness, to compare the tone)
  const rms = Math.sqrt(all.reduce((a, x) => a + x * x, 0) / all.length);
  const k = 0.1 / rms;
  writeFileSync(`${DIR}/${name}.wav`, wav(all.map((x) => Math.tanh(x * k)), FOF_RATE));
  console.log(name);
}
