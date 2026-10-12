// The rhythm guitarist (strummed genres): who they are decides how they play the strum part, the way
// the lead player shapes Guitar 2 (lead.ts). Rules from docs/RHYTHM.md:
// - accents: the backbeat, the downbeat, a 3-3-2 across the bar, or locked to the kick; up-strums
//   lighter; a hand that's never exactly the same twice; a pre-chorus that builds
// - colour: a sus or add9 on a held chord, put on and taken off again; small triads up the neck in
//   the verses (pop, funk); power chords in the verses (rock); power chords under a solo
// - room: lighter and plainer under the lead's answers in the verses
// - the quiet parts picked: ringing arpeggios, Travis picking, broken chords
// - between chords: a bass walk into the next chord, a pentatonic lick, a double-stop hammer-on,
//   where the lead and the drums leave a gap
// One player for the whole track, picked with the band (for an idea, with its strumming).
// Riff genres play their riff (riff.ts); none of this applies.

import type { Genre } from '../genres';
import type { GuitarHit, Idea, SectionKind } from '../idea';
import { Rng } from '../rng';
import { groupStarts } from '../rhythm';
import { type Chord, chordPc, SCALES } from '../theory';
import { guitarVoicings, type StrumColour } from '../theory/guitar';

export type RhythmKind = 'strummer' | 'rocker' | 'punk' | 'funky' | 'indie';
type Accent = 'backbeat' | 'downbeat' | 'tresillo' | 'kick' | 'even';
type Voice = 'full' | 'top' | 'power';
type ArpKind = 'broken' | 'travis' | 'rolling' | 'ringing';
type FillKind = 'walk' | 'pent' | 'double';

export interface RhythmPlayer {
  kind: RhythmKind;
  /** Words for the notes. */
  desc: string;
  accents: [Accent, number][];
  /** How much the accents stand out (0: even). */
  depth: number;
  /** How much each stroke's loudness varies (a share). */
  wobble: number;
  /** Chance a held chord gets a sus or add9 put on and taken off. */
  embellish: number;
  /** How they voice the verses. */
  verse: [Voice, number][];
  /** Small chords up the neck everywhere (funk). */
  alwaysTop?: boolean;
  /** Chance they pick the quiet sections (arpeggios) instead of strumming them. */
  arp: number;
  arps: [ArpKind, number][];
  /** Chance of a lick between chords at the end of a four-bar phrase, where there's room. */
  fills: number;
  fillKinds: [FillKind, number][];
  /** Chance they play all downstrokes (8ths down, no up-strums in between). */
  downs: number;
}

const PLAYERS: Record<RhythmKind, RhythmPlayer> = {
  strummer: {
    kind: 'strummer', desc: 'a strummer: the hand never stops, open chords, a sus or add9 on a held chord',
    accents: [['backbeat', 3], ['tresillo', 1], ['kick', 1]], depth: 0.8, wobble: 0.06, embellish: 0.45,
    verse: [['full', 3], ['top', 1]], arp: 0.3, arps: [['broken', 2], ['travis', 2], ['rolling', 1]],
    fills: 0.15, fillKinds: [['walk', 3], ['pent', 1]], downs: 0,
  },
  rocker: {
    kind: 'rocker', desc: 'a rock rhythm player: hard downstrokes, power chords in the verses, a lick between chords',
    accents: [['downbeat', 2], ['kick', 2], ['backbeat', 1]], depth: 0.9, wobble: 0.05, embellish: 0.25,
    verse: [['power', 3], ['full', 1]], arp: 0.15, arps: [['broken', 1], ['ringing', 1]],
    fills: 0.35, fillKinds: [['pent', 2], ['double', 2], ['walk', 1]], downs: 0.5,
  },
  punk: {
    kind: 'punk', desc: 'a punk player: even downstrokes, power chords, no frills',
    accents: [['even', 3], ['downbeat', 1]], depth: 0.3, wobble: 0.03, embellish: 0,
    verse: [['power', 2], ['full', 1]], arp: 0, arps: [['broken', 1]], fills: 0, fillKinds: [['walk', 1]], downs: 1,
  },
  funky: {
    kind: 'funky', desc: 'a funk player: small chords high on the neck, accents locked to the drums',
    accents: [['kick', 2], ['tresillo', 1], ['backbeat', 1]], depth: 1, wobble: 0.08, embellish: 0.1,
    verse: [['top', 1]], alwaysTop: true, arp: 0, arps: [['broken', 1]], fills: 0.1, fillKinds: [['double', 1]], downs: 0,
  },
  indie: {
    kind: 'indie', desc: 'an indie player: ringing arpeggios in the quiet parts, triads up the neck',
    accents: [['backbeat', 1], ['even', 1], ['downbeat', 1]], depth: 0.6, wobble: 0.05, embellish: 0.35,
    verse: [['top', 2], ['full', 1]], arp: 0.65, arps: [['ringing', 2], ['broken', 2], ['rolling', 1]],
    fills: 0.2, fillKinds: [['double', 2], ['pent', 1]], downs: 0,
  },
};

