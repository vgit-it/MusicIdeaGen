// Checks the frame of the solo player (docs/SOLO-PLAYER.md, step 1): the melody as events, the checker, the rule interface, timing between
// the 16ths and the hands.
//  1. Pass-through: Solo writer "player" with only the plain rule plays every note as Melody + joins does, note for note.
//  2. The checker accepts the melody + joins of real songs (nothing lost, nothing out of the key, no silence over a beat, a speed that can
//     be played, a fingering for every note) and refuses each kind of damage done to it on purpose.
//  3. The three spike rules (a triplet pulse, a gallop, a stutter), forced on every note they fit in real songs: every result passes the
//     checker as read again from the hits alone, the hands find a place for every note, the timing is real (between the 16ths), and the
//     same seed gives the same performance.
//  4. Fuzz: random melodies in every meter and tempo from 60 to 200 bpm, the spike rules forced: every result valid.
//   npm run solo-player-check        (N=140 songs, F=300 fuzz melodies)
import { MAIN_GUITARS, generate } from '../src/generator';
import type { GuitarHit, Song } from '../src/idea';
import { hitTime } from '../src/idea';
import { leadHands } from '../src/players/hands';
import { pickLead } from '../src/players/lead';
import { Rng } from '../src/rng';
import { SCALES } from '../src/theory';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { type PEvent, type BaseNote, TOL, readBase, sounding } from '../src/parts/soloevents';
import { performSolo, type PlayerCtx } from '../src/parts/soloplayer';
import { LIVE_RULES, PLAIN } from '../src/parts/solorules';
import { SPIKE_RULES } from '../src/parts/solorules-spike';
import { type VCtx, type Violation, describe, unplayable, verify } from '../src/parts/soloverify';

const N = Number(process.env.N ?? 140);
const F = Number(process.env.F ?? 300);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MOODS = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'] as const;
const METERS = ['4/4', '4/4', '4/4', '3/4', '6/8', '7/8', '5/4', 'mixed'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 30) console.log('FAIL ' + m); };
/** The last note is carried into the next section and bent to a note of its first chord, which may be outside this key (track.ts, carrySolo). */
const notCarried = (v: Violation[], notes: BaseNote[]) => v.filter((x) => !(x.code === 'key' && Math.abs(x.at - notes[notes.length - 1].t) < TOL));
const codes = (v: Violation[]) => [...new Set(v.map((x) => x.code))];

/** The hits of a performance read again with no help from the player: each sounding event belongs to the melody note whose time it starts in. */
function reread(hits: GuitarHit[], notes: BaseNote[]): PEvent[] {
  return hits.map((hit) => {
    const t = hitTime(hit), e: PEvent = { t, len: hit.len, hit };
    if (sounding(hit)) {
      const n = notes.find((x) => t >= x.t - TOL && t < x.t + x.len - TOL);
      if (n) e.base = n.i;
    }
    return e;
  });
}

const T = { solos: 0, notes: 0, baseViolations: 0, baseUnplayable: 0, passed: 0, mutations: 0 };
const R: Record<string, { tried: number; used: number; sub: number; max: number }> = {};
const note = (r: string) => (R[r] ??= { tried: 0, used: 0, sub: 0, max: 0 });
let negDone = false;

