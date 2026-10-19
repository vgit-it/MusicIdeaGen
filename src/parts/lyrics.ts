// Pseudo-English lyrics (research: docs/VOCAL.md): words that sound like English without being English,
// for the demo singer. What makes nonsense sound English rather than Italian or Icelandic: closed
// syllables (most end on a consonant), English clusters (str-, bl-, -nd, -st), short reduced
// "function" syllables on the weak beats (the, a, in, my...), stressed syllables on the strong beats,
// mostly one-syllable words and strong-weak two-syllable ones, a rhyme at the end of every other line,
// a chorus hook that comes back word for word, and the odd "yeah" or "oh". Vowels suit the notes (open
// ones on long and high notes, as singers do) and lean toward the mood (bright ee/ay when happy, dark
// oh/oo when sad, hard consonants when angry).

import type { Genre } from '../genres';
import type { Rng } from '../rng';
import type { Mood } from '../tension';
import bankData from './wordbank.json';

/** Phonemes (ARPAbet-like): vowels and diphthongs, then consonants. */
export type Vowel = 'IY' | 'IH' | 'EY' | 'EH' | 'AE' | 'AA' | 'AO' | 'OW' | 'UH' | 'UW' | 'AH' | 'AX' | 'AY' | 'AW' | 'OY' | 'ER';
export type Cons = 'P' | 'B' | 'T' | 'D' | 'K' | 'G' | 'M' | 'N' | 'NG' | 'F' | 'V' | 'TH' | 'DH' | 'S' | 'Z' | 'SH'
  | 'CH' | 'JH' | 'HH' | 'L' | 'R' | 'W' | 'Y'
  /** The flap (a quick voiced tap of the tongue: the t and d in "water", "better", "city"); only written by real words, not by the made-up ones. */
  | 'DX';

export interface Syllable {
  onset: Cons[];
  vowel: Vowel;
  coda: Cons[];
  stress: boolean;
  /** How it's spelled (for the lyric line). */
  text: string;
  /** Starts a word (spaces go before it). */
  wordStart: boolean;
  /** The l or n carries the syllable, with hardly a vowel before it ("little", "button"); left out: an ordinary syllable. */
  syllabic?: boolean;
  /** Part of a real word from the word bank (its spelling is what is sung: not reopened or rhymed by rewriting its sounds). */
  real?: boolean;
}

/** What the melody asks of a syllable: on a strong beat, held, high in the singer's range. */
export interface LyricSlot {
  stress: boolean;
  long: boolean;
  high: boolean;
}

export interface LyricStyle {
  mood: Mood;
  genre: Genre;
  /** Real words from the word bank (docs/VOICE-WORDS.md) in place of made-up ones, picked by syllables, stress and sound, not meaning. */
  real?: boolean;
}

type W<T> = [T, number][];

// onsets, roughly by how often English uses them (single consonants, then clusters; w and y fewer:
// sung, they glide, and too many made the words all "wo" and "ye", Paul)
const ONSETS: W<Cons[]> = [
  [['N'], 6], [['T'], 6], [['D'], 5], [['S'], 5], [['L'], 5], [['R'], 4], [['M'], 5], [['K'], 4], [['W'], 2], [['B'], 4],
  [['HH'], 3], [['F'], 3], [['P'], 3], [['G'], 2], [['V'], 1.5], [['Y'], 0.7], [['SH'], 1.5], [['CH'], 1], [['JH'], 1], [['TH'], 0.8], [['Z'], 0.4],
  [['B', 'L'], 1], [['B', 'R'], 1.2], [['K', 'L'], 0.8], [['K', 'R'], 1], [['D', 'R'], 1], [['F', 'L'], 1], [['F', 'R'], 1.2], [['G', 'L'], 0.6], [['G', 'R'], 1],
  [['P', 'L'], 0.8], [['P', 'R'], 0.8], [['T', 'R'], 1.2], [['TH', 'R'], 0.5], [['S', 'T'], 1.2], [['S', 'L'], 0.8], [['S', 'P'], 0.7], [['S', 'K'], 0.5],
  [['S', 'M'], 0.4], [['S', 'N'], 0.4], [['S', 'W'], 0.3], [['K', 'W'], 0.2], [['T', 'W'], 0.15], [['S', 'T', 'R'], 0.5], [['S', 'P', 'R'], 0.2], [['S', 'K', 'R'], 0.2],
];

// codas: most English syllables are closed; clusters fall in sonority (n before d, l before t...)
const CODAS: W<Cons[]> = [
  [['N'], 8], [['T'], 6], [['D'], 5], [['S'], 4], [['Z'], 3], [['L'], 5], [['M'], 3], [['K'], 3], [['NG'], 2], [['V'], 1], [['F'], 1], [['P'], 1], [['G'], 0.8],
  [['TH'], 0.4], [['SH'], 0.5], [['CH'], 0.5],
  [['N', 'D'], 3], [['N', 'T'], 2], [['N', 'Z'], 1], [['NG', 'K'], 0.8], [['L', 'D'], 1.2], [['L', 'T'], 0.6], [['S', 'T'], 1.5], [['F', 'T'], 0.5],
  [['K', 'S'], 0.6], [['T', 'S'], 0.6], [['M', 'Z'], 0.4], [['L', 'Z'], 0.5], [['R', 'D'], 0.6], [['R', 'T'], 0.5], [['R', 'N'], 0.5], [['R', 'Z'], 0.3], [['N', 'CH'], 0.3],
];

