// Words for the Guide line (experiment, docs/GUIDE.md): the line's tune kept exactly, pitch for pitch and
// step for step; the words only decide which syllable sits on each sound. The line's own events tell
// them what to do: a note's start, a push (a word starting) and the note back after a pull's silence
// start words; a pull ends one, softly, into its silence. A new note inside a word is only ever a bend
// (Paul): a bent note or a quick note bent to carries the word on, gliding there as the line bends; any
// other new note (a quick note, the line coming back from one) ends the word and starts a new one, a short
// breath between words in the singing (voice.ts). Lines break at the pauses; every other
// line rhymes; choruses sing the same words each time.
// The pseudo-English words are the vocals' own (src/parts/lyrics.ts).

import type { Idea } from '../idea';
import { groupStarts } from '../rhythm';
import { Rng } from '../rng';
import { type Cons, type Rhyme, type Syllable, lyricLine, openUp, rhymeOf, spell } from '../parts/lyrics';
import { type Flick, type GuideLine, WORD_STARTS } from './line';

/** One sung sound: a syllable (or the one before carried on, text '~') on a stretch of the line. */
export interface GuideSyl {
  step: number; len: number; midi: number; vel: number; syl: Syllable; bend?: number; slide?: number; fall?: number;
  /** The verse melody writer's: the scoop into the note lasts so many steps; a held ending dies away over its last `fade` steps by `fadeBy` dB. */
  slideLen?: number; fade?: number; fadeBy?: number;
}
export interface GuideSungLine { notes: GuideSyl[]; text: string }

/**
 * Every quick note not bent to starts a new word, and so does the line coming back from it (a new note in a
 * word only ever a bend, Paul), stressed to suit: a light word on the quick note and a stressed one coming
 * back (the / NIGHT), or a stressed one on the quick note and a light one coming back (NIGHT / the). One
 * with a pause after it is light; the rest by chance, a little more often stressed where the genre is busier.
 */
const STARTS = WORD_STARTS;

/** What starts a stretch of sound: a note, a push, the note back after a pull or a quick note's pause, a quick note, a bend. */
type Role = 'note' | 'bent' | 'push' | 'resume' | 'back' | 'after' | 'flick' | 'flickGap' | 'flickBend';
interface Seg { step: number; len: number; midi: number; role: Role; silenceAfter: boolean; sung?: boolean; starts?: boolean; stress?: boolean; ws?: boolean; bend?: number; slide?: number; fall?: number }

const SOFT = new Set<Cons>(['N', 'M', 'L', 'S', 'Z', 'NG', 'R']);

