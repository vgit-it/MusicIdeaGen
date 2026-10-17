// Placeholder pixel-art sprites for the band view (docs/BAND-VIEW.md): each player's parts drawn in
// code, packed into one PNG sheet per player with a JSON of frames, in public/band/. Paul's own art
// replaces them later (same frame names, same space: the player's feet at the origin).
// Run: npm run band-sprites

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { zlibSync } from 'fflate';

type RGBA = [number, number, number, number];
type Pt = [number, number];
const hex = (h: string, a = 255): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const OUT = 'public/band';
const INK = hex('#1b1626');

/* ---------------------------------------------------------------- a tiny pixel painter */

/** A frame drawn in the player's space: (0, 0) is the player's feet, y up is negative. */
class Img {
  data: Uint8ClampedArray;
  constructor(readonly w = 140, readonly h = 130, readonly ox = 70, readonly oy = 122) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGBA) {
    const px = Math.floor(x) + this.ox, py = Math.floor(y) + this.oy;
    if (px < 0 || py < 0 || px >= this.w || py >= this.h || c[3] === 0) return;
    const i = (py * this.w + px) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3];
  }
  alpha(px: number, py: number) {
    return px < 0 || py < 0 || px >= this.w || py >= this.h ? 0 : this.data[(py * this.w + px) * 4 + 3];
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  disc(cx: number, cy: number, r: number, c: RGBA) { this.ellipse(cx, cy, r, r, c); }
  /** A line `t` pixels thick. */
  line(a: Pt, b: Pt, c: RGBA, t = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      if (t <= 1) this.set(x, y, c);
      else this.disc(x, y, t / 2, c);
    }
  }
  poly(pts: Pt[], c: RGBA) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const yc = y + 0.5, xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
  }
  /** A 1px dark outline around everything drawn (the pixel-art look). */
  outline(c = INK) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y)) continue;
      if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) add.push(x, y);
    }
    for (let k = 0; k < add.length; k += 2) this.set(add[k] - this.ox, add[k + 1] - this.oy, c);
    return this;
  }
  trim() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.alpha(x, y)) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
}

/* ---------------------------------------------------------------- PNG and sheets */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function png(w: number, h: number, rgba: Uint8ClampedArray) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())];
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}

/** Collects one player's frames, then packs them into a sheet: frames { name: [x, y, w, h, originX, originY] }. */
class Sheet {
  private frames: { name: string; img: Img; box: ReturnType<Img['trim']> }[] = [];
  add(name: string, draw: (g: Img) => void, outline = true, canvas?: Img) {
    const g = canvas ?? new Img();
    draw(g);
    if (outline) g.outline();
    this.frames.push({ name, img: g, box: g.trim() });
  }
  save(name: string, geo: object) {
    const W = 512;
    let x = 0, y = 0, rowH = 0;
    const placed = this.frames.map((f) => {
      if (x + f.box.w > W) { x = 0; y += rowH + 1; rowH = 0; }
      const at = { x, y };
      x += f.box.w + 1; rowH = Math.max(rowH, f.box.h);
      return at;
    });
    const H = y + rowH;
    const out = new Uint8ClampedArray(W * H * 4);
    const frames: Record<string, number[]> = {};
    this.frames.forEach((f, k) => {
      const { x: dx, y: dy } = placed[k];
      for (let j = 0; j < f.box.h; j++) for (let i = 0; i < f.box.w; i++) {
        const s = ((f.box.y + j) * f.img.w + f.box.x + i) * 4, d = ((dy + j) * W + dx + i) * 4;
        out.set(f.img.data.subarray(s, s + 4), d);
      }
      frames[f.name] = [dx, dy, f.box.w, f.box.h, f.img.ox - f.box.x, f.img.oy - f.box.y];
    });
    writeFileSync(`${OUT}/${name}.png`, png(W, H, out));
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ image: `${name}.png`, frames, geo }));
    console.log(`${name}: ${this.frames.length} frames, ${W}x${H}`);
  }
}

/* ---------------------------------------------------------------- people */

// Proportions after the Scott Pilgrim game's sprites (Paul Robertson): about 3 heads tall, a big head
// with big hair and big eyes (whites, pupils, a shine), a short torso, solid limbs, big hands and feet,
// knees a little bent, thick dark outlines, three tones of shading.

interface Look {
  skin: string; hair: string; shirt: string; shirt2: string; pants: string; shoes: string;
  hairStyle: 'spiky' | 'beanie' | 'long' | 'bob' | 'band';
  /** What they wear on top: a tee, an open jacket over the tee, a hoodie, a tank top. */
  top?: 'tee' | 'jacket' | 'hoodie' | 'tank';
  /** The jacket or hoodie's colour (the tee shows through an open jacket). */
  coat?: string;
  /** Stripes on long sleeves, wristbands (spiked or not), boots instead of sneakers. */
  stripes?: string;
  bands?: string;
  spikes?: boolean;
  boots?: boolean;
  /** On the face and head, over the eyes: shades, a side fringe, a sweatband, eyeliner. */
  acc?: ('shades' | 'fringe' | 'sweatband' | 'eyeliner')[];
}
const shade = (c: string, k: number): RGBA => { const [r, g, b] = hex(c); return [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), 255]; };

const HIP = -33, SHOULDER = -55, HEAD: Pt = [0, -70];
const HEAD_R = 13;
/** Where the face features sit for each head pose (how far they move). */
const POSES: Record<string, Pt> = { front: [0, 0], up: [0, -2], down: [0, 2] };
const SH_A: Pt = [-8.5, SHOULDER + 2], SH_B: Pt = [8.5, SHOULDER + 2];
const ARM = 12.5;

function legs(s: Sheet, L: Look) {
  /** One leg from the hip through the knee to a sneaker on the foot (side: -1 screen left, 1 right). */
  const leg = (g: Img, side: number, knee: Pt, foot: Pt) => {
    const hip: Pt = [side * 3.5, HIP + 1];
    g.line(hip, knee, hex(L.pants), 6);
    g.line(knee, foot, hex(L.pants), 5);
    g.line([hip[0] + side * 1.5, hip[1]], [knee[0] + side * 1.5, knee[1]], shade(L.pants, 0.75), 1.4);
    g.line([knee[0] + side * 1.2, knee[1]], [foot[0] + side * 1.4, foot[1] - 2], shade(L.pants, 0.75), 1.2);
    g.rect(knee[0] - side * 1.5, knee[1] - 3, 1, 2, shade(L.pants, 1.2));
    // big sneakers: a white sole and toe cap
    const fx = foot[0] + side * 2, fy = foot[1];
    g.ellipse(fx, fy, 5.5, 3, hex(L.shoes));
    if (L.boots) { g.rect(fx - 5.5, fy + 1.5, 11, 1.5, hex('#3a3436')); g.rect(fx - 2.5, fy - 4, 5, 3, hex(L.shoes)); g.set(fx - 1, fy - 2, hex('#8a8a90')); return; }
    g.rect(fx - 5.5, fy + 1.5, 11, 1.5, hex('#f2f0ea'));
    g.rect(fx + (side > 0 ? 2 : -5), fy - 0.5, 3, 2, hex('#f2f0ea'));
  };
  const frame = (name: string, l: [Pt, Pt], r: [Pt, Pt]) => s.add(`legs/${name}`, (g) => {
    leg(g, -1, l[0], l[1]);
    leg(g, 1, r[0], r[1]);
    g.rect(-7, HIP, 14, 4, hex(L.pants));
  });
  // knees a little bent and out: a ready stance; wider when it's loud
  frame('stand', [[-5, -15], [-4, -3]], [[5, -15], [4, -3]]);
  frame('wide', [[-7.5, -15], [-7.5, -3]], [[7.5, -15], [7.5, -3]]);
  // walking toward us across the stage: a foot lifted, then the other
  frame('walk/0', [[-5, -15], [-5, -3]], [[5, -15], [5, -3]]);
  frame('walk/1', [[-6, -18], [-5, -8]], [[4, -15], [3, -3]]);
  frame('walk/2', [[-5, -15], [-4, -3]], [[5, -15], [4, -3]]);
  frame('walk/3', [[-4, -15], [-3, -3]], [[6, -18], [5, -8]]);
  // in the air, knees tucked up
  frame('jump', [[-7, -22], [-5, -12]], [[7, -22], [5, -12]]);
  // a lunge: the screen-left knee bent low and forward, the other leg long behind
  frame('lunge', [[-10, -13], [-13, -3]], [[6, -14], [10, -3]]);
}

