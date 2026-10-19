// The speech-recognizer test, step 1: the 40 regression lines (experiments/kokoro-singer/asr-lines.json) sung by the voices and written as WAVs
// (experiments/kokoro-singer/out/asr/sung-<voice>-<midi>-<n>.wav), for experiments/kokoro-singer/asr-run.mjs to listen to.
// Run: npm run asr-render [-- rock pop woman ...]   (a genre, or a character: woman, chester...; each at two pitches; --midi=55,64)
// --orig: the app's earlier consonants (quiet, shortened, dark, barely a burst) for comparison (written as <voice>-orig).
// --speech: the same words at speaking pace on one flat low note (--midi=47 by default), to hear whether the sounds are clear apart from the singing.

import { readFileSync, writeFileSync } from 'node:fs';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { type Character, CHARACTERS, fofFor } from '../src/audio/voices';
import { loadDictionary, wordsOf } from '../src/lab/words';
import type { Genre } from '../src/genres';

await loadDictionary();
const lines: string[] = JSON.parse(readFileSync('experiments/kokoro-singer/asr-lines.json', 'utf-8'));
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const voices = names.length ? names : ['rock', 'pop', 'woman'];
const speech = process.argv.includes('--speech'), orig = process.argv.includes('--orig');
const midis = (process.argv.find((a) => a.startsWith('--midi='))?.split('=')[1] ?? (speech ? '47' : '55,64')).split(',').map(Number);
const out = (n: string) => `experiments/kokoro-singer/out/asr/${n}.wav`;

function wav(x: Float32Array, rate: number) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  let peak = 0.0001;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round((x[i] / peak) * 0.9 * 32767), 44 + i * 2);
  return b;
}
for (const name of voices) {
  const v0 = name in CHARACTERS ? fofFor('rock', 17, false, name as Character) : fofFor(name as Genre, 17, false);
  const v = orig ? { ...v0, cons: { blend: 0.04, short: 0.6, level: -6, dark: 0.75 }, stops: { burst: -22, voiced: -20, asp: -14, len: 0.05, hold: 24 } } : v0;
  for (const base of midis) {
    lines.forEach((line, n) => {
      const syls = wordsOf(line).flatMap((w) => w.syllables);
      let t = 0;
      const notes: SungNote[] = syls.map((s) => { const d = speech ? (s.stress ? 0.24 : 0.16) : s.stress ? 0.4 : 0.29; const q: SungNote = { t, end: t + d * 0.92, midi: base + (s.stress && !speech ? 2 : 0), vel: 0.7, syl: s }; t += d; return q; });
      writeFileSync(out(`${speech ? 'speech' : 'sung'}-${name}${orig ? '-orig' : ''}-${base}-${n}`), wav(renderFof(notes, { ...v, energy: 0.5 }, 0.3), FOF_RATE));
    });
    console.log(name, base, 'rendered', lines.length);
  }
}
