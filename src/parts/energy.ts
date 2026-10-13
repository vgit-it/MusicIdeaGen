// How the singer carries the song's energy (docs/VOCAL-ENERGY.md). Energy isn't only "faster or
// higher": each song gets an energy style, a way its singer turns the band's energy into singing,
// after real songs (Paul's references):
// - Climber (Guns N' Roses "Sweet Child o' Mine"): energy is height and holding: higher, wider, long held
//   notes, belts up top
// - Puncher (AC/DC "Back in Black"): energy is attack: short punchy words on few notes, sung in the
//   riff's gaps and locked to the kick and snare, ahead of the beat
// - Driver (Green Day "Holiday"): energy is drive: a steady stream of words on the beat, stacked
//   (doubled) as it builds
// - Brooder (Alice in Chains "Rooster"): weight, not height: low, slow, long notes, a dark harmony under
//   it, laid back behind the beat; louder sections get heavier, not higher
// - Drifter (Alice in Chains "Nutshell"): space: few words, short lines starting late with long rests,
//   falling lines, sighs; it barely moves with the band
// - Switcher (Audioslave "Like a Stone"): contrast: quiet sections low, narrow and restrained, loud ones
//   leap way up and hold
// A section's level (its energy, and where it sits between the song's quietest and loudest) sets how far
// each dial turns. Now and then (about one sung section in six) the singer goes against the band on
// purpose: holding back while the band pushes, or breaking out over a quiet band. Off: the vocal as before.

import type { Genre } from '../genres';
import type { Idea } from '../idea';
import { Rng } from '../rng';
import type { Mood } from '../tension';
import { chordTones } from './guitar2';
import type { MelodyStyle } from './melody';
import type { VocalNote } from './vocal';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type EnergyStyle = 'climber' | 'puncher' | 'driver' | 'brooder' | 'drifter' | 'switcher';
export const ENERGY_IDS: EnergyStyle[] = ['climber', 'puncher', 'driver', 'brooder', 'drifter', 'switcher'];

export const ENERGY: Record<EnergyStyle, { label: string; like: string; desc: string }> = {
  climber: { label: 'Climber', like: 'Sweet Child o\' Mine', desc: 'energy as height: higher, wider and held as it builds, belts up top' },
  puncher: { label: 'Puncher', like: 'Back in Black', desc: 'energy as attack: short punchy words on few notes, in the riff\'s gaps, locked to the kick and snare' },
  driver: { label: 'Driver', like: 'Holiday', desc: 'energy as drive: a steady stream of words on the beat, doubled as it builds' },
  brooder: { label: 'Brooder', like: 'Rooster', desc: 'energy as weight: low, long and laid back, a dark harmony under it; louder means heavier, not higher' },
  drifter: { label: 'Drifter', like: 'Nutshell', desc: 'energy as space: few words, short lines and long rests, falling lines and sighs' },
  switcher: { label: 'Switcher', like: 'Like a Stone', desc: 'energy as contrast: quiet sections low and held back, loud ones leap way up and hold' },
};

/** Which styles suit a genre (and a mood leans them). */
const BY_GENRE: Record<Genre, Partial<Record<EnergyStyle, number>>> = {
  rock: { climber: 2, puncher: 2, driver: 2.5, brooder: 0.5, drifter: 1, switcher: 1.5 },
  pop: { climber: 1.5, puncher: 0.5, driver: 2.5, brooder: 0.2, drifter: 1, switcher: 1 },
  funk: { climber: 0.5, puncher: 3, driver: 1.5, brooder: 0.2, drifter: 0.3, switcher: 0.5 },
  hardrock: { climber: 3, puncher: 3, driver: 1, brooder: 0.5, drifter: 0.3, switcher: 1 },
  metal: { climber: 2, puncher: 2, driver: 1, brooder: 1.5, drifter: 0.3, switcher: 1.5 },
  grunge: { climber: 0.5, puncher: 0.5, driver: 0.8, brooder: 3, drifter: 2.5, switcher: 2 },
  altmetal: { climber: 1, puncher: 1.5, driver: 0.5, brooder: 2, drifter: 1, switcher: 3 },
};
const BY_MOOD: Record<Mood, Partial<Record<EnergyStyle, number>>> = {
  happy: { climber: 1.3, driver: 1.5, brooder: 0.3, drifter: 0.5 },
  triumphant: { climber: 1.8, driver: 1.2, drifter: 0.4 },
  nostalgic: { drifter: 1.5, climber: 1.2, puncher: 0.6 },
  melancholic: { drifter: 1.8, brooder: 1.4, puncher: 0.4, driver: 0.6 },
  dreamy: { drifter: 2, switcher: 1.2, puncher: 0.3, driver: 0.5 },
  tense: { puncher: 1.4, brooder: 1.3, switcher: 1.3 },
  angry: { puncher: 1.6, driver: 1.4, drifter: 0.4 },
  dark: { brooder: 1.8, switcher: 1.3, driver: 0.5, climber: 0.7 },
};

