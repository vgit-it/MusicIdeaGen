// Downloads a subset of free, real-instrument samples and converts them to small
// mono MP3s in public/samples/, plus a manifest the app reads (src/audio/sample-manifest.json).
// Run with: npm run samples (everything), or npm run samples -- strings perc (only those sets, the rest kept)
//
// Sources (see public/samples/CREDITS.md):
// - Piano: Salamander Grand Piano V3 by Alexander Holm (CC-BY 3.0)
// - Acoustic guitar: Shinyguitar by Karoryfer Samples / D. Smolken (CC0)
// - Electric guitar: Emilyguitar by Karoryfer Samples / D. Smolken (CC0), recorded direct (amp is simulated in the app)
// - Bass: Black And Blue Basses by Karoryfer Samples (CC0)
// - Drums: Big Rusty Drums by Karoryfer Samples (CC0)
// - Strings and percussion: VSCO 2 Community Edition by Versilian Studios (CC0)

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.sample-cache');
const out = join(root, 'public', 'samples');
const manifestFile = join(root, 'src', 'audio', 'sample-manifest.json');

const GH = 'https://raw.githubusercontent.com/sfzinstruments';
const VSCO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master';
const vsco = (path) => `${VSCO}/${path.split('/').map(encodeURIComponent).join('/')}`;
/** Sets named on the command line (empty: all). */
const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.includes(name);

// String section: cellos low, violas in the middle, violins on top, the soft sustain (with vibrato) of each.
// VSCO names notes an octave low (its cello "C1" is C2), so the keys here are the real notes.
const STRING_FILES = {
  C2: 'Strings/Cello Section/susvib/susvib_C1_v1_1.wav',
  E2: 'Strings/Cello Section/susvib/susvib_E1_v1_1.wav',
  G2: 'Strings/Cello Section/susvib/susvib_G1_v1_1.wav',
  B2: 'Strings/Cello Section/susvib/susvib_B1_v1_1.wav',
  D3: 'Strings/Cello Section/susvib/susvib_D2_v1_1.wav',
  F3: 'Strings/Cello Section/susvib/susvib_F2_v1_1.wav',
  B3: 'Strings/Viola Section/susvib/ViolaEns_susvib_B2_v1_1.wav',
  D4: 'Strings/Viola Section/susvib/ViolaEns_susvib_D3_v1_1.wav',
  F4: 'Strings/Viola Section/susvib/ViolaEns_susvib_F3_v1_1.wav',
  A4: 'Strings/Viola Section/susvib/ViolaEns_susvib_A3_v1_1.wav',
  C5: 'Strings/Violin Section/susVib/VlnEns_susVib_C4_v1.wav',
  E5: 'Strings/Violin Section/susVib/VlnEns_susVib_E4_v1.wav',
  G5: 'Strings/Violin Section/susVib/VlnEns_susVib_G4_v1.wav',
  B5: 'Strings/Violin Section/susVib/VlnEns_susVib_B4_v1.wav',
  D6: 'Strings/Violin Section/susVib/VlnEns_susVib_D5_v1.wav',
};

// Percussion one-shots: [file paths] per piece (each file is a round robin).
const PERC = {
  tambDown: { secs: 0.8, files: ['tambourine_Down', 'tambourine_down_2', 'tambourine_down_3', 'tambourine_down_4'].map((f) => `VSCO 1 Percussion/varWood/${f}.wav`) },
  tambUp: { secs: 0.6, files: ['tambourine_up_2', 'tambourine_up_3', 'tambourine_up_4', 'tambourine_up_6'].map((f) => `VSCO 1 Percussion/varWood/${f}.wav`) },
  shaker: { secs: 0.4, files: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `VSCO 1 Percussion/varWood/Camo's Shaker/shake${i}.wav`) },
  conga: { secs: 0.8, files: ['v2_rr1', 'v2_rr2', 'v3_rr1', 'v3_rr2'].map((v) => `Percussion/Conga-HitN_${v}_Sum.wav`) },
  congaLow: { secs: 0.9, files: ['v2_rr1', 'v2_rr2', 'v3_rr1', 'v3_rr2'].map((v) => `Percussion/Tumba-HitN_${v}_Sum.wav`) },
};
const RUSTY_TREE = 'https://api.github.com/repos/sfzinstruments/karoryfer.big-rusty-drums/git/trees/main?recursive=1';

