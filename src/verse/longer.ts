// Longer notes for the verse melody writer: the writer's base unit is the 8th, so about two notes in three are an 8th or shorter.
// This rule joins neighbouring short notes into longer ones until the share of short notes in a section is near a target that
// depends on the genre and the kind of section (funk the busiest, grunge the calmest; verses busier than choruses and breaks).
// A note is "short" when it is no longer than an 8th note: 1/8 of a bar in 4/4, and the meter's own 8th (2 steps) in the others.

import { Rng } from '../rng';
import type { Genre } from '../genres';
import type { BarArg } from './grid';
import { gridOf } from './grid';
import type { BandNote, Gap } from './verse';

/** The share of notes that may be short, for a verse of each genre. */
export const SHORT_BASE: Record<Genre, number> = { funk: 0.5, pop: 0.46, metal: 0.45, rock: 0.43, altmetal: 0.43, hardrock: 0.4, grunge: 0.38 };
/** What a kind of section takes off the verse's share. */
const SHORT_KIND: Record<string, number> = { verse: 0, chorus: -0.05, bridge: -0.04, outro: -0.05, interlude: -0.06 };
export const SHORT_MIN = 0.35, SHORT_MAX = 0.5;
/** The bridge and the interlude are slow and sung long: their share of short notes is the verse's genre share times `mul`, inside `min` to `max` (about 23% and 18% on average). */
const CALM_SHORT: Record<string, { mul: number; min: number; max: number }> = { bridge: { mul: 0.55, min: 0.15, max: 0.32 }, interlude: { mul: 0.42, min: 0.12, max: 0.25 } };
/** A section that is held long (a bridge or an interlude). */
export const isCalm = (kind: string): boolean => kind in CALM_SHORT;
/** The share of short notes a kind of section may have: 35 to 50%, less in a bridge or an interlude. */
export const shortRange = (kind: string): [number, number] => (isCalm(kind) ? [CALM_SHORT[kind].min, CALM_SHORT[kind].max] : [SHORT_MIN, SHORT_MAX]);

/** The share of short notes a section of this genre and kind aims for (35 to 50%; a bridge about 23%, an interlude about 18%). */
export const shortTarget = (genre: Genre, kind: string): number => {
  const calm = CALM_SHORT[kind];
  if (calm) return Math.min(calm.max, Math.max(calm.min, (SHORT_BASE[genre] ?? 0.43) * calm.mul));
  return Math.min(SHORT_MAX, Math.max(SHORT_MIN, (SHORT_BASE[genre] ?? 0.43) + (SHORT_KIND[kind] ?? 0)));
};

/** The longest a short note is, in steps: an 8th note (2 steps), or 1/8 of a bar where that is more (2/2). */
export const shortLen = (bar: BarArg): number => Math.max(2, gridOf(bar).bar / 8);

const EPS = 1e-6;

/**
 * Join pairs of short notes (an 8th and the 8th after it) into one longer note, until the share of short notes is as near `target` as the changes
 * can bring it (not under it). When no pair can join, a lone short note before a rest takes the first 8th of the rest. Only notes that touch, sit in one phrase and one bar, and carry nothing of their own (a held ending, a third-bar shape, a
 * lead-in, a scoop or fall, a long hold, a mood note) are joined, and never over a chord change. The first note's pitch stays, unless
 * the second is the phrase's last (its ending is kept). A pair starting on a beat is favoured over one starting off it.
 * `rests`: false keeps the rests as they are (joins only). `changes`: the steps chords change on, from the start of the notes' stretch.
 * `calm` (a bridge or an interlude): when no pair is left, a short note also joins the plain longer note touching it (up to a beat and a
 * half), and `coverCap` (the most the notes may cover, in steps) bounds how far notes grow into rests.
 */
