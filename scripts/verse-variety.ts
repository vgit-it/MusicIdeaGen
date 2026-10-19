// Sameness check for the verse melody writer (experiment): "all generated songs shouldn't end up sounding similar" (Paul).
// Writes the verse and the chorus of many songs (every genre and mood, real tracks from the generator) and measures, for each,
// what the line does: how the chorus lands, how it ends, how busy it is, how long its phrases are, where its top note is...
// Then it prints how each trait spreads over the songs and marks (!!) any trait where one value wins too often, and counts
// pairs of songs whose choruses have nearly the same rhythm. Tune the weights in personality.ts until nothing is marked.
//   npm run verse-variety            (N=224 songs)
//   N=500 npm run verse-variety      (more)

import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS } from '../src/tension';
import { QUALITIES } from '../src/theory';
import { accentsOf, buildSection, chordsOf, barOf, chorusMaster, isChorus, personalityOf } from '../src/verse/section';
import { DEFAULT_RANGE, type BandNote } from '../src/verse/verse';
import type { Built } from '../src/verse/build';

const N = Number(process.env.N ?? 224);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const OPTS = { range: { ...DEFAULT_RANGE }, bends: 'some' as const, meta: true, variation: 'some' as const };

const traits: Record<string, string[]> = {};
const add = (k: string, v: string) => (traits[k] ??= []).push(v);
const sigs: { i: number; hook: string; on: Set<number>; label: string }[] = [];
let sections = 0, broken = 0;

