// The score for the eyes (docs/BAND-VIEW.md): a whole track turned into what each player does and
// when, before it plays. Times are in song steps (16ths from the top of the track, fractions for each
// player's feel), so the view can find any moment by the audio clock. Pure: the same track, the same score.

import type { GuitarHit, Idea, SectionKind, Touch } from '../idea';
import type { Vowel, Cons } from '../parts/lyrics';
import { type GuitarVoicing, guitarVoicings } from '../theory/guitar';
import { TUNINGS } from '../theory/fretboard';

export type Piece = 'kick' | 'snare' | 'hat' | 'ride' | 'crash' | 'tom1' | 'tom2' | 'tom3';
/** The drummer's limbs: A = right hand (screen left), B = left hand, then the feet. */
export type Limb = 'A' | 'B' | 'kick' | 'hatFoot';

export interface DrumHit { at: number; piece: Piece; vel: number; open?: boolean }

/** A fretted note (bass, lead, riffs, picked notes). */
export interface FretNote {
  at: number;
  end: number;
  string: number;
  fret: number;
  /** Picked (the pick hand moves) or reached by the fretting hand alone. */
  picked: boolean;
  grip: Grip;
  /** Bent up from this many semitones below; let down again by `unbend`. */
  bend?: number;
  unbend?: number;
  vib?: number;
  /** Slides in from so many frets away; falls off at the end. */
  from?: number;
  fall?: number;
  trill?: number;
  tremolo?: boolean;
  mute?: 'palm' | 'dead';
  rake?: number;
  /** Picked over the chord the rhythm guitarist holds (the fretting hand stays on the shape). */
  onHold?: boolean;
}

export type Grip = 'single' | 'bend' | 'open' | 'chord' | 'barre' | 'power' | 'mute';

/** A chord shape held by the rhythm guitarist from `at`. */
export interface Hold { at: number; grip: Grip; fret: number; string: number; frets: (number | null)[] }

export interface Strum { at: number; dir: 'D' | 'U'; kind: 'D' | 'U' | 'x' | 'p'; vel: number }

/** One mouth shape from `at`. */
export interface Mouth { at: number; shape: string }
export interface Sung {
  at: number;
  end: number;
  midi: number;
  vel: number;
  stress: boolean;
  belt: boolean;
  peak: boolean;
  /** Where it sits in its line's range (0 low, 1 the top). */
  height: number;
  text: string;
  line: number;
}
export interface Line { at: number; end: number; text: string; syls: { at: number; text: string; space: boolean }[] }

export interface SectionSpan { from: number; to: number; kind: SectionKind; label: string; energy: number; solo: boolean; tension: number[]; bars: number[]; riff: boolean; ending: boolean }

export interface Score {
  steps: number;
  /** Seconds per step (the track's tempo). */
  six: number;
  sections: SectionSpan[];
  /** Step of every beat (for nodding along), and of every bar. */
  beats: number[];
  bars: number[];
  drums: { limbs: Record<Limb, DrumHit[]>; pieces: Record<Piece, DrumHit[]>; hatOpen: [number, number][] };
  bass: FretNote[];
  lead: FretNote[];
  rhythm: { strums: Strum[]; holds: Hold[]; notes: FretNote[]; out: [number, number][] };
  vocal: { mouths: Mouth[]; sung: Sung[]; lines: Line[] };
  tuning: number[];
  bassTuning: number[];
  /** Moments the band shows off: jumps into big sections, the final hit (held as an ending pose), long held chords. */
  moves: { jumps: number[]; final: number | null; held: { at: number; end: number }[] };
}

const ms = (v: number | undefined, six: number) => (v ?? 0) / 1000 / six;

/* ---------------------------------------------------------------- drums */

const CYMBAL: Piece[] = ['crash', 'ride', 'hat'];

