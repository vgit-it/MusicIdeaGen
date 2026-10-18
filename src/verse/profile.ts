// The dials of the melody writer (experiment): every number the rules in verse.ts roll against, gathered in one place.
// A section kind (verse, chorus...) is a set of dials; a song's personality (personality.ts) tilts them. VERSE holds the
// numbers the verse has always had, so a verse written with it is the verse as before.

/** How a phrase ends. `plain`: it just stops where the line stops. */
export type EndStyle = 'held' | 'open' | 'hang' | 'punch' | 'sync' | 'plain';
export const END_STYLES: EndStyle[] = ['held', 'open', 'hang', 'punch', 'sync', 'plain'];

export interface Dials {
  /** Weights for phrases of 1, 2, 3 and 4 bars. */
  phraseLen: [number, number, number, number];
  /** Weights for breaks between phrases of 1, 2, 3 and 4 beats. */
  breakBeats: [number, number, number, number];
  /** Times the chance of a stretch of 16th notes. */
  runs: number;
  /** Weights for a run of ⅛, ¼ and ½ bar. */
  runLen: [number, number, number];
  /** The chance a bar holds one long note; weights for it lasting 1, 1½, 2 and 4 beats. */
  holdBar: number;
  holdLen: [number, number, number, number];
  /** The chance a bar that holds one long note holds a second in the quarters left. */
  holdTwice: number;
  /** The chance a bar moves from one chord note to another part way through. */
  moves: number;
  /** Weights for a bar sitting on the root, the 3rd and the 5th. */
  toneW: [number, number, number];
  /** The chances of a neighbour note, of a walk into the next bar's core note, of a bar of three even notes. */
  neighbour: number;
  walk: number;
  third: number;
  /** Times the chance of a small break dropping a note. */
  small: number;
  /** The chance of a note on a beat coming a 16th early (a push). */
  push: number;
  /** The chance a phrase ends in a treatment: drawn per section between the two; then how, by weights. */
  end: [number, number];
  endStyle: Record<EndStyle, number>;
  /** Weights for a held ending lasting 1, 1½, 2, 3 and 4 beats. */
  endLen: [number, number, number, number, number];
  /** Semitones the whole range moves up (down if negative) for this section. */
  lift: number;
  /** Times the chances of bends. */
  bends: number;
}

export const VERSE: Dials = {
  phraseLen: [0.15, 0.35, 0.25, 0.25],
  breakBeats: [0.5, 0.3, 0.12, 0.08],
  runs: 1,
  runLen: [0.62, 0.3, 0.08],
  holdBar: 0.4,
  holdLen: [0.4, 0.2, 0.3, 0.1],
  holdTwice: 0,
  moves: 0.3,
  toneW: [1, 1, 1],
  neighbour: 0.3,
  walk: 0.8,
  third: 0.15,
  small: 1,
  push: 0,
  end: [0.35, 0.85],
  endStyle: { held: 1, open: 0, hang: 0, punch: 0, sync: 0, plain: 0 },
  endLen: [0.3, 0.2, 0.25, 0.15, 0.1],
  lift: 0,
  bends: 1,
};

/** Weighted pick of an index. */
export function cumulative(w: readonly number[], r: number): number {
  let q = r * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((q -= w[i]) < 0) return i;
  return w.length - 1;
}
