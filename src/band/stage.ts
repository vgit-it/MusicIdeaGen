// The stage (docs/BAND-VIEW.md): a small pixel canvas (480 x 270) scaled up with sharp pixels. The
// backdrop, the five players back to front, and the lights: colours by section, brighter when louder,
// a flash on crashes. Plus a check view: each player's fretboard and the drums,
// to see the playing is right.

import { type Atlas, draw, loadAtlas, loadImage } from './atlas';
import { type Actor, type Cmd, type Moment, type Pre, type Roam, drummerActor, guitarActor, singerActor } from './actors';
import { DRESSED, type Wardrobe, dress, loadWardrobe, pickOutfits } from './dress';
import { LITE } from './lite';
import { moveSet } from './moves';
import { PERSONAS, PLAYERS, type Persona, type Player, STYLES } from './persona';
import { type Score, lastAt } from './score';

/** The camera's picture: 320 x 180 pixels (the players fill about half its height), scaled up with sharp pixels. */
export const W = 350, H = 180;

/** Where the stage's own lights are (stage.json): the cans on the pipe, the string-light bulbs, the neon signs. */
export interface StageLights { cans: [number, number][]; bulbs: [number, number][]; neon: { x: number; y: number; w: number; h: number; color: string }[]; front?: { x: number; y: number } }

/** The backdrop and its lights, the crowd, and every player's sheet in every character's clothes (`singer-cool`, `lead-emo`...). */
export interface Cast { stage: HTMLImageElement; front: HTMLImageElement | null; lights: StageLights; crowd: Atlas; sheets: Record<string, Atlas>; wardrobe: Wardrobe | null }

export async function loadCast(base = 'band/'): Promise<Cast> {
  const names = PLAYERS.flatMap((p) => PERSONAS.map((c) => `${p}-${c}`));
  // (band.html?art: Paul's drawings, npm run band-pack; ?cut: the players cut out of his character
  // reference, scripts/band-cut.py)
  const q = new URLSearchParams(location.search);
  if (q.has('art')) base = `${base}art/`;
  else if (q.has('cut')) base = `${base}cut/`;
  const [stage, lights, crowd, ...atlases] = await Promise.all([
    loadImage(`${base}stage.png`), fetch(`${base}stage.json`).then((r) => r.json()), loadAtlas(base, 'crowd'), ...names.map((n) => loadAtlas(base, n)),
  ]) as [HTMLImageElement, StageLights, Atlas, ...Atlas[]];
  // (the stage's front layer: the monitors and the front edge, over the players' feet)
  const front = lights.front ? await loadImage(`${base}stage-front.png`) : null;
  // (the wardrobe: Paul's art only, npm run band-pack)
  const wardrobe = q.has('art') ? await loadWardrobe(base) : null;
  return { stage, front, lights, crowd, sheets: Object.fromEntries(names.map((n, i) => [n, atlases[i]])), wardrobe };
}

/** Where each player stands (their feet), back to front. */
// (on Paul's stage, left to right: the bassist, the lead, the drummer dead centre on the riser, the
// singer, the rhythm guitarist; a can above each)
const SPOTS = { drummer: [171, 131], bassist: [46, 158], lead: [108, 158], singer: [238, 160], rhythm: [296, 158] } as const;
/** Left to right, for keeping the roaming players out of each other's way. */
const ORDER = ['bassist', 'lead', 'drummer', 'singer', 'rhythm'] as const;
/** How far each player roams from their spot (px, left and right), and the room each pair needs between their bodies' middles. */
const LANE: Record<Exclude<keyof typeof SPOTS, 'drummer'>, [number, number]> = { bassist: [-22, 12], lead: [-14, 24], singer: [-30, 12], rhythm: [-28, 10] };
const GAP = [34, 38, 38, 34];
/** The crowd: how much bigger than drawn (near the camera), and how low (their feet's line, under the picture). */
const CROWD = { scale: 2, y: H + 36 };
/** Where the back wall meets the floor (shadows are cast on the wall above it). */
const WALL_FOOT = 137;

/**
 * The walk-on, in seconds from Play: when each player sets off, how long they walk, and from how far
 * (px from their spot: off the side of the stage; the drummer from the end of the riser, behind the kit).
 * The drummer first, then each side from the middle out (so nobody walks through anyone); then a wave, then the drummer counts in four.
 */
const WALK: Record<keyof typeof SPOTS, { at: number; dur: number; from: number }> = {
  drummer: { at: 0, dur: 1.4, from: 72 },
  lead: { at: 0.4, dur: 1.7, from: -170 },
  bassist: { at: 0.9, dur: 1.9, from: -150 },
  singer: { at: 1.2, dur: 1.9, from: 260 },
  rhythm: { at: 2.0, dur: 1.6, from: 140 },
};
const WAVE: [number, number] = [4.0, 5.0];
const COUNT_AT = 5.2;

