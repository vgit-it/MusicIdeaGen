// The bass-led vocal (docs/VOCAL-BASS.md): the verse writer starts from the bass line instead of a plain 8th-note grid. The bass gives the
// line its first notes' rhythm (where they start, and how long they last until the next one) and leans the chord note each bar sits on
// toward the one the bass is playing. Every other rule then runs on top as it always does (phrases and breaks, runs, holds, endings,
// mood notes, longer notes, sets...) and wins wherever it disagrees: the bass is the start of the line, never its last word.
// Pure: the same bass and seed give the same notes.

import type { Chord } from '../theory';
import { nearest, pickPc, roll, verseOverBand, type BandNote, type ChordNote, type Gap, type ToneBias } from './verse';

/** What the vocal takes from a bass line: where its notes start, and which chord note (root, 3rd, 5th) of the chord it is playing on each step. */
export interface BassSkel {
  on: boolean[];
  tone: (ChordNote | undefined)[];
}

const NOTES: ChordNote[] = ['root', 'third', 'fifth'];

/**
 * The bass line (a MIDI note on each 16th step it starts, 0 for none) as the vocal reads it. The chord note is the bass's pitch class
 * against the chord sounding on that step; a bass note that is none of the three (an approach note, a riff's chromatic note) says nothing.
 */
export function bassSkeleton(bass: readonly number[], chordAt: readonly Chord[], key: number): BassSkel {
  const on: boolean[] = [], tone: (ChordNote | undefined)[] = [];
  let sounding = 0;
  for (let s = 0; s < chordAt.length; s++) {
    const m = bass[s] ?? 0;
    on.push(m > 0);
    if (m > 0) sounding = m;
    tone.push(sounding ? NOTES.find((t) => pickPc(key, chordAt[s], t) === ((sounding % 12) + 12) % 12) : undefined);
  }
  return { on, tone };
}

/** The bass-led vocal as one section is built with it: how much of the line is the bass's (0-1) and what it plays on each step of the leaf. */
export interface BassLead { share: number; on: boolean[]; tone: (ChordNote | undefined)[] }

/** The slider (the card): 0-100%, stored as `vocalBassShare` (nothing: the default). */
export const BASS_SHARE_DEFAULT = 70;
export const bassShareOf = (writer?: string, stored?: number): number => (writer === 'bass' ? (stored ?? BASS_SHARE_DEFAULT) / 100 : 0);

/** How hard a bass note counts among the band's hits when the vocal is bass-led (the usual vocal: 0.15). */
export const BASS_ACCENT = 0.45;

/**
 * The line's first notes, an 8th at a time. A step starts a note where the bass starts one (a 16th off the 8th snaps down to it), and
 * elsewhere with the chance the bass does not own the line (1 - share): at 0 every 8th starts a note, exactly the plain grid; at 1 only
 * the bass's starts do. A bass note lasts until the next note starts, at most `cap` steps, and never across a chord change or into a
 * `stop` (a break, a run, a long note: they start where the other rules put them). Steps in `must` always start a note (a phrase's
 * first, a long note's first). The pitch is the bar's chord note, as in the plain grid.
 */
export function bassOverBand(key: number, chordAt: Chord[], tones: ChordNote[], lead: BassLead, cap: number, seed: string, stops: readonly number[], must: readonly number[], pent?: ReadonlySet<number>): BandNote[] {
  if (lead.share <= 0) return verseOverBand(key, chordAt, tones, undefined, pent);
  const total = chordAt.length, forced = new Set(must), starts: number[] = [], hit = new Set<number>();
  for (let s = 0; s < total; s += 2) {
    const bass = lead.on[s] || lead.on[s + 1];
    if (bass) hit.add(s);
    if (bass || forced.has(s) || roll(seed, 'bassfill', s) >= lead.share) starts.push(s);
  }
  const same = (a: number, b: number) => chordAt[a].root === chordAt[b].root && chordAt[a].q === chordAt[b].q;
  return starts.map((s, i) => {
    let len = 2;
    if (hit.has(s)) {
      len = Math.max(2, Math.min((starts[i + 1] ?? total) - s, cap));
      for (const t of stops) if (t > s && t < s + len) len = Math.max(1, t - s);
      for (let k = 1; k < len; k++) if (s + k < total && !same(s, s + k)) { len = k; break; }
      len = Math.max(1, len);
    }
    return { step: s, len, midi: nearest(pickPc(key, chordAt[s], tones[s] ?? 'fifth', pent), 67) };
  });
}

/**
 * The bass's lean on the chord note a bar or a phrase sits on: the one the bass is playing weighs more (e^(1.4 x share) times), so the
 * line mostly follows the bass's roots and 5ths but the mood and the other rules still move it. Where the bass has not started a note
 * yet, the first one in the next beat counts.
 */
export function bassBias(lead: BassLead): ToneBias {
  const w = Math.exp(2.2 * lead.share);
  return (step, tone) => {
    for (let k = 0; k < 4; k++) {
      const t = lead.tone[step + k];
      if (t !== undefined) return t === tone ? w : 1;
    }
    return 1;
  };
}

/** Two leans on the chord note, multiplied. */
export const bothBiases = (a?: ToneBias, b?: ToneBias): ToneBias | undefined => (a && b ? (s, t) => a(s, t) * b(s, t) : a ?? b);

/** Where the other rules put things the bass must leave room for: the starts of breaks, runs and long notes. */
export const stopsOf = (...lists: Gap[][]): number[] => lists.flatMap((l) => l.map((g) => g.step));
