// Where an added layer (piano, pad, strings, percussion) plays in a song, so it shapes the arrangement
// instead of playing every bar of every section.
//
// Each layer gets one role for the whole song, from its own seed:
// - texture: part of the band, but held back at first (the first verse thinner, fuller from then on)
// - colour: a mood for the quiet parts (intro, verses, a quiet bridge), gone when the band gets loud
// - lift: saved for the big sections, arriving partway into the first chorus or in the bars before it
// - feature: held back for most of the song, then the bridge, the last chorus and the outro
// and in each section it sits out, plays throughout, comes in partway, drops out partway, or plays
// only a few moments (sparse). Pure and deterministic.

import type { Idea, SectionKind } from '../idea';
import { Rng } from '../rng';

export type LayerName = 'keys' | 'pad' | 'strings' | 'perc';
export type LayerRole = 'texture' | 'colour' | 'lift' | 'feature';

/** How a layer plays in one section. Steps are inside the section. */
export type Presence =
  | { kind: 'full' }
  | { kind: 'out' }
  | { kind: 'window'; from: number; until: number }
  | { kind: 'sparse' };

export const ROLE_DESC: Record<LayerRole, string> = {
  texture: 'part of the texture, held back at first',
  colour: 'a mood colour for the quieter parts',
  lift: 'saved for the bigger sections',
  feature: 'held back for the big moments',
};

/** Each instrument leans to the roles it suits: piano colours the verses, strings are saved for the big moments. */
const ROLE_WEIGHTS: Record<LayerName, [LayerRole, number][]> = {
  keys: [['colour', 3], ['texture', 2], ['feature', 1], ['lift', 1]],
  strings: [['feature', 3], ['lift', 2], ['colour', 1], ['texture', 1]],
  pad: [['texture', 3], ['colour', 2], ['lift', 1]],
  perc: [['lift', 3], ['texture', 2], ['feature', 1]],
};

export const pickRole = (part: LayerName, seed: string): LayerRole => new Rng(`${seed}-role`).weighted(ROLE_WEIGHTS[part]);

/** What a section is, for the plan. */
interface Slot { kind: SectionKind; energy: number }

/** The kind of moment a section is in the song. */
interface Moment extends Slot {
  /** First time this kind comes round. */
  first: boolean;
  /** The last chorus (the biggest one). */
  final: boolean;
  quiet: boolean;
  loud: boolean;
}

function moments(all: Slot[]): Moment[] {
  const lastChorus = all.map((s) => s.kind).lastIndexOf('chorus');
  const seen = new Set<SectionKind>();
  return all.map((s, i) => {
    const first = !seen.has(s.kind);
    seen.add(s.kind);
    return { ...s, first, final: i === lastChorus && all.filter((x) => x.kind === 'chorus').length > 1, quiet: s.energy <= 3, loud: s.energy >= 4 };
  });
}

type Shape = 'full' | 'out' | 'half-in' | 'last-in' | 'half-out' | 'sparse';

function shapeFor(role: LayerRole, m: Moment, rng: Rng): Shape {
  const { kind } = m;
  const pick = (opts: [Shape, number][]) => rng.weighted(opts);
  if (role === 'texture') {
    if (kind === 'intro') return pick([['out', 2], ['full', 1], ['sparse', 1]]);
    if (kind === 'verse' && m.first) return pick([['half-in', 3], ['out', 1], ['sparse', 2]]);
    if (kind === 'bridge' || kind === 'breakdown') return pick([['full', 2], ['sparse', 1], ['out', 1]]);
    return 'full';
  }
  if (role === 'colour') {
    if (kind === 'intro' || kind === 'verse') return m.first && kind === 'verse' ? pick([['full', 3], ['half-in', 1]]) : 'full';
    if (kind === 'prechorus') return pick([['half-out', 2], ['full', 1]]);
    if ((kind === 'bridge' || kind === 'breakdown') && m.quiet) return 'full';
    if (kind === 'outro') return m.quiet ? 'full' : 'out';
    // loud sections: out, or a few held moments in the last chorus (the mood comes back)
    return m.final ? pick([['out', 2], ['sparse', 1]]) : 'out';
  }
  if (role === 'lift') {
    if (kind === 'intro') return 'out';
    if (kind === 'verse') return m.first ? 'out' : pick([['out', 2], ['last-in', 1]]);
    if (kind === 'prechorus') return pick([['half-in', 2], ['last-in', 1], ['full', 1]]);
    if (kind === 'chorus') return m.first ? pick([['half-in', 2], ['full', 1]]) : 'full';
    if (kind === 'bridge' || kind === 'breakdown') return m.loud ? 'full' : 'out';
    return 'full';
  }
  // feature
  if (kind === 'bridge' || kind === 'breakdown' || kind === 'outro' || m.final) return m.final ? pick([['full', 2], ['half-in', 1]]) : 'full';
  if (kind === 'intro') return pick([['out', 2], ['sparse', 1]]);
  if (kind === 'chorus' && !m.first) return pick([['out', 2], ['sparse', 1]]);
  return 'out';
}

