// Painted art packs per map theme (public/art, made by tools/art/prepare_art.py).
// Each tileset has a ground sheet and a props sheet; buildings come from one of seven
// architecture themes. Images load on demand; until they arrive (or if a file is missing)
// the procedural painters in mapPainter.ts are used.

export const GROUND_ORDER = ['grass', 'grass_dark', 'forest_floor', 'dirt', 'soil', 'path_stone', 'ruin_floor', 'sand', 'water', 'thorn_ground'];
export const PROP_ORDER = [
  'tree_oak', 'tree_pine', 'tree_dark', 'bush', 'rock', 'rock_big',
  'stump', 'crate', 'barrel', 'well', 'fountain', 'signpost',
  'anvil', 'tent', 'goblin_tent', 'lamp_post', 'campfire', 'haystack',
  'ruin_pillar', 'gravestone', 'obelisk', 'thorn_throne', 'planter', 'glint',
];
/** Ground blocks are 256px squares stacked vertically; props are 128px cells, 6 per row. */
export const GROUND_BLOCK = 256;
export const PROP_CELL = 128;
export const ARCH_PARTS = ['house', 'inn', 'shop', 'smithy', 'guild', 'castle', 'gate', 'wall'] as const;
export type ArchPart = (typeof ARCH_PARTS)[number];

/** Architecture theme of a tileset (south-facing facades; never rotated or mirrored). */
export function architectureTheme(tileset: string): string {
  if (tileset === 'snow' || tileset === 'dg_ice') return 'snow';
  if (tileset === 'coast' || tileset === 'dg_grotto') return 'coast';
  if (tileset === 'desert' || tileset === 'volcano' || tileset === 'dg_magma') return 'desert';
  if (tileset === 'arcane' || tileset === 'dg_tower') return 'arcane';
  if (['fernwood', 'whispering_forest', 'swamp', 'dg_cave'].includes(tileset)) return 'fernwood';
  if (['capital', 'dg_tomb', 'dg_catacomb', 'ruins', 'dg_crypt'].includes(tileset)) return 'capital';
  return 'willowbrook';
}

const images = new Map<string, HTMLImageElement | null>();
const pending = new Map<string, Promise<void>>();
/** Studio edits: image path → object URL used instead of art/<path>.webp. */
const overrides = new Map<string, string>();

/** Replaces (or with null restores) one image; it is loaded again the next time a map needs it. */
export function setArtOverride(path: string, url: string | null) {
  if (url) overrides.set(path, url); else overrides.delete(path);
  images.delete(path);
  pending.delete(path);
}

function load(path: string): Promise<void> {
  if (images.has(path)) return Promise.resolve();
  let p = pending.get(path);
  if (!p) {
    p = new Promise<void>((resolve) => {
      if (typeof Image === 'undefined') { images.set(path, null); resolve(); return; }
      const img = new Image();
      img.onload = () => { images.set(path, img); resolve(); };
      img.onerror = () => { images.set(path, null); resolve(); };
      img.src = overrides.get(path) ?? `art/${path}.webp`;
    });
    pending.set(path, p);
  }
  return p;
}

const img = (path: string) => images.get(path) ?? null;
/** Loads any set of images (for tools that need them up front). */
export const loadArt = (paths: string[]) => Promise.all(paths.map(load)).then(() => undefined);
/** URL the game loads for an image (Studio edit or the shipped file). */
export const artUrl = (path: string) => overrides.get(path) ?? `art/${path}.webp`;
const tilesetPaths = (tileset: string) => {
  const theme = architectureTheme(tileset);
  return [`tiles/${tileset}`, `props/${tileset}`, ...ARCH_PARTS.map((p) => `arch/${theme}/${p}`)];
};

/** True once every image of a tileset has been tried (loaded or failed). */
export function themeArtReady(tileset: string, extra: string[] = []): boolean {
  return [...tilesetPaths(tileset), ...extra].every((p) => images.has(p));
}

/** Loads a tileset's ground, props and architecture (plus extra paths such as `aurelion/windmill`). */
export function loadThemeArt(tileset: string, extra: string[] = []): Promise<void> {
  return Promise.all([...tilesetPaths(tileset), ...extra].map(load)).then(() => undefined);
}

/** Short tag for texture keys, so sprites painted before the art arrived are not reused. */
export function artTag(tileset: string): string {
  return img(`tiles/${tileset}`) ? 'a' : 'p';
}

export const groundSheet = (tileset: string) => img(`tiles/${tileset}`);
export const propSheet = (tileset: string) => img(`props/${tileset}`);
export const archSprite = (tileset: string, part: ArchPart) => img(`arch/${architectureTheme(tileset)}/${part}`);
export const extraSprite = (path: string) => img(path);

const trimCache = new WeakMap<HTMLImageElement, Map<number, { x: number; y: number; w: number; h: number } | null>>();

/** Bounds of the opaque pixels of one prop cell (null when the cell is empty). */
export function propBounds(sheet: HTMLImageElement, index: number) {
  let m = trimCache.get(sheet);
  if (!m) { m = new Map(); trimCache.set(sheet, m); }
  if (m.has(index)) return m.get(index)!;
  const sx = (index % 6) * PROP_CELL, sy = Math.floor(index / 6) * PROP_CELL;
  const c = document.createElement('canvas');
  c.width = c.height = PROP_CELL;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sheet, sx, sy, PROP_CELL, PROP_CELL, 0, 0, PROP_CELL, PROP_CELL);
  const d = ctx.getImageData(0, 0, PROP_CELL, PROP_CELL).data;
  let x0 = PROP_CELL, y0 = PROP_CELL, x1 = -1, y1 = -1;
  for (let y = 0; y < PROP_CELL; y++) for (let x = 0; x < PROP_CELL; x++) {
    if (d[(y * PROP_CELL + x) * 4 + 3] < 8) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const b = x1 < 0 ? null : { x: sx + x0, y: sy + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  m.set(index, b);
  return b;
}
