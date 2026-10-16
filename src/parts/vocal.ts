// The singer's melody (research: docs/VOCAL.md). Written the way pop and rock vocal lines are built:
// - lines of two bars, sung from the top of the first bar (or a pickup before it) to a held note in
//   the second, then a breath of a beat or two where the band (and Guitar 2's answers) fill in
// - one syllable per note; verses busier and lower (a reciting tone with neighbours, falling to a chord
//   note at the end of the line), choruses higher, longer notes, a hook that comes back word for word
// - verse lines 1 and 3 share their tune (A A'), choruses open each half with the hook; pre-choruses
//   climb line by line; bridges move away (higher, or lower and quieter)
// - mostly steps and repeated notes, the odd third, a rare leap that turns back; chord notes on the
//   strong beats (more so in choruses: rock verses are loose with the harmony), pentatonic in between
// - held notes on chord notes that don't rub, stressed syllables on the strong beats (and the 8th before
//   them, rock's anticipations), the song's highest note saved for its climax
// The register is written for a low (male) voice; a high voice sings it an octave up.

import { arrangeBacking, pickBacking } from './backing';
import type { Idea, SectionKind } from '../idea';
import { GENRE_LABEL, type Genre } from '../genres';
import { Rng } from '../rng';
import { type MoveId, movesDesc, pickMoves } from './moves';
import { ENERGY, type EnergyStyle, FOLLOW_BY, againstFor, bandBusy, deliverEnergy, dialsFor, energize, layFor, levelOf, pickEnergy } from './energy';
import type { Mood } from '../tension';
import { chordTones } from './guitar2';
import { HIGH_VOICES, type HighVoice, type Timbre } from './singers';
import { bandOf, clearForSinger, fitToBand, pushWithBand } from './fit';
import { REAL_LEAN } from './realism';
import { SCALES } from '../theory';
import { copiesReal, copyAt } from '../realism/patterns';
import { type RealArc, realArc } from '../realism/arc';
import { realWords } from '../realism/words';
import targets from '../realism/targets.json';

/** Patterns: tunes written again at most this many times to get clear of a real song's 2-bar stretch. */
const GUARD_TRIES = 6;
/** How many tunes the copy guard had written again (the realism lab reads it). */
export let guardRewrites = 0;
import { firstDesc, firstStyle } from './first';
import { learnedDesc, learnedStyle } from './learned';
import { FLOOR, PEAK, type Tune, type TuneNote, WORD_RATE, followTension, gridUnit, melodyDesc, melodyStyle, planBusy, writeTune } from './melody';
import { type LyricSlot, type LyricStyle, type Rhyme, type Syllable, lyricLine, makeHook, openUp, rhymeOf, rhymeWith, spell } from './lyrics';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** One sung note: a syllable held for `len` steps. */
export interface VocalNote {
  step: number;
  len: number;
  midi: number;
  vel: number;
  syl: Syllable;
  /** The first note of a sung line (the singer breathes before it). */
  start?: boolean;
  /** Backing vocals: a harmony line, the gang in unison, a held "ooh", an ad-lib (the lead has none). */
  role?: 'harmony' | 'gang' | 'ooh' | 'adlib';
  /** Scooped up into from so many semitones below; falling off its end by so many; a wail (sung full out). */
  slide?: number;
  fall?: number;
  /** A colour note against the chord on purpose (a signature move: a 9th, a sigh, a sour ending): fitting to the band leaves it be. */
  colour?: boolean;
  /** A note of a real shape (Patterns, docs/PATTERNS.md): fitting to the band moves it only off a real clash. */
  pat?: boolean;
  belt?: boolean;
  /** A high note held (a belt, or a jump up to the line's top): held half a bar, never falling off, left room by Guitar 2. */
  peak?: boolean;
  /** Words first: its place in a beat of three quick syllables sung as a triplet (tripletize). */
  trip?: number;
}

export type VoiceType = 'low' | 'high';

const TIMBRE_DESC = (t: Timbre) => (t === 'clear' ? 'the clear voice' : `the ${GENRE_LABEL[t].toLowerCase()} voice (the FOF singer: registers blended by pitch, a way up past the break, sung lower)`);

/**
 * Which notes carry on the syllable before rather than start a new one: tied notes (a sigh or a turn),
 * and a quick weak note (a 16th after a syllable): the words come at most about every 8th note, the
 * quick notes between sung on the vowel (Paul: a slower pace of speaking sounds more natural).
 */
function carried(tune: Tune): boolean[] {
  let lastStep = -99, lastLine = -1;
  return tune.notes.map((n) => {
    if (n.tie) return true;
    if (!n.stress && !n.quick && n.line === lastLine && n.step - lastStep < 2) return true;
    lastStep = n.step; lastLine = n.line;
    return false;
  });
}

/**
 * No quick turns inside a syllable (Paul: the ornaments moving the note on 8ths and 16ths, "especially
 * right after a syllable has started", sound weird): a syllable's pitch changes only once it has been
 * held a quarter note, and only to a note at least an 8th long. Other notes sung on a syllable's vowel
 * merge into the note before, on the pitch held longest (a lean onto the note, or a run into it,
 * becomes the note itself).
 */
function settle(tune: Tune): Tune {
  const tied = carried(tune);
  const out: TuneNote[] = [];
  let sylStep = 0;
  tune.notes.forEach((n, i) => {
    const prev = out[out.length - 1];
    if (!tied[i] || !prev) { sylStep = n.step; out.push({ ...n }); return; }
    // (a run, once the syllable's been held a beat, keeps its quick notes: quicken() sets their pace)
    if (n.step - sylStep >= 4 && (n.len >= 2 || n.run) && n.tie) { out.push({ ...n }); return; }
    // (merged: the pitch held longest; a fall off the end kept)
    const ownLen = n.step - prev.step;
    if (n.len > ownLen) { prev.midi = n.midi; prev.belt = prev.belt || n.belt; }
    prev.len = n.step + n.len - prev.step;
    if (n.fall) prev.fall = n.fall;
  });
  return { ...tune, notes: out };
}

/**
 * Speech rhythm (Paul: the syllables land on the beat "way too often... like it's running on a drum
 * beat"): now and then a stressed syllable on the beat is pushed an 8th early, ahead of the beat and
 * tied over it (the anticipation all through pop and rock); never four even 8ths in a row where a push
 * can break them. By the singer's way with syncopation (`syncop`); the same tune always the same.
 */
