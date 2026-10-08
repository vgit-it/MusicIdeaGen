// Bass line: follows chord roots, locks to the kick, approaches the next chord.

import { GENRES } from '../genres';
import type { ChordPart, DrumPart, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, zeros } from '../rhythm';
import { type Chord, chordPc } from '../theory';
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
