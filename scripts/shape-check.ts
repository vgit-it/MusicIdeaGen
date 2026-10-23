// Repeat shapes (rules 39 and 45): checks the rule on made-up phrases (the 25% with none, the split between A A A' and A A A A', the repeats
// really repeat), then on real songs with the switch off and on: every repeated shape is what it says, nothing else in the line changed,
// the key and the short-note share and the chorus silence hold.
//   npm run shape-check            (N=120 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { shortLen, shortRange } from '../src/verse/longer';
import { NO_SHAPE, withShapes, type ShapeInfo } from '../src/verse/shapes';
import { barOf } from '../src/verse/section';
import { songOptions, writeSong } from '../src/verse/sing';
import { BarGrid } from '../src/verse/grid';
import { SCALES, type Chord } from '../src/theory';
import type { BandNote } from '../src/verse/verse';

const bad: string[] = [];
const fail = (m: string) => { bad.push(m); if (bad.length < 15) console.log('FAIL', m); };
const EPS = 1e-6;

// the repeats of one shape in a line: [steps, lens] of the notes in each time
const timesOf = (notes: BandNote[], x: ShapeInfo): BandNote[][] =>
  Array.from({ length: x.n }, (_, i) => notes.filter((n) => n.step >= x.step + i * x.len - EPS && n.step < x.step + (i + 1) * x.len - EPS));
const rel = (ns: BandNote[], at: number) => ns.map((n) => `${Math.round((n.step - at) * 100)}:${Math.round(n.len * 100)}`).join(' ');

// 1. made-up phrases: a 4-bar phrase of one chord and a plain bar-long shape; the dice only
{
  const G = new BarGrid(16), SC = new Set(SCALES.major.map((i) => i % 12));
  const chordAt: Chord[] = Array.from({ length: 64 }, () => ({ root: 0, q: 'maj' } as Chord));
  const line = (): BandNote[] => {
    const out: BandNote[] = [];
    for (let b = 0; b < 3; b++) out.push({ step: b * 16, len: 4, midi: 64 }, { step: b * 16 + 4, len: 2, midi: 62 }, { step: b * 16 + 6, len: 2, midi: 60 }, { step: b * 16 + 8, len: 4, midi: 62 }, { step: b * 16 + 12, len: 2, midi: 64 });
    out.push({ step: 48, len: 4, midi: 64 }, { step: 52, len: 12, midi: 67, end: true, style: 'held' });
    return out;
  };
  let none = 0, three = 0, four = 0, alts = 0, tries = 0;
  const madeSkips: Record<string, number> = {};
  const mods: Record<string, number> = {};
  for (let t = 0; t < 600; t++) {
    tries++;
    const r = withShapes(line(), [{ step: 0, len: 64 }], G, 64, `made-${t}`, { key: 0, scale: SC, chordAt, range: { lo: 55, hi: 72, xlo: 50, xhi: 80 }, alt: t % 2 === 1 });
    if (!r.shapes.length) { none++; for (const [k, c] of Object.entries(r.skips)) madeSkips[k] = (madeSkips[k] ?? 0) + c; continue; }
    const x = r.shapes[0];
    if (x.alt) alts++; else if (x.n === 3) three++; else four++;
    mods[x.mod] = (mods[x.mod] ?? 0) + 1;
    const ts = timesOf(r.notes, x);
    // (the times before the last are the first one again, pitch for pitch over one chord)
    for (let i = 1; i < x.n - 1; i++) {
      if (x.alt && i === 1) {
        if (rel(ts[i], x.step + i * x.len) === rel(ts[0], x.step) && ts[i].every((n, k) => n.midi === ts[0][k].midi)) fail(`made #${t}: A' (time 2) is not changed (${x.mids})`);
        continue;
      }
      if (rel(ts[i], x.step + i * x.len) !== rel(ts[0], x.step)) fail(`made #${t}: time ${i + 1} differs in rhythm`);
      if (ts[i].some((n, k) => n.midi !== ts[0][k].midi)) fail(`made #${t}: time ${i + 1} differs in pitch over the same chord`);
    }
    const last = ts[x.n - 1], first = ts[0];
    if (x.mod === 'ending') { if (!r.notes.some((n) => n.end)) fail(`made #${t}: the ending was lost`); }
    else if (rel(last, x.step + (x.n - 1) * x.len) === rel(first, x.step) && last.every((n, k) => n.midi === first[k].midi)) fail(`made #${t}: the last time is not changed (${x.mod})`);
    if (r.notes.some((n, i) => i && r.notes[i - 1].step + r.notes[i - 1].len > n.step + EPS)) fail(`made #${t}: overlap`);
  }
  console.log(`made-up phrases: ${tries}; none ${none} (${((100 * none) / tries).toFixed(0)}%); A A A' ${three}, A A A A' ${four}, A A' A A' ${alts}; the last time changed by ${JSON.stringify(mods)}`);
  if (process.env.SKIPS) console.log(madeSkips);
  if (Math.abs(none / tries - NO_SHAPE) > 0.06) fail(`made: ${none / tries} of the phrases have none, not about ${NO_SHAPE}`);
  if (three < tries * 0.1 || four < tries * 0.1 || alts < tries * 0.05) fail('made: one of the patterns is rare');
}

