// Human feel (Guide line switch, docs/GUIDE-FEEL.md; Paul: "immediate jumps between notes ... not very
// human like"): how a person moves into, between and out of the notes, by the singer and the section's
// energy. Only how the line is played or sung; the written line stays the same.
// - glide: sliding from one note to the next instead of jumping (in seconds)
// - scoop: starting a little under a fresh note and sliding up into it
// - swell: the level rising into a word's start instead of hitting it at full strength
// - fade: a word's end fading out (longer in quiet sections and slow songs)
// - fall: now and then a phrase's last note dropping off at its end
// - vibrato on held notes only, coming in late (the synth; the sung voices have their own)
// - pushed (loud) top notes a hair sharp
// - a breath in before a phrase after a rest
// - a phrase's last word a touch late and softer
// Timings in seconds (a voice takes about as long to get to a note at any tempo); only the fade stretches a
// little in slow songs.

import type { SungNote } from '../audio/sing';
import { Rng } from '../rng';

export interface Feel {
  glide: number; scoopP: number; scoopBy: number; scoopLen: number; swell: number; fade: number;
  fallP: number; fallBy: number; vib: number; sharp: number; breath: number; late: number;
  /** An 8th note, in seconds (at the song's tempo). */
  eighth: number;
}

/** The middle of the road (the clear voice, the synth when the genre has nothing of its own). */
const BASE: Feel = { glide: 0.08, scoopP: 0.3, scoopBy: 0.6, scoopLen: 0.07, swell: 0.06, fade: 0.09, fallP: 0.25, fallBy: 1.5, vib: 25, sharp: 10, breath: 0.6, late: 0.02, eighth: 0.25 };

/**
 * Each singer their own (the genre voices and the characters): pop clean and quick; rock scooping; hard rock
 * and metal hitting hard, short ends; grunge and the big dark voices sliding, scooping deep, falling off;
 * funk tight and quick.
 */
const SINGERS: Record<string, Partial<Feel>> = {
  pop: { glide: 0.06, scoopP: 0.25, scoopBy: 0.5, swell: 0.05, fade: 0.08, fallP: 0.15, vib: 22, sharp: 6, breath: 0.5 },
  rock: { glide: 0.08, scoopP: 0.35, scoopBy: 0.8, swell: 0.045, fade: 0.07, fallP: 0.3, vib: 30 },
  hardrock: { glide: 0.07, scoopP: 0.45, scoopBy: 1, swell: 0.03, fade: 0.05, fallP: 0.35, vib: 35, sharp: 14 },
  metal: { glide: 0.05, scoopP: 0.3, scoopBy: 0.8, swell: 0.02, fade: 0.04, fallP: 0.2, vib: 35, sharp: 12, breath: 0.5 },
  grunge: { glide: 0.11, scoopP: 0.5, scoopBy: 1.2, swell: 0.07, fade: 0.11, fallP: 0.45, fallBy: 2, vib: 18, sharp: 8, late: 0.03 },
  altmetal: { glide: 0.06, scoopP: 0.35, scoopBy: 0.8, swell: 0.03, fade: 0.05, fallP: 0.3, vib: 30, sharp: 12 },
  funk: { glide: 0.045, scoopP: 0.3, scoopBy: 0.6, swell: 0.025, fade: 0.05, fallP: 0.25, vib: 20, late: 0.012 },
  deep: { glide: 0.12, scoopP: 0.55, scoopBy: 1.2, swell: 0.08, fade: 0.12, fallP: 0.4, fallBy: 2, vib: 24, late: 0.03 },
  cornell: { glide: 0.1, scoopP: 0.5, scoopBy: 1, swell: 0.06, fade: 0.1, fallP: 0.35, sharp: 12, vib: 40 },
  scream: { glide: 0.06, scoopP: 0.35, scoopBy: 0.8, swell: 0.03, fade: 0.06, fallP: 0.25, sharp: 14 },
  woman: { glide: 0.08, scoopP: 0.3, scoopBy: 0.6, swell: 0.06, fade: 0.1, fallP: 0.2, vib: 30 },
  nasal: { glide: 0.09, scoopP: 0.45, scoopBy: 0.9, swell: 0.05, fade: 0.09, fallP: 0.35 },
};

/** A quieter note's level (times the normal amplitude), and how far a long word's end fades (dB). */
export const LOW_GAIN = 0.8;
const WORD_FADE_DB = 9;

const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.max(0, Math.min(1, x));

/**
 * The feel for a singer (a genre, a character, or 'clear'), at a section's energy (0-1) and tempo: quiet
 * sections slower and softer in (longer swells and fades, more falls, slower glides); loud ones quick and
 * punchy (short swells and fades, bigger scoops, sharper pushed notes).
 */
