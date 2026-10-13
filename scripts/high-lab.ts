// The high-voice lab: the same song's verse and chorus sung by the old high voice (the low man's tune
// an octave up) and by the new one (singers.ts: a woman in pop, funk and rock, a tenor in the heavier
// genres, each with their own tune), and by the low voice for reference; polished as the app does,
// as MP3s in voice-lab/ to compare by ear. Run: npm run high-lab (ONLY=pop,metal: just those genres)

import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { lagFor, perform } from '../src/audio/feel';
import { type FofVoice, FOF_RATE, renderFof } from '../src/audio/fof';
import { type VocalComp, type VocalFx, polishVoice } from '../src/audio/polish';
import type { SungNote } from '../src/audio/sing';
import { fofFor, fofHigh } from '../src/audio/voices';
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { highSinger } from '../src/parts/singers';
import { buildTrack, defaultTrackOptions } from '../src/track';

/** A seeded song's first verse and chorus lines for a lead voice, as notes in seconds (with the singer's feel). */
function linesOf(g: Genre, seed: string, voice: 'low' | 'high') {
  const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, vocalVoice: voice } as Parameters<typeof generate>[0], {
    song: seed, chords: `${seed}c`, drums: `${seed}d`, strum: `${seed}s`, bass: `${seed}b`, vocal: `${seed}v`,
  });
  const track = buildTrack(idea, defaultTrackOptions(idea)) as unknown as { sections?: typeof idea[] } & (typeof idea)[];
  const sections = track.sections ?? track;
  const out: SungNote[][] = [];
  for (const [kind, k] of [['verse', 2], ['chorus', 3]] as const) {
    const sec = sections.find((s) => s.section?.kind === kind && s.vocal?.length);
    if (!sec) return null;
    const groups: NonNullable<typeof sec.vocal>[] = [];
    for (const n of sec.vocal!) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
    const six = 15 / sec.song.bpm;
    // (long lines cut at a note's end, about 5 s in; the verse softer, the chorus pushed)
    for (const L of groups.slice(0, k)) {
      const ns = perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: kind === 'verse' ? Math.min(n.vel, 0.7) : Math.max(n.vel, 0.85), syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7);
      const c = ns.findIndex((n) => n.end - ns[0].t > 5);
      out.push(c < 0 ? ns : ns.slice(0, Math.max(3, c)));
    }
  }
  return out;
}

const COMP: Record<Genre, VocalComp> = { rock: 'natural', pop: 'radio', funk: 'tight', hardrock: 'heavy', metal: 'heavy', grunge: 'dark', altmetal: 'heavy' };
const GENRES: Genre[] = ['pop', 'rock', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const only = process.env.ONLY?.split(',');

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

mkdirSync('voice-lab', { recursive: true });
const PRE = 0.3;
const ffmpeg: string = createRequire(import.meta.url)('ffmpeg-static');
const name = (m: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12] + (Math.floor(m / 12) - 1);
for (const g of GENRES.filter((x) => !only || only.includes(x))) {
  // (the song, of a few, whose chorus reaches highest)
  let seed = '', top = -1;
  for (let i = 0; i < 8; i++) {
    const L = linesOf(g, `high-${g}-${i}`, 'low');
    const t = L ? Math.max(...L.slice(2).flat().map((n) => n.midi)) : -1;
    if (t > top) { top = t; seed = `high-${g}-${i}`; }
  }
  const low = linesOf(g, seed, 'low')!, high = linesOf(g, seed, 'high')!;
  const who = highSinger(g);
  const takes: [string, SungNote[][], FofVoice, number][] = [
    ['1-low', low, fofFor(g, 17, false), 0],
    ['2-high-old', low, fofFor(g, 17, true), 12],
    [`3-high-new-${who}`, high, fofHigh(g, 17, who), who === 'female' ? 12 : 0],
  ];
  for (const [take, lines, v, up] of takes) {
    const parts = lines.map((L, i) => polishVoice(renderFof(L, { ...v, seed: 17 + i, energy: i < 2 ? 0.3 : 0.85 }, PRE), FOF_RATE, { comp: COMP[g] }).map((x) => x * (i < 2 ? 0.6 : 0.85)));
    const gap = Math.round(0.5 * FOF_RATE);
    const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length + gap; }
    const w = `voice-lab/high-${g}-${take}.wav`;
    writeFileSync(w, wav(out, FOF_RATE));
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', w, '-b:a', '160k', w.replace('.wav', '.mp3')]);
    unlinkSync(w);
    const ms = lines.flat().map((n) => n.midi + up);
    console.log(g, take, `${name(Math.min(...ms))}-${name(Math.max(...ms))}`, `${(out.length / FOF_RATE).toFixed(1)} s`);
  }
}
