// The planned solo writer (docs/SOLO-PLAN.md, step 2): the solo written landings first, then the paths between them.
// 1. Plan: the solo is units of two bars (a call that ends up and open, an answer that comes home; the last unit ends the
//    solo), each cut into phrases of real lengths. Every phrase has a landing: a chord note, at a time, held for a time, with a
//    breath after it (rests and holds come from the mood, the energy and the genre, not from a clean-up). The climax phrase,
//    on the energy's highest crest, lands highest and longest. A landing's pitch is picked by the vocal's interval theory
//    (src/verse/intervals.ts): the mood's liking of the move from the landing before, pulled to the height the energy wants.
// 2. Connect: the path from one landing to the next, in the time there is. A library lick that ends on the landing (src/realism/
//    solo-licks.json, a shape ending on that note, in a real rhythm that fits the time and the pace, scored by the mood's liking of
//    its intervals), or a stepwise walk through the scale; a long path is cut at a waypoint on a beat, a weaker landing.
// 3. Moves (step 4): the other writer's moves as connectors: a quick turning run, 8th triplets, a bend move (bent and let down,
//    the same bend picked again, two-string bends climbing) that ends on the landing, a build-up at the climax, an enclosure.
// 4. Full scoring (step 3): a lick scored on its fit, the time and pace, the mood's intervals, chord notes on the beats; the solo's
//    motif (its first lick) comes back in rhythm or shape on other pitches; never a copy, never the lick just played.
// Not yet (step 5): the hook quoted, the polish rules.
// Played by the same hands as the other writers (playSolo).

import type { Genre } from '../genres';
import type { ChordPart, GuitarHit, Song, SoloCurve } from '../idea';
import type { LickKind } from '../players/lead';
import type { Rng } from '../rng';
import { SCALES, chordPc } from '../theory';
import type { Mood } from '../tension';
import { TUNINGS } from '../theory/fretboard';
import { intervalCost, profileFor } from '../verse/intervals';
import { type Guitar2Part, MINORISH } from './guitar2';
import { lickFit } from './licks';
import { RHYTHMS, type Rhythm } from './reallicks';
import { type Ev, playSolo } from './solo';
import { BEND_MOVES, BEND_RATE, BUSY, type BuildCell, CELLS, DENSITY, ENERGY_WORDS, HELD, type Held, RUNS, RUN_LEAN, TRIP_CELLS, TRIP_LEAN, energyAt, pickEnergy } from './solo2';
import { LIB_GENRES, LIB_SHAPES, type LibShape, type RhythmTags, moodFit, rhythmTags, shapeRel } from './solotags';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export type LandingRole = 'mid' | 'call' | 'answer' | 'climax' | 'end' | 'waypoint';
export interface Landing { step: number; midi: number; len: number; role: LandingRole }

/** How much a mood breathes (rests and long holds), and a genre. */
const BREATH_MOOD: Record<Mood, number> = { melancholic: 1.4, nostalgic: 1.2, dreamy: 1.3, dark: 1.1, tense: 0.8, angry: 0.6, happy: 0.8, triumphant: 0.7 };
const BREATH_GENRE: Record<Genre, number> = { funk: 1.3, pop: 1.1, rock: 1, grunge: 1.1, altmetal: 0.9, hardrock: 0.8, metal: 0.7 };
/** The path's notes a beat against the real notes a bar: the rests and holds are planned apart, so the paths are busier than the average. */
const PATH_BOOST = 2.1;
/** How sharply a pick follows its costs (the vocal's interval picks use TEMP = 2). */
const PICK_T = 1.5;
/** Each round-2 change can be switched off, to hear and measure it against the one before (docs/SOLO-PLAN.md, "Round 2"). */
export const FEATURES = { intoKey: true, peak: true, holds: true, echo: true, carry: true, moves: true, score: true };
/** How much a genre and a player play a lick again (an echo). */
const ECHO_GENRE: Record<Genre, number> = { rock: 1.1, hardrock: 1.2, metal: 1.2, grunge: 1.1, altmetal: 1.1, pop: 0.8, funk: 1 };
const ECHO_LICK: Record<LickKind, number> = { blues: 1.3, simple: 1.2, sung: 1, muted: 1, run: 0.8 };
/** The share of chances that become an echo, before the genre, the player, the calm and the solo's own lean. */
const ECHO_P = 1.2;
/** How much a player sings one long note (a held phrase). */
const HOLD_LEAN: Record<LickKind, number> = { sung: 1.4, blues: 1.2, simple: 1, muted: 0.8, run: 0.6 };

// the library by the degree its shape ends on, and the rhythms by note count
const ENDS: Record<'m' | 'M', LibShape[][]> = { m: Array.from({ length: 12 }, () => []), M: Array.from({ length: 12 }, () => []) };
for (const s of LIB_SHAPES) if (s.n >= 3) { const rel = shapeRel(s); ENDS[s.minor ? 'm' : 'M'][mod(rel[rel.length - 1], 12)].push(s); }
const RH_BY_N = new Map<number, { r: Rhythm; t: RhythmTags }[]>();
for (const r of RHYTHMS) { const a = RH_BY_N.get(r.ons.length) ?? []; a.push({ r, t: rhythmTags(r) }); RH_BY_N.set(r.ons.length, a); }

function pickCost<T>(rng: Rng, items: { v: T; cost: number }[]): T | null {
  if (!items.length) return null;
  const lo = Math.min(...items.map((x) => x.cost));
  return rng.weighted(items.map((x) => [x.v, Math.exp(-(x.cost - lo) / PICK_T)] as [T, number]));
}

export interface PlanOpts {
  /** The song's mood (the track's): the intervals, the height of the call and the answer, and how much it breathes. */
  mood?: Mood;
  /** The section's tension, a level (0-1) for each bar. */
  tension?: number[];
}

