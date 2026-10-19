// A section of a song (a verse or a chorus) turned into the melody writer's input and built (experiment). Pure: the card and the
// variety check use the same code, so what the check measures is what the card plays.

import type { Idea } from '../idea';
import { autoMood } from '../tension';
import { buildVerse, type Built } from './build';
import { leafSeeds, planForm, type Rule, type Variation } from './form';
import { dialsFor, drawPersonality, paced, type Personality } from './personality';
import { bandAccents, type BendAmount, type Range } from './verse';
import type { Chord } from '../theory';

/** What the user can set on the card. */
export interface SectionOptions { range: Range; bends: BendAmount; meta: boolean; variation: Variation; /** Every note from the key's pentatonic scale. */ pentatonic?: boolean; /** The song's vocal seed, mixed into every roll (left out: the card's own seeds). */ seed?: string; /** Dials moved to the song's tempo (personality.ts `paced`); the experiment's melodies are written without. */ pace?: boolean }

export const isChorus = (idea: Idea) => idea.section?.kind === 'chorus';
export const isPre = (idea: Idea) => idea.section?.kind === 'prechorus';
export const isBridge = (idea: Idea) => idea.section?.kind === 'bridge';
/** An interlude the singer takes (the 8-bar lead break is the guitar's: no singing). */
export const isInterlude = (idea: Idea) => idea.section?.kind === 'interlude' && !idea.section.lead;
/** An outro the singer takes: the chorus's tail (a jam or a guitar-solo outro is the guitar's: no singing). */
export const isOutro = (idea: Idea) => idea.section?.kind === 'outro' && !idea.section.lead;
/** The section kinds the writer sings, as dials know them. */
export type SungKind = 'verse' | 'prechorus' | 'bridge' | 'interlude' | 'outro' | 'chorus';
export const kindOf = (idea: Idea): SungKind =>
  (isChorus(idea) ? 'chorus' : isPre(idea) ? 'prechorus' : isBridge(idea) ? 'bridge' : isInterlude(idea) ? 'interlude' : isOutro(idea) ? 'outro' : 'verse');
/** A kind whose sections of a song are one melody (a chorus, a pre-chorus, a bridge, an interlude, an outro): built from the song's last one, over each one's own chords. */
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
export const personalityOf = (idea: Idea, salt?: string): Personality => drawPersonality(salt ? `${idea.seeds.song}|${salt}` : idea.seeds.song, idea.song.genre, autoMood(idea.song, idea.seeds.song));
/** The chords of a section as a string (what a chorus's pitches follow). */
export const chordsKey = (idea: Idea) => idea.chords.timeline.map((e) => `${e.step}${e.chord.root}${e.chord.q}`).join(',');
/** The choruses of a song (of one length, tuned alike) are one hook: one melody, over each chorus's own chords. Pre-choruses likewise. */
export const hookSig = (idea: Idea, o: SectionOptions) =>
  `${idea.seeds.song}|${kindOf(idea)}|${idea.chords.chordIdx.length}|${Object.values(o.range).join(',')}|${o.bends}|${o.meta}|${o.variation}|${o.pentatonic ? 'pent' : ''}${o.seed ? `|${o.seed}` : ''}`;
/** The chorus (or pre-chorus) the others are built like: the song's last one of this hook (usually the fullest: the highest energy). */
export function chorusMaster(list: Idea[], idea: Idea, o: SectionOptions): Idea {
  const sig = hookSig(idea, o);
  for (let i = list.length - 1; i >= 0; i--) if (isShared(list[i]) && hookSig(list[i], o) === sig) return list[i];
  return idea;
}

/** The seed a verse is written from. */
export const verseSeed = (idea: Idea, o: SectionOptions) => `${idea.seeds.song}|${idea.seeds.chords}${o.seed ? `|${o.seed}` : ''}`;

/** The rules a pre-chorus takes from the verse it follows: its phrasing and small breaks are the verse's dice, so the two feel related. */
const BORROWED: Rule[] = ['phrases', 'small'];
function borrowedFrom(verse: Idea, o: SectionOptions): Partial<Record<Rule, string>> {
  const seed = verseSeed(verse, o);
  const leaves = planForm(verse.song.bars.length, o.meta, o.variation, seed);
  const seeds = leafSeeds(leaves, seed).get(leaves[0].id)!;
  return Object.fromEntries(BORROWED.map((r) => [r, seeds[r]]));
}

/** The rules an interlude or an outro takes from the chorus: its phrasing, chord notes and long notes, so it is the chorus heard again, shorter and sparser. */
const ECHOED: Rule[] = ['phrases', 'tones', 'holds'];
function echoedFrom(chorus: Idea, o: SectionOptions): Partial<Record<Rule, string>> {
  const seed = hookSig(chorus, o);
  const leaves = planForm(chorus.song.bars.length, o.meta, personalityOf(chorus, o.seed).chorusVariation, seed);
  const seeds = leafSeeds(leaves, seed).get(leaves[0].id)!;
  return Object.fromEntries(ECHOED.map((r) => [r, seeds[r]]));
}

/**
 * The melody over a section; `accents` are the band's (computed when left out). A chorus built `like` another (its master, with the
 * master's accents) writes with the master's seed, energy and accents, so its rhythm and shape are the master's, over its own chords.
 */
export function buildSection(idea: Idea, o: SectionOptions, accents: number[] = accentsOf(idea), like?: Idea, verse?: Idea, chorusIdea?: Idea): Built {
  const chorus = isShared(idea), p = personalityOf(idea, o.seed), kind = kindOf(idea);
  // (the master's tries: each leaf starts on the dice the master's ended on, so the choruses match)
  const tries = chorus && like ? buildSection(like, o, accents, undefined, verse, chorusIdea).tries : undefined;
  return buildVerse({
    key: idea.song.key, mode: idea.song.mode, genre: idea.song.genre, energy: (chorus && like ? like : idea).section?.energy ?? 3,
    chordAt: chordsOf(idea), acc: accents, changes: idea.chords.timeline.map((e) => e.step),
    bar: barOf(idea), bars: idea.song.bars.length, range: o.range, bends: o.bends, meta: o.meta, variation: kind === 'chorus' ? p.chorusVariation : o.variation,
    thirds: idea.song.bars.every((b) => b.len % 3 === 0), pentatonic: o.pentatonic,
    seed: chorus ? hookSig(idea, o) : verseSeed(idea, o), dials: o.pace ? paced(dialsFor(kind, p), idea.song.bpm) : dialsFor(kind, p), tries, borrow: kind === 'prechorus' && verse ? borrowedFrom(verse, o) : (kind === 'interlude' || kind === 'outro') && chorusIdea ? echoedFrom(chorusIdea, o) : undefined,
  });
}
