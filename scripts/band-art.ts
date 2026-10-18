// Paul's art for the band (docs/BAND-VIEW.md, art/README.md): every frame of every player as its own
// PNG to draw over, and back into the sheets the page plays.
//
//   npm run band-export   writes art/<player>/<frame>.png, one per frame, from the current sheets
//                         (the cut-out test's where there is one). Never overwrites: a file already
//                         there is left as it is, so drawings are safe. Also art/<player>/_stance.png,
//                         the player put together, to draw against.
//   npm run band-pack     packs art/ into public/band/art/ (band.html?art): each frame from
//                         art/<player>-<persona>/ if drawn for that character, else art/<player>/, else
//                         the placeholder. New frames (eyes on a drawn head...) are added if their name
//                         is one the view uses.
//
// Every file is the same canvas, the player's feet at the same point (CANVAS), so parts line up when
// stacked in a drawing program.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type Image, decode, encode } from './png';
import { type LegRig, PIECES, type Pieces, POSES, cutLegs, poseLegs } from './band-rig';

const ART = 'art';
const BAND = 'public/band';
const OUT = 'public/band/art';
/** The base sheets: the cut-out test's if it's there, else the generated ones. */
const BASE = existsSync(`${BAND}/cut`) ? `${BAND}/cut` : BAND;
const PLAYERS = ['singer', 'rhythm', 'lead', 'bassist', 'drummer'];
const PERSONAS = ['cool', 'energetic', 'emo', 'angry'];
/** Every file's canvas, and where the feet are on it. */
const CANVAS = { w: 128, h: 112, ox: 60, oy: 104 };

/** Frames the view knows (besides those already in a sheet): what an artist may add. */
const KNOWN = [
  'head/front', 'head/up', 'head/down', 'hair/back',
  ...['open', 'half', 'closed', 'squeeze', 'wide', 'left', 'right'].map((k) => `eyes/${k}`),
  ...['neutral', 'raised', 'furrow', 'sad'].map((k) => `brows/${k}`),
  ...['rest', 'smile', 'M', 'F', 'S', 'E', 'I', 'A', 'A+', 'O', 'O+', 'U'].map((k) => `mouth/${k}`),
  ...['stand', 'wide', 'jump', 'lunge', 'sit', 'kick', 'walk/0', 'walk/1', 'walk/2', 'walk/3'].map((k) => `legs/${k}`),
];

type Sheet = { image: string; frames: Record<string, number[]>; geo: Record<string, unknown> };
const sheetOf = (dir: string, name: string) => {
  const json: Sheet = JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));
  return { json, img: decode(`${dir}/${json.image}`) };
};

/** A frame cut from a sheet onto the full canvas. */
function toCanvas(img: Image, f: number[]): Image {
  const [fx, fy, w, h, ox, oy] = f;
  const out: Image = { w: CANVAS.w, h: CANVAS.h, d: new Uint8ClampedArray(CANVAS.w * CANVAS.h * 4) };
  blit(img, fx, fy, w, h, out, CANVAS.ox - ox, CANVAS.oy - oy);
  return out;
}

/** Copy a w x h box of src at (sx, sy) onto dst at (dx, dy); over what's there (alpha). */
function blit(src: Image, sx: number, sy: number, w: number, h: number, dst: Image, dx: number, dy: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = dx + i, y = dy + j;
    if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) continue;
    const s = ((sy + j) * src.w + sx + i) * 4, d = (y * dst.w + x) * 4, a = src.d[s + 3] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) dst.d[d + c] = src.d[s + c] * a + dst.d[d + c] * (1 - a);
    dst.d[d + 3] = Math.max(dst.d[d + 3], src.d[s + 3]);
  }
}

/** A drawn canvas trimmed to its pixels: the box and its origin, or null if empty. */
function trim(img: Image) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.d[(y * img.w + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const fileOf = (dir: string, frame: string) => join(ART, dir, `${frame}.png`);

/** All the PNGs in a folder (frame names, with their subfolders), skipping _files. */
function drawn(dir: string): string[] {
  const root = join(ART, dir);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (!(d === root && n === 'rig')) walk(p); }
      else if (n.endsWith('.png') && !n.startsWith('_')) out.push(relative(root, p).replace(/\\/g, '/').replace(/\.png$/, ''));
    }
  };
  walk(root);
  return out;
}

/* ---------------------------------------------------------------- export */

/** What a player looks like put together, to draw against (back to front). */
const STANCE: Record<string, string[]> = {
  singer: ['stand', 'hair/back', 'legs/stand', 'body/idle', 'armB/down', 'head/front', 'eyes/open', 'brows/neutral', 'mouth/rest', 'armA/mic', 'mic'],
  drummer: ['legs/sit', 'body/idle', 'head/front', 'eyes/open', 'brows/neutral', 'mouth/rest', ...['kick/rest', 'tom3/rest', 'ride/rest', 'crash/rest', 'hat/closed', 'tom2/rest', 'tom1/rest', 'snare/rest'].map((k) => `kit/${k}`), 'armA/hat/mid', 'armB/snare/mid'],
  guitar: ['hair/back', 'legs/stand', 'body/idle', 'inst/body', 'fret/palm/5', 'pick/mid', 'head/front', 'eyes/open', 'brows/neutral', 'mouth/rest'],
};

