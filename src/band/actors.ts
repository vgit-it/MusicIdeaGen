// The players (docs/BAND-VIEW.md): each one a function of song time that says which sprites to draw,
// where. Nothing is remembered between frames, so the view can start anywhere, jump or loop.
// The moves are read off the score (score.ts): a stick up before a hit, the fretting hand at the real
// fret before the note, the strumming hand swinging through the strings, the singer's mouth per sound.

import { type Atlas, onNeck } from './atlas';
import { STYLES, type Style } from './persona';
import { type DrumHit, type FretNote, type Hold, type Piece, type Score, type SectionSpan, type Strum, lastAt } from './score';

/** A sprite to draw (its origin at x, y), or an effect line (a string shaking), in the player's space. */
export type Cmd = { a: Atlas; f: string; x: number; y: number; alpha?: number } | { line: [number, number, number, number]; color: string; alpha: number; w?: number };

/** What every player knows about this moment. */
export interface Moment {
  /** Song position in steps (16ths), and seconds per step. */
  t: number;
  six: number;
  section: SectionSpan;
  /** 0-1 through the current beat, and the beat's number. */
  beat: number;
  beatNo: number;
  heavy: boolean;
  /** Seconds on a clock that always runs (blinks; waiting before the song). */
  wall: number;
  /** Before the song: this player walking on, waving, the count-in. */
  pre?: Pre;
}

/**
 * Before the song (the walk-on): how far this player still is from their spot (x), their stride while
 * walking (null: standing), a wave to the crowd, and seconds since the drummer's last count-in click.
 */
export interface Pre { x: number; stride: number | null; wave: boolean; count: number }

export type Actor = (m: Moment) => Cmd[];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (u: number) => u * u * (3 - 2 * u);

/** Blinks every few seconds, each player at their own time. */
const blinking = (sec: number, seed: number) => (sec + seed * 1.37) % (2.9 + seed * 0.4) < 0.11;

/**
 * Nodding along: the upper body bounces and the head nods on the beat, more in loud sections;
 * head-banging in heavy ones. Loud sections lock the band in: everyone on the same beat, no one lagging.
 * The character changes it: a cool player only nods on the bar, bounces little; an energetic one bounces
 * big; angry and emo players head-bang whenever it's loud; an emo player slumps, head down, when it's quiet.
 */
function groove(m: Moment, lag: number, st: Style) {
  const e = m.section.energy;
  const p = (m.beat + 1 - (e >= 4 ? 0 : lag)) % 1;
  const bang = (m.heavy && e >= 5) || (st.nod === 'bang' && e >= 4);
  let head = bang ? (p < 0.45 ? 'down' : 'front') : e >= 3 && p < (e >= 4 ? 0.25 : 0.16) ? 'down' : 'front';
  if (st.nod === 'bar' && !bang) head = e >= 3 && m.beatNo % 4 === 0 && p < 0.22 ? 'down' : 'front';
  if (st.slump && e <= 3) head = 'down';
  const base = e >= 4 ? (p < 0.18 ? 2 : p < 0.32 ? 1 : 0) : e >= 3 && p < 0.2 ? 1 : 0;
  return { head, dy: Math.round(base * st.bounce) };
}

/** The jumps this character takes: none for a cool one; an energetic one also jumps every four bars when it's loudest. */
function jumpsFor(score: Score, st: Style) {
  if (!st.jumps) return [];
  const out = [...score.moves.jumps];
  if (st.extraJumps) for (const x of score.sections) if (x.energy >= 5 || (x.kind === 'chorus' && x.energy >= 4)) x.bars.forEach((b, i) => { if (i > 0 && i % 4 === 0) out.push(b); });
  return [...new Set(out)].sort((a, b) => a - b).map((at) => ({ at }));
}

/** Jumps into big sections (a crouch just before, knees tucked in the air) and the ending pose after the final hit. */
function showOf(jumps: { at: number }[], final: number | null, t: number, six: number) {
  const i = lastAt(jumps, t);
  const prev = jumps[i], next = jumps[i + 1];
  const ending = final !== null && t >= final + 0.4 / six;
  if (next && (next.at - t) * six < 0.12) return { dy: 2, legs: 'wide', air: false, ending };
  if (prev) {
    const u = (t - prev.at) * six;
    if (u < 0.45) {
      const air = u > 0.04 && u < 0.41;
      return { dy: -Math.round(9 * Math.sin((Math.PI * u) / 0.45)), legs: air ? 'jump' : 'wide', air, ending };
    }
  }
  return { dy: 0, legs: null as string | null, air: false, ending };
}