/** The top half's clothes, from the shoulders (`top`) to the waist (`bottom`): a tee, an open jacket, a hoodie, a tank top. */
function shirtOn(g: Img, L: Look, top: number, bottom: number) {
  const kind = L.top ?? 'tee';
  const body = hex(kind === 'jacket' || kind === 'hoodie' ? L.coat ?? L.shirt : L.shirt);
  const bodyD = kind === 'jacket' || kind === 'hoodie' ? shade(L.coat ?? L.shirt, 0.75) : shade(L.shirt, 0.78);
  g.rect(-2.5, top - 4, 5, 5, hex(L.skin)); // neck
  g.rect(-2.5, top - 2, 5, 2, shade(L.skin, 0.75)); // the head's shadow
  if (kind === 'tank') {
    // bare shoulders, straps
    for (const x of [-8, 8]) g.disc(x, top + 3, 3.2, hex(L.skin));
    g.poly([[-6.5, top + 2], [6.5, top + 2], [7, bottom], [-7, bottom]], body);
    g.rect(-6.5, top - 0.5, 2, 3, body); g.rect(4.5, top - 0.5, 2, 3, body);
    g.poly([[2.5, top + 2], [6.5, top + 2], [7, bottom], [3.5, bottom]], bodyD);
    g.rect(-3, top + 7, 6, 6, hex(L.shirt2)); // a print
    g.set(-1, top + 9, hex('#f2f0ea')); g.set(1, top + 9, hex('#f2f0ea'));
  } else {
    g.poly([[-9, top], [9, top], [7, bottom], [-7, bottom]], body);
    for (const x of [-8, 8]) g.disc(x, top + 3, 3.2, body);
    g.poly([[2.5, top], [9, top], [7, bottom], [3.5, bottom]], bodyD);
    g.disc(8, top + 3, 3.2, bodyD);
    g.rect(-7, top + 1, 5, 1, kind === 'jacket' ? shade(L.coat ?? L.shirt, 1.5) : shade(L.shirt, 1.22)); // light from above (a leather shine)
    g.rect(-8, top + 2, 1, 6, kind === 'jacket' ? shade(L.coat ?? L.shirt, 1.35) : shade(L.shirt, 1.12));
    if (kind === 'jacket') {
      // open: the tee down the middle, lapels, a zip
      g.poly([[-3, top], [3, top], [2.5, bottom], [-2.5, bottom]], hex(L.shirt));
      g.poly([[-3, top], [-5.5, top + 6], [-3, top + 8]], shade(L.coat ?? L.shirt, 1.3));
      g.poly([[3, top], [5.5, top + 6], [3, top + 8]], shade(L.coat ?? L.shirt, 0.6));
      g.rect(-2, top + 7, 4, 4, hex(L.shirt2));
      g.set(-3.5, top + 12, hex('#c8c8d0')); g.set(-3.5, top + 15, hex('#c8c8d0'));
    } else if (kind === 'hoodie') {
      // the hood round the neck, drawstrings, a pocket
      g.poly([[-6, top - 1], [6, top - 1], [4, top + 3], [-4, top + 3]], shade(L.coat ?? L.shirt, 0.6));
      g.rect(-1.5, top + 3, 1, 5, hex('#e8e4dc')); g.rect(1, top + 3, 1, 4, hex('#e8e4dc'));
      g.rect(-5, bottom - 7, 10, 4, shade(L.coat ?? L.shirt, 0.8));
      if (L.stripes) g.rect(-2.5, top + 10, 5, 2, hex(L.stripes));
    } else {
      g.rect(-3, top, 6, 2, shade(L.shirt, 0.6)); // the collar
      g.rect(-3, top + 6, 6, 6, hex(L.shirt2)); // a print
      g.rect(-1, top + 8, 2, 2, hex(L.shirt));
    }
  }
}

function torso(s: Sheet, L: Look) {
  s.add('body/idle', (g) => {
    shirtOn(g, L, SHOULDER, HIP);
    g.rect(-7, HIP - 1, 14, 2, shade(L.pants, 0.55)); // belt
    g.rect(-1, HIP - 1, 2, 2, hex(L.spikes ? '#c8c8d0' : '#d8c070'));
    if (L.spikes) for (let x = -6; x <= 6; x += 3) g.set(x, HIP - 1, hex('#c8c8d0')); // a studded belt
  });
}

/** Things worn on the face and head, drawn over the eyes (the view moves them with the head). */
function extras(s: Sheet, L: Look, lift = 0) {
  const ey = HEAD[1] + 1 + lift, ex = 5;
  for (const a of L.acc ?? []) s.add(`acc/${a}`, (g) => {
    if (a === 'shades') {
      // wayfarers: two dark lenses with a shine, a bridge, arms to the ears
      for (const x of [-ex - 2.5, ex - 2.5]) { g.rect(x - 0.5, ey - 3, 6, 5, INK); g.rect(x + 0.5, ey - 2, 4, 3, hex('#2a2a3a')); g.set(x + 1, ey - 2, hex('#8a9ab8')); }
      g.rect(-2, ey - 2, 4, 1, INK);
      g.rect(-HEAD_R + 1, ey - 2, 3, 1, INK); g.rect(HEAD_R - 4, ey - 2, 3, 1, INK);
    } else if (a === 'fringe') {
      // a long side fringe sweeping down over one eye
      const hair = hex(L.hair), hairD = shade(L.hair, 0.7);
      g.poly([[-HEAD_R + 1, ey - 9], [4, ey - 9], [-2, ey - 4], [-6, ey + 2], [-HEAD_R + 1, ey + 3]], hair);
      g.poly([[-HEAD_R + 2, ey - 6], [-4, ey - 6], [-7, ey + 1], [-HEAD_R + 2, ey + 2]], hairD);
      g.line([2, ey - 8], [-5, ey + 1], shade(L.hair, 1.4), 1);
    } else if (a === 'sweatband') {
      g.rect(-HEAD_R + 1, ey - 9, 2 * HEAD_R - 2, 3, hex('#d8d6d0'));
      g.rect(-HEAD_R + 1, ey - 8, 2 * HEAD_R - 2, 1, shade('#d8d6d0', 0.8));
    } else if (a === 'eyeliner') {
      for (const x of [-ex - 2, ex - 2]) { g.rect(x - 0.5, ey + 3, 5, 1, INK); }
      g.set(-ex - 3, ey - 3, INK); g.set(ex + 2.5, ey - 3, INK);
    }
  }, a === 'shades');
}

