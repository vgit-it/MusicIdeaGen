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
import { ARM_PIECES, type ArmPose, type ArmRig, type BentLegRig, type LegRig, PIECES, type Pieces, POSES, type Pt, armPieces, cutLegs, over, poseArms, poseLegs, straightenLegs } from '../src/band/rig';

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
    const arms = (json.geo.arms ?? {}) as Record<string, ArmPose[]>;
    exportArmRig(p, toCanvas(img, json.frames['body/idle']), arms, String(json.geo.skin ?? ''));
    for (const [name, f] of Object.entries(json.frames)) {
      if (rigged && name.startsWith('legs/')) continue; // (made by the rig)
      if (arms[name]) continue; // (made by the arm rig, from the pieces and the frame's hand)
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
  exportWardrobe();
  console.log(`art/: ${wrote} frames written, ${kept} already there (left as they are). Base: ${BASE}`);
}

/**
 * The legs cut into rig pieces (art/<player>/rig/legs/), unless already there, and straightened (the
 * pieces hanging down, neutral). A rig of the old kind (pieces cut in the drawing's pose) is
 * straightened in place, its pieces kept in rig/legs-bent/.
 */
function exportLegRig(p: string, legs: Image) {
  const dir = join(ART, p, 'rig', 'legs');
  let bent: { pieces: Pieces; rig: BentLegRig };
  if (existsSync(`${dir}.json`)) {
    const rig = JSON.parse(readFileSync(`${dir}.json`, 'utf8'));
    if (!rig.knee) return; // (straight already)
    bent = { rig, pieces: Object.fromEntries(PIECES.map((k) => [k, decode(join(dir, `${k}.png`))])) as Pieces };
    const keep = join(ART, p, 'rig', 'legs-bent');
    mkdirSync(keep, { recursive: true });
    for (const k of PIECES) writeFileSync(join(keep, `${k}.png`), readFileSync(join(dir, `${k}.png`)));
    writeFileSync(`${keep}.json`, readFileSync(`${dir}.json`));
  } else bent = cutLegs(legs, CANVAS.ox);
  const { pieces, rig } = straightenLegs(bent.pieces, bent.rig);
  mkdirSync(dir, { recursive: true });
  for (const k of PIECES) writeFileSync(join(dir, `${k}.png`), encode(pieces[k]));
  writeFileSync(`${dir}.json`, JSON.stringify(rig, null, 1));
}

/** Arms, by player: a short-sleeved tee on the singer, a jacket on the rest (the character drawing). */
const SLEEVE: Record<string, 'long' | 'short'> = { singer: 'short' };

/**
 * The arm rig (art/<player>/rig/arms/), unless already there: the shoulders found on the drawn body
 * (just in from its edges, near the top), placeholder pieces in the body's main colour.
 */
function exportArmRig(p: string, body: Image, arms: Record<string, ArmPose[]>, skinHex: string) {
  const dir = join(ART, p, 'rig', 'arms');
  const poses = Object.values(arms).flat();
  if (existsSync(`${dir}.json`) || !poses.length) return;
  const at = (x: number, y: number) => body.d.subarray((y * body.w + x) * 4, (y * body.w + x) * 4 + 4);
  let top = -1;
  for (let y = 0; y < body.h && top < 0; y++) for (let x = 0; x < body.w; x++) if (at(x, y)[3]) { top = y; break; }
  const row = top + 4;
  let l = body.w, r = -1;
  for (let x = 0; x < body.w; x++) if (at(x, row)[3]) { l = Math.min(l, x); r = Math.max(r, x); }
  const sy = row - CANVAS.oy;
  // the body's main colour (not the outline, not skin): the sleeves
  const count = new Map<string, number>();
  for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) {
    const c = at(x, y);
    if (!c[3] || c[0] + c[1] + c[2] < 110 || (c[0] > 150 && c[0] > c[1] && c[1] > c[2])) continue;
    const k = [c[0] >> 4, c[1] >> 4, c[2] >> 4].join(',');
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const top1 = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '3,2,2';
  const cloth = top1.split(',').map((v) => Number(v) * 16 + 8);
  const skin = /^#[0-9a-f]{6}$/i.test(skinHex) ? [1, 3, 5].map((i) => parseInt(skinHex.slice(i, i + 2), 16)) : [232, 170, 130];
  const upper = Math.max(...poses.map((q) => q.a)), fore = Math.max(...poses.map((q) => q.b));
  const sleeve = SLEEVE[p] ?? 'long';
  const { pieces, joint } = armPieces({ upper, fore }, sleeve, cloth, skin);
  const rig: ArmRig = { shoulders: { A: [l + 3 - CANVAS.ox, sy], B: [r - 3 - CANVAS.ox, sy] }, joint, upper, fore, sleeve };
  mkdirSync(dir, { recursive: true });
  for (const k of ARM_PIECES) writeFileSync(join(dir, `${k}.png`), encode(pieces[k]));
  writeFileSync(`${dir}.json`, JSON.stringify(rig, null, 1));
}

