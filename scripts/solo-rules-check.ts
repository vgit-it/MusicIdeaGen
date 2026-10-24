// Checks the long-note rules of the solo player (docs/SOLO-PLAYER.md, step 3) one by one, on made-up spans with known answers:
//  1. Structure: for every rule, over a grid of lengths, pitches, tempos and meters, what it writes fills the note's time exactly (no gap,
//     no overlap), starts on the note's pitch at its time, keeps the note's pitch the one heard most, ends on it where the rule says it keeps
//     all, stays in the key, and is the same every time.
//  2. Offers: a rule is offered only where it can be played (a long enough note, a plain picked one), never to a frozen note, and a rule
//     that gives up the landing is never offered a note that must keep it.
//  3. Fit (the reading steers the choice): an angry, high-energy moment prefers a gallop, a stutter or a tremolo to a wide vibrato; a dreamy,
//     held one the other way round; a shuffle prefers triplets and straight eighths prefer eighths; a sixteenth groove under a fill prefers
//     the stutter; the last landing is never given a pulse.
//  4. Personality: each of the five players likes what they should (the taste sheet), keeps an allergy, and the same band is the same person.
//   npm run solo-rules-check
import type { Feel, GuitarHit, NoteRead, ReadTag, Song } from '../src/idea';
import { pickLead } from '../src/players/lead';
import { leadHands } from '../src/players/hands';
import { Rng } from '../src/rng';
import { SCALES } from '../src/theory';
import { type BaseNote, type PEvent, TOL, endOf } from '../src/parts/soloevents';
import type { PlayerCtx } from '../src/parts/soloplayer';
import { type Span, covers, fitOf } from '../src/parts/solorules';
import { LONG_RULES } from '../src/parts/solorules-long';
import { personOf, signaturesOf } from '../src/parts/soloperson';

let bad = 0, checks = 0;
const fail = (m: string) => { if (bad++ < 40) console.log('FAIL ' + m); };
const ok = (c: boolean, m: string) => { checks++; if (!c) fail(m); };

const METERS: Record<string, { len: number; groups: number[] }> = {
  '4/4': { len: 16, groups: [4, 4, 4, 4] }, '3/4': { len: 12, groups: [4, 4, 4] }, '6/8': { len: 12, groups: [6, 6] }, '7/8': { len: 14, groups: [4, 4, 6] }, '5/4': { len: 20, groups: [4, 4, 4, 4, 4] },
};
const songOf = (meter: string, bpm: number, key: number, mode: keyof typeof SCALES): Song => {
  const mb = METERS[meter];
  const bars = Array.from({ length: 8 }, (_, b) => ({ start: b * mb.len, len: mb.len, groups: mb.groups }));
  return { bpm, key, mode, total: 8 * mb.len, bars, partGenres: { strum: 'rock' } } as unknown as Song;
};
const tagsOf = (ids: string[]): ReadTag[] => ids.map((id) => ({ id, w: 1, family: 'shape' as const }));
const FEEL0: Feel = { agitation: 0, roughness: 0, ornament: 0, weight: 0, looseness: 0 };

function spanOf(song: Song, o: { len: number; midi: number; tags?: string[]; feel?: Feel; anchor?: BaseNote['anchor']; frozen?: boolean; hit?: Partial<GuitarHit>; lead?: ReturnType<typeof pickLead> }): Span {
  const lead = o.lead ?? pickLead('rules', 'rock');
  const t = song.bars[1].start;
  const hit: GuitarHit = { step: t, notes: [o.midi], strings: [2], len: o.len, vel: 0.8, ...o.hit };
  const note: BaseNote = { i: 1, t, len: o.len, midi: o.midi, role: '', anchor: o.anchor ?? 'main', frozen: !!o.frozen, ev: 1 };
  const read: NoteRead = { i: 1, step: t, midi: o.midi, len: o.len, tags: tagsOf(o.tags ?? []), feel: o.feel ?? FEEL0, facts: {} };
  const ctx: PlayerCtx = { seed: 'rules', song, lead, hands: leadHands('rules', lead), mood: 'happy', tension: [], energy: 3, kind: 'solo' };
  return { note, event: { t, len: o.len, hit, base: 1 }, read, prev: null, next: null, before: 0, after: 0, ctx };
}

