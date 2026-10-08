// Drums for strummed genres. A drummer picks a groove and sits on it: one named groove per idea
// (from a small library of real ones per genre), changed only on purpose: a deliberate variation at
// the end of a phrase, a lift for the B half (ride or open hats), a fill into the next section.
// Odd meters build their groove from the beat groups. Weirdness adds spice (ghosts, extra kicks)
// and only at high settings anything less predictable.

import { type DrumStyle, type Genre, GENRES, type HatPattern } from '../genres';
import type { DrumPart, Song } from '../idea';
import type { Rng } from '../rng';
import { type Variant, groupStarts, zeros } from '../rhythm';

export interface DrumBar {
  K: number[]; S: number[]; H: number[]; O: number[]; R: number[]; T: number[];
}

/** How the time is kept: closed hats (8ths, 16ths, quarters), off-beat open hats, ride, or floor tom. */
type Cym = 'hat8' | 'hat16' | 'hat4' | 'off' | 'ride8' | 'tom8';

/**
 * One bar of a groove in 4/4 (16 steps): x = accent, o = normal, g = ghost note.
 * `spice`: what a weirder take adds. `open`: open hi-hat steps.
 */
interface Groove {
  name: string;
  K: string;
  S: string;
  cym: Cym;
  open?: number[];
  half?: boolean;
  four?: boolean;
  spice?: { K?: string; S?: string };
}

const GROOVES: Record<'rock' | 'pop' | 'funk', [Groove, number][]> = {
  rock: [
    [{ name: 'straight rock beat', K: 'x.......x.......', S: '....x.......x...', cym: 'hat8', spice: { K: '..........o.....' } }, 3],
    [{ name: 'rock beat, kick on the and of 3', K: 'x.......x.o.....', S: '....x.......x...', cym: 'hat8', spice: { S: '...............g' } }, 3],
    [{ name: 'rock beat, kick on the and of 2', K: 'x......ox.......', S: '....x.......x...', cym: 'hat8', spice: { K: '..............o.' } }, 2],
    [{ name: 'driving rock beat', K: 'x.o.....x.o.....', S: '....x.......x...', cym: 'hat8', open: [14] }, 2],
    [{ name: 'half-time rock', K: 'x.........o.....', S: '........x.......', cym: 'hat8', half: true, spice: { K: '.......o........' } }, 1],
    [{ name: 'floor-tom groove', K: 'x.......x.......', S: '....x.......x...', cym: 'tom8' }, 1],
    [{ name: 'four on the floor', K: 'x...x...x...x...', S: '....x.......x...', cym: 'hat8', open: [14], four: true }, 1],
  ],
  pop: [
    [{ name: 'pop backbeat', K: 'x.......x.o.....', S: '....x.......x...', cym: 'hat8', spice: { K: '......o.........' } }, 3],
    [{ name: '3-3-2 kick', K: 'x..o..o.........', S: '....x.......x...', cym: 'hat8', spice: { K: '..........o.....' } }, 2],
    [{ name: 'Motown beat', K: 'x.......x.......', S: 'o...x...o...x...', cym: 'hat8', spice: { K: '...........o....' } }, 1],
    [{ name: 'dance beat (four on the floor)', K: 'x...x...x...x...', S: '....x.......x...', cym: 'off', four: true }, 2],
    [{ name: 'half-time ballad beat', K: 'x.........o.....', S: '........x.......', cym: 'hat8', half: true, spice: { K: '.......o........' } }, 1],
    [{ name: 'pop beat on 16th hats', K: 'x.......x.o.....', S: '....x.......x...', cym: 'hat16', open: [14] }, 1],
  ],
  funk: [
    [{ name: 'funk groove with ghost notes', K: 'x.o.......o..o..', S: '....x..g.g..x..g', cym: 'hat16' }, 3],
    [{ name: 'funk groove, open hat', K: 'x..o..o...o.....', S: '..g.x......gx...', cym: 'hat8', open: [14] }, 3],
    [{ name: 'syncopated funk kick', K: 'x......o..o..o..', S: '....x.g.....x.g.', cym: 'hat16' }, 2],
    [{ name: 'half-time funk', K: 'x.....o...o..o..', S: '..g.....x..g..g.', cym: 'hat16', half: true }, 1],
  ],
};

const vel = (c: string) => (c === 'x' ? 0.95 : c === 'o' ? 0.82 : c === 'g' ? 0.2 : 0);

