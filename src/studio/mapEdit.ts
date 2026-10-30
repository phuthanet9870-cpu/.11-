// Map editing for the Studio: what can be selected on a map, moving/deleting it, hand-painted
// cells, and the same reachability checks the world generator runs. Pure functions on MapDef.
import type { GameData } from '../core/data';
import { compileMap } from '../core/mapCompiler';
import type { MapDef, PaintOp } from '../core/types';

export type EntityType = 'building' | 'object' | 'npc' | 'portal' | 'spawn' | 'scenery' | 'boss' | 'mobs' | 'area';
export interface Entity { type: EntityType; key: number | string; x: number; y: number; w: number; h: number; label: string }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Turns randomly scattered objects (trees, rocks…) into ordinary object ops so each can be moved or deleted.
 * The compiled map is unchanged: the same objects end up in the same cells. */
export function freezeScatter(data: GameData, def: MapDef): MapDef {
  if (!def.paint.some((op) => op.op === 'scatter' && !op.kind.startsWith('deco:'))) return def;
  const cm = compileMap(data, def);
  const fromOps = new Set(def.paint.filter((op) => op.op === 'object').map((op) => `${(op as { kind: string }).kind},${(op as { x: number }).x},${(op as { y: number }).y}`));
  const frozen: PaintOp[] = cm.objects.filter((o) => !fromOps.has(`${o.kind},${o.x},${o.y}`)).map((o) => ({ op: 'object', kind: o.kind, x: o.x, y: o.y }));
  const out = clone(def);
  const first = out.paint.findIndex((op) => op.op === 'scatter' && !op.kind.startsWith('deco:'));
  out.paint = out.paint.filter((op) => !(op.op === 'scatter' && !op.kind.startsWith('deco:')));
  out.paint.splice(first, 0, ...frozen);
  return out;
}

/** Everything on the map that can be selected, in drawing order (later = on top). */
export function entities(data: GameData, def: MapDef): Entity[] {
  const list: Entity[] = [];
  def.areas.forEach((a, i) => list.push({ type: 'area', key: i, ...a.rect, label: a.name }));
  def.monsterSpawns.forEach((m, i) => list.push({ type: 'mobs', key: i, ...m.area, label: `${m.monsterId} ×${m.count}` }));
  def.paint.forEach((op, i) => {
    if (op.op === 'building') list.push({ type: 'building', key: i, x: op.x, y: op.y, w: op.w, h: op.h, label: op.sign ?? op.style });
    if (op.op === 'object') {
      const k = data.objectKinds.get(op.kind);
      list.push({ type: 'object', key: i, x: op.x, y: op.y, w: k?.footprint.w ?? 1, h: k?.footprint.h ?? 1, label: op.id ?? op.kind });
    }
  });
  (def.scenery ?? []).forEach((s, i) => list.push({ type: 'scenery', key: i, x: s.x, y: s.y, w: s.w, h: s.h, label: s.kind }));
  def.portals.forEach((p, i) => list.push({ type: 'portal', key: i, x: p.x, y: p.y, w: p.w, h: p.h, label: `→ ${p.targetMap}` }));
  for (const [k, s] of Object.entries(def.spawnPoints)) list.push({ type: 'spawn', key: k, x: s.x, y: s.y, w: 1, h: 1, label: k });
  if (def.bossSpawn) list.push({ type: 'boss', key: 0, x: def.bossSpawn.x, y: def.bossSpawn.y, w: 1, h: 1, label: def.bossSpawn.bossId });
  def.npcs.forEach((n, i) => list.push({ type: 'npc', key: i, x: n.x, y: n.y, w: 1, h: 1, label: n.npcId }));
  return list;
}