/** The song's energy style: chosen, or on Auto by its genre and mood. */
export function pickEnergy(seed: string, mood: Mood, genre: Genre, chosen?: EnergyStyle): EnergyStyle {
  if (chosen) return chosen;
  const w = ENERGY_IDS.map((k) => [k, (BY_GENRE[genre][k] ?? 1) * (BY_MOOD[mood][k] ?? 1)] as [EnergyStyle, number]);
  return new Rng(`${seed}-energy`).weighted(w);
}

/** How a section's tune is written at its level: the dials an energy style turns. */
export interface Dials {
  /** Semitones higher; range (x); words (x). */
  register: number;
  span: number;
  busy: number;
  /** How joined the notes are (lower: detached, punchier); chances of anticipations and syncopations (added). */
  legato: number;
  sync: number;
  syncop: number;
  /** Notes held inside lines (added); how long line ends are held (replaces the singer's). */
  hold: number;
  holdLen?: [('short' | 'mid' | 'long'), number][];
  /** Lines shorter (one-bar punches) or longer (four bars on a breath). */
  lines?: 'short' | 'long';
  /** Where lines start (on the beat; after it, leaving space). */
  start?: 'down' | 'after';
  /** Repeated notes, leaps, sighs, falls off line ends, belts (added). */
  repeat: number;
  leap: number;
  lean: number;
  fall: number;
  belt: number;
  /** Fitting the band: stressed words with the kick and snare (x); words in the riff's gaps (call and response). */
  lock: number;
  gaps: number;
  /** Chance a line leaves its first words out (starting later: space). */
  space?: number;
}

const BASE: Dials = { register: 0, span: 1, busy: 1, legato: 1, sync: 0, syncop: 0, hold: 0, repeat: 0, leap: 0, lean: 0, fall: 0, belt: 0, lock: 1, gaps: 0 };

/**
 * How loud a section is for its singer, -1 (quietest) to 1 (everything): half its own energy (1-5),
 * half where it sits between the song's quietest and loudest sung sections (a verse at 3 in a song whose
 * choruses are 5 is a quiet section).
 */
export function levelOf(energy: number, lo: number, hi: number): number {
  const abs = (energy - 3) / 2;
  const rel = hi > lo ? (2 * (energy - lo)) / (hi - lo) - 1 : abs;
  return Math.max(-1, Math.min(1, 0.5 * abs + 0.5 * rel));
}

