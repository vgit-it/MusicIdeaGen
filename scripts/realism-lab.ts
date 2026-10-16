// The realism lab (docs/REALISM.md): the vocal lines of each melody writer scored against real songs of
// the same genre (src/realism/targets.json, from the Lakh MIDI collection: numbers only). For each
// writer and genre: a realism score (100: the same spreads as real songs) and the biggest gaps.
// Run: npm run realism-lab   (N songs per genre, default 6; MODE: one writer, e.g. MODE=first;
// REAL=1: with the "Real songs" switch; REAL=both: before and after side by side; PAT=1 / PAT=both: the same for
// the "Patterns" switch (docs/PATTERNS.md), with copy-guard hits on the finished lines; DETAIL=1: every measure)
import fs from 'node:fs';
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { chordTones } from '../src/parts/guitar2';
import { MINORISH } from '../src/parts/guitar2';
import type { GuideIdeas } from '../src/guide/line';
import { sungSong, writeLine } from '../src/guide/real';
import { guardRewrites } from '../src/parts/vocal';
import { PATTERN_COVERAGE, type QNote, RHYTHMS, SHAPES, copiesReal, leanOf, rhythmKeys, shapeKeys } from '../src/realism/patterns';
import { chordPc } from '../src/theory';
import { SKEL_COVERAGE, SKEL_SHAPES, TIMINGS, skelLean, skeleton, skeletonShapes, timingKeys } from '../src/realism/skeleton';
import targets from '../src/realism/targets.json';
import arcData from '../src/realism/arc.json';
import wordsData from '../src/realism/words.json';
import { HISTS, HIST_LABEL, type Profile, type RNote, type RSong, type SongMeasure, gaps, measureSong, profile } from '../src/realism/measure';

const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const N = Number(process.env.N ?? 6);
const WRITERS = [
  ['classic', {}], ['grid', { vocalRhythm: 'grid' }], ['words', { vocalRhythm: 'words' }],
  ['shaped', { vocalMelody: 'shaped' }], ['grid+shaped', { vocalRhythm: 'grid', vocalMelody: 'shaped' }], ['words+shaped', { vocalRhythm: 'words', vocalMelody: 'shaped' }],
  ['first', { vocalMelody: 'first' }], ['grid+first', { vocalRhythm: 'grid', vocalMelody: 'first' }], ['words+first', { vocalRhythm: 'words', vocalMelody: 'first' }],
  ['learned', { vocalMelody: 'learned' }], ['grid+learned', { vocalRhythm: 'grid', vocalMelody: 'learned' }], ['words+learned', { vocalRhythm: 'words', vocalMelody: 'learned' }],
  // the Guide line card's writers (src/guide/): quick notes Some (the card's default), leaning in
  ['guide', { guide: {} }], ['guide all on', { guide: { motif: true, spine: true, speech: true, qa: true, breath: true, shift: true, leadIn: true } }],
  ['anchor', { guide: { anchor: true } }], ['anchor all on', { guide: { anchor: true, hook: true, color: true, best: true, arc: true, band: true, spine: true, breath: true, leadIn: true } }],
] as const;
const T = targets as unknown as Record<string, Profile>;

