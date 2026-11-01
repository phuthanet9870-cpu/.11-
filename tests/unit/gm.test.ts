import { describe, expect, it } from 'vitest';
import { countItem } from '../../src/core/inventory';
import {
  gmAddLevels, gmGiveItem, gmGiveLuma, gmGodMode, gmHeal, gmKillAll, gmQuest, gmSetClass, gmSpawn, gmTeleport,
} from '../../src/core/gm';
import { data, newWorld, run } from '../helpers/fixtures';

describe('GM / admin commands', () => {
  it('marks the save as GM-edited', () => {
    const w = newWorld();
    expect(w.char.flags.gmUsed).toBeUndefined();
    gmGiveLuma(w, 100);
    expect(w.char.flags.gmUsed).toBe(true);
  });

  it('levels up through the normal EXP path (points are granted)', () => {
    const w = newWorld();
    const sp = w.char.statPoints;
    gmAddLevels(w, 5, 3);
    expect(w.char.baseLevel).toBe(6);
    expect(w.char.jobLevel).toBe(4);
    expect(w.char.statPoints).toBeGreaterThan(sp);
  });

  it('gives items and Luma, rejects unknown ids', () => {
    const w = newWorld();
    expect(gmGiveItem(w, 'red_potion', 7).ok).toBe(true);
    expect(countItem(w.char, 'red_potion')).toBeGreaterThanOrEqual(7);
    expect(gmGiveItem(w, 'nope', 1).ok).toBe(false);
    const l = w.char.luma;
    gmGiveLuma(w, 500);
    expect(w.char.luma).toBe(l + 500);
  });

  it('god mode blocks damage; heal restores HP/MP', () => {
    const w = newWorld();
    gmGodMode(w, true);
    w.damagePlayer(30, 'physical', 'neutral', null, false);
    expect(w.char.hp).toBe(w.stats.maxHp);
    gmGodMode(w, false);
    w.damagePlayer(30, 'physical', 'neutral', null, false);
    expect(w.char.hp).toBeLessThan(w.stats.maxHp);
    gmHeal(w);
    expect(w.char.hp).toBe(w.stats.maxHp);
  });

  it('teleports to a map', () => {
    const w = newWorld();
    expect(gmTeleport(w, 'whispering_forest').ok).toBe(true);
    expect(w.map.def.id).toBe('whispering_forest');
    expect(gmTeleport(w, 'nowhere').ok).toBe(false);
  });

  it('spawned monsters reward normally and do not respawn', () => {
    const w = newWorld();
    gmTeleport(w, 'sunny_meadow');
    const before = new Set(w.monsters.keys());
    expect(gmSpawn(w, 'leaf_slime', 3).ok).toBe(true);
    const spawned = [...w.monsters.values()].filter((m) => !before.has(m.id));
    expect(spawned).toHaveLength(3);
    const exp = w.char.baseExp, kills = w.char.stats_meta.kills;
    gmKillAll(w);
    expect(w.char.stats_meta.kills).toBeGreaterThan(kills);
    expect(w.char.baseExp + w.char.baseLevel).toBeGreaterThan(exp + 1);
    run(w, 3000);
    for (const m of spawned) expect(w.monsters.has(m.id)).toBe(false);
  });

  it('changes class without requirements', () => {
    const w = newWorld();
    expect(gmSetClass(w, 'mage').ok).toBe(true);
    expect(w.char.classId).toBe('mage');
    expect(w.char.jobLevel).toBe(1);
  });

  it('fills quest objectives so the quest is ready, and resets it', () => {
    const w = newWorld();
    const q = [...data.quests.values()][0];
    gmQuest(w, q.id, 'complete');
    expect(['ready', 'active']).toContain(w.char.quests[q.id].status);
    gmQuest(w, q.id, 'reset');
    expect(w.char.quests[q.id]).toBeUndefined();
  });
});
