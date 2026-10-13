// The ess lab: is the "fuzz" (stray s/t/ts noise between sung syllables) the words or the synth?
// The same sung lines (verses and choruses of a few generated songs) by the FOF singer, four ways:
// E0 as written; E1 no hiss (every s, z, sh, ch, j, f, v, th swapped for a soft sound); E2 no squeeze
// (consonants that would be squashed into a short burst left out instead); E3 seam rules only (a hard or
// hissy ending dropped before a hard or hissy start). WAV files in voice-lab/, with counts behind them.
// Run: npm run ess-lab

import { mkdirSync, writeFileSync } from 'node:fs';
import { lagFor, perform } from '../src/audio/feel';
import { FOF_RATE, renderFof } from '../src/audio/fof';
import { CONS, type SungNote } from '../src/audio/sing';
import { fofFor } from '../src/audio/voices';
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import type { Cons, Syllable } from '../src/parts/lyrics';
import { buildTrack, defaultTrackOptions } from '../src/track';

const SONGS: [Genre, string][] = [['rock', 'flow-1'], ['rock', 'smoke-rock-0'], ['pop', 'ess-pop-1'], ['grunge', 'ess-grunge-1'], ['hardrock', 'ess-hr-1']];

function linesOf(genre: Genre, seed: string): SungNote[][] {
  const idea = generate({ genre, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], {
    song: seed, chords: `${seed}c`, drums: `${seed}d`, strum: `${seed}s`, bass: `${seed}b`, vocal: `${seed}v`,
  });
  const track = buildTrack(idea, defaultTrackOptions(idea)) as unknown as { sections?: typeof idea[] } & (typeof idea)[];
  const sections = track.sections ?? track;
  const out: SungNote[][] = [];
  for (const kind of ['verse', 'chorus']) {
    const sec = sections.find((s) => s.section?.kind === kind && s.vocal?.length);
    if (!sec) continue;
    const groups: NonNullable<typeof sec.vocal>[] = [];
    for (const n of sec.vocal!) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
    const six = 15 / sec.song.bpm;
    for (const L of groups.slice(0, 2)) out.push(perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7));
  }
  return out;
}

const HISS: Cons[] = ['S', 'Z', 'SH', 'CH', 'JH', 'F', 'V', 'TH', 'DH'];
const HARD: Cons[] = ['P', 'T', 'K', 'B', 'D', 'G'];
const noisy = (c: Cons) => HISS.includes(c) || HARD.includes(c);
const SOFTEN: Partial<Record<Cons, Cons>> = { S: 'N', Z: 'N', SH: 'L', CH: 'D', JH: 'D', F: 'M', V: 'M', TH: 'N', DH: 'D' };
const reSyl = (s: Syllable, onset: Cons[], coda: Cons[]): Syllable => ({ ...s, onset, coda });

/** E1: no hiss at all (each fricative swapped for a soft sound; repeats in a cluster merged). */
const noHiss = (ns: SungNote[]) => ns.map((n) => {
  const sw = (cs: Cons[]) => cs.map((c) => SOFTEN[c] ?? c).filter((c, i, a) => c !== a[i - 1]);
  return { ...n, syl: reSyl(n.syl, sw(n.syl.onset), sw(n.syl.coda)) };
});

/** E2: no squeeze (as layout() would fit them: consonants squashed under 60% of their length dropped, outer ones first). */
const PHRASED = 0.7;
const noSqueeze = (ns: SungNote[]) => ns.map((n, i) => {
  const room = Math.max(0.03, Math.min(0.2, (n.t - (i > 0 ? ns[i - 1].t : n.t - 0.4)) * 0.45));
  const onset = [...n.syl.onset];
  while (onset.length > 1 && onset.reduce((a, c) => a + CONS[c].dur * PHRASED, 0) > room / 0.6) onset.shift();
  const len = n.end - n.t;
  const coda = [...n.syl.coda];
  while (coda.length && coda.reduce((a, c) => a + CONS[c].dur * PHRASED * 0.8, 0) > (len * 0.4) / 0.6) coda.pop();
  return { ...n, syl: reSyl(n.syl, onset, coda) };
});

/** E3: seam rules (a hard or hissy last consonant dropped before a hard or hissy first one, within 0.25 s). */
const seams = (ns: SungNote[]) => ns.map((n, i) => {
  const nx = ns[i + 1];
  const coda = [...n.syl.coda];
  if (nx && nx.t - n.end < 0.25 && nx.syl.onset.length && noisy(nx.syl.onset[0])) while (coda.length && noisy(coda[coda.length - 1])) coda.pop();
  return { ...n, syl: reSyl(n.syl, n.syl.onset, coda) };
});

