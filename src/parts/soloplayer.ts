// The solo player (docs/SOLO-PLAYER.md): the melody (with its gaps and joins) handed to a guitarist. The director: reads the melody into
// spans, lets every rule that fits offer a way to play each one, picks by chance, and keeps a pick only if the checker passes it (and the
// hands can finger it). A pick that fails goes to the next, and in the end to the note as it is, so a performance is never worse than the
// melody it was given. Step 1: the frame and the plain rule; the rules that change anything come next.

import type { ChordPart, DrumPart, SectionKind, Song, SoloMove } from '../idea';
import type { Hands } from '../players/hands';
import type { LeadPlayer } from '../players/lead';
import { Rng } from '../rng';
import type { Mood } from '../tension';
import type { Guitar2Part } from './guitar2';
import { type PEvent, eventsToHits, readBase } from './soloevents';
import { readSolo } from './soloread';
import { LIVE_RULES, type Rule, type Span, covers } from './solorules';
import { type VCtx, type Violation, unplayable, verify } from './soloverify';

/** Everything the player knows about the song around the solo. */
export interface PlayerCtx {
  /** The track's seed: the same seed gives the same performance. */
  seed: string;
  song: Song;
  chords?: ChordPart;
  lead: LeadPlayer;
  hands: Hands;
  mood: Mood;
  tension: number[];
  drums?: DrumPart;
  /** The section's energy level and kind. */
  energy: number;
  kind: SectionKind;
}

export interface PlayerOpts {
  /** For checks: always try this rule first where it applies. */
  force?: string;
}

const violationKey = (v: Violation) => `${v.code}@${v.at.toFixed(2)}`;

export function performSolo(base: Guitar2Part, c: PlayerCtx, rules: Rule[] = LIVE_RULES, o: PlayerOpts = {}): Guitar2Part {
  const { events: ev0, notes } = readBase(base.hits, base.curve);
  const plainOf = (i: number): PEvent[] => [ev0[notes[i].ev]];
  const vctx: VCtx = { song: c.song, chords: c.chords, gaps: base.curve?.gaps ?? [], hands: c.hands, energy: c.energy, kind: c.kind, curve: base.curve };

  // the melody read: the situation of every note, joint, cell and phrase
  const read = readSolo(notes, { song: c.song, chords: c.chords, drums: c.drums, mood: c.mood, tension: c.tension, curve: base.curve });

  // the pieces: each melody note as the events that play it now; the muted scratches and other hits that are no note of the melody stay
  const groups: PEvent[][] = notes.map((_, i) => plainOf(i));
  const noteEvents = new Set(notes.map((n) => n.ev));
  const others = ev0.filter((_, k) => !noteEvents.has(k));
  const assemble = () => [...others, ...groups.flat()];

  // what the melody itself already breaks (it should be nothing) is not held against a rewrite
  const baseline = new Set(verify(assemble(), notes, vctx).map(violationKey));
  const fresh = () => verify(assemble(), notes, vctx).filter((v) => !baseline.has(violationKey(v)));

  const moves: SoloMove[] = notes.map((n) => ({ step: Math.floor(n.t), midi: n.midi, rule: 'plain', options: ['plain'] }));
  notes.forEach((note, i) => {
    const span: Span = {
      note, event: ev0[note.ev], read: read.notes[i], prev: notes[i - 1] ?? null, next: notes[i + 1] ?? null,
      before: i ? Math.max(0, note.t - (notes[i - 1].t + notes[i - 1].len)) : note.t,
      after: notes[i + 1] ? Math.max(0, notes[i + 1].t - (note.t + note.len)) : 0,
      ctx: c,
    };
    const offered = rules.map((r) => ({ r, w: covers(r, note) ? r.weight(span) : 0 })).filter((x) => x.w > 0);
    moves[i].options = offered.map((x) => x.r.name);
    const rng = new Rng(`${c.seed}-player-${note.t}-${note.midi}`);
    // the order they are tried in: by chance (the forced one first); the plain rule is the last resort
    const pool = offered.filter((x) => x.r.name !== 'plain');
    const order: Rule[] = [];
    const forced = pool.find((x) => x.r.name === o.force);
    if (forced) order.push(forced.r);
    const rest = pool.filter((x) => x !== forced);
    while (rest.length) {
      const pick = rng.weighted(rest.map((x) => [x, x.w] as [typeof x, number]));
      order.push(pick.r);
      rest.splice(rest.indexOf(pick), 1);
    }
    // (the plain rule takes a place in the draw by its weight: a pro is mostly restraint)
    const plain = offered.find((x) => x.r.name === 'plain');
    if (!forced && plain && rng.chance(plain.w / (plain.w + pool.reduce((a, x) => a + x.w, 0)))) { moves[i].rule = 'plain'; return; }
    for (const r of order) {
      const evs = r.realise(span, new Rng(`${c.seed}-rule-${r.name}-${note.t}-${note.midi}`));
      if (!evs) continue;
      groups[i] = evs.map((e) => ({ ...e, base: note.i }));
      if (!fresh().length) { moves[i].rule = r.name; return; }
      groups[i] = plainOf(i);
    }
  });

  // the hands have the last word: a note with no place on the neck goes back to being played as it was
  const baseBad = new Set(unplayable(ev0, vctx).map((e) => e.base));
  for (let guard = 0; guard < notes.length; guard++) {
    const bad = unplayable(assemble(), vctx).filter((e) => e.base !== undefined && !baseBad.has(e.base));
    if (!bad.length) break;
    for (const e of bad) { groups[e.base!] = plainOf(e.base!); moves[e.base!].rule = 'plain'; }
  }

  const events = assemble();
  const hits = eventsToHits(events);
  const changed = moves.filter((m) => m.rule !== 'plain');
  const fine = hits.some((h) => h.shift || h.exact);
  const used = new Map<string, number>();
  for (const m of changed) used.set(m.rule, (used.get(m.rule) ?? 0) + 1);
  return {
    hits,
    notes: [...base.notes, changed.length
      ? `Solo player: ${changed.length} of ${notes.length} notes played another way (${[...used].map(([k, n]) => `${k} ${n}`).join(', ')})`
      : `Solo player: all ${notes.length} notes played as written (no rules yet)`],
    curve: base.curve ? { ...base.curve, moves, read, ...(fine ? { fine: true } : {}) } : undefined,
  };
}