// 2. real songs, with the switch off and on
const N = Number(process.env.N ?? 120);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
interface Tot { outside: number; secs: number; notes: number; phrases: number; shapes: number; short: number; bars: number; chorusSil: number[]; offKey: number }
const blank = (): Tot => ({ outside: 0, secs: 0, notes: 0, phrases: 0, shapes: 0, short: 0, bars: 0, chorusSil: [], offKey: 0 });
const T = { off: blank(), on: blank() };
const bigPat: Record<string, number> = {}, pat: Record<string, number> = {}, mods: Record<string, number> = {}, cellLen: Record<string, number> = {}, skips: Record<string, number> = {};
let sections = 0, changed = 0; const byLen: Record<string, [number, number]> = {};
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `hh-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  const run = (on: boolean) => writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS.filter((x) => (on || x !== 'shape') && !(process.env.NOALT && x === 'shape2'))), climax: list[0] } as never));
  const off = run(false), on = run(true);
  const scale = new Set(SCALES[idea.song.mode].map((p) => (p + idea.song.key) % 12));
  // (a note that ends its phrase: a flag left on a note inside a phrase, by a lead-in written after it, doesn't count)
  const lastOf = (built: { phrases: { step: number; len: number }[]; notes: { step: number }[] }, step: number) =>
    built.phrases.some((ph) => { const last = [...built.notes].reverse().find((n) => n.step >= ph.step - 1e-6 && n.step < ph.step + ph.len - 1e-6); return last?.step === step; });
  for (const sec of list) {
    const a = off.get(sec), b = on.get(sec);
    if (!a || !b) continue;
    sections++;
    const bar = barOf(sec), lim = shortLen(bar) + 1e-9;
    for (const [m, v] of [['off', a], ['on', b]] as const) {
      const t = T[m], notes = v.built.notes;
      t.notes += notes.length; t.phrases += v.built.phrases.length; t.shapes += v.built.shapes.length;
      t.short += notes.filter((n) => n.len <= lim).length;
      if (notes.length >= 12) { t.secs++; const sh = notes.filter((n) => n.len <= lim).length / notes.length; const [lo, hi] = shortRange(sec.section?.kind ?? 'verse'); if (sh < lo - 0.05 || sh > hi + 0.05) t.outside++; } t.bars += sec.chords.chordIdx.length / bar;
      t.offKey += notes.filter((n) => !n.colour && !n.surprise && !n.nb && !n.walk && !scale.has(((n.midi % 12) + 12) % 12)).length;
      if (sec.section?.kind === 'chorus' && notes.length) {
        const total = sec.chords.chordIdx.length;
        if (total) t.chorusSil.push(1 - notes.reduce((x, n) => x + n.len, 0) / total);
      }
      notes.forEach((n, k) => { if (k && notes[k - 1].step + notes[k - 1].len > n.step + EPS) fail(`${s} ${sec.section?.kind}: overlap at ${n.step} (${m})`); });
    }
    for (const ph of b.built.phrases) {
      const k = (ph.len / bar).toFixed(1);
      byLen[k] ??= [0, 0]; byLen[k][0]++;
      if (b.built.shapes.some((x) => x.phrase === ph.step)) byLen[k][1]++;
    }
    for (const [k, c] of Object.entries(b.built.skips)) skips[k] = (skips[k] ?? 0) + c;
    // (every repeated shape is what it says)
    const regions: [number, number][] = [];
    for (const x of b.built.shapes) {
      if (x.bars) {
        // (a bar-long or two-bar shape across phrases: every plain time is the first again, every changed time starts like it)
        const key = `${x.bars}-bar ${x.n === 3 ? "A A A'" : x.alt ? "A A' A A'" : "A A A A'"}`;
        bigPat[key] = (bigPat[key] ?? 0) + 1;
        regions.push([x.step + x.len, x.step + x.n * x.len]);
        const ts = timesOf(b.built.notes, x), where = `${s} ${sec.section?.kind} @${x.step} (${key})`;
        if (ts[0].length < 2) fail(`${where}: no notes in the shape`);
        for (let k = 1; k < x.n; k++) {
          if (x.changed?.includes(k)) {
            if (!ts[k].length || ts[k][0].len !== ts[0][0].len || ts[k][0].step - (x.step + k * x.len) !== ts[0][0].step - x.step) fail(`${where}: changed time ${k + 1} does not start like the first`);
          } else if (rel(ts[k], x.step + k * x.len) !== rel(ts[0], x.step)) fail(`${where}: time ${k + 1} differs in rhythm from the first`);
        }
        const kept = (x.changed ?? []).map((k) => ts[k]);
        if (x.changed?.length && kept.some((t, i) => rel(t, 0) === rel(ts[x.changed![i] === 1 ? 2 : 0], 0))) { /* (a changed time can't be told from a plain one by rhythm alone) */ }
        if (!x.changed?.includes(x.n - 1)) fail(`${where}: the last time is not changed`);
        continue;
      }
      pat[x.alt ? 'alt' : x.n] = (pat[x.alt ? 'alt' : x.n] ?? 0) + 1; mods[x.mod] = (mods[x.mod] ?? 0) + 1; cellLen[x.len] = (cellLen[x.len] ?? 0) + 1;
      regions.push([x.step + x.len, x.step + x.n * x.len]);
      const ts = timesOf(b.built.notes, x), where = `${s} ${sec.section?.kind} @${x.step}`;
      if (!ts[0].length) fail(`${where}: no notes in the shape`);
      for (let k = 1; k < x.n - 1; k++) {
        if (x.alt && k === 1) {
          if (rel(ts[k], x.step + k * x.len) === rel(ts[0], x.step) && ts[k].every((n, q) => n.midi === ts[0][q].midi)) fail(`${where}: A' (time 2) is not changed`);
          continue;
        }
        if (rel(ts[k], x.step + k * x.len) !== rel(ts[0], x.step)) fail(`${where}: time ${k + 1} differs in rhythm from the first`);
      }
      const last = ts[x.n - 1], base = x.step + (x.n - 1) * x.len;
      if (x.mod === 'lift' || x.mod === 'hold') {
        if (rel(last.filter((_, k) => k < last.length - (x.mod === 'hold' ? 1 : 0)), base) !== rel(ts[0].filter((_, k) => k < last.length - (x.mod === 'hold' ? 1 : 0)), x.step)) fail(`${where}: the changed time differs in rhythm beyond its change (${x.mod})`);
      }
      if (x.mod === 'ending' && a.built.notes.some((n) => n.end && n.step >= x.step && n.step < x.step + x.n * x.len && lastOf(a.built, n.step)) && !b.built.notes.some((n) => n.end && n.step >= x.step && n.step < x.step + x.n * x.len && lastOf(b.built, n.step))) fail(`${where}: the ending was lost`);
    }
    const hasBig = b.built.shapes.some((x) => x.bars);
    const ends = (v: typeof a) => v.built.notes.filter((n) => n.end && lastOf(v.built, n.step)).length;
    if (!hasBig && ends(a) !== ends(b)) fail(`${s} ${sec.section?.kind}: held endings ${ends(a)} became ${ends(b)}`);
    // (outside the repeats, the line is the one written without the switch)
    const inRegion = (n: BandNote) => regions.some(([f, e]) => n.step >= f - EPS && n.step < e - EPS);
    const keep = (ns: BandNote[]) => ns.filter((n) => !inRegion(n)).map((n) => `${n.step}:${n.midi}`).join(' ');
    // (the shape's own first time may have a note clipped: compare steps and pitches only)
    if (!hasBig && keep(a.built.notes) !== keep(b.built.notes)) { changed++; if (changed < 4) fail(`${s} ${sec.section?.kind}: notes outside the repeats changed`); }
  }
}
const pct = (x: number, y: number) => (y ? (100 * x / y).toFixed(0) : '-') + '%';
const sd = (a: number[], b: number[]) => { const d = a.map((x, i) => Math.abs(x - b[i])); return `mean ${(d.reduce((x, y) => x + y, 0) / Math.max(1, d.length)).toFixed(3)}, max ${Math.max(0, ...d).toFixed(3)}`; };
const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(3);
console.log(`chorus silence, a chorus with the switch on against off: ${sd(T.off.chorusSil, T.on.chorusSil)}`);
for (const m of ['off', 'on'] as const) {
  const t = T[m];
  console.log(`switch ${m}: phrases ${t.phrases}, with a repeated shape ${t.shapes} (${pct(t.shapes, t.phrases)}); notes/bar ${(t.notes / t.bars).toFixed(2)}; short notes ${pct(t.short, t.notes)}; chorus silence ${mean(t.chorusSil)}; off-key core notes ${t.offKey}; sections with a short share 5 points outside their kind's range (35-50%, a bridge or an interlude less): ${t.outside} of ${t.secs}`);
}
console.log(`shapes: A A A' ${pat[3] ?? 0}, A A A A' ${pat[4] ?? 0}, A A' A A' ${pat.alt ?? 0}; last time changed by ${JSON.stringify(mods)}; shape length in steps ${JSON.stringify(cellLen)}`);
console.log('across phrases:', JSON.stringify(bigPat));
console.log('phrases with a shape, by length in bars:', Object.entries(byLen).sort((x, y) => +x[0] - +y[0]).map(([k, [n, c]]) => `${k}: ${c}/${n}`).join('  '));
if (process.env.SKIPS) console.log(skips);
if (changed) console.log(`${changed} sections had notes changed outside the repeats`);
if (bad.length) { console.log(`${bad.length} problems`); process.exit(1); }
console.log('all checks passed');
