// New voices from scratch: Kokoro's voices are style vectors (510 x 256 numbers: the first 128 the
// voice's sound, the rest its speaking style), so blending and pushing them makes people who aren't in
// Kokoro. Here: the deep men (Lewis, Daniel, Adam; not Onyx) averaged, then pushed further away from
// the light ones (Fenrir, Puck, Echo, Eric) toward a bigger, darker man (a Vedder-like baritone).
// Each says the vowels for a voice print (out/print/<name>/), and a sentence (out/<name>-speech.wav).
// Run: node blend.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Tensor } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';

const VOWEL = { IY: 'i', IH: 'ɪ', EY: 'A', EH: 'ɛ', AE: 'æ', AA: 'ɑ', AO: 'ɔ', OW: 'O', UH: 'ʊ', UW: 'u', AH: 'ʌ', AX: 'ə', AY: 'I', AW: 'W', OY: 'Y' };
const load = (v) => new Float32Array(readFileSync(`node_modules/kokoro-js/voices/${v}.bin`).buffer.slice(0));
const mean = (vs) => { const o = new Float32Array(vs[0].length); for (const v of vs) v.forEach((x, i) => (o[i] += x / vs.length)); return o; };
const deep = mean(['bm_lewis', 'bm_daniel', 'am_adam'].map(load));
const light = mean(['am_fenrir', 'am_puck', 'am_echo', 'am_eric'].map(load));
// (pushed only in the sound half of each row; the speaking style stays the deep men's)
const push = (k) => deep.map((x, i) => (i % 256 < 128 ? x + k * (x - light[i]) : x));
// (and a cleaner way: the direction in which the 13 men's measured size (print scale) grows, fitted
// across them, so only size moves, not accent or clarity)
const SIZE = { am_michael: 0.99, am_fenrir: 1.12, am_adam: 1.02, am_echo: 1.08, am_eric: 1.04, am_liam: 1.02, am_onyx: 0.98, am_puck: 1.08, am_santa: 1.05, bm_lewis: 1.0, bm_daniel: 0.96, bm_fable: 1.08, bm_george: 1.0 };
const men = Object.keys(SIZE).map(load), sz = Object.values(SIZE);
const mx = mean(men), ms = sz.reduce((a, b) => a + b) / sz.length;
const dir = new Float32Array(mx.length);
const den = sz.reduce((a, s) => a + (s - ms) ** 2, 0);
men.forEach((m, j) => m.forEach((x, i) => (dir[i] += ((sz[j] - ms) * (x - mx[i])) / den)));
// (from the deep men's average, measured at 0.98, to a size of so much)
const toSize = (target) => deep.map((x, i) => (i % 256 < 128 ? x + (target - 0.98) * dir[i] : x));
const ALL = { new_deep0: push(0), new_deep1: push(0.6), new_deep2: push(1.0), new_deep3: push(1.4), new_size92: toSize(0.92), new_size88: toSize(0.88), new_size84: toSize(0.84) };
const BLENDS = Object.fromEntries(Object.entries(ALL).filter(([k]) => process.argv.length <= 2 || process.argv.includes(k)));

function wav(a, rate) {
  const b = Buffer.alloc(44 + a.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + a.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(a.length * 2, 40);
  a.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
async function say(style, ipa, speed) {
  const { input_ids } = tts.tokenizer(ipa, { truncation: true });
  const row = 256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
  const { waveform } = await tts.model({ input_ids, style: new Tensor('float32', style.slice(row, row + 256), [1, 256]), speed: new Tensor('float32', [speed], [1]) });
  return waveform.data;
}
for (const [name, style] of Object.entries(BLENDS)) {
  mkdirSync(`out/print/${name}`, { recursive: true });
  for (const [v, ipa] of Object.entries(VOWEL)) {
    const text = v === 'AX' ? 'hədˈɑ' : `hˈ${ipa}ːd`;
    for (const [n, speed] of [[0, 0.7], [1, 0.85]]) writeFileSync(`out/print/${name}/${v}-${n}.wav`, wav(await say(style, text, speed), 24000));
  }
  // (to hear the person: "I've been waiting here so long, I don't know where to go")
  writeFileSync(`out/${name}-speech.wav`, wav(await say(style, 'ˈIv bɪn wˈAtɪŋ hˈɪɹ sˈO lˈɔŋ, I dˈOnt nˈO wˈɛɹ tə ɡˈO', 0.9), 24000));
  console.log(name);
}
