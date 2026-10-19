// Kokoro speaks single words, to measure real resonance tracks against the FOF singer's (scripts/track-check.ts --wav).
// Run: node speak-words.mjs bird world never   (WAVs in out/words/<voice>-<word>.wav)
import { writeFileSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const words = process.argv.slice(2);
for (const voice of ['am_michael', 'am_onyx']) {
  for (const w of words) {
    const a = await tts.generate(w + '.', { voice, speed: 0.8 });
    writeFileSync(`out/words/${voice}-${w}.wav`, Buffer.from(a.toWav()));
    console.log(voice, w, a.audio.length / a.sampling_rate, 's');
  }
}
