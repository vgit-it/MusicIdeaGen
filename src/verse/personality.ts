// A song's melodic personality (experiment): the choices that make one generated song's vocal sound unlike another's.
// Drawn once per song from the song seed, tilted (never forced) by genre and mood, each trait from its own stream so a trait
// added later leaves the others as they were. Every section then writes inside it: the verse and the chorus read the same
// personality, so a song hangs together, and two songs rarely share more than a trait or two.
// Nothing here is fixed: a trait is a weighted menu, and "none" (plain endings, level choruses...) is a real option.

import { Rng } from '../rng';
import { VERSE, END_STYLES, type Dials, type EndStyle } from './profile';
import type { ChordNote } from './verse';
import type { Variation } from './form';

export type Hook = 'chant' | 'anthem' | 'leap' | 'push';
export const HOOKS: Hook[] = ['chant', 'anthem', 'leap', 'push'];

export interface Personality {
  /** The chorus's hook: a chant on few notes, a long-note anthem, a leap and fall, or syncopated pushes. */
  hook: Hook;
  /** The chord note a chant leans on. */
  hookTone: ChordNote;
  /** Semitones the chorus sits above (or below) the verse. */
  chorusLift: number;
  /** The chorus's way of ending phrases: weights, and the chance (between the two) a phrase ends in a treatment at all. */
  chorusEnd: Record<EndStyle, number>;
  chorusEndChance: [number, number];
  /** The style the chorus ends in most. */
  chorusEndMain: EndStyle;
  /** How much the second half of a chorus changes. */
  chorusVariation: Variation;
  /** Times the chance of 16th runs in the chorus, on top of its hook's own. */
  chorusRuns: number;
  /** The verse: how busy, how long its notes hold, how often a bar moves, its phrase lengths, its endings, the chord note it leans on. */
  verseRuns: number;
  verseHold: number;
  verseMoves: number;
  verseBias: 'short' | 'mixed' | 'long';
  verseEndChance: [number, number];
  verseTone: ChordNote | 'any';
  /** Times the chances of bends, everywhere. */
  bends: number;
  /** The share of every chorus of the song with no vocals: 25-45%, mostly nearer 25. */
  chorusSilence: number;
  /** The pre-chorus: its share of silence (15-30%, mostly nearer 15), how far it climbs (semitones), the chance its last phrase leads into the chorus. */
  preSilence: number;
  preClimb: number;
  preLeadIn: number;
}

type Tilt = Partial<Record<string, number>>;

const HOOK_BY_GENRE: Record<string, Tilt> = {
  rock: { chant: 1, anthem: 1.6, leap: 1.2, push: 0.8 },
  pop: { chant: 0.8, anthem: 1, leap: 1.4, push: 1.3 },
  funk: { chant: 1, anthem: 0.3, leap: 0.8, push: 2.4 },
  hardrock: { chant: 1.2, anthem: 1.8, leap: 1, push: 0.6 },
  metal: { chant: 1.6, anthem: 1.4, leap: 0.7, push: 0.5 },
  grunge: { chant: 1.4, anthem: 1, leap: 1, push: 0.9 },
  altmetal: { chant: 1.4, anthem: 1.2, leap: 0.9, push: 0.8 },
};
const HOOK_BY_MOOD: Record<string, Tilt> = {
  happy: { push: 1.5, leap: 1.3 }, melancholic: { anthem: 1.5, leap: 1.4 }, nostalgic: { leap: 1.4, anthem: 1.3 },
  tense: { push: 1.4, chant: 1.3 }, angry: { chant: 1.7, push: 1.1 }, dreamy: { anthem: 1.5, leap: 1.3 },
  triumphant: { anthem: 1.8 }, dark: { chant: 1.5 },
};
const END_BY_GENRE: Record<string, Tilt> = {
  funk: { punch: 2.2, sync: 2, held: 0.5 }, pop: { sync: 1.4, open: 1.3 },
  hardrock: { held: 1.4, punch: 1.3 }, metal: { held: 1.4, punch: 1.5 }, grunge: { held: 1.3, hang: 1.3 }, altmetal: { punch: 1.3, hang: 1.2 },
};
const END_BY_MOOD: Record<string, Tilt> = {
  dreamy: { hang: 2, open: 1.5 }, melancholic: { hang: 1.8, open: 1.4 }, angry: { punch: 2 }, triumphant: { held: 2 },
  tense: { hang: 1.8 }, happy: { sync: 1.5 }, nostalgic: { open: 1.5, held: 1.2 }, dark: { hang: 1.4, punch: 1.2 },
};
const END_BASE: Record<EndStyle, number> = { held: 3, open: 1.6, hang: 1, punch: 1.4, sync: 1.2, plain: 1.5 };

const mul = (base: number, ...t: (number | undefined)[]) => t.reduce<number>((a, x) => a * (x ?? 1), base);

