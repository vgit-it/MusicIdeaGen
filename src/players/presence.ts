// When the rhythm guitar plays (docs/STUDY-RHYTHM.md). In real songs the guitar isn't always there: in the
// Lakh MIDI collection 42% of songs start with 4+ bars without it (pop 55%), and 44% sit it out for 4+ bars
// somewhere in the middle (pop and funk about 60%), 16% of the bars the part spans are silent. The app's
// guitar played every bar of every section; here the guitarist has a role for the whole song (like the
// piano, pad and strings in layerplan.ts) and each section they sit out, play, come in halfway or drop out
// halfway. Pure and deterministic.

import type { Genre } from '../genres';
import type { GuitarHit, Idea, SectionKind } from '../idea';
import { Rng } from '../rng';

export type GuitarShape = 'full' | 'out' | 'half-in' | 'half-out';
export type GuitarRole = 'steady' | 'late' | 'verseless' | 'breathing';

export const GUITAR_ROLE_DESC: Record<GuitarRole, string> = {
  steady: 'plays all the way through',
  late: 'held back at the start, in from the chorus',
  verseless: 'sits out the first verse, in for the choruses',
  breathing: 'drops out for the bridge and the quiet parts',
};

const ROLES: Record<Genre, [GuitarRole, number][]> = {
  rock: [['steady', 4], ['late', 2], ['verseless', 1], ['breathing', 3]],
  pop: [['steady', 1], ['late', 3], ['verseless', 3], ['breathing', 3]],
  funk: [['steady', 2], ['late', 2], ['verseless', 1], ['breathing', 3]],
  hardrock: [['steady', 3], ['late', 2], ['verseless', 0.5], ['breathing', 3]],
  grunge: [['steady', 2], ['late', 3], ['verseless', 1], ['breathing', 3]],
  metal: [['steady', 3], ['late', 2], ['breathing', 4]],
  altmetal: [['steady', 3], ['late', 2], ['breathing', 4]],
};

/**
 * What covers the chords while the guitar sits out. In the Lakh MIDI collection, in the bars with no guitar
 * a chord instrument plays in 85% of pop, 67% of funk, 60% of rock, 29% of hard rock, 24% of grunge and 6% of
 * metal; mostly piano and strings (pop: piano 43%, strings 53%, pad 19%; rock: piano 32%, strings 23%).
 * Decided once for the song.
 */
const COVER_CHANCE: Record<Genre, number> = { pop: 0.85, funk: 0.65, rock: 0.6, hardrock: 0.3, grunge: 0.25, metal: 0.05, altmetal: 0.1 };
export type CoverLayer = NonNullable<Idea['cover']>;
const COVER_WEIGHTS: Record<Genre, [CoverLayer, number][]> = {
  pop: [['keys', 4], ['strings', 5], ['pad', 1.5]],
  funk: [['strings', 4], ['keys', 2], ['pad', 1]],
  rock: [['keys', 5], ['strings', 3.5], ['pad', 1]],
  hardrock: [['keys', 3], ['strings', 2], ['pad', 1]],
  grunge: [['pad', 2], ['strings', 2], ['keys', 1]],
  metal: [['pad', 1]],
  altmetal: [['pad', 2], ['keys', 1]],
};

/** What a section is, for the plan. */
export interface GuitarSlot {
  kind: SectionKind;
  energy: number;
  bars: number;
  /** Guitar 2 plays here (so the section is never left without a guitar). */
  hasG2: boolean;
}

