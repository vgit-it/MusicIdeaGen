// Patterns (docs/PATTERNS.md): which of the library's patterns the app's lines already sing on their own (Patterns
// off), against how many real songs sing them: the vocal writers, and the Guide card's Anchor line apart (it writes
// its own way). Writes src/realism/lean.json: per pattern, how much more often to pick it (a pattern real songs sing
// more than the app does picked more, the app's own plain ones less), so the switch brings what the writers lack.
// Counts only. Run: npm run realism-lean (N songs per genre and writer).
import fs from 'node:fs';
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';
import { RHYTHMS, SHAPES, type QNote, rhythmKeys, shapeKeys } from '../../src/realism/patterns';
import { chordPc } from '../../src/theory';
import { chordTones, MINORISH } from '../../src/parts/guitar2';
import { sungSong, writeLine } from '../../src/guide/real';
import type { GuideIdeas } from '../../src/guide/line';
import data from '../../src/realism/patterns.json';

const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const WRITERS = [{}, { vocalRhythm: 'grid' }, { vocalRhythm: 'words' }, { vocalMelody: 'shaped' }, { vocalMelody: 'first' }, { vocalRhythm: 'grid', vocalMelody: 'first' }];
/** The Anchor line as it's sung: plain, and with its card's switches on (Best of several left out: it only picks). */
const ANCHORS: GuideIdeas[] = [{ anchor: true }, { anchor: true, hook: true, color: true, arc: true, band: true, spine: true, breath: true, leadIn: true }];
const N = Number(process.env.N ?? 8);
/** How far toward the real songs' share: 0 none, 1 all the way (the ratio's power), and the most and least a pick leans. */
const POW = 0.6, MAX = 4, MIN = 0.2;

const rSet = new Set(RHYTHMS.map((r) => r[0])), sSet = new Set(SHAPES.map((r) => r[0]));
type Count = { r: Map<string, number>; s: Map<string, number>; songs: number };
const counts = (): Count => ({ r: new Map(), s: new Map(), songs: 0 });
/** A song's line (16ths) against its chords' roots and notes: which library patterns it sings (once a song, as the library counts). */
function tally(c: Count, qs: QNote[], roots: number[], band: Set<number>[], tonic: number, minor: boolean) {
  c.songs++;
  const rel = (n: QNote) => { const iv = ((n.p - (roots[n.q] ?? 0)) % 12 + 12) % 12; return iv === 0 ? 'R' : iv === 3 || iv === 4 ? '3' : iv === 7 ? '5' : band[n.q]?.has(n.p % 12) ? 'c' : 'n'; };
  for (const k of new Set(rhythmKeys(qs))) if (rSet.has(k)) c.r.set(k, (c.r.get(k) ?? 0) + 1);
  for (const k of new Set(shapeKeys(qs, tonic, minor, rel))) if (sSet.has(k)) c.s.set(k, (c.s.get(k) ?? 0) + 1);
}
const harmony = (secs: any[]) => {
  const roots: number[] = [], band: Set<number>[] = [];
  let off = 0;
  for (const sec of secs) {
    for (let st = 0; st < sec.song.total; st++) { const ch = sec.chords.timeline[sec.chords.chordIdx[st]].chord; roots[off + st] = chordPc(sec.song.key, ch); band[off + st] = new Set(chordTones(sec.song.key, ch)); }
    off += sec.song.total;
  }
  return { roots, band };
};
const seeds = (s: string) => ({ song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });

const vocal = counts(), anchor = counts();
for (const g of GENRES) for (let i = 0; i < N; i++) {
  const s = `lean-${g}-${i}`;
  for (const w of WRITERS) {
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...w } as Parameters<typeof generate>[0], seeds(s));
    const tr = buildTrack(idea, defaultTrackOptions(idea)) as any;
    const secs = tr.sections ?? tr;
    if (secs[0].song.bars.some((b: any) => b.len !== 16)) continue;
    const qs: QNote[] = [];
    let off = 0;
    for (const sec of secs) {
      for (const n of (sec.vocal ?? []).filter((x: any) => !x.role && x.syl?.text !== '~')) qs.push({ q: off + n.step, e: off + n.step + n.len, p: n.midi });
      off += sec.song.total;
    }
    const { roots, band } = harmony(secs), first = secs[0].song;
    tally(vocal, qs, roots, band, first.key % 12, MINORISH.includes(first.mode));
  }
  // the Anchor line, as the lab hears it (its words sung)
  const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], seeds(s));
  const tr = buildTrack(idea, defaultTrackOptions(idea));
  if (tr.sections[0].song.bars.some((b) => b.len !== 16)) continue;
  const { roots, band } = harmony(tr.sections);
  for (const ideas of ANCHORS) {
    const sg = sungSong(tr.sections, writeLine(tr.sections, tr.mood, 'in', 0, 'some', null, ideas, null, null), 0);
    tally(anchor, sg.notes.map((n) => ({ q: Math.round(n.s * 4), e: n.e * 4, p: n.p })), roots, band, sg.tonic, sg.minor);
  }
}
const realSongs = Number(/(\d+) on-grid/.exec(data.source)?.[1] ?? 1159);
const lean = (rows: typeof RHYTHMS, app: Map<string, number>, songs: number) => {
  const out: Record<string, number> = {};
  for (const [k, n] of rows) {
    const real = n / realSongs, mine = ((app.get(k) ?? 0) + 0.5) / (songs + 1);
    const x = Math.round(100 * Math.max(MIN, Math.min(MAX, (real / mine) ** POW))) / 100;
    if (x !== 1) out[k] = x;
  }
  return out;
};
const L = {
  rhythm: lean(RHYTHMS, vocal.r, vocal.songs), shape: lean(SHAPES, vocal.s, vocal.songs),
  anchorRhythm: lean(RHYTHMS, anchor.r, anchor.songs), anchorShape: lean(SHAPES, anchor.s, anchor.songs),
};
fs.writeFileSync('src/realism/lean.json', JSON.stringify({ source: `The app's own lines (Patterns off: ${vocal.songs} vocal lines, ${anchor.songs} Anchor lines) against the library's real song counts: a pattern's pick leans by (real share / the app's share)^${POW}, ${MIN}-${MAX} (docs/PATTERNS.md).`, ...L }));
const top = (o: Record<string, number>, d: 1 | -1) => Object.entries(o).sort((a, b) => d * (b[1] - a[1])).slice(0, 8).map(([k, v]) => `${k} x${v}`).join('  ');
console.log({ vocal: vocal.songs, anchor: anchor.songs });
for (const [k, o] of Object.entries(L)) { console.log(`${k} up:  `, top(o, 1)); console.log(`${k} down:`, top(o, -1)); }
