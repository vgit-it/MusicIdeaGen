// Words (docs/STUDY-LAKH.md option 4, docs/WORDS-REAL.md): how real singers set their words, from the Lakh songs
// with timed syllables (karaoke text or lyric events): syllables a second (verse lines, chorus lines), syllables
// stretched over 2+ notes, where syllables start in the beat, lines ending on a soft syllable (a last word of 2+
// syllables), syllables a line, the rest between lines. Numbers only: the words are never kept. Writes
// src/realism/words.json. Run: npm run realism-words
import fs from 'node:fs';
import { type LakhSong, forEachSong } from './lakh-songs';

const root = process.argv[2] ?? 'experiments/MidiCollection';
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const med = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

interface Syl { t: number; word: boolean; line: number; notes: number; end: number }
const D: Record<string, Record<string, number[]>> = {};
const add = (g: string, k: string, v: number) => { for (const x of [g, 'all']) ((D[x] ??= {})[k] ??= []).push(v); };
let withWords = 0, aligned = 0;

forEachSong(root, (S: LakhSong) => {
  if (!S.words) return;
  withWords++;
  // the syllables, their lines and word starts (a syllable after a space, or a line's first)
  const syl: Syl[] = [];
  let line = 0, prevSpace = true, keys: string[] = [], cur = '';
  for (const w of S.words) {
    const raw = w.text;
    if (/^[\\/]/.test(raw)) { if (syl.length && syl[syl.length - 1].line === line) { keys.push(cur); cur = ''; line++; } prevSpace = true; }
    const text = raw.replace(/[\\/\r\n]/g, '');
    if (!text.replace(/[^A-Za-z']/g, '')) { if (/\s/.test(text)) prevSpace = true; continue; }
    syl.push({ t: w.t, word: prevSpace || /^\s/.test(text), line, notes: 0, end: w.t });
    cur += text.toLowerCase().replace(/[^a-z]/g, '');
    prevSpace = /\s$/.test(text);
    if (/[\r\n]\s*$/.test(raw)) { keys.push(cur); cur = ''; line++; prevSpace = true; }
  }
  keys.push(cur);
  if (syl.length < 60) return;
  // each syllable's notes: those starting from it to the next syllable
  let hit = 0;
  syl.forEach((s, i) => {
    const nx = syl[i + 1]?.t ?? s.t + 8;
    const ns = S.mel.filter((n) => n.s >= s.t - 0.13 && n.s < nx - 0.13);
    s.notes = ns.length;
    if (ns.length) { hit++; s.end = ns[ns.length - 1].e; }
  });
  // (words and tune in step: most syllables on a note)
  if (hit / syl.length < 0.75) return;
  aligned++;
  const g = S.genre ?? 'other';
  const sec = 60 / S.bpm;
  const sung = syl.filter((s) => s.notes);
  add(g, 'melisma', sung.filter((s) => s.notes >= 2).length / sung.length);
  // where syllables start in the beat (16ths: on it, "e", "&", "a")
  const pos = sung.map((s) => ((Math.round(s.t * 4) % 4) + 4) % 4);
  add(g, 'onBeat', pos.filter((p) => p === 0).length / pos.length);
  add(g, 'onAnd', pos.filter((p) => p === 2).length / pos.length);
  add(g, 'on16', pos.filter((p) => p % 2 === 1).length / pos.length);
  add(g, 'sylPerWord', sung.length / Math.max(1, sung.filter((s) => s.word).length));
  // lines
  const L = new Map<number, Syl[]>();
  for (const s of syl) (L.get(s.line) ?? L.set(s.line, []).get(s.line)!).push(s);
  const lines = [...L.values()].filter((l) => l.length >= 3);
  if (lines.length < 6) return;
  const count = new Map<string, number>();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  const isCh = (l: Syl[]) => (count.get(keys[l[0].line]) ?? 0) >= 2;
  const rate = (ls: Syl[][]) => { let n = 0, d = 0; for (const l of ls) { const first = l[0].t, end = Math.max(...l.map((s) => s.end)); if (end > first) { n += l.length; d += (end - first) * sec; } } return d ? n / d : 0; };
  const V = lines.filter((l) => !isCh(l)), C = lines.filter(isCh);
  const rv = rate(V.length >= 3 ? V : lines);
  if (rv > 0 && rv < 12) add(g, 'rate', rv);
  if (V.length >= 3 && C.length >= 3) { const rc = rate(C); if (rc > 0 && rv > 0) add(g, 'chorusRate', rc / rv); }
  add(g, 'lineSyl', med(lines.map((l) => l.length)));
  // a line's last word: 2+ syllables (a soft ending, most English words of two stressed on the first)
  const lastWordSyl = (l: Syl[]) => { let k = l.length - 1; while (k > 0 && !l[k].word) k--; return l.length - k; };
  add(g, 'fem', lines.filter((l) => lastWordSyl(l) >= 2).length / lines.length);
  // the rest between lines (beats), and how long a line's last syllable is held (beats)
  const gaps: number[] = [], holds: number[] = [];
  for (let i = 0; i + 1 < lines.length; i++) { const end = Math.max(...lines[i].map((s) => s.end)); gaps.push(lines[i + 1][0].t - end); holds.push(end - lines[i][lines[i].length - 1].t); }
  add(g, 'lineGap', med(gaps)); add(g, 'lastHold', med(holds));
  // the line's syllables on the beats: the share of beats inside a line with a syllable starting on them
  add(g, 'beatsFilled', mean(lines.map((l) => { const a = Math.ceil(l[0].t - 0.1), b = Math.floor(Math.max(...l.map((s) => s.end))); let n = 0, k = 0; for (let x = a; x < b; x++) { k++; if (l.some((s) => Math.abs(s.t - x) < 0.13)) n++; } return k ? n / k : 0; })));
});

const KEYS = ['rate', 'chorusRate', 'melisma', 'onBeat', 'onAnd', 'on16', 'sylPerWord', 'lineSyl', 'fem', 'lineGap', 'lastHold', 'beatsFilled'];
const out: Record<string, Record<string, number>> = {};
console.log({ withWords, aligned });
for (const g of ['all', ...GENRES, 'other']) {
  const d = D[g]; if (!d?.melisma) continue;
  const row: Record<string, number> = { songs: d.melisma.length };
  for (const k of KEYS) if (d[k]?.length) row[k] = Math.round(1000 * med(d[k])) / 1000;
  out[g] = row;
  console.log(g.padEnd(9), JSON.stringify(row));
}
fs.writeFileSync('src/realism/words.json', JSON.stringify({ source: 'Lakh MIDI Dataset (Colin Raffel, CC-BY 4.0): songs with timed syllables in step with the tune; medians per song (rate: syllables a second in verse lines; chorusRate: chorus lines / verse lines; melisma: syllables over 2+ notes; onBeat, onAnd, on16: where syllables start; fem: lines ending on a word of 2+ syllables; lineSyl; lineGap, lastHold: beats; beatsFilled: beats in a line with a syllable on them). Numbers only (docs/WORDS-REAL.md).', genres: out }));
