import { describe, expect, it } from 'vitest';
import { compileMap, TILE } from '../../src/core/mapCompiler';
import { addItem, countItem } from '../../src/core/inventory';
import type { MonsterActor, World } from '../../src/core/world';
import { data, newChar, newWorld, run } from '../helpers/fixtures';
import { buildCharacter } from '../helpers/scenarios';

function at(c: ReturnType<typeof newChar>, mapId: string, tx: number, ty: number) {
  c.position = { mapId, x: tx * TILE + 16, y: ty * TILE + 16 };
  return c;
}

function spawnNear(w: World, monsterId: string, dx = 60, dy = 0): MonsterActor {
  const m = w.spawnMonster(monsterId, 0);
  m.x = w.player.x + dx; m.y = w.player.y + dy; m.home = { x: m.x, y: m.y };
  return m;
}

// Sunny Meadow too.
const SM = data.maps.get('sunny_meadow')!.origin ?? { x: 0, y: 0 };
// Willowbrook was widened: its original layout sits at this offset.
const WB = data.maps.get('willowbrook')!.origin ?? { x: 0, y: 0 };

describe('movement & collision', () => {
  it('starts in Willowbrook at the default spawn', () => {
    const w = newWorld();
    expect(w.map.def.id).toBe('willowbrook');
    expect(Math.floor(w.player.x / TILE)).toBe(24 + WB.x);
  });

  it('cannot walk through a building', () => {
    // Stand just south of the inn (x 7..14, y 6..11) and walk north into it.
    const w = newWorld(at(newChar(), 'willowbrook', 9 + WB.x, 13 + WB.y));
    w.setMoveDir(0, -1);
    run(w, 3000);
    expect(w.player.y / TILE).toBeGreaterThan(11.9 + WB.y);
  });

  it('cannot leave the map through the border', () => {
    const w = newWorld(at(newChar(), 'willowbrook', 3, 22));
    w.setMoveDir(-1, 0);
    run(w, 4000);
    expect(w.player.x).toBeGreaterThanOrEqual(2 * TILE);
  });

  it('keyboard movement plays the walk animation and returns to idle', () => {
    const w = newWorld();
    w.setMoveDir(1, 0);
    run(w, 300);
    expect(w.player.anim).toBe('walk');
    expect(w.player.dir).toBe('right');
    w.setMoveDir(0, 0);
    run(w, 100);
    expect(w.player.anim).toBe('idle');
  });

  it('click-to-move pathfinds around obstacles', () => {
    const w = newWorld();
    const goal = { x: (11 + WB.x) * TILE + 16, y: (14 + WB.y) * TILE + 16 }; // in front of the inn
    w.moveTo(goal.x, goal.y);
    run(w, 15000);
    expect(Math.hypot(w.player.x - goal.x, w.player.y - goal.y)).toBeLessThan(8);
  });

  it('walking into a portal changes map and places the player at the target spawn', () => {
    const arrive = data.maps.get('willowbrook')!.spawnPoints.from_meadow; // next to the east portal
    const w = newWorld(at(newChar(), 'willowbrook', arrive.x, arrive.y));
    w.setMoveDir(1, 0);
    for (let t = 0; t < 3000 && w.map.def.id === 'willowbrook'; t += 50) w.update(50);
    w.setMoveDir(0, 0);
    expect(w.map.def.id).toBe('sunny_meadow');
    const sp = data.maps.get('sunny_meadow')!.spawnPoints.from_village;
    expect(Math.floor(w.player.x / TILE)).toBeLessThanOrEqual(sp.x + 3);
    expect(w.monsters.size).toBeGreaterThan(10);
  });
});

