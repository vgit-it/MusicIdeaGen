// The skeleton library (docs/PATTERNS.md, "Guide line"): a real vocal line reduced to its slow line, the notes
// held a beat or longer and the notes on beats 1 and 3, the quick ones between them left out. Mined from the
// Lakh MIDI collection (scripts/study/lakh-skeleton.ts; only patterns many songs by many artists share, counts
// only, src/realism/skeleton.json): where the slow line's notes change in 2 bars (timings) and the scale steps
// between 4-5 of its notes (shapes, keyed as the pattern library's). The Guide line moves at that pace (about a
// note a bar, quick notes on top), so with Patterns on it takes its main-note path and timing from these.

import data from './skeleton.json';
import leans from './skeleton-lean.json';
import { type QNote, shapeKeys } from './patterns';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * A line's skeleton (16ths): notes held a beat or longer (to the next note, or their own end before a silence)
 * and notes on beat 1 or 3; each sounding until the next one or the silence after it (an 8th or more); the same
 * note sung on straight after itself one note (a held note re-sung on its words is still one note of the slow line).
 */
export function skeleton(ns: QNote[]): QNote[] {
  const runEnd: number[] = [];
  for (let k = ns.length - 1; k >= 0; k--) runEnd[k] = k + 1 < ns.length && ns[k + 1].q - ns[k].e < 2 ? runEnd[k + 1] : ns[k].e;
  const keep = ns.map((n, k) => {
    const next = ns[k + 1], inRun = next && next.q - n.e < 2;
    return (inRun ? next.q - n.q : n.e - n.q) >= 3.5 || mod(n.q, 8) === 0;
  });
  const out: QNote[] = [];
  for (let k = 0; k < ns.length; k++) {
    if (!keep[k]) continue;
    // (to the next kept note in the same run, or the run's end)
    let e = runEnd[k];
    for (let j = k + 1; j < ns.length && ns[j].q - ns[j - 1].e < 2; j++) if (keep[j]) { e = ns[j].q; break; }
    const last = out[out.length - 1];
    if (last && last.p === ns[k].p && last.e >= ns[k].q - 0.01) last.e = e;
    else out.push({ q: ns[k].q, e, p: ns[k].p });
  }
  return out;
}

/**
 * A skeleton's 2-bar timings, every 2 bars from every bar line (`bar` 16ths): 16 8ths, each a new note (o), a
 * note still sounding (-, a note held into the 2 bars or over the bar line) or silence (.). Stretches with no new note left out.
 */
export function timingKeys(sk: QNote[], bar = 16): string[] {
  if (!sk.length) return [];
  const r = (x: number) => 2 * Math.round(x / 2);
  const out: string[] = [];
  const b0 = Math.floor(sk[0].q / bar), b1 = Math.floor(sk[sk.length - 1].q / bar);
  for (let b = b0; b <= b1; b++) {
    const w = b * bar;
    let key = '';
    for (let k = 0; k < bar; k++) {
      const at = w + 2 * k;
      key += sk.some((n) => r(n.q) === at) ? 'o' : sk.some((n) => r(n.q) < at && r(n.e) > at) ? '-' : '.';
    }
    if (key.includes('o')) out.push(key);
  }
  return out;
}

/** The skeleton's shapes of 4-5 notes: what the first is against the band (R root, 3, 5, c another chord note, n none), the scale steps after it (as src/realism/patterns.ts keys them, without where it starts). */
export const skeletonShapes = (sk: QNote[], tonic: number, minor: boolean, rel: (n: QNote) => string) => shapeKeys(sk, tonic, minor, rel, [4, 5]).map((k) => k.slice(1));

export type Row = [key: string, songs: number, artists: number, byGenre: number[]];
export const SKEL_GENRES: string[] = data.genres;
export const TIMINGS = data.timings as Row[];
export const SKEL_SHAPES = data.shapes as Row[];
/** How much of real songs' own 2-bar timings and 4-note skeleton shapes the library holds. */
export const SKEL_COVERAGE = data.coverage as { timing: number; shape4: number };
/** A pattern's weight in a genre: its songs there, plus a little of its songs everywhere (thin genres borrow). */
export const skelWeight = (r: Row, genre: string) => { const g = SKEL_GENRES.indexOf(genre); return (g >= 0 ? r[3][g] : 0) + 0.05 * r[1]; };
/**
 * How much more often the Guide line picks a pattern (src/realism/skeleton-lean.json, npm run skeleton-lean): real
 * songs' share of it against the Guide line's own (Patterns off), so the switch brings what it lacks.
 */
export const skelLean = (kind: 'timing' | 'shape', key: string) => ((leans as Record<string, Record<string, number> | string>)[kind] as Record<string, number> | undefined)?.[key] ?? 1;
