// The new solo writer (Solo: New; docs/SOLO-NEW.md), built from how real guitar solos go (docs/STUDY-SOLO.md:
// 2,938 solos in the Lakh MIDI collection):
// - a shape per solo, drawn as real ones are: level most, then falling, rising, arch, a dip; the line moving
//   between box positions by a jump, so the top note can come early and come back (no single late peak)
// - a chain of licks, each worked over: a shape real solos share (src/realism/solo-licks.json: played by 10+
//   songs from 8+ artists, over the key) in a lick rhythm real solos share (src/realism/licks.json), then played
//   again 1-3 times, changed (the same, a new ending, an answer in the same rhythm, an octave away)
// - busy from the start, as busy all through (notes a bar by genre and player), few gaps
// - quick runs that turn (a 3 or 4 note cell moved down or up the box), never straight up or down the scale
// - the player's trademark held note once, anywhere (a unison bend, an overbend, a trill, octaves)
// - endings that lead on (a short last note) more than they land (the root, held)
// Played by the same hands as the classic writer (solo.ts, playSolo).

import data from '../realism/solo-licks.json';
import type { Genre } from '../genres';
import type { ChordPart, GuitarHit, Song } from '../idea';
import type { LickKind } from '../players/lead';
import type { Rng } from '../rng';
import { SCALES, chordPc } from '../theory';
import { TUNINGS } from '../theory/fretboard';
import { type Guitar2Part, MINORISH } from './guitar2';
import { lickFit } from './licks';
import { RHYTHMS, type Rhythm } from './reallicks';
import { type Ev, playSolo } from './solo';

const mod = (n: number, m: number) => ((n % m) + m) % m;

interface Shape { minor: boolean; deg: number; steps: number[]; n: number; songs: number; genres: number[] }
const SHAPES: Shape[] = (data.shapes as [string, number, number[], number, number[]][]).map(([m, deg, steps, songs, genres]) => ({ minor: m === 'm', deg, steps, n: steps.length + 1, songs, genres }));
const GENRE_IX = data.genres as string[];

/**
 * The solo's energy (docs/SOLO-NEW.md, "Energy"): a shape over the whole solo, -1 (calm) to 1 (most), that the
 * height and the pace follow. A wave (or several), a rising or falling line, a sawtooth (built up and dropped,
 * again), steps; how many waves, and how far the height and pace move, by genre.
 */
type EnergyShape = 'wave' | 'rising' | 'falling' | 'saw' | 'steps';
interface Energy { shape: EnergyShape; waves: number; flip: boolean; pitchC: number; paceC: number; pitch: number; pace: number }
const ENERGY: Record<Genre, { shapes: [EnergyShape, number][]; waves: [number, number]; pitch: number; pace: number }> = {
  metal: { shapes: [['saw', 3], ['wave', 3], ['rising', 2], ['steps', 1]], waves: [2, 4], pitch: 6, pace: 0.5 },
  hardrock: { shapes: [['wave', 3], ['rising', 3], ['saw', 2], ['steps', 1], ['falling', 0.5]], waves: [1, 3], pitch: 6, pace: 0.45 },
  rock: { shapes: [['wave', 4], ['rising', 3], ['steps', 1], ['falling', 1]], waves: [1, 2], pitch: 6, pace: 0.45 },
  grunge: { shapes: [['steps', 2], ['saw', 2], ['wave', 2], ['falling', 1]], waves: [1, 3], pitch: 7, pace: 0.4 },
  altmetal: { shapes: [['steps', 3], ['saw', 2], ['wave', 2]], waves: [2, 3], pitch: 6, pace: 0.45 },
  pop: { shapes: [['wave', 4], ['rising', 2], ['falling', 1]], waves: [1, 2], pitch: 4, pace: 0.4 },
  funk: { shapes: [['wave', 3], ['steps', 1], ['saw', 1]], waves: [2, 4], pitch: 3, pace: 0.45 },
};
/** How height and pace follow the energy: with it (high energy: higher, busier), against it, or not at all. */
const COUPLE: [number, number][] = [[1, 5], [0, 3], [-1, 2]];

function pickEnergy(rng: Rng, genre: Genre, bars: number): Energy {
  const g = ENERGY[genre];
  // (a long hard rock or metal solo often goes slow and sung first, then fast and high: classic solos)
  const long = bars >= 16 && (genre === 'hardrock' || genre === 'metal');
  let shape: EnergyShape = rng.weighted(g.shapes.map(([s, w]) => [s, long && (s === 'rising' || s === 'steps') ? w * 2.5 : w] as [EnergyShape, number]));
  let waves = Math.round(2 * (g.waves[0] + rng.next() * (g.waves[1] - g.waves[0]))) / 2;
  let pitchC = rng.weighted(COUPLE), paceC = rng.weighted(COUPLE);
  if (!pitchC && !paceC) paceC = 1;
  const depth = 0.6 + 0.7 * rng.next();
  return { shape, waves: Math.max(1, waves), flip: rng.chance(0.3), pitchC, paceC, pitch: g.pitch * depth, pace: Math.min(0.7, g.pace * depth) };
}

/** The energy at `x` (0-1 through the solo), -1 to 1. */
function energyAt(e: Energy, x: number): number {
  switch (e.shape) {
    case 'wave': return (e.flip ? 1 : -1) * Math.cos(2 * Math.PI * e.waves * x);
    case 'rising': return -1 + 2 * x ** 1.2;
    case 'falling': return 1 - 2 * x;
    case 'saw': { const f = (x * e.waves) % 1; return -1 + 2 * Math.min(1, f / 0.85); }
    case 'steps': { const n = Math.round(e.waves) + 1; return -1 + (2 * Math.min(n - 1, Math.floor(x * n))) / (n - 1); }
  }
}
const ENERGY_WORDS: Record<EnergyShape, (e: Energy) => string> = {
  wave: (e) => (e.waves >= 2 ? `${e.waves} waves of energy` : 'a wave of energy'), rising: () => 'energy rising', falling: () => 'energy falling',
  saw: (e) => `energy built up and dropped${e.waves >= 2 ? ` ${Math.round(e.waves)} times` : ''}`, steps: () => 'energy in steps',
};
/** Notes a bar in real solos, by genre; and by player. */
const DENSITY: Record<Genre, number> = { rock: 5.4, hardrock: 7.1, metal: 8, grunge: 6.1, pop: 6.5, funk: 4.6, altmetal: 6 };
const BUSY: Record<LickKind, number> = { sung: 0.8, blues: 0.9, run: 1.2, simple: 0.8, muted: 0.9 };
/** Real solos with quick runs, by genre (the shredder more, the raw and melodic players less). */
const RUNS: Record<Genre, number> = { rock: 0.31, hardrock: 0.56, metal: 0.57, grunge: 0.32, pop: 0.37, funk: 0.33, altmetal: 0.4 };
const RUN_LEAN: Record<LickKind, number> = { sung: 0.6, blues: 0.8, run: 1.5, simple: 0.4, muted: 0.5 };
/** Turning cells for quick runs (steps through the box), and how a cell moves on (down or up a note each time). */
const CELLS = [[0, -1, -2, -1], [0, -1, -2], [0, 1, 2, 1], [0, 1, 2], [0, -1, 1, 0], [0, 2, 1, -1], [0, -2, -1, -3], [0, 1, -1, 0],
  [0, -1, -2, 0], [0, 2, 1], [0, -1, 0, -2], [0, 1, 0, 2], [0, -2, -1], [0, -1, -3, -2], [0, 1, 3, 2]];

