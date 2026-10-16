// Placeholder pixel-art sprites for the band view (docs/BAND-VIEW.md): each player's parts drawn in
// code, packed into one PNG sheet per player with a JSON of frames, in public/band/. Paul's own art
// replaces them later (same frame names, same space: the player's feet at the origin).
// Run: npm run band-sprites

import { mkdirSync, writeFileSync } from 'node:fs';
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
  add(name: string, draw: (g: Img) => void, outline = true) {
    const g = new Img();
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

interface Look {
  skin: string; hair: string; shirt: string; shirt2: string; pants: string; shoes: string;
  hairStyle: 'spiky' | 'beanie' | 'long' | 'bob' | 'band';
}
const shade = (c: string, k: number): RGBA => { const [r, g, b] = hex(c); return [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), 255]; };

const HEAD: Pt = [0, -60];
const HEAD_R = 11;
/** Where the face features sit for each head pose (how far they move). */
const POSES: Record<string, Pt> = { front: [0, 0], up: [0, -2], down: [0, 2] };

function legs(s: Sheet, L: Look) {
  for (const [name, spread] of [['stand', 0], ['wide', 3]] as const) s.add(`legs/${name}`, (g) => {
    for (const side of [-1, 1]) {
      const hip: Pt = [side * 3.5, -22], foot: Pt = [side * (4 + spread), -2];
      g.line(hip, foot, hex(L.pants), 5);
      g.rect(foot[0] - 3 + side, -3, 6, 3, hex(L.shoes));
    }
    g.rect(-6, -24, 12, 4, hex(L.pants));
  });
}

function torso(s: Sheet, L: Look, top = -46, bottom = -21) {
  s.add('body/idle', (g) => {
    g.rect(-2, top - 3, 4, 4, hex(L.skin)); // neck
    g.poly([[-9, top], [9, top], [7.5, bottom], [-7.5, bottom]], hex(L.shirt));
    g.poly([[2, top], [9, top], [7.5, bottom], [3, bottom]], shade(L.shirt, 0.8));
    g.rect(-3, top + 6, 6, 5, hex(L.shirt2)); // a print on the shirt
    g.rect(-8, bottom - 1, 16, 2, shade(L.pants, 0.7)); // belt
  });
}

function head(s: Sheet, L: Look) {
  const hair = hex(L.hair), hairD = shade(L.hair, 0.75);
  if (L.hairStyle === 'long') s.add('hair/back', (g) => { g.poly([[-12, -66], [12, -66], [13, -44], [-13, -44]], hairD); });
  for (const pose of Object.keys(POSES)) s.add(`head/${pose}`, (g) => {
    const [, dy] = POSES[pose];
    const cy = HEAD[1] + dy / 2;
    g.ellipse(-HEAD_R + 0.5, cy + 1, 2, 3, hex(L.skin)); // ears
    g.ellipse(HEAD_R - 0.5, cy + 1, 2, 3, hex(L.skin));
    g.ellipse(0, cy, HEAD_R, HEAD_R - 0.5, hex(L.skin));
    g.ellipse(4, cy + 2, 6, 7, shade(L.skin, 0.93)); // a little shading
    if (pose === 'up') g.rect(-4, cy + 8, 8, 3, shade(L.skin, 0.85)); // chin up: the neck shows
    // hair: the fringe moves with the pose (lower when the head is down)
    const f = dy;
    switch (L.hairStyle) {
      case 'spiky':
        g.ellipse(0, cy - 7 + f / 2, 12, 6, hair);
        for (let k = -4; k <= 4; k++) g.poly([[k * 3 - 3, cy - 9 + f / 2], [k * 3 + 3, cy - 9 + f / 2], [k * 3.6, cy - 19 + Math.abs(k) * 1.2 + f / 2]], k % 2 ? hairD : hair);
        g.poly([[-11, cy - 6], [-3, cy - 6 + f], [-11, cy + 1]], hair);
        g.poly([[11, cy - 6], [2, cy - 6 + f], [11, cy + 1]], hair);
        break;
      case 'beanie':
        g.ellipse(0, cy - 7 + f / 2, 12, 7, hex('#3f7f6f'));
        g.rect(-12, cy - 5 + f / 2, 24, 3, hex('#2f5f53'));
        g.rect(-11, cy - 2 + f / 2, 4, 5, hair); g.rect(7, cy - 2 + f / 2, 4, 5, hair);
        break;
      case 'long':
        g.ellipse(0, cy - 6 + f / 2, 12.5, 7, hair);
        g.rect(-13, cy - 6, 4, 18, hair); g.rect(9, cy - 6, 4, 18, hair);
        g.poly([[-9, cy - 6], [2, cy - 6], [-6, cy - 1 + f]], hairD);
        break;
      case 'bob':
        g.ellipse(0, cy - 6 + f / 2, 12.5, 7, hair);
        g.rect(-13, cy - 6, 5, 12, hair); g.rect(8, cy - 6, 5, 12, hair);
        g.rect(-8, cy - 7 + f / 2, 16, 4 + f / 2, hair);
        break;
      case 'band':
        g.ellipse(0, cy - 6 + f / 2, 12, 7, hair);
        g.rect(-12, cy - 6 + f / 2, 24, 3, hex('#d8344a')); // headband
        g.poly([[-6, cy - 12], [6, cy - 12], [0, cy - 21]], hairD); // a short mohawk
        break;
    }
  });
}