const byHook: Record<string, number[][]> = {};
const within: number[] = [], silDiff: number[] = [], silErr: number[] = [];
let outerV = 0, innerV = 0, outerC = 0, innerC = 0, nSong = 0;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], mood = MOODS[Math.floor(i / 7) % 8], meter = i % 9 === 8 ? '6/8' : '4/4';
  const s = `vv-${i}-${genre}-${mood}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never).sections;
  const verse = list.find((x) => x.section?.kind === 'verse'), chorus = [...list].reverse().find(isChorus);
  if (!verse || !chorus) continue;
  const p = personalityOf(chorus);
  const bv = buildSection(verse, OPTS), bc = buildSection(chorus, OPTS);
  sections += 2;
  // (the song's other choruses are built like the last one: same rhythm, own chords)
  const others = list.filter((x) => isChorus(x) && x !== chorus).map((x) => buildSection(x, OPTS, accentsOf(chorus), chorus));
  for (const o of others) {
    const a = new Set(o.notes.map((n) => Math.round(n.step * 100))), z = new Set(bc.notes.map((n) => Math.round(n.step * 100)));
    let inter = 0;
    for (const x of a) if (z.has(x)) inter++;
    within.push(inter / (a.size + z.size - inter));
    const cover = (b: typeof bc) => b.notes.reduce((q, n) => q + n.len, 0);
    silDiff.push(Math.abs(cover(o) - cover(bc)) / chorus.chords.chordIdx.length);
  }
  for (const [idea2, b] of [[verse, bv], [chorus, bc]] as const) {
    const bar = barOf(idea2), total = idea2.chords.chordIdx.length;
    const ns = b.notes;
    // (the rules held: nothing overlaps, nothing past the end)
    for (let k = 1; k < ns.length; k++) if (ns[k].step < ns[k - 1].step + ns[k - 1].len - 1e-6) { broken++; if (process.env.DEBUG) console.log('overlap', s, idea2.section?.kind, JSON.stringify([ns[k - 1], ns[k]])); }
    if (ns.some((n) => n.step + n.len > total + 1e-6)) broken++;
  }

  // the song's draws
  add('hook', p.hook);
  add('chorus lift', p.chorusLift > 0 ? `+${p.chorusLift}` : String(p.chorusLift));
  add('chorus main ending', p.chorusEndMain);
  add('chorus answers', p.chorusVariation);
  add('verse phrases', p.verseBias);

  // what the lines do
  const key = chorus.song.key, bar = barOf(chorus), total = chorus.chords.chordIdx.length;
  const ch = chordsOf(chorus);
  const toneAt = (n: BandNote): string => {
    const c = ch[Math.min(total - 1, Math.floor(n.step))];
    const iv = QUALITIES[c.q] as readonly number[];
    const rel = ((n.midi - key - c.root) % 12 + 12) % 12;
    const third = iv.find((x) => x === 3 || x === 4) ?? 7, fifth = iv.find((x) => x === 6 || x === 7 || x === 8) ?? 7;
    return rel === 0 ? 'root' : rel === third ? '3rd' : rel === fifth ? '5th' : 'off-chord';
  };
  const cn = bc.notes, vn = bv.notes;
  if (cn.length && vn.length) {
    const ends = cn.filter((n) => n.end);
    const styles = new Map<string, number>();
    for (const n of ends) styles.set(n.style ?? 'held', (styles.get(n.style ?? 'held') ?? 0) + 1);
    add('chorus ending seen', ends.length ? [...styles].sort((a, b) => b[1] - a[1])[0][0] : 'none');
    const share = ends.length / Math.max(1, bc.phrases.length);
    add('chorus phrases ending in a treatment', share === 0 ? 'none' : share < 0.5 ? 'under half' : share < 1 ? 'most' : 'all');
    const last = cn[cn.length - 1];
    add('chorus last note on the chord', toneAt(last));
    add('chorus last note timing', Math.abs(last.step / (bar / 4) - Math.round(last.step / (bar / 4))) < 1e-6 ? 'on a beat' : 'off the beat');
    add('chorus first note on the chord', toneAt(cn[0]));
    const perBar = (a: BandNote[]) => (a.length * bar) / total;
    const cd = perBar(cn), vd0 = perBar(vn);
    add('chorus notes per bar', cd < 2.6 ? 'few' : cd < 3.8 ? 'some' : 'many');
    const sl = 1 - cn.reduce((a, n) => a + n.len, 0) / total;
    silErr.push(sl - p.chorusSilence);
    add('chorus silence', sl < 0.33 ? '30-33%' : sl < 0.37 ? '33-37%' : sl < 0.42 ? '37-42%' : sl < 0.47 ? '42-47%' : '47%+');
    add('chorus notes a beat or longer', cn.filter((n) => n.len >= 4).length / cn.length < 0.25 ? 'under 25%' : cn.filter((n) => n.len >= 4).length / cn.length < 0.4 ? '25-40%' : cn.filter((n) => n.len >= 4).length / cn.length < 0.55 ? '40-55%' : '55%+');
    const al = mean(cn.map((n) => n.len));
    add('chorus note length', al < 2.6 ? 'short' : al < 3.4 ? 'medium' : 'long');
    const pb = mean(bc.phrases.map((x) => x.len / bar));
    add('chorus phrase length', pb < 1.7 ? 'short' : pb < 2.7 ? 'medium' : 'long');
    const top = cn.reduce((a, n) => (n.midi > a.midi ? n : a), cn[0]);
    add('chorus top note', top.step < total / 2 ? 'first half' : 'second half');
    const rise = cn[cn.length - 1].midi - cn[0].midi;
    add('chorus end vs start', rise >= 3 ? 'higher' : rise <= -3 ? 'lower' : 'level');
    const vd = mean(cn.map((n) => n.midi)) - mean(vn.map((n) => n.midi));
    add('chorus vs verse pitch', vd >= 2 ? 'higher' : vd <= -2 ? 'lower' : 'level');
    (byHook[p.hook] ??= []).push([vd0, cd, bv.runs.length, bc.runs.length, verse.section!.energy, chorus.section!.energy, vn.reduce((a, n) => a + n.len, 0) / vn.length, cn.reduce((a, n) => a + n.len, 0) / cn.length]);
    add('chorus notes vs the verse\'s', cd < vd0 * 0.3 ? 'under a third' : cd < vd0 * 0.4 ? '30-40%' : cd < vd0 * 0.5 ? '40-50%' : 'over half');
    add('verse 16th runs', bv.runs.length <= 3 ? 'few' : bv.runs.length <= 6 ? 'some' : 'many');
    add('verse long notes', bv.holds.length <= 2 ? 'few' : bv.holds.length <= 4 ? 'some' : 'many');
    nSong++;
    outerV += vn.filter((n) => n.bend).length; innerV += vn.filter((n) => n.inner).length; outerC += cn.filter((n) => n.bend).length; innerC += cn.filter((n) => n.inner).length;
    const nb = (a: BandNote[]) => a.filter((n) => n.bend || n.inner).length;
    add('chorus bends', nb(cn) <= 4 ? '0-4' : String(Math.min(nb(cn), 8)));
    add('verse bends', nb(vn) <= 1 ? '0-1' : nb(vn) <= 3 ? '2-3' : nb(vn) <= 5 ? '4-5' : '6+');
    sigs.push({ i, hook: p.hook, on: new Set(cn.map((n) => Math.round(n.step))), label: `${genre}/${mood}` });
  }
}

const flags: string[] = [];
for (const [k, vals] of Object.entries(traits)) {
  const count = new Map<string, number>();
  for (const v of vals) count.set(v, (count.get(v) ?? 0) + 1);
  const rows = [...count].sort((a, b) => b[1] - a[1]);
  const top = rows[0][1] / vals.length;
  const cats = rows.length;
  const cap = cats <= 2 ? 0.75 : cats === 3 ? 0.6 : 0.5;
  const bad = top > cap;
  if (bad) flags.push(k);
  console.log(`${bad ? '!! ' : '   '}${k.padEnd(40)} ${rows.map(([v, c]) => `${v} ${Math.round((100 * c) / vals.length)}%`).join(' · ')}`);
}

// pairs of songs whose choruses have nearly the same rhythm (the same onset steps)
let dup = 0;
const ex: string[] = [];
for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) {
  const A = sigs[a].on, B = sigs[b].on;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const jac = inter / (A.size + B.size - inter);
  if (jac >= 0.85) { dup++; if (ex.length < 5) ex.push(`${sigs[a].label} #${sigs[a].i} ~ ${sigs[b].label} #${sigs[b].i} (${Math.round(jac * 100)}%)`); }
}
const pairs = (sigs.length * (sigs.length - 1)) / 2;
for (const [h, rows] of Object.entries(byHook)) console.log(`  ${h.padEnd(7)} notes/bar ${mean(rows.map((r) => r[0])).toFixed(1)}→${mean(rows.map((r) => r[1])).toFixed(1)}  runs ${mean(rows.map((r) => r[2])).toFixed(1)}→${mean(rows.map((r) => r[3])).toFixed(1)}  energy ${mean(rows.map((r) => r[4])).toFixed(1)}→${mean(rows.map((r) => r[5])).toFixed(1)}  avg len ${mean(rows.map((r) => r[6])).toFixed(1)}→${mean(rows.map((r) => r[7])).toFixed(1)}`);
console.log(`\nBends per section, outer (scoops, falls) / inside notes: verse ${(outerV / nSong).toFixed(1)} / ${(innerV / nSong).toFixed(1)}, chorus ${(outerC / nSong).toFixed(1)} / ${(innerC / nSong).toFixed(1)}`);
console.log(`Chorus silence vs the song's draw: mean ${mean(silErr).toFixed(3)}, worst ${Math.max(...silErr.map(Math.abs)).toFixed(3)}`);
console.log(`Choruses of one song: onsets the same as the last chorus's ${(100 * mean(within)).toFixed(0)}% (worst ${(100 * Math.min(...within)).toFixed(0)}%); vocal share differs by ${(100 * mean(silDiff)).toFixed(1)} points`);
console.log(`${sections} sections written (${sigs.length} songs); overlaps/overruns: ${broken}`);
console.log(`Choruses with nearly the same rhythm (85%+ the same onsets): ${dup} of ${pairs} pairs (${((100 * dup) / pairs).toFixed(2)}%)${ex.length ? '\n  e.g. ' + ex.join('\n       ') : ''}`);
console.log(flags.length ? `\nMarked (!!): ${flags.join(', ')}` : '\nNo trait is dominated by one value.');
