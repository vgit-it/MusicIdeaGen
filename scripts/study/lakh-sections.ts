// Verse vs chorus (docs/STUDY-LAKH.md option 3, docs/ARC.md): in the Lakh songs with words, a line of words
// sung again (2+ times, in a run of 2+ such lines) is the chorus; a line sung once, the verse. Measures how the
// chorus's melody differs from the verse's in the same song (height, top, pace, note lengths, range, line
// length, offbeats), where the song's top note falls, and how choruses change through the song. Numbers only
// (the words are only compared, never kept). Writes src/realism/arc.json. Run: npm run realism-arc
import fs from 'node:fs';
import { type LakhSong, type Line, type N, forEachSong, linesOf } from './lakh-songs';

const root = process.argv[2] ?? 'experiments/MidiCollection';
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const mod = (n: number, m: number) => ((n % m) + m) % m;
const med = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (xs: number[], q: number) => { const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };

interface Measure { mean: number; top: number; low: number; pace: number; len: number; long: number; span: number; lineBeats: number; off: number; sylPerSec?: number }
/** A set of lines' notes, measured. */
function measure(ls: Line[], mel: N[], next: (l: Line) => number): Measure | null {
  const ns: N[] = [], spans: number[] = [], lb: number[] = [];
  let beats = 0;
  for (const l of ls) {
    const end = next(l);
    const x = mel.filter((n) => n.s >= l.t0 - 0.26 && n.s < end - 0.26);
    if (x.length < 2) continue;
    ns.push(...x);
    const ps = x.map((n) => n.p);
    spans.push(Math.max(...ps) - Math.min(...ps));
    const d = x[x.length - 1].e - x[0].s;
    lb.push(d); beats += d;
  }
  if (ns.length < 12) return null;
  const ps = ns.map((n) => n.p);
  return {
    mean: mean(ps), top: pct(ps, 0.9), low: pct(ps, 0.1), pace: ns.length / Math.max(1, beats),
    len: mean(ns.map((n) => n.e - n.s)), long: ns.filter((n) => n.e - n.s >= 1).length / ns.length,
    span: mean(spans), lineBeats: mean(lb), off: ns.filter((n) => Math.abs(n.s * 2 - Math.round(n.s * 2)) > 0.1 || mod(Math.round(n.s * 2), 2) === 1).length / ns.length,
  };
}

