// The gap map of a solo's melody (docs/SOLO-MELODY.md, step 0b): where a joint, a fill or a lick could go, found from the melody alone;
// then, by chance, which of them are used. Nothing is filled here. The finished solo never has more than a beat of silence: a note
// is only cut (`cut`) if its fill lands, so a gap left bare keeps its silence (a rest, a beat at most) and its notes whole.

import { groupStarts } from '../rhythm';
import type { SoloGap, Song } from '../idea';
import type { LickKind } from '../players/lead';
import type { Genre } from '../genres';
import type { Rng } from '../rng';
import type { Mood } from '../tension';

/** A melody note as the gap finder reads it. */
export interface GapNote {
  step: number; len: number; midi: number;
  /** Its phrase, its place in the phrase, and the phrase's role. */
  phrase: number; j: number; role: string;
  /** The climax's top note: its hold is not cut. */
  peak?: boolean;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** What would fit a gap of `len` steps between notes `d` semitones apart (null: before the first note). */
export function fitsOf(len: number, d: number | null): string[] {
  if (d === null) return len <= 4 ? ['pickup note', 'slide in'] : ['short run', 'lick'];
  if (len <= 2) return d === 0 ? ['grace note', 'neighbour note'] : ['passing note', 'slide', 'hammer-on or pull-off', ...(d > 0 && d <= 4 ? ['bend up into it'] : [])];
  if (len <= 6) return ['short run', 'turn', 'triplet', 'enclosure'];
  return ['lick', 'end of the phrase again', 'short run'];
}

/**
 * Every gap of the melody. A rest is a silence between two notes (or before the first); a long note's tail joins the rest after it.
 * A tail is the end of a long note that touches the next: the note keeps a beat or half its length, whichever is more. A joint is
 * the last 2 steps of a note of 4 or more that touches the next, when they are 3 semitones or more apart (or the same note again).
 * Never the climax note's hold, the first note's, or a note under 4 steps; one gap for each junction.
 */
export function findGaps(notes: GapNote[], song: Song): SoloGap[] {
  const { bars } = song;
  const barAt = (g: number) => { for (let i = bars.length - 1; i >= 0; i--) if (g >= bars[i].start) return bars[i]; return bars[0]; };
  const beatOf = (g: number) => Math.min(...barAt(g).groups);
  const isBeat = (g: number) => { const b = barAt(g); return groupStarts(b.groups).includes(g - b.start); };
  const ns = [...notes].sort((a, b) => a.step - b.step);
  const gaps: SoloGap[] = [];
  if (!ns.length) return gaps;
  const make = (kind: SoloGap['kind'], step: number, len: number, cut: number, silence: number, from: GapNote | null, to: GapNote): SoloGap => {
    const d = from ? to.midi - from.midi : null;
    return {
      kind, step, len, cut, silence,
      from: from ? { step: from.step, len: from.len, midi: from.midi } : null, to: { step: to.step, midi: to.midi },
      interval: d, onBeat: isBeat(step), role: (from ?? to).role, phrase: (from ?? to).phrase, j: from ? from.j : -1,
      fits: fitsOf(len, d), picked: false,
    };
  };
  if (ns[0].step > 0) gaps.push(make('rest', 0, ns[0].step, 0, ns[0].step, null, ns[0]));
  for (let i = 0; i + 1 < ns.length; i++) {
    const a = ns[i], b = ns[i + 1], end = a.step + a.len, time = b.step - end;
    const frozen = !!a.peak || i === 0;
    // (the note keeps a beat or half its length, whichever is more; the rest of it is room)
    const keep = Math.max(beatOf(a.step), 2 * Math.ceil(a.len / 4));
    const room = frozen ? 0 : Math.max(0, a.len - keep);
    const d = b.midi - a.midi;
    if (time > 0) {
      const cut = room >= 2 ? room : 0;
      gaps.push(make('rest', end - cut, time + cut, cut, time, a, b));
    } else if (room >= 4) gaps.push(make('tail', end - room, room, room, 0, a, b));
    else if (!frozen && a.len >= 4 && (Math.abs(d) >= 3 || d === 0)) gaps.push(make('joint', end - 2, 2, 2, 0, a, b));
  }
  return gaps;
}

/** The share of gaps used, before the mood, the genre, the player, the pace there, the kind and the phrase's job. */
export const FILL_P = 0.6;
const FILL_MOOD: Record<Mood, number> = { melancholic: 0.6, nostalgic: 0.8, dreamy: 0.7, dark: 0.8, tense: 1, happy: 1, angry: 1.3, triumphant: 1.2 };
const FILL_GENRE: Record<Genre, number> = { funk: 1.1, pop: 0.8, rock: 1, grunge: 0.9, altmetal: 1.1, hardrock: 1.2, metal: 1.3 };
const FILL_LICK: Record<LickKind, number> = { sung: 0.6, blues: 0.9, simple: 0.8, muted: 0.9, run: 1.4 };
const FILL_KIND: Record<SoloGap['kind'], number> = { rest: 1.2, tail: 1.1, joint: 0.8 };
/** A call stays bare, the answer fills, the climax keeps its line. */
const FILL_ROLE: Record<string, number> = { call: 0.3, answer: 1.5, climax: 0.5, end: 1 };

export interface PickOpts { mood: Mood; genre: Genre; lick: LickKind; pace: (step: number) => number; echoOf: (phrase: number) => number | undefined }

/**
 * Which gaps are used (sets `picked`): about a third, by an appetite drawn for the solo, the mood, the genre, the player, the pace
 * there, the kind of gap and the phrase's job. A phrase played again picks as the one it plays (mostly). Two in a row only at the
 * busiest parts. Returns the appetite.
 */
export function pickGaps(rng: Rng, gaps: SoloGap[], o: PickOpts): number {
  const appetite = 0.45 + 1.1 * rng.next();
  const done = new Map<string, boolean>();
  let prev: SoloGap | undefined;
  for (const g of gaps) {
    const src = g.j >= 0 ? o.echoOf(g.phrase) : undefined;
    const known = src !== undefined ? done.get(`${src}:${g.j}`) : undefined;
    if (known !== undefined && rng.chance(0.85)) g.picked = known;
    else {
      const pace = o.pace(g.step);
      let p = FILL_P * appetite * FILL_MOOD[o.mood] * FILL_GENRE[o.genre] * FILL_LICK[o.lick] * clamp(pace, 0.6, 1.6) * FILL_KIND[g.kind] * (FILL_ROLE[g.role] ?? 1);
      if (prev?.picked) p *= pace > 1.15 ? 0.7 : 0.1;
      g.picked = rng.chance(clamp(p, 0, 0.85));
    }
    if (g.j >= 0) done.set(`${g.phrase}:${g.j}`, g.picked);
    prev = g;
  }
  return appetite;
}