// Minor thirds across each instrument's range; layers = velocity layers (soft to loud); rr = round robins.
const GUITAR_NOTES = ['db2', 'e2', 'gb2', 'a2', 'c3', 'eb3', 'gb3', 'a3', 'c4', 'eb4', 'gb4', 'a4', 'c5', 'eb5', 'gb5'];
const PITCHED = {
  piano: {
    base: `${GH}/SalamanderGrandPiano/master/Samples`,
    notes: ['A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5'],
    layers: ['v5', 'v10', 'v15'], rr: 1, secs: 4,
    file: (n, v) => `${encodeURIComponent(n)}${v}.flac`,
  },
  'guitar-acoustic': {
    base: `${GH}/karoryfer.shinyguitar/master/Samples/acoustic`,
    notes: GUITAR_NOTES, layers: ['vl2', 'vl4'], rr: 2, secs: 3.5,
    file: (n, v, r) => `${n}_${v}_rr${r}_1.wav`,
    noises: Array.from({ length: 6 }, (_, i) => `mute_string${i + 1}_rr1_1.wav`),
    // string-damping noise when a chord is stopped
    releases: ['e2', 'a2', 'c3', 'gb3'].map((n) => `${n}_release_rr1_1.wav`),
  },
  'guitar-electric': {
    base: `${GH}/karoryfer.emilyguitar/master/notes`,
    // longer: distorted notes sustain
    notes: GUITAR_NOTES, layers: ['mf', 'f'], rr: 2, secs: 4.5,
    file: (n, v, r) => `${n}_${v}_rr${r}.wav`,
    noises: ['muted1', 'muted2', 'muted3', 'muted4', 'muted5'].map((m) => `../noises/${m}_rr1.wav`),
    releases: ['e2', 'a2', 'c3', 'gb3'].map((n) => `../release/${n}_release_rr1.wav`),
  },
  'bass-electric': {
    // "babyblue" is the brighter of the two basses; f/ff are the harder plucks with more attack
    base: `${GH}/karoryfer.black-and-blue-basses/main/Samples/babyblue/reg`,
    // this library names notes one octave higher than standard (its "e2" is E1)
    octaveShift: -1,
    notes: ['db2', 'e2', 'g2', 'bb2', 'db3', 'e3', 'g3', 'bb3', 'db4', 'e4', 'g4'],
    // long enough for held notes (a bass note rings for seconds)
    layers: ['f', 'ff'], rr: 2, secs: 5,
    file: (n, v, r) => `babyblue_${n}_${v}_rr${r}.wav`,
  },
  strings: {
    // long: strings hold chords for bars at a time
    base: VSCO, notes: Object.keys(STRING_FILES), layers: ['v1'], rr: 1, secs: 8,
    file: (n) => STRING_FILES[n].split('/').map(encodeURIComponent).join('/'),
  },
};

// Drums: close mic + overhead mixed to mono. `layers` picks velocity layers as a
// fraction of the available range (0 = softest, 1 = hardest).
const DRUMS = {
  kick: { dir: 'kick_24/kick', mics: ['kick', 'oh'], layers: [0.45, 1], rr: 2, secs: 0.9 },
  snare: { dir: 'snare_14/center', mics: ['top', 'oh'], layers: [0.15, 0.6, 1], rr: 2, secs: 1.1 },
  hat: { dir: 'hihat_14/cl', mics: ['cl', 'oh'], layers: [0.35, 1], rr: 3, secs: 0.5 },
  hatOpen: { dir: 'hihat_14/ho', mics: ['cl', 'oh'], layers: [0.8], rr: 1, secs: 1.6 },
  crash: { dir: 'crash_17/cr', mics: ['cl', 'oh'], layers: [0.85], rr: 1, secs: 3.5 },
  ride: { dir: 'ride_22/rd', mics: ['cl', 'oh'], layers: [0.4, 0.85], rr: 2, secs: 2.5 },
  tom1: { dir: 'tom_14/center', mics: ['cl', 'oh'], layers: [0.8], rr: 1, secs: 1.4 },
  tom2: { dir: 'tom_18/center', mics: ['cl', 'oh'], layers: [0.8], rr: 1, secs: 1.6 },
  tom3: { dir: 'tom_22/center', mics: ['cl', 'oh'], layers: [0.8], rr: 1, secs: 1.8 },
};