// stressed vowels (songs lean on eye, ee, oh, ay, oo; the gliding ones, eye, ay, oh, ow, a little less
// than before: each ends in a y or a w, and together they made the language all glides, Paul)
const VOWELS: W<Vowel> = [
  [['IH'][0] as Vowel, 6], ['EH', 4], ['AE', 3], ['AH', 3], ['AA', 3], ['AY', 3.5], ['IY', 4], ['EY', 2.8], ['OW', 3], ['UW', 3], ['AW', 0.8], ['AO', 1.5], ['UH', 0.8], ['OY', 0.3],
];

/** Vowels that sing well held and high (closed ee and oo open up toward ay/ih and oh). */
const OPEN: Vowel[] = ['AA', 'AY', 'OW', 'EY', 'AO', 'AW', 'EH', 'AH', 'AE'];

/** Light "function" syllables for the weak beats and pickups (the, a, in, my, to...). */
const FUNCTION: W<[Cons[], Vowel, Cons[], string]> = [
  [[['DH'], 'AX', [], 'the'], 6], [[[], 'AX', [], 'a'], 4], [[[], 'IH', ['N'], 'in'], 3], [[[], 'AX', ['N'], 'an'], 3], [[['T'], 'AX', [], 'ta'], 2],
  [[['Y'], 'AX', [], 'ya'], 0.8], [[['M'], 'AY', [], 'my'], 2.5], [[[], 'AY', [], 'I'], 2], [[[], 'IH', ['T'], 'it'], 1.5], [[[], 'IH', ['Z'], 'is'], 1.5],
  [[[], 'AX', ['V'], 'of'], 1], [[[], 'AA', ['N'], 'on'], 1], [[['D'], 'AX', [], 'da'], 1.5], [[['N'], 'AX', [], 'na'], 1], [[['W'], 'IY', [], 'we'], 0.5],
  [[['S'], 'OW', [], 'so'], 1], [[['B'], 'AX', [], 'ba'], 0.8], [[['L'], 'AX', [], 'la'], 0.8],
];

/** Weak second syllables of a strong-weak word (BA-by, NE-ver, MO-ving, LI-ttle). */
const WEAK_END: W<[Cons[], Vowel, Cons[], string]> = [
  [[['B'], 'IY', [], 'by'], 1], [[['V'], 'AX', ['R'], 'ver'], 1.5], [[['D'], 'AX', ['R'], 'der'], 1], [[['T'], 'AX', ['L'], 'tle'], 1], [[['N'], 'IH', ['NG'], 'ning'], 1.2],
  [[['L'], 'IY', [], 'ly'], 1.2], [[['R'], 'IY', [], 'ry'], 1], [[['D'], 'IH', ['N'], 'din'], 0.8], [[['M'], 'AX', ['N'], 'man'], 0.6], [[['L'], 'AX', ['S'], 'less'], 0.6],
  [[['T'], 'IH', ['NG'], 'ting'], 0.8], [[['Z'], 'AX', ['N'], 'zen'], 0.4], [[['S'], 'AX', ['N'], 'sen'], 0.6], [[['K'], 'IY', [], 'ky'], 0.5], [[['W'], 'AX', ['Y'], 'way'], 0],
];

/** Fillers between lines (real, but universal in pop: they make it feel like English). */
const FILLERS: W<[Cons[], Vowel, Cons[], string][]> = [
  [[[['Y'], 'EH', [], 'yeah']], 3], [[[[], 'OW', [], 'oh']], 3], [[[['W'], 'OW', [], 'whoa']], 1.5], [[[[], 'UW', [], 'ooh']], 1.5], [[[['HH'], 'EY', [], 'hey']], 1],
  [[[[], 'OW', [], 'oh'], [['Y'], 'EH', [], 'yeah']], 1],
];

/** How the mood leans the sounds (a nudge on the odds, not a rule: the evidence is modest). */
const MOOD_VOWELS: Record<Mood, Partial<Record<Vowel, number>>> = {
  happy: { IY: 1.5, EY: 1.5, AY: 1.3, IH: 1.2, OW: 0.8, UW: 0.7 },
  melancholic: { OW: 1.6, UW: 1.5, AW: 1.5, AH: 1.2, IY: 0.7, AE: 0.7 },
  nostalgic: { OW: 1.4, EY: 1.3, AA: 1.2, AY: 1.2 },
  tense: { IH: 1.4, IY: 1.2, EH: 1.2, OW: 0.8 },
  angry: { AY: 1.4, AA: 1.3, AE: 1.3, EY: 1.2, UW: 0.6 },
  dreamy: { UW: 1.5, OW: 1.5, AA: 1.3, AY: 1.2, IH: 0.7, AE: 0.6 },
  triumphant: { AY: 1.5, EY: 1.4, AA: 1.3, OW: 1.2 },
  dark: { OW: 1.5, UW: 1.4, AA: 1.3, AO: 1.4, IY: 0.6, EY: 0.8 },
};
const HARD: Cons[] = ['K', 'T', 'P', 'S', 'SH', 'CH', 'G', 'D', 'B'];
const SOFT: Cons[] = ['L', 'M', 'N', 'W', 'HH', 'Y', 'R'];
const MOOD_CONS: Record<Mood, { hard: number; cluster: number; closed: number }> = {
  happy: { hard: 1, cluster: 1, closed: 0.55 },
  melancholic: { hard: 0.6, cluster: 0.6, closed: 0.5 },
  nostalgic: { hard: 0.8, cluster: 0.8, closed: 0.5 },
  tense: { hard: 1.3, cluster: 1.2, closed: 0.65 },
  angry: { hard: 1.6, cluster: 1.5, closed: 0.7 },
  dreamy: { hard: 0.5, cluster: 0.5, closed: 0.4 },
  triumphant: { hard: 1, cluster: 1, closed: 0.55 },
  dark: { hard: 1, cluster: 0.9, closed: 0.6 },
};

