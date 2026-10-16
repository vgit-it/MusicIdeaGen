// Vocal tune (experiment, docs/GUIDE-TUNE.md): a third writer for the Guide card that writes nothing new. It
// takes the main vocal's own tune and words, note for note, as the vocal row writes them (its Rhythm, Melody,
// Moves, Energy, Real songs and Patterns), so every vocal writer, the Learned one included, reaches the
// Guide card's sound: Sing, Human feel, Hard & soft. On top, only small changes to when notes start and
// stop, each behind the card's own switch: Breaths, Lead-ins, Carry over; and the Range sliders move the
// whole tune by octaves. The vocal's pitches and words are never rewritten here.

import type { Idea, SectionKind } from '../idea';
import { Rng } from '../rng';
import { type Mood, MOOD_LABEL, autoMood } from '../tension';
import { type Syllable, spell } from '../parts/lyrics';
import { GUIDE_SCALES, HEIGHT, LEAD_INS, LEAD_IN_P, TIRED, type GuideIdeas, type GuideLine, type GuideNote, type GuideRange, noteName } from './line';
import type { GuideSungLine, GuideSyl } from './words';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** A note of the vocal's tune, with its syllable and level (the vocal's own). */
export interface TuneNote extends GuideNote {
  syl: Syllable;
  vel: number;
  /** The first note of a sung line (the vocal's). */
  start?: boolean;
}
export interface TuneLine extends GuideLine { parts: TuneNote[][] }

/** Carry over: how often the last note runs on into a section the tune sits out. */
const CARRY_P = 0.5;
/** Carry over: at least this many bars into the silent section (now and then one more), fading out. */
export const CARRY_BARS = 2;
/** Breaths and lead-ins leave at least this much of a note (steps). */
const MIN_LEFT = 2;

const label = (v: string | undefined, d: string) => (v ? v[0].toUpperCase() + v.slice(1) : d);