/** Lay the cymbal (or floor tom) part over a bar. */
function keepTime(b: DrumBar, len: number, groups: number[], cym: Cym, open: number[] = []) {
  const st = groupStarts(groups);
  for (let i = 0; i < len; i++) {
    const isStart = st.includes(i);
    if (cym === 'hat16') b.H[i] = isStart ? 0.65 : i % 2 ? 0.3 : 0.45;
    else if (cym === 'hat8') { if (i % 2 === 0) b.H[i] = isStart ? 0.65 : 0.45; }
    else if (cym === 'hat4') { if (isStart) b.H[i] = 0.6; }
    else if (cym === 'off') { if (i % 2 === 0 && !isStart) b.O[i] = 0.5; else if (isStart) b.H[i] = 0.4; }
    else if (cym === 'ride8') { if (i % 2 === 0) b.R[i] = isStart ? 0.65 : 0.5; }
    else if (cym === 'tom8') { if (i % 2 === 0) b.T[i] = 3; }
  }
  for (const i of open) {
    if (i >= len || cym === 'ride8' || cym === 'tom8') continue;
    b.H[i] = 0; b.O[i] = 0.6;
    if (cym === 'hat16') b.H[i + 1] = 0;
  }
}

/** A groove from the library (4/4) as one bar. */
function grooveBar(g: Groove, spice: boolean, cym: Cym = g.cym): DrumBar {
  const b: DrumBar = { K: zeros(16), S: zeros(16), H: zeros(16), O: zeros(16), R: zeros(16), T: zeros(16) };
  for (let i = 0; i < 16; i++) {
    b.K[i] = vel(g.K[i]);
    b.S[i] = vel(g.S[i]);
    if (spice) {
      if (g.spice?.K && g.spice.K[i] !== '.') b.K[i] = vel(g.spice.K[i]);
      if (g.spice?.S && g.spice.S[i] !== '.') b.S[i] = vel(g.spice.S[i]);
    }
  }
  // the floor tom keeps time with the kick and snare: no tom hit on top of them
  keepTime(b, 16, [4, 4, 4, 4], cym, g.open);
  if (cym === 'tom8') for (let i = 0; i < 16; i++) if (b.S[i] >= 0.5) b.T[i] = 0;
  return b;
}

/** Any meter: a groove from the beat groups, its extra kicks decided once (so every bar is the same). */
function groupBar(rng: Rng, len: number, groups: number[], ds: DrumStyle, w: number, half: boolean, four: boolean, cym: Cym): DrumBar {
  const K = zeros(len), S = zeros(len), H = zeros(len), O = zeros(len), R = zeros(len), T = zeros(len);
  const st = groupStarts(groups), n = st.length;
  st.forEach((p, i) => {
    if (four) K[p] = 0.95;
    if (half) {
      if (i === 0) K[p] = 0.95;
      if (i === Math.floor(n / 2)) S[p] = 0.9;
    } else if (i % 2 === 0) K[p] = 0.95;
    else S[p] = 0.9;
  });
  // one or two extra kicks, on 8ths, where a drummer would put them (before a backbeat, or after beat 1)
  const spots = [...Array(len).keys()].filter((i) => i % 2 === 0 && !K[i] && !S[i]);
  const extra = Math.min(spots.length, rng.chance(0.4 + w) ? (w > 0.6 ? 2 : 1) : 0);
  for (const i of rng.shuffle(spots).slice(0, extra)) K[i] = 0.82;
  // ghost notes on the 16th before a beat (funk), the same in every bar
  if (ds.ghost > 0.1) for (let i = 3; i < len; i += 4) if (!K[i] && !S[i] && rng.chance(ds.ghost * 1.5)) S[i] = 0.2;
  const b = { K, S, H, O, R, T };
  keepTime(b, len, groups, cym);
  return b;
}

export const copyBar = (b: DrumBar): DrumBar => ({
  K: [...b.K], S: [...b.S], H: [...b.H], O: [...b.O], R: [...b.R], T: [...b.T],
});

/** How a phrase's last bar answers the groove (decided once per idea, so it's a habit, not noise). */
type Answer = 'pickup' | 'open' | 'drag' | 'none';

function answerBar(b: DrumBar, len: number, a: Answer) {
  const i = len - 2;
  if (a === 'pickup') { b.K[i] = 0.85; b.S[i] = 0; }
  if (a === 'open') {
    if (b.R[i] || b.T[i]) return;
    b.H[i] = 0; b.O[i] = 0.62;
    if (i + 1 < len) b.H[i + 1] = 0;
  }
  if (a === 'drag') { b.S[len - 3] = Math.max(b.S[len - 3], 0.3); b.S[len - 1] = Math.max(b.S[len - 1], 0.45); }
}

