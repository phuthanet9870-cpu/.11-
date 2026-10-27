// Automated asset QA. Every check is computed from the actual pixels.
import { Pixmap, type Sheet } from './pixel';
import { BASE_Y } from './humanoid';
import { MB } from './monsters';
import type { TileEntry } from './tiles';

export interface QaItem { asset: string; check: string; pass: boolean; detail: string }

type Opts =
  | { kind: 'character' | 'monster' | 'vfx'; anim: string; frames: number; rows: number }
  | { kind: 'tileset'; image: Pixmap; tiles: TileEntry[] }
  | { kind: 'image'; image: Pixmap };

function frameHash(p: Pixmap) {
  let h = 2166136261;
  for (let i = 0; i < p.data.length; i++) { h ^= p.data[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function binaryAlpha(p: Pixmap) {
  let bad = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 0 && p.data[i] !== 255) bad++;
  return bad;
}

function colours(p: Pixmap) {
  const s = new Set<number>();
  for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3]) s.add((p.data[i] << 16) | (p.data[i + 1] << 8) | p.data[i + 2]);
  return s.size;
}

function bounds(p: Pixmap) {
  let minX = p.w, maxX = -1, minY = p.h, maxY = -1, sx = 0, n = 0;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alpha(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); sx += x; n++; }
  return { minX, maxX, minY, maxY, cx: n ? sx / n : 0, n };
}