const ROCK: [RhythmKind, number][] = [['strummer', 2], ['rocker', 3], ['punk', 1], ['indie', 1]];
const BY_GENRE: Record<Genre, [RhythmKind, number][]> = {
  rock: ROCK,
  pop: [['strummer', 3], ['indie', 2], ['funky', 1]],
  funk: [['funky', 4], ['strummer', 1]],
  // (riff genres only strum when borrowed into another genre)
  hardrock: ROCK, metal: ROCK, altmetal: ROCK, grunge: ROCK,
};

/** The rhythm guitarist (`seed`: the band's, or an idea's strumming). */
export function pickRhythm(seed: string, genre: Genre): RhythmPlayer {
  return PLAYERS[new Rng(`${seed}-rhythm`).weighted(BY_GENRE[genre])];
}

/** Where the section sits in its track (nothing for an idea on its own). */
export interface RhythmContext {
  kind?: SectionKind;
  energy?: number;
  /** Guitar 2 answers the singer here: the rhythm guitar makes room. */
  answering?: boolean;
  /** A guitar solo over it. */
  solo?: boolean;
  /** The section's last bar is a transition (left as written). */
  tail?: boolean;
}

/**
 * The rhythm guitarist plays a strummed section (in place): accents and loudness per stroke, chord
 * colours, room under the lead, the quiet parts picked, a lick between chords. `seed`: the player's
 * habits (the same all through a track); `rng`: this section. Returns notes.
 */
