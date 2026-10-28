// Production artwork made by tools/asset-studio (Batch 001 onward).
// BootScene loads assets/manifests/batch001.json in three stages (manifest →
// metadata JSON → images). Everything here is optional: when a file is
// missing the game keeps using the procedural placeholders in ./art.
import Phaser from 'phaser';
import type { Appearance, Direction } from '../core/types';
import type { CompiledMap } from '../core/mapCompiler';
import { TILE } from '../core/mapCompiler';
import type { Region } from './art/mapPainter';
import { hashString } from '../core/rng';

export interface AnimMeta {
  key: string; image: string; frameWidth: number; frameHeight: number; columns: number; rows: number;
  directions: Direction[]; frameDurationMs: number; repeat: number; origin: { x: number; y: number };
  events: { frame: number; event: string }[];
  layers?: {
    body: Record<string, string>; hairBack: Record<string, string>; hairFront: Record<string, string>;
    weaponUnder: string; weaponOver: string;
  };
}
interface CharMeta { classId: string; origin: { x: number; y: number }; layerOrder: string[]; animations: Record<string, AnimMeta> }
interface MonMeta { id: string; origin: { x: number; y: number }; animations: Record<string, AnimMeta> }
export interface VfxMeta {
  key: string; image: string; frameWidth: number; frameHeight: number; columns: number; frameDurationMs: number;
  origin: { x: number; y: number }; blendMode: 'add' | 'normal'; attach: string; impactFrame?: number;
}
interface Ramp5 { outline: string; deep: string; shadow: string; base: string; light: string }
interface BatchManifest {
  paletteKeys: { skin: Ramp5; hair: Ramp5; eye: Ramp5 };
  characters: Record<string, string>;
  monsters: Record<string, string>;
  vfx: Record<string, VfxMeta>;
  tilesets: Record<string, string>;
  environment: Record<string, { objects: string; objectsImage: string; buildings: Record<string, { image: string; padding: { x: number; bottom: number } }> }>;
}
interface TilesetMeta { image: string; tileSize: number; columns: number; tiles: { id: number; name: string }[] }

const MANIFEST = 'batch001';
const state = {
  manifest: null as BatchManifest | null,
  chars: new Map<string, CharMeta>(),
  mons: new Map<string, MonMeta>(),
  tilesets: new Map<string, TilesetMeta>(),
};

const tex = (path: string) => `file:${path}`;
const url = (path: string) => `assets/${path}`;

/** Stage 1 (preload): the batch manifest. */
export function queueBatchManifest(scene: Phaser.Scene) {
  scene.load.json(MANIFEST, `assets/manifests/${MANIFEST}.json`);
}

/** Stage 2: per-asset metadata JSON. Returns false when no batch art is shipped. */
export function queueBatchMetadata(scene: Phaser.Scene): boolean {
  const m = scene.cache.json.get(MANIFEST) as BatchManifest | undefined;
  if (!m) return false;
  state.manifest = m;
  for (const [id, path] of Object.entries(m.characters)) scene.load.json(`meta:char:${id}`, url(path));
  for (const [id, path] of Object.entries(m.monsters)) scene.load.json(`meta:mon:${id}`, url(path));
  for (const [id, path] of Object.entries(m.tilesets)) scene.load.json(`meta:tiles:${id}`, url(path));
  return true;
}

