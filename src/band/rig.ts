// The legs as a cutout rig (docs/BAND-VIEW.md, art/README.md): drawn once as pieces (hips, and per
// leg a thigh, a shin and a shoe), each pose made by turning the pieces at their joints (hip, knee,
// ankle). A new pair of trousers or shoes is a few pieces, not every frame.
//
// The pieces are drawn neutral, like the arms: the thigh and shin straight, hanging down from their
// joint (`joint` on each piece's small canvas) to the next (`thigh` / `shin` px below it), the shoe
// with its ankle at the joint. The hips are on the art canvas. `legs.json` says where the hips are and
// where the ankles stand; every pose, the rock stance too, is the rig's: the knees bend to reach the
// feet. Turning uses RotSprite's idea (pixel art scaled up with Scale2x, turned, sampled back down), so
// outlines stay one pixel and nothing blurs.

/** A picture as plain pixels (RGBA rows), as scripts/png.ts reads them. */
export type Image = { w: number; h: number; d: Uint8ClampedArray };

export type Pt = [number, number];
/**
 * Hips and ankles on the art canvas (the stand pose's ankles, on the ground), the pieces' lengths
 * (from the joint to the next, as drawn). `knee`: the stand pose's knees: each leg's thigh and shin as
 * long as hip to knee and knee to ankle, bending that way in every pose (without them: `thigh`,
 * `shin`, bending out).
 */
export interface LegRig { hip: { L: Pt; R: Pt }; ankle: { L: Pt; R: Pt }; knee?: { L: Pt; R: Pt }; thigh: number; shin: number; joint: Pt }
/** The old rig: pieces cut in place from a drawing in its pose, with its knees. */
export interface BentLegRig { hip: { L: Pt; R: Pt }; knee: { L: Pt; R: Pt }; ankle: { L: Pt; R: Pt } }
export type Pieces = Record<'hips' | 'thigh-L' | 'shin-L' | 'shoe-L' | 'thigh-R' | 'shin-R' | 'shoe-R', Image>;
export const PIECES = ['hips', 'thigh-L', 'shin-L', 'shoe-L', 'thigh-R', 'shin-R', 'shoe-R'] as const;
/** The leg pieces' canvas: 24 wide, the joint at 12, 4. */
const LEG_W = 24, LEG_JOINT: Pt = [12, 4];

/**
 * Each pose: where each ankle goes from where it stands (x outward, away from the other leg; y up is
 * negative: the knee coming toward us) and how the shoe tilts (degrees, toe down positive). `knee`:
 * the knee moved by hand (px from where it would bend to): toward us, the thigh and shin look shorter.
 */
export type Foot = { out: number; up: number; tilt?: number; knee?: Pt };
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