/** Loud sections: step in toward the drummer (and back out as the section ends). */
function stepIn(m: Moment, dist: number) {
  if (m.section.energy < 4 || m.section.solo) return 0;
  const inS = (m.t - m.section.from) * m.six, outS = (m.section.to - m.t) * m.six;
  return Math.round(dist * ease(clamp(Math.min(inS, outS) / 0.6, 0, 1)));
}

/** Legs while walking on: the stride's frame, and a bob on the steps. */
const walking = (pre: Pre) => (pre.stride === null ? null : { legs: `legs/walk/${pre.stride % 4}`, bob: pre.stride % 2 ? -1 : 0 });

/** The head and face, and what's worn on it (shades, a fringe, a sweatband, eyeliner) on top. */
function face(a: Atlas, pose: string, eyes: string, brows: string, mouth: string, x: number, y: number): Cmd[] {
  const [fx, fy] = a.geo.poses?.[pose] ?? [0, 0];
  return [
    { a, f: `head/${pose}`, x, y },
    { a, f: `eyes/${eyes}`, x: x + fx, y: y + fy },
    { a, f: `brows/${brows}`, x: x + fx, y: y + fy },
    { a, f: `mouth/${mouth}`, x: x + fx, y: y + fy },
    ...(a.geo.acc ?? []).map((k) => ({ a, f: `acc/${k}`, x: x + fx, y: y + fy })),
  ];
}

/* ---------------------------------------------------------------- the drummer */

/** Hands: a stick rises before a hit (higher when louder), lands on the drum, rebounds. */
function limb(hits: DrumHit[], t: number, six: number, home: Piece): { piece: Piece; phase: 'up' | 'mid' | 'hit' } {
  const i = lastAt(hits, t);
  const prev = hits[i], next = hits[i + 1];
  const since = prev ? (t - prev.at) * six : Infinity, until = next ? (next.at - t) * six : Infinity;
  if (since < 0.045) return { piece: prev.piece, phase: 'hit' };
  if (next) {
    const gap = prev ? (next.at - prev.at) * six : 0.4;
    const windup = clamp(gap * 0.6, 0.06, 0.22);
    if (until < windup) return { piece: next.piece, phase: until > windup * 0.45 && next.vel > 0.45 ? 'up' : 'mid' };
  }
  if (since < 0.14) return { piece: prev.piece, phase: 'mid' };
  return { piece: since < 1.2 ? prev.piece : home, phase: 'mid' };
}

