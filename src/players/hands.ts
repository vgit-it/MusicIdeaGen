// The hands: how the bassist and Guitar 2 actually play their notes, after the band has decided
// what to play. Each note gets a place on the neck (string and fret, the way a player's hand would
// lie: staying in one position, shifting when it has to), and a way of getting there from the note
// before: picked, or without picking (hammer-on, pull-off, slide) when it's on the same string.
// Long notes can be bent into, and notes before a rest can slide off (a fall-off). Every player has
// their own habits (a smooth legato player, a slider, a clean picker, a bluesy bender) and keeps
// them all song. Playback follows the hands (src/audio): the string keeps ringing into a hammer-on
// or slide instead of a fresh pick; that, more than anything, is what a sequencer never does.
// It's all kept on the notes (Touch), so a tab view can show it later.

import type { Genre } from '../genres';
import type { Idea, Move, SectionKind, Touch } from '../idea';
import { Rng } from '../rng';
import { groupStarts } from '../rhythm';
import { TUNINGS } from '../theory/fretboard';

interface Hands {
  /** Words for the band notes. */
  desc: string;
  /** Chance of a hammer-on / pull-off between neighbouring frets on a string. */
  legato: number;
  /** Chance of sliding to a note further along the same string. */
  slide: number;
  /** Chance of bending into a long note (Guitar 2). */
  bend: number;
  /** Chance of sliding into a note after a rest (bass). */
  slideIn: number;
  /** Chance of a fall-off on a note before a rest. */
  fall: number;
  /** How much a position shift costs them (box players stay put; sliders move along a string). */
  shift: number;
  /** Bonus for staying on a string (sliders and legato players). */
  sameString: number;
}

type HandsKind = 'legato' | 'slider' | 'picker' | 'bluesy' | 'fingers' | 'tight' | 'slidey' | 'funky';

const HANDS: Record<HandsKind, Hands> = {
  // Guitar 2
  legato: { desc: 'smooth, with hammer-ons and pull-offs', legato: 0.7, slide: 0.3, bend: 0.35, slideIn: 0, fall: 0.15, shift: 1.6, sameString: 0.25 },
  slider: { desc: 'slides along the strings between positions', legato: 0.35, slide: 0.75, bend: 0.3, slideIn: 0, fall: 0.35, shift: 1, sameString: 0.45 },
  picker: { desc: 'picks almost every note, clean and even', legato: 0.12, slide: 0.15, bend: 0.2, slideIn: 0, fall: 0.05, shift: 1.8, sameString: 0 },
  bluesy: { desc: 'bends into long notes, with the odd slide', legato: 0.45, slide: 0.45, bend: 0.65, slideIn: 0, fall: 0.25, shift: 1.4, sameString: 0.2 },
  // bass
  fingers: { desc: 'fingers, smooth, slides into the odd note', legato: 0.3, slide: 0.4, bend: 0, slideIn: 0.3, fall: 0.25, shift: 1.6, sameString: 0.15 },
  tight: { desc: 'picks every note, tight', legato: 0.05, slide: 0.1, bend: 0, slideIn: 0.05, fall: 0.05, shift: 1.8, sameString: 0 },
  slidey: { desc: 'slides into and off notes', legato: 0.15, slide: 0.65, bend: 0, slideIn: 0.5, fall: 0.5, shift: 1, sameString: 0.4 },
  funky: { desc: 'hammer-ons and quick slides', legato: 0.6, slide: 0.35, bend: 0, slideIn: 0.25, fall: 0.2, shift: 1.5, sameString: 0.2 },
};