/* ---------------------------------------------------------------- the wardrobe */

/**
 * The wardrobe (art/wardrobe/): every player's clothes as pieces anyone can wear, fitted to one
 * skeleton (the singer's): tops (the body and its two sleeve pieces), bottoms (hips, thighs, shins),
 * shoes and heads. Each player's own clothes are copied in once, under the player's name; the player
 * folders aren't changed. Items already there are left as they are.
 */
const WEARERS = ['singer', 'rhythm', 'lead', 'bassist'];
const WARDROBE = join(ART, 'wardrobe');
/** Colours a top or bottom can be dyed (besides its own), the main colour's target. */
const DYES = {
  tops: ['#232129', '#7a2424', '#26365e', '#4b5a2c', '#5c5b66', '#6b4a2a'],
  bottoms: ['#1f2533', '#28272d', '#55575f', '#3b2f26'],
};

const blankCanvas = (w = CANVAS.w, h = CANVAS.h): Image => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
/** A picture moved down by dy rows (up if negative), same size. */
function shiftY(img: Image, dy: number): Image {
  const out = blankCanvas(img.w, img.h);
  for (let y = 0; y < img.h; y++) {
    const sy = y - dy;
    if (sy >= 0 && sy < img.h) out.d.set(img.d.subarray(sy * img.w * 4, (sy + 1) * img.w * 4), y * img.w * 4);
  }
  return out;
}
/** A piece hanging from its joint (at row `jy`) stretched from `len` to `to` px long (nearest rows). */
function relength(img: Image, jy: number, len: number, to: number, h = Math.ceil(to) + 10): Image {
  const out = blankCanvas(img.w, h), k = len / to;
  for (let y = 0; y < h; y++) {
    const sy = y <= jy ? y : Math.round(jy + (y - jy) * k);
    if (sy < img.h) out.d.set(img.d.subarray(sy * img.w * 4, (sy + 1) * img.w * 4), y * img.w * 4);
  }
  return out;
}
const rowsOf = (img: Image) => { const b = trim(img); return b ? { top: b.y, bottom: b.y + b.h - 1 } : null; };