export function drummerActor(a: Atlas, score: Score, st: Style = STYLES.energetic): Actor {
  const { limbs, pieces, hatOpen } = score.drums;
  const ago = (p: Piece, t: number, six: number) => { const l = pieces[p]; const i = lastAt(l, t); return i < 0 ? Infinity : (t - l[i].at) * six; };
  const final = score.moves.final;
  return (m) => {
    const { t, six } = m, sec = m.wall;
    if (m.pre) {
      // walking on behind the kit with the sticks up, then clicking them together for the count-in
      const pre = m.pre, w = walking(pre), y = w?.bob ?? 0;
      const sticks = pre.count < 0.09 ? 'click' : 'sky';
      const kit = ['kick/rest', 'tom3/rest', 'tom1/rest', 'tom2/rest', 'snare/rest', 'hat/closed', 'crash/rest', 'ride/rest'].map((f) => ({ a, f: `kit/${f}`, x: 0, y: 0 }));
      return [
        ...(pre.stride === null ? [{ a, f: 'legs/sit', x: pre.x, y: 0 }] : []),
        { a, f: 'body/idle', x: pre.x, y },
        ...face(a, pre.count < 0.15 ? 'down' : 'front', blinking(sec, 3) ? 'closed' : st.eyes(3), st.brows(3), pre.count < 0.12 ? 'O' : st.mouth(3), pre.x, y),
        ...kit,
        { a, f: `armA/${sticks}`, x: pre.x, y }, { a, f: `armB/${sticks}`, x: pre.x, y },
      ];
    }
    const g = groove(m, 0.05, st);
    const kick = ago('kick', t, six);
    const crash = ago('crash', t, six);
    const dy = (kick < 0.07 ? 1 : 0) + g.dy;
    const out: Cmd[] = [{ a, f: kick < 0.08 ? 'legs/kick' : 'legs/sit', x: 0, y: 0 }, { a, f: 'body/idle', x: 0, y: dy }];
    const big = crash < 0.35 && m.section.energy >= 4;
    const e = m.section.energy;
    out.push(...face(a, crash < 0.25 && st.nod !== 'bar' ? 'up' : g.head, big ? 'squeeze' : blinking(sec, 3) ? 'closed' : st.eyes(e),
      st.brows(e), big && e >= 5 ? st.shout : st.mouth(e), 0, dy));
    // the kit answers: heads flash, cymbals swing, the hats open and close with the foot
    const drumState = (p: Piece) => (ago(p, t, six) < 0.06 ? 'hit' : 'rest');
    const cym = (p: Piece) => { const s = ago(p, t, six); return s < 0.07 ? 'hit1' : s < 0.2 ? 'hit2' : s < 0.32 && p === 'crash' ? 'hit1' : 'rest'; };
    const open = hatOpen.some(([f, u]) => t >= f && t < u);
    out.push(
      { a, f: `kit/kick/${drumState('kick')}`, x: 0, y: 0 },
      { a, f: `kit/tom3/${drumState('tom3')}`, x: 0, y: 0 },
      { a, f: `kit/tom1/${drumState('tom1')}`, x: 0, y: 0 },
      { a, f: `kit/tom2/${drumState('tom2')}`, x: 0, y: 0 },
      { a, f: `kit/snare/${drumState('snare')}`, x: 0, y: 0 },
      { a, f: `kit/hat/${open ? 'open' : 'closed'}`, x: 0, y: 0 },
      { a, f: `kit/crash/${cym('crash')}`, x: 0, y: 0 },
      { a, f: `kit/ride/${cym('ride')}`, x: 0, y: 0 },
    );
    // the right hand's home is the hats (or the ride, where the groove rides)
    const rideNear = ago('ride', t, six) < ago('hat', t, six);
    const A = limb(limbs.A, t, six, rideNear ? 'ride' : 'hat');
    const B = limb(limbs.B, t, six, 'snare');
    // the final hit rung out: sticks up
    if (final !== null && t >= final + 0.3 / six && ago('crash', t, six) > 0.06) {
      out.push({ a, f: 'armA/sky', x: 0, y: dy }, { a, f: 'armB/sky', x: 0, y: dy });
      return out;
    }
    out.push({ a, f: `armA/${A.piece}/${A.phase}`, x: 0, y: dy }, { a, f: `armB/${B.piece}/${B.phase}`, x: 0, y: dy });
    return out;
  };
}

/* ---------------------------------------------------------------- guitarists and the bassist */

type Role = 'rhythm' | 'lead' | 'bass';

/** Alternate picking: down, up, down... starting again with a down after a breath. */
function parities(notes: FretNote[], six: number) {
  const out: number[] = [];
  let p = 1, last = -Infinity;
  notes.forEach((n) => {
    if (!n.picked) { out.push(p); return; }
    p = (n.at - last) * six > 0.5 ? 0 : 1 - p;
    last = n.at;
    out.push(p);
  });
  return out;
}

/** The strumming hand: a pendulum through the strings, down on the beat, up between, silent past the rests. */
function strumHand(strums: Strum[], t: number, six: number): string | null {
  const i = lastAt(strums, t);
  const prev = strums[i], next = strums[i + 1];
  const d = 0.03 / six;
  const end = (s: Strum) => (s.dir === 'D' ? 1 : -1), start = (s: Strum) => -end(s);
  if (prev && (t - prev.at) * six > 1.4 && (!next || (next.at - t) * six > 0.5)) return null;
  if (!prev && (!next || (next.at - t) * six > 0.5)) return null;
  const muted = (prev?.kind === 'p') && (!next || next.kind === 'p');
  if (muted) return t - prev.at < 0.06 / six ? 'pick/mute2' : 'pick/mute';
  let p: number;
  // (through the strings: the hand caught mid-stroke, blurred the way it moves)
  if (prev && t - prev.at < d * 0.6) return prev.dir === 'D' ? 'pick/blurD' : 'pick/blurU';
  if (next && next.at - t < d * 0.4) return next.dir === 'D' ? 'pick/blurD' : 'pick/blurU';
  if (prev && t - prev.at < d) p = end(prev) * ((t - prev.at) / d);
  else if (next && next.at - t < d) p = start(next) * ((next.at - t) / d);
  else if (prev && next) {
    const from = prev.at + d, to = next.at - d;
    const u = to > from ? clamp((t - from) / (to - from), 0, 1) : 1;
    p = end(prev) + (start(next) - end(prev)) * ease(u);
  } else p = prev ? end(prev) : -1;
  return p < -0.45 ? 'pick/up' : p > 0.45 ? 'pick/down' : 'pick/mid';
}