/** The dials for a style at a section's level (levelOf: -1 quietest to 1 everything). */
export function dialsFor(style: EnergyStyle, x: number): Dials {
  const up = Math.max(0, x), down = Math.max(0, -x);
  switch (style) {
    case 'climber': return {
      ...BASE, register: 3 * up - 2 * down, span: 1 + 0.25 * x, busy: 1 - 0.15 * up, hold: 0.15 * up,
      holdLen: up > 0.3 ? [['mid', 2], ['long', 4]] : undefined, lines: up > 0.3 ? 'long' : undefined,
      leap: 0.08 * x, belt: 0.4 * up,
    };
    case 'puncher': return {
      ...BASE, register: 2 * up, span: 0.8, busy: 1 + 0.1 * up, legato: 0.8 - 0.3 * up, sync: -0.05, syncop: -0.1,
      hold: -0.15, holdLen: [['short', 3 + 2 * up], ['mid', 1]], lines: 'short', start: 'down',
      repeat: 0.08, leap: -0.06, fall: 0.1 * up, lock: 2.5, gaps: 1.5,
    };
    case 'driver': return {
      ...BASE, register: 2 * x, span: 0.95, busy: 1.1 + 0.35 * up - 0.1 * down, legato: 0.8 - 0.1 * up, sync: -0.05, syncop: -0.15,
      hold: -0.2, holdLen: [['short', 2], ['mid', 3]], start: 'down', lock: 1.8, repeat: 0.05,
    };
    case 'brooder': return {
      ...BASE, register: -3 + x, span: 0.85, busy: 0.8 - 0.1 * up, hold: 0.25 + 0.1 * up,
      holdLen: [['mid', 2], ['long', 3]], lines: 'long', syncop: -0.05, repeat: 0.05, lean: 0.1, fall: 0.1, lock: 0.6,
    };
    case 'drifter': return {
      ...BASE, register: -1 + up, span: 0.9, busy: 0.65, hold: 0.15, holdLen: [['short', 3], ['mid', 2]], start: 'after',
      lean: 0.15, fall: 0.25, lock: 0.6, space: 0.8 - 0.3 * up,
    };
    case 'switcher': {
      // (the contrast exaggerated: past the middle it's already most of the way)
      const s = Math.sign(x) * Math.min(1, Math.abs(x) * 1.6), su = Math.max(0, s), sd = Math.max(0, -s);
      return {
        ...BASE, register: 4 * su - 3 * sd, span: 1 + 0.3 * su - 0.2 * sd, busy: 1 - 0.25 * su - 0.1 * sd, hold: 0.2 * su,
        holdLen: su > 0.3 ? [['mid', 1], ['long', 4]] : sd > 0.3 ? [['short', 2], ['mid', 2]] : undefined, lines: su > 0.3 ? 'long' : undefined,
        leap: 0.1 * su - 0.05 * sd, belt: 0.5 * su, lean: 0.05 * sd,
      };
    }
  }
}

/** Phrase plans for shorter or longer lines than the singer's own (bars per line). */
const PLANS: Record<'short' | 'long', [string, number][]> = {
  short: [['1111', 3], ['1122', 2], ['2211', 1], ['1124', 1]],
  long: [['44', 2], ['224', 2], ['2222', 1]],
};

/**
 * The guitars' busyness under the singer (0: sparse, 1: a busy riff of 8ths): the singer sings fewer
 * words over a busy guitar and more over a sparse one (a Puncher aside: it answers the riff in its gaps).
 */
export function bandBusy(idea: Idea): number {
  const bars = idea.song.bars.length || 1;
  const riff = new Set((idea.guitar ?? []).map((h) => h.step)).size;
  const lead = new Set((idea.guitar2 ?? []).filter((h) => !h.letRing && !h.swell).map((h) => h.step)).size;
  return clamp01((riff + 0.5 * lead) / bars / 8);
}

/** A song's melody style with a section's dials turned (a copy; the singer copied too). */
export function energize(style: MelodyStyle, d: Dials, kind: string, busyBand: number, es: EnergyStyle): MelodyStyle {
  const singer = { ...style.singer, plans: { ...style.singer.plans } };
  singer.syncop = clamp01(singer.syncop + d.syncop);
  singer.hold = clamp01(singer.hold + d.hold);
  singer.fall = clamp01(singer.fall + d.fall);
  singer.belt = clamp01(singer.belt + d.belt);
  if (d.holdLen) singer.holdLen = d.holdLen;
  if (d.lines) singer.plans[kind as 'verse'] = PLANS[d.lines];
  // (the band's guitars: fewer words over a busy riff, more over a sparse one; a Puncher answers in the gaps)
  const band = es === 'puncher' ? 1 : 1.08 - 0.22 * busyBand;
  const s: MelodyStyle = {
    ...style, singer,
    energyReg: Math.round(d.register), span: style.span * d.span, space: d.space,
    busyVerse: style.busyVerse * d.busy * band, busyChorus: style.busyChorus * d.busy * band,
    legato: Math.min(1, style.legato * d.legato), sync: clamp01(style.sync + d.sync),
    repeat: clamp01(style.repeat + d.repeat), leap: clamp01(style.leap + d.leap), lean: clamp01(style.lean + d.lean),
    grip: { lock: d.lock, gaps: d.gaps },
  };
  if (d.start) { s.verseStart = d.start; s.chorusStart = d.start; }
  return s;
}

/** How closely the tune follows the tension curve, by style (x the mood's). */
export const FOLLOW_BY: Record<EnergyStyle, number> = { climber: 1.3, puncher: 0.5, driver: 0.8, brooder: 0.4, drifter: 0.4, switcher: 1.2 };

