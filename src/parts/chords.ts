// Chord progression laid out as a timeline across the 8 bars.

import { GENRES } from '../genres';
import type { ChordEvent, ChordPart, Song } from '../idea';
import type { Rng } from '../rng';
import { zeros } from '../rhythm';
import { type Chord, type Quality, SCALES, degreeChord } from '../theory';

export function generateChords(rng: Rng, song: Song): ChordPart {
  const { w, genre, mode, bars, total } = song;
  const G = GENRES[genre];
  const scale = SCALES[mode];
  const notes: string[] = [];

  let base = rng.pick(G.prog).map((d) => {
    let c = G.flavor(degreeChord(scale, d, G.seventh), rng);
    if (c.q === 'dim' && w < 0.6) c = c.root === 11 ? { root: 10, q: 'maj' } : { ...c, q: 'm7b5' };
    return c;
  });

  // odd-length loops: chords drift against the bar line
  if (w > 0.45 && rng.chance(w * 0.7)) {
    const n = rng.pick([3, 5, 6]);
    if (n === 3) base = base.slice(0, 3);
    else while (base.length < n) base.push(G.flavor(degreeChord(scale, rng.int(0, 6), G.seventh), rng));
    notes.push(`${base.length}-chord loop over 8 bars — chords land in different spots each time round`);
  }

  const weirdChord = (c: Chord, next: Chord | undefined): Chord => {
    const r = rng.next();
    if (r < 0.3) {
      // borrowed from the parallel major/minor
      const other = SCALES[mode === 'major' ? 'minor' : 'major'];
      const i = (scale as readonly number[]).indexOf(c.root);
      return degreeChord(other, i >= 0 ? i : 0, false);
    }
    if (r < 0.55 && next) return { root: (next.root + 7) % 12, q: '7' }; // secondary dominant
    if (r < 0.7 && next) return { root: (next.root + 1) % 12, q: '7' }; // tritone-ish slide
    return { root: rng.int(0, 11), q: rng.pick<Quality>(['maj', 'min', '7', 'sus4', 'maj7', 'm7', 'aug']) };
  };

  const durChoices = w > 0.4 && rng.chance(w * 0.7) ? [0.5, 1, 1, 1.5, 2] : [1];
  if (durChoices.length > 1) notes.push('Uneven harmonic rhythm — some chords last half a bar, some two');

  // bar position (e.g. 2.5 = halfway through bar 3) -> step, snapped to 8ths
  const barPosToStep = (p: number) => {
    const bi = Math.floor(p);
    if (bi >= 8) return total;
    const b = bars[bi];
    const s = b.start + Math.round((p - bi) * b.len);
    return s - (s % 2);
  };

  const timeline: ChordEvent[] = [];
  let cur = 0, ci = 0;
  while (cur < 8) {
    let c = base[ci % base.length];
    const next = base[(ci + 1) % base.length];
    if (rng.chance(w * (cur >= 4 ? 0.45 : 0.25))) c = weirdChord(c, next);
    let step = barPosToStep(cur);
    // anticipation: push the change an 8th early
    if (step > 0 && genre !== 'rock' && rng.chance(0.15 + w * 0.25)) {
      step = Math.max(timeline[timeline.length - 1].step + 2, step - 2);
    }
    timeline.push({ step, chord: c });
    cur += rng.pick(durChoices);
    ci++;
  }

  const chordIdx = zeros(total);
  for (let t = 0, g = 0; g < total; g++) {
    while (t + 1 < timeline.length && timeline[t + 1].step <= g) t++;
    chordIdx[g] = t;
  }

  return { timeline, chordIdx, notes };
}
