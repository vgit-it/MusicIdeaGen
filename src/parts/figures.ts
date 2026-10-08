// Riff styles built from motifs and guitar idioms (hard rock and heavy metal):
// - picked: a chord shape picked string by string, top note moving (the kind of hook that opens a hard rock song)
// - lick: chord stabs with space, answered by a single-note pentatonic lick
// - pedal: a melody bouncing off a palm-muted low pedal note
// - gallop: 8th + two 16ths, on a moving line or on power chords
//
// Each style writes one motif and develops it over the four bars (repeat, move it onto the
// chord, vary, end), instead of picking fresh notes every bar.

import type { RiffGenre, RiffStyle } from '../genres';
import type { ChordPart, GuitarHit, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import { type Chord, chordPc } from '../theory';
import { type Fretted, type Tuning, lowestOf, powerChord, riffNote, voicingsInTuning } from '../theory/fretboard';
import { type BarPlan, type Form, chordScale, developCell, figure, formPlan, pitchCell, stepSemis } from './motif';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export const FIGURE_STYLES: readonly RiffStyle[] = ['picked', 'lick', 'pedal', 'gallop'];

interface Ctx {
  rng: Rng;
  song: Song;
  chords: ChordPart;
  R: RiffGenre;
  t: Tuning;
}

/** A single note on the string whose fret is closest to the hand position. */
function fretNear(midi: number, t: Tuning, pos: number): Fretted {
  let m = midi;
  while (m < t.strings[0]) m += 12;
  while (m > t.strings[5] + 19) m -= 12;
  let best = 0, cost = Infinity;
  for (let s = 0; s < 6; s++) {
    const f = m - t.strings[s];
    if (f < 0 || f > 19) continue;
    const c = Math.abs(f - pos) + (f === 0 ? 1.5 : 0);
    if (c < cost) { best = s; cost = c; }
  }
  return { notes: [m], strings: [best] };
}

const chordAtFn = (c: ChordPart, total: number) => (g: number): Chord => c.timeline[c.chordIdx[Math.min(g, total - 1)]].chord;

/** A riff note low on the neck when it fits there, else wherever the hand is. */
function lowNote(midi: number, t: Tuning): Fretted {
  const f = riffNote(midi, t);
  const fret = midi - t.strings[f.strings[0]];
  return fret >= 0 && fret <= 12 ? f : fretNear(midi, t, 7);
}

/** Keep a note above the lowest open string. */
const playable = (midi: number, t: Tuning) => {
  let m = midi;
  while (m < t.strings[0]) m += 12;
  return m;
};

/** Plans for the bars of a run (a run can be shorter than four bars). */
function plans(rng: Rng, form: Form, n: number): BarPlan[] {
  const p = formPlan(rng, form);
  if (n >= 4) return p;
  // short run: keep the ending on its last bar
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? p[3] : p[i]));
}

/* ------------------------------------------------------------ picked */

// L low root, O octave, F fifth, I inner (4th), T top note (the moving melody)
const PICK_TEMPLATES = ['LOFITFTF', 'LFOTOFTF', 'LFTFOFTF', 'LOTOFOTO', 'LFOFTFOF', 'LOFTOFTF'];
const PICK_STEPS: Record<string, number> = { L: 0, O: 7, F: 4, I: 3 };

interface PickedCell { tpl: string; tops: number[]; pos: number; sixteenths: boolean; form: Form }

function pickedRun(c: Ctx, bars: Bar[], cache: Record<string, unknown>): GuitarHit[] {
  const { rng, song, t } = c;
  const cell = (cache.picked ??= ((): PickedCell => {
    const tpl = rng.pick(PICK_TEMPLATES);
    const nT = [...tpl].filter((x) => x === 'T').length;
    return {
      tpl,
      // the moving top voice stays in a small range: octave to 11th
      tops: pitchCell(rng, Math.max(2, nT), 3).map((s) => Math.max(7, Math.min(10, 8 + s))),
      pos: rng.int(7, 14),
      // slow songs pick in 16ths
      sixteenths: song.bpm < 100 && rng.chance(0.5),
      form: rng.weighted<Form>([['loop', 3], ['sentence', 1], ['period', 1]]),
    };
  })()) as PickedCell;
  const chordAt = chordAtFn(c.chords, song.total);
  const hits: GuitarHit[] = [];
  const barPlans = plans(rng, cell.form, bars.length);
  bars.forEach((bar, bi) => {
    const tops = developCell(cell.tops, barPlans[bi]);
    const every = cell.sixteenths ? 1 : 2;
    let k = 0;
    for (let p = 0, slot = 0; p < bar.len; p += every, slot++) {
      const g = bar.start + p;
      const ch = chordAt(g);
      const role = cell.tpl[slot % cell.tpl.length];
      const step = role === 'T' ? tops[k++ % tops.length] : PICK_STEPS[role];
      const anchor = 50 + mod(chordPc(song.key, ch) - 50, 12);
      const midi = anchor + stepSemis(chordScale(song.mode, ch), step);
      hits.push({
        step: g, ...fretNear(midi, t, cell.pos), len: every * 2,
        vel: role === 'L' ? 0.86 : role === 'T' ? 0.84 : 0.7 + rng.next() * 0.06, letRing: true,
      });
    }
  });
  return hits;
}