/** The walk-on's timing for a song: when the count-in starts, the length of its beats, and when the song starts (seconds from Play). */
export function walkOn(score: Score) {
  const beat = ((score.beats[1] ?? 4) - (score.beats[0] ?? 0)) * score.six;
  return { countAt: COUNT_AT, beat, start: COUNT_AT + 4 * beat };
}

/** Light colours per kind of section (two each). */
const LIGHTS: Record<string, [string, string]> = {
  intro: ['#3a6cff', '#7a4cff'], verse: ['#7a4cff', '#3aa0ff'], prechorus: ['#ffb03a', '#ff6a3a'], chorus: ['#ff3a5a', '#ffd23a'],
  interlude: ['#3ad0c0', '#7a4cff'], bridge: ['#3ad0c0', '#3a6cff'], breakdown: ['#2a3aff', '#5a2aff'], solo: ['#ff3ad0', '#ffffff'], outro: ['#ff9a3a', '#7a4cff'],
};

/** One stroll along a path: from `x0` at `t0` to `x1` at `t1` (seconds into the song), `d0` px already walked by then. */
interface Stroll { t0: number; t1: number; x0: number; x1: number; d0: number }

/** A small seeded random generator (the same band walks the same way for the same song). */
function rng(seed: number) {
  let r = seed >>> 0 || 1;
  return () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class Stage {
  private actors: { name: keyof typeof SPOTS; act: Actor }[];
  private beats: { at: number }[];
  private barList: { at: number }[];
  /** The band and the crowd, each drawn on its own layer to be lit (a rim light). */
  private bandLayer = Object.assign(document.createElement('canvas'), { width: W, height: H });
  private crowdLayer = Object.assign(document.createElement('canvas'), { width: W, height: H });
  /** The edges of the picture fading to dark, and four frames of grain (made once). */
  private vignette = sharedVignette();
  private grain = sharedGrain();
  /** The lit crowd as last drawn, and what it was drawn from (it only changes when the crowd moves or the light does). */
  private crowdLit = Object.assign(document.createElement('canvas'), { width: W, height: H });
  private crowdKey = '';
  /** The players' shadow shape (for the back wall). */
  private shade = Object.assign(document.createElement('canvas'), { width: W, height: H });
  /** The light layer, at the stage's own pixel size (the camera is close: half-size light pixels read as a screen door). */
  private light = Object.assign(document.createElement('canvas'), { width: W, height: H });
  /** Full quality whatever the device (a video render): the light is made for every frame. */
  full = false;
  /** Frames since the light was last made (lite mode makes it every other frame). */
  private lightTick = 0;
  /** Each walking player's strolls around their spot, planned for the whole song (see `plan`). */
  private paths = new Map<keyof typeof SPOTS, Stroll[]>();
  /** What each player wears this song (from the wardrobe, src/band/dress.ts), for checks from the console. */
  outfits: Partial<Record<Player, import('./dress').Outfit>>;
  /** `who`: each player's character (their clothes and how they move). */
  constructor(private cast: Cast, private score: Score, private genre: string, who: Record<Player, Persona>) {
    // (with the wardrobe: each song's outfits, picked by the song; band.html?art&own: their own clothes)
    const own = typeof location !== 'undefined' && new URLSearchParams(location.search).has('own');
    const songKey = `${genre}|${score.steps}|${score.vocal.lines.length}|${score.lead.length}|${score.drums.limbs.A.length}`;
    const outfits = cast.wardrobe ? pickOutfits(cast.wardrobe, songKey, own) : {};
    this.outfits = outfits;
    const sheet = (p: Player) => {
      const base = cast.sheets[`${p}-${who[p]}`], o = outfits[p];
      return cast.wardrobe && o && DRESSED.includes(p) ? dress(cast.wardrobe, base, `${p}-${who[p]}`, o, moveSet(), p) : base;
    };
    this.beats = score.beats.map((at) => ({ at }));
    this.barList = score.bars.map((at) => ({ at }));
    this.actors = [
      { name: 'drummer', act: drummerActor(sheet('drummer'), score, STYLES[who.drummer]) },
      { name: 'bassist', act: guitarActor(sheet('bassist'), score, 'bass', 2, STYLES[who.bassist]) },
      { name: 'rhythm', act: guitarActor(sheet('rhythm'), score, 'rhythm', 4, STYLES[who.rhythm]) },
      { name: 'lead', act: guitarActor(sheet('lead'), score, 'lead', 5, STYLES[who.lead]) },
      { name: 'singer', act: singerActor(sheet('singer'), score, STYLES[who.singer]) },
    ];
    for (const name of ORDER) if (name !== 'drummer') this.paths.set(name, this.plan(name, STYLES[who[name]].roam, score.moves.final));
  }

  /**
   * One player's strolls around their spot for the whole song: stand a while, walk to another place in
   * their lane, stand again. Quiet sections mostly standing, loud ones on the move; a calmer character
   * (`reach`) goes less far. Seeded by the song and the player, so it's the same every time and anywhere you jump to.
   */
  private plan(name: Exclude<keyof typeof SPOTS, 'drummer'>, reach: number, final: number | null): Stroll[] {
    const s = this.score, [lo, hi] = LANE[name].map((v) => v * reach);
    const rnd = rng(s.steps * 7 + s.vocal.lines.length * 131 + ORDER.indexOf(name) * 977 + s.lead.length);
    const end = (final ?? s.sections[s.sections.length - 1].to) * s.six + 30;
    const out: Stroll[] = [];
    let t = 0, x = 0, d = 0;
    while (t < end) {
      const sec = s.sections.find((z) => t >= z.from * s.six && t < z.to * s.six);
      const e = sec?.energy ?? 3;
      t += (e >= 4 ? 3 : e >= 3 ? 5 : 9) + rnd() * (e >= 4 ? 5 : e >= 3 ? 8 : 12);
      // (somewhere at least 6px off)
      // (usually across to the other half of the lane)
      let to = x - lo > hi - x ? lo + rnd() * (hi - lo) * 0.5 : lo + (hi - lo) * (0.5 + rnd() * 0.5);
      if (Math.abs(to - x) < 6) to = x + (x - lo > hi - x ? -1 : 1) * 6;
      to = clamp01((to - lo) / Math.max(1, hi - lo)) * (hi - lo) + lo;
      const dur = Math.max(0.6, Math.abs(to - x) / (12 + rnd() * 6));
      out.push({ t0: t, t1: t + dur, x0: x, x1: to, d0: d });
      d += Math.abs(to - x);
      x = to;
      t += dur;
    }
    return out;
  }

  /** Where a walking player is around their spot at `sec` seconds into the song (px), which way they're walking and how far they've gone (null: standing). */
  private roamOf(name: Exclude<keyof typeof SPOTS, 'drummer'>, sec: number): Roam {
    const path = this.paths.get(name)!;
    // (the stroll under way, or the last one that finished)
    let i = -1;
    while (i + 1 < path.length && path[i + 1].t0 <= sec) i++;
    if (i < 0) return { x: 0, dir: 1, stride: null };
    const p = path[i];
    if (sec >= p.t1) return { x: p.x1, dir: p.x1 >= p.x0 ? 1 : -1, stride: null };
    const u = (sec - p.t0) / (p.t1 - p.t0), k = u * u * (3 - 2 * u);
    return { x: p.x0 + (p.x1 - p.x0) * k, dir: p.x1 >= p.x0 ? 1 : -1, stride: Math.floor((p.d0 + Math.abs(p.x1 - p.x0) * k) / 4) };
  }

  moment(t: number, wall = t * this.score.six, roam?: Roam): Moment {
    const s = this.score;
    const section = s.sections.find((x) => t >= x.from && t < x.to) ?? (t < 0 ? s.sections[0] : s.sections[s.sections.length - 1]);
    const bi = Math.max(0, lastAt(this.beats, t));
    const b0 = s.beats[bi] ?? 0, b1 = s.beats[bi + 1] ?? b0 + 4;
    return { t, six: s.six, section, beat: clamp01((t - b0) / (b1 - b0)), beatNo: bi, heavy: ['metal', 'hardrock', 'altmetal', 'grunge'].includes(this.genre), wall, roam };
  }

  /** What one player draws at song step `t` (for checks from the console). */
  cmdsOf(name: keyof typeof SPOTS, t: number): Cmd[] {
    return this.actors.find((x) => x.name === name)!.act(this.moment(t));
  }

  /** One player's walk-on at `sec` seconds from Play. */
  private preFor(name: keyof typeof SPOTS, sec: number): Pre {
    const w = WALK[name], on = walkOn(this.score);
    const u = clamp01((sec - w.at) / w.dur);
    const walking = sec >= w.at && u < 1;
    const since = sec < on.countAt ? Infinity : sec < on.countAt + 4 * on.beat ? (sec - on.countAt) % on.beat : Infinity;
    return {
      // (not set off yet: off the stage, out of sight)
      x: sec < w.at ? 1000 : Math.round(w.from * (1 - u)),
      stride: walking ? Math.floor((Math.abs(w.from) * u) / 5) : null,
      dir: w.from < 0 ? 1 : -1,
      wave: name === 'singer' && sec >= WAVE[0] && sec < WAVE[1],
      count: since,
    };
  }

  /**
   * Draw the moment `t` (song steps; below 0: waiting to start). `wall`: seconds on a clock that always
   * runs. `pre`: seconds into the walk-on (before the song starts).
   */
  render(ctx: CanvasRenderingContext2D, t: number, wall = performance.now() / 1000, pre?: number) {
    const m = this.moment(Math.max(t, 0), t >= 0 ? t * this.score.six : wall);
    const playing = t >= 0;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.cast.stage, 0, 0);
    const e = playing ? m.section.energy : 1;
    // the house darker in quiet sections
    ctx.fillStyle = `rgba(6, 4, 14, ${Math.max(0.05, 0.38 - e * 0.07)})`;
    ctx.fillRect(0, 0, W, H);
    const idle = { ...m, t: -100, beat: (wall / 0.9) % 1, beatNo: Math.floor(wall / 0.9), section: { ...m.section, energy: 3, solo: false } };
    const drawn = this.actors.map(({ name, act }) => {
      // (the walking players stroll around their spot while the song plays)
      const roam = playing && name !== 'drummer' ? this.roamFor(name, t) : undefined;
      return {
        name,
        at: [SPOTS[name][0] + (roam ? Math.round(roam.x) : 0), SPOTS[name][1]] as [number, number],
        // (waiting: the band nods along slowly, ready to go)
        cmds: (playing ? act(roam ? { ...m, roam } : m) : pre !== undefined ? act({ ...idle, pre: this.preFor(name, pre) }) : act(idle)) as Cmd[],
      };
    });
    // (the walk-on has its own order, and players not yet on stage are parked far off: only keep the playing band apart)
    if (playing) this.apart(drawn);
    this.shadows(ctx, drawn, e);
    // the band, on a layer of its own: dark against the lights, their edges glowing (a rim light)
    const flash = this.crashFlash(m, playing);
    const b = this.layer(this.bandLayer);
    // (the box the band covers: the rim light reads and lights only that)
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    const grow = (x0: number, y0: number, x1: number, y1: number) => { bx0 = Math.min(bx0, x0); by0 = Math.min(by0, y0); bx1 = Math.max(bx1, x1); by1 = Math.max(by1, y1); };
    for (const { at: [x, y], cmds } of drawn) {
      for (const c of cmds) {
        if ('line' in c) {
          for (let k = 0; k < (c.w ?? 1); k++) pixelLine(b, x + c.line[0] + k, y + c.line[1], x + c.line[2] + k, y + c.line[3], c.color, c.alpha);
          grow(x + Math.min(c.line[0], c.line[2]), y + Math.min(c.line[1], c.line[3]), x + Math.max(c.line[0], c.line[2]) + (c.w ?? 1), y + Math.max(c.line[1], c.line[3]) + 1);
        } else {
          const f = c.a.frames[c.f];
          draw(b, c.a, c.f, x + c.x, y + c.y, c.alpha);
          if (f) grow(x + c.x - f[4], y + c.y - f[5], x + c.x - f[4] + f[2], y + c.y - f[5] + f[3]);
        }
      }
    }
    rimLight(b, Math.max(0.1, 0.3 - e * 0.04), playing ? 0.55 + e * 0.08 + flash * 0.4 : 0.4, [bx0 - 3, by0 - 3, bx1 + 3, by1 + 3]);
    ctx.drawImage(this.bandLayer, 0, 0);
    if (this.cast.front && this.cast.lights.front) ctx.drawImage(this.cast.front, this.cast.lights.front.x, this.cast.lights.front.y);
    // the crowd: nearly black, rim-lit by the stage
    // (the crowd bobs in a few poses and the light moves slowly: the same picture comes up again and again, so it's kept)
    const crowdRim = playing ? 0.5 + e * 0.07 + flash * 0.3 : 0.3, crowdKey = this.crowdLook(m, playing) + `|${crowdRim}`;
    if (crowdKey !== this.crowdKey) {
      const cr = this.layer(this.crowdLayer);
      this.crowd(cr, m, playing);
      rimLight(cr, 0.7, crowdRim);
      const lit = this.crowdLit.getContext('2d')!;
      lit.clearRect(0, 0, W, H);
      lit.drawImage(this.crowdLayer, 0, 0);
      this.crowdKey = crowdKey;
    }
    ctx.drawImage(this.crowdLit, 0, 0);
    this.lights(ctx, m, playing, wall);
    this.grade(ctx, wall);
  }

  /** A walking player's stroll at song step `t`: held still in the lead's solo (he lunges there) and after the final hit. */
  private roamFor(name: Exclude<keyof typeof SPOTS, 'drummer'>, t: number): Roam {
    const six = this.score.six, final = this.score.moves.final;
    const r = this.roamOf(name, (final === null ? t : Math.min(t, final)) * six);
    if (final !== null && t >= final) return { ...r, stride: null };
    const sec = this.score.sections.find((z) => t >= z.from && t < z.to);
    if (name === 'lead' && sec?.solo) {
      const a = ease01(Math.min((t - sec.from) * six, (sec.to - t) * six) / 0.7);
      return { x: r.x * (1 - a), dir: r.dir, stride: a > 0 ? null : r.stride };
    }
    return r;
  }

  /**
   * Keeps the players out of each other's space: where two have come closer than their bodies allow
   * (the roaming, the stepping in toward the drummer, the sway all add up), they're eased apart,
   * the drummer (on his kit) never moving.
   */
  private apart(drawn: { name: keyof typeof SPOTS; at: [number, number]; cmds: Cmd[] }[]) {
    const row = ORDER.map((n) => drawn.find((d) => d.name === n)!);
    // (where each body is: its spot and the body sprite's own offset)
    const own = row.map((d) => { const b = d.cmds.find((c) => 'f' in c && c.f === 'body/idle'); return b && 'x' in b ? b.x : 0; });
    const pos = row.map((d, i) => d.at[0] + own[i]);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < GAP.length; i++) {
        const lack = GAP[i] - (pos[i + 1] - pos[i]);
        if (lack <= 0) continue;
        const fixL = row[i].name === 'drummer', fixR = row[i + 1].name === 'drummer';
        if (fixL) pos[i + 1] += lack;
        else if (fixR) pos[i] -= lack;
        else { pos[i] -= lack / 2; pos[i + 1] += lack / 2; }
      }
    }
    row.forEach((d, i) => { d.at = [d.at[0] + Math.round(pos[i] - (d.at[0] + own[i])), d.at[1]]; });
  }

  /** A layer cleared for drawing. */
  private layer(cv: HTMLCanvasElement) {
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    return c;
  }

  /** How bright the room is from a crash just now (0-1). */
  private crashFlash(m: Moment, playing: boolean) {
    if (!playing || m.section.energy < 4) return 0;
    const crashes = this.score.drums.pieces.crash, ci = lastAt(crashes, m.t);
    const ago = ci >= 0 ? (m.t - crashes[ci].at) * m.six : Infinity;
    return ago < 0.3 ? 1 - ago / 0.3 : 0;
  }

  /**
   * The grade over the whole picture, after the final reference: everything warmed toward red, the
   * edges falling into the dark (stepped, dithered), and a little pixel grain that moves.
   */
  private grade(ctx: CanvasRenderingContext2D, wall: number) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#ffdccf';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.vignette, 0, 0);
    ctx.drawImage(this.grain[Math.floor(wall * 12) % this.grain.length], 0, 0);
  }

  /**
   * The players' shadows on the back wall, thrown by the lights above and in front: each player's
   * sprites again as one dark shape, a little bigger and higher, only on the wall (above the floor),
   * stronger when the lights are up.
   */
  private shadows(ctx: CanvasRenderingContext2D, drawn: { at: readonly [number, number]; cmds: Cmd[] }[], e: number) {
    const S = this.shade;
    const c = S.getContext('2d')!;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    for (const { at: [x, y], cmds } of drawn) for (const k of cmds) if (!('line' in k)) draw(c, k.a, k.f, x + k.x, y + k.y);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#06030a';
    c.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, WALL_FOOT);
    ctx.clip();
    ctx.globalAlpha = 0.28 + e * 0.05;
    ctx.imageSmoothingEnabled = false;
    // (scaled up from a point low in front of the stage, as if cast by the lights over the crowd)
    const k = 1.18, ox = W / 2, oy = H + 20;
    ctx.drawImage(S, ox - ox * k, oy - oy * k - 6, W * k, H * k);
    ctx.restore();
  }

  /**
   * The crowd across the front: two groups bobbing in turn when the band's loud, hands up for the big
   * moments (a jump, a crash in a loud part, the end).
   */
  private crowd(ctx: CanvasRenderingContext2D, m: Moment, playing: boolean) {
    const a = this.cast.crowd;
    const { up, bob0, bob1 } = this.crowdPose(m, playing);
    // (close to the camera: drawn at CROWD.scale, their heads just under the band's feet)
    ctx.save();
    ctx.translate(W / 2, CROWD.y);
    ctx.scale(CROWD.scale, CROWD.scale);
    draw(ctx, a, `crowd/0/${up ? 'up' : 'idle'}`, 0, bob0);
    draw(ctx, a, `crowd/1/${up ? 'up' : 'idle'}`, 0, bob1);
    ctx.restore();
  }

  /** How the crowd stands now: hands up or not, and which group is on its bob. */
  private crowdPose(m: Moment, playing: boolean) {
    const e = playing ? m.section.energy : 1;
    const jumps = this.score.moves.jumps;
    let ji = -1;
    while (ji + 1 < jumps.length && jumps[ji + 1] <= m.t) ji++;
    const sinceJump = playing && ji >= 0 ? (m.t - jumps[ji]) * m.six : Infinity;
    const crashes = this.score.drums.pieces.crash, ci = lastAt(crashes, m.t);
    const sinceCrash = playing && ci >= 0 ? (m.t - crashes[ci].at) * m.six : Infinity;
    const final = this.score.moves.final;
    const up = (sinceJump < 1.5 && e >= 4) || (sinceCrash < 0.5 && e >= 4) || (playing && final !== null && m.t >= final);
    const bob = (side: number) => (e >= 3 && ((m.beat + side * 0.5) % 1) < 0.25 ? 1 : 0);
    return { up, bob0: bob(0), bob1: bob(1) };
  }

  private crowdLook(m: Moment, playing: boolean) {
    const { up, bob0, bob1 } = this.crowdPose(m, playing);
    return `${up ? 1 : 0}${bob0}${bob1}`;
  }

  /**
   * The light, in pixels too: stepped into levels with a 4x4 ordered dither,
   * then laid over the stage (adding light) with hard edges. Cans on the pipe throw coloured cones at
   * the players (swinging when it's loud, punching on the bar's downbeat), the string lights twinkle, the neon glows (and flickers now and then), crashes flash.
   */
  private lights(ctx: CanvasRenderingContext2D, m: Moment, playing: boolean, wall: number) {
    const e = playing ? m.section.energy : 1;
    // (phones: the light is made every other drawn frame; the last one is laid again in between)
    if (!LITE || this.full || (this.lightTick++ & 1) === 0) this.buildLight(m, playing, wall, e);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.light, 0, 0, W, H);
    // a crash in a loud part: the whole room flashes (flat: an even wash needs no dither)
    if (playing) {
      const crashes = this.score.drums.pieces.crash, ci = lastAt(crashes, m.t);
      const ago = ci >= 0 ? (m.t - crashes[ci].at) * m.six : Infinity;
      if (ago < 0.3) { ctx.fillStyle = `rgba(255, 240, 220, ${0.18 * (1 - ago / 0.3) * (e / 5)})`; ctx.fillRect(0, 0, W, H); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The light layer, drawn and stepped into dithered levels. */
  private buildLight(m: Moment, playing: boolean, wall: number, e: number) {
    const L = this.light;
    const l = L.getContext('2d', { willReadFrequently: true })!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, L.width, L.height);
    l.setTransform(L.width / W, 0, 0, L.height / H, 0, 0);
    l.globalCompositeOperation = 'lighter';
    const [c1, c2] = LIGHTS[playing && m.section.solo ? 'solo' : m.section.kind] ?? LIGHTS.verse;
    const sway = e >= 4 ? Math.sin((m.beatNo + m.beat) * Math.PI * 0.5) * 12 : 0;
    const bi = lastAt(this.barList, m.t);
    const sinceBar = playing && bi >= 0 ? (m.t - this.barList[bi].at) * m.six : Infinity;
    const punch = e >= 4 && sinceBar < 0.18 ? 0.15 * (1 - sinceBar / 0.18) : 0;

    // the cans: each aimed at the player nearest under it (with many cans, two or three on each player),
    // the lens glowing hot
    const aims = [SPOTS.rhythm, SPOTS.bassist, SPOTS.drummer, SPOTS.singer, SPOTS.lead];
    const { cans, bulbs, neon } = this.cast.lights;
    const share = Math.min(1, 5 / cans.length) ** 0.5;
    if (playing || e > 0) cans.forEach(([cx, cy], i) => {
      const [ax, ay] = aims.reduce((b, p) => (Math.abs(p[0] - cx) < Math.abs(b[0] - cx) ? p : b));
      const target = ax + (cx - ax) * 0.35 + (i % 2 ? sway : -sway) * 0.6;
      const col = i % 2 ? c1 : c2;
      const strength = (playing ? 0.1 + e * 0.035 + punch : 0.06) * share;
      glow(l, cx, cy + 1, 5, 4, col, playing ? 0.5 + e * 0.08 + punch * 2 : 0.25);
      glow(l, cx, cy + 1, 2, 2, '#fff4e0', playing ? 0.6 : 0.3);
      const g = l.createLinearGradient(0, cy, 0, ay);
      // (bright at the lamp, gone by the time it reaches the band, as in Paul's reference)
      g.addColorStop(0, hexA(col, strength * 1.4));
      g.addColorStop(0.55, hexA(col, strength * 0.5));
      g.addColorStop(1, hexA(col, 0));
      l.fillStyle = g;
      l.beginPath();
      l.moveTo(cx - 3, cy); l.lineTo(cx + 3, cy); l.lineTo(target + 18, ay); l.lineTo(target - 18, ay);
      l.fill();
      // a pool of light on the boards
      glow(l, target, ay - 1, 24, 6, col, strength * 1.2);
    });
    // the string lights twinkle, each at its own pace
    bulbs.forEach(([bx, by], i) => glow(l, bx, by, 7, 7, '#ffcc70', 0.32 + 0.14 * Math.sin(wall * (1.3 + (i % 5) * 0.4) + i)));
    // the neon glows; once in a while a sign stutters
    neon.forEach((n, i) => {
      const flick = Math.floor(wall * 9 + i * 13) % 53 < 2;
      if (!flick) glow(l, n.x + n.w / 2, n.y + n.h / 2, n.w / 2 + 10, n.h / 2 + 10, n.color, 0.36);
    });
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    // step the light into six levels, dithered between them
    const img = l.getImageData(0, 0, L.width, L.height), d = img.data;
    for (let y = 0, w = L.width, row = 0; y < L.height; y++, row = (y & 3) * 4) {
      for (let x = 0, i = y * w * 4 + 3; x < w; x++, i += 4) if (d[i]) d[i] = LIGHT_LUT[(d[i] << 4) | (row + (x & 3))];
    }
    l.putImageData(img, 0, 0);
  }
}

