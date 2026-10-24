// The solo player's reader (docs/SOLO-PLAYER.md, section 3): looks at the melody the way a guitarist would before playing it, and says what
// situation each note, joint, cell (2 to 5 notes) and phrase is in: its length, how it moves, where it sits in its phrase and the bar, what
// the energy, the mood, the chords and the drums are doing there. Pure: numbers in, tags out. The rewrite rules are offered a span by these
// tags (and the numbers behind them); nothing here changes a note.

import type { CellRead, ChordPart, DrumPart, Feel, JointRead, NoteRead, PhraseRead, ReadTag, Song, SoloCurve, SoloGap, SoloRead } from '../idea';
import { QUALITIES } from '../theory';
import type { Mood } from '../tension';
import { type BaseNote, TOL } from './soloevents';
import { beatAt } from './soloverify';

export interface ReadCtx {
  song: Song;
  chords?: ChordPart;
  drums?: DrumPart;
  mood: Mood;
  /** The tension (0 to 1) of each bar. */
  tension: number[];
  curve?: SoloCurve;
}

/** A tag weaker than this is not kept. */
export const MIN_W = 0.35;

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mod = (n: number, m: number) => ((n % m) + m) % m;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The feel each mood wants to begin with (agitation, roughness, ornament, weight, looseness). */
const MOOD_FEEL: Record<Mood, Feel> = {
  happy: { agitation: 0.3, roughness: -0.3, ornament: 0.4, weight: -0.2, looseness: 0.1 },
  melancholic: { agitation: -0.5, roughness: -0.4, ornament: 0, weight: 0, looseness: 0.5 },
  nostalgic: { agitation: -0.3, roughness: -0.3, ornament: 0.2, weight: -0.1, looseness: 0.4 },
  tense: { agitation: 0.5, roughness: 0.5, ornament: 0.2, weight: 0.1, looseness: -0.4 },
  angry: { agitation: 0.8, roughness: 0.8, ornament: 0, weight: 0.7, looseness: -0.2 },
  dreamy: { agitation: -0.6, roughness: -0.5, ornament: 0.3, weight: -0.4, looseness: 0.8 },
  triumphant: { agitation: 0.4, roughness: -0.1, ornament: 0.5, weight: 0.8, looseness: 0 },
  dark: { agitation: -0.1, roughness: 0.4, ornament: -0.1, weight: 0.5, looseness: 0.1 },
};

type Groove = 'shuffle' | 'half-time' | 'sixteenths' | 'eighths' | 'quarters' | 'open';

