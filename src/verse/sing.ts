// The verse melody writer as the song's lead vocal (docs/VERSE-SECTIONS.md): a track's sections (or a lone idea) written
// section by section, the words set to each line, and turned into what the band and the singer read: `vocal` (the lead's
// notes with a syllable on each: room, backing vocals and ad-libs follow it) and `sung` (its lines, as the lead voice sings them).
// Pure: the card's report, the variety check and the song builder all use this.

import type { Idea } from '../idea';
import type { VocalNote } from '../parts/vocal';
import type { GuideSungLine, GuideSyl } from '../guide/words';
import type { Mood } from '../tension';
import type { Built } from './build';
import { dialsFor } from './personality';
import { energyVolume } from './profile';
import type { EmoOptions } from './emotion';
import { accentsOf, barOf, buildSection, chordsKey, chorusMaster, hookSig, isChorus, isInterlude, isOutro, isShared, kindOf, moodOf, personalityOf, verseSeed, type SectionOptions, type SungKind } from './section';
import { DEFAULT_RANGE, type BandNote, type Range } from './verse';
import { writeWords, type Words } from './words';

/** How many words a section sings, against the verse's. */
const DENSITY: Record<SungKind, number> = { chorus: 0.9, prechorus: 0.75, bridge: 0.5, interlude: 0.4, outro: 0.5, verse: 0.6 };

/** The sections the writer sings: the verse, pre-chorus, chorus, bridge, and the interlude and outro the singer takes (not the guitar's). */
export const isSung = (idea: Idea) => {
  const k = idea.section?.kind;
  return !idea.section || k === 'verse' || k === 'prechorus' || k === 'chorus' || k === 'bridge' || isInterlude(idea) || isOutro(idea);
};

/** The writer's options for a song: the default range (a high singer's lift moves it), the vocal seed mixed in. */
export function songOptions(seed: string, lift = 0, emo?: EmoOptions): SectionOptions {
  const r = DEFAULT_RANGE;
  const range: Range = { lo: r.lo + lift, hi: r.hi + lift, xlo: r.xlo + lift, xhi: r.xhi + lift };
  return { range, bends: 'some', meta: true, variation: 'some', pentatonic: false, seed, ...(emo ? { emo } : {}) };
}

export interface SectionVoice {
  /** The seed and range it was written with (the card's report reads them back). */
  seed: string;
  range: Range;
  /** The mood it was written in, and the mood notes that were on. */
  mood: Mood;
  emo?: EmoOptions;
  built: Built;
  words: Words;
  /** The lead's notes, a syllable on each (a bend inside a held note splits it in two). */
  vocal: VocalNote[];
  /** The same, as the lead voice sings them: a line for each phrase. */
  lines: GuideSungLine[];
}

/** A held ending's fall: it dies away in volume over the last half of the note (or of its tail, if a bend split it). */
const fadeOf = (n: BandNote, len: number): Partial<VocalNote> => (n.fadeBy ? { fade: Math.min(len, Math.max(1, Math.round(n.len / 2))), fadeBy: n.fadeBy } : {});

/** A section's melody as the singer's notes, sung harder the higher the section's energy. */
function vocalOf(notes: BandNote[], w: Words, energy: number): VocalNote[] {
  return notes.flatMap((n, i) => {
    const syl = w.syls[i], vel = Math.min(1, ((!syl.stress ? 0.68 : 0.82) + (n.lead ? 0.12 : 0)) * energyVolume(energy));
    const head: VocalNote = { step: n.step, len: n.len, midi: n.midi, vel, syl, start: w.starts[i], ...(n.slide ? { slide: n.slide } : {}), ...fadeOf(n, n.len) };
    if (n.bendTo === undefined) return [head];
    // (a bend inside the note: the first half holds, then the same word goes on to the new pitch, a quick glide across the middle;
    // a long hold may move again: one more piece of the same word for each move)
    const moves = [{ at: n.bendAt!, to: n.bendTo, len: n.bendLen! }, ...(n.more ?? [])];
    head.len = n.bendAt!;
    delete head.fade;
    delete head.fadeBy;
    head.syl = { ...syl, coda: [] };
    const tails = moves.map((m, k): VocalNote => {
      const last = k === moves.length - 1, to = last ? n.len : moves[k + 1].at;
      return { step: n.step + m.at, len: to - m.at, midi: m.to, vel, syl: { onset: [], vowel: syl.vowel, coda: last ? syl.coda : [], stress: false, text: '~', wordStart: false }, start: false, bend: m.len, ...(last ? fadeOf(n, to - m.at) : {}) };
    });
    return [head, ...tails];
  });
}