const G2_HANDS: Record<Genre, [HandsKind, number][]> = {
  rock: [['legato', 2], ['slider', 2], ['picker', 1], ['bluesy', 3]],
  hardrock: [['legato', 2], ['slider', 1], ['picker', 1], ['bluesy', 3]],
  grunge: [['legato', 1], ['slider', 3], ['picker', 1], ['bluesy', 2]],
  pop: [['legato', 3], ['slider', 1], ['picker', 2], ['bluesy', 1]],
  funk: [['legato', 1], ['slider', 1], ['picker', 3], ['bluesy', 1]],
  metal: [['legato', 3], ['slider', 1], ['picker', 3], ['bluesy', 0.5]],
  altmetal: [['legato', 2], ['slider', 2], ['picker', 2], ['bluesy', 1]],
};
const BASS_HANDS: Record<Genre, [HandsKind, number][]> = {
  rock: [['fingers', 3], ['tight', 2], ['slidey', 1]],
  hardrock: [['fingers', 2], ['tight', 2], ['slidey', 1]],
  grunge: [['fingers', 2], ['tight', 1], ['slidey', 2]],
  pop: [['fingers', 4], ['tight', 1], ['slidey', 1]],
  funk: [['funky', 4], ['fingers', 1]],
  metal: [['tight', 4], ['fingers', 1]],
  altmetal: [['tight', 2], ['fingers', 1], ['slidey', 1]],
};

/** The longest a note rings on into legato notes without a new pick (seconds), and how many notes. */
const CHAIN_SEC = 1.6, CHAIN_NOTES = 4;

/** One note (or octave shape) of a single-note line. */
interface LineNote {
  step: number;
  /** Lowest MIDI note; `octave`: with the note an octave up, two strings higher. */
  midi: number;
  octave: boolean;
  /** Steps it sounds (as played: held through short rests). */
  len: number;
  /** It rings into the next note (no rest between them). */
  joined: boolean;
  /** Notes we can't place (or shouldn't touch): picked as written. */
  skip: boolean;
}

interface Spot { string: number; fret: number }

/** The hands of the bassist and Guitar 2 play every section of a track (in place). */
export function playHands(sections: Idea[], seed: string) {
  const song = sections[0].song;
  const g2 = HANDS[new Rng(`${seed}-g2-hands`).weighted(G2_HANDS[song.partGenres.strum])];
  const bass = HANDS[new Rng(`${seed}-bass-hands`).weighted(BASS_HANDS[song.partGenres.bass])];
  const tuning = song.tuning ?? TUNINGS.standard;
  const guitarOpen = tuning.strings;
  // the bass is tuned with the guitars (its four strings an octave under their lowest four)
  const bassOpen = tuning.strings.slice(0, 4).map((n) => n - 12);
  sections[0].notes.push(`Band feel: Guitar 2 ${g2.desc}; the bassist ${bass.desc}`);
  sections.forEach((idea) => {
    const kind = idea.section!.kind;
    playGuitar2(idea, g2, guitarOpen, `${seed}-g2-${kind}`);
    playBassHands(idea, bass, bassOpen, `${seed}-bass-${kind}`);
  });
}

function playGuitar2(idea: Idea, hands: Hands, open: number[], seed: string) {
  const hits = [...idea.guitar2].sort((a, b) => a.step - b.step);
  if (!hits.length) return;
  const line: LineNote[] = hits.map((h, i) => {
    const next = hits[i + 1];
    const gap = next ? next.step - h.step : 99;
    const octave = h.notes.length === 2 && h.notes[1] - h.notes[0] === 12;
    // as the engine plays it: held through a short rest into the next note
    const len = !h.mute && gap > h.len && gap - h.len <= 2 ? gap : h.len;
    return {
      step: h.step, midi: h.notes[0], octave, len,
      joined: !!next && len >= gap && next.step > h.step,
      skip: !(h.notes.length === 1 || octave) || !!h.mute || !!h.letRing || !!h.swell,
    };
  });
  const spots = finger(line, open, 19, hands, (s) => (s.fret === 0 ? 1 : 0.04 * Math.abs(s.fret - 8)));
  const touches = moves(idea, line, spots, hands, seed, 'guitar');
  hits.forEach((h, i) => {
    const t = touches[i];
    if (!t) return;
    // a phrase the guitarist already slides into stays that way
    if (h.slide) { t.bend = undefined; t.move = 'pick'; }
    h.touch = t;
    h.strings = line[i].octave ? [t.string, t.string + 2] : [t.string];
  });
}

