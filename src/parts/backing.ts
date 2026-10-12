// Backing vocals and ad-libs (docs/VOCAL.md, section 5): what a producer stacks on a lead vocal as a
// song builds.
// - Choruses double-tracked (the lead sung twice, the second take a little apart, panned).
// - Harmonies, by the song's mood and style: a third above (pop and rock's sweet, bright stack: happy,
//   triumphant, nostalgic), a lower harmony a fourth to a fifth under (heavier, darker songs, the Alice
//   in Chains kind), soft "ooh"/"aah" pads on the chords (melancholic, dreamy), or a gang singing the
//   hook in unison (funk). They grow through the song: the first chorus only on its hook lines, later
//   choruses on every line, quieter sections only with the soft pads.
// - Ad-libs over the climax and the outro: "yeah", an "oh" run falling from up high, a "whoa-oh", in
//   the gaps between lines, and one long high "oh" over the climax's last held note (where the song
//   peaks: the singer lets go).

import type { ChordPart, Idea, SectionKind } from '../idea';
import type { Genre } from '../genres';
import { Rng } from '../rng';
import type { Mood } from '../tension';
import { SCALES } from '../theory';
import { chordTones } from './guitar2';
import type { Cons, Syllable, Vowel } from './lyrics';
import type { VocalNote } from './vocal';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export type Backing = 'thirds' | 'under' | 'oohs' | 'gang';

export const BACKING_DESC: Record<Backing, string> = {
  thirds: 'harmonies a third above',
  under: 'a lower harmony under the lead',
  oohs: 'soft oohs on the chords',
  gang: 'a gang singing the hook with the lead',
};

/** The song's backing vocals, by its mood and style. */
export function pickBacking(seed: string, mood: Mood, genre: Genre): Backing {
  const w: [Backing, number][] = genre === 'funk' ? [['gang', 3], ['thirds', 2], ['oohs', 1]]
    : ['melancholic', 'dreamy'].includes(mood) ? [['oohs', 4], ['thirds', 1]]
      : ['dark', 'angry', 'tense'].includes(mood) || ['metal', 'altmetal', 'grunge'].includes(genre) ? [['under', 3], ['thirds', 1], ['oohs', 1]]
        : [['thirds', 4], ['oohs', 1], ['under', 1]];
  return new Rng(`${seed}-backing`).weighted(w);
}

const syl = (onset: Cons[], vowel: Vowel, coda: Cons[], text: string, stress = true): Syllable => ({ onset, vowel, coda, stress, text, wordStart: true });

const chordAt = (c: ChordPart, g: number, total: number) => c.timeline[c.chordIdx[Math.min(Math.max(0, g), total - 1)]].chord;

/** A harmony note for a lead note: the nearest chord note above (a third or fourth) or below (a fourth to a fifth). */
function harmonyFor(idea: Idea, n: VocalNote, up: boolean): number | null {
  const { key, mode, total } = idea.song;
  const tones = chordTones(key, chordAt(idea.chords, n.step, total));
  const scale = (SCALES[mode] as readonly number[]).map((x) => (key + x) % 12);
  const range = up ? [3, 4, 5] : [5, 7, 6];
  for (const d of range) {
    const m = n.midi + (up ? d : -d);
    if (tones.includes(mod(m, 12))) return m;
  }
  // between chord notes: the diatonic third above (or fifth below)
  for (const d of up ? [3, 4] : [7, 8]) {
    const m = n.midi + (up ? d : -d);
    if (scale.includes(mod(m, 12))) return m;
  }
  return null;
}

/** The sung lines of a section: groups of lead notes, each starting with a `start` note. */
function linesOf(v: VocalNote[]): VocalNote[][] {
  const out: VocalNote[][] = [];
  for (const n of v) {
    if (n.start || !out.length) out.push([]);
    out[out.length - 1].push(n);
  }
  return out;
}

export interface BackingContext {
  seed: string;
  backing: Backing;
  mood: Mood;
}