/** Where the fretting hand's fingers are: the palm's fret, each fingertip (fret, string, how far bent), a barre. */
interface Fingers {
  palm: number;
  off: boolean;
  tips: { fret: number; string: number; lift?: number; light?: boolean }[];
  barre?: { fret: number; from: number; to: number };
  dx: number;
  /** A bend under way (for the face). */
  bending: boolean;
}

/** The fretting hand on a line of notes: there just before each note, slides, fall-offs, bends, vibrato, trills. */
function fingersOnNotes(notes: FretNote[], t: number, six: number, role: Role, strings: number): Fingers | null {
  const early = 0.06 / six;
  const i = lastAt(notes, t + early);
  const n = notes[i];
  if (!n) return null;
  const local = (t - n.at) * six, len = (n.end - n.at) * six;
  if (local > len + 0.9) return null;
  if (n.fret === 0 || n.grip === 'open') {
    // an open string: the hand waits off the strings where it was
    let k = i - 1;
    while (k >= 0 && notes[k].fret === 0 && i - k < 6) k--;
    return { palm: k >= 0 && notes[k].fret ? notes[k].fret : 2, off: true, tips: [], dx: 0, bending: false };
  }
  let fret = n.fret, lift = 0, dx = 0;
  if (n.from && local >= 0 && local < 0.09) fret = Math.max(0.5, fret - n.from * (1 - local / 0.09));
  if (n.fall && local > len - 0.15) fret = Math.max(0.5, fret - n.fall * clamp((local - (len - 0.15)) / 0.15, 0, 1));
  // a bend pushes the string up across the neck (a semitone a pixel or so), let down again for an unbend
  const full = Math.min(2.5, (n.bend || n.unbend || 0) * 1.2);
  if (n.bend) {
    const up = clamp(local / 0.09, 0, 1), down = n.unbend ? clamp((local - len * 0.55) / 0.12, 0, 1) : 0;
    lift = full * up * (1 - down);
  } else if (n.unbend) lift = full * (1 - clamp((local - len * 0.4) / 0.12, 0, 1));
  const bending = lift > 0.5 && local >= 0;
  if (n.trill && local > 0) fret += Math.floor(local / 0.055) % 2 ? n.trill : 0;
  const vib = n.vib || (role === 'lead' && len > 0.45);
  if (vib && local > 0.15 && local < len) dx = Math.floor(local * 13) % 2;
  if (n.grip === 'mute') return { palm: fret, off: false, tips: [0, 1, 2, 3].map((s) => ({ fret, string: s + Math.max(0, strings - 5), light: true })), dx: 0, bending: false };
  const tips: Fingers['tips'] = [{ fret, string: n.string, lift }];
  if (n.grip === 'power') {
    tips.push({ fret: fret + 2, string: n.string + 1 });
    if (strings === 6 && n.string + 2 < strings) tips.push({ fret: fret + 2, string: n.string + 2 });
  }
  return { palm: fret, off: false, tips, dx, bending };
}

/** The fretting hand on a chord shape: a fingertip on every fretted string, a barre where the shape has one. */
function fingersOnHold(h: Hold, strings: number): Fingers {
  const played = h.frets.map((f, s) => ({ f, s })).filter((x): x is { f: number; s: number } => x.f !== null);
  const fretted = played.filter((x) => x.f > 0);
  if (h.grip === 'open' || !fretted.length) return { palm: h.fret, off: true, tips: [], dx: 0, bending: false };
  const min = Math.min(...fretted.map((x) => x.f));
  if (h.grip === 'barre') {
    const above = played.filter((x) => x.f > min);
    return { palm: min, off: false, barre: { fret: min, from: played[0].s, to: strings - 1 }, tips: above.slice(0, 3).map((x) => ({ fret: x.f, string: x.s })), dx: 0, bending: false };
  }
  // (open strings ring under the shape; at most four fingers)
  return { palm: min, off: false, tips: fretted.slice(-4).map((x) => ({ fret: x.f, string: x.s })), dx: 0, bending: false };
}

/**
 * The fretting hand drawn: the palm sprite under the neck at the index finger's fret, a finger from the
 * knuckles up over the fretboard to each fingertip sprite, a barre laid across the strings.
 */
