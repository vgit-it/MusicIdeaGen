// The solo player (docs/SOLO-PLAYER.md): the melody (with its gaps and joins) handed to a guitarist. The director: reads the melody into
// spans, lets every rule that fits offer a way to play each one, picks by chance, and keeps a pick only if the checker passes it (and the
// hands can finger it). A pick that fails goes to the next, and in the end to the note as it is, so a performance is never worse than the
// melody it was given. Step 1: the frame and the plain rule; the rules that change anything come next.

import type { ChordPart, DrumPart, Feel, SectionKind, Song, SoloMove } from '../idea';
import type { Hands } from '../players/hands';
import type { LeadPlayer } from '../players/lead';
import { Rng } from '../rng';
import type { Mood } from '../tension';
import type { Guitar2Part } from './guitar2';
import { type PEvent, eventsToHits, readBase } from './soloevents';
import { readSolo } from './soloread';
import { type Rule, type Span, covers, fitOf } from './solorules';
import { LIVE_RULES } from './solorules-live';
import { personOf, signaturesOf } from './soloperson';
import { type VCtx, type Violation, unplayable, verify } from './soloverify';

/** Everything the player knows about the song around the solo. */
export interface PlayerCtx {
  /** The track's seed: the same seed gives the same performance. */
  seed: string;
  /** The band's seed: the same player is the same person in every solo of the track (the solo's seed when missing). */
  band?: string;
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

/** How much of the time the player decorates a note it could (a pro is mostly restraint). */
const RESTRAINT = 0.55;

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
  const person = personOf(c.band ?? c.seed, c.lead);
  const signatures = new Set(signaturesOf(person, c.seed));
  const phraseOf = (i: number) => read.phrases.find((p) => i >= p.from && i <= p.to);
  const barOf = (t: number) => Math.max(0, c.song.bars.findIndex((b) => t >= b.start && t < b.start + b.len));
  const perBar = new Map<number, number>();
  const used = new Map<string, number>();
  const chosen: string[] = notes.map(() => 'plain');
  const heavyOf = new Map(rules.map((r) => [r.name, !!r.profile?.heavy]));
  let lastRewritten = -9;