/** A drawn pair of legs (standing) into pieces in place, and where the joints are. */
export function cutLegs(legs: Image, cx: number): { pieces: Pieces; rig: BentLegRig } {
  const { w, h, d } = legs;
  const ink = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 0;
  let top = h, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  // the crotch: the lowest row with ink in the middle
  let crotch = top;
  for (let y = top; y <= bottom; y++) if (ink(cx, y) || ink(cx - 1, y)) crotch = y;
  const pieces = Object.fromEntries(PIECES.map((k) => [k, blank(w, h)])) as Pieces;
  const rig = { hip: {}, knee: {}, ankle: {} } as BentLegRig;
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

/**
 * Pieces cut in a pose (bent knees, feet apart) turned straight: each thigh and shin turned to hang
 * down from its joint on its own small canvas, the shoe moved onto its own with the ankle at the joint.
 * The stand pose made from them is the drawing's own.
 */
export function straightenLegs(bent: Pieces, old: BentLegRig): { pieces: Pieces; rig: LegRig } {
  const down = Math.PI / 2, len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const thigh = Math.round(Math.max(len(old.hip.L, old.knee.L), len(old.hip.R, old.knee.R)));
  const shin = Math.round(Math.max(len(old.knee.L, old.ankle.L), len(old.knee.R, old.ankle.R)));
  const pieces = { hips: bent.hips } as Pieces;
  for (const s of ['L', 'R'] as const) {
    const H = old.hip[s], K = old.knee[s], A = old.ankle[s];
    pieces[`thigh-${s}`] = turn(bent[`thigh-${s}`], H, LEG_JOINT, down - ang(H, K), { w: LEG_W, h: thigh + 10 });
    pieces[`shin-${s}`] = turn(bent[`shin-${s}`], K, LEG_JOINT, down - ang(K, A), { w: LEG_W, h: shin + 10 });
    pieces[`shoe-${s}`] = turn(bent[`shoe-${s}`], A, LEG_JOINT, 0, { w: LEG_W, h: 16 });
  }
  return { pieces, rig: { hip: old.hip, ankle: old.ankle, thigh, shin, joint: LEG_JOINT } };
}

/* ---------------------------------------------------------------- posing */

const ang = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/**
 * The knee: two-bone reach from hip to ankle, bending the way `bend` says (which side of the line from
 * hip to ankle: the stand pose's knee), or else out (away from the other leg, `sx`).
 */
function kneeOf(H: Pt, A: Pt, a: number, b: number, sx: number, bend = 0): Pt {
  const dx = A[0] - H[0], dy = A[1] - H[1];
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const an = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const c1: Pt = [H[0] + Math.cos(an + al) * a, H[1] + Math.sin(an + al) * a];
  const c2: Pt = [H[0] + Math.cos(an - al) * a, H[1] + Math.sin(an - al) * a];
  if (bend) return Math.sign(sideOf(H, A, c1)) === Math.sign(bend) ? c1 : c2;
  return sx * c1[0] > sx * c2[0] ? c1 : c2;
}
/** Which side of the line a to b the point p is (the sign). */
const sideOf = (a: Pt, b: Pt, p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Each leg's thigh and shin lengths and bend, from the stand pose's knees (or the rig's lengths). */
export function legsOf(rig: LegRig, s: 'L' | 'R') {
  const H = rig.hip[s], A = rig.ankle[s], K = rig.knee?.[s];
  return K ? { thigh: dist(H, K), shin: dist(K, A), bend: sideOf(H, A, K) } : { thigh: rig.thigh, shin: rig.shin, bend: 0 };
}
/** The stand pose's knees: the rig's, or where they bend to. */
export function kneesOf(rig: LegRig): { L: Pt; R: Pt } {
  const k = (s: 'L' | 'R') => rig.knee?.[s] ?? kneeOf(rig.hip[s], rig.ankle[s], rig.thigh, rig.shin, s === 'L' ? -1 : 1);
  return { L: k('L'), R: k('R') };
}

/**
 * The legs in a pose, on the art canvas (`size`). Each foot is placed (from where it stands, moved by
 * the pose), the knee bends out to reach it. `drop`: the hips lowered that far (raised, if negative), the
 * feet planted (the knees bend more, or straighten; the body is drawn as much lower or higher). Facing us, a lifted foot's knee comes toward the camera:
 * the thigh looks shorter (squashed toward the hip). `straight`: legs hanging straight down from the
 * hips, to draw against.
 */
export function poseLegs(pieces: Pieces, rig: LegRig, pose: { L: Foot; R: Foot; drop?: number }, size: { w: number; h: number }, straight = false): Image {
  const out = blank(size.w, size.h), J = rig.joint, down = Math.PI / 2;
  for (const side of ['L', 'R'] as const) {
    const f = pose[side], { H, K, foot, thighShort, shinShort } = legJoints(rig, pose, side, straight);
    over(out, turn(pieces[`shoe-${side}`], J, foot, ((f.tilt ?? 0) * Math.PI / 180) * -(side === 'L' ? -1 : 1), size));
    over(out, turn(squash(pieces[`shin-${side}`], J[1], J[1] + rig.shin, shinShort), J, K, ang(K, foot) - down, size));
    over(out, turn(squash(pieces[`thigh-${side}`], J[1], J[1] + rig.thigh, thighShort), J, H, ang(H, K) - down, size));
  }
  const drop = straight ? 0 : pose.drop ?? 0;
  over(out, drop ? lowered(pieces.hips, drop) : pieces.hips);
  return out;
}

/**
 * One leg's joints in a pose (hip, knee, where the foot lands) and how many rows shorter its thigh and
 * shin are drawn (coming toward us). The knee bends to reach the foot, or goes where it was moved
 * (`knee`): never further from the hip or the foot than the leg is long.
 */
export function legJoints(rig: LegRig, pose: { L: Foot; R: Foot; drop?: number }, side: 'L' | 'R', straight = false, ownKnee = true) {
  const drop = straight ? 0 : pose.drop ?? 0;
  const f = pose[side], H: Pt = [rig.hip[side][0], rig.hip[side][1] + drop], sx = side === 'L' ? -1 : 1, lift = Math.max(0, -f.up);
  const L = legsOf(rig, side), thighLen = L.thigh - lift;
  const A: Pt = straight ? [H[0], H[1] + L.thigh + L.shin] : [rig.ankle[side][0] + sx * f.out, rig.ankle[side][1] + f.up];
  // (the stand pose's knee exactly where it was set)
  const K0 = rig.knee?.[side];
  let K = K0 && !straight && !f.out && !f.up && !drop ? K0 : kneeOf(H, A, thighLen, L.shin, sx, straight ? 0 : L.bend);
  const moved = ownKnee && !straight && f.knee && (f.knee[0] || f.knee[1]);
  if (!moved) {
    // (out of reach: the foot where the straight leg ends)
    const foot: Pt = [K[0] + Math.cos(ang(K, A)) * L.shin, K[1] + Math.sin(ang(K, A)) * L.shin];
    return { H, K, foot, base: K, thighShort: lift, shinShort: 0 };
  }
  const base = K;
  // (the foot stays planted: the knee kept where both the thigh and the shin reach, the nearest place)
  const reach = dist(H, A) <= thighLen + L.shin;
  if (reach) K = nearestIn(H, thighLen, A, L.shin, [K[0] + f.knee![0], K[1] + f.knee![1]], K, mirrorOver(H, A, K));
  const foot: Pt = reach ? A : [K[0] + Math.cos(ang(K, A)) * L.shin, K[1] + Math.sin(ang(K, A)) * L.shin];
  const short = (len: number, full: number, drawn: number) => Math.max(0, Math.round(drawn * (1 - len / full)));
  return { H, K, foot, base, thighShort: short(dist(H, K), L.thigh, rig.thigh), shinShort: short(dist(K, foot), L.shin, rig.shin) };
}

/** p seen in the line through a and b as a mirror. */
function mirrorOver(a: Pt, b: Pt, p: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
  const m: Pt = [a[0] + dx * t, a[1] + dy * t];
  return [2 * m[0] - p[0], 2 * m[1] - p[1]];
}
/** The point nearest q within a of P and b of Q (`c1`, `c2`: where the two circles cross). */
function nearestIn(P: Pt, a: number, Q: Pt, b: number, q: Pt, c1: Pt, c2: Pt): Pt {
  const inA = (p: Pt) => dist(P, p) <= a + 1e-6, inB = (p: Pt) => dist(Q, p) <= b + 1e-6;
  if (inA(q) && inB(q)) return q;
  const onto = (C: Pt, r: number): Pt => { const d = dist(C, q) || 1; return [C[0] + (q[0] - C[0]) * r / d, C[1] + (q[1] - C[1]) * r / d]; };
  const pa = onto(P, a), pb = onto(Q, b);
  const ok = [pa, pb].filter((p) => inA(p) && inB(p));
  const all = ok.length ? ok : [c1, c2];
  return all.sort((x, y) => dist(x, q) - dist(y, q))[0];
}

/** A picture moved down `dy` rows (up, if negative). */
function lowered(src: Image, dy: number): Image {
  const out = blank(src.w, src.h);
  for (let y = 0; y < src.h; y++) if (y + dy >= 0 && y + dy < src.h) out.d.set(src.d.subarray(y * src.w * 4, (y + 1) * src.w * 4), (y + dy) * src.w * 4);
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
export function over(a: Image, b: Image) {
  const A = a.d, B = b.d;
  for (let i = 0; i < A.length; i += 4) if (B[i + 3]) { A[i] = B[i]; A[i + 1] = B[i + 1]; A[i + 2] = B[i + 2]; A[i + 3] = B[i + 3]; }
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
      out.d[o] = d[q[k]]; out.d[o + 1] = d[q[k] + 1]; out.d[o + 2] = d[q[k] + 2]; out.d[o + 3] = d[q[k] + 3];
    }
  }
  return out;
}

const UP = 8;
const bigCache = new WeakMap<Image, Image>();

/** A piece turned by `a` (radians) about `from`, its `from` moved to `to` (on a canvas of `size`). */
export function turn(src: Image, from: Pt, to: Pt, a: number, size: { w: number; h: number } = src): Image {
  if (size === src && Math.abs(a) < 1e-3 && from[0] === Math.round(to[0]) && from[1] === Math.round(to[1])) return src;
  let big = bigCache.get(src);
  if (!big) { big = scale2x(scale2x(scale2x(src))); bigCache.set(src, big); }
  const out = blank(size.w, size.h), cos = Math.cos(a), sin = Math.sin(a);
  // joints sit on pixel centres
  const fx = from[0] + 0.5, fy = from[1] + 0.5, tx = Math.round(to[0]) + 0.5, ty = Math.round(to[1]) + 0.5;
  // (only where the piece can land: its corners turned, so small pieces are quick)
  const cx = [0, src.w, 0, src.w], cy = [0, 0, src.h, src.h], X: number[] = [], Y: number[] = [];
  for (let k = 0; k < 4; k++) {
    const ux = cx[k] - fx, uy = cy[k] - fy;
    X.push(tx + cos * ux - sin * uy); Y.push(ty + sin * ux + cos * uy);
  }
  const x0 = Math.max(0, Math.floor(Math.min(...X)) - 1), x1 = Math.min(out.w, Math.ceil(Math.max(...X)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...Y)) - 1), y1 = Math.min(out.h, Math.ceil(Math.max(...Y)) + 1);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x + 0.5 - tx, dy = y + 0.5 - ty;
    const sx = (cos * dx + sin * dy + fx) * UP, sy = (-sin * dx + cos * dy + fy) * UP;
    const bx = Math.floor(sx), by = Math.floor(sy);
    if (bx < 0 || by < 0 || bx >= big.w || by >= big.h) continue;
    const i = (by * big.w + bx) * 4;
    if (big.d[i + 3]) { const o = (y * out.w + x) * 4, D = out.d, S = big.d; D[o] = S[i]; D[o + 1] = S[i + 1]; D[o + 2] = S[i + 2]; D[o + 3] = S[i + 3]; }
  }
  return out;
}