/** Stage 3: every image referenced by the metadata. */
export function queueBatchImages(scene: Phaser.Scene) {
  const m = state.manifest;
  if (!m) return;
  const img = (path: string) => { if (!scene.textures.exists(tex(path))) scene.load.image(tex(path), url(path)); };
  for (const id of Object.keys(m.characters)) {
    const c = scene.cache.json.get(`meta:char:${id}`) as CharMeta | undefined;
    if (!c) continue;
    state.chars.set(id, c);
    for (const a of Object.values(c.animations)) {
      if (!a.layers) { if (!scene.textures.exists(tex(a.image))) scene.load.spritesheet(tex(a.image), url(a.image), { frameWidth: a.frameWidth, frameHeight: a.frameHeight }); continue; }
      for (const group of [a.layers.body, a.layers.hairBack, a.layers.hairFront]) for (const p of Object.values(group)) img(p);
      img(a.layers.weaponUnder); img(a.layers.weaponOver);
    }
  }
  for (const id of Object.keys(m.monsters)) {
    const mm = scene.cache.json.get(`meta:mon:${id}`) as MonMeta | undefined;
    if (!mm) continue;
    state.mons.set(id, mm);
    for (const a of Object.values(mm.animations)) scene.load.spritesheet(tex(a.image), url(a.image), { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
  }
  for (const v of Object.values(m.vfx)) scene.load.spritesheet(tex(v.image), url(v.image), { frameWidth: v.frameWidth, frameHeight: v.frameHeight });
  for (const id of Object.keys(m.tilesets)) {
    const t = scene.cache.json.get(`meta:tiles:${id}`) as TilesetMeta | undefined;
    if (!t) continue;
    state.tilesets.set(id, t);
    img(t.image);
  }
  for (const env of Object.values(m.environment)) {
    scene.load.atlas(tex(env.objectsImage), url(env.objectsImage), url(env.objects));
    for (const b of Object.values(env.buildings)) img(b.image);
  }
}

// ------------------------------------------------------------------ animation clips
export interface Clip { key: string; cols: number; rows: number; start: number; count: number; frameMs: number; loop: boolean; directions: Direction[] }
export interface Rig { clips: Record<string, Clip>; originX: number; originY: number }

export function clipFrame(c: Clip, dir: Direction, f: number): { frame: number; flipX: boolean } {
  if (c.rows === 1) return { frame: c.start + f, flipX: dir === 'right' };
  return { frame: Math.max(0, c.directions.indexOf(dir)) * c.cols + c.start + f, flipX: false };
}

const clipOf = (key: string, a: AnimMeta): Clip => ({
  key, cols: a.columns, rows: a.rows, start: 0, count: a.columns, frameMs: a.frameDurationMs, loop: a.repeat === -1, directions: a.directions,
});

export function monsterRig(scene: Phaser.Scene, monsterId: string): Rig | null {
  const m = state.mons.get(monsterId);
  if (!m) return null;
  const clips: Record<string, Clip> = {};
  for (const [name, a] of Object.entries(m.animations)) {
    if (!scene.textures.exists(tex(a.image))) return null;
    clips[name] = clipOf(tex(a.image), a);
  }
  return { clips, originX: m.origin.x, originY: m.origin.y };
}

export function hasBatchCharacter(classId: string) { return state.chars.has(classId); }

// ------------------------------------------------------------------ palette swap
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
/** Hue-shifted 5-tone ramp around `base`: shadows lean cool, lights lean warm. */
export function rampFrom(base: string): [number, number, number][] {
  const [h, s, l] = rgbToHsl(hexToRgb(base));
  const towards = (target: number, amt: number) => { let d = ((target - h + 540) % 360) - 180; return (h + Math.sign(d) * Math.min(Math.abs(d), amt) + 360) % 360; };
  const c = (v: number) => Math.max(0.02, Math.min(0.97, v));
  return [
    hslToRgb(towards(260, 22), c(s * 0.75 + 0.1), c(l - 0.42)), // outline
    hslToRgb(towards(260, 14), c(s * 0.9), c(l - 0.26)),        // deep
    hslToRgb(towards(260, 7), c(s), c(l - 0.13)),               // shadow
    hexToRgb(base),                                              // base
    hslToRgb(towards(55, 8), c(s * 0.9), c(l + 0.12)),          // light
  ];
}
function swapMap(key: Ramp5, to: string) {
  const ramp = rampFrom(to);
  const out = new Map<number, [number, number, number]>();
  [key.outline, key.deep, key.shadow, key.base, key.light].forEach((h, i) => out.set(parseInt(h.slice(1), 16), ramp[i]));
  return out;
}
function applySwap(ctx: CanvasRenderingContext2D, w: number, h: number, map: Map<number, [number, number, number]>) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const to = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Composes a class's layered sheets (body, hair back/front, weapon) with the
 * player's chosen hair style and skin/hair/eye colours into one texture per
 * animation. Returns null when the class has no production art yet.
 */
export function characterRig(scene: Phaser.Scene, classId: string, ap: Appearance, weaponType: string | null): Rig | null {
  const c = state.chars.get(classId), m = state.manifest;
  if (!c || !m) return null;
  // Composite-only sheets (e.g. AI-generated art) are used as drawn: no layer recolouring.
  if (Object.values(c.animations).every((a) => !a.layers)) {
    const clips: Record<string, Clip> = {};
    for (const [name, a] of Object.entries(c.animations)) {
      if (!scene.textures.exists(tex(a.image))) return null;
      clips[name] = clipOf(tex(a.image), a);
    }
    return { clips, originX: c.origin.x, originY: c.origin.y };
  }
  // Only the dagger has layered weapon art so far; other weapons are not drawn.
  const weapon = weaponType === 'dagger';
  const id = `bc_${classId}_${hashString(JSON.stringify([ap, weapon])).toString(36)}`;
  const skinEye = new Map([...swapMap(m.paletteKeys.skin, ap.skinTone), ...swapMap(m.paletteKeys.eye, ap.eyeColor)]);
  const hair = swapMap(m.paletteKeys.hair, ap.hairColor);
  const clips: Record<string, Clip> = {};
  for (const [name, a] of Object.entries(c.animations)) {
    const key = `${id}_${name}`;
    clips[name] = clipOf(key, a);
    if (scene.textures.exists(key)) continue;
    const L = a.layers;
    if (!L) return null;
    const w = a.columns * a.frameWidth, h = a.rows * a.frameHeight;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const octx = out.getContext('2d')!;
    const layer = (path: string | undefined, swap: Map<number, [number, number, number]> | null) => {
      if (!path || !scene.textures.exists(tex(path))) return;
      const src = scene.textures.get(tex(path)).getSourceImage() as HTMLImageElement;
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
      const t = tmp.getContext('2d', { willReadFrequently: true })!;
      t.drawImage(src, 0, 0);
      if (swap) applySwap(t, w, h, swap);
      octx.drawImage(tmp, 0, 0);
    };
    for (const part of c.layerOrder) {
      if (part === 'hairBack') layer(L.hairBack[ap.hairStyle], hair);
      else if (part === 'hairFront') layer(L.hairFront[ap.hairStyle], hair);
      else if (part === 'body') layer(L.body[ap.body] ?? L.body.a, skinEye);
      else if (part === 'weaponUnder' && weapon) layer(L.weaponUnder, null);
      else if (part === 'weaponOver' && weapon) layer(L.weaponOver, null);
    }
    const t = scene.textures.addCanvas(key, out)!;
    for (let r = 0; r < a.rows; r++) for (let col = 0; col < a.columns; col++) t.add(r * a.columns + col, 0, col * a.frameWidth, r * a.frameHeight, a.frameWidth, a.frameHeight);
  }
  return { clips, originX: c.origin.x, originY: c.origin.y };
}

// ------------------------------------------------------------------ VFX
export function vfxMeta(scene: Phaser.Scene, key: string): (VfxMeta & { texture: string }) | null {
  const v = state.manifest?.vfx[key];
  if (!v || !scene.textures.exists(tex(v.image))) return null;
  return { ...v, texture: tex(v.image) };
}

// ------------------------------------------------------------------ map art
function tilesetFor(scene: Phaser.Scene, tileset: string) {
  const t = state.tilesets.get(tileset);
  if (!t || !scene.textures.exists(tex(t.image))) return null;
  const img = scene.textures.get(tex(t.image)).getSourceImage() as HTMLImageElement;
  const ids = new Map(t.tiles.map((x) => [x.name, x.id]));
  return { img, ids, cols: t.columns, size: t.tileSize };
}

/**
 * Paints ground (+ dual-grid terrain overlays + decoration), wall and
 * above-player layers from a production tileset. Same tile choice as the
 * exported Tiled map (tools/asset-studio/src/tiled.ts).
 */
export function paintTiledLayers(scene: Phaser.Scene, map: CompiledMap, region?: Region): { ground: HTMLCanvasElement; walls: HTMLCanvasElement; above: HTMLCanvasElement } | null {
  const ts = tilesetFor(scene, map.def.tileset);
  if (!ts) return null;
  const W = map.width, H = map.height;
  const rg = region ?? { x: 0, y: 0, w: W, h: H };
  const x0 = Math.max(0, rg.x - 1), y0 = Math.max(0, rg.y - 1), x1 = Math.min(W, rg.x + rg.w + 1), y1 = Math.min(H, rg.y + rg.h + 1);
  const make = () => { const c = document.createElement('canvas'); c.width = rg.w * TILE; c.height = rg.h * TILE; return c; };
  const ground = make(), walls = make(), above = make();
  const ctxOf = (c: HTMLCanvasElement) => { const x = c.getContext('2d')!; x.translate(-rg.x * TILE, -rg.y * TILE); return x; };
  const draw = (ctx: CanvasRenderingContext2D, name: string, x: number, y: number) => {
    const id = ts.ids.get(name);
    if (id === undefined) return;
    ctx.drawImage(ts.img, (id % ts.cols) * ts.size, Math.floor(id / ts.cols) * ts.size, ts.size, ts.size, x, y, ts.size, ts.size);
  };
  const g = ctxOf(ground);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) draw(g, `grass_${(x * 7 + y * 3) % 4}`, x * TILE, y * TILE);
  const at = (ter: string, cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < W && cy < H && map.ground[cy * W + cx] === ter;
  for (const ter of ['dirt', 'path_stone', 'soil']) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const mask = (at(ter, x - 1, y - 1) ? 1 : 0) | (at(ter, x, y - 1) ? 2 : 0) | (at(ter, x - 1, y) ? 4 : 0) | (at(ter, x, y) ? 8 : 0);
      if (!mask) continue;
      const v = (x * 5 + y * 3) % 3;
      draw(g, mask === 15 && v ? `${ter}_15_v${v}` : `${ter}_${mask}`, x * TILE - TILE / 2, y * TILE - TILE / 2);
    }
  }
  const wc = ctxOf(walls), ac = ctxOf(above);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * W + x, d = map.deco[i];
    const name = d === 'flowers' ? `flowers_${i % 3}` : d === 'tuft' ? `tuft_${i % 2}` : d === 'crops' ? 'crops_0' : d === 'pebbles' ? 'pebbles_0' : null;
    if (name) draw(g, name, x * TILE, y * TILE);
    if (map.wall[i]) draw(wc, map.wall[i], x * TILE, y * TILE);
    if (map.above[i]) draw(ac, 'canopy_overhang', x * TILE, y * TILE);
  }
  return { ground, walls, above };
}

