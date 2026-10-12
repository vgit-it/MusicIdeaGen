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
import type { Mood } from '../tension';
import { chordTones } from './guitar2';
import type { Timbre } from './singers';
import { PEAK, type Tune, type TuneNote, followTension, melodyDesc, melodyStyle, writeTune } from './melody';
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
  /** Backing vocals: a harmony line, the gang in unison, a held "ooh", an ad-lib (the lead has none). */
  role?: 'harmony' | 'gang' | 'ooh' | 'adlib';
  /** Scooped up into from so many semitones below; falling off its end by so many; a wail (sung full out). */
  slide?: number;
  fall?: number;
  belt?: boolean;
}

export type VoiceType = 'low' | 'high';

const TIMBRE_DESC = (t: Timbre) => (t === 'clear' ? 'the clear voice' : `the ${GENRE_LABEL[t].toLowerCase()} voice (three registers mixed by pitch, sung lower)`);

/**
 * Which notes carry on the syllable before rather than start a new one: tied notes (a sigh or a turn),
 * and a quick weak note (a 16th after a syllable): the words come at most about every 8th note, the
 * quick notes between sung on the vowel (Paul: a slower pace of speaking sounds more natural).
 */
function carried(tune: Tune): boolean[] {
  let lastStep = -99, lastLine = -1;
  return tune.notes.map((n) => {
    if (n.tie) return true;
    if (!n.stress && n.line === lastLine && n.step - lastStep < 2) return true;
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
    if (n.step - sylStep >= 4 && n.len >= 2 && n.tie) { out.push({ ...n }); return; }
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
    const canPush = n.stress && n.step % 4 === 0 && prev && n.step - prev.step >= 4;
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

/** A tune as sung: settled (no quick turns), spoken (speech rhythm), with room to breathe. */
function shape(tune: Tune, rng: Rng, syncop: number): Tune {
  const t = onEighths(speak(settle(tune), rng, syncop));
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
function breathe(notes: { step: number; len: number; start?: boolean }[]) {
  notes.forEach((n, i) => {
    const nx = notes[i + 1];
    if (!nx) return;
    const gap = nx.step - (n.step + n.len);
    // (a new line stops and starts the voice whatever the gap: it gets its beat too, or is sung through)
    if (gap >= 4 || (gap < 2 && !nx.start)) return;
    if (nx.step - 4 - n.step >= 2) n.len = nx.step - 4 - n.step;
    else { n.len = nx.step - n.step; if (nx.start) nx.start = false; }
  });
}

/**
 * Words for a tune: rhymes on every other line, the chorus hook at the start of lines 1 and 3. A carried
 * note carries on the last syllable's vowel, its closing consonants moved to the end.
 */
function writeWords(rng: Rng, tune: Tune, style: LyricStyle, hook: Syllable[] | null, hi: number): Syllable[] {
  const sung: Syllable[] = [];
  let rhyme: Rhyme | null = null;
  const tied = carried(tune);
  for (let li = 0; li < tune.lines; li++) {
    const ns = tune.notes.filter((n, i) => n.line === li && !tied[i]);
    if (!ns.length) continue;
    const slots: LyricSlot[] = ns.map((n) => ({ stress: n.stress, long: n.len >= 4, high: n.midi >= hi - 3 }));
    const useHook = hook && li % 2 === 0 ? hook.slice(0, Math.min(hook.length, ns.length - 1)) : undefined;
    const line = lyricLine(rng, slots, style, { rhyme: li % 2 === 1 ? rhyme : null, hook: useHook });
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
  const melody = melodyStyle(ctx.seed, ctx.mood, ctx.genre);
  const first = sections.find((s) => s.section?.kind === 'verse') ?? sections[0];
  // the song's anchor: the verse centre, the key's root nearest G3 (the low voice's comfortable middle)
  const key = first.song.key;
  const base = 55 + mod(key - 55 + 6, 12) - 6;
  const blocks = new Map<SectionKind, { tune: Tune; key: number; bars: number; words: Syllable[]; tag: string; ref: number }>();
  const hookStress = rng.pick([[true, false, true], [true, true], [true, false, true, false], [true, false]]);
  const hook = makeHook(new Rng(`${ctx.seed}-hook-words`), hookStress, style);
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
      const tune = shape(writeTune(new Rng(`${ctx.seed}-tune-${as}`), src.song, src.chords, as, base, ctx.genre, melody), new Rng(`${ctx.seed}-speak-${as}`), melody.singer.syncop);
      const words = writeWords(new Rng(`${ctx.seed}-words-${as}`), tune, style, as === 'chorus' ? hook : null, base + 6);
      const t = idea.section?.tension ?? [];
      b = { tune, key: src.song.key, bars: src.song.bars.length, words, tag: as, ref: t.length ? t.reduce((x, y) => x + y, 0) / t.length : 0.5 };
      blocks.set(as, b);
    }
    // later verses: the same tune with new words; choruses: word for word
    const words = as === 'verse' && n > 1 ? writeWords(new Rng(`${ctx.seed}-words-verse-${n}`), b.tune, style, null, base + 6) : b.words;
    let shift = mod(idea.song.key - b.key + 6, 12) - 6;
    // (a key change that would take the tune out of reach: sung an octave down)
    if (Math.max(...b.tune.notes.map((x) => x.midi)) + shift > PEAK + 2) shift -= 12;
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
        idea.vocal!.push({ step: g, len: Math.min(t.len, total - g), midi: t.midi + shift, vel: t.belt ? 0.95 : t.stress ? 0.85 : 0.75, syl: { ...words[i] }, start: t.start, slide: t.slide, fall: t.fall, belt: t.belt });
      });
    }
    // the tune follows the tension curve, line by line: reaching up as the song builds, settling as it lets go
    const moved = followTension(idea, b.ref, ctx.mood, melody, new Rng(`${ctx.seed}-follow-${si}`));
    // the climax: its last held note lifted to the song's top
    if (si === climax && idea.vocal.length) {
      const v = idea.vocal;
      const held = [...v].reverse().find((x, k) => x.len >= 4 && x.syl.text !== '~' && v[v.length - k]?.syl.text !== '~');
      if (held) {
        const tones = chordTones(idea.song.key, idea.chords.timeline[idea.chords.chordIdx[held.step]].chord);
        const top = PEAK + 1 + melody.top;
        let m = held.midi + 3;
        while (m < top && !tones.includes(mod(m, 12))) m++;
        if (m <= top) { held.midi = m; held.belt = true; held.vel = 0.95; }
      }
    }
    leaveRoom(idea);
    breathe(idea.vocal);
    if (idea.vocal.length) {
      const words = lyricText(idea.vocal);
      if (!told) { idea.notes.push(`Singer: ${melody.singer.desc}; ${TIMBRE_DESC(melody.timbre)}`, `Melody: ${melodyDesc(melody)}`); told = true; }
      idea.notes.push(`Vocal (${VOCAL_DESC[as]}): “${words.length > 140 ? `${words.slice(0, 140)}…` : words}”`);
      const bits = [moved.up && `${moved.up} up`, moved.down && `${moved.down} down`, moved.turns && `${moved.turns === 1 ? 'a turn' : `${moved.turns} turns`}`].filter(Boolean);
      if (bits.length) idea.notes.push(`Vocal follows the tension: ${moved.up ? 'reaching up' : 'settling down'} (notes moved ${bits.join(', ')})`);
    }
  });
}

