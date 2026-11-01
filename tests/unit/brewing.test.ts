import { describe, expect, it } from 'vitest';
import { brew, BREW_RECIPES, brewChance } from '../../src/core/brewing';
import { addItem, countItem } from '../../src/core/inventory';
import { data, newChar, newWorld } from '../helpers/fixtures';

const stats = { dex: 30, luk: 10, int: 20 };
const alchemist = () => {
  const c = newChar();
  c.classId = 'alchemist'; c.jobLevel = 20; c.skills.potion_research = 5;
  return c;
};
const stock = (c: ReturnType<typeof newChar>, recipeId: string, times = 1) => {
  const r = BREW_RECIPES.find((x) => x.id === recipeId)!;
  for (const m of r.materials) addItem(data, c, m.itemId, m.qty * times, { ignoreWeight: true });
  addItem(data, c, 'medicine_bowl', times, { ignoreWeight: true });
};

describe('Alchemist brewing', () => {
  it('every recipe uses real items and herbs drop from monsters', () => {
    for (const r of BREW_RECIPES) for (const id of [r.itemId, ...r.materials.map((m) => m.itemId)]) expect(data.items.has(id), id).toBe(true);
    for (const herb of ['red_herb', 'yellow_herb', 'green_herb', 'blue_herb'])
      expect([...data.drops.values()].some((t) => t.entries.some((e) => e.itemId === herb)), herb).toBe(true);
    expect(data.shops.get('tidewatch_alchemy')!.items).toContain('medicine_bowl');
  });

  it('needs Potion Research and the materials; success gives the item, failure loses materials', () => {
    const novice = newChar();
    stock(novice, 'brew_red_potion');
    expect(brew(data, novice, 'brew_red_potion', stats, 0).ok).toBe(false);

    const c = alchemist();
    expect(brew(data, c, 'brew_red_potion', stats, 0).ok).toBe(false); // nothing in the bag
    stock(c, 'brew_red_potion', 2);
    const before = countItem(c, 'red_potion');
    const ok = brew(data, c, 'brew_red_potion', stats, 0); // roll 0 always succeeds
    expect(ok.success).toBe(true);
    expect(countItem(c, 'red_potion')).toBe(before + 1);
    const bad = brew(data, c, 'brew_red_potion', stats, 0.999); // roll near 1 always fails
    expect(bad.success).toBe(false);
    expect(countItem(c, 'red_potion')).toBe(before + 1);
    expect(countItem(c, 'red_herb')).toBe(0);
    expect(countItem(c, 'medicine_bowl')).toBe(0);
  });

  it('chance grows with Potion Research and drops for harder recipes', () => {
    const c = alchemist();
    const red = BREW_RECIPES.find((r) => r.id === 'brew_red_potion')!, fire = BREW_RECIPES.find((r) => r.id === 'brew_fire_bottle')!;
    const lo = brewChance(c, red, stats);
    c.skills.potion_research = 10;
    expect(brewChance(c, red, stats)).toBeGreaterThan(lo);
    expect(brewChance(c, fire, stats)).toBeLessThan(brewChance(c, red, stats));
  });
});

describe('thrown bottles', () => {
  it('a Fire Bottle hurts the nearest monster and is used up; with no monster near it is kept', () => {
    const w = newWorld();
    addItem(data, w.char, 'fire_bottle', 2, { ignoreWeight: true });
    const uid = () => w.char.inventory.find((i) => i.itemId === 'fire_bottle')!.uid;
    expect(w.useItem(uid()).ok).toBe(false);
    expect(countItem(w.char, 'fire_bottle')).toBe(2);
    w.enterMap('sunny_meadow', 'default');
    const m = w.spawnMonsterAt('leaf_slime', w.player.x + 40, w.player.y)!;
    m.hp = m.maxHp = 1e6;
    expect(w.useItem(uid()).ok).toBe(true);
    expect(m.hp).toBeLessThan(1e6);
    expect(countItem(w.char, 'fire_bottle')).toBe(1);
  });

  it('the Medicine Bowl opens the brewing window for Alchemists only', () => {
    const w = newWorld();
    addItem(data, w.char, 'medicine_bowl', 1, { ignoreWeight: true });
    const uid = w.char.inventory.find((i) => i.itemId === 'medicine_bowl')!.uid;
    expect(w.useItem(uid).ok).toBe(false);
    w.char.classId = 'alchemist'; w.char.skills.potion_research = 1;
    w.drainEvents();
    expect(w.useItem(uid).ok).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'openWindow')).toBe(true);
    expect(countItem(w.char, 'medicine_bowl')).toBe(1);
  });
});
