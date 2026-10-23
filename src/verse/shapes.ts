// Rule 39, repeat shapes: inside a phrase, one small shape (a bar or less: a rhythm and a contour) is sung again, as A A A' (twice the same,
// the third time changed) or A A A A' (three times the same, the fourth changed). A phrase rolls once: 25% neither, else one of the two.
// It runs last, on the line as it will sound, so no rule after it can pull a repeat apart (the rules above draw their dice by step: two
// bars never come out alike). The first time is the line as written; the repeats are copies of it, moved with the chords.

import { Rng } from '../rng';
import type { Chord } from '../theory';
import { gridOf, type BarArg } from './grid';
import { SHORT_MAX, SHORT_MIN, shortLen } from './longer';
import { MAX_SAME, fifth, fixUnits, limitSame, third as thirdOf, type BandNote, type Gap, type Range } from './verse';

const EPS = 1e-6;
/** The share of phrases that get no repeated shape. */
export const NO_SHAPE = 0.25;

export type ShapeMod = 'ending' | 'lift' | 'hold';

/** One repeated shape: where, how many times (3 or 4: the last one changed), how long the shape is, and how the last one changes. */
export interface ShapeInfo {
  phrase: number; n: 3 | 4; step: number; len: number; mod: ShapeMod; shifts: number[];
  /** More shapes (rule 45): A A' A A', the 2nd and 4th time each changed (`mids` is how the 2nd changed, `mod` the 4th). */
  alt?: true; mids?: ShapeMod;
  /** More shapes (bigshapes.ts): a shape of `bars` bars across phrases (`len` steps a time), and which times (counted from 0) are changed. */
  bars?: number; changed?: number[];
}

/** Which times of a shape (counted from 0) are changed: the last, and with A A' A A' the 2nd too. */
export const changedTimes = (x: ShapeInfo): number[] => x.changed ?? (x.alt ? [1, x.n - 1] : [x.n - 1]);
/** A A A', A A A A' or A A' A A'. */
export const shapeName = (x: ShapeInfo): string => Array.from({ length: x.n }, (_, i) => (changedTimes(x).includes(i) ? "A'" : 'A')).join(' ');

export interface ShapeCtx {
  key: number;
  /** The pitch classes the line is in (the key's scale, or the pentatonic). */
  scale: ReadonlySet<number>;
  /** The chord on each step of the leaf. */
  chordAt: Chord[];
  range: Range;
  /** The chorus's share of silence and how far from it the fit let the line be (left out: no fit to keep). */
  silence?: number;
  silenceTol?: number;
  /** Rule 37 is on: keep the share of short notes inside its 35-50% (or where it was). */
  short?: boolean;
  /** The share of short notes rule 37 keeps this kind of section inside (left out: 35-50%). */
  shortRange?: [number, number];
  /** More shapes (rule 45) is on: a third pattern, A A' A A' (the 2nd and 4th time each changed). */
  alt?: boolean;
}

/** Why a phrase got no shape (for the check): counts. */
export type Skips = Record<string, number>;

/** Semitones the shape moves with the chord, tried in this order (0: the same pitches). */
const SHIFTS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];

const pcOf = (m: number) => ((m % 12) + 12) % 12;
const susp = (x: BandNote) => !!x.inner?.startsWith('suspension') && x.bendTo !== undefined;
const landStep = (x: BandNote) => x.step + (x.bendAt ?? 0) + 1;

