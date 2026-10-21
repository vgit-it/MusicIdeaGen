// Sameness check for the verse melody writer (experiment): "all generated songs shouldn't end up sounding similar" (Paul).
// Writes the verse and the chorus of many songs (every genre and mood, real tracks from the generator) and measures, for each,
// what the line does: how the chorus lands, how it ends, how busy it is, how long its phrases are, where its top note is...
// Then it prints how each trait spreads over the songs and marks (!!) any trait where one value wins too often, and counts
// pairs of songs whose choruses have nearly the same rhythm. Tune the weights in personality.ts until nothing is marked.
//   npm run verse-variety            (N=224 songs)
//   N=500 npm run verse-variety      (more)
//   PENT=1 npm run verse-variety     (every note from the pentatonic scale)

import { emoOn } from '../src/verse/emotion';
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS } from '../src/tension';
import { QUALITIES } from '../src/theory';
import { accentsOf, buildSection, chordsOf, barOf, chorusMaster, isBridge, isChorus, isInterlude, isOutro, isPre, personalityOf } from '../src/verse/section';
import { DEFAULT_RANGE, type BandNote } from '../src/verse/verse';
import type { Built } from '../src/verse/build';

const N = Number(process.env.N ?? 224);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const OPTS = { range: { ...DEFAULT_RANGE }, bends: 'some' as const, meta: true, variation: 'some' as const, pentatonic: !!process.env.PENT };

const traits: Record<string, string[]> = {};
const add = (k: string, v: string) => (traits[k] ??= []).push(v);
const sigs: { i: number; hook: string; on: Set<number>; label: string }[] = [];
let sections = 0, broken = 0, shortUnits = 0;