function shapeFor(role: GuitarRole, s: GuitarSlot, first: boolean, riff: boolean, rng: Rng): GuitarShape {
  const pick = (o: [GuitarShape, number][]) => rng.weighted(o);
  // (out only where Guitar 2 plays: a section is never left without any guitar)
  const out = (g: GuitarShape): GuitarShape => (g === 'out' && !s.hasG2 ? 'half-in' : g);
  switch (s.kind) {
    case 'intro':
      // a riff is the hook: it plays (a long intro can have the drums and bass first, the riff coming in halfway)
      if (riff) return role !== 'steady' && s.bars >= 8 ? pick([['half-in', 1], ['full', 2]]) : 'full';
      if (role === 'steady') return s.hasG2 && s.bars >= 8 ? pick([['full', 6], ['half-in', 1]]) : 'full';
      if (role === 'breathing') return s.bars >= 8 ? pick([['half-in', 2], ['full', 2]]) : out(pick([['out', 1], ['full', 2]]));
      return s.bars >= 8 || s.hasG2 ? out(pick([['out', 3], ['half-in', 2], ['full', 1]])) : 'full';
    case 'verse':
      if (role === 'late') return first ? out(pick([['half-in', 3], ['out', 2], ['full', 1]])) : pick([['half-in', 1], ['full', 3]]);
      if (role === 'verseless') return first ? out(pick([['out', 3], ['half-in', 1]])) : pick([['half-in', 1], ['full', 1]]);
      if (role === 'breathing' && s.energy <= 2 && first) return pick([['half-in', 1], ['full', 3]]);
      return 'full';
    case 'interlude':
      return role === 'breathing' ? out(pick([['out', 2], ['half-out', 1], ['full', 1]])) : 'full';
    case 'bridge':
    case 'breakdown':
      if (role === 'breathing') return s.energy <= 3 ? out(pick([['out', 3], ['half-in', 2], ['full', 1]])) : pick([['half-in', 1], ['half-out', 1], ['full', 2]]);
      if (role === 'late') return s.energy <= 2 ? pick([['half-in', 1], ['full', 2]]) : 'full';
      return 'full';
    default:
      // pre-chorus, chorus, solo, outro: the guitar is in
      return 'full';
  }
}

/** The role for the song and a shape for each section. */
export function planGuitar(seed: string, genre: Genre, riff: boolean, slots: GuitarSlot[]): { role: GuitarRole; shapes: GuitarShape[]; cover: CoverLayer | null } {
  const role = new Rng(`${seed}-gplan-role`).weighted(ROLES[genre]);
  const cr = new Rng(`${seed}-gplan-cover`);
  const cover = cr.chance(COVER_CHANCE[genre]) ? cr.weighted(COVER_WEIGHTS[genre]) : null;
  const seen = new Set<SectionKind>();
  const shapes = slots.map((s, i) => {
    const first = !seen.has(s.kind);
    seen.add(s.kind);
    // (with a cover instrument playing the chords, the guitar can sit out without Guitar 2)
    return shapeFor(role, cover ? { ...s, hasG2: true } : s, first, riff, new Rng(`${seed}-gplan-${i}-${s.kind}`));
  });
  return { role, shapes, cover };
}

/** The section's rhythm guitar by its shape (in place): strums, riff hits and picked notes outside the window go. Returns a note, or null. */
export function applyGuitarShape(idea: Idea, shape: GuitarShape, cover: CoverLayer | null = null): string | null {
  if (shape === 'full') return null;
  const { strum, song } = idea;
  const { total, bars } = song;
  const half = bars[Math.floor(bars.length / 2)].start;
  const from = shape === 'half-in' ? half : shape === 'out' ? total : 0;
  const until = shape === 'half-out' ? half : shape === 'out' ? 0 : total;
  if (!strum.some((x) => x !== '.') && !idea.guitar?.length && !idea.rhythmPick?.length) return null;
  for (let g = 0; g < total; g++) if (g < from || g >= until) strum[g] = '.';
  // the steps the guitar is out (a window; the whole section, or its first or second half), covered by a chord instrument
  idea.guitarOut = shape === 'out' ? { from: 0, until: total } : shape === 'half-in' ? { from: 0, until: half } : { from: half, until: total };
  if (cover) idea.cover = cover;
  // coming in on a strum; dropping out with the chord choked
  if (shape === 'half-in' && (strum[from] === '.' || strum[from] === 'x')) {
    strum[from] = 'D';
    // (the player's loudness map had nothing at an empty step: the entrance lands like a downbeat)
    if (idea.strumVel) idea.strumVel[from] = 1.14;
  }
  if (shape === 'half-out' && until < total) strum[until] = 'x';
  const keep = (h: GuitarHit) => h.step >= from && h.step < until;
  const cap = (h: GuitarHit): GuitarHit => ({ ...h, len: Math.max(1, Math.min(h.len, until - h.step)) });
  if (idea.guitar) idea.guitar = idea.guitar.filter(keep).map(cap);
  if (idea.rhythmPick) idea.rhythmPick = idea.rhythmPick.filter(keep).map(cap);
  const barOf = (step: number) => bars.findIndex((b) => step >= b.start && step < b.start + b.len) + 1;
  const who = cover ? { keys: 'the piano', strings: 'strings', pad: 'a pad' }[cover] : null;
  const instead = who ? `, ${who} plays the chords` : '';
  return (shape === 'out' ? 'Rhythm guitar: sits this one out'
    : shape === 'half-in' ? `Rhythm guitar: comes in at bar ${barOf(half)}`
      : `Rhythm guitar: drops out at bar ${barOf(half)}`) + instead;
}
