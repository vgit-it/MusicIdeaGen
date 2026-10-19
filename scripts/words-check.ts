// The words check: the Words tab's lines rendered by a voice with no audio played, to catch broken sounds (NaN, clipping, silence)
// and to show how each line comes out. Run: npm run words-check  (optional: a voice, e.g. rock)

import { FOF_RATE, renderFof } from '../src/audio/fof';
import type { SungNote } from '../src/audio/sing';
import { fofFor } from '../src/audio/voices';
import { loadDictionary, wordsOf } from '../src/lab/words';
import type { Genre } from '../src/genres';

await loadDictionary();
const genre = (process.argv[2] as Genre) || 'rock';
const LINES = ['never ever forever together', 'water better city butter', 'world girl bird burn turn', 'all fall cold gold little bottle', 'i will never let you go', 'the river is calling me home'];
for (const line of LINES) {
  const syls = wordsOf(line).flatMap((w) => w.syllables);
  let t = 0;
  const notes: SungNote[] = syls.map((s) => { const d = s.stress ? 0.4 : 0.29; const n: SungNote = { t, end: t + d * 0.92, midi: 55 + (s.stress ? 2 : 0), vel: 0.7, syl: s }; t += d; return n; });
  const out = renderFof(notes, { ...fofFor(genre, 17, false), energy: 0.5 }, 0.3);
  let bad = 0, peak = 0, e = 0;
  for (const x of out) { if (!Number.isFinite(x)) bad++; peak = Math.max(peak, Math.abs(x)); e += x * x; }
  console.log(line.padEnd(34), `${(out.length / FOF_RATE).toFixed(1)} s`, `peak ${peak.toFixed(2)}`, `rms ${Math.sqrt(e / out.length).toFixed(3)}`, bad ? `NaN x${bad}` : 'ok');
}