/** Eyes, brows and mouths: drawn at the front pose (the view moves them with the head). No outline: they sit on the face. */
function face(s: Sheet, L: Look) {
  const ey = HEAD[1] - 1, ex = 4.5, dark = INK, white = hex('#f4f0e8'), lid = shade(L.skin, 0.7);
  const eye = (fn: (g: Img, x: number) => void) => (g: Img) => { fn(g, -ex - 1); fn(g, ex - 1); };
  s.add('eyes/open', eye((g, x) => { g.rect(x, ey - 1, 2, 3, dark); g.set(x, ey - 1, white); }), false);
  s.add('eyes/half', eye((g, x) => { g.rect(x - 1, ey - 1, 4, 1, lid); g.rect(x, ey, 2, 2, dark); }), false);
  s.add('eyes/closed', eye((g, x) => { g.rect(x - 1, ey + 1, 4, 1, dark); }), false);
  s.add('eyes/squeeze', (g) => {
    for (const [x, d] of [[-ex - 1, 1], [ex - 1, -1]] as const) { g.line([x - 1, ey - 1 + (d > 0 ? 0 : 2)], [x + 2, ey + 1 - (d > 0 ? 0 : 2)], dark); g.line([x - 1, ey + 1], [x + 2, ey + 1], dark); }
  }, false);
  s.add('eyes/wide', eye((g, x) => { g.rect(x - 1, ey - 2, 4, 4, white); g.rect(x, ey - 1, 2, 2, dark); g.rect(x - 1, ey - 3, 4, 1, lid); }), false);
  for (const [n, d] of [['left', -1], ['right', 1]] as const)
    s.add(`eyes/${n}`, eye((g, x) => { g.rect(x - 1, ey - 1, 4, 3, white); g.rect(x + (d < 0 ? -1 : 1), ey - 1, 2, 3, dark); }), false);

  const by = ey - 4, hair = shade(L.hair, 0.6);
  const brow = (dy0: number, dy1: number) => (g: Img) => {
    g.line([-ex - 2, by + dy0], [-ex + 1, by + dy1], hair); // outer to inner (screen left)
    g.line([ex + 1, by + dy0], [ex - 2, by + dy1], hair);
  };
  s.add('brows/neutral', brow(0, 0), false);
  s.add('brows/raised', brow(-2, -2), false);
  s.add('brows/furrow', brow(-1, 1), false);
  s.add('brows/sad', brow(1, -1), false);

  const my = HEAD[1] + 5, lip = shade(L.skin, 0.62), inside = hex('#5a1626'), teeth = hex('#f6f2ea'), tongue = hex('#c8506a');
  const open = (w: number, h: number, t = true) => (g: Img) => {
    g.ellipse(0, my + h / 2, w / 2 + 0.6, h / 2 + 0.6, lip);
    g.ellipse(0, my + h / 2, w / 2, h / 2, inside);
    if (t) g.rect(-w / 2 + 1, my, w - 2, 1, teeth);
    if (h >= 4) g.rect(-1, my + h - 1.5, 2, 1, tongue);
  };
  s.add('mouth/rest', (g) => g.rect(-2, my + 1, 4, 1, lip), false);
  s.add('mouth/smile', (g) => { g.rect(-2, my + 1, 4, 1, lip); g.set(-3, my, lip); g.set(2, my, lip); }, false);
  s.add('mouth/M', (g) => { g.rect(-2, my, 5, 1, lip); g.rect(-2, my + 1, 5, 1, shade(L.skin, 0.75)); }, false);
  s.add('mouth/F', (g) => { g.rect(-2, my, 5, 1, teeth); g.rect(-2, my + 1, 5, 1, lip); }, false);
  s.add('mouth/S', (g) => { g.rect(-3, my, 6, 2, teeth); g.rect(-3, my + 1, 6, 0.5, lip); g.rect(-3, my - 1, 6, 1, lip); g.rect(-3, my + 2, 6, 1, lip); }, false);
  s.add('mouth/E', open(6, 2), false);
  s.add('mouth/I', (g) => { open(7, 2)(g); g.set(-4, my - 1, lip); g.set(3, my - 1, lip); }, false);
  s.add('mouth/A', open(5, 4), false);
  s.add('mouth/A+', open(6, 6), false);
  s.add('mouth/O', open(3.5, 4, false), false);
  s.add('mouth/O+', open(4.5, 6, false), false);
  s.add('mouth/U', open(2.5, 2.5, false), false);
}

