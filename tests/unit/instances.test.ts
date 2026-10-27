import { describe, expect, it } from 'vitest';
import { data, newChar, newWorld, run } from '../helpers/fixtures';
import type { World } from '../../src/core/world';

function atKeeper(level = 50, nowRef = { t: 1_700_000_000_000 }) {
  const c = newChar();
  c.baseLevel = level;
  const town = data.maps.get('aurelion')!;
  const spot = town.npcs.find((n) => n.npcId === 'spire_warden')!;
  c.position = { mapId: 'aurelion', x: spot.x * 32 + 16, y: (spot.y + 1) * 32 + 16 };
  const w = newWorld(c, 5, () => nowRef.t);
  w.update(16);
  return { c, w, nowRef };
}

function clearFloor(w: World) {
  for (const m of w.monsters.values()) if (!m.dead) { m.damageBy.player = 1; (w as unknown as { killMonster(x: typeof m): void }).killMonster(m); }
  w.update(50);
}

function stepIntoPortal(w: World) {
  const pt = w.map.def.portals[0];
  w.player.x = (pt.x + 1.5) * 32; w.player.y = (pt.y + 3) * 32;
  w.update(50);
  w.moveTo((pt.x + 1.5) * 32, (pt.y + 1) * 32);
  run(w, 2000);
}

describe('memorial dungeons', () => {
  it('two instances with floors, time limits, cooldowns and keepers', () => {
    expect([...data.instances.keys()].sort()).toEqual(['endless_spire', 'sealed_crypt']);
    expect(data.instances.get('endless_spire')!.floors.length).toBe(10);
    for (const ins of data.instances.values()) {
      expect([...data.npcs.values()].some((n) => n.services.some((s) => s.type === 'instance' && s.instanceId === ins.id))).toBe(true);
      for (const f of ins.floors) expect(data.maps.get(f)!.monsterSpawns.length).toBeGreaterThan(0);
    }
  });

  it('requires the level and starts the cooldown on entry', () => {
    const low = atKeeper(10);
    expect(low.w.enterInstance('endless_spire').ok).toBe(false);
    const { w, nowRef } = atKeeper(50);
    expect(w.enterInstance('endless_spire').ok).toBe(true);
    expect(w.map.def.id).toBe('endless_spire_f1');
    expect(w.instanceCooldownLeft('endless_spire')).toBe(60 * 60000);
    nowRef.t += 30 * 60000;
    expect(w.instanceCooldownLeft('endless_spire')).toBe(30 * 60000);
  });

  it('portals stay sealed until the floor is cleared; monsters do not respawn', () => {
    const { w } = atKeeper(50);
    w.enterInstance('endless_spire');
    w.godMode = true;
    stepIntoPortal(w);
    expect(w.map.def.id).toBe('endless_spire_f1');
    clearFloor(w);
    expect(w.instance!.cleared).toBe(true);
    run(w, 60_000);
    expect([...w.monsters.values()].every((m) => m.dead)).toBe(true);
    stepIntoPortal(w);
    expect(w.map.def.id).toBe('endless_spire_f2');
    expect(w.instance!.floor).toBe(2);
    expect(w.instance!.cleared).toBe(false);
  });

  it('clearing the last floor gives the reward once; the exit leaves the instance', () => {
    const { w, c } = atKeeper(50);
    w.enterInstance('sealed_crypt'); // keeper is in another town: refused
    expect(w.instance).toBeNull();
    w.enterInstance('endless_spire');
    w.godMode = true;
    const def = data.instances.get('endless_spire')!;
    const luma = c.luma;
    for (let f = 1; f <= def.floors.length; f++) { clearFloor(w); stepIntoPortal(w); }
    expect(c.luma - luma).toBeGreaterThanOrEqual(def.reward.luma);
    expect(c.inventory.some((i) => i.itemId === 'card_album')).toBe(true);
    expect(w.map.def.id).toBe(def.exitMap);
    expect(w.instance).toBeNull();
    expect(c.flags.instclear_endless_spire).toBe(1);
  });

  it('running out of time pulls the player out', () => {
    const { w } = atKeeper(50);
    w.enterInstance('endless_spire');
    w.godMode = true;
    for (const m of w.monsters.values()) m.def = { ...m.def, aiType: 'passive' };
    run(w, 30 * 60000 + 500, 100);
    expect(w.instance).toBeNull();
    expect(w.map.def.id).toBe('aurelion');
  });
});
