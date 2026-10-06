// Drum bars per meter, arranged as a phrase, with fills, crashes and cross-bar cycles.

import { type DrumStyle, type Genre, GENRES, type HatPattern } from '../genres';
import type { DrumPart, Song } from '../idea';
import type { Rng } from '../rng';
import { type Variant, groupStarts, zeros } from '../rhythm';

interface DrumBar {
  K: number[]; S: number[]; H: number[]; O: number[]; R: number[]; T: number[];
}

interface BarOpts {
  fourFloor: boolean;
  halfTime: boolean;
  hat: HatPattern;
  ride: boolean;
}

function drumBar(rng: Rng, len: number, groups: number[], ds: DrumStyle, w: number, o: BarOpts): DrumBar {
  const K = zeros(len), S = zeros(len), H = zeros(len), O = zeros(len), R = zeros(len), T = zeros(len);
  const st = groupStarts(groups), n = st.length;
  st.forEach((p, i) => {
    if (o.fourFloor) K[p] = 0.95;
    if (o.halfTime) {
      if (i === 0) K[p] = 0.95;
      if (i === Math.floor(n / 2)) S[p] = 0.9;
    } else if (i % 2 === 0) K[p] = 0.95;
    else S[p] = 0.9;
  });
  for (let i = 1; i < len; i++) {
    if (K[i] || S[i]) continue;
    const even = i % 2 === 0;
    if (rng.chance((even ? ds.kick8 : ds.kick16) * (0.6 + w))) K[i] = 0.8;
    else if (!even && rng.chance(ds.ghost * (0.7 + w * 0.6))) S[i] = 0.2;
  }
  const cym = o.ride ? R : H;
  for (let i = 0; i < len; i++) {
    const isStart = st.includes(i);
    if (o.hat === '16') cym[i] = isStart ? 0.65 : i % 2 ? 0.3 : 0.45;
    else if (o.hat === '8') { if (i % 2 === 0) cym[i] = isStart ? 0.65 : 0.45; }
    else if (o.hat === 'off') { if (i % 2 === 0 && !isStart) cym[i] = 0.55; }
  }
  // open hat on the last off-beat 8th, closed by the next downbeat
  if (!o.ride && o.hat !== 'off' && len >= 8 && rng.chance(ds.openHat)) {
    const i = len - 2;
    H[i] = 0; O[i] = 0.6;
    if (o.hat === '16') H[i + 1] = 0;
  }
  return { K, S, H, O, R, T };
}

const copyBar = (b: DrumBar): DrumBar => ({
  K: [...b.K], S: [...b.S], H: [...b.H], O: [...b.O], R: [...b.R], T: [...b.T],
});

function varyBar(rng: Rng, b: DrumBar, len: number, groups: number[], w: number): DrumBar {
  const v = copyBar(b), st = groupStarts(groups);
  const free = [...Array(len).keys()].filter((i) => i > 0 && !st.includes(i));
  for (let k = 0; k < 1 + Math.round(w * 3); k++) {
    const i = rng.pick(free);
    v.K[i] = v.K[i] ? 0 : 0.8;
  }
  if (w > 0.4 && rng.chance(0.6)) {
    const i = rng.pick(free.filter((j) => j % 2));
    v.S[i] = v.S[i] ? 0 : 0.6;
  }
  return v;
}

/** Writes a fill over the end of the bar. Returns its length in 16ths. */
function addFill(rng: Rng, b: DrumBar, len: number, groups: number[], w: number, genre: Genre): number {
  const lastGroup = groups[groups.length - 1];
  const F = w > 0.75 && rng.chance(0.25)
    ? len
    : rng.chance(0.35 + w * 0.4) ? Math.min(len, lastGroup + (groups[groups.length - 2] ?? 0)) : lastGroup;
  const s0 = len - F;
  for (let i = s0; i < len; i++) {
    b.K[i] = 0; b.S[i] = 0; b.T[i] = 0; b.O[i] = 0;
    if (F > 4) { b.H[i] = 0; b.R[i] = 0; }
  }
  const type = genre === 'funk' ? rng.pick(['ghostroll', 'sync', 'toms']) : rng.pick(['roll', 'toms', 'toms', 'sync']);
  for (let j = 0; j < F; j++) {
    const i = s0 + j, pr = j / F;
    if (type === 'roll' && (j % 2 === 0 || F <= 4 || rng.chance(0.5))) b.S[i] = 0.35 + 0.6 * pr;
    if (type === 'ghostroll') b.S[i] = j % 2 ? 0.2 : 0.4 + 0.5 * pr;
    if (type === 'toms' && rng.chance(0.85)) b.T[i] = Math.min(3, 1 + Math.floor(pr * 3));
    if (type === 'sync' && [0, 3, 6, 7, 10, 12, 14, 15].includes(j % 16)) {
      if (j % 2) b.S[i] = 0.85;
      else b.T[i] = 1 + (j % 3);
    }
  }
  b.K[s0] = 0.9;
  return F;
}

