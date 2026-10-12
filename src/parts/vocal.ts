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

import type { ChordPart, Idea, SectionKind, Song } from '../idea';
import type { Genre } from '../genres';
import { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import type { Mood } from '../tension';
import { SCALES, chordPc } from '../theory';
import { MINORISH, chordTones } from './guitar2';
import { type LyricSlot, type LyricStyle, type Rhyme, type Syllable, lyricLine, makeHook, rhymeOf, spell } from './lyrics';

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
}

export type VoiceType = 'low' | 'high';

/** The low voice's comfortable range (a rock tenor-baritone): C3 to E4, the climax up to A4. */
const LOW: [number, number] = [48, 64];
const PEAK = 69;

/** Rhythm cells per beat group, by how busy (positions within the group, 16ths). */
const CELLS: Record<number, number[][][]> = {
  // [sparse, medium, busy]
  4: [[[0], [0, 2], [2]], [[0, 2], [0, 2], [0, 3], [0, 1, 2], [2, 3]], [[0, 2, 3], [0, 1, 2], [0, 1, 2, 3], [0, 2]]],
  3: [[[0], [0, 2]], [[0, 2], [0, 1, 2], [0]], [[0, 1, 2], [0, 2]]],
  2: [[[0]], [[0], [0, 1]], [[0, 1]]],
};
const cellsFor = (g: number) => CELLS[g] ?? CELLS[g >= 4 ? 4 : g === 3 ? 3 : 2];

/** What a block of the song sings like. */
interface Plan { busy: number; center: number; span: number; toneStrong: number; repeat: number; rise: number }
const PLANS: Partial<Record<SectionKind, Plan>> = {
  verse: { busy: 1.1, center: 0, span: 7, toneStrong: 0.62, repeat: 0.32, rise: 0 },
  prechorus: { busy: 1.2, center: 2, span: 8, toneStrong: 0.7, repeat: 0.25, rise: 2 },
  chorus: { busy: 0.8, center: 4, span: 10, toneStrong: 0.82, repeat: 0.2, rise: 0 },
  bridge: { busy: 0.9, center: 5, span: 9, toneStrong: 0.75, repeat: 0.2, rise: 0 },
  outro: { busy: 0.8, center: 4, span: 10, toneStrong: 0.82, repeat: 0.2, rise: 0 },
};

/** Genres lean the plan: grunge low, narrow and drawled; funk busy and short; metal long notes; pop wide. */
const GENRE_LEAN: Record<Genre, { busy: number; span: number; center: number; legato: number }> = {
  rock: { busy: 1, span: 1, center: 0, legato: 0.85 },
  pop: { busy: 1, span: 1.15, center: 1, legato: 0.9 },
  funk: { busy: 1.3, span: 0.8, center: 0, legato: 0.6 },
  hardrock: { busy: 0.95, span: 1.1, center: 2, legato: 0.85 },
  metal: { busy: 0.85, span: 1.15, center: 2, legato: 0.9 },
  grunge: { busy: 0.9, span: 0.75, center: -2, legato: 0.85 },
  altmetal: { busy: 0.95, span: 1, center: 0, legato: 0.85 },
};

/** The notes the melody may use: verses pentatonic, choruses the mode with the pentatonic leaning. */
function scaleFor(song: Song, kind: SectionKind): number[] {
  const minor = MINORISH.includes(song.mode);
  const pent = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  return kind === 'verse' ? pent : [...new Set([...pent, ...SCALES[song.mode]])].sort((a, b) => a - b);
}

/** A two-bar line's rhythm: onsets (absolute steps) with stress, and where its last (held) note ends. */
interface LineRhythm { onsets: { g: number; stress: boolean }[]; end: number }

