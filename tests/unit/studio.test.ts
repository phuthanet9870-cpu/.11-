import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadGameData, validateGameData } from '../../src/core/data';
import { compileMap } from '../../src/core/mapCompiler';
import type { MapDef } from '../../src/core/types';
import { applyLayer } from '../../src/studio/layer';
import { deleteEntity, entities, freezeScatter, mapProblems, moveEntity, paintCell } from '../../src/studio/mapEdit';

const data = loadGameData();
const copy = (id: string): MapDef => JSON.parse(JSON.stringify(data.maps.get(id)!));
const objectSet = (def: MapDef) => compileMap(data, def).objects.map((o) => `${o.kind}@${o.x},${o.y}`).sort();

describe('Studio map editing', () => {
  it('freezing scattered trees keeps every object where it was, as editable object ops', () => {
    const def = copy('clover_hills');
    const frozen = freezeScatter(data, def);
    expect(frozen.paint.some((op) => op.op === 'scatter' && !op.kind.startsWith('deco:'))).toBe(false);
    expect(objectSet(frozen)).toEqual(objectSet(def));
    expect(Array.from(compileMap(data, frozen).collision)).toEqual(Array.from(compileMap(data, def).collision));
  });

  it('hand-painted cells change ground and walls (null clears a wall)', () => {
    const def = copy('aurelion');
    paintCell(def, 'ground', 50, 60, 'sand');
    paintCell(def, 'wall', 50, 62, 'ruin_wall');
    paintCell(def, 'wall', 0, 55, null); // border cell
    paintCell(def, 'ground', 50, 60, 'dirt'); // same cell again replaces it
    const cm = compileMap(data, def);
    expect(cm.ground[60 * cm.width + 50]).toBe('dirt');
    expect(cm.collision[62 * cm.width + 50]).toBe(1);
    expect(cm.wall[55 * cm.width]).toBe(null);
    expect(def.paint.filter((op) => op.op === 'tiles')).toHaveLength(2);
  });

  it('moving and deleting a named object keeps its interaction entry in step', () => {
    const def = copy('aurelion');
    const f = entities(data, def).find((e) => e.type === 'object' && e.label === 'aurelion_fountain')!;
    moveEntity(def, f, 20, 30);
    expect(def.objects.find((o) => o.id === 'aurelion_fountain')).toMatchObject({ x: 20, y: 30 });
    deleteEntity(def, f);
    expect(def.objects.some((o) => o.id === 'aurelion_fountain')).toBe(false);
    expect(def.paint.some((op) => op.op === 'object' && op.id === 'aurelion_fountain')).toBe(false);
  });

  it('the reachability check passes shipped maps and catches a walled-in spawn', () => {
    for (const id of ['aurelion', 'willowbrook', 'clover_hills', 'castle_veyl']) expect(mapProblems(data, copy(id)), id).toEqual([]);
    const def = copy('aurelion');
    const s = def.spawnPoints.default;
    for (let y = s.y - 1; y <= s.y + 1; y++) for (let x = s.x - 1; x <= s.x + 1; x++) if (x !== s.x || y !== s.y) paintCell(def, 'wall', x, y, 'ruin_wall');
    expect(mapProblems(data, def).join()).toMatch(/portal|npc|spawn/);
  });
});

describe('Studio layer over the game data', () => {
  it('applies edited maps and object kinds, and skips a map that no longer compiles', () => {
    const d = { ...data, maps: new Map(data.maps), objectKinds: new Map(data.objectKinds), tilesets: new Map(data.tilesets) };
    const good = copy('willowbrook'); good.name = 'Edited';
    const bad = copy('aurelion'); bad.paint.push({ op: 'object', kind: 'no_such_kind', x: 5, y: 5 });
    const objects = [...data.objectKinds.values()].map((k) => (k.id === 'rock' ? { ...k, artH: 33 } : k));
    const r = applyLayer(d as never, { images: new Map(), maps: new Map([['willowbrook', good], ['aurelion', bad]]), objects, tilesets: new Map(), data: new Map() });
    expect(d.maps.get('willowbrook')!.name).toBe('Edited');
    expect(d.maps.get('aurelion')).toBe(data.maps.get('aurelion'));
    expect(r.skipped.join()).toMatch(/aurelion/);
    expect(d.objectKinds.get('rock')!.artH).toBe(33);
  });

  it('replaces a whole data collection (items) and the game validator still passes', () => {
    const d = { ...data, maps: new Map(data.maps), objectKinds: new Map(data.objectKinds), tilesets: new Map(data.tilesets), items: new Map(data.items) };
    const items = [...data.items.values()].map((it) => (it.id === 'red_potion' ? { ...it, name: 'Studio Potion', price: 7 } : it));
    applyLayer(d as never, { images: new Map(), maps: new Map(), objects: null, tilesets: new Map(), data: new Map([['items', items]]) });
    expect(d.items.get('red_potion')).toMatchObject({ name: 'Studio Potion', price: 7 });
    expect(data.items.get('red_potion')!.name).not.toBe('Studio Potion');
    expect(validateGameData(d as never)).toEqual([]);
  });

  it('ground can use any tileset texture: rules follow the base tile, the validator checks both parts', () => {
    const def = copy('aurelion');
    paintCell(def, 'ground', 50, 60, 'water@coast');
    paintCell(def, 'ground', 51, 60, 'sand@desert');
    def.paint.push({ op: 'path', tile: 'path_stone@snow', width: 2, points: [[10, 70], [20, 70]] });
    const cm = compileMap(data, def);
    expect(cm.ground[60 * cm.width + 50]).toBe('water@coast');
    expect(cm.collision[60 * cm.width + 50]).toBe(1);
    expect(cm.collision[60 * cm.width + 51]).toBe(0);
    expect(cm.ground[70 * cm.width + 15]).toBe('path_stone@snow');
    const d = { ...data, maps: new Map(data.maps) };
    d.maps.set('aurelion', def);
    expect(validateGameData(d as never).filter((p) => p.includes('aurelion'))).toEqual([]);
    paintCell(def, 'ground', 52, 60, 'sand@nowhere');
    expect(validateGameData(d as never).join()).toMatch(/sand@nowhere/);
  });

  it('every PixelLab object is a placeable kind and PixelLab tiles are valid ground', () => {
    const lib = JSON.parse(readFileSync('src/data/pixellab/library.json', 'utf8'));
    expect(lib.objects.length).toBeGreaterThan(500);
    for (const o of lib.objects) expect(data.objectKinds.get(`pl_${o.slug}`)?.art, o.slug).toBe(o.art);
    const def = copy('aurelion');
    const tile = lib.tiles[0];
    def.paint.push({ op: 'object', kind: `pl_${lib.objects[0].slug}`, x: 20, y: 70 });
    paintCell(def, 'ground', 30, 60, `${tile.base}@pl:${tile.slug}:3`);
    const cm = compileMap(data, def);
    expect(cm.ground[60 * cm.width + 30]).toBe(`${tile.base}@pl:${tile.slug}:3`);
    const d = { ...data, maps: new Map(data.maps) };
    d.maps.set('aurelion', def);
    expect(validateGameData(d as never).filter((p) => p.includes('aurelion'))).toEqual([]);
    for (const f of [...lib.objects.map((o: { art: string }) => o.art), ...lib.tiles.map((t: { art: string }) => t.art)]) expect(existsSync(`public/art/${f}.webp`), f).toBe(true);
  });
});
