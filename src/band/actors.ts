// The players (docs/BAND-VIEW.md): each one a function of song time that says which sprites to draw,
// where. Nothing is remembered between frames, so the view can start anywhere, jump or loop.
// The moves are read off the score (score.ts): a stick up before a hit, the fretting hand at the real
// fret before the note, the strumming hand swinging through the strings, the singer's mouth per sound.

import { type Atlas, fretFrame } from './atlas';
import { type DrumHit, type FretNote, type Piece, type Score, type SectionSpan, type Strum, lastAt } from './score';

export interface Cmd { a: Atlas; f: string; x: number; y: number; alpha?: number }

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
}

export type Actor = (m: Moment) => Cmd[];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (u: number) => u * u * (3 - 2 * u);

/** Blinks every few seconds, each player at their own time. */
const blinking = (sec: number, seed: number) => (sec + seed * 1.37) % (2.9 + seed * 0.4) < 0.11;

/** Nodding along: the upper body bounces and the head nods on the beat, more in loud sections; head-banging in heavy ones. */
function groove(m: Moment, lag = 0) {
  const p = (m.beat + 1 - lag) % 1, e = m.section.energy;
  const bang = m.heavy && e >= 5;
  const head = bang ? (p < 0.45 ? 'down' : 'front') : e >= 3 && p < 0.16 ? 'down' : 'front';
  const dy = e >= 3 && p < 0.2 ? 1 : 0;
  return { head, dy };
}

