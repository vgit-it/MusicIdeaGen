// Three rewrite rules written for step 1 of the solo player (docs/SOLO-PLAYER.md), to prove the frame: timing between the 16ths, the
// identity contract, the checker and the hands. They re-play a long note on its own pitch (a triplet pulse, a gallop, a stutter) and
// then hold it. Used by `npm run solo-player-check` only; heard nowhere. The real rules (with taste, mood, energy and drums) are step 3.

import { type PEvent, snap } from './soloevents';
import type { Rule, Span } from './solorules';
import { beatAt } from './soloverify';

/** A plain picked note: nothing else on it that a re-picking would lose. */
function plainPick(s: Span): boolean {
  const h = s.event.hit;
  return !h.mute && h.notes.length === 1 && !h.bend && !h.lateBend && !h.unbend && !h.trill && !h.tremolo && !h.slide && !h.rake && !h.swell && !h.letRing
    && (h.art === undefined || h.art === 'pick');
}

/** The note re-picked `lens.length` times with these lengths, then the rest of it held as the note was. */
function repick(s: Span, lens: number[], loud: number): PEvent[] | null {
  const n = s.note, h = s.event.hit;
  const total = lens.reduce((a, b) => a + b, 0);
  if (n.len - total < 2 - 1e-6) return null;
  const out: PEvent[] = [];
  let t = n.t;
  lens.forEach((len, j) => {
    const { vib: _v, ...rest } = h;
    out.push({ t: snap(t), len: snap(len), base: n.i, hit: { ...rest, vel: Math.min(1, h.vel * (0.82 + loud * (j / lens.length))), exact: true } });
    t += len;
  });
  out.push({ t: snap(t), len: snap(n.t + n.len - t), base: n.i, hit: h });
  return out;
}

export const TRIPLET_PULSE: Rule = {
  name: 'triplet-pulse', keeps: 'main',
  weight: (s) => (plainPick(s) && s.note.len >= 6 ? 1 : 0),
  realise: (s, rng) => {
    const u = beatAt(s.ctx.song, s.note.t) / 3;
    const k = rng.pick([3, 6]);
    return repick(s, Array(k).fill(u), 0.2) ?? repick(s, Array(3).fill(u), 0.2);
  },
};

export const GALLOP: Rule = {
  name: 'gallop', keeps: 'main',
  weight: (s) => (plainPick(s) && s.note.len >= 6 ? 1 : 0),
  realise: (s, rng) => {
    const r = rng.pick([1, 2]);
    return repick(s, Array.from({ length: r }, () => [2, 1, 1]).flat(), 0.2) ?? repick(s, [2, 1, 1], 0.2);
  },
};

export const STUTTER: Rule = {
  name: 'stutter-hold', keeps: 'main',
  weight: (s) => (plainPick(s) && s.note.len >= 5 ? 1 : 0),
  realise: (s) => repick(s, [1, 1, 1], 0.15),
};

export const SPIKE_RULES: Rule[] = [TRIPLET_PULSE, GALLOP, STUTTER];