function lineRhythm(rng: Rng, bars: Bar[], busy: number, pickup: boolean): LineRhythm {
  const onsets: { g: number; stress: boolean }[] = [];
  const level = (x: number) => Math.max(0, Math.min(2, Math.round(x + (rng.next() - 0.5) * 0.8)));
  const [b1, b2] = bars;
  const g1 = groupStarts(b1.groups);
  // a pickup: an 8th or two before the line, in the gap the last line left
  if (pickup && b1.start >= 2) {
    const n = rng.chance(0.5) ? 2 : 1;
    for (let k = n; k >= 1; k--) onsets.push({ g: b1.start - 2 * k, stress: false });
  }
  b1.groups.forEach((len, gi) => {
    const cell = rng.pick(cellsFor(len)[level(busy)]);
    for (const p of cell) onsets.push({ g: b1.start + g1[gi] + p, stress: p === 0 });
  });
  if (!b2) {
    // a one-bar line: hold its last note to the bar's last group
    const last = onsets[onsets.length - 1];
    return { onsets, end: Math.max(last.g + 2, b1.start + g1[Math.max(1, g1.length - 1)]) };
  }
  // the second bar: a group or two more, then the held note on a strong beat, then a breath
  const g2 = groupStarts(b2.groups);
  const sungGroups = Math.max(0, Math.min(b2.groups.length - 2, rng.weighted([[0, 2], [1, 3], [2, 1]])));
  for (let gi = 0; gi < sungGroups; gi++) {
    const cell = rng.pick(cellsFor(b2.groups[gi])[level(busy - 0.5)]);
    for (const p of cell) onsets.push({ g: b2.start + g2[gi] + p, stress: p === 0 });
  }
  let hold = b2.start + g2[sungGroups];
  // (rock's anticipation: the held note lands an 8th early)
  if (rng.chance(0.25) && hold - 2 > onsets[onsets.length - 1].g) hold -= 2;
  onsets.push({ g: hold, stress: true });
  const breath = b2.groups.length >= 4 ? b2.groups[b2.groups.length - 1] + (rng.chance(0.4) ? b2.groups[b2.groups.length - 2] : 0) : b2.groups[b2.groups.length - 1];
  const end = Math.max(hold + 2, b2.start + b2.len - breath);
  // no two notes on one step, sorted
  const seen = new Set<number>();
  return { onsets: onsets.filter((o) => (seen.has(o.g) ? false : (seen.add(o.g), true))).sort((a, b) => a.g - b.g), end };
}

/** A melody block (one section's worth), before its words. */
interface Tune { notes: { step: number; len: number; midi: number; stress: boolean; start: boolean; line: number }[]; lines: number }

/**
 * The tune of a block: lines of two bars; `kind` sets how busy, how high and how tied to the chords;
 * `base`: the verse's centre pitch (the song's anchor). Steps are relative to the block's start.
 */