function playBassHands(idea: Idea, hands: Hands, open: number[], seed: string) {
  const { bass, bassLen, song } = idea;
  const at: number[] = [];
  for (let g = 0; g < song.total; g++) if (bass[g]) at.push(g);
  if (!at.length) return;
  const line: LineNote[] = at.map((g, i) => {
    const k = at[i + 1];
    const gap = k === undefined ? 99 : k - g;
    const written = bassLen?.[g] || gap;
    // (the engine holds a note through a rest of an 8th or less)
    const joined = k !== undefined && gap - written <= 2;
    return { step: g, midi: bass[g], octave: false, len: joined ? gap : written, joined, skip: false };
  });
  // bass players like the low frets and open strings
  const spots = finger(line, open, 15, hands, (s) => (s.fret > 7 ? (s.fret - 7) * 0.3 : 0));
  const touches = moves(idea, line, spots, hands, seed, 'bass');
  idea.bassTouch = new Array(song.total).fill(undefined);
  at.forEach((g, i) => { idea.bassTouch![g] = touches[i]; });
}

/**
 * Where the hand plays each note: the cheapest path over the neck (Viterbi), where moving the hand
 * costs (a little within a four-fret position, more for a shift), changing strings costs a little,
 * and the player has their own taste (`prefer`, and HANDS' shift / sameString).
 */
function finger(line: LineNote[], open: number[], maxFret: number, hands: Hands, prefer: (s: Spot) => number): (Spot | null)[] {
  const cands = line.map((n) => {
    const out: Spot[] = [];
    if (n.skip) return out;
    for (let s = 0; s < open.length; s++) {
      const fret = n.midi - open[s];
      if (fret < 0 || fret > maxFret) continue;
      if (n.octave) {
        // octave shapes skip a string: two frets up (three across the B string)
        const up = s + 2;
        if (up >= open.length) continue;
        const f2 = n.midi + 12 - open[up];
        if (f2 < 0 || f2 > maxFret || Math.abs(f2 - fret) > 3) continue;
      }
      out.push({ string: s, fret });
    }
    return out;
  });
  const trans = (a: Spot, b: Spot, rest: boolean) => {
    const d = a.fret === 0 || b.fret === 0 ? 0 : Math.abs(b.fret - a.fret);
    // after a rest the hand has had time to move
    let c = (d <= 3 ? d * 0.25 : hands.shift + d * 0.3) * (rest ? 0.4 : 1);
    c += Math.abs(b.string - a.string) * 0.35;
    if (a.string === b.string && a.fret !== b.fret) c -= hands.sameString;
    return c;
  };
  const out: (Spot | null)[] = line.map(() => null);
  // each run of placeable notes is fingered as one phrase
  let i = 0;
  while (i < line.length) {
    if (!cands[i].length) { i++; continue; }
    let j = i;
    while (j + 1 < line.length && cands[j + 1].length) j++;
    const cost: number[][] = [], back: number[][] = [];
    for (let k = i; k <= j; k++) {
      const c = cands[k];
      if (k === i) { cost.push(c.map(prefer)); back.push(c.map(() => -1)); continue; }
      const pc = cands[k - 1], prev = cost[cost.length - 1];
      const rest = !line[k - 1].joined;
      const row: number[] = [], br: number[] = [];
      for (const b of c) {
        let best = Infinity, bi = 0;
        pc.forEach((a, ai) => {
          const v = prev[ai] + trans(a, b, rest);
          if (v < best) { best = v; bi = ai; }
        });
        row.push(best + prefer(b));
        br.push(bi);
      }
      cost.push(row);
      back.push(br);
    }
    let bi = cost[cost.length - 1].indexOf(Math.min(...cost[cost.length - 1]));
    for (let k = j; k >= i; k--) {
      out[k] = cands[k][bi];
      bi = back[k - i][bi];
    }
    i = j + 1;
  }
  return out;
}