/** Hair in units of the old 10.5px head, scaled to this one. */
function hairOf(g: Img, L: Look, cy: number, f: number) {
  const k = HEAD_R / 10.5, r = HEAD_R;
  const P = (x: number, y: number): Pt => [x * k, cy + y * k];
  const poly = (pts: [number, number][], c: RGBA) => g.poly(pts.map(([x, y]) => P(x, y)), c);
  const hair = hex(L.hair), hairD = shade(L.hair, 0.72), hairL = shade(L.hair, 1.3);
  const fy = f / 2;
  switch (L.hairStyle) {
    case 'spiky':
      g.ellipse(0, cy + (-6 + fy) * k, r + 1, 6.5 * k, hair);
      for (let j = -4; j <= 4; j++) poly([[j * 2.8 - 3, -8 + fy], [j * 2.8 + 3, -8 + fy], [j * 3.4, -20 + Math.abs(j) * 1.3 + fy]], j % 2 ? hairD : hair);
      poly([[-10.5, -6], [-2, -6 + f], [-11.5, 3]], hair);
      poly([[10.5, -6], [2, -6 + f], [11.5, 3]], hair);
      poly([[-6, -7 + fy], [0, -7 + fy], [-4, -1 + f]], hair); // a fringe lock
      break;
    case 'beanie':
      g.ellipse(0, cy + (-6 + fy) * k, r + 1.5, 8 * k, hex('#3a3a3e'));
      g.rect(-r - 1.5, cy + (-4 + fy) * k, 2 * r + 3, 4, hex('#2a2a2e'));
      for (let x = -r; x < r; x += 2) g.set(x, cy + (-3 + fy) * k, hex('#46464c'));
      g.rect(-r + 1, cy + (-6.5 + fy) * k, 5, 1, hex('#55555c'));
      g.rect(-r, cy + (-0.5 + fy) * k, 4, 6, hair); g.rect(r - 4, cy + (-0.5 + fy) * k, 4, 6, hair);
      break;
    case 'long':
      g.ellipse(0, cy + (-5 + fy) * k, r + 1.5, 7.5 * k, hair);
      g.rect(-r - 2, cy - 5 * k, 5, 20 * k, hair); g.rect(r - 3, cy - 5 * k, 5, 20 * k, hair);
      poly([[-8, -6], [3, -6], [-5, f]], hairD);
      poly([[2, -6], [8, -6], [7, -1 + f]], hair);
      break;
    case 'bob':
      g.ellipse(0, cy + (-5 + fy) * k, r + 1.5, 7.5 * k, hair);
      g.rect(-r - 2, cy - 5 * k, 6, 12 * k, hair); g.rect(r - 4, cy - 5 * k, 6, 12 * k, hair);
      g.rect(-8 * k, cy + (-7 + fy) * k, 16 * k, (4 + fy) * k, hair);
      for (let x = -7; x < 8; x += 3) g.set(x * k, cy + (-3 + f) * k, hairD);
      break;
    case 'band':
      g.ellipse(0, cy + (-4 + fy) * k, r + 0.5, 7 * k, hairD);
      for (let j = -2; j <= 2; j++) poly([[j * 2.4 - 1.6, -9], [j * 2.4 + 1.6, -9], [j * 2.4, -17 + Math.abs(j) * 1.5]], hair);
      g.rect(-r - 1, cy + (-4 + fy) * k, 2 * r + 2, 3, hex('#7a1e22'));
      g.rect(r - 1, cy + (-3 + fy) * k, 4, 5, hex('#7a1e22'));
      break;
  }
  if (L.hairStyle !== 'beanie' && L.hairStyle !== 'band') { g.rect(-7 * k, cy + (-10 + fy) * k, 6, 1, hairL); g.rect(-6 * k, cy + (-9 + fy) * k, 3, 1, hairL); }
}

function head(s: Sheet, L: Look, lift = 0) {
  if (L.hairStyle === 'long') s.add('hair/back', (g) => { g.poly([[-HEAD_R - 2, HEAD[1] - 5 + lift], [HEAD_R + 2, HEAD[1] - 5 + lift], [HEAD_R + 3, SHOULDER + 8 + lift], [-HEAD_R - 3, SHOULDER + 8 + lift]], shade(L.hair, 0.72)); });
  for (const pose of Object.keys(POSES)) s.add(`head/${pose}`, (g) => {
    const [, dy] = POSES[pose];
    const cy = HEAD[1] + dy / 2 + lift;
    const skin = hex(L.skin), skinD = shade(L.skin, 0.88);
    g.ellipse(-HEAD_R, cy + 1, 2.4, 3.2, skin); // ears
    g.ellipse(HEAD_R, cy + 1, 2.4, 3.2, skinD);
    g.ellipse(0, cy - 1, HEAD_R, HEAD_R - 1.5, skin);
    g.poly([[-HEAD_R + 1, cy + 2], [HEAD_R - 1, cy + 2], [5, cy + 11.5], [-5, cy + 11.5]], skin); // a narrower jaw
    g.poly([[3, cy + 1], [HEAD_R - 0.5, cy - 1], [HEAD_R - 1, cy + 3], [5, cy + 11.5], [2, cy + 11.5]], skinD);
    g.rect(-9, cy + 4, 3, 1, shade(L.skin, 1.06)); // a cheek
    g.set(0, cy + 3, shade(L.skin, 0.8)); // the nose
    if (pose === 'up') g.rect(-4, cy + 11, 8, 2, shade(L.skin, 0.78));
    hairOf(g, L, cy - 2.5, dy);
  });
}

/** Eyes, brows and mouths at the front pose (the view moves them with the head). No outline: they sit on the face. */
function face(s: Sheet, L: Look, lift = 0) {
  const ey = HEAD[1] + 1 + lift, ex = 5, dark = INK, white = hex('#f6f2ea'), lid = shade(L.skin, 0.68), shine = hex('#ffffff');
  // big anime eyes: a white 4 wide and 5 tall, a 2x3 pupil with a shine, a heavy upper lid
  const eye = (fn: (g: Img, x: number) => void) => (g: Img) => { fn(g, -ex - 2); fn(g, ex - 2); };
  const iris = (g: Img, x: number, dx: number, h = 3) => { g.rect(x + 1 + dx, ey - 1, 2, h, dark); g.set(x + 1 + dx, ey - 1, shine); };
  const lidTop = (g: Img, x: number, y = ey - 3) => g.rect(x - 0.5, y, 5, 1, dark);
  s.add('eyes/open', eye((g, x) => { g.rect(x, ey - 2, 4, 5, white); lidTop(g, x); iris(g, x, 0.5); }), false);
  s.add('eyes/half', eye((g, x) => { g.rect(x, ey, 4, 3, white); g.rect(x, ey - 2, 4, 2, lid); lidTop(g, x, ey - 1); iris(g, x, 0.5, 2); }), false);
  s.add('eyes/closed', eye((g, x) => { g.rect(x - 0.5, ey + 1, 5, 1, dark); g.set(x - 1, ey, dark); g.set(x + 4, ey, dark); }), false);
  s.add('eyes/squeeze', (g) => {
    for (const [x, d] of [[-ex - 2, 1], [ex - 2, -1]] as const) { g.line([x - 0.5 + (d > 0 ? 0 : 4), ey - 2], [x + 2, ey], dark); g.line([x + 2, ey], [x - 0.5 + (d > 0 ? 0 : 4), ey + 2], dark); }
  }, false);
  s.add('eyes/wide', eye((g, x) => { g.rect(x - 0.5, ey - 3, 5, 6, white); lidTop(g, x, ey - 4); g.rect(x + 1, ey - 1, 2, 2, dark); g.set(x + 1, ey - 1, shine); }), false);
  for (const [n, d] of [['left', -1], ['right', 1]] as const)
    s.add(`eyes/${n}`, eye((g, x) => { g.rect(x, ey - 2, 4, 5, white); lidTop(g, x); iris(g, x, d > 0 ? 1.5 : -0.5); }), false);

  const by = ey - 5, brow = shade(L.hair, 0.55);
  const brows = (dy0: number, dy1: number) => (g: Img) => {
    g.line([-ex - 3, by + dy0], [-ex + 2, by + dy1], brow, 1.6);
    g.line([ex + 2, by + dy0], [ex - 3, by + dy1], brow, 1.6);
  };
  s.add('brows/neutral', brows(0, 0), false);
  s.add('brows/raised', brows(-2, -2), false);
  s.add('brows/furrow', brows(-1, 1.5), false);
  s.add('brows/sad', brows(1.5, -1), false);

  const my = HEAD[1] + 7 + lift, lip = shade(L.skin, 0.6), inside = hex('#5a1626'), teeth = hex('#f6f2ea'), tongue = hex('#c8506a');
  const open = (w: number, h: number, t = true) => (g: Img) => {
    g.ellipse(0, my + h / 2, w / 2 + 0.6, h / 2 + 0.6, lip);
    g.ellipse(0, my + h / 2, w / 2, h / 2, inside);
    if (t) g.rect(-w / 2 + 1, my, w - 2, 1, teeth);
    if (h >= 4) g.rect(-1, my + h - 1.5, 2, 1, tongue);
  };
  s.add('mouth/rest', (g) => g.rect(-2.5, my + 1, 5, 1, lip), false);
  s.add('mouth/smile', (g) => { g.rect(-2.5, my + 1, 5, 1, lip); g.set(-3.5, my, lip); g.set(2.5, my, lip); }, false);
  s.add('mouth/M', (g) => { g.rect(-3, my, 6, 1, lip); g.rect(-3, my + 1, 6, 1, shade(L.skin, 0.75)); }, false);
  s.add('mouth/F', (g) => { g.rect(-3, my, 6, 1, teeth); g.rect(-3, my + 1, 6, 1, lip); }, false);
  s.add('mouth/S', (g) => { g.rect(-3.5, my - 1, 7, 1, lip); g.rect(-3.5, my, 7, 2, teeth); g.rect(-3.5, my + 2, 7, 1, lip); }, false);
  s.add('mouth/E', open(7, 3), false);
  s.add('mouth/I', (g) => { open(8, 2.5)(g); g.set(-4.5, my - 1, lip); g.set(3.5, my - 1, lip); }, false);
  s.add('mouth/A', open(6, 5), false);
  s.add('mouth/A+', open(8, 7), false);
  s.add('mouth/O', open(4.5, 5, false), false);
  s.add('mouth/O+', open(5.5, 7, false), false);
  s.add('mouth/U', open(3, 3, false), false);
}

