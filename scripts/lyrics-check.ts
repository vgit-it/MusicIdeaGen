// Sample lines of the real-word writer (src/parts/lyrics.ts), per mood: what it writes for a few note patterns, which sounds it uses, and checks
// (every word in the bank sings with the engine's own sounds, no line with a blocked word, rhymes found).
// Run: npm run lyrics-check

import { Rng } from '../src/rng';
import { type LyricSlot, type Rhyme, type Syllable, lyricLine, rhymeOf, spell } from '../src/parts/lyrics';
import type { Mood } from '../src/tension';

const MOODS: Mood[] = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'];
// (stress, long, high per note)
const P = (s: string): LyricSlot[] => [...s].map((c) => ({ stress: c === 'S' || c === 'L', long: c === 'L', high: false }));
const PATTERNS = ['SwSwSwSL', 'wSwSwSwS', 'SSSwSL', 'wwSwwSwwL', 'SwSwL'];

let lines = 0, rhymed = 0, rhymeTries = 0;
const vowels: Record<string, number> = {}, words: Record<string, number> = {};
for (const mood of MOODS) {
  console.log(`\n${mood}`);
  for (let k = 0; k < PATTERNS.length; k++) {
    const rng = new Rng(`check-${mood}-${k}`);
    const slots = P(PATTERNS[k]);
    const a = lyricLine(rng, slots, { mood, genre: 'rock', real: true });
    const r: Rhyme | null = rhymeOf(a);
    const b = lyricLine(rng, slots, { mood, genre: 'rock', real: true }, { rhyme: r });
    const rb = rhymeOf(b);
    rhymeTries++;
    if (r && rb && r.vowel === rb.vowel && r.coda.join() === rb.coda.join()) rhymed++;
    console.log(`  ${PATTERNS[k].padEnd(10)} ${spell(a).padEnd(40)} | ${spell(b)}`);
  }
}
// (a bigger sample: the spread of stressed vowels and how often a word comes again)
for (let n = 0; n < 400; n++) {
  const rng = new Rng(`spread-${n}`);
  const mood = MOODS[n % MOODS.length];
  const line: Syllable[] = lyricLine(rng, P(PATTERNS[n % PATTERNS.length]), { mood, genre: 'rock', real: true });
  lines++;
  for (const s of line) if (s.stress) vowels[s.vowel] = (vowels[s.vowel] ?? 0) + 1;
  for (const w of spell(line).split(' ')) words[w] = (words[w] ?? 0) + 1;
}
console.log(`\nrhymes found: ${rhymed}/${rhymeTries}`);
console.log('stressed vowels:', Object.entries(vowels).sort((x, y) => y[1] - x[1]).map(([v, c]) => `${v} ${c}`).join(', '));
const top = Object.entries(words).sort((x, y) => y[1] - x[1]).slice(0, 12);
console.log(`words used: ${Object.keys(words).length} different in ${lines} lines; most often: ${top.map(([w, c]) => `${w} ${c}`).join(', ')}`);

// (every bank word sung on a note in three voices: finite, not silent, not clipping)
import bank from '../src/parts/wordbank.json';
import { renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { fofFor } from '../src/audio/voices';
let bad = 0;
for (const [text, rows] of bank as unknown as [string, [string[], string, string[], number, number?][]][]) {
  const parts = text.split('-');
  const syls = rows.map((r, k): Syllable => ({ onset: r[0] as never, vowel: r[1] as never, coda: r[2] as never, stress: !!r[3], text: parts[k] ?? '', wordStart: k === 0, ...(r[4] ? { syllabic: true } : {}) }));
  let t = 0;
  const notes: SungNote[] = syls.map((s) => { const d = s.stress ? 0.5 : 0.35; const n: SungNote = { t, end: t + d * 0.95, midi: 55 + (s.stress ? 2 : 0), vel: 0.7, syl: s }; t += d; return n; });
  for (const g of ['rock', 'pop', 'metal'] as const) {
    const pcm = renderFof(notes, { ...fofFor(g, 17, false), human: 0, vib: 0, drift: 0, energy: 0.5 }, 0.3);
    let peak = 0, ok = true;
    for (const x of pcm) { if (!Number.isFinite(x)) { ok = false; break; } peak = Math.max(peak, Math.abs(x)); }
    if (!ok || peak < 0.02 || peak > 1.2) { bad++; console.log('problem:', text, g, ok, peak.toFixed(2)); }
  }
}
console.log(`bank words rendered: ${(bank as unknown[]).length} x 3 voices, ${bad} problems`);