function speak(tune: Tune, rng: Rng, syncop: number): Tune {
  const ns = tune.notes;
  let run = 0;
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i], prev = ns[i - 1];
    if (n.tie) { run = 0; continue; }
    const even = prev && !prev.tie && prev.line === n.line && n.step - prev.step === 2;
    run = even ? run + 1 : 0;
    // (not into a held high note's half bar: it's held, Paul)
    let sylBefore = i - 1;
    while (sylBefore > 0 && ns[sylBefore].tie) sylBefore--;
    const canPush = n.stress && n.step % 4 === 0 && prev && n.step - prev.step >= 4 && !ns[sylBefore]?.peak;
    if (canPush && rng.chance(run >= 3 ? 1 : 0.15 + 0.35 * syncop)) {
      n.step -= 2; n.len += 2;
      prev.len = Math.min(prev.len, n.step - prev.step);
      run = 0;
    }
  }
  return tune;
}

/**
 * Quick syllables on the 8ths (Paul: a quick run of syllables should be on the beat, "at the 1/8th at
 * most, not quicker"): no new syllable sooner than an 8th after the last; one off the 8th grid (on a
 * 16th) only on its own, a dotted 8th or more from its neighbours; otherwise moved onto the nearest 8th
 * that leaves that room, or, if none does, dropped (the note before carries on through it).
 */
function onEighths(tune: Tune): Tune {
  const out: TuneNote[] = [];
  const syl = tune.notes.filter((x) => !x.tie);
  const absorb = (n: TuneNote) => { const p = out[out.length - 1]; if (p) p.len = n.step + n.len - p.step; };
  for (const n of tune.notes) {
    if (n.tie) { out.push(n); continue; }
    const prev = [...out].reverse().find((x) => !x.tie);
    // (a fine line's quick syllables, and the one after them, keep their 16ths: a slow song's quick words)
    if (n.quick || prev?.quick) { if (prev && n.step - prev.step < 1) { absorb(n); continue; } out.push(n); continue; }
    const nextStep = syl.find((x) => x.step > n.step)?.step ?? Infinity;
    const room = (g: number) => (!prev || g - prev.step >= 2) && nextStep - g >= 2;
    if (n.step % 2) {
      const alone = (!prev || n.step - prev.step >= 3) && nextStep - n.step >= 3;
      if (!alone) {
        const to = [n.step + 1, n.step - 1].find((g) => g >= 0 && room(g));
        if (to === undefined) { absorb(n); continue; }
        n.len = Math.max(1, n.step + n.len - to);
        n.step = to;
      }
    }
    if (prev && n.step - prev.step < 2) { absorb(n); continue; }
    out.push(n);
  }
  // (nothing overlapping after the moves)
  out.forEach((n, i) => { const nx = out[i + 1]; if (nx && n.step + n.len > nx.step) n.len = Math.max(1, nx.step - n.step); });
  return { ...tune, notes: out };
}

/** The share of a genre's real sung syllables on each off-8th 16th: the 16th before a beat or an 8th ('a'), the one after a beat ('e'). */
type Sixteenths = { a: number; e: number };
const realSixteenthsOf = (g: Genre): Sixteenths => { const h = (targets as unknown as Record<string, { hist: { onset16: Record<string, number> } }>)[g]?.hist.onset16 ?? { a: 0.128, e: 0.073 }; return { a: h.a ?? 0, e: h.e ?? 0 }; };

/**
 * Real songs with the Classic rhythm (Paul: "some constraints that stop it from placing vocal notes at
 * 1/16ths?"): the 8th rule (onEighths) leaves about 1% of syllables on a 16th; real singers about 17%
 * (src/realism/targets.json, by genre). Light syllables on an 8th's offbeat are moved a 16th, as real
 * singers phrase it, until the tune has its genre's share (or nothing else can move):
 * - a dotted pickup (the 'a'): an 8th pair into a beat sung dotted 8th + 16th, the light one a 16th later, just before the beat;
 *   or a push (a stressed word on the & ahead of an empty beat) a 16th later, just ahead of the beat;
 * - a snap (the 'e'): the light one after a beat a 16th sooner, the beat's syllable a quick 16th, the light one longer.
 * Never two 16ths in a row, never a held high note or a real shape's note, and only inside a line.
 */
function realSixteenths(tune: Tune, rng: Rng, want: Sixteenths): Tune {
  const ns = tune.notes;
  const syl = ns.filter((n) => !n.tie && Number.isInteger(n.step));
  if (!syl.length) return tune;
  const at = (p: number) => syl.filter((n) => mod(n.step, 4) === p).length;
  let needA = Math.round(want.a * syl.length) - at(3), needE = Math.round(want.e * syl.length) - at(1);
  const moved = new Set<TuneNote>();
  const free = (n: TuneNote | undefined) => n && !n.tie && !n.trip && !moved.has(n) && !n.quick;
  // (a candidate: a light syllable on the & with its own syllables either side in the line, an 8th or more away)
  const cands = ns.map((_, i) => i).filter((i) => {
    const n = ns[i];
    return i > 0 && !n.tie && !n.start && !n.peak && !n.belt && !n.pat && n.trip === undefined && mod(n.step, 4) === 2;
  });
  for (let k = cands.length - 1; k > 0; k--) { const j = rng.int(0, k); [cands[k], cands[j]] = [cands[j], cands[k]]; }
  for (const i of cands) {
    if (needA <= 0 && needE <= 0) break;
    const n = ns[i], prev = ns[i - 1], next = ns[i + 1];
    if (!free(n) || !free(prev) || prev.line !== n.line || n.step - prev.step < 2) continue;
    const pp = ns[i - 2], nn = ns[i + 2];
    const onBeat = next && !next.tie && next.line === n.line && next.step === n.step + 2;
    // the dotted pickup: into the next syllable on the beat; or a push (a stressed word ahead of an empty beat) a 16th later, just ahead of it
    const canA = needA > 0 && (onBeat ? !n.stress && free(next) && !(nn && nn.step - next.step < 2) : !next || next.line !== n.line || next.step >= n.step + 3);
    // the snap: off the syllable on the beat just before
    const canE = needE > 0 && !n.stress && prev.step === n.step - 2 && mod(prev.step, 4) === 0 && !(pp && !pp.tie && prev.step - pp.step < 2) && (!next || next.step - n.step >= 2);
    const pick = canA && canE ? (rng.chance(needA / (needA + needE)) ? 'a' : 'e') : canA ? 'a' : canE ? 'e' : null;
    if (!pick) continue;
    const end = n.step + n.len;
    if (pick === 'a') {
      if (prev.step + prev.len >= n.step) prev.len = n.step + 1 - prev.step;
      n.step += 1; n.len = Math.max(1, (onBeat ? Math.min(end, next!.step) : end) - n.step);
      needA--;
    } else {
      n.step -= 1; n.len = end - n.step;
      prev.len = 1;
      needE--;
    }
    n.quick = true;
    moved.add(n); moved.add(prev); if (next) moved.add(next);
  }
  return tune;
}