/* ------------------------------------------------------------ lick */

const STAB_PATTERNS = [[0], [0, 6], [0, 3, 6], [0, 6, 8], [0, 2, 6], [0, 4, 7], [0, 3]];

interface LickCell {
  stabs: number[];
  stabLen: number[];
  lickLen: number;
  rhythm: number[];
  cell: number[];
  open: boolean;
  blue: boolean;
  form: Form;
}

function lickRun(c: Ctx, bars: Bar[], cache: Record<string, unknown>): GuitarHit[] {
  const { rng, song, t, chords } = c;
  const cell = (cache.lick ??= ((): LickCell => {
    const lickLen = rng.pick([4, 4, 6, 8]);
    const sixteenths = rng.chance(0.6);
    const rhythm: number[] = [];
    for (let p = 0; p < lickLen; p += sixteenths ? 1 : 2) if (p === 0 || rng.chance(0.85)) rhythm.push(p);
    const stabs = rng.pick(STAB_PATTERNS);
    return {
      stabs,
      stabLen: stabs.map(() => rng.pick([2, 3, 4, 6])),
      lickLen,
      rhythm,
      cell: pitchCell(rng, rhythm.length, 5),
      open: rng.chance(0.6),
      blue: rng.chance(0.35 + song.w * 0.3),
      form: rng.weighted<Form>([['loop', 2], ['period', 3], ['sentence', 1]]),
    };
  })()) as LickCell;
  const chordAt = chordAtFn(chords, song.total);
  // open-position chord shapes for the stabs (the hard rock sound), else power chords
  const shapes = cell.open ? voicingsInTuning(song.key, chords.timeline.map((e) => e.chord), t, { preferOpen: true }) : null;
  const pent = cell.blue ? [0, 3, 5, 6, 7, 10] : [0, 3, 5, 7, 10];
  const tonic = lowestOf(song.key, t);
  const hits: GuitarHit[] = [];
  const barPlans = plans(rng, cell.form, bars.length);
  bars.forEach((bar, bi) => {
    const lickLen = Math.min(cell.lickLen, bar.len - 4);
    const region = bar.len - lickLen;
    const stabs = cell.stabs.filter((p) => p < region);
    stabs.forEach((p, i) => {
      const g = bar.start + p;
      const next = stabs[i + 1] ?? region;
      const len = Math.max(1, Math.min(cell.stabLen[i], next - p));
      const ti = chords.chordIdx[g];
      const f = shapes ? { notes: shapes[ti].notes, strings: shapes[ti].frets.flatMap((x, s) => (x === null ? [] : [s])) }
        : powerChord(chordPc(song.key, chordAt(g)), t, true);
      hits.push({ step: g, ...f, len, vel: p === 0 ? 0.95 : 0.88 });
    });
    // the lick: pentatonic, low on the neck, developed bar by bar (call and answer)
    const steps = developCell(cell.cell, barPlans[bi]);
    cell.rhythm.filter((p) => p < lickLen).forEach((p, i, arr) => {
      const s = steps[i];
      const idx = mod(s, pent.length), oct = Math.floor(s / pent.length);
      const midi = playable(tonic + pent[idx] + 12 * oct, t);
      const len = (arr[i + 1] ?? lickLen) - p;
      hits.push({
        step: bar.start + region + p, ...lowNote(midi, t), len, vel: 0.84 + (i === 0 ? 0.04 : 0),
        slide: i === 0 && rng.chance(c.R.slide) ? -2 : undefined,
      });
    });
  });
  return hits;
}

/* ------------------------------------------------------------ pedal */

const PEDAL_PATTERNS = ['PMPM', 'PPMP', 'PMPP', 'PPPM', 'P.M.', 'PMMP'];

interface PedalCell { pattern: string; cell: number[]; form: Form }