/** Words that must never come out (random syllables do hit real words). */
const BLOCKED = /fuck|shit|cunt|nig|fag|slut|whor|rape|dick|cock|piss|bitch|twat|wank|tits|spic|kike|chink|coon|dyke|porn|nazi|sex/;

const weighted = <T>(rng: Rng, items: W<T>, f: (x: T) => number = () => 1): T =>
  rng.weighted(items.map(([x, w]) => [x, w * f(x)] as [T, number]));

// where one syllable meets the next: the end of one and the start of the next are sung as one run
// of consonants, so some meetings smear or trip the tongue ("-st str-", "-t t-", "-s sh-", "-ng g-").
// A nudge on the odds while picking, and the line with the fewest bad meetings is kept.
const SIBILANT: Cons[] = ['S', 'Z', 'SH', 'CH', 'JH'];
const PAIRS: Cons[][] = [['P', 'B'], ['T', 'D'], ['K', 'G'], ['F', 'V'], ['TH', 'DH'], ['S', 'Z'], ['CH', 'JH'], ['M', 'N']];
const AWKWARD = new Set(['NG G', 'NG K', 'TH S', 'TH Z', 'S TH', 'Z TH', 'DH S', 'S DH', 'TH DH', 'DH TH', 'F TH', 'TH F', 'V DH', 'L R', 'R L', 'T TH', 'D DH']);

/** How well `next` follows `prev` (1: fine, toward 0: hard to sing or smeared). */
function seam(prev: Syllable | undefined, next: { onset: Cons[]; vowel: Vowel; coda: Cons[] }): number {
  if (!prev) return 1;
  const a = prev.coda[prev.coda.length - 1], b = next.onset[0];
  let f = 1;
  const run = prev.coda.length + next.onset.length;
  if (run > 3) f *= 0.05;
  else if (run === 3) f *= 0.4;
  if (a && b) {
    if (a === b) f *= 0.1;
    else if (PAIRS.some((p) => p.includes(a) && p.includes(b))) f *= 0.3;
    else if (SIBILANT.includes(a) && SIBILANT.includes(b)) f *= 0.25;
    if (AWKWARD.has(`${a} ${b}`)) f *= 0.2;
  }
  // two vowels meeting (a-I, my-a): fine now and then, not often
  if (!a && !b) f *= 0.5;
  // the same vowel twice in a row (not the light "a"), or the same syllable again
  if (next.vowel === prev.vowel && next.vowel !== 'AX') f *= 0.4;
  if (next.vowel === prev.vowel && next.onset.join() === prev.onset.join() && next.coda.join() === prev.coda.join()) f *= 0.1;
  return f;
}

/** How rough a line is: the bad meetings in it, worst counted most. */
const roughness = (line: Syllable[]) => line.reduce((sum, s, i) => sum + (i ? 1 - seam(line[i - 1], s) : 0), 0);

// spelling: consonants, and vowels as they'd be written open (no coda) or closed
const CONS_TEXT: Record<Cons, string> = {
  P: 'p', B: 'b', T: 't', D: 'd', K: 'k', G: 'g', M: 'm', N: 'n', NG: 'ng', F: 'f', V: 'v', TH: 'th', DH: 'th', S: 's', Z: 'z', SH: 'sh',
  CH: 'ch', JH: 'j', HH: 'h', L: 'l', R: 'r', W: 'w', Y: 'y', DX: 't',
};
const VOWEL_OPEN: Record<Vowel, string> = {
  IY: 'ee', IH: 'i', EY: 'ay', EH: 'eh', AE: 'a', AA: 'ah', AO: 'aw', OW: 'o', UH: 'oo', UW: 'oo', AH: 'uh', AX: 'a', AY: 'y', AW: 'ow', OY: 'oy', ER: 'er',
};
const VOWEL_CLOSED: Record<Vowel, string> = {
  IY: 'ee', IH: 'i', EY: 'a', EH: 'e', AE: 'a', AA: 'o', AO: 'au', OW: 'o', UH: 'oo', UW: 'oo', AH: 'u', AX: 'e', AY: 'i', AW: 'ou', OY: 'oi', ER: 'ur',
};

function spellSyl(onset: Cons[], vowel: Vowel, coda: Cons[]): string {
  const on = onset.map((c, i) => (c === 'K' && i === 0 && onset.length === 1 && ['AA', 'AO', 'OW', 'UH', 'AH', 'AE'].includes(vowel) ? 'c' : CONS_TEXT[c])).join('');
  if (!coda.length) return on + (vowel === 'AY' ? (!on ? 'eye' : on.endsWith('y') ? 'ai' : 'y') : VOWEL_OPEN[vowel]);
  const cd = coda.map((c) => CONS_TEXT[c]).join('');
  // long vowels before one consonant: the silent e (line, rode, made)
  if (['AY', 'OW', 'EY'].includes(vowel) && coda.length === 1 && !['NG', 'R', 'W', 'Y'].includes(coda[0])) return on + VOWEL_CLOSED[vowel] + cd + 'e';
  return on + VOWEL_CLOSED[vowel] + cd;
}

