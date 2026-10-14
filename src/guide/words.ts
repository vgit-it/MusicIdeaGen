// Words for the Guide line (experiment, docs/GUIDE.md): the line's tune kept exactly, pitch for pitch and
// step for step; the words only decide which syllable sits on each sound. The line's own events tell
// them what to do: a note's start, a push (a word starting) and the note back after a pull's silence
// start words; a pull ends one, softly, into its silence; quick notes carry the light end of a word
// (NEV-er) or a quick light word (the, a, in), or stay on the vowel (oh-oh), by genre; a bend stays one
// sound. Lines break at the pauses; every other line rhymes; choruses sing the same words each time.
// The pseudo-English words are the vocals' own (src/parts/lyrics.ts).

import type { Idea } from '../idea';
import type { Genre } from '../genres';
import { groupStarts } from '../rhythm';
import { Rng } from '../rng';
import { type Cons, type Rhyme, type Syllable, lyricLine, openUp, rhymeOf, spell } from '../parts/lyrics';
import type { Flick, GuideLine } from './line';

/** One sung sound: a syllable (or the one before carried on, text '~') on a stretch of the line. */
export interface GuideSyl { step: number; len: number; midi: number; vel: number; syl: Syllable }
export interface GuideSungLine { notes: GuideSyl[]; text: string }

/** How often a quick note carries a syllable of its own rather than the vowel before (Paul: a mix, by genre). */
const WORDY: Record<Genre, number> = { funk: 0.75, hardrock: 0.65, rock: 0.55, pop: 0.55, metal: 0.5, altmetal: 0.5, grunge: 0.3 };

/** What starts a stretch of sound: a note, a push, the note back after a pull or a quick note's pause, a quick note, a bend. */
type Role = 'note' | 'bent' | 'push' | 'resume' | 'back' | 'after' | 'flick' | 'flickGap' | 'flickBend';
interface Seg { step: number; len: number; midi: number; role: Role; silenceAfter: boolean; sung?: boolean }

const SOFT = new Set<Cons>(['N', 'M', 'L', 'S', 'Z', 'NG', 'R']);

