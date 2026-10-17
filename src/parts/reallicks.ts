// Real licks (docs/LEAD-LICKS.md): licks written from what real lead guitarists play, measured in the Lakh MIDI
// collection (scripts/study/lick-mine.ts, src/realism/licks.json): a lick rhythm many real songs and artists share
// (3,000 of them, each heard in 8+ songs by 6+ artists), and its notes chosen one by one by the odds of real lead
// lines (where they go next from the note they're on in the key, after the step before, by how quick the next note
// comes). Then fitted like any lick: in the key (a quick passing note now and then outside it, as real leads do),
// held notes that don't rub, nothing clashing with the riff, chord notes at chord changes, the last note a chord note.
// Each rhythm once a song, so a solo doesn't say the same thing twice.

import data from '../realism/licks.json';
import type { Genre } from '../genres';
import type { LickKind } from '../players/lead';
import type { Rng } from '../rng';
import { chordPc } from '../theory';
import type { LickFit, Speed } from './licks';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export interface Rhythm { key: string; off: number; ons: number[]; tail: number; songs: number; genres: number[]; speed: Speed }

export const RHYTHMS: Rhythm[] = (data.rhythms as [string, number, number[]][]).map(([key, songs, genres]) => {
  const [off, o, tail] = key.split('|');
  const ons = o.split(',').map(Number);
  const gaps = ons.slice(1).map((x, i) => x - ons[i]);
  const quick = gaps.filter((g) => g <= 1).length;
  const speed: Speed = quick >= 3 ? 'fast' : gaps.reduce((s, g) => s + g, 0) / gaps.length >= 3 ? 'slow' : 'mid';
  return { key, off: +off, ons, tail: +tail, songs, genres, speed };
});
const GENRE_IX = data.genres as string[];

type Counts = Record<string, number>;
const STEPS = data.steps as Record<'M' | 'm', Record<string, Counts>>;
/** Coarser contexts for ones heard too seldom: the step before and how quick, then how quick only. */
const COARSE: Record<'M' | 'm', Record<string, Counts>> = { M: {}, m: {} };
for (const m of ['M', 'm'] as const) {
  for (const [ctx, c] of Object.entries(STEPS[m])) {
    const [, b, g] = ctx.split('|');
    for (const k of [`*|${b}|${g}`, `*|*|${g}`]) {
      const t = (COARSE[m][k] ??= {});
      for (const [d, n] of Object.entries(c)) t[d] = (t[d] ?? 0) + n;
    }
  }
}

const prevBucket = (d: number | null) => (d === null ? 'x' : d <= -5 ? 'D' : d <= -3 ? 'S' : d < 0 ? 's' : d === 0 ? '0' : d < 3 ? 'u' : d < 5 ? 'U' : 'P');
const gapClass = (g: number) => (g <= 1 ? 'q' : g === 2 ? 'e' : 'l');

/** Which rhythms suit which player, beyond their speed: the shredder likes them quick, the funk player short and clipped. */
const PLAYER_LEAN: Record<LickKind, (r: Rhythm) => number> = {
  sung: (r) => (r.ons.length <= 6 ? 1.3 : 0.7),
  blues: (r) => (r.ons.length <= 7 ? 1.1 : 0.8),
  run: (r) => (r.ons.length >= 6 ? 1.5 : 0.7),
  simple: (r) => (r.ons.length <= 5 ? 1.5 : 0.5),
  muted: (r) => (r.ons[r.ons.length - 1] <= 8 ? 1.5 : 0.6),
};

export interface RealLickNote { step: number; midi: number; len: number; vel: number }

export interface RealLickAsk {
  key: number;
  minor: boolean;
  genre: Genre;
  who: LickKind;
  speed: Speed | null;
  /** The slot: the lick starts at or after `start` and its last note is held to `end`. */
  start: number;
  end: number;
  lo: number;
  hi: number;
  /** The note before (the lick starts near it). */
  prev: number;
  /** The last note: the chord's root (home), another chord note (open), or any chord note. */
  close: 'home' | 'open' | 'any';
  vel: number;
  fit: LickFit;
  /** Steps where the chord changes (a chord note there). */
  changes: Set<number>;
  /** Rhythms already used in this song (added to). */
  used: Set<string>;
}