function drawFingers(a: Atlas, f: Fingers, x: number, dy: number): Cmd[] {
  const n = a.geo.neck!;
  const skin = a.geo.skin ?? '#e0b088';
  const out: Cmd[] = [];
  const pf = Math.round(clamp(f.palm, 0, n.frets));
  const want = onNeck(n, Math.max(f.palm, 0.8) + 0.7, n.strings - 1), got = onNeck(n, Math.max(pf, 0.8) + 0.7, n.strings - 1);
  out.push({ a, f: `fret/${f.off ? 'off' : 'palm'}/${pf}`, x: x + want[0] - got[0] + f.dx, y: dy + want[1] - got[1] });
  if (f.off) return out;
  const spot = (fret: number, string: number) => onNeck(n, Math.max(fret - 0.35, 0.5), string);
  if (f.barre) {
    const t0 = spot(f.barre.fret, f.barre.from - 0.4), t1 = spot(f.barre.fret, f.barre.to + 0.6);
    out.push({ line: [x + t0[0] + f.dx, dy + t0[1], x + t1[0] + f.dx, dy + t1[1]], color: skin, alpha: 1, w: 2 });
  }
  for (const tip of f.tips) {
    if (tip.string < 0 || tip.string >= n.strings) continue;
    const [tx, ty] = spot(tip.fret, tip.string - (tip.lift ?? 0) / n.spacing);
    const knuckle = onNeck(n, Math.max(tip.fret - 0.35, 0.5) + 0.25, n.strings - 1 + 2.2 / n.spacing);
    if (!tip.light) out.push({ line: [x + knuckle[0] + f.dx, dy + knuckle[1], x + tx + f.dx, dy + ty + 1], color: skin, alpha: 1, w: 2 });
    out.push({ a, f: tip.light ? 'tip/light' : 'tip/press', x: x + tx + f.dx, y: dy + ty });
  }
  return out;
}