function person(s: Sheet, L: Look) {
  legs(s, L);
  torso(s, L);
  head(s, L);
  face(s, L);
  extras(s, L);
}

/* ---------------------------------------------------------------- arms */

/** Two-bone arm from shoulder to hand; the elbow bends toward `side` (-1 screen left, 1 right) and down. */
function elbow(sh: Pt, hand: Pt, a: number, b: number, side: number): Pt {
  const dx = hand[0] - sh[0], dy = hand[1] - sh[1];
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const ang = Math.atan2(dy, dx);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const c1: Pt = [sh[0] + Math.cos(ang + alpha) * a, sh[1] + Math.sin(ang + alpha) * a];
  const c2: Pt = [sh[0] + Math.cos(ang - alpha) * a, sh[1] + Math.sin(ang - alpha) * a];
  const score = (p: Pt) => p[1] + side * p[0];
  return score(c1) > score(c2) ? c1 : c2;
}

/** An arm: a short sleeve (a tee), a long one to the wrist (a jacket, a hoodie, striped), or none (a tank top); wristbands. */
function arm(g: Img, L: Look, sh: Pt, hand: Pt, side: number, a = ARM, b = ARM) {
  const el = elbow(sh, hand, a, b, side);
  const along = (p: Pt, q: Pt, k: number): Pt => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  const top = L.top ?? 'tee';
  g.line(sh, el, hex(L.skin), 4);
  g.line(el, hand, hex(L.skin), 3.4);
  g.line([el[0] + 1, el[1]], [hand[0] + 1, hand[1]], shade(L.skin, 0.85), 1);
  if (top === 'tee') g.line(sh, along(sh, el, 0.45), hex(L.shirt), 4.8);
  if (top === 'jacket' || top === 'hoodie') {
    const c = L.coat ?? L.shirt, wrist = along(el, hand, 0.78);
    g.line(sh, el, hex(c), 4.8);
    g.line(el, wrist, hex(c), 4.2);
    g.line([el[0] + 1, el[1]], [wrist[0] + 1, wrist[1]], shade(c, 0.72), 1.2);
    if (L.stripes) for (const k of [0.3, 0.7]) { const p = along(sh, el, k), q = along(el, wrist, k); g.disc(p[0], p[1], 2.2, hex(L.stripes)); g.disc(q[0], q[1], 2, hex(L.stripes)); }
  }
  if (L.bands) {
    const w = along(el, hand, 0.8);
    g.disc(w[0], w[1], 2.3, hex(L.bands));
    if (L.spikes) { g.set(w[0] - 1, w[1] - 2.5, hex('#d8d8e0')); g.set(w[0] + 1.5, w[1] - 2, hex('#d8d8e0')); g.set(w[0] + 2.5, w[1], hex('#d8d8e0')); }
  }
}

/* ---------------------------------------------------------------- guitars */

interface Neck { bridge: Pt; nut: Pt; strings: number; spacing: number; frets: number; pick: Pt }

/** A point on the neck: at a fret (fractions too; 0 = the nut) and string (0 = lowest, on top). */
function onNeck(n: Neck, fret: number, string: number): Pt {
  const p = 1 - 2 ** (-fret / 12);
  const x = n.nut[0] + (n.bridge[0] - n.nut[0]) * p, y = n.nut[1] + (n.bridge[1] - n.nut[1]) * p;
  return [x, y + (string - (n.strings - 1) / 2) * n.spacing];
}

function instrument(s: Sheet, n: Neck, kind: 'guitar' | 'bass', col: string) {
  s.add('inst/body', (g) => {
    const [bx, by] = n.bridge;
    const half = ((n.strings - 1) * n.spacing) / 2 + 1.5;
    g.line([bx - 9, by - 4], [6, SHOULDER + 1], hex('#3a2a20'), 2); // the strap
    if (kind === 'bass') {
      g.ellipse(bx - 4, by + 2, 14, 12, hex(col));
      g.ellipse(bx + 7, by - 5, 6, 5, hex(col));
      g.ellipse(bx + 7, by + 7, 5, 4, hex(col));
      g.ellipse(bx - 3, by + 2, 6, 5, shade(col, 1.12));
    } else {
      g.ellipse(bx - 5, by + 2, 13, 12, hex(col));
      g.ellipse(bx + 5, by - 5, 8, 7, hex(col));
      g.ellipse(bx + 6, by + 7, 6, 5, hex(col));
      g.ellipse(bx - 9, by + 6, 6, 5, shade(col, 0.78));
      g.ellipse(bx - 2, by + 3, 7, 6, hex('#efe6d2')); // the pickguard
      g.ellipse(bx - 6, by - 2, 3, 2, shade(col, 1.2));
      g.disc(bx - 9, by + 6, 1, hex('#e8e2d0')); g.disc(bx - 6, by + 8, 1, hex('#e8e2d0')); // knobs
    }
    g.rect(bx - 2, by - half, 2, half * 2, hex('#b8b8c0')); // bridge
    g.rect(bx + 4, by - half, 3, half * 2, hex('#2c2c30')); // pickups
    if (kind === 'guitar') g.rect(bx + 9, by - half - 1, 3, half * 2, hex('#2c2c30'));
    // the neck, column by column, so every string sits on its own row
    const cy = (x: number) => by + ((n.nut[1] - by) * (x - bx)) / (n.nut[0] - bx);
    const rowOf = (x: number, st: number) => Math.floor(cy(x) + (st - (n.strings - 1) / 2) * n.spacing);
    const board = hex('#2c1c14'), edge = hex('#7a5236');
    const join = bx + (kind === 'bass' ? 12 : 13);
    for (let x = Math.floor(join); x <= n.nut[0]; x++) {
      const top = rowOf(x, 0) - 1, bot = rowOf(x, n.strings - 1) + 1;
      for (let y = top; y <= bot; y++) g.set(x, y, y === top || y === bot ? edge : board);
    }
    const hx = Math.floor(n.nut[0]) + 1, hy = cy(n.nut[0]);
    g.poly([[hx, hy - half], [hx + 10, hy - half - 3], [hx + 10, hy + half - 2], [hx, hy + half]], hex(col));
    for (let k = 0; k < Math.ceil(n.strings / 2); k++) { g.rect(hx + 2 + k * 2.6, hy - half - 2.5, 1, 1, hex('#d8d8e0')); g.rect(hx + 2 + k * 2.6, hy + half - 0.5, 1, 1, hex('#d8d8e0')); }
    for (let y = rowOf(hx - 1, 0); y <= rowOf(hx - 1, n.strings - 1); y++) g.set(hx - 1, y, hex('#e8e2d0')); // the nut
    for (let st = 0; st < n.strings; st++) {
      const wound = st < n.strings / 2;
      for (let x = Math.floor(bx); x < hx - 1; x++) g.set(x, rowOf(x, st), x >= join ? (wound ? hex('#3e2e24') : hex('#463c36')) : wound ? hex('#b8aa88') : hex('#dcdce4'));
    }
    for (let f = 1; f <= n.frets; f++) {
      const x = Math.floor(onNeck(n, f, 0)[0]);
      if (x < join) break;
      for (let y = rowOf(x, 0); y <= rowOf(x, n.strings - 1); y++) g.set(x, y, hex('#8c8270'));
      if ([3, 5, 7, 9, 15].includes(f)) { const m = onNeck(n, f - 0.5, 0); g.set(m[0], Math.floor(cy(m[0])), hex('#e8dcc0')); }
      if (f === 12) { const m = onNeck(n, 11.5, 0); g.set(m[0], rowOf(m[0], 1), hex('#e8dcc0')); g.set(m[0], rowOf(m[0], n.strings - 2), hex('#e8dcc0')); }
    }
  });
}