/** A generated track's lead vocal as one line in beats, the band's chord notes and bass under it. */
/** Finished lines (a section's lead vocal) that still match a real 2-bar stretch (Patterns: the copy guard's misses). */
let copies = 0, sectionsSung = 0, exactCopies = 0;
/** The exact real fingerprints (written by npm run realism-patterns, local only), for true copies; the guard's own hits include its false alarms. */
const exact: Set<string> | null = (() => { try { return new Set(JSON.parse(fs.readFileSync('node_modules/.cache/lakh-windows.json', 'utf8'))); } catch { return null; } })();
/** Patterns coverage: the app's bars and 4-note shapes that are in the library (real songs' own coverage: patterns.json). */
const cov = { r: 0, rN: 0, s: 0, sN: 0, rx: 0, sx: 0 };
/** The patterns the writers sing less than real songs do (lean.json: picked 1.5x or more; the Anchor line's own): what Patterns adds. */
const RARE = 1.5;
const R_SET = new Set(RHYTHMS.map((r) => r[0])), S_SET = new Set(SHAPES.map((r) => r[0]));
/** The Guide line's slow line (src/realism/skeleton.ts): 2-bar timings and 4-note shapes in the skeleton library, and the ones it lacks (skeleton-lean.json 1.5x or more). */
const skel = { t: 0, tN: 0, s: 0, sN: 0, tx: 0, sx: 0 };
const T_SET = new Set(TIMINGS.map((r) => r[0])), SK_SET = new Set(SKEL_SHAPES.map((r) => r[0]));
/** About how much of real songs' own slow line is the patterns the Guide line lacks (the library's coverage times their share of it). */
const realLack = (rows: typeof TIMINGS, kind: 'timing' | 'shape', cover: number) => { const rs = kind === 'shape' ? rows.filter((r) => r[0].split(',').length === 3) : rows; const all = rs.reduce((x, r) => x + r[1], 0); return (cover * rs.filter((r) => skelLean(kind, r[0]) >= RARE).reduce((x, r) => x + r[1], 0)) / Math.max(1, all); };
const REAL_LACK = { t: realLack(TIMINGS, 'timing', SKEL_COVERAGE.timing), s: realLack(SKEL_SHAPES, 'shape', SKEL_COVERAGE.shape4) };
function skelCoverage(qs: QNote[], song: RSong, rel: (n: QNote) => string) {
  const sk = skeleton(qs);
  for (const k of timingKeys(sk)) { skel.tN++; if (T_SET.has(k)) { skel.t++; if (skelLean('timing', k) >= RARE) skel.tx++; } }
  for (const k of skeletonShapes(sk, song.tonic, song.minor, rel).filter((x) => x.split(',').length === 3)) { skel.sN++; if (SK_SET.has(k)) { skel.s++; if (skelLean('shape', k) >= RARE) skel.sx++; } }
}
function coverage(sections: any[], song: RSong, anchor = false, guide = false) {
  const roots: number[] = [];
  for (const sec of sections) for (let st = 0; st < sec.song.total; st++) roots.push(chordPc(sec.song.key, sec.chords.timeline[sec.chords.chordIdx[st]].chord));
  const qs: QNote[] = song.notes.map((n) => ({ q: Math.round(n.s * 4), e: n.e * 4, p: n.p }));
  const rel = (n: QNote) => { const iv = ((n.p - (roots[n.q] ?? 0)) % 12 + 12) % 12; return iv === 0 ? 'R' : iv === 3 || iv === 4 ? '3' : iv === 7 ? '5' : song.bandAt(n.q / 4).has(n.p % 12) ? 'c' : 'n'; };
  for (const k of rhythmKeys(qs)) { cov.rN++; if (R_SET.has(k)) { cov.r++; if (leanOf(anchor ? 'anchorRhythm' : 'rhythm', k) >= RARE) cov.rx++; } }
  for (const k of shapeKeys(qs, song.tonic, song.minor, rel, [4])) { cov.sN++; if (S_SET.has(k)) { cov.s++; if (leanOf(anchor ? 'anchorShape' : 'shape', k) >= RARE) cov.sx++; } }
  if (guide) skelCoverage(qs, song, rel);
}
/** Verse vs chorus (docs/ARC.md): per song, the chorus's notes against the verse's (height in semitones, notes a beat, note length), as arc.json measures real songs. */
const arcs: { height: number[]; pace: number[]; len: number[] } = { height: [], pace: [], len: [] };
function arcOf(byKind: Record<string, { s: number; e: number; p: number }[]>) {
  const m = (ns: { s: number; e: number; p: number }[]) => {
    let beats = 0, st = 0;
    for (let i = 1; i <= ns.length; i++) if (i === ns.length || ns[i].s - ns[i - 1].e >= 1) { beats += ns[i - 1].e - ns[st].s; st = i; }
    return { mean: ns.reduce((a, n) => a + n.p, 0) / ns.length, pace: ns.length / Math.max(1, beats), len: ns.reduce((a, n) => a + n.e - n.s, 0) / ns.length };
  };
  const c = byKind.chorus, v = byKind.verse;
  if (!c || !v || c.length < 12 || v.length < 12) return;
  const a = m(c), b = m(v);
  arcs.height.push(a.mean - b.mean); arcs.pace.push(a.pace / b.pace); arcs.len.push(a.len / b.len);
}
/** Words (docs/WORDS-REAL.md): per song, as words.json measures real songs: syllables a second in verse lines, chorus / verse, syllables over 2+ notes, on a 16th, lines ending on a word of 2+ syllables, syllables a line. */
const wordsM: Record<string, number[]> = {};
function wordsOf(secs: any[]) {
  const per: Record<string, { n: number; d: number }> = {};
  let mel = 0, n16 = 0, sylN = 0, fem = 0, lines = 0;
  const lineSyl: number[] = [];
  for (const sec of secs) {
    const kind = sec.section?.kind, sec16 = 15 / sec.song.bpm;
    const lead = (sec.vocal ?? []).filter((x: any) => !x.role);
    let L: any[] = [];
    const close = () => {
      const syl = L.filter((x) => x.syl?.text !== '~');
      if (syl.length >= 3) {
        lines++; lineSyl.push(syl.length);
        let k = syl.length - 1; while (k > 0 && !syl[k].syl.wordStart) k--;
        if (syl.length - k >= 2) fem++;
        if (kind === 'verse' || kind === 'chorus') { const e = (per[kind] ??= { n: 0, d: 0 }); e.n += syl.length; e.d += (L[L.length - 1].step + L[L.length - 1].len - L[0].step) * sec16; }
      }
      L = [];
    };
    lead.forEach((x: any, i: number) => {
      const p = lead[i - 1];
      if (p && (x.step - (p.step + p.len) >= 4 || (x.start && x.syl?.text !== '~'))) close();
      L.push(x);
      if (x.syl?.text === '~') return;
      sylN++;
      if (lead[i + 1]?.syl?.text === '~') mel++;
      if (x.step % 2 === 1) n16++;
    });
    close();
  }
  if (!sylN || !lines) return;
  const add = (k: string, v: number) => (wordsM[k] ??= []).push(v);
  if (per.verse?.d) add('rate', per.verse.n / per.verse.d);
  if (per.verse?.d && per.chorus?.d) add('chorusRate', per.chorus.n / per.chorus.d / (per.verse.n / per.verse.d));
  add('melisma', mel / sylN); add('on16', n16 / sylN); add('fem', fem / lines); add('lineSyl', medOf(lineSyl));
}
const medOf = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; };
const q = (xs: number[], f: number) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length * f)] ?? 0; };
function measureTrack(g: Genre, i: number, extra: { guide?: GuideIdeas; vocalReal?: boolean; vocalPatterns?: boolean }): SongMeasure {
  const s = `${g}-${i}`;
  if (extra.guide) {
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, defaultTrackOptions(idea));
    const line = writeLine(tr.sections, tr.mood, 'in', 0, 'some', null, { ...extra.guide, ...(extra.vocalReal ? { real: true } : {}), ...(extra.vocalPatterns ? { patterns: true } : {}) }, null, null);
    const sg = sungSong(tr.sections, line, 0);
    coverage(tr.sections, sg, !!extra.guide.anchor, !extra.guide.anchor);
    // (the copy guard on the whole line, as sung)
    const steps = sg.notes.map((n) => ({ step: n.s * 4, midi: n.p }));
    sectionsSung++;
    if (copiesReal(steps)) copies++;
    if (exact && copiesReal(steps, 16, (x) => exact.has(x))) exactCopies++;
    {
      const byK: Record<string, { s: number; e: number; p: number }[]> = {};
      let o = 0;
      const spans = tr.sections.map((x) => { const r = [o, o + x.song.total / 4, x.section?.kind] as const; o += x.song.total / 4; return r; });
      for (const n of sg.notes) { const sp = spans.find(([a, b]) => n.s >= a && n.s < b); if (sp && (sp[2] === 'verse' || sp[2] === 'chorus')) (byK[sp[2]] ??= []).push(n); }
      arcOf(byK);
    }
    return measureSong(sg);
  }
  const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...extra } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
  const tr = buildTrack(idea, defaultTrackOptions(idea)) as any;
  const notes: RNote[] = [];
  const band: Set<number>[] = [];
  const byKind: Record<string, { s: number; e: number; p: number }[]> = {};
  let off = 0;
  for (const sec of tr.sections ?? tr) {
    const { key, total } = sec.song;
    for (let st = 0; st < total; st++) {
      const set = new Set(chordTones(key, sec.chords.timeline[sec.chords.chordIdx[st]].chord));
      let b = 0; for (let x = st; x >= 0 && !b; x--) b = sec.bass?.[x] ?? 0;
      if (b) set.add(b % 12);
      band[off + st] = set;
    }
    let prev: any = null;
    const lead = (sec.vocal ?? []).filter((x: any) => !x.role);
    const kind = sec.section?.kind;
    if (kind === 'verse' || kind === 'chorus') for (const n of lead) if (n.syl?.text !== '~') (byKind[kind] ??= []).push({ s: (off + n.step) / 4, e: (off + n.step + n.len) / 4, p: n.midi });
    if (lead.length) { sectionsSung++; if (copiesReal(lead, sec.song.bars[0]?.len ?? 16)) copies++; if (exact && copiesReal(lead, sec.song.bars[0]?.len ?? 16, (x) => exact.has(x))) exactCopies++; }
    for (const n of lead) {
      const last = notes[notes.length - 1];
      // (a note tied on: the same syllable and pitch carried on is one sung note)
      if (prev && last && n.syl === prev.syl && n.midi === prev.midi && Math.abs((off + n.step) / 4 - last.e) < 0.01) last.e = (off + n.step + n.len) / 4;
      else notes.push({ s: (off + n.step) / 4, e: (off + n.step + n.len) / 4, p: n.midi });
      prev = n;
    }
    off += total;
  }
  const first = (tr.sections ?? tr)[0].song;
  const empty = new Set<number>();
  const sg: RSong = { notes, tonic: first.key % 12, minor: MINORISH.includes(first.mode), bandAt: (t) => band[Math.floor(t * 4 + 1e-6)] ?? empty };
  coverage(tr.sections ?? tr, sg);
  arcOf(byKind);
  wordsOf(tr.sections ?? tr);
  return measureSong(sg);
}

