// Learned (docs/VOCAL-LEARNED.md, option 5 of docs/STUDY-LAKH.md): the vocal's pitches picked note by note by the
// odds learnt from real vocal lines (src/realism/learned.ts: the scale step from the note before, by the step before
// it, where the note starts in the bar, what the note before was against the chord, where it sits in its phrase,
// the genre). The rhythm: with Rhythm Classic its own, each beat sung as real singers sing it (melody.ts gridRhythm,
// src/realism/learned.ts cellOdds); with Grid or Words theirs. The app's
// forms stay on top so a line doesn't wander: a letter that comes back sings its notes again, each line leans toward
// the section's contour within its range (the chorus lifted as for Shaped), strong notes lean to what real singers
// put on the beat, a line ends on a chord note (closed on the root, or open), several tries scored, the best kept.

import type { Genre } from '../genres';
import { type Rel, endDegrees, posKey, prevKey, relLean, startDegrees, stepOdds, MAX_STEP } from '../realism/learned';
import type { Rng } from '../rng';

/** A song's learned ways: its genre's odds of what lands on strong beats and at phrase ends. */
export interface LearnedStyle {
  genre: Genre;
  strong: Record<Rel, number>;
  end: Record<Rel, number>;
  /** Phrase endings' share on each scale degree (0: the key's root). */
  endDeg: number[];
  /** A line's landing (its first note on a beat): what real singers land on; and real phrase starts' share on each scale degree (null until counted). */
  land: Record<Rel, number>;
  startDeg: number[] | null;
}

export function learnedStyle(genre: Genre): LearnedStyle {
  return { genre, strong: relLean(genre, 'strong'), end: relLean(genre, 'end'), endDeg: endDegrees(genre), land: relLean(genre, 'land'), startDeg: startDegrees(genre) };
}

/** What a line needs from its section (writeTune's helpers). */
export interface LearnedCtx {
  key: number;
  /** The section's 7-note scale (semitones above the key). */
  scale: number[];
  lo: number;
  hi: number;
  /** A note against the chord at a step. */
  relAt: (m: number, g: number) => Rel;
  isTone: (m: number, g: number) => boolean;
  rubs: (m: number, g: number) => boolean;
  tonesAt: (g: number) => number[];
}

export interface LearnedOnset { g: number; stress?: boolean }

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** A note's scale degree (7 a octave, from the key's root an octave below middle C's); off-scale notes count as the scale note under them. */
export const degOf = (c: LearnedCtx, m: number) => { const r = m - c.key, pc = mod(r, 12); let i = c.scale.length - 1; while (c.scale[i] > pc) i--; return c.scale.length * Math.floor(r / 12) + i; };
export const midiOf = (c: LearnedCtx, d: number) => c.key + 12 * Math.floor(d / c.scale.length) + c.scale[mod(d, c.scale.length)];

/**
 * A line's pitches (MIDI), note by note by the learnt odds. `target(oi)`: where the section's contour wants the
 * note (MIDI; a soft pull, so the line doesn't wander off); `copied`: notes a repeated letter keeps (MIDI, or
 * undefined); `before`: the line before's last note, the context across the phrase break
 * (its MIDI note, where it starts, the scale step into it); `closed`: the line ends on the root; `hang`: it may end on a scale note off the chord (Real songs).
 */