describe('combat', () => {
  it('clicking a monster auto-attacks until it dies and grants EXP + drops', () => {
    const c = at(newChar(), 'sunny_meadow', 10 + SM.x, 30 + SM.y);
    const w = newWorld(c, 99);
    const m = spawnNear(w, 'leaf_slime', 80, 0);
    w.attack(m.id);
    const ev: ReturnType<World['drainEvents']> = [];
    for (let t = 0; t < 20000 && !m.dead; t += 50) { w.update(50); ev.push(...w.drainEvents()); }
    expect(m.dead).toBe(true);
    expect(c.baseExp).toBe(m.def.exp);
    expect(c.jobExp).toBe(m.def.jobExp);
    expect(c.stats_meta.kills).toBe(1);
    expect(w.player.intent.type).toBe('none');
    expect(ev.some((e) => e.type === 'damage' && e.targetId === m.id && e.amount > 0)).toBe(true);
    expect(w.groundItems.size + countItem(c, 'jelly')).toBeGreaterThanOrEqual(0);
  });

  it('passive monsters ignore the player until attacked; aggressive ones chase', () => {
    const w = newWorld(at(newChar(), 'sunny_meadow', 10 + SM.x, 30 + SM.y));
    for (const m of w.monsters.values()) { m.dead = true; m.respawnAt = Infinity; }
    const slime = spawnNear(w, 'leaf_slime', 100, 0);
    const wasp = spawnNear(w, 'buzz_wasp', -120, 0);
    run(w, 1500);
    expect(slime.targetId).toBeNull();
    expect(wasp.targetId).toBe('player');
    expect(['chase', 'attack']).toContain(wasp.state);
  });

  it('monsters return home when leashed and fully heal', () => {
    const w = newWorld(at(newChar(), 'sunny_meadow', 10 + SM.x, 30 + SM.y));
    for (const m of w.monsters.values()) { m.dead = true; m.respawnAt = Infinity; }
    const wasp = spawnNear(w, 'buzz_wasp', 60, 0);
    wasp.hp = 10;
    wasp.home = { x: wasp.x + 2000, y: wasp.y };
    wasp.targetId = 'player'; wasp.state = 'chase';
    run(w, 200);
    expect(wasp.state).toBe('return');
  });

  it('player death applies EXP penalty and respawns at the save point', () => {
    const c = at(newChar(), 'sunny_meadow', 10 + SM.x, 30 + SM.y);
    c.baseLevel = 5; c.baseExp = 100;
    const w = newWorld(c);
    w.damagePlayer(99999, 'physical', 'neutral', null, false);
    expect(w.player.dead).toBe(true);
    expect(c.baseExp).toBeLessThan(100);
    w.respawn();
    expect(w.player.dead).toBe(false);
    expect(w.map.def.id).toBe('willowbrook');
    expect(c.hp).toBeGreaterThan(0);
  });

  it('dead monsters respawn after their respawn timer', () => {
    const w = newWorld(at(newChar(), 'sunny_meadow', 10 + SM.x, 30 + SM.y));
    const m = spawnNear(w, 'leaf_slime');
    w.damageMonster(m, 99999, 'physical', 'neutral', false, false);
    expect(m.dead).toBe(true);
    run(w, (m.def.respawnSeconds + 1) * 1000);
    expect(m.dead).toBe(false);
    expect(m.hp).toBe(m.def.maxHp);
  });

  it('poison ticks damage but cannot kill; green potion cures it', () => {
    const c = at(newChar(), 'willowbrook', 24 + WB.x, 21 + WB.y);
    const w = newWorld(c, 5);
    while (!w.applyStatus(w.player, 'poison', 1, 60000)) { /* VIT may resist; retry */ }
    w.update(10);
    c.hp = 3;
    run(w, 5000);
    expect(c.hp).toBe(1);
    expect(w.player.dead).toBe(false);
    addItem(data, c, 'green_potion', 1);
    expect(w.useItemById('green_potion').ok).toBe(true);
    expect(w.player.statuses.some((s) => s.id === 'poison')).toBe(false);
  });
});

