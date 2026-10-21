// Mood notes check (docs/VOCAL-EMOTION.md, section 7): do the rules make the verse writer's line differ by mood?
// Every song is written once per mood (the mood is picked, so the same song, the same seed, only the mood differs) with the switches
// asked for, and per mood we print what the line does: the degrees it sings, where phrases end, which way they go, how far it leaps,
// the colour notes, delayed resolutions and surprises. Also the rules that must always hold (no overlaps, notes in range, every
// colour note resolved, every suspension onto a chord note).
//   npm run emotion-check              (all switches on, N=56 songs)
//   ONLY=colour npm run emotion-check  (one switch alone: colour endings suspend contour arousal tension moodmode surprise)
//   OFF=1 npm run emotion-check        (no switches: the line as it was; mood only reaches the personality)
//   N=112 npm run emotion-check
// Success: the rows differ by mood in the ways the research says; with the switches off every row is alike.

import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS, type Mood } from '../src/tension';
import { EMO_IDS, emoSummary, type EmoId } from '../src/verse/emotion';
import { writeSong, songOptions } from '../src/verse/sing';
import { kindOf } from '../src/verse/section';
import { fifth, third } from '../src/verse/verse';

const N = Number(process.env.N ?? 56);
/** The pitch a note ends on (a bend inside it, or a delayed resolution, moves it). */
const fin = (n: { midi: number; bendTo?: number; more?: { to: number }[] }) => (n.more?.length ? n.more[n.more.length - 1].to : n.bendTo ?? n.midi);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const on: EmoId[] = process.env.OFF ? [] : process.env.ONLY ? [process.env.ONLY as EmoId] : [...EMO_IDS];
console.log(`switches on: ${on.join(', ') || 'none'} · ${N} songs × ${MOODS.length} moods`);

interface Acc { deg: number[]; ends: number[]; endN: number; finalTonic: number; finals: number; chFinals: number; chTonic: number; avail: number; rise: number; fall: number; level: number; slope: number; slopeN: number; leaps: number; moves: number; mean: number; meanN: number; sections: number; colour: Record<string, number>; susp: number; surprises: Record<string, number>; notes: number; endRoles: Record<string, number> }
const mk = (): Acc => ({ deg: Array(12).fill(0), ends: Array(12).fill(0), endN: 0, finalTonic: 0, finals: 0, chFinals: 0, chTonic: 0, avail: 0, rise: 0, fall: 0, level: 0, slope: 0, slopeN: 0, leaps: 0, moves: 0, mean: 0, meanN: 0, sections: 0, colour: {}, susp: 0, surprises: {}, notes: 0, endRoles: {} });
const A: Record<string, Acc> = Object.fromEntries(MOODS.map((m) => [m, mk()]));
let broken = 0, unresolved = 0, badSusp = 0;

