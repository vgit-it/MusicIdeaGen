// A player's sprite sheet (docs/BAND-VIEW.md): one PNG and a JSON of frames, each frame
// [x, y, w, h, originX, originY] on the sheet. Every frame is drawn in the player's space (feet at the
// origin), so parts stack by drawing them all at the player's spot.

import type { StanceGeo } from './moves';

export interface NeckGeo { bridge: [number, number]; nut: [number, number]; strings: number; spacing: number; frets: number; pick: [number, number] }

export interface Atlas {
  /** (a canvas when the player was dressed from the wardrobe, src/band/dress.ts) */
  img: HTMLImageElement | HTMLCanvasElement;
  frames: Record<string, number[]>;
  geo: { neck?: NeckGeo; acc?: string[]; skin?: string; skinDark?: string; poses?: Record<string, [number, number]>; kit?: Record<string, [number, number]>; lift?: number; mic?: [number, number]; moves?: string; stance?: StanceGeo };
}

export async function loadAtlas(base: string, name: string): Promise<Atlas> {
  const json = await (await fetch(`${base}${name}.json`)).json();
  const img = await loadImage(`${base}${json.image}`);
  return { img, frames: json.frames, geo: json.geo };
}

/** Draw a frame with its origin at (x, y). Missing frames are skipped (an artist may leave some out). */
export function draw(ctx: CanvasRenderingContext2D, a: Atlas, name: string, x: number, y: number, alpha = 1) {
  const f = a.frames[name];
  if (!f) return;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(a.img, f[0], f[1], f[2], f[3], Math.round(x - f[4]), Math.round(y - f[5]), f[2], f[3]);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** A point on the neck at a fret (fractions too; 0 the nut) and string (0 the lowest), in the player's space. */
export function onNeck(n: NeckGeo, fret: number, string: number): [number, number] {
  const p = 1 - 2 ** (-fret / 12);
  const x = n.nut[0] + (n.bridge[0] - n.nut[0]) * p, y = n.nut[1] + (n.bridge[1] - n.nut[1]) * p;
  return [x, y + (string - (n.strings - 1) / 2) * n.spacing];
}

/** An image, loaded (a load event, not decode(): decode() waits forever in a hidden tab). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}