function exportArt() {
  let wrote = 0, kept = 0;
  for (const p of PLAYERS) {
    const { json, img } = sheetOf(BASE, `${p}-cool`);
    const rigged = p !== 'drummer';
    if (rigged) exportLegRig(p, toCanvas(img, json.frames['legs/stand']));
    for (const [name, f] of Object.entries(json.frames)) {
      if (rigged && name.startsWith('legs/')) continue; // (made by the rig)
      const file = fileOf(p, name);
      if (existsSync(file)) { kept++; continue; }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, encode(toCanvas(img, f)));
      wrote++;
    }
    const stance: Image = { w: CANVAS.w, h: CANVAS.h, d: new Uint8ClampedArray(CANVAS.w * CANVAS.h * 4) };
    for (const name of STANCE[p] ?? STANCE.guitar) {
      const f = json.frames[name];
      if (f) blit(img, f[0], f[1], f[2], f[3], stance, CANVAS.ox - f[4], CANVAS.oy - f[5]);
    }
    writeFileSync(join(ART, p, '_stance.png'), encode(stance));
  }
  writeFileSync(join(ART, '_canvas.json'), JSON.stringify(CANVAS, null, 1));
  console.log(`art/: ${wrote} frames written, ${kept} already there (left as they are). Base: ${BASE}`);
}

/** The legs cut into rig pieces (art/<player>/rig/legs/), unless already there. */
function exportLegRig(p: string, legs: Image) {
  const dir = join(ART, p, 'rig', 'legs');
  if (existsSync(`${dir}.json`)) return;
  const { pieces, rig } = cutLegs(legs, CANVAS.ox);
  mkdirSync(dir, { recursive: true });
  for (const k of PIECES) writeFileSync(join(dir, `${k}.png`), encode(pieces[k]));
  writeFileSync(`${dir}.json`, JSON.stringify(rig, null, 1));
}

/** The legs' poses made from the rig pieces (art/<player>/rig/legs/), if the player has them. */
function rigLegs(p: string): Map<string, Image> {
  const dir = join(ART, p, 'rig', 'legs'), out = new Map<string, Image>();
  if (!existsSync(`${dir}.json`)) return out;
  const rig: LegRig = JSON.parse(readFileSync(`${dir}.json`, 'utf8'));
  const pieces = Object.fromEntries(PIECES.map((k) => [k, decode(join(dir, `${k}.png`))])) as Pieces;
  for (const [name, pose] of Object.entries(POSES)) out.set(`legs/${name}`, poseLegs(pieces, rig, pose));
  return out;
}

/* ---------------------------------------------------------------- pack */

function pack() {
  mkdirSync(OUT, { recursive: true });
  for (const p of PLAYERS) {
    const common = new Set(drawn(p));
    const rigged = rigLegs(p);
    for (const c of PERSONAS) {
      const name = `${p}-${c}`;
      const { json, img } = sheetOf(BASE, name);
      const own = new Set(drawn(name));
      const names = new Set([...Object.keys(json.frames), ...rigged.keys()]);
      for (const n of [...common, ...own]) {
        if (names.has(n)) continue;
        if (KNOWN.includes(n)) names.add(n);
        else console.warn(`  ${name}: "${n}.png" isn't a frame the view uses (a typo?), skipped`);
      }
      // each frame: the drawing (trimmed) or the placeholder
      const parts: { name: string; src: Image; box: { x: number; y: number; w: number; h: number }; ox: number; oy: number }[] = [];
      let fromArt = 0;
      for (const n of names) {
        // a drawn frame, else one the rig makes, else the placeholder
        const file = own.has(n) ? fileOf(name, n) : common.has(n) ? fileOf(p, n) : null;
        if (file || rigged.has(n)) {
          const d = file ? decode(file) : rigged.get(n)!;
          if (file && (d.w !== CANVAS.w || d.h !== CANVAS.h)) console.warn(`  ${file}: ${d.w}x${d.h}, expected ${CANVAS.w}x${CANVAS.h} (feet at ${CANVAS.ox},${CANVAS.oy})`);
          const box = trim(d);
          if (file) fromArt++;
          if (box) parts.push({ name: n, src: d, box, ox: CANVAS.ox, oy: CANVAS.oy });
          // (an empty drawing: the frame is left out on purpose)
        } else {
          const f = json.frames[n];
          parts.push({ name: n, src: img, box: { x: f[0], y: f[1], w: f[2], h: f[3] }, ox: f[0] + f[4], oy: f[1] + f[5] });
        }
      }
      // shelves, 512 wide
      const W = 512;
      let x = 0, y = 0, rowH = 0;
      const at = parts.map((q) => {
        if (x + q.box.w > W) { x = 0; y += rowH + 1; rowH = 0; }
        const a = { x, y };
        x += q.box.w + 1; rowH = Math.max(rowH, q.box.h);
        return a;
      });
      const out: Image = { w: W, h: y + rowH, d: new Uint8ClampedArray(W * (y + rowH) * 4) };
      const frames: Record<string, number[]> = {};
      parts.forEach((q, k) => {
        blit(q.src, q.box.x, q.box.y, q.box.w, q.box.h, out, at[k].x, at[k].y);
        frames[q.name] = [at[k].x, at[k].y, q.box.w, q.box.h, q.ox - q.box.x, q.oy - q.box.y];
      });
      // drawn eyes or worn things replace the drawing's: no generated extras over them
      const geo = { ...json.geo, acc: ((json.geo.acc as string[]) ?? []).filter((a) => frames[`acc/${a}`]) };
      writeFileSync(`${OUT}/${name}.png`, encode(out));
      writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ image: `${name}.png`, frames, geo }));
      if (c === 'cool') console.log(`${p}: ${fromArt} drawn frames, ${rigged.size} from the rig, ${parts.length - fromArt - rigged.size} placeholders`);
    }
  }
  for (const n of ['stage.png', 'stage.json', 'stage-front.png', 'crowd.png', 'crowd.json']) writeFileSync(`${OUT}/${n}`, readFileSync(`${BAND}/${n}`));
  console.log('Packed into public/band/art/. Open band.html?art');
}

if (process.argv.includes('pack')) pack();
else exportArt();