function exportWardrobe() {
  const skelFile = join(WARDROBE, 'skeleton.json');
  const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
  const legsOf = (p: string): LegRig | null => { const f = join(ART, p, 'rig', 'legs.json'); const r = existsSync(f) ? read(f) : null; return r?.thigh ? r : null; };
  const armsOf = (p: string): ArmRig | null => { const f = join(ART, p, 'rig', 'arms.json'); return existsSync(f) ? read(f) : null; };
  if (!existsSync(skelFile)) {
    const legs = legsOf('singer'), arms = armsOf('singer'), body = rowsOf(decode(fileOf('singer', 'body/idle')));
    if (!legs || !arms || !body) { console.warn('wardrobe: the singer needs a body, legs and arms first'); return; }
    mkdirSync(WARDROBE, { recursive: true });
    writeFileSync(skelFile, JSON.stringify({ legs, arms: { joint: arms.joint, upper: arms.upper, fore: arms.fore }, neck: body.top, belt: body.bottom, canvas: CANVAS }, null, 1));
  }
  const skel = read(skelFile);
  let made = 0;
  for (const p of WEARERS) {
    const skin = String(sheetOf(BASE, `${p}-cool`).json.geo.skin ?? '');
    const bodyFile = fileOf(p, 'body/idle');
    const ownBody = existsSync(bodyFile) ? decode(bodyFile) : null, rows = ownBody && rowsOf(ownBody);
    const arms = armsOf(p), legs = legsOf(p);
    const item = (kind: string, write: (dir: string) => Record<string, unknown>) => {
      const dir = join(WARDROBE, kind, p);
      if (existsSync(join(dir, 'item.json'))) return;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'item.json'), JSON.stringify({ from: p, skin, ...write(dir) }, null, 1));
      made++;
    };
    // the top: the body sat on the skeleton's belt, the sleeves stretched to its arms
    if (ownBody && rows && arms) item('tops', (dir) => {
      const dy = skel.belt - rows.bottom;
      writeFileSync(join(dir, 'body.png'), encode(shiftY(ownBody, dy)));
      const pieces = Object.fromEntries(ARM_PIECES.map((k) => [k, decode(join(ART, p, 'rig', 'arms', `${k}.png`))]));
      writeFileSync(join(dir, 'upper.png'), encode(relength(pieces.upper, arms.joint[1], arms.upper, skel.arms.upper)));
      writeFileSync(join(dir, 'fore.png'), encode(relength(pieces.fore, arms.joint[1], arms.fore, skel.arms.fore)));
      return { dyes: DYES.tops };
    });
    // the bottoms: the hips at the skeleton's, the thighs and shins stretched to its legs
    if (legs) item('bottoms', (dir) => {
      const src = (k: string) => decode(join(ART, p, 'rig', 'legs', `${k}.png`));
      writeFileSync(join(dir, 'hips.png'), encode(shiftY(src('hips'), skel.legs.hip.L[1] - legs.hip.L[1])));
      for (const s of ['L', 'R']) {
        writeFileSync(join(dir, `thigh-${s}.png`), encode(relength(src(`thigh-${s}`), legs.joint[1], legs.thigh, skel.legs.thigh)));
        writeFileSync(join(dir, `shin-${s}.png`), encode(relength(src(`shin-${s}`), legs.joint[1], legs.shin, skel.legs.shin)));
      }
      return { dyes: DYES.bottoms };
    });
    if (legs) item('shoes', (dir) => {
      for (const s of ['L', 'R']) writeFileSync(join(dir, `shoe-${s}.png`), readFileSync(join(ART, p, 'rig', 'legs', `shoe-${s}.png`)));
      return {};
    });
    // the head: its chin where it was over its own body, moved to the skeleton's neck
    if (rows && existsSync(fileOf(p, 'head/front'))) item('heads', (dir) => {
      const dy = skel.neck - rows.top;
      for (const k of ['front', 'up', 'down']) if (existsSync(fileOf(p, `head/${k}`))) writeFileSync(join(dir, `${k}.png`), encode(shiftY(decode(fileOf(p, `head/${k}`)), dy)));
      // (the singer's head has no mouth drawn: the singing mouths go on it, so it's the singer's only)
      return { sings: p === 'singer' };
    });
  }
  console.log(`art/wardrobe/: ${made} items added from the players' own clothes`);
}

/**
 * Where an item joins the body (canvas pixels), read off its drawing at each pack, so a redrawn piece
 * still fits; a joint set in item.json (by hand or with the rig lab, tools/rig-lab/) wins:
 * - a top's `neck`: where the head's chin goes, just above the collar (the first row as wide as
 *   shoulders: a neck drawn above it is tucked under the chin);
 * - a top's `shoulders` (from the feet, as the arms' rig): 4 rows below the collar, just in from the
 *   body's edges so the sleeve's outside lines up with the body's;
 * - a head's `chin`: the bottom of the face (in the head's skin colour, its outline included).
 * `auto` lists the joints that were found, not set.
 */
