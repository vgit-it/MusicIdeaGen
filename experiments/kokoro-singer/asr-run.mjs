// The speech-recognizer test, step 2: Whisper (tiny, English) listens to the sung lines (scripts/asr-render.ts) and to Kokoro speaking the same lines,
// and the word error rate against the written line is kept per voice, and the words it gets wrong most.
// Run: node asr-run.mjs [voice-midi ...]    e.g.  node asr-run.mjs sung-rock-55 speech-rock-47   (default: every sung and speech file found); results in out/asr/results.json
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pipeline } from '@huggingface/transformers';

const lines = JSON.parse(readFileSync('asr-lines.json', 'utf-8'));
const dir = 'out/asr/';
const only = process.argv.slice(2);

// (a WAV, 16 or 32 bit, to 16 kHz mono: a box average over the ratio, enough for speech-band audio)
function readWav(path) {
  const b = readFileSync(path);
  const fmt = b.readUInt16LE(20), bits = b.readUInt16LE(34), rate = b.readUInt32LE(24);
  let at = 12;
  while (b.toString('ascii', at, at + 4) !== 'data') at += 8 + b.readUInt32LE(at + 4);
  const n = b.readUInt32LE(at + 4) / (bits / 8), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = fmt === 3 ? b.readFloatLE(at + 8 + i * 4) : b.readInt16LE(at + 8 + i * 2) / 32768;
  const r = rate / 16000, m = Math.floor(n / r), y = new Float32Array(m);
  for (let i = 0; i < m; i++) { const a = Math.floor(i * r), e = Math.max(a + 1, Math.floor((i + 1) * r)); let s = 0; for (let k = a; k < e; k++) s += x[k]; y[i] = s / (e - a); }
  return y;
}
const DIGITS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four' };
// (Whisper labels sung audio "(music)", "[clap]": not words, a miss; digits spelled out)
const norm = (s) => s.toLowerCase().replace(/[\[(][^\])]*[\])]|♪/g, ' ').replace(/\d/g, (d) => ` ${DIGITS[d] ?? d} `).replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
// (word error rate: edits between the written and heard words / written words)
function wer(ref, hyp) {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array(hyp.length).fill(0)]);
  for (let j = 0; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++) for (let j = 1; j <= hyp.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return d[ref.length][hyp.length];
}

// (the spoken baseline: Kokoro says each line, once)
if (!lines.every((_, n) => existsSync(`${dir}spoken-${n}.wav`))) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  for (let n = 0; n < lines.length; n++) writeFileSync(`${dir}spoken-${n}.wav`, Buffer.from((await tts.generate(lines[n] + '.', { voice: 'am_michael', speed: 0.9 })).toWav()));
  console.log('spoken baseline made');
}
const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
const groups = new Set(readdirSync(dir).filter((f) => /^(sung|speech)-/.test(f)).map((f) => f.replace(/-\d+\.wav$/, '')));
const sets = ['spoken', ...[...groups].filter((g) => !only.length || only.includes(g))];
if (only.length) console.log('(only', only.join(', '), ')');
const results = {};
for (const set of sets) {
  let errs = 0, words = 0;
  const bad = {}, rows = [];
  for (let n = 0; n < lines.length; n++) {
    const f = set === 'spoken' ? `${dir}spoken-${n}.wav` : `${dir}${set}-${n}.wav`;
    if (!existsSync(f)) continue;
    const heard = (await asr(readWav(f))).text;
    const ref = norm(lines[n]), hyp = norm(heard), e = Math.min(ref.length, wer(ref, hyp));
    errs += e; words += ref.length;
    for (const w of ref) if (!hyp.includes(w)) bad[w] = (bad[w] ?? 0) + 1;
    rows.push({ line: lines[n], heard: heard.trim(), errors: e });
  }
  results[set] = { wer: words ? errs / words : 0, rows, missed: Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, 12) };
  console.log(set.padEnd(12), 'word error rate', (100 * results[set].wer).toFixed(0) + '%', ' missed most:', results[set].missed.map(([w, c]) => `${w}(${c})`).join(' '));
}
writeFileSync(`${dir}results.json`, JSON.stringify(results, null, 1));
