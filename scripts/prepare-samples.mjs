// Downloads a small subset of free samples and converts them to small mono MP3s
// in public/samples/. Run with: npm run samples
//
// Sources (see public/samples/CREDITS.md):
// - Pitched instruments: tonejs-instruments by Nicholaus P. Brosowsky (samples CC-BY 3.0)
// - Drums: "Big Rusty Drums" by Karoryfer Samples, via sfzinstruments (CC0 1.0)

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.sample-cache');
const out = join(root, 'public', 'samples');

const TONEJS = 'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples';
const RUSTY = 'https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/main/Samples';
const RUSTY_TREE = 'https://api.github.com/repos/sfzinstruments/karoryfer.big-rusty-drums/git/trees/main?recursive=1';

// Pitched instruments: every 3 semitones is enough for Tone.Sampler to repitch cleanly.
const PITCHED = {
  piano: { notes: ['A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5'], secs: 3.5 },
  'guitar-acoustic': { notes: ['E2', 'G2', 'As2', 'Cs3', 'E3', 'G3', 'As3', 'Cs4', 'E4', 'G4', 'As4', 'Cs5'], secs: 3 },
  'guitar-electric': { notes: ['E2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5'], secs: 3 },
  'bass-electric': { notes: ['E1', 'G1', 'As1', 'Cs2', 'E2', 'G2', 'As2', 'Cs3', 'E3', 'G3'], secs: 2.5 },
};

// Drums: close mic + overhead mixed to mono. `layers` picks velocity layers as a
// fraction of the available range (0 = softest, 1 = hardest).
const DRUMS = {
  kick: { dir: 'kick_24/kick', mics: ['kick', 'oh'], layers: [0.45, 1], secs: 0.9 },
  snare: { dir: 'snare_14/center', mics: ['top', 'oh'], layers: [0.15, 0.6, 1], secs: 1.1 },
  hat: { dir: 'hihat_14/cl', mics: ['cl', 'oh'], layers: [0.35, 1], secs: 0.5 },
  hatOpen: { dir: 'hihat_14/ho', mics: ['cl', 'oh'], layers: [0.8], secs: 1.6 },
  crash: { dir: 'crash_17/cr', mics: ['cl', 'oh'], layers: [0.85], secs: 3.5 },
  ride: { dir: 'ride_22/rd', mics: ['cl', 'oh'], layers: [0.4, 0.85], secs: 2.5 },
  tom1: { dir: 'tom_14/center', mics: ['cl', 'oh'], layers: [0.8], secs: 1.4 },
  tom2: { dir: 'tom_18/center', mics: ['cl', 'oh'], layers: [0.8], secs: 1.6 },
  tom3: { dir: 'tom_22/center', mics: ['cl', 'oh'], layers: [0.8], secs: 1.8 },
};

async function download(url, file) {
  if (existsSync(file)) return file;
  mkdirSync(dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function ff(args) {
  return execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
}

// Encode to mono MP3 with a fade-out so trimmed samples don't click.
function encode(inputs, dest, secs, { normalize = false } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  const fade = Math.min(0.4, secs * 0.3);
  const mix = inputs.length > 1
    ? `${inputs.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${inputs.length}:normalize=0,`
    : '';
  const filter = `${mix}aformat=channel_layouts=mono,atrim=0:${secs},afade=t=out:st=${(secs - fade).toFixed(3)}:d=${fade.toFixed(3)}`;
  if (normalize) {
    // peak-normalize to -1 dBFS (velocity is applied at playback)
    const tmp = join(cache, 'tmp.wav');
    ff([...inputs.flatMap((f) => ['-i', f]), '-filter_complex', filter, tmp]);
    const stderr = runCapture(['-hide_banner', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-']);
    const m = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
    const gain = m ? -1 - parseFloat(m[1]) : 0;
    ff(['-i', tmp, '-af', `volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-b:a', '80k', dest]);
    return;
  }
  ff([...inputs.flatMap((f) => ['-i', f]), '-filter_complex', filter, '-ac', '1', '-ar', '44100', '-b:a', '80k', dest]);
}

// ffmpeg prints volumedetect results on stderr
function runCapture(args) {
  return spawnSync(ffmpeg, args, { encoding: 'utf8' }).stderr ?? '';
}

async function pitched() {
  for (const [inst, { notes, secs }] of Object.entries(PITCHED)) {
    for (const n of notes) {
      const src = await download(`${TONEJS}/${inst}/${n}.mp3`, join(cache, inst, `${n}.mp3`));
      encode([src], join(out, inst, `${n}.mp3`), secs);
    }
    console.log(`  ${inst}: ${notes.length} samples`);
  }
}

async function drums() {
  const tree = await (await fetch(RUSTY_TREE)).json();
  const paths = tree.tree.map((t) => t.path);
  for (const [name, { dir, mics, layers, secs }] of Object.entries(DRUMS)) {
    // files look like <prefix>_vl<N>_rr<M>.flac; use round robin 1 of each layer
    const files = paths.filter((p) => p.startsWith(`Samples/${dir}/${mics[0]}/`) && /_vl\d+_rr1\.flac$/.test(p));
    const vls = [...new Set(files.map((p) => +p.match(/_vl(\d+)_/)[1]))].sort((a, b) => a - b);
    if (!vls.length) throw new Error(`No samples for ${name} in ${dir}`);
    layers.forEach((frac, i) => {
      const vl = vls[Math.round(frac * (vls.length - 1))];
      const file = files.find((p) => p.includes(`_vl${vl}_rr1`)).split('/').pop();
      layers[i] = { vl, file };
    });
    for (let i = 0; i < layers.length; i++) {
      const { file } = layers[i];
      const srcs = [];
      for (const mic of mics) {
        srcs.push(await download(`${RUSTY}/${dir}/${mic}/${file}`, join(cache, 'drums', dir, mic, file)));
      }
      encode(srcs, join(out, 'drums', `${name}-${i + 1}.mp3`), secs, { normalize: true });
    }
    console.log(`  ${name}: layers ${layers.map((l) => l.vl).join(', ')} of ${vls.length}`);
  }
}

function report() {
  let total = 0;
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.mp3')) total += statSync(p).size;
  });
  walk(out);
  console.log(`Total sample size: ${(total / 1024 / 1024).toFixed(2)} MB`);
}

mkdirSync(cache, { recursive: true });
console.log('Pitched instruments…');
await pitched();
console.log('Drums…');
await drums();
rmSync(join(cache, 'tmp.wav'), { force: true });
report();