function drumsOf(sections: Idea[], offs: number[], six: number): Score['drums'] {
  const limbs: Record<Limb, DrumHit[]> = { A: [], B: [], kick: [], hatFoot: [] };
  const pieces = { kick: [], snare: [], hat: [], ride: [], crash: [], tom1: [], tom2: [], tom3: [] } as Record<Piece, DrumHit[]>;
  const hatOpen: [number, number][] = [];
  let lastFillHand: 'A' | 'B' = 'B';
  let openFrom = -1;
  sections.forEach((idea, si) => {
    const d = idea.drums, base = offs[si];
    const inFill = new Set<number>();
    // (a fill is the last `len` steps of its bar)
    for (const f of d.fills) {
      const bar = idea.song.bars[f.bar];
      if (!bar) continue;
      for (let g = bar.start + Math.max(0, bar.len - f.len); g < bar.start + bar.len; g++) inFill.add(g);
    }
    for (let g = 0; g < idea.song.total; g++) {
      const snareAt = base + g + ms(d.feel?.snare, six), cymAt = base + g + ms(d.feel?.cym, six), at = base + g;
      const wants: DrumHit[] = [];
      if (d.crash[g]) wants.push({ at: cymAt, piece: 'crash', vel: d.crash[g] });
      if (d.ride[g]) wants.push({ at: cymAt, piece: 'ride', vel: d.ride[g] });
      if (d.hatOpen[g]) wants.push({ at: cymAt, piece: 'hat', vel: d.hatOpen[g], open: true });
      else if (d.hat[g]) wants.push({ at: cymAt, piece: 'hat', vel: d.hat[g] });
      if (d.snare[g]) wants.push({ at: snareAt, piece: 'snare', vel: d.snare[g] });
      if (d.tom[g]) wants.push({ at: snareAt, piece: (['tom1', 'tom2', 'tom3'] as Piece[])[Math.min(2, Math.max(0, Math.round(d.tom[g]) - 1))], vel: 0.85 });
      if (d.kick[g]) { const h = { at, piece: 'kick' as Piece, vel: d.kick[g] }; limbs.kick.push(h); pieces.kick.push(h); }
      // the hi-hat foot: open from an open hat until the next closed one
      const open = wants.find((w) => w.piece === 'hat' && w.open);
      const closed = wants.find((w) => w.piece === 'hat' && !w.open);
      if (open && openFrom < 0) openFrom = open.at;
      if (closed && openFrom >= 0) { hatOpen.push([openFrom, closed.at]); limbs.hatFoot.push({ at: closed.at, piece: 'hat', vel: 0.5 }); openFrom = -1; }
      // two hands: cymbals to the right hand, drums to the left; fills alternate; a third hit is dropped
      const drums = wants.filter((w) => !CYMBAL.includes(w.piece));
      const cyms = wants.filter((w) => CYMBAL.includes(w.piece));
      const hands: Partial<Record<'A' | 'B', DrumHit>> = {};
      if (cyms.length) hands.A = cyms.find((c) => c.piece === 'crash') ?? cyms.find((c) => c.piece === 'ride') ?? cyms[0];
      if (cyms.length > 1 && !drums.length) hands.B = cyms.find((c) => c !== hands.A && c.piece === 'crash') ?? undefined;
      if (drums.length === 1) {
        const h = drums[0];
        if (inFill.has(g) && !hands.A) {
          // single strokes round the kit: the hands take turns (the floor tom by the right hand)
          const hand = h.piece === 'tom3' ? 'A' : lastFillHand === 'A' ? 'B' : 'A';
          hands[hand] = h; lastFillHand = hand;
        } else if (!hands.B) hands.B = h;
        else hands.A ??= h;
      } else if (drums.length >= 2) {
        // two drums at once: the one further screen-left for the right hand
        const order: Piece[] = ['tom3', 'tom2', 'tom1', 'snare'];
        drums.sort((a, b) => order.indexOf(a.piece) - order.indexOf(b.piece));
        if (!hands.A) { hands.A = drums[0]; hands.B = drums[1]; } else hands.B = drums[drums.length - 1];
      }
      for (const side of ['A', 'B'] as const) { const h = hands[side]; if (h) { limbs[side].push(h); pieces[h.piece].push(h); } }
    }
  });
  if (openFrom >= 0) hatOpen.push([openFrom, Infinity]);
  for (const l of Object.values(limbs)) l.sort((a, b) => a.at - b.at);
  for (const l of Object.values(pieces)) l.sort((a, b) => a.at - b.at);
  return { limbs, pieces, hatOpen };
}

/* ---------------------------------------------------------------- frets */

/** Where a note sits on the neck if the hands pass left none: the lowest fret on the highest string that reaches it. */
function place(midi: number, open: number[]): { string: number; fret: number } {
  for (let s = open.length - 1; s >= 0; s--) { const f = midi - open[s]; if (f >= 0 && f <= 12) return { string: s, fret: f }; }
  const f = midi - open[0];
  return { string: 0, fret: Math.max(0, f) };
}

function noteOf(at: number, end: number, midi: number, touch: Touch | undefined, open: number[], fallbackString?: number): FretNote {
  const spot = touch ? { string: touch.string, fret: touch.fret }
    : fallbackString !== undefined && midi - open[fallbackString] >= 0 ? { string: fallbackString, fret: midi - open[fallbackString] } : place(midi, open);
  return {
    at, end, string: spot.string, fret: spot.fret, picked: !touch || touch.move === 'pick', grip: spot.fret === 0 ? 'open' : 'single',
    bend: touch?.bend, vib: touch?.vib, from: touch?.from, fall: touch?.fall,
  };
}

