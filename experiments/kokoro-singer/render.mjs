// The Kokoro singer test, step 2: Kokoro (Apache 2.0) speaks the pieces the test lines need, one WAV
// each, in out/pieces/<voice>/:
//   cv-<onset>-<vowel>      the onset into a long held vowel ("kaaa")
//   vc-<vowel>-<coda>       the vowel into the coda, after a soft "h" ("hahn"; the vowel's start is cut)
//   syl-<onset>-<vowel>-<coda>  the whole syllable, for comparison with the joined pieces
//   vcv-<vowel>-<coda>-<onset>-<vowel>  one syllable's vowel through the consonants into the next's
//                           (both vowels long: joined in the middle of the vowels, as UTAU's VCV banks)
// (pieces already rendered are kept)
// Run: node render.mjs   (after lines.ts has written out/lines.json)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';

export const VOICES = ['am_michael', 'am_fenrir', 'af_heart'];
const VOWEL = { IY: 'i', IH: 'ɪ', EY: 'A', EH: 'ɛ', AE: 'æ', AA: 'ɑ', AO: 'ɔ', OW: 'O', UH: 'ʊ', UW: 'u', AH: 'ʌ', AX: 'ə', AY: 'I', AW: 'W', OY: 'Y' };
const CONS = { P: 'p', B: 'b', T: 't', D: 'd', K: 'k', G: 'ɡ', M: 'm', N: 'n', NG: 'ŋ', F: 'f', V: 'v', TH: 'θ', DH: 'ð', S: 's', Z: 'z', SH: 'ʃ', CH: 'ʧ', JH: 'ʤ', HH: 'h', L: 'l', R: 'ɹ', W: 'w', Y: 'j' };
const ipa = (cs) => cs.map((c) => CONS[c]).join('');
const v = (x) => (x === 'AX' ? 'ə' : `ˈ${VOWEL[x]}`);

const lines = JSON.parse(readFileSync('out/lines.json', 'utf8'));
const jobs = new Map();
// (the syllables of a line: a note and the held '~' notes after it; phrases: broken at rests)
export function phrases(L) {
  const groups = [];
  for (const n of L) { if (n.syl.text === '~' && groups.length) groups[groups.length - 1].push(n); else groups.push([n]); }
  const out = [[groups[0]]];
  for (let i = 1; i < groups.length; i++) {
    if (groups[i][0].t - groups[i - 1].at(-1).end > 0.12) out.push([]);
    out.at(-1).push(groups[i]);
  }
  return out;
}
for (const L of lines) {
  for (const P of phrases(L)) {
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i][0].syl, ca = P[i].at(-1).syl.coda, b = P[i + 1][0].syl;
      jobs.set(`vcv-${a.vowel}-${ca.join('_')}-${b.onset.join('_')}-${b.vowel}`, `${v(a.vowel)}ː${ipa(ca)}${ipa(b.onset)}${v(b.vowel)}ː`);
    }
  }
}
for (const L of lines) {
  for (let i = 0; i < L.length; i++) {
    const s = L[i].syl;
    if (s.text === '~') continue;
    // (a held syllable's coda comes on its last note)
    let j = i;
    while (L[j + 1]?.syl.text === '~') j++;
    const coda = L[j].syl.coda;
    const on = s.onset.join('_'), cd = coda.join('_');
    jobs.set(`cv-${on}-${s.vowel}`, `${ipa(s.onset)}${v(s.vowel)}ː`);
    if (coda.length) jobs.set(`vc-${s.vowel}-${cd}`, `h${v(s.vowel)}${ipa(coda)}`);
    jobs.set(`syl-${on}-${s.vowel}-${cd}`, `${ipa(s.onset)}${v(s.vowel)}${ipa(coda)}`);
  }
}

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
const t0 = Date.now();
let secs = 0;
for (const voice of VOICES) {
  mkdirSync(`out/pieces/${voice}`, { recursive: true });
  for (const [name, text] of jobs) {
    if (existsSync(`out/pieces/${voice}/${name}.wav`)) continue;
    const { input_ids } = tts.tokenizer(text, { truncation: true });
    // (slow: long vowels and clear consonants)
    const a = await tts.generate_from_ids(input_ids, { voice, speed: name.startsWith('syl') || name.startsWith('vc-') ? 0.85 : 0.7 });
    secs += a.audio.length / a.sampling_rate;
    writeFileSync(`out/pieces/${voice}/${name}.wav`, wav(a.audio, a.sampling_rate));
  }
}
console.log(`${jobs.size} pieces x ${VOICES.length} voices, ${secs.toFixed(0)} s of audio in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
