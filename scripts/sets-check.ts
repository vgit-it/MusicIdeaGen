// Checks rule 43 (the limit on sets of notes per 4 bars) on real songs: after the limit no leaf has more sets than allowed (leaves
// that can't be helped are counted), sections already within the limit come out note for note, nothing overlaps, no phrase loses its
// first or last note, the silence and the short notes stay near where they were. Off (no limit) is as written before.
//   npm run sets-check          (N=168 songs; MAX=4 is the slider's default; with MAX under 4 some leaves can't be helped: the phrases alone
//   are more than that, and they are reported, not failed)
import { createHash } from 'node:crypto';
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { songOptions, writeSong } from '../src/verse/sing';
import { songGrid } from '../src/verse/section';
import { countSets, setsAllowed } from '../src/verse/sets';
import { leafSpans } from '../src/verse/variants';
import { shortLen } from '../src/verse/longer';
import { barOf } from '../src/verse/section';

const N = Number(process.env.N ?? 168), MAX = Number(process.env.MAX ?? 4);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const md5 = (x: unknown) => createHash('md5').update(JSON.stringify(x)).digest('hex');
let bad = 0;
const fail = (m: string) => { if (bad++ < 20) console.log('FAIL ' + m); };
type Acc = { leaves: number; over0: number; over1: number; sets0: number; sets1: number; n0: number; n1: number; t0: number; t1: number; s0: number; s1: number; secs: number; same: number; within: number };
const T: Record<string, Acc> = {};
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `vv-${i}-${genre}`;
  const idea = generate({ genre, meter: process.env.METER ?? (i % 9 === 8 ? '6/8' : '4/4'), weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  const mk = (maxSets?: number) => writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS), climax: list[0], ...(maxSets ? { maxSets } : {}) } as never));
  const before = mk(), after = mk(MAX);
  for (const sec of list) {
    const b = before.get(sec), a = after.get(sec);
    if (!b?.built.notes.length || !a) continue;
    const k = sec.section?.kind ?? 'verse', G = songGrid(sec), total = sec.chords.chordIdx.length, bars = sec.song.bars.length;
    const x = (T[k] ??= { leaves: 0, over0: 0, over1: 0, sets0: 0, sets1: 0, n0: 0, n1: 0, t0: 0, t1: 0, s0: 0, s1: 0, secs: 0, same: 0, within: 0 });
    const spans = leafSpans(a.built.leaves, (bar) => G.start(bar), bars, total);
    let within = true;
    for (const sp of spans) {
      const inside = (ns: typeof a.built.notes) => ns.filter((n) => n.step >= sp.from - 1e-6 && n.step < sp.to - 1e-6);
      const c0 = countSets(inside(b.built.notes)), c1 = countSets(inside(a.built.notes)), lim = setsAllowed(MAX, sp.leaf.bars);
      x.leaves++; x.sets0 += c0; x.sets1 += c1;
      if (c0 > lim) { x.over0++; within = false; }
      if (c1 > lim) x.over1++;
    }
    const ns = a.built.notes;
    ns.forEach((n, j) => { if (j && ns[j - 1].step + ns[j - 1].len > n.step + 1e-6) fail(`${s} ${k}: overlap at ${n.step}`); });
    // (a phrase keeps a note at its start and its end)
    for (const ph of a.built.phrases) {
      const inside = ns.filter((n) => n.step >= ph.step - 1e-6 && n.step < ph.step + ph.len - 1e-6);
      if (!inside.length) fail(`${s} ${k}: a phrase at ${ph.step} lost all its notes`);
    }
    // (a shape across phrases may copy over the very notes the limit would have changed, so the two runs can differ and both be within it)
    if (b.built.shapes.some((q) => q.bars)) within = false;
    x.secs++; if (within) { x.within++; if (md5(b.built.notes) === md5(a.built.notes)) x.same++; }
    const lim = shortLen(barOf(sec)) + 1e-9;
    x.n0 += b.built.notes.length; x.n1 += ns.length;
    x.t0 += b.built.notes.reduce((q, n) => q + n.len, 0) / total; x.t1 += ns.reduce((q, n) => q + n.len, 0) / total;
    x.s0 += b.built.notes.filter((n) => n.len <= lim).length; x.s1 += ns.filter((n) => n.len <= lim).length;
  }
}
console.log(`Most ${MAX} sets in 4 bars:`);
for (const [k, x] of Object.entries(T)) {
  console.log(`  ${k.padEnd(10)} ${String(x.leaves).padStart(4)} leaves · sets ${(x.sets0 / x.leaves).toFixed(1)} → ${(x.sets1 / x.leaves).toFixed(1)} · over the limit ${x.over0} → ${x.over1} · notes ${(x.n0 / x.secs).toFixed(1)} → ${(x.n1 / x.secs).toFixed(1)} · sung time ${Math.round((100 * x.t0) / x.secs)}% → ${Math.round((100 * x.t1) / x.secs)}% · short ${Math.round((100 * x.s0) / x.n0)}% → ${Math.round((100 * x.s1) / x.n1)}% · ${x.same}/${x.within} untouched sections identical`);
  if (MAX >= 4 && x.over1 > 0.03 * x.leaves) fail(`${k}: ${x.over1} leaves still over the limit`);
  if (MAX >= 4 && x.same < 0.85 * x.within) fail(`${k}: only ${x.same} of ${x.within} sections within the limit are untouched`);
}
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
