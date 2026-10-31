import { describe, expect, it } from 'vitest';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

function at(mapId: string, npcId: string, level = 40) {
  const c = newChar();
  c.baseLevel = level;
  const spot = data.maps.get(mapId)!.npcs.find((n) => n.npcId === npcId)!;
  c.position = { mapId, x: spot.x * 32 + 16, y: (spot.y + 1) * 32 + 16 };
  const w = newWorld(c, 7);
  w.update(16);
  return { c, w };
}

describe('training grounds and shadow arena', () => {
  it('the Drillmaster in Aurelion warps to both new maps', () => {
    const npc = data.npcs.get('training_master')!;
    const warp = npc.services.find((s) => s.type === 'warp') as { destinations: { mapId: string }[] };
    expect(warp.destinations.map((d) => d.mapId)).toEqual(expect.arrayContaining(['training_grounds', 'shadow_arena']));
    expect(data.maps.get('aurelion')!.npcs.some((n) => n.npcId === 'training_master')).toBe(true);
  });

  it('training dummies take damage, never die, never move and report the totals', () => {
    const { w } = at('training_grounds', 'training_master');
    const dummies = [...w.monsters.values()].filter((m) => m.def.id === 'training_dummy');
    expect(dummies.length).toBe(12);
    const d = dummies[0], x = d.x;
    for (let i = 0; i < 5; i++) w.damageMonster(d, 2_000_000, 'physical', 'neutral', false, false);
    expect(d.dead).toBe(false);
    expect(d.hp).toBeGreaterThan(0);
    run(w, 4000);
    expect(d.x).toBe(x);
    expect(d.hp).toBe(d.maxHp);
    expect(w.training).toBeNull();
  });

  it('shadow fighters copy the player, take random jobs and use skills', () => {
    const { w } = at('shadow_arena', 'shadow_arena_master');
    const r = w.startShadowDuel(3);
    expect(r.ok).toBe(true);
    const shadows = [...w.monsters.values()].filter((m) => m.shadow);
    expect(shadows.length).toBe(3);
    for (const m of shadows) {
      expect(m.def.maxHp).toBe(Math.round(w.stats.maxHp));
      expect(m.def.attack).toBe(Math.round(w.stats.patk));
      expect(m.def.level).toBe(w.char.baseLevel);
      expect(data.classes.has(m.shadow!.classId)).toBe(true);
      expect(m.shadow!.skills.length).toBeGreaterThan(0);
      for (const id of m.shadow!.skills) expect(data.skills.get(id)!.effects.some((e) => e.type === 'damage')).toBe(true);
    }
    // Let them fight: some skill effect from a shadow (cast from its own position) shows up.
    const seen: string[] = [];
    w.onEvent((e) => { if (e.type === 'fx' && e.skillId && e.fromX !== undefined) seen.push(e.skillId); });
    w.char.hp = w.stats.maxHp * 1000; w.player.hp = w.char.hp;
    for (let i = 0; i < 40 && !seen.length; i++) { run(w, 500); w.char.hp = Math.max(w.char.hp, 1000); }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('beating every shadow ends the duel; no rewards', () => {
    const { w, c } = at('shadow_arena', 'shadow_arena_master');
    w.startShadowDuel(2);
    const exp = c.baseExp;
    for (const m of [...w.monsters.values()]) if (m.shadow) { m.damageBy.player = 1; (w as unknown as { killMonster(x: typeof m): void }).killMonster(m); }
    w.update(50);
    expect(w.shadowDuel).toBeNull();
    expect(c.baseExp).toBe(exp);
  });

  it('the count is limited by the Shadow Keeper (1–5) and needs the keeper nearby', () => {
    const { w } = at('shadow_arena', 'shadow_arena_master');
    w.startShadowDuel(99);
    expect([...w.monsters.values()].filter((m) => m.shadow).length).toBe(5);
    const far = at('aurelion', 'aurelion_smith');
    expect(far.w.startShadowDuel(1).ok).toBe(false);
  });
});
