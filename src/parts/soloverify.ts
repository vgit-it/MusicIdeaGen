// The solo player's checker (docs/SOLO-PLAYER.md, section 7): judges a performance (events) against the melody it was made from
// (base notes) and the song. It is deliberately independent of the rules that write performances: a rule says what it keeps, this checks.
// What it checks: every melody note still there (its pitch, and by its anchor its start and landing), nothing outside the note's time
// or a gap, in the key, in the guitar's range, no overlaps, no silence over a beat, a speed the hands can play at the tempo, techniques
// that can be played together and that can land, and a fingering for every note.

import type { ChordPart, GuitarHit, Idea, SectionKind, SoloCurve, SoloGap, Song } from '../idea';
import { type Hands, playGuitar2 } from '../players/hands';
import { SCALES } from '../theory';
import { chordTones } from './guitar2';
import { TUNINGS } from '../theory/fretboard';
import { type BaseNote, type PEvent, TOL, endOf, eventsToHits, sounding } from './soloevents';

export interface VCtx {
  song: Song;
  /** The chords: a note may also be a note of the chord under it (a chord from outside the key has its own notes). */
  chords?: ChordPart;
  /** The gaps of the melody (where an added note may sit). */
  gaps: SoloGap[];
  /** For the fingering check. */
  hands: Hands;
  energy: number;
  kind: SectionKind;
  curve?: SoloCurve;
}

export interface Violation {
  code: 'lost' | 'pitch' | 'onset' | 'landing' | 'length' | 'added' | 'key' | 'range' | 'overlap' | 'silence' | 'speed' | 'bend' | 'combo' | 'shape' | 'hands';
  /** Where (in 16ths), for the message. */
  at: number;
  msg: string;
}

/** The quickest the pick can go: 16ths at 250 bpm (60 ms); a hammer-on or pull-off or slide is quicker (40 ms). */
export const MIN_PICK_MS = 60;
export const MIN_LEGATO_MS = 40;

const six = (song: Song) => 15 / song.bpm;
const barAt = (song: Song, g: number) => song.bars.find((b) => g >= b.start && g < b.start + b.len) ?? song.bars[song.bars.length - 1];
/** The beat at a step: the smallest beat group of its bar (as the melody counts it). */
export const beatAt = (song: Song, g: number) => Math.min(...barAt(song, g).groups);

/** Techniques that cannot be played together on one note. */
function combos(h: GuitarHit): string[] {
  const t: string[] = [];
  if (h.bend && !h.unbend) t.push('bend');
  if (h.lateBend) t.push('lateBend');
  if (h.unbend) t.push('unbend');
  if (h.trill) t.push('trill');
  if (h.tremolo) t.push('tremolo');
  if (h.slide) t.push('slide');
  return t;
}
const ALLOWED_PAIRS = new Set(['bend+unbend']);

/** Whether a bend or a let-down can land inside the note (the engine drops it silently otherwise: the note stays at the wrong pitch). */
function bendLands(h: GuitarHit, s6: number): boolean {
  const dur = h.len * s6 * 0.97;
  const end = dur - 0.003;
  if (h.lateBend) {
    const at = h.bendAt !== undefined ? h.bendAt * s6 : Math.max(0.12, Math.min(dur * 0.45, 0.9));
    return at + (0.14 + h.lateBend * 0.04) + 0.05 < end;
  }
  if (h.bend) return 0.05 + h.bend * 0.025 + 0.05 < end;
  return true;
}