function person(s: Sheet, L: Look) {
  legs(s, L);
  torso(s, L);
  head(s, L);
  face(s, L);
}

/* ---------------------------------------------------------------- arms */

/** Two-bone arm from shoulder to hand; the elbow bends toward `side` (-1 screen left, 1 right) and down. */
function elbow(sh: Pt, hand: Pt, a: number, b: number, side: number): Pt {
  const dx = hand[0] - sh[0], dy = hand[1] - sh[1];
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const ang = Math.atan2(dy, dx);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const c1: Pt = [sh[0] + Math.cos(ang + alpha) * a, sh[1] + Math.sin(ang + alpha) * a];
  const c2: Pt = [sh[0] + Math.cos(ang - alpha) * a, sh[1] + Math.sin(ang - alpha) * a];
  const score = (p: Pt) => p[1] + side * p[0];
  return score(c1) > score(c2) ? c1 : c2;
}

function arm(g: Img, L: Look, sh: Pt, hand: Pt, side: number, a = 10, b = 10) {
  const el = elbow(sh, hand, a, b, side);
  g.line(sh, el, hex(L.shirt), 4);
  g.line(el, hand, hex(L.skin), 3);
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
    const half = (n.strings * n.spacing) / 2 + 1;
    // the strap
    g.line([bx - 6, by - 6], [7, -46], hex('#3a2a20'), 2);
    // the body
    if (kind === 'bass') {
      g.ellipse(bx - 2, by + 1, 11, 9, hex(col));
      g.ellipse(bx + 7, by - 4, 6, 5, hex(col));
      g.ellipse(bx + 7, by + 5, 5, 4, hex(col));
    } else {
      g.ellipse(bx - 3, by + 1, 10, 9, hex(col));
      g.ellipse(bx + 5, by - 3, 6, 5.5, hex(col));
      g.ellipse(bx + 5, by + 4, 5, 4, hex(col));
      g.ellipse(bx - 6, by + 3, 4, 3, shade(col, 0.8));
    }
    g.rect(bx - 2, by - half, 2, half * 2, hex('#b8b8c0')); // bridge
    g.rect(bx + 4, by - half, 3, half * 2, hex('#2c2c30')); // pickup
    // the neck: a strip from the body to the nut (sheared, so the strings stay level)
    const steps = Math.ceil(n.nut[0] - bx + 1);
    for (let k = 0; k <= steps; k++) {
      const x = bx + 6 + ((n.nut[0] - bx - 6) * k) / steps, y = by + ((n.nut[1] - by) * (x - bx)) / (n.nut[0] - bx);
      g.rect(x, y - half, 1, half * 2 + 1, hex('#4a2c1c'));
    }
    // frets and dots
    for (let f = 1; f <= n.frets; f++) {
      const [x, y] = onNeck(n, f, 0);
      g.rect(x, y, 1, (n.strings - 1) * n.spacing + 1, hex('#cfc4a4'));
      if ([3, 5, 7, 9, 15].includes(f)) { const m = onNeck(n, f - 0.5, (n.strings - 1) / 2); g.set(m[0], m[1], hex('#e8dcc0')); }
    }
    // headstock
    const hx = n.nut[0], hy = n.nut[1];
    g.poly([[hx, hy - half], [hx + 8, hy - half - 2], [hx + 8, hy + half - 1], [hx, hy + half]], hex(col));
    g.rect(hx, hy - half, 1, half * 2 + 1, hex('#e8e2d0'));
    // strings
    for (let st = 0; st < n.strings; st++) {
      const a = onNeck(n, 0, st), b: Pt = [bx, n.bridge[1] + (st - (n.strings - 1) / 2) * n.spacing];
      g.line(a, b, st < n.strings / 2 ? hex('#7a6450') : hex('#86766a'));
    }
  });
}