const syl = (onset: Cons[], vowel: Vowel, coda: Cons[], stress: boolean, wordStart: boolean, text?: string): Syllable =>
  ({ onset, vowel, coda, stress, wordStart, text: text ?? spellSyl(onset, vowel, coda) });

/** A stressed (content) syllable: an onset, a full vowel, usually a coda; open and sonorant on long and high notes. */
function strong(rng: Rng, slot: LyricSlot, style: LyricStyle, avoid?: Vowel, prev?: Syllable): Syllable {
  const mv = MOOD_VOWELS[style.mood], mc = MOOD_CONS[style.mood];
  const funk = style.genre === 'funk';
  const consBias = (cs: Cons[]) => (cs.length > 1 ? mc.cluster : 1) * (HARD.includes(cs[0]) ? mc.hard * (funk ? 1.3 : 1) : SOFT.includes(cs[0]) ? 1 / mc.hard : 1);
  // (no onset after an open syllable would make two vowels meet: rarer)
  const onset = rng.chance(prev && !prev.coda.length ? 0.94 : 0.88) ? weighted(rng, ONSETS, (cs) => consBias(cs) * seam(prev, { onset: cs, vowel: 'AX', coda: [] })) : [];
  const sustain = slot.long || slot.high;
  let vowel = weighted(rng, VOWELS, (v) => (mv[v] ?? 1) * (sustain && !OPEN.includes(v) ? 0.15 : 1) * (v === avoid ? 0.2 : 1) * (prev && v === prev.vowel ? 0.4 : 1));
  if (sustain && (vowel === 'IY' || vowel === 'UW')) vowel = vowel === 'IY' ? 'EY' : 'OW';
  // held notes end on a sung consonant (n, m, l, nd) or none; quick ones close more often
  let coda: Cons[] = [];
  if (rng.chance(sustain ? mc.closed * 0.6 : mc.closed)) {
    coda = weighted(rng, CODAS, (cs) => (sustain ? (['N', 'M', 'L', 'NG'].includes(cs[0]) ? 2 : 0.4) : 1) * (cs.length > 1 ? mc.cluster : 1) * (HARD.includes(cs[cs.length - 1]) ? mc.hard : 1));
  }
  if (coda[0] === 'NG' && !['IH', 'AE', 'AH', 'AA', 'EH', 'AO'].includes(vowel)) coda = ['N'];
  return syl(onset, vowel, coda, true, true);
}

const fromList = (e: [Cons[], Vowel, Cons[], string], stress: boolean, wordStart: boolean) => syl(e[0], e[1], e[2], stress, wordStart, e[3]);
/** A light syllable from a list, leaning away from ones that meet `prev` badly. */
const pick = (rng: Rng, list: W<[Cons[], Vowel, Cons[], string]>, prev: Syllable | undefined, stress: boolean, wordStart: boolean) =>
  fromList(weighted(rng, list, (e) => seam(prev, { onset: e[0], vowel: e[1], coda: e[2] })), stress, wordStart);

/* ---- real words (docs/VOICE-WORDS.md): a bank of words picked by how they sing, not by what they mean */

interface BankWord { text: string; parts: string[]; syl: Syllable[]; /** Which syllable carries the stress. */ at: number }
type BankRow = [Cons[], Vowel, Cons[], number, number?];
/** The bank by shape: S one syllable, Sw BA-by, wS a-WAY, Sww BEAU-ti-ful, wSw to-MOR-row (scripts/word-bank.ts). */
const BANK = new Map<string, BankWord[]>();
for (const [text, rows] of bankData as unknown as [string, BankRow[]][]) {
  const parts = text.split('-');
  const shape = rows.map((r) => (r[3] ? 'S' : 'w')).join('');
  const syl = rows.map((r, k): Syllable => ({ onset: r[0], vowel: r[1], coda: r[2], stress: !!r[3], text: parts[k] ?? '', wordStart: k === 0, real: true, ...(r[4] ? { syllabic: true } : {}) }));
  const list = BANK.get(shape) ?? [];
  list.push({ text, parts, syl, at: rows.findIndex((r) => r[3]) });
  BANK.set(shape, list);
}
const sameRhyme = (s: Syllable, r: Rhyme) => s.vowel === r.vowel && s.coda.join() === r.coda.join();
/** Real words wanted, unless the page is opened with ?words=made (the earlier made-up words, to compare). */
const REAL_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('words') === 'made';
const useReal = (style: LyricStyle) => !!style.real && !REAL_OFF;
/** The light words that are real words (the made-up ta, da, na... left out). */
const FUNCTION_REAL = FUNCTION.filter(([e]) => !['ta', 'ya', 'da', 'na', 'ba', 'la'].includes(e[3]));
// (sounds the singer tells apart less well: a little less often; the quiz, docs/VOICE-WORDS.md)
const CLEAR: Partial<Record<Cons, number>> = { V: 0.7, TH: 0.7, DH: 0.8, F: 0.85 };
const STAYS: Cons[] = ['N', 'M', 'L', 'NG', 'R', 'Z', 'V'];

/**
 * A word of this shape, by its sounds: the stressed vowel leaning with the mood (and open on a held or high note), the first
 * sound hard or soft with the mood, a clean meeting with the syllable before, not the vowel just sung, not a word used already,
 * and, for a rhyme, the stressed vowel and ending the rhyme asks for.
 */