/**
 * Writes a fill over the end of the bar from a pattern (a roll, toms down the kit, a syncopated
 * figure, a ghost-note roll for funk). Returns its length in 16ths.
 */
export function addFill(rng: Rng, b: DrumBar, len: number, groups: number[], w: number, genre: Genre): number {
  const lastGroup = groups[groups.length - 1];
  const F = w > 0.75 && rng.chance(0.25)
    ? len
    : rng.chance(0.3 + w * 0.4) ? Math.min(len, lastGroup + (groups[groups.length - 2] ?? 0)) : lastGroup;
  const s0 = len - F;
  for (let i = s0; i < len; i++) {
    b.K[i] = 0; b.S[i] = 0; b.T[i] = 0; b.O[i] = 0;
    if (F > 4) { b.H[i] = 0; b.R[i] = 0; }
  }
  const type = genre === 'funk' ? rng.pick(['ghostroll', 'sync', 'toms'] as const) : rng.weighted([['roll', 2], ['toms', 3], ['sync', 2], ['eighths', 2]] as const);
  // toms: the fill walks down the kit, a quarter of it on each drum (snare, high, mid, floor)
  const kit = (pr: number) => Math.floor(pr * 4); // 0 = snare, 1-3 = toms
  for (let j = 0; j < F; j++) {
    const i = s0 + j, pr = j / F;
    if (type === 'roll') b.S[i] = 0.35 + 0.6 * pr;
    if (type === 'ghostroll') b.S[i] = j % 2 ? 0.2 : 0.4 + 0.5 * pr;
    if (type === 'toms' || type === 'eighths') {
      if (type === 'eighths' && j % 2) continue;
      const d = kit(pr);
      if (d === 0) b.S[i] = 0.6 + 0.3 * pr; else b.T[i] = d;
    }
    if (type === 'sync') {
      // 3+3+2 accents across the fill: snare, snare, toms
      const k = j % 8;
      if (k === 0 || k === 3) b.S[i] = 0.85;
      else if (k === 6) b.T[i] = j < F / 2 ? 1 : 3;
    }
  }
  // the fill lands: kick with its first note, and with the last tom
  b.K[s0] = 0.9;
  if (type === 'toms' || type === 'eighths') b.K[len - (type === 'eighths' ? 2 : 1)] = 0.8;
  return F;
}

const CRASH_CHANCE: Record<Genre, number> = { rock: 1, pop: 0.8, funk: 0.45, hardrock: 1, metal: 1, grunge: 1, altmetal: 1 };
const HAT_CYM: Record<HatPattern, Cym> = { '8': 'hat8', '16': 'hat16', off: 'off' };