const FRET_SHOULDER: Pt = [8, -44];
const PICK_SHOULDER: Pt = [-8, -44];

/** The fretting hand: the wrist under the neck, fingers coming up over the fretboard to the strings. */
function fretHands(s: Sheet, L: Look, n: Neck, grips: string[]) {
  const skin = hex(L.skin), skinD = shade(L.skin, 0.8);
  const below = (x: number, fret: number): Pt => { const p = onNeck(n, fret, n.strings - 1); return [x, p[1] + n.spacing + 2]; };
  const finger = (g: Img, fret: number, string: number, lift = 0) => {
    const tip = onNeck(n, fret, string);
    const base = onNeck(n, fret, n.strings - 1 + 1.4);
    g.line([tip[0], tip[1] - lift], [base[0], base[1]], skin, 1.6);
  };
  const handAt = (g: Img, fret: number) => {
    const p = onNeck(n, fret, n.strings - 1);
    const w = below(p[0], fret);
    arm(g, L, FRET_SHOULDER, [w[0], w[1] + 2], 1, 11, 11);
    g.ellipse(w[0] + 0.5, w[1], 2.6, 2.2, skin);
    const t = onNeck(n, fret - 0.4, -1.2); // the thumb over the top
    g.rect(t[0], t[1], 2, 1, skinD);
  };
  for (let f = 0; f <= n.frets; f++) {
    const at = Math.max(f - 0.35, 0.6);
    for (let st = 0; st < n.strings; st++) {
      if (grips.includes('single')) s.add(`fret/single/${f}/${st}`, (g) => {
        handAt(g, at);
        finger(g, at, st);
        if (st < n.strings - 1) finger(g, at + 0.9, Math.min(n.strings - 1, st + 1.6), -1); // the next finger hovering
      });
      if (grips.includes('bend') && f > 0) s.add(`fret/bend/${f}/${st}`, (g) => {
        handAt(g, at);
        const tip = onNeck(n, at, st);
        // pushed up across the strings, two fingers behind it
        finger(g, at, st - 1.5);
        g.line([tip[0] - 1.6, tip[1] - 1], [tip[0] - 1.6, onNeck(n, at, n.strings)[1]], skinD, 1.4);
      });
      if (grips.includes('power') && st <= n.strings - 2) s.add(`fret/power/${f}/${st}`, (g) => {
        handAt(g, at);
        finger(g, at, st);
        finger(g, at + 2, st + 1);
        if (n.strings === 6) finger(g, at + 2, st + 2);
      });
    }
    if (grips.includes('chord')) s.add(`fret/chord/${f}`, (g) => {
      handAt(g, at + 0.5);
      finger(g, at, 1); finger(g, at + 1, 3); finger(g, at + 1.6, 4);
    });
    if (grips.includes('barre') && f > 0) s.add(`fret/barre/${f}`, (g) => {
      handAt(g, at);
      const a = onNeck(n, at, -0.4), b = onNeck(n, at, n.strings - 0.6);
      g.line(a, b, skin, 1.6);
      finger(g, at + 1, 2); finger(g, at + 2, 1); finger(g, at + 2, 3);
    });
    if (grips.includes('mute')) s.add(`fret/mute/${f}`, (g) => {
      handAt(g, Math.max(at, 1));
      const a = onNeck(n, Math.max(at, 1), 0), b = onNeck(n, Math.max(at, 1) + 2, 0);
      g.line([a[0], a[1] + 1], [b[0], b[1] + 1], skinD, 2);
    });
    if (grips.includes('open')) s.add(`fret/open/${f}`, (g) => {
      // the hand relaxed under the neck, fingers off the strings
      handAt(g, Math.max(at, 1));
      const p = below(onNeck(n, Math.max(at, 1), 0)[0], Math.max(at, 1));
      g.line([p[0] + 1, p[1] - 2], [p[0] + 3, p[1] - 4], skin, 1.4);
    });
  }
}