const byHook: Record<string, number[][]> = {};
const within: number[] = [], silDiff: number[] = [], silErr: number[] = [];
let preShared = 0, preCmp = 0;
const bridgeSil: number[] = [];
const interSil: number[] = [];
const outroSil: number[] = [];
let outerV = 0, innerV = 0, outerC = 0, innerC = 0, nSong = 0;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], mood = MOODS[Math.floor(i / 7) % 8], meter = i % 9 === 8 ? '6/8' : '4/4';
  const s = `vv-${i}-${genre}-${mood}`;
  Object.assign(OPTS, { emo: process.env.EMO ? { mood, on: process.env.EMO === '1' ? emoOn() : new Set(process.env.EMO.split(',') as never[]) } : undefined }); // (EMO=1: with the mood notes on; EMO=colour,endings: just those)
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
    // (rule 20: no unit of touching notes shorter than a quarter bar)
    for (let k = 0, j = 0; k < ns.length; k = j + 1) {
      j = k;
      while (j + 1 < ns.length && ns[j + 1].step <= ns[j].step + ns[j].len + 1e-6) j++;
      if (ns[j].step + ns[j].len - ns[k].step < bar / 4 - 1e-6) { shortUnits++; if (process.env.DEBUG) console.log('short unit', s, idea2.section?.kind, ns[k].step, ns[j].step + ns[j].len - ns[k].step); }
    }
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
    add('chorus silence', sl < 0.29 ? '25-29%' : sl < 0.33 ? '29-33%' : sl < 0.37 ? '33-37%' : sl < 0.41 ? '37-41%' : '41%+');
    add('chorus notes a beat or longer', cn.filter((n) => n.len >= 4).length / cn.length < 0.25 ? 'under 25%' : cn.filter((n) => n.len >= 4).length / cn.length < 0.4 ? '25-40%' : cn.filter((n) => n.len >= 4).length / cn.length < 0.55 ? '40-55%' : '55%+');
    const al = mean(cn.map((n) => n.len));
    add('chorus note length', al < 3 ? 'short' : al < 3.9 ? 'medium' : 'long');
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

  // the pre-chorus (the song's last one is the master; its phrasing is borrowed from the verse)
  const pre = [...list].reverse().find(isPre);
  if (pre && vn.length) {
    const bp = buildSection(pre, OPTS, accentsOf(pre), undefined, verse), pn = bp.notes, tot = pre.chords.chordIdx.length, pbar = barOf(pre);
    sections++;
    for (let k = 1; k < pn.length; k++) if (pn[k].step < pn[k - 1].step + pn[k - 1].len - 1e-6) broken++;
    for (let k = 0, j = 0; k < pn.length; k = j + 1) {
      j = k;
      while (j + 1 < pn.length && pn[j + 1].step <= pn[j].step + pn[j].len + 1e-6) j++;
      if (pn[j].step + pn[j].len - pn[k].step < pbar / 4 - 1e-6) shortUnits++;
    }
    if (pn.length) {
      const half = tot / 2, m = (a: BandNote[]) => mean(a.map((n) => n.midi));
      const first = pn.filter((n) => n.step < half), second = pn.filter((n) => n.step >= half && !n.lead);
      const c = first.length && second.length ? m(second) - m(first) : 0;
      add('pre-chorus climb (2nd half vs 1st)', c >= 1 ? 'climbs' : c <= -1 ? 'falls' : 'level');
      add('pre-chorus leads into the chorus', pn.some((n) => n.lead) ? 'yes' : 'no');
      const sl = 1 - pn.reduce((a, n) => a + n.len, 0) / tot;
      add('pre-chorus silence', sl < 0.15 ? 'under 15%' : sl < 0.19 ? '15-19%' : sl < 0.23 ? '19-23%' : sl < 0.27 ? '23-27%' : '27%+');
      add('pre-chorus pitch vs verse', m(pn) - m(vn) >= 2 ? 'higher' : m(pn) - m(vn) <= -2 ? 'lower' : 'level');
      add('pre-chorus notes per bar', (pn.length * pbar) / tot < 3.8 ? 'few' : (pn.length * pbar) / tot < 5 ? 'some' : 'many');
      const vs = new Set(bv.phrases.map((x) => x.step));
      preShared += bp.phrases.filter((x) => vs.has(x.step)).length; preCmp += bp.phrases.length;
    }
  }

  // the bridge (its own material: nothing borrowed; the song's last one is the master)
  const bridge = [...list].reverse().find(isBridge);
  if (bridge && vn.length) {
    const bb = buildSection(bridge, OPTS, accentsOf(bridge), undefined, verse), bn = bb.notes, tot = bridge.chords.chordIdx.length, brbar = barOf(bridge), bp = personalityOf(bridge);
    sections++;
    for (let k = 1; k < bn.length; k++) if (bn[k].step < bn[k - 1].step + bn[k - 1].len - 1e-6) broken++;
    for (let k = 0, j = 0; k < bn.length; k = j + 1) {
      j = k;
      while (j + 1 < bn.length && bn[j + 1].step <= bn[j].step + bn[j].len + 1e-6) j++;
      if (bn[j].step + bn[j].len - bn[k].step < brbar / 4 - 1e-6) shortUnits++;
    }
    if (bn.length) {
      const m = (a: BandNote[]) => mean(a.map((n) => n.midi)), sdOf = (a: BandNote[]) => Math.sqrt(mean(a.map((n) => (n.midi - m(a)) ** 2)));
      const sl = 1 - bn.reduce((a, n) => a + n.len, 0) / tot;
      add('bridge silence', sl < 0.25 ? 'under 25%' : sl < 0.3 ? '25-30%' : sl < 0.37 ? '30-37%' : '37%+');
      add('bridge leads into the chorus', bn.some((n) => n.lead) ? 'yes' : 'no');
      add('bridge pitch vs verse', m(bn) - m(vn) >= 2 ? 'higher' : m(bn) - m(vn) <= -2 ? 'lower' : 'level');
      add('bridge notes per bar', (bn.length * brbar) / tot < 2.5 ? 'few' : (bn.length * brbar) / tot < 3.5 ? 'some' : 'many');
      add('bridge pitch spread vs verse', sdOf(bn) < sdOf(vn) - 0.3 ? 'narrower' : sdOf(bn) > sdOf(vn) + 0.3 ? 'wider' : 'alike');
      bridgeSil.push(sl - bp.bridgeSilence);
    }
  }

  // the interlude (an echo of the chorus: it takes the chorus's phrasing, chord notes and long notes)
  const inter = [...list].reverse().find(isInterlude);
  if (inter && chorus) {
    const bi = buildSection(inter, OPTS, accentsOf(inter), undefined, verse, chorus), inn = bi.notes, tot = inter.chords.chordIdx.length, ibar = barOf(inter), ip = personalityOf(inter);
    sections++;
    for (let k = 1; k < inn.length; k++) if (inn[k].step < inn[k - 1].step + inn[k - 1].len - 1e-6) broken++;
    for (let k = 0, j = 0; k < inn.length; k = j + 1) {
      j = k;
      while (j + 1 < inn.length && inn[j + 1].step <= inn[j].step + inn[j].len + 1e-6) j++;
      if (inn[j].step + inn[j].len - inn[k].step < ibar / 4 - 1e-6) shortUnits++;
    }
    if (inn.length) {
      const sl = 1 - inn.reduce((a, n) => a + n.len, 0) / tot;
      add('interlude silence', sl < 0.45 ? 'under 45%' : sl < 0.52 ? '45-52%' : sl < 0.58 ? '52-58%' : '58%+');
      add('interlude notes per bar', (inn.length * ibar) / tot < 1.5 ? 'few' : (inn.length * ibar) / tot < 2 ? 'some' : (inn.length * ibar) / tot < 2.7 ? 'more' : 'many');
      const endShare = inn.filter((n) => n.end).length / Math.max(1, bi.phrases.length);
      add('interlude phrases that end in a treatment', endShare < 0.5 ? 'few' : endShare < 0.9 ? 'most' : 'all');
      interSil.push(sl - ip.interludeSilence);
    }
  }
  // the outro (the chorus's tail, fading or held; a jam or solo outro is the guitar's and is left out)
  const outro = [...list].reverse().find(isOutro);
  if (outro && chorus) {
    const bo = buildSection(outro, OPTS, accentsOf(outro), undefined, verse, chorus), on = bo.notes, tot = outro.chords.chordIdx.length, obar = barOf(outro), op = personalityOf(outro);
    sections++;
    for (let k = 1; k < on.length; k++) if (on[k].step < on[k - 1].step + on[k - 1].len - 1e-6) broken++;
    for (let k = 0, j = 0; k < on.length; k = j + 1) {
      j = k;
      while (j + 1 < on.length && on[j + 1].step <= on[j].step + on[j].len + 1e-6) j++;
      if (on[j].step + on[j].len - on[k].step < obar / 4 - 1e-6) shortUnits++;
    }
    if (on.length) {
      const sl = 1 - on.reduce((a, n) => a + n.len, 0) / tot;
      add('outro silence', sl < 0.35 ? 'under 35%' : sl < 0.42 ? '35-42%' : sl < 0.5 ? '42-50%' : '50%+');
      add('outro notes per bar', (on.length * obar) / tot < 1.5 ? 'few' : (on.length * obar) / tot < 2 ? 'some' : (on.length * obar) / tot < 2.7 ? 'more' : 'many');
      const endShare = on.filter((n) => n.end).length / Math.max(1, bo.phrases.length);
      add('outro phrases that end in a treatment', endShare < 0.5 ? 'few' : endShare < 0.9 ? 'most' : 'all');
      add('outro finish', op.outroFade ? 'fades' : 'holds');
      outroSil.push(sl - op.outroSilence);
    }
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
console.log(`${sections} sections written (${sigs.length} songs); overlaps/overruns: ${broken}; units shorter than a quarter bar: ${shortUnits}`);
console.log(`Choruses with nearly the same rhythm (85%+ the same onsets): ${dup} of ${pairs} pairs (${((100 * dup) / pairs).toFixed(2)}%)${ex.length ? '\n  e.g. ' + ex.join('\n       ') : ''}`);
console.log(`Bridge silence vs the song's draw: mean ${mean(bridgeSil).toFixed(3)}, worst ${Math.max(...bridgeSil.map(Math.abs)).toFixed(3)} (${bridgeSil.length} bridges)`);
console.log(`Interlude silence vs the song's draw: mean ${mean(interSil).toFixed(3)}, worst ${interSil.length ? Math.max(...interSil.map(Math.abs)).toFixed(3) : 'n/a'} (${interSil.length} interludes)`);
console.log(`Outro silence vs the song's draw: mean ${mean(outroSil).toFixed(3)}, worst ${outroSil.length ? Math.max(...outroSil.map(Math.abs)).toFixed(3) : 'n/a'} (${outroSil.length} outros)`);
console.log(`Pre-chorus phrase starts shared with the verse: ${preCmp ? Math.round((100 * preShared) / preCmp) : 0}% of ${preCmp}`);
console.log(flags.length ? `\nMarked (!!): ${flags.join(', ')}` : '\nNo trait is dominated by one value.');