/** A held note stops where Guitar 2's answer starts (the singer breathes, the lead answers; a full beat's room, breathe()); a wail holds on. */
function leaveRoom(idea: Idea) {
  const lead = idea.guitar2.filter((h) => !h.letRing && !h.swell).map((h) => h.step);
  for (const n of idea.vocal ?? []) {
    if (n.len < 4 || n.belt) continue;
    const hit = lead.find((g) => g >= n.step + 2 && g < n.step + n.len);
    if (hit !== undefined) n.len = hit - n.step;
  }
}

/** The vocal of a lone idea: the chorus tune and its hook. */
export function singIdea(idea: Idea, seed: string, mood: Mood) {
  const fake = { ...idea, section: { kind: 'chorus' as SectionKind, label: 'Chorus', energy: 4 } };
  singTrack([fake], { seed, mood, genre: idea.song.partGenres.strum }, 0);
  arrangeBacking([fake], { seed, backing: pickBacking(seed, mood, idea.song.partGenres.strum), mood }, -1);
  idea.vocal = fake.vocal;
  idea.vocalTimbre = fake.vocalTimbre;
  idea.backing = fake.backing;
  idea.vocalDouble = fake.vocalDouble;
}

/** The voice for a song on Auto: low for heavier genres, either for pop. */
export function autoVoice(seed: string, genre: Genre): VoiceType {
  const high = genre === 'pop' ? 0.5 : genre === 'funk' ? 0.4 : genre === 'rock' ? 0.25 : 0.12;
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
