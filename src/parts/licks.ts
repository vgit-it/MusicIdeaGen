// The lead players' lick vocabularies (research: docs/LEAD.md, "Each player's style"): what a melodic
// player, a shredder, a raw grunge player, a funk player and a blues player actually play, written over
// the chord (so a lick fits wherever it's put), with the techniques that make each one sound like them:
// big and unison bends, bends let down again, pre-bends, double-stops (sixths, fourths, thirds,
// octaves), trills, tremolo picking, rakes, muted ghost notes.
// A lick is moved to the chord under it, put in the register near the last note played, and has to
// fit: every note in the key (or a chord note, or a passing note the lick means), held notes that
// don't rub against the chord, nothing clashing with the riff, the last note a chord note. Licks are
// also cut down (their first notes left off) to fit a gap, so the same lick doesn't always come out
// the same.

import type { ChordPart, GuitarHit, Song } from '../idea';
import type { LickKind } from '../players/lead';
import type { Rng } from '../rng';
import { type Chord, QUALITIES, SCALES, chordPc } from '../theory';
import type { Tuning } from '../theory/fretboard';
import { chordTones, leadFret } from './guitar2';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export type Speed = 'slow' | 'mid' | 'fast';

/** One note of a lick, parsed. `semi`: the note (as it sounds, after any bend) above the chord's root. */
export interface LibNote {
  pos: number;
  semi: number;
  len: number;
  /** Bent up into it this many semitones. */
  bend?: number;
  /** The bend let down again (with `bend`), or a pre-bend released (without). */
  unbend?: number;
  art?: 'pick' | 'legato' | 'slide';
  /** A second note under it this many semitones (0: a unison bend, 12: an octave); any bend is on the lower note. */
  dyad?: number;
  trill?: number;
  tremolo?: boolean;
  rake?: boolean;
  /** A muted ghost note. */
  dead?: boolean;
  /** A passing note outside the key the lick means (a blue note, a chromatic step). */
  out?: boolean;
  /** Wide vibrato. */
  vib?: boolean;
}

export interface LibLick {
  who: LickKind[];
  speed: Speed;
  /** Over minor chords, major chords, or either. */
  q: 'min' | 'maj' | 'any';
  /** Where it comes from (for the notes). */
  name: string;
  notes: LibNote[];
  span: number;
}

/**
 * Notes as "pos:semi:len:techniques", techniques comma-separated: bN bent up N, rN let down N, pbN
 * pre-bent N and released, h hammered/pulled (legato), s slid, d-N a second note N below (d-0 a unison
 * bend, d-12 an octave), trN trilled N above, trem tremolo picked, rk raked, x ghost, c a passing
 * note outside the key, v wide vibrato.
 */
function lick(who: LickKind[], speed: Speed, q: LibLick['q'], name: string, src: string): LibLick {
  const notes = src.trim().split(/\s+/).map((tok) => {
    const [pos, semi, len, tech = ''] = tok.split(':');
    const n: LibNote = { pos: +pos, semi: +semi, len: +len };
    for (const t of tech.split(',').filter(Boolean)) {
      if (t.startsWith('pb')) n.unbend = +t.slice(2);
      else if (t.startsWith('b')) n.bend = +t.slice(1);
      else if (t.startsWith('r') && t !== 'rk') n.unbend = +t.slice(1);
      else if (t.startsWith('d-')) n.dyad = +t.slice(2);
      else if (t.startsWith('tr') && t !== 'trem') n.trill = +t.slice(2);
      else if (t === 'trem') n.tremolo = true;
      else if (t === 'rk') n.rake = true;
      else if (t === 'h') n.art = 'legato';
      else if (t === 's') n.art = 'slide';
      else if (t === 'x') n.dead = true;
      else if (t === 'c') n.out = true;
      else if (t === 'v') n.vib = true;
    }
    return n;
  });
  return { who, speed, q, name, notes, span: Math.max(...notes.map((n) => n.pos + n.len)) };
}

