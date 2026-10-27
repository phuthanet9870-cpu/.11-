import { writeFileSync } from 'node:fs';
import { buildWillowbrookTileset, T } from './tiles';
import { buildWillowbrookProps, building, WILLOWBROOK_BUILDINGS } from './props';
import { Pixmap } from './pixel';
export function main() {
  const ts = buildWillowbrookTileset();
  writeFileSync('/tmp/claude-0/tileset.png', ts.image.scale(2).toPNG());
  // seam test: 12x8 patch, dirt path cross + cobble plaza via dual grid
  const W = 14, H = 10;
  const terr = (x: number, y: number) => (y >= 4 && y <= 5) || (x >= 6 && x <= 7) ? 'dirt' : (x >= 9 && x <= 12 && y >= 1 && y <= 3) ? 'path_stone' : (x <= 2 && y >= 7) ? 'soil' : 'grass';
  const out = new Pixmap(W * T, H * T);
  const tileById = (name: string) => ts.tiles.find((t) => t.name === name)!.id;
  const blitTile = (id: number, dx: number, dy: number) => out.blit(ts.image, dx, dy, (id % ts.columns) * T, Math.floor(id / ts.columns) * T, T, T);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) blitTile(tileById(`grass_${(x * 7 + y * 3) % 4}`), x * T, y * T);
  for (const ter of ['dirt', 'soil', 'path_stone']) for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const c = [terr(x, y), terr(x + 1, y), terr(x, y + 1), terr(x + 1, y + 1)];
    let mask = 0; c.forEach((v, i) => { if (v === ter) mask |= 1 << i; });
    if (!mask) continue;
    blitTile(tileById(`${ter}_${mask}`), x * T + 16, y * T + 16);
  }
  const props = buildWillowbrookProps();
  let px = 4;
  for (const p of props) { out.blit(p.pix, px, H * T - p.pix.h - 2); px += p.pix.w + 2; if (px > W * T - 80) break; }
  writeFileSync('/tmp/claude-0/seam.png', out.scale(2).toPNG());
  const bs = WILLOWBROOK_BUILDINGS.map((b) => building(b.style, b.w, b.h, b.door));
  const bw = bs.reduce((s, b) => s + b.pix.w + 4, 0), bh = Math.max(...bs.map((b) => b.pix.h));
  const bo = new Pixmap(bw, bh); bo.rect(0, 0, bw, bh, [92, 110, 84, 255]);
  let bx = 0; for (const b of bs) { bo.blit(b.pix, bx, bh - b.pix.h); bx += b.pix.w + 4; }
  writeFileSync('/tmp/claude-0/buildings.png', bo.toPNG());
  const po = new Pixmap(props.reduce((s, b) => s + b.pix.w + 4, 0), 100); po.rect(0, 0, po.w, po.h, [92, 110, 84, 255]);
  let ox = 0; for (const p of props) { po.blit(p.pix, ox, 100 - p.pix.h); ox += p.pix.w + 4; }
  writeFileSync('/tmp/claude-0/props.png', po.scale(2).toPNG());
}