function hitNotes(hits: GuitarHit[], base: number, shift: number, open: number[], total: number): FretNote[] {
  const sorted = [...hits].sort((a, b) => a.step - b.step);
  return sorted.map((h, i) => {
    const next = sorted[i + 1];
    const at = base + h.step + shift;
    // (held through a short rest into the next note, as the engine plays it)
    const gap = (next ? next.step : total) - h.step;
    const len = !h.mute && gap > h.len && gap - h.len <= 2 ? gap : h.len;
    const n = noteOf(at, at + len, h.notes[0], h.touch, open, h.strings[0]);
    const octave = h.notes.length === 2 && h.notes[1] - h.notes[0] === 12;
    if (h.notes.length >= 2) n.grip = octave || h.notes.length === 2 || h.notes.length === 3 && h.notes[1] - h.notes[0] === 7 ? 'power' : 'chord';
    if (h.mute === 'dead') n.grip = 'mute';
    if (h.art === 'legato' || h.art === 'slide') n.picked = !!h.touch && h.touch.move === 'pick';
    if (h.slide && !n.from) n.from = -h.slide;
    if (h.bend) n.bend = h.bend;
    if (n.bend && n.grip === 'single') n.grip = 'bend';
    n.unbend = h.unbend; n.trill = h.trill; n.tremolo = h.tremolo; n.mute = h.mute; n.rake = h.rake;
    if (h.vib !== undefined) n.vib = h.vib;
    return n;
  });
}

/** How a chord shape is held: a barre, a power chord, an open chord (and where). */
export function gripOf(frets: (number | null)[], capo = 0): Omit<Hold, 'at'> {
  const played = frets.map((f, s) => ({ f, s })).filter((x): x is { f: number; s: number } => x.f !== null);
  const fretted = played.filter((x) => x.f > capo);
  if (!fretted.length) return { grip: 'open', fret: Math.max(capo, 1), string: 0, frets };
  const min = Math.min(...fretted.map((x) => x.f));
  const first = played[0];
  if (played.length <= 3 && played.every((x) => x.f >= min) && (played[1]?.f ?? 0) - first.f === 2) return { grip: 'power', fret: first.f, string: first.s, frets };
  const atMin = fretted.filter((x) => x.f === min).length;
  if (fretted.length === played.length && atMin >= 2 && min > 0) return { grip: 'barre', fret: min, string: first.s, frets };
  return { grip: 'chord', fret: Math.max(1, min), string: first.s, frets };
}

/* ---------------------------------------------------------------- the singer */

const VOWEL: Record<Vowel, string[]> = {
  IY: ['I'], IH: ['E'], EY: ['E', 'I'], EH: ['E'], AE: ['A'], AA: ['A'], AO: ['O'], OW: ['O', 'U'], UH: ['U'], UW: ['U'],
  AH: ['A'], AX: ['E'], AY: ['A', 'I'], AW: ['A', 'U'], OY: ['O', 'I'], ER: ['E', 'U'],
};
const CONS: Partial<Record<Cons, string>> = {
  P: 'M', B: 'M', M: 'M', F: 'F', V: 'F', W: 'U', R: 'U', S: 'S', Z: 'S', SH: 'S', CH: 'S', JH: 'S', T: 'S', D: 'S', N: 'E', TH: 'E', DH: 'E', L: 'E', K: 'E', G: 'E', NG: 'E', Y: 'I',
};

