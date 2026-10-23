// Intervals check (docs/INTERVALS.md): do the moods differ in which intervals the vocal sings?
// Every song is written once per mood (same song, same seed, only the mood differs) and per mood we print how the line moves from
// note to note inside its phrases: the average size of a move (repeats not counted; about half of all moves are repeats), repeats, steps and leaps, which way it goes, warm (3 4 8 9) against rough (1 6 11)
// intervals, and how often a leap is followed by a step back the other way (gap-fill).
//   npm run interval-check              (Intervals on alone: every other mood switch off; N=56 songs)
//   SETUP=off npm run interval-check    (every switch but Intervals: the line without it)
//   SETUP=none npm run interval-check   (no switch at all)
//   SETUP=all npm run interval-check    (every switch, Intervals too)
//   N=112 npm run interval-check
// Success: the moods separate as the research says (targets at the end), with steps and repeats at least half of all moves.

import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS, type Mood } from '../src/tension';
import { EMO_IDS, type EmoId } from '../src/verse/emotion';
import { writeSong, songOptions } from '../src/verse/sing';
import { kindOf } from '../src/verse/section';

const N = Number(process.env.N ?? 56);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const IV = 'intervals' as EmoId;
const SETUP = process.env.SETUP ?? 'alone';
const ids = EMO_IDS as readonly EmoId[];
const on: EmoId[] = SETUP === 'off' ? ids.filter((x) => x !== IV) : SETUP === 'none' ? [] : SETUP === 'all' ? [...ids] : ids.includes(IV) ? [IV] : [];
console.log(`setup ${SETUP}: switches on: ${on.join(', ') || 'none'} · ${N} songs × ${MOODS.length} moods`);

interface Acc { hist: number[]; moves: number; sum: number; up: number; down: number; leaps: number; fillable: number; filled: number; byKind: Record<string, [number, number]> }
const mk = (): Acc => ({ hist: Array(13).fill(0), moves: 0, sum: 0, up: 0, down: 0, leaps: 0, fillable: 0, filled: 0, byKind: {} });
const A: Record<string, Acc> = Object.fromEntries(MOODS.map((m) => [m, mk()]));
let broken = 0;

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
      const kind = kindOf(sec), ns = v.built.notes;
      for (let k = 1; k < ns.length; k++) if (ns[k].step < ns[k - 1].step + ns[k - 1].len - 1e-6) broken++;
      if (ns.some((n) => n.midi < v.range.xlo - 12 || n.midi > v.range.xhi + 12)) broken++;
      if (kind === 'interlude' || kind === 'outro') continue;
      for (const ph of v.built.phrases) {
        const inside = ns.filter((n) => n.step >= ph.step - 1e-6 && n.step < ph.step + ph.len - 1e-6);
        const d = inside.slice(1).map((n, j) => n.midi - inside[j].midi);
        d.forEach((x, j) => {
          const m = Math.abs(x);
          a.hist[Math.min(12, m)]++; a.moves++; a.sum += m;
          if (m) { const bk = (a.byKind[kind] ??= [0, 0]); bk[0] += m; bk[1]++; }
          if (x > 0) a.up++; else if (x < 0) a.down++;
          if (m >= 5) { a.leaps++; if (j + 1 < d.length) { a.fillable++; if (d[j + 1] * x < 0 && Math.abs(d[j + 1]) <= 2) a.filled++; } }
        });
      }
    }
  }
}

