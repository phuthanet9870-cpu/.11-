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
  it('training and arena are separate: each has its own warp NPC in Aurelion', () => {
    const dests = (id: string) => (data.npcs.get(id)!.services.find((s) => s.type === 'warp') as { destinations: { mapId: string }[] }).destinations.map((d) => d.mapId);
    expect(dests('training_master')).toEqual(['aurelion', 'training_grounds']);
    expect(dests('arena_gatekeeper')).toEqual(['aurelion', 'shadow_arena']);
    for (const id of ['training_master', 'arena_gatekeeper']) expect(data.maps.get('aurelion')!.npcs.some((n) => n.npcId === id)).toBe(true);
    expect(data.maps.get('training_grounds')!.npcs.map((n) => n.npcId)).toEqual(['training_master']);
    expect(data.maps.get('shadow_arena')!.npcs.map((n) => n.npcId).sort()).toEqual(['arena_gatekeeper', 'shadow_arena_master']);
    expect(data.maps.get('training_grounds')!.width).toBeGreaterThanOrEqual(60);
    expect(data.maps.get('shadow_arena')!.width).toBeGreaterThanOrEqual(56);
  });

  it('training dummies take damage, never die, never move and report the totals', () => {
    const { w } = at('training_grounds', 'training_master');
    const dummies = [...w.monsters.values()].filter((m) => m.def.id === 'training_dummy');
    expect(dummies.length).toBe(32);
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

  it('the count is limited by the Shadow Keeper (1–10) and needs the keeper nearby', () => {
    const { w } = at('shadow_arena', 'shadow_arena_master');
    w.startShadowDuel(99);
    expect([...w.monsters.values()].filter((m) => m.shadow).length).toBe(10);
    const far = at('aurelion', 'aurelion_smith');
    expect(far.w.startShadowDuel(1).ok).toBe(false);
  });

  it('arena modes: chosen and random jobs, difficulty scaling, hired allies fight the enemy', () => {
    const { w, c } = at('shadow_arena', 'shadow_arena_master');
    c.luma = 1_000_000;
    const r = w.startArena({ size: 5, difficulty: 'easy', enemies: ['knight', null, 'mage', null, null], allies: ['cleric', null, null, null] });
    expect(r.ok).toBe(true);
    const enemies = [...w.monsters.values()].filter((m) => m.shadow?.team === 'enemy'), allies = [...w.monsters.values()].filter((m) => m.shadow?.team === 'ally');
    expect(enemies.length).toBe(5); expect(allies.length).toBe(4);
    expect(enemies[0].shadow!.classId).toBe('knight'); expect(enemies[2].shadow!.classId).toBe('mage'); expect(allies[0].shadow!.classId).toBe('cleric');
    expect(enemies[0].def.maxHp).toBe(Math.round(w.stats.maxHp * 0.6));
    expect(allies[0].def.maxHp).toBe(Math.round(w.stats.maxHp));
    expect(c.luma).toBe(1_000_000 - 4 * w.arenaHireCost());
    // The player cannot hurt allies; allies and enemies fight each other.
    const ally = allies[0], hp = ally.hp;
    w.damageMonster(ally, 999999, 'physical', 'neutral', false, false);
    expect(ally.hp).toBe(hp);
    w.char.hp = 1e9; w.player.hp = 1e9;
    const enemyHp0 = enemies.reduce((s, m) => s + m.hp, 0);
    for (let i = 0; i < 60; i++) { run(w, 250); w.char.hp = 1e9; w.player.hp = 1e9; }
    const enemyHp1 = enemies.reduce((s, m) => s + (m.dead ? 0 : m.hp), 0);
    expect(enemyHp1).toBeLessThan(enemyHp0);
  });

  it('hiring needs Luma; size caps the allies; victory when every enemy falls', () => {
    const { w, c } = at('shadow_arena', 'shadow_arena_master');
    c.luma = 0;
    expect(w.startArena({ size: 3, difficulty: 'normal', enemies: [], allies: [null] }).ok).toBe(false);
    expect(w.startArena({ size: 1, difficulty: 'normal', enemies: [], allies: [null, null] }).ok).toBe(true);
    expect([...w.monsters.values()].filter((m) => m.shadow?.team === 'ally').length).toBe(0);
    const events: string[] = [];
    w.onEvent((e) => { if (e.type === 'arenaResult') events.push(e.win ? 'win' : 'lose'); });
    for (const m of [...w.monsters.values()]) if (m.shadow) { m.damageBy.player = 1; (w as unknown as { killMonster(x: typeof m): void }).killMonster(m); }
    w.update(50);
    expect(events).toEqual(['win']);
  });
});
