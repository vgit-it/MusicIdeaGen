// The legs as a cutout rig (docs/BAND-VIEW.md, art/README.md): drawn once as pieces (hips, and per
// leg a thigh, a shin and a shoe), each pose made by turning the pieces at their joints (hip, knee,
// ankle). A new pair of trousers or shoes is a few pieces, not every frame.
//
// Pieces are drawn on the art canvas in the standing pose (where the drawing has them); `legs.json`
// says where the joints are. Turning uses RotSprite's idea (pixel art scaled up with Scale2x, turned,
// sampled back down), so outlines stay one pixel and nothing blurs.

import type { Image } from './png';

export type Pt = [number, number];
export interface LegRig { hip: { L: Pt; R: Pt }; knee: { L: Pt; R: Pt }; ankle: { L: Pt; R: Pt } }
export type Pieces = Record<'hips' | 'thigh-L' | 'shin-L' | 'shoe-L' | 'thigh-R' | 'shin-R' | 'shoe-R', Image>;
export const PIECES = ['hips', 'thigh-L', 'shin-L', 'shoe-L', 'thigh-R', 'shin-R', 'shoe-R'] as const;

/**
 * Each pose: where each ankle goes from where it stands (x outward, away from the other leg; y up is
 * negative: the knee coming toward us) and how the shoe tilts (degrees, toe down positive).
 */
type Foot = { out: number; up: number; tilt?: number };
export const POSES: Record<string, { L: Foot; R: Foot }> = {
  stand: { L: { out: 0, up: 0 }, R: { out: 0, up: 0 } },
  wide: { L: { out: 2, up: 0 }, R: { out: 2, up: 0 } },
  // walking on: a foot lifted, then the other
  'walk/0': { L: { out: 0, up: -1 }, R: { out: 0, up: 0 } },
  'walk/1': { L: { out: 0, up: -4, tilt: 8 }, R: { out: 0, up: 0 } },
  'walk/2': { L: { out: 0, up: 0 }, R: { out: 0, up: -1 } },
  'walk/3': { L: { out: 0, up: 0 }, R: { out: 0, up: -4, tilt: 8 } },
  // in the air, knees tucked up and out
  jump: { L: { out: 1, up: -6, tilt: 6 }, R: { out: 1, up: -6, tilt: 6 } },
  // a lunge: the screen-left knee bent out, the other leg long
  lunge: { L: { out: 3, up: -2 }, R: { out: 3, up: 0, tilt: -6 } },
};

/* ---------------------------------------------------------------- cutting a drawing into pieces */

const blank = (w: number, h: number): Image => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
const isJeans = (d: Uint8ClampedArray, i: number) => d[i + 3] > 0 && d[i + 2] > d[i] + 8;

/** A drawn pair of legs (standing) into pieces, and where the joints are. */
export function cutLegs(legs: Image, cx: number): { pieces: Pieces; rig: LegRig } {
  const { w, h, d } = legs;
  const ink = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 0;
  let top = h, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  // the crotch: the lowest row with ink in the middle
  let crotch = top;
  for (let y = top; y <= bottom; y++) if (ink(cx, y) || ink(cx - 1, y)) crotch = y;
  const pieces = Object.fromEntries(PIECES.map((k) => [k, blank(w, h)])) as Pieces;
  const rig = { hip: {}, knee: {}, ankle: {} } as LegRig;
  const put = (p: Image, x: number, y: number) => { const i = (y * w + x) * 4; p.d.set(d.subarray(i, i + 4), i); };
  for (let y = top; y <= crotch; y++) for (let x = 0; x < w; x++) if (ink(x, y)) put(pieces.hips, x, y);
  for (const side of ['L', 'R'] as const) {
    const inLeg = (x: number) => (side === 'L' ? x < cx : x >= cx);
    const rowMid = (y: number, test = (x: number) => ink(x, y)) => {
      let s = 0, n = 0;
      for (let x = 0; x < w; x++) if (inLeg(x) && test(x)) { s += x; n++; }
      return n ? s / n : NaN;
    };
    // the ankle: the lowest row that's mostly jeans (the shoes are dark, some of it bluish)
    let ankle = crotch + 1;
    for (let y = crotch + 1; y <= bottom; y++) {
      let n = 0, j = 0;
      for (let x = 0; x < w; x++) if (inLeg(x) && ink(x, y)) { n++; if (isJeans(d, (y * w + x) * 4)) j++; }
      if (n && j / n >= 0.5) ankle = y;
    }
    const hip: Pt = [Math.round(rowMid(crotch + 1)), crotch - 1];
    const an: Pt = [Math.round(rowMid(ankle, (x) => isJeans(d, (ankle * w + x) * 4))), ankle];
    const knee: Pt = [Math.round((hip[0] + an[0]) / 2), Math.round((hip[1] + an[1]) / 2)];
    rig.hip[side] = hip; rig.knee[side] = knee; rig.ankle[side] = an;
    for (let y = crotch + 1; y <= bottom; y++) for (let x = 0; x < w; x++) {
      if (!inLeg(x) || !ink(x, y)) continue;
      // pieces overlap at the knee (3 rows) so a bend never opens a gap
      if (y > ankle) put(pieces[`shoe-${side}`], x, y);
      else {
        if (y <= knee[1] + 1) put(pieces[`thigh-${side}`], x, y);
        if (y >= knee[1] - 1) put(pieces[`shin-${side}`], x, y);
      }
    }
  }
  return { pieces, rig };
}