for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `ec-${i}-${genre}`;
  const idea = generate({ genre, meter: '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  for (const mood of MOODS as Mood[]) {
    const song = writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(on), climax: list[list.length - 2] }));
    const a = A[mood];
    for (const sec of list) {
      const v = song.get(sec);
      if (!v) continue;
      const kind = kindOf(sec), key = sec.song.key; // (a section after a key change has its own key)
      const ns = v.built.notes, chords = sec.chords.timeline;
      // rules that must always hold
      for (let k = 1; k < ns.length; k++) if (ns[k].step < ns[k - 1].step + ns[k - 1].len - 1e-6) broken++;
      if (ns.some((n) => n.midi < v.range.xlo - 12 || n.midi > v.range.xhi + 12)) broken++;
      ns.forEach((n, k) => {
        if (n.colour && (fin(ns[k - 1]) !== ns[k + 1]?.midi || Math.abs(fin(ns[k - 1]) - n.midi) !== 1)) unresolved++;
        if (n.inner?.startsWith('suspension')) {
          const e = [...chords].reverse().find((c) => c.step <= Math.floor(n.step + n.bendAt! + 1));
          const pcs = e ? [0, third(e.chord), fifth(e.chord)].map((x) => (key + e.chord.root + x) % 12) : [];
          if (!pcs.includes(((n.bendTo! % 12) + 12) % 12)) { badSusp++; if (process.env.DEBUG) console.log('suspension', s, mood, kind, JSON.stringify(n), 'chords', JSON.stringify(chords.filter((c) => c.step <= n.step + n.len + 1 && c.step + 64 >= n.step).slice(0, 4).map((c) => [c.step, c.chord]))); }
        }
      });
      if (kind === 'interlude' || kind === 'outro') continue;
      a.sections++;
      const sum = emoSummary(ns);
      for (const c of sum.colour) a.colour[c] = (a.colour[c] ?? 0) + 1;
      for (const x of sum.surprises) a.surprises[x] = (a.surprises[x] ?? 0) + 1;
      a.susp += sum.suspensions;
      for (const n of ns) { a.deg[(((n.midi - key) % 12) + 12) % 12] += n.len; a.mean += n.midi * n.len; a.meanN += n.len; a.notes++; if (n.endRole) a.endRoles[n.endRole] = (a.endRoles[n.endRole] ?? 0) + 1; }
      if (ns.length) { a.finals++; const t = (((fin(ns[ns.length - 1]) - key) % 12) + 12) % 12 === 0; if (t) a.finalTonic++; if (kind === 'chorus') { a.chFinals++; if (t) a.chTonic++; } }
      for (const ph of v.built.phrases) {
        const inside = ns.filter((n) => n.step >= ph.step && n.step < ph.step + ph.len);
        if (inside.length < 2) continue;
        const last = inside[inside.length - 1], first = inside[0];
        a.ends[(((fin(last) - key) % 12) + 12) % 12]++; a.endN++;
        const ce = [...chords].reverse().find((c) => c.step <= Math.floor(last.step + 1e-6));
        if (ce && [0, third(ce.chord), fifth(ce.chord)].some((x) => (ce.chord.root + x) % 12 === 0)) a.avail++;
        const d = fin(last) - first.midi;
        a.slope += d; a.slopeN++;
        if (d >= 2) a.rise++; else if (d <= -2) a.fall++; else a.level++;
        for (let j = 1; j < inside.length; j++) { const dd = Math.abs(inside[j].midi - inside[j - 1].midi); if (dd > 0) { a.moves++; if (dd >= 5) a.leaps++; } }
      }
    }
  }
}

const pc = (x: number, t: number) => (t ? ((100 * x) / t).toFixed(0).padStart(3) : '  -');
const tot = (a: number[]) => a.reduce((x, y) => x + y, 0);
const N_ = (o: Record<string, number>) => Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
console.log('\nNOTE DEGREES (% of sung time)');
console.log('mood           |   1  b2   2  b3   3   4  #4   5  b6   6  b7   7 | mean pitch');
for (const m of MOODS) { const a = A[m]; console.log(m.padEnd(14) + ' | ' + a.deg.map((x) => pc(x, tot(a.deg))).join(' ') + ` | ${(a.mean / a.meanN).toFixed(1)}`); }
console.log('\nPHRASE ENDS (% of phrases), SECTION FINALS on the tonic, ROLES set');
console.log('mood           |   1  b2   2  b3   3   4  #4   5  b6   6  b7   7 | tonic in chord | finals on 1 | chorus finals on 1 | roles');
for (const m of MOODS) { const a = A[m]; console.log(m.padEnd(14) + ' | ' + a.ends.map((x) => pc(x, a.endN)).join(' ') + ` |     ${pc(a.avail, a.endN)}%     |    ${pc(a.finalTonic, a.finals)}%    |        ${pc(a.chTonic, a.chFinals)}%        | ${N_(a.endRoles)}`); }
console.log('\nCONTOUR (first→last of a phrase) and LEAPS (5+ semitones, % of moves)');
for (const m of MOODS) { const a = A[m], t = a.rise + a.fall + a.level; console.log(m.padEnd(14) + ` | rise ${pc(a.rise, t)}  fall ${pc(a.fall, t)}  level ${pc(a.level, t)} | slope ${(a.slope / Math.max(1, a.slopeN)).toFixed(2)} st | leaps ${pc(a.leaps, a.moves)}%`); }
console.log('\nCOLOUR NOTES, DELAYED RESOLUTIONS and SURPRISES (per 10 sections)');
for (const m of MOODS) { const a = A[m], per = (x: number) => ((10 * x) / Math.max(1, a.sections)).toFixed(1); console.log(m.padEnd(14) + ` | colour ${per(tot(Object.values(a.colour)))} (${N_(a.colour)}) | suspensions ${per(a.susp)} | surprises ${per(tot(Object.values(a.surprises)))} (${N_(a.surprises)})`); }
console.log(`\nrules that must hold: overlaps / out of range ${broken}, colour notes not resolved ${unresolved}, suspensions not onto a chord note ${badSusp}`);
if (broken || unresolved || badSusp) process.exitCode = 1;