function pickWord(rng: Rng, shape: string, o: { style: LyricStyle; sustain: boolean; prev?: Syllable; lastV?: Vowel; used: Set<string>; rhyme?: Rhyme | null }): BankWord | null {
  let list = BANK.get(shape);
  if (!list?.length) return null;
  const r = o.rhyme;
  if (r) {
    const exact = list.filter((w) => sameRhyme(w.syl[w.at], r));
    const vowel = list.filter((w) => w.syl[w.at].vowel === r.vowel);
    list = exact.length ? exact : vowel.length ? vowel : list;
  }
  const mv = MOOD_VOWELS[o.style.mood], mc = MOOD_CONS[o.style.mood];
  const count: Partial<Record<Vowel, number>> = {};
  for (const w of list) { const v = w.syl[w.at].vowel; count[v] = (count[v] ?? 0) + 1; }
  const items: W<BankWord> = list.map((w) => {
    const st = w.syl[w.at], first = w.syl[0];
    let f = ((VOWELS.find(([v]) => v === st.vowel)?.[1] ?? 1.2) * (mv[st.vowel] ?? 1)) / Math.sqrt(count[st.vowel]!);
    if (o.sustain) {
      if (!OPEN.includes(st.vowel)) f *= 0.15;
      if (st.coda.length) f *= STAYS.includes(st.coda[st.coda.length - 1]) ? 2 : 0.4;
    }
    const on = first.onset[0];
    if (on) f *= HARD.includes(on) ? mc.hard * (o.style.genre === 'funk' ? 1.3 : 1) : SOFT.includes(on) ? 1 / mc.hard : 1;
    if (st.onset.length > 1 || st.coda.length > 1) f *= mc.cluster;
    for (const x of w.syl) for (const c of [...x.onset, ...x.coda]) f *= CLEAR[c] ?? 1;
    f *= seam(o.prev, first);
    if (st.vowel === o.lastV) f *= 0.2;
    if (o.used.has(w.text)) f *= 0.05;
    return [w, f];
  });
  return rng.weighted(items);
}
/** A bank word as syllables on a line (its stressed syllable stressed or not as the line asks). */
const placeWord = (w: BankWord, stress: boolean, start: boolean): Syllable[] =>
  w.syl.map((x, k) => ({ ...x, onset: x.onset.slice(), coda: x.coda.slice(), stress: k === w.at ? stress : false, wordStart: k === 0 ? start : false }));

/** A sung line of real words, a syllable per note: a strong note starts a word, the weak notes after it end it or are light words (the, in, my...). */
function realLine(rng: Rng, slots: LyricSlot[], style: LyricStyle, opts: { rhyme?: Rhyme | null; hook?: Syllable[] }): Syllable[] {
  let best: Syllable[] | null = null, bestRough = Infinity;
  const n = slots.length, lastStress = slots.map((x) => x.stress).lastIndexOf(true);
  for (let tries = 0; tries < 6; tries++) {
    const out: Syllable[] = [];
    const used = new Set<string>();
    const prev = () => out[out.length - 1];
    let lastV: Vowel | undefined;
    let i = 0;
    if (opts.hook) for (const h of opts.hook) if (i < n) out.push({ ...h }), i++;
    const fns = (k: number) => {
      if (k === 2) { for (const e of weighted(rng, FN_PAIRS)) out.push(fromList(e, false, true)); return; }
      for (let q = 0; q < k; q++) out.push(pick(rng, FUNCTION_REAL, prev(), false, true));
    };
    /** A word of this shape from slot `from`; false if the bank has none. */
    const word = (shape: string, from: number): boolean => {
      const k = from + (shape[0] === 'w' ? 1 : 0);
      const w = pickWord(rng, shape, { style, sustain: slots[k].long || slots[k].high, prev: prev(), lastV, used, rhyme: k === lastStress ? opts.rhyme : null });
      if (!w) return false;
      used.add(w.text);
      lastV = w.syl[w.at].vowel;
      out.push(...placeWord(w, slots[k].stress, true));
      return true;
    };
    while (i < n) {
      let lead = false;
      if (!slots[i].stress) {
        // a pickup, or a weak-strong word (a-WAY) leading into the next strong note
        if (slots[i + 1]?.stress && rng.chance(0.3)) lead = true;
        else { out.push(pick(rng, FUNCTION_REAL, prev(), false, true)); i++; continue; }
      }
      const s0 = lead ? i + 1 : i;
      let j = s0 + 1;
      while (j < n && !slots[j].stress) j++;
      const weak = j - s0 - 1;
      let shape = lead ? (weak >= 1 && rng.chance(0.4) ? 'wSw' : 'wS') : weak === 0 ? 'S' : weak === 1 ? (rng.chance(0.65) ? 'Sw' : 'S') : rng.weighted<string>([['Sww', 0.3], ['Sw', 0.35], ['S', 0.35]]);
      if (!word(shape, i)) { shape = lead ? 'wS' : 'S'; if (!word(shape, i)) { out.push(syl([], 'OW', [], slots[s0].stress, true, 'oh')); if (lead) out.push(syl([], 'OW', [], false, true, 'oh')); } }
      i += shape.length;
      // (the weak notes left after the word: light words)
      const left = j - i;
      if (left > 0) { fns(left); i = j; }
    }
    if (BLOCKED.test(spell(out).toLowerCase().replace(/[^a-z]/g, ''))) continue;
    const r = roughness(out);
    if (r < 0.75) return out;
    if (r < bestRough) best = out, bestRough = r;
  }
  return best ?? slots.map((x) => syl([], x.long ? 'OW' : 'AX', [], x.stress, true, x.long ? 'oh' : 'a'));
}