const FRET_SHOULDER = SH_B, PICK_SHOULDER = SH_A;

/**
 * The fretting hand: a palm under the neck at each fret (the index finger's fret) with the thumb over the
 * top; the fingers to the strings are laid by the view from fingertip sprites (accurate to every note
 * and chord shape). `off`: the hand relaxed off the strings.
 */
function fretHands(s: Sheet, L: Look, n: Neck) {
  const skin = hex(L.skin), skinD = shade(L.skin, 0.78);
  for (let f = 0; f <= n.frets; f++) {
    const at = Math.max(f, 0.8) + 0.7;
    for (const off of [false, true]) s.add(`fret/${off ? 'off' : 'palm'}/${f}`, (g) => {
      const low = onNeck(n, at, n.strings - 1);
      const palm: Pt = [low[0], low[1] + 3 + (off ? 2 : 0)];
      arm(g, L, FRET_SHOULDER, [palm[0] + 1, palm[1] + 3], 1);
      g.ellipse(palm[0], palm[1], 3.8, 3, skin);
      g.ellipse(palm[0] + 1, palm[1] + 1, 2, 1.4, skinD);
      if (!off) { const t = onNeck(n, at - 0.6, -1.6); g.rect(t[0] - 1, t[1], 2, 1.4, skinD); } // the thumb over the top
      else g.line([palm[0] - 2, palm[1] - 2], [palm[0] - 3, palm[1] - 4], skin, 1.4);
    });
  }
  // a fingertip pressing a string (its origin is the pressed pixel), and a light touch (muting)
  s.add('tip/press', (g) => { g.rect(-1, -1, 2, 2, skin); g.set(0, 0, skinD); }, false);
  s.add('tip/light', (g) => { g.rect(-1, 0, 2, 1, skinD); }, false);
}

/** The picking hand at the strings: strum positions, mid-stroke blurs, a palm mute, a pick on a string, bass fingers. */
function pickHands(s: Sheet, L: Look, n: Neck, bass: boolean) {
  const skin = hex(L.skin), pick = hex('#f2c94c');
  const P = n.pick;
  const hand = (g: Img, at: Pt, pickDir: number) => {
    arm(g, L, PICK_SHOULDER, [at[0] - 3, at[1] - 2], -1);
    g.ellipse(at[0] - 1.5, at[1] - 1, 3.6, 3.2, skin);
    g.rect(at[0] - 3, at[1] - 2, 2, 1, shade(L.skin, 1.12));
    if (!bass) g.rect(at[0] + 0.5, at[1] + pickDir, 1, 2, pick);
  };
  const smear = (g: Img, d: number) => { const c = shade(L.skin, 0.75); c[3] = 140; for (let k = 2; k <= 7; k += 2) g.rect(P[0] - 4, P[1] - d * k - 1, 5, 1, c); };
  s.add('pick/rest', (g) => hand(g, [P[0] - 5, P[1] + 9], 0));
  s.add('pick/high', (g) => {
    const at: Pt = [PICK_SHOULDER[0] - 9, PICK_SHOULDER[1] - 20];
    arm(g, L, PICK_SHOULDER, at, -1);
    g.ellipse(at[0], at[1], 3.6, 3.2, skin);
    if (!bass) g.rect(at[0] - 0.5, at[1] - 4.5, 1, 2, pick);
  });
  s.add('pick/mute', (g) => hand(g, [n.bridge[0] - 1, P[1] + 1], 0));
  s.add('pick/mute2', (g) => hand(g, [n.bridge[0] - 1, P[1] + 2.5], 0));
  if (!bass) {
    s.add('pick/up', (g) => hand(g, [P[0], P[1] - 7], 1));
    s.add('pick/mid', (g) => hand(g, P, 0));
    s.add('pick/down', (g) => hand(g, [P[0], P[1] + 7], -1));
    s.add('pick/blurD', (g) => { smear(g, 1); hand(g, P, 0); });
    s.add('pick/blurU', (g) => { smear(g, -1); hand(g, P, 0); });
    // picking one string: the pick's tip on the middle of the strings (the view moves it to the string)
    s.add('pick/a', (g) => hand(g, [P[0], P[1] - 1.5], 0));
    s.add('pick/b', (g) => hand(g, [P[0], P[1] + 1.5], 0));
  } else {
    const fingers = (g: Img, which: number) => {
      hand(g, [P[0] - 1, P[1] - 4], 0);
      g.line([P[0] + 0.5, P[1] - 3], [P[0] + 1.5 + which, P[1] + (which ? 0 : 1)], skin, 1.4);
    };
    s.add('pluck/a', (g) => fingers(g, 0));
    s.add('pluck/b', (g) => fingers(g, 1));
    s.add('pluck/rest', (g) => { hand(g, [P[0] - 1, P[1] - 4], 0); g.set(P[0] + 0.5, P[1] - 1, skin); });
  }
}

