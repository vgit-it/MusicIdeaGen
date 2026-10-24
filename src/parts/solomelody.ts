// The melody step of the planned solo writer (docs/SOLO-MELODY.md, "Step 0"): a plain melody, written before anything else.
// - Notes are chord notes only (the chord sounding where each note starts, and over any chord change it is held across).
// - Each note is picked by the vocal's interval theory (src/verse/intervals.ts): the mood's liking of the move from the note before,
//   pulled toward the height the energy and the phrase's contour want; the tension curve moves the profile bar by bar.
// - Short notes: an 8th up to a beat (a quarter of a 4/4 bar; the smallest beat group in other meters). Long notes: longer than a
//   beat, up to a bar. Rests only between phrases, never more than a beat.
// - Phrases of one or two bars, a call that ends off the root and an answer that comes home (the answer often plays the call's rhythm
//   again); a long note ends each phrase; one climax on the energy's crest, the highest note; the last bar is one held note on the
//   home chord (carried into the next section: src/track.ts, carrySolo).
// Played plain (no bends, slides or vibrato), so the tune can be heard alone. Next step: its notes become the planner's landings.

import type { ChordPart, GuitarHit, Song, SoloCurve } from '../idea';
import type { LickKind } from '../players/lead';
import type { Rng } from '../rng';
import { QUALITIES, SCALES, chordPc } from '../theory';
import type { Mood } from '../tension';
import { TUNINGS } from '../theory/fretboard';
import { intervalCost, profileFor } from '../verse/intervals';
import { groupStarts } from '../rhythm';
import type { Guitar2Part } from './guitar2';
import { lickFit, placedHit } from './licks';
import { BREATH_GENRE, BREATH_MOOD, type LandingRole, type PlanOpts } from './soloplan';
import { BUSY, DENSITY, ENERGY_WORDS, energyAt, pickEnergy } from './solo2';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** How sharply a pick follows its costs (as the planner's). */
const PICK_T = 1.5;

/** The chance an answer plays its call's rhythm again. */
const ECHO_RHYTHM = 0.55;
/** How much the mood's liking of an interval counts against the height and the rest (chord notes are few, so the moods need a push to be heard). */
const MOOD_K = 1.6;

type Contour = 'rise' | 'fall' | 'arch' | 'dip' | 'level';
/** A phrase's contour, in sizes of the mood's usual step, from its start (0) to its end (1). */
const CONTOUR: Record<Contour, (f: number) => number> = {
  rise: (f) => -0.7 + 1.4 * f, fall: (f) => 0.7 - 1.4 * f, arch: (f) => -0.6 + 1.6 * Math.sin(Math.PI * f), dip: (f) => 0.6 - 1.6 * Math.sin(Math.PI * f), level: () => 0,
};

interface MNote { step: number; len: number; midi: number; vel: number }
interface Phrase {
  role: LandingRole; S: number; E: number; contour: Contour;
  /** The lengths of its notes in order, and the notes once written. */
  lens: number[]; notes: MNote[]; echoOf?: number; rest: number;
}

function pickCost<T>(rng: Rng, items: { v: T; cost: number }[]): T | null {
  if (!items.length) return null;
  const lo = Math.min(...items.map((x) => x.cost));
  return rng.weighted(items.map((x) => [x.v, Math.exp(-(x.cost - lo) / PICK_T)] as [T, number]));
}

export function generateSoloMelody(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, lick: LickKind, _hook: GuitarHit[] | null, intensity = 0.7, o: PlanOpts = {}): Guitar2Part {
  const { key, bars, total } = song;
  const genre = song.partGenres.strum;
  const t = song.tuning ?? TUNINGS.standard;
  const fit = lickFit(song, chords, riff);
  const mood: Mood = o.mood ?? 'nostalgic';
  const barIx = (g: number) => { for (let i = bars.length - 1; i >= 0; i--) if (g >= bars[i].start) return i; return 0; };
  const tensionAt = (g: number) => (o.tension?.length ? o.tension[Math.min(o.tension.length - 1, barIx(g))] : 0.5);
  const profs = bars.map((_, i) => profileFor(mood, 'solo', o.tension?.length ? o.tension[Math.min(o.tension.length - 1, i)] : undefined));
  const prof = (g: number) => profs[barIx(g)];
  const scale = SCALES[song.mode] as readonly number[];
  /**
   * A core note of the chord at `g`: a chord note; and over a chord of two notes (a power chord) the key's own 3rd as well, or the
   * melody would have two notes to choose from.
   */
  const isCore = (m: number, g: number) => {
    if (fit.isTone(m, g)) return true;
    const c = fit.chordAt(g);
    if (new Set((QUALITIES[c.q] as readonly number[]).map((x) => x % 12)).size > 2) return false;
    const d = mod(m - chordPc(key, c), 12);
    return (d === 3 || d === 4) && scale.includes(mod(m - key, 12));
  };
  const cSteps = chords.timeline.map((e) => e.step).sort((a, b) => a - b);

  // the energy, the height and the pace it asks for (as the planner)
  const en = pickEnergy(rng, genre, bars.length);
  if (en.shape === 'wave' || en.shape === 'saw' || en.shape === 'steps') en.waves = Math.round(2 * en.waves * Math.max(1, bars.length / 8) ** 0.6) / 2;
  const E = (g: number) => energyAt(en, clamp(g / total, 0, 1));
  const R0 = 57 + mod(key - 57, 12);
  const base = R0 + 3 + Math.round(3 * intensity);
  const centerAt = (g: number) => base + Math.round(en.pitchC * en.pitch * E(g));
  const rawWindow = (g: number): [number, number] => [Math.max(50, centerAt(g) - 8), Math.min(84, centerAt(g) + 9)];
  const paceAt = (g: number) => 1 + en.paceC * en.pace * E(g);
  const calmAt = (g: number) => Math.max(0, -en.paceC * E(g));
  const busy = (DENSITY[genre] * BUSY[lick]) / 5.4;
  const vel0 = 0.8 + 0.08 * intensity;

  // ---- the beat: the smallest group of the bar (a quarter of a 4/4 bar)
  const barAt = (g: number) => bars[barIx(g)];
  const beatOf = (g: number) => Math.min(...barAt(g).groups);
  const isBeat = (g: number) => { const b = barAt(g); return groupStarts(b.groups).includes(g - b.start); };

  // ---- a note held across a chord change must be a note of both chords
  const pointsOver = (g: number, l: number) => [g, ...cSteps.filter((c) => c > g && c < g + l)];
  const canHold = (g: number, l: number) => {
    const gs = pointsOver(g, l);
    if (gs.length === 1) return true;
    return sharedPcs(g, l) > 0;
  };
  /** How many notes of the octave are core notes of every chord it is held over. */
  const sharedPcs = (g: number, l: number) => { const gs = pointsOver(g, l); let n = 0; for (let pc = 0; pc < 12; pc++) if (gs.every((x) => isCore(pc, x))) n++; return n; };

  // ---- the rhythm: how long the next note is
  const pickLen = (pos: number, room: number, recent: number[]): number => {
    const bar = barAt(pos), bs = beatOf(pos), barEnd = bar.start + bar.len;
    const pLong = clamp((0.4 + 0.3 * calmAt(pos)) / (paceAt(pos) * busy), 0.12, 0.72);
    const lens: number[] = [];
    for (let l = 2; l <= Math.min(room, bar.len); l += 2) lens.push(l);
    const nShort = lens.filter((l) => l <= bs).length, nLong = lens.length - nShort;
    const items = lens.map((l) => {
      const long = l > bs;
      let w = long ? pLong / Math.max(1, nLong) : (1 - pLong) / Math.max(1, nShort);
      const end = pos + l;
      w *= isBeat(end) || end === barEnd ? 3 : 0.8;
      if (long && !isBeat(pos)) w *= 0.35 * (1 + tensionAt(pos) * 0.8) * (genre === 'funk' ? 1.6 : 1);
      if (end > barEnd && pos !== bar.start) w *= 0.4;
      if (long && l > bs * 3) w *= 0.8;
      const same = recent.length >= 2 && recent[recent.length - 1] === l && recent[recent.length - 2] === l;
      if (same) w *= recent.length >= 3 && recent[recent.length - 3] === l ? 0 : 0.25;
      if (pointsOver(pos, l).length > 1) { const k = sharedPcs(pos, l); w *= k >= 2 ? 0.5 : k === 1 ? 0.15 : 0; }
      return { v: l, cost: -Math.log(Math.max(1e-6, w)) };
    });
    const lo = Math.min(...items.map((x) => x.cost));
    const ok = items.filter((x) => x.cost - lo < 13);
    return rng.weighted(ok.map((x) => [x.v, Math.exp(-(x.cost - lo))] as [number, number]));
  };
  /** A long note to end a phrase: it starts on a beat if it can. */
  const pickEnd = (A: number, span: number): number => {
    const items: [number, number][] = [];
    for (let l = beatOf(A + span - 2) + 2; l <= Math.min(span, barAt(A + span - 2).len); l += 2) {
      const s = A + span - l;
      let w = isBeat(s) ? 3 : 0.5;
      if (pointsOver(s, l).length > 1 && !canHold(s, l)) w = 0;
      if (l >= 8 && l <= 12) w *= 1.6;
      if (w > 0) items.push([l, w]);
    }
    return items.length ? rng.weighted(items) : 0;
  };
  /** The lengths of a phrase's notes from `A` to `A + span`: filled from the start, a long note at the end. */
  const rhythm = (A: number, span: number, wantEnd: boolean): number[] => {
    const endLen = wantEnd && span >= beatOf(A) * 2 ? pickEnd(A, span) : 0;
    const lens: number[] = [];
    let pos = A;
    while (pos < A + span - endLen) {
      const l = pickLen(pos, A + span - endLen - pos, lens);
      lens.push(l);
      pos += l;
    }
    if (endLen) lens.push(endLen);
    return lens;
  };

  // ---- the plan: phrases of one or two bars, call and answer, the last bar a held note
  const phrases: Phrase[] = [];
  const lastBarStart = bars[bars.length - 1].start;
  for (let b = 0; b < bars.length;) {
    const left = bars.length - b;
    const n = left <= 2 ? left : left === 3 ? 1 : rng.chance(0.35 / Math.max(0.6, paceAt(bars[b].start))) ? 1 : 2;
    const S = bars[b].start, E = b + n < bars.length ? bars[b + n].start : total;
    const last = b + n >= bars.length;
    const role: LandingRole = last ? 'end' : phrases.length % 2 ? 'answer' : 'call';
    const contour: Contour = role === 'call' ? rng.weighted<Contour>([['rise', 50], ['arch', 30], ['level', 20]])
      : role === 'answer' ? rng.weighted<Contour>([['fall', 55], ['arch', 25], ['dip', 20]]) : rng.weighted<Contour>([['fall', 60], ['level', 25], ['arch', 15]]);
    phrases.push({ role, S, E, contour, lens: [], notes: [], rest: 0 });
    b += n;
  }
  // the climax: the phrase nearest the energy's highest crest that ends on a long note
  let crest = Math.floor(total * 0.4), best = -Infinity;
  for (let g = Math.floor(total * 0.15); g < total - 12; g += 2) { const e = E(g) + 0.01 * rng.next(); if (e > best) { best = e; crest = g; } }
  const eligible = phrases.map((p, i) => ({ p, i })).filter(({ p, i }) => p.role !== 'end' && i < phrases.length - 1 && p.E - p.S >= barAt(p.S).len);
  const climaxAt = eligible.length ? eligible.reduce((a, b) => (Math.abs((b.p.S + b.p.E) / 2 - crest) < Math.abs((a.p.S + a.p.E) / 2 - crest) ? b : a)).i : -1;
  if (climaxAt >= 0) phrases[climaxAt].role = 'climax';

  // the rhythm of every phrase; the rest after it (a beat at most)
  phrases.forEach((p, i) => {
    const last = i === phrases.length - 1;
    const bs = beatOf(p.E - 1), prev = phrases[i - 1];
    const K = (BREATH_MOOD[mood] * BREATH_GENRE[genre]) / paceAt(p.S);
    // (an answer of the call's length rests as the call did, so it can play the call's rhythm)
    const tryEcho = !!prev && i % 2 === 1 && prev.role !== 'end' && !last && prev.E - prev.S === p.E - p.S && rng.chance(ECHO_RHYTHM);
    const rest = last ? 0 : tryEcho ? Math.min(prev.rest, bs) : rng.weighted<number>([[0, 30], [2, 40 * K], [bs, 30 * K]]);
    p.rest = rest;
    const delay = i === 0 ? rng.weighted<number>([[0, 65], [2, 20], [bs, 15]]) : 0;
    const A = p.S + delay, B = (last ? lastBarStart : p.E - rest);
    const span = B - A;
    // (an answer plays the call's rhythm again, if it is as long and every note can be held over its chords)
    const sameTime = (() => {
      if (!tryEcho || !prev.lens.length || prev.lens.reduce((a, b) => a + b, 0) !== span) return false;
      let q = A;
      for (const l of prev.lens) { if (!canHold(q, l)) return false; q += l; }
      return true;
    })();
    if (sameTime) {
      p.lens = [...prev.lens];
      p.echoOf = i - 1;
    } else p.lens = span > 0 ? rhythm(A, span, !last) : [];
    // (the last bar is one held note)
    if (last) p.lens.push(total - lastBarStart);
    // lay the notes on the time
    let pos = A;
    for (const l of p.lens) { p.notes.push({ step: pos, len: l, midi: 0, vel: 0 }); pos += l; }
  });

  // ---- the pitches: the climax's top note first, then the line in time, each by the mood's liking of the move
  const climax = climaxAt >= 0 ? phrases[climaxAt] : null;
  const tones = (m: number, n: MNote) => pointsOver(n.step, n.len).every((x) => isCore(m, x));
  const heightOf = (ph: Phrase, n: MNote) => (n.step - ph.S) / Math.max(1, ph.E - ph.S);
  let peak: number | null = null;
  if (climax) {
    const n = climax.notes[climax.notes.length - 1], g = n.step, [lo, hi] = rawWindow(g), c = centerAt(g);
    const items: { v: number; cost: number }[] = [];
    for (let m = lo; m <= hi; m++) {
      if (!tones(m, n) || fit.clash(m, g)) continue;
      items.push({ v: m, cost: 0.5 * Math.abs(m - (hi - 1)) + Math.max(0, c + 3 - m) });
    }
    peak = pickCost(rng, items);
    if (peak !== null) n.midi = peak;
  }
  let prev: number | null = null, before: number | null = null, lastMove = 0;
  const flat = phrases.flatMap((ph) => ph.notes.map((n, j) => ({ ph, n, j })));
  for (const { ph, n, j } of flat) {
    const g = n.step, P = prof(g), c = centerAt(g);
    const finalOfPhrase = j === ph.notes.length - 1;
    if (n.midi) { before = prev; lastMove = prev === null ? 0 : n.midi - prev; prev = n.midi; continue; }
    let [lo, hi] = rawWindow(g);
    if (peak !== null) hi = Math.min(hi, ph === climax ? peak - 1 : peak - 3);
    lo = Math.min(lo, hi - 12);
    const f = heightOf(ph, n);
    const target = ph === climax && peak !== null ? c + (peak - c) * f ** 0.8 : c + P.size * CONTOUR[ph.contour](f);
    const src = ph.echoOf !== undefined && !finalOfPhrase ? phrases[ph.echoOf].notes[j]?.midi : undefined;
    const root = chordPc(key, fit.chordAt(g));
    const build = (strict: boolean, again: boolean) => {
      const items: { v: number; cost: number }[] = [];
      for (let m = lo; m <= hi; m++) {
        if (!tones(m, n) || (strict && fit.clash(m, g))) continue;
        // (the same note again only in a mood that likes it, or when nothing else fits)
        if (prev !== null && m === prev && (before === prev || !(again || P.w[0] >= 1.4))) continue;
        let cost = 0.22 * Math.abs(m - target) + (prev !== null ? MOOD_K * intervalCost(P, prev, m, lastMove, finalOfPhrase) : 0);
        // (the same note again is dull, unless the mood likes repeats: angry, tense)
        if (m === prev) cost += 5 / Math.max(0.6, P.w[0]);
        cost += Math.max(0, m - (c + P.size + 2));
        if (peak !== null && ph !== climax) cost += Math.max(0, m - (peak - 3));
        if (src !== undefined) cost += 0.45 * Math.abs(m - src);
        const isRoot = mod(m, 12) === root;
        if (ph.role === 'end' && finalOfPhrase) cost += isRoot ? -4 : 2;
        else if (finalOfPhrase) {
          if (ph.role === 'call') cost += isRoot ? 4 : 0;
          else if (ph.role === 'answer') cost += isRoot ? -3 : 1.5;
        }
        items.push({ v: m, cost });
      }
      return items;
    };
    let m = pickCost(rng, build(true, false)) ?? pickCost(rng, build(false, false)) ?? pickCost(rng, build(true, true)) ?? pickCost(rng, build(false, true));
    if (m === null) {
      // (nothing fits: the nearest note of the chord)
      m = c;
      for (let d = 0; d < 12; d++) { const x = [c + d, c - d].find((y) => isCore(y, g)); if (x !== undefined) { m = x; break; } }
    }
    n.midi = m;
    n.vel = Math.min(1, vel0 + 0.05 * E(g) + (n.len > beatOf(g) ? 0.03 : 0) + (rng.next() - 0.5) * 0.04 + (ph === climax && finalOfPhrase ? 0.12 : 0));
    before = prev; lastMove = prev === null ? 0 : m - prev; prev = m;
  }
  for (const { ph, n } of flat) if (!n.vel) n.vel = Math.min(1, vel0 + 0.05 * E(n.step) + (ph === climax ? 0.12 : 0));

  // ---- played plain: a pick on every note
  const pos = rng.int(5, 12);
  const all = flat.map((x) => x.n).sort((a, b) => a.step - b.step);
  const hits = all.map((n) => placedHit({ step: n.step, midi: n.midi, len: n.len, vel: n.vel, bend: 0, art: 'pick' }, t, pos));

  const r2 = (v: number) => Math.round(v * 100) / 100;
  const landings = phrases.map((ph) => {
    const n = ph.notes[ph.notes.length - 1];
    return { step: n.step, midi: n.midi, len: n.len, role: ph.role as string };
  });
  const curve: SoloCurve = {
    shape: ENERGY_WORDS[en.shape](en), pitchC: en.pitchC, paceC: en.paceC,
    energy: Array.from({ length: total }, (_, g) => r2(E(g))),
    centre: Array.from({ length: total }, (_, g) => centerAt(g)),
    pace: Array.from({ length: total }, (_, g) => r2(paceAt(g))),
    landings,
  };
  const nLong = all.filter((n) => n.len > beatOf(n.step)).length;
  const peakAt = climax ? Math.floor(climax.notes[climax.notes.length - 1].step / 16) + 1 : 0;
  return {
    hits, curve,
    notes: [`Guitar 2: a solo (melody only): ${ENERGY_WORDS[en.shape](en)}, ${phrases.length} phrases, ${all.length} notes (${nLong} long), chord notes in ${mood} intervals${peakAt ? `, the peak in bar ${peakAt}` : ''}${phrases.some((p) => p.echoOf !== undefined) ? `, ${phrases.filter((p) => p.echoOf !== undefined).length} answers on the call's rhythm` : ''}`],
  };
}
