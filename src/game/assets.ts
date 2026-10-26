// Asset registry with replacement support.
// Every texture the game uses has a key (see docs/ASSET_PIPELINE.md). At boot
// the manifest (public/assets/asset-manifest.json) is read: entries with a
// `file` are loaded from disk; everything else is generated procedurally.
// Swapping in real artwork is therefore a data change, not a code change.
import Phaser from 'phaser';
import type { GameData } from '../core/data';
import type { CompiledMap } from '../core/mapCompiler';
import type { MonsterDef } from '../core/types';
import { generateCharacterSheet, type CharacterLook } from './art/characterSprite';
import { generateMonsterSheet } from './art/monsterSprite';
import { paintAboveLayer, paintBuilding, paintGroundLayer, paintObject, paintWallLayer } from './art/mapPainter';
import { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_SHEET_COLS, MON_SHEET_COLS } from './art/spriteMeta';
import { hashString } from '../core/rng';
import { makeCanvas, ellipse } from './art/canvas';
import { itemIconCanvas } from './art/icons';
import { setFileOverrides } from './assetOverrides';
import type { ItemDef } from '../core/types';

export interface ManifestEntry {
  key: string;
  type: 'spritesheet' | 'image';
  source: 'procedural' | 'file';
  file?: string;
  frameWidth?: number;
  frameHeight?: number;
  rows?: string[];
  animations?: Record<string, { start: number; count: number; frameMs: number; loop: boolean }>;
  pivot?: { x: number; y: number };
  collisionBox?: { w: number; h: number };
  placeholder?: boolean;
  notes?: string;
}

export interface AssetManifest { version: number; namingConvention: Record<string, string>; entries: ManifestEntry[] }

let manifest: AssetManifest = { version: 1, namingConvention: {}, entries: [] };
const fileEntries = new Map<string, ManifestEntry>();

export function setManifest(m: AssetManifest) {
  manifest = m;
  fileEntries.clear();
  for (const e of m.entries) if (e.source === 'file' && e.file) fileEntries.set(e.key, e);
  setFileOverrides([...fileEntries.values()].map((e) => ({ key: e.key, file: e.file! })));
}
export function getManifest() { return manifest; }

/** Queue file-based replacements into the Phaser loader. */
export function queueFileAssets(scene: Phaser.Scene) {
  for (const e of fileEntries.values()) {
    if (e.type === 'spritesheet') scene.load.spritesheet(e.key, `assets/${e.file}`, { frameWidth: e.frameWidth!, frameHeight: e.frameHeight! });
    else scene.load.image(e.key, `assets/${e.file}`);
  }
}

function addCanvasSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, fw: number, fh: number, cols: number, rows: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
  return tex;
}

export function lookKey(look: CharacterLook): string {
  return `chr_${hashString(JSON.stringify(look)).toString(36)}`;
}

/** Character sheet (player or NPC). Real art: key `npc_<id>` in the manifest. */
export function ensureCharacterTexture(scene: Phaser.Scene, look: CharacterLook, overrideKey?: string): string {
  if (overrideKey && scene.textures.exists(overrideKey) && fileEntries.has(overrideKey)) return overrideKey;
  const key = lookKey(look);
  if (!scene.textures.exists(key)) {
    addCanvasSheet(scene, key, generateCharacterSheet(look), CHAR_FRAME_W, CHAR_FRAME_H, CHAR_SHEET_COLS, CHAR_DIRECTIONS.length);
  }
  return key;
}

export function ensureMonsterTexture(scene: Phaser.Scene, def: MonsterDef): string {
  const key = `mon_${def.id}`;
  if (scene.textures.exists(key)) return key;
  addCanvasSheet(scene, key, generateMonsterSheet(def), def.art.w, def.art.h, MON_SHEET_COLS, 1);
  return key;
}

export interface MapTextures { ground: string; walls: string; above: string; objects: Map<string, string>; buildings: string[] }

/** Builds (or loads replacement art for) all layer images of a map. */
export function ensureMapTextures(scene: Phaser.Scene, data: GameData, map: CompiledMap): MapTextures {
  const id = map.def.id;
  const pal = data.tilesets.get(map.def.tileset)!.palette;
  const k = (s: string) => `map_${id}_${s}`;
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
    return key;
  };
  const ground = add(k('ground'), () => paintGroundLayer(map, pal));
  const walls = add(k('walls'), () => paintWallLayer(map, pal));
  const above = add(k('above'), () => paintAboveLayer(map, pal));
  const objects = new Map<string, string>();
  for (const o of map.objects) {
    const kind = data.objectKinds.get(o.kind)!;
    const variant = kind.id.startsWith('tree') ? (o.x * 7 + o.y * 13) % 3 : 0;
    const key = `obj_${map.def.tileset}_${o.kind}_${variant}`;
    add(key, () => paintObject(kind, pal, 1000 + variant * 77 + hashString(o.kind)));
    objects.set(o.uid, key);
  }
  const buildings = map.buildings.map((b, i) => add(k(`bld${i}`), () => paintBuilding(b)));
  return { ground, walls, above, objects, buildings };
}

/** Small shared FX textures. */
export function ensureFxTextures(scene: Phaser.Scene) {
  const soft = (key: string, r: number) => {
    if (scene.textures.exists(key)) return;
    const { canvas, ctx } = makeCanvas(r * 2, r * 2);
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r * 2, r * 2);
    scene.textures.addCanvas(key, canvas);
  };
  soft('fx_dot', 8);
  soft('fx_glow', 32);
  if (!scene.textures.exists('fx_spark')) {
    const { canvas, ctx } = makeCanvas(8, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(3, 0, 2, 8); ctx.fillRect(0, 3, 8, 2);
    scene.textures.addCanvas('fx_spark', canvas);
  }
  if (!scene.textures.exists('fx_arrow')) {
    const { canvas, ctx } = makeCanvas(20, 4);
    ctx.fillStyle = '#7a5634'; ctx.fillRect(2, 1, 14, 2); ctx.fillStyle = '#d8dde8'; ctx.fillRect(16, 0, 4, 4); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, 3, 4);
    scene.textures.addCanvas('fx_arrow', canvas);
  }
  if (!scene.textures.exists('fx_item')) {
    const { canvas, ctx } = makeCanvas(16, 16);
    ellipse(ctx, 8, 8, 6, 6, '#ffffff');
    scene.textures.addCanvas('fx_item', canvas);
  }
}

export function ensureItemTexture(scene: Phaser.Scene, def: ItemDef): string {
  const key = `icon_item_${def.id}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, itemIconCanvas(def));
  return key;
}
