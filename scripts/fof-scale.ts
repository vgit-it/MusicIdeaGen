// The FOF scale check: every voice sings a held note up the range on three vowels, and each note's level
// and "whistle" (the share of its harmonic energy in the fundamental alone) are printed, so thin high
// notes and quiet low ones show up as numbers. Run: npm run fof-scale  (no audio is played)

import { mkdirSync, writeFileSync } from 'node:fs';
import { FOF_RATE, type FofVoice, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { measure, mtof } from '../src/lab/measure';
import { fofFor, fofHigh, fofHighVoice } from '../src/audio/voices';
import { GENRES, type Genre } from '../src/genres';

const VOWELS = ['AA', 'OW', 'IY'] as const;
const MIDIS: number[] = [];
for (let m = 36; m <= 90; m += 3) MIDIS.push(m);


const voices: [string, FofVoice][] = [];
for (const g of Object.keys(GENRES) as Genre[]) voices.push([`${g}`, fofFor(g, 17, false)]);
voices.push(['rock-high', fofFor('rock', 17, true)], ['rock-tenor', fofHigh('rock', 17, 'tenor')], ['rock-woman', fofHigh('rock', 17, 'female')], ['chester', fofHighVoice('chester', 'altmetal', 17)]);
// (npm run fof-scale -- rock rock-woman: only those voices; --wav also writes voice-lab/scale-*.wav, the climb with the new
// low-note and close-vowel handling and without, to compare by ear)
const wav = process.argv.includes('--wav');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
function wavFile(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(FOF_RATE, 24); b.writeUInt32LE(FOF_RATE * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}
if (wav) mkdirSync('voice-lab', { recursive: true });

// each voice sings the whole climb as one line, as the app does (the level rider and the line's level included)
const STEP = 1.05;
console.log('notes (MIDI):'.padEnd(18), MIDIS.map((m) => String(m).padStart(4)).join(''));
for (const [name, v] of voices) {
  if (only.length && !only.includes(name)) continue;
  for (const vowel of VOWELS) {
    const syl = { onset: [], vowel, coda: [], stress: true, text: 'ah', wordStart: true } as unknown as SungNote['syl'];
    const notes: SungNote[] = MIDIS.map((midi, i) => ({ t: i * STEP, end: i * STEP + 0.9, midi, vel: 0.7, syl }));
    const out = renderFof(notes, process.argv.includes('--off') ? { ...v, lowBuzz: 0, closeFill: 0, falFill: 0 } : v, 0);
    if (wav) for (const [tag, vv] of [['new', v], ['old', { ...v, lowBuzz: 0, closeFill: 0, falFill: 0 }]] as const) writeFileSync(`voice-lab/scale-${name}-${vowel}-${tag}.wav`, wavFile(renderFof(notes, vv, 0)));
    const lv: number[] = [], sh: number[] = [], aw: number[] = [], hn: number[] = [], hs: number[] = [], bt: number[] = [];
    MIDIS.forEach((midi, i) => {
      const m = measure(out, mtof(midi + (v.shift ?? (v.high ? 12 : 0))), i * STEP + 0.3);
      lv.push(m.db); sh.push(m.h1); aw.push(m.a); hn.push(m.hnr); hs.push(m.hiss); bt.push(m.bite);
    });
    if (process.argv.includes('--brief')) {
      // (the written range E3-E5 and below: the worst quiet note, the barest tone, the noisiest)
      const lo = MIDIS.map((m, i) => i).filter((i) => MIDIS[i] <= 60 && MIDIS[i] >= 45);
      const mid = (x: number[]) => x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)];
      const refB = mid(aw.slice(2, 9));
      console.log(`${name} ${vowel}`.padEnd(18), `quietest ${Math.round(Math.min(...lo.map((i) => aw[i] - refB)))} dB   barest ${Math.round(100 * Math.max(...lo.map((i) => sh[i])))}%   noisiest ${Math.round(Math.min(...lo.map((i) => hn[i])))} dB clean`);
      continue;
    }
    const med = (x: number[]) => x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)];
    const ref = med(lv), refA = med(aw);
    console.log(`${name} ${vowel}`.padEnd(18), lv.map((x) => String(Math.round(x - ref)).padStart(4)).join(''), ' dB (RMS) vs median');
    console.log(''.padEnd(18), aw.map((x) => String(Math.round(x - refA)).padStart(4)).join(''), ' dB (as heard, A-weighted)');
    console.log(''.padEnd(18), hn.map((x) => String(Math.round(x)).padStart(4)).join(''), ' dB clean (tone over the noise between harmonics)');
    console.log(''.padEnd(18), bt.map((x) => String(Math.round(x)).padStart(4)).join(''), ' dB bite 2-5 kHz (under the whole)');
    console.log(''.padEnd(18), hs.map((x) => String(Math.round(x)).padStart(4)).join(''), ' dB hiss above 5 kHz (under the whole)');
    console.log(''.padEnd(18), sh.map((x) => String(Math.round(x * 100)).padStart(4)).join(''), ' % fundamental');
  }
}