/** The picking hand over the strings: strum positions, a palm mute on the bridge, small picks, bass fingers. */
function pickHands(s: Sheet, L: Look, n: Neck, bass: boolean) {
  const skin = hex(L.skin), pick = hex('#f2c94c');
  const P = n.pick;
  const hand = (g: Img, at: Pt, pickDir: number) => {
    arm(g, L, PICK_SHOULDER, [at[0] - 2, at[1] - 1], -1, 11, 11);
    g.ellipse(at[0] - 1, at[1] - 1, 2.8, 2.5, skin);
    if (!bass) g.rect(at[0] + 1, at[1] + pickDir, 1, 2, pick);
  };
  if (!bass) {
    s.add('pick/up', (g) => hand(g, [P[0], P[1] - 7], 1));
    s.add('pick/mid', (g) => hand(g, P, 0));
    s.add('pick/down', (g) => hand(g, [P[0], P[1] + 7], -1));
    s.add('pick/a', (g) => hand(g, [P[0], P[1] - 2], 0));
    s.add('pick/b', (g) => hand(g, [P[0], P[1] + 1.5], 0));
    s.add('pick/mute', (g) => hand(g, [n.bridge[0] - 1, P[1] + 1], 0));
    s.add('pick/mute2', (g) => hand(g, [n.bridge[0] - 1, P[1] + 2.5], 0));
    s.add('pick/rest', (g) => hand(g, [P[0] - 4, P[1] + 9], 0));
  } else {
    const fingers = (g: Img, which: number) => {
      hand(g, [P[0] - 1, P[1] - 4], 0);
      g.line([P[0] + 1, P[1] - 3], [P[0] + 2 + which, P[1] + (which ? 1 : 2)], skin, 1.4);
    };
    s.add('pluck/a', (g) => fingers(g, 0));
    s.add('pluck/b', (g) => fingers(g, 1));
    s.add('pluck/rest', (g) => { hand(g, [P[0] - 1, P[1] - 4], 0); g.set(P[0] + 1, P[1] - 1, skin); });
    s.add('pick/mute', (g) => hand(g, [n.bridge[0] - 1, P[1] - 1], 0));
    s.add('pick/rest', (g) => hand(g, [P[0] - 4, P[1] + 9], 0));
  }
}

function guitarist(name: string, L: Look, col: string, kind: 'guitar' | 'bass') {
  const s = new Sheet();
  person(s, L);
  const n: Neck = kind === 'bass'
    ? { bridge: [-12, -29], nut: [38, -40], strings: 4, spacing: 1.5, frets: 15, pick: [-3, -31] }
    : { bridge: [-11, -29], nut: [31, -38], strings: 6, spacing: 1, frets: 15, pick: [-4, -31] };
  n.pick = [n.bridge[0] + 7, n.bridge[1] + (kind === 'bass' ? 0 : 0)];
  instrument(s, n, kind, col);
  fretHands(s, L, n, kind === 'bass' ? ['single', 'open', 'mute'] : ['single', 'bend', 'power', 'chord', 'barre', 'mute', 'open']);
  pickHands(s, L, n, kind === 'bass');
  s.save(name, { neck: n, poses: POSES });
}

