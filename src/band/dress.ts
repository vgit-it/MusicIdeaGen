// The wardrobe (docs/BAND-VIEW.md, art/README.md): every player's clothes as pieces anyone can wear,
// fitted to one skeleton, and each song's outfits picked from it. A player's own sheet keeps what's
// theirs (the hands, the guitar, the mic, the faces); the clothes and head are put on here, in the
// browser, with the same rig the packer uses: the legs posed, the arms turned from shoulder to hand.
//
// Outfits are picked by the song (the same song, the same band): a top, a bottom, shoes and a head
// each, a player's own a little more likely, no two players in the same top or head, now and then
// dyed another colour. `band.html?art&own`: everyone in their own clothes.

import type { Atlas } from './atlas';
import type { Player } from './persona';
import { type MoveSet, type Moves, legFrames, movesFor, stanceGeo } from './moves';
import { type ArmPose, type ArmRig, type Image, type LegRig, PIECES, type Pieces, type Pt, poseArms, poseLegs } from './rig';

type Piece = number[]; // [x, y, w, h, boxX, boxY, canvasW, canvasH]
interface Item { from: string; skin: string; dyes?: string[]; neck?: [number, number]; chin?: [number, number]; shoulders?: { A: [number, number]; B: [number, number] }; sings?: boolean; pieces: Record<string, Piece> }
type Kind = 'tops' | 'bottoms' | 'shoes' | 'heads';
export interface Wardrobe {
  pix: ImageData;
  skeleton: { legs: LegRig; arms: { joint: [number, number]; upper: number; fore: number }; neck: number; belt: number; canvas: { w: number; h: number; ox: number; oy: number } };
  items: Record<Kind, Record<string, Item>>;
  /** The fresh moves as redrawn (art/wardrobe/moves.json), if they were. */
  moves?: Moves;
}
/** What a player wears: an item of each kind, and a dye for the top and bottom (null: its own colour). */
export interface Outfit { tops: string; bottoms: string; shoes: string; heads: string; dyeTop: string | null; dyeBottom: string | null }

export async function loadWardrobe(base: string): Promise<Wardrobe | null> {
  const r = await fetch(`${base}wardrobe.json`).catch(() => null);
  if (!r?.ok) return null;
  const json = await r.json().catch(() => null);
  if (!json) return null;
  const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = `${base}${json.image}`; });
  return { pix: pixelsOf(img), skeleton: json.skeleton, items: json.items, moves: json.moves };
}

function pixelsOf(img: HTMLImageElement | HTMLCanvasElement): ImageData {
  const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

const blank = (w: number, h: number): Image => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

/** A box of a sheet's pixels onto a fresh canvas (w x h), at (dx, dy). */
function cutOut(pix: ImageData, x: number, y: number, w: number, h: number, cw: number, ch: number, dx: number, dy: number): Image {
  const out = blank(cw, ch);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = dx + i, Y = dy + j;
    if (X < 0 || Y < 0 || X >= cw || Y >= ch) continue;
    const s = ((y + j) * pix.width + x + i) * 4;
    if (pix.data[s + 3]) { const o = (Y * cw + X) * 4, P = pix.data; out.d[o] = P[s]; out.d[o + 1] = P[s + 1]; out.d[o + 2] = P[s + 2]; out.d[o + 3] = P[s + 3]; }
  }
  return out;
}

