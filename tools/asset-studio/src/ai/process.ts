// Turns a large AI-generated sprite-sheet image into game-ready pixel frames:
// background removal → sprite detection (grid) → area-average downscale to the
// frame size → binary alpha → shared k-means palette → selective outline →
// baseline / centre alignment. Every step is deterministic.
import { Pixmap, Sheet } from '../pixel';

export interface ProcessOpts {
  rows: number; cols: number; fw: number; fh: number;
  baseline: number | null;   // feet row (characters/monsters) or null to centre (VFX)
  targetH: number;           // sprite height (before outline) for the reference pose
  colours: number;
  outline: boolean;
  mirrorRight: boolean;      // build the right-facing row by mirroring the left row
  centre?: boolean;          // ignore in-row horizontal drift (idle loops)
}

interface Box { x0: number; y0: number; x1: number; y1: number; area: number }

/** Clears an opaque, flat background by flood-filling from the borders (no-op when already transparent). */
export function removeBackground(p: Pixmap) {
  const corners = [[0, 0], [p.w - 1, 0], [0, p.h - 1], [p.w - 1, p.h - 1]];
  if (corners.every(([x, y]) => p.alpha(x, y) < 128)) return;
  const [r0, g0, b0] = p.get(0, 0);
  const seen = new Uint8Array(p.w * p.h), stack: number[] = [];
  for (let x = 0; x < p.w; x++) stack.push(x, (p.h - 1) * p.w + x);
  for (let y = 0; y < p.h; y++) stack.push(y * p.w, y * p.w + p.w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const d = i * 4, dr = p.data[d] - r0, dg = p.data[d + 1] - g0, db = p.data[d + 2] - b0;
    if (dr * dr + dg * dg + db * db > 40 * 40) continue;
    p.data[d + 3] = 0;
    const x = i % p.w, y = (i / p.w) | 0;
    if (x > 0) stack.push(i - 1); if (x < p.w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - p.w); if (y < p.h - 1) stack.push(i + p.w);
  }
}

function components(p: Pixmap): Box[] {
  const lab = new Int32Array(p.w * p.h).fill(-1), boxes: Box[] = [];
  for (let s = 0; s < p.w * p.h; s++) {
    if (lab[s] >= 0 || p.data[s * 4 + 3] < 128) continue;
    const b: Box = { x0: p.w, y0: p.h, x1: -1, y1: -1, area: 0 }, stack = [s];
    lab[s] = boxes.length;
    while (stack.length) {
      const i = stack.pop()!, x = i % p.w, y = (i / p.w) | 0;
      b.area++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
        const j = ny * p.w + nx;
        if (lab[j] < 0 && p.data[j * 4 + 3] >= 128) { lab[j] = boxes.length; stack.push(j); }
      }
    }
    boxes.push(b);
  }
  return boxes;
}

const gap = (a: Box, b: Box) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)) + Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
const merge = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area });

/**
 * Finds rows × cols sprite boxes. Uses connected components when they resolve
 * into exactly rows × cols sprites (small debris is merged into the nearest
 * sprite); otherwise falls back to an equal grid. Returns the boxes row-major
 * and which method was used.
 */