/** What's in the words: seams (coda then onset, joined) by kind, clusters, and consonants squashed by the timing. */
function wordStats(lines: SungNote[][]) {
  let seamsAll = 0, noisySeams = 0, hissSeams = 0, clusters = 0, cons = 0, squashed = 0, hiss = 0;
  const pairs = new Map<string, number>();
  for (const ns of lines) ns.forEach((n, i) => {
    const room = Math.max(0.03, Math.min(0.2, (n.t - (i > 0 ? ns[i - 1].t : n.t - 0.4)) * 0.45));
    const want = n.syl.onset.reduce((a, c) => a + CONS[c].dur * PHRASED, 0);
    const len = n.end - n.t, cw = n.syl.coda.reduce((a, c) => a + CONS[c].dur * PHRASED * 0.8, 0);
    cons += n.syl.onset.length + n.syl.coda.length;
    hiss += [...n.syl.onset, ...n.syl.coda].filter((c) => HISS.includes(c)).length;
    if (want > room / 0.6) squashed += n.syl.onset.length;
    if (cw > (len * 0.4) / 0.6) squashed += n.syl.coda.length;
    clusters += +(n.syl.onset.length > 1) + +(n.syl.coda.length > 1);
    const nx = ns[i + 1];
    if (!nx || nx.t - n.end >= 0.25) return;
    seamsAll++;
    const a = n.syl.coda[n.syl.coda.length - 1], b = nx.syl.onset[0];
    if (a && b && noisy(a) && noisy(b)) {
      noisySeams++;
      if (HISS.includes(a) || HISS.includes(b)) hissSeams++;
      const k = `${n.syl.coda.join('')}+${nx.syl.onset.join('')}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  });
  return { seamsAll, noisySeams, hissSeams, clusters, cons, squashed, hiss, top: [...pairs].sort((x, y) => y[1] - x[1]).slice(0, 8) };
}

/** Noise in the sound: 5 ms frames that are mostly noise (many zero crossings) and loud enough to hear,
 * how many of them, and how many short bursts (noise runs under 30 ms: the "fuzz" of a squashed consonant). */
function noiseStats(a: Float32Array) {
  const F = Math.round(0.005 * FOF_RATE), db: number[] = [], zc: number[] = [];
  for (let s = 0; s + F <= a.length; s += F) {
    let e = 0, z = 0;
    for (let i = s; i < s + F; i++) { e += a[i] * a[i]; if (i > s && (a[i] >= 0) !== (a[i - 1] >= 0)) z++; }
    db.push(10 * Math.log10(e / F + 1e-12)); zc.push((z / F) * FOF_RATE / 2);
  }
  const ref = [...db].sort((x, y) => x - y)[Math.floor(db.length * 0.9)];
  const isN = db.map((d, k) => d > ref - 30 && zc[k] > 2500);
  let frames = 0, bursts = 0, run = 0;
  for (const x of [...isN, false]) { if (x) { frames++; run++; } else { if (run && run * 5 < 30) bursts++; run = 0; } }
  return { noiseMs: frames * 5, bursts, secs: a.length / FOF_RATE };
}

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

const PRE = 0.3;
mkdirSync('voice-lab', { recursive: true });
const songs = SONGS.map(([g, s]) => ({ g, lines: linesOf(g, s) }));
const TAKES: [string, (n: SungNote[]) => SungNote[]][] = [['E0-as-written', (n) => n], ['E1-no-hiss', noHiss], ['E2-no-squeeze', noSqueeze], ['E3-seam-rules', seams], ['E4-vowels-only', (ns) => ns.map((n) => ({ ...n, syl: reSyl(n.syl, [], []) }))], ['E6-no-ptk', (ns) => ns.map((n) => { const f = (cs: Cons[]) => cs.filter((c) => !['P', 'T', 'K'].includes(c)); return { ...n, syl: reSyl(n.syl, f(n.syl.onset), f(n.syl.coda)) }; })], ['E5-no-stops', (ns) => ns.map((n) => { const f = (cs: Cons[]) => cs.filter((c) => !HARD.includes(c)); return { ...n, syl: reSyl(n.syl, f(n.syl.onset), f(n.syl.coda)) }; })]];
for (const [name, fix] of TAKES) {
  const parts: Float32Array[] = [];
  const all: SungNote[][] = [];
  for (const { g, lines } of songs) for (const L of lines) { const ns = fix(L); all.push(ns); parts.push(renderFof(ns, fofFor(g, 17, false), PRE)); }
  const gap = Math.round(0.6 * FOF_RATE);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p.map((x) => x * 0.8), at); at += p.length + gap; }
  writeFileSync(`voice-lab/${name}.wav`, wav(out, FOF_RATE));
  const w = wordStats(all), n = noiseStats(out);
  console.log(`${name.padEnd(15)} noise ${(n.noiseMs / 1000).toFixed(1)} s of ${n.secs.toFixed(0)} s, short bursts ${n.bursts} | consonants ${w.cons} (hiss ${w.hiss}, squashed ${w.squashed}), clusters ${w.clusters}, joined seams ${w.seamsAll} (noisy ${w.noisySeams}, with hiss ${w.hissSeams})`);
  if (name === 'E0-as-written') {
    console.log('  commonest noisy seams:', w.top.map(([k, c]) => `${k} x${c}`).join(', '));
    console.log('  lines:'); for (const L of all) console.log('   ', L.map((x) => x.syl.text).join(' '));
  }
}