/** The notes as lines (one per phrase), with each phrase's text. */
function linesOf(vocal: VocalNote[], w: Words): GuideSungLine[] {
  const texts = w.lines.filter(Boolean);
  const out: GuideSungLine[] = [];
  for (const n of vocal) {
    if (n.start || !out.length) out.push({ notes: [], text: texts[out.length] ?? '' });
    const g: GuideSyl = { step: n.step, len: n.len, midi: n.midi, vel: n.vel, syl: n.syl };
    if (n.bend) g.bend = n.bend;
    if (n.slide) g.slide = n.slide;
    if (n.fall) g.fall = n.fall;
    if (n.slideLen) g.slideLen = n.slideLen;
    if (n.fade) { g.fade = n.fade; g.fadeBy = n.fadeBy; }
    out[out.length - 1].notes.push(g);
  }
  return out;
}

/**
 * The melody and words of every section in `list` the writer sings (a map from the idea). Choruses (and the other shared kinds) are one
 * melody per song, built like the song's last: sections with the same chords share a build.
 */
export function writeSong(list: Idea[], o: SectionOptions): Map<Idea, SectionVoice> {
  const out = new Map<Idea, SectionVoice>();
  const hooks = new Map<string, Built>(), hookWords = new Map<string, Words>();
  const acc = new WeakMap<Idea, number[]>();
  const accOf = (i: Idea) => { let a = acc.get(i); if (!a) { a = accentsOf(i); acc.set(i, a); } return a; };
  const verse = list.find((i) => i.section?.kind === 'verse'), chorus = [...list].reverse().find(isChorus);
  for (const idea of list) {
    if (!isSung(idea)) continue;
    const shared = isShared(idea), kind = kindOf(idea);
    const master = shared ? chorusMaster(list, idea, o) : idea;
    const sig = shared ? `${hookSig(idea, o)}|${chordsKey(idea)}` : '';
    let built = sig ? hooks.get(sig) : undefined;
    if (!built) {
      built = buildSection(idea, o, accOf(master), master !== idea ? master : undefined, verse, chorus);
      if (sig) hooks.set(sig, built);
    }
    // (choruses with the same rhythm sing the same words; one over other chords that moves a note has its own)
    const wsig = shared ? `${hookSig(idea, o)}|${built.notes.map((n) => `${n.step}:${n.len}`).join(',')}` : '';
    let words = wsig ? hookWords.get(wsig) : undefined;
    if (!words) {
      words = writeWords(built.notes, built.phrases, barOf(idea), { mood: moodOf(idea, o), genre: idea.song.genre, real: true },
        o.range.hi + dialsFor(kind, personalityOf(idea, o.seed, moodOf(idea, o))).lift - 4, shared ? hookSig(idea, o) : verseSeed(idea, o), accOf(idea), DENSITY[kind]);
      if (wsig) hookWords.set(wsig, words);
    }
    const vocal = vocalOf(built.notes, words, idea.section?.energy ?? 3);
    out.set(idea, { seed: o.seed ?? '', range: o.range, mood: moodOf(idea, o), emo: o.emo, built, words, vocal, lines: linesOf(vocal, words) });
  }
  return out;
}

/** What the writer wrote for each section (the card's report reads it). */
const written = new WeakMap<Idea, SectionVoice>();
export const voiceOf = (idea: Idea): SectionVoice | undefined => written.get(idea);
/** The lone idea sings through a stand-in chorus: its report is the stand-in's. */
export const linkVoice = (from: Idea, to: Idea) => { const v = written.get(from); if (v) written.set(to, v); };

/**
 * Give a track's sections the writer's vocal: `vocal` and `sung` are set on every section (empty where nobody sings). A lone idea is
 * passed as a one-section list whose section is a chorus (it sings its chorus tune and hook, as the old vocal did).
 */
export function singSong(list: Idea[], seed: string, lift = 0, emo?: EmoOptions): void {
  const song = writeSong(list, songOptions(seed, lift, emo));
  list.forEach((idea) => {
    const v = song.get(idea);
    if (v) written.set(idea, v);
    idea.vocal = v?.vocal ?? [];
    idea.sung = v?.lines ?? [];
  });
  const top = Math.max(0, ...list.flatMap((i) => (i.sung ?? []).flatMap((l) => l.notes.map((n) => n.midi))));
  for (const idea of list) idea.sungTop = top;
}