/** How the hand gets to each note (and what it does with the note's end). */
function moves(idea: Idea, line: LineNote[], spots: (Spot | null)[], hands: Hands, seed: string, who: 'guitar' | 'bass'): (Touch | undefined)[] {
  const { song } = idea;
  const six = 15 / song.bpm;
  const e = idea.section!.energy;
  const beats = new Set<number>();
  for (const bar of song.bars) for (const b of groupStarts(bar.groups)) beats.add(bar.start + b);
  const kind: SectionKind = idea.section!.kind;
  const out: (Touch | undefined)[] = spots.map((s) => (s ? { string: s.string, fret: s.fret, move: 'pick' as Move } : undefined));
  // the same choice at the same spot whenever the block comes round
  const at = (g: number, what: string) => new Rng(`${seed}-${kind}-${g}-${what}`);
  let picked = 0, chain = 0;
  line.forEach((n, i) => {
    const t = out[i];
    if (!t) return;
    const pn = line[i - 1], pt = out[i - 1];
    // reached from the last note without picking?
    if (pn && pt && pn.joined && pt.string === t.string && pt.fret !== t.fret && pn.octave === n.octave) {
      const d = t.fret - pt.fret;
      const ok = chain < CHAIN_NOTES - 1 && (n.step - picked) * six < CHAIN_SEC;
      // players tend to pick the beat
      const beat = beats.has(n.step) ? 0.6 : 1;
      let move: Move = 'pick';
      if (ok && Math.abs(d) <= 2 && !n.octave && at(n.step, 'legato').chance(hands.legato * beat)) move = d > 0 ? 'hammer' : 'pull';
      else if (ok && Math.abs(d) <= 7 && t.fret > 0 && pt.fret > 0 && at(n.step, 'slide').chance(hands.slide * beat)) move = 'slide';
      else if (Math.abs(d) > 2) pt.lift = 25; // the finger lifts to move along the string
      if (move !== 'pick') { t.move = move; pt.tied = true; chain++; }
    } else if (pn && pt && pn.joined && pt.fret > 0 && t.fret > 0 && Math.abs(t.fret - pt.fret) > 4) {
      pt.lift = 20; // a shift to a new position: lift, then place
    }
    if (t.move === 'pick') { picked = n.step; chain = 0; }
    const nn = line[i + 1];
    const restAfter = !n.joined && (!nn || nn.step - (n.step + n.len) >= 4);
    const restBefore = !pn || !pn.joined && n.step - (pn.step + pn.len) >= 4;
    if (t.move === 'pick') {
      // into a long note after a rest: a bend (Guitar 2) or a slide (bass)
      if (who === 'guitar' && !n.octave && n.len >= 4 && t.fret >= 4 && t.string >= 2 && at(n.step, 'bend').chance(hands.bend)) t.bend = at(n.step, 'bend2').chance(0.6) ? 2 : 1;
      else if (who === 'bass' && restBefore && beats.has(n.step) && t.fret >= 3 && at(n.step, 'in').chance(hands.slideIn)) t.from = -Math.min(t.fret, 3);
    }
    // a fall-off into a rest (not the section's last note: the next section takes over from it)
    if (restAfter && nn && n.len >= 2 && t.fret >= 3 && at(n.step, 'fall').chance(hands.fall * (e >= 3 ? 1 : 0.5))) {
      t.fall = Math.min(t.fret, who === 'bass' ? at(n.step, 'fall2').int(4, 7) : at(n.step, 'fall2').int(2, 4));
    }
  });
  return out;
}