export function learnedLine(rng: Rng, c: LearnedCtx, L: LearnedStyle, onsets: LearnedOnset[], lens: number[], target: (oi: number) => number,
  copied: (number | undefined)[], before: { midi: number; g: number; step: number | null } | null, closed: boolean, hang: boolean): number[] {
  const n = onsets.length;
  const out: number[] = [];
  // a line starts from somewhere strong: its first note the chord's root, 3rd or 5th, and its landing (its first
  // note on a beat, else its first stressed note, else its first) a chord note; the notes between them sing free
  let land = onsets.findIndex((o) => o.g % 4 === 0);
  if (land < 0) land = onsets.findIndex((o) => o.stress);
  if (land < 0) land = 0;
  const main = (m: number, g: number) => { const r = c.relAt(m, g); return r === 'R' || r === '3' || r === '5'; };
  const strongAt = (oi: number, m: number, g: number) => (oi === 0 ? main(m, g) : oi === land ? c.isTone(m, g) : true);
  const dLo = degOf(c, c.lo) + (midiOf(c, degOf(c, c.lo)) < c.lo ? 1 : 0), dHi = degOf(c, c.hi);
  const keyPc = mod(c.key, 12);
  let prevM = before?.midi ?? null, prevG = before?.g ?? 0, prevStep: number | null = before?.step ?? null, same = 0;
  for (let oi = 0; oi < n; oi++) {
    const o = onsets[oi], g = o.g, isLast = oi === n - 1;
    const strong = posKey(g) === 'S' || !!o.stress || lens[oi] >= 4;
    if (copied[oi] !== undefined) {
      const m = copied[oi]!;
      prevStep = prevM === null ? null : degOf(c, m) - degOf(c, prevM);
      same = prevM === m ? same + 1 : 0;
      prevM = m; prevG = g; out.push(m);
      continue;
    }
    const ph = oi === 0 ? 's' : isLast ? 'e' : 'm';
    const t = target(oi);
    // the candidates: from the note before by the learnt odds of each step (the line's first note, with nothing
    // before it: any note near the contour)
    const cands: [number, number][] = [];
    if (prevM === null) {
      for (let d = dLo; d <= dHi; d++) cands.push([midiOf(c, d), 1]);
    } else {
      const odds = stepOdds(L.genre, prevKey(prevStep), posKey(g), c.relAt(prevM, prevG), ph);
      const d0 = degOf(c, prevM);
      odds.forEach((w, i) => { const d = d0 + i - MAX_STEP; if (w > 0 && d >= dLo && d <= dHi) cands.push([midiOf(c, d), w]); });
    }
    const weigh = ([m, w]: [number, number]): [number, number] => {
      // (the section's contour: a soft pull back past a 4th from it)
      w *= Math.exp(-Math.max(0, Math.abs(m - t) - 4) / 2.5);
      const r = c.relAt(m, g);
      if (oi === 0 && !main(m, g)) return [m, 0];
      if (oi === land) {
        if (!c.isTone(m, g)) return [m, 0];
        w *= L.land[r];
      } else if (strong) w *= L.strong[r];
      // (the line's first note: the scale degrees real phrases start on, once counted)
      if (oi === 0 && L.startDeg) w *= 0.1 + 7 * L.startDeg[mod(degOf(c, m), c.scale.length)];
      if (lens[oi] >= 4 && c.rubs(m, g)) w *= 0.05;
      // (no long runs on one note: real singers repeat a lot, but not four times running)
      if (prevM === m && same >= 2) w *= 0.25;
      if (isLast) {
        // the ending: on a chord note, closed on the root (the key's, if the chord has it), open elsewhere;
        // weighed by where real phrases end (which kind of note, which scale degree)
        const tones = c.tonesAt(g), home = tones.includes(keyPc) ? keyPc : tones[0];
        const on = c.isTone(m, g);
        if (!on && !(hang && !c.rubs(m, g))) return [m, 0];
        w *= L.end[r] * (0.1 + 7 * L.endDeg[mod(degOf(c, m), c.scale.length)]);
        if (closed) w *= mod(m, 12) === home ? 6 : 0.3;
        else if (mod(m, 12) === keyPc && tones.length >= 3) w *= 0.6;
      }
      return [m, w];
    };
    let ws = cands.map(weigh).filter(([, w]) => w > 0);
    // (nothing the odds allow fits: the nearest chord note to the contour)
    if (!ws.length) ws = cands.length ? cands.map(([m]) => [m, (!strongAt(oi, m, g) ? 0 : c.isTone(m, g) ? 1 : 0.05) / (1 + Math.abs(m - t))] as [number, number]).filter(([, w]) => w > 0) : [];
    // (the first note or the landing with none in reach: the nearest to the contour, anywhere in the range)
    if (!ws.length && (oi === 0 || oi === land)) for (let d = dLo; d <= dHi; d++) { const x = midiOf(c, d); if (strongAt(oi, x, g)) ws.push([x, 1 / (1 + Math.abs(x - t))]); }
    if (!ws.length) ws = [[midiOf(c, degOf(c, t)), 1]];
    const m = rng.weighted(ws);
    prevStep = prevM === null || oi === 0 ? null : degOf(c, m) - degOf(c, prevM);
    same = prevM === m ? same + 1 : 0;
    prevM = m; prevG = g; out.push(m);
  }
  return out;
}

/** For the notes. */
export const learnedDesc = (L: LearnedStyle) => `learned: each next note picked by the odds of real ${L.genre === 'altmetal' ? 'alt metal' : L.genre} vocal lines (the step before, the place in the bar, the note against the chord, the place in the line), with the song's forms on top`;