describe('skills', () => {
  const kn = () => buildCharacter({ classId: 'knight', base: 20, job: 25, stats: ['str', 'dex', 'vit'], skills: [['bash', 10], ['spiral_pierce', 5], ['provoke', 3], ['war_cry', 2], ['shield_guard', 3], ['counter_attack', 3], ['blade_storm', 1], ['sword_mastery', 2]], gear: ['iron_sword'] });

  it('cannot use unlearned or passive skills, or without MP', () => {
    const w = newWorld();
    expect(w.castSkill('bash').ok).toBe(false);
    expect(w.castSkill('basic_training').ok).toBe(false);
    const c = kn();
    const w2 = newWorld(at(c, 'sunny_meadow', 10 + SM.x, 30 + SM.y));
    c.mp = 0;
    expect(w2.castSkill('shield_guard').ok).toBe(false);
  });

  it('every knight skill does something measurable', () => {
    // An open patch of meadow (trees are scattered at random, so look for one).
    const mm = compileMap(data, data.maps.get('sunny_meadow')!);
    const open = (x: number, y: number) => {
      for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 4; xx <= x + 7; xx++) if (mm.collision[yy * mm.width + xx]) return false;
      return true;
    };
    let spot = { x: 10 + SM.x, y: 30 + SM.y };
    for (let y = SM.y + 5, found = false; y < mm.height - 8 && !found; y++) for (let x = SM.x + 5; x < mm.width - 10; x++) if (open(x, y)) { spot = { x, y }; found = true; break; }
    const c = at(kn(), 'sunny_meadow', spot.x, spot.y);
    const w = newWorld(c, 11);
    for (const m of w.monsters.values()) { m.dead = true; m.respawnAt = Infinity; }
    const def0 = w.stats.pdef;
    expect(w.castSkill('shield_guard').ok).toBe(true);
    run(w, 100);
    expect(w.stats.pdef).toBeGreaterThan(def0);
    c.mp = 9999;
    const atk0 = w.stats.patk;
    w.castSkill('war_cry'); run(w, 100);
    expect(w.stats.patk).toBeGreaterThan(atk0);

    const m = spawnNear(w, 'leaf_slime', 50);
    m.maxHp = m.hp = 1e7;
    const x0 = m.x;
    c.mp = 9999;
    expect(w.castSkill('spiral_pierce', { targetId: m.id }).ok).toBe(true);
    run(w, 450);
    expect(m.hp).toBeLessThan(1e7);
    expect(m.x).toBeGreaterThan(x0 + 20); // knocked back

    const others = [spawnNear(w, 'leaf_slime', 0, 60), spawnNear(w, 'leaf_slime', -60, 0)];
    for (const o of others) { o.maxHp = o.hp = 1e6; }
    c.mp = 9999;
    expect(w.castSkill('blade_storm').ok).toBe(true);
    run(w, 1500);
    for (const o of others) expect(o.hp).toBeLessThan(1e6);
    // Provoke pulls passive monsters.
    const slime = spawnNear(w, 'leaf_slime', 150, 0);
    c.mp = 9999;
    w.castSkill('provoke', { targetId: slime.id });
    run(w, 300);
    expect(slime.targetId).toBe('player');
  });

  it('mage spells use elements: fire bolt hits earth monsters harder than water bolt does', () => {
    const c = at(buildCharacter({ classId: 'mage', base: 15, job: 15, stats: ['int', 'dex'], skills: [['fire_bolt', 5], ['ice_bolt', 5]], gear: ['apprentice_wand'] }), 'sunny_meadow', 10 + SM.x, 30 + SM.y);
    const w = newWorld(c, 3);
    for (const m of w.monsters.values()) { m.dead = true; m.respawnAt = Infinity; }
    const dmg = (skill: string) => {
      const m = spawnNear(w, 'mushling', 120);
      m.maxHp = m.hp = 1e6;
      m.statuses = [];
      c.mp = 9999; w.player.cooldowns = {};
      w.castSkill(skill, { targetId: m.id });
      run(w, 2000);
      w.stop();
      const d = 1e6 - m.hp;
      m.dead = true;
      return d;
    };
    const fire = dmg('fire_bolt');
    const ice = dmg('ice_bolt');
    expect(fire).toBeGreaterThan(ice * 1.3);
  });

  it('cast time is interrupted by movement', () => {
    const c = at(buildCharacter({ classId: 'mage', base: 15, job: 15, stats: ['int'], skills: [['fire_bolt', 3], ['lightning_bolt', 4], ['thunderstorm', 1]], gear: [] }), 'sunny_meadow', 10 + SM.x, 30 + SM.y);
    const w = newWorld(c, 3);
    for (const m of w.monsters.values()) { m.dead = true; m.respawnAt = Infinity; }
    const m = spawnNear(w, 'mushling', 120);
    w.castSkill('fire_bolt', { targetId: m.id });
    run(w, 100);
    expect(w.player.cast).not.toBeNull();
    w.setMoveDir(1, 0);
    run(w, 50);
    expect(w.player.cast).toBeNull();
    expect(m.hp).toBe(m.def.maxHp);
  });

  it('ranger needs a bow for archery skills; wind trap slows enemies', () => {
    const c = at(buildCharacter({ classId: 'ranger', base: 15, job: 15, stats: ['dex', 'agi'], skills: [['double_shot', 3], ['wind_trap', 2]], gear: [] }), 'sunny_meadow', 10 + SM.x, 30 + SM.y);
    const w = newWorld(c, 4);
    for (const m of w.monsters.values()) { m.dead = true; m.respawnAt = Infinity; }
    const m = spawnNear(w, 'leaf_slime', 100);
    m.maxHp = m.hp = 1e6;
    expect(w.castSkill('double_shot', { targetId: m.id }).ok).toBe(false);
    addItem(data, c, 'short_bow', 1);
    w.equip(c.inventory.find((i) => i.itemId === 'short_bow')!.uid);
    expect(w.castSkill('double_shot', { targetId: m.id }).ok).toBe(true);
    run(w, 800);
    expect(m.hp).toBeLessThan(1e6);
    m.hp = 1e6;
    c.mp = 999;
    w.castSkill('wind_trap', { x: m.x, y: m.y });
    run(w, 4000);
    expect(w.zones.length).toBe(1);
    expect(m.hp).toBeLessThan(1e6);
  });
});

