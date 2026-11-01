import { describe, expect, it } from 'vitest';
import { compileMap, TILE } from '../../src/core/mapCompiler';
import { DORMANT_RANGE } from '../../src/core/world';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

const maps = [...data.maps.values()];

describe('bigger maps', () => {
  it('fields, dungeons and towns are several times larger than before', () => {
    for (const m of maps) {
      if (m.type === 'field') expect(m.width * m.height, m.id).toBeGreaterThanOrEqual(150 * 110);
      if (m.type === 'dungeon') expect(m.width * m.height, m.id).toBeGreaterThanOrEqual(120 * 96);
      if (m.type === 'town') expect(m.width * m.height, m.id).toBeGreaterThanOrEqual(96 * 76);
    }
  });

  it('fields keep a crowded, Ragnarok-like monster density', () => {
    for (const m of maps.filter((x) => x.type === 'field')) {
      const n = m.monsterSpawns.reduce((a, s) => a + s.count, 0);
      expect(n / (m.width * m.height), m.id).toBeGreaterThan(1 / 200);
    }
  });

  it('dungeon bosses wait in a large hall with no normal monster spawns', () => {
    for (const m of maps.filter((x) => x.type === 'dungeon' && x.bossSpawn)) {
      const cm = compileMap(data, m);
      const b = m.bossSpawn!;
      let open = 0;
      for (let y = b.y - 12; y <= b.y + 12; y++) for (let x = b.x - 12; x <= b.x + 12; x++) if (!cm.collision[y * cm.width + x]) open++;
      expect(open / 625, m.id).toBeGreaterThan(0.8);
      for (const s of m.monsterSpawns) {
        const inside = b.x >= s.area.x && b.x < s.area.x + s.area.w && b.y >= s.area.y && b.y < s.area.y + s.area.h;
        expect(inside, `${m.id} ${s.monsterId}`).toBe(false);
      }
    }
  });

  it('every town has its own street plan and every NPC stands next to a street', () => {
    const towns = ['willowbrook', 'aurelion', 'fernhollow', 'arcanthe', 'sandara', 'tidewatch', 'frostholm'];
    const plans = new Set<string>();
    for (const id of towns) {
      const def = data.maps.get(id)!;
      const cm = compileMap(data, def);
      // A fingerprint of the street grid: no two towns share one.
      plans.add(cm.ground.map((g) => (g === 'path_stone' || g === 'dirt' ? 1 : 0)).join(''));
      const roads = new Set(['path_stone', 'dirt']);
      for (const n of def.npcs) {
        const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has(cm.ground[(n.y + dy) * cm.width + n.x + dx]));
        expect(near, `${id} ${n.npcId}`).toBe(true);
        expect(cm.reachable[n.y * cm.width + n.x] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cm.reachable[(n.y + dy) * cm.width + n.x + dx]), `${id} ${n.npcId} reachable`).toBeTruthy();
      }
    }
    expect(plans.size).toBe(towns.length);
  });

  it('a long click across a big field still finds a path', () => {
    const m = data.maps.get('clover_hills')!;
    const c = newChar();
    const a = m.spawnPoints.from_sunny_meadow, b = m.spawnPoints.from_aurelion_fields_south;
    c.position = { mapId: m.id, x: a.x * TILE + 16, y: a.y * TILE + 16 };
    const w = newWorld(c);
    w.moveTo(b.x * TILE + 16, b.y * TILE + 16);
    expect(w.player.move?.path.length ?? 0).toBeGreaterThan(0);
  });

  it('far-away idle monsters doze; nearby ones still patrol', () => {
    const c = newChar();
    const area = data.maps.get('clover_hills')!.monsterSpawns[0].area;
    c.position = { mapId: 'clover_hills', x: (area.x + area.w / 2) * TILE, y: (area.y + area.h / 2) * TILE };
    const w = newWorld(c);
    w.godMode = true;
    const start = new Map([...w.monsters.values()].map((m) => [m.id, { x: m.x, y: m.y }]));
    run(w, 30000);
    const moved = (far: boolean) => [...w.monsters.values()].filter((m) => !m.dead && (Math.hypot(m.x - w.player.x, m.y - w.player.y) > DORMANT_RANGE + 200) === far)
      .filter((m) => { const s = start.get(m.id)!; return Math.hypot(m.x - s.x, m.y - s.y) > 4; }).length;
    expect(moved(true)).toBe(0);
    expect(moved(false)).toBeGreaterThan(0);
  });
});