  notes.forEach((note, i) => {
    const nr = read.notes[i];
    const span: Span = {
      note, event: ev0[note.ev], read: nr, prev: notes[i - 1] ?? null, next: notes[i + 1] ?? null,
      before: i ? Math.max(0, note.t - (notes[i - 1].t + notes[i - 1].len)) : note.t,
      after: notes[i + 1] ? Math.max(0, notes[i + 1].t - (note.t + note.len)) : 0,
      ctx: c,
    };
    const tagw = (id: string) => nr.tags.find((t) => t.id === id)?.w ?? 0;
    const e01 = (Number(nr.facts.energy ?? 0) + 1) / 2;
    // what the moment wants, with the player's own lean
    const want = {} as Feel;
    for (const k of Object.keys(nr.feel) as (keyof Feel)[]) want[k] = Math.max(-1, Math.min(1, nr.feel[k] + person.lean[k]));

    // everything that fits, scored (fit of the span x the player's taste x a pet move coming back x not the same again and again)
    const prevHeavy = i - 1 === lastRewritten && heavyOf.get(chosen[i - 1]);
    const scored = rules
      .filter((r) => r.name !== 'plain' && covers(r, note))
      .map((r) => {
        const fit = fitOf(r, span, want);
        const novelty = (i - lastRewritten <= 3 && chosen[lastRewritten] === r.name ? 0.4 : 1) / (1 + 0.25 * (used.get(r.name) ?? 0));
        return { r, fit, w: fit * (o.force === r.name ? 1 : person.taste[r.name] ?? 1) * (signatures.has(r.name) ? 2.5 : 1) * novelty };
      })
      .filter((x) => x.fit > 0)
      .sort((a, b) => b.w - a.w);
    moves[i].options = scored.map((x) => x.r.name);
    moves[i].scores = scored.slice(0, 5).map((x) => [x.r.name, Math.round(x.w * 100) / 100]);
    let pool = scored.filter((x) => x.w > 0 && !(prevHeavy && x.r.profile?.heavy));
    if (!pool.length) { moves[i].note = scored.length ? 'nothing the player would play here' : 'no rule fits'; return; }

    const rng = new Rng(`${c.seed}-player-${note.t}-${note.midi}`);
    // a copy of a phrase is played as its source was (mostly): the same move, or the same restraint
    let first: Rule | null = null;
    const ph = phraseOf(i);
    const src = ph?.copyOf !== undefined ? read.phrases[ph.copyOf] : undefined;
    const srcI = src && ph ? src.from + (i - ph.from) : -1;
    if (src && srcI <= src.to && rng.chance(0.85)) {
      if (chosen[srcI] === 'plain') { moves[i].note = 'as the phrase it repeats'; return; }
      first = pool.find((x) => x.r.name === chosen[srcI])?.r ?? null;
    }

    if (!first) {
      // whether to play something at all: the player's habit, lifted by the energy and by a note that wants an ending
      const bar = barOf(note.t);
      const cap = e01 > 0.55 ? 2 : 1;
      let p = RESTRAINT * person.density * (0.55 + 0.9 * e01)
        * (1 + 0.5 * tagw('long-before-rest') + 0.3 * tagw('phrase-end') + 0.3 * tagw('held-peak'))
        * Math.min(1, note.len / 8) ** 0.8;
      if (i - 1 === lastRewritten) p *= 0.55;
      const best = pool[0].w;
      p *= best < 0.4 ? 0.15 + 0.85 * (best / 0.4) ** 1.5 : 1 + 0.4 * Math.min(1, (best - 0.4) / 2);
      if (o.force && pool.some((x) => x.r.name === o.force)) p = 1;
      else if ((perBar.get(bar) ?? 0) >= cap) p = 0;
      if (!rng.chance(Math.min(0.92, p))) { moves[i].note = 'left plain'; return; }
    }

    // several ways: the draw is by weight, and every one that fails the checker gives way to the next
    const order: Rule[] = [];
    if (o.force) { const f = pool.find((x) => x.r.name === o.force); if (f) order.push(f.r); }
    if (first && !order.includes(first)) order.push(first);
    const rest = pool.filter((x) => !order.includes(x.r));
    while (rest.length) {
      const pick = rng.weighted(rest.map((x) => [x, x.w] as [typeof x, number]));
      order.push(pick.r);
      rest.splice(rest.indexOf(pick), 1);
    }
    for (const r of order) {
      const evs = r.realise(span, new Rng(`${c.seed}-rule-${r.name}-${note.t}-${note.midi}`));
      if (!evs) continue;
      groups[i] = evs.map((e) => ({ ...e, base: note.i }));
      if (!fresh().length) {
        moves[i].rule = r.name; chosen[i] = r.name; lastRewritten = i;
        used.set(r.name, (used.get(r.name) ?? 0) + 1);
        perBar.set(barOf(note.t), (perBar.get(barOf(note.t)) ?? 0) + 1);
        return;
      }
      groups[i] = plainOf(i);
    }
    moves[i].note = 'every try failed the check';
  });

  // the hands have the last word: a note with no place on the neck goes back to being played as it was
  const baseBad = new Set(unplayable(ev0, vctx).map((e) => e.base));
  for (let guard = 0; guard < notes.length; guard++) {
    const bad = unplayable(assemble(), vctx).filter((e) => e.base !== undefined && !baseBad.has(e.base));
    if (!bad.length) break;
    for (const e of bad) { groups[e.base!] = plainOf(e.base!); moves[e.base!].rule = 'plain'; moves[e.base!].note = 'no place on the neck'; }
  }

  const events = assemble();
  const hits = eventsToHits(events);
  const changed = moves.filter((m) => m.rule !== 'plain');
  const fine = hits.some((h) => h.shift || h.exact);
  const tally = new Map<string, number>();
  for (const m of changed) tally.set(m.rule, (tally.get(m.rule) ?? 0) + 1);
  return {
    hits,
    notes: [...base.notes, changed.length
      ? `Solo player: ${changed.length} of ${notes.length} notes played another way (${[...tally].map(([k, n]) => `${k} ${n}`).join(', ')})`
      : `Solo player: all ${notes.length} notes played as written${rules.length > 1 ? ' (nothing was worth playing another way)' : ''}`],
    curve: base.curve ? { ...base.curve, moves, read, ...(fine ? { fine: true } : {}) } : undefined,
  };
}