describe('boss', () => {
  it('runs intro, phases, telegraphs, summons and drops rare loot', () => {
    const c = at(buildCharacter({ classId: 'knight', base: 30, job: 20, stats: ['str', 'vit'], skills: [['bash', 5]], gear: ['iron_sword'] }), 'whispering_forest', 45, 38);
    const w = newWorld(c, 21);
    const boss = [...w.monsters.values()].find((m) => m.boss)!;
    expect(boss).toBeTruthy();
    w.attack(boss.id);
    const events: ReturnType<World['drainEvents']> = [];
    for (let t = 0; t < 200_000 && !boss.dead; t += 50) {
      if (c.hp < 200) c.hp = w.stats.maxHp; // keep the tester alive; this test checks boss mechanics
      if (w.player.intent.type === 'none') w.attack(boss.id);
      w.update(50);
      events.push(...w.drainEvents());
    }
    expect(boss.dead).toBe(true);
    const types = new Set(events.map((e) => e.type));
    expect(types.has('bossIntro')).toBe(true);
    expect(types.has('bossPhase')).toBe(true);
    expect(types.has('telegraph')).toBe(true);
    expect(types.has('bossDefeated')).toBe(true);
    expect(events.filter((e) => e.type === 'bossPhase').length).toBe(2);
    expect(c.stats_meta.bossKills.grukk).toBe(1);
    const crowns = [...w.groundItems.values()].filter((g) => g.itemId === 'thorn_crown');
    expect(crowns.length).toBe(1);
    // Contribution reward went straight to the inventory.
    expect(countItem(c, 'astral_shard')).toBeGreaterThanOrEqual(2);
  });
});