export function guitarActor(a: Atlas, score: Score, role: Role, seed: number, st: Style = STYLES.energetic): Actor {
  const notes = role === 'bass' ? score.bass : role === 'lead' ? score.lead : score.rhythm.notes;
  const own = notes.filter((n) => !n.onHold);
  const picks = parities(notes, score.six);
  const pickName = (k: number) => (role === 'bass' ? (k ? 'pluck/b' : 'pluck/a') : k ? 'pick/b' : 'pick/a');
  const { strums, holds, out } = score.rhythm;
  const neck = a.geo.neck!;
  const jumps = jumpsFor(score, st), held = score.moves.held, final = score.moves.final;
  return (m) => {
    const { t, six } = m, sec = m.wall, e = m.section.energy;
    if (m.pre) {
      // walking on, hands off the strings; at the count-in, the pick hand up, ready
      const pre = m.pre, w = walking(pre), y = w?.bob ?? 0;
      return [
        { a, f: 'hair/back', x: pre.x, y },
        { a, f: w?.legs ?? 'legs/stand', x: pre.x, y: 0 },
        { a, f: 'body/idle', x: pre.x, y },
        ...face(a, pre.count < 0.15 || st.slump ? 'down' : 'front', blinking(sec, seed) ? 'closed' : st.eyes(3), st.brows(3), st.mouth(3), pre.x, y),
        { a, f: 'inst/body', x: pre.x, y },
        ...drawFingers(a, { palm: 3, off: true, tips: [], dx: 0, bending: false }, pre.x, y),
        { a, f: pre.count < 9 && role !== 'bass' ? 'pick/up' : 'pick/rest', x: pre.x, y },
      ];
    }
    const g = groove(m, role === 'bass' ? 0.1 : role === 'lead' ? 0.03 : 0, st);
    const show = showOf(jumps, final, t, six);
    const sitting = role === 'rhythm' && out.some(([f, u]) => t >= f && t < u);
    const riff = role === 'rhythm' && !!m.section.riff;

    // the fretting hand: on the notes (lead, bass, riffs) or on the chord shape held
    let fing: Fingers | null = null;
    if (role !== 'rhythm' || riff) fing = fingersOnNotes(role === 'rhythm' ? own : notes, t, six, role, neck.strings);
    else if (!sitting) { const h = holds[lastAt(holds, t)]; if (h) fing = fingersOnHold(h, neck.strings); }
    if (sitting || !fing) fing = { palm: fing?.palm ?? 3, off: true, tips: [], dx: 0, bending: false };

    // the picking hand, on the string it picks
    let ph: string | null = null, pdy = 0;
    const ni = lastAt(notes, t);
    const n = notes[ni];
    const noteAgo = n ? (t - n.at) * six : Infinity;
    if (role === 'rhythm' && !riff) ph = strumHand(strums, t, six);
    // (picked notes over the chord, when they're newer than the last strum)
    const lastStrum = strums[lastAt(strums, t)];
    if (n && (role !== 'rhythm' || riff || (n.onHold && (!lastStrum || n.at > lastStrum.at))) && noteAgo < (n.end - n.at) * six + 0.6) {
      if (n.mute === 'palm') ph = noteAgo < 0.05 ? 'pick/mute2' : 'pick/mute';
      else {
        // legato notes keep the hand where the last picked note left it
        let k = ni;
        while (k > 0 && !notes[k].picked) k--;
        // (the rhythm guitarist and bassist keep the hand nearly still, a small shift between strings; the lead follows the strings)
        const travel = role === 'lead' ? 1 : 0.35;
        const row = (string: number) => (string - (neck.strings - 1) / 2) * neck.spacing * travel;
        if (n.tremolo && t < n.end) {
          ph = pickName(Math.floor((t - n.at) * 2) % 2);
          pdy = row(n.string);
        } else {
          // each picked note a stroke through its string: from one side, through (blurred), and on past
          // it; down and up strokes taking turns (the bass: a finger pulled through the string). Between
          // notes the hand drifts over to the next note's string, ready on the side it strikes from.
          const pn = notes[k], dir = picks[k] ? -1 : 1, u = (t - pn.at) * six;
          const reach = role === 'bass' ? 0.6 : role === 'rhythm' ? 1 : 3;
          let off: number;
          if (u < 0.06) off = -dir * reach + (2 * dir * reach * u) / 0.06;
          else off = dir * reach - dir * reach * 0.6 * Math.min(1, (u - 0.06) / 0.2);
          let at = row(pn.string) + off;
          let kn = k + 1;
          while (kn < notes.length && !notes[kn].picked) kn++;
          const next = notes[kn];
          if (next && next.at > pn.at) {
            const lead = (next.at - t) * six;
            const ready = row(next.string) - (picks[kn] ? -1 : 1) * reach;
            if (lead < 0.14) at += (ready - at) * (1 - lead / 0.14);
          }
          pdy = at;
          ph = role === 'bass' ? pickName(picks[k]) : u >= 0 && u < 0.035 ? (dir > 0 ? 'pick/blurD' : 'pick/blurU') : 'pick/mid';
          if (ph.startsWith('pick/blur')) pdy = row(pn.string);
        }
      }
    }
    const nextNote = notes[ni + 1];
    if (nextNote?.rake && (nextNote.at - t) * six < 0.07) { ph = 'pick/up'; pdy = 0; }
    if (sitting || !ph) {
      ph = role === 'bass' && n && noteAgo < 1.5 ? 'pluck/rest' : 'pick/rest';
      pdy = 0;
    }
    // poses: the pick hand thrown up on a big chord left ringing, in a jump, and at the end
    const hi = lastAt(held, t), h = held[hi];
    // (a character who poses now and then: every other ringing chord)
    const ringing = h && (st.pose >= 1 || hi % 2 === 0) && role !== 'lead' && t > h.at + 0.15 / six && t < h.end - 0.25 / six && (!n || n.at <= h.at + 0.15 / six);
    const posing = !sitting && (ringing || (show.air && role !== 'lead') || show.ending);
    if (posing) { ph = 'pick/high'; pdy = 0; }

    // the face: a guitar face on bends, eyes on the neck after a big shift, nodding along
    const bending = fing.bending;
    const prevNote = notes[ni - 1];
    const shifted = n && prevNote && Math.abs(n.fret - prevNote.fret) >= 5 && noteAgo < 0.4;
    const high = role === 'lead' && n && n.fret >= 12 && noteAgo < (n.end - n.at) * six && (n.end - n.at) * six > 0.4;
    const shout = show.air || show.ending || (posing && e >= 4);
    const pose = bending || high || posing ? 'up' : g.head;
    const eyes = bending || shout ? 'squeeze' : shifted ? 'right' : blinking(sec, seed) ? 'closed' : st.eyes(e);
    const brows = bending ? 'furrow' : st.brows(e);
    const mouth = bending ? 'O' : shout ? st.shout : st.mouth(e);

    // a solo: the lead steps up to the front and lunges; loud sections: the rhythm section steps in
    // toward the drummer, and everyone sways with the beat
    let x = 0;
    if (role === 'lead' && m.section.solo) {
      const inS = (t - m.section.from) * six, outS = (m.section.to - t) * six;
      x = Math.round(-26 * ease(clamp(Math.min(inS, outS) / 0.7, 0, 1)));
    }
    if (role === 'bass' && st.stepIn) x += stepIn(m, 7);
    if (role === 'rhythm' && st.stepIn) x += stepIn(m, 9);
    if (e >= 4 && !m.section.solo) x += (m.beatNo % 2) * st.sway;
    // (an angry player plants their feet wide as soon as the band's in)
    const wideFrom = st.nod === 'bang' && !st.slump ? 3 : 4;
    const legs = show.legs ?? (show.ending ? 'legs/wide' : role === 'lead' && m.section.solo ? 'lunge' : e >= wideFrom ? 'wide' : 'stand');
    const dy = g.dy + show.dy;
    return [
      { a, f: 'hair/back', x, y: dy },
      { a, f: legs.startsWith('legs/') ? legs : `legs/${legs}`, x, y: show.dy },
      { a, f: 'body/idle', x, y: dy },
      ...face(a, pose, eyes, brows, mouth, x, dy),
      { a, f: 'inst/body', x, y: dy },
      ...shaking(a, t, six, role, riff, sitting, notes, strums, holds, x, dy, fing),
      ...drawFingers(a, fing, x, dy),
      { a, f: ph, x, y: dy + pdy },
    ];
  };
}