export function playRhythm(idea: Idea, p: RhythmPlayer, seed: string, rng: Rng, ctx: RhythmContext = {}): string[] {
  const { strum, song, chords, drums } = idea;
  if (idea.guitar || !strum.some((s) => s !== '.')) return [];
  const habit = new Rng(`${seed}-habits`);
  const accent = habit.weighted(p.accents);
  const verseVoice = habit.weighted(p.verse);
  const arpKind = habit.weighted(p.arps);
  const picksQuiet = habit.chance(p.arp);
  const allDown = habit.chance(p.downs);
  const notes: string[] = [];
  const { kind, energy = 4 } = ctx;
  const total = song.total;
  const changes = new Set(chords.timeline.map((t) => t.step));
  const lastBar = song.bars[song.bars.length - 1];

  // the quiet parts picked: arpeggios instead of strums
  if (picksQuiet && energy <= 2 && (kind === 'verse' || kind === 'bridge' || kind === 'breakdown')) {
    const until = ctx.tail ? lastBar.start : total;
    idea.rhythmPick = arpeggios(idea, arpKind, until);
    for (let g = 0; g < until; g++) strum[g] = '.';
    notes.push(`Rhythm guitar: picks the chords, ${ARP_DESC[arpKind]}`);
  }

  // all downstrokes (punk, AC/DC): the 8ths are downs, the 16th up-strums go
  if (allDown) {
    let n = 0;
    song.bars.forEach((bar) => {
      for (let j = 0; j < bar.len; j++) {
        const g = bar.start + j;
        if (strum[g] !== 'U' || changes.has(g)) continue;
        strum[g] = j % 2 ? '.' : 'D';
        n++;
      }
    });
    if (n) notes.push('Rhythm guitar: all downstrokes');
  }

  // room for the lead: plainer and lighter under the answers
  const vel = new Array<number>(total).fill(1);
  const under = new Set<number>();
  if (ctx.answering) {
    for (const h of idea.guitar2) for (let g = h.step; g < Math.min(total, h.step + h.len + 2); g++) under.add(g);
    let n = 0;
    for (const g of under) {
      if (strum[g] === '.') continue;
      if (strum[g] === 'U' && !changes.has(g) && g % 4 !== 0) strum[g] = '.';
      vel[g] *= 0.88;
      n++;
    }
    if (n) notes.push('Rhythm guitar: plainer and lighter under the lead\'s answers');
  }

  // accents and the hand's own variation
  const d = p.depth;
  song.bars.forEach((bar, bi) => {
    const beats = groupStarts(bar.groups);
    const tres = bar.len === 16 && bar.groups.length === 4;
    for (let j = 0; j < bar.len; j++) {
      const g = bar.start + j;
      if (strum[g] === '.' || strum[g] === 'x') continue;
      const beat = beats.indexOf(j);
      const odd = j % 2 === 1, off = !odd && beat < 0;
      let a = 0;
      if (accent === 'backbeat') a = beat === 1 || beat === 3 ? 0.12 : beat === 0 ? 0.04 : off ? -0.05 : odd ? -0.1 : 0;
      else if (accent === 'downbeat') a = beat === 0 ? 0.14 : beat === 2 ? 0.05 : off ? -0.07 : odd ? -0.1 : 0;
      else if (accent === 'tresillo' && tres) a = [0, 3, 6, 8, 11, 14].includes(j) ? 0.12 : -0.12;
      else if (accent === 'tresillo') a = beat === 0 ? 0.1 : beat < 0 ? -0.06 : 0;
      else if (accent === 'kick') a = drums.kick[g] ? 0.1 : odd ? -0.08 : off ? -0.04 : 0;
      // the start of each four-bar phrase lands a little harder
      if (bi % 4 === 0 && j === 0) a += 0.04;
      vel[g] *= (1 + a * d) * (1 + (rng.next() * 2 - 1) * p.wobble);
    }
  });
  const accentNote: Record<Accent, string> = {
    backbeat: 'accents on the backbeat', downbeat: 'accents on the downbeat', tresillo: 'accents in a 3-3-2 across the bar',
    kick: 'accents with the kick drum', even: 'even strokes',
  };
  // a pre-chorus builds into the chorus; a solo backs off
  if (kind === 'prechorus') for (let g = 0; g < total; g++) vel[g] *= 0.88 + 0.22 * (g / total);
  if (ctx.solo) for (let g = 0; g < total; g++) vel[g] *= 0.92;
  idea.strumVel = vel;

  // colours: how the strokes voice their chords
  const colour = new Array<StrumColour | undefined>(total).fill(undefined);
  const voice: Voice = ctx.solo ? 'power' : p.alwaysTop ? 'top' : kind === 'verse' ? verseVoice : 'full';
  if (voice !== 'full') for (let g = 0; g < total; g++) if (strum[g] === 'D' || strum[g] === 'U') colour[g] = voice;
  let sus = 0;
  if (!ctx.solo && voice !== 'power' && p.embellish && energy <= 4) {
    chords.timeline.forEach((e, i) => {
      const end = chords.timeline[i + 1]?.step ?? total;
      if (end - e.step < 8 || !rng.chance(p.embellish * (end - e.step >= 16 ? 1 : 0.6))) return;
      const add = embellishment(rng, e.chord);
      if (!add) return;
      // on a stroke after the chord's first beat, off the beat if it can; the next stroke (within an 8th) keeps it
      const cands = [];
      for (let g = e.step + 4; g < end - 1; g++) if (strum[g] === 'D' || strum[g] === 'U') cands.push(g);
      if (!cands.length) return;
      const offs = cands.filter((g) => g % 4 !== 0);
      const at = rng.pick(offs.length ? offs : cands);
      colour[at] = add;
      const next = cands.find((g) => g > at);
      if (next !== undefined && next - at <= 2 && rng.chance(0.5)) colour[next] = add;
      sus++;
    });
  }
  if (colour.some(Boolean)) idea.strumColour = colour;

  // between chords: a lick at the end of a four-bar phrase, where the lead and the drums leave room
  let licks = 0;
  if (!ctx.solo && energy >= 3 && p.fills && kind !== 'intro' && kind !== 'outro') {
    const fillKind = habit.weighted(p.fillKinds);
    song.bars.forEach((bar, bi) => {
      if (bi % 4 !== 3 || bar === lastBar || bar.len !== 16 || !rng.chance(p.fills)) return;
      const end = bar.start + bar.len;
      if (drums.fills.some((f) => f.bar === bi)) return;
      for (let g = end - 8; g < end; g++) if (changes.has(g)) return;
      if (idea.guitar2.some((h) => h.step < end + 2 && h.step + h.len > end - 8)) return;
      const hits = lick(fillKind, idea, end);
      if (!hits.length) return;
      for (let g = hits[0].step; g < end; g++) strum[g] = '.';
      (idea.rhythmPick ??= []).push(...hits);
      licks++;
    });
    if (licks) notes.push(`Rhythm guitar: ${FILL_DESC[fillKind]} at the end of a phrase`);
  }

  const picked = !!idea.rhythmPick?.some((h) => h.clean);
  notes.unshift(`Rhythm guitar: ${p.desc}; ${accentNote[accent]}` +
    (picked ? '' : voice === 'top' ? ', small triads up the neck' : voice === 'power' && !ctx.solo ? ', power chords' : '') +
    (sus ? `, a sus or add9 on ${sus} held chord${sus > 1 ? 's' : ''}` : ''));
  return notes;
}

