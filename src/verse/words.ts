// Words for the verse melody (experiment): the app's pseudo-English lyric writer (src/parts/lyrics.ts), set to the line's
// own rhythm. A phrase is a line of words; its small breaks (an 8th or 16th rest) are where a word group ends, so no word
// runs across a rest. Notes on the 1st and 3rd quarter, long notes, third-bar notes and held endings get the stressed
// syllables (and the open vowels that sing held); quick 16ths and the notes between get the light ones. Every other
// phrase rhymes with the one before it.

import { Rng } from '../rng';
import { lyricLine, rhymeOf, spell, type LyricStyle, type Rhyme, type Syllable } from '../parts/lyrics';
import { gridOf, type BarArg } from './grid';
import type { BandNote, Gap } from './verse';

export interface Words {
  /** A syllable for each note. */
  syls: Syllable[];
  /** Each note that opens a phrase (the singer breathes in before it). */
  starts: boolean[];
  /** One line of text per phrase, word groups apart by " · ". */
  lines: string[];
}

/** A note's weight in the line: does it want a stressed syllable, a held vowel, is it high? */
function slotOf(n: BandNote, bar: BarArg, high: number, acc?: number[]) {
  const G = gridOf(bar), onBeat = G.isStrong(n.step) && G.isBeat(n.step);
  // (one more factor: a note that lands on a big band hit, a kick, a snare or a chord change, wants a stress too)
  const hit = (acc?.[Math.floor(n.step + 1e-6)] ?? 0) >= 0.6;
  const stress = n.len >= 4 || !!n.end || !!n.third || ((onBeat || hit) && n.len >= 2);
  return { stress, long: n.len >= 4 || !!n.end, high: n.midi >= high };
}

/**
 * `notes` sorted by step; `phrases` as planned; `high`: the pitch from which a note counts as high (open vowels).
 */
export function writeWords(notes: BandNote[], phrases: Gap[], bar: BarArg, style: LyricStyle, high: number, seed: string, acc?: number[], repeat = 0.6): Words {
  const rng = new Rng(seed + '|words');
  const syls: Syllable[] = new Array(notes.length);
  const starts: boolean[] = new Array(notes.length).fill(false);
  const lines: string[] = [];
  let rhyme: Rhyme | null = null;
  // (a word group with the same rhythm as an earlier one often gets the same words: an answering phrase sings its first half's lines)
  const memo = new Map<string, Syllable[]>();
  phrases.forEach((ph, p) => {
    const idx: number[] = [];
    notes.forEach((n, i) => { if (n.step >= ph.step - 1e-9 && n.step < ph.step + ph.len - 1e-9) idx.push(i); });
    if (!idx.length) { lines.push(''); return; }
    starts[idx[0]] = true;
    // word groups: the notes between two rests
    const groups: number[][] = [];
    for (const i of idx) {
      const prev = groups[groups.length - 1]?.slice(-1)[0];
      if (prev !== undefined && notes[i].step <= notes[prev].step + notes[prev].len + 1e-9) groups[groups.length - 1].push(i);
      else groups.push([i]);
    }
    const texts: string[] = [];
    groups.forEach((g, gi) => {
      const last = gi === groups.length - 1;
      // (every other phrase ends on the rhyme of the one before)
      const forced = last && p % 2 === 1 && rhyme;
      const sig = g.map((i) => `${+(notes[i].step - notes[g[0]].step).toFixed(2)}:${+notes[i].len.toFixed(2)}`).join(',');
      const again = !forced && memo.has(sig) && rng.chance(repeat);
      const line = again ? memo.get(sig)! : lyricLine(rng, g.map((i) => slotOf(notes[i], bar, high, acc)), style, { rhyme: forced ? rhyme : null });
      if (!memo.has(sig)) memo.set(sig, line);
      g.forEach((i, k) => { syls[i] = line[k]; });
      texts.push(spell(line));
      if (last && p % 2 === 0) rhyme = rhymeOf(line);
    });
    lines.push(texts.join(' · '));
  });
  return { syls, starts, lines };
}