export function findSprites(p: Pixmap, rows: number, cols: number): { boxes: Box[][]; method: 'components' | 'grid' } {
  const comps = components(p).sort((a, b) => b.area - a.area);
  const n = rows * cols;
  if (comps.length >= n) {
    const big = comps.slice(0, n).map((b) => ({ ...b }));
    const minMain = big[n - 1].area;
    const rest = comps.slice(n);
    if (rest.every((r) => r.area < minMain * 0.6)) {
      for (const r of rest) {
        let best = 0, bd = Infinity;
        big.forEach((b, i) => { const d = gap(b, r); if (d < bd) { bd = d; best = i; } });
        if (bd < 24) big[best] = merge(big[best], r);
      }
      // Group into rows by vertical centre, then sort each row left→right.
      const byY = [...big].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
      const grouped: Box[][] = [];
      for (let r = 0; r < rows; r++) grouped.push(byY.slice(r * cols, (r + 1) * cols).sort((a, b) => a.x0 - b.x0));
      const ok = grouped.every((row, r) => r === 0 || Math.min(...row.map((b) => b.y0)) > Math.max(...grouped[r - 1].map((b) => (b.y0 + b.y1) / 2)));
      if (ok) return { boxes: grouped, method: 'components' };
    }
  }
  const cw = p.w / cols, ch = p.h / rows, boxes: Box[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Box[] = [];
    for (let c = 0; c < cols; c++) {
      const b: Box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, area: 0 };
      for (let y = Math.floor(r * ch); y < Math.floor((r + 1) * ch); y++) for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) {
        if (p.data[(y * p.w + x) * 4 + 3] < 128) continue;
        b.area++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      }
      row.push(b.area ? b : { x0: Math.floor(c * cw), y0: Math.floor(r * ch), x1: Math.floor(c * cw), y1: Math.floor(r * ch), area: 0 });
    }
    boxes.push(row);
  }
  return { boxes, method: 'grid' };
}

/** Area-average downscale of a source region by factor `s` (dst px per src px), alpha thresholded at 50%. */
function downscale(p: Pixmap, b: Box, s: number): Pixmap {
  const w = Math.max(1, Math.round((b.x1 - b.x0 + 1) * s)), h = Math.max(1, Math.round((b.y1 - b.y0 + 1) * s));
  const out = new Pixmap(w, h), inv = 1 / s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx0 = b.x0 + x * inv, sy0 = b.y0 + y * inv;
    let r = 0, g = 0, bl = 0, a = 0, n = 0;
    for (let yy = Math.floor(sy0); yy < Math.ceil(sy0 + inv); yy++) for (let xx = Math.floor(sx0); xx < Math.ceil(sx0 + inv); xx++) {
      if (xx < 0 || yy < 0 || xx >= p.w || yy >= p.h) { n++; continue; }
      const i = (yy * p.w + xx) * 4, al = p.data[i + 3] / 255;
      r += p.data[i] * al; g += p.data[i + 1] * al; bl += p.data[i + 2] * al; a += al; n++;
    }
    if (a / n >= 0.5) out.set(x, y, [Math.round(r / a), Math.round(g / a), Math.round(bl / a), 255]);
  }
  return out;
}

/** Deterministic k-means palette over all opaque pixels of the frames; remaps in place. */
export function quantize(frames: Pixmap[], k: number) {
  const pts: number[][] = [];
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3]) pts.push([f.data[i], f.data[i + 1], f.data[i + 2]]);
  if (!pts.length) return;
  // Init: evenly spaced picks along luminance order.
  const sorted = [...pts].sort((a, b) => (a[0] * 3 + a[1] * 6 + a[2]) - (b[0] * 3 + b[1] * 6 + b[2]));
  let cent = Array.from({ length: Math.min(k, sorted.length) }, (_, i) => [...sorted[Math.floor((i + 0.5) * sorted.length / Math.min(k, sorted.length))]]);
  const step = Math.max(1, Math.floor(pts.length / 20000));
  const nearest = (p: number[]) => { let bi = 0, bd = Infinity; cent.forEach((c, i) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  for (let it = 0; it < 12; it++) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i += step) { const c = nearest(pts[i]); acc[c][0] += pts[i][0]; acc[c][1] += pts[i][1]; acc[c][2] += pts[i][2]; acc[c][3]++; }
    cent = cent.map((c, i) => (acc[i][3] ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : c));
  }
  cent = cent.map((c) => c.map(Math.round));
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) {
    if (!f.data[i + 3]) continue;
    const c = cent[nearest([f.data[i], f.data[i + 1], f.data[i + 2]])];
    f.data[i] = c[0]; f.data[i + 1] = c[1]; f.data[i + 2] = c[2];
  }
}