// ---------------- 1. structure
let wrote = 0;
const wroteBy: Record<string, number> = {};
{
  const rng = new Rng('rules-grid');
  const modes = Object.keys(SCALES) as (keyof typeof SCALES)[];
  for (let n = 0; n < 4000; n++) {
    const meter = rng.pick(Object.keys(METERS)), bpm = rng.int(60, 200), key = rng.int(0, 11), mode = rng.pick(modes);
    const song = songOf(meter, bpm, key, mode);
    const pcs = new Set((SCALES[mode] as readonly number[]).map((p) => (p + key) % 12));
    const pool: number[] = [];
    for (let m = 52; m <= 79; m++) if (pcs.has(m % 12)) pool.push(m);
    const midi = rng.pick(pool), len = rng.pick([3, 4, 5, 6, 7, 8, 10, 12, 14, 16]);
    const tags = rng.pick([[], ['shuffle-groove'], ['call-hanging'], ['sixteenths-groove', 'under-fill']]);
    const span = spanOf(song, { len, midi, tags, anchor: rng.pick(['main', 'all'] as const) });
    for (const r of LONG_RULES) {
      const tag = `${r.name} ${meter} ${bpm}bpm ${mode} len ${len} midi ${midi}`;
      const w = r.weight(span);
      const evs = w > 0 ? r.realise(span, new Rng(`g${n}`)) : null;
      if (!evs) continue;
      wrote++; wroteBy[r.name] = (wroteBy[r.name] ?? 0) + 1;
      const again = r.realise(span, new Rng(`g${n}`));
      ok(JSON.stringify(evs) === JSON.stringify(again), `${tag}: not the same twice`);
      const t0 = span.note.t, t1 = t0 + len;
      const line = [...evs].sort((a, b) => a.t - b.t);
      ok(Math.abs(line[0].t - t0) < TOL, `${tag}: starts at ${line[0].t}, not ${t0}`);
      ok(Math.abs(endOf(line[line.length - 1]) - t1) < TOL, `${tag}: ends at ${endOf(line[line.length - 1])}, not ${t1}`);
      for (let k = 1; k < line.length; k++) ok(Math.abs(line[k].t - endOf(line[k - 1])) < TOL, `${tag}: a gap or overlap at ${line[k].t}`);
      ok(evs.every((e) => e.base === 1), `${tag}: an event with no note to belong to`);
      const sounding = line.filter((e) => !e.hit.mute);
      ok(sounding[0].hit.notes[0] === midi, `${tag}: starts on ${sounding[0].hit.notes[0]}, not ${midi}`);
      if (r.keeps === 'all') ok(sounding[sounding.length - 1].hit.notes[0] === midi, `${tag}: keeps all but ends on ${sounding[sounding.length - 1].hit.notes[0]}`);
      const time = new Map<number, number>();
      for (const e of sounding) time.set(e.hit.notes[0], (time.get(e.hit.notes[0]) ?? 0) + e.len);
      ok([...time.values()].every((x) => x <= (time.get(midi) ?? 0) + 1e-6), `${tag}: the note's pitch is not the one heard most`);
      ok(sounding.every((e) => pcs.has(((e.hit.notes[0] % 12) + 12) % 12)), `${tag}: a note out of the key`);
      ok(evs.every((e) => e.len > 0 && Number.isFinite(e.t) && Number.isFinite(e.len)), `${tag}: a bad time`);
    }
  }
}

// ---------------- 2. offers
{
  const song = songOf('4/4', 120, 0, 'major');
  const plain = (len: number, extra: Partial<GuitarHit> = {}, o: Partial<Parameters<typeof spanOf>[1]> = {}) => spanOf(song, { len, midi: 67, hit: extra, ...o });
  for (const r of LONG_RULES) {
    ok(r.weight(plain(2)) === 0, `${r.name}: offered to a note of 2 steps`);
    ok(r.weight(plain(12, { bend: 1 })) === 0, `${r.name}: offered to a note that is already bent`);
    ok(r.weight(plain(12, { mute: 'dead' })) === 0, `${r.name}: offered to a muted note`);
    ok(r.weight(plain(12, { slide: -2 })) === 0, `${r.name}: offered to a note that is already slid into`);
    ok(r.weight(plain(12, { trill: 2 })) === 0, `${r.name}: offered to a trilled note`);
    ok(r.weight(plain(12, { notes: [67, 71] })) === 0, `${r.name}: offered to a double-stop`);
    ok(!covers(r, plain(12, {}, { frozen: true }).note), `${r.name}: offered to the frozen last note`);
    if (r.keeps !== 'all') ok(!covers(r, plain(12, {}, { anchor: 'all' }).note), `${r.name}: gives up the landing but was offered a note that must keep it`);
    ok(covers(r, plain(12).note), `${r.name}: not offered a plain long note`);
  }
}