export function generateDrums(rng: Rng, song: Song): DrumPart {
  const { w, bars, total, groupsFor, plan } = song;
  const genre = song.partGenres.drums;
  const ds = GENRES[genre].drum;
  const all = GROOVES[genre === 'pop' || genre === 'funk' ? genre : 'rock'];
  const lib = all.filter(([x]) => x.name !== song.avoidGroove);

  const groove = rng.weighted(lib);
  // tracks can force half-time on or off: then the closest groove that fits
  const g = song.forceHalf === undefined || !!groove.half === song.forceHalf
    ? groove
    : lib.map(([x]) => x).find((x) => !!x.half === song.forceHalf) ?? groove;
  const halfTime = song.forceHalf ?? !!g.half;
  const spice = w >= 0.3 && rng.chance(0.3 + w);
  const answer = rng.weighted<Answer>(genre === 'funk' ? [['open', 2], ['drag', 2], ['pickup', 1]] : [['pickup', 3], ['open', 2], ['drag', 1], ['none', 1]]);
  // the B half lifts: ride or open hats (same kick and snare); C is the contrast: half-time or floor tom
  const lift: Cym = g.cym === 'tom8' ? 'hat8' : rng.chance(ds.ride * (0.8 + w)) || g.cym === 'off' ? 'ride8' : g.cym === 'hat8' ? 'hat16' : 'ride8';
  const otherMeterCym = HAT_CYM[rng.pick(ds.hats)];

  const variants: Record<string, Record<Variant, DrumBar>> = {};
  for (const [m, gr] of Object.entries(groupsFor)) {
    const len = gr.reduce((a, b) => a + b, 0);
    const fourFour = len === 16 && gr.length === 4;
    const A = fourFour ? grooveBar(g, spice) : groupBar(rng, len, gr, ds, w, halfTime, !!g.four, g.cym === 'tom8' || g.cym === 'hat4' ? 'hat8' : otherMeterCym);
    const relift = (b: DrumBar, c: Cym) => {
      const v = copyBar(b);
      v.H.fill(0); v.O.fill(0); v.R.fill(0);
      for (let i = 0; i < len; i++) if (v.T[i] === 3 && !b.S[i]) v.T[i] = 0;
      keepTime(v, len, gr, c);
      if (c === 'tom8') for (let i = 0; i < len; i++) if (v.S[i] >= 0.5) v.T[i] = 0;
      return v;
    };
    // weird takes: the phrase-end bar also moves a kick
    const A2 = copyBar(A);
    if (w > 0.6) {
      const free = [...Array(len).keys()].filter((i) => i % 2 === 0 && i > 0 && !A2.S[i]);
      const i = rng.pick(free);
      A2.K[i] = A2.K[i] ? 0 : 0.8;
    }
    const C = fourFour && !g.half
      ? relift(A, 'tom8')
      : groupBar(rng, len, gr, ds, w, !halfTime, false, 'hat8');
    variants[m] = { A, A2, B: relift(A, lift), C };
  }

  const L = {
    kick: zeros(total), snare: zeros(total), hat: zeros(total), hatOpen: zeros(total),
    ride: zeros(total), crash: zeros(total), tom: zeros(total),
  };
  const fills: DrumPart['fills'] = [];
  // a drummer changes per phrase, not per bar: the first four bars sit on the groove, the second
  // four either repeat it or lift (B) or contrast (C) for the whole half; the answer comes at phrase ends
  const second: Variant = plan.slice(4).includes('C') ? 'C' : plan.slice(4).includes('B') ? 'B' : 'A';
  const drumPlan = bars.map((_, i) => (i < 4 ? 'A' : second) as Variant);
  bars.forEach((b, i) => {
    const v = copyBar(variants[b.meter][drumPlan[i]]);
    // end of the 8 bars: a fill. End of the first phrase: the groove's answer, sometimes a short fill
    if (i === 7 || (i === 3 && rng.chance(0.25 + w * 0.5))) {
      fills.push({ bar: i, len: addFill(rng, v, b.len, b.groups, w, genre) });
    } else if (i === 3) {
      const a2 = copyBar(variants[b.meter].A2);
      answerBar(a2, b.len, answer);
      Object.assign(v, a2);
    }
    for (let j = 0; j < b.len; j++) {
      const gs = b.start + j;
      L.kick[gs] = v.K[j]; L.snare[gs] = v.S[j]; L.hat[gs] = v.H[j];
      L.hatOpen[gs] = v.O[j]; L.ride[gs] = v.R[j]; L.tom[gs] = v.T[j];
    }
  });

  // crash on the top of the loop and after each fill, and where the B half lifts
  const crashBars = new Set<number>([0]);
  for (const f of fills) if (f.bar < 7) crashBars.add(f.bar + 1);
  if (second !== 'A' && rng.chance(0.7)) crashBars.add(4);
  for (const bi of crashBars) {
    if (bi > 0 && !rng.chance(CRASH_CHANCE[genre])) continue;
    if (bi === 0 && !rng.chance(CRASH_CHANCE[genre] * 0.9)) continue;
    const gs = bars[bi].start;
    L.crash[gs] = 0.85;
    L.hat[gs] = 0;
    L.ride[gs] = 0;
    L.kick[gs] = Math.max(L.kick[gs], 0.9);
  }

  // polyrhythmic cycles crossing the bar line (weird ideas)
  for (const c of song.cycles) {
    if (c.part === 'hat') {
      for (let gs = 0; gs < total; gs++) {
        L.hat[gs] = gs % c.len === 0 ? 0.65 : c.len >= 6 && gs % c.len === Math.floor(c.len / 2) ? 0.35 : 0;
        L.hatOpen[gs] = 0;
        L.ride[gs] = 0;
      }
    }
    if (c.part === 'kick') {
      for (let gs = 0; gs < total; gs++) if (gs % c.len === 0 && !L.snare[gs]) L.kick[gs] = Math.max(L.kick[gs], 0.8);
    }
  }

  return { ...L, fills, halfTime, fourFloor: !!g.four, groove: g.name };
}