function face(a: Atlas, pose: string, eyes: string, brows: string, mouth: string, x: number, y: number): Cmd[] {
  const [fx, fy] = a.geo.poses?.[pose] ?? [0, 0];
  return [
    { a, f: `head/${pose}`, x, y },
    { a, f: `eyes/${eyes}`, x: x + fx, y: y + fy },
    { a, f: `brows/${brows}`, x: x + fx, y: y + fy },
    { a, f: `mouth/${mouth}`, x: x + fx, y: y + fy },
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

export function drummerActor(a: Atlas, score: Score): Actor {
  const { limbs, pieces, hatOpen } = score.drums;
  const ago = (p: Piece, t: number, six: number) => { const l = pieces[p]; const i = lastAt(l, t); return i < 0 ? Infinity : (t - l[i].at) * six; };
  return (m) => {
    const { t, six } = m, sec = t * six;
    const g = groove(m, 0.05);
    const kick = ago('kick', t, six);
    const crash = ago('crash', t, six);
    const dy = (kick < 0.07 ? 1 : 0) + g.dy;
    const out: Cmd[] = [{ a, f: 'body/idle', x: 0, y: dy }];
    const big = crash < 0.35 && m.section.energy >= 4;
    out.push(...face(a, crash < 0.25 ? 'up' : g.head, big ? 'squeeze' : blinking(sec, 3) ? 'closed' : m.section.energy <= 2 ? 'half' : 'open',
      m.section.energy >= 4 ? 'furrow' : 'neutral', big && m.section.energy >= 5 ? 'O' : 'rest', 0, dy));
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

/** The fretting hand on a line of notes: there just before each note, slides, fall-offs, bends, vibrato, trills. */
function fretOnNotes(notes: FretNote[], t: number, six: number, role: Role) {
  const early = 0.06 / six;
  const i = lastAt(notes, t + early);
  const n = notes[i];
  if (!n) return null;
  const local = (t - n.at) * six, len = (n.end - n.at) * six;
  if (local > len + 0.9) return null;
  let fret = n.fret, grip = n.grip, string = n.string, dx = 0;
  if (fret === 0) {
    // an open string: the hand waits where it was
    let k = i - 1;
    while (k >= 0 && notes[k].fret === 0 && i - k < 6) k--;
    return { grip: 'open', fret: k >= 0 && notes[k].fret ? notes[k].fret : 2, string, dx: 0 };
  }
  if (n.from && local >= 0 && local < 0.09) fret = Math.max(0.5, fret - n.from * (1 - local / 0.09));
  if (n.fall && local > len - 0.15) fret = Math.max(0.5, fret - n.fall * clamp((local - (len - 0.15)) / 0.15, 0, 1));
  if (n.bend) grip = local < 0.05 ? 'single' : n.unbend && local > len * 0.6 ? 'single' : 'bend';
  else if (n.unbend) grip = local < len * 0.5 ? 'bend' : 'single';
  if (n.trill && local > 0) fret += Math.floor(local / 0.055) % 2 ? n.trill : 0;
  const vib = n.vib || (role === 'lead' && len > 0.45);
  if (vib && local > 0.15 && local < len) dx = Math.floor(local * 13) % 2;
  return { grip, fret, string, dx };
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
  if (prev && t - prev.at < d) p = end(prev) * ((t - prev.at) / d);
  else if (next && next.at - t < d) p = start(next) * ((next.at - t) / d);
  else if (prev && next) {
    const from = prev.at + d, to = next.at - d;
    const u = to > from ? clamp((t - from) / (to - from), 0, 1) : 1;
    p = end(prev) + (start(next) - end(prev)) * ease(u);
  } else p = prev ? end(prev) : -1;
  return p < -0.45 ? 'pick/up' : p > 0.45 ? 'pick/down' : 'pick/mid';
}

export function guitarActor(a: Atlas, score: Score, role: Role, seed: number): Actor {
  const notes = role === 'bass' ? score.bass : role === 'lead' ? score.lead : score.rhythm.notes;
  const own = notes.filter((n) => !n.onHold);
  const picks = parities(notes, score.six);
  const pickName = (k: number) => (role === 'bass' ? (k ? 'pluck/b' : 'pluck/a') : k ? 'pick/b' : 'pick/a');
  const { strums, holds, out } = score.rhythm;
  return (m) => {
    const { t, six } = m, sec = t * six, e = m.section.energy;
    const g = groove(m, role === 'bass' ? 0.1 : role === 'lead' ? 0.03 : 0);
    const sitting = role === 'rhythm' && out.some(([f, u]) => t >= f && t < u);
    const riff = role === 'rhythm' && !!m.section.riff;

    // the fretting hand
    let fh = role === 'rhythm' && !riff ? null : fretOnNotes(role === 'rhythm' ? own : notes, t, six, role);
    if (role === 'rhythm' && !riff && !sitting) {
      const h = holds[lastAt(holds, t)];
      if (h) fh = { grip: h.grip, fret: h.fret, string: h.string, dx: 0 };
    }
    if (sitting || !fh) fh = { grip: 'open', fret: fh?.fret ?? 3, string: 0, dx: 0 };
    const ff = fretFrame(a, fh.grip, fh.fret, fh.string);

    // the picking hand
    let ph: string | null = null;
    const ni = lastAt(notes, t);
    const n = notes[ni];
    const noteAgo = n ? (t - n.at) * six : Infinity;
    if (role === 'rhythm' && !riff) ph = strumHand(strums, t, six);
    // (picked notes over the chord, when they're newer than the last strum)
    const lastStrum = strums[lastAt(strums, t)];
    if (n && (role !== 'rhythm' || riff || (n.onHold && (!lastStrum || n.at > lastStrum.at))) && noteAgo < (n.end - n.at) * six + 0.6) {
      if (n.mute === 'palm') ph = noteAgo < 0.05 ? 'pick/mute2' : 'pick/mute';
      else if (n.tremolo && t < n.end) ph = pickName(Math.floor((t - n.at) * 2) % 2);
      else {
        // legato notes keep the hand where the last picked note left it
        let k = ni;
        while (k > 0 && !notes[k].picked) k--;
        ph = pickName(picks[k]);
      }
    }
    const nextNote = notes[ni + 1];
    if (nextNote?.rake && (nextNote.at - t) * six < 0.07) ph = 'pick/up';
    if (sitting || !ph) ph = role === 'bass' ? (n && noteAgo < 1.5 ? 'pluck/rest' : 'pick/rest') : 'pick/rest';

    // the face: a guitar face on bends, eyes on the neck after a big shift, nodding along
    const bending = fh.grip === 'bend';
    const prevNote = notes[ni - 1];
    const shifted = n && prevNote && Math.abs(n.fret - prevNote.fret) >= 5 && noteAgo < 0.4;
    const high = role === 'lead' && n && n.fret >= 12 && noteAgo < (n.end - n.at) * six && (n.end - n.at) * six > 0.4;
    const pose = bending || high ? 'up' : g.head;
    const eyes = bending ? 'squeeze' : shifted ? (role === 'lead' ? 'right' : 'right') : blinking(sec, seed) ? 'closed' : e <= 2 ? 'half' : 'open';
    const brows = bending ? 'furrow' : e >= 4 ? 'furrow' : 'neutral';
    const mouth = bending ? 'O' : role === 'rhythm' && e <= 3 ? 'smile' : 'rest';

    // a solo: the lead steps up to the front
    let x = 0;
    if (role === 'lead' && m.section.solo) {
      const inS = (t - m.section.from) * six, outS = (m.section.to - t) * six;
      x = -26 * ease(clamp(Math.min(inS, outS) / 0.7, 0, 1));
    }
    const dy = g.dy;
    const cmds: Cmd[] = [
      { a, f: 'hair/back', x, y: dy },
      { a, f: e >= 4 ? 'legs/wide' : 'legs/stand', x, y: 0 },
      { a, f: 'body/idle', x, y: dy },
      ...face(a, pose, eyes, brows, mouth, x, dy),
      { a, f: 'inst/body', x, y: dy },
    ];
    if (ff) cmds.push({ a, f: ff.name, x: x + ff.dx + fh.dx, y: dy + ff.dy });
    cmds.push({ a, f: ph, x, y: dy });
    return cmds;
  };
}

/* ---------------------------------------------------------------- the singer */

export function singerActor(a: Atlas, score: Score): Actor {
  const { mouths, sung, lines } = score.vocal;
  return (m) => {
    const { t, six } = m, sec = t * six, e = m.section.energy;
    const g = groove(m, 0.08);
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
    let eyes = blinking(sec, 1) ? 'closed' : e <= 2 ? 'half' : 'open';
    if (big) eyes = e >= 3 ? 'squeeze' : 'closed';
    else if (held && e <= 2) eyes = 'closed';
    else if (singing && s.stress && s.height > 0.75 && e >= 4) eyes = 'wide';
    else if (!inLine && toNext > 1.2) eyes = Math.floor(sec / 1.6) % 3 === 0 ? 'left' : Math.floor(sec / 1.6) % 3 === 1 ? 'right' : eyes;
    const brows = big && e >= 4 ? 'furrow' : singing && s.height > 0.7 ? 'raised' : e <= 2 && singing ? 'sad' : 'neutral';
    const pose = big ? 'up' : singing && s.stress && local < 0.12 && e >= 4 ? 'down' : inLine ? 'front' : g.head;

    // arms: the mic hand on the mic while singing (and a moment before), the free hand by the music
    const atMic = inLine || toNext < 1.5;
    let free = 'down';
    if (singing && big) free = e >= 4 ? 'up' : 'out';
    else if (held && m.section.kind === 'chorus') free = 'out';
    else if (singing && e <= 2) free = 'chest';
    const dy = (breath ? -1 : 0) + (inLine ? 0 : g.dy);
    return [
      { a, f: e >= 4 ? 'legs/wide' : 'legs/stand', x: 0, y: 0 },
      { a, f: 'body/idle', x: 0, y: dy },
      ...face(a, pose, eyes, brows, mouth, 0, dy),
      { a, f: 'stand', x: 0, y: 0 },
      { a, f: 'mic', x: 0, y: 0 },
      { a, f: atMic ? 'armA/mic' : 'armA/down', x: 0, y: dy },
      { a, f: `armB/${free}`, x: 0, y: dy },
    ];
  };
}