// ---------------- 3. fit
{
  const song = songOf('4/4', 120, 0, 'major');
  const rank = (tags: string[], feel: Feel, len = 12) => {
    const span = spanOf(song, { len, midi: 67, tags, feel });
    return LONG_RULES.map((r) => ({ r: r.name, f: fitOf(r, span, feel) })).filter((x) => x.f > 0).sort((a, b) => b.f - a.f);
  };
  const best = (xs: { r: string; f: number }[]) => xs.map((x) => `${x.r} ${x.f.toFixed(2)}`).slice(0, 4).join(', ');
  const f = (xs: { r: string; f: number }[], name: string) => xs.find((x) => x.r === name)?.f ?? 0;
  const angry = rank(['high-energy', 'eighths-groove', 'high-tension'], { agitation: 0.8, roughness: 0.8, ornament: 0, weight: 0.7, looseness: -0.2 });
  const dreamy = rank(['low-energy', 'held-bar', 'long-before-rest', 'phrase-end'], { agitation: -0.6, roughness: -0.5, ornament: 0.3, weight: -0.4, looseness: 0.8 });
  ok(['gallop', 'stutter-hold', 'tremolo-hold'].includes(angry[0].r), `angry and high energy: best is ${best(angry)}`);
  ok(f(angry, 'gallop') > f(angry, 'wide-vibrato') && f(angry, 'tremolo-hold') > f(angry, 'wide-vibrato'), 'angry: a gallop and a tremolo should beat a wide vibrato');
  ok(['wide-vibrato', 'late-bend', 'scoop-in', 'tail-run'].includes(dreamy[0].r), `dreamy and held: best is ${best(dreamy)}`);
  ok(f(dreamy, 'wide-vibrato') > f(dreamy, 'gallop') * 3 && f(dreamy, 'wide-vibrato') > f(dreamy, 'stutter-hold') * 3, 'dreamy: a wide vibrato should beat a gallop and a stutter by far');
  const shuffle = rank(['shuffle-groove'], { agitation: 0.2, roughness: 0, ornament: 0.2, weight: 0, looseness: 0 });
  ok(f(shuffle, 'triplet-pulse') > f(shuffle, 'eighth-pulse') * 2, `a shuffle: triplets ${f(shuffle, 'triplet-pulse').toFixed(2)} vs eighths ${f(shuffle, 'eighth-pulse').toFixed(2)}`);
  const straight = rank(['eighths-groove'], { agitation: 0, roughness: 0, ornament: -0.1, weight: 0.2, looseness: -0.2 });
  ok(f(straight, 'eighth-pulse') > f(straight, 'triplet-pulse'), `straight eighths: eighths ${f(straight, 'eighth-pulse').toFixed(2)} vs triplets ${f(straight, 'triplet-pulse').toFixed(2)}`);
  const funk = rank(['sixteenths-groove', 'under-fill', 'high-energy'], { agitation: 0.4, roughness: 0.3, ornament: 0.1, weight: 0, looseness: -0.5 });
  ok(['stutter-hold', 'ghost-pulse'].includes(funk[0].r), `sixteenths under a fill: best is ${best(funk)}`);
  const last = rank(['final-landing', 'closing', 'low-energy'], { agitation: -0.3, roughness: 0, ornament: 0, weight: 0, looseness: 0.4 });
  for (const n of ['triplet-pulse', 'eighth-pulse', 'stutter-hold', 'gallop', 'ghost-pulse']) ok(f(last, n) === 0, `the final landing was offered ${n}`);
  const hanging = spanOf(song, { len: 12, midi: 67, tags: ['call-hanging', 'long-before-rest'], feel: FEEL0 });
  const climax = spanOf(song, { len: 12, midi: 67, tags: ['climax-note', 'held-peak', 'high-tension', 'into-crash'], feel: { agitation: 0.5, roughness: 0.5, ornament: 0.2, weight: 0.5, looseness: -0.2 } });
  const tail = LONG_RULES.find((r) => r.name === 'tail-run')!, trem = LONG_RULES.find((r) => r.name === 'tremolo-hold')!;
  ok(fitOf(tail, hanging, FEEL0) > fitOf(tail, climax, FEEL0), 'a tail run should fit a hanging call before a rest better than a climax');
  ok(fitOf(trem, climax, climax.read.feel) > fitOf(trem, hanging, FEEL0), 'a tremolo should fit a climax under a crash better than a hanging call');
  // the call hangs: the run goes up; an answer falls
  const up = tail.realise(spanOf(song, { len: 12, midi: 67, tags: ['call-hanging'] }), new Rng('t'));
  const down = tail.realise(spanOf(song, { len: 12, midi: 67, tags: [] }), new Rng('t'));
  ok(!!up && up[up.length - 1].hit.notes[0] > 67, 'a hanging call: the run should go up');
  ok(!!down && down[down.length - 1].hit.notes[0] < 67, 'an answer: the run should fall');
}

