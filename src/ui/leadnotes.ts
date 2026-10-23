// The melody view for Guitar 2: its hits (idea.guitar2) as the viewer's notes, for the sections where nobody sings
// (a solo, a lead break, a jam outro, an intro or interlude the lead guitar plays alone). Pure; the viewer draws them.

import type { GuitarHit, Idea } from '../idea';

/** A note as the viewer draws it. `bend`: the glide in from the last note (vocal); `slide`: the scoop in, in semitones (below: positive). */
export interface RollNote {
  step: number; len: number; midi: number;
  bend?: number; slide?: number; fall?: number; slideLen?: number;
  /** Picked this many semitones lower and bent up to the note later on. */
  late?: number;
  /** A bend let down again partway, this many semitones. */
  unbend?: number;
  /** Held notes with vibrato (cents). */
  vib?: number;
  /** A short mark on the note: h hammered, p pulled off, s slid into, tr trill, tm tremolo. */
  mark?: string;
}

export interface LeadView {
  /** The melody: the top note of each hit, in runs (a run breaks at a gap of a beat or more). */
  lines: RollNote[][];
  /** The other notes of double-stops and the low note of a pedal riff. */
  extras: RollNote[];
  /** How many of each technique, for the stats line. */
  counts: Record<string, number>;
}

/** A gap of at least this many 16ths ends a run (the viewer marks leaps only inside one). */
const RUN_GAP = 4;

/** Whether a section has no sung notes but lead guitar notes. */
export function leadOnly(idea: Idea): boolean {
  const sung = idea.sung ? idea.sung.some((l) => l.notes.length) : !!idea.vocal?.length;
  return !sung && idea.guitar2.some((h) => !h.mute && h.notes.length);
}

/** Guitar 2's hits as notes to draw. */
export function leadView(idea: Idea): LeadView {
  const hits = idea.guitar2.filter((h) => !h.mute && h.notes.length).sort((a, b) => a.step - b.step);
  const lines: RollNote[][] = [], extras: RollNote[] = [];
  const counts: Record<string, number> = {};
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  let prev: RollNote | undefined;
  for (const h of hits) {
    const sorted = [...h.notes].sort((a, b) => a - b);
    const top = h.pedal ? undefined : sorted[sorted.length - 1];
    const step = h.step + (h.shift ?? 0);
    sorted.forEach((m, j) => { if (h.pedal || j < sorted.length - 1) extras.push({ step, len: h.len, midi: m }); });
    if (top === undefined) continue;
    // (a note that carries into the next section is drawn to the section's end)
    const n: RollNote = { step, len: Math.max(1, Math.min(h.len, idea.song.total - step)), midi: top };
    const t = h.touch, bend = h.bend || t?.bend, scoop = bend || h.slide;
    if (scoop) { n.slide = scoop; n.slideLen = Math.min(h.len * 0.5, 2); }
    if (h.lateBend) n.late = h.lateBend;
    if (h.unbend) n.unbend = h.unbend;
    if (t?.fall) n.fall = t.fall;
    const vib = h.vib ?? t?.vib;
    if (vib) n.vib = vib;
    n.mark = markOf(h, prev);
    if (bend) count('bends');
    if (h.slide || n.mark === 's') count('slides');
    if (h.lateBend) count('late bends');
    if (h.unbend) count('bends let down');
    if (h.trill) count('trills');
    if (h.tremolo) count('tremolo');
    if (n.mark === 'h') count('hammer-ons');
    if (n.mark === 'p') count('pull-offs');
    if (sorted.length > 1) count('double-stops');
    if (!prev || step - (prev.step + prev.len) >= RUN_GAP) lines.push([]);
    lines[lines.length - 1].push(n);
    prev = n;
  }
  return { lines, extras, counts };
}

function markOf(h: GuitarHit, prev?: RollNote): string | undefined {
  if (h.trill) return 'tr';
  if (h.tremolo) return 'tm';
  // (as the player's hands play it, else as written)
  const move = h.touch?.move ?? (h.art === 'legato' ? 'hammer' : h.art);
  if (move === 'hammer' || move === 'pull') return prev && h.notes[h.notes.length - 1] < prev.midi ? 'p' : 'h';
  if (move === 'slide' && !h.slide) return 's';
  return undefined;
}