/** Rim light colours: from above (warm orange), from the left (orange), from the right (red). */
const RIM_TOP = [255, 128, 80], RIM_LEFT = [255, 150, 70], RIM_RIGHT = [255, 60, 80];

/**
 * Light a layer the way the final reference lights the band: each figure darkened toward a deep red
 * (`dark`, 0-1), and its edges that face the lights glowing (`rim`, 0-1): the top edge and the first
 * pixel in from it, the sides, a touch from below. The dark outline pixels of the sprites are what take
 * the glow, so it reads as light catching the edge.
 */
export function rimLight(c: CanvasRenderingContext2D, dark: number, rim: number, box?: readonly [number, number, number, number]) {
  // (`box`: where anything is drawn, so only that is read and lit; the rest of the layer is empty)
  const x0 = box ? Math.max(0, Math.floor(box[0])) : 0, y0 = box ? Math.max(0, Math.floor(box[1])) : 0;
  const x1 = box ? Math.min(W, Math.ceil(box[2])) : W, y1 = box ? Math.min(H, Math.ceil(box[3])) : H;
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const img = c.getImageData(x0, y0, w, h), d = img.data;
  // (the mask of what's drawn, with two empty pixels all round: the neighbour checks need no bounds tests)
  const pw = w + 4, size = pw * (h + 4);
  if (rimMask.length < size) rimMask = new Uint8Array(size);
  const A = rimMask;
  A.fill(0, 0, size);
  for (let y = 0; y < h; y++) for (let x = 0, m = (y + 2) * pw + 2, i = y * w * 4 + 3; x < w; x++, m++, i += 4) if (d[i] > 0) A[m] = 1;
  for (let y = 0; y < h; y++) for (let x = 0, m = (y + 2) * pw + 2, o = y * w * 4; x < w; x++, m++, o += 4) {
    if (!A[m]) continue;
    // the body in shadow: toward a deep red-black
    d[o] = d[o] * (1 - dark) + 34 * dark;
    d[o + 1] = d[o + 1] * (1 - dark) + 8 * dark;
    d[o + 2] = d[o + 2] * (1 - dark) + 16 * dark;
    let k = 0, col = RIM_TOP;
    if (!A[m - pw]) k = 1;
    else if (!A[m - 1]) { k = 0.85; col = RIM_LEFT; }
    else if (!A[m + 1]) { k = 0.85; col = RIM_RIGHT; }
    else if (!A[m - 2 * pw]) k = 0.38;
    else if (!A[m - 2]) { k = 0.3; col = RIM_LEFT; }
    else if (!A[m + 2]) { k = 0.3; col = RIM_RIGHT; }
    else if (!A[m + pw]) { k = 0.25; col = RIM_RIGHT; }
    if (!k) continue;
    const a = Math.min(1, k * rim);
    d[o] = d[o] * (1 - a) + col[0] * a;
    d[o + 1] = d[o + 1] * (1 - a) + col[1] * a;
    d[o + 2] = d[o + 2] * (1 - a) + col[2] * a;
  }
  c.putImageData(img, x0, y0);
}
/** The mask rimLight works in (kept between frames). */
let rimMask = new Uint8Array(0);

