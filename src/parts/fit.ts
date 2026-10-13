// The singer listens to the band (docs/VOCAL.md, section 7). The tune is written against what the band
// actually plays, not just the key:
// - every chord brings its own notes: over a borrowed chord (a minor iv in a major key, a bVI...) the
//   voice sings that chord's scale, not the key's, so it never grinds a semitone against it
// - no semitone or tritone against the bass note under it (unless the voice is on a chord note)
// - a held note that runs into a new chord moves with it: to a note both chords share, or it slides
//   (one vowel) to the new chord's nearest note as the chord changes
// - each line is written a few times and the one that sits best with the band is kept: fewest clashes
//   (chords, bass, riff), stressed syllables with the kick and snare, notes starting with the chord
//   changes, out of Guitar 2's way, its off-beat notes where the groove syncopates (the kick, the bass,
//   the strum or the riff), not where the band is silent
// - when the band pushes a chord change an 8th early, the singer pushes with it
// - Guitar 2 doesn't play over the singer's words: its melody notes under a sung line (in the singer's
//   range) are left out, so it answers in the gaps and under held notes

import type { ChordPart, GuitarHit, Idea, Song } from '../idea';
import { groupStarts } from '../rhythm';
import { SCALES, chordPc } from '../theory';
import { chordTones } from './guitar2';
import { chordScale } from './motif';
import type { VocalNote } from './vocal';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** What the band plays, as the singer hears it. */
export interface Band {
  bass: number[]; kick: number[]; snare: number[]; riff: GuitarHit[]; lead: GuitarHit[];
  /** Steps where the rhythm section plays something (kick, snare, a bass note, a strum, a riff hit). */
  hits: Set<number>;
  /** The beats. */
  beats: Set<number>;
}

export function bandOf(idea: Idea): Band {
  const hits = new Set<number>();
  const { kick, snare } = idea.drums;
  for (let g = 0; g < idea.song.total; g++) if (kick[g] || snare[g] || idea.bass[g] || (!idea.guitar && idea.strum[g] && idea.strum[g] !== '.')) hits.add(g);
  for (const h of idea.guitar ?? []) hits.add(h.step);
  const beats = new Set(idea.song.bars.flatMap((b) => groupStarts(b.groups).map((p) => b.start + p)));
  return { bass: idea.bass, kick, snare, riff: idea.guitar ?? [], lead: idea.guitar2 ?? [], hits, beats };
}

/** The chords as the singer hears them: each step's chord notes and scale, and whether the chord is borrowed. */
export interface Harmony {
  tones: (g: number) => number[];
  scale: (g: number) => number[];
  borrowed: (g: number) => boolean;
  /** Steps where the chord changes. */
  changes: number[];
}

export function harmonyOf(song: Song, chords: ChordPart): Harmony {
  const { key, mode, total } = song;
  const keyScale = SCALES[mode].map((x) => (key + x) % 12);
  const at = (g: number) => chords.chordIdx[Math.min(total - 1, Math.max(0, g))];
  const tones: number[][] = chords.timeline.map((e) => chordTones(key, e.chord));
  const scales: number[][] = chords.timeline.map((e) => chordScale(mode, e.chord).map((x) => mod(chordPc(key, e.chord) + x, 12)));
  const borrowed = tones.map((ts) => ts.some((t) => !keyScale.includes(t)));
  const changes: number[] = [];
  for (let g = 1; g < total; g++) if (chords.chordIdx[g] !== chords.chordIdx[g - 1]) changes.push(g);
  return { tones: (g) => tones[at(g)], scale: (g) => scales[at(g)], borrowed: (g) => borrowed[at(g)], changes };
}

/** A semitone from one of the chord's notes (and not one of them). */
const rubs = (m: number, tones: number[]) => !tones.includes(mod(m, 12)) && tones.some((t) => [1, 11].includes(mod(m - t, 12)));

/** The bass note sounding at a step (0: none). */
const bassAt = (bass: number[], g: number) => { for (let x = Math.min(g, bass.length - 1); x >= 0; x--) if (bass[x]) return bass[x]; return 0; };

/**
 * Whether a sung note grinds against the band at step g. `firm`: a held or stressed note (passing notes
 * may rub a little; rock's blue notes are left alone over the key's own chords).
 */
