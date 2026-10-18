// A section of a song (a verse or a chorus) turned into the melody writer's input and built (experiment). Pure: the card and the
// variety check use the same code, so what the check measures is what the card plays.

import type { Idea } from '../idea';
import { autoMood } from '../tension';
import { buildVerse, type Built } from './build';
import type { Variation } from './form';
import { dialsFor, drawPersonality, type Personality } from './personality';
import { bandAccents, type BendAmount, type Range } from './verse';
import type { Chord } from '../theory';

/** What the user can set on the card. */
export interface SectionOptions { range: Range; bends: BendAmount; meta: boolean; variation: Variation }

export const isChorus = (idea: Idea) => idea.section?.kind === 'chorus';
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
/** Choruses with the same chords, energy and tuning are one hook: the first one's melody (and words) are every one's. */
export const hookSig = (idea: Idea, o: SectionOptions) =>
  `${idea.seeds.song}|chorus|${idea.chords.timeline.map((e) => `${e.step}${e.chord.root}${e.chord.q}`).join(',')}|${idea.section?.energy ?? 4}|${Object.values(o.range).join(',')}|${o.bends}|${o.meta}|${o.variation}`;

/** The melody over a section; `accents` are the band's (computed when left out). */
export function buildSection(idea: Idea, o: SectionOptions, accents: number[] = accentsOf(idea)): Built {
  const chorus = isChorus(idea), p = personalityOf(idea);
  return buildVerse({
    key: idea.song.key, mode: idea.song.mode, genre: idea.song.genre, energy: idea.section?.energy ?? 3,
    chordAt: chordsOf(idea), acc: accents, changes: idea.chords.timeline.map((e) => e.step),
    bar: barOf(idea), bars: idea.song.bars.length, range: o.range, bends: o.bends, meta: o.meta, variation: chorus ? p.chorusVariation : o.variation,
    seed: chorus ? hookSig(idea, o) : `${idea.seeds.song}|${idea.seeds.chords}`, dials: dialsFor(chorus ? 'chorus' : 'verse', p),
  });
}
