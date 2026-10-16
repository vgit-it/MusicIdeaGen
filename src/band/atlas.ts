// A player's sprite sheet (docs/BAND-VIEW.md): one PNG and a JSON of frames, each frame
// [x, y, w, h, originX, originY] on the sheet. Every frame is drawn in the player's space (feet at the
// origin), so parts stack by drawing them all at the player's spot.

export interface NeckGeo { bridge: [number, number]; nut: [number, number]; strings: number; spacing: number; frets: number; pick: [number, number] }

export interface Atlas {
  img: HTMLImageElement;
  frames: Record<string, number[]>;
  geo: { neck?: NeckGeo; poses?: Record<string, [number, number]>; kit?: Record<string, [number, number]>; lift?: number; mic?: [number, number] };
  /** Frets drawn for each grip (and string), for finding the nearest drawn frame. */
  fretsFor: Map<string, number[]>;
}

export async function loadAtlas(base: string, name: string): Promise<Atlas> {
  const json = await (await fetch(`${base}${name}.json`)).json();
  const img = new Image();
  img.src = `${base}${json.image}`;
  await img.decode();
  const fretsFor = new Map<string, number[]>();
  for (const key of Object.keys(json.frames)) {
    const m = /^fret\/(\w+)\/(\d+)(?:\/(\d+))?$/.exec(key);
    if (!m) continue;
    const k = m[3] === undefined ? m[1] : `${m[1]}/${m[3]}`;
    const list = fretsFor.get(k) ?? [];
    list.push(+m[2]);
    fretsFor.set(k, list);
  }
  for (const l of fretsFor.values()) l.sort((a, b) => a - b);
  return { img, frames: json.frames, geo: json.geo, fretsFor };
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

/**
 * The fretting hand's frame for a grip at a fret (and string), and how far to slide it: the nearest
 * drawn fret and string, moved along the neck to the real one (so an artist can draw every 3rd fret).
 */
export function fretFrame(a: Atlas, grip: string, fret: number, string: number): { name: string; dx: number; dy: number } | null {
  const n = a.geo.neck;
  if (!n) return null;
  let key = `${grip}/${string}`;
  let frets = a.fretsFor.get(key);
  let s = string;
  if (!frets) {
    // the nearest string drawn for this grip, or a grip drawn without strings
    const strings = [...a.fretsFor.keys()].filter((k) => k.startsWith(`${grip}/`)).map((k) => +k.split('/')[1]);
    if (strings.length) {
      s = strings.reduce((b, x) => (Math.abs(x - string) < Math.abs(b - string) ? x : b));
      key = `${grip}/${s}`;
      frets = a.fretsFor.get(key);
    } else { key = grip; frets = a.fretsFor.get(grip); }
  }
  if (!frets?.length) return grip === 'single' ? null : fretFrame(a, 'single', fret, string);
  const r = Math.round(fret);
  const near = frets.reduce((b, x) => (Math.abs(x - r) < Math.abs(b - r) ? x : b));
  const name = key.includes('/') ? `fret/${grip}/${near}/${s}` : `fret/${grip}/${near}`;
  const want = onNeck(n, Math.max(fret - 0.35, 0.6), string), got = onNeck(n, Math.max(near - 0.35, 0.6), key.includes('/') ? s : string);
  return { name, dx: want[0] - got[0], dy: want[1] - got[1] };
}
