// The moves the dressed players (the wardrobe's: singer, guitarists, bass) are drawn in, as two sets:
// - classic: as first made: the feet moved for each pose, the body bobbing on its own over the legs;
// - fresh (the default), made for the skeleton with knees: every frame its own pose (where each foot
//   is, how low or high the hips are: the body goes with them, so it never slides over the trousers):
//   each stance at rest and at each depth of a bounce on the beat (`wide/b2`: the second deepest), a
//   walk, a jump's crouch, the jump and its landing; and the singer's arms placed from his shoulders
//   (so they fit any top).
// band.html?moves=classic brings the classic set back.
//
// The fresh moves can be redrawn (art/wardrobe/moves.json, made with the rig lab's Moves): moves for
// every role (`all`) and a role's own (`singer`, `rhythm`, `lead`, `bassist`), a pose of the role's own
// replacing the shared one for that role only. What isn't there is as below; a bounce frame not drawn
// follows its stance (that far lower), a crouch or landing not drawn follows the wide stance.

import { type Foot, POSES, type Pt } from './rig';

export type MoveSet = 'classic' | 'fresh';
/** A pose: each foot (from where it stands), and how far the hips (and the body) drop: < 0 raised. */
export type LegPose = { L: Foot; R: Foot; drop?: number };
/** Moves for a role (or all): leg poses, the singer's hands from his shoulders. (`heights`: older files.) */
export type RoleMoves = { legs?: Record<string, LegPose>; heights?: Record<string, number>; arms?: Record<string, Pt> };
export type Moves = Partial<Record<string, RoleMoves>>;

/** The set asked for in the page's address (fresh unless ?moves=classic). */
export const moveSet = (): MoveSet => (typeof location !== 'undefined' && new URLSearchParams(location.search).get('moves') === 'classic' ? 'classic' : 'fresh');

const flat: Foot = { out: 0, up: 0 };
/** How far the hips go: down (a deep crouch) and up (legs straight, on tiptoe). */
export const MAX_DROP = 6, MAX_RAISE = 6;
/** The stances that bend on the beat, and how deep a bounce goes (the character's: cool 1, energetic 3). */
export const STANCE_NAMES = ['stand', 'wide', 'lunge'];
export const BOUNCES = 3;
/** The jump's frames: the crouch before, in the air, the landing. */
export const JUMP_FRAMES = ['jump/crouch', 'jump', 'jump/land'];

/** The walks across the stage (`walkR`, `walkL`, as `walk/`'s four steps), and the stage's walk-on, by direction. */
export const WALKS = { R: 'walkR', L: 'walkL' } as const;
/** A pose seen in a mirror: each foot as the other's, a moved knee the other way. */
export function mirrorPose(p: LegPose): LegPose {
  const m = (f: Foot): Foot => (f.knee ? { ...f, knee: [-f.knee[0], f.knee[1]] } : { ...f });
  return { ...p, L: m(p.R), R: m(p.L) };
}
function sideWalk(to: 'L' | 'R'): Record<string, LegPose> {
  const right: LegPose[] = [
    { L: { out: 2, up: 0 }, R: { out: 2, up: 0 }, drop: 1 },
    { L: { out: -1, up: -2, tilt: 6 }, R: { out: 1, up: 0 }, drop: 0 },
    { L: { out: -1, up: 0 }, R: { out: -1, up: 0 }, drop: 1 },
    { L: { out: 0, up: 0 }, R: { out: 3, up: -2, tilt: 6 }, drop: 0 },
  ];
  return Object.fromEntries(right.map((p, i) => [`${WALKS[to]}/${i}`, to === 'R' ? p : mirrorPose(p)]));
}

/** The fresh moves as first made (moves.json changes them). */
export const FRESH: { legs: Record<string, LegPose>; arms: Record<string, Pt> } = {
  legs: {
    stand: { L: flat, R: flat, drop: 0 },
    wide: { L: { out: 2, up: 0 }, R: { out: 2, up: 0 }, drop: 1 },
    // the screen-left knee bent out over the foot, the other leg long behind
    lunge: { L: { out: 3, up: 0 }, R: { out: 4, up: 0, tilt: -6 }, drop: 2 },
    // walking on: both feet down and the hips dipped, then a foot lifted past (the hips up again)
    'walk/0': { L: { out: 1, up: 0 }, R: { out: 1, up: 0 }, drop: 1 },
    'walk/1': { L: { out: -1, up: -4, tilt: 8 }, R: flat },
    'walk/2': { L: { out: 1, up: 0 }, R: { out: 1, up: 0 }, drop: 1 },
    'walk/3': { L: flat, R: { out: -1, up: -4, tilt: 8 } },
    // walking across the stage to the right (screen right): feet apart, the left foot lifted and
    // brought in, feet together, the right foot lifted and reaching out; to the left, the same mirrored
    ...sideWalk('R'),
    ...sideWalk('L'),
    // in the air: knees tucked up and out, toes pointed
    jump: { L: { out: 1, up: -5, tilt: 8 }, R: { out: 1, up: -5, tilt: 8 } },
  },
  // the singer's hands, from the shoulder (the mic hand stays on the mic)
  arms: { 'armA/down': [-1, 24], 'armB/down': [1, 24], 'armB/up': [3, -24.5], 'armB/out': [21, 2], 'armB/chest': [-9, 11] },
};