function writeTune(rng: Rng, song: Song, chords: ChordPart, kind: SectionKind, base: number, genre: Genre): Tune {
  const P = PLANS[kind] ?? PLANS.verse!;
  const G = GENRE_LEAN[genre];
  const { key, bars, total } = song;
  const scale = scaleFor(song, kind);
  const center = base + P.center + G.center;
  const span = Math.round(P.span * G.span);
  const lo = Math.max(LOW[0] - 3, center - Math.ceil(span / 2)), hi = Math.min(PEAK - 2, center + Math.floor(span / 2));
  const pool: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(mod(m - key, 12))) pool.push(m);
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(Math.max(0, g), total - 1)]].chord;
  const isTone = (m: number, g: number) => chordTones(key, chordAt(g)).includes(mod(m, 12));
  const rubs = (m: number, g: number) => !isTone(m, g) && (chordTones(key, chordAt(g)).some((c) => [1, 11].includes(mod(m - c, 12))) || mod(m - chordPc(key, chordAt(g)), 12) === 6);
  const nearestIdx = (m: number) => pool.reduce((bi, x, i) => (Math.abs(x - m) < Math.abs(pool[bi] - m) ? i : bi), 0);

  const lines: Bar[][] = [];
  for (let i = 0; i < bars.length; i += 2) lines.push(bars.slice(i, i + 2));
  const notes: Tune['notes'] = [];
  const rhythms: LineRhythm[] = [];
  const shapes: number[][] = [];
  lines.forEach((L, li) => {
    // verses: line 3 sings line 1's tune again (A A'); choruses: lines 1 and 3 open with the same hook
    const again = (kind === 'verse' || kind === 'chorus' || kind === 'outro') && li % 2 === 0 && li >= 2 && L.length === lines[li - 2].length;
    const busy = P.busy * G.busy;
    let rh: LineRhythm;
    if (again && rhythms[li - 2]) {
      const off = L[0].start - lines[li - 2][0].start;
      rh = { onsets: rhythms[li - 2].onsets.map((o) => ({ ...o, g: o.g + off })), end: rhythms[li - 2].end + off };
    } else rh = lineRhythm(rng, L, busy, li > 0 && rng.chance(0.4));
    rhythms.push(rh);
    // pitch: each line follows a contour (in scale steps from its anchor): verses recite (hover on one
    // note with neighbours, falling at the end), choruses and bridges arch (up to a peak around the
    // middle, down to a chord note), pre-choruses climb; strong beats snap to the chord note nearest
    // the contour, held notes to one that doesn't rub
    const lift = P.rise * li;
    const anchor = nearestIdx(center + lift + (kind === 'verse' && li % 2 === 1 ? -1 : 0));
    const n = rh.onsets.length;
    const height = kind === 'verse' ? 1 : kind === 'prechorus' ? 3 : rng.pick([3, 4, 4, 5]) - (li % 2 === 1 ? 1 : 0);
    const peakAt = rng.pick([0.35, 0.5, 0.6]);
    const contour = (x: number) => (kind === 'verse' ? (x > 0.7 ? -2 * (x - 0.7) / 0.3 : 0)
      : kind === 'prechorus' ? height * x
        : x <= peakAt ? height * (x / peakAt) : height * (1 - (x - peakAt) / (1 - peakAt)) * 0.8);
    const shape: number[] = [];
    let prev = anchor;
    rh.onsets.forEach((o, oi) => {
      const last = oi === n - 1;
      const len = (last ? rh.end : rh.onsets[oi + 1].g) - o.g;
      const g = o.g;
      let idx: number;
      if (again && shapes[li - 2] && oi < shapes[li - 2].length) idx = anchor + shapes[li - 2][oi];
      else {
        const x = n > 1 ? oi / (n - 1) : 1;
        // the contour, with a neighbour now and then (verses hover around their reciting note)
        const wobble = rng.chance(kind === 'verse' ? 0.35 : 0.2) ? rng.pick([1, -1]) : 0;
        idx = Math.round(anchor + contour(x) + wobble);
        // no leaps bigger than a third without turning back
        if (Math.abs(idx - prev) > 2 && !rng.chance(0.08)) idx = prev + 2 * Math.sign(idx - prev);
      }
      idx = Math.max(0, Math.min(pool.length - 1, idx));
      const want = last || len >= 6 || (o.stress && rng.chance(P.toneStrong));
      if (want && !isTone(pool[idx], g)) {
        for (let d = 1; d < pool.length; d++) {
          const j = [idx - d, idx + d].find((x) => x >= 0 && x < pool.length && isTone(pool[x], g));
          if (j !== undefined) { idx = j; break; }
        }
      }
      if (len >= 4 && rubs(pool[idx], g)) idx = Math.max(0, idx - 1);
      prev = idx;
      shape.push(idx - anchor);
      notes.push({ step: g, len: Math.max(1, len), midi: pool[idx], stress: o.stress, start: oi === 0, line: li });
    });
    shapes.push(shape);
  });
  // nothing before the block or past it, nothing overlapping
  const out = notes.filter((n) => n.step >= 0 && n.step < total).sort((a, b) => a.step - b.step);
  out.forEach((n, i) => { const nx = out[i + 1]; n.len = Math.max(1, Math.min(n.len, (nx?.step ?? total) - n.step)); });
  return { notes: out, lines: lines.length };
}