export function feelFor(singer: string, energy: number, bpm: number): Feel {
  const f = { ...BASE, ...SINGERS[singer] };
  const e = energy;
  return {
    ...f,
    glide: f.glide * lerp(1.25, 0.8, e),
    scoopBy: f.scoopBy * lerp(0.8, 1.2, e),
    scoopLen: f.scoopLen * lerp(1.2, 0.8, e),
    swell: f.swell * lerp(1.5, 0.6, e),
    fade: f.fade * lerp(1.4, 0.6, e) * Math.max(0.8, Math.min(1.3, Math.sqrt(120 / bpm))),
    fallP: f.fallP * lerp(1.3, 0.7, e),
    sharp: f.sharp * lerp(0.3, 1, e),
    breath: f.breath * lerp(1, 0.7, e),
    eighth: 30 / bpm,
  };
}

/**
 * A sung line with the feel on (each note told how to start and end; the voices do the rest): scoops into
 * fresh or stressed word starts, swells into words after a pause, fades at word ends, now and then a fall
 * at the line's end, its pushed top notes a hair sharp, its last word a touch late. `seed`: the line's own dice.
 */
export function feelSung(notes: SungNote[], f: Feel, seed: number): SungNote[] {
  const rng = new Rng(`feel-${seed}`);
  const top = Math.max(...notes.map((n) => n.midi));
  const out = notes.map((n, i) => {
    const prev = notes[i - 1], next = notes[i + 1];
    const held = n.end - n.t;
    const o: SungNote = { ...n, glide: f.glide };
    if (n.bend) return o;
    const sung = n.syl.text !== '~';
    const fresh = !prev || n.t - prev.end > 0.12;
    if (sung && n.syl.wordStart && n.slide === undefined && rng.chance(f.scoopP * (fresh ? 1.4 : n.syl.stress ? 1 : 0.5)) && held > 0.12)
      o.slide = f.scoopBy * (0.6 + 0.6 * rng.next());
    if (sung && (fresh || n.syl.wordStart)) o.swell = f.swell * (fresh ? 1 : 0.6) * (0.8 + 0.4 * rng.next());
    // (a word's end: the next note a new word, or none; not before a bend, which carries the word on)
    if (!next || (next.syl.wordStart && !next.bend)) {
      o.fade = Math.min(f.fade * (0.8 + 0.4 * rng.next()), held * 0.45);
      // (a word an 8th long or longer: it dies away over the last 40% of the note, up to 0.45 s, by 9 dB)
      if (sung && held >= f.eighth * 0.95) { o.fade = Math.min(0.45, held * 0.4); o.fadeBy = WORD_FADE_DB; }
    }
    if (n.vel >= 0.85 || (n.midi === top && held > 0.3 && f.sharp >= 6)) o.sharp = f.sharp * (0.6 + 0.4 * rng.next());
    return o;
  });
  // (a quieter note now and then in a series of notes that touch: more often the shorter the note, never two in a row; its own dice)
  const low = new Rng(`feel-low-${seed}`);
  let lastLow = -2;
  out.forEach((o, i) => {
    const n = notes[i], prev = notes[i - 1], next = notes[i + 1];
    const touching = (a: SungNote | undefined, b: SungNote | undefined) => !!a && !!b && b.t - a.end < 0.06;
    const roll = low.next();
    if (n.bend || n.syl.text === '~' || lastLow === i - 1 || !(touching(prev, n) || touching(n, next))) return;
    const r = (n.end - n.t) / f.eighth;
    const p = r < 0.75 ? 0.3 : r < 1.5 ? 0.2 : r < 3 ? 0.1 : 0.04;
    if (roll < p) { o.gain = LOW_GAIN; lastLow = i; }
  });
  const last = out[out.length - 1];
  const lastHeld = last.end - last.t;
  if (!last.bend && last.fall === undefined && lastHeld > 0.25 && rng.chance(f.fallP)) last.fall = f.fallBy * (0.6 + 0.6 * rng.next());
  // (the last word a touch late and softer)
  if (out.length > 1 && !last.bend && last.syl.wordStart && lastHeld > 0.15) {
    const late = Math.min(f.late * (0.6 + 0.8 * rng.next()), lastHeld * 0.3);
    last.t += late;
    last.vel *= 0.92;
  }
  return out;
}

/** A short breath in (mono, at `rate`): filtered noise swelling and cut, about a quarter second, peak 1. */
export function inhale(rate: number, len: number, seed: number): Float32Array {
  const n = Math.round(len * rate);
  const out = new Float32Array(n);
  const rng = new Rng(`feel-${seed}`);
  let lp = 0, hp = 0, peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const w = rng.next() * 2 - 1;
    // (a breathy band: low-passed around 3 kHz, the rumble taken out)
    lp += (w - lp) * 0.35;
    hp += (lp - hp) * 0.04;
    const env = Math.sin(Math.PI * Math.min(1, x / 0.85)) ** 1.5 * (1 - Math.max(0, (x - 0.85) / 0.15));
    out[i] = (lp - hp) * env;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}