export function verify(events: PEvent[], base: BaseNote[], c: VCtx): Violation[] {
  const v: Violation[] = [];
  const { song } = c;
  const s6 = six(song);
  const open = (song.tuning ?? TUNINGS.standard).strings;
  const pcs = new Set((SCALES[song.mode] as readonly number[]).map((p) => (p + song.key) % 12));
  // (the notes of every chord a note sounds over)
  const tl = c.chords?.timeline ?? [];
  const chordMemo = new Map<number, Set<number>>();
  const chordPcs = (e: PEvent) => {
    const out = new Set<number>();
    tl.forEach((ce, k) => {
      const from = ce.step, to = tl[k + 1]?.step ?? song.total;
      if (e.t < to - 1e-6 && endOf(e) > from + 1e-6) {
        if (!chordMemo.has(k)) chordMemo.set(k, new Set(chordTones(song.key, ce.chord)));
        for (const p of chordMemo.get(k)!) out.add(p);
      }
    });
    return out;
  };
  const groups = new Map<number, PEvent[]>();
  for (const e of events) if (e.base !== undefined) (groups.get(e.base) ?? groups.set(e.base, []).get(e.base)!).push(e);

  // the shape of every event, its pitch, and what is added outside the melody
  for (const e of events) {
    const h = e.hit;
    if (!Number.isFinite(e.t) || !Number.isFinite(e.len) || e.len <= 0 || e.t < 0 || e.t >= song.total) v.push({ code: 'shape', at: e.t, msg: `bad time ${e.t} length ${e.len}` });
    if (!(h.vel > 0 && h.vel <= 1.3)) v.push({ code: 'shape', at: e.t, msg: `loudness ${h.vel}` });
    if (!sounding(h)) continue;
    const m = h.notes[0];
    if (m < open[0] || m > open[open.length - 1] + 24) v.push({ code: 'range', at: e.t, msg: `note ${m} is out of the guitar's range` });
    if (!e.out && !pcs.has(((m % 12) + 12) % 12) && !chordPcs(e).has(((m % 12) + 12) % 12)) v.push({ code: 'key', at: e.t, msg: `note ${m} is not in the key` });
    if (e.base === undefined && !c.gaps.some((g) => e.t >= g.step - TOL && endOf(e) <= g.step + g.len + TOL)) v.push({ code: 'added', at: e.t, msg: `an added note at ${e.t} is not in a gap` });
    const tech = combos(h);
    for (let a = 0; a < tech.length; a++) for (let b = a + 1; b < tech.length; b++) if (!ALLOWED_PAIRS.has(`${tech[a]}+${tech[b]}`)) v.push({ code: 'combo', at: e.t, msg: `${tech[a]} with ${tech[b]}` });
    if (!bendLands(h, s6)) v.push({ code: 'bend', at: e.t, msg: `the bend has no time to land (${h.len} steps)` });
  }

  // each melody note: there, and what it keeps
  for (const n of base) {
    const g = groups.get(n.i)?.filter((e) => sounding(e.hit));
    if (!g?.length) { v.push({ code: 'lost', at: n.t, msg: `note ${n.i} (${n.midi}) is gone` }); continue; }
    const time = new Map<number, number>();
    for (const e of g) time.set(e.hit.notes[0], (time.get(e.hit.notes[0]) ?? 0) + e.len);
    const mine = time.get(n.midi) ?? 0;
    if ([...time.values()].some((x) => x > mine + 1e-6)) v.push({ code: 'pitch', at: n.t, msg: `note ${n.i} (${n.midi}) is not the pitch heard most` });
    if (g.some((e) => e.t < n.t - TOL || endOf(e) > n.t + n.len + TOL)) v.push({ code: 'length', at: n.t, msg: `note ${n.i} has sound outside its time` });
    if (n.anchor !== 'pitch' && !g.some((e) => e.hit.notes[0] === n.midi && Math.abs(e.t - n.t) <= TOL)) v.push({ code: 'onset', at: n.t, msg: `note ${n.i} (${n.midi}) does not start on its pitch` });
    if (n.anchor === 'all') {
      const last = g.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
      if (last.hit.notes[0] !== n.midi || Math.abs(endOf(last) - (n.t + n.len)) > TOL) v.push({ code: 'landing', at: n.t, msg: `note ${n.i} (${n.midi}) does not end on its pitch at its end` });
    }
  }

  // the line as heard: no overlaps, no silence over a beat, a speed that can be played
  const line = events.filter((e) => sounding(e.hit)).sort((a, b) => a.t - b.t);
  if (line.length) {
    const first = line[0];
    if (first.t > beatAt(song, 0) + 1e-6) v.push({ code: 'silence', at: 0, msg: `${first.t} steps of silence before the first note` });
  }
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k];
    const gap = b.t - endOf(a);
    if (gap < -TOL) v.push({ code: 'overlap', at: b.t, msg: `a note starts ${(-gap).toFixed(2)} steps before the last one ends` });
    if (gap > beatAt(song, endOf(a)) + 1e-6) v.push({ code: 'silence', at: endOf(a), msg: `${gap.toFixed(2)} steps of silence` });
    const ms = (b.t - a.t) * s6 * 1000;
    const fast = a.hit.tremolo || a.hit.trill || b.hit.tremolo;
    const min = b.hit.art === 'legato' || b.hit.art === 'slide' ? MIN_LEGATO_MS : MIN_PICK_MS;
    if (!fast && ms < min - 1e-6) v.push({ code: 'speed', at: b.t, msg: `${ms.toFixed(0)} ms between two notes` });
  }
  return v;
}

/** The fingering check: the hands' own placement on a copy of the performance. Returns the events that have no place on the neck. */
export function unplayable(events: PEvent[], c: VCtx): PEvent[] {
  const hits = eventsToHits(events).map((h) => { const x = structuredClone(h); delete x.touch; return x; });
  const idea = {
    song: c.song, guitar2: hits, section: { energy: c.energy, kind: c.kind },
    soloCurve: { ...(c.curve ?? { shape: '', pitchC: 0, paceC: 0, energy: [], centre: [], pace: [] }), fine: true },
  } as unknown as Idea;
  playGuitar2(idea, c.hands, (c.song.tuning ?? TUNINGS.standard).strings, 'verify');
  // (the hits come back in time order, as the events do)
  const order = events.map((e, k) => ({ e, k })).sort((a, b) => a.e.t - b.e.t || a.k - b.k).map((x) => x.e);
  const bad: PEvent[] = [];
  hits.forEach((h, i) => {
    if (!sounding(h) || h.notes.length !== 1 || h.letRing || h.swell) return;
    if (!h.touch) bad.push(order[i]);
  });
  return bad;
}

/** A line for the message of a violation. */
export const describe = (v: Violation[]) => v.slice(0, 3).map((x) => `${x.code}@${x.at.toFixed(2)}: ${x.msg}`).join('; ');