/** The words, per section and line (a silent section has none). */
export function guideWords(list: Idea[], line: GuideLine, salt = 0): GuideSungLine[][] {
  const first = list[0];
  const genre = first.song.genre;
  const starts = STARTS[genre] ?? 0.5;
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
    const emit = (step: number, len: number, midi: number, role: Role, silenceAfter = false, bend?: number) => { if (len > 0) segs.push({ step, len, midi, role, silenceAfter, ...(bend ? { bend } : {}) }); };
    notes.forEach((n, k) => {
      const next = notes[k + 1];
      const i0 = segs.length;
      const evs = [...(n.flicks ?? []).map((f) => ({ at: f.at, f })), ...(n.marks ?? []).map((m) => ({ at: m.at, m }))].sort((a, b) => a.at - b.at);
      // (the Vocal tune's slides into the next word: bent into, but a new word)
      let cur = 0, role: Role = n.bend && !n.newWord ? 'bent' : 'note';
      // (a bent note glides there over its bend, as the line plays it)
      let bend = n.bend;
      for (const e of evs) {
        if (cur >= n.len) break;
        if ('m' in e && e.m) {
          if (e.m.kind === 'push') { emit(n.step + cur, e.at - cur, n.midi, role, false, bend); bend = undefined; cur = e.at; role = 'push'; continue; }
          const back = e.m.back ?? 0;
          emit(n.step + cur, Math.min(n.len, e.at + 1) - cur, n.midi, role, true, bend);
          bend = undefined;
          cur = e.at + Math.max(1, back);
          role = 'resume';
          continue;
        }
        const f = (e as { f: Flick }).f;
        emit(n.step + cur, f.at - cur, n.midi, role, false, bend);
        bend = undefined;
        // (a quick note bent to: over most of its length, as the line plays it)
        emit(n.step + f.at, f.len, f.midi, f.bend ? 'flickBend' : f.gap ? 'flickGap' : 'flick', !!f.gap, f.bend ? f.len * 0.9 : undefined);
        // (Pitch by words: the line says which, by the quick note's direction)
        if (f.starts !== undefined) segs[segs.length - 1].starts = f.starts;
        cur = f.bend ? n.len : f.at + f.len + (f.gap ?? 0);
        role = f.gap ? 'back' : 'after';
      }
      // (a lead-in running on into the next section: sung straight on into its next note, no soft ending)
      const on = line.parts[si + 1]?.[0];
      const into = !next && n.step + n.len > idea.song.total && on && on.step === n.step + n.len - idea.song.total;
      emit(n.step + cur, n.len - cur, n.midi, role, !into && (!next || next.step > n.step + n.len), bend);
      // (the Vocal tune's Bends: the vocal's own scoop into the note and fall off its end)
      if (n.slide && segs[i0]) segs[i0].slide = n.slide;
      if (n.fall && segs.length > i0) segs[segs.length - 1].fall = n.fall;
    });
    // each stretch a syllable (a bend carries on the one before, its word going on), its stress; every
    // other stretch starts a word (a new note inside a word only ever a bend, Paul)
    let flickStarts = false;
    for (const s of segs) {
      const strong = beats.has(s.step);
      s.sung = s.role !== 'bent' && s.role !== 'flickBend';
      s.ws = true;
      if (s.role === 'flick' || s.role === 'flickGap' || s.role === 'flickBend') {
        flickStarts = s.role === 'flick' ? rng.chance(starts) : false;
        if (s.starts !== undefined) flickStarts = s.starts;
        s.stress = flickStarts;
      } else if (s.role === 'after') {
        // (back to the line: a stressed word after a light one on the quick note, or a light one after a stressed)
        s.stress = !flickStarts;
      } else s.stress = s.role === 'push' || s.role === 'back' || ((s.role === 'note' || s.role === 'resume') && (strong || s.len >= 8));
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
        stress: !!s.stress,
        long: s.len >= 4,
        high: s.midi >= hi - 3,
      }));
      const odd = (lineNo + li) % 2 === 1;
      const hook = again?.[li] ? again[li].slice(0, slots.length) : undefined;
      let words = lyricLine(rng, slots, style, { rhyme: odd ? rhyme : null, hook });
      // (where words start and end, as the quick notes ask; the line's first syllable always starts one)
      words = words.map((w, i) => ({ ...(sungSegs[i].len >= 8 ? openUp(w) : w), wordStart: i === 0 || sungSegs[i].ws !== false, stress: !!sungSegs[i].stress }));
      if (!odd) rhyme = rhymeOf(words);
      mine.push(words.map((w) => ({ ...w })));
      // each stretch its syllable, or the one before carried on (its closing sounds moved to the end)
      const sung: GuideSyl[] = [];
      let k = 0;
      for (const s of L) {
        const vel = s.role === 'push' ? 0.95 : s.role === 'note' ? 0.82 : s.role.startsWith('flick') ? 0.68 : 0.75;
        const extra = { ...(s.slide ? { slide: s.slide } : {}), ...(s.fall ? { fall: s.fall } : {}) };
        // (a sung stretch bent into: the Vocal tune's slide into a new word)
        if (s.sung || !sung.length) sung.push({ step: s.step, len: s.len, midi: s.midi, vel, syl: { ...words[Math.min(k++, words.length - 1)] }, ...(s.bend ? { bend: s.bend } : {}), ...extra });
        else {
          const before = sung[sung.length - 1].syl;
          sung.push({ step: s.step, len: s.len, midi: s.midi, vel, syl: { onset: [], vowel: before.vowel, coda: before.coda, stress: false, text: '~', wordStart: false }, ...(s.bend ? { bend: s.bend } : {}), ...extra });
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