/* ---------------------------------------------------------------- the arms */

/** An arm in a frame (recorded by band-sprites): shoulder, hand, the side the elbow bends to, lengths. */
export type ArmPose = { sh: Pt; hand: Pt; side: number; a: number; b: number };
/**
 * A player's arms: where the shoulders are (A screen left, B right, in the player's space), and the two
 * pieces, drawn hanging straight down from their joint (`joint` on each piece's canvas) to the next
 * (`upper` and `fore` px below it).
 */
export interface ArmRig { shoulders: { A: Pt; B: Pt }; joint: Pt; upper: number; fore: number; sleeve: 'long' | 'short' }
export const ARM_PIECES = ['upper', 'fore'] as const;

/** The elbow: two-bone reach from shoulder to hand, bending toward `side` and down (as band-sprites). */
function elbowOf(sh: Pt, hand: Pt, a: number, b: number, side: number): Pt {
  const dx = hand[0] - sh[0], dy = hand[1] - sh[1];
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const an = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const c1: Pt = [sh[0] + Math.cos(an + al) * a, sh[1] + Math.sin(an + al) * a];
  const c2: Pt = [sh[0] + Math.cos(an - al) * a, sh[1] + Math.sin(an - al) * a];
  const score = (p: Pt) => p[1] + side * p[0];
  return score(c1) > score(c2) ? c1 : c2;
}