export const LIBRARY: LibLick[] = [
  // the melodic player (Gilmour, Slash, Knopfler, May): sung notes, big bends, room around them
  lick(['sung'], 'slow', 'min', 'a two-tone overbend', '0:7:6:b4,v 6:5:2 8:3:8:v'),
  lick(['sung', 'simple'], 'slow', 'any', 'a unison bend', '0:7:8:d-0,b2,v 8:5:2:c 10:0:6:v'),
  lick(['sung', 'blues'], 'slow', 'min', 'a bend under a held note', '0:15:8:d-3,b2'),
  lick(['sung'], 'mid', 'min', 'a sung pickup with a slide', '0:7:2:s 2:10:2 4:12:2:h 6:15:10:v'),
  lick(['sung'], 'mid', 'min', 'a pre-bend let down', '0:14:2:pb2 2:12:2:h 4:10:2 6:12:2 8:7:8:b2,v'),
  lick(['sung'], 'mid', 'min', 'a bend let down, home', '0:7:4:b2,r2 4:3:2 6:0:10:v'),
  lick(['sung'], 'fast', 'min', 'a picked cascade', '0:12:1 1:10:1:h 2:7:1 3:10:1 4:7:1:h 5:5:1 6:3:2:h 8:7:6:v'),
  lick(['sung'], 'slow', 'maj', 'a bend up to the third', '0:4:6:b2,v 6:2:2 8:0:8:v'),
  lick(['sung'], 'mid', 'maj', 'sixths sliding down', '0:4:4:d-9,s 4:2:2:d-9 6:0:6:d-8'),
  lick(['sung'], 'mid', 'maj', 'thirds in harmony', '0:11:2:d-4 2:12:2:d-3 4:14:2:d-3 6:16:6:d-4,v'),
  lick(['sung'], 'mid', 'maj', 'a pre-bend let down', '0:9:2:pb2 2:7:2 4:4:2 6:2:2 8:4:8:h,v'),
  lick(['sung'], 'mid', 'maj', 'a sung line with slides', '0:2:2:s 2:4:2 4:7:4:s 8:9:2 10:7:6:v'),
  lick(['sung'], 'fast', 'maj', 'a picked cascade', '0:12:1 1:9:1:h 2:7:1 3:9:1 4:7:1:h 5:4:1 6:2:1:h 7:0:1 8:4:8:v'),

  // the shredder (Hammett, Wylde, Gilbert, Dimebag, Petrucci, Rhoads): sequences, pedal tones, trills, tremolo
  lick(['run'], 'fast', 'min', 'the pentatonic in threes', '0:15:1 1:12:1:h 2:10:1 3:12:1 4:10:1:h 5:7:1 6:10:1 7:7:1:h 8:5:1 9:7:1 10:5:1:h 11:3:1 12:0:4:v'),
  lick(['run'], 'fast', 'maj', 'the pentatonic in threes', '0:16:1 1:14:1:h 2:12:1 3:14:1 4:12:1:h 5:9:1 6:12:1 7:9:1:h 8:7:1 9:9:1 10:7:1:h 11:4:1 12:0:4:v'),
  lick(['run'], 'fast', 'min', 'a pull-off loop', '0:15:1 1:12:1:h 2:10:1:h 3:12:1:h 4:15:1 5:12:1:h 6:10:1:h 7:12:1:h 8:15:1 9:12:1:h 10:10:1:h 11:12:1:h 12:12:4:b2,v'),
  lick(['run'], 'fast', 'min', 'a pedal-tone run', '0:17:1 1:15:1:h 2:12:1:h 3:15:1:h 4:15:1 5:14:1:h 6:12:1:h 7:14:1:h 8:14:1 9:12:1:h 10:10:1:h 11:12:1:h 12:7:4:v'),
  lick(['run'], 'fast', 'min', 'a legato climb in fours', '0:0:1 1:2:1:h 2:3:1:h 3:5:1:h 4:2:1 5:3:1:h 6:5:1:h 7:7:1:h 8:3:1 9:5:1:h 10:7:1:h 11:8:1:h 12:7:4:v'),
  lick(['run'], 'fast', 'any', 'string skipping', '0:3:1 1:7:1 2:5:1 3:10:1 4:7:1 5:12:1 6:10:1 7:15:1 8:12:4:v'),
  lick(['run'], 'fast', 'maj', 'a broken chord, up', '0:4:1 1:7:1 2:10:1 3:13:1 4:16:1 5:19:1 6:16:4:v'),
  lick(['run'], 'fast', 'min', 'chromatic steps down', '0:12:1 1:15:1 2:14:1:h,c 3:13:1:h,c 4:12:1:h 5:10:1 6:9:1:h,c 7:7:1:h 8:7:6:v'),
  lick(['run'], 'mid', 'any', 'tremolo picking', '0:7:4:trem 4:10:4:trem,c 8:12:8:trem'),
  lick(['run', 'blues'], 'mid', 'min', 'trills climbing', '0:12:4:tr3 4:15:4:tr2 8:19:8:v'),
  lick(['run'], 'fast', 'min', 'a harmonic-minor turn', '0:8:1 1:7:1:h 2:8:1:h 3:11:1:c 4:12:1 5:11:1:h,c 6:8:1 7:7:1:h 8:12:8:v'),
  lick(['run'], 'slow', 'any', 'a held bend, then a trill', '0:12:6:b2,v 6:7:6:tr3 12:7:4'),

  // the raw player (Cobain, McCready, Cantrell, Mascis, White): few notes, octaves, slides, a bend or a trill
  lick(['simple'], 'slow', 'min', 'octaves', '0:7:4:d-12 4:10:2:d-12 6:12:10:d-12'),
  lick(['simple'], 'slow', 'maj', 'octaves', '0:7:4:d-12 4:9:2:d-12 6:12:10:d-12'),
  lick(['simple'], 'mid', 'min', 'a bend into the flat fifth', '0:6:2:b1,c 2:5:2 4:3:8:v'),
  lick(['simple'], 'mid', 'min', 'a bend, then a trill', '0:7:4:b2 4:10:4:tr2 8:7:8:v'),
  lick(['simple'], 'fast', 'min', 'a Hendrix flurry', '0:15:1 1:12:1:h 2:10:1 3:12:1:h 4:15:4:b1,c 8:12:8:v'),
  lick(['simple'], 'mid', 'any', 'a slide, falling', '0:12:4:s 4:10:2:c 6:7:2 8:12:8:v'),
  lick(['simple'], 'slow', 'any', 'one note, again', '0:7:2 2:7:2 4:7:2 6:10:2:s,c 8:7:8:v'),
  lick(['simple', 'sung'], 'slow', 'any', 'a unison bend', '0:12:8:d-0,b2,v'),

  // the funk player (Rodgers, Mayfield, Prince, Frusciante, Wong): ghosted 16ths, double-stops, stabs
  lick(['muted'], 'mid', 'maj', 'a ghosted 16th hook', '0:4:1:x 1:7:1 2:4:1:x 3:4:1 4:9:1 5:7:1:x 6:7:1 7:4:2'),
  lick(['muted'], 'mid', 'any', 'a ghosted 16th hook', '0:7:1:x 1:12:1 2:7:1:x 3:10:1:c 4:12:1 5:12:1:x 6:7:2'),
  lick(['muted'], 'mid', 'maj', 'a hammered double-stop', '0:7:1:d-5 1:7:3:d-3,h 4:4:2:d-4'),
  lick(['muted'], 'mid', 'maj', 'sixths, slid into', '0:4:2:d-9,s 3:2:1:d-9 4:0:2:d-8'),
  lick(['muted'], 'mid', 'min', 'parallel fourths', '0:10:1:d-5 1:12:1:d-5 2:12:1:x 3:15:2:d-5'),
  lick(['muted'], 'mid', 'any', 'stabs', '2:7:1:d-3 6:7:1:d-3'),
  lick(['muted'], 'fast', 'min', 'a Dorian 16th line', '0:3:1 1:5:1 2:7:1 3:9:1 4:10:1:h 5:12:3'),
  lick(['muted', 'sung'], 'slow', 'any', 'a raked scream', '0:12:2:rk 2:19:8:b2,v'),

  // the blues player (on top of the blues licks): Albert King's overbends, a bend under a held note,
  // B.B. King's box, Chuck Berry's double-stops
  lick(['blues'], 'slow', 'any', 'an Albert King overbend', '0:7:8:b4,rk,v'),
  lick(['blues'], 'mid', 'min', 'a bend under a held note, picked again', '0:15:4:d-3,b2 4:15:1 5:15:1 6:15:2'),
  lick(['blues'], 'mid', 'maj', "B.B. King's box", '0:16:2:b2 2:12:4:v 6:9:2 8:12:8:v'),
  lick(['blues'], 'mid', 'any', 'Chuck Berry double-stops', '0:12:1:d-5 3:12:1:d-5 6:12:2:d-5 8:12:1:d-5 11:12:1:d-5 14:12:2:d-5'),
  lick(['blues', 'simple'], 'mid', 'any', 'a double-stop bend', '0:12:4:d-5,b2 4:12:4:d-5'),

  // more from lessons (2026-10-16, docs/LEAD.md section 5): blues and classic rock players
  lick(['blues', 'sung'], 'mid', 'min', 'Clapton: the minor third bent to the fourth, home', '0:17:4:b2,v 4:15:2 6:12:2:h 8:10:2 10:12:6:v'),
  lick(['blues'], 'mid', 'min', 'SRV: raked double-stops, down to the root', '0:7:2:d-4,rk 2:7:2:d-4 4:5:2 6:3:2:h 8:0:8:v'),
  lick(['blues'], 'mid', 'min', 'Freddie King: a bend picked again, let down', '0:7:2:b2 2:7:2:b2 4:7:4:b2,r2 8:3:2 10:0:6:v'),
  lick(['blues', 'sung'], 'mid', 'maj', 'Page: minor to major in one lick', '0:3:2:c 2:4:2:h 4:7:2 6:9:2:h 8:12:8:v'),
  lick(['blues', 'run'], 'fast', 'min', 'Angus: a bent note against the next string', '0:7:1:b2 1:10:1 2:7:1:b2 3:10:1 4:7:1:b2 5:10:1 6:7:1:b2 7:10:1 8:12:8:v'),
  lick(['blues', 'sung'], 'slow', 'min', 'Gary Moore: a crying bend let down', '0:17:6:b2,r2,v 6:15:2 8:12:8:v'),
  lick(['sung', 'blues'], 'mid', 'min', 'Slash: one bend, again and again', '0:19:2:b2 2:19:2:b2 4:19:2:b2 6:17:2 8:15:2 10:12:6:v'),

  // melodic players: target notes and enclosures, a pedal-steel bend, Santana, Mayer, The Edge
  lick(['sung', 'run'], 'mid', 'maj', 'an enclosure onto the third', '0:5:2 2:3:2:c 4:4:8:v'),
  lick(['sung', 'run'], 'mid', 'min', 'an enclosure onto the third', '0:5:2 2:2:2 4:3:8:v'),
  lick(['sung'], 'slow', 'maj', 'a pedal-steel bend under a held note', '0:7:8:d-3,b2,v 8:4:8:v'),
  lick(['sung'], 'mid', 'min', 'Santana: a sung Dorian line', '0:7:2 2:9:2:h,c 4:10:4 8:12:2:s 10:14:2 12:15:8:v'),
  lick(['sung', 'blues'], 'mid', 'min', 'Mayer: short notes, laid back', '1:12:1 3:10:1 5:7:2:s 8:10:2:h 10:12:6:v'),
  lick(['sung', 'simple'], 'mid', 'any', 'The Edge: ringing eighths', '0:7:2 2:12:2 4:7:2 6:12:2 8:7:2 10:12:6'),

  // shredders: tapping, neoclassical, Phrygian, sixes
  lick(['run'], 'fast', 'min', 'Van Halen: a tapped arpeggio', '0:19:1 1:12:1:h 2:15:1:h 3:19:1:h 4:12:1:h 5:15:1:h 6:22:1:h 7:15:1:h 8:19:1:h 9:22:1:h 10:15:1:h 11:19:1:h 12:24:4:v'),
  lick(['run'], 'fast', 'min', 'Malmsteen: a harmonic-minor six', '0:15:1 1:14:1 2:12:1 3:11:1:c 4:12:1 5:14:1 6:12:1 7:10:1 8:8:1 9:7:1 10:8:1 11:10:1 12:7:4:v'),
  lick(['run', 'simple'], 'mid', 'min', 'Hammett: a Phrygian trill', '0:12:4:tr1 4:13:2:c 6:12:2 8:7:8:v'),
  lick(['run'], 'fast', 'min', 'Wylde: the pentatonic in sixes', '0:15:1 1:12:1:h 2:10:1:h 3:12:1:h 4:15:1 5:12:1:h 6:12:1 7:10:1:h 8:7:1:h 9:10:1:h 10:12:1 11:10:1:h 12:7:4:b2,v'),

  // the raw player: one string, a fuzzed bend
  lick(['simple'], 'mid', 'min', 'up one string, slid', '0:0:2:s 2:3:2:s 4:5:2:s 6:7:4:s 10:5:2 12:3:4:v'),
  lick(['simple'], 'slow', 'min', 'Mascis: a fuzzed bend, let down', '0:12:8:b2,r2,v 8:10:2 10:7:6:v'),

  // the funk player: octaves, a sparse Dorian line
  lick(['muted'], 'mid', 'any', 'a muted octave line', '0:12:1:d-12 1:12:1:x 2:10:1:d-12,c 3:12:2:d-12 6:7:2:d-12'),
  lick(['muted', 'sung'], 'mid', 'min', 'Frusciante: a sparse Dorian line', '0:7:1 1:9:1:c 2:10:2 4:12:1:x 5:12:3:s'),
];

