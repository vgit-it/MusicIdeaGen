// Rule 45, more shapes (the bar-long and two-bar kind): in a called section (a verse, chorus or bridge of 8 or 16 bars: 4-bar leaves, each a call on
// bars 1-2 and a response on bars 3-4) a shape of one bar or two is sung again across the phrases. It runs on the finished section, after every leaf
// is written, and copies the first time over the bars after it, moved with the chords:
//   one bar,  A A' A A'   over one leaf (4 bars):  bar 1 as written, bar 2 the call's ending (A' = A up to the call's own last note),
//                          bar 3 A again (the response comes in on it), bar 4 the response's ending (A' = A up to its own last note)
//   two bars, A A' A A'   over two leaves (8 bars): the call, the response (A up to its own ending), the call again, the response (A up to its own ending)
//             A A A A'    the call three times (the response and the next call are copies, with the call's ending), the last response its own ending
//             A A A'      6 bars: the call, the response as a copy of it, the next call changed (its own ending); the next response as written
// A' is always "the shape up to where the phrase's own last note comes in, then that note as written": so every phrase end keeps its degree, its
// style and its job (the section's last one stays home, a lead-in stays), and each A' differs from the others by what its own phrase ends on.
// What the copies replace (a long hold, a third-bar bar, a surprise, a mood note) is replaced; a lead-in is never.

import { Rng } from '../rng';
import { gridOf, type BarArg } from './grid';
import { bestMove, copyNote, holdsUp, moverOf, type Mover, type ShapeCtx, type ShapeInfo, type Skips } from './shapes';
import type { BandNote, Gap } from './verse';

const EPS = 1e-6;

/** The chance that a half of the section (8 bars) gets a two-bar shape, and that a leaf (4 bars) is left with a bar-long A A' A A'. */
export const BIG_TWO = 0.3;
export const BIG_ONE = 0.15;

type Kind = 'alt1' | 'alt2' | 'aaaa2' | 'aaa2';
/** The slots of a shape: A (as written), C (a copy), E (a copy up to the phrase's own ending, which stays). */
const KINDS: Record<Kind, { bars: number; slots: ('A' | 'C' | 'E')[] }> = {
  alt1: { bars: 1, slots: ['A', 'E', 'C', 'E'] },
  alt2: { bars: 2, slots: ['A', 'E', 'C', 'E'] },
  aaaa2: { bars: 2, slots: ['A', 'C', 'C', 'E'] },
  aaa2: { bars: 2, slots: ['A', 'C', 'E'] },
};
const TWO: [Kind, number][] = [['alt2', 5], ['aaaa2', 2], ['aaa2', 3]];

export interface BigCtx extends ShapeCtx {
  /** Bars in the section. */
  bars: number;
  /** Whether a finished line keeps rule 43 (no more sets of notes than the slider allows), leaf by leaf; left out: no such limit. */
  setsHold?: (ns: BandNote[]) => boolean;
}

/** The chord a note sits over, as a name: a shape moves in one go while it stays on it. */
const chordKey = (mv: Mover, step: number): string => { const c = mv.chordOf(step); return c ? `${c.root}|${c.q}` : ''; };