/* ---------------------------------------------------------------- the singer */

function singer(L: Look) {
  const s = new Sheet();
  person(s, L);
  const skin = hex(L.skin), metal = hex('#9aa0aa'), dark = hex('#2a2a30');
  const mic: Pt = [-8, -55];
  s.add('stand', (g) => {
    g.line([-17, -1], [-17, -46], metal, 1);
    g.line([-17, -46], [mic[0] - 2, mic[1] + 2], metal, 1);
    for (const d of [-5, 5]) g.line([-17, -1], [-17 + d, 0], metal, 1);
  });
  s.add('mic', (g) => { g.line([mic[0] - 3, mic[1] + 3], [mic[0], mic[1]], dark, 2); g.disc(mic[0] + 0.5, mic[1] - 0.5, 1.6, hex('#c8ccd4')); });
  const A: Pt = [-8, -44], B: Pt = [8, -44];
  const fist = (g: Img, p: Pt) => g.disc(p[0], p[1], 2.2, skin);
  s.add('armA/mic', (g) => { arm(g, L, A, [mic[0] - 2, mic[1] + 3], -1); fist(g, [mic[0] - 2, mic[1] + 3]); });
  s.add('armA/down', (g) => { arm(g, L, A, [-12, -26], -1); fist(g, [-12, -26]); });
  s.add('armB/down', (g) => { arm(g, L, B, [12, -26], 1); fist(g, [12, -26]); });
  s.add('armB/up', (g) => { arm(g, L, B, [15, -66], 1); fist(g, [15, -66]); });
  s.add('armB/out', (g) => { arm(g, L, B, [27, -46], 1); g.ellipse(28, -46, 2.6, 2, skin); });
  s.add('armB/chest', (g) => { arm(g, L, B, [3, -38], 1, 10, 9); g.ellipse(3, -38, 2.6, 2.2, skin); });
  s.save('singer', { mic, poses: POSES });
}

/* ---------------------------------------------------------------- the drummer */

/** Where each drum's stick lands, in the drummer's space (the drummer faces us: their right hand is on screen left). */
const KIT: Record<string, Pt> = {
  hat: [27, -43], snare: [15, -34], tom1: [6, -40], tom2: [-7, -40], tom3: [-23, -33], crash: [20, -59], ride: [-27, -54],
};