function trim(p: Pixmap): Pixmap {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alpha(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? p : p.crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/** 1-px selective outline: transparent pixels next to the sprite take a darkened copy of their neighbour. */
function outline(p: Pixmap): Pixmap {
  const out = new Pixmap(p.w + 2, p.h + 2);
  out.blit(p, 1, 1);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    // Neighbours are read from the source sprite, never from outline pixels already drawn.
    if (p.alpha(x - 1, y - 1)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!p.alpha(x - 1 + dx, y - 1 + dy)) continue;
      const [r, g, b] = p.get(x - 1 + dx, y - 1 + dy);
      if (r * 0.3 + g * 0.59 + b * 0.11 < 60) { out.set(x, y, [r, g, b, 255]); break; }
      out.set(x, y, [Math.round(r * 0.35), Math.round(g * 0.3), Math.round(b * 0.35 + 12), 255]);
      break;
    }
  }
  return out;
}

export interface Processed { sheet: Sheet; method: 'components' | 'grid'; scale: number; notes: string[] }

export function processSheet(src: Pixmap, o: ProcessOpts): Processed {
  const notes: string[] = [];
  removeBackground(src);
  const { boxes, method } = findSprites(src, o.rows, o.cols);
  if (method === 'grid') notes.push('sprites did not separate cleanly; used an equal grid');
  const heights = boxes.flat().filter((b) => b.area).map((b) => b.y1 - b.y0 + 1).sort((a, b) => a - b);
  const widths = boxes.flat().filter((b) => b.area).map((b) => b.x1 - b.x0 + 1);
  const pad = o.outline ? 2 : 0;
  // Scale from a typical (75th percentile) height, but never wider/taller than the cell allows.
  const refH = heights[Math.floor(heights.length * 0.75)] ?? 1;
  let s = o.targetH / refH;
  s = Math.min(s, (o.fw - 2 - pad) / Math.max(...widths, 1), ((o.baseline ?? o.fh - 1) - 1 - pad) / Math.max(...heights, 1));
  let frames = boxes.map((row) => row.map((b) => (b.area ? downscale(src, b, s) : new Pixmap(1, 1))));
  // Trim to the drawn pixels so the bottom pixel row really sits on the baseline.
  frames = frames.map((row) => row.map(trim));
  if (o.outline) frames = frames.map((row) => row.map(outline));
  quantize(frames.flat(), o.colours); // after the outline, so outline colours count toward the budget
  const sheet = new Sheet(o.fw, o.fh, o.cols, o.rows);
  frames.forEach((row, r) => {
    // Keep in-row motion: a sprite's offset from the straight line fitted through the
    // row's sprite centres (the cell spacing) is its own movement within the frame.
    const centres = boxes[r].map((b) => (b.x0 + b.x1) / 2), n = centres.length;
    const mc = (n - 1) / 2, mx = centres.reduce((a, c) => a + c, 0) / n;
    const slope = n > 1 ? centres.reduce((a, c, i) => a + (i - mc) * (c - mx), 0) / centres.reduce((a, _, i) => a + (i - mc) ** 2, 0) : 0;
    row.forEach((f, c) => {
      const motion = o.centre ? 0 : centres[c] - (mx + slope * (c - mc));
      let x = Math.round(o.fw / 2 - f.w / 2 + motion * s);
      x = Math.max(1, Math.min(o.fw - 1 - f.w, x));
      let y = o.baseline === null ? Math.round(o.fh / 2 - f.h / 2) : o.baseline - f.h + 1;
      y = Math.max(1, y);
      const cell = new Pixmap(o.fw, o.fh);
      cell.blit(f, x, y);
      sheet.put(c, r, cell);
    });
  });
  if (o.mirrorRight && o.rows === 4) {
    for (let c = 0; c < o.cols; c++) {
      const L = sheet.cell(c, 1), m = new Pixmap(o.fw, o.fh);
      for (let y = 0; y < o.fh; y++) for (let x = 0; x < o.fw; x++) sheet.pix.clear(c * o.fw + x, 2 * o.fh + y);
      for (let y = 0; y < o.fh; y++) for (let x = 0; x < o.fw; x++) { const px = L.get(x, y); if (px[3]) m.set(o.fw - 1 - x, y, px); }
      sheet.put(c, 2, m);
    }
    notes.push('right row = mirrored left row');
  }
  return { sheet, method, scale: s, notes };
}