type Variation = 'same' | 'ending' | 'answer' | 'octave';

/**
 * Lessons from classic solos (docs/SOLO-NEW.md, "From classic solos"): the bend moves players reach for, by player:
 * bent, let down and pulled off to the note below (the most common of all), the same bend picked again and again,
 * bent, let down and bent again, and two-string bends climbing the neck (the lower string bent, the upper held).
 */
type BendMove = 'brp' | 'repeat' | 'brb' | 'oblique';
const BEND_MOVES: Record<LickKind, [BendMove, number][]> = {
  sung: [['brp', 3], ['brb', 2], ['repeat', 1], ['oblique', 1]],
  blues: [['brp', 3], ['repeat', 2], ['brb', 2], ['oblique', 1]],
  simple: [['brp', 2], ['repeat', 2], ['oblique', 2]],
  run: [['brp', 2], ['brb', 1]],
  muted: [['brp', 1], ['repeat', 1]],
};
/** How often a slot gets a bend move, by player (melodic and blues players bend most: classic slow solos bend 15-25 notes in 100). */
const BEND_RATE: Record<LickKind, number> = { sung: 0.22, blues: 0.28, simple: 0.2, run: 0.07, muted: 0.06 };
/** The build-up's cell (repeated 4-12 times at a crest): bent, let down and pulled off; a box shape; a pedal note between moving ones (the shredder). */
type BuildCell = 'brp' | 'shape' | 'pedal';

/** The calm's held notes, by player: bent and held, held then bent, bent and let down, pre-bent and let down, bent and picked again, a unison bend, plain. */
type Held = 'bendHold' | 'holdBend' | 'bendRelease' | 'preRelease' | 'repick' | 'unison' | 'plain';
const HELD: Record<LickKind, [Held, number][]> = {
  sung: [['bendHold', 3], ['holdBend', 2], ['bendRelease', 2], ['unison', 1], ['repick', 1], ['plain', 1]],
  blues: [['bendHold', 2], ['holdBend', 2], ['bendRelease', 2], ['repick', 2], ['preRelease', 1], ['plain', 1]],
  run: [['bendHold', 2], ['holdBend', 1], ['bendRelease', 1], ['plain', 2]],
  simple: [['bendHold', 2], ['holdBend', 2], ['unison', 1], ['plain', 2]],
  muted: [['plain', 2], ['bendHold', 1], ['holdBend', 1]],
};

/**
 * Notes outside the box, as real solos use them (24% of their notes; docs/STUDY-SOLO.md): over a minor key the 2nd,
 * the b6 and the 6th most, over a major key the 4th, the 7th, the b7 and the b3 (the last two blue, quick only).
 * [the note above the key's root, how often, quick only].
 */
const COLOUR: Record<'m' | 'M', [number, number, boolean][]> = {
  m: [[2, 36], [8, 21], [9, 13], [1, 8], [6, 7]].map(([d, w]) => [d, w, d === 6 || d === 1]) as [number, number, boolean][],
  M: [[5, 39], [11, 18], [10, 17], [3, 11]].map(([d, w]) => [d, w, d === 10 || d === 3]) as [number, number, boolean][],
};
/** Triplet figures (three notes a beat, through the box): falling and turning most, as in real solos. */
const TRIP_CELLS: [number[], number][] = [[[0, -1, -2], 5], [[0, 1, 2], 1], [[0, 1, 0], 1], [[0, -1, 0], 1], [[0, 2, 1], 1], [[0, -2, -1], 1], [[0, 1, -1], 1], [[0, -1, 1], 1]];
/** Solos with 8th-note triplets in them (real: 18%, hard rock and metal 20%), by player. */
const TRIP_LEAN: Record<LickKind, number> = { sung: 0.9, blues: 1.3, run: 1.3, simple: 0.7, muted: 0.8 };