const CRASH_CHANCE: Record<Genre, number> = { rock: 1, pop: 0.8, funk: 0.45 };

export function generateDrums(rng: Rng, song: Song): DrumPart {
  const { w, bars, total, groupsFor, plan } = song;
  const genre = song.partGenres.drums;
  const ds = GENRES[genre].drum;

  const base: BarOpts = {
    fourFloor: rng.chance(ds.fourFloor),
    halfTime: rng.chance(ds.halfTime),
    hat: rng.pick(ds.hats),
    ride: false,
  };
  const rideB = rng.chance(ds.ride * (0.6 + w));
  const variants: Record<string, Record<Variant, DrumBar>> = {};
  for (const [m, gr] of Object.entries(groupsFor)) {
    const len = gr.reduce((a, b) => a + b, 0);
    const A = drumBar(rng, len, gr, ds, w, base);
    variants[m] = {
      A,
      A2: varyBar(rng, A, len, gr, w),
      B: drumBar(rng, len, gr, ds, w, { ...base, hat: rng.chance(0.5) ? base.hat : rng.pick(ds.hats), ride: rideB }),
      C: drumBar(rng, len, gr, ds, w, { ...base, halfTime: !base.halfTime }),
    };
  }

  const L = {
    kick: zeros(total), snare: zeros(total), hat: zeros(total), hatOpen: zeros(total),
    ride: zeros(total), crash: zeros(total), tom: zeros(total),
  };
  const fills: DrumPart['fills'] = [];
  bars.forEach((b, i) => {
    const v = copyBar(variants[b.meter][plan[i]]);
    if (i === 7 || (i === 3 && rng.chance(0.6 + w * 0.4))) {
      fills.push({ bar: i, len: addFill(rng, v, b.len, b.groups, w, genre) });
    } else if (w > 0.6 && rng.chance(0.25)) {
      v.T[b.len - 2] = 2;
      v.T[b.len - 1] = 3;
    }
    for (let j = 0; j < b.len; j++) {
      const g = b.start + j;
      L.kick[g] = v.K[j]; L.snare[g] = v.S[j]; L.hat[g] = v.H[j];
      L.hatOpen[g] = v.O[j]; L.ride[g] = v.R[j]; L.tom[g] = v.T[j];
    }
  });

  // crash on the top of the loop and after each fill (or when a new section starts)
  const crashBars = new Set<number>([0]);
  for (const f of fills) if (f.bar < 7) crashBars.add(f.bar + 1);
  plan.forEach((_, i) => { if (i > 0 && plan[i] !== plan[i - 1] && plan[i] !== 'A2' && rng.chance(0.4)) crashBars.add(i); });
  for (const bi of crashBars) {
    if (bi > 0 && !rng.chance(CRASH_CHANCE[genre])) continue;
    if (bi === 0 && !rng.chance(CRASH_CHANCE[genre] * 0.9)) continue;
    const g = bars[bi].start;
    L.crash[g] = 0.85;
    L.hat[g] = 0;
    L.ride[g] = 0;
    L.kick[g] = Math.max(L.kick[g], 0.9);
  }

  // polyrhythmic cycles crossing the bar line
  for (const c of song.cycles) {
    if (c.part === 'hat') {
      for (let g = 0; g < total; g++) {
        L.hat[g] = g % c.len === 0 ? 0.65 : c.len >= 6 && g % c.len === Math.floor(c.len / 2) ? 0.35 : 0;
        L.hatOpen[g] = 0;
        L.ride[g] = 0;
      }
    }
    if (c.part === 'kick') {
      for (let g = 0; g < total; g++) if (g % c.len === 0 && !L.snare[g]) L.kick[g] = Math.max(L.kick[g], 0.8);
    }
  }

  return { ...L, fills, halfTime: base.halfTime, fourFloor: base.fourFloor };
}