/* ---------------------------------------------------------------- colours */

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Skin (and its shades) recoloured from one skin to another. */
function reskin(img: Image, from: number[], to: number[]): Image {
  if (from.every((v, i) => v === to[i])) return img;
  const out = { ...img, d: img.d.slice() }, k = to.map((n, i) => n / Math.max(1, from[i]));
  for (let i = 0; i < out.d.length; i += 4) {
    const r = out.d[i], g = out.d[i + 1], b = out.d[i + 2];
    if (!out.d[i + 3] || !r) continue;
    const m = r / from[0];
    if (m > 0.35 && m < 1.6 && Math.abs(g - from[1] * m) < 18 && Math.abs(b - from[2] * m) < 18) {
      out.d[i] = Math.min(255, r * k[0]); out.d[i + 1] = Math.min(255, g * k[1]); out.d[i + 2] = Math.min(255, b * k[2]);
    }
  }
  return out;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function rgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Cloth: not the outline, not skin, not white (prints, soles). */
const isCloth = (d: Uint8ClampedArray, i: number, skin: number[]) => {
  const [, , l] = hsl(d[i], d[i + 1], d[i + 2]);
  if (!d[i + 3] || l < 0.09 || l > 0.8) return false;
  const m = d[i] / Math.max(1, skin[0]);
  return !(m > 0.35 && m < 1.6 && Math.abs(d[i + 1] - skin[1] * m) < 18 && Math.abs(d[i + 2] - skin[2] * m) < 18);
};

/** An item's main cloth colour (the commonest), over all its pieces. */
function mainColour(imgs: Image[], skin: number[]): [number, number, number] {
  const n = new Map<number, [number, number[]]>();
  for (const img of imgs) for (let i = 0; i < img.d.length; i += 4) if (isCloth(img.d, i, skin)) {
    const k = ((img.d[i] >> 4) << 8) | ((img.d[i + 1] >> 4) << 4) | (img.d[i + 2] >> 4);
    const e = n.get(k) ?? [0, [img.d[i], img.d[i + 1], img.d[i + 2]]];
    e[0]++; n.set(k, e);
  }
  const top = [...n.values()].sort((a, b) => b[0] - a[0])[0];
  return top ? hsl(top[1][0], top[1][1], top[1][2]) : [0, 0, 0.3];
}

/**
 * Cloth dyed: the main colour (and the cloth near it in hue, or all the greys if it's grey) moved to
 * the dye, each pixel keeping its light and shade relative to the main colour. Prints in other colours
 * are left as they are.
 */
function dye(img: Image, main: [number, number, number], to: string, skin: number[]): Image {
  const out = { ...img, d: img.d.slice() }, [th, ts, tl] = hsl(...(hex(to) as [number, number, number]));
  const grey = main[1] < 0.15;
  for (let i = 0; i < out.d.length; i += 4) {
    if (!isCloth(out.d, i, skin)) continue;
    const [h, s, l] = hsl(out.d[i], out.d[i + 1], out.d[i + 2]);
    // (a black or grey item: only greys near its own shade, so a strap or trim drawn on it stays)
    const near = grey ? s < 0.2 && Math.abs(l - main[2]) < 0.16 :Math.min(Math.abs(h - main[0]), 360 - Math.abs(h - main[0])) < 35 && s > 0.08;
    if (!near) continue;
    const L = Math.max(0.04, Math.min(0.85, tl + (l - main[2]) * (tl < 0.2 ? 0.8 : 1.1)));
    const S = Math.min(1, grey ? ts : ts * (s / Math.max(0.05, main[1])));
    const [r, g, b] = rgb(th, S, L);
    out.d[i] = r; out.d[i + 1] = g; out.d[i + 2] = b;
  }
  return out;
}

/* ---------------------------------------------------------------- picking outfits */

function rngOf(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/** Who wears the wardrobe: the standing players (the drummer keeps his own for now). */
export const DRESSED: Player[] = ['singer', 'rhythm', 'lead', 'bassist'];

/** The song's outfits. `own`: everyone in their own clothes. */
export function pickOutfits(w: Wardrobe, seed: string, own = false): Partial<Record<Player, Outfit>> {
  const rnd = rngOf(seed), out: Partial<Record<Player, Outfit>> = {}, taken = new Set<string>();
  const pick = (kind: Kind, p: Player, ok: (it: Item) => boolean, unique: boolean) => {
    const names = Object.keys(w.items[kind] ?? {}).filter((n) => ok(w.items[kind][n]));
    if (own || !names.length) return names.includes(p) ? p : names[0] ?? p;
    let free = names.filter((n) => !unique || !taken.has(`${kind}/${n}`));
    if (!free.length) free = names;
    // (a player's own: twice as likely)
    const wt = free.map((n) => (n === p ? 2 : 1));
    let r = rnd() * wt.reduce((a, b) => a + b, 0), k = 0;
    while (r >= wt[k] && k < free.length - 1) r -= wt[k++];
    if (unique) taken.add(`${kind}/${free[k]}`);
    return free[k];
  };
  const dyeOf = (kind: Kind, name: string) => {
    const dyes = w.items[kind][name]?.dyes ?? [];
    return own || !dyes.length || rnd() < 0.5 ? null : dyes[Math.floor(rnd() * dyes.length)];
  };
  // (the singer first: the singer's head is only the singer's)
  for (const p of DRESSED) {
    const tops = pick('tops', p, () => true, true), bottoms = pick('bottoms', p, () => true, false);
    out[p] = {
      tops, bottoms, shoes: pick('shoes', p, () => true, false),
      heads: pick('heads', p, (it) => !!it.sings === (p === 'singer'), true),
      dyeTop: dyeOf('tops', tops), dyeBottom: dyeOf('bottoms', bottoms),
    };
  }
  return out;
}

/* ---------------------------------------------------------------- dressing a player */

const cache = new Map<string, Atlas>();
/** Forget the dressed sheets (the rig lab, after the art changes). */
export function forgetDressed() { cache.clear(); }

const sheetPix = new WeakMap<object, ImageData>();

/**
 * The player's sheet with the outfit on: their own frames (hands, guitar, faces...) and the outfit's
 * body, head, leg poses and arm frames, made from the wardrobe's pieces.
 */
export function dress(w: Wardrobe, own: Atlas, key: string, o: Outfit, set: MoveSet = 'fresh', role = 'all'): Atlas {
  const ck = `${key}|${set}|${role}|${JSON.stringify(o)}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const { canvas: C, legs: skelLegs, arms: skelArms } = w.skeleton;
  const top = w.items.tops[o.tops], bottom = w.items.bottoms[o.bottoms], shoes = w.items.shoes[o.shoes], head = w.items.heads[o.heads];
  const skin = hex(head.skin);
  const piece = (it: Item, k: string, dy = 0, dx = 0): Image | null => {
    const f = it.pieces[k];
    return f ? cutOut(w.pix, f[0], f[1], f[2], f[3], f[6], f[7], f[4] + dx, f[5] + dy) : null;
  };
  // the pieces, skinned to the head and dyed
  const dressed = (it: Item, keys: string[], dyeTo: string | null, dy = 0, dx = 0) => {
    let imgs = keys.map((k) => piece(it, k, dy, dx) ?? blank(1, 1));
    imgs = imgs.map((im) => reskin(im, hex(it.skin), skin));
    if (dyeTo) { const main = mainColour(imgs, skin); imgs = imgs.map((im) => dye(im, main, dyeTo, skin)); }
    return Object.fromEntries(keys.map((k, i) => [k, imgs[i]]));
  };
  const t = dressed(top, ['body', 'upper', 'fore'], o.dyeTop);
  const b = dressed(bottom, ['hips', 'thigh-L', 'thigh-R', 'shin-L', 'shin-R'], o.dyeBottom);
  const s = dressed(shoes, ['shoe-L', 'shoe-R'], null);
  // (the head's chin on the top's neck; the face (eyes, brows, mouth) moved with it)
  const [hx, hy] = top.neck && head.chin ? [top.neck[0] - head.chin[0], top.neck[1] - head.chin[1]] : [0, 0];
  const h = dressed(head, ['front', 'up', 'down'].filter((k) => head.pieces[k]), null, hy, hx);

  // the player's own sheet as pixels (the hands)
  let pix = sheetPix.get(own.img);
  if (!pix) { pix = pixelsOf(own.img); sheetPix.set(own.img, pix); }
  const ownSkin = own.geo.skin ? hex(own.geo.skin) : skin;
  const frameOf = (n: string): Image | null => {
    const f = own.frames[n];
    return f ? reskin(cutOut(pix!, f[0], f[1], f[2], f[3], C.w, C.h, C.ox - f[4], C.oy - f[5]), ownSkin, skin) : null;
  };

  const made = new Map<string, Image>();
  made.set('body/idle', t.body);
  for (const k of ['front', 'up', 'down']) if (h[k]) made.set(`head/${k}`, h[k]);
  const pieces = { hips: b.hips, 'thigh-L': b['thigh-L'], 'thigh-R': b['thigh-R'], 'shin-L': b['shin-L'], 'shin-R': b['shin-R'], 'shoe-L': s['shoe-L'], 'shoe-R': s['shoe-R'] } as Pieces;
  if (PIECES.every((k) => pieces[k]) && own.frames['legs/stand']) for (const [n, pose] of Object.entries(legFrames(set, w.moves, role))) made.set(`legs/${n}`, poseLegs(pieces, skelLegs, pose, C));
  const arms = (own.geo as { arms?: Record<string, ArmPose[]> }).arms ?? {};
  if (top.shoulders) {
    const rig: ArmRig = { shoulders: top.shoulders, joint: skelArms.joint, upper: skelArms.upper, fore: skelArms.fore, sleeve: 'long' };
    const freshArms = movesFor(w.moves, role).arms;
    for (const [n, poses] of Object.entries(arms)) {
      let ps = poses, hand = frameOf(`hand/${n}`);
      // (fresh moves: the singer's hand placed from the top's shoulder, its drawing moved with it)
      const off = set === 'fresh' ? freshArms[n] : undefined;
      if (off && ps.length === 1) {
        const sh = ps[0].side < 0 ? top.shoulders.A : top.shoulders.B, to: Pt = [sh[0] + off[0], sh[1] + off[1]];
        if (hand) hand = moved(hand, Math.round(to[0] - ps[0].hand[0]), Math.round(to[1] - ps[0].hand[1]));
        ps = [{ ...ps[0], hand: to }];
      }
      // (the arm and its hand apart: the hand drawn over the guitar and the head, the arm under them)
      made.set(n, poseArms({ upper: t.upper, fore: t.fore }, rig, ps, null, [C.ox, C.oy], C));
      if (hand) made.set(`hand/${n}`, hand);
    }
  }

  // a new sheet: the player's own on top, the made frames in rows under it
  const boxes = [...made].map(([n, img]) => ({ n, img, box: trim(img) }));
  const Wd = Math.max(512, own.img.width);
  let x = 0, y = own.img.height + 1, rowH = 0;
  const at = boxes.map((q) => {
    if (!q.box) return null;
    if (x + q.box.w > Wd) { x = 0; y += rowH + 1; rowH = 0; }
    const a = { x, y };
    x += q.box.w + 1; rowH = Math.max(rowH, q.box.h);
    return a;
  });
  const cv = Object.assign(document.createElement('canvas'), { width: Wd, height: y + rowH });
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(own.img, 0, 0);
  const frames = { ...own.frames };
  for (const n of Object.keys(frames)) if (/^(eyes|brows|mouth)\//.test(n)) { const f = [...frames[n]]; f[4] -= hx; f[5] -= hy; frames[n] = f; }
  boxes.forEach((q, i) => {
    const a = at[i];
    if (!q.box || !a) { delete frames[q.n]; return; }
    const id = new ImageData(q.box.w, q.box.h);
    for (let j = 0; j < q.box.h; j++) id.data.set(q.img.d.subarray(((q.box.y + j) * q.img.w + q.box.x) * 4, ((q.box.y + j) * q.img.w + q.box.x + q.box.w) * 4), j * q.box.w * 4);
    ctx.putImageData(id, a.x, a.y);
    frames[q.n] = [a.x, a.y, q.box.w, q.box.h, C.ox - q.box.x, C.oy - q.box.y];
  });
  const sk = `#${skin.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const atlas: Atlas = { img: cv, frames, geo: { ...own.geo, skin: sk, moves: set, stance: stanceGeo(w.moves, role) } };
  cache.set(ck, atlas);
  return atlas;
}

/** A picture moved by (dx, dy). */
function moved(src: Image, dx: number, dy: number): Image {
  const out = blank(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const X = x + dx, Y = y + dy, i = (y * src.w + x) * 4;
    if (src.d[i + 3] && X >= 0 && Y >= 0 && X < src.w && Y < src.h) out.d.set(src.d.subarray(i, i + 4), (Y * src.w + X) * 4);
  }
  return out;
}

function trim(img: Image) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.d[(y * img.w + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