/** Prop art from the environment atlas, as its own canvas texture. Null when absent. */
export function propTexture(scene: Phaser.Scene, tileset: string, kind: string, variant: number): string | null {
  const env = state.manifest?.environment[tileset];
  if (!env) return null;
  const atlas = tex(env.objectsImage);
  if (!scene.textures.exists(atlas)) return null;
  const t = scene.textures.get(atlas);
  const frame = t.has(`${kind}_${variant}`) ? `${kind}_${variant}` : t.has(kind) ? kind : null;
  if (!frame) return null;
  const key = `prop_${tileset}_${frame}`;
  if (!scene.textures.exists(key)) {
    const f = t.get(frame);
    const c = document.createElement('canvas'); c.width = f.cutWidth; c.height = f.cutHeight;
    c.getContext('2d')!.drawImage(t.getSourceImage() as HTMLImageElement, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    scene.textures.addCanvas(key, c);
  }
  return key;
}

/**
 * Building art for a footprint. Re-padded to the placeholder contract
 * (4 px each side, 4 px below the footprint) so GameScene places both alike.
 */
export function buildingTexture(scene: Phaser.Scene, tileset: string, style: string, w: number, h: number): string | null {
  const b = state.manifest?.environment[tileset]?.buildings[`${style}_${w}x${h}`];
  if (!b || !scene.textures.exists(tex(b.image))) return null;
  const key = `bld_${tileset}_${style}_${w}x${h}`;
  if (!scene.textures.exists(key)) {
    const src = scene.textures.get(tex(b.image)).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas'); c.width = w * TILE + 8; c.height = src.height - b.padding.bottom + 4;
    c.getContext('2d')!.drawImage(src, 4 - b.padding.x, 0);
    scene.textures.addCanvas(key, c);
  }
  return key;
}