/** The song's personality: the same seed, genre and mood always give the same one. */
export function drawPersonality(seed: string, genre: string, mood: string): Personality {
  const r = (trait: string) => new Rng(`${seed}|personality|${trait}`);
  const hook = r('hook').weighted(HOOKS.map((h) => [h, mul(1, HOOK_BY_GENRE[genre]?.[h], HOOK_BY_MOOD[mood]?.[h])] as const));
  const hookTone = r('hooktone').weighted<ChordNote>([['root', 2], ['third', 1], ['fifth', 2]]);
  const intimate = ['melancholic', 'dreamy', 'nostalgic'].includes(mood);
  const big = ['triumphant', 'angry'].includes(mood);
  const chorusLift = r('lift').weighted<number>([[5, mul(0.35, big ? 1.6 : 1, intimate ? 0.5 : 1)], [3, 0.25], [0, mul(0.25, intimate ? 1.3 : 1)], [-2, mul(0.15, intimate ? 1.8 : 1, big ? 0.4 : 1)]]);
  const weights = Object.fromEntries(END_STYLES.map((s) => [s, mul(END_BASE[s], END_BY_GENRE[genre]?.[s], END_BY_MOOD[mood]?.[s])])) as Record<EndStyle, number>;
  const chorusEndMain = r('endmain').weighted(END_STYLES.map((s) => [s, weights[s]] as const));
  const chorusEnd = { ...weights, [chorusEndMain]: weights[chorusEndMain] * 3.5 };
  const lo = 0.25 + r('endlo').next() * 0.5;
  const chorusVariation = r('chorusvar').weighted<Variation>([['little', 0.45], ['some', 0.4], ['lots', 0.15]]);
  const vlo = 0.15 + r('vendlo').next() * 0.35;
  const chorusRuns = r('chorusruns').weighted([[0.4, 1], [0.7, 2], [1.1, 2], [1.8, 2]]);
  // (25-45% of the chorus without vocals: a square of a draw, so 25% is common and 45% rare)
  const chorusSilence = 0.25 + 0.2 * r('csilence').next() ** 2;
  const preSilence = 0.15 + 0.15 * r('presilence').next() ** 1.2;
  const preClimb = r('preclimb').weighted([[3, 1], [4, 2], [5, 3], [6, 2], [7, 1]]);
  const preLeadIn = r('prelead').weighted([[0.45, 1], [0.7, 2], [0.9, 1]]);
  return {
    preSilence, preClimb, preLeadIn,
    hook, hookTone, chorusLift, chorusEnd, chorusEndMain, chorusEndChance: [lo, Math.min(1, lo + 0.25)], chorusVariation, chorusRuns, chorusSilence,
    verseRuns: r('vruns').weighted([[0.6, 1], [0.85, 2], [1, 3], [1.25, 2], [1.5, 1]]) * (genre === 'funk' ? 1.3 : 1),
    verseHold: r('vhold').weighted([[0.2, 1], [0.3, 2], [0.4, 3], [0.55, 2], [0.7, 1]]),
    verseMoves: r('vmoves').weighted([[0.15, 1], [0.3, 2], [0.45, 1]]),
    verseBias: r('vbias').weighted<'short' | 'mixed' | 'long'>([['short', 1], ['mixed', 2], ['long', 1]]),
    verseEndChance: [vlo, Math.min(1, vlo + 0.35)],
    verseTone: r('vtone').weighted<ChordNote | 'any'>([['any', 3], ['root', 1], ['third', 1], ['fifth', 1]]),
    bends: r('bends').weighted([[0.5, 1], [0.8, 2], [1, 3], [1.3, 2], [1.7, 1]]),
  };
}

const BIAS: Record<Personality['verseBias'], Dials['phraseLen']> = { short: [0.3, 0.4, 0.2, 0.1], mixed: VERSE.phraseLen, long: [0.05, 0.2, 0.3, 0.45] };

const lean = (tone: ChordNote | 'any', by: number): Dials['toneW'] => (tone === 'any' ? [1, 1, 1] : [tone === 'root' ? by : 1, tone === 'third' ? by : 1, tone === 'fifth' ? by : 1]);

