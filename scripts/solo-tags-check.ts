// Checks the solo lick tags (docs/SOLO-PLAN.md, src/parts/solotags.ts) on the library: how the tags spread, that the mood fit
// puts the moods where the vocal's interval table does (small and falling for melancholic and dark, wide and rising for triumphant,
// rough for tense), and that the fits are finite and spread enough to steer a pick.
//   npm run solo-tags-check
import { RHYTHMS } from '../src/parts/reallicks';
import { LIB_SHAPES, moodFit, rhythmTags, shapeRel, shapeTags } from '../src/parts/solotags';
import { MOODS } from '../src/tension';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL ' + m); };
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const DEG = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
const show = (s: (typeof LIB_SHAPES)[number]) => shapeRel(s).map((r) => DEG[((r % 12) + 12) % 12]).join('-');

const tags = LIB_SHAPES.map((s) => shapeTags(s));
const count = <T extends string>(xs: T[]) => { const m: Record<string, number> = {}; for (const x of xs) m[x] = (m[x] ?? 0) + 1; return Object.entries(m).map(([k, v]) => `${k} ${pct(v / xs.length)}`).join(', '); };
console.log(`${LIB_SHAPES.length} shapes`);
console.log('contour:', count(tags.map((t) => t.contour)));
console.log(`strong end ${pct(tags.filter((t) => t.strongEnd).length / tags.length)}, with a leap stepped back from ${pct(tags.filter((t) => t.leapFill).length / tags.length)}, with a repeat ${pct(tags.filter((t) => t.repeats).length / tags.length)}, mean move ${(tags.reduce((a, t) => a + t.meanMove, 0) / tags.length).toFixed(1)}`);
const rt = RHYTHMS.map((r) => rhythmTags(r));
console.log(`${RHYTHMS.length} rhythms; busyness:`, count(rt.map((t) => t.busyness)));
console.log(`ends long ${pct(rt.filter((t) => t.endsLong).length / rt.length)}, off the beat ${pct(rt.reduce((a, t) => a + t.offBeat, 0) / rt.length)}, one length only ${pct(rt.filter((t) => t.lengths === 1).length / rt.length)}`);
for (const t of rt) if (!Number.isFinite(t.perBeat) || t.perBeat <= 0) fail('rhythm perBeat ' + t.perBeat);
for (const b of ['sparse', 'steady', 'busy', 'frantic']) if (!rt.some((t) => t.busyness === b)) fail(`no ${b} rhythms`);

// the mood fit, averaged over the library by the fit itself: what each mood leans toward
const lean: Record<string, { move: number; up: number; rough: number; half: number; spread: [number, number] }> = {};
for (const mood of MOODS) {
  let w = 0, move = 0, up = 0, rough = 0, half = 0, lo = Infinity, hi = 0;
  LIB_SHAPES.forEach((s, i) => {
    const f = moodFit(s, mood, 0.5);
    if (!(f > 0) || !Number.isFinite(f)) fail(`fit ${f} for ${mood} ${show(s)}`);
    w += f; move += f * tags[i].meanMove; up += f * tags[i].up; rough += f * tags[i].roughShare; half += f * tags[i].halfShare;
    lo = Math.min(lo, f); hi = Math.max(hi, f);
  });
  lean[mood] = { move: move / w, up: up / w, rough: rough / w, half: half / w, spread: [lo, hi] };
  const top = LIB_SHAPES.map((s, i) => ({ s, f: moodFit(s, mood, 0.5), i })).sort((a, b) => b.f - a.f).slice(0, 4).map((x) => show(x.s)).join('  ');
  console.log(`${mood.padEnd(11)} move ${lean[mood].move.toFixed(2)} up ${pct(lean[mood].up)} half ${pct(lean[mood].half)} rough ${pct(lean[mood].rough)} fit ${lo.toFixed(2)}-${hi.toFixed(2)}  best: ${top}`);
}
const L = lean;
if (!(L.melancholic.move < L.triumphant.move)) fail('melancholic should move smaller than triumphant');
if (!(L.dark.up < L.triumphant.up)) fail('dark should go up less than triumphant');
if (!(L.tense.rough > L.happy.rough)) fail('tense should be rougher than happy');
if (!(L.angry.move > L.melancholic.move)) fail('angry should move bigger than melancholic');
for (const mood of MOODS) if (!(L[mood].spread[1] / L[mood].spread[0] >= 1.5)) fail(`${mood}: fits too flat to steer a pick (${L[mood].spread.map((x) => x.toFixed(2))})`);
// tension makes it rougher and wider
const meanFit = (mood: (typeof MOODS)[number], t: number, key: 'rough' | 'move') => {
  let w = 0, v = 0;
  LIB_SHAPES.forEach((s, i) => { const f = moodFit(s, mood, t); w += f; v += f * (key === 'rough' ? tags[i].roughShare : tags[i].meanMove); });
  return v / w;
};
if (!(meanFit('tense', 1, 'rough') > meanFit('tense', 0, 'rough'))) fail('tension should make tense rougher');
if (!(meanFit('happy', 1, 'move') > meanFit('happy', 0, 'move'))) fail('tension should make the line wider');
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