function guitarist(name: string, L: Look, col: string, kind: 'guitar' | 'bass') {
  const s = new Sheet();
  person(s, L);
  const n: Neck = kind === 'bass'
    ? { bridge: [-14, -25], nut: [40, -49], strings: 4, spacing: 1.5, frets: 15, pick: [0, 0] }
    : { bridge: [-13, -26], nut: [31, -46], strings: 6, spacing: 1, frets: 15, pick: [0, 0] };
  const pp = onNeck(n, 26, (n.strings - 1) / 2);
  n.pick = [Math.round(n.bridge[0] + 6), Math.round(pp[1] + (n.bridge[1] - pp[1]) * 0.6)];
  instrument(s, n, kind, col);
  fretHands(s, L, n);
  pickHands(s, L, n, kind === 'bass');
  s.save(name, { neck: n, poses: POSES, acc: L.acc ?? [], skin: L.skin, skinDark: '#' + shade(L.skin, 0.78).slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') });
}

/* ---------------------------------------------------------------- the singer */

function singer(name: string, L: Look) {
  const s = new Sheet();
  person(s, L);
  const skin = hex(L.skin), metal = hex('#9aa0aa'), dark = hex('#2a2a30');
  const mic: Pt = [-7, HEAD[1] + 8];
  s.add('stand', (g) => {
    g.line([-18, -1], [-18, -58], metal, 1);
    g.line([-18, -58], [mic[0] - 2, mic[1] + 3], metal, 1);
    for (const d of [-5, 5]) g.line([-18, -4], [-18 + d, 0], metal, 1);
  });
  s.add('mic', (g) => { g.line([mic[0] - 3, mic[1] + 3], [mic[0], mic[1]], dark, 2); g.disc(mic[0] + 0.5, mic[1] - 0.5, 1.7, hex('#c8ccd4')); });
  const fist = (g: Img, p: Pt) => { g.disc(p[0], p[1], 3, skin); g.set(p[0] - 1, p[1] - 1, shade(L.skin, 1.12)); };
  const grip: Pt = [mic[0] - 2, mic[1] + 3];
  s.add('armA/mic', (g) => { arm(g, L, SH_A, grip, -1); fist(g, grip); });
  s.add('armA/down', (g) => { arm(g, L, SH_A, [-10, HIP + 1], -1); fist(g, [-10, HIP + 1]); });
  s.add('armB/down', (g) => { arm(g, L, SH_B, [10, HIP + 1], 1); fist(g, [10, HIP + 1]); });
  s.add('armB/up', (g) => { arm(g, L, SH_B, [12, SHOULDER - 24], 1); fist(g, [12, SHOULDER - 24]); });
  s.add('armB/out', (g) => { arm(g, L, SH_B, [30, SHOULDER - 2], 1); g.ellipse(31, SHOULDER - 2, 2.6, 2, skin); });
  s.add('armB/chest', (g) => { arm(g, L, SH_B, [2, SHOULDER + 7], 1); g.ellipse(2, SHOULDER + 7, 2.6, 2.2, skin); });
  s.save(name, { mic, poses: POSES, acc: L.acc ?? [] });
}

/* ---------------------------------------------------------------- the drummer */

/** Where each drum's stick lands, in the drummer's space (the drummer faces us: their right hand is on screen left). */
const KIT: Record<string, Pt> = {
  hat: [30, -41], snare: [18, -32], tom1: [7, -36], tom2: [-7, -36], tom3: [-25, -30], crash: [22, -61], ride: [-29, -55],
};

function drummer(name: string, L: Look) {
  const s = new Sheet();
  // seated: the head and shoulders lower than standing
  const lift = 5, seat = -32, sh = SHOULDER + lift;
  s.add('body/idle', (g) => shirtOn(g, L, sh, seat));
  for (const [name, down] of [['sit', 0], ['kick', 1]] as const) s.add(`legs/${name}`, (g) => {
    for (const side of [-1, 1]) {
      const hip: Pt = [side * 4, seat + 1], knee: Pt = [side * 17, -31 + (side < 0 ? down : 0)], foot: Pt = [side * 16, -4];
      g.line(hip, knee, hex(L.pants), 4.5);
      g.line(knee, foot, hex(L.pants), 4);
      g.rect(foot[0] - 3.5, foot[1] - (side < 0 && down ? 0 : 1), 7, 4, hex(L.shoes));
      g.rect(foot[0] - 3.5, foot[1] + 2 - (side < 0 && down ? 0 : 1), 7, 1, hex('#f2f0ea'));
    }
  });
  head(s, L, lift);
  face(s, L, lift);
  extras(s, L, lift);
  const shellA = hex('#b8324a'), shellB = shade('#b8324a', 0.7), head_ = hex('#ece6d6'), headHit = hex('#ffffff'), brass = hex('#d9b24a'), brassD = hex('#a8822a'), metal = hex('#9aa0aa');
  const drum = (name: string, p: Pt, rx: number, depth: number) => {
    for (const state of ['rest', 'hit']) s.add(`kit/${name}/${state}`, (g) => {
      const top = p[1] + (state === 'hit' ? 0.5 : 0);
      if (name === 'tom3') for (const d of [-rx + 1, rx - 1]) g.line([p[0] + d, top + depth], [p[0] + d, -1], metal);
      if (name === 'snare') { g.line([p[0], top + depth], [p[0], -1], metal); g.line([p[0], -4], [p[0] - 3, -1], metal); g.line([p[0], -4], [p[0] + 3, -1], metal); }
      g.rect(p[0] - rx, top, rx * 2, depth, shellA);
      g.rect(p[0] + rx * 0.3, top, rx * 0.7, depth, shellB);
      g.ellipse(p[0], top + depth, rx, 1.5, shellB);
      g.rect(p[0] - rx, top + Math.floor(depth / 2), rx * 2, 1, hex('#e0c060'));
      g.ellipse(p[0], top, rx, 2, state === 'hit' ? headHit : head_);
    });
  };
  const cymbal = (name: string, p: Pt, r: number) => {
    for (const [state, tilt] of [['rest', 0], ['hit1', 2], ['hit2', -1.5]] as const) s.add(`kit/${name}/${state}`, (g) => {
      const fx = p[0] + (name === 'ride' ? 2 : -2);
      g.line([p[0], p[1]], [fx, -1], metal);
      g.line([fx, -4], [fx - 3, -1], metal); g.line([fx, -4], [fx + 3, -1], metal);
      g.poly([[p[0] - r, p[1] + tilt], [p[0] + r, p[1] - tilt], [p[0] + r, p[1] - tilt + 1.4], [p[0] - r, p[1] + tilt + 1.4]], brass);
      g.rect(p[0] - 1, p[1] - 1, 2, 1, brassD);
    });
  };
  s.add('kit/kick/rest', (g) => { g.disc(0, -16, 15, shellA); g.disc(0, -16, 13, head_); g.disc(0, -16, 5, hex('#7a1e22')); g.rect(-4, -17, 8, 2, head_); });
  s.add('kit/kick/hit', (g) => { g.disc(0, -16.5, 15.5, shellA); g.disc(0, -16.5, 13.5, headHit); g.disc(0, -16.5, 6, hex('#ff4a60')); g.rect(-4, -17.5, 8, 2, headHit); });
  drum('tom3', KIT.tom3, 7, 11);
  drum('snare', KIT.snare, 6, 4);
  drum('tom1', KIT.tom1, 5, 4);
  drum('tom2', KIT.tom2, 5, 4);
  cymbal('crash', KIT.crash, 9);
  cymbal('ride', KIT.ride, 10);
  for (const [state, gap] of [['closed', 0], ['open', 2]] as const) s.add(`kit/hat/${state}`, (g) => {
    const [x, y] = KIT.hat;
    g.line([x, y], [x, -1], metal);
    g.line([x, -4], [x - 3, -1], metal); g.line([x, -4], [x + 3, -1], metal);
    g.rect(x - 7, y + 1, 14, 1.4, brass);
    g.rect(x - 7, y - gap, 14, 1.4, brassD);
  });
  // arms with sticks: per target, raised (up), on the way (mid) or on the drum (hit)
  const stick = hex('#e8d2a0');
  const shoulders: Record<'A' | 'B', Pt> = { A: [-7.5, sh + 1], B: [7.5, sh + 1] };
  for (const side of ['A', 'B'] as const) {
    const sp = shoulders[side];
    for (const [target, tip] of Object.entries(KIT)) for (const phase of ['up', 'mid', 'hit']) s.add(`arm${side}/${target}/${phase}`, (g) => {
      const raise = phase === 'up' ? 14 : phase === 'mid' ? 6 : 0;
      const t: Pt = [tip[0], tip[1] - raise];
      const away = Math.hypot(sp[0] - tip[0], sp[1] - tip[1]);
      const hand: Pt = [tip[0] + ((sp[0] - tip[0]) / away) * 10, tip[1] + ((sp[1] - tip[1]) / away) * 10 - raise * 0.35];
      arm(g, L, sp, hand, side === 'A' ? -1 : 1, 12, 12);
      g.line(hand, t, stick, 1.2);
      g.disc(hand[0], hand[1], 2.8, hex(L.skin));
    });
    const d = side === 'A' ? -1 : 1;
    const pose = (name: string, hand: Pt, tip: Pt) => s.add(`arm${side}/${name}`, (g) => {
      arm(g, L, sp, hand, d, 12, 12);
      g.line(hand, tip, stick, 1.2);
      g.disc(hand[0], hand[1], 2.8, hex(L.skin));
    });
    pose('sky', [sp[0] + d * 8, sp[1] - 19], [sp[0] + d * 14, sp[1] - 33]);
    pose('click', [sp[0] + d * 3, sp[1] - 20], [sp[0] - d * 9, sp[1] - 29]);
  }
  s.save(name, { kit: KIT, lift, poses: POSES, acc: L.acc ?? [] });
}

/* ---------------------------------------------------------------- the stage: a bar's band stage */

/** A repeatable random number for (x, y): brick and board colours that stay put between builds. */
const noise = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
/** 4x4 ordered dither: fill a pixel with `a` or `b` so the share of `b` is `k` (a pixel-art gradient). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number, k: number) => k * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;

/** A 3x5 pixel font for signs and posters (only the letters the stage uses). */
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', Y: '101101010010010', W: '101101111111101',
  '!': '010010010000010', ' ': '000000000000000',
};
function text(g: Img, str: string, x: number, y: number, c: RGBA, scale = 1, core?: RGBA) {
  for (const ch of str) {
    const f = FONT[ch] ?? FONT[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (f[j * 3 + i] === '1') {
      g.rect(x + i * scale, y + j * scale, scale, scale, c);
      // a neon tube's hot core: its middle pixel brighter
      if (core && scale > 1) g.set(x + i * scale + Math.floor(scale / 2), y + j * scale + Math.floor(scale / 2), core);
    }
    x += 4 * scale;
  }
  return x;
}
const textWidth = (str: string, scale = 1) => str.length * 4 * scale - scale;

/** Where the stage's lights are, for the view's glow (written to stage.json). */
interface StageLights {
  cans: [number, number][];
  bulbs: [number, number][];
  neon: { x: number; y: number; w: number; h: number; color: string }[];
}

/**
 * The stage as the camera sees it (320 x 180): framed like a poster, a light pipe across the top,
 * speaker stacks at both edges, the drummer dead centre on a riser, the floor's front edge, and the
 * crowd across the bottom. A bar's stage: brick, string lights, a neon sign, the band's banner.
 */
function stage() {
  const W = 320, H = 180;
  const g = new Img(W, H, 0, 0);
  const lights: StageLights = { cans: [], bulbs: [], neon: [] };
  const TOP = 10, FLOOR = 116, LIP = 162;

  // the light pipe across the top, a can above each player
  for (let y = 0; y < TOP; y++) for (let x = 0; x < W; x++) g.set(x, y, dither(x, y, y / TOP) ? hex('#1e1618') : hex('#120d10'));
  g.rect(0, 5, W, 3, hex('#3a3a42'));
  g.rect(0, 5, W, 1, hex('#5a5a66'));
  for (const x of [48, 104, 160, 214, 272]) {
    g.rect(x - 4, 6, 8, 7, hex('#1a1a20'));
    g.rect(x - 3, 12, 6, 2, hex('#9a9aa8'));
    lights.cans.push([x, 13]);
  }

  // the back wall: old brick, darker toward the top and the edges
  for (let y = TOP; y < FLOOR; y++) {
    const row = Math.floor((y - TOP) / 5), off = row % 2 ? 6 : 0;
    for (let x = 0; x < W; x++) {
      const mortar = (y - TOP) % 5 === 4 || (x + off) % 12 === 11;
      const n = noise(Math.floor((x + off) / 12), row);
      const shadowK = Math.max(((FLOOR - y) / (FLOOR - TOP)) * 0.5, (Math.abs(x - W / 2) / (W / 2)) * 0.55);
      const base = mortar ? '#2a2026' : n < 0.25 ? '#5a2a26' : n < 0.6 ? '#6a3228' : n < 0.9 ? '#74382c' : '#4e2622';
      g.set(x, y, dither(x, y, shadowK) ? hex(mortar ? '#1a1418' : '#3a1c1c') : hex(base));
    }
  }
  // string lights sagging across the wall
  const wire = (x: number) => 18 + 7 * Math.sin((Math.PI * (x % 106)) / 106);
  for (let x = 0; x < W; x++) g.set(x, wire(x), hex('#14100e'));
  for (let x = 5; x < W; x += 13) {
    const y = Math.round(wire(x)) + 1;
    g.rect(x - 1, y, 2, 2, hex('#ffd890'));
    g.set(x - 1, y, hex('#fff4d8'));
    lights.bulbs.push([x, y + 1]);
  }
  // the band's banner, centred behind the drummer
  const bx = 112, by = 24, bw = 96, bh = 40;
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) g.set(x, y, dither(x, y, (Math.sin((x - bx) / 6) * 0.5 + 0.5) * 0.6) ? hex('#4a1a28') : hex('#6a2236'));
  for (let x = bx; x < bx + bw; x += 2) g.rect(x, by + bh, 1, 3, hex('#d8b060'));
  g.rect(bx - 2, by - 2, bw + 4, 2, hex('#2a2024'));
  const name = 'THE IDEAS';
  text(g, name, bx + (bw - textWidth(name, 2)) / 2, by + 9, hex('#f2e2c0'), 2);
  for (let x = bx + 16; x < bx + bw - 16; x += 4) g.set(x, by + 25, hex('#e8a040'));
  // one neon sign, on the left
  const nx = 46, ny = 34;
  g.rect(nx - 3, ny - 3, textWidth('LIVE', 2) + 6, 16, hex('#120e14'));
  text(g, 'LIVE', nx, ny, hex('#ff4fa0'), 2, hex('#fff4f8'));
  lights.neon.push({ x: nx - 3, y: ny - 3, w: textWidth('LIVE', 2) + 6, h: 16, color: '#ff4fa0' });
  // a poster on the right
  g.rect(255, 40, 18, 26, hex('#e8d8b0'));
  g.poly([[269, 40], [273, 40], [273, 44]], hex('#3a2a26'));
  text(g, 'ROCK', 256, 43, hex('#9a2a2a'), 1);
  g.disc(264, 58, 4, hex('#9a2a2a'));
  // wood panelling at the foot of the wall
  for (let y = FLOOR - 16; y < FLOOR; y++) for (let x = 0; x < W; x++) g.set(x, y, x % 16 === 0 ? hex('#1e1410') : dither(x, y, (y - FLOOR + 16) / 20) ? hex('#2e2018') : hex('#3c2a1e'));
  g.rect(0, FLOOR - 16, W, 1, hex('#5a4030'));

  // the stage floor: planks, darker toward the back
  for (let y = FLOOR; y < LIP; y++) {
    const board = Math.floor((y - FLOOR) / 6);
    for (let x = 0; x < W; x++) {
      const len = 40 + Math.floor(noise(board, 3) * 30);
      const seam = (y - FLOOR) % 6 === 5 || (x + board * 23) % len === 0;
      const n = noise(Math.floor((x + board * 23) / len), board);
      const base = seam ? '#1e140e' : n < 0.3 ? '#4a3020' : n < 0.7 ? '#563826' : '#5e3e2a';
      g.set(x, y, dither(x, y, (1 - (y - FLOOR) / (LIP - FLOOR)) * 0.55) ? hex('#2a1c14') : hex(base));
    }
  }
  // a bass cabinet behind the bassist, small combo amps behind the guitarists
  const cab = (x: number, y: number, w: number, h: number) => {
    g.rect(x, y, w, h, hex('#121214'));
    g.rect(x + 2, y + 2, w - 4, 5, hex('#222226'));
    g.rect(x + 3, y + 3, 6, 2, hex('#d8c890'));
    for (let yy = y + 9; yy < y + h - 2; yy++) for (let xx = x + 2; xx < x + w - 2; xx++) g.set(xx, yy, (xx + yy) % 2 ? hex('#1c1c20') : hex('#26262a'));
  };
  cab(72, 96, 26, 34);
  cab(62, 124, 22, 18); cab(286 - 50, 128, 22, 16);
  // the drum riser, centred: carpet on top, a plank front
  g.rect(110, 116, 100, 6, hex('#3a2228'));
  for (let x = 110; x < 210; x++) for (let y = 122; y < 134; y++) g.set(x, y, (x - 110) % 17 === 0 ? hex('#1a120c') : dither(x, y, (y - 122) / 14) ? hex('#2a1c14') : hex('#4a3020'));
  g.rect(110, 122, 100, 1, hex('#6a4a38'));
  // a rug under the singer
  for (let y = 148; y < LIP; y++) for (let x = 182; x < 250; x++) {
    const edge = x < 185 || x >= 247 || y < 150 || y >= LIP - 2;
    g.set(x, y, edge ? hex('#d8a848') : (Math.abs(x - 216) + Math.abs(y - 155) * 3) % 10 < 2 ? hex('#e0b860') : dither(x, y, 0.3) ? hex('#6a1a1e') : hex('#8a2228'));
  }
  // the speaker stacks: bookends at both edges
  const stack = (x: number, w: number) => {
    for (const [y, h] of [[58, 52], [110, 52]] as const) {
      g.rect(x, y, w, h, hex('#0e0e10'));
      g.rect(x + 2, y + 2, w - 4, h - 4, hex('#18181c'));
      for (const cy of [y + h / 4 + 1, y + (3 * h) / 4 - 1]) { g.disc(x + w / 2, cy, w / 3, hex('#0a0a0c')); g.disc(x + w / 2, cy, w / 3 - 2, hex('#1e1e24')); g.disc(x + w / 2, cy, 3, hex('#2e2e36')); }
    }
  };
  stack(0, 30); stack(W - 30, 30);
  // the front edge of the stage, and the dark floor beyond it
  g.rect(0, LIP, W, 3, hex('#7a5a3e'));
  g.rect(0, LIP, W, 1, hex('#a07a52'));
  for (let y = LIP + 3; y < H; y++) for (let x = 0; x < W; x++) g.set(x, y, dither(x, y, 0.5) ? hex('#0e0a0c') : hex('#18120e'));

  // (the stage painted by Paul, made by npm run band-stage, wins over this placeholder)
  if (!existsSync(`${OUT}/stage-front.png`)) {
    writeFileSync(`${OUT}/stage.png`, png(W, H, g.data));
    writeFileSync(`${OUT}/stage.json`, JSON.stringify(lights));
    console.log(`stage: ${W}x${H}`);
  }

  // the crowd: a row of silhouettes across the whole front, in two groups that bob in turn; hands up
  // (and a bottle or two) for the big moments
  const s = new Sheet();
  const people = Array.from({ length: 21 }, (_, k) => ({ x: -178 + k * 17.5 + (noise(k, 1) - 0.5) * 6, h: 10 + noise(k, 2) * 9, group: k % 2 }));
  for (const group of [0, 1]) for (const up of [false, true]) s.add(`crowd/${group}/${up ? 'up' : 'idle'}`, (cg) => {
    const ink = hex('#07050a'), rim = hex('#4a3a54');
    people.filter((p) => p.group === group).forEach((p, k) => {
      const y = -p.h;
      cg.ellipse(p.x, y + 15, 11, 11, ink);
      cg.disc(p.x, y, 7.5, ink);
      // light from the stage catching the hair and shoulders
      cg.rect(p.x - 4, y - 7, 8, 1, rim); cg.set(p.x - 6, y - 6, rim); cg.set(p.x + 5, y - 6, rim);
      cg.rect(p.x - 10, y + 6, 4, 1, rim); cg.rect(p.x + 6, y + 6, 4, 1, rim);
      if (up && k % 3 !== 2) {
        // a raised arm: the devil horns
        const d = k % 2 ? 1 : -1, hx = p.x + d * 12, hy = y - 18;
        cg.line([p.x + d * 7, y + 7], [hx, hy + 4], ink, 4);
        cg.disc(hx, hy + 3, 2.6, ink);
        cg.line([hx - 1.5, hy + 1], [hx - 2.5, hy - 4], ink, 1.4); cg.line([hx + 1.5, hy + 1], [hx + 2.5, hy - 4], ink, 1.4);
        cg.set(hx - 2.5, hy - 4, rim); cg.set(hx + 2.5, hy - 4, rim);
      }
      if (!up && k % 5 === 1) { cg.line([p.x - 7, y + 7], [p.x - 11, y - 4], ink, 4); cg.rect(p.x - 12, y - 12, 3, 8, hex('#2a4a2a')); }
    });
  }, false, new Img(370, 64, 185, 60));
  s.save('crowd', {});
}

/* ---------------------------------------------------------------- the band */

/* ---------------------------------------------------------------- characters */

type Persona = 'cool' | 'energetic' | 'emo' | 'angry';

/**
 * How each character dresses (the player keeps their skin, hair style and instrument):
 * cool: an open leather jacket over a dark tee, shades, boots; energetic: a bright tee, wristbands, a
 * sweatband; emo: a dark hoodie with striped sleeves, black hair with a side fringe, eyeliner, skinny
 * black jeans; angry: a black tank top with a red print, spiked wristbands, a studded belt, boots.
 */
function dress(L: Look, p: Persona): Look {
  const headwear = L.hairStyle === 'beanie' || L.hairStyle === 'band';
  switch (p) {
    case 'cool': return { ...L, top: 'jacket', coat: '#3a2a24', shirt: '#1e1e24', shirt2: '#d8d8d0', pants: '#26304a', shoes: '#1a1416', boots: true, acc: ['shades'] };
    case 'energetic': return { ...L, top: 'tee', bands: '#18181a', acc: headwear ? [] : ['sweatband'] };
    case 'emo': return { ...L, top: 'hoodie', coat: '#1e1e26', shirt: '#1e1e26', stripes: '#6a2a32', hair: L.hairStyle === 'band' ? L.hair : '#16141c', pants: '#141418', shoes: '#141418', acc: L.hairStyle === 'beanie' || L.hairStyle === 'band' ? ['eyeliner'] : ['fringe', 'eyeliner'] };
    case 'angry': return { ...L, top: 'tank', shirt: '#1a1a1e', shirt2: '#7a2222', pants: '#2a2a2c', shoes: '#141414', boots: true, bands: '#26262a', spikes: true, acc: [] };
  }
}

const PERSONAS: Persona[] = ['cool', 'energetic', 'emo', 'angry'];
const BAND = {
  singer: { skin: '#e8c0a0', hair: '#2a1e18', shirt: '#222226', shirt2: '#cfcac0', pants: '#2c3446', shoes: '#18181a', hairStyle: 'spiky' } as Look,
  rhythm: { skin: '#c08a62', hair: '#1c1816', shirt: '#4a4e56', shirt2: '#2a2a2e', pants: '#30384a', shoes: '#1c1c1e', hairStyle: 'beanie' } as Look,
  lead: { skin: '#eccaa8', hair: '#a8884e', shirt: '#1c1c20', shirt2: '#8a8a88', pants: '#262c3c', shoes: '#141414', hairStyle: 'long' } as Look,
  bassist: { skin: '#8a5e44', hair: '#2e221a', shirt: '#5a5a5c', shirt2: '#1e1e20', pants: '#1e1e22', shoes: '#18181a', hairStyle: 'bob' } as Look,
  drummer: { skin: '#dcae88', hair: '#201c1a', shirt: '#cfccc4', shirt2: '#2a2a2c', pants: '#222226', shoes: '#111', hairStyle: 'band' } as Look,
};
// (energetic: a plain tee of their own, a dark red, white, charcoal, faded navy)
const BRIGHT: Record<keyof typeof BAND, string> = { singer: '#6a2222', rhythm: '#d6d3cc', lead: '#3a3a40', bassist: '#2e3a4a', drummer: '#cfccc4' };

mkdirSync(OUT, { recursive: true });
stage();
for (const p of PERSONAS) {
  const look = (k: keyof typeof BAND) => { const L = dress(BAND[k], p); return p === 'energetic' ? { ...L, shirt: BRIGHT[k] } : L; };
  singer(`singer-${p}`, look('singer'));
  guitarist(`rhythm-${p}`, look('rhythm'), '#9a6a36', 'guitar');
  guitarist(`lead-${p}`, look('lead'), p === 'cool' ? '#1e1e22' : '#5e1a1a', 'guitar');
  guitarist(`bassist-${p}`, look('bassist'), '#1e1e22', 'bass');
  drummer(`drummer-${p}`, look('drummer'));
}
writeFileSync(`${OUT}/CREDITS.md`, '# Band sprites\n\nPlaceholder pixel art made in code by `scripts/band-sprites.ts` (`npm run band-sprites`). No outside assets.\n');
