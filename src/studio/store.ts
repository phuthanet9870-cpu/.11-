// Studio edits saved in this browser (IndexedDB), plus the pack file used to move them
// between browsers or into the repository (tools/studio/apply_pack.py).
import type { MapDef, ObjectKindDef, TilesetDef } from '../core/types';

export interface StudioLayer {
  images: Map<string, Blob>;
  maps: Map<string, MapDef>;
  objects: ObjectKindDef[] | null;
  tilesets: Map<string, TilesetDef>;
  /** Whole data collections (items, monsters, skills…) by name. */
  data: Map<string, unknown[]>;
}

/** Portable form of every edit. Images are PNG data URLs keyed by art path (e.g. `props/capital`). */
export interface StudioPack {
  format: 'veyloria-studio-pack';
  version: 1;
  images: Record<string, string>;
  maps: Record<string, MapDef>;
  objects: ObjectKindDef[] | null;
  tilesets: Record<string, TilesetDef>;
  data?: Record<string, unknown[]>;
}

const DB = 'veyloria-studio', STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  return dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const putValue = (key: string, value: unknown) => tx('readwrite', (s) => { s.put(value, key); });
export const deleteValue = (key: string) => tx('readwrite', (s) => { s.delete(key); });
export const clearAll = () => tx('readwrite', (s) => { s.clear(); });

export const saveImage = (path: string, blob: Blob) => putValue(`img:${path}`, blob);
export const deleteImage = (path: string) => deleteValue(`img:${path}`);
export const saveMap = (def: MapDef) => putValue(`map:${def.id}`, def);
export const deleteMap = (id: string) => deleteValue(`map:${id}`);
export const saveObjects = (list: ObjectKindDef[] | null) => (list ? putValue('objects', list) : deleteValue('objects'));
export const saveTileset = (t: TilesetDef) => putValue(`tileset:${t.id}`, t);
export const deleteTileset = (id: string) => deleteValue(`tileset:${id}`);
export const saveCollection = (name: string, list: unknown[] | null) => (list ? putValue(`data:${name}`, list) : deleteValue(`data:${name}`));

/** Everything saved in this browser. */
export async function readLayer(): Promise<StudioLayer> {
  const layer: StudioLayer = { images: new Map(), maps: new Map(), objects: null, tilesets: new Map(), data: new Map() };
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      const k = String(c.key);
      if (k.startsWith('img:')) layer.images.set(k.slice(4), c.value as Blob);
      else if (k.startsWith('map:')) layer.maps.set(k.slice(4), c.value as MapDef);
      else if (k.startsWith('tileset:')) layer.tilesets.set(k.slice(8), c.value as TilesetDef);
      else if (k.startsWith('data:')) layer.data.set(k.slice(5), c.value as unknown[]);
      else if (k === 'objects') layer.objects = c.value as ObjectKindDef[];
      c.continue();
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  return layer;
}

const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

export async function exportPack(): Promise<StudioPack> {
  const l = await readLayer();
  const images: Record<string, string> = {};
  for (const [p, b] of l.images) images[p] = await blobToDataUrl(b);
  return { format: 'veyloria-studio-pack', version: 1, images, maps: Object.fromEntries(l.maps), objects: l.objects, tilesets: Object.fromEntries(l.tilesets), data: Object.fromEntries(l.data) };
}

export function isPack(v: unknown): v is StudioPack {
  return !!v && typeof v === 'object' && (v as StudioPack).format === 'veyloria-studio-pack' && (v as StudioPack).version === 1;
}

/** Adds a pack's edits to this browser (same paths/ids are replaced). */
export async function importPack(pack: StudioPack) {
  for (const [p, url] of Object.entries(pack.images)) await saveImage(p, await (await fetch(url)).blob());
  for (const m of Object.values(pack.maps)) await saveMap(m);
  for (const t of Object.values(pack.tilesets)) await saveTileset(t);
  if (pack.objects) await saveObjects(pack.objects);
  for (const [k, list] of Object.entries(pack.data ?? {})) await saveCollection(k, list);
}
