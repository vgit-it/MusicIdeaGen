// A section of a song (a verse or a chorus) turned into the melody writer's input and built (experiment). Pure: the card and the
// variety check use the same code, so what the check measures is what the card plays.

import type { Idea } from '../idea';
import { autoMood } from '../tension';
import { buildVerse, type Built } from './build';
import { leafSeeds, planForm, type Rule, type Variation } from './form';
import { dialsFor, drawPersonality, type Personality } from './personality';
import { bandAccents, type BendAmount, type Range } from './verse';
import type { Chord } from '../theory';

/** What the user can set on the card. */
export interface SectionOptions { range: Range; bends: BendAmount; meta: boolean; variation: Variation; /** Every note from the key's pentatonic scale. */ pentatonic?: boolean }

export const isChorus = (idea: Idea) => idea.section?.kind === 'chorus';
export const isPre = (idea: Idea) => idea.section?.kind === 'prechorus';
/** The section kinds the writer sings, as dials know them. */
export type SungKind = 'verse' | 'prechorus' | 'chorus';
export const kindOf = (idea: Idea): SungKind => (isChorus(idea) ? 'chorus' : isPre(idea) ? 'prechorus' : 'verse');
/** A kind whose sections of a song are one melody (a chorus, a pre-chorus): built from the song's last one, over each one's own chords. */
export const isShared = (idea: Idea) => kindOf(idea) !== 'verse';
export const chordsOf = (idea: Idea): Chord[] => idea.chords.chordIdx.map((i) => idea.chords.timeline[i].chord);
/** Steps in a bar. */
export const barOf = (idea: Idea) => Math.max(4, Math.round(idea.chords.chordIdx.length / idea.song.bars.length));
/** How hard the band hits on each 16th step (drums, chord changes, strum, bass). */
export function accentsOf(idea: Idea): number[] {
  const { kick, snare } = idea.drums;
  return bandAccents(idea.chords.chordIdx.length, { kick, snare, strum: idea.strum, bass: idea.bass, changes: idea.chords.timeline.map((e) => e.step) });
}
/** The song's melodic personality (personality.ts): the same for every section of a song. */
export const personalityOf = (idea: Idea): Personality => drawPersonality(idea.seeds.song, idea.song.genre, autoMood(idea.song, idea.seeds.song));
/** The chords of a section as a string (what a chorus's pitches follow). */
export const chordsKey = (idea: Idea) => idea.chords.timeline.map((e) => `${e.step}${e.chord.root}${e.chord.q}`).join(',');
/** The choruses of a song (of one length, tuned alike) are one hook: one melody, over each chorus's own chords. Pre-choruses likewise. */
export const hookSig = (idea: Idea, o: SectionOptions) =>
  `${idea.seeds.song}|${kindOf(idea)}|${idea.chords.chordIdx.length}|${Object.values(o.range).join(',')}|${o.bends}|${o.meta}|${o.variation}|${o.pentatonic ? 'pent' : ''}`;
/** The chorus (or pre-chorus) the others are built like: the song's last one of this hook (usually the fullest: the highest energy). */
export function chorusMaster(list: Idea[], idea: Idea, o: SectionOptions): Idea {
  const sig = hookSig(idea, o);
  for (let i = list.length - 1; i >= 0; i--) if (isShared(list[i]) && hookSig(list[i], o) === sig) return list[i];
  return idea;
}

/** The rules a pre-chorus takes from the verse it follows: its phrasing and small breaks are the verse's dice, so the two feel related. */
const BORROWED: Rule[] = ['phrases', 'small'];
function borrowedFrom(verse: Idea, o: SectionOptions): Partial<Record<Rule, string>> {
  const seed = `${verse.seeds.song}|${verse.seeds.chords}`;
  const leaves = planForm(verse.song.bars.length, o.meta, o.variation, seed);
  const seeds = leafSeeds(leaves, seed).get(leaves[0].id)!;
  return Object.fromEntries(BORROWED.map((r) => [r, seeds[r]]));
}

/**
 * The melody over a section; `accents` are the band's (computed when left out). A chorus built `like` another (its master, with the
 * master's accents) writes with the master's seed, energy and accents, so its rhythm and shape are the master's, over its own chords.
 */
export function buildSection(idea: Idea, o: SectionOptions, accents: number[] = accentsOf(idea), like?: Idea, verse?: Idea): Built {
  const chorus = isShared(idea), p = personalityOf(idea), kind = kindOf(idea);
  // (the master's tries: each leaf starts on the dice the master's ended on, so the choruses match)
  const tries = chorus && like ? buildSection(like, o, accents, undefined, verse).tries : undefined;
  return buildVerse({
    key: idea.song.key, mode: idea.song.mode, genre: idea.song.genre, energy: (chorus && like ? like : idea).section?.energy ?? 3,
    chordAt: chordsOf(idea), acc: accents, changes: idea.chords.timeline.map((e) => e.step),
    bar: barOf(idea), bars: idea.song.bars.length, range: o.range, bends: o.bends, meta: o.meta, variation: kind === 'chorus' ? p.chorusVariation : o.variation,
    thirds: idea.song.bars.every((b) => b.len % 3 === 0), pentatonic: o.pentatonic,
    seed: chorus ? hookSig(idea, o) : `${idea.seeds.song}|${idea.seeds.chords}`, dials: dialsFor(kind, p), tries, borrow: kind === 'prechorus' && verse ? borrowedFrom(verse, o) : undefined,
  });
}
