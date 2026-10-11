// Guitar solos, written the way good solos are built (the research: docs/SOLO-THEORY.md):
// - an arc: an opening, a build, the peak at about 70% of the way (its highest note, not heard before),
//   then a release that lands on the root of the last chord
// - phrases two bars at a time, a call (ending open, on the 3rd or 5th) and an answer (ending home),
//   with rests between them that shrink as the solo builds
// - rhythm first: cells of 2-4 notes; a motif (its rhythm and shape) comes back varied (a step up,
//   cut short) in about half the phrases; the peak climbs the motif two or three times, then breaks out
// - mostly steps, the odd leap (and after a leap the line turns back), arches more than anything
// - chord notes on the strong beats and at chord changes, every phrase ending on one; held notes
//   never rub against the chord or the riff
// - the bends a guitarist uses (a step up into a chord note), the blue third curled toward the major
//   third, slides into some phrases
// The lead player decides the rest: how many notes, how much space, what the peak is (players/lead.ts).

import type { ChordPart, GuitarHit, Song } from '../idea';
import type { LickKind } from '../players/lead';
import type { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import { SCALES, chordPc } from '../theory';
import { TUNINGS } from '../theory/fretboard';
import { type Guitar2Part, MINORISH, chordTones, leadFret, leadScale } from './guitar2';

const mod = (n: number, m: number) => ((n % m) + m) % m;

type Phase = 'open' | 'build' | 'peak' | 'release';
type Level = 0 | 1 | 2;
type Contour = 'arch' | 'down' | 'up' | 'level';

/** Rhythm cells over two beats (16ths), sparse to busy. */
const CELLS: number[][][] = [
  [[0, 4], [0, 6], [0], [2, 4], [0, 3]],
  [[0, 2, 4], [0, 2, 4, 6], [0, 3, 4, 6], [0, 2, 3, 6], [0, 4, 6]],
  [[0, 1, 2, 3, 4, 6], [0, 1, 2, 3, 4, 5, 6, 7], [0, 2, 3, 4, 5, 6], [0, 1, 2, 4, 5, 6]],
];

/** How each kind of player solos: how busy (a shift of the rhythm level), how often a held note is bent, the peak. */
const STYLE: Record<LickKind, { busy: number; bend: number; peak: string }> = {
  sung: { busy: -1, bend: 0.4, peak: 'a long bend up to the top note' },
  blues: { busy: -1, bend: 0.5, peak: 'a bend up to the top note, then a blues answer' },
  run: { busy: 1, bend: 0.15, peak: 'a fast 16th run up to the top note' },
  simple: { busy: -1, bend: 0.25, peak: 'the top note hammered on the 8ths' },
  muted: { busy: 0, bend: 0.1, peak: 'funky stabs on the top note' },
};

interface Ev { step: number; midi: number; len: number; vel: number; bend?: number; slide?: number }
interface Motif { rhythm: number[]; moves: number[] }

/**
 * A guitar solo over a section (usually 8 or 16 bars). `lick`: the lead player's kind. `hook`: the
 * track's hook over the same chords (the solo can start by quoting it), or null.
 */
export function generateSolo(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, lick: LickKind, hook: GuitarHit[] | null): Guitar2Part {
  const { key, mode, bars, total } = song;
  const t = song.tuning ?? TUNINGS.standard;
  const minor = MINORISH.includes(mode);
  const st = STYLE[lick];
  // the solo's root: the key's root between A3 and G#4 (the peak then sits up to an octave and a half higher)
  const R = 57 + mod(key - 57, 12);
  const scale = lick === 'blues' ? [0, 3, 5, 6, 7, 10] : lick === 'run' ? [...SCALES[mode]] : lick === 'sung' ? leadScale(rng, mode, 0.3)
    : minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const inScale = (m: number) => scale.includes(mod(m - key, 12));
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(Math.max(0, g), total - 1)]].chord;
  const isTone = (m: number, g: number) => chordTones(key, chordAt(g)).includes(mod(m, 12));
  const rootOf = (g: number) => chordPc(key, chordAt(g));
  // a held note that rubs: a semitone from a chord note, or the flat 5th of the chord
  const rubs = (m: number, g: number) => !isTone(m, g)
    && (chordTones(key, chordAt(g)).some((c) => [1, 11].includes(mod(m - c, 12))) || mod(m - rootOf(g), 12) === 6);
  const riffClash = (m: number, g: number) => (riff ?? []).some((h) => h.step <= g && g < h.step + h.len && h.mute !== 'dead'
    && h.notes.some((n) => [1, 11].includes(mod(m - n, 12))));
  const pool = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) if (inScale(m)) out.push(m);
    return out;
  };
  const changes = new Set(chords.timeline.map((e) => e.step));

  // the plan: two bars a unit; the peak unit at about 70% of the way, then the release
  const units: Bar[][] = [];
  for (let i = 0; i < bars.length; i += 2) units.push(bars.slice(i, i + 2));
  const U = units.length;
  const peakU = U >= 3 ? Math.min(U - 2, Math.max(1, Math.round(0.7 * U) - 1)) : U - 1;
  const openN = Math.max(1, Math.round(0.3 * U));
  const phaseOf = (u: number): Phase => (u === peakU ? 'peak' : u > peakU ? 'release' : u < openN ? 'open' : 'build');
  // the peak note: the highest chord note near an octave and a half above the root (within the guitar's reach)
  const peakBar = units[peakU][units[peakU].length - 1];
  let top = Math.min(R + 17, 83);
  while (!isTone(top, peakBar.start) && top > R + 10) top--;
  const buildN = Math.max(1, peakU - openN);
  // the register: the ceiling climbs unit by unit, always under the peak note until the peak
  const range = (u: number, ph: Phase): [number, number] => {
    if (ph === 'open') return [R - 5, R + 7];
    if (ph === 'build') return [R - 2, Math.min(top - 1, R + 9 + Math.round((5 * (u - openN + 1)) / buildN))];
    if (ph === 'peak') return [R + 3, top];
    return [R - 5, R + 9];
  };

  const evs: Ev[] = [];
  let quoted = false;
  let motif: Motif | null = null;
  let lastRhythm: number[] | null = null;

  /** One phrase: onsets from `start`, a held last note at `finalAt` until `end`, ending on `close` (home: the root; open: the 3rd or 5th). */
  const phrase = (start: number, finalAt: number, end: number, level: Level, lo: number, hi: number, contour: Contour, close: 'home' | 'open', vel: number, reuse: boolean) => {
    const P = pool(lo, hi);
    if (!P.length || finalAt <= start) return;
    // rhythm: the motif's (or the last phrase's) again, or new cells
    let rhythm: number[];
    if (reuse && (motif || lastRhythm)) rhythm = [...(motif && rng.chance(0.6) ? motif.rhythm : lastRhythm ?? motif!.rhythm)];
    else {
      rhythm = [];
      for (let p = 0; p < finalAt - start; p += 8) for (const o of rng.pick(CELLS[level])) rhythm.push(p + o);
    }
    rhythm = rhythm.filter((o) => start + o < finalAt);
    if (!rhythm.length || rhythm[0] !== 0) rhythm.unshift(0);
    rhythm = [...new Set(rhythm)].sort((a, b) => a - b);
    const steps = [...rhythm.map((o) => start + o), finalAt];
    if (!lastRhythm || !reuse) lastRhythm = rhythm;
    // pitch: a walk mostly by step, shaped by the contour; leaps turn back
    // a new phrase picks up near where the last one ended (just above it to fall, just below to rise)
    const third = Math.max(1, Math.floor(P.length / 3));
    let idx: number;
    const prev = evs.length ? evs[evs.length - 1].midi : null;
    if (prev !== null && rng.chance(0.85)) {
      const near = P.reduce((bi, m, i) => (Math.abs(m - prev) < Math.abs(P[bi] - prev) ? i : bi), 0);
      idx = Math.max(0, Math.min(P.length - 1, near + (contour === 'down' ? rng.int(1, 2) : contour === 'up' ? -rng.int(1, 2) : rng.pick([-1, 1]))));
    } else idx = contour === 'down' ? P.length - 1 - rng.int(0, third) : contour === 'level' ? Math.floor(P.length / 2) : rng.int(0, third);
    const motifMoves = reuse && motif && rng.chance(0.5) ? motif.moves : null;
    const moves: number[] = [];
    let lastMove = 0;
    steps.forEach((g, i) => {
      const last = i === steps.length - 1;
      if (i > 0) {
        let mv: number;
        if (motifMoves && i - 1 < motifMoves.length) mv = motifMoves[i - 1];
        else {
          const half = i < steps.length / 2;
          const dir = contour === 'up' ? 1 : contour === 'down' ? -1 : contour === 'arch' ? (half ? 1 : -1) : rng.pick([1, -1]);
          const r = rng.next();
          if (Math.abs(lastMove) >= 2) mv = -Math.sign(lastMove);
          else if (r < 0.12) mv = dir * rng.int(2, 3);
          else if (r < 0.27) mv = 0;
          else mv = r < 0.35 ? -dir : dir;
        }
        if (idx + mv < 0 || idx + mv >= P.length) mv = -mv;
        idx = Math.max(0, Math.min(P.length - 1, idx + mv));
        lastMove = mv;
        moves.push(mv);
      }
      const len = (last ? end : steps[i + 1]) - g;
      // strong beats and chord changes on chord notes; the last note on the right one
      const strong = changes.has(g) || bars.some((b) => b.start === g) || (bars.some((b) => g - b.start === groupStarts(b.groups)[2]) && rng.chance(0.6));
      const fits = (m: number) => !riffClash(m, g) && (len < 4 || !rubs(m, g));
      const wantRoot = last && close === 'home', wantOpen = last && close === 'open';
      const ok = (m: number) => fits(m) && (wantRoot ? mod(m, 12) === rootOf(g) : wantOpen ? isTone(m, g) && mod(m, 12) !== rootOf(g) : strong || len >= 4 ? isTone(m, g) : true);
      // no more than two of the same note running (unless the line means to repeat)
      const before = evs.length ? evs[evs.length - 1].midi : null, before2 = evs.length > 1 ? evs[evs.length - 2].midi : null;
      const stuck = (m: number) => i > 0 && m === before && (lastMove !== 0 || m === before2);
      if (!ok(P[idx]) || stuck(P[idx])) {
        const dir = lastMove >= 0 ? 1 : -1;
        for (let d = 1; d < P.length; d++) {
          const j = [idx + dir * d, idx - dir * d].find((x) => x >= 0 && x < P.length && ok(P[x]) && !stuck(P[x]));
          if (j !== undefined) { idx = j; break; }
        }
      }
      // (a root that isn't in the scale pool: take it anyway, it's the landing)
      let m = P[idx];
      if (wantRoot && mod(m, 12) !== rootOf(g)) m = m - mod(m - rootOf(g), 12) + (mod(m - rootOf(g), 12) > 6 ? 12 : 0);
      evs.push({ step: g, midi: m, len: Math.max(1, len), vel: vel + (i === 0 ? 0.04 : 0) + (rng.next() - 0.5) * 0.06 });
    });
    if (!motif) motif = { rhythm, moves };
  };

  const vel = (u: number) => 0.8 + 0.12 * Math.min(1, u / Math.max(1, peakU)) - (u > peakU ? 0.06 : 0);
  const level = (base: Level): Level => Math.max(0, Math.min(2, base + st.busy)) as Level;
  const gs = (b: Bar) => groupStarts(b.groups).map((p) => b.start + p);
  const endOf = (b: Bar) => b.start + b.len;

  units.forEach((B, u) => {
    const ph = phaseOf(u);
    const [lo, hi] = range(u, ph);
    const a = B[0], b = B[1] ?? B[0];
    const ga = gs(a), gb = gs(b);
    const lastUnit = u === U - 1;
    // a phrase starts on the downbeat about a third of the time, else on the "and" of 1 or on beat 2
    const off = (g: number[]) => rng.weighted<number>([[g[0], 35], [g[0] + 2, 35], [g[1] ?? g[0], 30]]);
    const contour = (): Contour => rng.weighted<Contour>(ph === 'build' ? [['arch', 4], ['up', 3], ['down', 2], ['level', 1]] : [['arch', 5], ['down', 3], ['up', 1], ['level', 1]]);

    if (ph === 'peak') {
      // into the peak: the motif climbing two or three times, then the top note, the player's way
      const P = pool(R, top - 1);
      if (lick === 'run') {
        const run = P.slice(-Math.min(P.length, a.len - 2));
        run.forEach((m, i) => evs.push({ step: a.start + 2 + i, midi: m, len: 1, vel: 0.84 + (0.1 * i) / run.length }));
      } else {
        const cell = rng.pick([[0, 2, 4], [0, 2, 3, 4], [0, 3, 4]]);
        const reps = a.len >= 16 ? 3 : 2;
        const span = Math.floor(a.len / reps);
        let base = Math.max(0, P.length - 2 - reps * 2);
        for (let r = 0; r < reps; r++) {
          cell.forEach((o, i) => {
            const g = a.start + r * span + o;
            if (g < endOf(a)) evs.push({ step: g, midi: P[Math.min(P.length - 1, base + i)], len: i === cell.length - 1 ? span - o : (cell[i + 1] - o), vel: 0.86 + r * 0.03 });
          });
          base += 2;
        }
      }
      // the peak note on the downbeat
      const bendFrom = inScale(top - 2) ? 2 : inScale(top - 1) ? 1 : 0;
      if (lick === 'simple') {
        for (let g = b.start; g < (gb[2] ?? endOf(b)); g += 2) evs.push({ step: g, midi: top, len: 2, vel: g === b.start ? 0.97 : 0.88, bend: 0 });
      } else if (lick === 'muted') {
        for (const o of [0, 3, 6, 8, 11].filter((x) => b.start + x < (gb[3] ?? endOf(b)))) evs.push({ step: b.start + o, midi: top, len: 1, vel: 0.9, bend: 0 });
      } else {
        const hold = gb[2] ?? endOf(b);
        evs.push({ step: b.start, midi: top, len: hold - b.start, vel: 0.98, bend: lick === 'run' ? 0 : bendFrom });
      }
      // then a short answer down to a chord note (unless the release follows straight on)
      const from = gb[2] ?? endOf(b);
      if (from < endOf(b) - 2) phrase(from, gb[3] ?? from + 2, endOf(b), level(1), R + 2, top - 2, 'down', 'open', 0.9, false);
      return;
    }

    if (ph === 'open' && u === 0) {
      // the opening: the hook quoted (two bars), one bold bent note, or a phrase
      const quote = hook?.filter((h) => h.step < endOf(b) && h.notes.length) ?? [];
      if (quote.length >= 3 && rng.chance(lick === 'simple' ? 0.8 : 0.6)) {
        const lowQ = Math.min(...quote.map((h) => h.notes[0]));
        const shift = 12 * Math.round((R - 3 - lowQ) / 12);
        for (const h of quote) evs.push({ step: h.step, midi: h.notes[0] + shift, len: h.len, vel: 0.84, bend: 0 });
        quoted = true;
        return;
      }
      if ((lick === 'sung' || lick === 'blues') && rng.chance(0.4)) {
        // one bold note, bent up into a chord note and held, then an answer
        let m = R + 7;
        while (!isTone(m, a.start) && m > R) m--;
        evs.push({ step: a.start, midi: m, len: ga[2] - a.start + 4, vel: 0.9, bend: inScale(m - 2) ? 2 : 1 });
        phrase(gb[0] + 2, gb[2] ?? endOf(b) - 4, endOf(b) - 2, level(0), lo, hi, 'down', 'home', vel(u), false);
        return;
      }
    }

    if (lastUnit && ph === 'release') {
      // the landing: a falling phrase onto the root of the last chord on beat 1 of the last bar (or an
      // 8th early), held two or three beats, the last beat left to the drums
      const landAt = b === a ? (ga[2] ?? a.start) : rng.chance(0.3) ? b.start - 2 : b.start;
      const holdTo = b === a ? endOf(a) - 2 : (gb[gb.length - 1] ?? endOf(b) - 4);
      phrase(off(ga), landAt, holdTo, level(0), R - 5, R + 9, 'down', 'home', vel(u), rng.chance(0.5));
      return;
    }

    // a call and an answer; rests between them shrink as the solo builds
    const lv: Level = ph === 'open' || ph === 'release' ? level(0) : level(u - openN >= buildN / 2 ? 2 : 1);
    const reuse = !!motif && rng.chance(0.6);
    if (ph === 'build') {
      // the call runs over the bar line onto beat 1 (held a beat), the answer follows straight on
      phrase(off(ga), b.start, gb[1] ?? b.start + 4, lv, lo, hi, contour(), 'open', vel(u), reuse);
      phrase(gb[1] ?? b.start + 4, gb[3] ?? endOf(b) - 4, endOf(b) - 2, lv, lo, hi, contour(), 'home', vel(u), rng.chance(0.5));
    } else {
      // opening and release: a short call held to the end of its bar, a breath, a shorter answer
      phrase(off(ga), ga[2] ?? a.start + 8, endOf(a), lv, lo, hi, contour(), 'open', vel(u), reuse);
      if (b !== a) phrase(gb[1] ?? b.start + 4, gb[3] ?? endOf(b) - 4, endOf(b), lv, lo, hi, contour(), 'home', vel(u), rng.chance(0.5));
    }
  });

  // expression: bends on held notes (a step up into the note), the blue third curled up, slides into
  // some phrases; the rest played as written (the hands add no bends of their own)
  evs.sort((x, y) => x.step - y.step);
  const all = evs.filter((e, i) => i === 0 || e.step > evs[i - 1].step);
  all.forEach((e, i) => {
    const prev = all[i - 1];
    const phraseStart = !prev || e.step - (prev.step + prev.len) >= 2;
    if (e.bend === undefined) {
      e.bend = 0;
      if (e.len >= 4 && isTone(e.midi, e.step) && rng.chance(st.bend)) e.bend = inScale(e.midi - 2) ? 2 : inScale(e.midi - 1) ? 1 : 0;
      // the blue third over a major chord, curled up toward the major third
      if (lick === 'blues' && !minor && mod(e.midi - key, 12) === 3 && e.len >= 2) { e.midi += 1; e.bend = 1; }
    }
    if (phraseStart && !e.bend && i > 0 && rng.chance(0.2)) e.slide = -rng.pick([2, 3]);
  });

  const pos = rng.int(5, 12);
  const hits: GuitarHit[] = all.map((e, i) => {
    const next = all[i + 1]?.step ?? total;
    return { step: e.step, ...leadFret(e.midi, t, pos), len: Math.max(1, Math.min(e.len, next - e.step)), vel: Math.min(1, e.vel), bend: e.bend, slide: e.slide };
  });
  return {
    hits,
    notes: [`Guitar 2: a solo: ${quoted ? 'starts by quoting the hook' : 'starts low and sparse'}, phrases in call and answer, builds to its highest note about two-thirds of the way (${st.peak}), lands on the root`],
  };
}