const planCache = new Map<string, { role: LayerRole; shapes: Shape[] }>();

function planFor(part: LayerName, seed: string, all: Slot[]) {
  const key = `${part}|${seed}|${all.map((s) => `${s.kind}${s.energy}`).join()}`;
  let p = planCache.get(key);
  if (!p) {
    const role = pickRole(part, seed);
    const ms = moments(all);
    // a draw per section, so rerolling one block (or changing its energy) leaves the others' plan alone
    const shapes: Shape[] = ms.map((m, i) => shapeFor(role, m, new Rng(`${seed}-plan-${i}-${m.kind}`)));
    // once in, it stays in while the song builds: no dropping out at the bar line only to come in
    // again partway (after a drop in energy, coming back late is a build, and stays)
    for (let i = 1; i < shapes.length; i++) {
      const wasIn = shapes[i - 1] === 'full' || shapes[i - 1] === 'half-in' || shapes[i - 1] === 'last-in';
      if (wasIn && (shapes[i] === 'half-in' || shapes[i] === 'last-in') && ms[i].energy >= ms[i - 1].energy) shapes[i] = 'full';
    }
    // never silent the whole song: the biggest section gets it
    if (!shapes.some((s) => s !== 'out')) {
      const i = ms.findIndex((m) => m.final) >= 0 ? ms.findIndex((m) => m.final) : ms.reduce((b, m, j) => (m.energy > ms[b].energy ? j : b), 0);
      shapes[i] = 'full';
    }
    p = { role, shapes };
    if (planCache.size > 200) planCache.clear();
    planCache.set(key, p);
  }
  return p;
}

/**
 * How a layer plays in a track section (or an idea). `throughout`: every bar, as before.
 * Ideas on their own: usually throughout, sometimes coming in halfway (the loop then breathes).
 */
export function presenceOf(part: LayerName, idea: Idea, seed: string, throughout: boolean): { presence: Presence; role: LayerRole | null; early: boolean } {
  const { bars, total } = idea.song;
  const at = (bi: number) => bars[Math.max(0, Math.min(bars.length - 1, bi))].start;
  const half = at(Math.floor(bars.length / 2));
  const toPresence = (s: Shape): Presence =>
    s === 'full' ? { kind: 'full' } : s === 'out' ? { kind: 'out' } : s === 'sparse' ? { kind: 'sparse' }
      : s === 'half-in' ? { kind: 'window', from: half, until: total }
        : s === 'last-in' ? { kind: 'window', from: at(bars.length - 2), until: total }
          : { kind: 'window', from: 0, until: half };
  if (throughout) return { presence: { kind: 'full' }, role: null, early: false };
  const pos = idea.section?.pos;
  if (!pos) {
    const s = new Rng(`${seed}-idea`).weighted<Shape>([['full', 3], ['half-in', 1]]);
    return { presence: toPresence(s), role: null, early: false };
  }
  const plan = planFor(part, seed, pos.all);
  const shape = plan.shapes[pos.index] ?? 'full';
  // a mood colour joins an intro the guitar starts alone (piano and guitar, strings under the riff)
  const early = plan.role === 'colour' && idea.section?.kind === 'intro' && shape !== 'out';
  return { presence: toPresence(shape), role: plan.role, early };
}
