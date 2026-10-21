// Voice prints, step 1: each Kokoro voice says every vowel held, in the classic "h_d" frame of formant
// studies ("hahd", "heed"...), at two speeds -> out/print/<voice>/<vowel>-<n>.wav
// Run: node print-render.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';

export const VOICES = process.argv.length > 2 ? process.argv.slice(2) : ['am_michael', 'am_fenrir', 'bm_george', 'af_heart'];
const VOWEL = { IY: 'i', IH: 'ɪ', EY: 'A', EH: 'ɛ', AE: 'æ', AA: 'ɑ', AO: 'ɔ', OW: 'O', UH: 'ʊ', UW: 'u', AH: 'ʌ', AX: 'ə', AY: 'I', AW: 'W', OY: 'Y' };
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
for (const voice of VOICES) {
  mkdirSync(`out/print/${voice}`, { recursive: true });
  for (const [name, ipa] of Object.entries(VOWEL)) {
    // (the schwa can't be stressed: said as in "the")
    const text = name === 'AX' ? 'hədˈɑ' : `hˈ${ipa}ːd`;
    for (const [n, speed] of [[0, 0.7], [1, 0.85]]) {
      const { input_ids } = tts.tokenizer(text, { truncation: true });
      const a = await tts.generate_from_ids(input_ids, { voice, speed });
      writeFileSync(`out/print/${voice}/${name}-${n}.wav`, wav(a.audio, a.sampling_rate));
    }
  }
}
console.log('done');