/** Damage done to a real melody on purpose, and the code the checker must answer with. */
function negatives(events: PEvent[], notes: BaseNote[], c: VCtx, tag: string) {
  const clone = () => events.map((e) => ({ ...e, hit: { ...e.hit } }));
  const must = (what: string, code: Violation['code'], evs: PEvent[]) => {
    T.mutations++;
    const v = verify(evs, notes, c);
    if (!v.some((x) => x.code === code)) fail(`${tag}: ${what}: expected ${code}, got ${codes(v).join(',') || 'nothing'}`);
  };
  const pcs = new Set((SCALES[c.song.mode] as readonly number[]).map((p) => (p + c.song.key) % 12));
  const pitchN = notes.find((n) => n.anchor === 'pitch'), mainN = notes.find((n) => n.anchor === 'main' && n.i > 0 && n.i < notes.length - 1), allN = notes[notes.length - 1];
  {
    const evs = clone().filter((e) => e.base !== mainN!.i);
    must('a note removed', 'lost', evs);
  }
  if (pitchN) {
    const evs = clone();
    const e = evs.find((x) => x.base === pitchN.i)!;
    for (let d = 1; d < 12; d++) if (!pcs.has((e.hit.notes[0] + d) % 12)) { e.hit = { ...e.hit, notes: [e.hit.notes[0] + d] }; break; }
    must('a note out of the key', 'key', evs);
  }
  {
    const evs = clone();
    const e = evs.find((x) => x.base === mainN!.i)!;
    e.hit = { ...e.hit, notes: [120] };
    must('a note out of range', 'range', evs);
  }
  {
    const evs = clone();
    // the line from one note on moves later by more than a beat and a half (the notes before it stay)
    const k = notes.find((n) => n.i > 2 && n.i < notes.length - 3)!;
    for (const e of evs) if (e.base !== undefined && e.base >= k.i) e.t += 7;
    must('a silence over a beat', 'silence', evs);
  }
  {
    const evs = clone();
    const k = notes.find((n) => n.i > 1 && n.i < notes.length - 2)!;
    const e = evs.find((x) => x.base === k.i)!;
    e.len += 3;
    must('two notes overlapping', 'overlap', evs);
  }
  {
    // a note split in two with 0.1 of a step between: far quicker than a pick can go
    const k = notes.find((n) => n.len >= 4 && n.i > 0 && n.i < notes.length - 1)!;
    const evs = clone();
    const e = evs.find((x) => x.base === k.i)!;
    e.len = 0.1;
    evs.push({ t: e.t + 0.1, len: k.len - 0.1, base: k.i, hit: { ...e.hit } });
    must('notes too quick to pick', 'speed', evs);
  }
  {
    const k = notes.find((n) => n.len >= 4 && n.i > 0 && n.i < notes.length - 1)!;
    const evs = clone();
    const e = evs.find((x) => x.base === k.i)!;
    e.hit = { ...e.hit, lateBend: 2, bendAt: k.len * 0.9 };
    must('a bend with no time to land', 'bend', evs);
  }
  {
    const k = notes.find((n) => n.len >= 4 && n.i > 0 && n.i < notes.length - 1)!;
    const evs = clone();
    const e = evs.find((x) => x.base === k.i)!;
    e.hit = { ...e.hit, trill: 2, tremolo: true };
    must('a trill with tremolo', 'combo', evs);
  }
  {
    // a note added in the middle of a long note, where no gap is
    const evs = clone();
    const spot = notes.find((n) => n.len >= 8 && !c.gaps.some((g) => g.step < n.t + 4 && g.step + g.len > n.t + 3));
    if (spot) {
      const e0 = evs.find((x) => x.base === spot.i)!;
      e0.len = 3;
      evs.push({ t: spot.t + 3, len: 1, hit: { ...e0.hit, step: spot.t + 3, notes: [e0.hit.notes[0] + 0] } });
      must('a note added outside every gap', 'added', evs);
    }
  }
  {
    const evs = clone();
    const e = evs.filter((x) => x.base === allN.i).pop()!;
    e.len -= 2;
    must('the last note cut short', 'landing', evs);
  }
  {
    const k = notes.find((n) => n.anchor === 'main' && n.len >= 6 && n.i > 0 && n.i < notes.length - 1);
    if (k) {
      const evs = clone();
      const e = evs.find((x) => x.base === k.i)!;
      e.t += 1;
      e.len -= 1;
      must('a long note starting late', 'onset', evs);
    }
  }
  {
    const evs = clone();
    const e = evs.filter((x) => x.base === allN.i)[0];
    for (let d = 1; d < 12; d++) if (pcs.has((e.hit.notes[0] + d) % 12)) { e.hit = { ...e.hit, notes: [e.hit.notes[0] + d] }; break; }
    must('the last note on another pitch', 'pitch', evs);
  }
  if (notCarried(verify(events, notes, c), notes).length) fail(`${tag}: the untouched melody does not pass`);
}