/** A tune as sung: settled (no quick turns), spoken (speech rhythm), with room to breathe. */
function shape(tune: Tune, rng: Rng, syncop: number, grid = false, words = false, real16?: Sixteenths): Tune {
  // (the grid's rhythm has its own pushes, on the grid: no speech-rhythm pushes on top; words first:
  // its quick light syllables kept on their 16ths, docs/VOCAL-WORDS.md)
  let t = words ? settle(tune) : onEighths(grid ? settle(tune) : speak(settle(tune), rng, syncop));
  // (Real songs, Classic rhythm: 16ths as often as real singers of the genre sing them)
  if (real16) t = realSixteenths(t, rng, real16);
  breathe(t.notes);
  return t;
}

/**
 * Room to breathe (Paul: a break in the voice before the next note should be at least a quarter bar,
 * "like they're taking a breath"): a gap of an 8th to under a beat before a note becomes a full beat,
 * the note before let go earlier; or, if that would leave it shorter than an 8th, no gap at all (sung
 * through). A new line straight after the last (under a beat) is the same: a beat's breath before it, or
 * sung through, joined to the line before. A 16th's gap is sung through anyway (the singer joins it).
 */
function breathe(notes: { step: number; len: number; start?: boolean; peak?: boolean }[]) {
  notes.forEach((n, i) => {
    const nx = notes[i + 1];
    if (!nx) return;
    const gap = nx.step - (n.step + n.len);
    // (a new line stops and starts the voice whatever the gap: it gets its beat too, or is sung through)
    if (gap >= 4 || (gap < 2 && !nx.start)) return;
    // (a held high note isn't cut under half a bar for it: sung through instead, Paul)
    if (nx.step - 4 - n.step >= (n.peak ? 8 : 2)) n.len = nx.step - 4 - n.step;
    else { n.len = nx.step - n.step; if (nx.start) nx.start = false; }
  });
}

/**
 * Space (energy.ts: a Drifter, Alice in Chains "Nutshell"): now and then a line leaves its first words
 * out and starts later, a beat or more into its bar, so the band has the gaps; at least three syllables
 * are kept, the held end always.
 */
function spaceOut(tune: Tune, space: number, rng: Rng): Tune {
  if (!space) return tune;
  const out: TuneNote[] = [];
  for (let li = 0; li < tune.lines; li++) {
    const L = tune.notes.filter((n) => n.line === li);
    const syl = L.map((n, i) => (n.tie ? -1 : i)).filter((i) => i >= 0);
    let cut = 0;
    if (syl.length >= 6 && rng.chance(space)) {
      // (up to half the words, cut where a new syllable starts at least a beat after the first)
      const most = Math.floor(syl.length / 2) - 1;
      // (words first: only where a word group ends, not in the middle of one)
      const groupEnd = (k: number) => { const p = L[syl[k - 1]].syl; return !p || p.brk >= 2; };
      for (let k = 1; k <= most; k++) if (L[syl[k]].step - L[0].step >= 4 && groupEnd(k)) { cut = syl[k]; break; }
    }
    const keep = L.slice(cut);
    if (keep.length) keep[0] = { ...keep[0], start: true, tie: false };
    out.push(...keep);
  }
  return { ...tune, notes: out };
}

/**
 * Words for a tune: rhymes on every other line, the chorus hook at the start of lines 1 and 3. A carried
 * note carries on the last syllable's vowel, its closing consonants moved to the end.
 */
function writeWords(rng: Rng, tune: Tune, style: LyricStyle, hook: Syllable[] | null, hi: number, own = true): Syllable[] {
  const sung: Syllable[] = [];
  let rhyme: Rhyme | null = null;
  const tied = carried(tune);
  // (words first, docs/VOCAL-WORDS.md: the tune's own words, written before its rhythm; later verses get new ones to its rhythm)
  const mine = own && tune.notes.some((n) => n.syl);
  for (let li = 0; li < tune.lines; li++) {
    const ns = tune.notes.filter((n, i) => n.line === li && !tied[i]);
    if (!ns.length) continue;
    let line: Syllable[];
    if (mine) {
      // (long and high notes open their closed vowels, now the pitches are known)
      line = ns.map((n) => { const s: Syllable = n.syl ? { ...n.syl } : { onset: [], vowel: 'AX', coda: [], stress: false, text: 'a', wordStart: true }; return n.len >= 4 || n.midi >= hi - 3 ? openUp(s) : s; });
      if (li % 2 === 1 && rhyme) rhymeWith(line, rhyme);
      if (li % 2 === 0) rhyme = rhymeOf(line);
      sung.push(...line);
      continue;
    }
    const slots: LyricSlot[] = ns.map((n) => ({ stress: n.stress, long: n.len >= 4, high: n.midi >= hi - 3 }));
    const useHook = hook && li % 2 === 0 ? hook.slice(0, Math.min(hook.length, ns.length - 1)) : undefined;
    line = lyricLine(rng, slots, style, { rhyme: li % 2 === 1 ? rhyme : null, hook: useHook });
    if (li % 2 === 0) rhyme = rhymeOf(line);
    sung.push(...line);
  }
  const out: Syllable[] = [];
  let k = 0;
  for (const [i] of tune.notes.entries()) {
    if (!tied[i] || !out.length) { out.push({ ...sung[Math.min(k++, sung.length - 1)] }); continue; }
    const before = out[out.length - 1];
    out.push({ onset: [], vowel: before.vowel, coda: before.coda, stress: false, text: '~', wordStart: false });
    before.coda = [];
  }
  return out;
}

