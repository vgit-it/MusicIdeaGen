// The singer's feel: where each sung note really lands against the beat (Paul: the syllables sound
// "like it's running on a drum beat... no feel"). The written notes sit on the grid; a singer doesn't.
// From studies of sung timing (Sundberg and Friberg's rules of performance; the laid-back singer of pop
// and rock, measured some tens of milliseconds behind the band):
// - the whole line laid back behind the beat, by the singer's own amount (about 5-40 ms)
// - that lag wandering slowly through the line, not jumping note to note
// - light syllables after a stressed one a little late (long-short, as English is spoken)
// - a note reached by a leap up a touch late (the voice takes time to get there)
// - the line's end slowing: its last notes later (a phrase-final ritardando)
// Applied to every voice when its lines are made (singer.ts) and in the labs.

import type { SungNote } from './sing';

/** A song's lag behind the beat, in seconds (by its seed: each singer their own, about 5-40 ms). */
export function lagFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 0.005 + ((h % 1000) / 1000) * 0.035;
}

/** The line as sung: each note moved off the grid (its end with it, never past the next note's start). */
export function perform(notes: SungNote[], lag: number, seed: number): SungNote[] {
  let a = (seed * 2654435761 + notes.length) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // (the wandering part of the lag: a slow random walk, ±15 ms or so)
  let wander = 0;
  const shift = notes.map((n, i) => {
    const prev = notes[i - 1];
    wander = wander * 0.7 + (rnd() * 2 - 1) * 0.008;
    let d = lag + wander;
    const ioi = prev ? n.t - prev.t : 1;
    // long-short: a light syllable quickly after a stressed one, later by an eighth of the gap
    if (prev && prev.syl.stress && !n.syl.stress && n.syl.text !== '~' && ioi < 0.4) d += 0.12 * ioi;
    // after a leap up of a 4th or more
    if (prev && n.midi - prev.midi >= 5) d += 0.012;
    // the line's end slowing
    const fromEnd = notes.length - 1 - i;
    if (fromEnd === 0) d += 0.025;
    else if (fromEnd === 1) d += 0.012;
    return d;
  });
  const out = notes.map((n, i) => ({ ...n, t: n.t + shift[i], end: n.end + shift[i] }));
  // (in order, with room: a note never starts within 40 ms of the last, nor ends past the next's start)
  for (let i = 1; i < out.length; i++) out[i].t = Math.max(out[i].t, out[i - 1].t + 0.04);
  for (let i = 0; i < out.length; i++) {
    const nx = out[i + 1];
    // (a note joined to the next stays joined)
    const joined = nx && notes[i].end >= notes[i + 1].t - 0.001;
    out[i].end = Math.max(out[i].t + 0.03, nx ? (joined ? nx.t : Math.min(out[i].end, nx.t)) : out[i].end);
  }
  return out;
}
