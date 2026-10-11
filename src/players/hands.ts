// The hands: how the bassist and the guitarists actually play their notes, after the band has decided
// what to play. Each note gets a place on the neck (string and fret, the way a player's hand would
// lie: staying in one position, shifting when it has to), and a way of getting there from the note
// before: picked, or without picking (hammer-on, pull-off, slide) when it's on the same string.
// Long notes can be bent into, and notes before a rest can slide off (a fall-off). Every player has
// their own habits (a smooth legato player, a slider, a clean picker, a bluesy bender) and keeps
// them all song. Playback follows the hands (src/audio): the string keeps ringing into a hammer-on
// or slide instead of a fresh pick; that, more than anything, is what a sequencer never does.
// The rhythm guitar: a riff gets the same (power chords slide as a shape, and slide off at the end of
// a phrase; the hand squeaks along the wound strings when it jumps); strummed chords get what hands
// do at a chord change: a squeak as the hand shifts, or the open strings ringing as it lets go early.
// It's all kept on the notes (Touch, ChangeTouch), so a tab view can show it later.

import type { Genre } from '../genres';
import type { GuitarHit, Idea, Move, SectionKind, Touch } from '../idea';
import { Rng } from '../rng';
import { groupStarts } from '../rhythm';
import { SCALES } from '../theory';
import { TUNINGS } from '../theory/fretboard';
import { pickLead } from './lead';

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
  /** Rhythm guitar: chance of a finger squeak when the hand shifts, and of open strings into a chord change. */
  squeak?: number;
  open?: number;
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

type RhythmKind = 'tight' | 'sliding' | 'loose' | 'clean' | 'open' | 'busy';

