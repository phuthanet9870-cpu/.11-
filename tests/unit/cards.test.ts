import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '../../src/core/inventory';
import { compoundCard, compoundTargets, freeSlots } from '../../src/core/cards';
import { computeDerivedStats } from '../../src/core/formulas';
import { refineItem } from '../../src/core/refine';
import { data, newChar } from '../helpers/fixtures';

describe('monster cards', () => {
  it('every monster has exactly one card and drops it at the configured (0.01%) rate', () => {
    for (const m of data.monsters.values()) {
      const cards = [...data.items.values()].filter((i) => i.card?.monsterId === m.id);
      expect(cards).toHaveLength(1);
      const entry = data.drops.get(m.dropTableId)!.entries.find((e) => e.itemId === cards[0].id);
      expect(entry?.chance).toBe(data.balance.drops.cardChance);
    }
    expect(data.balance.drops.cardChance).toBe(0.0001);
  });

  it('compounds only into matching, unequipped equipment with a free slot', () => {
    const c = newChar();
    const card = [...data.items.values()].find((i) => i.card?.equip === 'weapon' && i.card.mods.patk)!;
    addItem(data, c, card.id, 4);
    addItem(data, c, 'training_knife', 1); // dagger: 3 slots
    addItem(data, c, 'cotton_shirt', 1);
    const knife = c.inventory.find((i) => i.itemId === 'training_knife')!;
    const shirt = c.inventory.find((i) => i.itemId === 'cotton_shirt')!;
    expect(compoundTargets(data, c, card.id).map((i) => i.uid)).toEqual([knife.uid]);
    const cardUid = () => c.inventory.find((i) => i.itemId === card.id)!.uid;
    expect(compoundCard(data, c, cardUid(), shirt.uid).ok).toBe(false);
    for (let i = 0; i < 3; i++) expect(compoundCard(data, c, cardUid(), knife.uid).ok).toBe(true);
    expect(freeSlots(data.items.get('training_knife')!, knife)).toBe(0);
    expect(compoundCard(data, c, cardUid(), knife.uid).ok).toBe(false);
    expect(countItem(c, card.id)).toBe(1);
  });

  it('card bonuses apply while the item is worn', () => {
    const c = newChar();
    const card = [...data.items.values()].find((i) => i.card?.equip === 'weapon' && i.card.mods.patk)!;
    addItem(data, c, card.id, 1); addItem(data, c, 'oak_club', 1);
    const club = c.inventory.find((i) => i.itemId === 'oak_club')!;
    compoundCard(data, c, c.inventory.find((i) => i.itemId === card.id)!.uid, club.uid);
    c.equipment.weapon = club; c.inventory = c.inventory.filter((i) => i !== club);
    const withCard = computeDerivedStats(data, c).patk;
    club.cards = [];
    expect(withCard - computeDerivedStats(data, c).patk).toBe(card.card!.mods.patk);
  });

  it('a destroyed (failed refine) item takes its cards with it', () => {
    const c = newChar(); c.luma = 99999;
    const card = [...data.items.values()].find((i) => i.card?.equip === 'weapon')!;
    addItem(data, c, card.id, 1); addItem(data, c, 'training_knife', 1); addItem(data, c, 'glimmer_ore', 10);
    const knife = c.inventory.find((i) => i.itemId === 'training_knife')!;
    compoundCard(data, c, c.inventory.find((i) => i.itemId === card.id)!.uid, knife.uid);
    for (let i = 0; i < 7; i++) refineItem(data, c, knife.uid, 0);
    const r = refineItem(data, c, knife.uid, 0.999);
    expect(r.outcome).toBe('broken');
    expect(r.ok && r.message).toContain('card');
    expect(c.inventory.some((i) => i.cards?.length)).toBe(false);
  });
});

describe('MVP system and feather', () => {
  it('killing a boss alive makes the player MVP: bonus EXP, banner event, tombstone until respawn', async () => {
    const { newWorld, run } = await import('../helpers/fixtures');
    const { gmTeleport, gmKillAll } = await import('../../src/core/gm');
    const w = newWorld();
    gmTeleport(w, 'whispering_forest');
    const boss = [...w.monsters.values()].find((m) => m.boss)!;
    w.godMode = true;
    w.drainEvents();
    gmKillAll(w, true);
    const ev = w.drainEvents();
    const mvp = ev.find((e) => e.type === 'mvp');
    expect(mvp && mvp.type === 'mvp' && mvp.exp).toBeGreaterThan(0);
    const t = w.tombstones[boss.boss!.def.id];
    expect(t?.killer).toBe(w.char.name);
    expect(t.mapId).toBe('whispering_forest');
    run(w, (data.maps.get('whispering_forest')!.bossSpawn!.respawnSeconds + 1) * 1000, 100);
    expect(w.tombstones[boss.boss!.def.id]).toBeUndefined();
    expect([...w.monsters.values()].some((m) => m.boss && !m.dead)).toBe(true);
  });

  it('no MVP if the top damage dealer is dead', async () => {
    const { newWorld } = await import('../helpers/fixtures');
    const { gmTeleport } = await import('../../src/core/gm');
    const w = newWorld();
    gmTeleport(w, 'whispering_forest');
    const boss = [...w.monsters.values()].find((m) => m.boss)!;
    w.player.dead = true;
    boss.damageBy.player = boss.hp;
    w.damageMonster(boss, boss.hp, 'physical', 'neutral', false, false, true);
    expect(w.drainEvents().some((e) => e.type === 'mvp')).toBe(false);
  });

  it('Wandering Feather teleports to a random reachable spot on the same map', async () => {
    const { newWorld } = await import('../helpers/fixtures');
    const w = newWorld();
    addItem(data, w.char, 'wandering_feather', 1);
    const before = { x: w.player.x, y: w.player.y, map: w.map.def.id };
    expect(w.useItemById('wandering_feather').ok).toBe(true);
    expect(w.map.def.id).toBe(before.map);
    expect(w.player.x !== before.x || w.player.y !== before.y).toBe(true);
    const cx = Math.floor(w.player.x / 32), cy = Math.floor(w.player.y / 32);
    expect(w.map.reachable[cy * w.map.width + cx]).toBe(1);
  });
  it('Wraith Oil makes the weapon ghost for 10 minutes, then wears off', async () => {
    const { newWorld } = await import('../helpers/fixtures');
    const w = newWorld();
    addItem(data, w.char, 'wraith_oil', 1);
    expect(w.useItemById('wraith_oil').ok).toBe(true);
    w.update(16);
    expect(w.stats.weaponElement).toBe('ghost');
    for (let t = 0; t < 600_100; t += 100) w.update(100);
    expect(w.stats.weaponElement).toBe('neutral');
  });
});