/* ---------------------------------------------------------------- posing */

const ang = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/**
 * The legs in a pose, on a canvas the pieces' size. Facing us, a lifted foot's knee comes toward the
 * camera: the thigh looks shorter (squashed toward the hip) and the shin and shoe rise; a foot moved
 * out turns the whole leg a little at the hip. Small turns only, so the pixels stay clean.
 */
export function poseLegs(pieces: Pieces, rig: LegRig, pose: { L: Foot; R: Foot }): Image {
  const out = blank(pieces.hips.w, pieces.hips.h);
  for (const side of ['L', 'R'] as const) {
    const f = pose[side], H = rig.hip[side], K0 = rig.knee[side], A0 = rig.ankle[side];
    const thigh = pieces[`thigh-${side}`], shin = pieces[`shin-${side}`], shoe = pieces[`shoe-${side}`];
    if (!f.out && !f.up && !f.tilt) { over(out, shoe); over(out, shin); over(out, thigh); continue; }
    const sx = side === 'L' ? -1 : 1, lift = Math.max(0, -f.up);
    // the turn at the hip that moves the foot out
    const d = ang(H, [A0[0] + sx * f.out, A0[1]]) - ang(H, A0);
    const raised: Pt = [H[0], H[1] + lift]; // (the point that lands on the hip once lifted)
    // the shoe: tilted at the ankle and carried with the leg, in one turn (one resample, clean pixels)
    const v: Pt = [A0[0] - raised[0], A0[1] - raised[1]];
    const ankle: Pt = [H[0] + Math.cos(d) * v[0] - Math.sin(d) * v[1], H[1] + Math.sin(d) * v[0] + Math.cos(d) * v[1]];
    over(out, turn(shoe, A0, ankle, d + ((f.tilt ?? 0) * Math.PI / 180) * -sx));
    over(out, turn(shin, raised, H, d));
    over(out, turn(squash(thigh, H[1], K0[1], lift), H, H, d));
  }
  over(out, pieces.hips);
  return out;
}

/** The thigh foreshortened: its rows from the hip to the knee squeezed into `lift` fewer. */
function squash(src: Image, hipY: number, kneeY: number, lift: number): Image {
  if (!lift) return src;
  const out = blank(src.w, src.h), len = kneeY - hipY, k = len / Math.max(1, len - lift);
  for (let y = 0; y < src.h; y++) {
    const sy = y <= hipY ? y : Math.round(hipY + (y - hipY) * k);
    if (sy >= src.h) continue;
    out.d.set(src.d.subarray(sy * src.w * 4, (sy + 1) * src.w * 4), y * src.w * 4);
  }
  return out;
}

/** b drawn over a (same size). */
function over(a: Image, b: Image) {
  for (let i = 0; i < a.d.length; i += 4) if (b.d[i + 3]) a.d.set(b.d.subarray(i, i + 4), i);
}

/* ---------------------------------------------------------------- turning pixel art cleanly */

/** Scale2x (EPX): twice the size, diagonal edges smoothed, no new colours. */
function scale2x(src: Image): Image {
  const { w, h, d } = src, out = blank(w * 2, h * 2);
  const at = (x: number, y: number) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
  const same = (i: number, j: number) => d[i] === d[j] && d[i + 1] === d[j + 1] && d[i + 2] === d[j + 2] && d[i + 3] === d[j + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    const q = [P, P, P, P];
    if (same(C, A) && !same(C, D) && !same(A, B)) q[0] = A;
    if (same(A, B) && !same(A, C) && !same(B, D)) q[1] = B;
    if (same(D, C) && !same(D, B) && !same(C, A)) q[2] = C;
    if (same(B, D) && !same(B, A) && !same(D, C)) q[3] = D;
    for (let k = 0; k < 4; k++) {
      const o = ((y * 2 + (k >> 1)) * out.w + x * 2 + (k & 1)) * 4;
      out.d.set(d.subarray(q[k], q[k] + 4), o);
    }
  }
  return out;
}

const UP = 8;
const bigCache = new WeakMap<Image, Image>();

/** A piece turned by `a` (radians) about `from`, its `from` moved to `to`. */
export function turn(src: Image, from: Pt, to: Pt, a: number): Image {
  if (Math.abs(a) < 1e-3 && from[0] === Math.round(to[0]) && from[1] === Math.round(to[1])) return src;
  let big = bigCache.get(src);
  if (!big) { big = scale2x(scale2x(scale2x(src))); bigCache.set(src, big); }
  const out = blank(src.w, src.h), cos = Math.cos(a), sin = Math.sin(a);
  // joints sit on pixel centres
  const fx = from[0] + 0.5, fy = from[1] + 0.5, tx = Math.round(to[0]) + 0.5, ty = Math.round(to[1]) + 0.5;
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const dx = x + 0.5 - tx, dy = y + 0.5 - ty;
    const sx = (cos * dx + sin * dy + fx) * UP, sy = (-sin * dx + cos * dy + fy) * UP;
    const bx = Math.floor(sx), by = Math.floor(sy);
    if (bx < 0 || by < 0 || bx >= big.w || by >= big.h) continue;
    const i = (by * big.w + bx) * 4;
    if (big.d[i + 3]) out.d.set(big.d.subarray(i, i + 4), (y * out.w + x) * 4);
  }
  return out;
}