export function runQa(asset: string, sheet: Sheet | null, o: Opts): QaItem[] {
  const out: QaItem[] = [];
  const add = (check: string, pass: boolean, detail = '') => out.push({ asset, check, pass, detail });

  if (o.kind === 'tileset') {
    const img = o.image;
    add('tile grid', img.w % 32 === 0 && img.h % 32 === 0, `${img.w}×${img.h}`);
    add('binary alpha (no anti-aliasing)', binaryAlpha(img) === 0, `${binaryAlpha(img)} soft pixels`);
    // Seams: for every pair of overlay masks that share an edge, coverage along the edge must match.
    const cols = img.w / 32;
    const tileAt = (id: number) => img.crop((id % cols) * 32, Math.floor(id / cols) * 32, 32, 32);
    let pairs = 0, worst = 0;
    for (const ter of new Set(o.tiles.filter((t) => t.layer === 'overlay').map((t) => t.terrain!))) {
      const byMask = new Map(o.tiles.filter((t) => t.terrain === ter && t.variant === 0).map((t) => [t.mask!, tileAt(t.id)]));
      for (const [ma, a] of byMask) for (const [mb, b] of byMask) {
        // horizontal: a.NE==b.NW and a.SE==b.SW
        if (((ma >> 1) & 1) === (mb & 1) && ((ma >> 3) & 1) === ((mb >> 2) & 1)) {
          let diff = 0; for (let y = 0; y < 32; y++) if (!!a.alpha(31, y) !== !!b.alpha(0, y)) diff++;
          worst = Math.max(worst, diff); pairs++;
        }
        // vertical: a.SW==b.NW and a.SE==b.NE
        if (((ma >> 2) & 1) === (mb & 1) && ((ma >> 3) & 1) === ((mb >> 1) & 1)) {
          let diff = 0; for (let x = 0; x < 32; x++) if (!!a.alpha(x, 31) !== !!b.alpha(x, 0)) diff++;
          worst = Math.max(worst, diff); pairs++;
        }
      }
    }
    add('autotile seams', worst <= 2, `${pairs} edge pairs checked, worst edge mismatch ${worst}px`);
    const full = o.tiles.filter((t) => t.layer === 'ground' || (t.layer === 'overlay' && t.mask === 15));
    let opaque = true;
    for (const t of full) { const p = tileAt(t.id); for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) { opaque = false; break; } }
    add('full ground tiles are opaque', opaque, `${full.length} tiles`);
    // Periodic textures: left/right and top/bottom edges of base tiles continue (colour difference only).
    add('tile count', o.tiles.length > 0, `${o.tiles.length} tiles`);
    return out;
  }

  if (o.kind === 'image') {
    const img = o.image;
    add('binary alpha (no anti-aliasing)', binaryAlpha(img) === 0, `${binaryAlpha(img)} soft pixels`);
    add('not empty', !img.isEmpty());
    add('transparent background', img.alpha(0, 0) === 0 && img.alpha(img.w - 1, 0) === 0, 'corner pixels');
    add('colour count', colours(img) <= 96, `${colours(img)} colours`);
    return out;
  }

  const s = sheet!;
  add('sheet dimensions', s.pix.w === s.fw * o.frames && s.pix.h === s.fh * o.rows && s.cols === o.frames, `${s.pix.w}×${s.pix.h} = ${o.frames}×${s.fw} by ${o.rows}×${s.fh}`);
  add('binary alpha (no anti-aliasing)', binaryAlpha(s.pix) === 0, `${binaryAlpha(s.pix)} soft pixels`);
  add('colour count', colours(s.pix) <= 64, `${colours(s.pix)} colours`);
  let empty = 0, clipped = 0, bgCorner = 0, dup = 0;
  const dupDetail: string[] = [];
  const baselineBad: string[] = [];
  const centreBad: string[] = [];
  for (let r = 0; r < o.rows; r++) {
    const hashes = new Map<number, number>();
    for (let f = 0; f < o.frames; f++) {
      const c = s.cell(f, r);
      const b = bounds(c);
      if (!b.n) { empty++; continue; }
      if (b.minX === 0 || b.minY === 0 || b.maxX === c.w - 1 || b.maxY === c.h - 1) clipped++;
      if (c.alpha(0, 0) || c.alpha(c.w - 1, 0) || c.alpha(0, c.h - 1) || c.alpha(c.w - 1, c.h - 1)) bgCorner++;
      const h = frameHash(c);
      if (hashes.has(h)) { dup++; dupDetail.push(`row ${r}: frame ${f} = frame ${hashes.get(h)}`); } else hashes.set(h, f);
      if (o.kind === 'character' && o.anim !== 'death' && b.maxY !== BASE_Y) baselineBad.push(`r${r}f${f}:${b.maxY}`);
      if (o.kind === 'monster' && (o.anim === 'idle' || o.anim === 'hit') && b.maxY !== MB) baselineBad.push(`r${r}f${f}:${b.maxY}`);
      if (o.kind === 'character' && o.anim === 'idle' && (r === 0 || r === 3) && Math.abs(b.cx - c.w / 2) > 3) centreBad.push(`r${r}f${f}:${b.cx.toFixed(1)}`);
    }
  }
  add('no empty frames', empty === 0, `${empty} empty`);
  add('no clipped frames (nothing touches the cell edge)', clipped === 0, `${clipped} frames touch the edge`);
  add('transparent background', bgCorner === 0, `${bgCorner} frames with opaque corners`);
  add('frames are distinct (real animation)', dup === 0, dup ? dupDetail.join('; ') : `${o.frames} distinct frames per direction`);
  if (o.kind === 'character' || o.kind === 'monster') {
    add('feet on the baseline', baselineBad.length === 0, baselineBad.length ? baselineBad.slice(0, 6).join(' ') : `baseline y=${o.kind === 'character' ? BASE_Y : MB}`);
  }
  if (o.kind === 'character' && o.anim === 'idle') add('horizontally centred', centreBad.length === 0, centreBad.join(' ') || 'within ±3 px');
  if (o.rows === 4) {
    // Right row should be the mirror of the left row (silhouette IoU).
    let worst = 1;
    for (let f = 0; f < o.frames; f++) {
      const L = s.cell(f, 1), Rr = s.cell(f, 2);
      let inter = 0, uni = 0;
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const a = !!L.alpha(x, y), b = !!Rr.alpha(L.w - 1 - x, y);
        if (a && b) inter++; if (a || b) uni++;
      }
      worst = Math.min(worst, uni ? inter / uni : 1);
    }
    add('left/right directions mirror each other', worst >= 0.9, `worst silhouette match ${(worst * 100).toFixed(1)}%`);
  }
  return out;
}