/** Words for a tune: rhymes on every other line, the chorus hook at the start of lines 1 and 3. */
function writeWords(rng: Rng, tune: Tune, style: LyricStyle, hook: Syllable[] | null, hi: number): Syllable[] {
  const out: Syllable[] = [];
  let rhyme: Rhyme | null = null;
  for (let li = 0; li < tune.lines; li++) {
    const ns = tune.notes.filter((n) => n.line === li);
    if (!ns.length) continue;
    const slots: LyricSlot[] = ns.map((n) => ({ stress: n.stress, long: n.len >= 4, high: n.midi >= hi - 3 }));
    const useHook = hook && li % 2 === 0 ? hook.slice(0, Math.min(hook.length, ns.length - 1)) : undefined;
    const line = lyricLine(rng, slots, style, { rhyme: li % 2 === 1 ? rhyme : null, hook: useHook });
    if (li % 2 === 0) rhyme = rhymeOf(line);
    out.push(...line);
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
  const first = sections.find((s) => s.section?.kind === 'verse') ?? sections[0];
  // the song's anchor: the verse centre, the key's root nearest G3 (the low voice's comfortable middle)
  const key = first.song.key;
  const base = 55 + mod(key - 55 + 6, 12) - 6;
  const blocks = new Map<SectionKind, { tune: Tune; key: number; bars: number; words: Syllable[]; tag: string }>();
  const hookStress = rng.pick([[true, false, true], [true, true], [true, false, true, false], [true, false]]);
  const hook = makeHook(new Rng(`${ctx.seed}-hook-words`), hookStress, style);
  const seen: Partial<Record<SectionKind, number>> = {};
  sections.forEach((idea, si) => {
    const info = idea.section!;
    idea.vocal = [];
    const kind = info.kind;
    if (!SUNG.includes(kind) || info.solo) return;
    const n = (seen[kind] = (seen[kind] ?? 0) + 1);
    // an outro sings the chorus's tune (its last line repeating), unless it's a jam in a new key
    const as: SectionKind = kind === 'outro' ? 'chorus' : kind;
    let b = blocks.get(as);
    if (!b) {
      const src = kind === 'outro' ? (sections.find((s) => s.section?.kind === 'chorus') ?? idea) : idea;
      const tune = writeTune(new Rng(`${ctx.seed}-tune-${as}`), src.song, src.chords, as, base, ctx.genre);
      const words = writeWords(new Rng(`${ctx.seed}-words-${as}`), tune, style, as === 'chorus' ? hook : null, base + 6);
      b = { tune, key: src.song.key, bars: src.song.bars.length, words, tag: as };
      blocks.set(as, b);
    }
    // later verses: the same tune with new words; choruses: word for word
    const words = as === 'verse' && n > 1 ? writeWords(new Rng(`${ctx.seed}-words-verse-${n}`), b.tune, style, null, base + 6) : b.words;
    const shift = mod(idea.song.key - b.key + 6, 12) - 6;
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
        idea.vocal!.push({ step: g, len: Math.min(t.len, total - g), midi: t.midi + shift, vel: t.stress ? 0.85 : 0.75, syl: { ...words[i] }, start: t.start });
      });
    }
    // the climax: its last held note lifted to the song's top
    if (si === climax && idea.vocal.length) {
      const held = [...idea.vocal].reverse().find((v) => v.len >= 4);
      if (held) {
        const tones = chordTones(idea.song.key, idea.chords.timeline[idea.chords.chordIdx[held.step]].chord);
        let m = held.midi + 3;
        while (m < PEAK + 1 && !tones.includes(mod(m, 12))) m++;
        if (m <= PEAK + 1) held.midi = m;
      }
    }
    leaveRoom(idea);
    if (idea.vocal.length) {
      const words = lyricText(idea.vocal);
      idea.notes.push(`Vocal (${VOCAL_DESC[as]}): “${words.length > 140 ? `${words.slice(0, 140)}…` : words}”`);
    }
  });
}

/** A held note stops where Guitar 2's answer starts (the singer breathes, the lead answers). */
function leaveRoom(idea: Idea) {
  const lead = idea.guitar2.filter((h) => !h.letRing && !h.swell).map((h) => h.step);
  for (const n of idea.vocal ?? []) {
    if (n.len < 4) continue;
    const hit = lead.find((g) => g >= n.step + 2 && g < n.step + n.len);
    if (hit !== undefined) n.len = hit - n.step;
  }
}

/** The vocal of a lone idea: the chorus tune and its hook. */
export function singIdea(idea: Idea, seed: string, mood: Mood) {
  const fake = { ...idea, section: { kind: 'chorus' as SectionKind, label: 'Chorus', energy: 4 } };
  singTrack([fake], { seed, mood, genre: idea.song.partGenres.strum }, 0);
  idea.vocal = fake.vocal;
}

/** The voice for a song on Auto: low for heavier genres, either for pop. */
export function autoVoice(seed: string, genre: Genre): VoiceType {
  const high = genre === 'pop' ? 0.5 : genre === 'funk' ? 0.4 : genre === 'rock' ? 0.25 : 0.12;
  return new Rng(`${seed}-voice`).chance(high) ? 'high' : 'low';
}

/** The lyric of a section as text (lines separated by " / "). */
export function lyricText(notes: VocalNote[]): string {
  const lines: VocalNote[][] = [];
  for (const n of notes) {
    if (n.start || !lines.length) lines.push([]);
    lines[lines.length - 1].push(n);
  }
  return lines.map((l) => spell(l.map((n) => n.syl))).join(' / ');
}
