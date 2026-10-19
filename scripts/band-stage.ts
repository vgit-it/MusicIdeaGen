// The stage from Paul's paintings (docs/BAND-VIEW.md): Stage_BG.png (the empty stage) and
// Stage_Front.png (the monitors and the stage's front edge, over the players' feet), painted large in a
// pixel-art style, made into real pixel art at the band's own pixel size: shrunk (each pixel the average
// of the painting's pixels under it) and put on one small palette, so the stage's pixels are the same
// size and kind as the players'. Also writes where the stage's lights are (stage.json).
// Run: npm run band-stage (after changing a painting). Inputs: experiments/VisualsReference/.

import { writeFileSync } from 'node:fs';
import { type Image, decode, encode } from './png';

const SRC = 'experiments/VisualsReference';
const OUT = 'public/band';
/** The game's picture: 350 x 180 (the paintings' shape, at the players' pixel size). */
const W = 350, H = 180;
/** How many colours the stage gets, and whether to dither between them. */
const COLOURS = 48;
const DITHER = process.argv.includes('--dither');

/* ---------------------------------------------------------------- shrink and palette */

/** Shrink by `s`: each new pixel the average (by opacity) of the painting's pixels under it. */
function shrink(src: Image, s: number, w: number, h: number): Image {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(y * s); sy < Math.min(src.h, Math.floor((y + 1) * s)); sy++) for (let sx = Math.floor(x * s); sx < Math.min(src.w, Math.floor((x + 1) * s)); sx++) {
      const i = (sy * src.w + sx) * 4, al = src.d[i + 3];
      r += src.d[i] * al; g += src.d[i + 1] * al; b += src.d[i + 2] * al; a += al; n++;
    }
    const o = (y * w + x) * 4;
    if (a) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; }
    // (pixel art: a pixel is there or it isn't)
    d[o + 3] = n && a / n >= 128 ? 255 : 0;
  }
  return { w, h, d };
}

/** A palette of `n` colours for these pixels (median cut: split the busiest box of colours in two, again and again). */
function paletteOf(imgs: Image[], n: number): number[][] {
  const px: number[][] = [];
  for (const im of imgs) for (let i = 0; i < im.d.length; i += 4) if (im.d[i + 3]) px.push([im.d[i], im.d[i + 1], im.d[i + 2]]);
  let boxes = [px];
  while (boxes.length < n) {
    let bi = -1, bestRange = -1, axis = 0;
    boxes.forEach((box, k) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of box) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); }
        const range = (hi - lo) * Math.sqrt(box.length);
        if (range > bestRange) { bestRange = range; bi = k; axis = c; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi].sort((p, q) => p[axis] - q[axis]);
    boxes = [...boxes.slice(0, bi), box.slice(0, box.length >> 1), box.slice(box.length >> 1), ...boxes.slice(bi + 1)];
  }
  return boxes.filter((b) => b.length).map((box) => [0, 1, 2].map((c) => Math.round(box.reduce((s, p) => s + p[c], 0) / box.length)));
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function toPalette(img: Image, pal: number[][]) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (!img.d[i + 3]) continue;
    const t = DITHER ? (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 18 : 0;
    let best = pal[0], bd = Infinity;
    for (const p of pal) {
      const dr = img.d[i] + t - p[0], dg = img.d[i + 1] + t - p[1], db = img.d[i + 2] + t - p[2];
      const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (dist < bd) { bd = dist; best = p; }
    }
    img.d[i] = best[0]; img.d[i + 1] = best[1]; img.d[i + 2] = best[2];
  }
}

/* ---------------------------------------------------------------- the stage */

const bg = decode(`${SRC}/Stage_BG.png`);
const front = decode(`${SRC}/Stage_Front.png`);
const s = bg.w / W;
/** Where the front layer sits in the painting (measured against Stage Reference.png). */
const FRONT_AT = { x: 0, y: 474 };
const small = shrink(bg, s, W, H);
const fw = Math.round(front.w / s), fh = Math.round(front.h / s);
const smallFront = shrink(front, s, fw, fh);
const pal = paletteOf([small, smallFront], COLOURS);
toPalette(small, pal);
toPalette(smallFront, pal);
writeFileSync(`${OUT}/stage.png`, encode(small));
writeFileSync(`${OUT}/stage-front.png`, encode(smallFront));

// the stage's lights, in the painting's pixels (scaled to the game's): the 16 lamps along the truss
// (big and small, alternating), the LIVE neon and its lightning bolt
const at = (v: number) => Math.round(v / s);
const lamps = [75, 128, 175, 242, 300, 372, 430, 505, 610, 665, 712, 775, 840, 910, 955, 1010];
const lights = {
  source: 'import',
  cans: lamps.map((x, k) => [at(x), at(k % 2 ? 56 : 52)]),
  bulbs: [],
  neon: [
    { x: at(148), y: at(105), w: at(84), h: at(45), color: '#ff3a7a' },
    { x: at(172), y: at(155), w: at(28), h: at(50), color: '#ff3a7a' },
  ],
  front: { x: at(FRONT_AT.x), y: at(FRONT_AT.y) },
};
writeFileSync(`${OUT}/stage.json`, JSON.stringify(lights));
console.log(`stage: ${W}x${H} from ${bg.w}x${bg.h} (÷${s.toFixed(2)}), front ${fw}x${fh} at y ${lights.front.y}, ${pal.length} colours${DITHER ? ', dithered' : ''}`);
