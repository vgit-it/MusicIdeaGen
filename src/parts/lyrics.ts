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

/** Phonemes (ARPAbet-like): vowels and diphthongs, then consonants. */
export type Vowel = 'IY' | 'IH' | 'EY' | 'EH' | 'AE' | 'AA' | 'AO' | 'OW' | 'UH' | 'UW' | 'AH' | 'AX' | 'AY' | 'AW' | 'OY';
export type Cons = 'P' | 'B' | 'T' | 'D' | 'K' | 'G' | 'M' | 'N' | 'NG' | 'F' | 'V' | 'TH' | 'DH' | 'S' | 'Z' | 'SH'
  | 'CH' | 'JH' | 'HH' | 'L' | 'R' | 'W' | 'Y';

export interface Syllable {
  onset: Cons[];
  vowel: Vowel;
  coda: Cons[];
  stress: boolean;
  /** How it's spelled (for the lyric line). */
  text: string;
  /** Starts a word (spaces go before it). */
  wordStart: boolean;
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
}

type W<T> = [T, number][];

// onsets, roughly by how often English uses them (single consonants, then clusters)
const ONSETS: W<Cons[]> = [
  [['N'], 6], [['T'], 6], [['D'], 5], [['S'], 5], [['L'], 5], [['R'], 4], [['M'], 5], [['K'], 4], [['W'], 4], [['B'], 4],
  [['HH'], 3], [['F'], 3], [['P'], 3], [['G'], 2], [['V'], 1.5], [['Y'], 1.5], [['SH'], 1.5], [['CH'], 1], [['JH'], 1], [['TH'], 0.8], [['Z'], 0.4],
  [['B', 'L'], 1], [['B', 'R'], 1.2], [['K', 'L'], 0.8], [['K', 'R'], 1], [['D', 'R'], 1], [['F', 'L'], 1], [['F', 'R'], 1.2], [['G', 'L'], 0.6], [['G', 'R'], 1],
  [['P', 'L'], 0.8], [['P', 'R'], 0.8], [['T', 'R'], 1.2], [['TH', 'R'], 0.5], [['S', 'T'], 1.2], [['S', 'L'], 0.8], [['S', 'P'], 0.7], [['S', 'K'], 0.5],
  [['S', 'M'], 0.4], [['S', 'N'], 0.4], [['S', 'W'], 0.6], [['K', 'W'], 0.4], [['T', 'W'], 0.3], [['S', 'T', 'R'], 0.5], [['S', 'P', 'R'], 0.2], [['S', 'K', 'R'], 0.2],
];

// codas: most English syllables are closed; clusters fall in sonority (n before d, l before t...)
const CODAS: W<Cons[]> = [
  [['N'], 8], [['T'], 6], [['D'], 5], [['S'], 4], [['Z'], 3], [['L'], 5], [['M'], 3], [['K'], 3], [['NG'], 2], [['V'], 1], [['F'], 1], [['P'], 1], [['G'], 0.8],
  [['TH'], 0.4], [['SH'], 0.5], [['CH'], 0.5],
  [['N', 'D'], 3], [['N', 'T'], 2], [['N', 'Z'], 1], [['NG', 'K'], 0.8], [['L', 'D'], 1.2], [['L', 'T'], 0.6], [['S', 'T'], 1.5], [['F', 'T'], 0.5],
  [['K', 'S'], 0.6], [['T', 'S'], 0.6], [['M', 'Z'], 0.4], [['L', 'Z'], 0.5], [['R', 'D'], 0.6], [['R', 'T'], 0.5], [['R', 'N'], 0.5], [['R', 'Z'], 0.3], [['N', 'CH'], 0.3],
];

// stressed vowels (songs lean on eye, ee, oh, ay, oo)
const VOWELS: W<Vowel> = [
  [['IH'][0] as Vowel, 6], ['EH', 4], ['AE', 3], ['AH', 3], ['AA', 3], ['AY', 5], ['IY', 4], ['EY', 4], ['OW', 4], ['UW', 3], ['AW', 1.2], ['AO', 1.5], ['UH', 0.8], ['OY', 0.3],
];

/** Vowels that sing well held and high (closed ee and oo open up toward ay/ih and oh). */
const OPEN: Vowel[] = ['AA', 'AY', 'OW', 'EY', 'AO', 'AW', 'EH', 'AH', 'AE'];