export function generateSolo2(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, lick: LickKind, hook: GuitarHit[] | null, intensity = 0.7): Guitar2Part {
  const { key, mode, bars, total } = song;
  const genre = song.partGenres.strum;
  const gi = GENRE_IX.indexOf(genre);
  const t = song.tuning ?? TUNINGS.standard;
  const minor = MINORISH.includes(mode);
  const fit = lickFit(song, chords, riff);
  const scale: readonly number[] = SCALES[mode];
  const inScale = (m: number) => scale.includes(mod(m - key, 12));
  const changes = new Set(chords.timeline.map((e) => e.step));
  const barStarts = new Set(bars.map((b) => b.start));
  // (blues players use the minor box over a major key half the time)
  const boxMinor = minor || (lick === 'blues' && rng.chance(0.5));
  const box = boxMinor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  // quick runs through the box, or the whole scale (the shredder)
  const runPool = lick === 'run' ? [...scale] : box;

  const en = pickEnergy(rng, genre, bars.length);
  // (a longer solo has room for more waves)
  if (en.shape === 'wave' || en.shape === 'saw' || en.shape === 'steps') en.waves = Math.round(2 * en.waves * Math.max(1, bars.length / 8) ** 0.6) / 2;
  const E = (g: number) => energyAt(en, Math.min(1, Math.max(0, g / total)));
  const R = 57 + mod(key - 57, 12);
  const base = R + 3 + Math.round(3 * intensity);
  // (the height follows the energy, with it, against it, or not)
  const centerAt = (g: number) => base + Math.round(en.pitchC * en.pitch * E(g));
  const windowAt = (g: number): [number, number] => [Math.max(50, centerAt(g) - 8), Math.min(84, centerAt(g) + 9)];
  // (the rhythms' own held last notes and the breaths thin it out: aimed a third above the real count)
  const D = 1.5 * DENSITY[genre] * BUSY[lick] * (0.85 + 0.3 * intensity);
  // (and the pace: notes a bar here)
  const Dat = (g: number) => D * (1 + en.paceC * en.pace * E(g));
  const runny = rng.chance(Math.min(0.9, RUNS[genre] * RUN_LEAN[lick] * (0.7 + 0.6 * intensity)));
  const vel0 = 0.8 + 0.08 * intensity;
  // (fewer than real solos, by ear: Paul)
  const triplets = rng.chance(0.1 * TRIP_LEAN[lick]);
  const shapes = SHAPES.filter((s) => s.minor === boxMinor);
  const outside = (s: Shape) => { let d = s.deg, n = box.includes(mod(d, 12)) ? 0 : 1; for (const x of s.steps) { d += x; if (!box.includes(mod(d, 12))) n++; } return n / s.n; };
  const shapeW = (s: Shape) => Math.sqrt(s.songs) * (1 + 1.5 * outside(s)) * (1 + (gi >= 0 ? (3 * s.genres[gi]) / Math.max(1, s.genres.reduce((a, b) => a + b, 0)) : 0));
  const rhythmsFor = (n: number) => RHYTHMS.filter((r) => r.ons.length === n);
  const rhythmW = (r: Rhythm, g: number) => {
    const dens = (r.ons.length * 16) / (r.ons[r.ons.length - 1] + r.tail), d = Dat(g);
    return Math.sqrt(r.songs) * Math.exp(-(((dens - d) / (0.35 * d)) ** 2));
  };

  const evs: Ev[] = [];
  const prevNote = () => (evs.length ? evs[evs.length - 1].midi : centerAt(0));
  /** Notes on steps, each checked: nothing clashing with the riff, held notes that don't rub, outside the key only quickly. */
  const fits = (ms: number[], steps: number[], lens: number[]) => ms.every((m, i) => {
    const g = steps[i];
    if (g >= total || fit.clash(m, g)) return false;
    if (lens[i] >= 4 && fit.rubs(m, g)) return false;
    if (!inScale(m) && !fit.isTone(m, g) && lens[i] > 2) return false;
    return true;
  });
  /** How good a placing is: near the note before, chord notes where they count. */
  let toTop = false;
  const score = (ms: number[], steps: number[], lens: number[], target: number) => {
    let s = -Math.abs(ms[0] - target);
    // (now and then back up to the solo's top: real solos come back to it about four times)
    if (toTop && evs.length) { const top = Math.max(...evs.map((e) => e.midi)), hi = Math.max(...ms); if (hi >= top - 2 && hi <= top) s += 6; }
    // (chord notes where they're heard: bar lines, chord changes, held notes, the last note, then any beat or 8th held)
    ms.forEach((m, i) => {
      const tone = fit.isTone(m, steps[i]);
      const strong = barStarts.has(steps[i]) || changes.has(steps[i]) || lens[i] >= 4 || i === ms.length - 1;
      if (strong) s += tone ? 3 : -3;
      else if (steps[i] % 4 === 0 || lens[i] >= 2) s += tone ? 1.5 : -1;
    });
    return s + rng.next();
  };
  /** The notes of a shape in the octave that fits best near `target`, on the given steps. */
  const placeShape = (sh: Shape, steps: number[], lens: number[], target: number, win: [number, number]) => {
    const rel = [sh.deg];
    for (const d of sh.steps) rel.push(rel[rel.length - 1] + d);
    let best: { ms: number[]; s: number } | null = null;
    for (let k = -3; k <= 4; k++) {
      const ms = rel.map((r) => key + r + 12 * k);
      if (ms.some((m) => m < win[0] - 2 || m > win[1] + 2) || !fits(ms, steps, lens)) continue;
      const s = score(ms, steps, lens, target);
      if (!best || s > best.s) best = { ms, s };
    }
    return best;
  };
  /** Where a rhythm starting at or after `from` lands, its notes' steps and lengths. */
  const lay = (r: Rhythm, from: number) => {
    const at = from + mod(r.off - from, 4);
    const steps = r.ons.map((o) => at + o);
    const lens = steps.map((g, i) => (i + 1 < steps.length ? steps[i + 1] - g : r.tail));
    return { at, steps, lens, end: steps[steps.length - 1] + r.tail };
  };
  const push = (ms: number[], steps: number[], lens: number[], accent = 0.04, shifts?: number[]) => {
    ms.forEach((m, i) => evs.push({ step: steps[i], midi: m, len: lens[i], vel: vel0 + 0.05 * E(steps[i]) + (i === 0 ? accent : 0) + (rng.next() - 0.5) * 0.06, ...(shifts?.[i] ? { shift: shifts[i] } : {}) }));
  };
  /** The same notes moved `k` notes up or down the key's scale (a repeat moved to suit the chord under it). */
  const moveScale = (ms: number[], k: number) => ms.map((m) => {
    const sc = [...scale].sort((a, b) => a - b);
    const rel = mod(m - key, 12), oct = m - rel;
    let i = sc.findIndex((x) => x >= rel); if (i < 0) i = sc.length;
    if (sc[i] !== rel) return m + (k > 0 ? 1 : -1) * 2;
    const j = i + k, o = Math.floor(j / sc.length);
    return oct + 12 * o + sc[mod(j, sc.length)];
  });
  /** Notes changed to fit where they now fall: as they are, else moved a note or two along the scale. */
  const refit = (ms: number[], steps: number[], lens: number[]) => {
    if (fits(ms, steps, lens)) return ms;
    for (const k of [1, -1, 2, -2]) { const x = moveScale(ms, k); if (fits(x, steps, lens)) return x; }
    return null;
  };
  /** Colour: now and then a box note turned into the scale note next to it, as real solos use them. */
  const colour = (ms: number[], steps: number[], lens: number[]) => {
    const out = [...ms];
    for (let i = 0; i < out.length - 1; i++) {
      // (on the off-beats and quick notes: the beats are the chord's)
      if (!box.includes(mod(out[i] - key, 12)) || steps[i] % 4 === 0 || lens[i] > 2 || !rng.chance(0.3)) continue;
      const opts: [number, number][] = [];
      for (const [d, w, quick] of COLOUR[boxMinor ? 'm' : 'M']) {
        if (quick && lens[i] > 2) continue;
        for (const m of [out[i] - 2, out[i] - 1, out[i] + 1, out[i] + 2]) if (mod(m - key, 12) === d && (quick || inScale(m))) opts.push([m, w]);
      }
      if (!opts.length) continue;
      const m = rng.weighted(opts), was = out[i];
      out[i] = m;
      if (!fits(out, steps, lens)) out[i] = was;
    }
    return out;
  };

  /** A lick: a shared shape in a shared rhythm, from `from`, ending by `limit`. */
  const newLick = (from: number, limit: number, target: number, keepRhythm?: Rhythm, onBeat = false) => {
    let best: { ms: number[]; at: number; steps: number[]; lens: number[]; end: number; r: Rhythm; sh: Shape; s: number } | null = null;
    for (let k = 0; k < 14; k++) {
      const sh = keepRhythm ? rng.weighted(shapes.filter((x) => x.n === keepRhythm.ons.length).map((x) => [x, shapeW(x)] as [Shape, number]))
        : rng.weighted(shapes.map((x) => [x, shapeW(x)] as [Shape, number]));
      const rs = keepRhythm ? [keepRhythm] : rhythmsFor(sh.n);
      if (!rs.length) continue;
      const ok = rs.filter((x) => !onBeat || x.off === mod(from, 4));
      if (!ok.length) continue;
      const r = keepRhythm ?? rng.weighted(ok.map((x) => [x, rhythmW(x, from)] as [Rhythm, number]));
      const l = lay(r, from);
      if (l.end > limit) continue;
      const p = placeShape(sh, l.steps, l.lens, target, windowAt(l.at));
      if (p && (!best || p.s > best.s)) best = { ms: p.ms, ...l, r, sh, s: p.s };
    }
    if (best) best.ms = colour(best.ms, best.steps, best.lens);
    return best;
  };

  /** A quick run that turns: a cell moved down (or up) the box a note at a time, landing on a held chord note. */
  const turningRun = (from: number, limit: number, target: number) => {
    const cell = rng.pick(CELLS);
    const down = rng.chance(0.6);
    const win = windowAt(from);
    const pool: number[] = [];
    for (let m = win[0] - 2; m <= win[1] + 2; m++) if (runPool.includes(mod(m - key, 12))) pool.push(m);
    if (pool.length < 6) return null;
    const len = Math.min(limit - from - 4, rng.pick([8, 12, 16]));
    if (len < 6) return null;
    let at = pool.reduce((bi, m, i) => (Math.abs(m - target) < Math.abs(pool[bi] - target) ? i : bi), 0);
    // (start high enough to come down, or low enough to go up)
    if (down) at = Math.max(at, Math.min(pool.length - 1, 4)); else at = Math.min(at, Math.max(0, pool.length - 5));
    const ms: number[] = [], steps: number[] = [];
    // (each run its own: the cell moves on by one note or two, in 16ths, or 8ths to start)
    const move = rng.chance(0.75) ? 1 : 2, slowFirst = rng.chance(0.25) ? cell.length : 0;
    let g = from;
    for (let k = 0; k < len && g < limit - 4; k++) {
      const c = Math.floor(k / cell.length), idx = at + cell[k % cell.length] + (down ? -c : c) * move;
      if (idx < 0 || idx >= pool.length) break;
      ms.push(pool[idx]); steps.push(g);
      g += k < slowFirst ? 2 : 1;
    }
    if (ms.length < 6) return null;
    // the landing: the nearest chord note, held
    const last = ms[ms.length - 1];
    let land = last + (down ? -1 : 1);
    for (let d = 0; d < 6 && !fit.isTone(land, g); d++) land += down ? -1 : 1;
    if (!fit.isTone(land, g)) return null;
    const hold = Math.min(limit - g, rng.pick([2, 4, 4, 6]));
    if (hold < 2) return null;
    ms.push(land); steps.push(g);
    const lens = steps.map((x, i) => (i + 1 < steps.length ? steps[i + 1] - x : hold));
    if (!fits(ms, steps, lens)) return null;
    return { ms, steps, lens, end: g + hold };
  };

  /** Is `g` a beat of four 16ths (where 8th triplets go)? */
  const beatOf4 = (g: number) => {
    const b = bars.find((x) => g >= x.start && g < x.start + x.len);
    if (!b) return false;
    let p = b.start;
    for (const n of b.groups) { if (p === g) return n === 4; p += n; }
    return false;
  };
  /**
   * A triplet lick (real solos: 8th triplets turning or falling, now and then quarter triplets): a beat or two of
   * 8th triplets (or three quarter triplets over two beats) on a shared shape, landing on a held note on the beat after.
   */
  const tripletLick = (from: number, limit: number, target: number) => {
    let at = from + mod(-from, 4);
    if (!beatOf4(at)) return null;
    const quarter = rng.chance(0.2), beats = quarter ? 2 : rng.chance(0.4) ? 1 : 2;
    if (!quarter && beats === 2 && !beatOf4(at + 4)) return null;
    const n = quarter ? 3 : 3 * beats;
    const pos = Array.from({ length: n }, (_, i) => at + (quarter ? (8 * i) / 3 : (4 * i) / 3));
    const landAt = at + 4 * beats, hold = Math.min(limit - landAt, rng.pick([2, 4, 4, 6]));
    if (hold < 2) return null;
    const steps = [...pos.map((x) => Math.floor(x + 1e-9)), landAt], shifts = [...pos.map((x) => Math.round(1e6 * (x - Math.floor(x + 1e-9))) / 1e6), 0];
    const lens = steps.map((g, i) => (i + 1 < steps.length ? Math.max(1, steps[i + 1] - g) : hold));
    const pool = shapes.filter((s) => s.n === n + 1);
    for (let k = 0; k < 10 && pool.length; k++) {
      const lean = (s: Shape) => (s.steps[0] > 0 && s.steps[1] > 0 ? 0.3 : s.steps[0] < 0 && s.steps[1] < 0 ? 1.4 : 1.2);
      const p = placeShape(rng.weighted(pool.map((s) => [s, shapeW(s) * lean(s)] as [Shape, number])), steps, lens, target, windowAt(at));
      if (p) return { ms: p.ms, steps, lens, shifts, end: landAt + hold };
    }
    // (else a triplet figure through the box, three notes a beat, each beat a note lower (or higher), onto a chord note)
    const win = windowAt(at), bx: number[] = [];
    for (let m = win[0] - 2; m <= win[1] + 2; m++) if (box.includes(mod(m - key, 12))) bx.push(m);
    for (let k = 0; k < 8; k++) {
      const cell = rng.weighted(TRIP_CELLS), down = cell[1] > 0 && cell[2] > 0 ? false : rng.chance(0.7);
      let i0 = bx.reduce((bi, m, i) => (Math.abs(m - target) < Math.abs(bx[bi] - target) ? i : bi), 0);
      i0 = down ? Math.max(i0, 3) : Math.min(i0, bx.length - 4);
      const idx = Array.from({ length: n }, (_, i) => i0 + cell[i % 3] + (down ? -1 : 1) * Math.floor(i / 3));
      if (idx.some((x) => x < 0 || x >= bx.length)) continue;
      const ms = idx.map((x) => bx[x]);
      let land = ms[ms.length - 1] + (down ? -1 : 1);
      for (let d = 0; d < 6 && !fit.isTone(land, landAt); d++) land += down ? -1 : 1;
      ms.push(land);
      if (fit.isTone(land, landAt) && fits(ms, steps, lens)) return { ms, steps, lens, shifts, end: landAt + hold };
    }
    return null;
  };
  /**
   * In the calm (where the energy takes the pace down), and now and then anywhere: a long held note, a chord note on
   * the beat, sung the player's way: bent up into and held, held and then bent up, bent and let down, picked already
   * bent and let down, bent and picked again while bent, a unison bend, or plainly held with vibrato; then now and
   * then a two-note answer stepping down (real solos: about one bar in five has three notes or fewer).
   */
  const heldPhrase = (from: number, limit: number, target: number): { evs: Ev[]; end: number } | null => {
    const at = from + mod(-from, 4);
    const len = Math.min(limit - at, rng.pick([8, 8, 10, 12]));
    if (len < 6) return null;
    const win = windowAt(at);
    let m = Math.max(win[0], Math.min(win[1], target));
    for (let d = 0; d < 6 && (!fit.isTone(m, at) || fit.clash(m, at)); d++) m += d % 2 ? -d : d;
    if (!fit.isTone(m, at) || fit.clash(m, at)) return null;
    // (a bend from the scale note a step or a half step below)
    const b = inScale(m - 2) ? 2 : inScale(m - 1) ? 1 : 0;
    const way: Held = b ? rng.weighted(HELD[lick]) : 'plain';
    const v = vel0 + 0.04 + 0.05 * E(at);
    const out: Ev[] = [];
    // (let down to a note that mustn't rub)
    const lets = !fit.rubs(m - b, at + len - 1) && !fit.clash(m - b, at + len - 1);
    if (way === 'bendHold') out.push({ step: at, midi: m, len, vel: v, bend: b });
    else if (way === 'holdBend') out.push({ step: at, midi: m, len: Math.max(len, 8), vel: v, bend: 0, lateBend: b });
    else if (way === 'bendRelease' && lets) out.push({ step: at, midi: m, len, vel: v, bend: b, unbend: b });
    else if (way === 'preRelease' && lets) out.push({ step: at, midi: m, len, vel: v, bend: 0, unbend: b });
    else if (way === 'repick') { out.push({ step: at, midi: m, len: 4, vel: v, bend: b }, { step: at + 4, midi: m, len: len - 4, vel: v - 0.04, bend: 0, art: 'pick' }); }
    else if (way === 'unison' && b === 2) out.push({ step: at, midi: m, len, vel: v, bend: 2, dyad: 0 });
    else out.push({ step: at, midi: m, len, vel: v, bend: b && rng.chance(0.5) ? b : 0 });
    const g = at + out.reduce((x, e) => x + e.len, 0);
    if (rng.chance(0.5) && g + 6 <= limit) {
      const last = out[out.length - 1], from2 = last.midi - (last.unbend ?? 0);
      const sc = [...scale].sort((x, y) => x - y), rel = mod(from2 - key, 12), i = sc.indexOf(rel);
      const down1 = i >= 0 ? from2 - (rel - (sc[i - 1] ?? sc[sc.length - 1] - 12)) : from2 - 2;
      const down2 = fit.isTone(down1 - 2, g + 2) ? down1 - 2 : down1 - 1;
      if (fits([down1, down2], [g, g + 2], [2, 4])) out.push({ step: g, midi: down1, len: 2, vel: v - 0.06, bend: 0 }, { step: g + 2, midi: down2, len: 4, vel: v - 0.08 });
    }
    if (!fits(out.map((e) => e.midi), out.map((e) => e.step), out.map((e) => (e.unbend || e.lateBend ? 2 : e.len)))) return null;
    const last = out[out.length - 1];
    return { evs: out, end: last.step + last.len };
  };

  /** A note `k` notes along the key's scale. */
  const stepScale = (m: number, k: number) => moveScale([m], k)[0];
  /** The bend size into `m`: from the scale note a step below, else a half step, else none. */
  const bendInto = (m: number) => (inScale(m - 2) ? 2 : inScale(m - 1) ? 1 : 0);
  /** The nearest chord note to `m` at `g` that doesn't clash, or null. */
  const toneNear = (m: number, g: number, up = false) => {
    for (const d of up ? [0, 1, 2, 3, 4, 5, -1, -2] : [0, -1, 1, -2, 2, -3, 3, 4, -4]) if (fit.isTone(m + d, g) && !fit.clash(m + d, g)) return m + d;
    return null;
  };

  /**
   * A bend move (classic solos): bent, let down and pulled off to the note below, then held; the same bend picked
   * 3-5 times, then held; bent, let down and bent again, held; or two-string bends climbing the neck.
   */
  const bendMove = (from: number, limit: number, target: number): { evs: Ev[]; end: number } | null => {
    const at = from + mod(-from, 2);
    const m = toneNear(Math.max(windowAt(at)[0], Math.min(windowAt(at)[1], target)), at, true);
    if (m === null) return null;
    const b = bendInto(m);
    if (!b) return null;
    const v = vel0 + 0.05 * E(at);
    const out: Ev[] = [];
    const move = rng.weighted(BEND_MOVES[lick]);
    if (move === 'brp') {
      const low = stepScale(m - b, -1), hold = rng.pick([4, 6]);
      out.push({ step: at, midi: m, len: 3, vel: v + 0.03, bend: b, unbend: b }, { step: at + 3, midi: low, len: 1, vel: v - 0.05, bend: 0, art: 'legato' });
      const end2 = toneNear(low, at + 4) ?? low;
      out.push({ step: at + 4, midi: end2, len: hold, vel: v - 0.02, bend: 0 });
    } else if (move === 'repeat') {
      const k = rng.int(3, 5);
      for (let i = 0; i < k; i++) out.push({ step: at + 2 * i, midi: m, len: 2, vel: v + (i ? -0.03 : 0.03), bend: b });
      out.push({ step: at + 2 * k, midi: m, len: rng.pick([4, 6]), vel: v, bend: b });
    } else if (move === 'brb') {
      out.push({ step: at, midi: m, len: 4, vel: v + 0.03, bend: b, unbend: b }, { step: at + 4, midi: m, len: rng.pick([4, 6, 8]), vel: v, bend: b });
    } else {
      // two-string bends climbing: the top note held, a note a 3rd or 4th under it bent up to it, a scale note higher each time
      let top = m;
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const g = at + 2 * i;
        const gap = [3, 4, 5].find((x) => inScale(top - x) && inScale(top - x - 2) && !fit.clash(top - x, g)) ?? 0;
        if (!gap) break;
        out.push({ step: g, midi: top, len: i === n - 1 ? 6 : 2, vel: v, bend: 2, dyad: gap });
        top = stepScale(top, 1);
      }
      if (out.length < 3) return null;
    }
    if (!fits(out.map((e) => e.midi - (e.unbend ?? 0)), out.map((e) => e.step), out.map((e) => (e.dyad !== undefined ? 1 : e.len))) || out[out.length - 1].step + out[out.length - 1].len > limit) return null;
    const last = out[out.length - 1];
    return { evs: out, end: last.step + last.len };
  };

  /**
   * A build-up at a crest (classic solos hammer a short cell 4-12 times at their peak, often a step higher every few
   * times): bent, let down and pulled off; a box shape in 16ths; or (the shredder) a pedal note between moving ones.
   * It lands on a held chord note.
   */
  const buildUp = (from: number, limit: number, target: number): { evs: Ev[]; end: number } | null => {
    const busy = en.paceC * E(from) >= 0;
    const span = busy ? 4 : 8;
    const at = from + mod(-from, 4);
    const kind: BuildCell = lick === 'run' && rng.chance(0.5) ? 'pedal' : rng.weighted<BuildCell>([['brp', lick === 'run' ? 1 : 3], ['shape', 3]]);
    const most = Math.floor((limit - at - 6) / span);
    const reps = Math.min(most, rng.int(4, lick === 'run' || lick === 'blues' ? 12 : 8));
    if (reps < 4) return null;
    const climb = rng.chance(0.5) ? rng.pick([2, 3, 4]) : 0;
    const first = toneNear(Math.max(windowAt(at)[0], Math.min(windowAt(at)[1] - 4, target)), at, true);
    if (first === null) return null;
    let anchor: number = first;
    // the cell: [where in the rep (16ths), notes along the scale from the anchor, bend, let down, legato]
    const sh = shapes.filter((x) => x.n === 4 && Math.abs(x.steps.reduce((a, b2) => a + b2, 0)) <= 4);
    const cellShape = sh.length ? rng.weighted(sh.map((x) => [x, shapeW(x)] as [Shape, number])) : null;
    const k = span / 4;
    const out: Ev[] = [];
    let made = 0;
    for (let r = 0; r < reps; r++) {
      const base: number = climb && r && r % climb === 0 ? stepScale(anchor, 1) : anchor;
      const g = at + r * span;
      let rep: Ev[] = [];
      const v = vel0 + 0.05 * E(g) + 0.06 * (r / reps);
      if (kind === 'brp') {
        const b = bendInto(base) || 2;
        rep = [{ step: g, midi: base, len: 2 * k, vel: v, bend: b, unbend: b }, { step: g + 2 * k, midi: stepScale(base - b, -1), len: 2 * k, vel: v - 0.05, bend: 0, art: 'legato' }];
      } else if (kind === 'pedal') {
        const ms = [base, stepScale(base, -1), base, stepScale(base, -2)];
        rep = ms.map((m, i) => ({ step: g + i * k, midi: m, len: k, vel: v - (i % 2 ? 0.05 : 0), bend: 0 }));
      } else if (cellShape) {
        let m = base;
        const ms = [m, ...cellShape.steps.map((d) => (m += d))];
        rep = ms.map((x, i) => ({ step: g + i * k, midi: x, len: k, vel: v - (i ? 0.04 : 0), bend: 0 }));
      }
      if (!rep.length || !fits(rep.map((e) => e.midi - (e.unbend ?? 0)), rep.map((e) => e.step), rep.map((e) => Math.min(2, e.len)))) {
        if (made >= 4) break;
        return null;
      }
      out.push(...rep);
      anchor = base;
      made++;
    }
    // the landing: a held chord note just above the last anchor, bent into now and then
    const g = at + made * span;
    const land = toneNear(anchor + 1, g, true);
    if (land === null || g + 4 > limit) return out.length ? { evs: out, end: g } : null;
    out.push({ step: g, midi: land, len: Math.min(limit - g, rng.pick([4, 6, 8])), vel: vel0 + 0.1, bend: rng.chance(0.4) ? bendInto(land) : 0 });
    const last = out[out.length - 1];
    return { evs: out, end: last.step + last.len };
  };
  let builds = 0;
  const maxBuilds = bars.length >= 16 ? 2 : 1;

  // the trademark held note: once, somewhere in the solo
  // (on a crest of the energy: the most of it, high or busy, or both)
  const crests: number[] = [];
  for (let g = 4; g < total - 8; g += 2) if (E(g) >= 0.8 && E(g) >= E(g - 2) && E(g) >= E(g + 2)) crests.push(g);
  const markAt = rng.chance(0.65) ? (crests.length ? Math.max(0, rng.pick(crests) - rng.pick([0, 2, 4])) : Math.floor(total * (0.15 + 0.75 * rng.next()))) : -1;
  let marked = false;
  const trademark = (from: number, limit: number) => {
    // (on the solo's high point so far, not above it: real solos come back to their top note)
    const win = windowAt(from);
    let m = Math.min(win[1], evs.length ? Math.max(...evs.map((e) => e.midi)) : centerAt(from) + 5);
    while (m > win[0] && !fit.isTone(m, from)) m--;
    const len = Math.min(limit - from, rng.pick([4, 6, 8]));
    if (len < 4 || !fit.isTone(m, from) || fit.clash(m, from)) return false;
    const e: Ev = { step: from, midi: m, len, vel: 0.96, peak: true };
    const way = rng.next();
    if (lick === 'sung' && way < 0.5) Object.assign(e, { bend: 2, dyad: 0 });
    else if ((lick === 'blues' || lick === 'muted') && way < 0.5 && (inScale(m - 3) || inScale(m - 4))) Object.assign(e, { bend: inScale(m - 3) ? 3 : 4, rake: 3 });
    else if (lick === 'run' && way < 0.5) Object.assign(e, { bend: 0, trill: inScale(m + 2) ? 2 : 1 });
    else if (lick === 'simple' && way < 0.5) Object.assign(e, { bend: 0, dyad: 12, slide: -2 });
    else Object.assign(e, { bend: inScale(m - 2) ? 2 : inScale(m - 1) ? 1 : 0 });
    evs.push(e);
    return true;
  };

  let cursor = 0, quoted = false, repeats = 0, units = 0;
  // now and then the hook quoted first
  const quote = hook?.filter((h) => h.step < 16 && h.notes.length) ?? [];
  if (quote.length >= 3 && rng.chance(0.25)) {
    const lowQ = Math.min(...quote.map((h) => h.notes[0]));
    const shift = 12 * Math.round((centerAt(0) - 5 - lowQ) / 12);
    for (const h of quote) evs.push({ step: h.step, midi: h.notes[0] + shift, len: h.len, vel: vel0, bend: 0 });
    cursor = Math.max(...quote.map((h) => h.step + h.len));
    quoted = true;
  } else cursor = 0;
  // (classic solos often open singing one note: held, or bent; half the time)
  if (!quoted && rng.chance(0.35)) {
    const o = rng.chance(0.5) ? bendMove(0, total - 2, centerAt(0)) : heldPhrase(0, total - 2, centerAt(0));
    if (o) { evs.push(...o.evs); cursor = o.end; }
  }

  const end = total - 2;

  // Phrasing (docs/SOLO-NEW.md, "Phrasing"; real solos, docs/STUDY-SOLO.md): the solo as phrases, each with a start
  // (on a bar line, a beat, off the beat, or a pickup over the bar line), a length (real phrases' lengths, longer where
  // the energy takes the pace up), a role (a call, ending up and open on a chord note; or its answer, ending lower,
  // settled, now and then opening with the call's rhythm) and an ending (held a beat or more more often than not, the
  // next phrase coming in off it; else a rest); the licks, runs, bends and build-ups fill each phrase.
  let stretch = 0;
  let phraseRhythm: Rhythm | null = null;
  /** One unit at the cursor, inside the phrase (ending by `lim`); false if nothing went in. */
  const unit = (lim: number): boolean => {
      const target = prevNote();
      // (a position move: the energy has taken the line higher or lower; aim there)
      const aim = Math.abs(centerAt(cursor) - target) > 6 ? centerAt(cursor) : target;
      if (!marked && markAt >= 0 && cursor >= markAt && trademark(cursor, lim)) {
        marked = true;
        cursor = evs[evs.length - 1].step + evs[evs.length - 1].len;
        return true;
      }
      toTop = rng.chance(0.5);
      // the calm: a held note sung over the band (where the energy takes the pace down)
      const lvl = en.paceC * E(cursor);
      if ((lvl < -0.25 && rng.chance(Math.min(0.9, 0.9 * -lvl))) || rng.chance(0.08)) {
        const hp = heldPhrase(cursor, lim, aim);
        if (hp) {
          const last = evs[evs.length - 1];
          if (last && hp.evs[0].step - last.step > last.len && hp.evs[0].step - last.step <= 4) last.len = hp.evs[0].step - last.step;
          evs.push(...hp.evs);
          cursor = hp.end;
          return true;
        }
      }
      // a build-up where the energy is high (rising into a crest, or on it)
      if (builds < maxBuilds && E(cursor) > 0.35 && E(Math.min(total - 1, cursor + 16)) >= E(cursor) - 0.5 && rng.chance(0.4)) {
        const bu = buildUp(cursor, end, aim);
        if (bu && bu.end > lim) stretch = bu.end;
        if (bu) {
          const last = evs[evs.length - 1];
          if (last && bu.evs[0].step - last.step > last.len && bu.evs[0].step - last.step <= 4) last.len = bu.evs[0].step - last.step;
          evs.push(...bu.evs); builds++; units++;
          cursor = bu.end;
          return true;
        }
      }
      // a bend move (more for the melodic and blues players, more in the calm)
      if (rng.chance(BEND_RATE[lick] * (1 + Math.max(0, -lvl)))) {
        const bm = bendMove(cursor, lim, aim);
        if (bm) { evs.push(...bm.evs); units++; cursor = bm.end; return true; }
      }
      if (triplets && rng.chance(0.35)) {
        const tl = tripletLick(cursor, lim, aim);
        if (tl) { push(tl.ms, tl.steps, tl.lens, 0.04, tl.shifts); cursor = tl.end; units++; return true; }
      }
      if (runny && rng.chance(Math.min(0.95, Math.max(0.1, 0.55 * (1 + 0.8 * en.paceC * E(cursor)))))) {
        const run = turningRun(cursor, lim, aim);
        if (run) { push(run.ms, run.steps, run.lens); cursor = run.end; units++; return true; }
      }
      // worked over: played again 1-3 times, changed, at the same place in the bar
      let again = rng.weighted<number>([[0, 65], [1, 30], [2, 5]]);
      const half = rng.chance(0.35);
      // (a lick to be played again starts at a bar line, within a beat, and stays inside its bar)
      const bar = bars.find((b) => b.start >= cursor && b.start - cursor <= 6);
      let l = again && bar ? newLick(bar.start + rng.pick([0, 0, 1, 2, 4]), Math.min(lim, bar.start + bar.len), aim) : null;
      if (l && bar) { const last = evs[evs.length - 1]; if (last && l.steps[0] - last.step > last.len && l.steps[0] - last.step <= 12) last.len = l.steps[0] - last.step; }
      // (the first lick starts on the beat about two times in three, as real solos do)
      if (!l) { l = newLick(cursor, lim, aim, undefined, !units && cursor === 0 && rng.chance(0.64)); again = Math.min(again, 1); }
      if (!l) {
        // (nothing fits here, the riff in the way: a turning run, else a short chord note)
        const run = rng.chance(0.4) ? turningRun(cursor, lim, aim) : null;
        if (run) { push(run.ms, run.steps, run.lens); cursor = run.end; return true; }
        let m = aim;
        for (let d = 0; d < 7 && (!fit.isTone(m, cursor) || fit.clash(m, cursor)); d++) m = aim + (d % 2 ? -1 : 1) * Math.ceil((d + 1) / 2);
        // (held longer in the calm)
        const hold = en.paceC * E(cursor) < -0.25 ? 6 : 2;
        if (fit.isTone(m, cursor) && !fit.clash(m, cursor)) evs.push({ step: cursor, midi: m, len: hold, vel: vel0 });
        cursor += hold;
        return true;
      }
      push(l.ms, l.steps, l.lens);
      if (!phraseRhythm) phraseRhythm = l.r;
      units++;
      cursor = l.end;
      // (a staircase: played again, each time ending a chord note higher, slid into and held)
      const stairs = again > 0 && rng.chance(0.3);
      let stairTop = l.ms[l.ms.length - 1];
      for (let k = 0; k < again; k++) {
        const v = stairs ? 'stair' : rng.weighted<Variation>([['same', 15], ['ending', 45], ['answer', 30], ['octave', 10]]);
        // (a bar on from the last time, now and then half a bar for a short lick: the note before rings on to it)
        const P = l.end - l.at <= 8 && half ? 8 : 16;
        const from = l.at + P * (k + 1);
        // (too far on: the lick has had its say)
        if (from < cursor || from - cursor > 8) break;
        const laid = lay(l.r, from);
        if (laid.end > lim) break;
        let ms: number[] | null = null;
        if (v === 'stair') {
          ms = [...l.ms];
          const g = laid.steps[ms.length - 1], up = toneNear(stairTop + 2, g, true);
          if (up === null || up > windowAt(g)[1] + 3) break;
          ms[ms.length - 1] = up; stairTop = up;
          laid.lens[laid.lens.length - 1] = Math.max(laid.lens[laid.lens.length - 1], 4);
        } else if (v === 'same') ms = [...l.ms];
        else if (v === 'octave') { const up = l.ms.map((m) => m + (l.ms[0] + 12 <= windowAt(from)[1] + 2 ? 12 : -12)); ms = up; }
        else if (v === 'ending') {
          // the last one or two notes another way: a near chord note, or a step from the one before
          ms = [...l.ms];
          const cut = rng.chance(0.5) ? 1 : 2;
          for (let i = ms.length - cut; i < ms.length; i++) {
            const g = laid.steps[i], before = ms[i - 1];
            const opts: [number, number][] = [];
            for (let m = before - 5; m <= before + 5; m++) if (m !== l.ms[i] && (inScale(m) || fit.isTone(m, g))) opts.push([m, (fit.isTone(m, g) ? 3 : 1) / (1 + Math.abs(m - before))]);
            if (opts.length) ms[i] = rng.weighted(opts);
          }
        } else {
          const a = newLick(from, lim, prevNote(), l.r);
          ms = a ? a.ms : null;
        }
        ms = ms ? refit(ms, laid.steps, laid.lens) : null;
        if (!ms) break;
        // (the note before rings on to it)
        const last = evs[evs.length - 1];
        if (last && laid.steps[0] - last.step > last.len) last.len = laid.steps[0] - last.step;
        push(ms, laid.steps, laid.lens, 0.02);
        if (v === 'stair') evs[evs.length - 1].slide = -2;
        repeats++;
        cursor = laid.end;
      }
      return true;
  };

  /** Where the next phrase starts, from `from`: on a bar line, a beat, off the beat, or a pickup into the next bar. */
  const phraseStart = (from: number) => {
    const nextBar = bars.find((b) => b.start >= from);
    const kind = rng.weighted<number>([[0, 16], [1, 22], [2, 49], [3, 13]]);
    // (never far: a bar line or a pickup only when one is near)
    if (kind === 0 && nextBar && nextBar.start - from <= 4) return nextBar.start;
    if (kind === 3 && nextBar && nextBar.start - from >= 1 && nextBar.start - from <= 4) return nextBar.start - Math.min(nextBar.start - from, rng.pick([1, 2, 2, 3]));
    const beat = from + mod(-from, 4);
    if (kind === 2) return beat - from >= 2 ? beat - 2 : from + mod(2 - from, 4);
    return beat;
  };
  /** A phrase's length in steps: real phrases (a beat or less 19%, 1-2 beats 17%, 2-4 33%, 4-8 20%, 8+ 10%), longer where the pace is up. */
  const phraseLen = (at: number) => {
    const [lo, hi] = rng.weighted<[number, number]>([[[1, 1.5], 19], [[1.5, 2], 17], [[2, 4], 33], [[4, 8], 20], [[8, 12], 10]]);
    const lvl = en.paceC * E(at);
    const beats = 1.25 * (lo + rng.next() * (hi - lo)) * (lvl > 0 ? 1 + 1.2 * lvl : 1 + 0.5 * Math.max(-0.6, lvl));
    return Math.max(2, Math.round(beats * 4));
  };
  /** The rest after a phrase (steps), on top of where the next one starts (real: none after a held ending 41%, under a beat 41%, 1-2 beats 12%, more 6%); longer in the calm. */
  const phraseGap = (at: number, held: boolean) => {
    const calm = Math.max(0, -en.paceC * E(at));
    // (the next phrase's start sets most rests: here only none, or now and then a longer breath)
    return rng.weighted<number>([[0, held ? 70 : 85], [rng.pick([4, 6]), 10 + 12 * calm], [8, 3 + 5 * calm]]);
  };

  let role: 'call' | 'answer' = 'call', flow = false;
  let opening: Rhythm | null = null, openingMs: number[] = [];
  while (cursor < end - 4) {
    // (off a held ending, the next phrase comes straight in; else at its own start)
    const at = flow ? cursor : Math.max(cursor, phraseStart(cursor));
    if (at >= end - 2) break;
    const lim = Math.min(end, at + phraseLen(at));
    const first = evs.length;
    stretch = 0;
    const lastRhythm = phraseRhythm;
    phraseRhythm = null;
    void lastRhythm;
    cursor = at;
    // an answer now and then opens with its call's rhythm (real: the next phrase opens with the same rhythm 38% of the time)
    if (opening && rng.chance(role === 'answer' ? 0.7 : 0.35)) {
      const e = newLick(at, lim, prevNote(), opening);
      if (e) { push(e.ms, e.steps, e.lens); units++; cursor = e.end; }
      else {
        // (else the call's opening notes themselves, moved a note or two along the scale, in its rhythm)
        const at2 = at + mod(opening.off - at, 4);
        const steps = opening.ons.map((o) => at2 + o), lens = steps.map((g, i) => (i + 1 < steps.length ? steps[i + 1] - g : 2));
        if (steps[steps.length - 1] + 2 <= lim) {
          const ms = refit(moveScale(openingMs, rng.pick([-2, -1, 1, 2])), steps, lens);
          if (ms) { push(ms, steps, lens); units++; cursor = steps[steps.length - 1] + 2; }
        }
      }
    }
    // the phrase filled
    // (until it's full, or nothing more fits: then it ends where its last note does)
    // (a lick may run a beat past the phrase's planned end rather than not be played)
    for (let tries = 0; cursor < Math.max(lim, stretch) - 2 && tries < 12; tries++) if (!unit(Math.min(end, Math.max(lim, stretch) + 4))) break;
    if (evs.length === first) { cursor = Math.max(cursor, at + 2); continue; }
    // (its opening rhythm, for an answer to echo: its first 4-5 notes)
    {
      const o = evs.slice(first, first + 5).filter((e, i, a) => !e.shift && (i === 0 || e.step > a[i - 1].step));
      opening = o.length >= 4 && o[o.length - 1].step - o[0].step <= 12 ? { key: 'echo', off: mod(o[0].step, 4), ons: o.map((e) => e.step - o[0].step), tail: 2, songs: 1, genres: [], speed: 'mid' } : null;
      openingMs = o.map((e) => e.midi);
    }
    // its ending: a call ends up and open (a chord note, not the root), an answer lower and settled (the root, else
    // a chord note under the call's end); held a beat or more more often than not
    const last = evs[evs.length - 1];
    if (!last.peak && last.dyad === undefined && !last.bend && !last.unbend && !last.lateBend && !last.shift) {
      const root = chordPc(key, fit.chordAt(last.step));
      const ok = (m: number) => fit.isTone(m, last.step) && !fit.clash(m, last.step) && (last.len < 4 || !fit.rubs(m, last.step));
      const want = (m: number) => (role === 'call' ? mod(m, 12) !== root : mod(m, 12) === root);
      const opts = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5].map((d) => last.midi + d).filter((m) => ok(m) && m >= windowAt(last.step)[0] - 2 && m <= windowAt(last.step)[1] + 2);
      const pick = opts.find(want) ?? opts[0];
      if (pick !== undefined && rng.chance(0.85)) last.midi = pick;
    }
    const pl = en.paceC * E(last.step);
    const held = rng.chance(Math.min(0.8, Math.max(0.3, 0.55 - 0.25 * pl)));
    role = role === 'call' && rng.chance(0.65) ? 'answer' : 'call';
    const gap = phraseGap(last.step, held);
    flow = held && gap === 0;
    if (held) {
      // (held on into where the next phrase starts: a beat and a half to two beats or so)
      const hold = Math.min(end - last.step, rng.pick([4, 5, 6, 8]));
      const into = flow ? phraseStart(last.step + hold) : last.step + hold;
      last.len = Math.max(last.len, Math.min(end - last.step, into - last.step, hold + 4));
    }
    cursor = last.step + last.len + gap;
  }

  // the ending: most run on into the next section (a short last note), some land on the root, held
  if (evs.length) {
    const last = evs[evs.length - 1];
    if (rng.chance(0.4)) {
      const g = Math.min(total - 4, Math.max(last.step + last.len, total - 8));
      const root = chordPc(key, fit.chordAt(g));
      let m = last.midi;
      while (mod(m, 12) !== root) m--;
      if (last.midi - m > 6) m += 12;
      if (g > last.step && !fit.clash(m, g)) evs.push({ step: g, midi: m, len: total - 2 - g, vel: vel0 + 0.04 });
      else last.len = Math.max(last.len, Math.min(8, total - 2 - last.step));
    } else last.len = Math.min(last.len, 3);
  }

  // a held note now and then picked again (real solos play the same note twice in a row a quarter of the time)
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.len >= 4 && !e.peak && e.dyad === undefined && !e.bend && !e.lateBend && !e.unbend && rng.chance(0.3)) {
      const half = 2 * Math.floor(e.len / 4);
      evs.splice(i + 1, 0, { ...e, step: e.step + half, len: e.len - half, vel: e.vel - 0.05 });
      e.len = half;
    }
  }

  // leaning on the chord: a note on a beat, or held an 8th or more, that isn't one of the chord's notes moves to the
  // nearest one (a step at most, the way the line was going) now and then
  evs.forEach((e, i) => {
    if (e.peak || e.dyad !== undefined || e.shift || fit.isTone(e.midi, e.step) || (e.step % 4 !== 0 && e.len < 2) || !rng.chance(0.9)) return;
    const dir = i > 0 && e.midi < evs[i - 1].midi ? -1 : 1;
    for (const d of [dir, -dir, 2 * dir, -2 * dir]) {
      const m = e.midi + d;
      if (fit.isTone(m, e.step) && !fit.clash(m, e.step)) { e.midi = m; break; }
    }
  });

  const hits = playSolo(rng, evs, { lick, key, minor, isTone: fit.isTone, inScale, total, t });
  return {
    hits,
    notes: [`Guitar 2: a solo (new): ${ENERGY_WORDS[en.shape](en)}${en.pitchC ? `, ${en.pitchC > 0 ? 'higher' : 'lower'} where it's strong` : ''}${en.paceC ? `, ${en.paceC > 0 ? 'busier' : 'sparer'} where it's strong` : ''}${quoted ? ', starts on the hook' : ''}, ${units} licks from real solos${repeats ? `, ${repeats} played again` : ''}${triplets ? ', triplets' : ''}${builds ? `, ${builds === 1 ? 'a build-up' : `${builds} build-ups`}` : ''}${runny ? ', quick turning runs' : ''}`],
  };
}