/** A colour put on a held chord and taken off again (Dsus4 to D, Asus2 to Am...). */
function embellishment(rng: Rng, c: Chord): StrumColour | null {
  if (c.q === 'maj') return rng.weighted<StrumColour>([['sus4', 2], ['sus2', 1], ['add9', 1.5]]);
  if (c.q === 'min') return rng.weighted<StrumColour>([['sus4', 1], ['sus2', 1.5]]);
  return null;
}

const ARP_DESC: Record<ArpKind, string> = {
  broken: 'broken chords up and down the shape, letting them ring',
  travis: 'Travis picking: the thumb on the bass notes, the fingers in between',
  rolling: 'a rolling pattern: bass, middle, top, middle',
  ringing: 'ringing 8ths on the top strings',
};

/** The section's chords picked one string at a time (open shapes, on the clean channel), up to `until`. */
function arpeggios(idea: Idea, kind: ArpKind, until: number): GuitarHit[] {
  const { song, chords } = idea;
  const shapes = guitarVoicings(song.key, chords.timeline.map((e) => e.chord), { preferOpen: true });
  const hits: GuitarHit[] = [];
  chords.timeline.forEach((e, i) => {
    const end = Math.min(until, chords.timeline[i + 1]?.step ?? song.total);
    const sh = shapes[i];
    const strs = sh.frets.flatMap((f, s) => (f === null ? [] : [s]));
    const n = sh.notes.length;
    const seq = kind === 'broken' ? [...Array.from({ length: n }, (_, k) => k), ...Array.from({ length: Math.max(0, n - 2) }, (_, k) => n - 2 - k)]
      : kind === 'rolling' ? [0, Math.min(2, n - 1), n - 1, Math.min(3, n - 2)]
        : kind === 'ringing' ? [n - 3, n - 1, n - 2, n - 1]
          : [];
    let k = 0;
    for (let g = e.step; g < end; g++) {
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      const j = g - bar.start;
      if (j % 2) continue;
      const onBeat = groupStarts(bar.groups).includes(j);
      // a breath at the end of each four-bar phrase: the last notes ring instead
      const bi = song.bars.indexOf(bar);
      if (bi % 4 === 3 && j >= bar.len - 4 && g !== e.step) continue;
      const len = Math.max(2, Math.min(8, end - g));
      const v = (j === 0 ? 0.66 : onBeat ? 0.6 : 0.54);
      const note = (idx: number, vel: number, ring = true): GuitarHit =>
        ({ step: g, notes: [sh.notes[idx]], strings: [strs[idx]], len: ring ? len : 2, vel, letRing: ring, clean: true });
      if (kind === 'travis') {
        // the thumb alternates two bass notes on the beat; the fingers pick the top strings between
        const bass = [0, Math.min(2, n - 3)];
        if (onBeat) {
          hits.push(note(bass[k % 2], v, false));
          if (g === e.step && n > 3) hits.push(note(n - 1, v * 0.9));
          k++;
        } else hits.push(note([n - 1, n - 2, n - 1, n - 3][k % 4], v * 0.9));
      } else {
        hits.push(note(Math.max(0, seq[k % seq.length]), v));
        k++;
      }
    }
  });
  return hits;
}

