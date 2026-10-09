// Chord progression laid out as a timeline across the 8 bars.

import { GENRES } from '../genres';
import type { ChordEvent, ChordPart, Song } from '../idea';
import type { Rng } from '../rng';
import { zeros } from '../rhythm';
import { type Chord, type Mode, type Quality, SCALES, degreeChord } from '../theory';

export function generateChords(rng: Rng, song: Song): ChordPart {
  const { w, genre, mode, bars, total } = song;
  const G = GENRES[genre];
  const scale = SCALES[mode];
  const notes: string[] = [];

  if (G.riff) return riffChords(rng, song);

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
    const root = rng.int(0, 11), q = rng.pick<Quality>(['maj', 'min', '7', 'sus4', 'maj7', 'm7', 'aug']);
    // only really weird ideas get a truly random chord; otherwise a colour chord bands actually use
    if (w >= 0.7) return { root, q };
    const colours = COLOUR[MINORISH.includes(mode) ? 'minor' : 'major'];
    return colours[root % colours.length];
  };

  const uneven = w > 0.4 && rng.chance(w * 0.7);
  const durChoices = uneven ? [0.5, 1, 1, 1.5, 2] : [1];
  if (uneven) notes.push('Uneven harmonic rhythm — some chords last half a bar, some two');
  // otherwise a chord a bar, a chord every two bars, or a mix: chords held across the bar line
  // are as common in songs as one per bar
  const rhythm = uneven ? null : rng.weighted(HARMONIC_RHYTHMS);
  if (rhythm && rhythm.desc) notes.push(`Chord rhythm: ${rhythm.desc}`);

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
    cur += rhythm ? rhythm.bars[ci % rhythm.bars.length] : rng.pick(durChoices);
    ci++;
  }

  const chordIdx = zeros(total);
  for (let t = 0, g = 0; g < total; g++) {
    while (t + 1 < timeline.length && timeline[t + 1].step <= g) t++;
    chordIdx[g] = t;
  }

  return { timeline, chordIdx, notes };
}

const MINORISH: Mode[] = ['minor', 'dorian', 'phrygian'];

/** How long each chord lasts, in bars, repeating (strummed genres). */
const HARMONIC_RHYTHMS: [{ bars: number[]; desc: string }, number][] = [
  [{ bars: [1], desc: '' }, 4],
  [{ bars: [2], desc: 'each chord lasts two bars' }, 2],
  [{ bars: [2, 1, 1], desc: 'a chord held for two bars, then two quicker ones' }, 2],
  [{ bars: [1, 1, 2], desc: 'two quick chords, then one held for two bars' }, 2],
  [{ bars: [3, 1], desc: 'a chord held for three bars, then a change' }, 1],
];

/**
 * Out-of-key chords that still sound intended (semitones above the tonic). Major keys: bVII, bVI, bIII,
 * minor iv, II and III major. Minor keys: IV major (dorian), bII (Neapolitan), V and V7 (harmonic minor), bVI, bIII.
 */
const COLOUR: Record<'major' | 'minor', Chord[]> = {
  major: [{ root: 10, q: 'maj' }, { root: 8, q: 'maj' }, { root: 3, q: 'maj' }, { root: 5, q: 'min' }, { root: 2, q: 'maj' }, { root: 4, q: 'maj' }],
  minor: [{ root: 5, q: 'maj' }, { root: 1, q: 'maj' }, { root: 7, q: 'maj' }, { root: 7, q: '7' }, { root: 8, q: 'maj' }, { root: 3, q: 'maj' }],
};

/** Quality of a chord rooted `semi` semitones above the tonic: diatonic triad, else a power chord. */
function riffQuality(scale: readonly number[], semi: number): Quality {
  const i = scale.indexOf(semi);
  if (i < 0) return '5';
  const q = degreeChord(scale, i).q;
  return q === 'maj' || q === 'min' ? q : '5';
}

/** Riff genres: chromatic power-chord progressions, mostly one chord per bar or two. */
function riffChords(rng: Rng, song: Song): ChordPart {
  const { w, mode, bars, total } = song;
  const R = GENRES[song.genre].riff!;
  const scale = SCALES[mode];
  // chord-based styles want real major/minor chords; the heavy ones are all power chords
  const heavyOnly = !song.sections!.some((s) => s === 'arp' || s === 'picked' || s === 'lick');
  const notes: string[] = [];

  let roots = [...rng.pick(R.progs)];
  // weirder: chromatic neighbours and the tritone
  roots = roots.map((r, i) => (i > 0 && rng.chance(w * 0.3) ? (r + rng.pick([1, 6, 11, 2])) % 12 : r));
  const base: Chord[] = roots.map((r) => {
    let q = heavyOnly ? '5' : riffQuality(scale, r);
    // quiet sections like colour: sus2 / add9
    if (!heavyOnly && (q === 'maj' || q === 'min') && rng.chance(0.3)) q = rng.pick(['sus2', 'add9'] as const);
    return { root: r, q };
  });

  // harmonic rhythm: same length for every chord keeps riffs repeating
  const dur = rng.pick(w > 0.5 ? [0.5, 1, 1, 2] : [1, 1, 2]);
  if (dur === 2) notes.push('Each chord lasts two bars');
  if (dur === 0.5) notes.push('Two chords per bar');

  const timeline: ChordEvent[] = [];
  for (let cur = 0, ci = 0; cur < 8; cur += dur, ci++) {
    const bi = Math.floor(cur);
    const b = bars[bi];
    const s = b.start + Math.round((cur - bi) * b.len);
    timeline.push({ step: s - (s % 2), chord: base[ci % base.length] });
  }
  const chordIdx = zeros(total);
  for (let t = 0, g = 0; g < total; g++) {
    while (t + 1 < timeline.length && timeline[t + 1].step <= g) t++;
    chordIdx[g] = t;
  }
  return { timeline, chordIdx, notes };
}