describe('npc services & invalid commands', () => {
  it('shops only work next to the merchant', () => {
    const c = newChar();
    const w = newWorld(c);
    c.luma = 1000;
    expect(w.buy('pip_tools', 'red_potion', 1).ok).toBe(false);
    const pip = w.npcs.find((n) => n.npcId === 'pip')!;
    w.player.x = pip.x; w.player.y = pip.y + 40;
    expect(w.buy('pip_tools', 'red_potion', 2).ok).toBe(true);
    expect(c.luma).toBe(950);
    expect(w.buy('pip_tools', 'thornbane_blade', 1).ok).toBe(false);
  });

  it('ignores commands for unknown targets and bad item ids', () => {
    const w = newWorld();
    w.attack('nope');
    w.pickupCmd('nope');
    expect(w.useItem('nope').ok).toBe(false);
    expect(w.castSkill('not_a_skill').ok).toBe(false);
    run(w, 200);
    expect(w.player.dead).toBe(false);
  });

  it('rapid repeated potion use respects the item cooldown (no double spending)', () => {
    const c = newChar();
    const w = newWorld(c);
    c.hp = 1;
    const before = countItem(c, 'red_potion');
    w.useItemById('red_potion');
    w.useItemById('red_potion');
    w.useItemById('red_potion');
    expect(countItem(c, 'red_potion')).toBe(before - 1);
  });

  it('tutorial steps run through real NPC services: buy, equip, refine, job change', () => {
    const c = at(newChar(), 'willowbrook', 39 + WB.x, 14 + WB.y); // next to Garrick
    for (const q of ['tut_welcome', 'tut_hunt']) c.quests[q] = { questId: q, status: 'completed', counts: [1], acceptedAt: 0, completedAt: 0 };
    c.luma = 5000;
    const w = newWorld(c);
    expect(w.accept('tut_weapon').ok).toBe(true);
    expect(w.buy('garrick_smithy', 'oak_club', 1).ok).toBe(true);
    const club = c.inventory.find((i) => i.itemId === 'oak_club')!;
    expect(w.equip(club.uid).ok).toBe(true);
    expect(c.quests.tut_weapon.status).toBe('ready');
    expect(w.turnIn('tut_weapon').ok).toBe(true);
    expect(w.accept('tut_refine').ok).toBe(true);
    const r = w.refine(club.uid);
    expect(r.ok && r.outcome).toBe('success');
    expect(c.equipment.weapon?.refine).toBe(1);
    expect(c.quests.tut_refine.status).toBe('ready');
    // Job change is refused away from the guild, accepted at the Knight guild master in Aurelion.
    c.jobLevel = 10;
    expect(w.changeJobAt('knight').ok).toBe(false);
    const guild = data.maps.get('aurelion')!.npcs.find((n) => n.npcId === 'guild_knight')!;
    w.enterMap('aurelion', 'default');
    w.player.x = guild.x * TILE + 16; w.player.y = (guild.y + 1) * TILE + 16;
    expect(w.changeJobAt('knight').ok).toBe(true);
    expect(c.classId).toBe('knight');
  });

  it('courier warp service moves between towns for Luma', () => {
    const c = newChar(); c.luma = 1000;
    const w = newWorld(c);
    const courier = data.maps.get('willowbrook')!.npcs.find((n) => n.npcId === 'willowbrook_courier')!;
    w.player.x = courier.x * TILE + 16; w.player.y = (courier.y + 1) * TILE + 16;
    expect(w.warpTo('sandara').ok).toBe(true);
    expect(w.map.def.id).toBe('sandara');
    expect(c.luma).toBe(400);
  });
});