export function withBigShapes(notes: BandNote[], phrases: Gap[], barArg: BarArg, total: number, seed: string, ctx: BigCtx): { notes: BandNote[]; shapes: ShapeInfo[]; zones: [number, number][]; skips: Skips } {
  const G = gridOf(barArg), bars = ctx.bars;
  const mv = moverOf(ctx);
  const rng = new Rng(`${seed}|big`);
  const startOf = (b: number) => (b >= bars ? total : G.start(b));
  const shapes: ShapeInfo[] = [];
  const zones: [number, number][] = [];
  const skips: Skips = {};
  const skip = (why: string) => { skips[`big: ${why}`] = (skips[`big: ${why}`] ?? 0) + 1; };
  let cur = notes.map((n) => ({ ...n }));
  const used = new Set<number>();

  // (the dice first, so what is drawn doesn't depend on what holds up: a half's try, then each leaf's)
  const plan: { bar: number; kinds: Kind[] }[] = [];
  for (let h = 0; h < bars / 8; h++) {
    const r = rng.next(), first = rng.weighted(TWO.map(([k, w]) => [k, w] as const));
    if (r >= BIG_TWO) continue;
    plan.push({ bar: h * 8, kinds: [first, ...TWO.map(([k]) => k).filter((k) => k !== first)] });
  }
  const ones: number[] = [];
  for (let l = 0; l < bars / 4; l++) if (rng.next() < BIG_ONE) ones.push(l * 4);
  for (const bar of ones) plan.push({ bar, kinds: ['alt1'] });

  /** One try: this kind from this bar; the new line and what it says, or null (counted). */
  const attempt = (kind: Kind, bar0: number): { notes: BandNote[]; info: ShapeInfo; zone: [number, number][] } | null => {
    const { bars: la, slots } = KINDS[kind], n = slots.length;
    if (bar0 + n * la > bars) { skip('does not fit'); return null; }
    const t = Array.from({ length: n + 1 }, (_, i) => startOf(bar0 + i * la));
    const len = t[1] - t[0];
    for (let i = 1; i < n; i++) if (Math.abs(t[i + 1] - t[i] - len) > EPS) { skip('uneven bars'); return null; }
    const s0 = t[0];
    // (the shape: the notes that start in its bar(s); the last may run on over the end, the shape taking the part inside)
    const inCell = cur.filter((x) => x.step >= s0 - EPS && x.step < t[1] - EPS);
    const over = inCell.filter((x) => x.step + x.len > t[1] + EPS);
    if (over.length > 1 || (over.length === 1 && (over[0] !== inCell[inCell.length - 1] || t[1] - over[0].step < 2 - EPS || over[0].bendTo !== undefined))) { skip('a note runs over'); return null; }
    const cell = inCell.map((x) => (x.step + x.len > t[1] + EPS ? { ...x, len: t[1] - x.step } : x));
    if (cell.length < (la === 1 ? 2 : 3)) { skip('too few notes'); return null; }
    if (cell.some((x) => x.third || x.longHold || x.lead || x.surprise !== undefined)) { skip('a long hold etc. in the shape'); return null; }
    if (cell[0].colour !== undefined || cell[cell.length - 1].colour !== undefined) { skip('colour note at an end'); return null; }
    const lo = Math.min(ctx.range.lo, ...cell.map((x) => x.midi)) - 2, hi = Math.max(ctx.range.hi, ...cell.map((x) => x.midi)) + 2;
    const cellLeap = cell.reduce((a, x, i) => (i ? Math.max(a, Math.abs(x.midi - cell[i - 1].midi)) : a), 0);
    const copies: BandNote[] = [];
    const zone: [number, number][] = [];
    const shifts: number[] = [];
    const changed: number[] = [];
    let prev = cell[cell.length - 1].midi;
    for (let i = 1; i < n; i++) {
      const off = t[i] - s0;
      let sub = cell, removedTo = t[i + 1];
      if (slots[i] === 'E') {
        // (the phrase that ends in this bar or these bars keeps its last note, and everything from it)
        const ph = phrases.find((p) => p.step + p.len > t[i] + EPS && p.step + p.len <= t[i + 1] + EPS);
        const endNote = ph && [...cur].reverse().find((x) => x.step >= ph.step - EPS && x.step < ph.step + ph.len - EPS);
        if (!ph || !endNote || endNote.step < t[i] - EPS) { skip('no phrase end there'); return null; }
        if (endNote.step - t[i] < 0.3 * len - EPS) { skip('its ending comes too soon'); return null; }
        removedTo = endNote.step;
        sub = cell.filter((x) => x.step + off < removedTo - EPS);
        if (sub.length < Math.min(2, cell.length)) { skip('nothing of the shape before the ending'); return null; }
        changed.push(i);
      }
      if (cur.some((x) => x.lead && x.step >= t[i] - EPS && x.step < removedTo - EPS)) { skip('a lead-in under it'); return null; }
      if (sub[sub.length - 1].colour !== undefined) { skip('cut inside a colour note'); return null; }
      zone.push([t[i], removedTo]);
      // (moved with the chords: in one go while the chord stays, a colour note staying with the note before it; each part picks the move
      // that keeps its chord notes, the same pitches where they fit, else the smallest leap from the part before)
      const parts: BandNote[][] = [];
      for (const x of sub) {
        const last = parts[parts.length - 1];
        if (!last || (x.colour === undefined && chordKey(mv, x.step + off) !== chordKey(mv, last[last.length - 1].step + off))) parts.push([x]);
        else last.push(x);
      }
      let viol = 0;
      let before = prev;
      const moved: { x: BandNote; midi: number; to: number | undefined }[] = [];
      for (const part of parts) {
        const pick = bestMove(part, off, before, mv, lo, hi);
        if (!pick) { skip('chords: no move fits'); return null; }
        viol += pick.r.viol;
        shifts.push(pick.d);
        part.forEach((x, q) => moved.push({ x, midi: pick.r.midi[q], to: pick.r.to[q] }));
        before = pick.r.midi[pick.r.midi.length - 1];
      }
      if (viol > 3) { skip('chords: too many misfits'); return null; }
      for (const m of moved) copies.push(copyNote(m.x, off, m.midi, m.to, false, la === 2 && slots[i] === 'C'));
      prev = copies[copies.length - 1].midi;
    }
    // (every note belongs to a phrase: a copy that would start in a breath isn't allowed; the call's breath is a beat or two beats long)
    if (copies.some((c) => !phrases.some((p) => c.step >= p.step - EPS && c.step < p.step + p.len - EPS))) { skip('a copy outside the phrases'); return null; }
    const inZone = (x: BandNote) => zone.some(([a, b]) => x.step >= a - EPS && x.step < b - EPS);
    const keep = cur.filter((x) => !inZone(x)).map((x) => cell.find((y) => y.step === x.step && y !== x && y.midi === x.midi) ?? x);
    const next = [...keep, ...copies].sort((a, b) => a.step - b.step || a.len - b.len);
    const why = holdsUp(next, copies, t[1], t[n], cellLeap, { cur, phrases, G, total, ctx });
    if (why) { skip(why); return null; }
    if (ctx.setsHold && !ctx.setsHold(next)) { skip('rule 43 (sets of notes)'); return null; }
    const p0 = phrases.find((p) => p.step <= s0 + EPS && p.step + p.len > s0 + EPS);
    return {
      notes: next, zone,
      info: { phrase: p0?.step ?? s0, n: n as 3 | 4, step: s0, len, mod: 'ending', shifts, bars: la, changed, ...(changed.length === 2 ? { alt: true as const } : {}) },
    };
  };

  for (const { bar, kinds } of plan) {
    const la = KINDS[kinds[0]].bars;
    // (a half that took a two-bar shape has no room for a bar-long one in it)
    if (la === 1 && [0, 1, 2, 3].some((i) => used.has(bar + i))) { skip('bars already taken'); continue; }
    let done = false;
    for (const kind of kinds) {
      const got = attempt(kind, bar);
      if (!got) continue;
      cur = got.notes; shapes.push(got.info); zones.push(...got.zone);
      for (let i = 0; i < KINDS[kind].slots.length * KINDS[kind].bars; i++) used.add(bar + i);
      done = true;
      break;
    }
    if (!done) skip('no shape held up');
  }
  return { notes: cur, shapes, zones, skips };
}