/**
 * An arm frame from the pieces: the upper arm and forearm turned into place (shoulder to elbow to
 * hand), then the frame's hand (`hand`: the hand, pick or sticks, on the canvas) over them. `o`: the
 * player's origin on the canvas.
 */
export function poseArms(pieces: Record<'upper' | 'fore', Image>, rig: ArmRig, arms: ArmPose[], hand: Image | null, o: Pt, size: { w: number; h: number }): Image {
  const out = blank(size.w, size.h);
  for (const p of arms) {
    const sh0 = p.side < 0 ? rig.shoulders.A : rig.shoulders.B;
    const S: Pt = [sh0[0] + o[0], sh0[1] + o[1]], T: Pt = [p.hand[0] + o[0], p.hand[1] + o[1]];
    // (out of reach: the arm stretched straight to the hand, so the hand never comes off it; the pieces
    // are drawn a little past their joints)
    const k = Math.max(1, Math.hypot(T[0] - S[0], T[1] - S[1]) / (rig.upper + rig.fore));
    const E = elbowOf(S, T, rig.upper * k, rig.fore * k, p.side);
    const down = Math.PI / 2;
    over(out, turn(pieces.upper, rig.joint, S, ang(S, E) - down, size));
    over(out, turn(pieces.fore, rig.joint, E, ang(E, T) - down, size));
  }
  if (hand) over(out, hand);
  return out;
}

