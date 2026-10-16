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

type Plan = 'level' | 'falling' | 'rising' | 'arch' | 'dip';
/** Real solos' shapes (how high each quarter sits) and how often each comes. */
const PLANS: [Plan, number][] = [['level', 38], ['falling', 20], ['rising', 17], ['arch', 15], ['dip', 9]];
const PLAN_H: Record<Plan, number[]> = { level: [0, 0, 0, 0], falling: [3, 1, -1, -3], rising: [-3, -1, 1, 3], arch: [-3, 2, 3, -1], dip: [2, -3, -2, 2] };
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

  const plan = rng.weighted(PLANS);
  const R = 57 + mod(key - 57, 12);
  const base = R + 3 + Math.round(3 * intensity);
  const centerAt = (g: number) => base + PLAN_H[plan][Math.min(3, Math.floor((4 * g) / total))];
  const windowAt = (g: number): [number, number] => [Math.max(50, centerAt(g) - 8), Math.min(84, centerAt(g) + 9)];
  // (the rhythms' own held last notes and the breaths thin it out: aimed a third above the real count)
  const D = 1.5 * DENSITY[genre] * BUSY[lick] * (0.85 + 0.3 * intensity);
  const runny = rng.chance(Math.min(0.9, RUNS[genre] * RUN_LEAN[lick] * (0.7 + 0.6 * intensity)));
  const vel0 = 0.8 + 0.08 * intensity;
  const shapes = SHAPES.filter((s) => s.minor === boxMinor);
  const shapeW = (s: Shape) => Math.sqrt(s.songs) * (1 + (gi >= 0 ? (3 * s.genres[gi]) / Math.max(1, s.genres.reduce((a, b) => a + b, 0)) : 0));
  const rhythmsFor = (n: number) => RHYTHMS.filter((r) => r.ons.length === n);
  const rhythmW = (r: Rhythm) => {
    const dens = (r.ons.length * 16) / (r.ons[r.ons.length - 1] + r.tail);
    return Math.sqrt(r.songs) * Math.exp(-(((dens - D) / (0.35 * D)) ** 2));
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
  const score = (ms: number[], steps: number[], lens: number[], target: number) => {
    let s = -Math.abs(ms[0] - target);
    ms.forEach((m, i) => {
      const strong = barStarts.has(steps[i]) || changes.has(steps[i]) || lens[i] >= 4 || i === ms.length - 1;
      if (strong) s += fit.isTone(m, steps[i]) ? 1.5 : -1.5;
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
  const push = (ms: number[], steps: number[], lens: number[], accent = 0.04) => {
    ms.forEach((m, i) => evs.push({ step: steps[i], midi: m, len: lens[i], vel: vel0 + (i === 0 ? accent : 0) + (rng.next() - 0.5) * 0.06 }));
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
      const r = keepRhythm ?? rng.weighted(ok.map((x) => [x, rhythmW(x)] as [Rhythm, number]));
      const l = lay(r, from);
      if (l.end > limit) continue;
      const p = placeShape(sh, l.steps, l.lens, target, windowAt(l.at));
      if (p && (!best || p.s > best.s)) best = { ms: p.ms, ...l, r, sh, s: p.s };
    }
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

  // the trademark held note: once, somewhere in the solo
  const markAt = rng.chance(0.65) ? Math.floor(total * (0.15 + 0.75 * rng.next())) : -1;
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

  const end = total - 2;
  while (cursor < end - 4) {
    const target = prevNote();
    // (a position move: the plan's next quarter starts higher or lower; aim there)
    const aim = Math.abs(centerAt(cursor) - target) > 6 ? centerAt(cursor) : target;
    if (!marked && markAt >= 0 && cursor >= markAt && trademark(cursor, end)) {
      marked = true;
      cursor = evs[evs.length - 1].step + evs[evs.length - 1].len;
      continue;
    }
    if (runny && rng.chance(0.55)) {
      const run = turningRun(cursor, end, aim);
      if (run) { push(run.ms, run.steps, run.lens); cursor = run.end + (rng.chance(0.3) ? 2 : 0); units++; continue; }
    }
    // worked over: played again 1-3 times, changed, at the same place in the bar
    let again = rng.weighted<number>([[0, 15], [1, 40], [2, 30], [3, 15]]);
    const half = rng.chance(0.35);
    // (a lick to be played again starts at a bar line, within a beat, and stays inside its bar)
    const bar = bars.find((b) => b.start >= cursor && b.start - cursor <= 6);
    let l = again && bar ? newLick(bar.start + rng.pick([0, 0, 1, 2, 4]), Math.min(end, bar.start + bar.len), aim) : null;
    if (l && bar) { const last = evs[evs.length - 1]; if (last && l.steps[0] - last.step > last.len && l.steps[0] - last.step <= 12) last.len = l.steps[0] - last.step; }
    // (the first lick starts on the beat about two times in three, as real solos do)
    if (!l) { l = newLick(cursor, end, aim, undefined, !units && cursor === 0 && rng.chance(0.64)); again = Math.min(again, 1); }
    if (!l) {
      // (nothing fits here, the riff in the way: a turning run, else a short chord note)
      const run = rng.chance(0.4) ? turningRun(cursor, end, aim) : null;
      if (run) { push(run.ms, run.steps, run.lens); cursor = run.end; continue; }
      let m = aim;
      for (let d = 0; d < 7 && (!fit.isTone(m, cursor) || fit.clash(m, cursor)); d++) m = aim + (d % 2 ? -1 : 1) * Math.ceil((d + 1) / 2);
      if (fit.isTone(m, cursor) && !fit.clash(m, cursor)) evs.push({ step: cursor, midi: m, len: 2, vel: vel0 });
      cursor += 2;
      continue;
    }
    push(l.ms, l.steps, l.lens);
    units++;
    cursor = l.end;
    for (let k = 0; k < again; k++) {
      const v = rng.weighted<Variation>([['same', 40], ['ending', 35], ['answer', 17], ['octave', 8]]);
      // (a bar on from the last time, now and then half a bar for a short lick: the note before rings on to it)
      const P = l.end - l.at <= 8 && half ? 8 : 16;
      const from = l.at + P * (k + 1);
      // (too far on: the lick has had its say)
      if (from < cursor || from - cursor > 8) break;
      const laid = lay(l.r, from);
      if (laid.end > end) break;
      let ms: number[] | null = null;
      if (v === 'same') ms = [...l.ms];
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
        const a = newLick(from, end, prevNote(), l.r);
        ms = a ? a.ms : null;
      }
      if (!ms || !fits(ms, laid.steps, laid.lens)) break;
      // (the note before rings on to it)
      const last = evs[evs.length - 1];
      if (last && laid.steps[0] - last.step > last.len) last.len = laid.steps[0] - last.step;
      push(ms, laid.steps, laid.lens, 0.02);
      repeats++;
      cursor = laid.end;
    }
    // a breath now and then
    cursor += rng.weighted<number>([[0, 70], [2, 22], [4, 8]]);
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
    if (e.len >= 4 && !e.peak && e.dyad === undefined && rng.chance(0.3)) {
      const half = 2 * Math.floor(e.len / 4);
      evs.splice(i + 1, 0, { ...e, step: e.step + half, len: e.len - half, vel: e.vel - 0.05 });
      e.len = half;
    }
  }

  const hits = playSolo(rng, evs, { lick, key, minor, isTone: fit.isTone, inScale, total, t });
  return {
    hits,
    notes: [`Guitar 2: a solo (new): ${plan === 'level' ? 'level' : plan}${quoted ? ', starts on the hook' : ''}, ${units} licks from real solos${repeats ? `, ${repeats} played again` : ''}${runny ? ', quick turning runs' : ''}`],
  };
}