function grinds(m: number, g: number, firm: boolean, H: Harmony, bass: number[]): boolean {
  const pc = mod(m, 12);
  const tones = H.tones(g);
  if (tones.includes(pc)) return false;
  if (H.borrowed(g) && (!H.scale(g).includes(pc) || rubs(m, tones))) return true;
  if (firm && rubs(m, tones)) return true;
  const b = bassAt(bass, g);
  return !!b && (firm ? [1, 6, 11] : [1, 6]).includes(mod(m - b, 12));
}

/** How well a stretch of sung notes sits with the band (higher is better). */
export function bandScore(notes: { step: number; len: number; midi: number; stress: boolean }[], H: Harmony, band: Band, total: number): number {
  let s = 0;
  const changes = new Set(H.changes);
  for (const n of notes) {
    if (n.step < 0) continue;
    const firm = n.len >= 4 || n.stress;
    for (let g = n.step; g < Math.min(total, n.step + n.len); g++) {
      const w = g === n.step ? 1 : 0.5;
      const pc = mod(n.midi, 12);
      if (!H.scale(g).includes(pc) && !H.tones(g).includes(pc)) s -= (H.borrowed(g) ? 3 : 1) * w;
      if (grinds(n.midi, g, firm, H, band.bass)) s -= 2 * w;
      for (const h of band.riff) if (h.step <= g && g < h.step + h.len) for (const r of h.notes) if ([1, 6, 11].includes(mod(n.midi - r, 12)) && !H.tones(g).includes(pc)) s -= 0.7 * w;
      // (Guitar 2 sounding right where the voice is: in each other's way)
      for (const h of band.lead) if (h.step <= g && g < h.step + h.len) for (const r of h.notes) if (Math.abs(r - n.midi) <= 4) s -= 0.3 * w;
    }
    if (n.stress && (band.kick[n.step] || band.snare[n.step])) s += 0.5;
    if (changes.has(n.step)) s += 0.6;
    // off the beat: with the groove's syncopations, not against silence
    if (!band.beats.has(n.step)) s += band.hits.has(n.step) ? 0.3 : n.step % 2 ? -0.3 : 0;
    // a held note ending on a note of the chord under its end
    if (n.len >= 4 && H.tones(Math.min(total - 1, n.step + n.len - 1)).includes(mod(n.midi, 12))) s += 0.5;
  }
  return s;
}

/** The nearest pitch (within a 4th) that sits with the band at all of `gs`; chord notes only when `firm`. */
function nearestFit(m: number, gs: number[], firm: boolean, H: Harmony, bass: number[], lo: number, hi: number): number | null {
  for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
    const c = m + d;
    if (c < lo || c > hi) continue;
    if (gs.some((g) => grinds(c, g, firm, H, bass))) continue;
    if (firm && !gs.every((g) => H.tones(g).includes(mod(c, 12)))) continue;
    if (!gs.every((g) => H.scale(g).includes(mod(c, 12)) || H.tones(g).includes(mod(c, 12)))) continue;
    return c;
  }
  return null;
}

/**
 * A section's sung notes, fitted to what its band plays (in place): notes that grind against the chord
 * or the bass move to the nearest one that doesn't; a held note running into a new chord moves to a
 * note both chords share or slides to the new chord's note on the same vowel. `lo`/`hi`: the range.
 */