/** Light "function" syllables for the weak beats and pickups (the, a, in, my, to...). */
const FUNCTION: W<[Cons[], Vowel, Cons[], string]> = [
  [[['DH'], 'AX', [], 'the'], 6], [[[], 'AX', [], 'a'], 4], [[[], 'IH', ['N'], 'in'], 3], [[[], 'AX', ['N'], 'an'], 3], [[['T'], 'AX', [], 'ta'], 2],
  [[['Y'], 'AX', [], 'ya'], 2], [[['M'], 'AY', [], 'my'], 2.5], [[[], 'AY', [], 'I'], 2], [[[], 'IH', ['T'], 'it'], 1.5], [[[], 'IH', ['Z'], 'is'], 1.5],
  [[[], 'AX', ['V'], 'of'], 1], [[[], 'AA', ['N'], 'on'], 1], [[['D'], 'AX', [], 'da'], 1.5], [[['N'], 'AX', [], 'na'], 1], [[['W'], 'IY', [], 'we'], 1],
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

// spelling: consonants, and vowels as they'd be written open (no coda) or closed
const CONS_TEXT: Record<Cons, string> = {
  P: 'p', B: 'b', T: 't', D: 'd', K: 'k', G: 'g', M: 'm', N: 'n', NG: 'ng', F: 'f', V: 'v', TH: 'th', DH: 'th', S: 's', Z: 'z', SH: 'sh',
  CH: 'ch', JH: 'j', HH: 'h', L: 'l', R: 'r', W: 'w', Y: 'y',
};
const VOWEL_OPEN: Record<Vowel, string> = {
  IY: 'ee', IH: 'i', EY: 'ay', EH: 'eh', AE: 'a', AA: 'ah', AO: 'aw', OW: 'o', UH: 'oo', UW: 'oo', AH: 'uh', AX: 'a', AY: 'y', AW: 'ow', OY: 'oy',
};
const VOWEL_CLOSED: Record<Vowel, string> = {
  IY: 'ee', IH: 'i', EY: 'a', EH: 'e', AE: 'a', AA: 'o', AO: 'au', OW: 'o', UH: 'oo', UW: 'oo', AH: 'u', AX: 'e', AY: 'i', AW: 'ou', OY: 'oi',
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
function strong(rng: Rng, slot: LyricSlot, style: LyricStyle, avoid?: Vowel): Syllable {
  const mv = MOOD_VOWELS[style.mood], mc = MOOD_CONS[style.mood];
  const funk = style.genre === 'funk';
  const consBias = (cs: Cons[]) => (cs.length > 1 ? mc.cluster : 1) * (HARD.includes(cs[0]) ? mc.hard * (funk ? 1.3 : 1) : SOFT.includes(cs[0]) ? 1 / mc.hard : 1);
  const onset = rng.chance(0.88) ? weighted(rng, ONSETS, consBias) : [];
  const sustain = slot.long || slot.high;
  let vowel = weighted(rng, VOWELS, (v) => (mv[v] ?? 1) * (sustain && !OPEN.includes(v) ? 0.15 : 1) * (v === avoid ? 0.2 : 1));
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
  for (let tries = 0; tries < 6; tries++) {
    const out: Syllable[] = [];
    let i = 0;
    if (opts.hook) {
      for (const h of opts.hook) if (i < slots.length) out.push({ ...h }), i++;
    }
    let lastV: Vowel | undefined;
    // words by feet: a strong note and the weak ones after it make a word (BA-by, NE-ver-the) or a
    // word and a light syllable; weak notes before the first strong one are pickups (the, a, my)
    const content = (k: number, stress: boolean, start: boolean) => {
      const w = strong(rng, { ...slots[k], stress }, style, lastV);
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
        } else { out.push(fromList(weighted(rng, FUNCTION), false, true)); i++; }
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
        if (w.coda.length && rng.chance(0.7)) { w.coda = []; w.text = spellSyl(w.onset, w.vowel, []); }
        out.push(fromList(weighted(rng, WEAK_END), false, false));
      } else out.push(fromList(weighted(rng, FUNCTION), false, true));
      // longer runs of weak notes: alternate a light syllable and a lightly stressed word
      for (let k = i + 2; k < j; k++) {
        out.push((k - i) % 2 === 0 && k + 1 < j ? fromList(weighted(rng, FUNCTION), false, true) : content(k, false, true));
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
    if (!BLOCKED.test(spell(out).toLowerCase().replace(/[^a-z]/g, ''))) return out;
  }
  return slots.map((s) => syl([], s.long ? 'OW' : 'AX', [], s.stress, true, s.long ? 'oh' : 'a'));
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
  return line.map((s, i) => (i > 0 && s.wordStart ? ' ' : i > 0 && v.test(line[i - 1].text.slice(-1)) && v.test(s.text[0]) ? '-' : '') + s.text).join('');
}