/** The key's scale and the chords a shape is moved over. */
export interface Mover { scale: number[]; chordOf(s: number): Chord | undefined; ct(m: number, s: number): boolean; shift(m: number, d: number): number }
export function moverOf(ctx: Pick<ShapeCtx, 'key' | 'scale' | 'chordAt'>): Mover {
  const scale = [...ctx.scale].sort((a, b) => a - b), L = scale.length;
  const chordOf = (s: number): Chord | undefined => ctx.chordAt[Math.min(ctx.chordAt.length - 1, Math.max(0, Math.floor(s + EPS)))];
  const ct = (m: number, s: number): boolean => {
    const c = chordOf(s);
    return !!c && [0, thirdOf(c), fifth(c)].some((x) => (ctx.key + c.root + x) % 12 === pcOf(m));
  };
  // (`d` scale steps up from a pitch; a pitch off the scale keeps its distance above the scale note under it)
  const shift = (m: number, d: number): number => {
    if (!d) return m;
    const pc = pcOf(m), oct = (m - pc) / 12;
    let j = L - 1, o = oct - 1;
    for (let i = 0; i < L; i++) if (scale[i] <= pc) { j = i; o = oct; }
    const res = pc - scale[j] + (o < oct ? 12 : 0);
    const deg = o * L + j + d, oo = Math.floor(deg / L), jj = ((deg % L) + L) % L;
    return oo * 12 + scale[jj] + res;
  };
  return { scale, chordOf, ct, shift };
}

export interface Placed { midi: number[]; to: (number | undefined)[]; viol: number }

/**
 * Where each note of a shape goes for a move of `d` scale steps, over the chords `off` steps on; null when it can't: out of range, out
 * of key, or a chord note too far from any chord note. A colour note keeps its distance from the note before it, a delayed resolution its
 * distance from the chord note it lands on; the notes that must stay on a chord note (those that were, an 8th or longer, not steppers)
 * are snapped to the nearest one where the move misses, two at most.
 */
export function placeCell(sub: BandNote[], off: number, d: number, mv: Mover, lo: number, hi: number): Placed | null {
  const { scale, ct, shift } = mv;
  const midi: number[] = [], to: (number | undefined)[] = [];
  let viol = 0;
  const nearChord = (m: number, at: number): number | undefined => [0, 1, -1, 2, -2, 3, -3, 4, -4].map((q) => m + q).find((q) => q >= lo && q <= hi && scale.includes(pcOf(q)) && ct(q, at));
  for (let q = 0; q < sub.length; q++) {
    const x = sub[q];
    let m: number, t: number | undefined;
    if (susp(x)) {
      let land = shift(x.bendTo!, d);
      if (!ct(land, landStep(x) + off)) { const near = nearChord(land, landStep(x) + off); if (near === undefined) return null; land = near; viol++; }
      m = land + (x.midi - x.bendTo!); t = land;
    } else if (x.colour !== undefined && q > 0) {
      const pn = sub[q - 1], was = pn.bendTo ?? pn.midi;
      m = (to[q - 1] ?? midi[q - 1]) + (x.midi - was);
    } else {
      m = shift(x.midi, d);
      if (!x.nb && !x.walk && !x.land && x.colour === undefined && x.len >= 2 - EPS && ct(x.midi, x.step) && !ct(m, x.step + off)) {
        const near = nearChord(m, x.step + off);
        if (near === undefined) return null;
        m = near; viol++;
      }
      if (x.bendTo !== undefined) t = x.bendTo + (m - x.midi);
    }
    if (m < lo || m > hi || (t !== undefined && (t < lo || t > hi))) return null;
    if (!scale.includes(pcOf(m)) && scale.includes(pcOf(x.midi)) && x.colour === undefined) return null;
    midi.push(m); to.push(t);
  }
  return viol <= 2 ? { midi, to, viol } : null;
}

/** The move to use: the same pitches when they fit, else the fewest misfits, then the smallest leap in from `prev`; null when none fits. */
export function bestMove(sub: BandNote[], off: number, prev: number, mv: Mover, lo: number, hi: number): { d: number; r: Placed } | null {
  const fits = SHIFTS.map((d) => ({ d, r: placeCell(sub, off, d, mv, lo, hi) })).filter((f): f is { d: number; r: Placed } => f.r !== null);
  if (!fits.length) return null;
  const leapOf = (f: (typeof fits)[number]) => Math.abs(f.r.midi[0] - prev);
  return fits.reduce((best, f) => (f.r.viol < best.r.viol || (f.r.viol === best.r.viol && best.d !== 0 && (f.d === 0 || leapOf(f) < leapOf(best))) ? f : best), fits[0]);
}

