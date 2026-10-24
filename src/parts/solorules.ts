// Rewrite rules of the solo player (docs/SOLO-PLAYER.md, section 2): "for a span that looks like this, you may play it like that".
// A rule only proposes; the checker (soloverify.ts) decides. Step 1 has the interface, the plain rule (play the note as it is) and
// the registry; the first real rules are in solorules-spike.ts (heard nowhere yet) and move here when they are tuned.

import type { Feel, NoteRead } from '../idea';
import type { Rng } from '../rng';
import { ANCHOR_RANK, type Anchor, type BaseNote, type PEvent } from './soloevents';
import type { PlayerCtx } from './soloplayer';

/** What a rule is shown: a melody note with its neighbours and the song around it. */
export interface Span {
  /** The note (and the event it is in the performance now). */
  note: BaseNote;
  event: PEvent;
  /** What the reader saw (soloread.ts): the situation of the note. */
  read: NoteRead;
  prev: BaseNote | null;
  next: BaseNote | null;
  /** Steps of silence before and after it (0: the notes touch). */
  before: number;
  after: number;
  ctx: PlayerCtx;
}

/** What a rule suits (docs/SOLO-PLAYER.md, sections 3.3 and 5): the player scores a rule by how the span reads against this. */
export interface RuleProfile {
  /** The feel it is at home in (the same five axes the reader gives every note). */
  feel: Feel;
  /** Read tags that make it fit better (and a few that make it fit worse, below 0), each times the tag's own strength. */
  likes?: Record<string, number>;
  /** Read tags (strength 0.5 or more) where it must never go. */
  vetoes?: string[];
  /** Busy or showy: two heavy ones never sit side by side, and the budget counts them. */
  heavy?: boolean;
}

export interface Rule {
  name: string;
  /** The most it keeps of a note: it is only offered notes whose anchor it covers (`all` covers all three levels). */
  keeps: Anchor;
  /** What it suits; a rule without one is scored by `weight` alone. */
  profile?: RuleProfile;
  /** Whether it can be played on this span at all: 0 for no (how much it wants it is the profile's job). */
  weight(s: Span): number;
  /** The events that play the span instead (every one with `base` set to the note's `i`), or null when it cannot. Pure and seeded. */
  realise(s: Span, rng: Rng): PEvent[] | null;
}

/** Whether a rule may be offered a note: what it keeps must cover what the note must keep, and a frozen note is only ever played plain. */
export const covers = (r: Rule, n: BaseNote) => r.name === 'plain' || (!n.frozen && ANCHOR_RANK[r.keeps] >= ANCHOR_RANK[n.anchor]);

/** Play the note as it is. Always offered; the performance is never worse than the melody it was given. */
export const PLAIN: Rule = {
  name: 'plain',
  keeps: 'all',
  weight: () => 1,
  realise: (s) => [s.event],
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** How well a rule fits a span, given the feel the moment wants (0: it cannot or must not be played here): its own weight, times how the read tags suit it, times how close its feel is. */
export function fitOf(r: Rule, s: Span, want: Feel): number {
  const base = r.weight(s);
  if (base <= 0) return 0;
  const p = r.profile;
  if (!p) return base;
  const tags = new Map(s.read.tags.map((t) => [t.id, t.w]));
  if ((p.vetoes ?? []).some((id) => (tags.get(id) ?? 0) >= 0.5)) return 0;
  let tag = 0.35;
  for (const [id, k] of Object.entries(p.likes ?? {})) tag += k * (tags.get(id) ?? 0);
  let d2 = 0;
  for (const k of Object.keys(want) as (keyof Feel)[]) d2 += (p.feel[k] - want[k]) ** 2;
  return base * clamp(tag, 0.1, 2.5) * Math.exp(-d2 / 1.2);
}