export function withLonger(notes: BandNote[], phrases: Gap[], barArg: BarArg, target: number, changes: number[], seed: string, rests = true, calm?: { coverCap: number }): BandNote[] {
  const G = gridOf(barArg), lim = shortLen(G) + EPS, rng = new Rng(`${seed}|longer`);
  const out = notes.map((n) => ({ ...n }));
  const short = (n: BandNote) => n.len <= lim;
  const plain = (n: BandNote) => !n.end && !n.third && !n.lead && !n.opener && !n.longHold && n.slide === undefined && n.fadeBy === undefined && n.bendTo === undefined && !n.colour && !n.surprise && !n.endRole;
  const phraseOf = (step: number) => phrases.findIndex((p) => step >= p.step - EPS && step < p.step + p.len - EPS);
  const joinable = (i: number): boolean => {
    const a = out[i], b = out[i + 1];
    if (!b || !short(a) || !short(b) || !plain(a) || !plain(b)) return false;
    if (Math.abs(a.step + a.len - b.step) > EPS || a.len + b.len <= lim || a.len + b.len > Math.max(4, G.bar / 4)) return false;
    if (phraseOf(a.step) < 0 || phraseOf(a.step) !== phraseOf(b.step)) return false;
    if (G.index(a.step) !== G.index(b.step + b.len - EPS)) return false;
    return !changes.some((c) => Math.abs(c - b.step) < EPS);
  };
  // (a lone short note before a rest of an 8th or more may take the first 8th of that rest instead: no join to make, so it holds longer)
  const stretchable = (i: number): boolean => {
    const a = out[i], b = out[i + 1];
    if (!b || !short(a) || !plain(a)) return false;
    const room = b.step - (a.step + a.len);
    if (room < 2 - EPS || phraseOf(a.step) < 0 || phraseOf(a.step) !== phraseOf(b.step)) return false;
    if (G.index(a.step) !== G.index(a.step + a.len + 2 - EPS)) return false;
    return !changes.some((c) => c >= a.step + a.len - EPS && c < a.step + a.len + 2 - EPS);
  };
  // (calm: a short note and the plain longer note touching it become one, up to a beat and a half)
  const cap = Math.max(6, Math.round((G.bar * 3) / 8));
  const mixed = (i: number): boolean => {
    const a = out[i], b = out[i + 1];
    if (!calm || !b || short(a) === short(b) || !plain(a) || !plain(b)) return false;
    if (Math.abs(a.step + a.len - b.step) > EPS || a.len + b.len > cap) return false;
    if (phraseOf(a.step) < 0 || phraseOf(a.step) !== phraseOf(b.step)) return false;
    if (G.index(a.step) !== G.index(b.step + b.len - EPS)) return false;
    return !changes.some((c) => Math.abs(c - b.step) < EPS);
  };
  let cover = out.reduce((x, n) => x + n.len, 0);
  const choose = (cands: { i: number; w: number }[]): number => {
    let r = rng.next() * cands.reduce((s, c) => s + c.w, 0), pick = cands[cands.length - 1].i;
    for (const c of cands) { r -= c.w; if (r < 0) { pick = c.i; break; } }
    return pick;
  };
  // (a change goes ahead only if it lands the share of short notes nearer the target than now)
  while (out.length > 1) {
    const nShort = out.filter(short).length, now = nShort / out.length;
    if (now <= target) break;
    const weigh = (ok: (i: number) => boolean) => out.flatMap((n, i) => (i + 1 < out.length && ok(i) ? [{ i, w: G.isBeat(n.step) ? 3 : 1 }] : []));
    let cands = weigh(joinable), how: 'pair' | 'mixed' | 'stretch' = 'pair';
    if (!cands.length) { cands = weigh(mixed); how = 'mixed'; }
    if (!cands.length && rests && (!calm || cover + 2 <= calm.coverCap + EPS)) { cands = weigh((i) => stretchable(i)); how = 'stretch'; }
    if (!cands.length) break;
    const after = how === 'pair' ? (nShort - 2) / (out.length - 1) : how === 'mixed' ? (nShort - 1) / (out.length - 1) : (nShort - 1) / out.length;
    if (Math.abs(after - target) >= Math.abs(now - target)) break;
    const pick = choose(cands), a = out[pick], b = out[pick + 1];
    if (how === 'stretch') { out[pick] = { ...a, len: a.len + 2 }; cover += 2; continue; }
    const p = phrases[phraseOf(b.step)];
    const lastOfPhrase = b.step + b.len >= p.step + p.len - EPS || !out[pick + 2] || phraseOf(out[pick + 2].step) !== phraseOf(b.step);
    out.splice(pick, 2, { ...a, len: a.len + b.len, ...(lastOfPhrase ? { midi: b.midi } : {}) });
  }
  return out;
}