export interface VocalBlock { tune: Tune; words: Syllable[] | null }

/** How each block sings (for the notes). */
const VOCAL_DESC: Partial<Record<SectionKind, string>> = {
  verse: 'the verse tune, low and wordy, new words each verse', prechorus: 'climbing line by line', chorus: 'the chorus tune and its hook, the same words every time',
  bridge: 'somewhere new, higher', outro: 'the chorus hook again, then the band plays out',
};

/** What the singer does in each kind of section. */
export const SUNG: SectionKind[] = ['verse', 'prechorus', 'chorus', 'bridge', 'outro'];

export interface SingContext {
  seed: string;
  mood: Mood;
  genre: Genre;
  /** Semitones higher the tunes are written (a higher singer: the Chester voice). */
  lift?: number;
  /** A high singer: the tunes kept under their top (fitHigh). */
  high?: HighVoice;
  /** The rhythm on the metronome grid (docs/VOCAL-RHYTHM.md) instead of the classic speech rhythm. */
  grid?: boolean;
  /** Words first (docs/VOCAL-WORDS.md): each line's words written before its rhythm, set to the grid. */
  words?: boolean;
  /** The pitches written the shaped way (docs/VOCAL-MELODY.md) instead of the classic way. */
  shaped?: boolean;
  /** Melody first (docs/VOCAL-FIRST.md; on top of shaped's range and moves): the tune's own spine and idea, fitted to the chords last. */
  first?: boolean;
  /** Learned (docs/VOCAL-LEARNED.md; on top of shaped's range and moves): each next pitch by the odds of real vocal lines. */
  learned?: boolean;
  /** Shaped: the one signature move chosen in the menu (left out: the song's own, by genre). */
  move?: MoveId;
  /** Real songs (docs/REALISM.md, src/parts/realism.ts): the writers lean toward real vocal lines of the genre. */
  real?: boolean;
  /** Patterns (docs/PATTERNS.md, src/realism/patterns.ts): rhythms and short shapes from the library; no line copying a real 2-bar stretch. */
  patterns?: boolean;
  /** How the singer carries the energy (src/parts/energy.ts): a style chosen, 'off', or left out: Auto. */
  energy?: EnergyStyle | 'off';
}

/**
 * The vocal for a whole track (in place, `idea.vocal` on each section): a tune per kind of section
 * (every verse sings the verse tune with new words; every chorus the same tune and words), the hook
 * opening the chorus lines, the climax section's last held note lifted to the song's top note, and
 * room left wherever Guitar 2 answers (a held note stops where its lick starts).
 */
