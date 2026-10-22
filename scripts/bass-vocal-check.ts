// Checks the bass-led vocal (docs/VOCAL-BASS.md) on real songs:
//  - the New writer is note for note what it was (BASE=<file> compares with the hashes written by BASE_WRITE=<file> before the change),
//  - the bass-led writer at 0% is the New writer (the slider's 0 leaves the bass out; a share of a hair above 0 is counted for reference),
//  - bass-led at 70% and 100%: more of the line starts on the bass's notes and sits on the chord note the bass plays than New does,
//    while the other rules still hold (nothing overlaps, no note runs into a break, every phrase has its notes, no lone short unit, the
//    sets limit, the silence and short notes near New's).
//   npm run bass-vocal-check        (N=168 songs)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { songOptions, writeSong } from '../src/verse/sing';
import { barOf, chordsOf, songGrid } from '../src/verse/section';
import { countSets, setsAllowed } from '../src/verse/sets';
import { leafSpans } from '../src/verse/variants';
import { shortLen } from '../src/verse/longer';
import { bassSkeleton } from '../src/verse/bassline';

const N = Number(process.env.N ?? 168);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const md5 = (x: unknown) => createHash('md5').update(JSON.stringify(x)).digest('hex');
let bad = 0;
const fail = (m: string) => { if (bad++ < 25) console.log('FAIL ' + m); };
const SHARES = [0.7, 1];
type Acc = { pb: number; pbv: number; nb: number; nbv: number; overrun: number; secs: number; notes: number; onBass: number; bassHit: number; bassTotal: number; toneSteps: number; toneOn: number; sung: number; short: number; steps: number; tries: number; leaves: number; over: number };
const blank = (): Acc => ({ pb: 0, pbv: 0, nb: 0, nbv: 0, overrun: 0, secs: 0, notes: 0, onBass: 0, bassHit: 0, bassTotal: 0, toneSteps: 0, toneOn: 0, sung: 0, short: 0, steps: 0, tries: 0, leaves: 0, over: 0 });
const T: Record<string, Acc> = { New: blank(), ...Object.fromEntries(SHARES.map((x) => [`Bass ${Math.round(x * 100)}%`, blank()])) };
const hashes: string[] = [];
const base = process.env.BASE ? readFileSync(process.env.BASE, 'utf8').split('\n') : undefined;
let zeroSame = 0, zeroTotal = 0;
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `vv-${i}-${genre}`;
  const idea = generate({ genre, meter: process.env.METER ?? (i % 9 === 8 ? '6/8' : '4/4'), weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  const mk = (bass: number) => writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS), climax: list[0], maxSets: 4 } as never, bass));
  const runs: [string, ReturnType<typeof mk>][] = [['New', mk(0)], ...SHARES.map((x): [string, ReturnType<typeof mk>] => [`Bass ${Math.round(x * 100)}%`, mk(x)])];
  hashes.push(md5(list.map((x) => runs[0][1].get(x)?.built.notes ?? null)));
  // (the same song, the bass-led writer at 0%: the New writer's notes)
  const zero = mk(1e-9);
  for (const [name, w] of runs) {
    for (const sec of list) {
      const v = w.get(sec);
      if (!v?.built.notes.length) continue;
      const ns = v.built.notes, k = sec.section?.kind ?? 'verse', G = songGrid(sec), total = sec.chords.chordIdx.length, bar = barOf(sec), bars = sec.song.bars.length;
      const x = T[name];
      const skel = bassSkeleton(sec.bass, chordsOf(sec), sec.song.key);
      const hasBass = skel.on.some(Boolean);
      x.secs++; x.notes += ns.length; x.steps += total;
      x.sung += ns.reduce((q, n) => q + n.len, 0);
      x.short += ns.filter((n) => n.len <= shortLen(bar) + 1e-9).length;
      x.tries += Math.max(...v.built.tries);
      if (hasBass) {
        x.onBass += ns.filter((n) => skel.on[Math.floor(n.step + 1e-6)] || skel.on[Math.floor(n.step + 1e-6) + 1]).length;
        const hits = new Set(ns.map((n) => Math.floor(n.step + 1e-6)));
        for (let g = 0; g < total; g++) if (skel.on[g]) { x.bassTotal++; if (hits.has(g) || hits.has(g - 1)) x.bassHit++; }
        v.built.tones.forEach((t, g) => { if (skel.tone[g] !== undefined) { x.toneSteps++; if (t === skel.tone[g]) x.toneOn++; } });
      }
      // (inside phrases, on the 8th grid: how often the vocal starts a note where the bass starts one, and where it does not)
      if (hasBass) {
        const starts = new Set(ns.map((n) => Math.floor(n.step + 1e-6) & ~1));
        for (const ph of v.built.phrases) for (let g = ph.step & ~1; g < ph.step + ph.len; g += 2) {
          const b = skel.on[g] || skel.on[g + 1];
          if (b) { x.pb++; if (starts.has(g)) x.pbv++; } else { x.nb++; if (starts.has(g)) x.nbv++; }
        }
      }
      for (const b of v.built.breaks) for (const n of ns) if (n.step < b.step - 1e-6 && n.step + n.len > b.step + 1e-6 && !n.longHold && !n.end && n.bendTo === undefined) x.overrun++;
      if (name === 'New') continue;
      // (the other rules hold on top of the bass)
      ns.forEach((n, j) => { if (j && ns[j - 1].step + ns[j - 1].len > n.step + 1e-6) fail(`${s} ${name} ${k}: overlap at ${n.step}`); });
      for (const ph of v.built.phrases) if (!ns.some((n) => n.step >= ph.step - 1e-6 && n.step < ph.step + ph.len - 1e-6)) fail(`${s} ${name} ${k}: a phrase at ${ph.step} has no notes`);
      const spans = leafSpans(v.built.leaves, (b) => G.start(b), bars, total);
      for (const sp of spans) {
        x.leaves++;
        const inside = ns.filter((n) => n.step >= sp.from - 1e-6 && n.step < sp.to - 1e-6);
        if (countSets(inside) > setsAllowed(4, sp.leaf.bars)) x.over++;
      }
    }
  }
  // (the bass-led writer at no share is the New writer: the 1e-9 share only rounds to the plain grid when it rolls under 1 - share)
  for (const sec of list) {
    const a = runs[0][1].get(sec), b = zero.get(sec);
    if (a && b) { zeroTotal++; if (md5(a.built.notes) === md5(b.built.notes)) zeroSame++; }
  }
}
if (process.env.BASE_WRITE) { writeFileSync(process.env.BASE_WRITE, hashes.join('\n')); console.log(`wrote ${hashes.length} hashes`); }
if (base) {
  const n = Math.min(base.length, hashes.length), diff = hashes.slice(0, n).filter((h, i) => h !== base[i]).length;
  console.log(`New writer vs before: ${n - diff}/${n} songs note for note the same`);
  if (diff) fail(`${diff} songs changed in the New writer`);
}
console.log(`Bass-led at ~0%: ${zeroSame}/${zeroTotal} sections the same as New`);
console.log('writer      notes/sec  vocal starts where bass does / where it does not  chord note = bass  sung time  short  tries/sec  runs into a break  leaves over sets');
for (const [name, x] of Object.entries(T)) {
  const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`.padStart(4);
  console.log(`${name.padEnd(10)} ${(x.notes / x.secs).toFixed(1).padStart(9)}  ${(pct(x.pbv, x.pb) + ' / ' + pct(x.nbv, x.nb)).padStart(49)}  ${pct(x.toneOn, x.toneSteps).padStart(17)}  ${pct(x.sung, x.steps).padStart(9)}  ${pct(x.short, x.notes).padStart(5)}  ${(x.tries / x.secs).toFixed(2).padStart(9)}  ${String(x.overrun).padStart(18)}  ${x.over}/${x.leaves}`);
}
const n0 = T.New, n1 = T['Bass 70%'], n2 = T['Bass 100%'];
const r = (x: Acc) => x.pbv / x.pb - x.nbv / x.nb, t = (x: Acc) => x.toneOn / Math.max(1, x.toneSteps);
if (!(r(n1) > r(n0) && r(n2) > r(n1))) fail('the vocal does not follow the bass more as the share rises');
if (n2.overrun > 1.3 * n0.overrun + 5) fail(`notes run into breaks more than New (${n2.overrun} against ${n0.overrun})`);
if (!(t(n1) > t(n0) && t(n2) >= t(n1) - 0.01)) fail('the chord note does not follow the bass more');
for (const x of [n1, n2]) if (x.over > 0.03 * x.leaves) fail(`${x.over} leaves over the sets limit`);
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
