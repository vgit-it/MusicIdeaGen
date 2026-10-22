// Use the space (rule 38): checks the rule on made-up lines in several meters, then counts what it does over many songs
// (switch on against off), and how the notes of 3/4 bar or more bend.
//   npm run space-check            (N=120 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { Rng } from '../src/rng';
import { BarGrid, type BarSpec } from '../src/verse/grid';
import { shortLen } from '../src/verse/longer';
import { withSpace } from '../src/verse/space';
import { barOf } from '../src/verse/section';
import { songOptions, writeSong } from '../src/verse/sing';
import { fifth, third, type BandNote } from '../src/verse/verse';
import type { Chord } from '../src/theory';

const bad: string[] = [];
const fail = (m: string) => { bad.push(m); if (bad.length < 12) console.log('FAIL', m); };

// 1. made-up lines: only the length of a note grows, to a beat or half beat, a beat before the next note, over no chord change
const bars = (len: number, groups: number[], n: number): BarSpec[] => Array.from({ length: n }, (_, i) => ({ start: i * len, len, groups }));
const GRIDS: [string, BarGrid][] = [['4/4', new BarGrid(16)], ['6/8', new BarGrid(12, bars(12, [6, 6], 16))], ['7/8', new BarGrid(14, bars(14, [4, 4, 6], 16))], ['3/4', new BarGrid(12, bars(12, [4, 4, 4], 16))]];
let lines = 0, grown = 0, shortGrown = 0, endGrown = 0;
for (const [name, G] of GRIDS) {
  for (let t = 0; t < 400; t++) {
    const rng = new Rng(`space-${name}-${t}`), len = Math.round(G.bar * 4);
    const notes: BandNote[] = [];
    for (let s = 0; s < len - 2;) {
      s += rng.chance(0.3) ? rng.int(2, 26) : 0;
      if (s >= len - 2) break;
      const l = rng.weighted([[2, 6], [1, 1], [4, 2], [6, 1], [8, 1]] as const);
      const end = rng.chance(0.15);
      notes.push({ step: s, len: l, midi: 60, ...(end ? { end: true, style: rng.pick(['held', 'open', 'hang', 'sync', 'punch'] as const) } : {}), ...(rng.chance(0.05) ? { nb: true } : {}), ...(rng.chance(0.05) ? { longHold: true } : {}) });
      s += l;
    }
    // (chords: a change at a few steps, among a few roots and qualities)
    const cuts = [0, ...Array.from({ length: rng.int(0, 3) }, () => rng.int(1, len - 1))].sort((x, y) => x - y);
    const chordAt: Chord[] = Array.from({ length: len }, (_, s) => { const k = cuts.filter((c) => c <= s).length - 1; return { root: [0, 5, 7, 9][(k * 7 + t) % 4], q: (k + t) % 2 ? 'min' : 'maj' } as Chord; });
    const KEY = 0;
    const final = rng.chance(0.5), repeat = rng.int(0, 2);
    const out = withSpace(notes, G, len, KEY, chordAt, `s${t}`, { repeat, final });
    lines++;
    if (out.length !== notes.length) { fail(`${name} #${t}: ${notes.length} notes became ${out.length}`); continue; }
    out.forEach((n, i) => {
      const a = notes[i], nx = out[i + 1], e = n.step + n.len;
      if (n.step !== a.step || n.midi !== a.midi) fail(`${name} #${t}: a note moved`);
      if (n.len < a.len - 1e-9) fail(`${name} #${t}: a note got shorter`);
      if (nx && e > nx.step + 1e-9) fail(`${name} #${t}: overlaps the next note`);
      if (n.len <= a.len + 1e-9) return;
      grown++; if (a.end) endGrown++; else shortGrown++;
      const gap = (nx ? nx.step : len) - (a.step + a.len);
      if (gap < 0.75 * G.bar - 1e-9) fail(`${name} #${t}: grew into a gap of only ${gap}`);
      if (a.end ? a.style === 'punch' : a.len > shortLen(G) + 1e-9) fail(`${name} #${t}: grew a note that should stay (${a.len} ${a.style})`);
      if (a.third || a.lead || a.opener || a.longHold || a.nb) fail(`${name} #${t}: grew a flagged note`);
      if (n.len > G.bar + 1e-9) fail(`${name} #${t}: over a bar long (${n.len})`);
      if (nx && nx.step - e < G.beat - 1e-9) fail(`${name} #${t}: leaves ${nx.step - e} before the next note`);
      if (!nx && final && len - e < G.beat - 1e-9) fail(`${name} #${t}: leaves ${len - e} at the end`);
      if (!G.isBeat(e) && !G.beatSteps(Math.floor(e) - 12, Math.ceil(e) + 12).some((b, k, arr) => k + 1 < arr.length && Math.abs(Math.round((b + arr[k + 1]) / 2) - e) < 1e-9)) fail(`${name} #${t}: ends on ${e}, not a beat or half beat`);
      for (let st = Math.floor(a.step + a.len + 1e-9); st < e - 1e-9; st++) {
        const c = chordAt[st], h = chordAt[Math.floor(a.step + 1e-9)];
        if ((c.root !== h.root || c.q !== h.q) && ![0, third(c), fifth(c)].some((x) => (KEY + c.root + x) % 12 === 0)) fail(`${name} #${t}: grew over a chord change that doesn't hold its pitch`);
      }
      if (a.end ? n.len - a.len < G.beat / 2 - 1e-9 : n.len < G.beat - 1e-9) fail(`${name} #${t}: grew by too little (${a.len} to ${n.len})`);
    });
  }
}
console.log(`made-up lines: ${lines}; notes that grew ${grown} (${shortGrown} short, ${endGrown} held endings)`);