export function fitToBand(idea: Idea, lo: number, hi: number): { moved: number; slides: number } {
  const out = { moved: 0, slides: 0 };
  const v = idea.vocal;
  if (!v?.length) return out;
  const { total } = idea.song;
  const H = harmonyOf(idea.song, idea.chords);
  const bass = idea.bass;
  for (let i = 0; i < v.length; i++) {
    const n = v[i];
    // (a sigh or a turn's first note leans on purpose: left as written)
    const leaning = (v[i + 1]?.syl.text === '~' && v[i + 1].midi !== n.midi && n.len <= 4) || !!n.colour;
    const firm = n.len >= 4 || n.syl.stress;
    if (!leaning && grinds(n.midi, n.step, firm, H, bass)) {
      const m = nearestFit(n.midi, [n.step], firm, H, bass, lo, hi) ?? nearestFit(n.midi, [n.step], false, H, bass, lo, hi);
      if (m !== null && m !== n.midi) { n.midi = m; out.moved++; }
    }
    if (n.len < 3 || leaning) continue;
    const inside = H.changes.filter((x) => x > n.step && x < Math.min(total, n.step + n.len));
    const c = inside.find((x) => grinds(n.midi, x, true, H, bass));
    if (c === undefined) continue;
    // a note all its chords share, close by
    const common = nearestFit(n.midi, [n.step, ...inside], true, H, bass, lo, hi);
    if (common !== null && Math.abs(common - n.midi) <= 2) { n.midi = common; out.moved++; continue; }
    const to = nearestFit(n.midi, [c], true, H, bass, lo, hi);
    if (to === null) continue;
    if (c - n.step < 2) { n.midi = to; out.moved++; continue; }
    // a slide on the same vowel into the new chord's note
    const tie: VocalNote = {
      ...n, step: c, len: n.step + n.len - c, midi: to, start: false, slide: undefined,
      syl: { onset: [], vowel: n.syl.vowel, coda: n.syl.coda, stress: false, text: '~', wordStart: false },
    };
    // (a fall off the end goes with the end)
    n.fall = undefined;
    n.len = c - n.step;
    n.syl = { ...n.syl, coda: [] };
    v.splice(i + 1, 0, tie);
    out.slides++;
  }
  return out;
}

/**
 * When the band pushes a chord change (an 8th or a 16th before the beat, with the kick or the bass on
 * it), the singer pushes with it: a held or stressed note starting on that beat comes in on the push.
 */
export function pushWithBand(idea: Idea, unit = 1): number {
  const v = idea.vocal;
  if (!v?.length) return 0;
  const band = bandOf(idea);
  const H = harmonyOf(idea.song, idea.chords);
  let pushed = 0;
  for (const c of H.changes) {
    if (band.beats.has(c) || !(band.kick[c] || band.bass[c]) || c % unit) continue;
    const beat = [c + 1, c + 2].find((g) => band.beats.has(g));
    if (beat === undefined) continue;
    const i = v.findIndex((n) => n.step === beat && n.syl.text !== '~');
    if (i < 0 || !(v[i].len >= 4 || v[i].syl.stress)) continue;
    const before = v[i - 1];
    if (before && before.step >= c) continue;
    if (before && before.step + before.len > c) before.len = c - before.step;
    v[i].len += v[i].step - c;
    v[i].step = c;
    pushed++;
  }
  return pushed;
}

/**
 * Guitar 2 doesn't play over the singer's words: its melody notes (single notes and double-stops, not
 * ringing arpeggios, swells or muted scratches) starting under a sung line, in the singer's range (the
 * low voice's or the high voice's), are left out. Under the singer's held notes and in the gaps it
 * still plays: it answers. Returns how many notes it left out.
 */
export function clearForSinger(idea: Idea): number {
  const v = idea.vocal;
  if (!v?.length || !idea.guitar2.length) return 0;
  // the busy part of each line: from its first note to the start of its held note
  const words: { from: number; to: number; lo: number; hi: number }[] = [];
  let cur: VocalNote[] = [];
  const close = () => {
    if (!cur.length) return;
    const held = cur.findIndex((n, k) => k > 0 && n.len >= 4);
    const busy = held > 0 ? cur.slice(0, held) : cur;
    const last = busy[busy.length - 1];
    words.push({ from: busy[0].step, to: last.step + last.len, lo: Math.min(...busy.map((n) => n.midi)), hi: Math.max(...busy.map((n) => n.midi)) });
    cur = [];
  };
  for (const n of v) { if (n.start) close(); cur.push(n); }
  close();
  const before = idea.guitar2.length;
  idea.guitar2 = idea.guitar2.filter((h) => {
    if (h.letRing || h.swell || h.mute || h.notes.length > 2) return true;
    const w = words.find((x) => h.step >= x.from && h.step < x.to);
    if (!w) return true;
    // (in range of either voice: as written, or an octave up)
    return !h.notes.some((m) => (m >= w.lo - 7 && m <= w.hi + 7) || (m >= w.lo + 5 && m <= w.hi + 19));
  });
  return before - idea.guitar2.length;
}