/**
 * The strings that ring shake: a light line from where each is fretted to the bridge, flickering a
 * pixel up and down and fading as the note dies (an effect drawn by the view, not a sprite). A bent
 * string starts at the raised fingertip.
 */
function shaking(a: Atlas, t: number, six: number, role: Role, riff: boolean, sitting: boolean, notes: FretNote[], strums: Strum[], holds: Hold[], x: number, dy: number, fing: Fingers): Cmd[] {
  const n = a.geo.neck;
  if (!n || sitting) return [];
  const flick = Math.floor(t * six * 28) % 2;
  const out: Cmd[] = [];
  const shake = (string: number, fret: number, life: number, strength = 0.7, lift = 0) => {
    if (life <= 0 || string < 0 || string >= n.strings) return;
    const from = onNeck(n, Math.max(0, fret - 0.35), string);
    const to: [number, number] = [n.bridge[0], n.bridge[1] + (string - (n.strings - 1) / 2) * n.spacing];
    out.push({ line: [x + from[0] + fing.dx, dy + from[1] - lift + flick * 0.6, x + to[0] + 1, dy + to[1] + flick * 0.6], color: '#fff4d0', alpha: strength * life });
  };
  if (role === 'rhythm' && !riff) {
    const s = strums[lastAt(strums, t)];
    const h = holds[lastAt(holds, t)];
    if (s && h) {
      const life = 1 - ((t - s.at) * six) / (s.kind === 'p' || s.kind === 'x' ? 0.12 : 0.4);
      // (half the strings lit each frame, alternating: a shimmer, not a solid band)
      h.frets.forEach((f, k) => { if (f !== null && k % 2 === flick) shake(k, f, life, 0.4); });
    }
  }
  const i = lastAt(notes, t);
  for (let k = i; k >= 0 && k > i - 3; k--) {
    const note = notes[k];
    if (t > note.end) continue;
    const len = Math.max(0.15, (note.end - note.at) * six);
    const life = note.mute === 'palm' ? 1 - ((t - note.at) * six) / 0.1 : 1 - ((t - note.at) * six) / Math.max(len, 0.5) * 0.6;
    shake(note.string, note.fret, life, 0.7, k === i ? (fing.tips[0]?.lift ?? 0) : 0);
    if (note.grip === 'power') shake(note.string + 1, note.fret + 2, life);
  }
  return out;
}

/* ---------------------------------------------------------------- the singer */