const pc = (x: number) => `${Math.round(100 * x)}%`;
const peak = (p: Profile) => p.hist.peakWhere?.early ?? 0;
const turns = (p: Profile) => p.hist.afterLeap?.['turns back'] ?? 0;
const same = (p: Profile) => p.hist.interval?.repeat ?? 0;
const line = (p: Profile) => `same note ${pc(same(p))}, strong on chord ${pc(p.strongCT)}, all on chord ${pc(p.chordTone)}, peak early ${pc(peak(p))}, turn back after leap ${pc(turns(p))}, range ${p.range[0]}, 2-bar repeats ${pc(p.repeat2bar)}`;

type Run = { vocalReal?: boolean; vocalPatterns?: boolean };
const realOn: Run = process.env.REAL === '1' ? { vocalReal: true } : {};
const runs: Run[] = process.env.REAL === 'both' ? [{}, { vocalReal: true }] : process.env.PAT === 'both' ? [realOn, { ...realOn, vocalPatterns: true }] : [{ ...realOn, ...(process.env.PAT === '1' ? { vocalPatterns: true } : {}) }];
const tagOf = (r: Run) => `${r.vocalReal ? ' +real' : ''}${r.vocalPatterns ? ' +pat' : ''}`;
const summary: string[] = [];
for (const [label, extra] of WRITERS) {
  if (process.env.MODE && process.env.MODE !== label) continue;
  const all: Record<string, Profile> = {};
  for (const real of runs) {
    copies = 0; sectionsSung = 0; exactCopies = 0; cov.r = cov.rN = cov.s = cov.sN = cov.rx = cov.sx = 0; skel.t = skel.tN = skel.s = skel.sN = skel.tx = skel.sx = 0; arcs.height = []; arcs.pace = []; arcs.len = []; for (const k in wordsM) delete wordsM[k]; const rewrites0 = guardRewrites;
    const scores: string[] = [];
    const pooled: SongMeasure[] = [];
    let total = 0;
    for (const g of GENRES) {
      const ms: SongMeasure[] = [];
      for (let i = 0; i < N; i++) ms.push(measureTrack(g, i, { ...extra, ...real }));
      pooled.push(...ms);
      const app = profile(ms), r = gaps(app, T[g]);
      total += r.score;
      const worst = Object.entries(r.gaps).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => HIST_LABEL[k] ?? k).join(', ');
      scores.push(`${g} ${r.score} (${worst})`);
      if (process.env.DETAIL) {
        console.log(`  ${label}${tagOf(real)} ${g}: app  ${line(app)}`);
        console.log(`  ${''.padEnd(label.length + tagOf(real).length)} ${g}: real ${line(T[g])}`);
        for (const k of HISTS) console.log(`      ${HIST_LABEL[k].padEnd(16)} app ${JSON.stringify(app.hist[k])}  real ${JSON.stringify(T[g].hist[k])}`);
      }
    }
    const p = profile(pooled);
    all[tagOf(real)] = p;
    const avg = Math.round(total / GENRES.length);
    console.log(`${(label + tagOf(real)).padEnd(18)} realism ${avg}   ${scores.join(' · ')}`);
    console.log(`${''.padEnd(18)} ${line(p)}`);
    console.log(`${''.padEnd(18)} patterns: bars with a library rhythm ${pc(cov.r / Math.max(1, cov.rN))}, 4-note shapes in the library ${pc(cov.s / Math.max(1, cov.sN))} (real songs: ${pc(PATTERN_COVERAGE.rhythm)}, ${pc(PATTERN_COVERAGE.shape4)}); the ones the writers lack: rhythms ${pc(cov.rx / Math.max(1, cov.rN))}, shapes ${pc(cov.sx / Math.max(1, cov.sN))}`);
    const RA = (arcData.genres as Record<string, Record<string, number>>).all;
    console.log(`${''.padEnd(18)} chorus vs verse: height ${medOf(arcs.height).toFixed(1)} (${q(arcs.height, 0.25).toFixed(1)} to ${q(arcs.height, 0.75).toFixed(1)}), notes a beat x${medOf(arcs.pace).toFixed(2)}, note length x${medOf(arcs.len).toFixed(2)} (real songs: ${RA.height.toFixed(1)} (${RA.heightP25.toFixed(1)} to ${RA.heightP75.toFixed(1)}), x${RA.pace.toFixed(2)}, x${RA.len.toFixed(2)})`);
    if (skel.tN) console.log(`${''.padEnd(18)} slow line: 2-bar timings in the skeleton library ${pc(skel.t / skel.tN)}, 4-note shapes ${pc(skel.s / Math.max(1, skel.sN))} (real songs: ${pc(SKEL_COVERAGE.timing)}, ${pc(SKEL_COVERAGE.shape4)}); the ones the Guide line lacks: timings ${pc(skel.tx / skel.tN)}, shapes ${pc(skel.sx / Math.max(1, skel.sN))} (real songs about ${pc(REAL_LACK.t)}, ${pc(REAL_LACK.s)})`);
    const RW = (wordsData.genres as Record<string, Record<string, number>>).all;
    if (wordsM.rate?.length) console.log(`${''.padEnd(18)} words: ${medOf(wordsM.rate).toFixed(1)} syllables a second, chorus x${medOf(wordsM.chorusRate ?? [0]).toFixed(2)}, over 2+ notes ${pc(medOf(wordsM.melisma))}, on a 16th ${pc(medOf(wordsM.on16))}, soft line endings ${pc(medOf(wordsM.fem))}, ${medOf(wordsM.lineSyl)} a line (real songs: ${RW.rate.toFixed(1)}, x${RW.chorusRate.toFixed(2)}, ${pc(RW.melisma)}, ${pc(RW.on16)}, ${pc(RW.fem)}, ${RW.lineSyl})`);
    if (real.vocalPatterns || process.env.GUARD) console.log(`${''.padEnd(18)} copy guard: ${guardRewrites - rewrites0} tunes written again; finished sections the guard flags: ${copies} of ${sectionsSung}, truly copying a real 2-bar stretch: ${exact ? exactCopies : '?'}`);
    summary.push(`${(label + tagOf(real)).padEnd(18)} ${avg}`);
  }
}
console.log(`${'real songs'.padEnd(18)} ${line(T.all)}`);
console.log('\nrealism by writer:', summary.join(' | '));