export function singTrack(sections: Idea[], ctx: SingContext, climax: number) {
  const rng = new Rng(`${ctx.seed}-vocal`);
  const style: LyricStyle = { mood: ctx.mood, genre: ctx.genre };
  // the song's melody style: its mood's and genre's ways, with a little chance (docs/VOCAL.md, section 6)
  const melody = melodyStyle(ctx.seed, ctx.mood, ctx.genre, ctx.lift ?? 0);
  if (ctx.grid) melody.grid = true;
  // (shaped: the chorus's jump above the verse picked per song, subtle, clear or dramatic; Paul: "randomly pick")
  if (ctx.shaped) {
    const cr = new Rng(`${ctx.seed}-contrast`);
    melody.shaped = true;
    if (ctx.first) melody.first = firstStyle(ctx.seed, ctx.mood, ctx.genre);
    if (ctx.learned) melody.learned = learnedStyle(ctx.genre);
    melody.contrast = cr.pick(['subtle', 'clear', 'dramatic'] as const);
    melody.lift = melody.contrast === 'subtle' ? cr.int(2, 3) : melody.contrast === 'clear' ? cr.int(4, 5) : cr.int(7, 9);
    // the song's signature moves (docs/VOCAL-MOVES.md); two of them set its whole shape
    melody.moves = pickMoves(ctx.seed, ctx.genre, ctx.move);
    // (melody first: Auto keeps the moves that colour the tune, not the ones that reshape it, so the tune keeps its own line)
    if ((ctx.first || ctx.learned) && !ctx.move) melody.moves = melody.moves.filter((m) => !['pedal', 'monotone', 'sequence', 'upupdown', 'flip'].includes(m));
    if (melody.moves.includes('flip')) { const up = cr.chance(0.7); melody.verse = up ? 'fall' : 'climb'; melody.chorus = up ? 'rise' : 'tumble'; }
    if (melody.moves.includes('belt')) { melody.contrast = 'dramatic'; melody.lift = cr.int(7, 9); }
  }
  // (real songs: the genre's lean toward real vocal lines; the range and the chorus's lift narrowed here, the rest in the writers)
  if (ctx.patterns) melody.patterns = true;
  let realArcV: RealArc | null = null;
  if (ctx.real) {
    melody.real = REAL_LEAN[ctx.genre];
    melody.span *= melody.real.span;
    // (the chorus against the verse as real songs have it, drawn per song from their spread (docs/ARC.md): most
    // only a little higher, a quarter 2 or more, some lower; a little sparser; the top note saved for the last
    // chorus only now and then)
    realArcV = realArc(ctx.genre, new Rng(`${ctx.seed}-real-arc`));
    melody.lift = Math.max(0, Math.round(realArcV.height));
    // (the plan's own chorus slowdown undone: the real pace is the whole of it)
    melody.busyChorus = melody.busyVerse * realArcV.pace * (planBusy('verse') / planBusy('chorus'));
  }
  // how the singer carries the song's energy: its energy style (docs/VOCAL-ENERGY.md), or off (as before)
  const es = ctx.energy === 'off' ? null : pickEnergy(ctx.seed, ctx.mood, ctx.genre, ctx.energy);
  const sungE = sections.filter((s) => SUNG.includes(s.section!.kind) && !s.section!.solo).map((s) => s.section!.energy);
  const firstSung = sections.findIndex((s) => SUNG.includes(s.section!.kind) && !s.section!.solo);
  const eLo = Math.min(...sungE), eHi = Math.max(...sungE);
  const first = sections.find((s) => s.section?.kind === 'verse') ?? sections[0];
  // the song's anchor: the verse centre, the key's root nearest G3 (the low voice's comfortable middle)
  const key = first.song.key;
  const base = 55 + mod(key - 55 + 6, 12) - 6;
  const blocks = new Map<SectionKind, { tune: Tune; key: number; bars: number; words: Syllable[]; tag: string; ref: number }>();
  const hookStress = rng.pick([[true, false, true], [true, true], [true, false, true, false], [true, false]]);
  const hook = makeHook(new Rng(`${ctx.seed}-hook-words`), hookStress, style);
  // words first (docs/VOCAL-WORDS.md): how wordy the song is (its genre's rate, its own lean), its triplets, its soft endings
  /** Words first: the song's own lean (wordier or sparer than its genre). */
  let wordLean = 1;
  if (ctx.words) {
    const wr = new Rng(`${ctx.seed}-words-rate`);
    melody.words = { rate: 0.75 + 0.55 * wr.next(), trip: WORD_TRIP[ctx.genre], fem: WORD_FEM[ctx.genre], ask: WORD_ASK[ctx.mood], lyric: style, hook };
    wordLean = melody.words.rate;
    // (real songs, docs/WORDS-REAL.md: syllables a second as real singers sing them (the song's own lean kept), a
    // chorus's lines only a little slower, soft line endings as often)
    if (ctx.real) {
      const rw = realWords(ctx.genre);
      melody.words.rate *= rw.rate / (WORD_RATE[ctx.genre] * WORD_SUNG);
      melody.words.chorus = rw.chorus;
      melody.words.fem = rw.fem;
    }
  }
  const seen: Partial<Record<SectionKind, number>> = {};
  let told = false;
  sections.forEach((idea, si) => {
    const info = idea.section!;
    idea.vocal = [];
    idea.vocalTimbre = melody.timbre;
    const kind = info.kind;
    if (!SUNG.includes(kind) || info.solo) return;
    const n = (seen[kind] = (seen[kind] ?? 0) + 1);
    // an outro sings the chorus's tune (its last line repeating), unless it's a jam in a new key
    const as: SectionKind = kind === 'outro' ? 'chorus' : kind;
    let b = blocks.get(as);
    if (!b) {
      const src = kind === 'outro' ? (sections.find((s) => s.section?.kind === 'chorus') ?? idea) : idea;
      // (written at its section's energy, by the energy style's dials)
      const st = es ? energize(melody, dialsFor(es, levelOf(src.section?.energy ?? 3, eLo, eHi)), as, bandBusy(src), es) : melody;
      const write = (salt: string) => spaceOut(shape(writeTune(new Rng(`${ctx.seed}-tune-${as}${salt}`), src.song, src.chords, as, base, ctx.genre, st, bandOf(src)), new Rng(`${ctx.seed}-speak-${as}${salt}`), st.singer.syncop, melody.grid, !!melody.words, melody.real && !melody.grid && !melody.words ? realSixteenthsOf(ctx.genre) : undefined), st.space ?? 0, new Rng(`${ctx.seed}-space-${as}${salt}`));
      let tune = write('');
      // (patterns: the copy guard: a tune with a 2-bar stretch a real song sings is written again, a few times at most)
      for (let k = 1; melody.patterns && k <= GUARD_TRIES && copiesReal(tune.notes, src.song.bars[0]?.len ?? 16); k++) { tune = write(`-guard${k}`); guardRewrites++; }
      const words = writeWords(new Rng(`${ctx.seed}-words-${as}`), tune, style, as === 'chorus' ? hook : null, base + 6);
      const t = idea.section?.tension ?? [];
      b = { tune, key: src.song.key, bars: src.song.bars.length, words, tag: as, ref: t.length ? t.reduce((x, y) => x + y, 0) / t.length : 0.5 };
      blocks.set(as, b);
    }
    // later verses: the same tune with new words; choruses: word for word
    const words = as === 'verse' && n > 1 ? writeWords(new Rng(`${ctx.seed}-words-verse-${n}`), b.tune, style, null, base + 6, false) : b.words;
    let shift = mod(idea.song.key - b.key + 6, 12) - 6;
    // (a key change that would take the tune out of reach: sung an octave down)
    if (Math.max(...b.tune.notes.map((x) => x.midi)) + shift > PEAK + melody.up + 2) shift -= 12;
    const blockSteps = b.tune.notes.length ? Math.max(...b.tune.notes.map((x) => x.step + x.len)) : 0;
    const blockLen = sections.find((s) => s.section?.kind === as)?.song.total ?? idea.song.total;
    const total = idea.song.total;
    // tiled over the section (a verse played twice through sings its tune twice; an outro its first bars)
    for (let off = 0; off < total; off += blockLen) {
      b.tune.notes.forEach((t, i) => {
        const g = off + t.step;
        if (g >= total || blockSteps <= 0) return;
        // (an outro sings only its first half, then lets the band play out)
        if (kind === 'outro' && g >= Math.max(blockLen / 2, total / 2)) return;
        idea.vocal!.push({ step: g, len: Math.min(t.len, total - g), midi: t.midi + shift, vel: t.belt ? 0.95 : t.stress ? 0.85 : 0.75, syl: { ...words[i] }, start: t.start, slide: t.slide, fall: t.fall, belt: t.belt, ...(t.colour ? { colour: true } : {}), ...(t.pat ? { pat: true } : {}), ...(t.peak ? { peak: true } : {}), ...(t.trip !== undefined ? { trip: t.trip } : {}) });
      });
    }
    // the tune follows the tension curve, line by line: reaching up as the song builds, settling as it lets go
    const moved = followTension(idea, b.ref, ctx.mood, melody, new Rng(`${ctx.seed}-follow-${si}`), es ? FOLLOW_BY[es] : 1);
    // the climax: its last held note lifted to the song's top
    if (si === climax && (!realArcV || realArcV.climax) && idea.vocal.length) {
      const v = idea.vocal;
      const held = [...v].reverse().find((x, k) => x.len >= 4 && x.syl.text !== '~' && v[v.length - k]?.syl.text !== '~');
      if (held) {
        const tones = chordTones(idea.song.key, idea.chords.timeline[idea.chords.chordIdx[held.step]].chord);
        const top = PEAK + melody.up + 1 + melody.top;
        let m = held.midi + 3;
        while (m < top && !tones.includes(mod(m, 12))) m++;
        if (m <= top) { held.midi = m; held.belt = true; held.vel = 0.95; held.fall = undefined; }
      }
    }
    // every section's notes fitted to what its band plays (its own chords, its bass), pushed with the
    // band's pushes, and Guitar 2 out of the way of the words
    const fit = fitToBand(idea, FLOOR + melody.up, PEAK + melody.up + 1 + melody.top);
    // (and nothing left under the floor: an octave up)
    for (const n of idea.vocal) while (n.midi < FLOOR + melody.up) n.midi += 12;
    // (on the grid: only pushes that land on it)
    const pushed = pushWithBand(idea, melody.grid ? gridUnit(idea.song.bpm) : 1);
    const cleared = clearForSinger(idea);
    leaveRoom(idea);
    breathe(idea.vocal);
    // sung at its energy: the style's accents; now and then against the band on purpose
    let against: string | null = null;
    if (es) {
      idea.vocalEnergy = es;
      idea.vocalLay = layFor(es, info.energy);
      against = deliverEnergy(idea, es, sections.length > 1 ? againstFor(new Rng(`${ctx.seed}-against-${si}`), info.energy, si === firstSung) : null, FLOOR + melody.up, PEAK + melody.up + 1 + melody.top);
    }
    if (ctx.high) fitHigh(idea, ctx.high);
    // (no lone spikes: a jump up of a 6th or more coming straight back down is a 5th at most, and a big drop off a high note steps down)
    const spikes = smoothSpikes(idea);
    const trips = tripletize(idea.vocal);
    const quick = quicken(idea.vocal, 15 / idea.song.bpm, new Rng(`${ctx.seed}-quick-${si}`));
    // (patterns: the copy guard once more, on the line as finally sung)
    const unCopied = melody.patterns ? breakCopies(idea) : 0;
    if (idea.vocal.length) {
      const words = lyricText(idea.vocal);
      if (!told) {
        idea.notes.push(`Singer: ${melody.singer.desc}; ${TIMBRE_DESC(melody.timbre)}`, `Melody: ${melodyDesc(melody)}`);
        if (es) idea.notes.push(`Energy (${ctx.energy ? 'chosen' : 'this song\'s'}): ${ENERGY[es].label}, like ${ENERGY[es].like}: ${ENERGY[es].desc}`);
        if (melody.first) idea.notes.push(`Melody: ${firstDesc(melody.first)}`);
        if (melody.learned) idea.notes.push(`Melody: ${learnedDesc(melody.learned)}`);
        if (melody.words) idea.notes.push(`Rhythm: words first, the words written before the rhythm: word groups set to the grid, quick light words, soft line endings; about ${(melody.words.rate * WORD_RATE[ctx.genre] * WORD_SUNG).toFixed(1)} syllables a second in verses (${GENRE_LABEL[ctx.genre].toLowerCase()}${ctx.real ? ', as real singers' : ''}, this song ${wordLean >= 1.1 ? 'wordier' : wordLean <= 0.9 ? 'sparer' : 'about usual'})`);
        if (melody.moves?.length) idea.notes.push(`Melody moves (${ctx.move ? 'chosen' : 'this song\'s signature'}): ${movesDesc(melody.moves)}`);
        told = true;
      }
      idea.notes.push(`Vocal (${VOCAL_DESC[as]}): “${words.length > 140 ? `${words.slice(0, 140)}…` : words}”`);
      const bits = [moved.up && `${moved.up} up`, moved.down && `${moved.down} down`, moved.turns && `${moved.turns === 1 ? 'a turn' : `${moved.turns} turns`}`].filter(Boolean);
      const fitBits = [fit.moved && `${fit.moved === 1 ? 'a note' : `${fit.moved} notes`} moved off clashes`, fit.slides && `${fit.slides === 1 ? 'a held note slides' : `${fit.slides} held notes slide`} with the chord`, pushed && `pushes with the band ${pushed === 1 ? 'once' : `${pushed} times`}`, cleared && (idea.guitar2.length ? `Guitar 2 leaves out ${cleared === 1 ? 'a note' : `${cleared} notes`} over the words` : 'Guitar 2 lays out under the singer')].filter(Boolean);
      if (quick) fitBits.push(`${quick === 1 ? 'a run' : `${quick} runs`} sung quicker than the beat`);
      if (unCopied) fitBits.push(`${unCopied === 1 ? 'a note' : `${unCopied} notes`} moved a step so no 2 bars copy a real song`);
      if (spikes) fitBits.push(`${spikes === 1 ? 'a high note' : `${spikes} high notes`} brought nearer the line (no octave up and straight back)`);
      if (trips) fitBits.push(`${trips === 1 ? 'a triplet' : `${trips} triplets`}`);
      if (fitBits.length) idea.notes.push(`Vocal fits the band: ${fitBits.join(', ')}`);
      if (against) idea.notes.push(`Vocal against the band: ${against}`);
      if (bits.length) idea.notes.push(`Vocal follows the tension: ${moved.up ? 'reaching up' : 'settling down'} (notes moved ${bits.join(', ')})`);
    }
  });
}