function vocalOf(sections: Idea[], offs: number[], six: number): Score['vocal'] {
  const mouths: Mouth[] = [], sung: Sung[] = [], lines: Line[] = [];
  sections.forEach((idea, si) => {
    const notes = [...(idea.vocal ?? [])].sort((a, b) => a.step - b.step);
    const lay = (idea.vocalLay ?? 0) / six;
    // lines: from a note marked as a line start (or after a gap of a bar) to the next
    const groups: (typeof notes)[] = [];
    notes.forEach((n, i) => {
      const prev = notes[i - 1];
      if (!groups.length || n.start || (prev && n.step - (prev.step + prev.len) >= 12)) groups.push([]);
      groups[groups.length - 1].push(n);
    });
    for (const g of groups) {
      const lo = Math.min(...g.map((n) => n.midi)), hi = Math.max(...g.map((n) => n.midi));
      const line = lines.length;
      const L: Line = { at: offs[si] + g[0].step + lay, end: 0, text: '', syls: [] };
      g.forEach((n, i) => {
        const at = offs[si] + n.step + lay, end = at + n.len;
        const next = g[i + 1];
        // the mouth shuts at the end of a note unless the next comes right after (sung legato)
        const until = next && offs[si] + next.step + lay - end < 0.5 ? offs[si] + next.step + lay : end;
        sung.push({ at, end, midi: n.midi, vel: n.vel, stress: n.syl.stress, belt: !!n.belt, peak: !!n.peak, height: hi > lo ? (n.midi - lo) / (hi - lo) : 0.5, text: n.syl.text, line });
        L.syls.push({ at, text: n.syl.text, space: n.syl.wordStart && i > 0 });
        // consonants at the edges (a step's share each, at most), the vowel through the middle, diphthongs moving late
        const dur = until - at;
        const c = Math.min(0.5, dur * 0.2);
        const vow = VOWEL[n.syl.vowel] ?? ['A'];
        const big = n.belt || n.peak || (n.vel > 0.85 && n.len >= 4);
        const open = (s: string) => (big && (s === 'A' || s === 'O') ? `${s}+` : s);
        let t = at;
        const onset = n.syl.onset.map((x) => CONS[x]).filter(Boolean) as string[];
        if (onset.length) { mouths.push({ at: t, shape: onset[0] }); t += c; }
        mouths.push({ at: t, shape: open(vow[0]) });
        const coda = n.syl.coda.map((x) => CONS[x]).filter(Boolean) as string[];
        const codaAt = until - (coda.length ? c : 0);
        if (vow[1]) mouths.push({ at: t + (codaAt - t) * 0.65, shape: vow[1] });
        if (coda.length) mouths.push({ at: codaAt, shape: coda[coda.length - 1] });
        mouths.push({ at: until, shape: 'rest' });
      });
      L.end = sung[sung.length - 1].end;
      L.text = g.map((n, i) => (n.syl.wordStart && i > 0 ? ' ' : '') + n.syl.text).join('');
      lines.push(L);
    }
  });
  mouths.sort((a, b) => a.at - b.at);
  return { mouths, sung, lines };
}

/* ---------------------------------------------------------------- the whole score */

/**
 * `shapesFor`: the chord shapes the rhythm guitar's sound uses for a section (the engine's own), or
 * null to work them out here.
 */
