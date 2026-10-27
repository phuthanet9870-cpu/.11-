// Exports Willowbrook as a Tiled map (.tmj) using the Batch 001 tileset:
// ground + dual-grid terrain overlays (offset half a tile), decoration,
// walls, above-player, and object layers for props, buildings, collision,
// spawn points, interaction zones and portals.
import { loadGameData } from '../../../src/core/data';
import { compileMap, TILE } from '../../../src/core/mapCompiler';
import type { TileEntry } from './tiles';

export function exportWillowbrookTmj(tiles: TileEntry[]) {
  const data = loadGameData();
  const def = data.maps.get('willowbrook')!;
  const map = compileMap(data, def);
  const W = map.width, H = map.height;
  const gid = (name: string) => { const t = tiles.find((x) => x.name === name); if (!t) throw new Error(`tile ${name}`); return t.id + 1; };
  const idx = (x: number, y: number) => y * W + x;

  const ground = Array.from({ length: W * H }, (_, i) => gid(`grass_${((i % W) * 7 + Math.floor(i / W) * 3) % 4}`));
  const overlay = (ter: string) => {
    const d: number[] = [];
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      const at = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= W || cy >= H ? false : map.ground[idx(cx, cy)] === ter);
      const mask = (at(x - 1, y - 1) ? 1 : 0) | (at(x, y - 1) ? 2 : 0) | (at(x - 1, y) ? 4 : 0) | (at(x, y) ? 8 : 0);
      d.push(mask ? gid(mask === 15 ? (((x * 5 + y * 3) % 3) ? `${ter}_15_v${((x * 5 + y * 3) % 3)}` : `${ter}_15`) : `${ter}_${mask}`) : 0);
    }
    return d;
  };
  const deco = map.deco.map((d, i) => (d === 'flowers' ? gid(`flowers_${i % 3}`) : d === 'tuft' ? gid(`tuft_${i % 2}`) : d === 'crops' ? gid('crops_0') : d === 'pebbles' ? gid('pebbles_0') : 0));
  const walls = map.wall.map((w) => (w === 'thicket' ? gid('thicket') : w === 'fence_h' ? gid('fence_h') : w === 'fence_v' ? gid('fence_v') : 0));
  const above = map.above.map((a) => (a ? gid('canopy_overhang') : 0));

  let oid = 1;
  const tileLayer = (name: string, d: number[], w = W, h = H, off = 0) => ({ type: 'tilelayer', id: oid++, name, width: w, height: h, x: 0, y: 0, offsetx: off, offsety: off, opacity: 1, visible: true, data: d });
  const objLayer = (name: string, objects: unknown[]) => ({ type: 'objectgroup', id: oid++, name, draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
  let objId = 1;
  const rectObj = (name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, unknown> = {}) => ({
    id: objId++, name, type, x: x * TILE, y: y * TILE, width: w * TILE, height: h * TILE, rotation: 0, visible: true,
    properties: Object.entries(props).map(([k, v]) => ({ name: k, type: typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'bool' : 'string', value: v })),
  });

  // Collision: merge horizontal runs of blocked cells.
  const coll: unknown[] = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!map.collision[idx(x, y)]) { x++; continue; }
      const sx = x; while (x < W && map.collision[idx(x, y)]) x++;
      coll.push(rectObj('', 'collision', sx, y, x - sx, 1));
    }
  }
  const layers = [
    tileLayer('Ground', ground),
    ...['dirt', 'path_stone', 'soil'].map((t) => tileLayer(`Ground Overlay: ${t}`, overlay(t), W + 1, H + 1, -TILE / 2)),
    tileLayer('Ground Decoration', deco),
    tileLayer('Walls', walls),
    objLayer('Objects', map.objects.map((o) => rectObj(o.id ?? o.kind, `prop:${o.kind}`, o.x, o.y, o.w, o.h, { blocks: o.blocks }))),
    objLayer('Buildings', map.buildings.map((b) => rectObj(b.style, `building:${b.style}_${b.w}x${b.h}`, b.x, b.y, b.w, b.h, { door: b.door ?? -1 }))),
    tileLayer('Above Player', above),
    objLayer('Collision', coll),
    objLayer('Spawn Points', Object.entries(def.spawnPoints).map(([k, s]) => rectObj(k, 'spawn', s.x, s.y, 1, 1))),
    objLayer('Interaction Zones', [...def.objects.map((o) => rectObj(o.id, 'interact', o.x, o.y, 1, 1, { text: o.interact?.text ?? '' })), ...def.npcs.map((n) => rectObj(n.npcId, 'npc', n.x, n.y, 1, 1))]),
    objLayer('Teleport Portals', def.portals.map((p) => rectObj(p.id, 'portal', p.x, p.y, p.w, p.h, { targetMap: p.targetMap, targetSpawn: p.targetSpawn }))),
  ];
  return {
    type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
    width: W, height: H, tilewidth: TILE, tileheight: TILE, infinite: false, nextlayerid: oid, nextobjectid: objId,
    properties: [{ name: 'mapId', type: 'string', value: def.id }, { name: 'bgm', type: 'string', value: def.bgm }],
    tilesets: [{ firstgid: 1, source: '../../tilesets/willowbrook/willowbrook_ground.tsj' }],
    layers,
  };
}