/** Words first's triplets (docs/VOCAL-WORDS.md): a beat's three quick syllables, marked when set, sung evenly in thirds of the beat (fractional steps). */
function tripletize(v: VocalNote[]): number {
  let made = 0;
  for (let i = 0; i + 2 < v.length; i++) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    if (a.trip !== 0 || b.trip !== 1 || c.trip !== 2) continue;
    const g = a.step;
    // (still in their beat after the fitting: else left as they are)
    if (!(b.step > g && c.step > b.step && c.step < g + 4)) continue;
    const end = c.step + c.len;
    a.len = 4 / 3; b.step = g + 4 / 3; b.len = 4 / 3; c.step = g + 8 / 3; c.len = Math.max(4 / 3, end - c.step);
    made++;
    i += 2;
  }
  return made;
}

/** How often a beat of three quick syllables is sung as a triplet, and a line ends softly (BA-by), by genre (words first). */
const WORD_TRIP: Record<Genre, number> = { pop: 0.35, funk: 0.45, rock: 0.3, hardrock: 0.25, metal: 0.15, grunge: 0.2, altmetal: 0.3 };
/** How often a pair of lines is a question and its answer (the first rising, the second falling home), by mood: open, hopeful moods ask most; angry and dark ones state. */
const WORD_ASK: Record<Mood, number> = { happy: 0.6, dreamy: 0.6, nostalgic: 0.5, triumphant: 0.45, tense: 0.5, melancholic: 0.4, dark: 0.3, angry: 0.25 };
const WORD_FEM: Record<Genre, number> = { pop: 0.5, funk: 0.4, rock: 0.45, hardrock: 0.4, metal: 0.3, grunge: 0.45, altmetal: 0.4 };
/** Rhythm Words: how much of its nominal syllables a second (WORD_RATE) a line ends up singing (rests, held notes; measured by npm run realism-lab), so Real songs can aim at real singers' rate. */
const WORD_SUNG = 0.89;