const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function toMidi(name, octaveShift = 0) {
  const m = name.toLowerCase().match(/^([a-g])(#|b)?(-?\d)$/);
  if (!m) throw new Error(`Bad note ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (+m[3] + octaveShift + 1) + PC[m[1]] + acc;
}

async function download(url, file) {
  if (existsSync(file)) return file;
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    }
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
  }
}

/** Run async jobs with limited concurrency. */
async function pool(jobs, n = 6) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) {
      const k = i++;
      results[k] = await jobs[k]();
    }
  }));
  return results;
}

function ff(args) {
  return execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
}

// ffmpeg prints volumedetect results on stderr
const stderrOf = (args) => spawnSync(ffmpeg, args, { encoding: 'utf8' }).stderr ?? '';

/**
 * Mix inputs to mono, peak-normalize to -1 dBFS (velocity is applied at playback),
 * cut leading silence so notes land on time, trim, fade out and encode as MP3.
 */
function encode(inputs, dest, secs) {
  mkdirSync(dirname(dest), { recursive: true });
  const fade = Math.min(0.5, secs * 0.3);
  const mix = inputs.length > 1
    ? `${inputs.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${inputs.length}:normalize=0,`
    : '';
  const tmp = `${dest}.tmp.wav`;
  ff([...inputs.flatMap((f) => ['-i', f]), '-filter_complex', `${mix}aformat=channel_layouts=mono`, tmp]);
  const m = stderrOf(['-hide_banner', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-']).match(/max_volume:\s*(-?[\d.]+) dB/);
  const gain = m ? -1 - parseFloat(m[1]) : 0;
  const filter = [
    `volume=${gain.toFixed(2)}dB`,
    'silenceremove=start_periods=1:start_threshold=-36dB:start_silence=0.002',
    `atrim=0:${secs}`,
    `afade=t=out:st=${(secs - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
  ].join(',');
  ff(['-i', tmp, '-af', filter, '-ac', '1', '-ar', '44100', '-b:a', '80k', dest]);
  rmSync(tmp, { force: true });
}

// Speaker cabinet impulse responses for the electric guitar amp: Dauntless IR pack by resington
// ("free to share however you wish but is not for resale"), via github.com/fnpngn/IR (Git LFS).
const IR_BASE = 'https://media.githubusercontent.com/media/fnpngn/IR/master/Dauntless%20IRs';
const IRS = { clean: '1 Engl Fireball B906.wav', crunch: '5 Engl Fireball SM48.wav', dist: 'Res Dauntless X.wav' };

async function irs() {
  if (!wanted('ir')) return;
  for (const [name, file] of Object.entries(IRS)) {
    const src = await download(`${IR_BASE}/${encodeURIComponent(file)}`, join(cache, 'ir', file));
    mkdirSync(join(out, 'ir'), { recursive: true });
    ff(['-i', src, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', join(out, 'ir', `${name}.wav`)]);
  }
  console.log(`  cab IRs: ${Object.keys(IRS).join(', ')}`);
}

const manifest = { pitched: {}, drums: {}, perc: {} };
if (only.length && existsSync(manifestFile)) Object.assign(manifest, JSON.parse(readFileSync(manifestFile, 'utf8')));
manifest.perc ??= {};

async function pitched() {
  for (const [inst, cfg] of Object.entries(PITCHED)) {
    if (!wanted(inst)) continue;
    const jobs = [];
    for (const n of cfg.notes) {
      const midi = toMidi(n, cfg.octaveShift);
      cfg.layers.forEach((v, vi) => {
        for (let r = 1; r <= cfg.rr; r++) {
          const name = cfg.file(n, v, r);
          jobs.push(async () => {
            const src = await download(`${cfg.base}/${name}`, join(cache, inst, decodeURIComponent(name).replace('../', '')));
            encode([src], join(out, inst, `${midi}-${vi + 1}-${r}.mp3`), cfg.secs);
          });
        }
      });
    }
    (cfg.noises ?? []).forEach((name, i) => jobs.push(async () => {
      const src = await download(`${cfg.base}/${name}`, join(cache, inst, name.replace('../', '')));
      encode([src], join(out, inst, `mute-${i + 1}.mp3`), 0.5);
    }));
    (cfg.releases ?? []).forEach((name, i) => jobs.push(async () => {
      const src = await download(`${cfg.base}/${name}`, join(cache, inst, name.replace('../', '')));
      encode([src], join(out, inst, `rel-${i + 1}.mp3`), 0.6);
    }));
    await pool(jobs);
    manifest.pitched[inst] = {
      notes: cfg.notes.map((n) => toMidi(n, cfg.octaveShift)),
      layers: cfg.layers.length,
      rr: cfg.rr,
      noises: cfg.noises?.length ?? 0,
      releases: cfg.releases?.length ?? 0,
    };
    console.log(`  ${inst}: ${jobs.length} files`);
  }
}

async function perc() {
  if (!wanted('perc')) return;
  for (const [name, { secs, files }] of Object.entries(PERC)) {
    await pool(files.map((path, i) => async () => {
      const src = await download(vsco(path), join(cache, 'perc', path.split('/').pop()));
      encode([src], join(out, 'perc', `${name}-${i + 1}.mp3`), secs);
    }));
    manifest.perc[name] = { rr: files.length };
  }
  console.log(`  perc: ${Object.keys(PERC).join(', ')}`);
}

async function drums() {
  if (!wanted('drums')) return;
  const tree = await (await fetch(RUSTY_TREE)).json();
  const paths = tree.tree.map((t) => t.path);
  for (const [name, { dir, mics, layers, rr, secs }] of Object.entries(DRUMS)) {
    // files look like <prefix>_vl<N>_rr<M>.flac
    const files = paths.filter((p) => p.startsWith(`Samples/${dir}/${mics[0]}/`) && /_vl\d+_rr\d+\.flac$/.test(p));
    const vls = [...new Set(files.map((p) => +p.match(/_vl(\d+)_/)[1]))].sort((a, b) => a - b);
    if (!vls.length) throw new Error(`No samples for ${name} in ${dir}`);
    const jobs = [];
    layers.forEach((frac, li) => {
      const vl = vls[Math.round(frac * (vls.length - 1))];
      for (let r = 1; r <= rr; r++) {
        const path = files.find((p) => p.includes(`_vl${vl}_rr${r}.`)) ?? files.find((p) => p.includes(`_vl${vl}_rr1.`));
        const file = path.split('/').pop();
        jobs.push(async () => {
          const srcs = [];
          for (const mic of mics) {
            srcs.push(await download(`${GH}/karoryfer.big-rusty-drums/main/Samples/${dir}/${mic}/${file}`, join(cache, 'drums', dir, mic, file)));
          }
          encode(srcs, join(out, 'drums', `${name}-${li + 1}-${r}.mp3`), secs);
        });
      }
    });
    await pool(jobs);
    manifest.drums[name] = { layers: layers.length, rr };
    console.log(`  ${name}: ${jobs.length} files`);
  }
}

function report() {
  const sizes = {};
  for (const e of readdirSync(out, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    sizes[e.name] = readdirSync(join(out, e.name)).reduce((a, f) => a + statSync(join(out, e.name, f)).size, 0);
  }
  for (const [k, v] of Object.entries(sizes)) console.log(`  ${k.padEnd(16)} ${(v / 1024).toFixed(0)} KB`);
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  console.log(`Total sample size: ${(total / 1024 / 1024).toFixed(2)} MB`);
}

// start clean so old files don't linger (only the sets being made)
for (const e of existsSync(out) ? readdirSync(out, { withFileTypes: true }) : []) {
  if (e.isDirectory() && (wanted(e.name) || (e.name === 'perc' && wanted('perc')))) rmSync(join(out, e.name), { recursive: true, force: true });
}
mkdirSync(cache, { recursive: true });
console.log('Pitched instruments…');
await pitched();
console.log('Drums…');
await drums();
console.log('Percussion…');
await perc();
console.log('Cabinets…');
await irs();
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
report();
