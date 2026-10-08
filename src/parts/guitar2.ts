// Second guitar: plays against the rhythm part. Per four-bar section it picks a role:
// a lead melody, a harmony of the riff, an octave melody, clean echoing arpeggios,
// volume swells, a funk single-note line, or it sits out for contrast.

import type { Genre, RiffStyle } from '../genres';
import type { ChordPart, GuitarHit, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import { type Chord, type Mode, QUALITIES, SCALES, chordPc } from '../theory';
import { TUNINGS, type Tuning, powerChord, voicingsInTuning } from '../theory/fretboard';
import { type Form, developCell, formPlan, pitchCell } from './motif';

export type Guitar2Style = 'lead' | 'harmony' | 'octaves' | 'arp' | 'swell' | 'funk' | 'rhythm' | 'rest';

export const GUITAR2_LABEL: Record<Guitar2Style, string> = {
  lead: 'lead melody',
  harmony: 'harmony of the riff',
  octaves: 'octave melody',
  arp: 'clean picked arpeggios with echo',
  swell: 'volume swells',
  funk: 'single-note funk line',
  rhythm: 'rhythm chords under the riff',
  rest: 'sits out',
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function pickStyle(rng: Rng, genre: Genre, section: RiffStyle | null): Guitar2Style {
  // a picked hook wants chords under it; gallops and pedal riffs want a twin harmony
  if (section === 'picked') return rng.weighted([['rhythm', 4], ['swell', 1], ['rest', 1]]);
  if (section === 'lick') return rng.weighted([['rest', 3], ['lead', 1], ['octaves', 1]]);
  if (section === 'gallop') return rng.weighted([['harmony', 4], ['lead', 2], ['rest', 1]]);
  if (section === 'pedal') return rng.weighted([['harmony', 3], ['lead', 2], ['octaves', 1], ['rest', 1]]);
  if (section === 'single') return rng.weighted([['harmony', 4], ['lead', 2], ['octaves', 1], ['rest', 1]]);
  if (section === 'chug') return rng.weighted([['arp', 3], ['octaves', 1], ['rest', 1], ['lead', 2], ['swell', 1]]);
  if (section === 'big') return rng.weighted([['lead', 3], ['octaves', 2], ['swell', 2], ['arp', 1]]);
  if (section === 'arp') return rng.weighted([['swell', 2], ['lead', 2], ['rest', 2]]);
  if (genre === 'rock') return rng.weighted([['lead', 2], ['octaves', 1], ['arp', 1], ['rest', 2]]);
  if (genre === 'pop') return rng.weighted([['arp', 4], ['swell', 1], ['lead', 1], ['rest', 1]]);
  return rng.weighted([['funk', 3], ['rest', 1]]);
}

const MINORISH: Mode[] = ['minor', 'dorian', 'phrygian'];

/**
 * Where melodies sit (MIDI notes). Like a singer, above the rhythm guitars and bass: a lead from D4
 * to A5; an octave melody's lower note from G3 to A4 (its top note an octave higher).
 */
const LEAD_RANGE: [number, number] = [62, 81];
const OCTAVE_RANGE: [number, number] = [55, 69];

/** Pentatonic core plus some colour notes from the mode (semitones above the key). */
function leadScale(rng: Rng, mode: Mode, w: number): number[] {
  const minor = MINORISH.includes(mode);
  const s = new Set(minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]);
  for (const n of SCALES[mode]) if (rng.chance(0.25 + w * 0.3)) s.add(n);
  if (minor && rng.chance(0.15 + w * 0.4)) s.add(6);
  return [...s].sort((a, b) => a - b);
}

/** Lead notes sit around one hand position on the middle/high strings. */
function leadFret(midi: number, t: Tuning, pos: number): { notes: number[]; strings: number[] } {
  let best = 5, bestCost = Infinity;
  for (let s = 1; s < 6; s++) {
    const fret = midi - t.strings[s];
    if (fret < 0 || fret > 19) continue;
    const cost = Math.abs(fret - pos) + (s === 1 ? 2 : 0);
    if (cost < bestCost) { best = s; bestCost = cost; }
  }
  return { notes: [midi], strings: [best] };
}

const chordTones = (key: number, c: Chord) => QUALITIES[c.q].map((i) => mod(chordPc(key, c) + i, 12));

type Density = 'slow' | 'medium' | 'busy';

function groupRhythm(rng: Rng, g: number, d: Density): number[] {
  if (g === 4) {
    if (d === 'slow') return rng.pick([[0], [0], [], [0, 2]]);
    if (d === 'medium') return rng.pick([[0], [0, 2], [0, 3], [2], [0, 2, 3], []]);
    return rng.pick([[0, 1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 2], [1, 2, 3]]);
  }
  if (g === 6) {
    if (d === 'slow') return rng.pick([[0], []]);
    if (d === 'medium') return rng.pick([[0, 3], [0, 2, 4], [0], [3]]);
    return rng.pick([[0, 1, 2, 3, 4, 5], [0, 2, 3, 4]]);
  }
  return d === 'busy' ? [0, 2, 4, 6].filter((p) => p < g) : [0];
}

interface NoteEv { step: number; midi: number; len: number; slide?: number }

/**
 * A melody built from one motif (a bar of rhythm and a short pitch shape), developed over the run:
 * - period: motif, then an answer that starts the same and ends open; motif again, answer ending home
 * - sentence: motif, motif moved up or down, motif broken up, ending home
 * Strong beats land on chord tones; phrase endings are long notes.
 */
function melody(
  rng: Rng, song: Song, chords: ChordPart, bars: Bar[], density: Density,
  lo: number, hi: number, scale: number[], slide: number, riff: GuitarHit[] | null,
): NoteEv[] {
  const { key, total } = song;
  // riff notes sounding at each step: the melody fills the riff's gaps and avoids clashing with it
  const riffPcs = (g: number) => (riff ?? [])
    .filter((h) => h.step <= g && g < h.step + h.len && h.mute !== 'dead')
    .flatMap((h) => h.notes.map((n) => mod(n, 12)));
  const clashes = (m: number, g: number) => riffPcs(g).some((pc) => [1, 6, 11].includes(mod(m - pc, 12)));
  // a held note a semitone from a chord tone, or a tritone from the root, grinds against the band
  const rubs = (m: number, g: number) => {
    const c = chordAt(g), pc = mod(m, 12);
    return chordTones(key, c).some((t) => [1, 11].includes(mod(pc - t, 12))) || mod(pc - chordPc(key, c), 12) === 6;
  };
  const riffHitsIn = (a: number, b: number) => (riff ?? []).filter((h) => h.step >= a && h.step < b).length;
  const LEVELS: Density[] = ['slow', 'medium', 'busy'];
  const pool: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(mod(m - key, 12))) pool.push(m);
  const clampI = (i: number) => Math.max(0, Math.min(pool.length - 1, i));
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(g, total - 1)]].chord;
  const nearest = (idx: number, ok: (pc: number) => boolean) => {
    for (let d = 0; d < pool.length; d++) {
      for (const j of [idx - d, idx + d]) if (j >= 0 && j < pool.length && ok(mod(pool[j], 12))) return j;
    }
    return idx;
  };
  const snap = (idx: number, step: number) => {
    const tones = chordTones(key, chordAt(step));
    const j = nearest(idx, (pc) => tones.includes(pc));
    return Math.abs(j - idx) <= 3 ? j : idx;
  };

  // the motif's rhythm: one bar; the answer starts the same and ends on a long note halfway
  const b0 = bars[0];
  const st0 = groupStarts(b0.groups);
  const call: { pos: number; strong: boolean }[] = [];
  b0.groups.forEach((g, gi) => {
    // busier where the riff rests, sparser where it's busy
    let d = LEVELS.indexOf(density);
    if (riff) {
      const n = riffHitsIn(b0.start + st0[gi], b0.start + st0[gi] + g);
      if (n === 0) d = Math.min(2, d + 1);
      else if (n >= g * 0.75) d = Math.max(0, d - 1);
    }
    for (const o of groupRhythm(rng, g, LEVELS[d])) call.push({ pos: st0[gi] + o, strong: o === 0 });
  });
  if (!call.length || call[0].pos !== 0) call.unshift({ pos: 0, strong: true });
  const half = st0[Math.ceil(st0.length / 2)] ?? Math.floor(b0.len / 2);
  const answer = [...call.filter((o) => o.pos < half), { pos: half, strong: true }];

  const cell = pitchCell(rng, call.length, 6);
  const form: Form = rng.chance(0.55) ? 'period' : 'sentence';
  const plan = formPlan(rng, form);
  const anchor = clampI(Math.floor(pool.length / 2) - 2);
  const tonic = mod(key, 12);

  const evs: { step: number; midi: number }[] = [];
  bars.forEach((b, bi) => {
    const p = bars.length < 4 && bi === bars.length - 1 ? plan[3] : plan[bi % 4];
    const isAnswer = form === 'period' && bi % 2 === 1;
    const rhythm = isAnswer ? answer : call;
    const dev = developCell(cell, p);
    const steps = isAnswer ? [...dev.slice(0, rhythm.length - 1), dev[dev.length - 1]] : dev;
    rhythm.forEach((o, i) => {
      if (o.pos >= b.len) return;
      const step = b.start + o.pos;
      let j = clampI(anchor + steps[i]);
      const last = i === rhythm.length - 1;
      if (last && p.ending === 'home') j = nearest(j, (pc) => pc === tonic);
      else if (last && p.ending === 'open') {
        const tones = chordTones(key, chordAt(step));
        j = nearest(j, (pc) => pc !== tonic && tones.includes(pc));
      } else if (o.strong) j = snap(j, step);
      // a semitone or tritone against the riff sounds wrong, and so does a held note that rubs against
      // the chord (quick passing notes are fine): move to the nearest note that doesn't
      const held = (rhythm[i + 1]?.pos ?? b.len) - o.pos >= 2 || o.strong;
      const bad = (m: number) => clashes(m, step) || (held && rubs(m, step));
      if (bad(pool[j])) {
        const k = [j + 1, j - 1, j + 2, j - 2].find((x) => x >= 0 && x < pool.length && !bad(pool[x]));
        if (k !== undefined) j = k;
      }
      evs.push({ step, midi: pool[j] });
    });
  });

  const end = bars[bars.length - 1].start + bars[bars.length - 1].len;
  return evs.map((e, i) => {
    const next = evs[i + 1]?.step ?? end;
    const len = Math.max(1, next - e.step);
    const sl = len >= 3 && rng.chance(slide) ? -rng.pick([1, 2, 2]) : undefined;
    return { step: e.step, midi: e.midi, len: density === 'busy' ? Math.min(len, 2) : len, slide: sl };
  });
}

