// Patterns for the Guide line (docs/PATTERNS.md): which of the skeleton library's timings and shapes the Guide line
// already sings on its own (Patterns off: plain, and with its card's switches on), against how many real songs
// sing them. Writes src/realism/skeleton-lean.json: per pattern, how much more often to pick it (one real songs
// sing more than the Guide line picked more, its own plain ones less), as scripts/study/patterns-app.ts does for
// the vocal writers. Counts only. Run: npm run skeleton-lean (N songs per genre).
import fs from 'node:fs';
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';
import type { QNote } from '../../src/realism/patterns';
import { SKEL_SHAPES, TIMINGS, skeleton, skeletonShapes, timingKeys } from '../../src/realism/skeleton';
import { chordPc } from '../../src/theory';
import { chordTones } from '../../src/parts/guitar2';
import { sungSong, writeLine } from '../../src/guide/real';
import type { GuideIdeas } from '../../src/guide/line';
import data from '../../src/realism/skeleton.json';

const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
/** The Guide line as it's sung: plain, and with its card's switches on. */
const GUIDES: GuideIdeas[] = [{}, { motif: true, spine: true, speech: true, qa: true, breath: true, shift: true, leadIn: true }];
const N = Number(process.env.N ?? 8);
const POW = 0.6, MAX = 4, MIN = 0.2;

const tSet = new Set(TIMINGS.map((r) => r[0])), sSet = new Set(SKEL_SHAPES.map((r) => r[0]));
const app = { t: new Map<string, number>(), s: new Map<string, number>(), songs: 0 };
const seeds = (s: string) => ({ song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });

for (const g of GENRES) for (let i = 0; i < N; i++) {
  const s = `lean-${g}-${i}`;
  const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], seeds(s));
  const tr = buildTrack(idea, defaultTrackOptions(idea));
  if (tr.sections[0].song.bars.some((b) => b.len !== 16)) continue;
  const roots: number[] = [], band: Set<number>[] = [];
  for (const sec of tr.sections) for (let st = 0; st < sec.song.total; st++) { const ch = sec.chords.timeline[sec.chords.chordIdx[st]].chord; roots.push(chordPc(sec.song.key, ch)); band.push(new Set(chordTones(sec.song.key, ch))); }
  for (const ideas of GUIDES) {
    const sg = sungSong(tr.sections, writeLine(tr.sections, tr.mood, 'in', 0, 'some', null, ideas, null, null), 0);
    const sk = skeleton(sg.notes.map((n) => ({ q: Math.round(n.s * 4), e: n.e * 4, p: n.p })));
    const rel = (n: QNote) => { const iv = ((n.p - (roots[n.q] ?? 0)) % 12 + 12) % 12; return iv === 0 ? 'R' : iv === 3 || iv === 4 ? '3' : iv === 7 ? '5' : band[n.q]?.has(n.p % 12) ? 'c' : 'n'; };
    app.songs++;
    for (const k of new Set(timingKeys(sk))) if (tSet.has(k)) app.t.set(k, (app.t.get(k) ?? 0) + 1);
    for (const k of new Set(skeletonShapes(sk, sg.tonic, sg.minor, rel))) if (sSet.has(k)) app.s.set(k, (app.s.get(k) ?? 0) + 1);
  }
}
const realSongs = Number(/(\d+) on-grid/.exec(data.source)?.[1] ?? 1159);
const lean = (rows: typeof TIMINGS, mine: Map<string, number>) => {
  const out: Record<string, number> = {};
  for (const [k, n] of rows) {
    const real = n / realSongs, ours = ((mine.get(k) ?? 0) + 0.5) / (app.songs + 1);
    const x = Math.round(100 * Math.max(MIN, Math.min(MAX, (real / ours) ** POW))) / 100;
    if (x !== 1) out[k] = x;
  }
  return out;
};
const L = { timing: lean(TIMINGS, app.t), shape: lean(SKEL_SHAPES, app.s) };
fs.writeFileSync('src/realism/skeleton-lean.json', JSON.stringify({ source: `The Guide line's own skeleton (Patterns off: ${app.songs} lines, plain and with its switches on) against the skeleton library's real song counts: a pattern's pick leans by (real share / the line's share)^${POW}, ${MIN}-${MAX} (docs/PATTERNS.md).`, ...L }));
const top = (o: Record<string, number>, d: 1 | -1) => Object.entries(o).sort((a, b) => d * (b[1] - a[1])).slice(0, 10).map(([k, v]) => `${k} x${v}`).join('  ');
console.log({ lines: app.songs, timingsSung: app.t.size, shapesSung: app.s.size });
for (const [k, o] of Object.entries(L)) { console.log(`${k} up:  `, top(o, 1)); console.log(`${k} down:`, top(o, -1)); }