/** The rhyme of a syllable (its vowel and what follows). */
export interface Rhyme { vowel: Vowel; coda: Cons[] }
export const rhymeOf = (line: Syllable[]): Rhyme | null => {
  const last = [...line].reverse().find((s) => s.stress);
  return last ? { vowel: last.vowel, coda: last.coda } : null;
};

/**
 * Words for one sung line, a syllable per note. Strong notes start content words (one syllable, or a
 * strong-weak pair, now and then a weak-strong one like "a-WAY"); weak notes left over get light
 * function syllables. `rhyme`: the last strong syllable takes this vowel and ending. `hook`: these
 * syllables go first, exactly (the chorus title).
 */
export function lyricLine(rng: Rng, slots: LyricSlot[], style: LyricStyle, opts: { rhyme?: Rhyme | null; hook?: Syllable[] } = {}): Syllable[] {
  if (useReal(style)) return realLine(rng, slots, style, opts);
  let best: Syllable[] | null = null, bestRough = Infinity;
  for (let tries = 0; tries < 6; tries++) {
    const out: Syllable[] = [];
    const prev = () => out[out.length - 1];
    let i = 0;
    if (opts.hook) {
      for (const h of opts.hook) if (i < slots.length) out.push({ ...h }), i++;
    }
    let lastV: Vowel | undefined;
    // words by feet: a strong note and the weak ones after it make a word (BA-by, NE-ver-the) or a
    // word and a light syllable; weak notes before the first strong one are pickups (the, a, my)
    const content = (k: number, stress: boolean, start: boolean) => {
      const w = strong(rng, { ...slots[k], stress }, style, lastV, prev());
      w.stress = stress;
      w.wordStart = start;
      lastV = w.vowel;
      return w;
    };
    while (i < slots.length) {
      if (!slots[i].stress) {
        // a pickup, or a weak-strong word (a-WAY) leading into the next strong note
        if (slots[i + 1]?.stress && rng.chance(0.18)) {
          out.push(syl([], 'AX', [], false, true, 'a'));
          out.push(content(i + 1, true, false));
          i += 2;
        } else { out.push(pick(rng, FUNCTION, prev(), false, true)); i++; }
        continue;
      }
      let j = i + 1;
      while (j < slots.length && !slots[j].stress) j++;
      const weak = j - i - 1;
      const w = content(i, true, true);
      out.push(w);
      if (weak === 0) { i = j; continue; }
      const trochee = rng.chance(weak === 1 ? 0.65 : 0.75);
      if (trochee) {
        // (often opened into the next syllable, but not always: English keeps many syllables closed,
        // and all-open ones, "ly ni ry", sound less like it)
        if (w.coda.length && rng.chance(0.45)) { w.coda = []; w.text = spellSyl(w.onset, w.vowel, []); }
        out.push(pick(rng, WEAK_END, prev(), false, false));
      } else out.push(pick(rng, FUNCTION, prev(), false, true));
      // longer runs of weak notes: alternate a light syllable and a lightly stressed word
      for (let k = i + 2; k < j; k++) {
        out.push((k - i) % 2 === 0 && k + 1 < j ? pick(rng, FUNCTION, prev(), false, true) : content(k, false, true));
      }
      i = j;
    }
    // the rhyme on the line's last strong syllable
    if (opts.rhyme) {
      const last = [...out].reverse().find((x) => x.stress);
      if (last && !opts.hook?.includes(last)) {
        last.vowel = opts.rhyme.vowel;
        last.coda = [...opts.rhyme.coda];
        last.text = spellSyl(last.onset, last.vowel, last.coda);
      }
    }
    if (BLOCKED.test(spell(out).toLowerCase().replace(/[^a-z]/g, ''))) continue;
    // smooth enough: keep it; else try again and keep the smoothest
    const r = roughness(out);
    if (r < 0.75) return out;
    if (r < bestRough) best = out, bestRough = r;
  }
  if (best) return best;
  return slots.map((s) => syl([], s.long ? 'OW' : 'AX', [], s.stress, true, s.long ? 'oh' : 'a'));
}

/** A syllable of a line written words first (docs/VOCAL-WORDS.md): how much weight it carries, and what follows it. */
export interface WordSyl extends Syllable {
  /** 0: light, 1: lightly stressed, 2: stressed, 3: the line's key word. */
  level: number;
  /** After it: 0 inside a word, 1 a word's end, 2 a word group's end, 3 a clause's end (where a breath may go). */
  brk: number;
}

/** Light first syllables of a weak-strong word (a-WAY, be-FORE, to-NIGHT, re-MAIN). */
const WEAK_START: W<[Cons[], Vowel, Cons[], string]> = [
  [[[], 'AX', [], 'a'], 3], [[['B'], 'IH', [], 'be'], 2], [[['R'], 'IH', [], 're'], 1.5], [[['T'], 'AX', [], 'to'], 1.5], [[['F'], 'AX', ['R'], 'for'], 1],
  [[['D'], 'IH', [], 'de'], 0.8], [[[], 'AX', ['N'], 'un'], 0.6],
];
/** Light middle syllables of a strong-weak-weak word (BEAU-ti-ful, E-ve-ry, ME-mo-ry). */
const WEAK_MID: W<[Cons[], Vowel, Cons[], string]> = [
  [[['T'], 'IH', [], 'ti'], 1], [[[], 'AX', [], 'a'], 1.5], [[['L'], 'IH', [], 'li'], 1], [[['N'], 'AX', [], 'na'], 0.8], [[['R'], 'IH', [], 'ri'], 0.8], [[['V'], 'AX', [], 've'], 0.6],
];

