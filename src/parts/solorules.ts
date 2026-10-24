// Rewrite rules of the solo player (docs/SOLO-PLAYER.md, section 2): "for a span that looks like this, you may play it like that".
// A rule only proposes; the checker (soloverify.ts) decides. Step 1 has the interface, the plain rule (play the note as it is) and
// the registry; the first real rules are in solorules-spike.ts (heard nowhere yet) and move here when they are tuned.

import type { NoteRead } from '../idea';
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

export interface Rule {
  name: string;
  /** The most it keeps of a note: it is only offered notes whose anchor it covers (`all` covers all three levels). */
  keeps: Anchor;
  /** How much it wants this span: 0 for no. */
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

/** The rules the player uses (step 1: none but the plain one). */
export const LIVE_RULES: Rule[] = [PLAIN];