/** A copy of a note `off` steps on, moved to `midi` (and its bend to `to`); `phrase`: the copy ends a whole phrase, so the ending stays. */
export function copyNote(x: BandNote, off: number, midi: number, to: number | undefined, strip: boolean, phrase = false): BandNote {
  const dm = midi - x.midi;
  const cp: BandNote = { ...x, step: x.step + off, midi };
  delete cp.opener; delete cp.endRole; delete cp.endDeg;
  if (!phrase) { delete cp.end; delete cp.style; }
  if (to !== undefined) cp.bendTo = to;
  if (cp.more) cp.more = cp.more.map((y) => ({ ...y, to: y.to + dm }));
  if (strip) { delete cp.bendTo; delete cp.bendAt; delete cp.bendLen; delete cp.inner; delete cp.more; }
  return cp;
}

/** What the repeats have to hold up against: the line as it was, the phrases and bars, the chorus's silence and rule 37's short notes. */
export interface LineGuard { cur: BandNote[]; phrases: Gap[]; G: ReturnType<typeof gridOf>; total: number; ctx: ShapeCtx }

/**
 * The line with the repeats in it (`next`, `copies` the new notes) against the rules: a copy running into the line as written stops where
 * that starts; a colour note stays beside its note; rule 7, rule 20, no leap bigger than the shape's own, the chorus's silence and the
 * share of short notes. `from` to `to`: where the repeats are. Returns why not (and counts it), or null.
 */
export function holdsUp(next: BandNote[], copies: BandNote[], from: number, to: number, cellLeap: number, g: LineGuard): string | null {
  const { cur, phrases, G, total, ctx } = g;
  for (let i = 0; i + 1 < next.length; i++) {
    const over = next[i].step + next[i].len - next[i + 1].step;
    if (over > EPS) {
      if (!copies.includes(next[i]) || next[i].len - over < 1 - EPS) return 'overlap';
      next[i].len -= over;
    }
  }
  // (a colour note goes away from the note before it and straight back: that holds across where the repeats meet the line as written)
  const fin = (x: BandNote) => (x.more?.length ? x.more[x.more.length - 1].to : x.bendTo ?? x.midi);
  for (let i = 0; i < next.length; i++) {
    if (next[i].colour === undefined || next[i].step < from - EPS) continue;
    const pv = next[i - 1], nx = next[i + 1];
    if (!pv || !nx || fin(pv) !== nx.midi || Math.abs(fin(pv) - next[i].midi) !== 1) return 'a colour note cut off from its note';
  }
  if (limitSame(next, MAX_SAME + 2).length !== next.length) return 'rule 7 (too many of a kind in a row)';
  const fixed = fixUnits(next, phrases, ctx.chordAt, G);
  if (!fixed.ok || fixed.notes.some((x, i) => x.len !== next[i].len || x.step !== next[i].step)) return 'rule 20 (a lone short unit)';
  const leapMax = Math.max(12, cellLeap + 2);
  for (let i = 1; i < next.length; i++) {
    if (next[i].step < from - EPS || next[i - 1].step > to + EPS) continue;
    if (Math.abs(next[i].midi - next[i - 1].midi) > leapMax) return 'a leap between the times';
  }
  const cover = (ns: BandNote[]) => ns.reduce((a, n) => a + n.len, 0);
  if (ctx.silence !== undefined) {
    const tol = ctx.silenceTol ?? 0.03, before = Math.abs(1 - cover(cur) / total - ctx.silence), after = Math.abs(1 - cover(next) / total - ctx.silence);
    if (after > Math.max(before, tol + 0.05) + 1e-9) return 'silence share';
  }
  if (ctx.short) {
    const lim = shortLen(G) + EPS;
    const share = (ns: BandNote[]) => ns.filter((n) => n.len <= lim).length / Math.max(1, ns.length);
    const was = share(cur), now = share(next);
    if (now < Math.min(was, (ctx.shortRange?.[0] ?? SHORT_MIN) - 0.05) - 1e-9 || now > Math.max(was, (ctx.shortRange?.[1] ?? SHORT_MAX) + 0.05) + 1e-9) return 'share of short notes';
  }
  return null;
}