/* ---------------------------------------------------------------- placeholder arm pieces */

const INK: [number, number, number] = [0x1b, 0x16, 0x26];

/**
 * Placeholder arm pieces, hanging down from the joint: a sleeve (long: to the wrist; short: the top of
 * the upper arm) over a skin tube, a darker side, an outline.
 */
export function armPieces(len: { upper: number; fore: number }, sleeve: 'long' | 'short', cloth: number[], skin: number[]): { pieces: Record<'upper' | 'fore', Image>; joint: Pt } {
  const joint: Pt = [8, 4];
  const make = (n: number, layers: { from: number; to: number; w: number; c: number[] }[]) => {
    const img = blank(16, Math.ceil(n) + 10), cx = joint[0] + 0.5, cy = joint[1] + 0.5;
    for (const l of layers) for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const px = x + 0.5, py = y + 0.5, y0 = cy + l.from * n, y1 = cy + l.to * n;
      const ny = Math.max(y0, Math.min(y1, py));
      if (Math.hypot(px - cx, py - ny) > l.w / 2) continue;
      const dark = px - cx > l.w / 2 - 1.2 ? 0.75 : 1;
      img.d.set([l.c[0] * dark, l.c[1] * dark, l.c[2] * dark, 255], (y * img.w + x) * 4);
    }
    // the outline
    const a = (x: number, y: number) => x >= 0 && y >= 0 && x < img.w && y < img.h && img.d[(y * img.w + x) * 4 + 3] > 0;
    const solid = new Uint8Array(img.w * img.h);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) solid[y * img.w + x] = a(x, y) ? 1 : 0;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (solid[y * img.w + x]) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < img.w && Y < img.h && solid[Y * img.w + X]; });
      if (near) img.d.set([...INK, 255], (y * img.w + x) * 4);
    }
    return img;
  };
  const upper = sleeve === 'long'
    ? make(len.upper, [{ from: 0, to: 1, w: 4.8, c: cloth }])
    : make(len.upper, [{ from: 0, to: 1, w: 4, c: skin }, { from: 0, to: 0.45, w: 4.8, c: cloth }]);
  const fore = sleeve === 'long'
    ? make(len.fore, [{ from: 0, to: 1, w: 3.4, c: skin }, { from: 0, to: 0.78, w: 4.2, c: cloth }])
    : make(len.fore, [{ from: 0, to: 1, w: 3.4, c: skin }]);
  return { pieces: { upper, fore }, joint };
}