/** The vocal's tune as a guide line (the lead only: no harmonies, gang, oohs or ad-libs). */
export function writeTune(list: Idea[], moodIn: Mood | undefined, salt: number | string = 0, ideas: GuideIdeas = {}, range: GuideRange | null = null): TuneLine {
  const first = list[0];
  const mood = moodIn ?? autoMood(first.song, first.seeds.song);
  const parts: TuneNote[][] = list.map((idea) => {
    const { key, mode } = idea.song;
    const scale = GUIDE_SCALES[mode] as readonly number[];
    return (idea.vocal ?? []).filter((n) => !n.role).map((n) => {
      const r = n.midi - key, pc = mod(r, 12);
      let i = scale.length - 1;
      while (scale[i] > pc) i--;
      return { step: n.step, len: n.len, midi: n.midi, deg: 7 * Math.floor(r / 12) + i, syl: { ...n.syl }, vel: n.vel,
        ...(scale.includes(pc) ? {} : { colour: true }), ...(n.start ? { start: true } : {}) };
    });
  });
  const silent = parts.map((p) => !p.length);
  const nb = { shift: 0, before: 0, tired: 0, beats: 0, leadIns: 0, carries: 0, carryBends: 0 };

  // Range: the whole tune moved by octaves to sit inside the sliders as best it can (Auto: as the vocal sings it)
  if (range) {
    const all = parts.flat();
    const out = (k: number) => all.filter((n) => n.midi + k < range[0] || n.midi + k > range[1]).length;
    for (const k of [-36, -24, -12, 12, 24, 36]) if (out(k) < out(nb.shift) || (out(k) === out(nb.shift) && Math.abs(k) < Math.abs(nb.shift))) nb.shift = k;
    if (nb.shift) for (const n of all) { n.midi += nb.shift; n.deg += (7 * nb.shift) / 12; }
  }

  const brng = new Rng(`tune-breath-${first.seeds.song}-${mood}-${salt}`);
  const lrng = new Rng(`tune-leadin-${first.seeds.song}-${mood}-${salt}`);
  const orng = new Rng(`tune-carry-${first.seeds.song}-${mood}-${salt}`);
  /** How tiring the stretch up to note `k` is (bars, high notes counting more), back to the last pause (a beat or more). */
  const effortTo = (p: TuneNote[], k: number, barLen: number) => {
    let e = 0;
    for (let j = k; j >= 0; j--) {
      e += (p[j].len / barLen) * (1 + Math.max(0, p[j].midi - 57) / 5);
      if (j > 0 && p[j].step - (p[j - 1].step + p[j - 1].len) >= 4) break;
    }
    return e;
  };
  /** Cut a note `by` steps short, if enough is left. */
  const cut = (n: TuneNote, by: number) => { if (n.len - by < MIN_LEFT) return false; n.len -= by; return true; };

  // Breaths: after a tiring stretch, a short pause at a word's end (the next note a new word)
  if (ideas.breath) parts.forEach((p, si) => {
    const barLen = list[si].song.bars[0]?.len ?? 16;
    for (let k = 0; k + 1 < p.length; k++) {
      const n = p[k], next = p[k + 1];
      if (next.step - (n.step + n.len) >= 4 || !next.syl.wordStart || next.syl.text === '~' || n.len < 6) continue;
      if (effortTo(p, k, barLen) < TIRED || !brng.chance(0.5)) continue;
      const by = Math.min(n.len - MIN_LEFT, 2 * brng.int(1, 2));
      if (cut(n, by)) { nb.tired++; nb.beats += by / 4; }
    }
  });

  list.forEach((idea, si) => {
    if (!si) return;
    const p = parts[si], pv = parts[si - 1], pIdea = list[si - 1];
    const kind = idea.section?.kind ?? 'verse';
    const pTotal = pIdea.song.total, bar = idea.song.bars[0]?.len ?? 16;
    const pLast = pv[pv.length - 1];
    // Carry over: the last note (ending up to two beats before the end: the vocal leaves a beat or two) runs on into a
    // section the tune sits out (a solo), held or bent a step, for two or three bars, fading out as it goes (Paul:
    // "hold it for a couple of bars at least and fade out during these"; the fade: the panel and voice, CARRY_BARS)
    if (silent[si]) {
      if (!ideas.carry || !pLast || pLast.step + pLast.len < pTotal - 8 || !orng.chance(CARRY_P)) return;
      const x = Math.min(idea.song.total, bar * (CARRY_BARS + (orng.chance(0.4) ? 1 : 0)));
      // (held, or now and then bent a step as it goes in)
      if (orng.chance(0.5)) pLast.len = pTotal - pLast.step + x;
      else {
        const { key, mode } = pIdea.song;
        const scale = GUIDE_SCALES[mode] as readonly number[];
        const d = Math.round(pLast.deg) + (orng.chance(0.7) ? -1 : 1);
        const midi = key + 12 * Math.floor(d / 7) + scale[mod(d, 7)];
        // (the same octave as the note it bends from)
        const to = midi + 12 * Math.round((pLast.midi - midi) / 12);
        pLast.len = pTotal - pLast.step;
        pv.push({ step: pTotal, len: x, midi: to, deg: d, bend: x >= 8 && orng.chance(0.5) ? 4 : 2, vel: pLast.vel, syl: { onset: [], vowel: pLast.syl.vowel, coda: pLast.syl.coda, stress: false, text: '~', wordStart: false } });
        pLast.syl = { ...pLast.syl, coda: [] };
        nb.carryBends++;
      }
      nb.carries++;
      return;
    }
    if (!pLast || !p.length) return;
    const gapIn = () => pTotal - (pLast.step + pLast.len) + p[0].step;
    // Breaths before a big section (a chorus, or one sung higher), or after a tiring stretch: a silence of 1-4 beats
    if (ideas.breath) {
      const big = kind === 'chorus' || (HEIGHT[kind as SectionKind] ?? 0.4) - (HEIGHT[pIdea.section?.kind ?? 'verse'] ?? 0.4) >= 0.25;
      const tired = effortTo(pv, pv.length - 1, pIdea.song.bars[0]?.len ?? 16) >= TIRED;
      if (brng.chance((big ? 0.55 : 0.1) + (tired ? 0.3 : 0))) {
        const by = 4 * brng.int(1, big && tired ? 4 : 3) - gapIn();
        if (by > 0 && cut(pLast, by)) { nb.before++; nb.beats += by / 4; }
      }
    }
    // Lead-ins: the section's first word comes in early (an 8th, a beat or two), at the end of the section before, held into it
    const f = p[0];
    if (ideas.leadIn && f.step < 4 && p[1]?.syl.text !== '~' && lrng.chance(LEAD_IN_P)) {
      let r = lrng.next();
      const L = (LEAD_INS.find(([, w]) => (r -= w) <= 0) ?? LEAD_INS[0])[0];
      const need = L + f.step + 2 - gapIn();
      if (L < (pIdea.song.bars[pIdea.song.bars.length - 1]?.len ?? 16) && f.step + f.len + L <= bar && (need <= 0 || cut(pLast, need))) {
        p.shift();
        pv.push({ ...f, step: pTotal - L, len: L + f.step + f.len, start: true });
        nb.leadIns++;
      }
    }
  });

  const o = first.opts;
  const sung = parts.flat();
  const lo = sung.length ? Math.min(...sung.map((n) => n.midi)) : 0, hi = sung.length ? Math.max(...sung.map((n) => n.midi)) : 0;
  const notes = [
    `Vocal tune: the vocal's own tune and words, note for note, as the vocal row writes them (Rhythm: ${label(o.vocalRhythm, 'Classic')}, Melody: ${o.vocalMelody === 'first' ? 'Melody first' : label(o.vocalMelody, 'Classic')}, Moves: ${label(o.vocalMove, 'Auto')}, Energy: ${label(o.vocalEnergy, 'Auto')}, Real songs ${o.vocalReal ? 'on' : 'off'}, Patterns ${o.vocalPatterns ? 'on' : 'off'}). Change those in the vocal row; mute the vocal there to hear this one alone`,
    `Mood: ${MOOD_LABEL[mood]}${moodIn ? '' : ' (auto)'}`,
    sung.length ? `Range ${noteName(lo)} to ${noteName(hi)}${nb.shift ? ` (moved ${Math.abs(nb.shift / 12)} octave${Math.abs(nb.shift) > 12 ? 's' : ''} ${nb.shift > 0 ? 'up' : 'down'} into the Range)` : ''}; ${sung.length} notes` : 'No notes: the vocal sits out here',
    `Sits out: ${list.map((i, si) => (silent[si] ? i.section?.label ?? '' : '')).filter(Boolean).join(', ') || 'nothing'}`,
    ...(ideas.breath ? [`Breaths: ${nb.before} before a big section or after a tiring one, ${nb.tired} more after a tiring stretch; ${nb.beats} beats in all`] : []),
    ...(ideas.leadIn ? [`Lead-ins: ${nb.leadIns} ${nb.leadIns === 1 ? 'section comes' : 'sections come'} in early, the first word held into it`] : []),
    ...(ideas.carry ? [`Carry over: ${nb.carries} last ${nb.carries === 1 ? 'note runs' : 'notes run'} on into a section the tune sits out, two or three bars, fading out (${nb.carryBends} bent a step)`] : []),
    'Not used here (they write the tune, and the vocal row does that): quick notes, Slow line, Repeat idea, Pitch by words, Question & answer, Section change, the Anchor line\'s settings, Real songs and Patterns (the vocal row\'s own), Key & scale, Chords lean. Used: Sing, Human feel, Hard & soft, Breaths, Lead-ins, Carry over, Range (by octaves)',
  ];
  return { parts, silent, mood, notes };
}

/** The vocal's own words on the tune, line by line as the vocal sings them (a new line at its line starts and at pauses). */
export function tuneWords(line: TuneLine): GuideSungLine[][] {
  return line.parts.map((p) => {
    const lines: GuideSyl[][] = [];
    p.forEach((n, k) => {
      const prev = p[k - 1];
      const syl: GuideSyl = { step: n.step, len: n.len, midi: n.midi, vel: n.vel, syl: { ...n.syl }, ...(n.bend ? { bend: n.bend } : {}) };
      if (!prev || (n.start && n.syl.text !== '~') || n.step - (prev.step + prev.len) >= 4) lines.push([syl]);
      else lines[lines.length - 1].push(syl);
    });
    return lines.map((notes) => ({ notes, text: spell(notes.map((x) => x.syl).filter((x) => x.text !== '~')) }));
  });
}