/** The words, per section and line (a silent section has none). */
export function guideWords(list: Idea[], line: GuideLine, salt = 0): GuideSungLine[][] {
  const first = list[0];
  const genre = first.song.genre;
  const wordy = WORDY[genre] ?? 0.5;
  const style = { mood: line.mood, genre };
  const hi = Math.max(0, ...line.parts.flat().map((n) => n.midi));
  // the choruses' words, from the first, to sing again
  const kept = new Map<string, Syllable[][]>();
  let lineNo = 0;
  return line.parts.map((notes, si) => {
    const idea = list[si];
    const kind = idea.section?.kind ?? 'verse';
    const rng = new Rng(`guide-words-${first.seeds.song}-${line.mood}-${salt}-${si}`);
    const beats = new Set(idea.song.bars.flatMap((b) => groupStarts(b.groups).map((p) => b.start + p)));
    // the stretches of sound, in order
    const segs: Seg[] = [];
    const emit = (step: number, len: number, midi: number, role: Role, silenceAfter = false) => { if (len > 0) segs.push({ step, len, midi, role, silenceAfter }); };
    notes.forEach((n, k) => {
      const next = notes[k + 1];
      const evs = [...(n.flicks ?? []).map((f) => ({ at: f.at, f })), ...(n.marks ?? []).map((m) => ({ at: m.at, m }))].sort((a, b) => a.at - b.at);
      let cur = 0, role: Role = n.bend ? 'bent' : 'note';
      for (const e of evs) {
        if (cur >= n.len) break;
        if ('m' in e && e.m) {
          if (e.m.kind === 'push') { emit(n.step + cur, e.at - cur, n.midi, role); cur = e.at; role = 'push'; continue; }
          const back = e.m.back ?? 0;
          emit(n.step + cur, Math.min(n.len, e.at + 1) - cur, n.midi, role, true);
          cur = e.at + Math.max(1, back);
          role = 'resume';
          continue;
        }
        const f = (e as { f: Flick }).f;
        emit(n.step + cur, f.at - cur, n.midi, role);
        emit(n.step + f.at, f.len, f.midi, f.bend ? 'flickBend' : f.gap ? 'flickGap' : 'flick', !!f.gap);
        cur = f.bend ? n.len : f.at + f.len + (f.gap ?? 0);
        role = f.gap ? 'back' : 'after';
      }
      emit(n.step + cur, n.len - cur, n.midi, role, !next || next.step > n.step + n.len);
    });
    // which carry a syllable of their own, and which carry on the one before
    let lastFlickSung = false;
    for (const s of segs) {
      const strong = beats.has(s.step);
      s.sung = s.role === 'note' || s.role === 'push' || s.role === 'resume' || s.role === 'flickGap' ? true
        : s.role === 'back' ? true
        : s.role === 'flick' ? (lastFlickSung = rng.chance(wordy))
        : s.role === 'flickBend' ? rng.chance(wordy * 0.6)
        : s.role === 'after' ? lastFlickSung && (strong || rng.chance(0.5))
        : false;
      if (s.role !== 'flick' && s.role !== 'after') lastFlickSung = false;
    }
    // lines: at a pause (a beat or more of silence), or after two bars at the next word's start
    const barLen = idea.song.bars[0]?.len ?? 16;
    const lines: Seg[][] = [];
    segs.forEach((s, k) => {
      const prev = segs[k - 1];
      const cur = lines[lines.length - 1];
      const pause = !prev || s.step - (prev.step + prev.len) >= 4;
      const long = cur && s.step - cur[0].step >= 2 * barLen && s.sung && (s.role === 'note' || s.role === 'resume' || s.role === 'push');
      if (!cur || pause || long) { s.sung = true; lines.push([s]); } else cur.push(s);
    });
    // the words, line by line (a chorus: the first chorus's words again)
    let rhyme: Rhyme | null = null;
    const again = kind === 'chorus' ? kept.get(kind) : undefined;
    const mine: Syllable[][] = [];
    const out = lines.map((L, li) => {
      const sungSegs = L.filter((s) => s.sung);
      const slots = sungSegs.map((s) => ({
        stress: s.role === 'push' || ((s.role === 'note' || s.role === 'resume') && (beats.has(s.step) || s.len >= 8)),
        long: s.len >= 4,
        high: s.midi >= hi - 3,
      }));
      const odd = (lineNo + li) % 2 === 1;
      const hook = again?.[li] ? again[li].slice(0, slots.length) : undefined;
      let words = lyricLine(rng, slots, style, { rhyme: odd ? rhyme : null, hook });
      words = words.map((w, i) => (sungSegs[i].len >= 8 ? openUp(w) : w));
      if (!odd) rhyme = rhymeOf(words);
      mine.push(words.map((w) => ({ ...w })));
      // each stretch its syllable, or the one before carried on (its closing sounds moved to the end)
      const sung: GuideSyl[] = [];
      let k = 0;
      for (const s of L) {
        const vel = s.role === 'push' ? 0.95 : s.role === 'note' ? 0.82 : s.role.startsWith('flick') ? 0.68 : 0.75;
        if (s.sung || !sung.length) sung.push({ step: s.step, len: s.len, midi: s.midi, vel, syl: { ...words[Math.min(k++, words.length - 1)] } });
        else {
          const before = sung[sung.length - 1].syl;
          sung.push({ step: s.step, len: s.len, midi: s.midi, vel, syl: { onset: [], vowel: before.vowel, coda: before.coda, stress: false, text: '~', wordStart: false } });
          before.coda = [];
        }
        // (into a silence: the word ends softly)
        if (s.silenceAfter) {
          const last = sung[sung.length - 1].syl;
          if (last.coda.length && !last.coda.every((c) => SOFT.has(c))) last.coda = ['N'];
        }
      }
      return { notes: sung, text: spell(sung.map((x) => x.syl).filter((x) => x.text !== '~')) };
    });
    lineNo += lines.length;
    if (kind === 'chorus' && !kept.has(kind)) kept.set(kind, mine);
    return out;
  });
}