const D: Record<string, Record<string, number[]>> = {};
const add = (g: string, k: string, v: number) => { for (const x of [g, 'all']) ((D[x] ??= {})[k] ??= []).push(v); };
let withWords = 0, used = 0;
forEachSong(root, (S: LakhSong) => {
  if (!S.words) return;
  withWords++;
  const L = linesOf(S.words);
  if (L.length < 8) return;
  const count = new Map<string, number>();
  for (const l of L) count.set(l.key, (count.get(l.key) ?? 0) + 1);
  const rep = L.map((l) => (count.get(l.key) ?? 0) >= 2);
  // (a chorus line: sung again, next to another sung again)
  const RUN = Number(process.env.RUN ?? 2);
  const ch = rep.map((r, i) => { if (!r) return false; let a = i, b = i; while (rep[a - 1]) a--; while (rep[b + 1]) b++; return b - a + 1 >= RUN; });
  const vs = rep.map((r) => !r);
  const C = L.filter((_, i) => ch[i]), V = L.filter((_, i) => vs[i]);
  if (C.length < 3 || V.length < 3) return;
  const next = (l: Line) => { const i = L.indexOf(l); return i + 1 < L.length ? L[i + 1].t0 : l.t1 + 4; };
  const c = measure(C, S.mel, next), v = measure(V, S.mel, next);
  if (!c || !v) return;
  used++;
  const g = S.genre ?? 'other';
  add(g, 'height', c.mean - v.mean); add(g, 'top', c.top - v.top); add(g, 'low', c.low - v.low);
  add(g, 'pace', c.pace / v.pace); add(g, 'len', c.len / v.len); add(g, 'long', c.long - v.long);
  add(g, 'span', c.span - v.span); add(g, 'lineBeats', c.lineBeats / v.lineBeats); add(g, 'off', c.off - v.off);
  add(g, 'higher', c.mean > v.mean + 0.5 ? 1 : 0); add(g, 'busier', c.pace > v.pace * 1.05 ? 1 : 0); add(g, 'sparser', c.pace < v.pace * 0.95 ? 1 : 0);
  // syllables a second (a beat at 120: half a second; only as a ratio, tempo cancels out)
  const sylRate = (ls: Line[]) => ls.reduce((a, l) => a + l.syl, 0) / Math.max(1, ls.reduce((a, l) => a + Math.max(1, l.t1 - l.t0 + 0.5), 0));
  add(g, 'sylRate', sylRate(C) / Math.max(0.01, sylRate(V)));
  // where the song's top note falls: in a chorus line (and the last chorus block), or a verse
  const top = S.mel.reduce((a, b) => (b.p > a.p ? b : a));
  const inL = L.findIndex((l) => top.s >= l.t0 - 0.26 && top.s < next(l) - 0.26);
  add(g, 'topInChorus', inL >= 0 && ch[inL] ? 1 : 0);
  // chorus blocks (runs of chorus lines): the first against the last
  const blocks: Line[][] = [];
  L.forEach((l, i) => { if (!ch[i]) return; if (i > 0 && ch[i - 1]) blocks[blocks.length - 1].push(l); else blocks.push([l]); });
  if (blocks.length >= 3) {
    const f = measure(blocks[0], S.mel, next), la = measure(blocks[blocks.length - 1], S.mel, next);
    if (f && la) { add(g, 'lastVsFirstHeight', la.mean - f.mean); add(g, 'lastVsFirstTop', la.top - f.top); add(g, 'lastVsFirstPace', la.pace / f.pace); }
    const topBlock = blocks.findIndex((b) => b.some((l) => top.s >= l.t0 - 0.26 && top.s < next(l) - 0.26));
    if (topBlock >= 0) add(g, 'topInLastChorus', topBlock === blocks.length - 1 ? 1 : 0);
    add(g, 'choruses', blocks.length);
  }
});

const KEYS = ['height', 'top', 'low', 'pace', 'sylRate', 'len', 'long', 'span', 'lineBeats', 'off', 'higher', 'busier', 'sparser', 'topInChorus', 'topInLastChorus', 'lastVsFirstHeight', 'lastVsFirstTop', 'lastVsFirstPace', 'choruses'];
const SHARE = new Set(['higher', 'busier', 'sparser', 'topInChorus', 'topInLastChorus']);
const out: Record<string, Record<string, number> & { songs: number }> = {};
console.log({ withWords, used });
for (const g of ['all', ...GENRES, 'other']) {
  const d = D[g]; if (!d) continue;
  const row: Record<string, number> = { songs: d.height.length };
  for (const k of KEYS) if (d[k]) row[k] = Math.round(1000 * (SHARE.has(k) ? mean(d[k]) : med(d[k]))) / 1000;
  // (the spread: a quarter of songs below p25, a quarter above p75)
  for (const k of ['height', 'top', 'pace', 'len']) if (d[k]) { row[`${k}P25`] = Math.round(1000 * pct(d[k], 0.25)) / 1000; row[`${k}P75`] = Math.round(1000 * pct(d[k], 0.75)) / 1000; }
  out[g] = row as Record<string, number> & { songs: number };
  console.log(g.padEnd(9), JSON.stringify(row));
}
fs.writeFileSync('src/realism/arc.json', JSON.stringify({ source: 'Lakh MIDI Dataset (Colin Raffel, CC-BY 4.0): songs with words; chorus lines (sung again) against verse lines (sung once) in the same song, medians of the differences (height, top, low, span: semitones; pace, len, lineBeats, sylRate: chorus / verse; long, off: share difference), shares of songs (higher, busier, sparser, topInChorus, topInLastChorus). Numbers only (docs/ARC.md).', genres: out }));