function drummer(L: Look) {
  const s = new Sheet();
  // the drummer sits: torso and head higher than a standing player's legs would put them
  const lift = -14;
  s.add('body/idle', (g) => {
    g.rect(-2, -49 + lift, 4, 4, hex(L.skin));
    g.poly([[-9, -46 + lift], [9, -46 + lift], [8, -24 + lift], [-8, -24 + lift]], hex(L.shirt));
    g.poly([[2, -46 + lift], [9, -46 + lift], [8, -24 + lift], [3, -24 + lift]], shade(L.shirt, 0.8));
    g.rect(-3, -40 + lift, 6, 5, hex(L.shirt2));
  });
  // reuse the head and face, moved up by `lift`
  const sub = new Sheet();
  head(sub, L); face(sub, L);
  for (const f of (sub as unknown as { frames: { name: string; img: Img }[] }).frames) {
    s.add(f.name, (g) => { const d = f.img.data; for (let y = 0; y < f.img.h; y++) for (let x = 0; x < f.img.w; x++) { const i = (y * f.img.w + x) * 4; if (d[i + 3]) g.set(x - f.img.ox, y - f.img.oy + lift, [d[i], d[i + 1], d[i + 2], d[i + 3]]); } }, false);
  }
  const shellA = hex('#b8324a'), shellB = shade('#b8324a', 0.7), head_ = hex('#ece6d6'), headHit = hex('#ffffff'), brass = hex('#d9b24a'), brassD = hex('#a8822a'), metal = hex('#9aa0aa');
  const drum = (name: string, p: Pt, rx: number, depth: number) => {
    for (const state of ['rest', 'hit']) s.add(`kit/${name}/${state}`, (g) => {
      const top = p[1] + (state === 'hit' ? 0.5 : 0);
      g.rect(p[0] - rx, top, rx * 2, depth, shellA);
      g.rect(p[0] + rx * 0.3, top, rx * 0.7, depth, shellB);
      g.ellipse(p[0], top + depth, rx, 1.5, shellB);
      g.ellipse(p[0], top, rx, 2, state === 'hit' ? headHit : head_);
      if (name === 'tom3') for (const d of [-rx + 1, rx - 1]) g.line([p[0] + d, top + depth], [p[0] + d, -1], metal);
    });
  };
  const cymbal = (name: string, p: Pt, r: number, stand: number) => {
    for (const [state, tilt] of [['rest', 0], ['hit1', 2], ['hit2', -1.5]] as const) s.add(`kit/${name}/${state}`, (g) => {
      g.line([p[0], p[1]], [p[0] + (name === 'ride' ? 2 : -2), stand], metal);
      g.poly([[p[0] - r, p[1] + tilt], [p[0] + r, p[1] - tilt], [p[0] + r, p[1] - tilt + 1.4], [p[0] - r, p[1] + tilt + 1.4]], brass);
      g.rect(p[0] - 1, p[1] - 1, 2, 1, brassD);
    });
  };
  s.add('kit/kick/rest', (g) => { g.disc(0, -15, 14, shellA); g.disc(0, -15, 12, head_); g.disc(0, -15, 5, hex('#d8344a')); g.rect(-4, -16, 8, 2, head_); });
  s.add('kit/kick/hit', (g) => { g.disc(0, -15.5, 14.5, shellA); g.disc(0, -15.5, 12.5, headHit); g.disc(0, -15.5, 6, hex('#ff4a60')); g.rect(-4, -16.5, 8, 2, headHit); });
  drum('tom3', [KIT.tom3[0], KIT.tom3[1]], 8, 12);
  drum('snare', [KIT.snare[0], KIT.snare[1]], 6, 4);
  drum('tom1', [KIT.tom1[0], KIT.tom1[1]], 5, 6);
  drum('tom2', [KIT.tom2[0], KIT.tom2[1]], 5, 6);
  cymbal('crash', KIT.crash, 9, -1);
  cymbal('ride', KIT.ride, 10, -1);
  for (const [state, gap] of [['closed', 0], ['open', 2]] as const) s.add(`kit/hat/${state}`, (g) => {
    const [x, y] = KIT.hat;
    g.line([x, y], [x, -1], metal);
    g.rect(x - 7, y + 1, 14, 1.4, brass);
    g.rect(x - 7, y - gap, 14, 1.4, brassD);
  });
  // arms with sticks: per target, raised (up), on the way (mid) or on the drum (hit)
  const stick = hex('#e8d2a0');
  const shoulders: Record<'A' | 'B', Pt> = { A: [-9, -57], B: [9, -57] };
  for (const side of ['A', 'B'] as const) {
    const sh = shoulders[side];
    for (const [target, tip] of Object.entries(KIT)) for (const phase of ['up', 'mid', 'hit']) s.add(`arm${side}/${target}/${phase}`, (g) => {
      const raise = phase === 'up' ? 13 : phase === 'mid' ? 6 : 0;
      const t: Pt = [tip[0], tip[1] - raise];
      const away = Math.hypot(sh[0] - tip[0], sh[1] - tip[1]);
      const hand: Pt = [tip[0] + ((sh[0] - tip[0]) / away) * 9, tip[1] + ((sh[1] - tip[1]) / away) * 9 - raise * 0.35];
      arm(g, L, sh, hand, side === 'A' ? -1 : 1, 10, 10);
      g.line(hand, t, stick, 1.2);
      g.disc(hand[0], hand[1], 2.2, hex(L.skin));
    });
  }
  s.save('drummer', { kit: KIT, lift, poses: POSES });
}

/* ---------------------------------------------------------------- the stage */