export function singerActor(a: Atlas, score: Score, st: Style = STYLES.energetic): Actor {
  const { mouths, sung, lines } = score.vocal;
  const jumps = jumpsFor(score, st), final = score.moves.final;
  return (m) => {
    const { t, six } = m, sec = m.wall, e = m.section.energy;
    if (m.pre) {
      // walking on last, then a wave to the crowd ("hey!") before stepping up to the mic
      const pre = m.pre, w = walking(pre), y = w?.bob ?? 0;
      const wave = pre.wave ? (Math.floor(sec / 0.22) % 2 ? 'up' : 'out') : 'down';
      return [
        { a, f: w?.legs ?? 'legs/stand', x: pre.x, y: 0 },
        { a, f: 'body/idle', x: pre.x, y },
        ...face(a, pre.wave ? 'up' : pre.count < 0.15 || st.slump ? 'down' : 'front', pre.wave ? 'squeeze' : blinking(sec, 1) ? 'closed' : st.eyes(3), pre.wave ? 'raised' : st.brows(3), pre.wave ? (st.nod === 'bar' ? 'smile' : 'A') : st.mouth(3), pre.x, y),
        { a, f: 'stand', x: 0, y: 0 },
        { a, f: 'mic', x: 0, y: 0 },
        { a, f: pre.stride === null && !pre.wave ? 'armA/mic' : 'armA/down', x: pre.x, y },
        { a, f: `armB/${wave}`, x: pre.x, y },
      ];
    }
    const g = groove(m, 0.08, st);
    const show = showOf(jumps, final, t, six);
    const si = lastAt(sung, t);
    const s = sung[si];
    const singing = s && t < s.end;
    const local = s ? (t - s.at) * six : Infinity;
    const li = lastAt(lines, t);
    const line = lines[li], nextLine = lines[li + 1];
    const inLine = line && t < line.end + 0.3 / six;
    const toNext = nextLine ? (nextLine.at - t) * six : Infinity;
    const big = singing && (s.belt || s.peak) && local > 0.1;
    const held = singing && (s.end - s.at) * six > 0.5 && local > 0.2;

    // the mouth: the shape of the sound now, a breath just before a line
    const mi = lastAt(mouths, t);
    let mouth = mi >= 0 && inLine ? mouths[mi].shape : 'rest';
    const breath = toNext < 0.22 && toNext > 0.03;
    if (breath) mouth = 'O';

    // eyes: shut tight on belts and peaks, closed on soft held notes, wide on high stressed notes, a
    // glance at the band between lines
    let eyes = blinking(sec, 1) ? 'closed' : singing ? (e <= 2 ? 'half' : 'open') : st.eyes(e);
    if (big) eyes = e >= 3 ? 'squeeze' : 'closed';
    else if (held && e <= 2) eyes = 'closed';
    else if (singing && s.stress && s.height > 0.75 && e >= 4) eyes = 'wide';
    else if (!inLine && toNext > 1.2) eyes = Math.floor(sec / 1.6) % 3 === 0 ? 'left' : Math.floor(sec / 1.6) % 3 === 1 ? 'right' : eyes;
    const brows = big && e >= 4 ? 'furrow' : singing && s.height > 0.7 && st.brows(e) !== 'furrow' ? 'raised' : e <= 2 && singing ? 'sad' : st.brows(e);
    const finale = show.ending && !singing;
    if (finale || (show.air && !singing)) { eyes = 'squeeze'; mouth = st.shout; }
    // between lines, the character's own face
    if (!inLine && !breath && !finale && !show.air) mouth = st.mouth(e);
    const pose = big || finale ? 'up' : singing && s.stress && local < 0.12 && e >= 4 ? 'down' : inLine ? 'front' : g.head;

    // arms: the mic hand on the mic while singing (and a moment before), the free hand by the music
    const atMic = (inLine || toNext < 1.5) && !(show.air && !singing);
    let free = 'down';
    if (singing && big) free = e >= 4 ? 'up' : 'out';
    else if (held && m.section.kind === 'chorus') free = 'out';
    else if (singing && (e <= 2 || (st.slump && e <= 3))) free = 'chest';
    // loud parts between lines: pumping a fist with the beat (not the cool one); in a jump and at the end, fist up
    else if (!inLine && e >= 4 && st.bounce >= 1) free = m.beat < 0.4 ? 'up' : 'out';
    if (show.air || show.ending) free = 'up';
    const dy = (breath ? -1 : 0) + (inLine ? 0 : g.dy) + show.dy;
    const legs = show.legs ?? (show.ending || e >= 4 ? 'wide' : 'stand');
    return [
      { a, f: `legs/${legs}`, x: 0, y: show.dy },
      { a, f: 'body/idle', x: 0, y: dy },
      ...face(a, pose, eyes, brows, mouth, 0, dy),
      { a, f: 'stand', x: 0, y: 0 },
      { a, f: 'mic', x: 0, y: 0 },
      { a, f: atMic ? 'armA/mic' : 'armA/down', x: 0, y: dy },
      { a, f: `armB/${free}`, x: 0, y: dy },
    ];
  };
}
