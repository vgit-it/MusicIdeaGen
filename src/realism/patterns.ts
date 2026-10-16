// The pattern library (docs/PATTERNS.md): common 1-bar vocal rhythms and short note shapes from real songs
// (src/realism/patterns.json, mined by scripts/study/lakh-patterns.ts; only patterns many songs by many artists
// share, counts only), and the copy guard (src/realism/guard.json: hashes of real 2-bar stretches few songs
// share, so a written line never copies one).

import data from './patterns.json';
import guard from './guard.json';
import leans from './lean.json';

/** FNV-1a, 32 bits. */
export const hash32 = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h >>> 0; };
export const GUARD_HASHES = 10;
/** A 2-bar stretch's fingerprint: its onsets (16ths from its start) and the steps between its notes (semitones). */
export const guardSig = (onsets: number[], midis: number[]) => onsets.map((x, i) => `${x}:${i ? midis[i] - midis[i - 1] : 0}`).join(',');

const bytes = (() => { const b = atob(guard.filter); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; })();
/** Whether a stretch is (very likely) a real song's own (about 0.1% false alarms, never a miss). */
export function guarded(sig: string): boolean {
  const h1 = hash32(sig), h2 = hash32(`${sig}#`) | 1;
  for (let j = 0; j < guard.k; j++) { const b = ((h1 + j * h2) >>> 0) % guard.bits; if (!(bytes[b >> 3] & (1 << (b & 7)))) return false; }
  return true;
}

/**
 * Whether a sung line (steps in 16ths, MIDI notes) copies a real 2-bar stretch: every 2 bars from every bar line
 * (16 steps a bar). `test`: the guard (the lab passes the exact real fingerprints, kept locally, to count true copies).
 */
export function copiesReal(notes: { step: number; midi: number }[], bar = 16, test: (sig: string) => boolean = guarded): boolean {
  return copyAt(notes, bar, test) >= 0;
}

/** Where the first 2-bar stretch copying a real song starts (its step), or -1. */
export function copyAt(notes: { step: number; midi: number }[], bar = 16, test: (sig: string) => boolean = guarded): number {
  if (notes.length < 4) return -1;
  const starts = new Set<number>();
  const first = notes[0].step, last = notes[notes.length - 1].step;
  for (let s = Math.floor(first / bar) * bar; s <= last; s += bar) starts.add(s);
  for (const st of starts) {
    const w = notes.filter((n) => n.step >= st && n.step < st + 2 * bar);
    if (w.length >= 5 && new Set(w.map((n) => n.midi)).size >= 3 && test(guardSig(w.map((n) => Math.round(n.step - st)), w.map((n) => n.midi)))) return st;
  }
  return -1;
}

export type Row = [key: string, songs: number, artists: number, byGenre: number[]];
export const GENRES: string[] = data.genres;
export const RHYTHMS = data.rhythms as Row[];
export const SHAPES = data.shapes as Row[];
/** How much of real songs' own bars and 4-note shapes the library holds. */
export const PATTERN_COVERAGE = (data as { coverage?: { rhythm: number; shape4: number } }).coverage ?? { rhythm: 0, shape4: 0 };
/** A pattern's weight in a genre: its songs there, plus a little of its songs everywhere (thin genres borrow). */
export const weightIn = (r: Row, genre: string) => { const g = GENRES.indexOf(genre); return (g >= 0 ? r[3][g] : 0) + 0.05 * r[1]; };
/**
 * How much more often the vocal writers pick a pattern (src/realism/lean.json, npm run realism-lean): real songs'
 * share of it against the app's own lines' (Patterns off), so the switch brings what the writers lack (late
 * entries, notes held over the bar line, offbeat runs, repeated notes stepping down) more than the plain ones
 * they already sing. The Anchor line (anchor*) measured apart: it writes its own way.
 */
export const leanOf = (kind: 'rhythm' | 'shape' | 'anchorRhythm' | 'anchorShape', key: string) => (leans[kind] as Record<string, number>)[key] ?? 1;

const MAJ_SC = [0, 2, 4, 5, 7, 9, 11], MIN_SC = [0, 2, 3, 5, 7, 8, 10];
const mod = (n: number, m: number) => ((n % m) + m) % m;
/** Where a note starts in its bar: on beat 1 or 3 (S), on 2 or 4 (B), an offbeat 8th (&), an in-between 16th (x). */
export const posClass = (q: number) => { const p = mod(q, 16); return p % 8 === 0 ? 'S' : p % 4 === 0 ? 'B' : p % 2 === 0 ? '&' : 'x'; };
/** A note in 16ths (start, end), MIDI. */
export interface QNote { q: number; e: number; p: number }

/** A line's 1-bar rhythms, as the library keys them: the onsets in the bar, a note held into it (t), a phrase ending in it (e). */
export function rhythmKeys(ns: QNote[]): string[] {
  const byBar = new Map<number, number[]>();
  ns.forEach((n, i) => { const b = Math.floor(n.q / 16); (byBar.get(b) ?? byBar.set(b, []).get(b)!).push(i); });
  return [...byBar].map(([b, idx]) => {
    const first = idx[0], last = idx[idx.length - 1];
    const held = first > 0 && ns[first - 1].e > b * 16 + 0.5 && ns[first].q > b * 16;
    const end = last === ns.length - 1 || ns[last + 1].q - ns[last].e >= 4;
    return `${held ? 't' : ''}${[...new Set(idx.map((i) => ns[i].q - b * 16))].join('.')}${end ? 'e' : ''}`;
  });
}

/**
 * A line's note shapes of `len` notes (inside a phrase, all in the key), as the library keys them: where the first
 * starts, what it is against the band (`rel`: R root, 3, 5, c another chord note, n none), the scale steps after it.
 */
export function shapeKeys(ns: QNote[], tonic: number, minor: boolean, rel: (n: QNote) => string, lens = [4, 5, 6]): string[] {
  const SC = minor ? MIN_SC : MAJ_SC;
  const deg = ns.map((n) => { const i = SC.indexOf(mod(n.p - tonic, 12)); return i < 0 ? null : 7 * Math.floor((n.p - tonic) / 12) + i; });
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) for (const L of lens) {
    if (i + L > ns.length) break;
    let ok = true;
    for (let k = i; k < i + L; k++) if (deg[k] === null || (k > i && ns[k].q - ns[k - 1].e >= 4)) ok = false;
    if (!ok) break;
    const steps: number[] = [];
    for (let k = i + 1; k < i + L; k++) steps.push(deg[k]! - deg[k - 1]!);
    if (steps.some((x) => Math.abs(x) > 4)) continue;
    out.push(`${posClass(ns[i].q)}${rel(ns[i])}:${steps.join(',')}`);
  }
  return out;
}
