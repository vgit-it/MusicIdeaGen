// Bass line: follows chord roots, locks to the kick, approaches the next chord.

import { GENRES, type Genre } from '../genres';
import type { ChordPart, DrumPart, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, groupStarts, zeros } from '../rhythm';
import { type Chord, QUALITIES, SCALES, chordPc } from '../theory';
import { lowestOf } from '../theory/fretboard';
import type { RiffPart } from './riff';

export function generateBass(rng: Rng, song: Song, chords: ChordPart, drums: DrumPart): number[] {
  const { w, total, key } = song;
  const bs = GENRES[song.partGenres.bass].bass;
  const { timeline, chordIdx } = chords;
  const B = zeros(total);

  // root between G1 and G2
  const bassRoot = (c: Chord) => {
    let m = 36 + chordPc(key, c);
    if (m > 43) m -= 12;
    return m;
  };

  // Choices are made once per spot in the bar (for each drum-bar variant) and reused, so the
  // bass line repeats with the drum groove and locks to the same kicks every time round.
  const memo = new Map<string, number>();
  const once = (k: string, f: () => number) => {
    if (!memo.has(k)) memo.set(k, f());
    return memo.get(k)!;
  };
  song.bars.forEach((bar, bi) => {
    for (let j = 0; j < bar.len; j++) {
      const g = bar.start + j;
      const c = timeline[chordIdx[g]].chord, r = bassRoot(c);
      const change = g === 0 || chordIdx[g] !== chordIdx[g - 1];
      const nxtI = chordIdx[(g + 1) % total], nextChange = nxtI !== chordIdx[g];
      const spot = `${song.plan[bi]}|${bar.meter}|${j}|${drums.kick[g] ? 'k' : ''}`;
      // offsets from the root: 0 = root, 12 = octave, 7 = fifth, -99 = rest
      let off = -99;
      if (change) off = 0;
      else if (nextChange) {
        const approach = once(`${spot}|a`, () => (rng.chance(0.25 + w * 0.4) ? rng.pick([-1, -1, 1, 2]) : -99));
        if (approach !== -99) { B[g] = bassRoot(timeline[nxtI].chord) + approach; continue; }
      }
      if (off === -99 && drums.kick[g]) {
        off = once(`${spot}|k`, () => (rng.chance(bs.lock) ? (rng.chance(bs.oct) ? 12 : rng.chance(bs.fifth) ? 7 : 0) : -99));
      }
      if (off === -99 && j % 2 === 1) off = once(`${spot}|s`, () => (rng.chance(bs.six * (0.6 + w)) ? (rng.chance(0.5) ? 12 : 0) : -99));
      if (off === -99) continue;
      if (!change) off = once(`${spot}|w${off}`, () => (rng.chance(w * 0.12) ? rng.pick([2, 3, 5, 10]) : off));
      B[g] = r + off;
    }
  });
  return B;
}

/**
 * How the bass plays a strummed idea:
 * - locked: short figures that lock to the kick (plucked, with space)
 * - held: long roots held into each other, a breath at the end of a phrase
 * - flowing: a connected line through the chord tones that walks into each new chord
 * - driving: steady 8th notes on the root, legato, turning around into chord changes
 */
export type BassLine = 'locked' | 'held' | 'flowing' | 'driving';

export const BASS_LINE_DESC: Record<BassLine, string> = {
  locked: 'locked to the kick, short plucked notes',
  held: 'long held roots, one into the next',
  flowing: 'a flowing line that walks into each new chord',
  driving: 'driving 8th notes, held into each other',
};

export function pickBassLine(rng: Rng, genre: Genre): BassLine {
  if (genre === 'funk') return rng.weighted<BassLine>([['locked', 4], ['flowing', 1]]);
  if (genre === 'pop') return rng.weighted<BassLine>([['locked', 2], ['held', 2], ['flowing', 2], ['driving', 1]]);
  return rng.weighted<BassLine>([['locked', 3], ['flowing', 2], ['driving', 2], ['held', 1]]);
}

/** Note positions in a 16-step bar for flowing lines: quarters, a push into beat 4, a 3-3-2 hold... */
const FLOW: [number[], number][] = [
  [[0, 4, 8, 12], 3],
  [[0, 4, 8, 12, 14], 2],
  [[0, 6, 8, 12], 2],
  [[0, 8, 12, 14], 2],
  [[0, 6, 12], 2],
  [[0, 6, 8, 12, 14], 1],
];

/**
 * Held, flowing and driving lines (strummed genres). Notes ring until the next one (length 0);
 * the only gaps are the line's breaths at the end of a phrase, written as explicit lengths.
 */