const pc = (x: number, t: number) => (t ? ((100 * x) / t).toFixed(0).padStart(3) : '  -');
const sum = (a: Acc, f: (m: number) => boolean) => a.hist.reduce((t, c, m) => t + (f(m) ? c : 0), 0);
const stat = (a: Acc) => {
  const moving = a.moves - a.hist[0];
  return {
    size: a.sum / Math.max(1, moving), rep: a.hist[0] / Math.max(1, a.moves), steps: sum(a, (m) => m >= 1 && m <= 2) / Math.max(1, a.moves),
    leaps: a.leaps / Math.max(1, a.moves), up: a.up / Math.max(1, a.up + a.down), warm: sum(a, (m) => [3, 4, 8, 9].includes(m)) / Math.max(1, moving),
    rough: sum(a, (m) => [1, 6, 11].includes(m)) / Math.max(1, moving), fill: a.filled / Math.max(1, a.fillable), small: (a.hist[0] + sum(a, (m) => m >= 1 && m <= 2)) / Math.max(1, a.moves),
  };
};
console.log('\nMOVES inside phrases (% of moves; up = share of moves that go up; warm / rough = share of the moves that are not repeats)');
console.log('mood           | size | repeat steps leaps |  up | warm rough | gap-fill');
const S: Record<string, ReturnType<typeof stat>> = {};
for (const m of MOODS) { const s = (S[m] = stat(A[m])); console.log(m.padEnd(14) + ` | ${s.size.toFixed(2)} |  ${pc(s.rep, 1)}%   ${pc(s.steps, 1)}%  ${pc(s.leaps, 1)}% | ${pc(s.up, 1)}% |  ${pc(s.warm, 1)}%  ${pc(s.rough, 1)}% |  ${pc(s.fill, 1)}%`); }
console.log('\nINTERVAL SIZES (% of moves, 0 = repeat, 12 = octave or more)');
console.log('mood           | ' + Array.from({ length: 13 }, (_, i) => String(i).padStart(3)).join(' '));
for (const m of MOODS) console.log(m.padEnd(14) + ' | ' + A[m].hist.map((x) => pc(x, A[m].moves)).join(' '));
console.log('\nAVERAGE SIZE by section kind');
for (const m of MOODS) console.log(m.padEnd(14) + ' | ' + Object.entries(A[m].byKind).map(([k, [t, c]]) => `${k} ${(t / Math.max(1, c)).toFixed(2)}`).join('  '));

// targets (docs/INTERVALS.md, section 6). Most moves are repeats and steps whatever the mood (that is the rhythm the writer gives
// every line), so the targets are the ways the moods differ, not absolute sizes.
const fails: string[] = [];
const want = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const mean = (ms: string[], f: (s: ReturnType<typeof stat>) => number) => ms.reduce((t, m) => t + f(S[m]), 0) / ms.length;
const calm = ['melancholic', 'dark'], big = ['triumphant', 'angry'];
want(mean(big, (s) => s.size) >= mean(calm, (s) => s.size) + 0.3, 'triumphant and angry move at least 0.3 semitones further per move than melancholic and dark');
want(mean(big, (s) => s.leaps) >= mean(calm, (s) => s.leaps) * 1.4, 'triumphant and angry leap at least 1.4x as often as melancholic and dark');
want(S.melancholic.up <= 0.5 && S.dark.up <= 0.5, 'melancholic and dark: at least half of the moves down');
want(S.triumphant.up >= 0.55 && S.happy.up >= 0.55, 'triumphant and happy: 55%+ of the moves up');
want(S.tense.rough >= 1.4 * S.happy.rough && S.dark.rough >= 1.4 * S.happy.rough, "tense and dark: rough share at least 1.4x happy's");
want(S.tense.rep >= S.dreamy.rep + 0.08 && S.angry.rep >= S.dreamy.rep + 0.08, 'tense and angry repeat more (dreamy least)');
for (const m of MOODS) want(S[m].small >= 0.5, `${m}: steps and repeats at least half of all moves`);
want(broken === 0, 'no overlaps / notes out of range');
if (SETUP !== 'alone') console.log('\n(the targets are for Intervals on its own; with the other mood notes on or off they are only a guide)');
console.log(`\ntargets: ${fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'all met'}${broken ? ` · overlaps / out of range ${broken}` : ''}`);
if ((SETUP === 'alone' || process.env.STRICT) && fails.length) process.exitCode = 1;
else if (broken) process.exitCode = 1;