export function readSolo(notes: BaseNote[], c: ReadCtx): SoloRead {
  const { song } = c;
  const bpm = song.bpm, total = song.total;
  const bars = song.bars;
  const barIx = (g: number) => { for (let i = bars.length - 1; i >= 0; i--) if (g >= bars[i].start - 1e-9) return i; return 0; };
  const gaps: SoloGap[] = c.curve?.gaps ?? [];
  const energy = c.curve?.energy ?? [];
  const eAt = (g: number) => (energy.length ? energy[clamp(Math.floor(g), 0, energy.length - 1)] : 0);
  const tl = c.chords?.timeline ?? [];
  const chordIx = (g: number) => { let k = 0; for (let i = 0; i < tl.length; i++) if (tl[i].step <= g + 1e-9) k = i; return k; };
  const tonesOf = (k: number) => new Set(tl[k] ? QUALITIES[tl[k].chord.q].map((i) => mod(song.key + tl[k].chord.root + i, 12)) : []);
  const beatStarts = new Set<number>();
  for (const b of bars) { let g = b.start; for (const grp of b.groups) { beatStarts.add(g); g += grp; } }

  const lo = notes.length ? Math.min(...notes.map((n) => n.midi)) : 60;
  const hi = notes.length ? Math.max(...notes.map((n) => n.midi)) : 60;
  const meanE = energy.length ? energy.reduce((a, b) => a + b, 0) / energy.length : 0;

  // ---- phrases, from the landings the melody left (the last note of each)
  const lands = [...(c.curve?.landings ?? [])].sort((a, b) => a.step - b.step);
  const phraseOf: number[] = new Array(notes.length).fill(-1);
  const phr: { from: number; to: number; role: string }[] = [];
  {
    let from = 0;
    for (const l of lands) {
      // (by the step alone: a note bent into by a join sounds another pitch than the one landed on)
      const to = notes.findIndex((n, k) => k >= from && Math.abs(n.t - l.step) <= TOL);
      if (to < 0) continue;
      phr.push({ from, to, role: l.role });
      from = to + 1;
    }
    if (from < notes.length) phr.push({ from, to: notes.length - 1, role: '' });
    if (!phr.length && notes.length) phr.push({ from: 0, to: notes.length - 1, role: '' });
    phr.forEach((p, k) => { for (let i = p.from; i <= p.to; i++) phraseOf[i] = k; });
  }
  const climaxPh = phr.findIndex((p) => p.role === 'climax');

  // ---- the drums
  const d = c.drums;
  const lane = (l: number[] | undefined, g: number) => (l && g >= 0 && g < l.length ? l[g] ?? 0 : 0);
  const hitsAt = (g: number) => (d ? [d.kick, d.snare, d.hat, d.hatOpen, d.ride, d.crash, d.tom].filter((l) => lane(l, g) > 0).length : 0);
  const density = bars.map((b) => {
    if (!d) return 0;
    let n = 0;
    for (let g = b.start; g < b.start + b.len; g++) if (hitsAt(g) > 0) n++;
    return n / b.len;
  });
  const meanDensity = density.length ? density.reduce((a, b) => a + b, 0) / density.length : 0;
  const grooves: Groove[] = bars.map((b) => {
    if (!d) return 'open';
    if (song.swing) return 'shuffle';
    const hat = (g: number) => lane(d.hat, g) > 0 || lane(d.ride, g) > 0 || lane(d.hatOpen, g) > 0;
    let beats = 0, eighths = 0, sixteenths = 0, nb = 0, ne = 0, ns = 0;
    let pos = 0;
    for (const grp of b.groups) {
      for (let k = 0; k < grp; k++) {
        const g = b.start + pos + k;
        if (k === 0) { nb++; if (hat(g)) beats++; }
        else if (k % 2 === 0) { ne++; if (hat(g)) eighths++; }
        else { ns++; if (hat(g)) sixteenths++; }
      }
      pos += grp;
    }
    if (sixteenths >= 0.6 * ns && ns > 0) return 'sixteenths';
    if (eighths >= 0.6 * ne && ne > 0) return 'eighths';
    // snare only on the third beat of a 4/4 bar
    if (b.len === 16 && lane(d.snare, b.start + 8) > 0 && !lane(d.snare, b.start + 4) && !lane(d.snare, b.start + 12)) return 'half-time';
    if (beats >= 0.6 * nb && nb > 0) return 'quarters';
    return 'open';
  });
  const fills = (d?.fills ?? []).filter((f) => bars[f.bar]).map((f) => ({ from: bars[f.bar].start + bars[f.bar].len - f.len, to: bars[f.bar].start + bars[f.bar].len })).filter((f) => f.to <= total + 1);

  // ---- the notes
  const reads: NoteRead[] = notes.map((n, i) => {
    const prev = notes[i - 1], next = notes[i + 1];
    const t = n.t, end = n.t + n.len;
    const bar = bars[barIx(t)], bi = barIx(t);
    const beat = beatAt(song, t);
    const beats = n.len / beat;
    const inI = prev ? n.midi - prev.midi : null;
    const outI = next ? next.midi - n.midi : null;
    const gapAfter = next ? Math.max(0, next.t - end) : 0;
    const room = gaps.find((g) => g.from?.step === Math.floor(n.t))?.len ?? 0;
    const ph = phr[phraseOf[i]];
    const j = ph ? i - ph.from : 0;
    const isEnd = !!ph && i === ph.to;
    const rel = hi > lo ? (n.midi - lo) / (hi - lo) : 0.5;
    const e = eAt(t), slope = eAt(t + 6) - eAt(t - 6);
    let locMax = -2, locMin = 2;
    for (let g = Math.max(0, Math.floor(t) - 24); g <= Math.min(total - 1, Math.floor(t) + 24); g += 2) { const v = eAt(g); locMax = Math.max(locMax, v); locMin = Math.min(locMin, v); }
    const tension = c.tension.length ? c.tension[Math.min(c.tension.length - 1, bi)] : 0.5;
    const ci = chordIx(t), ch = tl[ci]?.chord;
    const fn = ch ? mod(n.midi - song.key - ch.root, 12) : -1;
    const change = tl.some((x, k) => k > 0 && x.step > t + 1e-6 && x.step < end - 1e-6);
    const nextTones = tonesOf(Math.min(tl.length - 1, ci + 1));
    const commonNext = change && nextTones.has(mod(n.midi, 12));
    const g0 = Math.floor(t), g1 = Math.round(end);
    const snareEnd = lane(d?.snare, g1) > 0 || lane(d?.snare, g1 - 1) > 0;
    const kickEnd = lane(d?.kick, g1) > 0 || lane(d?.kick, g1 - 1) > 0;
    const crashEnd = lane(d?.crash, g1) > 0;
    let fillOver = 0;
    for (const f of fills) fillOver = Math.max(fillOver, clamp((Math.min(end, f.to) - Math.max(t, f.from)) / Math.max(1, n.len)));
    const rel_d = meanDensity > 0 ? density[bi] / meanDensity : 1;
    const groove = grooves[bi];
    const barsLeft = bars.length - 1 - bi;

    const tags: ReadTag[] = [];
    const add = (id: string, w: number, family: ReadTag['family'] = 'shape') => { if (w >= MIN_W) tags.push({ id, w: r2(clamp(w)), family }); };
    // the note itself
    if (beats > 1) add('long-note', 0.5 + (beats - 1) * 0.5);
    if (beats <= 0.5) add('short-note', 1);
    else if (beats <= 1) add('beat-note', 0.5);
    if (n.len >= 0.75 * bar.len) add('held-bar', 1);
    if (n.midi === hi) add('peak-note', 1);
    if (n.midi === hi && beats > 1) add('held-peak', 0.6 + 0.2 * (beats - 1));
    if (ph?.role === 'climax' && isEnd) add('climax-note', 1);
    if (beats > 1 && gapAfter > 0) add('long-before-rest', 0.6 + 0.4 * Math.min(1, gapAfter / beat));
    if (beats > 1 && room >= 4) add('long-with-room', Math.min(1, room / 8));
    if (beats > 1 && change) add('long-over-chord-change', 0.9);
    if (rel >= 0.75) add('high-register', rel);
    if (rel <= 0.25) add('low-register', 1 - rel);
    // how it moves
    if (inI === 0) add('static-repeat', 1);
    if (inI !== null && inI >= 5) add('leap-up', Math.min(1, (inI - 3) / 6));
    if (inI !== null && inI <= -5) add('leap-down', Math.min(1, (-inI - 3) / 6));
    if (inI !== null && inI >= 3 && inI <= 4) add('skip-up', 0.8);
    if (inI !== null && inI <= -3 && inI >= -4) add('skip-down', 0.8);
    if (inI !== null && inI >= 1 && inI <= 2) add('step-up', 1);
    if (inI !== null && inI <= -1 && inI >= -2) add('step-down', 1);
    if (outI !== null && Math.abs(outI) >= 5) add('before-leap', Math.min(1, (Math.abs(outI) - 3) / 6));
    // its place
    if (!prev) add('first-note', 1, 'place');
    if (!next) add('last-note', 1, 'place');
    if (j === 0 && ph) add('phrase-start', 1, 'place');
    if (isEnd) add('phrase-end', 1, 'place');
    if (isEnd && ph.role === 'call') add('call-hanging', 1, 'place');
    if (isEnd && ph.role === 'answer') add('answer-landing', 1, 'place');
    if (isEnd && ph.role === 'end') add('final-landing', 1, 'place');
    if (climaxPh > 0 && phraseOf[i] === climaxPh - 1) add('pre-climax', 0.7, 'place');
    if (climaxPh >= 0 && phraseOf[i] === climaxPh + 1) add('post-climax', 0.7, 'place');
    if (barsLeft <= 1) add('closing', 1, 'place');
    if (t === bar.start) add('on-downbeat', 1, 'place');
    else if (beatStarts.has(t)) add('on-beat', 0.8, 'place');
    else add('off-beat', t % 2 === 0 && Number.isInteger(t) ? 0.6 : 1, 'place');
    // the chord
    if (fn === 0) add('root-note', 1, 'chord');
    else if (fn === 3 || fn === 4) add('third-note', 1, 'chord');
    else if (fn === 7) add('fifth-note', 1, 'chord');
    else if (fn === 10 || fn === 11) add('seventh-note', 1, 'chord');
    else if (fn >= 0) add('colour-note', 0.8, 'chord');
    if (commonNext) add('common-tone-next', 0.9, 'chord');
    // the energy and the tension
    if (slope >= 0.12) add('rising-energy', Math.min(1, slope / 0.5), 'energy');
    if (slope <= -0.12) add('falling-energy', Math.min(1, -slope / 0.5), 'energy');
    if (e >= locMax - 0.04 && e >= 0.35) add('crest', 1, 'energy');
    if (e <= locMin + 0.04 && e <= -0.2) add('trough', 1, 'energy');
    if (e >= 0.4) add('high-energy', Math.min(1, e), 'energy');
    if (e <= -0.4) add('low-energy', Math.min(1, -e), 'energy');
    if (tension >= 0.7) add('high-tension', tension, 'energy');
    if (tension <= 0.3) add('low-tension', 1 - tension, 'energy');
    // the drums
    if (d) {
      if (lane(d.kick, g0) > 0) add('on-kick', 1, 'drums');
      if (lane(d.snare, g0) > 0) add('on-snare', 1, 'drums');
      if (lane(d.crash, g0) > 0) add('on-crash', 1, 'drums');
      if (snareEnd) add('into-snare', 1, 'drums');
      if (kickEnd) add('into-kick', 0.8, 'drums');
      if (crashEnd) add('into-crash', 1, 'drums');
      if (fillOver > 0) add('under-fill', Math.max(0.5, fillOver), 'drums');
      if (rel_d >= 1.25) add('busy-drums', Math.min(1, (rel_d - 1) / 0.5), 'drums');
      if (rel_d <= 0.75) add('open-drums', Math.min(1, (1 - rel_d) / 0.5), 'drums');
      add(`${groove}-groove`, groove === 'open' ? 0 : 1, 'groove');
    }
    tags.sort((a, b) => b.w - a.w);

    // the feel the moment wants
    const m = MOOD_FEEL[c.mood];
    const busy = clamp(rel_d - 1, -1, 1);
    const feel: Feel = {
      agitation: clamp(m.agitation + 0.5 * e + 0.4 * (tension - 0.5), -1, 1),
      roughness: clamp(m.roughness + 0.5 * (tension - 0.5), -1, 1),
      ornament: clamp(m.ornament + 0.3 * e - 0.3 * busy, -1, 1),
      weight: clamp(m.weight + 0.4 * e, -1, 1),
      looseness: clamp(m.looseness - 0.4 * busy - (lane(d?.kick, g0) > 0 || lane(d?.snare, g0) > 0 ? 0.2 : 0), -1, 1),
    };
    for (const k of Object.keys(feel) as (keyof Feel)[]) feel[k] = r2(feel[k]);

    const facts: Record<string, number | string> = {
      beats: r2(beats), ms: Math.round((n.len * 15000) / bpm), energy: r2(e), slope: r2(slope), tension: r2(tension), groove,
      ...(inI !== null ? { in: inI } : {}), ...(outI !== null ? { out: outI } : {}),
      ...(d ? { drums: r2(rel_d) } : {}), ...(room ? { room } : {}), ...(ph?.role ? { role: ph.role } : {}),
    };
    return { i, step: Math.floor(n.t), midi: n.midi, len: n.len, tags, feel, facts };
  });

  // ---- cells
  const cells: CellRead[] = [];
  const dI = notes.slice(1).map((n, k) => n.midi - notes[k].midi);
  const run = (ok: (k: number) => boolean, id: string, min: number) => {
    let k = 0;
    while (k < dI.length) {
      if (!ok(k)) { k++; continue; }
      let m = k;
      while (m + 1 < dI.length && ok(m + 1)) m++;
      const count = m - k + 2;
      if (count >= min) cells.push({ from: k, to: m + 1, id, w: r2(clamp(0.5 + 0.15 * (count - min + 1))) });
      k = m + 1;
    }
  };
  run((k) => dI[k] >= 1 && dI[k] <= 4, 'stair-up', 3);
  run((k) => dI[k] <= -1 && dI[k] >= -4, 'stair-down', 3);
  run((k) => dI[k] === 0, 'static-run', 3);
  const beatsOf = (n: BaseNote) => n.len / beatAt(song, n.t);
  const touching = (k: number) => k + 1 < notes.length && notes[k + 1].t - (notes[k].t + notes[k].len) < 0.01;
  {
    let k = 0;
    while (k < notes.length) {
      if (beatsOf(notes[k]) > 0.5) { k++; continue; }
      let m = k;
      while (m + 1 < notes.length && beatsOf(notes[m + 1]) <= 0.5 && touching(m)) m++;
      if (m - k + 1 >= 3) cells.push({ from: k, to: m, id: 'dense-cluster', w: r2(clamp(0.5 + 0.15 * (m - k - 1))) });
      k = m + 1;
    }
  }
  for (let k = 1; k + 1 < notes.length; k++) {
    if (dI[k - 1] >= 1 && dI[k] <= -1) cells.push({ from: k - 1, to: k + 1, id: 'arch', w: 0.8 });
    if (dI[k - 1] <= -1 && dI[k] >= 1) cells.push({ from: k - 1, to: k + 1, id: 'valley', w: 0.8 });
  }
  for (let k = 0; k + 2 < notes.length; k++) {
    if (Math.abs(dI[k]) >= 3 && Math.abs(dI[k + 1]) >= 3 && Math.abs(dI[k + 2] ?? 0) >= 3 && Math.sign(dI[k]) === -Math.sign(dI[k + 1]) && Math.sign(dI[k + 1]) === -Math.sign(dI[k + 2])) cells.push({ from: k, to: k + 3, id: 'zigzag', w: 0.8 });
  }
  for (let k = 0; k + 1 < dI.length; k++) {
    if (Math.abs(dI[k]) >= 5 && Math.sign(dI[k + 1]) === -Math.sign(dI[k]) && Math.abs(dI[k + 1]) <= 4) cells.push({ from: k, to: k + 2, id: 'leap-and-return', w: 0.9 });
  }
  const sym = notes.map((n) => { const b = beatsOf(n); return b <= 0.5 ? 'S' : b > 1 ? 'L' : 'M'; });
  for (let k = 0; k + 2 < notes.length; k++) {
    const w3 = sym.slice(k, k + 3).join('');
    if (w3 === 'LSS') cells.push({ from: k, to: k + 2, id: 'long-short-short', w: 0.9 });
    if (w3 === 'SSL') cells.push({ from: k, to: k + 2, id: 'short-short-long', w: 0.9 });
    if (/^(.)\1\1$/.test(w3) && notes.slice(k, k + 3).every((n) => Math.abs(n.len - notes[k].len) < 1e-6) && w3 !== 'SSS') cells.push({ from: k, to: k + 2, id: 'even-pulse', w: 0.8 });
    if (k + 3 < notes.length && /^(LS|SL|MS|SM){2}$/.test(sym.slice(k, k + 4).join('')) && sym[k] === sym[k + 2]) cells.push({ from: k, to: k + 3, id: 'lilt', w: 0.8 });
  }
  cells.sort((a, b) => a.from - b.from || b.w - a.w);

  // ---- phrases
  const sig = (p: { from: number; to: number }) => notes.slice(p.from, p.to + 1).map((n) => `${r2(n.len)}`).join(',');
  const lens = phr.map((p) => (p.to - p.from + 1));
  const perBar = phr.map((p, k) => lens[k] / Math.max(1, barIx(notes[p.to].t + notes[p.to].len - 1e-6) - barIx(notes[p.from].t) + 1));
  const meanPerBar = perBar.length ? perBar.reduce((a, b) => a + b, 0) / perBar.length : 0;
  const phrases: PhraseRead[] = phr.map((p, k) => {
    const a = notes[p.from], z = notes[p.to];
    const tags: ReadTag[] = [];
    const add = (id: string, w = 1) => { if (w >= MIN_W) tags.push({ id, w: r2(clamp(w)), family: 'place' }); };
    if (k === 0) add('opening-phrase');
    if (p.role === 'call') add('call-phrase');
    if (p.role === 'answer') add('answer-phrase');
    if (p.role === 'climax') add('climax-phrase');
    if (p.role === 'end') add('final-phrase');
    if (climaxPh > 0 && k === climaxPh - 1) add('pre-climax-phrase', 0.8);
    const first = phr.findIndex((q, m) => m < k && lens[m] >= 2 && sig(q) === sig(p));
    if (first >= 0 && lens[k] >= 2) add('repeat-copy', 0.9);
    else if (lens[k] >= 2 && phr.some((q, m) => m > k && sig(q) === sig(p))) add('repeat-source', 0.9);
    if (z.midi - a.midi >= 4) add('rising-phrase');
    if (z.midi - a.midi <= -4) add('falling-phrase');
    if (perBar[k] >= 1.3 * meanPerBar && meanPerBar > 0) add('busy-phrase', Math.min(1, perBar[k] / meanPerBar - 0.5));
    if (perBar[k] <= 0.7 * meanPerBar) add('sparse-phrase', Math.min(1, 1.2 - perBar[k] / Math.max(0.01, meanPerBar)));
    const ms = notes.slice(p.from, p.to + 1).map((n) => n.midi);
    if (Math.max(...ms) - Math.min(...ms) >= 9) add('wide-phrase');
    return { from: p.from, to: p.to, role: p.role, bars: [barIx(a.t), barIx(z.t + z.len - 1e-6)] as [number, number], tags, ...(first >= 0 && lens[k] >= 2 ? { copyOf: first } : {}) };
  });

  // ---- joints
  const joints: JointRead[] = notes.slice(1).map((b, k) => {
    const a = notes[k];
    const tags: ReadTag[] = [];
    const add = (id: string, w = 1, family: ReadTag['family'] = 'shape') => { tags.push({ id, w, family }); };
    const di = b.midi - a.midi, gap = b.t - (a.t + a.len);
    add(di === 0 ? 'repeat' : `${Math.abs(di) >= 5 ? 'leap' : Math.abs(di) >= 3 ? 'skip' : 'step'}-${di > 0 ? 'up' : 'down'}`);
    add(gap > 0.01 ? 'rest-between' : 'touching');
    // (the gap that starts in the note before: when it is joined by notes in between, the first of them is next)
    const g = gaps.find((x) => x.from?.step === Math.floor(a.t));
    if (g) {
      add(`gap-${g.kind}`, 1, 'place');
      add(g.picked ? 'gap-picked' : 'gap-bare', 1, 'place');
      if (g.fill) add(`joined-${g.fill.how}`, 1, 'place');
    }
    return { a: k, b: k + 1, tags };
  });

  // ---- the solo
  const longN = notes.filter((n) => n.len > beatAt(song, n.t)).length;
  const gv = new Map<string, number>();
  for (const g of grooves) gv.set(g, (gv.get(g) ?? 0) + 1);
  const groove = [...gv].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'open';
  const tags = [`mood-${c.mood}`, `${groove}-groove`, meanE > 0.15 ? 'strong-solo' : meanE < -0.15 ? 'calm-solo' : 'even-solo', bpm >= 140 ? 'fast-tempo' : bpm <= 90 ? 'slow-tempo' : 'mid-tempo'];
  const line = `${c.mood}, ${bars.length} bars at ${Math.round(bpm)} bpm${c.curve?.shape ? `, ${c.curve.shape}` : ''}; ${groove} groove${d ? `, drums ${meanDensity >= 0.6 ? 'busy' : meanDensity <= 0.35 ? 'open' : 'moderate'}` : ''}; ${notes.length} notes (${longN} long) in ${phr.length} phrases`;
  return { notes: reads, cells, phrases, joints, solo: { line, tags } };
}
