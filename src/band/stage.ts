// The stage (docs/BAND-VIEW.md): a small pixel canvas (480 x 270) scaled up with sharp pixels. The
// backdrop, the five players back to front, and the lights: colours by section, brighter when louder,
// a flash on crashes, a spotlight on solos. Plus a check view: each player's fretboard and the drums,
// to see the playing is right.

import { type Atlas, draw, loadAtlas } from './atlas';
import { type Actor, type Cmd, type Moment, drummerActor, guitarActor, singerActor } from './actors';
import { type Score, lastAt } from './score';

export const W = 480, H = 270;

export interface Cast { stage: HTMLImageElement; singer: Atlas; rhythm: Atlas; lead: Atlas; bassist: Atlas; drummer: Atlas }

export async function loadCast(base = 'band/'): Promise<Cast> {
  const stage = new Image();
  stage.src = `${base}stage.png`;
  const [singer, rhythm, lead, bassist, drummer] = await Promise.all(['singer', 'rhythm', 'lead', 'bassist', 'drummer'].map((n) => loadAtlas(base, n)));
  await stage.decode();
  return { stage, singer, rhythm, lead, bassist, drummer };
}

/** Where each player stands (their feet), back to front. */
const SPOTS = { drummer: [240, 175], bassist: [168, 202], rhythm: [86, 246], lead: [394, 246], singer: [252, 258] } as const;

/** Light colours per kind of section (two each). */
const LIGHTS: Record<string, [string, string]> = {
  intro: ['#3a6cff', '#7a4cff'], verse: ['#7a4cff', '#3aa0ff'], prechorus: ['#ffb03a', '#ff6a3a'], chorus: ['#ff3a5a', '#ffd23a'],
  interlude: ['#3ad0c0', '#7a4cff'], bridge: ['#3ad0c0', '#3a6cff'], breakdown: ['#2a3aff', '#5a2aff'], solo: ['#ff3ad0', '#ffffff'], outro: ['#ff9a3a', '#7a4cff'],
};

export class Stage {
  private actors: { name: keyof typeof SPOTS; act: Actor }[];
  private beats: { at: number }[];
  constructor(private cast: Cast, private score: Score, private genre: string) {
    this.beats = score.beats.map((at) => ({ at }));
    this.actors = [
      { name: 'drummer', act: drummerActor(cast.drummer, score) },
      { name: 'bassist', act: guitarActor(cast.bassist, score, 'bass', 2) },
      { name: 'rhythm', act: guitarActor(cast.rhythm, score, 'rhythm', 4) },
      { name: 'lead', act: guitarActor(cast.lead, score, 'lead', 5) },
      { name: 'singer', act: singerActor(cast.singer, score) },
    ];
  }

  moment(t: number): Moment {
    const s = this.score;
    const section = s.sections.find((x) => t >= x.from && t < x.to) ?? (t < 0 ? s.sections[0] : s.sections[s.sections.length - 1]);
    const bi = Math.max(0, lastAt(this.beats, t));
    const b0 = s.beats[bi] ?? 0, b1 = s.beats[bi + 1] ?? b0 + 4;
    return { t, six: s.six, section, beat: clamp01((t - b0) / (b1 - b0)), beatNo: bi, heavy: ['metal', 'hardrock', 'altmetal', 'grunge'].includes(this.genre) };
  }

  /** Draw the moment `t` (song steps; below 0: waiting to start). */
  render(ctx: CanvasRenderingContext2D, t: number) {
    const m = this.moment(Math.max(t, 0));
    const playing = t >= 0;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.cast.stage, 0, 0);
    const e = playing ? m.section.energy : 1;
    // the house darker in quiet sections
    ctx.fillStyle = `rgba(6, 4, 14, ${0.5 - e * 0.07})`;
    ctx.fillRect(0, 0, W, H);
    this.beams(ctx, m, playing);
    for (const { name, act } of this.actors) {
      const [x, y] = SPOTS[name];
      const cmds: Cmd[] = playing ? act(m) : act({ ...m, t: -100, section: { ...m.section, energy: 1 } });
      for (const c of cmds) draw(ctx, c.a, c.f, x + c.x, y + c.y, c.alpha);
    }
    // a flash on a crash, a pulse on the downbeat of loud sections
    if (playing) {
      const crashes = this.score.drums.pieces.crash;
      const ci = lastAt(crashes, t);
      const ago = ci >= 0 ? (t - crashes[ci].at) * m.six : Infinity;
      if (ago < 0.3) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 240, 220, ${0.16 * (1 - ago / 0.3) * (e / 5)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  private beams(ctx: CanvasRenderingContext2D, m: Moment, playing: boolean) {
    const [c1, c2] = LIGHTS[m.section.solo ? 'solo' : m.section.kind] ?? LIGHTS.verse;
    const e = playing ? m.section.energy : 1;
    const sway = e >= 4 ? Math.sin((m.beatNo + m.beat) * Math.PI * 0.5) * 18 : 0;
    ctx.globalCompositeOperation = 'lighter';
    const lamps = [40, 106, 172, 238, 304, 370, 436];
    lamps.forEach((lx, i) => {
      const target = lx + (i % 2 ? sway : -sway);
      const g = ctx.createLinearGradient(0, 16, 0, 260);
      const col = i % 2 ? c1 : c2;
      g.addColorStop(0, hexA(col, 0.18 + e * 0.04));
      g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx - 3, 17); ctx.lineTo(lx + 3, 17); ctx.lineTo(target + 28, 262); ctx.lineTo(target - 28, 262);
      ctx.fill();
    });
    // spotlights: the singer while singing, the lead in a solo
    const spot = (x: number, y: number, a: number) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
      g.addColorStop(0, `rgba(255, 245, 225, ${a})`);
      g.addColorStop(1, 'rgba(255, 245, 225, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    };
    if (playing) {
      const sung = this.score.vocal.lines;
      const li = lastAt(sung, m.t);
      if (li >= 0 && m.t < sung[li].end + 1 / m.six) spot(SPOTS.singer[0], SPOTS.singer[1], 0.28);
      if (m.section.solo) spot(SPOTS.lead[0] - 26, SPOTS.lead[1], 0.38);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
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