/**
 * A lead hook across a whole section: one motif developed over all its bars, the same tune
 * carried over each chord. Tracks bring it back in the intro, interludes, last chorus and outro.
 */
export function generateHook(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null): GuitarHit[] {
  const { w, mode } = song;
  const t = song.tuning ?? TUNINGS.standard;
  const scale = leadScale(rng, mode, w);
  const pos = rng.int(5, 12);
  const octaves = rng.chance(0.3);
  const [lo, hi] = octaves ? OCTAVE_RANGE : LEAD_RANGE;
  const density: Density = rng.pick(['medium', 'medium', 'slow']);
  return melody(rng, song, chords, song.bars, density, lo, hi, scale, song.tuning ? 0.4 : 0.2, riff).map((n) => {
    const f = leadFret(n.midi, t, pos);
    if (octaves) { f.notes.push(n.midi + 12); f.strings.push(Math.min(5, f.strings[0] + 2)); }
    return { step: n.step, ...f, len: n.len, vel: 0.86, slide: n.slide };
  });
}

export interface Guitar2Part {
  hits: GuitarHit[];
  notes: string[];
}

/**
 * One role per four-bar run. `force` sets the role of each run instead of picking one
 * (used by tracks, where the section's energy decides).
 */
export function generateGuitar2(
  rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, force?: Guitar2Style[],
): Guitar2Part {
  const { key, w, bars, mode } = song;
  const t = song.tuning ?? TUNINGS.standard;
  const genre = song.partGenres.strum;
  const scale = leadScale(rng, mode, w);
  const hits: GuitarHit[] = [];
  const styles: Guitar2Style[] = [];
  const labels: string[] = [];
  const quietSection = (run: number[]) => song.sections?.[run[0]] === 'arp';
  const center = 60 + key > 66 ? 48 + key : 60 + key; // a register around middle C
  const runs: number[][] = [];
  for (let r = 0; r < bars.length; r += 4) runs.push([r, r + 1, r + 2, r + 3].filter((i) => i < bars.length));

  runs.forEach((run, ri) => {
    const section = song.sections?.[run[0]] ?? null;
    let style = force?.[ri] ?? pickStyle(rng, genre, section);
    // the second half should usually answer the first; never leave both empty
    if (!force && ri > 0 && styles[ri - 1] === 'rest' && style === 'rest') style = section === 'arp' ? 'swell' : 'lead';
    const runBars = run.map((i) => bars[i]);
    const last = runBars[runBars.length - 1];
    const from = runBars[0].start, to = last.start + last.len;
    // a harmony needs single notes to follow (not chords, not the pedal)
    const harmonizable = (h: GuitarHit) =>
      h.step >= from && h.step < to && h.notes.length === 1 && h.mute !== 'dead' && !h.clean && !h.pedal;
    if (style === 'harmony' && !riff?.some(harmonizable)) style = 'lead';
    styles.push(style);
    labels.push(GUITAR2_LABEL[style]);
    const clean = quietSection(run) || style === 'arp' || style === 'funk';
    const pos = rng.int(5, 12);

    if (style === 'lead' || style === 'octaves') {
      const density: Density = section === 'big' || style === 'octaves' ? rng.pick(['slow', 'medium']) : rng.pick(['medium', 'medium', 'slow']);
      const [lo, hi] = style === 'octaves' ? OCTAVE_RANGE : LEAD_RANGE;
      if (riff) labels[labels.length - 1] += ' in the gaps of the riff';
      for (const n of melody(rng, song, chords, runBars, density, lo, hi, scale, song.tuning ? 0.4 : 0.2, riff)) {
        const f = leadFret(n.midi, t, pos);
        if (style === 'octaves') { f.notes.push(n.midi + 12); f.strings.push(Math.min(5, f.strings[0] + 2)); }
        hits.push({ step: n.step, ...f, len: n.len, vel: 0.85, slide: n.slide, clean });
      }
    } else if (style === 'harmony' && riff) {
      // gallops and pedal riffs: the classic twin-guitar third
      const twin = section === 'gallop' || section === 'pedal';
      const interval = twin && rng.chance(0.75) ? 'third' : rng.pick(['third', 'fourth', 'fifth', 'octave'] as const);
      const sc: readonly number[] = SCALES[mode];
      for (const h of riff) {
        if (!harmonizable(h)) continue;
        const m = h.notes[0];
        let up = 12;
        if (interval === 'fourth') up = 5;
        if (interval === 'fifth') up = 7;
        if (interval === 'third') {
          const d = sc.indexOf(mod(m - key, 12));
          up = d < 0 ? 3 : mod(sc[(d + 2) % 7] - sc[d], 12);
        }
        let target = m + up;
        while (target < 55) target += 12;
        hits.push({ step: h.step, ...leadFret(target, t, pos), len: h.len, vel: h.vel * 0.95, slide: h.slide, mute: h.mute });
      }
      labels[labels.length - 1] = `harmony of the riff, a${interval === 'octave' ? 'n' : ''} ${interval} up`;
    } else if (style === 'rhythm') {
      // ringing power chords following the chords (the second guitar under a picked hook):
      // held through the bar, on beats 1 and 3, or on every beat
      const feel = rng.weighted([['hold', 2], ['half', 2], ['beats', 1]] as const);
      for (const b of runBars) {
        const gs = groupStarts(b.groups);
        const st = (feel === 'hold' ? [0] : feel === 'half' ? gs.filter((_, i) => i % 2 === 0) : gs).map((p) => b.start + p);
        const changes = chords.timeline.map((e) => e.step).filter((s) => s > b.start && s < b.start + b.len);
        const starts = [...new Set([...st, ...changes])].sort((x, y) => x - y);
        starts.forEach((s, i) => {
          const pc = chordPc(key, chords.timeline[chords.chordIdx[s]].chord);
          const len = (starts[i + 1] ?? b.start + b.len) - s;
          hits.push({ step: s, ...powerChord(pc, t, true), len, vel: s === b.start ? 0.84 : 0.72 });
        });
      }
    } else if (style === 'arp') {
      const vs = voicingsInTuning(key, chords.timeline.map((e) => e.chord), t, { preferOpen: true });
      const dotted = rng.chance(0.55);
      const order = rng.pick(['up', 'down', 'updown'] as const);
      let k = 0, lastTi = -1;
      for (let g = from; g < to; g += dotted ? 3 : 2) {
        const ti = chords.chordIdx[g];
        if (ti !== lastTi) { k = 0; lastTi = ti; }
        const v = vs[ti];
        const strings = v.frets.flatMap((f, s) => (f === null ? [] : [s]));
        const top = v.notes.map((n, i) => ({ n, s: strings[i] })).slice(-4);
        const lift = top[top.length - 1].n < 64 ? 12 : 0;
        const seq = order === 'up' ? top : order === 'down' ? [...top].reverse() : [...top, ...top.slice(1, -1).reverse()];
        const x = seq[k++ % seq.length];
        hits.push({
          step: g, notes: [x.n + lift], strings: [x.s], len: 8, vel: 0.5 + rng.next() * 0.12,
          clean: true, letRing: true,
        });
      }
    } else if (style === 'swell') {
      for (const b of runBars) {
        const starts = [b.start, ...chords.timeline.map((e) => e.step).filter((s) => s > b.start && s < b.start + b.len)];
        starts.forEach((s, i) => {
          const tones = chordTones(key, chords.timeline[chords.chordIdx[s]].chord);
          const pc = tones[Math.min(tones.length - 1, rng.pick([1, 2, 2]))];
          const midi = center + 4 + mod(pc - (center + 4), 12);
          const len = (starts[i + 1] ?? b.start + b.len) - s;
          hits.push({ step: s, ...leadFret(midi, t, pos), len, vel: 0.75, swell: true, clean });
        });
      }
    } else if (style === 'funk') {
      const cell: { pos: number; deg: number; dead: boolean }[] = [];
      const pent = [0, 3, 5, 7, 10, 12];
      for (let p = 0; p < runBars[0].len; p++) {
        if (!rng.chance(p % 4 === 0 ? 0.75 : 0.45)) continue;
        cell.push({ pos: p, deg: rng.pick(pent), dead: rng.chance(0.3) });
      }
      for (const b of runBars) {
        for (const c of cell) {
          if (c.pos >= b.len) continue;
          const g = b.start + c.pos;
          const root = center + mod(chordPc(key, chords.timeline[chords.chordIdx[g]].chord) - center, 12);
          hits.push({ step: g, ...leadFret(root + c.deg, t, pos), len: 1, vel: c.dead ? 0.6 : 0.8, mute: c.dead ? 'dead' : undefined, clean: true });
        }
      }
    }
  });

  hits.sort((a, b) => a.step - b.step);
  const notes = [labels.every((l) => l === labels[0])
    ? `Guitar 2: ${labels[0]} throughout`
    : `Guitar 2: ${labels.map((l, i) => `bars ${i * 4 + 1}–${Math.min(bars.length, i * 4 + 4)} ${l}`).join(' → ')}`];
  return { hits, notes };
}
