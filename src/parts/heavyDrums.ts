// Drums for riff genres: the kick locks to the guitar, sections change the feel
// (quiet verse, half-time riff, washy chorus), and the band stops together.

import { GENRES } from '../genres';
import type { DrumPart, Song } from '../idea';
import type { Rng } from '../rng';
import { groupStarts, zeros } from '../rhythm';
import { type DrumBar, addFill } from './drums';
import type { RiffPart } from './riff';

type Cymbal = 'hat8' | 'hat16' | 'ride' | 'openhat' | 'crashride' | 'hat4' | 'ride4';

export function generateHeavyDrums(rng: Rng, song: Song, riff: RiffPart): DrumPart {
  const { w, bars, total } = song;
  const sections = song.sections!;
  const genre = song.genre;
  const G = GENRES[genre];
  const R = G.riff!;

  const L = {
    kick: zeros(total), snare: zeros(total), hat: zeros(total), hatOpen: zeros(total),
    ride: zeros(total), crash: zeros(total), tom: zeros(total),
  };
  const fills: DrumPart['fills'] = [];
  // quiet intros: drums sometimes wait a bar or two
  const rolledTacet = sections[0] === 'arp' && rng.chance(0.45) ? rng.pick([1, 2]) : 0;
  const tacet = song.noTacet ? 0 : rolledTacet;
  const crashBars = new Set<number>();
  let firstHalf = false;

  [[0, 1, 2, 3], [4, 5, 6, 7]].forEach((run, ri) => {
    const style = sections[run[0]];
    const rolledHalf = rng.chance(style === 'big' ? R.halfTime * 0.5 : R.halfTime);
    const half = song.forceHalf ?? rolledHalf;
    if (ri === 0) firstHalf = half;
    let cym: Cymbal = style === 'arp' ? rng.pick(['hat8', 'hat8', 'ride'] as const)
      : style === 'big' ? rng.pick(['ride', 'openhat', 'crashride', 'hat8'] as const)
        : style === 'chug' ? (rng.pick(G.drum.hats) === '16' ? 'hat16' : 'hat8')
          : style === 'gallop' ? rng.pick(['hat8', 'ride', 'ride'] as const)
            : style === 'pedal' ? rng.pick(['hat8', 'hat16'] as const)
              : style === 'picked' || style === 'lick' ? rng.pick(['hat8', 'hat8', 'ride'] as const)
                : rng.pick(['hat8', 'hat8', 'ride', 'hat16'] as const);
    // grunge drummers leave room: often just quarter notes on the hats or ride (always when half-time)
    if (genre === 'grunge' && (cym === 'hat8' || cym === 'ride' || cym === 'hat16') && (half || rng.chance(0.35))) cym = cym === 'ride' ? 'ride4' : 'hat4';
    const soft = style === 'arp' ? 0.65 : 1;
    const stops = (style === 'chug' || style === 'big') && rng.chance(0.8);
    if (style !== 'arp' && (ri > 0 || tacet === 0)) crashBars.add(run[0]);
    // whether the kick doubles a riff note is decided once per spot in the bar, so it locks
    // in with the repeating riff instead of changing every bar
    const follows = new Map<string, boolean>();
    const follow = (j: number, a: number, p: number) => {
      const k = `${j}:${a}`;
      if (!follows.has(k)) follows.set(k, rng.chance(p));
      return follows.get(k)!;
    };

    for (const bi of run) {
      // waiting bars are still written (and dropped below), so the bars after them don't change
      const bar = bars[bi];
      const { len } = bar;
      const st = groupStarts(bar.groups);
      const n = st.length;
      const b: DrumBar = { K: zeros(len), S: zeros(len), H: zeros(len), O: zeros(len), R: zeros(len), T: zeros(len) };

      // backbeat
      if (half) b.S[st[Math.floor(n / 2)]] = 0.95 * soft;
      else st.forEach((p, i) => { if (i % 2) b.S[p] = 0.92 * soft; });
      b.K[0] = 0.95;
      if (!half) st.forEach((p, i) => { if (i % 2 === 0) b.K[p] = 0.9; });

      // kick follows the riff: every stab, some riff notes, some chugs
      for (let j = 1; j < len; j++) {
        if (b.S[j]) continue;
        const a = riff.accents[bar.start + j];
        if (a >= 1) b.K[j] = 0.92;
        else if (a >= 0.5 && follow(j, a, 0.5)) b.K[j] = 0.85;
        else if (a > 0.25 && a < 0.5 && follow(j, a, R.kickChug * (0.6 + w * 0.4))) b.K[j] = 0.8;
      }

      for (let j = 0; j < len; j++) {
        const isStart = st.includes(j);
        if (cym === 'hat8' && j % 2 === 0) b.H[j] = (isStart ? 0.62 : 0.45) * soft;
        if (cym === 'hat16') b.H[j] = (isStart ? 0.62 : j % 2 ? 0.3 : 0.45) * soft;
        if (cym === 'ride' && j % 2 === 0) b.R[j] = isStart ? 0.65 : 0.5;
        if (cym === 'openhat' && j % 2 === 0) b.O[j] = isStart ? 0.55 : 0.42;
        if (cym === 'crashride' && isStart) b.R[j] = 0.8;
        if (cym === 'hat4' && isStart) b.H[j] = 0.6 * soft;
        if (cym === 'ride4' && isStart) b.R[j] = 0.62;
      }
      if (cym === 'crashride' && bi % 2 === 0) crashBars.add(bi);

      // when the guitar stops for a real break (not just a gap between riff notes), the band stops
      if (stops) {
        for (let j = 1; j < len;) {
          let k = j;
          while (k < len && !riff.sounding[bar.start + k]) k++;
          if (k - j >= 3) for (let i = j; i < k; i++) { b.K[i] = 0; b.S[i] = 0; b.H[i] = 0; b.O[i] = 0; b.R[i] = 0; }
          j = k + 1;
        }
      }

      if (bi === run[run.length - 1] && rng.chance(bi === 7 ? 0.9 : 0.65)) {
        fills.push({ bar: bi, len: addFill(rng, b, len, bar.groups, w, genre) });
        if (bi < 7) crashBars.add(bi + 1);
      }

      if (bi < tacet) continue;
      for (let j = 0; j < len; j++) {
        const g = bar.start + j;
        L.kick[g] = b.K[j]; L.snare[g] = b.S[j]; L.hat[g] = b.H[j];
        L.hatOpen[g] = b.O[j]; L.ride[g] = b.R[j]; L.tom[g] = b.T[j];
      }
    }
  });

  for (const bi of crashBars) {
    const g = bars[bi].start;
    L.crash[g] = 0.85;
    L.hat[g] = 0;
    L.hatOpen[g] = 0;
    L.kick[g] = Math.max(L.kick[g], 0.92);
  }

  return { ...L, fills, halfTime: firstHalf, fourFloor: false };
}
