// Checks the planned solo writer (docs/SOLO-PLAN.md, src/parts/soloplan.ts) on real songs, and puts it beside the other writer
// (the same songs, only the solo written another way): every planned landing sounds, no notes overlap or leave the section, the
// call ends up and off the root, the answer comes home, one climax and it is high, the mood and tension reach it; then the numbers
// that were wrong with the other writer (the same note twice in a row, a rhythm that never comes back, the line not following its plan).
//   npm run solo-plan-check        (N=140 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { chordTones } from '../src/parts/guitar2';
import { SCALES } from '../src/theory';
import { buildTrack, defaultTrackOptions } from '../src/track';

const N = Number(process.env.N ?? 140);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 25) console.log('FAIL ' + m); };

interface Agg {
  solos: number; notes: number; bars: number; steps: number; covered: number;
  pairs: number; run3: number; eq4: number; same: number; moves: number; leaps: number; small: number;
  corr: number[]; bandSd: number[]; rhyBars: number; rhyAgain: number; exact: number; held: number; lens: number;
  long8: number; long12: number; noLong: number; off: number; offFree: number; offHeld: number; offBeat: number; landings: number; fall: number; falls: number; callUp: number; calls: number; answerRoot: number; answers: number; climaxHigh: number; climaxes: number; peakTop: number; peakGap: number; landCorr: number[]; waypoints: number;
}
const zero = (): Agg => ({ solos: 0, notes: 0, bars: 0, steps: 0, covered: 0, pairs: 0, run3: 0, eq4: 0, same: 0, moves: 0, leaps: 0, small: 0, corr: [], bandSd: [], rhyBars: 0, rhyAgain: 0, exact: 0, held: 0, lens: 0, long8: 0, long12: 0, noLong: 0, off: 0, offFree: 0, offHeld: 0, offBeat: 0, landings: 0, fall: 0, falls: 0, callUp: 0, calls: 0, answerRoot: 0, answers: 0, climaxHigh: 0, climaxes: 0, peakTop: 0, peakGap: 0, landCorr: [], waypoints: 0 });
const corr = (a: number[], b: number[]) => {
  const n = a.length; if (n < 3) return 0;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va && vb ? s / Math.sqrt(va * vb) : 0;
};
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const A: Record<'old' | 'plan', Agg> = { old: zero(), plan: zero() };
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `sp-${i}-${genre}`;
  const idea = generate({ genre, meter: '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  for (const which of ['old', 'plan'] as const) {
    const sections = buildTrack(idea, { ...defaultTrackOptions(idea), soloPlan: which === 'plan' ? 'on' : 'off' } as never).sections as any[];
    for (const sec of sections) {
      if (!sec.section?.solo) continue;
      const total = sec.song.total, a = A[which];
      const hits = sec.guitar2.filter((h: any) => !h.mute && h.notes.length && !h.shift).sort((x: any, y: any) => x.step - y.step);
      if (hits.length < 12) continue;
      a.solos++; a.notes += hits.length; a.bars += sec.song.bars.length; a.steps += total;
      let run = 1, lenRun = 1, cov = 0, own8 = 0;
      const scale = SCALES[sec.song.mode] as readonly number[];
      const rhy = new Map<number, string>(), sig = new Map<number, string>(), pitch = new Map<number, number[]>(), lensByBar = new Map<number, Set<number>>();
      hits.forEach((x: any, k: number) => {
        const p = hits[k - 1], b = Math.floor(x.step / 16);
        if (x.step < 0 || x.step >= total) fail(`${which} ${s}: note at ${x.step} outside ${total}`);
        cov += Math.min(x.len, total - x.step); a.lens++;
        if (x.len >= 4) a.held++;
        if (x.len >= 8) { a.long8++; own8++; }
        if (x.len >= 12) a.long12++;
        if (!scale.includes((((x.notes[0] - sec.song.key) % 12) + 12) % 12)) {
          // (off the scale: a chord note of a borrowed chord is allowed to be)
          const chord = sec.chords.timeline[sec.chords.chordIdx[Math.min(total - 1, x.step)]].chord;
          const tone = chordTones(sec.song.key, chord).includes(((x.notes[0] % 12) + 12) % 12);
          a.off++;
          if (!tone) { a.offFree++; if (x.len >= 4) a.offHeld++; if (x.step % 4 === 0) a.offBeat++; }
        }
        rhy.set(b, (rhy.get(b) ?? '') + (x.step % 16) + ',');
        sig.set(b, (sig.get(b) ?? '') + (x.step % 16) + ':' + x.notes[0] + ':' + x.len + ',');
        (pitch.get(b) ?? pitch.set(b, []).get(b)!).push(x.notes[0]);
        (lensByBar.get(b) ?? lensByBar.set(b, new Set()).get(b)!).add(x.len);
        if (!p) return;
        if (p.step + p.len > x.step + 0.01 && !p.notes.some((n: number) => x.notes.includes(n))) fail(`${which} ${s}: note at ${p.step} len ${p.len} runs into ${x.step}`);
        const d = x.notes[0] - p.notes[0];
        a.moves++;
        if (d === 0) { a.same++; run++; } else { if (run >= 3) a.run3++; run = 1; }
        if (d === 0 && x.len === p.len && p.step + p.len === x.step && x.len >= 2) a.pairs++;
        if (x.len === p.len && x.len >= 2 && p.step + p.len === x.step) { lenRun++; if (lenRun === 4) a.eq4++; } else lenRun = 1;
        if (Math.abs(d) >= 7) a.leaps++;
        if (Math.abs(d) <= 2) a.small++;
      });
      a.covered += cov;
      if (!own8) a.noLong++;
      const rs = [...rhy.values()].filter((r) => r.split(',').length > 3);
      for (let x = 0; x < rs.length; x++) { a.rhyBars++; if (rs.some((r, j) => j !== x && r === rs[x])) a.rhyAgain++; }
      const ss = [...sig.values()].filter((r) => r.split(',').length > 4);
      for (let x = 0; x < ss.length; x++) if (ss.some((r, j) => j !== x && r === ss[x])) a.exact++;
      const c = sec.soloCurve;
      if (c) {
        const bs = [...pitch.keys()].sort((x, y) => x - y);
        const mean = bs.map((b) => avg(pitch.get(b)!));
        const cen = bs.map((b) => c.centre[Math.min(c.centre.length - 1, b * 16 + 8)]);
        // (only solos whose height follows the energy, with it or against it: for the rest there is nothing to follow)
        if (c.pitchC !== 0 && Math.max(...cen) > Math.min(...cen)) a.corr.push(corr(mean, cen));
        const m = avg(mean);
        a.bandSd.push(Math.sqrt(avg(mean.map((x) => (x - m) ** 2))));
      }
      if (which !== 'plan') continue;
      // ---- the plan's own checks
      const L = c?.landings as { step: number; midi: number; len: number; role: string }[] | undefined;
      if (!L?.length) { fail(`plan ${s}: no landings recorded`); continue; }
      const all = sec.guitar2.filter((h: any) => !h.mute && h.notes.length);
      const key = sec.song.key;
      // (a transition into the next section cuts the last beats or the last bar afterwards: a band stop, hits, a snare build)
      const tail = sec.section.tail as Record<string, any> | undefined, lastBar = sec.song.bars[sec.song.bars.length - 1];
      const cut = sec === sections[sections.length - 1] ? lastBar.start : !tail ? total : 'stop' in tail ? tail.stop : 'hits' in tail || 'build' in tail ? lastBar.start : 'push' in tail ? tail.push : total;
      for (const l of L) {
        a.landings++;
        if (l.role === 'waypoint') a.waypoints++;
        const h = all.find((x: any) => x.step === l.step);
        if (!h) { if (l.step < cut) fail(`plan ${s}: landing at ${l.step} (${l.role}) not played`); }
        else if (!h.notes.some((n: number) => n === l.midi || n === l.midi - 12 || n === l.midi + 12 || Math.abs(n - l.midi) <= 12)) fail(`plan ${s}: landing ${l.midi} at ${l.step} played as ${h.notes}`);
        if (l.step + l.len > total) fail(`plan ${s}: landing at ${l.step} len ${l.len} past the end`);
      }
      const real = L.filter((l) => l.role !== 'waypoint');
      if (c.pitchC !== 0 && real.length > 3 && Math.max(...c.centre) > Math.min(...c.centre)) a.landCorr.push(corr(real.map((l) => l.midi), real.map((l) => c.centre[Math.min(c.centre.length - 1, l.step)])));
      const cl = real.filter((l) => l.role === 'climax');
      if (cl.length > 1) fail(`plan ${s}: ${cl.length} climaxes`);
      // (the climax sits highest for its place on the planned height: a solo whose height runs against its energy has no 'highest')
      const up = (l: { step: number; midi: number }) => l.midi - c.centre[Math.min(c.centre.length - 1, l.step)];
      if (cl.length) {
        // (the climax is the solo's top note, and clear of the next landing)
        const top = Math.max(...all.map((h: any) => h.notes[h.notes.length - 1]));
        if (cl[0].midi >= top - 1) a.peakTop++;
        a.peakGap += cl[0].midi - Math.max(...real.filter((l) => l !== cl[0]).map((l) => l.midi), cl[0].midi - 12);
      }
      if (cl.length) { a.climaxes++; if (up(cl[0]) >= Math.max(...real.map(up)) - 2) a.climaxHigh++; }
      // (an answer comes down from its call)
      real.forEach((l, k) => { if (l.role === 'answer' && k > 0) { a.falls++; if (l.midi <= real[k - 1].midi) a.fall++; } });
      for (const l of real) {
        const root = (sec.song.key + (sec.chords.timeline.find((e: any, i: number, arr: any[]) => e.step <= l.step && (i + 1 === arr.length || arr[i + 1].step > l.step))?.chord.root ?? 0)) % 12;
        if (l.role === 'call') { a.calls++; if (((l.midi % 12) + 12) % 12 !== root) a.callUp++; }
        if (l.role === 'answer' || l.role === 'end') { a.answers++; if (((l.midi % 12) + 12) % 12 === root) a.answerRoot++; }
      }
      void key;
    }
  }
}
const o = A.old, p = A.plan, pct = (x: number, y: number) => (y ? `${(100 * x / y).toFixed(0)}%` : '-');
const row = (name: string, f: (a: Agg) => string) => console.log(`${name.padEnd(46)} ${f(o).padStart(8)} ${f(p).padStart(8)}`);
console.log(`${''.padEnd(46)} ${'other'.padStart(8)} ${'planned'.padStart(8)}   (${p.solos} solos)`);
row('notes a bar', (a) => (a.notes / a.bars).toFixed(1));
row('held notes (a beat+) a bar', (a) => (a.held / a.bars).toFixed(1));
row('time silent', (a) => pct(a.steps - a.covered, a.steps));
row('same note as the one before', (a) => pct(a.same, a.moves));
row('same note, same length, touching (a solo)', (a) => (a.pairs / a.solos).toFixed(1));
row('runs of 3+ the same note (a solo)', (a) => (a.run3 / a.solos).toFixed(1));
row('4+ touching notes of one length (a solo)', (a) => (a.eq4 / a.solos).toFixed(1));
row('moves of a 5th or more / of a tone or less', (a) => `${pct(a.leaps, a.moves)}/${pct(a.small, a.moves)}`);
row('notes of 2+ beats / of 3+ beats (a solo)', (a) => `${(a.long8 / a.solos).toFixed(1)}/${(a.long12 / a.solos).toFixed(1)}`);
row('notes off the scale (chord notes of a borrowed chord too)', (a) => pct(a.off, a.notes));
row('notes off the scale and not a chord note', (a) => pct(a.offFree, a.notes));
row('bars whose rhythm comes back', (a) => pct(a.rhyAgain, a.rhyBars));
row('bars played again note for note', (a) => pct(a.exact, a.rhyBars));
row('bar-mean pitch vs the planned height (corr)', (a) => avg(a.corr).toFixed(2));
row('spread of bar-mean pitch (semitones)', (a) => avg(a.bandSd).toFixed(1));
console.log(`the landings follow the planned height (corr, solos where it follows the energy) ${avg(p.landCorr).toFixed(2)}`);
console.log(`the climax is the solo's top note ${pct(p.peakTop, p.climaxes)}, and over the next-highest landing by ${(p.peakGap / Math.max(1, p.climaxes)).toFixed(1)} semitones`);
console.log(`an answer lands lower than the landing before it ${pct(p.fall, p.falls)}`);
console.log(`planned: ${p.landings} landings (${p.waypoints} waypoints), calls off the root ${pct(p.callUp, p.calls)}, answers on the root ${pct(p.answerRoot, p.answers)}, climax highest for its place ${pct(p.climaxHigh, p.climaxes)} (${p.climaxes} of ${p.solos} solos have one)`);
if (p.solos < 20) fail('too few solos');
// round 2, step 4: licks played again
if (p.rhyAgain / p.rhyBars < 0.12) fail(`bars whose rhythm comes back ${pct(p.rhyAgain, p.rhyBars)}, under 12%`);
if (p.exact / p.rhyBars > 0.1) fail(`bars played again note for note ${pct(p.exact, p.rhyBars)}, over 10%`);
// round 2, step 3: more long holds
if (p.long8 / p.solos < Math.max(4.7, o.long8 / o.solos)) fail(`notes of 2+ beats ${(p.long8 / p.solos).toFixed(1)} a solo, under the other writer's ${(o.long8 / o.solos).toFixed(1)}`);
if (p.long12 / p.solos < 0.8) fail(`notes of 3+ beats ${(p.long12 / p.solos).toFixed(1)} a solo, under 0.8`);
if (p.noLong / p.solos > 0.02) fail(`${p.noLong} solos with no note of 2+ beats`);
// round 2, step 2: a clear peak
if (p.climaxes && p.peakTop / p.climaxes < 0.85) fail(`the climax is the top note in only ${pct(p.peakTop, p.climaxes)}`);
if (p.climaxes && p.peakGap / p.climaxes < 2.5) fail('the climax should clear the next landing by 2.5+ semitones');
// round 2, step 1: lick notes outside the scale are moved into the key
if (p.offFree / p.notes > 0.015) fail(`off-scale notes that are not chord notes ${pct(p.offFree, p.notes)}, over 1.5%`);
if (p.offHeld) fail(`${p.offHeld} held notes off the scale`);
if (p.calls && p.callUp / p.calls < 0.8) fail('calls should end off the root');
if (p.answers && p.answerRoot / p.answers < 0.5) fail('answers should come home');
if (p.climaxes && p.climaxHigh / p.climaxes < 0.7) fail('the climax should be the highest landing for its place on the planned height');
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