/**
 * Runs aren't locked to the band's grid (Paul: in a slow song the vocal is "super slow and draggy";
 * runs could go at half or quarter time, "not all through but sprinkled in"): a run whose notes take
 * longer than a quick singer's (over about 0.2 s each) is now and then sung two or four times as fast,
 * landing on its last note sooner and holding that longer. Its quick notes fall between the 16ths
 * (fractional steps); its first and last notes stay on the grid. `six`: a 16th in seconds. Returns how
 * many runs were sped up.
 */
function quicken(v: VocalNote[], six: number, rng: Rng): number {
  let sped = 0;
  for (let i = 0; i < v.length; i++) {
    // a run: two or more quick tied notes on one vowel, then the note it lands on
    let j = i;
    while (v[j + 1]?.syl.text === '~') j++;
    const runFrom = i + 1, last = j;
    if (last - runFrom < 2 || v.slice(runFrom, last).some((x) => x.len > 2)) { i = j; continue; }
    const unit = v[runFrom].len * six;
    const most = unit / 4 >= 0.1 ? 4 : unit / 2 >= 0.1 ? 2 : 1;
    if (unit < 0.2 || most === 1 || !rng.chance(0.65)) { i = j; continue; }
    const f = most === 4 && rng.chance(0.6) ? 2 : most;
    const base = v[runFrom].step;
    for (let k = runFrom; k < last; k++) { v[k].step = base + (v[k].step - base) / f; v[k].len /= f; }
    const end = v[last].step + v[last].len;
    const to = Math.ceil(base + (v[last].step - base) / f);
    v[last - 1].len = to - v[last - 1].step;
    v[last].step = to;
    v[last].len = end - to;
    sped++;
    i = last;
  }
  return sped;
}

/**
 * A high singer kept out of the whistle (Paul: "avoid very high notes consistently or without scream or
 * belt ... it's sounding like a whistle at points"): no note sung over their top (Chester G4, the tenor
 * A4, the woman C5) unless it's belted or pushed (then up to their belt top, a minor 3rd higher); a note
 * over it sung instead on the highest note of the chord under it.
 */
function fitHigh(idea: Idea, h: HighVoice) {
  const H = HIGH_VOICES[h], off = H.octave ? 12 : 0;
  const { key, total } = idea.song;
  const tl = idea.chords.timeline, idx = idea.chords.chordIdx;
  for (const n of idea.vocal ?? []) {
    const lim = (n.belt || n.vel >= 0.95 ? H.beltTop : H.top) - off;
    if (n.midi <= lim) continue;
    const tones = chordTones(key, tl[idx[Math.min(Math.max(0, Math.floor(n.step)), total - 1)]].chord);
    let m = lim;
    while (m > lim - 12 && !tones.includes(mod(m, 12))) m--;
    n.midi = m;
  }
}

/**
 * Spikes (Paul: a line jumping up an octave to a held high note and straight back down "is not very good
 * sounding"; a jump up that keeps going is fine). Inside a line, a note (with its vowel carried on at the
 * same pitch) a 6th or more over the note before and the note after (half a bar's rest or less between them) is brought down to a 5th at most over
 * the one before (a chord note, else a note of the key). And a drop of a 6th or more off a high note that was
 * jumped to steps down: the next note (and, if still a big drop, the one after) moved up to a chord note a
 * 3rd or so under it; never a line's last note (its ending stays). Returns the notes changed.
 */
function smoothSpikes(idea: Idea): number {
  const v = idea.vocal;
  if (!v?.length) return 0;
  const { key, total } = idea.song;
  const scale = (SCALES[idea.song.mode] as readonly number[]).map((x) => (key + x) % 12);
  const tonesAt = (g: number) => chordTones(key, idea.chords.timeline[idea.chords.chordIdx[Math.min(total - 1, Math.max(0, Math.floor(g)))]].chord);
  const lead = v.filter((n) => !n.role).sort((a, b) => a.step - b.step);
  const lines: VocalNote[][] = [];
  for (const n of lead) { if (n.start || !lines.length) lines.push([]); lines[lines.length - 1].push(n); }
  let changed = 0;
  for (const line of lines) {
    // (runs of notes at one pitch: a syllable and its vowel held on)
    const G: VocalNote[][] = [];
    for (const n of line) { const last = G[G.length - 1]; if (last && last[0].midi === n.midi) last.push(n); else G.push([n]); }
    const pitch = (g: VocalNote[]) => g[0].midi;
    const set = (g: VocalNote[], m: number) => { for (const n of g) n.midi = m; changed++; };
    const close = (a: VocalNote[], b: VocalNote[]) => b[0].step - (a[a.length - 1].step + a[a.length - 1].len) <= 8;
    // (the nearest chord note to a pitch in a span, else a note of the key)
    const best = (g: number, lo: number, hi: number, near: number) => {
      const t = tonesAt(g), ms = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
      const by = (ok: (m: number) => boolean) => ms.filter(ok).sort((x, y) => Math.abs(x - near) - Math.abs(y - near))[0];
      return by((m) => t.includes(mod(m, 12))) ?? by((m) => scale.includes(mod(m, 12)));
    };
    for (let i = 1; i + 1 < G.length; i++) {
      const A = G[i - 1], B = G[i], C = G[i + 1];
      if (!close(A, B) || !close(B, C)) continue;
      const up = pitch(B) - pitch(A);
      // a spike: up a 6th or more and straight back down: a 5th at most
      if (up >= 8 && pitch(B) - pitch(C) >= 7) {
        const m = best(B[0].step, pitch(A) + 3, pitch(A) + 7, pitch(A) + 7);
        if (m !== undefined) set(B, m);
      }
      // the way down off a high note that was jumped to: a step or two at a time
      if (pitch(B) - pitch(A) < 5) continue;
      for (let j = i + 1, k = 0; k < 2 && j + 1 < G.length; j++, k++) {
        const hi = G[j - 1], X = G[j];
        if (!close(hi, X) || pitch(hi) - pitch(X) < 8) break;
        const m = best(X[0].step, pitch(hi) - 7, pitch(hi) - 2, pitch(hi) - 4);
        if (m === undefined) break;
        set(X, m);
      }
    }
  }
  return changed;
}