/** The chances, by player, of a rake into a lick's first bent note, and of using a lick from the library at all. */
export const LICK_HABITS: Record<LickKind, { rake: number; verse: number }> = {
  sung: { rake: 0.2, verse: 0.45 },
  blues: { rake: 0.3, verse: 0.35 },
  run: { rake: 0.1, verse: 0.7 },
  simple: { rake: 0.1, verse: 0.55 },
  muted: { rake: 0.05, verse: 0.7 },
};

/** A placed lick note, with everything it takes to play it. */
export interface PlacedNote {
  step: number;
  midi: number;
  len: number;
  vel: number;
  bend: number;
  unbend?: number;
  art?: 'pick' | 'legato' | 'slide';
  dyad?: number;
  trill?: number;
  tremolo?: boolean;
  rake?: number;
  dead?: boolean;
  vib?: number;
}

/** What a lick has to fit: the key, the chords and the riff. */
export interface LickFit {
  inKey: (m: number) => boolean;
  chordAt: (g: number) => Chord;
  isTone: (m: number, g: number) => boolean;
  /** A held note that rubs (a semitone from a chord note, or the flat 5th). */
  rubs: (m: number, g: number) => boolean;
  clash: (m: number, g: number) => boolean;
}

export function lickFit(song: Song, chords: ChordPart, riff: GuitarHit[] | null): LickFit {
  const { key, mode, total } = song;
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(Math.max(0, g), total - 1)]].chord;
  const isTone = (m: number, g: number) => chordTones(key, chordAt(g)).includes(mod(m, 12));
  return {
    inKey: (m) => (SCALES[mode] as readonly number[]).includes(mod(m - key, 12)),
    chordAt,
    isTone,
    rubs: (m, g) => !isTone(m, g)
      && (chordTones(key, chordAt(g)).some((c) => [1, 11].includes(mod(m - c, 12))) || mod(m - chordPc(key, chordAt(g)), 12) === 6),
    clash: (m, g) => (riff ?? []).some((h) => h.step <= g && g < h.step + h.len && h.mute !== 'dead'
      && h.notes.some((n) => [1, 11].includes(mod(m - n, 12)))),
  };
}