/** The singer's place against the beat, by style (seconds: more behind, or ahead in loud sections). */
export function layFor(es: EnergyStyle, energy: number): number {
  const up = Math.max(0, (energy - 3) / 2);
  return es === 'brooder' ? 0.025 : es === 'drifter' ? 0.018 : es === 'puncher' ? -0.006 * up : es === 'driver' ? -0.004 * up : 0;
}

/** Against the band, on purpose: holding back while it pushes, breaking out over a quiet band. */
export type Against = 'holdback' | 'breakout';

/** Whether a sung section goes against the band (about one in six; never the song's first sung section). */
export function againstFor(rng: Rng, energy: number, first: boolean): Against | null {
  if (first || !rng.chance(1 / 6)) return null;
  return energy >= 4 ? 'holdback' : energy <= 2 ? 'breakout' : rng.pick(['holdback', 'breakout'] as const);
}

/**
 * A section as sung at its energy (in place, after the tune's laid in): the accents (a Puncher's or a
 * Driver's stressed words hit harder, the light ones softer, more so the louder the band) and, against
 * the band, the singer holding back (softer, held notes settling to the chord note below, no belts) or
 * breaking out (held notes reaching up to the next chord note, each line's top belted). Returns what it did.
 */
export function deliverEnergy(idea: Idea, es: EnergyStyle, against: Against | null, lo: number, hi: number): string | null {
  const v = idea.vocal;
  if (!v?.length) return null;
  const energy = idea.section?.energy ?? 3;
  const up = Math.max(0, (energy - 3) / 2);
  const { key, total } = idea.song;
  const tonesAt = (g: number) => chordTones(key, idea.chords.timeline[idea.chords.chordIdx[Math.min(total - 1, Math.max(0, Math.floor(g)))]].chord);
  // accents: punch (or, laid back, evened out)
  const punch = es === 'puncher' ? 0.5 + 0.5 * up : es === 'driver' ? 0.3 + 0.4 * up : es === 'brooder' || es === 'drifter' ? -0.2 : 0;
  if (punch) for (const n of v) {
    if (n.syl.text === '~') continue;
    n.vel = Math.max(0.4, Math.min(1, n.vel + (n.syl.stress ? 0.08 : -0.1) * punch));
  }
  if (!against) return null;
  const held = v.filter((n, i) => n.len >= 4 && n.syl.text !== '~' && v[i + 1]?.syl.text !== '~' && !n.colour);
  if (against === 'holdback') {
    for (const n of v) { n.vel = Math.max(0.4, n.vel * 0.82); n.belt = false; }
    for (const n of held) {
      const tones = tonesAt(n.step);
      for (let s = 2; s <= 5; s++) { const m = n.midi - s; if (m >= lo && tones.includes(mod(m, 12))) { n.midi = m; break; } }
    }
    return 'the singer holds back while the band pushes (softer, held notes settled lower)';
  }
  for (const n of v) n.vel = Math.min(1, n.vel * 1.12);
  for (const n of held) {
    const tones = tonesAt(n.step);
    for (let s = 2; s <= 5; s++) { const m = n.midi + s; if (m <= hi && tones.includes(mod(m, 12))) { n.midi = m; break; } }
  }
  // (each line's top held note belted)
  const lines: VocalNote[][] = [];
  for (const n of v) { if (n.start || !lines.length) lines.push([]); lines[lines.length - 1].push(n); }
  for (const L of lines) {
    const top = L.filter((n) => held.includes(n)).reduce<VocalNote | null>((b, n) => (!b || n.midi > b.midi ? n : b), null);
    if (top) { top.belt = true; top.vel = Math.max(top.vel, 0.95); top.fall = undefined; }
  }
  return 'the singer breaks out over a quiet band (held notes reaching up, belted)';
}

/**
 * Backing vocals by energy style: the Brooder's dark harmony under it; a Driver doubles every loud
 * section (verses too); a Drifter or a Switcher leaves quieter choruses single (the space is the point).
 */
export function stackFor(es: EnergyStyle | null): { backing?: 'under'; doubleAt?: number; singleBelow?: number } {
  if (es === 'brooder') return { backing: 'under' };
  if (es === 'driver') return { doubleAt: 4 };
  if (es === 'drifter' || es === 'switcher') return { singleBelow: 4 };
  return {};
}