export function writeBassLine(rng: Rng, song: Song, chords: ChordPart, line: Exclude<BassLine, 'locked'>): { bass: number[]; lens: number[] } {
  const { total, key, mode } = song;
  const { timeline, chordIdx } = chords;
  const B = zeros(total), lens = zeros(total);
  const scale = SCALES[mode].map((p) => (p + key) % 12);
  const bassRoot = (c: Chord) => {
    let m = 36 + chordPc(key, c);
    if (m > 43) m -= 12;
    return m;
  };
  const chordAt = (g: number) => timeline[chordIdx[Math.min(g, total - 1)]].chord;
  /** Chord tones above the root, in semitones (power chords take the scale's third). */
  const tones = (c: Chord) => {
    const q: number[] = QUALITIES[c.q].filter((i) => i < 12);
    if (c.q === '5') {
      const r = chordPc(key, c);
      const third = [3, 4].find((t) => scale.includes((r + t) % 12));
      if (third) q.push(third);
    }
    return [...new Set([...q, 12])];
  };
  const inScale = (m: number) => scale.includes(((m % 12) + 12) % 12);
  /** The octave of a note nearest the last one (flowing lines move by small steps, not octave jumps). */
  const near = (m: number, to: number, lo = 28, hi = 48) => {
    if (!to) return m;
    let best = m;
    for (let k = -2; k <= 2; k++) {
      const c = m + 12 * k;
      if (c >= lo && c <= hi && (best < lo || best > hi || Math.abs(c - to) < Math.abs(best - to))) best = c;
    }
    return best;
  };
  /** A note leading into `target`: a scale step below or above, or a half step below. */
  const approach = (target: number, how: number) => {
    if (how === 2) return target - 1;
    const dir = how === 0 ? -1 : 1;
    let m = target + dir;
    while (!inScale(m)) m += dir;
    return m;
  };

  // the player's habits, kept all through the idea
  const flow = rng.weighted(FLOW);
  const halves = line === 'held' && rng.chance(0.45); // held roots struck again halfway through the bar
  const tie = rng.chance(0.6); // a root that carries on into the next bar rings on instead of being struck again
  const breath = rng.chance(line === 'driving' ? 0.45 : 0.65); // a rest at the end of each four-bar phrase
  const walkHow = rng.weighted([[0, 3], [2, 2], [1, 1]] as [number, number][]);
  const memo = new Map<string, number>();
  const once = (k: string, f: () => number) => {
    if (!memo.has(k)) memo.set(k, f());
    return memo.get(k)!;
  };

  song.bars.forEach((bar, bi) => {
    const a = bar.start, end = a + bar.len;
    const beats = groupStarts(bar.groups);
    let pos: number[];
    const carries = bi > 0 && chordIdx[a] === chordIdx[a - 1];
    if (line === 'held') pos = (halves ? [0, beats[Math.ceil(beats.length / 2)] ?? bar.len] : [0]).filter((p) => !(p === 0 && carries && tie && !halves));
    else if (line === 'driving') pos = Array.from({ length: Math.ceil(bar.len / 2) }, (_, i) => i * 2);
    else pos = bar.len === 16 ? flow : beats;
    // every chord change is played, on time
    const changes = timeline.map((e) => e.step).filter((st) => st > a && st < end).map((st) => st - a);
    const steps = [...new Set([...pos.filter((p) => p < bar.len), ...changes])].sort((x, y) => x - y);
    let prev = 0;
    steps.forEach((p, i) => {
      const g = a + p;
      const c = chordAt(g), r = bassRoot(c);
      const change = g === 0 || chordIdx[g] !== chordIdx[g - 1] || p === 0;
      const nextAt = i + 1 < steps.length ? a + steps[i + 1] : end;
      const flowing = line === 'flowing';
      const nextRoot = flowing ? near(bassRoot(chordAt(nextAt)), prev, 28, 45) : bassRoot(chordAt(nextAt));
      const leadsIn = nextAt < total && chordIdx[Math.min(nextAt, total - 1)] !== chordIdx[g];
      let m: number;
      if (line === 'held') m = p === 0 || change ? r : r + once(`h|${bar.meter}|${p}|${c.q}`, () => (rng.chance(0.4) ? 7 : 0));
      else if (change && p === 0) m = flowing ? near(r, prev, 28, 45) : r;
      else if (leadsIn && nextAt - g <= 4 && (flowing || once(`d|${bi % 2}`, () => (rng.chance(0.5) ? 1 : 0)))) m = approach(nextRoot, walkHow);
      else if (change) m = flowing ? near(r, prev, 28, 45) : r;
      else if (line === 'driving') m = r + once(`dv|${song.plan[bi]}|${bar.meter}|${p}`, () => (rng.chance(0.12) ? 12 : 0));
      else {
        // the next chord tone up or down from the last note (no repeats), remembered per spot so the line repeats
        // (the root of the bar is where the last root was placed)
        const base = near(r, prev, 28, 45);
        const off = once(`f|${song.plan[bi]}|${bar.meter}|${p}|${tones(c).join()}`, () => {
          const options = [...tones(c), ...tones(c).map((t) => t - 12)].filter((t) => base + t !== prev && base + t >= 28 && base + t <= 50);
          options.sort((x, y) => Math.abs(base + x - prev) - Math.abs(base + y - prev));
          return rng.pick(options.slice(0, 2));
        });
        m = base + off;
      }
      while (m < 28) m += 12;
      while (m > 50) m -= 12;
      B[g] = m;
      prev = m;
    });
    // a breath: the last beat of the phrase is left empty (and the note before it stops there)
    if (breath && bi % 4 === 3 && beats.length > 1) {
      const s0 = a + beats[beats.length - 1];
      if (!timeline.some((e) => e.step >= s0 && e.step < end)) {
        for (let g = s0; g < end; g++) B[g] = 0;
        for (let g = s0 - 1; g >= a; g--) if (B[g]) { lens[g] = s0 - g; break; }
      }
    }
  });
  return { bass: B, lens };
}

