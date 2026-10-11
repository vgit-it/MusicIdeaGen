// Measures how far each pitched sample is from its note, over time, and writes
// src/audio/sample-tuning.json. The app plays each sample with the opposite correction, so notes
// land in tune and don't bend down into pitch.
//
// Why: a plucked string starts a little sharp and settles (the pick stretches it); in the guitar
// samples every note started about 9 cents sharp (up to 22) and fell into pitch over ~0.15 s, which
// distortion turns into an audible bend. Some samples are also simply off: guitar up to 11 cents,
// bass up to 31.
//
// Run after `npm run samples`: `npm run tuning`.
// Only guitars and bass: the piano is stretch-tuned on purpose, and the strings' bowing moves pitch.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'src', 'audio', 'sample-manifest.json'), 'utf8'));
const SETS = ['guitar-electric', 'guitar-acoustic', 'bass-electric'];
const SR = 44100;
/** Where the pitch is read (seconds into the sample, window start). */
const TIMES = [0, 0.02, 0.04, 0.07, 0.1, 0.14, 0.2, 0.28, 0.4];
/** The settled pitch: the median of windows starting in this span. */
const SETTLE = [0.45, 1.0];
/** Readings further off than this are taken as misreads. */
const MAX_CENTS = 40;

function decode(file) {
  const raw = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Frequency near `nominal` (±12%) in the window starting at sample `at`: normalized autocorrelation, refined by a parabola. */
function pitchAt(x, at, nominal) {
  const period = SR / nominal;
  let n = 2048;
  while (n < 3 * period * 1.15) n *= 2;
  if (at + n + period * 1.2 >= x.length) return null;
  const lo = Math.floor(period / 1.12), hi = Math.ceil(period * 1.12);
  let energy = 0;
  for (let i = 0; i < n; i++) energy += x[at + i] * x[at + i];
  if (energy / n < 1e-7) return null;
  const r = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let s = 0, e2 = 0;
    for (let i = 0; i < n; i++) { const b = x[at + i + lag]; s += x[at + i] * b; e2 += b * b; }
    r[lag] = s / Math.sqrt(energy * e2 + 1e-12);
  }
  let best = lo;
  for (let lag = lo; lag <= hi; lag++) if (r[lag] > r[best]) best = lag;
  if (r[best] < 0.6) return null;
  const [a, b, c] = [r[best - 1], r[best], r[best + 1]];
  const p = best + (0.5 * (a - c)) / (a - 2 * b + c || 1e-12);
  return { hz: SR / p, center: (at + n / 2) / SR };
}

const cents = (hz, nominal) => 1200 * Math.log2(hz / nominal);
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const round1 = (v) => Math.round(v * 10) / 10;

const out = {};
for (const set of SETS) {
  const m = manifest.pitched[set];
  out[set] = {};
  for (const midi of m.notes) {
    for (let l = 1; l <= m.layers; l++) {
      for (let rr = 1; rr <= m.rr; rr++) {
        const name = `${midi}-${l}-${rr}`;
        const x = decode(join(root, 'public', 'samples', set, `${name}.mp3`));
        const nominal = 440 * 2 ** ((midi - 69) / 12);
        const settled = [];
        for (let t = SETTLE[0]; t <= SETTLE[1]; t += 0.05) {
          const p = pitchAt(x, Math.round(t * SR), nominal);
          if (p && Math.abs(cents(p.hz, nominal)) < MAX_CENTS) settled.push(cents(p.hz, nominal));
        }
        const settle = settled.length >= 3 ? median(settled) : 0;
        // the early pitch, relative to where it settles
        let curve = TIMES.map((t) => {
          const p = pitchAt(x, Math.round(t * SR), nominal);
          if (!p) return null;
          const c = cents(p.hz, nominal) - settle;
          return Math.abs(c) < MAX_CENTS ? [Math.round(p.center * 1000) / 1000, round1(c)] : null;
        }).filter(Boolean);
        // smooth single-window misreads (median of three)
        curve = curve.map(([t], i) => [t, round1(median(curve.slice(Math.max(0, i - 1), i + 2).map((p) => p[1])))]);
        // ends where it has settled
        while (curve.length && Math.abs(curve[curve.length - 1][1]) < 1.5) curve.pop();
        out[set][name] = { settle: round1(settle), curve };
        console.log(set, name, out[set][name].settle, JSON.stringify(curve));
      }
    }
  }
}
writeFileSync(join(root, 'src', 'audio', 'sample-tuning.json'), `${JSON.stringify(out)}\n`);