function fit(kind: string, dir: string, it: Record<string, unknown>): Record<string, unknown> {
  const px = (img: Image, x: number, y: number) => img.d.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
  const auto: string[] = [];
  if (kind === 'tops' && existsSync(join(dir, 'body.png'))) {
    const body = decode(join(dir, 'body.png')), box = trim(body);
    if (!box) return {};
    const width = (y: number) => { let n = 0; for (let x = 0; x < body.w; x++) if (px(body, x, y)[3]) n++; return n; };
    let collar = box.y;
    while (collar < box.y + box.h - 1 && width(collar) < 12) collar++;
    let neck = it.neck as Pt | number | undefined;
    if (typeof neck === 'number') neck = [CANVAS.ox, neck - 1];
    if (!Array.isArray(neck)) { neck = [CANVAS.ox, collar - 1]; auto.push('neck'); }
    if (it.shoulders) return { neck, auto };
    const row = collar + 4;
    let l = body.w, r = -1;
    for (let x = 0; x < body.w; x++) if (px(body, x, row)[3]) { l = Math.min(l, x); r = Math.max(r, x); }
    // (the sleeve's width either side of its joint, on the upper arm piece)
    let inL = 3, inR = 4;
    if (existsSync(join(dir, 'upper.png'))) {
      const up = decode(join(dir, 'upper.png'));
      const skel = JSON.parse(readFileSync(join(WARDROBE, 'skeleton.json'), 'utf8'));
      const [jx, jy] = skel.arms.joint as Pt;
      const xs: number[] = [];
      for (let y = jy; y < Math.min(up.h, jy + 3); y++) for (let x = 0; x < up.w; x++) if (px(up, x, y)[3]) xs.push(x);
      if (xs.length) { inL = jx - Math.min(...xs); inR = Math.max(...xs) - jx; }
    }
    const y = row - CANVAS.oy;
    auto.push('shoulders');
    return { neck, shoulders: { A: [l + inL - CANVAS.ox, y], B: [r - inR - CANVAS.ox, y] }, auto };
  }
  if (kind === 'heads') {
    if (Array.isArray(it.chin)) return { auto };
    if (!existsSync(join(dir, 'front.png')) || typeof it.skin !== 'string') return {};
    const head = decode(join(dir, 'front.png')), box = trim(head);
    if (!box) return {};
    const skin = [1, 3, 5].map((i) => parseInt((it.skin as string).slice(i, i + 2), 16));
    const isSkin = (c: Uint8ClampedArray) => c[3] > 0 && Math.abs(c[0] - skin[0]) + Math.abs(c[1] - skin[1]) + Math.abs(c[2] - skin[2]) < 70;
    // (the face: skin near the middle of the head, not long hair the colour of skin)
    const cx = Math.round(box.x + box.w / 2), x0 = cx - 8, x1 = cx + 8;
    let low = -1;
    for (let y = box.y; y < box.y + box.h; y++) {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (isSkin(px(head, x, y))) n++;
      if (n >= 2) low = y;
    }
    if (low < 0) return {};
    // (the chin's outline under it)
    let edge = false;
    for (let x = x0; x <= x1; x++) if (isSkin(px(head, x, low)) && low + 1 < head.h && px(head, x, low + 1)[3] && !isSkin(px(head, x, low + 1))) edge = true;
    return { chin: [CANVAS.ox, low + (edge ? 1 : 0)], auto: ['chin'] };
  }
  return {};
}