function stage() {
  const W = 480, H = 270;
  const g = new Img(W, H, 0, 0);
  // back wall: a dark gradient with a band name banner
  for (let y = 0; y < 176; y++) g.rect(0, y, W, 1, [18 + y * 0.12, 16 + y * 0.08, 34 + y * 0.18, 255]);
  g.rect(150, 26, 180, 30, hex('#2a2142'));
  g.rect(152, 28, 176, 26, hex('#3b2d5c'));
  for (let x = 160; x < 320; x += 12) g.rect(x, 38, 8, 6, hex('#e8623a'));
  // truss with light cans
  g.rect(0, 6, W, 4, hex('#4a4a56'));
  for (let x = 0; x < W; x += 8) g.line([x, 6], [x + 8, 10], hex('#6a6a78'));
  for (let x = 40; x < W; x += 66) { g.rect(x - 4, 10, 8, 7, hex('#22222a')); g.rect(x - 3, 16, 6, 2, hex('#88889a')); }
  // amp stacks behind the guitarists
  const amp = (x: number, y: number, w: number) => {
    g.rect(x, y, w, 46, hex('#151518'));
    g.rect(x + 2, y + 2, w - 4, 6, hex('#2a2a2e'));
    g.rect(x + 2, y + 10, w - 4, 34, hex('#232327'));
    for (let k = 0; k < 4; k++) g.disc(x + w / 4 + (k % 2) * (w / 2), y + 18 + Math.floor(k / 2) * 17, w / 6, hex('#1b1b1e'));
    g.rect(x + 4, y + 3, 10, 2, hex('#d8d0b0'));
  };
  amp(18, 128, 44); amp(62, 128, 44); amp(374, 128, 44); amp(418, 128, 44);
  amp(150, 140, 34);
  // the drum riser
  g.rect(176, 160, 128, 18, hex('#2c2434'));
  g.rect(176, 160, 128, 2, hex('#4a3d58'));
  // the stage floor: boards
  for (let y = 176; y < H; y++) g.rect(0, y, W, 1, [36 + (y - 176) * 0.25, 28 + (y - 176) * 0.18, 30 + (y - 176) * 0.12, 255]);
  for (let y = 182; y < H; y += 9) g.rect(0, y, W, 1, hex('#1e1820'));
  // monitors at the front
  for (const x of [70, 220, 380]) { g.poly([[x, 268], [x + 34, 268], [x + 30, 256], [x + 4, 256]], hex('#141416')); g.rect(x + 8, 259, 18, 6, hex('#2a2a30')); }
  writeFileSync(`${OUT}/stage.png`, png(W, H, g.data));
  console.log('stage: 480x270');
}

/* ---------------------------------------------------------------- the band */

mkdirSync(OUT, { recursive: true });
stage();
singer({ skin: '#f1c7a0', hair: '#2b1d1a', shirt: '#e8623a', shirt2: '#f6e7c8', pants: '#2d3047', shoes: '#141414', hairStyle: 'spiky' });
guitarist('rhythm', { skin: '#c88a5e', hair: '#1e1a18', shirt: '#3a6fb0', shirt2: '#f2f2f2', pants: '#3a3030', shoes: '#e8e8e8', hairStyle: 'beanie' }, '#d9a441', 'guitar');
guitarist('lead', { skin: '#f3d2b3', hair: '#e8d27a', shirt: '#26262c', shirt2: '#d83a3a', pants: '#2a3b5a', shoes: '#141414', hairStyle: 'long' }, '#c8283c', 'guitar');
guitarist('bassist', { skin: '#8a5a3c', hair: '#ff6fae', shirt: '#6a4ab0', shirt2: '#f2d04a', pants: '#232323', shoes: '#c83a3a', hairStyle: 'bob' }, '#3a8a6a', 'bass');
drummer({ skin: '#e0b088', hair: '#2a2a2a', shirt: '#3a3a3a', shirt2: '#e8623a', pants: '#222', shoes: '#111', hairStyle: 'band' });
writeFileSync(`${OUT}/CREDITS.md`, '# Band sprites\n\nPlaceholder pixel art made in code by `scripts/band-sprites.ts` (`npm run band-sprites`). No outside assets.\n');