const FILL_DESC: Record<FillKind, string> = {
  walk: 'a bass walk into the next chord',
  pent: 'a pentatonic lick between chords',
  double: 'a double-stop hammer-on between chords',
};

/** String for a low note (a bass walk or a lick), low E to G. */
const stringFor = (m: number) => (m < 45 ? 0 : m < 50 ? 1 : m < 55 ? 2 : m < 59 ? 3 : m < 64 ? 4 : 5);
const near = (pc: number, lo: number) => lo + ((pc - lo) % 12 + 12) % 12;

/** A short lick over the last two beats of the bar ending at `end`, on the chord there. */
function lick(kind: FillKind, idea: Idea, end: number): GuitarHit[] {
  const { song, chords } = idea;
  const c = chords.timeline[chords.chordIdx[end - 1]].chord;
  const nextE = chords.timeline[chords.chordIdx[end] ?? -1];
  const root = chordPc(song.key, c);
  const minor = c.q === 'min' || c.q === 'm7' || c.q === '7';
  const hit = (step: number, notes: number[], len: number, vel: number): GuitarHit =>
    ({ step, notes, strings: notes.map(stringFor), len, vel });
  if (kind === 'walk') {
    // three 8ths walking along the scale into the next chord's root
    if (!nextE || end >= song.total) return [];
    const target = near(chordPc(song.key, nextE.chord), 40);
    const scale = SCALES[song.mode].map((i) => (song.key + i) % 12);
    const from = near(root, 40);
    const up = from <= target;
    const steps: number[] = [];
    for (let m = up ? target - 1 : target + 1; steps.length < 3 && m > 30 && m < 60; m += up ? -1 : 1) if (scale.includes(m % 12)) steps.push(m);
    if (steps.length < 3) return [];
    return steps.reverse().map((m, i) => hit(end - 6 + i * 2, [m], 2, 0.72));
  }
  if (kind === 'pent') {
    // four 8ths down the pentatonic from the octave, ending on a chord note
    const r = near(root, 48);
    const degs = minor ? [12, 10, 7, 3] : [12, 9, 7, 4];
    return degs.map((x, i) => hit(end - 8 + i * 2, [r + x], 2, i === 0 ? 0.74 : 0.68));
  }
  // a double-stop on the G and B strings: from a half step under the 3rd (a whole step for minor) up to it, with the 5th
  const third = near((root + (c.q === 'min' || c.q === 'm7' ? 3 : 4)) % 12, 56);
  const fifth = third + (c.q === 'min' || c.q === 'm7' ? 4 : 3);
  const from = third - (c.q === 'min' || c.q === 'm7' ? 2 : 1);
  return [
    { step: end - 4, notes: [from, fifth], strings: [3, 4], len: 1, vel: 0.7 },
    { step: end - 3, notes: [third, fifth], strings: [3, 4], len: 3, vel: 0.66 },
  ];
}