/** The wardrobe packed for the page (public/band/art/wardrobe.png and .json): every piece, trimmed. */
function packWardrobe() {
  const skelFile = join(WARDROBE, 'skeleton.json');
  if (!existsSync(skelFile)) return;
  const items: Record<string, Record<string, Record<string, unknown>>> = {};
  const parts: { src: Image; box: { x: number; y: number; w: number; h: number }; set: (f: number[]) => void }[] = [];
  for (const kind of ['tops', 'bottoms', 'shoes', 'heads']) {
    items[kind] = {};
    const root = join(WARDROBE, kind);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const dir = join(root, name);
      if (!existsSync(join(dir, 'item.json'))) continue;
      const it: Record<string, unknown> = JSON.parse(readFileSync(join(dir, 'item.json'), 'utf8'));
      const pieces: Record<string, number[]> = {};
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.png') || f.startsWith('_')) continue;
        const img = decode(join(dir, f)), box = trim(img), k = f.replace(/\.png$/, '');
        // [x, y, w, h] on the sheet, then where that box sits on the piece's own canvas, and its size
        if (box) parts.push({ src: img, box, set: (s) => { pieces[k] = [...s, box.x, box.y, img.w, img.h]; } });
        else pieces[k] = [0, 0, 0, 0, 0, 0, img.w, img.h];
      }
      items[kind][name] = { ...it, ...fit(kind, dir, it), pieces };
    }
  }
  const W = 512;
  let x = 0, y = 0, rowH = 0;
  const at = parts.map((q) => {
    if (x + q.box.w > W) { x = 0; y += rowH + 1; rowH = 0; }
    const a = { x, y };
    x += q.box.w + 1; rowH = Math.max(rowH, q.box.h);
    return a;
  });
  const out = blankCanvas(W, Math.max(1, y + rowH));
  parts.forEach((q, k) => { blit(q.src, q.box.x, q.box.y, q.box.w, q.box.h, out, at[k].x, at[k].y); q.set([at[k].x, at[k].y, q.box.w, q.box.h]); });
  writeFileSync(`${OUT}/wardrobe.png`, encode(out));
  // (the fresh moves as redrawn with the rig lab: src/band/moves.ts)
  const movesFile = join(WARDROBE, 'moves.json');
  const moves = existsSync(movesFile) ? JSON.parse(readFileSync(movesFile, 'utf8')) : undefined;
  writeFileSync(`${OUT}/wardrobe.json`, JSON.stringify({ image: 'wardrobe.png', skeleton: JSON.parse(readFileSync(skelFile, 'utf8')), items, moves }));
  console.log(`wardrobe: ${Object.entries(items).map(([k, v]) => `${Object.keys(v).length} ${k}`).join(', ')}`);
}

function legRigOf(p: string) {
  const dir = join(ART, p, 'rig', 'legs');
  if (!existsSync(`${dir}.json`)) return null;
  const rig: LegRig = JSON.parse(readFileSync(`${dir}.json`, 'utf8'));
  if (!rig.thigh) return null; // (the old kind: npm run band-export straightens it)
  return { rig, pieces: Object.fromEntries(PIECES.map((k) => [k, decode(join(dir, `${k}.png`))])) as Pieces };
}

/** The legs' poses made from the rig pieces (art/<player>/rig/legs/), if the player has them. */
function rigLegs(p: string): Map<string, Image> {
  const out = new Map<string, Image>(), r = legRigOf(p);
  if (!r) return out;
  for (const [name, pose] of Object.entries(POSES)) out.set(`legs/${name}`, poseLegs(r.pieces, r.rig, pose, CANVAS));
  return out;
}

/**
 * The player neutral (art/<player>/_neutral.png), to draw against: the legs straight down from the
 * hips, the arms hanging, the body and head facing us. Made from the drawn pieces at each pack.
 */