/** The rhythm guitarist (riffs: legato, slide, fall; strummed: squeak, open). */
const RHYTHM_HANDS: Record<RhythmKind, Hands> = {
  // riffs
  tight: { desc: 'picks the riff tight, every note', legato: 0.05, slide: 0.1, bend: 0, slideIn: 0, fall: 0.08, shift: 1.6, sameString: 0, squeak: 0.15 },
  sliding: { desc: 'slides the riff around, and off the end of phrases', legato: 0.25, slide: 0.55, bend: 0, slideIn: 0, fall: 0.4, shift: 1.2, sameString: 1.2, squeak: 0.5 },
  loose: { desc: 'plays the riff loose, with hammer-ons and pull-offs', legato: 0.5, slide: 0.3, bend: 0, slideIn: 0, fall: 0.2, shift: 1.4, sameString: 0.8, squeak: 0.35 },
  // strummed
  clean: { desc: 'changes chords cleanly', legato: 0, slide: 0, bend: 0, slideIn: 0, fall: 0, shift: 1.5, sameString: 0, squeak: 0.2, open: 0.1 },
  open: { desc: 'lets the open strings ring into chord changes', legato: 0, slide: 0, bend: 0, slideIn: 0, fall: 0, shift: 1.5, sameString: 0, squeak: 0.4, open: 0.55 },
  busy: { desc: 'squeaky, busy hands on the chord changes', legato: 0, slide: 0, bend: 0, slideIn: 0, fall: 0, shift: 1.5, sameString: 0, squeak: 0.75, open: 0.3 },
};
const RIFF_HANDS: Record<Genre, [RhythmKind, number][]> = {
  rock: [['tight', 1], ['sliding', 2], ['loose', 2]],
  hardrock: [['tight', 2], ['sliding', 2], ['loose', 2]],
  grunge: [['tight', 1], ['sliding', 3], ['loose', 1]],
  pop: [['tight', 1], ['sliding', 1], ['loose', 1]],
  funk: [['tight', 2], ['loose', 1]],
  metal: [['tight', 4], ['sliding', 1], ['loose', 1]],
  altmetal: [['tight', 2], ['sliding', 2], ['loose', 1]],
};
const STRUM_HANDS: Record<Genre, [RhythmKind, number][]> = {
  rock: [['clean', 1], ['open', 2], ['busy', 1]],
  hardrock: [['clean', 2], ['open', 1], ['busy', 1]],
  grunge: [['clean', 1], ['open', 1], ['busy', 2]],
  pop: [['clean', 2], ['open', 2], ['busy', 1]],
  funk: [['clean', 3], ['busy', 1]],
  metal: [['clean', 3], ['busy', 1]],
  altmetal: [['clean', 2], ['open', 1], ['busy', 1]],
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

/** One note (or shape: an octave, a power chord) of a line. */
interface LineNote {
  step: number;
  /** Its notes, low to high, and the strings they're on relative to the lowest (an octave skips a string). */
  notes: number[];
  offs: number[];
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
  // Guitar 2's hands go with the kind of lead player they are (lead.ts)
  const lead = pickLead(seed, song.partGenres.strum);
  const g2 = HANDS[new Rng(`${seed}-g2-hands`).weighted(lead.hands)];
  const bass = HANDS[new Rng(`${seed}-bass-hands`).weighted(BASS_HANDS[song.partGenres.bass])];
  const tuning = song.tuning ?? TUNINGS.standard;
  const guitarOpen = tuning.strings;
  // the bass is tuned with the guitars (its four strings an octave under their lowest four)
  const bassOpen = tuning.strings.slice(0, 4).map((n) => n - 12);
  const riffs = sections.some((s) => s.guitar);
  const rg = new Rng(`${seed}-rhythm-hands`);
  const rhythm = RHYTHM_HANDS[rg.weighted(riffs ? RIFF_HANDS[song.partGenres.strum] : STRUM_HANDS[song.partGenres.strum])];
  sections[0].notes.push(`Band feel: the rhythm guitarist ${rhythm.desc}; Guitar 2 is ${lead.desc}, ${g2.desc}; the bassist ${bass.desc}`);
  sections.forEach((idea) => {
    const kind = idea.section!.kind;
    if (idea.guitar) playRiff(idea, rhythm, guitarOpen, `${seed}-riff-${kind}`);
    else playChanges(idea, rhythm, `${seed}-changes-${kind}`);
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
      step: h.step, notes: octave ? h.notes : [h.notes[0]], offs: octave ? [0, 2] : [0], len,
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
    h.strings = line[i].offs.map((o) => t.string + o);
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
    return { step: g, notes: [bass[g]], offs: [0], len: joined ? gap : written, joined, skip: false };
  });
  // bass players like the low frets and open strings
  const spots = finger(line, open, 15, hands, (s) => (s.fret > 7 ? (s.fret - 7) * 0.3 : 0));
  const touches = moves(idea, line, spots, hands, seed, 'bass');
  idea.bassTouch = new Array(song.total).fill(undefined);
  at.forEach((g, i) => { idea.bassTouch![g] = touches[i]; });
}

/**
 * A riff as the rhythm guitarist plays it: the riff's own shapes (single notes and power chords on
 * the strings it was written for), reached from the hit before without a pick when it's the same
 * shape moved along the same strings: a hammer-on or pull-off (single notes), a slide (power chords
 * too). Power chords slide off the end of a phrase; a big jump can squeak on the wound strings.
 */
function playRiff(idea: Idea, hands: Hands, open: number[], seed: string) {
  const { song } = idea;
  const six = 15 / song.bpm;
  const hits = [...idea.guitar!].sort((a, b) => a.step - b.step);
  const beats = beatSteps(idea);
  const at = (g: number, what: string) => new Rng(`${seed}-${g}-${what}`);
  // where the hand plays each hit: the riff's own shapes, placed to keep the hand still (a slider
  // keeps a shape on the same strings and moves it along the neck)
  const line: LineNote[] = hits.map((h, i) => {
    const n = hits[i + 1];
    const gap = n ? n.step - h.step : 99;
    const len = !h.mute && gap > h.len && gap - h.len <= 2 ? gap : h.len;
    return { step: h.step, notes: h.notes, offs: h.strings.map((x) => x - h.strings[0]), len, joined: !!n && len >= gap && gap > 0, skip: h.mute === 'dead' || !!h.letRing };
  });
  const spots = finger(line, open, 15, hands, (sp) => (sp.fret > 9 ? (sp.fret - 9) * 0.3 : 0));
  hits.forEach((h, i) => { const sp = spots[i]; if (sp) h.strings = line[i].offs.map((o) => sp.string + o); });
  const fretsOf = (h: GuitarHit) => h.notes.map((n, i) => n - open[h.strings[i]]);
  let picked = 0, chain = 0;
  hits.forEach((h, i) => {
    const frets = fretsOf(h);
    if (frets.some((f) => f < 0)) return;
    const t: Touch = { string: h.strings[0], fret: frets[0], move: 'pick' };
    h.touch = t;
    const p = hits[i - 1];
    const gap = p ? h.step - p.step : 99;
    const pLen = p && !p.mute && gap > p.len && gap - p.len <= 2 ? gap : p?.len ?? 0;
    const joined = !!p && pLen >= gap && gap > 0;
    if (p?.touch && joined && !p.mute && !h.mute && !h.slide && !p.letRing && !h.letRing) {
      const pf = fretsOf(p);
      const d = frets[0] - pf[0];
      // the same shape moved along the same strings
      const same = p.strings.length === h.strings.length && p.strings.every((s, k) => s === h.strings[k]) && frets.every((f, k) => f - pf[k] === d);
      const ok = same && d !== 0 && chain < CHAIN_NOTES - 1 && (h.step - picked) * six < CHAIN_SEC && pf.every((f) => f > 0);
      const beat = beats.has(h.step) ? 0.6 : 1;
      if (ok && h.notes.length === 1 && Math.abs(d) <= 2 && at(h.step, 'legato').chance(hands.legato * beat)) t.move = d > 0 ? 'hammer' : 'pull';
      // (a power chord slides the whole way, landing on the beat as often as not)
      else if (ok && Math.abs(d) <= (h.notes.length > 1 ? 10 : 7) && at(h.step, 'slide').chance(hands.slide * (h.notes.length > 1 ? 1 : beat))) t.move = 'slide';
      if (t.move !== 'pick') { p.touch.tied = true; chain++; }
      // a jump along the neck on the wound strings: the fingers squeak
      else if (Math.abs(frets[0] - pf[0]) >= 4 && h.strings[0] <= 3 && at(h.step, 'squeak').chance(hands.squeak ?? 0)) t.squeak = true;
    }
    if (t.move === 'pick') { picked = h.step; chain = 0; }
    // off the end of a phrase: the shape slides down the neck as it's let go
    const n = hits[i + 1];
    const len = n && !h.mute && n.step - h.step > h.len && n.step - h.step - h.len <= 2 ? n.step - h.step : h.len;
    if (n && !h.mute && n.step - (h.step + len) >= 4 && len >= 2 && Math.min(...frets) >= 3 && at(h.step, 'fall').chance(hands.fall * (idea.section!.energy >= 3 ? 1 : 0.5))) {
      t.fall = Math.min(Math.min(...frets), at(h.step, 'fall2').int(3, 7));
    }
  });
}

/** Strummed chords: what the hands do at each chord change (the shapes themselves depend on the instrument). */
function playChanges(idea: Idea, hands: Hands, seed: string) {
  const { chords, strum } = idea;
  if (!strum.some((s) => s !== '.')) return;
  const out: Record<number, { squeak?: boolean; open?: boolean }> = {};
  for (const { step } of chords.timeline) {
    if (step === 0) continue;
    const rng = new Rng(`${seed}-${step}`);
    const t = { squeak: rng.chance(hands.squeak ?? 0) || undefined, open: rng.chance(hands.open ?? 0) || undefined };
    if (t.squeak || t.open) out[step] = t;
  }
  idea.changeTouch = out;
}

/** Two notes or shapes the hand can move between keeping its fingers down (same strings, same intervals). */
const sameShape = (a: LineNote, b: LineNote) =>
  a.offs.length === b.offs.length && a.offs.every((o, k) => o === b.offs[k]) && a.notes.every((m, k) => m - a.notes[0] === b.notes[k] - b.notes[0]);

/** How far below `midi` the next note of the song's scale is, if it's a bend's reach (1 or 2 semitones). */
function scaleBelow(midi: number, song: Idea['song']): number | undefined {
  const pcs = SCALES[song.mode].map((p) => (p + song.key) % 12);
  for (const d of [2, 1]) if (pcs.includes((((midi - d) % 12) + 12) % 12)) return d;
  return undefined;
}

const beatSteps = (idea: Idea) => {
  const beats = new Set<number>();
  for (const bar of idea.song.bars) for (const b of groupStarts(bar.groups)) beats.add(bar.start + b);
  return beats;
};

/**
 * Where the hand plays each note: the cheapest path over the neck (Viterbi), where moving the hand
 * costs (a little within a four-fret position, more for a shift), changing strings costs a little,
 * and the player has their own taste (`prefer`, and HANDS' shift / sameString).
 */
function finger(line: LineNote[], open: number[], maxFret: number, hands: Hands, prefer: (s: Spot) => number): (Spot | null)[] {
  const cands = line.map((n) => {
    const out: Spot[] = [];
    if (n.skip) return out;
    for (let s = 0; s + n.offs[n.offs.length - 1] < open.length; s++) {
      // every note of the shape on its string, within a hand's span
      const frets = n.notes.map((m, k) => m - open[s + n.offs[k]]);
      const fret = frets[0];
      if (frets.some((f) => f < 0 || f > maxFret || (f > 0 && fret > 0 && Math.abs(f - fret) > 3))) continue;
      out.push({ string: s, fret });
    }
    return out;
  });
  const trans = (a: Spot, b: Spot, rest: boolean) => {
    const d = a.fret === 0 || b.fret === 0 ? 0 : Math.abs(b.fret - a.fret);
    // after a rest the hand has had time to move
    let c = (d <= 3 ? d * 0.25 : hands.shift + d * 0.3) * (rest ? 0.4 : 1);
    c += Math.abs(b.string - a.string) * 0.35;
    // (a slider would rather move along the string, the further the better)
    if (a.string === b.string && a.fret !== b.fret) c -= hands.sameString * (1 + d / 3);
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
  const beats = beatSteps(idea);
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
    if (pn && pt && pn.joined && pt.string === t.string && pt.fret !== t.fret && sameShape(pn, n)) {
      const d = t.fret - pt.fret;
      const ok = chain < CHAIN_NOTES - 1 && (n.step - picked) * six < CHAIN_SEC;
      // players tend to pick the beat
      const beat = beats.has(n.step) ? 0.6 : 1;
      let move: Move = 'pick';
      if (ok && Math.abs(d) <= 2 && n.notes.length === 1 && at(n.step, 'legato').chance(hands.legato * beat)) move = d > 0 ? 'hammer' : 'pull';
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
      // a bend starts on the scale note below and pushes up to the note (from anywhere else the
      // start is heard as a wrong note); rarely in quiet sections, where the melody is plainer
      const below = scaleBelow(n.notes[0], song);
      if (who === 'guitar' && n.notes.length === 1 && below && n.len >= 4 && t.fret >= 4 && t.string >= 2 && at(n.step, 'bend').chance(hands.bend * (e >= 3 ? 1 : 0.25))) t.bend = below;
      else if (who === 'bass' && restBefore && beats.has(n.step) && t.fret >= 3 && at(n.step, 'in').chance(hands.slideIn)) t.from = -Math.min(t.fret, 3);
    }
    // a fall-off into a rest (not the section's last note: the next section takes over from it)
    if (restAfter && nn && n.len >= 2 && t.fret >= 3 && at(n.step, 'fall').chance(hands.fall * (e >= 3 ? 1 : 0.5))) {
      t.fall = Math.min(t.fret, who === 'bass' ? at(n.step, 'fall2').int(4, 7) : at(n.step, 'fall2').int(2, 4));
    }
  });
  return out;
}