/**
 * Inside each phrase: roll none (25%) / A A A' / A A A A'. The shape is the phrase's first `k` beats (1 to 4, mostly a bar or a half bar,
 * the repeats filling at least half of the phrase); it is copied over the beats after it, in the chord's own terms: each note moves by
 * the same number of scale steps, the smallest one (0 when the chord is the same) that keeps every chord note on a chord note of the
 * chord it is over. The last copy is changed, one of: `ending` (the last beat is the line as written: the phrase's own ending), `lift`
 * (the last beat a scale step up or down), `hold` (its last note held on to the end of the shape). A phrase that can't take it
 * (a long hold, a lead-in, third-bar shapes, a surprise, fewer than 4 notes, or the copy breaks rule 7, 20, the key or the range, or
 * the chorus's silence or rule 37's share of short notes) is left as written. Bends inside a note repeat too when the shape is 3/4 bar or
 * more (a shorter one would bend twice in a bar). Dice are drawn from the phrase's seed and start: an answering leaf with the same
 * phrasing makes the same choices.
 */
export function withShapes(notes: BandNote[], phrases: Gap[], barArg: BarArg, total: number, seed: string, ctx: ShapeCtx): { notes: BandNote[]; shapes: ShapeInfo[]; skips: Skips } {
  const G = gridOf(barArg), bar = G.bar;
  const shapes: ShapeInfo[] = [];
  const skips: Skips = {};
  const skip = (why: string) => { skips[why] = (skips[why] ?? 0) + 1; };
  let cur = notes.map((n) => ({ ...n }));
  const mv = moverOf(ctx), { chordOf, shift } = mv;
  const flagged = (n: BandNote) => n.third || n.longHold || n.lead || n.end || n.surprise !== undefined || n.endRole !== undefined;

  for (const ph of phrases) {
    const rng = new Rng(`${seed}|shape|${Math.round(ph.step * 100)}`);
    const rNone = rng.next(), rPat = rng.next(), rMod = rng.next(), rDir = rng.next();
    const rAlt = ctx.alt ? rng.next() : 0;
    if (rNone < NO_SHAPE) { skip('none (the 25%)'); continue; }
    const inside = cur.filter((n) => n.step >= ph.step - EPS && n.step < ph.step + ph.len - EPS);
    if (!inside.length) { skip('empty phrase'); continue; }
    const endNote = inside[inside.length - 1];
    // (the shapes it could be: it starts with the phrase or a beat to three beats in (after a lead-in note); 3 or 4 times, 1 to 4 beats;
    // the repeats fill half the phrase or more)
    const cands: { n: 3 | 4; alt: boolean; k: number; c: number; w: number; cell: BandNote[]; s0: number }[] = [];
    // (the pattern the dice lean to: A A A', A A A A' or, with more shapes, A A' A A')
    const pref = ctx.alt ? (rPat < 1 / 3 ? 'a3' : rPat < 2 / 3 ? 'a4' : 'alt') : rPat < 0.5 ? 'a3' : 'a4';
    for (let j = 0; j <= 3; j++) {
      const s0 = j ? ph.step + G.forwardLen(ph.step, j) : ph.step;
      for (const pat of ctx.alt ? ['a3', 'a4', 'alt'] as const : ['a3', 'a4'] as const) {
        const n = pat === 'a3' ? 3 : 4, alt = pat === 'alt';
        for (let k = alt ? 2 : 1; k <= 4; k++) {
          const c = G.forwardLen(s0, k);
          let even = c > 0;
          for (let i = 1; i < n && even; i++) if (G.forwardLen(s0 + i * c, k) !== c) even = false;
          if (!even) { skip('c: uneven beats'); continue; }
          if (s0 + n * c > ph.step + ph.len + EPS) { skip('c: too long'); continue; }
          if (n * c < 0.5 * ph.len - EPS) { skip('c: under 50% of phrase'); continue; }
          const cell = inside.filter((x) => x.step >= s0 - EPS && x.step < s0 + c - EPS);
          if (cell.length < (c >= 2 * G.beat - EPS ? 1 : 2)) { skip('c: under 2 notes'); continue; }
          // (the last note of the shape may run on into the next beat: the shape takes the part of it that is inside)
          const over = cell.filter((x) => x.step + x.len > s0 + c + EPS);
          if (over.length > 1 || (over.length === 1 && (over[0] !== cell[cell.length - 1] || s0 + c - over[0].step < 2 - EPS || over[0].bendTo !== undefined))) { skip('c: a note runs over'); continue; }
          if (cell.some(flagged)) { skip('c: flagged note'); continue; }
          if (cell[0].colour !== undefined || cell[cell.length - 1].colour !== undefined) { skip('c: colour note at an end'); continue; }
          // (what the repeats replace: no long hold, lead-in, third-bar shape or surprise; the phrase's own last note only when it is the ending)
          if (inside.some((x) => x.step >= s0 + c - EPS && x.step < s0 + n * c - EPS && (x.longHold || x.lead || x.third || x.surprise !== undefined))) { skip('c: a long hold etc. under it'); continue; }
          const w = (n * c / ph.len) ** 2 * (Math.abs(c - bar) < 1.5 || Math.abs(c - bar / 2) < 1.5 ? 2 : 1) * (pat === pref ? 2 : 1) * [1, 0.6, 0.45, 0.35][j];
          cands.push({ n, alt, k, c, w, cell: cell.map((x) => (x.step + x.len > s0 + c + EPS ? { ...x, len: s0 + c - x.step } : x)), s0 });
        }
      }
    }
    if (!cands.length) { skip('no shape fits'); continue; }
    // (the candidates in a drawn order; the first that holds up is used)
    const order: typeof cands = [];
    const pool = cands.slice();
    while (pool.length && order.length < 8) {
      const pick = rng.weighted(pool.map((x) => [x, x.w] as const));
      order.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    let done = false;
    // (a try: this shape with this change to the last time; null when it doesn't hold up)
    const attempt = (cand: (typeof cands)[number], mod: ShapeMod, mid?: ShapeMod): ShapeInfo & { notes: BandNote[] } | null => {
      const { n, c, cell, s0 } = cand;
      const last = s0 + (n - 1) * c, end = s0 + n * c;
      const lastBeat = G.backLen(end, 1);
      const split = endIn(end) ? endNote.step : end - lastBeat;
      const removedTo = mod === 'ending' ? split : end;
      const keep = cur.filter((x) => x.step < s0 + c - EPS || x.step >= removedTo - EPS).map((x) => cell.find((y) => y.step === x.step && y !== x && y.midi === x.midi) ?? x);
      const lo = Math.min(ctx.range.lo, ...cell.map((x) => x.midi)) - 2, hi = Math.max(ctx.range.hi, ...cell.map((x) => x.midi)) + 2;
      const cellLeap = cell.reduce((a2, x, i) => (i ? Math.max(a2, Math.abs(x.midi - cell[i - 1].midi)) : a2), 0);
      const strip = c < 0.75 * bar - EPS;
      const copies: BandNote[] = [];
      const used: number[] = [];
      if (strip && cell.some(susp)) { skip('a delayed resolution in a short shape'); return null; }
      let prev = cell[cell.length - 1];
      for (let i = 1; i < n; i++) {
        const off = i * c;
        const sub = i === n - 1 && mod === 'ending' ? cell.filter((x) => x.step + off < removedTo - EPS) : cell;
        if (!sub.length) { skip('nothing of the shape before the ending'); return null; }
        if (sub[sub.length - 1].colour !== undefined) { skip('cut inside a colour note'); return null; }
        const pick = bestMove(sub, off, prev.midi, mv, lo, hi);
        if (!pick) { skip('chords: no move fits'); return null; }
        used.push(pick.d);
        sub.forEach((x, q) => copies.push(copyNote(x, off, pick.r.midi[q], pick.r.to[q], strip)));
        prev = copies[copies.length - 1];
      }
      // (a time, changed: `how` is lift (its last beat a scale step up or down) or hold (its last note held on to its end))
      const change = (from0: number, to: number, how: ShapeMod, dir: number): boolean => {
        const slot = copies.filter((x) => x.step >= from0 - EPS && x.step < to - EPS);
        if (how === 'lift') {
          const from = to - G.backLen(to, 1);
          const moved = slot.filter((x) => x.step >= from - EPS);
          if (!moved.length) { skip('nothing to lift'); return false; }
          if (moved.some((x) => x.colour !== undefined || susp(x))) { skip('nothing to lift'); return false; }
          for (const x of moved) {
            const m = shift(x.midi, dir), dm = m - x.midi;
            if (m < lo || m > hi) { skip('lift out of range'); return false; }
            x.midi = m;
            if (x.bendTo !== undefined) x.bendTo += dm;
            if (x.more) x.more = x.more.map((y) => ({ ...y, to: y.to + dm }));
          }
        } else if (how === 'hold') {
          const x = slot[slot.length - 1];
          const e = x ? x.step + x.len : 0;
          let steady = !!x && to - e >= 2 - EPS;
          for (let s = Math.floor(e + EPS); steady && s < to - EPS; s++) {
            const a2 = chordOf(x.step), b2 = chordOf(s);
            if (a2 && b2 && (a2.root !== b2.root || a2.q !== b2.q)) steady = false;
          }
          if (!steady || x.colour !== undefined || susp(x)) { skip('no room to hold'); return false; }
          x.len = to - x.step;
        }
        return true;
      };
      // (the last time, changed; with more shapes the 2nd time too, in its own way)
      if (mid && !change(s0 + c, s0 + 2 * c, mid, (rAlt * 13.7) % 1 < 0.5 ? 1 : -1)) return null;
      if (!change(last, end, mod, rDir < 0.5 ? 1 : -1)) return null;
      // (a copy running into the line as written, where the last time hands over to it, stops where that starts)
      const next = [...keep, ...copies].sort((a2, b2) => a2.step - b2.step || a2.len - b2.len);
      const why = holdsUp(next, copies, s0, end, cellLeap, { cur, phrases, G, total, ctx });
      if (why) { skip(why); return null; }
      return { phrase: ph.step, n, step: s0, len: c, mod, shifts: used, ...(cand.alt ? { alt: true as const, mids: mid } : {}), notes: next };
    };
    // (whether the phrase's last note comes in before the shapes end)
    const endIn = (end: number) => endNote.step < end - EPS;
    for (const cand of order) {
      const end = cand.s0 + cand.n * cand.c, last = cand.s0 + (cand.n - 1) * cand.c;
      const split = endIn(end) ? endNote.step : end - G.backLen(end, 1);
      const mods: [ShapeMod, number][] = [];
      if (split - last >= 0.3 * cand.c - EPS) mods.push(['ending', 0.5]);
      if (!endIn(end)) mods.push(['lift', 0.3], ['hold', 0.2]);
      if (!mods.length) { skip('shape too short to end'); continue; }
      // (the changes in a drawn order: the first that holds up; A A' A A': the 2nd time's change in a drawn order too, tried outside)
      const drawn = (list: [ShapeMod, number][], r0: number): ShapeMod[] => {
        const left = list.slice(), res: ShapeMod[] = [];
        let r = r0;
        while (left.length) {
          let q = r * left.reduce((a2, [, w]) => a2 + w, 0), at = left.length - 1;
          for (let i = 0; i < left.length; i++) { q -= left[i][1]; if (q < 0) { at = i; break; } }
          res.push(left.splice(at, 1)[0][0]);
          r = (r * 7.31) % 1;
        }
        return res;
      };
      const lastOrder = drawn(mods, rMod);
      const midOrder: (ShapeMod | undefined)[] = cand.alt ? drawn([['lift', 0.6], ['hold', 0.4]], rAlt) : [undefined];
      for (const mid of midOrder) {
        for (const mod of lastOrder) {
          const got = attempt(cand, mod, mid);
          if (got) { cur = got.notes; const { notes: _n, ...info } = got; shapes.push(info); done = true; break; }
        }
        if (done) break;
      }
      if (done) break;
    }
    if (!done) skip('no shape held up');
  }
  return { notes: cur, shapes, skips };
}