function neutral(p: string, canvasOf: (n: string) => Image | null, arm: { rig: ArmRig; imgs: Record<'upper' | 'fore', Image> } | null) {
  const out: Image = { w: CANVAS.w, h: CANVAS.h, d: new Uint8ClampedArray(CANVAS.w * CANVAS.h * 4) };
  const add = (n: string) => { const c = canvasOf(n); if (c) over(out, c); };
  add('hair/back');
  const legs = legRigOf(p);
  if (legs) over(out, poseLegs(legs.pieces, legs.rig, POSES.stand, CANVAS, true));
  else add('legs/stand');
  add('body/idle');
  if (arm) for (const [sh, side] of [[arm.rig.shoulders.A, -1], [arm.rig.shoulders.B, 1]] as const) {
    // hanging straight down: the hand at the full reach below the shoulder
    over(out, poseArms(arm.imgs, arm.rig, [{ sh, hand: [sh[0], sh[1] + arm.rig.upper + arm.rig.fore], side, a: arm.rig.upper, b: arm.rig.fore }], null, [CANVAS.ox, CANVAS.oy], CANVAS));
  }
  for (const n of ['head/front', 'eyes/open', 'brows/neutral', 'mouth/rest']) add(n);
  writeFileSync(join(ART, p, '_neutral.png'), encode(out));
}

/* ---------------------------------------------------------------- pack */

function pack() {
  mkdirSync(OUT, { recursive: true });
  for (const p of PLAYERS) {
    const common = new Set(drawn(p));
    const rigged = rigLegs(p);
    const armDir = join(ART, p, 'rig', 'arms');
    const armRig: ArmRig | null = existsSync(`${armDir}.json`) ? JSON.parse(readFileSync(`${armDir}.json`, 'utf8')) : null;
    const armImgs = armRig ? Object.fromEntries(ARM_PIECES.map((k) => [k, decode(join(armDir, `${k}.png`))])) as Record<'upper' | 'fore', Image> : null;
    for (const c of PERSONAS) {
      const name = `${p}-${c}`;
      const { json, img } = sheetOf(BASE, name);
      const own = new Set(drawn(name));
      // a frame as drawn (this character's, the player's) or from the sheet, on the canvas
      const canvasOf = (n: string): Image | null => own.has(n) ? decode(fileOf(name, n)) : common.has(n) ? decode(fileOf(p, n)) : json.frames[n] ? toCanvas(img, json.frames[n]) : null;
      // arm frames from the arm rig: the pieces turned into place, the frame's hand over them
      const made = new Map(rigged);
      const arms = (json.geo.arms ?? {}) as Record<string, ArmPose[]>;
      if (armRig && armImgs) for (const [n, poses] of Object.entries(arms)) made.set(n, poseArms(armImgs, armRig, poses, canvasOf(`hand/${n}`), [CANVAS.ox, CANVAS.oy], CANVAS));
      // (the hands too: the page dresses players from the wardrobe, drawing each arm frame with its hand)
      const names = new Set([...Object.keys(json.frames), ...made.keys()]);
      for (const n of [...common, ...own]) {
        if (names.has(n)) continue;
        if (KNOWN.includes(n) || (armRig && n.startsWith('hand/'))) names.add(n);
        else console.warn(`  ${name}: "${n}.png" isn't a frame the view uses (a typo?), skipped`);
      }
      // each frame: the drawing (trimmed) or the placeholder
      const parts: { name: string; src: Image; box: { x: number; y: number; w: number; h: number }; ox: number; oy: number }[] = [];
      let fromArt = 0;
      for (const n of names) {
        // a drawn frame, else one the rig makes, else the placeholder
        const file = own.has(n) ? fileOf(name, n) : common.has(n) ? fileOf(p, n) : null;
        if (file || made.has(n)) {
          const d = file ? decode(file) : made.get(n)!;
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
      if (c === 'cool' && p !== 'drummer') neutral(p, canvasOf, armRig && armImgs ? { rig: armRig, imgs: armImgs } : null);
      if (c === 'cool') console.log(`${p}: ${fromArt} drawn frames, ${made.size} from the rig, ${parts.length - fromArt - made.size} placeholders`);
    }
  }
  for (const n of ['stage.png', 'stage.json', 'stage-front.png', 'crowd.png', 'crowd.json']) writeFileSync(`${OUT}/${n}`, readFileSync(`${BAND}/${n}`));
  packWardrobe();
  console.log('Packed into public/band/art/. Open band.html?art');
}

if (process.argv.includes('pack')) pack();
else exportArt();
