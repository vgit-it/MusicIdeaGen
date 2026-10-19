// Reading and writing PNGs in the band's scripts (8-bit, any colour type in; RGBA out).

import { readFileSync } from 'node:fs';
import { unzlibSync, zlibSync } from 'fflate';

export type Image = { w: number; h: number; d: Uint8ClampedArray };


export function decode(path: string): Image {
  const b = readFileSync(path);
  let pos = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  while (pos < b.length) {
    const n = b.readUInt32BE(pos), t = b.toString('latin1', pos + 4, pos + 8), d = b.subarray(pos + 8, pos + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; if (d[12]) throw new Error(`${path}: interlaced PNGs aren't supported (save it without interlacing)`); }
    else if (t === 'PLTE') palette = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    pos += 12 + n;
  }
  if (depth !== 8) throw new Error(`${path}: save it as an 8-bit PNG (it's ${depth}-bit)`);
  const ch = { 6: 4, 2: 3, 0: 1, 4: 2, 3: 1 }[type as 6 | 2 | 0 | 4 | 3];
  if (!ch) throw new Error(`${path}: unsupported PNG colour type ${type}`);
  const raw = unzlibSync(Buffer.concat(idat));
  const stride = w * ch, px = new Uint8Array(h * stride);
  let prev = new Uint8Array(stride), i = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[i++], line = raw.slice(i, i + stride);
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] += a;
      else if (f === 2) line[x] += up;
      else if (f === 3) line[x] += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
    }
    px.set(line, y * stride);
    prev = line;
  }
  const d = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    const s = k * ch;
    if (type === 6) d.set(px.subarray(s, s + 4), k * 4);
    else if (type === 2) { d.set(px.subarray(s, s + 3), k * 4); d[k * 4 + 3] = 255; }
    else if (type === 0 || type === 4) { d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = px[s]; d[k * 4 + 3] = type === 4 ? px[s + 1] : 255; }
    else { const p = px[s]; d.set(palette!.subarray(p * 3, p * 3 + 3), k * 4); d[k * 4 + 3] = trns && p < trns.length ? trns[p] : 255; }
  }
  return { w, h, d };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function encode(img: Image) {
  const raw = new Uint8Array((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) raw.set(img.d.subarray(y * img.w * 4, (y + 1) * img.w * 4), y * (img.w * 4 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8);
    let c = 0xffffffff; for (const v of out.subarray(4, 8 + data.length)) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8);
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]);
}
