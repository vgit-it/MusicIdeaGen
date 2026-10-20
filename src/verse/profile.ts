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
  /** The chance a plain 8th is stretched over the next one (two 8ths on one chord note become one note), and once more (a beat and a half). */
  stretch: number;
  /** The chance a phrase opens on one long note (then the shorter notes follow); weights for it lasting 1, 1½, 2 and 3 beats. */
  opener: number;
  openLen: [number, number, number, number];
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
  /** Rule 25: the chance a core note (a bar's, or a move to another chord note part way through) is sung in another octave of the range than the nearest; and the share of those that go up when both ways are open. */
  octave: number;
  octaveUp: number;
  /** The share of the section left silent that the line is fitted to (left out: whatever the rules leave). */
  silence?: number;
  /** How far from that share the fit lets the line be (left out: 3 points; a bridge and an interlude take it as a loose aim). */
  silenceTol?: number;
  /** Semitones the line climbs across the section (rule 22; a pre-chorus: left out, none). */
  climb?: number;
  /** Where the line dwells (rule 24; a bridge): a home pitch as a fraction of the range (0 bottom, 1 top) the line is pulled toward; left out: none. */
  dwell?: number;
  /** The chance the section's last phrase leads into the next section: an open or hanging note held to the end, sung strongly (rule 23). */
  leadIn?: number;
  /** The pitch classes the line is limited to (the pentatonic option): every note is chosen from them, steps and endings too. */
  pent?: ReadonlySet<number>;
}

export const VERSE: Dials = {
  phraseLen: [0.15, 0.35, 0.25, 0.25],
  breakBeats: [0.5, 0.3, 0.12, 0.08],
  runs: 1,
  runLen: [0.9, 0.1, 0],
  holdBar: 0.4,
  holdLen: [0.4, 0.2, 0.3, 0.1],
  holdTwice: 0,
  stretch: 0,
  opener: 0,
  openLen: [0.25, 0.25, 0.35, 0.15],
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
  octave: 0.25,
  octaveUp: 0.6,
};

/** How far a section's energy (1-5) is from the middle: 0 at 3, 1 at 1 and 5, between at 2 and 4. */
export const energyEdge = (energy: number): number => Math.min(1, Math.abs(energy - 3) / 2);

/** Which way a section's energy leans: +1 at energy 1 (calm), -1 at 5 (driving), 0 at 3. */
export const energyCalm = (energy: number): number => Math.max(-1, Math.min(1, (3 - energy) / 2));

/** A section's volume against the middle: x0.85 at energy 1, x1 at 3, x1.15 at 5. */
export const energyVolume = (energy: number): number => 1 - 0.15 * energyCalm(energy);

/** The phrase lengths (1-4 bars) leaned by energy: calm sections toward the longer ones, driving ones toward the shorter ones. */
export function phraseLenFor(w: Dials['phraseLen'], energy: number): Dials['phraseLen'] {
  const s = energyCalm(energy);
  return w.map((x, i) => x * (1 + 0.6 * s * (i - 1.5) / 1.5)) as Dials['phraseLen'];
}

/** Weighted pick of an index. */
export function cumulative(w: readonly number[], r: number): number {
  let q = r * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((q -= w[i]) < 0) return i;
  return w.length - 1;
}
