import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '../../src/core/inventory';
import { captureChance, feedPet, hatchEgg, intimacyLabel, LOYAL_AT, petOwnerDied, returnToEgg, tickPet } from '../../src/core/pets';
import { computeDerivedStats } from '../../src/core/formulas';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

const pd = data.pets.get('pet_leaf_slime')!;

function withEgg() {
  const c = newChar();
  addItem(data, c, pd.eggItem, 1);
  const egg = c.inventory.find((i) => i.itemId === pd.eggItem)!;
  return { c, egg };
}

describe('pets', () => {
  it('every pet has a lure, an egg and a food that exist and are sold or dropped', () => {
    expect(data.pets.size).toBeGreaterThanOrEqual(10);
    const sold = new Set([...data.shops.values()].flatMap((s) => s.items));
    for (const p of data.pets.values()) {
      expect(data.items.get(p.lureItem)!.lure).toBe(p.monsterId);
      expect(data.items.get(p.eggItem)!.petEgg).toBe(p.monsterId);
      expect(sold.has(p.lureItem) && sold.has(p.foodItem)).toBe(true);
    }
  });

  it('capture chance follows the Ragnarok formula: lower monster HP and more LUK help', () => {
    const full = captureChance(pd, 10, 1, 1, 1), low = captureChance(pd, 10, 1, 1, 0.1);
    expect(full).toBeCloseTo(((pd.captureRate + 9 * 30 + 20) * 100) / 100 / 10000, 6);
    expect(low).toBeGreaterThan(full);
    expect(captureChance(pd, 10, 1, 50, 1)).toBeGreaterThan(full);
    expect(captureChance(pd, 1, 99, 0, 1)).toBe(0);
  });

  it('hatch, feed, overfeed, return to egg (egg keeps the pet)', () => {
    const { c, egg } = withEgg();
    expect(hatchEgg(data, c, egg.uid).ok).toBe(true);
    expect(countItem(c, pd.eggItem)).toBe(0);
    expect(c.pet!.intimacy).toBe(pd.intimacyStart);
    addItem(data, c, pd.foodItem, 5);
    // Fresh pet is Stuffed (100): feeding now is overfeeding.
    expect(feedPet(data, c).delta).toBe(-pd.intimacyOverfed);
    c.pet!.hunger = 20;
    expect(feedPet(data, c).delta).toBe(pd.intimacyFed);
    expect(c.pet!.hunger).toBe(40);
    c.pet!.name = 'Sprout';
    expect(returnToEgg(data, c).ok).toBe(true);
    const back = c.inventory.find((i) => i.itemId === pd.eggItem)!;
    expect(back.pet!.name).toBe('Sprout');
    expect(hatchEgg(data, c, back.uid).ok).toBe(true);
    expect(c.pet!.name).toBe('Sprout');
  });

  it('gets hungry over time, loses intimacy while starving and runs away at 0', () => {
    const { c, egg } = withEgg();
    hatchEgg(data, c, egg.uid);
    let t = 0;
    tickPet(data, c, t);
    t += pd.hungerTickMs; tickPet(data, c, t);
    expect(c.pet!.hunger).toBe(100 - pd.fullness);
    c.pet!.hunger = 0; c.pet!.intimacy = pd.intimacyHungry * 2;
    t += pd.hungerTickMs; tickPet(data, c, t);
    expect(c.pet!.intimacy).toBe(pd.intimacyHungry);
    t += pd.hungerTickMs;
    expect(tickPet(data, c, t)).toBe('ranAway');
    expect(c.pet).toBeNull();
  });

  it('owner death costs intimacy; the Loyal bonus applies only at 910+', () => {
    const { c, egg } = withEgg();
    hatchEgg(data, c, egg.uid);
    petOwnerDied(data, c);
    expect(c.pet!.intimacy).toBe(pd.intimacyStart - pd.intimacyOwnerDie);
    const base = computeDerivedStats(data, c).maxHp;
    expect(intimacyLabel(LOYAL_AT)).toBe('Loyal');
    c.pet!.intimacy = LOYAL_AT;
    const w = newWorld(c);
    w.update(16);
    expect(w.stats.maxHp).toBeGreaterThan(base);
  });

  it('taming in the world: lure consumed; success turns the monster into an egg', () => {
    const c = newChar();
    c.stats.luk = 99;
    const w = newWorld(c, 42);
    addItem(data, c, pd.lureItem, 30);
    let tamed = false;
    for (let i = 0; i < 30 && !tamed; i++) {
      const m = w.spawnMonsterAt('leaf_slime', w.player.x + 40, w.player.y)!;
      m.hp = 1;
      w.tamePet(c.inventory.find((x) => x.itemId === pd.lureItem)!.uid, m.id);
      tamed = c.inventory.some((x) => x.itemId === pd.eggItem);
      if (tamed) expect(m.dead).toBe(true);
      run(w, 100);
    }
    expect(tamed).toBe(true);
    expect(countItem(c, pd.lureItem)).toBeLessThan(30);
    const egg = c.inventory.find((x) => x.itemId === pd.eggItem)!;
    expect(egg.pet!.intimacy).toBe(pd.intimacyStart);
    expect(w.useItem(egg.uid).ok).toBe(true);
    run(w, 200);
    expect(w.petActor).not.toBeNull();
    w.moveTo(w.player.x + 200, w.player.y);
    run(w, 3000);
    expect(Math.hypot(w.petActor!.x - w.player.x, w.petActor!.y - w.player.y)).toBeLessThan(80);
  });

  it('a lure only works on its own monster', () => {
    const c = newChar();
    const w = newWorld(c);
    addItem(data, c, pd.lureItem, 1);
    const other = [...data.pets.values()].find((p) => p.monsterId !== pd.monsterId)!;
    const m = w.spawnMonsterAt(other.monsterId, w.player.x + 40, w.player.y)!;
    expect(w.tamePet(c.inventory.find((x) => x.itemId === pd.lureItem)!.uid, m.id).ok).toBe(false);
    expect(countItem(c, pd.lureItem)).toBe(1);
  });
});
