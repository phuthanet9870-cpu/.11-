import { describe, expect, it } from 'vitest';
import { validateGameData } from '../../src/core/data';
import { compileMap, TILE } from '../../src/core/mapCompiler';
import { data } from '../helpers/fixtures';

describe('game data', () => {
  it('passes cross-reference validation', () => {
    expect(validateGameData(data)).toEqual([]);
  });

  it('meets content targets (30 maps, RO-style regions)', () => {
    expect([...data.maps.keys()]).toEqual(expect.arrayContaining(['willowbrook', 'sunny_meadow', 'whispering_forest', 'aurelion', 'sandara', 'ravenhold_crypt']));
    const world = [...data.maps.values()].filter((m) => m.type !== 'instance');
    expect(world.length).toBe(30);
    expect(new Set(world.map((m) => m.region)).size).toBeGreaterThanOrEqual(9);
    expect([...data.maps.values()].filter((m) => m.type === 'town').length).toBe(7);
    expect(['knight', 'ranger', 'mage'].every((c) => data.classes.has(c))).toBe(true);
    const normal = [...data.monsters.values()].filter((m) => m.aiType !== 'boss');
    expect(normal.length).toBeGreaterThanOrEqual(8);
    expect(data.bosses.size).toBeGreaterThanOrEqual(1);
    expect(data.quests.size).toBe(5);
    for (const cls of ['knight', 'ranger', 'mage']) {
      const skills = data.classes.get(cls)!.skills.map((s) => data.skills.get(s)!);
      expect(skills.length).toBeGreaterThanOrEqual(8);
      expect(skills.some((s) => s.kind === 'ultimate')).toBe(true);
      expect(skills.some((s) => s.kind === 'passive')).toBe(true);
      expect(skills.some((s) => s.kind === 'buff')).toBe(true);
      // Every skill must have a gameplay effect (not just a name).
      for (const s of skills) expect(s.effects.length > 0 || !!s.passive).toBe(true);
    }
  });

  it('every monster spawned on a map has the documented data fields', () => {
    const slime = data.monsters.get('leaf_slime')!;
    expect(slime).toMatchObject({ level: 1, element: 'earth', maxHp: 80, attack: 8, defense: 2, exp: 12, jobExp: 8, aiType: 'passive', respawnSeconds: 12 });
  });
});

describe('maps', () => {
  for (const def of data.maps.values()) {
    describe(def.id, () => {
      const map = compileMap(data, def);
      const reach = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.reachable[y * map.width + x] === 1;
      const reachNear = (x: number, y: number, r = 1) => {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (reach(x + dx, y + dy)) return true;
        return false;
      };

      it('has a closed border except at portals', () => {
        for (let x = 0; x < map.width; x++) {
          for (const y of [0, map.height - 1]) {
            const inPortal = def.portals.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
            if (!inPortal) expect(map.collision[y * map.width + x], `(${x},${y})`).toBe(1);
          }
        }
        for (let y = 0; y < map.height; y++) {
          for (const x of [0, map.width - 1]) {
            const inPortal = def.portals.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
            if (!inPortal) expect(map.collision[y * map.width + x], `(${x},${y})`).toBe(1);
          }
        }
      });

      it('all spawn points are reachable', () => {
        for (const [k, s] of Object.entries(def.spawnPoints)) expect(reach(s.x, s.y), k).toBe(true);
      });

      it('all portals can be walked into', () => {
        for (const p of def.portals) {
          let ok = false;
          for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (reach(x, y)) ok = true;
          expect(ok, p.id).toBe(true);
        }
      });

      it('all NPCs and interactive objects can be reached', () => {
        for (const n of def.npcs) expect(reachNear(n.x, n.y), n.npcId).toBe(true);
        for (const o of def.objects) {
          const placed = map.objects.find((p) => p.id === o.id)!;
          expect(placed, o.id).toBeTruthy();
          let ok = false;
          for (let y = placed.y - 1; y <= placed.y + placed.h; y++) for (let x = placed.x - 1; x <= placed.x + placed.w; x++) if (reach(x, y)) ok = true;
          expect(ok, o.id).toBe(true);
        }
      });

      it('monster spawn areas contain enough reachable ground', () => {
        for (const s of def.monsterSpawns) {
          let n = 0;
          for (let y = s.area.y; y < s.area.y + s.area.h; y++) for (let x = s.area.x; x < s.area.x + s.area.w; x++) if (reach(x, y)) n++;
          expect(n, s.monsterId).toBeGreaterThanOrEqual(s.count * 2);
        }
        if (def.bossSpawn) expect(reach(def.bossSpawn.x, def.bossSpawn.y)).toBe(true);
      });

      it('blocks every tree, building and wall cell', () => {
        for (const o of map.objects) if (o.blocks) expect(map.collision[o.y * map.width + o.x], `${o.kind}@${o.x},${o.y}`).toBe(1);
        for (const b of map.buildings) {
          for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) expect(map.collision[y * map.width + x]).toBe(1);
        }
        for (let i = 0; i < map.wall.length; i++) if (map.wall[i] && !data.tiles.get(map.wall[i]!)!.walkable) expect(map.collision[i]).toBe(1);
        expect(TILE).toBe(32);
      });
    });
  }
});