/** A real lick in the slot, or null if none fits. */
export function realLick(rng: Rng, a: RealLickAsk): RealLickNote[] | null {
  const mode = a.minor ? 'm' : 'M';
  const gi = GENRE_IX.indexOf(a.genre);
  const room = a.end - a.start;
  // the rhythms that fit the slot, at the player's speed, weighted by how common they are and how much the genre plays them
  const cands: [Rhythm & { at: number }, number][] = [];
  for (const r of RHYTHMS) {
    if (a.speed && r.speed !== a.speed) continue;
    const last = r.ons[r.ons.length - 1];
    let at = a.end - last - r.tail;
    at -= mod(at - r.off, 4);
    if (at < a.start || a.used.has(r.key)) continue;
    const share = gi >= 0 ? r.genres[gi] / Math.max(1, r.genres.reduce((s, x) => s + x, 0)) : 0;
    // (one that fills most of the slot, rather than a short one at its end)
    const fill = (a.end - at) / room;
    cands.push([{ ...r, at }, Math.sqrt(r.songs) * (1 + 4 * share) * PLAYER_LEAN[a.who](r) * (0.3 + fill)]);
  }
  for (let t = 0; t < 6 && cands.length; t++) {
    const pick = rng.weighted(cands.map(([, w], i) => [i, w] as [number, number]));
    const [r] = cands[pick];
    cands.splice(pick, 1);
    let best: { ms: number[]; score: number } | null = null;
    for (let k = 0; k < 10; k++) {
      const got = walk(rng, a, mode, r);
      if (got && (!best || got.score > best.score)) best = got;
    }
    if (!best) continue;
    a.used.add(r.key);
    const steps = r.ons.map((o) => r.at + o);
    return best.ms.map((m, i) => ({
      step: steps[i], midi: m, len: i + 1 < steps.length ? steps[i + 1] - steps[i] : a.end - steps[i],
      vel: a.vel + (i === 0 ? 0.04 : 0) + (rng.next() - 0.5) * 0.05,
    }));
  }
  return null;
}

/** The notes of a lick on rhythm `r`, one by one by the real odds, kept to what fits; null if it gets stuck. */
function walk(rng: Rng, a: RealLickAsk, mode: 'M' | 'm', r: Rhythm & { at: number }): { ms: number[]; score: number } | null {
  const { fit } = a;
  const steps = r.ons.map((o) => r.at + o);
  const lens = steps.map((g, i) => (i + 1 < steps.length ? steps[i + 1] - g : a.end - g));
  const n = steps.length;
  const ok = (m: number, i: number) => {
    const g = steps[i], len = lens[i], last = i === n - 1;
    if (m < a.lo || m > a.hi || fit.clash(m, g)) return false;
    // (outside the key only as a quick passing note)
    if (!fit.inKey(m) && !fit.isTone(m, g) && (len > 1 || last)) return false;
    if (len >= 4 && fit.rubs(m, g)) return false;
    if ((a.changes.has(g) || last) && !fit.isTone(m, g)) return false;
    return true;
  };
  const isRoot = (m: number, g: number) => mod(m, 12) === chordPc(a.key, fit.chordAt(g));
  const ms: number[] = [];
  let score = 0;
  // the first note: near the last one, on a note real licks start on
  const first: [number, number][] = [];
  for (let m = Math.max(a.lo, a.prev - 7); m <= Math.min(a.hi, a.prev + 7); m++) {
    if (!ok(m, 0)) continue;
    const w = ((data.starts as Record<string, number[]>)[mode][mod(m - a.key, 12)] + 1) * Math.exp(-Math.abs(m - a.prev) / 3);
    first.push([m, w]);
  }
  if (!first.length) return null;
  ms.push(rng.weighted(first));
  for (let i = 1; i < n; i++) {
    const cur = ms[i - 1], before = i >= 2 ? cur - ms[i - 2] : null;
    const g = gapClass(steps[i] - steps[i - 1]), b = prevBucket(before);
    const c = STEPS[mode][`${mod(cur - a.key, 12)}|${b}|${g}`] ?? COARSE[mode][`*|${b}|${g}`] ?? COARSE[mode][`*|*|${g}`];
    if (!c) return null;
    const last = i === n - 1;
    const opts: [number, number][] = [];
    let total = 0;
    for (const [d, w] of Object.entries(c)) {
      total += w;
      const m = cur + Number(d);
      if (!ok(m, i)) continue;
      let x = w;
      if (last && a.close === 'home') x *= isRoot(m, steps[i]) ? 3 : 0.4;
      if (last && a.close === 'open') x *= isRoot(m, steps[i]) ? 0.4 : 1.5;
      opts.push([m, x]);
    }
    if (!opts.length) return null;
    const m = rng.weighted(opts);
    score += Math.log((c[String(m - cur)] ?? 0.5) / total);
    ms.push(m);
  }
  // (mostly the same note, or a lick that never moves more than a step: try again)
  if (new Set(ms).size < Math.min(3, n)) return null;
  return { ms, score: score / n + rng.next() * 0.3 };
}

/** How often a solo's lick slots, its sung phrases and its bursts, and a lick answering the singer in a verse, get a real lick (when on). */
export const REAL_SOLO = { lick: 0.65, sing: 0.45, burst: 0.5 };
export const REAL_VERSE = 0.5;

/** A short real lick rhythm (3-4 notes within a beat and a half, from the beat), for a cell climbing into a solo's peak. */
export function realCell(rng: Rng, genre: Genre): number[] {
  const gi = GENRE_IX.indexOf(genre);
  const cells = RHYTHMS.filter((r) => r.off === 0 && r.ons.length >= 3 && r.ons.length <= 4 && r.ons[r.ons.length - 1] <= 5);
  return rng.weighted(cells.map((r) => [r.ons, Math.sqrt(r.songs) * (1 + (gi >= 0 ? 4 * r.genres[gi] / Math.max(1, r.genres.reduce((s, x) => s + x, 0)) : 0))] as [number[], number]));
}
