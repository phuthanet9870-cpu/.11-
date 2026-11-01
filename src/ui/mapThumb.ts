// Small picture of a map (ground, walls, water, buildings) in its tile set's colours — the same
// look as the minimap — for map pickers.
import type { GameData } from '../core/data';
import { groundBase, type CompiledMap } from '../core/mapCompiler';

export function mapThumbnail(data: GameData, map: CompiledMap, size = 56): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const pal = data.tilesets.get(map.def.tileset)?.palette ?? {};
  const k = Math.min(size / map.width, size / map.height), ox = (size - map.width * k) / 2, oy = (size - map.height * k) / 2;
  ctx.fillStyle = '#120e16'; ctx.fillRect(0, 0, size, size);
  const step = Math.max(1, Math.floor(1 / k));
  for (let y = 0; y < map.height; y += step) for (let x = 0; x < map.width; x += step) {
    const i = y * map.width + x, g = groundBase(map.ground[i]);
    let col = g === 'water' ? pal.water1 : g === 'dirt' || g === 'soil' ? pal.dirt2 : g === 'path_stone' ? pal.stone2 : g === 'ruin_floor' ? (pal.ruin2 ?? pal.stone2) : g === 'sand' ? pal.sand1 : pal.grass3;
    if (map.collision[i]) col = map.wall[i] === 'thicket' ? pal.thicket2 : map.wall[i] === 'ruin_wall' ? (pal.thicket1 ?? '#4a3a2a') : '#4a3a2a';
    ctx.fillStyle = col ?? '#3a5a3a';
    ctx.fillRect(Math.floor(ox + x * k), Math.floor(oy + y * k), Math.ceil(k * step), Math.ceil(k * step));
  }
  for (const b of map.buildings) { ctx.fillStyle = '#8a4a3a'; ctx.fillRect(ox + b.x * k, oy + b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k)); }
  ctx.fillStyle = '#7fd6ff';
  for (const p of map.def.portals) ctx.fillRect(Math.floor(ox + p.x * k) - 1, Math.floor(oy + p.y * k) - 1, 3, 3);
  return c;
}