/** Two light words as English pairs them (in the, on a, I'm a, and the...), not any two in a row. */
const FN_PAIRS: W<[[Cons[], Vowel, Cons[], string], [Cons[], Vowel, Cons[], string]]> = [
  [[[[], 'IH', ['N'], 'in'], [['DH'], 'AX', [], 'the']], 3], [[[[], 'AA', ['N'], 'on'], [['DH'], 'AX', [], 'the']], 2], [[[[], 'AX', ['N', 'D'], 'and'], [['DH'], 'AX', [], 'the']], 2],
  [[[['T'], 'AX', [], 'to'], [['DH'], 'AX', [], 'the']], 1.5], [[[[], 'AY', ['M'], "I'm"], [[], 'AX', [], 'a']], 1.5], [[[[], 'IH', ['T', 'S'], "it's"], [[], 'AX', [], 'a']], 1],
  [[[[], 'IH', ['N'], 'in'], [['M'], 'AY', [], 'my']], 1.5], [[[[], 'AX', ['V'], 'of'], [['M'], 'AY', [], 'my']], 1], [[[['F'], 'AX', ['R'], 'for'], [[], 'AX', [], 'a']], 1],
  [[[[], 'AO', ['L'], 'all'], [['DH'], 'AX', [], 'the']], 0.8], [[[['W'], 'IY', [], 'we'], [['W'], 'AX', ['R'], 'were']], 0.6], [[[['Y'], 'UW', [], 'you'], [['N'], 'OW', [], 'know']], 0.4],
];

/** A word's shape: S one syllable, Sw BA-by, wS a-WAY, Sww BEAU-ti-ful, wSw to-MOR-row, SS two stresses side by side (COLD NIGHT). */
type Shape = 'S' | 'Sw' | 'wS' | 'Sww' | 'wSw' | 'SS';
const SHAPES: W<Shape> = [['S', 5], ['Sw', 3], ['wS', 1.4], ['Sww', 0.7], ['wSw', 0.7], ['SS', 0.8]];

/**
 * A line of words, written before its rhythm (docs/VOCAL-WORDS.md): word groups as English is said, a
 * light word or two and then a content word ("the NIGHT", "in the NIGHT", "my BA-by", "a-WAY"), now
 * and then two stresses side by side. `n`: syllables up to and including the line's key word (its last
 * stress); `fem`: a soft syllable after it (BA-by, NE-ver). The hook, if any, opens the line. Each
 * syllable carries its weight and what follows it (a word, group or clause end).
 */