/** A held note stops where Guitar 2's answer starts (the singer breathes, the lead answers; a full beat's room, breathe()); a wail holds on. */
function leaveRoom(idea: Idea) {
  const lead = idea.guitar2.filter((h) => !h.letRing && !h.swell).map((h) => h.step);
  for (const n of idea.vocal ?? []) {
    if (n.len < 4 || n.belt || n.peak) continue;
    const hit = lead.find((g) => g >= n.step + 2 && g < n.step + n.len);
    if (hit !== undefined) n.len = hit - n.step;
  }
}

/**
 * Patterns: the copy guard on a section's finished line (fitting to the band and the energy can change notes after
 * the tune was checked): in a 2-bar stretch that matches a real song's, a light syllable inside it moves a step to
 * another chord note (or a note of the key), until nothing matches. Returns the notes moved.
 */
function breakCopies(idea: Idea): number {
  const v = idea.vocal;
  if (!v?.length) return 0;
  const bar = idea.song.bars[0]?.len ?? 16;
  const lead = () => v.filter((n) => !n.role);
  const scale = (SCALES[idea.song.mode] as readonly number[]).map((x) => (idea.song.key + x) % 12);
  let moved = 0;
  for (let k = 0; k < 8; k++) {
    // (the first stretch that matches)
    const ns = lead(), st = copyAt(ns, bar);
    if (st < 0) break;
    const w = ns.filter((n) => n.step >= st && n.step < st + 2 * bar && n.syl.text !== '~');
    const n = w.filter((x) => !x.syl.stress).at(Math.floor(w.length / 2) % Math.max(1, w.filter((x) => !x.syl.stress).length)) ?? w[Math.floor(w.length / 2)];
    const tones = chordTones(idea.song.key, idea.chords.timeline[idea.chords.chordIdx[Math.min(idea.song.total - 1, n.step)]].chord);
    const to = [1, -1, 2, -2, 3, -3].map((d) => n.midi + d).find((m) => tones.includes(mod(m, 12))) ?? [1, -1, 2, -2].map((d) => n.midi + d).find((m) => scale.includes(mod(m, 12)));
    if (to === undefined) break;
    // (its vowel carried on at the same pitch moves with it)
    const was = n.midi;
    for (let j = v.indexOf(n) + 1; j < v.length && v[j].syl.text === '~' && v[j].midi === was; j++) v[j].midi = to;
    n.midi = to;
    moved++;
  }
  return moved;
}

/** The vocal of a lone idea: the chorus tune and its hook. */
export function singIdea(idea: Idea, seed: string, mood: Mood, lift = 0, rhythm?: 'grid' | 'words', melody?: 'shaped' | 'first' | 'learned', move?: MoveId, high?: HighVoice, energy?: EnergyStyle | 'off', real?: boolean, patterns?: boolean) {
  const fake = { ...idea, section: { kind: 'chorus' as SectionKind, label: 'Chorus', energy: 4 } };
  singTrack([fake], { seed, mood, genre: idea.song.partGenres.strum, lift, grid: rhythm === 'grid', words: rhythm === 'words', shaped: !!melody, first: melody === 'first', learned: melody === 'learned', move, high, energy, real, patterns }, 0);
  arrangeBacking([fake], { seed, backing: pickBacking(seed, mood, idea.song.partGenres.strum, fake.vocalEnergy), mood, energy: fake.vocalEnergy }, -1);
  idea.vocal = fake.vocal;
  idea.vocalTimbre = fake.vocalTimbre;
  idea.backing = fake.backing;
  idea.vocalDouble = fake.vocalDouble;
  idea.vocalEnergy = fake.vocalEnergy;
  idea.vocalLay = fake.vocalLay;
}

/** The voice for a song on Auto: low for heavier genres, either for pop. */
export function autoVoice(seed: string, genre: Genre): VoiceType {
  // (sung high: by one of the high singers, singers.ts; more where they fit: Chester in alt metal and hard rock)
  const high = genre === 'pop' ? 0.5 : genre === 'funk' ? 0.4 : genre === 'altmetal' ? 0.35 : genre === 'rock' || genre === 'hardrock' ? 0.3 : genre === 'metal' ? 0.2 : 0.15;
  return new Rng(`${seed}-voice`).chance(high) ? 'high' : 'low';
}

/**
 * The backing singer's voice: chosen, or on Auto a second singer around the lead: the other voice (an
 * octave apart: low lead, high backing voices) in pop, funk and rock; the same register, another
 * person, in the heavier genres (the low harmonies under a grunge or metal lead).
 */
export function backingVoice(idea: Idea, leadChoice: string, choice: string): VoiceType {
  if (choice === 'low' || choice === 'high') return choice;
  const lead: VoiceType = leadChoice === 'low' || leadChoice === 'high' ? leadChoice : idea.vocalVoice ?? 'low';
  const g = idea.song.partGenres.strum;
  return ['pop', 'funk', 'rock'].includes(g) ? (lead === 'low' ? 'high' : 'low') : lead;
}

/** The lyric of a section as text (lines separated by " / "). */
export function lyricText(notes: VocalNote[]): string {
  const lines: VocalNote[][] = [];
  for (const n of notes) {
    if (n.start || !lines.length) lines.push([]);
    lines[lines.length - 1].push(n);
  }
  return lines.map((l) => spell(l.map((n) => n.syl).filter((x) => x.text !== '~'))).join(' / ');
}