const minorChord = (c: Chord) => (QUALITIES[c.q] as readonly number[]).includes(3) && !(QUALITIES[c.q] as readonly number[]).includes(4);
const majorChord = (c: Chord) => (QUALITIES[c.q] as readonly number[]).includes(4);

/** Licks a player plays at a speed (or any speed), that suit the chord at `g`. */
export function licksFor(who: LickKind, speed: Speed | null, chord: Chord, maxSpan = Infinity): LibLick[] {
  return LIBRARY.filter((l) => l.who.includes(who) && (!speed || l.speed === speed) && l.span <= maxSpan
    && (l.q === 'any' || (l.q === 'min' ? minorChord(chord) : majorChord(chord))));
}

/**
 * A lick placed to end at `end` (its last note held to there), over the chord at its first note, in
 * [lo, hi], starting near `prev`. `close`: the last note on the root (home), on another chord note
 * (open), or any chord note. `from`: notes before this are left off (a lick cut down to fit). Null if
 * it doesn't fit anywhere.
 */
export function placeLibLick(
  rng: Rng, fit: LickFit, key: number, l: LibLick, end: number, lo: number, hi: number, prev: number,
  close: 'home' | 'open' | 'any', who: LickKind, vel: number, from = 0,
): PlacedNote[] | null {
  const notes = l.notes.slice(from);
  if (!notes.length) return null;
  const p0 = notes[0].pos;
  const span = l.span - p0;
  let at = end - span;
  at -= mod(at, 2);
  if (at < 0) return null;
  const step = (n: LibNote) => at + n.pos - p0;
  const root = chordPc(key, fit.chordAt(at));
  let best: { base: number; score: number } | null = null;
  for (let base = root + 12 * Math.floor((lo - 24) / 12); base <= hi; base += 12) {
    const ms = notes.map((n) => base + n.semi);
    if (ms.some((m, i) => m > hi || m - (notes[i].dyad ?? 0) < lo - 7 || m < lo - 2)) continue;
    const ok = notes.every((n, i) => {
      const g = step(n), m = ms[i];
      const notesHere = n.dyad !== undefined ? [m, m - n.dyad] : [m];
      if (notesHere.some((x) => fit.clash(x, g))) return false;
      if (!n.out && !n.dead && notesHere.some((x) => !fit.inKey(x) && !fit.isTone(x, g))) return false;
      // a held note, as it ends up (after a bend let down), mustn't rub
      if (n.len >= 4 && !n.tremolo && !n.trill && fit.rubs(m - (n.unbend ?? 0), g)) return false;
      return true;
    });
    if (!ok) continue;
    const last = notes[notes.length - 1], lm = ms[ms.length - 1] - (last.unbend ?? 0), lg = step(last);
    if (!fit.isTone(lm, lg)) continue;
    if (close === 'home' && mod(lm, 12) !== chordPc(key, fit.chordAt(lg)) && rng.chance(0.6)) continue;
    if (close === 'open' && mod(lm, 12) === chordPc(key, fit.chordAt(lg)) && rng.chance(0.6)) continue;
    const score = Math.abs(ms[0] - prev);
    if (!best || score < best.score) best = { base, score };
  }
  if (!best) return null;
  const hab = LICK_HABITS[who];
  let raked = false;
  return notes.map((n, i) => {
    const last = i === notes.length - 1;
    const len = last ? Math.max(n.len, end - step(n)) : n.len;
    // a rake into the first bent note now and then (or where the lick asks for one)
    const rake = n.rake || (!raked && !!n.bend && n.bend >= 2 && rng.chance(hab.rake)) ? rng.int(2, 3) : undefined;
    if (rake) raked = true;
    return {
      step: step(n), midi: best!.base + n.semi, len, vel: n.dead ? 0.55 : vel + (i === 0 ? 0.04 : 0) + (rng.next() - 0.5) * 0.05,
      bend: n.bend ?? 0, unbend: n.unbend, art: n.art ?? (i === 0 ? 'pick' : undefined), dyad: n.dyad, trill: n.trill,
      tremolo: n.tremolo, rake, dead: n.dead, vib: n.vib && len >= 4 ? 24 : undefined,
    };
  });
}