/**
 * Riff genres: the bass doubles the guitar riff an octave or two down (same rhythm, same stops).
 * In clean sections it holds the chord roots, and waits while the drums wait.
 */
export function generateRiffBass(song: Song, chords: ChordPart, drums: DrumPart, riff: RiffPart): { bass: number[]; lens: number[] } {
  const { total, key, bars, sections } = song;
  const t = song.tuning!;
  const B = zeros(total), lens = zeros(total);

  // one fixed octave shift keeps the riff's shape: tonic lands between C#1 and C2
  const tonic = lowestOf(key, t);
  let shift = 0;
  while (tonic - shift > 36) shift += 12;

  // riffs that climb high: the bass drops those notes an octave
  const low = (m: number) => { let n = m - shift; while (n > 52) n -= 12; return n; };
  for (const h of riff.hits) {
    if (h.clean || h.mute === 'dead') continue;
    B[h.step] = low(h.notes[0]);
    lens[h.step] = h.len;
  }

  const rootAt = (s: number) => lowestOf(chordPc(key, chords.timeline[chords.chordIdx[s]].chord), t) - shift;
  const end = (bar: Bar) => bar.start + bar.len;
  const clear = (bar: Bar) => { for (let g = bar.start; g < end(bar); g++) { B[g] = 0; lens[g] = 0; } };

  bars.forEach((bar, bi) => {
    const style = sections![bi];
    if (style === 'arp') {
      const drumsPlaying = drums.kick.slice(bar.start, end(bar)).some(Boolean);
      if (!drumsPlaying) return;
      const changes = chords.timeline.map((e) => e.step).filter((s) => s > bar.start && s < end(bar));
      const starts = [bar.start, ...changes];
      starts.forEach((s, i) => {
        B[s] = rootAt(s);
        lens[s] = (starts[i + 1] ?? end(bar)) - s;
      });
    } else if (style === 'picked') {
      // under a picked hook the bass drives the roots in 8ths (and doesn't double every picked note)
      clear(bar);
      for (let g = bar.start; g < end(bar); g += 2) { B[g] = rootAt(g); lens[g] = 2; }
    } else if (style === 'lick') {
      // roots in 8ths under the chord stabs, then doubles the lick
      const lick = riff.hits.filter((h) => h.step >= bar.start && h.step < end(bar) && h.notes.length === 1);
      const lickFrom = lick[0]?.step ?? end(bar);
      clear(bar);
      for (let g = bar.start; g < lickFrom; g += 2) { B[g] = rootAt(g); lens[g] = 2; }
      for (const h of lick) { B[h.step] = low(h.notes[0]); lens[h.step] = h.len; }
    }
  });
  return { bass: B, lens };
}

/**
 * How long each bass note lasts (strummed genres), so the line has space in it: funk plays short
 * notes off the beat and stops between them, pop shortens its off-beat notes, rock mostly stays legato.
 * Decided once per spot in the bar, so the articulation repeats with the groove. 0 = until the next note.
 */
export function bassLengths(rng: Rng, song: Song, bass: number[]): number[] {
  const genre = song.partGenres.bass;
  const lens = zeros(song.total);
  const memo = new Map<string, number>();
  for (const bar of song.bars) {
    const beats = groupStarts(bar.groups);
    for (let j = 0; j < bar.len; j++) {
      const g = bar.start + j;
      if (!bass[g]) continue;
      let gap = 1;
      while (g + gap < song.total && !bass[g + gap] && gap < 16) gap++;
      const onBeat = beats.includes(j);
      const k = `${bar.meter}|${j}|${gap}`;
      if (!memo.has(k)) {
        let len = 0;
        if (genre === 'funk') len = onBeat ? Math.min(gap, rng.pick([2, 3, 3])) : 1;
        else if (genre === 'pop') len = onBeat ? 0 : gap > 2 && rng.chance(0.6) ? 2 : 0;
        else len = !onBeat && gap >= 4 && rng.chance(0.4) ? 2 : 0;
        memo.set(k, len);
      }
      lens[g] = memo.get(k)!;
    }
  }
  return lens;
}
