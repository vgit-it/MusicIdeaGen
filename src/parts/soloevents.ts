// The solo player's score (docs/SOLO-PLAYER.md, step 1): the melody read as notes with an identity, and a performance as a list of
// timed events that can sit between the 16ths. The player rewrites events; the checker (soloverify.ts) judges the result.

import { type GuitarHit, type SoloCurve, hitTime } from '../idea';

/** Events sit on a grid of 1/12 of a 16th: thirds (triplets), halves (32nds) and quarters all land exactly. */
export const GRID = 12;
export const snap = (t: number) => Math.round(t * GRID) / GRID;
/** One grid step: the slack allowed on a time that should match another. */
export const TOL = 1 / GRID + 1e-6;
const EPS = 1e-6;

/**
 * One note as played: when it starts and how long it is (in 16ths, fractions allowed) and everything the hands and the engine need
 * (`hit`: the pitch, the loudness and the techniques; its own step, shift and length are set from `t` and `len` when it is written back).
 */
export interface PEvent {
  t: number;
  len: number;
  hit: GuitarHit;
  /** The melody note this event is a way of playing (its `i`). Missing: an addition in a gap, or a muted scratch. */
  base?: number;
  /** A passing note outside the key (a blue or chromatic note on a weak spot): the key check lets it be. */
  out?: boolean;
}

/**
 * How much of a note a rewrite must keep (the strongest first): `all`: its pitch, its start and its landing at the end (the climax, the
 * end of a phrase, the last note); `main`: its pitch and its start (a long note); `pitch`: its pitch (a short or passing note).
 */
export type Anchor = 'all' | 'main' | 'pitch';
export const ANCHOR_RANK: Record<Anchor, number> = { all: 3, main: 2, pitch: 1 };

/** A note of the melody, with what makes it that note. */
export interface BaseNote {
  /** Its place among the melody's sounding notes. */
  i: number;
  t: number;
  len: number;
  /** The pitch it sounds (a note bent up into is the pitch it arrives on). */
  midi: number;
  /** Its phrase role when it ends a phrase (`call`, `answer`, `climax`, `end`), else ''. */
  role: string;
  anchor: Anchor;
  /** Left as written: the last note is carried into the next section and bent (track.ts, `carrySolo`), which knows one hit only. */
  frozen: boolean;
  /** Where it is in the event list. */
  ev: number;
}

export const sounding = (h: GuitarHit) => !h.mute && h.notes.length > 0;

/** A long note is one of a beat or more (4 steps); a note that ends a phrase on the climax or at the end, and the last note, keep all of it. */
const LONG = 4;

/** The melody as events (every hit, in time order), and its sounding notes with their anchors. */
export function readBase(hits: GuitarHit[], curve?: SoloCurve): { events: PEvent[]; notes: BaseNote[] } {
  const events: PEvent[] = [...hits].sort((a, b) => hitTime(a) - hitTime(b)).map((hit) => ({ t: hitTime(hit), len: hit.len, hit }));
  const notes: BaseNote[] = [];
  const lastIx = events.reduce((m, e, k) => (sounding(e.hit) ? k : m), -1);
  events.forEach((e, k) => {
    if (!sounding(e.hit)) return;
    const landing = curve?.landings?.find((l) => l.step === e.hit.step && l.midi === e.hit.notes[0]);
    const role = landing?.role ?? '';
    const anchor: Anchor = k === lastIx || role === 'climax' || role === 'end' ? 'all' : e.hit.len >= LONG ? 'main' : 'pitch';
    e.base = notes.length;
    notes.push({ i: notes.length, t: e.t, len: e.len, midi: e.hit.notes[0], role, anchor, frozen: k === lastIx, ev: k });
  });
  return { events, notes };
}

/** The events back as hits, in time order: the step, the part of a step it is late by, the length. A hit nobody touched comes back as it was. */
export function eventsToHits(events: PEvent[]): GuitarHit[] {
  return events
    .map((e, k) => ({ e, k }))
    .sort((a, b) => a.e.t - b.e.t || a.k - b.k)
    .map(({ e }) => {
      const h = e.hit;
      if (e.t === hitTime(h) && e.len === h.len) return h;
      const step = Math.floor(e.t + EPS);
      const late = e.t - step;
      const out: GuitarHit = { ...h, step, len: e.len };
      if (late > EPS) out.shift = Math.abs(late * GRID - Math.round(late * GRID)) < 1e-6 ? Math.round(late * GRID) / GRID : late;
      else delete out.shift;
      return out;
    });
}

/** The end of an event. */
export const endOf = (e: PEvent) => e.t + e.len;