/** A placed note as Guitar 2 plays it: a double-stop on two neighbouring strings (a sixth or an octave skips one). */
export function placedHit(e: PlacedNote, t: Tuning, pos: number, clean?: boolean): GuitarHit {
  const f = leadFret(e.midi, t, pos);
  const extra = {
    bend: e.bend, unbend: e.unbend, art: e.art, trill: e.trill, tremolo: e.tremolo, rake: e.rake, vib: e.vib,
    mute: e.dead ? ('dead' as const) : undefined, clean,
  };
  if (e.dyad === undefined) return { step: e.step, ...f, len: e.len, vel: e.vel, ...extra };
  const low = e.midi - e.dyad;
  let top = f.strings[0];
  const skip = e.dyad >= 8 ? 2 : 1;
  // the lower note on a lower string, both within reach
  for (const s of [top, top + 1, top - 1, top + 2]) {
    const ls = s - skip;
    if (s > 5 || ls < 0) continue;
    const ft = e.midi - t.strings[s], fl = low - t.strings[ls];
    if (ft >= 0 && fl >= 0 && ft <= 20 && fl <= 20 && Math.abs(ft - fl) <= 4) { top = s; break; }
  }
  const ls = Math.max(0, top - skip);
  return { step: e.step, notes: [low, e.midi], strings: [ls, top], len: e.len, vel: e.vel, ...extra };
}
