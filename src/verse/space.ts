// Rule 38, use the space: a short note, or a held ending, with a big gap after it is held on into the gap (a breath left before the next
// note). A repeated phrase (a leaf answering an earlier one: A', A'') does it most, so the repeat ends longer than the first time.
// The long notes this makes (and every note of 3/4 bar or more) bend more often: that part lives in `addNoteBends` (rule 15).

import { Rng } from '../rng';
import type { BarArg } from './grid';
import { gridOf } from './grid';
import { SHORT_MIN, shortLen } from './longer';
import type { Chord } from '../theory';
import { fifth, third, type BandNote } from './verse';

const EPS = 1e-6;

/** How a leaf is written: how many times it repeats an earlier one (0: written fresh), and whether it is the section's last. */
export interface SpaceCtx { repeat: number; final: boolean }

/**
 * A note followed by a gap of 3/4 bar or more (to the next note, or the end of the leaf) takes more of it, up to a beat before
 * the next note (the leaf's own beat of silence, when the next note is in the next leaf):
 *   - a short plain note (an 8th or less) becomes a beat to a bar long, a beat and a half to two beats most often; 75% of them, 90% in a repeat;
 *   - a held ending (not a punch, not a lead-in) is held on by half a beat or more, a bar in all at most; 30% of them, in a repeat 70% (80% the
 *     second time it repeats, up to 90%), and a repeat favours the longest.
 * It ends on a beat or half beat. Over a chord change it goes on only if its pitch is a note of the new chord too (or the chord it sits on
 * is the chord there). A short note is left alone where it would take the section under 35% short
 * notes (rule 37's floor). `len`: steps in the leaf; `chordAt`: the chord on each step of it.
 */
export function withSpace(notes: BandNote[], barArg: BarArg, len: number, key: number, chordAt: Chord[], seed: string, ctx: SpaceCtx): BandNote[] {
  const G = gridOf(barArg), lim = shortLen(G) + EPS, bar = G.bar, beat = G.beat;
  const out = notes.map((n) => ({ ...n }));
  let nShort = out.filter((n) => n.len <= lim).length;
  // (a leaf that isn't the last ends on a beat of silence: the next leaf may start right after it)
  const tailEnd = ctx.final ? len : len - Math.max(1, G.backLen(len, 1));
  for (let i = 0; i < out.length; i++) {
    const a = out[i], nx = out[i + 1], aEnd = a.step + a.len;
    const short = a.len <= lim && !a.end, held = !!a.end && a.style !== 'punch';
    if (!short && !held) continue;
    if (a.third || a.lead || a.opener || a.longHold || a.nb || a.walk || a.land || a.slide !== undefined) continue;
    if ((nx ? nx.step : len) - aEnd < 0.75 * bar - EPS) continue;
    const limit = nx ? nx.step - beat : ctx.final ? len - beat : tailEnd;
    const rng = new Rng(`${seed}|space|${Math.round(a.step * 100)}`);
    const p = short ? (ctx.repeat ? 0.9 : 0.75) : ctx.repeat ? Math.min(0.9, 0.6 + 0.1 * ctx.repeat) : 0.3;
    if (!rng.chance(p)) continue;
    if (short && (nShort - 1) / out.length < SHORT_MIN) continue;
    // (the beats and half beats it may end on)
    const beats = G.beatSteps(Math.max(0, Math.floor(aEnd) - 1), Math.ceil(limit) + 1);
    const ends = beats.flatMap((b, k) => (k + 1 < beats.length ? [b, Math.round((b + beats[k + 1]) / 2)] : [b]));
    const cand = [...new Set(ends)].filter((e) => {
      if (e <= aEnd + EPS || e > limit + EPS || e - a.step > bar + EPS) return false;
      if (short ? e - a.step < beat - EPS : e - aEnd < beat / 2 - EPS) return false;
      // (every step it would take: the chord it started on, or one with its pitch in it)
      const pc = ((a.midi % 12) + 12) % 12, home = chordAt[Math.min(chordAt.length - 1, Math.floor(a.step + EPS))];
      for (let t = Math.floor(aEnd + EPS); t < e - EPS; t++) {
        const c = chordAt[Math.min(chordAt.length - 1, t)];
        if (c && home && (c.root !== home.root || c.q !== home.q) && ![0, third(c), fifth(c)].some((x) => (key + c.root + x) % 12 === pc)) return false;
      }
      return true;
    });
    if (!cand.length) continue;
    const weight = (e: number): number => {
      if (short) { const b = (e - a.step) / beat; return b <= 1.01 ? 1 : b <= 1.51 ? 3 : b <= 2.01 ? 3 : b <= 3.01 ? 2 : 1; }
      return ctx.repeat ? 1 + (e - aEnd) / beat : 1;
    };
    const to = rng.weighted(cand.map((e) => [e, weight(e)] as const));
    out[i] = { ...a, len: to - a.step };
    if (short) nShort--;
  }
  return out;
}