// 2. real songs, with the switch off and on
const N = Number(process.env.N ?? 120);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
interface Tot { notes: number; shortGap: number; endGap: number; long: number; bent: number; twice: number; keep: number; keepBent: number; closing: number[]; closingFirst: number[]; heldLen: number; held: number }
const blank = (): Tot => ({ notes: 0, shortGap: 0, endGap: 0, long: 0, bent: 0, twice: 0, keep: 0, keepBent: 0, closing: [], closingFirst: [], heldLen: 0, held: 0 });
const T = { off: blank(), on: blank() };
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `hh-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  for (const mode of ['off', 'on'] as const) {
    const song = writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS.filter((x) => mode === 'on' || x !== 'space')), climax: list[0] } as never));
    const t = T[mode];
    for (const sec of list) {
      const v = song.get(sec); if (!v) continue;
      const bar = barOf(sec), lim = shortLen(bar) + 1e-9, notes = v.built.notes;
      notes.forEach((n, k) => {
        t.notes++;
        const nx = notes[k + 1], gap = nx ? nx.step - (n.step + n.len) : undefined;
        if (nx && n.step + n.len > nx.step + 1e-9) fail(`${s} ${sec.section?.kind}: overlap at ${n.step}`);
        if (gap !== undefined && gap >= 0.75 * bar) { if (n.len <= lim && !n.end) t.shortGap++; if (n.end) t.endGap++; }
        if (n.end) { t.held++; t.heldLen += n.len; }
        if (n.len >= 0.75 * bar - 1e-9 && !n.longHold) {
          t.long++; if (n.bendTo !== undefined) { t.bent++; if (n.more?.length) t.twice++; }
          if (n.endRole === 'home' || n.endRole === 'hang') {
            t.keep++;
            if (n.bendTo !== undefined) {
              // (a delayed resolution starts off the note and lands on it; a bend and back returns to it: either way the end keeps its degree)
              t.keepBent++;
              const last = n.more?.[n.more.length - 1];
              if (!/suspension/.test(n.inner ?? '') && (!last || last.to !== n.midi)) fail(`${s} ${sec.section?.kind}: a ${n.endRole} end bent away and didn't come back (${n.step})`);
            }
          }
        }
      });
      if (bar === 16) for (const lf of v.built.leaves) {
        const last = [...notes].reverse().find((n) => n.step >= lf.from * bar && n.step < (lf.from + lf.bars) * bar);
        if (last?.end) (lf.source === null ? t.closingFirst : t.closing).push(last.len);
      }
    }
  }
}
const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(0) : '-') + '%';
const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
for (const m of ['off', 'on'] as const) {
  const t = T[m];
  console.log(`switch ${m}: short notes with a 3/4-bar gap after ${t.shortGap}; held endings with one ${t.endGap}; mean held ending ${mean([t.heldLen / Math.max(1, t.held)])} steps`);
  console.log(`   notes of 3/4 bar or more (not long holds) ${t.long}: bent ${pct(t.bent, t.long)}, there and back ${pct(t.twice, t.long)}; home/hang ends ${t.keep}: bent and back ${pct(t.keepBent, t.keep)}`);
  console.log(`   the ending of a leaf: first time ${t.closingFirst.length} (mean ${mean(t.closingFirst)} steps), repeated ${t.closing.length} (mean ${mean(t.closing)} steps)`);
}
if (bad.length) { console.log(`${bad.length} problems`); process.exit(1); }
console.log('all checks passed');
