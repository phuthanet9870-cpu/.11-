// Pixel-perfect raster used by the asset studio. Every write is a whole
// pixel with alpha 0 or 255 (except where an effect asks for translucency),
// so exported art never contains accidental anti-aliasing.
import { deflateSync } from 'node:zlib';

export type RGBA = [number, number, number, number];

export function hex(c: string, a = 255): RGBA {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : a];
}

export class Pixmap {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h * 4);
  }

  get(x: number, y: number): RGBA {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  set(x: number, y: number, c: RGBA | null) {
    x = Math.round(x); y = Math.round(y);
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (c[3] === 255 || this.data[i + 3] === 0) {
      this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3];
      return;
    }
    // Source-over for translucent effect pixels.
    const a = c[3] / 255, b = this.data[i + 3] / 255, out = a + b * (1 - a);
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round((c[k] * a + this.data[i + k] * b * (1 - a)) / out);
    this.data[i + 3] = Math.round(out * 255);
  }

  clear(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA | null) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Filled ellipse with integer edges (no anti-aliasing). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / (rx + 0.01), dy = (y + 0.5 - cy) / (ry + 0.01);
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  /** Bresenham line, `thick` square brush. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA | null, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const off = Math.floor((thick - 1) / 2);
    for (;;) {
      this.rect(x0 - off, y0 - off, thick, thick, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Draws an ASCII template; each char maps through `pal` (missing/'.' = skip). */
  stamp(x0: number, y0: number, rows: string[], pal: Record<string, RGBA | null>, flipX = false) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c === undefined) throw new Error(`stamp: no colour for '${ch}'`);
        this.set(x0 + (flipX ? w - 1 - x : x), y0 + y, c);
      }
    });
  }

  blit(src: Pixmap, dx: number, dy: number, sx = 0, sy = 0, w = src.w, h = src.h, flipX = false) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((sy + y) * src.w + (sx + (flipX ? w - 1 - x : x))) * 4;
      if (src.data[i + 3] === 0) continue;
      this.set(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
    }
  }

  /** 1px outline around opaque pixels (only on transparent neighbours). */
  outline(c: RGBA, x0 = 0, y0 = 0, w = this.w, h = this.h, diagonal = false) {
    const marks: [number, number][] = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (this.alpha(x, y)) continue;
      const n = this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1) ||
        (diagonal && (this.alpha(x - 1, y - 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1) || this.alpha(x + 1, y + 1)));
      if (n && x >= x0 && y >= y0 && x < x0 + w && y < y0 + h) marks.push([x, y]);
    }
    for (const [x, y] of marks) this.set(x, y, c);
  }

  /** Replace exact colours (palette swap). */
  recolor(map: Map<string, RGBA>) {
    for (let i = 0; i < this.data.length; i += 4) {
      if (!this.data[i + 3]) continue;
      const k = `${this.data[i]},${this.data[i + 1]},${this.data[i + 2]}`;
      const to = map.get(k);
      if (to) { this.data[i] = to[0]; this.data[i + 1] = to[1]; this.data[i + 2] = to[2]; }
    }
  }

  crop(x: number, y: number, w: number, h: number): Pixmap {
    const p = new Pixmap(w, h);
    p.blit(this, 0, 0, x, y, w, h);
    return p;
  }

  scale(n: number): Pixmap {
    const p = new Pixmap(this.w * n, this.h * n);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const si = (Math.floor(y / n) * this.w + Math.floor(x / n)) * 4, di = (y * p.w + x) * 4;
      p.data[di] = this.data[si]; p.data[di + 1] = this.data[si + 1]; p.data[di + 2] = this.data[si + 2]; p.data[di + 3] = this.data[si + 3];
    }
    return p;
  }

  /** Nearest-neighbour rotation around (cx,cy) — used for pre-rotated weapon frames. */
  rotated(angle: number, size: number): Pixmap {
    const p = new Pixmap(size, size);
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const cx = this.w / 2, cy = this.h / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const rx = x + 0.5 - size / 2, ry = y + 0.5 - size / 2;
      const sx = Math.floor(rx * c - ry * s + cx), sy = Math.floor(rx * s + ry * c + cy);
      if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) continue;
      const si = (sy * this.w + sx) * 4;
      if (!this.data[si + 3]) continue;
      const di = (y * size + x) * 4;
      for (let k = 0; k < 4; k++) p.data[di + k] = this.data[si + k];
    }
    return p;
  }

  isEmpty(x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.alpha(i, j)) return false;
    return true;
  }

  toPNG(): Buffer {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.data.buffer, this.data.byteOffset + y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1);
    }
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
      const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb) >>> 0);
      return Buffer.concat([len, tb, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** Deterministic noise for texture variation. */
export function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** A sheet of equal cells: columns = frames, rows = directions. */
export class Sheet {
  readonly pix: Pixmap;
  constructor(readonly fw: number, readonly fh: number, readonly cols: number, readonly rows: number) {
    this.pix = new Pixmap(fw * cols, fh * rows);
  }
  cell(col: number, row: number): Pixmap { return this.pix.crop(col * this.fw, row * this.fh, this.fw, this.fh); }
  put(col: number, row: number, frame: Pixmap) { this.pix.blit(frame, col * this.fw, row * this.fh); }
}