/**
 * Backing vocals and ad-libs for every section (in place: `idea.backing`, `idea.vocalDouble`), after the
 * lead is written. `climax`: the section the song peaks in.
 */
export function arrangeBacking(sections: Idea[], ctx: BackingContext, climax: number): string | null {
  const choruses = sections.map((s, i) => (s.section?.kind === 'chorus' ? i : -1)).filter((i) => i >= 0);
  let any = false;
  sections.forEach((idea, si) => {
    idea.backing = [];
    idea.vocalDouble = false;
    const lead = idea.vocal ?? [];
    if (!lead.length) return;
    const kind = idea.section!.kind as SectionKind;
    const rng = new Rng(`${ctx.seed}-backing-${si}`);
    const t = idea.section!.tension ?? [];
    const calm = t.length ? t.reduce((a, b) => a + b, 0) / t.length < 0.4 : false;
    const big = kind === 'chorus' || kind === 'outro';
    const nth = choruses.indexOf(si);
    const lines = linesOf(lead);
    const notes: string[] = [];

    // choruses (and the outro) double-tracked
    if (big) { idea.vocalDouble = true; notes.push('doubled'); }

    // harmonies: on the hook lines in the first chorus, every line later on; soft pads in a quieter
    // second verse, a pre-chorus building, or a bridge
    const style = ctx.backing;
    if (style === 'oohs') {
      if (big || kind === 'bridge' || (kind === 'verse' && nth < 0 && !calm && rng.chance(0.5)) || kind === 'prechorus') {
        if (oohs(idea, ctx.mood)) notes.push('oohs on the chords');
      }
    } else if (big && !(calm && style !== 'gang')) {
      const every = nth > 0 || kind === 'outro' || si === climax;
      lines.forEach((L, li) => {
        if (!every && li % 2 === 1) return;
        for (const n of L) {
          let m = style === 'gang' ? n.midi : harmonyFor(idea, n, style === 'thirds');
          // (above a note that's already up high: the harmony goes under it)
          if (m !== null && m > 72) m = harmonyFor(idea, n, false);
          if (m === null) continue;
          idea.backing!.push({ ...n, midi: m, vel: n.vel * 0.85, syl: { ...n.syl }, role: style === 'gang' ? 'gang' : 'harmony', start: n === L[0] });
        }
      });
      notes.push(`${BACKING_DESC[style]}${every ? '' : ' on the hook lines'}`);
    }

    // ad-libs: over the climax and the outro
    if (si === climax || kind === 'outro') {
      const n = adlibs(idea, lines, rng, si === climax);
      if (n) notes.push(n === 1 ? 'an ad-lib' : `${n} ad-libs`);
    }
    idea.backing.sort((a, b) => a.step - b.step);
    if (notes.length) { idea.notes.push(`Backing vocals: ${notes.join(', ')}`); any = true; }
  });
  return any ? BACKING_DESC[ctx.backing] : null;
}

/** Soft held "ooh"s (or "aah"s in brighter moods) on each chord while the lead sings, above it. */
function oohs(idea: Idea, mood: Mood): boolean {
  const lead = idea.vocal!;
  const { key, total } = idea.song;
  const from = lead[0].step, to = lead[lead.length - 1].step + lead[lead.length - 1].len;
  const centre = Math.round(lead.reduce((a, n) => a + n.midi, 0) / lead.length) + 4;
  const vowel: Vowel = ['dreamy', 'melancholic', 'dark'].includes(mood) ? 'UW' : 'AA';
  const tl = idea.chords.timeline;
  let n = 0;
  tl.forEach((e, i) => {
    const end = Math.min(tl[i + 1]?.step ?? total, to);
    const start = Math.max(e.step, from);
    if (end - start < 6) return;
    const tones = chordTones(key, e.chord);
    let m = centre;
    for (let d = 0; d < 6; d++) {
      if (tones.includes(mod(centre + d, 12))) { m = centre + d; break; }
      if (tones.includes(mod(centre - d, 12))) { m = centre - d; break; }
    }
    idea.backing!.push({ step: start, len: end - start - 1, midi: m, vel: 0.55, syl: syl([], vowel, [], vowel === 'UW' ? 'ooh' : 'aah'), role: 'ooh', start: true });
    n++;
  });
  return n > 0;
}