/** (the vignette and the grain are the same for every song: made once, not for every new band) */
let vignetteMade: HTMLCanvasElement | undefined;
let grainMade: HTMLCanvasElement[] | undefined;
const sharedVignette = () => (vignetteMade ??= makeVignette());
const sharedGrain = () => (grainMade ??= [0, 1, 2, 3].map(makeGrain));

/** The vignette: the picture's edges and corners stepping down into the dark, dithered. */
function makeVignette() {
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d')!, img = c.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - H * 0.45) / (H / 2);
    const v = Math.max(0, Math.min(1, (Math.sqrt(nx * nx * 0.9 + ny * ny * 1.1) - 0.6) / 0.6)) * 0.75;
    const steps = 5, s = v * steps;
    const lvl = Math.floor(s) + (s - Math.floor(s) > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0);
    d[(y * W + x) * 4 + 3] = (Math.min(steps, lvl) / steps) * 255 * 0.75;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** A frame of grain: a scatter of single pixels a touch lighter or darker. */
function makeGrain(seed: number) {
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d')!, img = c.createImageData(W, H), d = img.data;
  let r = 1234567 + seed * 7919;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < W * H; i++) {
    const v = rnd();
    if (v < 0.035) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0; d[i * 4 + 3] = 46; }
    else if (v < 0.055) { d[i * 4] = 255; d[i * 4 + 1] = 200; d[i * 4 + 2] = 180; d[i * 4 + 3] = 20; }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** How many steps of light (the dither fills in between). */
const LEVELS = 6;
/** 4x4 ordered dither thresholds (0-15). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The stepped, dithered alpha for every alpha (0-255) at each of the 16 dither cells (made once: the light's loop is a lookup). */
const LIGHT_LUT = (() => {
  const t = new Uint8ClampedArray(256 * 16);
  for (let a = 0; a < 256; a++) for (let b = 0; b < 16; b++) {
    const v = (a / 255) * LEVELS;
    t[a * 16 + b] = (Math.min(LEVELS, Math.floor(v) + (v - Math.floor(v) > (BAYER[b] + 0.5) / 16 ? 1 : 0)) / LEVELS) * 255;
  }
  return t;
})();

/** A soft oval of light (on the light layer). */
function glow(l: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string, a: number) {
  if (a <= 0) return;
  l.save();
  l.translate(x, y);
  l.scale(1, ry / rx);
  const g = l.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, hexA(col, a));
  g.addColorStop(1, hexA(col, 0));
  l.fillStyle = g;
  l.fillRect(-rx, -rx, rx * 2, rx * 2);
  l.restore();
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease01 = (u: number) => { const k = clamp01(u); return k * k * (3 - 2 * k); };

/** A 1px line on the pixel grid (no smoothing), for effects like a ringing string. */
function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, alpha: number) {
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.abs(x1 - x0)));
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}
function hexA(hex: string, a: number) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;
}