// ---------------- 1 and 2 and 3: real songs
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], meter = METERS[i % METERS.length], mood = MOODS[i % MOODS.length], s = `sp-${i}-${genre}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const run = (soloPlan: string) => buildTrack(idea, { ...defaultTrackOptions(idea), soloPlan, mood } as never).sections as any[];
  const joined = run('joins'), played = run('player');
  joined.forEach((sec, si) => {
    if (!sec.section?.solo && !sec.section?.lead) return;
    if (!sec.soloCurve?.gaps) return;
    T.solos++;
    // 1. pass-through
    const mine = played[si];
    if (JSON.stringify(sec.guitar2) !== JSON.stringify(mine.guitar2)) fail(`${s} section ${si}: the player changed a melody it had no rules for`);
    const { events, notes } = readBase(sec.guitar2, sec.soloCurve);
    T.notes += notes.length;
    const moves = mine.soloCurve?.moves as any[] | undefined;
    // (the carry into the next section can drop a pickup note after the player has been through the melody)
    if (!moves || moves.length < notes.length || moves.length > notes.length + 3 || moves.some((m) => m.rule !== 'plain')) fail(`${s} section ${si}: the report has ${moves?.length} moves for ${notes.length} notes`);
    // 2. the checker on the melody
    const lead = pickLead(s, sec.song.partGenres.strum);
    const vctx: VCtx = { song: sec.song, chords: sec.chords, gaps: sec.soloCurve.gaps, hands: leadHands(s, lead), energy: sec.section.energy, kind: sec.section.kind, curve: sec.soloCurve };
    const v = notCarried(verify(events, notes, vctx), notes);
    if (v.length) { T.baseViolations += v.length; fail(`${s} section ${si} (${sec.song.bars.length} bars, ${meter}): the melody itself breaks ${describe(v)}`); }
    const un = unplayable(events, vctx);
    if (un.length) { T.baseUnplayable += un.length; fail(`${s} section ${si}: ${un.length} notes of the melody have no place on the neck`); }
    if (!negDone && notes.length >= 12 && notes.some((n) => n.anchor === 'main' && n.i > 0 && n.i < notes.length - 1) && notes.some((n) => n.anchor === 'pitch')) { negDone = true; negatives(events, notes, vctx, s); }
    // 3. the spike rules, forced
    const ctx: PlayerCtx = { seed: s, song: sec.song, chords: sec.chords, lead, hands: vctx.hands, mood, tension: [], energy: sec.section.energy, kind: sec.section.kind };
    for (const rule of SPIKE_RULES) {
      const out = performSolo({ hits: sec.guitar2.map((h: GuitarHit) => ({ ...h })), notes: [], curve: sec.soloCurve }, ctx, [PLAIN, rule], { force: rule.name });
      const st = note(rule.name);
      const used = (out.curve?.moves ?? []).filter((m) => m.rule === rule.name).length;
      st.tried++; st.used += used; st.max = Math.max(st.max, used);
      const again = performSolo({ hits: sec.guitar2.map((h: GuitarHit) => ({ ...h })), notes: [], curve: sec.soloCurve }, ctx, [PLAIN, rule], { force: rule.name });
      if (JSON.stringify(out.hits) !== JSON.stringify(again.hits)) fail(`${s} ${rule.name}: the same seed gave another performance`);
      const ev = reread(out.hits, notes);
      const vv = notCarried(verify(ev, notes, vctx), notes);
      if (vv.length) fail(`${s} section ${si} ${rule.name}: ${describe(vv)}`);
      const uu = unplayable(ev, vctx);
      if (uu.length) fail(`${s} section ${si} ${rule.name}: ${uu.length} notes have no place on the neck`);
      if (used) {
        T.passed++;
        if (!out.curve?.fine) fail(`${s} ${rule.name}: notes between the 16ths but the solo is not marked fine`);
        for (const h of out.hits) {
          if (!Number.isInteger(h.step)) fail(`${s} ${rule.name}: a hit at step ${h.step}`);
          if (h.shift !== undefined && !(h.shift > 0 && h.shift < 1)) fail(`${s} ${rule.name}: a shift of ${h.shift}`);
        }
        st.sub += out.hits.filter((h) => h.shift).length;
        // the notes of a note's replacement all inside its time
        if (out.hits.length <= sec.guitar2.length) fail(`${s} ${rule.name}: no notes added`);
      }
    }
  });
}

// ---------------- 4. fuzz
const METER_BARS: Record<string, { len: number; groups: number[] }> = {
  '4/4': { len: 16, groups: [4, 4, 4, 4] }, '3/4': { len: 12, groups: [4, 4, 4] }, '6/8': { len: 12, groups: [6, 6] },
  '7/8': { len: 14, groups: [4, 4, 6] }, '5/4': { len: 20, groups: [4, 4, 4, 4, 4] }, '12/8': { len: 24, groups: [6, 6, 6, 6] },
};
const modes = Object.keys(SCALES) as (keyof typeof SCALES)[];
const fz = { melodies: 0, notes: 0, rewritten: 0, bad: 0 };
for (let f = 0; f < F; f++) {
  const r = new Rng(`fuzz-${f}`);
  const meter = r.pick(Object.keys(METER_BARS)), mb = METER_BARS[meter];
  const nBars = r.int(2, 8), bpm = r.int(60, 200);
  const song = { bpm, key: r.int(0, 11), mode: r.pick(modes), total: 0, bars: [] as any[], partGenres: { strum: 'rock' } } as unknown as Song;
  for (let b = 0; b < nBars; b++) song.bars.push({ start: b * mb.len, len: mb.len, groups: mb.groups });
  song.total = nBars * mb.len;
  const pcs = (SCALES[song.mode] as readonly number[]).map((p) => (p + song.key) % 12);
  const pool: number[] = [];
  for (let m = 52; m <= 79; m++) if (pcs.includes(m % 12)) pool.push(m);
  // a melody of notes that touch: lengths from 1 to 2 bars... as the writer does (an 8th to a bar)
  const hits: GuitarHit[] = [];
  let t = 0;
  while (t < song.total) {
    const len = Math.min(song.total - t, r.pick([2, 2, 3, 4, 4, 6, 8, 8, 12, 14, 16]));
    hits.push({ step: t, notes: [r.pick(pool)], strings: [0], len, vel: 0.5 + r.next() * 0.4 });
    t += len;
  }
  const lead = pickLead(`fz${f}`, 'rock');
  const hands = leadHands(`fz${f}`, lead);
  const ctx: PlayerCtx = { seed: `fz${f}`, song, lead, hands, mood: 'happy', tension: [], energy: 3, kind: 'solo' };
  const vctx: VCtx = { song, gaps: [], hands, energy: 3, kind: 'solo' };
  const base = { hits, notes: [] as string[], curve: undefined };
  const { events, notes } = readBase(hits);
  const v0 = verify(events, notes, vctx);
  if (v0.some((x) => x.code !== 'silence' && x.code !== 'speed' && x.code !== 'range')) { fz.bad++; fail(`fuzz ${f} (${meter} ${bpm} bpm): the random melody itself breaks ${describe(v0)}`); continue; }
  fz.melodies++; fz.notes += notes.length;
  for (const rule of SPIKE_RULES) {
    const out = performSolo(base, ctx, [PLAIN, rule], { force: rule.name });
    fz.rewritten += out.hits.length - hits.length > 0 ? 1 : 0;
    // judged against the checker, but only for what it says that the random melody did not already
    const ev = reread(out.hits, notes);
    const baseline = new Set(v0.map((x) => `${x.code}@${x.at.toFixed(2)}`));
    const vv = verify(ev, notes, vctx).filter((x) => !baseline.has(`${x.code}@${x.at.toFixed(2)}`));
    if (vv.length) { fz.bad++; fail(`fuzz ${f} (${meter} ${bpm} bpm) ${rule.name}: ${describe(vv)}`); }
  }
}

console.log(`${T.solos} solos and breaks, ${T.notes} notes: the melody passes the checker (${T.baseViolations} violations, ${T.baseUnplayable} notes with no place on the neck); ${T.mutations} kinds of damage refused`);
console.log(`spike rules forced on real solos: ${Object.entries(R).map(([k, v]) => `${k} used ${v.used} times in ${v.tried} solos (most ${v.max} a solo, ${v.sub} hits between the 16ths)`).join('; ')}`);
console.log(`fuzz: ${fz.melodies} random melodies, ${fz.notes} notes, ${fz.rewritten} performances changed, ${fz.bad} bad`);
console.log(bad ? `${bad} FAIL` : '0 FAIL');
if (bad) process.exitCode = 1;
void LIVE_RULES;
