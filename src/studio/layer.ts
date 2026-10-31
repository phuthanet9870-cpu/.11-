// Lays the Studio edits saved in this browser over the game data and art.
import { compileMap } from '../core/mapCompiler';
import { pixellabObjectKinds, replaceCollection, STUDIO_COLLECTIONS, type GameData, type StudioCollection } from '../core/data';
import { decodeSprite, isSpritePath, setSpriteOverride } from '../game/art/spriteOverrides';
import { setArtOverride } from '../game/art/themeArt';
import { readLayer, type StudioLayer } from './store';

/** Applies the browser layer to `data` (in place). Returns what was applied and what had to be skipped. */
export async function applyBrowserLayer(data: GameData): Promise<{ applied: number; skipped: string[] }> {
  let layer: StudioLayer;
  try { layer = await readLayer(); } catch { return { applied: 0, skipped: [] }; }
  // Sprite sheets and icons are decoded now: the sheet generators use them synchronously.
  for (const [path, blob] of layer.images) if (isSpritePath(path)) setSpriteOverride(path, await decodeSprite(blob));
  return applyLayer(data, layer);
}

export function applyLayer(data: GameData, layer: StudioLayer): { applied: number; skipped: string[] } {
  let applied = 0;
  // Debug/test hook: what this page took from the Studio.
  if (typeof window !== 'undefined') (window as unknown as { __studioLayer: unknown }).__studioLayer = { images: [...layer.images.keys()], maps: [...layer.maps.keys()], objects: !!layer.objects, tilesets: [...layer.tilesets.keys()], data: [...(layer.data?.keys() ?? [])] };
  const skipped: string[] = [];
  for (const [path, blob] of layer.images) { setArtOverride(path, URL.createObjectURL(blob)); applied++; }
  if (layer.objects) {
    data.objectKinds.clear();
    for (const k of layer.objects) data.objectKinds.set(k.id, k);
    // Object lists saved before the PixelLab library existed still get its objects.
    for (const k of pixellabObjectKinds()) if (!data.objectKinds.has(k.id)) data.objectKinds.set(k.id, k);
    applied++;
  }
  for (const t of layer.tilesets.values()) if (data.tilesets.has(t.id)) { data.tilesets.set(t.id, t); applied++; }
  for (const [k, list] of layer.data ?? []) if ((STUDIO_COLLECTIONS as readonly string[]).includes(k)) { replaceCollection(data, k as StudioCollection, list); applied++; }
  for (const m of layer.maps.values()) {
    // A map that no longer compiles (e.g. an object kind was deleted) keeps the shipped version.
    try { compileMap(data, m); data.maps.set(m.id, m); applied++; } catch (e) { skipped.push(`${m.id}: ${(e as Error).message}`); }
  }
  return { applied, skipped };
}