/**
 * A role's fresh moves: the role's own over the shared ones over the first made; every frame there
 * (the bounce frames following their stance, the crouch and landing following the wide stance, unless
 * drawn).
 */
export function movesFor(data: Moves | undefined, role: string): { legs: Record<string, LegPose>; arms: Record<string, Pt> } {
  const all = data?.all ?? {}, own = data?.[role] ?? {};
  const pick = (n: string): LegPose | undefined => {
    const p = own.legs?.[n] ?? all.legs?.[n];
    if (!p) return undefined;
    // (older files kept a stance's height apart)
    const h = own.legs?.[n] ? own.heights?.[n] ?? all.heights?.[n] : all.heights?.[n];
    return p.drop === undefined && h !== undefined ? { ...p, drop: h } : p;
  };
  const legs: Record<string, LegPose> = {};
  for (const n of Object.keys(FRESH.legs)) legs[n] = pick(n) ?? FRESH.legs[n];
  const lower = (p: LegPose, d: number): LegPose => ({ ...p, drop: (p.drop ?? 0) + d });
  for (const s of STANCE_NAMES) for (let b = 1; b <= BOUNCES; b++) legs[`${s}/b${b}`] = pick(`${s}/b${b}`) ?? lower(legs[s], b);
  legs['jump/crouch'] = pick('jump/crouch') ?? lower(legs.wide, 2);
  legs['jump/land'] = pick('jump/land') ?? lower(legs.wide, 1);
  for (const [n, p] of Object.entries({ ...all.legs, ...own.legs })) legs[n] ??= pick(n) ?? p;
  return { legs, arms: { ...FRESH.arms, ...all.arms, ...own.arms } };
}
/** Is the frame drawn (for this role, or shared), not just following another? */
export const drawnFrame = (data: Moves | undefined, role: string, n: string) => !!(data?.[role]?.legs?.[n] ?? data?.all?.legs?.[n]);

/** Every leg frame of a set, by name (without `legs/`). */
export function legFrames(set: MoveSet, data?: Moves, role = 'all'): Record<string, LegPose> {
  return set === 'classic' ? POSES : movesFor(data, role).legs;
}

/** What the stage needs to know of a dressed player's fresh moves (kept in its sheet's geo): each frame's drop. */
export type StanceGeo = { drops: Record<string, number> };
export function stanceGeo(data: Moves | undefined, role: string): StanceGeo {
  return { drops: Object.fromEntries(Object.entries(movesFor(data, role).legs).map(([n, p]) => [n, p.drop ?? 0])) };
}

/** The show's moment (src/band/actors.ts showOf): a crouch before a jump (`dy` > 0), in the air, the landing. */
type Show = { dy: number; legs: string | null; air: boolean };
const still: Show = { dy: 0, legs: null, air: false };

/**
 * Fresh moves: the legs frame (and its y) and how far the body is drawn down (< 0 up), for a stance
 * (`stand`, `wide`, `lunge`; or a frame like `walk/1`), a bounce on the beat (0 to 3: how deep) and the
 * show's jump.
 */
export function freshStance(g: StanceGeo | undefined, pose: string, bounce: number, show: Show = still) {
  const drop = (n: string) => g?.drops[n] ?? FRESH.legs[n]?.drop ?? 0;
  if (show.air) return { legs: 'legs/jump', legsY: show.dy, body: show.dy + drop('jump') };
  if (show.legs) {
    // just before the jump: the crouch; taking off and landing: the landing frame, the whole player up
    const n = show.dy > 0 ? 'jump/crouch' : 'jump/land', y = Math.min(0, show.dy);
    return { legs: `legs/${n}`, legsY: y, body: y + drop(n) };
  }
  const name = pose.replace(/^legs\//, '');
  if (!STANCE_NAMES.includes(name)) return { legs: `legs/${name}`, legsY: 0, body: drop(name) };
  const b = Math.max(0, Math.min(BOUNCES, Math.round(bounce)));
  const n = b ? `${name}/b${b}` : name;
  return { legs: `legs/${n}`, legsY: 0, body: drop(n) };
}