export function generateSoloPlan(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, lick: LickKind, _hook: GuitarHit[] | null, intensity = 0.7, o: PlanOpts = {}): Guitar2Part {
  const { key, mode, bars, total } = song;
  const genre = song.partGenres.strum;
  const gi = LIB_GENRES.indexOf(genre);
  const t = song.tuning ?? TUNINGS.standard;
  const minor = MINORISH.includes(mode);
  const fit = lickFit(song, chords, riff);
  const scale = [...(SCALES[mode] as readonly number[])].sort((a, b) => a - b);
  const inScale = (m: number) => scale.includes(mod(m - key, 12));
  const changes = new Set(chords.timeline.map((e) => e.step));
  const barStarts = new Set(bars.map((b) => b.start));
  const boxMinor = minor || (lick === 'blues' && rng.chance(0.5));
  const mood: Mood = o.mood ?? 'nostalgic';
  const barOf = (g: number) => { for (let i = bars.length - 1; i >= 0; i--) if (g >= bars[i].start) return i; return 0; };
  const tensionAt = (g: number) => (o.tension?.length ? o.tension[Math.min(o.tension.length - 1, barOf(g))] : 0.5);
  const profs = bars.map((_, i) => profileFor(mood, 'solo', o.tension?.length ? o.tension[Math.min(o.tension.length - 1, i)] : undefined));
  const prof = (g: number) => profs[barOf(g)];

  // the energy, the height and the pace it asks for (as the other writer: docs/SOLO-NEW.md)
  const en = pickEnergy(rng, genre, bars.length);
  if (en.shape === 'wave' || en.shape === 'saw' || en.shape === 'steps') en.waves = Math.round(2 * en.waves * Math.max(1, bars.length / 8) ** 0.6) / 2;
  const E = (g: number) => energyAt(en, clamp(g / total, 0, 1));
  const R = 57 + mod(key - 57, 12);
  const base = R + 3 + Math.round(3 * intensity);
  const centerAt = (g: number) => base + Math.round(en.pitchC * en.pitch * E(g));
  const rawWindow = (g: number): [number, number] => [Math.max(50, centerAt(g) - 8), Math.min(84, centerAt(g) + 9)];
  // the solo's ceiling (docs/SOLO-PLAN.md, round 2): once the climax is chosen, it is the top: its phrase may reach `peakTop`, every
  // other phrase stays 3 semitones under it
  let peakTop = Infinity, inClimax = false;
  const windowAt = (g: number): [number, number] => {
    const [lo, hi] = rawWindow(g);
    if (peakTop === Infinity) return [lo, hi];
    return inClimax ? [Math.max(lo, peakTop - 14), peakTop] : [lo, Math.min(hi, peakTop - 3)];
  };
  const D = DENSITY[genre] * BUSY[lick] * (0.85 + 0.3 * intensity);
  /** Wanted: the path's notes a beat at `g`. */
  const pbAt = (g: number) => (PATH_BOOST * D / 4) * (1 + en.paceC * en.pace * E(g));
  /** How much slower than usual the pace is at `g` (0 = usual or faster, up to 1). */
  const calmAt = (g: number) => Math.max(0, -en.paceC * E(g));
  const vel0 = 0.8 + 0.08 * intensity;

  const evs: Ev[] = [];
  const landings: Landing[] = [];
  const fits = (ms: number[], steps: number[], lens: number[]) => ms.every((m, i) => {
    const g = steps[i];
    if (g >= total || fit.clash(m, g)) return false;
    if (lens[i] >= 4 && fit.rubs(m, g)) return false;
    if (!inScale(m) && !fit.isTone(m, g) && lens[i] > 2) return false;
    return true;
  });

  /**
   * Off-key notes moved into the key (Paul: lick notes outside the scale move a step up or down): a note that is neither in the
   * key's scale nor a chord note goes to the scale note next to it that sits nearest its neighbours, never onto either neighbour.
   * A quick passing note off the beat stays now and then for the blues and shredder players (1 in 3).
   */
  const intoKey = (ms: number[], steps: number[], lens: number[], before: number, after: number) => {
    if (!FEATURES.intoKey) return ms;
    const out = [...ms];
    for (let i = 0; i < out.length; i++) {
      const m = out[i];
      if (inScale(m) || fit.isTone(m, steps[i])) continue;
      if (lens[i] <= 1 && steps[i] % 4 !== 0 && (lick === 'blues' || lick === 'run') && rng.chance(1 / 3)) continue;
      const a = i ? out[i - 1] : before, b = i + 1 < out.length ? out[i + 1] : after;
      const opts: { v: number; cost: number }[] = [];
      for (const d of [1, -1, 2, -2]) {
        const c = m + d;
        if (!inScale(c) || c === a || c === b || fit.clash(c, steps[i])) continue;
        opts.push({ v: c, cost: Math.abs(d) * 2 + Math.abs(c - a) + Math.abs(c - b) + rng.next() * 0.5 });
      }
      if (opts.length) out[i] = opts.reduce((x, y) => (y.cost < x.cost ? y : x)).v;
    }
    return out;
  };

  // ---- the landings' notes: held, bent, or the trademark on the climax
  const peakEv = (m: number, g: number, len: number): Ev => {
    const e: Ev = { step: g, midi: m, len, vel: 0.96, peak: true, bend: 0 };
    const way = rng.next();
    if (lick === 'sung' && way < 0.5) Object.assign(e, { bend: 2, dyad: 0 });
    else if ((lick === 'blues' || lick === 'muted') && way < 0.5 && (inScale(m - 3) || inScale(m - 4))) Object.assign(e, { bend: inScale(m - 3) ? 3 : 4, rake: 3 });
    else if (lick === 'run' && way < 0.5) Object.assign(e, { bend: 0, trill: inScale(m + 2) ? 2 : 1 });
    else if (lick === 'simple' && way < 0.5) Object.assign(e, { bend: 0, dyad: 12, slide: -2 });
    else Object.assign(e, { bend: inScale(m - 2) ? 2 : inScale(m - 1) ? 1 : 0 });
    return e;
  };
  const landingEv = (m: number, g: number, len: number, role: LandingRole): Ev => {
    const v = vel0 + 0.05 * E(g) + (role === 'waypoint' ? -0.02 : 0.04);
    if (role === 'climax') return peakEv(m, g, len);
    if (role === 'waypoint' || len < 6 || !rng.chance(0.6)) return { step: g, midi: m, len, vel: v };
    // a long landing sung the player's way: bent and held, held then bent, bent and let down, a unison bend, or plain
    const b = inScale(m - 2) ? 2 : inScale(m - 1) ? 1 : 0;
    const way: Held = b ? rng.weighted(HELD[lick]) : 'plain';
    const lets = !fit.rubs(m - b, g + len - 1) && !fit.clash(m - b, g + len - 1);
    if (way === 'bendHold') return { step: g, midi: m, len, vel: v, bend: b };
    if (way === 'holdBend' && len >= 8) return { step: g, midi: m, len, vel: v, bend: 0, lateBend: b };
    if (way === 'bendRelease' && lets) return { step: g, midi: m, len, vel: v, bend: b, unbend: b };
    if (way === 'preRelease' && lets) return { step: g, midi: m, len, vel: v, bend: 0, unbend: b };
    if (way === 'unison' && b === 2) return { step: g, midi: m, len, vel: v, bend: 2, dyad: 0 };
    return { step: g, midi: m, len, vel: v };
  };
  const land = (m: number, g: number, len: number, role: LandingRole) => {
    evs.push(landingEv(m, g, len, role));
    landings.push({ step: g, midi: m, len, role });
  };

  // ---- breath and hold: from the mood, the genre, the pace there and the tension
  const breathK = (g: number) => (BREATH_MOOD[mood] * BREATH_GENRE[genre] / (1 + en.paceC * en.pace * E(g))) * (1.2 - 0.4 * tensionAt(g));
  /** The rest after a phrase (steps, even): real solos rest none after 41%, under a beat 41%, 1-2 beats 12%, more 6%. */
  const breathFor = (g: number, role: LandingRole) => Math.round((rng.weighted<number>([[0, 41], [2, 41], [6, 12], [10, 6]]) * breathK(g) * (role === 'mid' ? 1 : 1.3)) / 2) * 2;
  /** How long a landing is held (steps): a call or answer mostly long, a middle one less, the climax longest; longer in the calm. */
  const holdFor = (g: number, role: LandingRole, phraseLen: number) => {
    const calm = calmAt(g);
    if (role === 'climax') return 2 * Math.round((FEATURES.holds ? 12 + rng.next() * 4 : 8 + rng.next() * 4) / 2);
    const longP = clamp((role === 'mid' ? 0.45 : 0.75) + 0.3 * calm, 0.2, 0.95);
    let h = rng.chance(longP) ? 6 + rng.next() * (4 + 2 * calm) : 2 + rng.next() * 2;
    // (a call or answer now and then held a good while: 3 to 4 beats)
    if (FEATURES.holds && role !== 'mid' && h >= 6 && rng.chance(0.2 + 0.3 * calm)) h = 12 + rng.next() * 4;
    // (a short phrase keeps room for a path: the hold is at most 0.6 of it)
    return Math.max(2, Math.min(2 * Math.round(h / 2), 2 * Math.round(((FEATURES.holds ? 0.7 : 0.6) * phraseLen) / 2)));
  };
  /** A phrase's length in steps with its hold, not its breath: real phrases, longer where the pace is up. */
  const phraseSteps = (at: number) => {
    const [lo, hi] = rng.weighted<[number, number]>([[[1, 1.5], 19], [[1.5, 2], 17], [[2, 4], 33], [[4, 8], 20], [[8, 12], 10]]);
    const lvl = en.paceC * E(at);
    const beats = 1.25 * (lo + rng.next() * (hi - lo)) * (lvl > 0 ? 1 + 1.2 * lvl : 1 + 0.5 * Math.max(-0.6, lvl));
    return Math.max(6, 2 * Math.round(beats * 2));
  };

  // ---- the plan: units, phrases, the climax
  const end = total - 2;
  /** `w0`: where the phrase's window starts (its first note may come later, at `S`). `echoOf`: the phrase it plays again, `echoN` the time (1 = the first echo). */
  interface Phrase { S: number; w0: number; end: number; role: LandingRole; len: number; held?: boolean; echoOf?: number; echoN?: number }
  const units: { s: number; e: number; role: LandingRole }[] = [];
  for (let b = 0; b < bars.length;) {
    const take = bars.length - b === 3 || bars.length < 2 ? bars.length - b : 2;
    units.push({ s: bars[b].start, e: b + take < bars.length ? bars[b + take].start : end, role: units.length % 2 ? 'answer' : 'call' });
    b += take;
  }
  units[units.length - 1].role = 'end';
  // the last bar is the last note's: the playing stops at its start, the final note rings through it (and on into the next section: src/track.ts, carrySolo)
  const lastBarStart = bars[bars.length - 1].start;
  if (FEATURES.carry && bars.length >= 4 && lastBarStart - units[units.length - 1].s >= 12) units[units.length - 1].e = lastBarStart;
  // a held phrase: one long note over the band (Paul: more long holds); more in the calm, for the melodic and bluesy players, and each solo leans its own way
  const heldLean = 0.5 + rng.next();
  const heldP = (at: number, role: LandingRole) => (FEATURES.holds ? clamp((0.05 + 0.4 * calmAt(at) + (role === 'mid' ? 0 : 0.03)) * HOLD_LEAN[lick] * heldLean, 0, 0.5) : 0);
  const phrases: Phrase[] = [];
  const sameChord = (a: { root: number; q: string }, b: { root: number; q: string }) => a.root === b.root && a.q === b.q;
  const echoLean = 0.6 + 0.8 * rng.next();
  const echoP = (at: number) => clamp(ECHO_P * ECHO_GENRE[genre] * ECHO_LICK[lick] * echoLean * (1 - 0.5 * calmAt(at)), 0, 0.8);
  for (const u of units) {
    let pos = u.s;
    while (pos < u.e - 5) {
      let len = phraseSteps(pos);
      if (u.e - pos - len < 8) len = u.e - pos;
      let held = false;
      if (u.e - pos >= 10 && !(u.role === 'end' && pos + 14 >= u.e) && rng.chance(heldP(pos, pos + len >= u.e ? u.role : 'mid'))) {
        held = true;
        len = Math.min(u.e - pos, 2 * Math.round(rng.pick([10, 12, 14, 16, 18]) / 2));
        if (u.e - pos - len < 8) len = u.e - pos;
      }
      const lastOne = pos + len >= u.e;
      // (starts: the first lick on the beat about two times in three, later ones a little late now and then)
      const delay = !phrases.length ? (rng.chance(0.64) ? 0 : 2) : rng.weighted<number>([[0, 40], [2, 40], [4, 20]]);
      phrases.push({ S: pos + (len - delay >= 8 ? delay : 0), w0: pos, end: pos + len, role: lastOne ? u.role : 'mid', len, ...(held ? { held } : {}) });
      pos += len;
      // Echoes (docs/SOLO-PLAN.md, round 2): a middle phrase may be played again, once or twice, at the same place in the next half bar
      // or bar(s), on the same chord. Its window is stretched to that (a longer rest or hold), and so is each echo's.
      const ph = phrases[phrases.length - 1], rootIx = phrases.length - 1;
      if (FEATURES.echo && ph.role === 'mid' && !ph.held && ph.len >= 6 && !lastOne && rng.chance(echoP(ph.w0))) {
        const bar = bars[barOf(ph.w0)].len, D = ph.len <= bar / 2 ? bar / 2 : ph.len <= bar ? bar : 0;
        const times = rng.weighted<number>([[1, 70], [2, 30]]);
        if (D) {
          let at = ph.w0 + D;
          for (let k = 1; k <= times; k++) {
            if (at + D > u.e + 2) break;
            // (over another chord it is less likely, and moved or given a new ending to suit it)
            const sameHarmony = sameChord(fit.chordAt(at), fit.chordAt(ph.w0)) && sameChord(fit.chordAt(at + D - 2), fit.chordAt(ph.w0 + D - 2));
            if (!sameHarmony && !rng.chance(0.5)) break;
            const last = phrases[phrases.length - 1];
            last.end = at; last.len = at - last.w0;
            const elen = u.e - at - D < 8 ? u.e - at : D;
            phrases.push({ S: at + (ph.S - ph.w0), w0: at, end: at + elen, role: at + elen >= u.e ? u.role : 'mid', len: elen, echoOf: rootIx, echoN: k });
            pos = at + elen;
            at += D;
            if (pos >= u.e - 5) break;
          }
        }
      }
    }
  }
  // the climax: the phrase in the middle of the energy's highest crest, if it is long enough to build to
  let crest = Math.floor(total * 0.4), best = -Infinity;
  for (let g = Math.floor(total * 0.15); g < total - 12; g += 2) { const e = E(g) + 0.01 * rng.next(); if (e > best) { best = e; crest = g; } }
  const eligible = phrases.map((p, i) => ({ p, i })).filter(({ p }) => p.role !== 'end' && p.echoOf === undefined && p.len >= (FEATURES.peak ? 16 : 12));
  let climaxAt = eligible.length ? eligible.reduce((a, b) => (Math.abs((b.p.S + b.p.end) / 2 - crest) < Math.abs((a.p.S + a.p.end) / 2 - crest) ? b : a)).i : -1;
  // a build-up into the climax (step 4) needs room: a climax phrase too short for it takes the phrase before it (a plain middle one)
  let wantBuild = false;
  if (FEATURES.moves && climaxAt > 0 && rng.chance(0.85)) {
    wantBuild = true;
    for (let k = 0; k < 2 && climaxAt > 0; k++) {
      const c = phrases[climaxAt], qi = climaxAt - 1, q = phrases[qi];
      if (c.len >= 28 || q.role !== 'mid' || q.held || q.echoOf !== undefined || q.end !== c.w0 || phrases.some((x) => x.echoOf === qi)) break;
      c.w0 = q.w0; c.S = q.S; c.len = c.end - c.w0;
      phrases.splice(qi, 1);
      for (const x of phrases) if (x.echoOf !== undefined && x.echoOf > qi) x.echoOf--;
      climaxAt--;
    }
    if (phrases[climaxAt].len < 28) wantBuild = false;
  }
  if (climaxAt >= 0) {
    phrases[climaxAt].role = 'climax';
    // (the peak is said once)
    delete phrases[climaxAt].echoOf;
    for (const x of phrases) if (x.echoOf === climaxAt) delete x.echoOf;
  }

  // ---- where a landing sits: a chord note near the height the role wants, by the mood's liking of the move from the one before
  const chooseLanding = (L: number, role: LandingRole, hold: number, prev: number | null, lastMove: number, before: number | null, buildUp = false) => {
    const win = windowAt(L), P = prof(L), c = centerAt(L);
    const target = role === 'climax' ? (FEATURES.peak ? win[1] - 1 : Math.min(win[1], c + 5)) : role === 'call' ? c + 0.8 * P.size : role === 'answer' || role === 'end' ? c - 0.8 * P.size : c + (rng.next() - 0.5) * 1.5 * P.size;
    const root = chordPc(key, fit.chordAt(L));
    const items: { v: number; cost: number }[] = [];
    for (let m = win[0]; m <= win[1]; m++) {
      if (!fit.isTone(m, L) || fit.clash(m, L) || (hold >= 4 && fit.rubs(m, L))) continue;
      let cost = (role === 'climax' ? 0.5 : 0.22) * Math.abs(m - target) + (prev !== null ? intervalCost(P, prev, m, lastMove, true) : 0);
      // (the climax sits above the rest; the rest keep under what the height and the mood allow, and under the climax once it is sung)
      if (role === 'climax') cost += Math.max(0, c + 3 - m);
      else cost += Math.max(0, m - (c + P.size + 2)) + (climaxMidi !== null ? Math.max(0, m - (climaxMidi - 1)) : 0) + (buildUp && m > c ? 0.6 * (m - c) : 0);
      // (a landing on the same note as the one before, or the one before that, is a dull line)
      if (m === prev) cost += 2.5; else if (m === before) cost += 1;
      const isRoot = mod(m, 12) === root;
      // (the last note rings through the last bar: a note of its chord too)
      if (role === 'end' && FEATURES.carry && !fit.isTone(m, lastBarStart)) cost += 2;
      if (role === 'call') cost += isRoot ? 4 : 0;
      else if (role === 'answer' || role === 'end') cost += isRoot ? -1.5 : 1;
      items.push({ v: m, cost });
    }
    const m = pickCost(rng, items);
    if (m !== null) return m;
    // (nothing fits under the riff: the nearest chord note, clashing or not)
    for (let d = 0; d < 12; d++) for (const x of [c + d, c - d]) if (fit.isTone(x, L)) return x;
    return c;
  };


  // ---- moves as connectors (docs/SOLO-PLAN.md, step 4): the other writer's moves, each ending on the landing
  const box = boxMinor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const runPcs: readonly number[] = lick === 'run' ? scale : box;
  const runny = FEATURES.moves && rng.chance(Math.min(0.9, RUNS[genre] * RUN_LEAN[lick] * (0.7 + 0.6 * intensity)));
  const triplets = FEATURES.moves && rng.chance(0.1 * TRIP_LEAN[lick]);
  const maxBuilds = bars.length >= 16 ? 2 : 1;
  const used = { run: 0, trip: 0, bend: 0, build: 0, enclose: 0, motif: 0 };
  const bendInto = (m: number) => (inScale(m - 2) ? 2 : inScale(m - 1) ? 1 : 0);
  /** A note `k` notes along the key's scale. */
  const stepScale = (m: number, k: number) => {
    const rel = mod(m - key, 12), oct = m - rel;
    let i = scale.indexOf(rel);
    if (i < 0) i = scale.reduce((bi, x, j) => (Math.abs(x - rel) < Math.abs(scale[bi] - rel) ? j : bi), 0);
    const j = i + k;
    return oct + 12 * Math.floor(j / scale.length) + scale[mod(j, scale.length)];
  };
  const beatOf4 = (g: number) => {
    const b = bars.find((x) => g >= x.start && g < x.start + x.len);
    if (!b) return false;
    let p = b.start;
    for (const n of b.groups) { if (p === g) return n === 4; p += n; }
    return false;
  };
  const vAt = (g: number, extra = 0) => vel0 + 0.05 * E(g) + extra + (rng.next() - 0.5) * 0.04;
  /** The highest note a move may use at `g`: the window's, and under the landing when it is the climax. */
  const capAt = (g: number, tp: number) => (inClimax ? tp - 1 : windowAt(g)[1]);
  /** The notes of the set `pcs` in the window at `g`, under the cap. */
  const poolOf = (pcs: readonly number[], g: number, cap: number) => {
    const out: number[] = [];
    for (let m = windowAt(g)[0] - 2; m <= cap; m++) if (pcs.includes(mod(m - key, 12))) out.push(m);
    return out;
  };
  const nearestIx = (pool: number[], m: number) => pool.reduce((bi, x, i) => (Math.abs(x - m) < Math.abs(pool[bi] - m) ? i : bi), 0);
  /** The run-up to a move that starts at `to`: walked if there is room to say something, else a rest. */
  const leadIn = (f: number, S: number, to: number, first: number, lastMove: number): Ev[] => (to - S >= 3 ? walkPath(f, S, first, to, lastMove) : []);
  const noAdjacentRepeats = (ms: number[]) => ms.every((m, i) => !i || m !== ms[i - 1]);

  /** A quick run that turns: a cell moved down (or up) the box a note at a time, ending a step from the landing. */
  const runMove = (f: number, S: number, tp: number, L: number, lastMove: number): Ev[] | null => {
    const P = L - S;
    if (P < 6) return null;
    for (let tries = 0; tries < 6; tries++) {
      const pool = poolOf(runPcs, L, capAt(L, tp));
      if (pool.length < 6) return null;
      const cell = rng.pick(CELLS), down = rng.chance(0.6), move = rng.chance(0.75) ? 1 : 2;
      const n = rng.pick([6, 8, 12, 16].filter((x) => x <= P));
      const slow = rng.chance(0.25) && n + cell.length <= P ? cell.length : 0;
      const raw = Array.from({ length: n }, (_, k) => cell[k % cell.length] + (down ? -1 : 1) * Math.floor(k / cell.length) * move);
      const iT = nearestIx(pool, tp), shift = iT + (down ? 1 : -1) - raw[n - 1];
      const idx = raw.map((x) => x + shift);
      if (idx.some((x) => x < 0 || x >= pool.length)) continue;
      const ms = idx.map((x) => pool[x]);
      if (!noAdjacentRepeats(ms) || ms[n - 1] === tp) continue;
      const start = L - n - slow, steps: number[] = [], lens: number[] = [];
      for (let k = 0, g = start; k < n; k++) { steps.push(g); lens.push(k < slow ? 2 : 1); g += lens[k]; }
      if (!fits(ms, steps, lens)) continue;
      return [...leadIn(f, S, start, ms[0], lastMove), ...ms.map((m, k) => ({ step: steps[k], midi: m, len: lens[k], vel: vAt(steps[k], k ? 0 : 0.03) }))];
    }
    return null;
  };

  /** 8th triplets (one beat or two, or three quarter triplets) turning or falling onto the landing, which sits on a beat. */
  const tripletMove = (f: number, S: number, tp: number, L: number, lastMove: number): Ev[] | null => {
    if (L % 4 !== 0 || L - S < 4) return null;
    const quarter = rng.chance(0.2), beats = quarter ? 2 : rng.chance(0.4) ? 1 : 2;
    const from = L - 4 * beats;
    if (from < S || !beatOf4(from) || (beats === 2 && !beatOf4(from + 4))) return null;
    const n = quarter ? 3 : 3 * beats;
    const pos = Array.from({ length: n }, (_, i) => from + (quarter ? (8 * i) / 3 : (4 * i) / 3));
    const steps = [...pos.map((x) => Math.floor(x + 1e-9)), L];
    const shifts = pos.map((x) => Math.round(1e6 * (x - Math.floor(x + 1e-9))) / 1e6);
    const lens = steps.slice(0, -1).map((g, i) => Math.max(1, steps[i + 1] - g));
    for (let tries = 0; tries < 8; tries++) {
      const pool = poolOf(box, L, capAt(L, tp));
      if (pool.length < 5) return null;
      const cell = rng.weighted(TRIP_CELLS), down = cell[1] > 0 && cell[2] > 0 ? false : rng.chance(0.7);
      const raw = Array.from({ length: n }, (_, i) => cell[i % 3] + (down ? -1 : 1) * Math.floor(i / 3));
      const iT = nearestIx(pool, tp), shift = iT + (down ? 1 : -1) - raw[n - 1];
      const idx = raw.map((x) => x + shift);
      if (idx.some((x) => x < 0 || x >= pool.length)) continue;
      const ms = idx.map((x) => pool[x]);
      if (!noAdjacentRepeats(ms) || ms[n - 1] === tp || !fits(ms, steps.slice(0, -1), lens)) continue;
      return [...leadIn(f, S, from, ms[0], lastMove), ...ms.map((m, k) => ({ step: steps[k], midi: m, len: lens[k], vel: vAt(steps[k], k ? 0 : 0.03), ...(shifts[k] ? { shift: shifts[k] } : {}) }))];
    }
    return null;
  };

  /** An enclosure: the scale notes above and below the landing, then the landing. */
  const encloseMove = (f: number, S: number, tp: number, L: number, lastMove: number): Ev[] | null => {
    if (L - S < 4) return null;
    const hi = stepScale(tp, 1), lo = stepScale(tp, -1), cap = capAt(L, tp), win = windowAt(L);
    const ms = rng.chance(0.5) ? [hi, lo] : [lo, hi];
    const steps = [L - 4, L - 2], lens = [2, 2];
    if (ms.some((m) => m > cap || m < win[0] - 3) || !fits(ms, steps, lens)) return null;
    return [...leadIn(f, S, L - 4, ms[0], lastMove), ...ms.map((m, k) => ({ step: steps[k], midi: m, len: 2, vel: vAt(steps[k], k ? 0 : 0.03) }))];
  };

  /** A build-up: a short cell hammered 4-12 times, now and then a note higher every few times, up to the landing (the climax). */
  const buildMove = (f: number, S: number, tp: number, L: number, lastMove: number): Ev[] | null => {
    const P = L - S;
    const span = en.paceC * E(L) >= 0 ? 4 : 8;
    const reps = Math.min(Math.floor(P / span), rng.int(4, lick === 'run' || lick === 'blues' ? 12 : 8));
    if (reps < 4) return null;
    const kind: BuildCell = lick === 'run' && rng.chance(0.5) ? 'pedal' : rng.weighted<BuildCell>([['brp', lick === 'run' ? 1 : 3], ['shape', 3]]);
    const climb = rng.chance(0.5) ? rng.pick([2, 3, 4]) : 0;
    const nClimb = climb ? Math.floor((reps - 1) / climb) : 0;
    const sh = LIB_SHAPES.filter((x) => x.n === 4 && x.minor === boxMinor && Math.abs(x.steps.reduce((a, b2) => a + b2, 0)) <= 4);
    const cellShape = sh.length ? rng.weighted(sh.map((x) => [x, Math.sqrt(x.songs)] as [LibShape, number])) : null;
    const k = span / 4, start = L - reps * span, cap = capAt(L, tp), win = windowAt(L);
    // (the cell's top stays under the cap: the anchors start lower if need be)
    const rise = kind === 'shape' && cellShape ? Math.max(0, ...shapeRel({ ...cellShape, deg: 0 })) : kind === 'pedal' ? 0 : 2;
    let lower = 0;
    while (lower < 4 && stepScale(tp, -1 - lower) + rise > cap) lower++;
    const anchor0 = stepScale(tp, -1 - lower - nClimb);
    const out: Ev[] = [];
    let anchor = anchor0;
    for (let r = 0; r < reps; r++) {
      const base = climb && r && r % climb === 0 ? stepScale(anchor, 1) : anchor;
      const g = start + r * span, v = vAt(g, 0.06 * (r / reps));
      let rep: Ev[] = [];
      if (kind === 'brp') {
        const b = bendInto(base);
        if (!b) return null;
        rep = [{ step: g, midi: base, len: 2 * k, vel: v, bend: b, unbend: b }, { step: g + 2 * k, midi: stepScale(base - b, -1), len: 2 * k, vel: v - 0.05, bend: 0, art: 'legato' }];
      } else if (kind === 'pedal') {
        rep = [base, stepScale(base, -1), base, stepScale(base, -2)].map((m, i) => ({ step: g + i * k, midi: m, len: k, vel: v - (i % 2 ? 0.05 : 0), bend: 0 }));
      } else if (cellShape) {
        let m = base;
        rep = [m, ...cellShape.steps.map((d) => (m += d))].map((x, i) => ({ step: g + i * k, midi: x, len: k, vel: v - (i ? 0.04 : 0), bend: 0 }));
      }
      if (!rep.length || rep.some((e) => e.midi > cap || e.midi - (e.unbend ?? 0) < win[0] - 3) || !fits(rep.map((e) => e.midi - (e.unbend ?? 0)), rep.map((e) => e.step), rep.map((e) => Math.min(2, e.len)))) return null;
      out.push(...rep);
      anchor = base;
    }
    return [...leadIn(f, S, start, out[0].midi, lastMove), ...out];
  };

  /**
   * A bend move that ends on the landing (the landing is its last note): bent, let down and pulled off to the landing; the same
   * bend picked 3-5 times, then held; bent, let down and bent again; or two-string bends climbing to the landing.
   */
  const bendMoveTo = (f: number, S: number, tp: number, L: number, hold: number, lastMove: number): { pre: Ev[]; landing: Ev } | null => {
    const P = L - S, move = rng.weighted(BEND_MOVES[lick]), v = vAt(L, 0.04);
    const b = bendInto(tp), cap = capAt(L, tp);
    if (move === 'brp') {
      if (P < 4) return null;
      for (const m of [1, 2, 3, 4, 5].map((d) => tp + d)) {
        const bm = bendInto(m);
        if (!bm || m > cap || stepScale(m - bm, -1) !== tp || !fits([m - bm], [L - 3], [2])) continue;
        return { pre: [...leadIn(f, S, L - 3, m, lastMove), { step: L - 3, midi: m, len: 3, vel: v, bend: bm, unbend: bm }], landing: { step: L, midi: tp, len: hold, vel: v - 0.04, bend: 0, art: 'legato' } };
      }
      return null;
    }
    if (move === 'repeat') {
      const k = Math.min(rng.int(3, 5), Math.floor(P / 2));
      if (!b || k < 3) return null;
      const steps = Array.from({ length: k }, (_, i) => L - 2 * (k - i));
      if (!fits(Array(k).fill(tp), steps, Array(k).fill(2))) return null;
      return { pre: [...leadIn(f, S, steps[0], tp, lastMove), ...steps.map((g, i) => ({ step: g, midi: tp, len: 2, vel: v + (i ? -0.03 : 0.03), bend: b }))], landing: { step: L, midi: tp, len: hold, vel: v, bend: b } };
    }
    if (move === 'brb') {
      if (!b || P < 4 || !fits([tp - b], [L - 4], [2])) return null;
      return { pre: [...leadIn(f, S, L - 4, tp, lastMove), { step: L - 4, midi: tp, len: 4, vel: v + 0.03, bend: b, unbend: b }], landing: { step: L, midi: tp, len: hold, vel: v, bend: b } };
    }
    // two-string bends climbing: the top note held, a note a 3rd or 4th under it bent up to it, a scale note higher each time
    const n = Math.min(rng.int(3, 6), Math.floor(P / 2) + 1);
    if (n < 3) return null;
    const evs2: Ev[] = [];
    for (let i = 0; i < n; i++) {
      const top = stepScale(tp, -(n - 1 - i)), g = L - 2 * (n - 1 - i);
      const gap = [3, 4, 5].find((x) => inScale(top - x) && inScale(top - x - 2) && !fit.clash(top - x, g)) ?? 0;
      if (!gap || !inScale(top - 2) || top > cap || fit.clash(top, g)) return null;
      evs2.push({ step: g, midi: top, len: 2, vel: v, bend: 2, dyad: gap });
    }
    const last = evs2.pop()!;
    return { pre: [...leadIn(f, S, evs2[0].step, evs2[0].midi, lastMove), ...evs2], landing: { ...last, len: hold } };
  };

  /** A move for the path from `f` to the landing, if one is wanted and fits: true once it and the landing are written. */
  const tryMove = (f: number, S: number, tp: number, L: number, hold: number, role: LandingRole, lastMove: number): boolean => {
    if (!FEATURES.moves || role === 'waypoint' || role === 'end') return false;
    const P = L - S, calm = calmAt(L);
    const mark = evs.length;
    const back = () => { evs.length = mark; };
    if (role === 'climax' ? rng.chance(0.85) : role === 'mid' && E(L) > 0.7 && rng.chance(0.1)) {
      if (used.build < maxBuilds && P >= 16) {
        const path = buildMove(f, S, tp, L, lastMove);
        if (path) { evs.push(...path); used.build++; land(tp, L, hold, role); return true; }
      }
    }
    if (role !== 'climax' && rng.chance(Math.min(0.6, BEND_RATE[lick] * (1 + calm) * 1.3))) {
      const bm = bendMoveTo(f, S, tp, L, hold, lastMove);
      if (bm) { evs.push(...bm.pre, bm.landing); landings.push({ step: L, midi: tp, len: hold, role }); used.bend++; return true; }
    }
    if (triplets && rng.chance(0.35)) {
      const path = tripletMove(f, S, tp, L, lastMove);
      if (path) { evs.push(...path); used.trip++; land(tp, L, hold, role); return true; }
    }
    if (runny && rng.chance(clamp(0.6 * (1 + 0.8 * en.paceC * E(L)), 0.1, 0.9))) {
      const path = runMove(f, S, tp, L, lastMove);
      if (path) { evs.push(...path); used.run++; land(tp, L, hold, role); return true; }
    }
    if (role !== 'climax' && rng.chance(0.1)) {
      const path = encloseMove(f, S, tp, L, lastMove);
      if (path) { evs.push(...path); used.enclose++; land(tp, L, hold, role); return true; }
    }
    back();
    return false;
  };

  // ---- connecting two landings
  const stepsOfRhythm = (r: Rhythm, L: number) => r.ons.map((x) => L - (r.ons[r.ons.length - 1] - x));
  const shapeWeight = (s: LibShape, g: number, adapt: boolean) =>
    Math.sqrt(s.songs) * (1 + (gi >= 0 ? (3 * s.genres[gi]) / Math.max(1, s.genres.reduce((a, b) => a + b, 0)) : 0)) * moodFit(s, mood, tensionAt(g)) * (adapt ? 0.35 : 1);

  /** A stepwise walk through the scale from `f` toward `tp`, filling [S, L) exactly: the notes before the landing. */
  const walkPath = (f: number, S: number, tp: number, L: number, lastMove: number): Ev[] => {
    const P = L - S;
    if (P < 2) return [];
    const pb = pbAt(S);
    const us = [1, 2, 4].filter((u) => u <= P);
    const u = rng.weighted(us.map((x) => [x, Math.exp(-(((4 / x - pb) / (0.45 * pb)) ** 2)) + 0.01] as [number, number]));
    // note lengths: mostly the walk's own unit, a longer note now and then (to breathe), a shorter one (a pair of quick ones)
    const dur: number[] = [];
    for (let rem = P; rem > 0;) {
      const opts: [number, number][] = [[u, 6], [2 * u, 2], [u / 2, u >= 2 ? 1 : 0], [3 * u, 0.5]];
      const ok = opts.filter(([x, w]) => w > 0 && x <= rem && Number.isInteger(x));
      // (what is left is too short for a note of its own: the last note takes it)
      if (!ok.length) { if (dur.length) dur[dur.length - 1] += rem; else dur.push(rem); break; }
      const d = rng.weighted(ok);
      dur.push(d);
      rem -= d;
    }
    const k = dur.length;
    const win = windowAt(S), pool: number[] = [];
    for (let m = win[0] - 3; m <= win[1] + (peakTop === Infinity ? 3 : 0); m++) if (inScale(m)) pool.push(m);
    const idx = (m: number) => pool.reduce((bi, x, i) => (Math.abs(x - m) < Math.abs(pool[bi] - m) ? i : bi), 0);
    const i0 = idx(f), iT = idx(tp), Pr = prof(S);
    const sign = rng.chance(Pr.up) ? 1 : -1;
    const leapy = clamp((Pr.size - 2.2) / 6, 0, 0.5);
    const path: number[] = [];
    let prev = i0;
    for (let j = 1; j <= k; j++) {
      let x = i0 + (iT - i0) * (j / (k + 1));
      // (a bend of the line, toward the way the mood leans; and now and then a leap, stepped back from)
      if (P >= 8) x += sign * Math.sin((Math.PI * j) / (k + 1)) * rng.next() * 2;
      let i = Math.round(x);
      if (rng.chance(leapy) && j < k) i += rng.pick([-3, -2, 2, 3]);
      i = clamp(i, 0, pool.length - 1);
      if (i === prev) i = clamp(i + (j === k ? (iT >= prev ? -1 : 1) : sign), 0, pool.length - 1);
      if (j === k && i === iT) i = clamp(i + (prev >= iT ? 1 : -1), 0, pool.length - 1);
      path.push(i);
      prev = i;
    }
    const out: Ev[] = [];
    let g = S;
    path.forEach((i, j) => {
      let m = pool[i];
      // (a chord note on the beats, a step away if need be)
      if ((g % 4 === 0 || changes.has(g)) && !fit.isTone(m, g)) for (const d of [1, -1, 2, -2]) { const c = pool[clamp(i + d, 0, pool.length - 1)]; if (fit.isTone(c, g) && c !== tp) { m = c; break; } }
      if (fit.clash(m, g)) for (const d of [1, -1]) { const c = pool[clamp(i + d, 0, pool.length - 1)]; if (!fit.clash(c, g)) { m = c; break; } }
      // (never the note just played again)
      const before = out.length ? out[out.length - 1].midi : f;
      if (m === before) for (const d of [sign, -sign, 2 * sign]) { const c = pool[clamp(i + d, 0, pool.length - 1)]; if (c !== before && c !== tp && !fit.clash(c, g)) { m = c; break; } }
      out.push({ step: g, midi: m, len: dur[j], vel: vel0 + 0.05 * E(g) + (j === 0 ? 0.03 : 0) + (rng.next() - 0.5) * 0.06 });
      g += dur[j];
    });
    void lastMove;
    return out;
  };

  // full scoring (docs/SOLO-PLAN.md, step 3): the licks played so far, and the motif, the solo's first lick: later licks come back to
  // its rhythm or its shape, moved to other pitches, never a copy; and never the lick just played
  interface Played { s: LibShape; r: Rhythm; sig: string }
  const played: Played[] = [];
  let motif: Played | null = null;
  const motifLean = FEATURES.score ? 0.5 + 0.4 * rng.next() : 0;
  /** A library lick that ends on the landing, in a real rhythm that fits the time: its notes before the landing, or null. */
  const lickPath = (f: number, S: number, tp: number, L: number, lastMove: number): { evs: Ev[]; start: number } | null => {
    const P = L - S;
    const endDeg = mod(tp - key, 12), pools = ENDS[boxMinor ? 'm' : 'M'];
    const cands: { s: LibShape; delta: number; w: number }[] = [];
    for (const delta of [0, 1, -1, 2, -2]) for (const s of pools[mod(endDeg + delta, 12)]) cands.push({ s, delta, w: shapeWeight(s, L, delta !== 0) });
    if (!cands.length) return null;
    const win = windowAt(L), Pr = prof(S), pb = pbAt(L);
    const gap0 = (st: number) => st - S;
    const tries: { v: { ms: number[]; steps: number[]; lens: number[]; s: LibShape; r: Rhythm; sig: string }; cost: number }[] = [];
    for (let k = 0; k < 24; k++) {
      // (a try that comes back to the motif: its rhythm, with a shape of that many notes, or its shape)
      const back = FEATURES.score && motif !== null && k < 14 && rng.chance(motifLean);
      let pickC = cands;
      if (back) { const fc = cands.filter((c) => c.s.n === motif!.r.ons.length); if (fc.length) pickC = fc; }
      const { s, delta } = rng.weighted(pickC.map((c) => [c, c.w] as [typeof c, number]));
      const rs = (RH_BY_N.get(s.n) ?? []).filter((x) => x.r.ons[s.n - 1] <= P);
      if (!rs.length) continue;
      const rpick = back && motif!.r.ons.length === s.n && motif!.r.ons[s.n - 1] <= P ? rs.find((x) => x.r === motif!.r) : undefined;
      const { r, t: rt } = rpick ?? rng.weighted(rs.map((x) => [x, Math.sqrt(x.r.songs) * Math.exp(-(((x.t.perBeat - pb) / (0.4 * pb)) ** 2)) + 1e-3] as [typeof x, number]));
      const steps = stepsOfRhythm(r, L), lens = steps.map((g, i) => (i + 1 < steps.length ? steps[i + 1] - g : 4));
      if (steps[0] < S) continue;
      const rel = shapeRel(s), last = rel[rel.length - 1];
      // (the notes end on the landing; a shape that ends a step or two off has its last note moved onto it)
      const raw = rel.map((x, i) => (i === rel.length - 1 ? tp : tp - delta - (last - x)));
      const ms = [...intoKey(raw.slice(0, -1), steps.slice(0, -1), lens.slice(0, -1), f, tp), tp];
      if (ms.some((m) => m < win[0] - 3 || m > win[1] + (peakTop === Infinity ? 3 : 0))) continue;
      if (delta !== 0 && (ms[ms.length - 1] === ms[ms.length - 2] || Math.abs(ms[ms.length - 1] - ms[ms.length - 2]) > 5)) continue;
      if (!fits(ms.slice(0, -1), steps.slice(0, -1), lens.slice(0, -1))) continue;
      let cost = intervalCost(Pr, f, ms[0], lastMove, false) + 0.5 * -Math.log(moodFit(s, mood, tensionAt(L))) + 0.5 * ((rt.perBeat - pb) / pb) ** 2 + 0.15 * (steps[0] - S);
      // (chord notes where they are heard: the beats and the chord changes)
      ms.slice(0, -1).forEach((m, i) => { if (steps[i] % 4 === 0 || changes.has(steps[i])) cost -= fit.isTone(m, steps[i]) ? 0.8 : -0.8; });
      if (delta !== 0) cost += 0.8;
      // (a lick that starts on the note just played says it twice)
      if (ms[0] === f && !(gap0(steps[0]) >= 3)) cost += 1.5;
      const sig = ms.map((m) => m - ms[ms.length - 1]).join(',') + '|' + ms[ms.length - 1];
      if (FEATURES.score) {
        const prev = played[played.length - 1];
        // (never a copy of a lick already played; not the lick just played, nor its shape or rhythm)
        if (played.some((x) => x.sig === sig)) cost += 3;
        if (prev && prev.s === s) cost += 1.5;
        if (prev && prev.r === r && r !== motif?.r) cost += 0.8;
        if (played.slice(-4).some((x) => x.s === s)) cost += 0.5;
        // (the motif coming back: its rhythm, or its shape on other notes)
        if (motif) {
          if (r === motif.r) cost -= 1.5;
          if (s === motif.s && sig !== motif.sig) cost -= 0.6;
        }
      }
      tries.push({ v: { ms, steps, lens, s, r, sig }, cost });
    }
    const pick = pickCost(rng, tries);
    if (!pick) return null;
    if (FEATURES.score) {
      const now: Played = { s: pick.s, r: pick.r, sig: pick.sig };
      if (motif && (now.r === motif.r || now.s === motif.s)) used.motif++;
      if (!motif && pick.ms.length >= 4) motif = now;
      played.push(now);
    }
    const out: Ev[] = [];
    // a gap before the lick: walked, if it is long enough to say something, else a rest
    const gap = pick.steps[0] - S;
    if (gap >= 3) out.push(...walkPath(f, S, pick.ms[0], pick.steps[0], lastMove));
    pick.ms.slice(0, -1).forEach((m, i) => out.push({ step: pick.steps[i], midi: m, len: pick.lens[i], vel: vel0 + 0.05 * E(pick.steps[i]) + (i === 0 ? 0.03 : 0) + (rng.next() - 0.5) * 0.06 }));
    return { evs: out, start: pick.steps[0] };
  };

  /** The path from the note `f` to the landing `tp` at `L`, from `S`; then the landing itself. A long path is cut at a waypoint. */
  const connect = (f: number, S: number, tp: number, L: number, hold: number, role: LandingRole, lastMove: number): void => {
    const P = L - S;
    if (tryMove(f, S, tp, L, hold, role, lastMove)) return;
    if (P > 14) {
      // a waypoint on a beat near the middle: a weaker landing, a chord note between the two
      const wl = clamp(S + 4 * Math.round((P * (0.4 + 0.2 * rng.next())) / 4), S + 4, L - 8);
      const dw = rng.pick([2, 2, 4]);
      const win = windowAt(wl), frac = (wl - S) / P, P0 = prof(wl);
      const ideal = f + (tp - f) * frac + (rng.next() - 0.3) * 3;
      const items: { v: number; cost: number }[] = [];
      for (let m = win[0]; m <= win[1]; m++) {
        if (!fit.isTone(m, wl) || fit.clash(m, wl)) continue;
        items.push({ v: m, cost: (m === f || m === tp ? 1.5 : 0) + 0.3 * Math.abs(m - ideal) + 0.5 * intervalCost(P0, f, m, lastMove, false) + 0.5 * intervalCost(P0, m, tp, m - f, false) });
      }
      const w = pickCost(rng, items);
      if (w !== null) {
        connect(f, S, w, wl, dw, 'waypoint', lastMove);
        connect(w, wl + dw, tp, L, hold, role, w - f);
        return;
      }
    }
    if (P >= 2) {
      const lp = P >= 3 && (rng.chance(0.8) || P <= 4) ? lickPath(f, S, tp, L, lastMove) : null;
      const path = lp ? lp.evs : walkPath(f, S, tp, L, lastMove);
      evs.push(...path);
    }
    land(tp, L, hold, role);
  };

  // ---- the solo: phrase by phrase
  let prevLanding: number | null = null, before: number | null = null, climaxMidi: number | null = null, lastMove = 0, f = centerAt(0);
  /** A phrase's hold, breath and landing time. */
  const sizePhrase = (p: Phrase, pi: number) => {
    const lastPhrase = pi === phrases.length - 1;
    const { S } = p;
    let pe = p.end, hold: number, breath: number;
    if (lastPhrase && FEATURES.carry && p.end === lastBarStart) {
      // the ending: the last note comes in a beat before the last bar and rings to the end of the section (and on, if another follows)
      const L = Math.max(p.S, p.end - 4);
      return { hold: end - L, breath: 0, L };
    }
    if (lastPhrase) {
      // the ending: most run on into the next section (a short last note), some land on the root, held
      const home = rng.chance(0.4);
      hold = home ? 2 * Math.round((6 + 6 * rng.next()) / 2) : 3;
      breath = 0;
      pe = end;
    } else {
      hold = holdFor(pe, p.role, p.len);
      breath = breathFor(pe, p.role);
    }
    // (a held phrase is the one note: it takes the window, less a short breath)
    if (p.held) { breath = Math.min(breath, 4); hold = pe - p.S - breath; }
    // (into the climax: the phrase before it ends low and breathes, so the peak is a rise; the climax keeps room for a path to it)
    if (FEATURES.peak && phrases[pi + 1]?.role === 'climax') breath = Math.max(breath, 4);
    if (FEATURES.peak && p.role === 'climax') {
      hold = Math.min(hold, Math.max(2, 2 * Math.floor((p.len - 8) / 2)));
      // (a build-up keeps its room: a short hold and breath)
      if (wantBuild) { hold = Math.min(hold, Math.max(8, 2 * Math.floor((p.len - 18) / 2))); breath = Math.min(breath, 4); }
    }
    let L = pe - breath - hold;
    // (no room for a path: a held note, the hold taking what there is)
    if (L - S < 2) { L = S; hold = Math.max(2, Math.min(FEATURES.holds ? 18 : 14, pe - S - breath)); }
    return { hold, breath, L };
  };
  // the climax first (docs/SOLO-PLAN.md, round 2): its note is the highest chord note the window allows, and it is the ceiling:
  // every other phrase, path notes too, stays 3 semitones under it
  let climaxPlan: { hold: number; breath: number; L: number; m: number } | null = null;
  if (FEATURES.peak && climaxAt >= 0) {
    const sz = sizePhrase(phrases[climaxAt], climaxAt);
    let top = 0;
    for (let g = 0; g < total; g += 2) top = Math.max(top, rawWindow(g)[1]);
    let m = -1;
    for (const strict of [true, false]) {
      for (let x = top; x >= top - 14 && m < 0; x--) if (fit.isTone(x, sz.L) && (!strict || (!fit.clash(x, sz.L) && (sz.hold < 4 || !fit.rubs(x, sz.L))))) m = x;
      if (m >= 0) break;
    }
    if (m >= 0) { climaxPlan = { ...sz, m }; peakTop = m; }
  }
  /** What a phrase wrote, for an echo to play again. */
  interface Rec { w0: number; evs: Ev[]; lands: Landing[]; m: number; L: number; hold: number }
  const recs: (Rec | undefined)[] = [];
  /** The phrase it echoes, played again `dt` steps on: as it was, with another ending, or moved along the scale (chord notes kept on chord notes); false if none fits. */
  const tryEcho = (p: Phrase, pi: number): boolean => {
    const r = recs[p.echoOf!];
    if (!r) return false;
    const dt = p.w0 - r.w0, L2 = r.L + dt, n = p.echoN ?? 1;
    if (L2 + r.hold > Math.min(p.end, end)) return false;
    const copy = () => r.evs.map((e) => ({ ...e, step: e.step + dt }));
    const copyLands = () => r.lands.map((l) => ({ ...l, step: l.step + dt }));
    const finalLand = [...r.lands].reverse().find((l) => l.role !== 'waypoint')!;
    const landSteps = new Set(r.lands.map((l) => l.step + dt));
    const lastEnd = evs.length ? Math.max(...evs.map((e) => e.step + e.len)) : 0;
    const valid = (es: Ev[], landNote: number) => {
      if (Math.min(...es.map((e) => e.step)) < Math.max(lastEnd, p.w0) || Math.max(...es.map((e) => e.step + e.len)) > Math.min(p.end, total)) return false;
      const rootNow = mod(chordPc(key, fit.chordAt(L2)) , 12);
      if (p.role === 'call' && mod(landNote, 12) === rootNow) return false;
      return es.every((e) => {
        const m = e.midi - (e.unbend ?? 0), win = windowAt(e.step);
        if (m < win[0] - 3 || e.midi > win[1] + (peakTop === Infinity ? 3 : 0)) return false;
        if (landSteps.has(e.step)) return fit.isTone(e.midi, e.step) && !fit.clash(e.midi, e.step) && (e.len < 4 || !fit.rubs(e.midi, e.step));
        return fits([m], [e.step], [e.len]);
      });
    };
    const first = rng.weighted<'same' | 'ending' | 'moved'>(n >= 2 ? [['ending', 55], ['moved', 45]] : [['same', 17], ['ending', 50], ['moved', 33]]);
    const order = [first, ...(['ending', 'moved', 'same'] as const).filter((k) => k !== first && (n < 2 || k !== 'same'))];
    for (const kind of order) {
      let es: Ev[] = [], ls: Landing[] = [], m2 = r.m;
      if (kind === 'same') { es = copy(); ls = copyLands(); if (!valid(es, m2)) continue; }
      else if (kind === 'moved') {
        const ks = rng.chance(prof(L2).up) ? [1, -1, 2, -2] : [-1, 1, -2, 2];
        let ok = false;
        for (const k of ks) {
          es = copy().map((e) => ({ ...e, midi: stepScale(e.midi, k) }));
          ls = copyLands().map((l) => ({ ...l, midi: stepScale(l.midi, k) }));
          m2 = stepScale(r.m, k);
          if (valid(es, m2)) { ok = true; break; }
        }
        if (!ok) continue;
      } else {
        // another ending: the landing another chord note of the chord, the note before it a step from it
        es = copy(); ls = copyLands();
        const li = es.findIndex((e) => e.step === finalLand.step + dt);
        if (li < 0) continue;
        const old = es[li].midi, root = chordPc(key, fit.chordAt(L2)), win = windowAt(L2), P = prof(L2);
        const opts: { v: number; cost: number }[] = [];
        for (let c = old - 5; c <= old + 5; c++) {
          if (c === old || c < win[0] - 2 || c > win[1] || !fit.isTone(c, L2) || fit.clash(c, L2) || (es[li].len >= 4 && fit.rubs(c, L2))) continue;
          const isRoot = mod(c, 12) === root;
          opts.push({ v: c, cost: Math.abs(c - old) + (p.role === 'call' && isRoot ? 3 : 0) + (p.role === 'answer' && isRoot ? -1 : 0) + 0.5 * (li ? intervalCost(P, es[li - 1].midi, c, 0, true) : 0) });
        }
        const c = pickCost(rng, opts);
        if (c === null) continue;
        es[li].midi = c;
        const lastLand = [...ls].reverse().find((l) => l.role !== 'waypoint')!;
        lastLand.midi = c;
        m2 = c;
        const pn = es[li - 1];
        if (pn && pn.step + pn.len === es[li].step && !landSteps.has(pn.step)) {
          const a = stepScale(c, pn.midi < c ? -1 : 1);
          if (a !== c && fits([a], [pn.step], [pn.len])) pn.midi = a;
        }
        if (!valid(es, m2)) continue;
      }
      evs.push(...es);
      landings.push(...ls);
      lastMove = prevLanding === null ? 0 : m2 - prevLanding;
      before = prevLanding;
      prevLanding = m2;
      f = m2;
      recs[pi] = { w0: p.w0, evs: es.map((e) => ({ ...e })), lands: ls.map((l) => ({ ...l })), m: m2, L: L2, hold: r.hold };
      return true;
    }
    return false;
  };
  phrases.forEach((p, pi) => {
    if (p.echoOf !== undefined && tryEcho(p, pi)) return;
    const mark = evs.length, markL = landings.length;
    const { S } = p;
    const sz = pi === climaxAt && climaxPlan ? climaxPlan : sizePhrase(p, pi);
    let { hold, L } = sz;
    const buildUp = FEATURES.peak && phrases[pi + 1]?.role === 'climax';
    inClimax = FEATURES.peak && pi === climaxAt && !!climaxPlan;
    // (a hold over a chord change keeps to the chord it was played on, if the note isn't in the next one)
    let m = pi === climaxAt && climaxPlan ? climaxPlan.m : chooseLanding(L, p.role === 'end' && hold === 3 ? 'mid' : p.role, hold, prevLanding, lastMove, before, buildUp);
    if (p.role === 'end' && hold > 3 && (!FEATURES.carry || rng.chance(0.5))) {
      const root = chordPc(key, fit.chordAt(L));
      const alt = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5].map((d) => m + d).find((x) => mod(x, 12) === root && !fit.clash(x, L) && x >= windowAt(L)[0] - 2 && x <= windowAt(L)[1] + 2);
      if (alt !== undefined) m = alt;
    }
    // (the final note carries over a chord change: the bend after it moves it to the next chord)
    if (!(FEATURES.carry && p.role === 'end')) for (let g = L + 1; g < L + hold; g++) if (changes.has(g) && !fit.isTone(m, g)) { hold = Math.max(2, 2 * Math.floor((g - L) / 2)); break; }
    connect(prevLanding === null ? f : prevLanding, S, m, L, hold, p.role, lastMove);
    recs[pi] = { w0: p.w0, evs: evs.slice(mark).map((e) => ({ ...e })), lands: landings.slice(markL).map((l) => ({ ...l })), m, L, hold };
    lastMove = prevLanding === null ? 0 : m - prevLanding;
    if (p.role === 'climax') climaxMidi = m;
    inClimax = false;
    before = prevLanding;
    prevLanding = m;
    f = m;
  });

  // ---- notes never run into the next
  evs.sort((a, b) => a.step - b.step);
  for (let i = 0; i + 1 < evs.length; i++) if (evs[i].step + evs[i].len > evs[i + 1].step) evs[i].len = Math.max(1, evs[i + 1].step - evs[i].step);

  const hits = playSolo(rng, evs, { lick, key, minor, isTone: fit.isTone, inScale, total, t });
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const curve: SoloCurve = {
    shape: ENERGY_WORDS[en.shape](en), pitchC: en.pitchC, paceC: en.paceC,
    energy: Array.from({ length: total }, (_, g) => r2(E(g))),
    centre: Array.from({ length: total }, (_, g) => centerAt(g)),
    pace: Array.from({ length: total }, (_, g) => r2(1 + en.paceC * en.pace * E(g))),
    landings: landings.map((l) => ({ ...l })),
  };
  const peak = landings.find((l) => l.role === 'climax');
  void barStarts;
  return {
    hits, curve,
    notes: [`Guitar 2: a solo (planned): ${ENERGY_WORDS[en.shape](en)}, ${landings.filter((l) => l.role !== 'waypoint').length} landings${peak ? `, the peak in bar ${Math.floor(peak.step / 16) + 1}` : ''}, ${mood} intervals${Object.entries(used).filter(([, n]) => n).map(([k, n]) => `, ${n} ${k}`).join('')}`],
  };
}