export function wordLine(rng: Rng, n: number, style: LyricStyle, opts: { fem?: boolean; hook?: Syllable[] } = {}): WordSyl[] {
  let best: WordSyl[] | null = null, bestRough = Infinity;
  for (let tries = 0; tries < 6; tries++) {
    const out: WordSyl[] = [];
    const prev = () => out[out.length - 1];
    let lastV: Vowel | undefined;
    const hook = (opts.hook ?? []).slice(0, Math.max(0, n - 1));
    hook.forEach((h, i) => out.push({ ...h, level: h.stress ? 2 : 0, brk: i === hook.length - 1 ? 2 : hook[i + 1].wordStart ? 1 : 0 }));
    const weak = (list: W<[Cons[], Vowel, Cons[], string]>, wordStart: boolean, brk = 0) => { const s = pick(rng, list, prev(), false, wordStart); out.push({ ...s, level: 0, brk }); };
    const stressed = (level: number, wordStart: boolean, key: boolean, brk = 0) => {
      const s = strong(rng, { stress: true, long: key, high: false }, style, lastV, prev());
      lastV = s.vowel;
      out.push({ ...s, wordStart, level, brk });
    };
    const used = new Set<string>();
    const real = useReal(style);
    const FN = real ? FUNCTION_REAL : FUNCTION;
    /** A real word of this shape from the bank, its stress weighted `lvl`. */
    const bankWord = (shape: string, lvl: number, key: boolean) => {
      const w = pickWord(rng, shape, { style, sustain: key, prev: prev(), lastV, used, rhyme: null }) ?? pickWord(rng, 'S', { style, sustain: key, prev: prev(), lastV, used, rhyme: null })!;
      used.add(w.text);
      lastV = w.syl[w.at].vowel;
      const ps = placeWord(w, true, true);
      ps.forEach((x, k) => out.push({ ...x, level: k === w.at ? lvl : 0, brk: k === ps.length - 1 ? 1 : 0 }));
    };
    /** A word of shape `sh`; `level`: its stress's weight; `tail`: the line's soft ending (a final Sw / wSw). */
    const word = (sh: Shape, level: number, key: boolean) => {
      if (real) { if (sh === 'SS') { bankWord('S', 1, false); bankWord('S', level, key); } else bankWord(sh, level, key); return; }
      if (sh === 'SS') { stressed(1, true, false, 1); stressed(level, true, key, 1); return; }
      if (sh[0] === 'w') weak(WEAK_START, true);
      stressed(level, sh[0] !== 'w', key, sh.endsWith('S') ? 1 : 0);
      if (sh.length - (sh[0] === 'w' ? 1 : 0) > 1) {
        // (a strong-weak word: often opened into its weak syllable, as lyricLine does)
        const s = prev();
        if (s.coda.length && rng.chance(0.45)) { s.coda = []; s.text = spellSyl(s.onset, s.vowel, []); }
        if (sh === 'Sww') weak(WEAK_MID, false);
        weak(WEAK_END, false, 1);
      }
    };
    const fns = (k: number) => {
      if (k === 2) { for (const e of weighted(rng, FN_PAIRS)) out.push({ ...fromList(e, false, true), level: 0, brk: 1 }); return; }
      for (let i = 0; i < k; i++) weak(FN, true, 1);
    };
    const endGroup = (clause: boolean) => { const s = prev(); if (s) s.brk = clause ? 3 : Math.max(s.brk, 2); };
    // the last group first (its size decides what's left): a light word or two, then the key word
    const lastShape: Shape = opts.fem ? (rng.chance(0.75) ? 'Sw' : 'wSw') : rng.chance(0.75) ? 'S' : 'wS';
    const lastStress = lastShape[0] === 'w' ? 2 : 1;
    let room = n - hook.length - lastStress;
    if (room < 0) room = 0;
    const lastFns = Math.min(room, rng.weighted([[0, 1], [1, 1.6], [2, 0.7]]));
    let mid = room - lastFns;
    let groups = 0, sinceClause = 0;
    while (mid > 0) {
      // a group: light words, then a content word, fitting what's left
      const f = Math.min(mid - 1, rng.weighted([[0, 1.2], [1, 1.6], [2, 0.6]]));
      const left = mid - f;
      const shapes = SHAPES.filter(([sh]) => sh.length <= left);
      const sh = rng.weighted(shapes);
      fns(f);
      word(sh, rng.chance(0.25) ? 1 : 2, false);
      mid -= f + sh.length;
      groups++; sinceClause += f + sh.length;
      endGroup(sinceClause >= 4 && rng.chance(0.35));
      if (prev().brk === 3) sinceClause = 0;
    }
    fns(lastFns);
    word(lastShape, 3, true);
    endGroup(true);
    if (BLOCKED.test(spell(out).toLowerCase().replace(/[^a-z]/g, ''))) continue;
    const r = roughness(out);
    if (r < 0.75 && groups >= 0) return out;
    if (r < bestRough) best = out, bestRough = r;
  }
  return best ?? Array.from({ length: n }, (_, i) => ({ ...syl([], i === n - 1 ? 'OW' : 'AX', [], i === n - 1, true, i === n - 1 ? 'oh' : 'a'), level: i === n - 1 ? 3 : 0, brk: i === n - 1 ? 3 : 1 }));
}

/** A stressed syllable on a long or high note, its closed ee and oo opened up (to ay, oh), as singers do. */
export function openUp(s: Syllable): Syllable {
  if (s.real || !s.stress || (s.vowel !== 'IY' && s.vowel !== 'UW')) return s;
  const vowel: Vowel = s.vowel === 'IY' ? 'EY' : 'OW';
  return { ...s, vowel, text: spellSyl(s.onset, vowel, s.coda) };
}

/** A line's last stressed syllable given a rhyme (in place). */
export function rhymeWith(line: Syllable[], r: Rhyme, rng?: Rng) {
  const at = line.map((x) => x.stress).lastIndexOf(true);
  const last = line[at];
  if (!last) return;
  // (a real word is swapped for a real word that rhymes, of the same shape; never respelled)
  if (last.real) {
    if (!rng) return;
    let ws = at, we = at;
    while (ws > 0 && !line[ws].wordStart) ws--;
    while (we + 1 < line.length && !line[we + 1].wordStart) we++;
    const shape = line.slice(ws, we + 1).map((x) => (x.stress ? 'S' : 'w')).join('');
    const same = (BANK.get(shape) ?? []).filter((w) => w.text !== line.slice(ws, we + 1).map((x) => x.text).join('-') && sameRhyme(w.syl[w.at], r));
    if (!same.length) return;
    const w = rng.pick(same);
    w.syl.forEach((x, k) => { line[ws + k] = { ...x, stress: line[ws + k].stress, wordStart: k === 0, real: true, text: w.parts[k] }; });
    return;
  }
  last.vowel = r.vowel;
  last.coda = [...r.coda];
  last.text = spellSyl(last.onset, last.vowel, last.coda);
}

/** The chorus title: two to four syllables, strong first, ending on an open vowel that sings. */
export function makeHook(rng: Rng, stresses: boolean[], style: LyricStyle): Syllable[] {
  const slots = stresses.map((stress, i) => ({ stress, long: i === stresses.length - 1, high: false }));
  return lyricLine(rng, slots, style);
}

/** A filler for a gap ("yeah", "oh", "whoa"), or null. */
export function filler(rng: Rng): Syllable[] {
  return weighted(rng, FILLERS).map((e, i) => fromList(e, i === 0, true));
}

/** The line as text: words separated by spaces, syllables of a word joined. */
export function spell(line: Syllable[]): string {
  // (two vowels meeting inside a word get a hyphen: a-ay, not aay)
  const v = /[aeiouy]/;
  return line.map((s, i) => (i > 0 && s.wordStart ? ' ' : i > 0 && !s.real && v.test(line[i - 1].text.slice(-1)) && v.test(s.text[0]) ? '-' : '') + s.text).join('');
}