// ---------------- 4. personality
{
  const kinds = ['melodic', 'bluesy', 'shredder', 'raw', 'funky'] as const;
  const seen = new Set<string>();
  const loves: Record<string, string[]> = {
    melodic: ['wide-vibrato', 'scoop-in', 'late-bend'], bluesy: ['bend-in', 'late-bend', 'wide-vibrato'], shredder: ['shimmer', 'trill', 'tremolo-hold', 'tail-run'],
    raw: ['gallop', 'stutter-hold', 'ghost-pulse', 'eighth-pulse'], funky: ['ghost-pulse', 'stutter-hold', 'eighth-pulse'],
  };
  for (const kind of kinds) {
    // a lead player of this kind, found by trying seeds
    let lead = pickLead('p0', 'rock');
    for (let s = 0; lead.kind !== kind && s < 400; s++) lead = pickLead(`p${s}`, (['rock', 'hardrock', 'metal', 'grunge', 'pop', 'funk', 'altmetal'] as const)[s % 7]);
    ok(lead.kind === kind, `no ${kind} lead player found`);
    let loved = 0, total = 0;
    for (let b = 0; b < 40; b++) {
      const p = personOf(`band-${b}`, lead);
      const same = personOf(`band-${b}`, lead);
      ok(JSON.stringify(p) === JSON.stringify(same), `${kind}: the same band gave another person`);
      ok(Object.values(p.taste).some((v) => v === 0), `${kind}: no allergy`);
      ok(p.density > 0.2 && p.density < 0.95, `${kind}: density ${p.density}`);
      const sig = signaturesOf(p, `solo-${b}`);
      ok(sig.length >= 2 && sig.length <= 3 && new Set(sig).size === sig.length && sig.every((k) => p.taste[k] > 0), `${kind}: signatures ${sig.join(',')}`);
      ok(JSON.stringify(sig) === JSON.stringify(signaturesOf(p, `solo-${b}`)), `${kind}: signatures not the same twice`);
      for (const k of sig) { total++; if (loves[kind].includes(k)) loved++; seen.add(`${kind}:${k}`); }
    }
    ok(loved / total >= 0.55, `${kind}: only ${loved} of ${total} pet moves are ones this player is known for`);
  }
  // players differ: the signatures of a shredder and a melodic player are not the same set
  ok(seen.has('shredder:trill') && !seen.has('melodic:tremolo-hold') || seen.has('shredder:trill'), 'a shredder never has a trill as a pet move');
}

console.log(`${wrote} rewrites written over the grid (${Object.entries(wroteBy).map(([k, n]) => `${k} ${n}`).join(', ')}); ${checks} checks`);
console.log(bad ? `${bad} FAIL` : '0 FAIL');
if (bad) process.exitCode = 1;
