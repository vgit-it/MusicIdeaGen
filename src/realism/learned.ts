// The learned writer's odds (docs/VOCAL-LEARNED.md, option 5 of docs/STUDY-LAKH.md): how real vocal lines in the
// Lakh MIDI collection move from note to note (src/realism/learned.json, counted by scripts/study/lakh-learned.ts;
// counts only, never melodies or lyrics). For each note: the scale step from the note before, by a small context:
// the step before that, where the note starts in the bar, what the note before was against the chord, where it
// sits in its phrase, the genre. Only contexts found in 25+ songs by 15+ artists; thin ones fall back to coarser
// contexts and to all genres. Also which kind of note real singers put on strong beats and at phrase ends.

import data from './learned.json';

/** Steps a note moves (scale steps), the outcomes counted: -MAX_STEP..MAX_STEP. */
export const MAX_STEP = 7;
/** The step before, as counted: -5..5 (bigger ones at the ends), or 'S' (the note before started its phrase). */
export const prevKey = (step: number | null) => (step === null ? 'S' : String(Math.max(-5, Math.min(5, step))));
/** Where a note starts in the bar (16ths): on 1 or 3 (S), on 2 or 4 (B), an offbeat 8th (&), a 16th between (x). */
export const posKey = (q: number) => { const p = ((q % 16) + 16) % 16; return p % 8 === 0 ? 'S' : p % 4 === 0 ? 'B' : p % 2 === 0 ? '&' : 'x'; };
/** A note against the chord: its root (R), 3rd, 5th, another chord note (c), none (n). */
export type Rel = 'R' | '3' | '5' | 'c' | 'n';
export const RELS: Rel[] = ['R', '3', '5', 'c', 'n'];
/** Where a note sits in its phrase: its first (s), between (m), its last (e). */
export type Ph = 's' | 'm' | 'e';
/** The context keys, finest first: [prev, pos, rel, ph], [prev, pos, ph], [prev, ph]. */
export const ctxKeys = (prev: string, pos: string, rel: Rel, ph: Ph) => [`${prev}|${pos}|${rel}|${ph}`, `${prev}|${pos}|${ph}`, `${prev}|${ph}`];

/** A song's tempo band for the rhythm odds: slow (under 95 bpm), mid, fast (130 and up). */
export const tempoKey = (bpm: number) => (bpm < 95 ? 's' : bpm < 130 ? 'm' : 'f');
/** The rhythm's context: the beat in the bar (0-3), whether the 16th just before it was sung, the tempo band. */
export const cellKey = (beat: number, pushed: boolean, tempo: string) => `${beat}|${pushed ? 1 : 0}|${tempo}`;

interface Data {
  genres: string[];
  /** Per genre (and 'all'): context key -> counts of each step (-MAX_STEP..MAX_STEP). */
  steps: Record<string, Record<string, number[]>>;
  /** Per genre (and 'all'): counts of each Rel (RELS order) on beat 1 or 3, at a phrase's end, and on any note. */
  strong: Record<string, number[]>;
  end: Record<string, number[]>;
  any: Record<string, number[]>;
  /** Per genre (and 'all'): counts of a phrase's last note's scale degree (0-6). */
  endDeg: Record<string, number[]>;
  /** Per genre (and 'all'): counts of each Rel on a phrase's first note on a beat (its landing, after any pickup), and of a phrase's first note's scale degree (0-6). Absent until npm run realism-learned is run again. */
  land?: Record<string, number[]>;
  startDeg?: Record<string, number[]>;
  /** Per genre (and 'all'): rhythm context (cellKey, and without its tempo) -> counts of each beat's cell (bit k: its k-th 16th sung). */
  rhythm?: Record<string, Record<string, number[]>>;
}
const D = data as unknown as Data;

/** The odds of each step (-MAX_STEP..MAX_STEP, as weights) for a note in this context: the genre's finest known context, else all songs'. */
export function stepOdds(genre: string, prev: string, pos: string, rel: Rel, ph: Ph): number[] {
  const G = D.steps[genre], A = D.steps.all;
  for (const k of ctxKeys(prev, pos, rel, ph)) {
    const g = G?.[k], a = A[k];
    // (a genre's own counts, leaning on all songs' while it has few)
    if (g || a) {
      const ng = g ? g.reduce((x, y) => x + y, 0) : 0;
      const w = ng / (ng + 300);
      const sa = a ? a.reduce((x, y) => x + y, 0) : 0;
      return (g ?? a!).map((_, i) => w * (g ? g[i] / ng : 0) + (1 - w) * (a ? a[i] / sa : g![i] / ng));
    }
  }
  // (nothing known: steps and repeats, small ones likelier)
  return Array.from({ length: 2 * MAX_STEP + 1 }, (_, i) => 1 / (1 + Math.abs(i - MAX_STEP) ** 2));
}

const share = (xs: number[]) => { const s = xs.reduce((a, b) => a + b, 0) || 1; return xs.map((x) => x / s); };
const mix = (t: Record<string, number[]>, genre: string) => { const g = t[genre], a = share(t.all); if (!g) return a; const n = g.reduce((x, y) => x + y, 0), w = n / (n + 2000), gs = share(g); return a.map((x, i) => w * gs[i] + (1 - w) * x); };

/** How much likelier real singers put each kind of note (Rel) on beat 1 or 3, or at a phrase's end, than anywhere: weights around 1. */
export function relLean(genre: string, where: 'strong' | 'end' | 'land'): Record<Rel, number> {
  // (a phrase's landing: as counted, else as any note on beat 1 or 3)
  const t = mix(where === 'strong' ? D.strong : where === 'land' ? D.land ?? D.strong : D.end, genre), any = mix(D.any, genre);
  return Object.fromEntries(RELS.map((r, i) => [r, any[i] ? t[i] / any[i] : 1])) as Record<Rel, number>;
}

/** The share of phrase endings on each scale degree (0: the key's root ... 6), real songs of the genre. */
export const endDegrees = (genre: string) => mix(D.endDeg, genre);

/** The share of phrase starts on each scale degree (0: the key's root ... 6), real songs of the genre; null until counted. */
export const startDegrees = (genre: string) => (D.startDeg ? mix(D.startDeg, genre) : null);

/**
 * The odds of each cell for a beat (16 weights; bit k: the beat's k-th 16th sung), as real singers sing inside a
 * line: the genre's own counts leaning on all songs' while it has few, at the song's tempo, else any tempo; null
 * when nothing is known (or until counted).
 */
export function cellOdds(genre: string, beat: number, pushed: boolean, bpm: number): number[] | null {
  if (!D.rhythm) return null;
  const k = cellKey(beat, pushed, tempoKey(bpm)), k2 = k.slice(0, k.lastIndexOf('|'));
  const G = D.rhythm[genre], A = D.rhythm.all;
  const pick = (t?: Record<string, number[]>) => t?.[k] ?? t?.[k2];
  const g = pick(G), a = pick(A);
  if (!g && !a) return null;
  const sg = g ? share(g) : null, sa = a ? share(a) : null;
  const ng = g ? g.reduce((x, y) => x + y, 0) : 0, w = sa ? ng / (ng + 400) : 1;
  return Array.from({ length: 16 }, (_, c) => w * (sg ? sg[c] : 0) + (1 - w) * (sa ? sa[c] : 0));
}