/* ---------------------------------------------------------------- the check view */

/** Fretboards for the three string players and the drum hits, drawn crisp (not pixel art) under the stage. */
export function renderCheck(ctx: CanvasRenderingContext2D, score: Score, t: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink').trim() || '#222', muted = css.getPropertyValue('--muted').trim() || '#888', line = css.getPropertyValue('--line').trim() || '#ccc';
  const accent = css.getPropertyValue('--accent').trim() || '#e8623a';
  const rowH = (h - 10) / 4;
  const board = (y: number, label: string, strings: number, dots: { s: number; f: number; c: string; bend?: boolean }[]) => {
    ctx.fillStyle = muted; ctx.fillText(label, 6, y + rowH / 2);
    const x0 = 70, x1 = w - 10, fw = (x1 - x0) / 16;
    const sy = (s: number) => y + 6 + ((strings - 1 - s) * (rowH - 12)) / (strings - 1);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let s = 0; s < strings; s++) { ctx.beginPath(); ctx.moveTo(x0, sy(s)); ctx.lineTo(x1, sy(s)); ctx.stroke(); }
    for (let f = 0; f <= 16; f++) { ctx.beginPath(); ctx.moveTo(x0 + f * fw, sy(strings - 1)); ctx.lineTo(x0 + f * fw, sy(0)); ctx.lineWidth = f === 1 ? 3 : 1; ctx.stroke(); }
    for (const d of dots) {
      const x = d.f === 0 ? x0 + fw * 0.5 : x0 + (d.f + 0.5) * fw;
      ctx.fillStyle = d.c;
      ctx.beginPath(); ctx.arc(x, sy(d.s), d.f === 0 ? 3 : 4.5, 0, Math.PI * 2);
      if (d.f === 0) { ctx.strokeStyle = d.c; ctx.lineWidth = 1.5; ctx.stroke(); } else ctx.fill();
      if (d.bend) { ctx.beginPath(); ctx.moveTo(x, sy(d.s) - 5); ctx.lineTo(x, sy(d.s) - 10); ctx.strokeStyle = d.c; ctx.lineWidth = 2; ctx.stroke(); }
    }
  };
  const sounding = (notes: Score['bass'], strings: number) => {
    const out: { s: number; f: number; c: string; bend?: boolean }[] = [];
    const i = lastAt(notes, t);
    for (let k = i; k >= 0 && k > i - 4; k--) {
      const n = notes[k];
      if (t < n.end) out.push({ s: Math.min(strings - 1, n.string), f: n.fret, c: k === i ? accent : muted, bend: !!n.bend });
    }
    return out;
  };
  // rhythm: the chord shape held (or a riff's notes)
  const sec = score.sections.find((x) => t >= x.from && t < x.to);
  let rdots = sounding(score.rhythm.notes.filter((n) => !n.onHold), 6);
  if (!sec?.riff) {
    const hold = score.rhythm.holds[lastAt(score.rhythm.holds, t)];
    rdots = hold ? hold.frets.flatMap((f, s) => (f === null ? [] : [{ s, f, c: accent }])) : [];
    if (score.rhythm.out.some(([f, u]) => t >= f && t < u)) rdots = [];
  }
  board(2, 'Rhythm', 6, rdots);
  board(2 + rowH, 'Lead', 6, sounding(score.lead, 6));
  board(2 + rowH * 2, 'Bass', 4, sounding(score.bass, 4));
  // the drums: each piece lights up as it's hit
  const y = 6 + rowH * 3;
  ctx.fillStyle = muted; ctx.fillText('Drums', 6, y + rowH / 2);
  const ps = ['kick', 'snare', 'hat', 'ride', 'crash', 'tom1', 'tom2', 'tom3'] as const;
  const cw = (w - 80) / ps.length;
  ps.forEach((p, k) => {
    const l = score.drums.pieces[p], i = lastAt(l, t);
    const ago = i >= 0 ? (t - l[i].at) * score.six : Infinity;
    const lit = Math.max(0, 1 - ago / 0.15);
    ctx.fillStyle = lit > 0 ? accent : line;
    ctx.globalAlpha = 0.25 + lit * 0.75;
    ctx.fillRect(70 + k * cw, y + 4, cw - 6, rowH - 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = lit > 0.5 ? '#fff' : ink;
    ctx.fillText(p, 74 + k * cw, y + rowH / 2);
  });
}