export function buildScore(sections: Idea[], shapesFor: (idea: Idea) => GuitarVoicing[] | null = () => null): Score {
  const song0 = sections[0].song;
  const six = 15 / song0.bpm;
  const offs: number[] = [];
  let steps = 0;
  for (const s of sections) { offs.push(steps); steps += s.song.total; }
  const tuning = (song0.tuning ?? TUNINGS.standard).strings;
  const bassTuning = tuning.slice(0, 4).map((n) => n - 12);

  const spans: SectionSpan[] = sections.map((idea, i) => ({
    from: offs[i], to: offs[i] + idea.song.total, kind: idea.section?.kind ?? 'verse', label: idea.section?.label ?? 'Idea',
    energy: idea.section?.energy ?? 4, solo: !!idea.section?.solo, tension: idea.section?.tension ?? [], bars: idea.song.bars.map((b) => offs[i] + b.start), riff: !!idea.guitar, ending: !!idea.section?.ending,
  }));
  const beats: number[] = [], bars: number[] = [];
  sections.forEach((idea, i) => {
    for (const b of idea.song.bars) {
      bars.push(offs[i] + b.start);
      let g = b.start;
      for (const len of b.groups) { beats.push(offs[i] + g); g += len; }
    }
  });

  // the bassist
  const bass: FretNote[] = [];
  sections.forEach((idea, si) => {
    const at: number[] = [];
    for (let g = 0; g < idea.song.total; g++) if (idea.bass[g]) at.push(g);
    const feel = ms(idea.bassFeel, six);
    at.forEach((g, i) => {
      const next = at[i + 1] ?? idea.song.total;
      const len = idea.bassLen?.[g] || next - g;
      bass.push(noteOf(offs[si] + g + feel, offs[si] + g + feel + len, idea.bass[g], idea.bassTouch?.[g], bassTuning));
    });
  });

  // the lead: Guitar 2
  const lead = sections.flatMap((idea, si) => hitNotes(idea.guitar2, offs[si], ms(idea.g2Feel, six), tuning, idea.song.total));

  // the rhythm guitarist: strums with the shapes held, or a riff
  const strums: Strum[] = [], holds: Hold[] = [], rnotes: FretNote[] = [], out: [number, number][] = [];
  sections.forEach((idea, si) => {
    const base = offs[si];
    if (idea.guitarOut) out.push([base + idea.guitarOut.from, base + idea.guitarOut.until]);
    if (idea.guitar) {
      const notes = hitNotes(idea.guitar, base, 0, tuning, idea.song.total);
      notes.forEach((n, i) => { const g = idea.guitar![i]?.step ?? 0; n.at += ms(idea.rhythmTime?.[g], six); });
      rnotes.push(...notes);
      return;
    }
    const chords = idea.chords.timeline.map((e) => e.chord);
    const shapes = shapesFor(idea) ?? guitarVoicings(idea.song.key, chords, { ...idea.shapes });
    const capo = idea.shapes?.capo ?? 0;
    let lastIdx = -1;
    let pendulum = 0;
    // 16th strumming if any odd step strums in the section, else 8ths (down on the beat, up on the "and")
    const sixteenths = idea.strum.some((s, g) => g % 2 === 1 && s !== '.');
    for (let g = 0; g < idea.song.total; g++) {
      const ci = idea.chords.chordIdx[g];
      if (ci !== lastIdx && shapes[ci]) {
        // the hand gets to the new shape just before the change
        holds.push({ at: base + g - 0.35, ...gripOf(shapes[ci].frets, capo) });
        lastIdx = ci;
      }
      const s = idea.strum[g];
      if (s === '.') continue;
      const at = base + g + ms((idea.rhythmTime?.[g] ?? 0) + (idea.strumFeel ?? 0), six);
      pendulum = sixteenths ? g % 2 : (g % 4 < 2 ? 0 : 1);
      const dir = s === 'U' ? 'U' : s === 'D' ? 'D' : pendulum ? 'U' : 'D';
      strums.push({ at, dir, kind: s, vel: (idea.strumVel?.[g] ?? 1) * (idea.strumGain ?? 1) });
      if (idea.changeTouch?.[g + 1]?.open || idea.changeTouch?.[g + 2]?.open) holds.push({ at: at - 0.1, grip: 'open', fret: holds[holds.length - 1]?.fret ?? 1, string: 0, frets: [] });
    }
    if (idea.rhythmPick?.length) rnotes.push(...hitNotes(idea.rhythmPick, base, ms(idea.strumFeel, six), tuning, idea.song.total).map((n) => ({ ...n, onHold: true })));
  });
  holds.sort((a, b) => a.at - b.at);
  rnotes.sort((a, b) => a.at - b.at);

  // the band jumps into a big section (louder than the one before, or into a chorus) and on the final hit
  const jumps: number[] = [];
  spans.forEach((x, i) => {
    const prev = spans[i - 1];
    if (prev && x.energy >= 4 && (x.energy > prev.energy || (x.kind === 'chorus' && prev.kind !== 'chorus'))) jumps.push(x.from);
  });
  const last = spans[spans.length - 1];
  const final = last.ending ? last.bars[last.bars.length - 1] : null;
  if (final !== null) jumps.push(final);
  // a chord left ringing a while in a loud part: time to strike a pose
  const held: { at: number; end: number }[] = [];
  strums.forEach((x, i) => {
    const next = strums[i + 1];
    const sec = spans.find((y) => x.at >= y.from && x.at < y.to);
    const gap = ((next?.at ?? steps) - x.at) * six;
    // (not when the gap is filled with picked notes: the hand is busy picking, not posing)
    const picking = rnotes.some((n) => n.onHold && n.at > x.at + 0.05 && n.at < x.at + gap / six);
    if (sec && sec.energy >= 3 && gap > 1.1 && x.kind !== 'p' && !picking) held.push({ at: x.at, end: x.at + gap / six });
  });
  // (riffs: a chord of the riff left ringing)
  for (const n of rnotes) {
    if (n.onHold || n.mute || n.grip === 'single') continue;
    const sec = spans.find((y) => n.at >= y.from && n.at < y.to);
    if (sec && sec.energy >= 4 && (n.end - n.at) * six > 1.5) held.push({ at: n.at, end: n.end });
  }
  held.sort((a, b) => a.at - b.at);

  return {
    steps, six, sections: spans, beats, bars, moves: { jumps, final, held },
    drums: drumsOf(sections, offs, six),
    bass, lead, rhythm: { strums, holds, notes: rnotes, out },
    vocal: vocalOf(sections, offs, six),
    tuning, bassTuning,
  };
}

/* ---------------------------------------------------------------- finding things in time */

/** The index of the last item at or before `t` (-1 if none). Items sorted by `at`. */
export function lastAt<T extends { at: number }>(list: T[], t: number): number {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].at <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}