/** The data object behind an entity (edited in place by the property panel). */
export function entityData(def: MapDef, e: Pick<Entity, 'type' | 'key'>): Record<string, unknown> {
  const k = e.key as number;
  switch (e.type) {
    case 'building': case 'object': return def.paint[k] as unknown as Record<string, unknown>;
    case 'npc': return def.npcs[k] as unknown as Record<string, unknown>;
    case 'portal': return def.portals[k] as unknown as Record<string, unknown>;
    case 'spawn': return def.spawnPoints[e.key as string] as unknown as Record<string, unknown>;
    case 'scenery': return def.scenery![k] as unknown as Record<string, unknown>;
    case 'boss': return def.bossSpawn as unknown as Record<string, unknown>;
    case 'mobs': return def.monsterSpawns[k].area as unknown as Record<string, unknown>;
    case 'area': return def.areas[k].rect as unknown as Record<string, unknown>;
  }
}

/** Moves an entity's top-left corner to (x, y). A named object's interaction entry moves with it. */
export function moveEntity(def: MapDef, e: Pick<Entity, 'type' | 'key'>, x: number, y: number) {
  const d = entityData(def, e) as { x: number; y: number; id?: string };
  d.x = x; d.y = y;
  if (e.type === 'object' && d.id) for (const o of def.objects) if (o.id === d.id) { o.x = x; o.y = y; }
}

export function deleteEntity(def: MapDef, e: Pick<Entity, 'type' | 'key'>) {
  const k = e.key as number;
  switch (e.type) {
    case 'building': def.paint.splice(k, 1); break;
    case 'object': {
      const op = def.paint[k] as { id?: string };
      def.paint.splice(k, 1);
      if (op.id) def.objects = def.objects.filter((o) => o.id !== op.id);
      break;
    }
    case 'npc': def.npcs.splice(k, 1); break;
    case 'portal': def.portals.splice(k, 1); break;
    case 'spawn': delete def.spawnPoints[e.key as string]; break;
    case 'scenery': def.scenery!.splice(k, 1); break;
    case 'boss': delete def.bossSpawn; break;
    case 'mobs': def.monsterSpawns.splice(k, 1); break;
    case 'area': def.areas.splice(k, 1); break;
  }
}

/** Paints one cell by hand. Cells live in one `tiles` op per layer at the end of the paint list. */
export function paintCell(def: MapDef, layer: 'ground' | 'deco' | 'wall', x: number, y: number, tile: string | null) {
  if (x < 0 || y < 0 || x >= def.width || y >= def.height) return;
  let op = def.paint.find((o) => o.op === 'tiles' && o.layer === layer) as Extract<PaintOp, { op: 'tiles' }> | undefined;
  if (!op) { op = { op: 'tiles', layer, cells: [] }; def.paint.push(op); }
  const i = op.cells.findIndex(([cx, cy]) => cx === x && cy === y);
  if (i >= 0) op.cells[i] = [x, y, tile]; else op.cells.push([x, y, tile]);
}

/** Same checks as the world generator: spawns, portals and NPCs must be reachable on foot. */
export function mapProblems(data: GameData, def: MapDef): string[] {
  let cm;
  try { cm = compileMap(data, def); } catch (e) { return [(e as Error).message]; }
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < cm.width && y < cm.height && cm.reachable[y * cm.width + x] === 1;
  const near = (x: number, y: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ok(x + dx, y + dy));
  const bad: string[] = [];
  for (const [k, sp] of Object.entries(def.spawnPoints)) if (!ok(sp.x, sp.y)) bad.push(`spawn ${k} is blocked or cut off`);
  for (const p of def.portals) {
    let any = false;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) any ||= near(x, y);
    if (!any) bad.push(`portal ${p.id} cannot be reached`);
    if (!data.maps.has(p.targetMap)) bad.push(`portal ${p.id}: unknown map ${p.targetMap}`);
  }
  for (const n of def.npcs) {
    if (!near(n.x, n.y + 1) && !near(n.x, n.y - 1) && !near(n.x + 1, n.y) && !near(n.x - 1, n.y)) bad.push(`npc ${n.npcId} cannot be reached`);
    if (!data.npcs.has(n.npcId)) bad.push(`npc ${n.npcId} does not exist`);
  }
  if (!def.spawnPoints.default) bad.push('the map needs a "default" spawn point');
  return bad;
}
