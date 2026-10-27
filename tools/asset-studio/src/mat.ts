// Material canvas: draw shapes as material ids, then render them with
// automatic upper-left cel shading and a selective outline.
import { Pixmap, type RGBA } from './pixel';
import type { Ramp } from './palette';

export interface MatOpts { band2?: boolean; flat?: boolean; noLight?: boolean; tone?: 'l' | 'b' | 's' | 'd' }

export class Mat {
  readonly m: Uint8Array;
  private ramps: Ramp[] = [null as unknown as Ramp];
  private opts: MatOpts[] = [{}];
  private ids = new Map<Ramp, number>();
  constructor(readonly w: number, readonly h: number) { this.m = new Uint8Array(w * h); }

  private toneIds = new Map<Ramp, Map<string, number>>();
  id(r: Ramp, o: MatOpts = {}): number {
    if (o.tone) {
      // Same ramp at a fixed tone (highlights / painted details).
      let byTone = this.toneIds.get(r);
      if (!byTone) { byTone = new Map(); this.toneIds.set(r, byTone); }
      let i = byTone.get(o.tone);
      if (i == null) { i = this.ramps.length; this.ramps.push(r); this.opts.push(o); byTone.set(o.tone, i); }
      return i;
    }
    let i = this.ids.get(r);
    if (i == null) { i = this.ramps.length; this.ramps.push(r); this.opts.push(o); this.ids.set(r, i); }
    return i;
  }

  /** Same palette/material table, empty pixels. */
  cloneEmpty(): Mat {
    const c = new Mat(this.w, this.h);
    c.ramps = this.ramps; c.opts = this.opts; c.ids = this.ids; c.toneIds = this.toneIds;
    return c;
  }

  at(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.m[y * this.w + x]; }
  set(x: number, y: number, id: number) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.m[y * this.w + x] = id;
  }
  rect(x: number, y: number, w: number, h: number, id: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, id); }
  ellipse(cx: number, cy: number, rx: number, ry: number, id: number) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) this.set(x, y, id);
    }
  }
  /** Thick segment (capsule) between two points. */
  limb(x0: number, y0: number, x1: number, y1: number, r: number, id: number) {
    const minX = Math.floor(Math.min(x0, x1) - r - 1), maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1), maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    const vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy || 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / len2));
      const dx = px - (x0 + vx * t), dy = py - (y0 + vy * t);
      if (dx * dx + dy * dy <= r * r) this.set(x, y, id);
    }
  }
  poly(pts: [number, number][], id: number) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const py = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= py && by > py) || (by <= py && ay > py)) xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, id);
    }
  }
  erase(x: number, y: number) { this.set(x, y, 0); }
  line(x0: number, y0: number, x1: number, y1: number, id: number) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, id);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Render with cel shading; returns a pixmap (outline added if requested). */
  render(outline = true): Pixmap {
    const p = new Pixmap(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const id = this.at(x, y);
      if (!id) continue;
      const r = this.ramps[id], o = this.opts[id];
      if (o.tone) { p.set(x, y, r[o.tone]); continue; }
      if (o.flat) { p.set(x, y, r.b); continue; }
      const up = this.at(x, y - 1) !== id, left = this.at(x - 1, y) !== id;
      const down = this.at(x, y + 1) !== id, right = this.at(x + 1, y) !== id;
      let c: RGBA = r.b;
      if (down && right) c = r.d;
      else if (down || right) c = r.s;
      else if ((up || left) && !o.noLight) c = r.l;
      else if (o.band2 && (this.at(x + 2, y) !== id || this.at(x, y + 2) !== id)) c = r.s;
      p.set(x, y, c);
    }
    if (outline) {
      // Selective outline: each transparent neighbour takes the darkest tone of the touching material.
      const marks: [number, number, RGBA][] = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.at(x, y)) continue;
        const n = this.at(x, y + 1) || this.at(x, y - 1) || this.at(x - 1, y) || this.at(x + 1, y);
        if (n) marks.push([x, y, this.ramps[n].o]);
      }
      for (const [x, y, c] of marks) p.set(x, y, c);
    }
    return p;
  }
}

/** Convenience: draw parts on separate Mats (so each part gets its own line art) and stack them. */
export class PartStack {
  readonly out: Pixmap;
  constructor(readonly w: number, readonly h: number) { this.out = new Pixmap(w, h); }
  part(draw: (m: Mat) => void, outline = true): Pixmap {
    const m = new Mat(this.w, this.h);
    draw(m);
    const p = m.render(outline);
    this.out.blit(p, 0, 0);
    return p;
  }
  pix(draw: (p: Pixmap) => void) { draw(this.out); }
}