function pedalRun(c: Ctx, bars: Bar[], cache: Record<string, unknown>): GuitarHit[] {
  const { rng, song, t, chords } = c;
  const cell = (cache.pedal ??= ((): PedalCell => {
    const pattern = rng.pick(PEDAL_PATTERNS);
    const perBar = Math.max(2, [...pattern].filter((x) => x === 'M').length * 4);
    return { pattern, cell: pitchCell(rng, perBar, 6), form: rng.weighted<Form>([['loop', 3], ['sentence', 2]]) };
  })()) as PedalCell;
  const chordAt = chordAtFn(chords, song.total);
  const hits: GuitarHit[] = [];
  const barPlans = plans(rng, cell.form, bars.length);
  bars.forEach((bar, bi) => {
    const steps = developCell(cell.cell, barPlans[bi]);
    const starts = groupStarts(bar.groups);
    let k = 0;
    for (let p = 0; p < bar.len; p++) {
      const ch = cell.pattern[p % 4];
      if (ch === '.') continue;
      const g = bar.start + p;
      const chord = chordAt(g);
      const pedal = lowestOf(chordPc(song.key, chord), t);
      if (ch === 'P') {
        hits.push({ step: g, ...riffNote(pedal, t), len: 1, vel: starts.includes(p) ? 0.86 : 0.76, mute: 'palm', pedal: true });
      } else {
        const midi = pedal + 12 + stepSemis(chordScale(song.mode, chord), steps[k++ % steps.length] - 2);
        hits.push({ step: g, ...lowNote(Math.max(pedal + 3, midi), t), len: 1, vel: 0.9 });
      }
    }
  });
  // melody notes ring until the next hit
  hits.forEach((h, i) => { if (!h.mute && hits[i + 1]) h.len = Math.max(1, hits[i + 1].step - h.step); });
  return hits;
}

/* ------------------------------------------------------------ gallop */

interface GallopCell { fig: 'gallop' | 'revgallop'; line: boolean; palm: boolean; cell: number[]; form: Form; run: boolean }

function gallopRun(c: Ctx, bars: Bar[], cache: Record<string, unknown>): GuitarHit[] {
  const { rng, song, t, chords } = c;
  const cell = (cache.gallop ??= ((): GallopCell => ({
    fig: rng.chance(0.8) ? 'gallop' : 'revgallop',
    line: rng.chance(0.6),
    palm: rng.chance(0.6),
    cell: pitchCell(rng, 4, 5),
    form: rng.weighted<Form>([['loop', 2], ['sentence', 2], ['period', 1]]),
    run: rng.chance(0.5),
  }))()) as GallopCell;
  const chordAt = chordAtFn(chords, song.total);
  const hits: GuitarHit[] = [];
  const barPlans = plans(rng, cell.form, bars.length);
  bars.forEach((bar, bi) => {
    const steps = developCell(cell.cell, barPlans[bi]);
    const st = groupStarts(bar.groups);
    const last = bi === bars.length - 1;
    bar.groups.forEach((gl, gi) => {
      const g0 = bar.start + st[gi];
      const chord = chordAt(g0);
      const root = lowestOf(chordPc(song.key, chord), t);
      // a 16th run up to the next bar closes the phrase
      if (last && cell.run && gi === bar.groups.length - 1) {
        for (let p = 0; p < gl; p++) {
          const midi = playable(root + stepSemis(chordScale(song.mode, chord), p), t);
          hits.push({ step: g0 + p, ...lowNote(midi, t), len: 1, vel: 0.82 + p * 0.03 });
        }
        return;
      }
      const midi = cell.line ? playable(root + stepSemis(chordScale(song.mode, chord), Math.max(0, steps[gi % steps.length])), t) : root;
      const f = cell.line ? lowNote(midi, t) : powerChord(mod(midi, 12), t, false);
      for (const n of figure(cell.fig, gl)) {
        const strong = n.len >= 2;
        hits.push({
          step: g0 + n.pos, ...f, len: n.len, vel: strong ? 0.9 : 0.8,
          mute: cell.palm && !strong ? 'palm' : undefined,
        });
      }
    });
  });
  return hits;
}

/* ------------------------------------------------------------ */

const LABEL: Record<string, string> = {
  picked: 'a picked chord-shape hook with a moving top note',
  lick: 'chord stabs answered by a pentatonic lick',
  pedal: 'a melody bouncing off a palm-muted pedal note',
  gallop: 'a galloping riff',
};

const FORM_LABEL: Record<Form, string> = {
  loop: 'repeats with a turnaround',
  sentence: 'moves its motif up, breaks it up, then ends',
  period: 'asks in bar 2 and answers in bar 4',
};

/** Hits for a run of bars in one of the figure styles. `cache` keeps the motif between runs. */
export function figureRun(
  rng: Rng, song: Song, chords: ChordPart, R: RiffGenre, style: RiffStyle, bars: Bar[], cache: Record<string, unknown>,
): { hits: GuitarHit[]; note: string } {
  const c: Ctx = { rng, song, chords, R, t: song.tuning! };
  const hits = style === 'picked' ? pickedRun(c, bars, cache)
    : style === 'lick' ? lickRun(c, bars, cache)
      : style === 'pedal' ? pedalRun(c, bars, cache)
        : gallopRun(c, bars, cache);
  const form = (cache[style] as { form: Form }).form;
  return { hits, note: `Riff: ${LABEL[style]}, built from one motif that ${FORM_LABEL[form]}` };
}
