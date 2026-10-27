import { describe, expect, it } from 'vitest';
import { addItem, equipItem } from '../../src/core/inventory';
import { activeCombos, computeDerivedStats } from '../../src/core/formulas';
import { buildCharacter } from '../helpers/scenarios';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

describe('combos (item_combos style)', () => {
  it('a gear set gives its bonus only when every part is equipped', () => {
    const c = buildCharacter({ classId: 'rogue', base: 30, job: 20, stats: ['agi'], skills: [], gear: ['shadow_garb'] });
    const before = computeDerivedStats(data, c);
    expect(activeCombos(data, c)).not.toContain('set_shadow');
    addItem(data, c, 'gutting_knife', 1, { ignoreWeight: true });
    expect(equipItem(data, c, c.inventory.find((i) => i.itemId === 'gutting_knife')!.uid).ok).toBe(true);
    const after = computeDerivedStats(data, c);
    expect(after.activeCombos).toContain('set_shadow');
    const knife = data.items.get('gutting_knife')!;
    expect(after.flee - before.flee).toBe(8 + (knife.mods?.flee ?? 0));
  });

  it('a card combo works across different equipped items', () => {
    const cb = [...data.combos.values()].find((x) => x.parts.every((p) => p.startsWith('card_')))!;
    const c = newChar();
    const slots = ['weapon', 'armor', 'headgear', 'shield', 'garment', 'boots', 'accessory1'] as const;
    cb.parts.forEach((cardId, i) => { c.equipment[slots[i]] = { uid: `u${i}`, itemId: 'training_knife', qty: 1, cards: [cardId] }; });
    expect(activeCombos(data, c)).toContain(cb.id);
    c.equipment[slots[0]]!.cards = [];
    expect(activeCombos(data, c)).not.toContain(cb.id);
  });
});

describe('card album, autocast, elites, looters', () => {
  it('the card album turns into one random non-boss card', () => {
    const c = newChar();
    const w = newWorld(c);
    addItem(data, c, 'card_album', 3);
    for (let i = 0; i < 3; i++) { w.useItemById('card_album'); run(w, 1100); }
    const cards = c.inventory.filter((i) => data.items.get(i.itemId)?.type === 'card');
    expect(cards.reduce((a, x) => a + x.qty, 0)).toBe(3);
    for (const x of cards) expect(data.monsters.get(data.items.get(x.itemId)!.card!.monsterId)!.aiType).not.toBe('boss');
  });

  it('an autocast card casts its bolt on basic-attack hits, for free', () => {
    const card = [...data.items.values()].find((i) => i.card?.autocast)!;
    const c = buildCharacter({ classId: 'knight', base: 30, job: 20, stats: ['dex'], skills: [], gear: [] });
    c.equipment.weapon = { uid: 'w1', itemId: 'iron_sword', qty: 1, cards: [card.id] };
    // force the proc
    const ac = { ...card.card!.autocast!, chancePct: 100 };
    const w = newWorld(c);
    w.update(16);
    w.stats.autocasts = [ac];
    const m = w.spawnMonsterAt('leaf_slime', w.player.x + 30, w.player.y)!;
    m.hp = m.maxHp = 1e6;
    const mp = c.mp;
    w.attack(m.id);
    let casts = 0;
    for (let t = 0; t < 3000; t += 50) { w.update(50); casts += w.drainEvents().filter((e) => e.type === 'message' && e.text.startsWith('Autocast')).length; }
    expect(casts).toBeGreaterThan(0);
    expect(c.mp).toBeGreaterThanOrEqual(mp);
  });

  it('every field map with monsters has one elite mini-boss spawn', () => {
    const fields = [...data.maps.values()].filter((m) => m.type === 'field' && m.monsterSpawns.length && (m as { generated?: boolean }).generated);
    let withElite = 0;
    for (const f of fields) if (f.monsterSpawns.some((s) => data.monsters.get(s.monsterId)?.elite)) withElite++;
    expect(withElite).toBeGreaterThanOrEqual(10);
    const e = [...data.monsters.values()].find((m) => m.elite)!;
    const base = data.monsters.get(e.id.replace(/^elite_/, ''))!;
    expect(e.maxHp).toBe(base.maxHp * 6);
    expect(data.drops.get(e.dropTableId)!.entries.some((x) => x.itemId === 'card_album')).toBe(true);
  });

  it('looters pick up items left on the ground and drop them when killed', () => {
    const looter = [...data.monsters.values()].find((m) => m.looter && !m.elite)!;
    const c = newChar();
    const sp = data.maps.get('sunny_meadow')!.spawnPoints.default;
    c.position = { mapId: 'sunny_meadow', x: sp.x * 32 + 16, y: sp.y * 32 + 16 };
    const w = newWorld(c);
    const m = w.spawnMonsterAt(looter.id, w.player.x + 150, w.player.y)!;
    m.def = { ...m.def, aiType: 'passive' };
    const g = w.dropToGround('red_potion', 2, w.player.x + 100, w.player.y);
    run(w, 9000);
    expect(w.groundItems.has(g.id)).toBe(false);
    expect(m.loot).toEqual([{ itemId: 'red_potion', qty: 2, options: undefined }]);
    m.damageBy.player = 1;
    (w as unknown as { killMonster(x: typeof m): void }).killMonster(m);
    expect([...w.groundItems.values()].some((x) => x.itemId === 'red_potion' && x.qty === 2)).toBe(true);
  });
});