/** The hooks, as dials: how a chorus built on each moves. */
const HOOK_DIALS: Record<Hook, Partial<Dials>> = {
  chant: { phraseLen: [0.3, 0.4, 0.2, 0.1], breakBeats: [0.5, 0.3, 0.15, 0.05], runs: 0.6, runLen: [0.8, 0.2, 0], holdBar: 0.6, holdLen: [0.2, 0.3, 0.3, 0.2], holdTwice: 0.4, stretch: 0.4, opener: 0.5, moves: 0.1, neighbour: 0.05, walk: 0.3, third: 0.3, small: 0.4, push: 0.1 },
  anthem: { phraseLen: [0.03, 0.22, 0.3, 0.45], breakBeats: [0.2, 0.35, 0.25, 0.2], runs: 0.1, runLen: [1, 0, 0], holdBar: 0.85, holdLen: [0.05, 0.15, 0.4, 0.4], holdTwice: 0.5, stretch: 0.3, opener: 0.55, moves: 0.25, toneW: [1.4, 0.5, 1.2], neighbour: 0.1, walk: 0.9, third: 0.05, small: 0.3, push: 0 },
  leap: { phraseLen: [0.1, 0.4, 0.3, 0.2], holdBar: 0.75, holdLen: [0.1, 0.2, 0.4, 0.3], holdTwice: 0.4, stretch: 0.45, opener: 0.55, moves: 0.85, toneW: [0.7, 0.7, 1.4], neighbour: 0.45, walk: 0.9, runs: 0.8, third: 0.1, small: 0.8, push: 0.05 },
  push: { phraseLen: [0.1, 0.3, 0.3, 0.3], breakBeats: [0.6, 0.3, 0.07, 0.03], runs: 1.2, runLen: [0.5, 0.35, 0.15], holdBar: 0.6, holdLen: [0.15, 0.25, 0.4, 0.2], holdTwice: 0.4, stretch: 0.3, opener: 0.4, moves: 0.35, neighbour: 0.35, walk: 0.5, third: 0.05, small: 0.9, push: 0.55 },
};

/** The dials a section kind writes with, in this song's personality. */
export function dialsFor(kind: 'verse' | 'prechorus' | 'chorus', p: Personality): Dials {
  if (kind === 'prechorus') {
    // (between the verse and the chorus: tighter phrases, a little busier, a few long notes, the line climbing and leading into the chorus)
    return {
      ...VERSE, phraseLen: [0.3, 0.45, 0.2, 0.05], breakBeats: [0.55, 0.3, 0.1, 0.05], runs: Math.max(0.9, p.verseRuns * 1.25), holdBar: 0.35, holdLen: [0.4, 0.25, 0.25, 0.1],
      stretch: 0.15, opener: 0.2, moves: 0.4, neighbour: 0.35, walk: 0.8, end: [0.3, 0.6], endStyle: { held: 2, open: 2, hang: 1, punch: 0, sync: 0.6, plain: 1 },
      lift: 2, bends: p.bends * 1.5, silence: p.preSilence, climb: p.preClimb, leadIn: p.preLeadIn,
    };
  }
  if (kind === 'chorus') {
    const h: Partial<Dials> = { ...HOOK_DIALS[p.hook] };
    if (p.hook === 'chant') h.toneW = lean(p.hookTone, 3);
    h.runs = (h.runs ?? 1) * p.chorusRuns;
    return { ...VERSE, ...h, end: p.chorusEndChance, endStyle: p.chorusEnd, lift: p.chorusLift, bends: p.bends * 3.2, silence: p.chorusSilence };
  }
  return {
    ...VERSE, phraseLen: BIAS[p.verseBias], runs: p.verseRuns, holdBar: p.verseHold, moves: p.verseMoves, toneW: lean(p.verseTone, 2.2),
    end: p.verseEndChance, bends: p.bends,
  };
}

const TONE: Record<string, string> = { root: 'root', third: '3rd', fifth: '5th' };

/** One line for the card: what this song drew. */
export function describe(p: Personality): string {
  const lift = p.chorusLift > 0 ? `${p.chorusLift} semitones above the verse` : p.chorusLift < 0 ? 'under the verse' : 'level with the verse';
  const hook = p.hook === 'chant' ? `chant on the ${TONE[p.hookTone]}` : p.hook === 'push' ? 'pushed rhythm' : p.hook === 'leap' ? 'leap and fall' : 'long-note anthem';
  return [
    `Hook: ${hook}`,
    `chorus ${lift}, ${p.chorusEndMain === 'plain' ? 'phrases mostly just stop' : `phrases mostly end ${{ held: 'held', open: 'open (3rd or 5th)', hang: 'hanging (off the chord)', punch: 'short and punched', sync: 'syncopated' }[p.chorusEndMain]}`} (${Math.round(100 * p.chorusEndChance[0])}–${Math.round(100 * p.chorusEndChance[1])}% of them), answers ${p.chorusVariation === 'little' ? 'barely change' : p.chorusVariation === 'some' ? 'change some' : 'change a lot'}`,
    `verse ${p.verseBias} phrases, ${p.verseRuns < 0.8 ? 'few' : p.verseRuns > 1.1 ? 'many' : 'some'} 16th runs, ${p.verseHold < 0.3 ? 'few' : p.verseHold > 0.5 ? 'many' : 'some'} long notes${p.verseTone === 'any' ? '' : `, leans on the ${TONE[p.verseTone]}`}`,
    `${Math.round(100 * p.chorusSilence)}% of the chorus without vocals`,
    `pre-chorus climbs ${p.preClimb} semitones, ${Math.round(100 * p.preSilence)}% silent${p.preLeadIn >= 0.7 ? ', usually leads into the chorus' : ''}`,
    `bends ${p.bends < 0.8 ? 'rare' : p.bends > 1.2 ? 'frequent' : 'ordinary'}`,
  ].join(' · ');
}