/**
 * Ad-libs in the gaps between lines (up to three): "yeah" held up high, an "oh" run falling from above
 * (one vowel over several notes), a "whoa-oh"; and over the climax's last held note, a long high "oh".
 */
function adlibs(idea: Idea, lines: VocalNote[][], rng: Rng, climax: boolean): number {
  const { key, mode, total } = idea.song;
  const pent = (SCALES[mode] as readonly number[]).includes(3) ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const inPent = (m: number) => pent.includes(mod(m - key, 12));
  const toneAbove = (m: number, g: number, lo: number, hi: number) => {
    const tones = chordTones(key, chordAt(idea.chords, g, total));
    for (let d = lo; d <= hi; d++) if (tones.includes(mod(m + d, 12))) return m + d;
    return m + lo;
  };
  const cap = (m: number) => Math.min(m, 72);
  let count = 0;
  for (let li = 0; li + 1 < lines.length && count < 3; li++) {
    const L = lines[li], last = L[L.length - 1];
    const end = last.step + last.len;
    const gap = lines[li + 1][0].step - end;
    if (gap < 4 || !rng.chance(0.75)) continue;
    const at = end + (gap >= 7 && rng.chance(0.5) ? 1 : 0);
    const room = lines[li + 1][0].step - at - 1;
    const kind = rng.weighted<'yeah' | 'run' | 'whoa'>([['yeah', 3], ['run', 3], ['whoa', 2]]);
    if (kind === 'yeah' || room < 4) {
      const m = cap(toneAbove(last.midi, at, 3, 7));
      idea.backing!.push({ step: at, len: Math.min(room, 4), midi: m, vel: 0.8, syl: syl(['Y'], 'EH', [], 'yeah'), role: 'adlib', start: true });
    } else if (kind === 'run') {
      // a falling run on one vowel: from a chord note up high, down the pentatonic, a note every 16th or 8th
      const top = cap(toneAbove(last.midi, at, 5, 9));
      const ms: number[] = [top];
      for (let m = top - 1; ms.length < 4 && m > top - 9; m--) if (inPent(m)) ms.push(m);
      const d = room >= 8 ? 2 : 1;
      ms.forEach((m, i) => {
        const g = at + i * d;
        if (g >= at + room) return;
        const lastOne = i === ms.length - 1 || g + d >= at + room;
        idea.backing!.push({ step: g, len: lastOne ? Math.max(1, at + room - g) : d, midi: m, vel: 0.78 - i * 0.03, syl: syl([], 'OW', [], i === 0 ? 'oh' : '~', i === 0), role: 'adlib', start: i === 0 });
      });
    } else {
      const m = cap(toneAbove(last.midi, at, 4, 8));
      idea.backing!.push({ step: at, len: 2, midi: m, vel: 0.8, syl: syl(['W'], 'OW', [], 'whoa'), role: 'adlib', start: true });
      idea.backing!.push({ step: at + 2, len: Math.max(1, Math.min(room - 2, 4)), midi: m - (inPent(m - 2) ? 2 : 3), vel: 0.75, syl: syl([], 'OW', [], 'oh'), role: 'adlib' });
    }
    count++;
  }
  // the climax: a long high "oh" over the last held note
  if (climax) {
    const held = [...(idea.vocal ?? [])].reverse().find((n) => n.len >= 6);
    if (held) {
      const m = cap(toneAbove(held.midi, held.step, 3, 7));
      idea.backing!.push({ step: held.step + 1, len: held.len - 1, midi: m, vel: 0.85, syl: syl([], 'OW', [], 'oh'), role: 'adlib', start: true });
      count++;
    }
  }
  return count;
}
