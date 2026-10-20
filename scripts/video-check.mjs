// Checks the band video (docs/BAND-VIDEO.md) in headless Chromium: the step times worked out for the video
// against the engine's own, then a real render of a song to WebM and to MP4 (VP9 video with the AAC
// encoder extension: headless Chromium has no H.264) and each file's size, length, frames and
// sound-to-picture sync, with a few frames saved to look at (node_modules/.cache/video-check/).
//   npm run video-check [-- --genre rock --size 360 --only webm|mp4|steps]
// Playwright: the project's, or the global one (PLAYWRIGHT_MODULE=/path/to/playwright).

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = {};
for (const [i, a] of process.argv.entries()) if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1];
const genre = args.genre ?? 'rock', size = +(args.size ?? 360), only = args.only ?? 'all';
const out = join(process.cwd(), 'node_modules/.cache/video-check');
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

let chromium;
for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { if (m) { ({ chromium } = require(m)); break; } } catch { /* next */ }
}
if (!chromium) { console.error('Playwright not found (set PLAYWRIGHT_MODULE).'); process.exit(2); }

/** Where the sound lands against the hits: the lag (ms) at which the low-pass envelope best matches a train of hits. */
function syncLag(samples, rate, hits, from = 0) {
  // low end only (kicks), the envelope smoothed over 10 ms
  const sm = Math.max(1, Math.round(rate * 0.01));
  const env = new Float32Array(samples.length);
  let acc = 0;
  for (let i = 0; i < samples.length; i++) { acc += Math.abs(samples[i]); if (i >= sm) acc -= Math.abs(samples[i - sm]); env[i] = acc / sm; }
  let best = -1, bestLag = 0;
  for (let ms = -120; ms <= 120; ms++) {
    let sum = 0, n = 0;
    for (const h of hits) { const i = Math.round((h - from + ms / 1000) * rate); if (i >= 0 && i < env.length) { sum += env[i]; n++; } }
    if (n > hits.length * 0.8 && sum / n > best) { best = sum / n; bestLag = ms; }
  }
  return bestLag;
}

/** Run ffmpeg, give back what it printed (stderr) and its output (stdout). */
const run = (a) => {
  const r = spawnSync(ffmpeg, a, { maxBuffer: 1 << 30 });
  return { err: r.stderr.toString(), out: r.stdout };
};

// the dev server
const port = 5198;
// (vite itself, not npx, so killing it at the end really stops it)
const vite = spawn(process.execPath, [join(process.cwd(), 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((ok, no) => {
  vite.stdout.on('data', (d) => { if (String(d).includes('Local:')) ok(); });
  vite.on('exit', () => no(new Error('vite did not start')));
  setTimeout(() => no(new Error('vite timed out')), 60000);
});
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

async function open(query) {
  const pg = await browser.newPage();
  pg.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
  await pg.goto(`http://localhost:${port}/band.html?mute${query}`);
  await pg.waitForFunction(() => !document.getElementById('video').disabled, null, { timeout: 120000 });
  await pg.selectOption('#genre', genre);
  await pg.click('#gen');
  return pg;
}

try {
  if (only === 'all' || only === 'steps') {
    console.log('-- step times: worked out against the engine\'s own');
    const pg = await open('');
    const rows = await pg.evaluate(async () => {
      const v = await window.bandDebug().videoModule();
      const rows = [];
      for (const g of ['rock', 'funk', 'hardrock']) { // (a swung one and a lilted one)
        document.getElementById('genre').value = g;
        window.bandDebug().newSong();
        const d = window.bandDebug();
        const list = d.track.sections.slice(0, 2);
        const m = await v.measureStepTimes(list, d.engine.settings()), c = v.stepTimes(list);
        let max = 0;
        for (let k = 0; k < c.length - 1; k++) max = Math.max(max, Math.abs(m[k] - c[k]) || 0);
        rows.push({ g, swing: list[0].song.swing, lilt: list[0].lilt ?? 0, ms: max * 1000, missing: [...m].slice(0, -1).filter(Number.isNaN).length });
      }
      return rows;
    });
    for (const r of rows) check(r.ms < 2 && !r.missing, `${r.g} (swing ${r.swing}, lilt ${r.lilt}): steps within ${r.ms.toFixed(2)} ms`);
    await pg.close();
  }

  for (const kind of ['webm', 'mp4']) {
    if (only !== 'all' && only !== kind) continue;
    console.log(`-- ${kind} render, ${size}p, ${genre}`);
    const pg = await open(`&videocheck=${kind}`);
    await pg.selectOption('#vsize', String(size));
    const done = pg.waitForEvent('download', { timeout: 1800000 });
    const t0 = Date.now();
    await pg.click('#video');
    const dl = await done;
    const file = join(out, `check-${kind}-${size}.${kind}`);
    await dl.saveAs(file);
    console.log(`     made in ${Math.round((Date.now() - t0) / 1000)} s: ${await pg.textContent('#status')}`);

    // what the page rendered: the hits, and where the raw audio puts them
    const info = await pg.evaluate((src) => {
      const d = window.bandDebug(), { mix, rate, times } = window.videoCheck;
      const at = (s) => { const k = Math.min(Math.floor(s), times.length - 2); return times[k] + (s - k) * (times[k + 1] - times[k]); };
      const kicks = d.score.drums.pieces.kick.map((h) => at(h.at));
      const lag = new Function(`return ${src}`)()(mix[0], rate, kicks);
      return { kicks, lag, steps: d.score.steps, six: d.score.six };
    }, syncLag.toString());
    const raw = info.lag;
    check(raw > -15 && raw < 60, `the rendered audio puts the kicks ${raw} ms after their step times`);

    const probe = run(['-hide_banner', '-i', file]).err;
    const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe), seconds = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
    const want = info.steps * info.six + 5 + 0.03;
    check(Math.abs(seconds - want) < 0.15, `length ${seconds.toFixed(2)} s (wanted ${want.toFixed(2)} s)`);
    const wh = size === 720 ? '1280x720' : '640x360';
    check(new RegExp(`Video: .*${wh}.* 30 (fps|tbr)`).test(probe), `video ${wh}, 30 fps`);
    check(/Audio: (aac|opus)/.test(probe), `audio: ${/Audio: (\w+)/.exec(probe)?.[1]}`);
    const counted = [...run(['-hide_banner', '-i', file, '-map', '0:v:0', '-f', 'null', '-']).err.matchAll(/frame=\s*(\d+)/g)];
    const frames = +(counted.at(-1)?.[1] ?? 0);
    check(Math.abs(frames - Math.floor(seconds * 30)) <= 2, `${frames} frames`);

    // the sound as the file plays it: its kicks against the same step times (the file starts 30 ms before the first beat)
    const pcm = run(['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']).out;
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
    const lag = syncLag(samples, 8000, info.kicks, 0.05 - 0.03);
    check(Math.abs(lag - raw) <= 12, `in the file the kicks land ${lag} ms after their step times (${lag - raw >= 0 ? '+' : ''}${lag - raw} ms from the render)`);

    // a few frames to look at: before the start, in the song, near the end
    for (const t of [0.5, seconds * 0.4, seconds - 3]) {
      run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', join(out, `check-${kind}-${size}-${Math.round(t)}s.png`)]);
    }
    await pg.close();
  }
} finally {
  await browser.close();
  vite.kill();
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
