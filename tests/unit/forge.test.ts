import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '../../src/core/inventory';
import { canForge, forgeChance, forgeWeapon } from '../../src/core/forge';
import { computeDerivedStats } from '../../src/core/formulas';
import { freeSlots, itemDisplayName } from '../../src/core/cards';
import { data, newChar } from '../helpers/fixtures';

function stocked() {
  const c = newChar('Smithy'); c.luma = 100000;
  const r = data.recipes.get('forge_training_knife')!;
  for (const m of r.materials) addItem(data, c, m.itemId, m.qty * 3, { ignoreWeight: true });
  addItem(data, c, 'flame_stone', 2); addItem(data, c, 'star_crumb', 6);
  return { c, r };
}

describe('forging', () => {
  it('success chance follows 50 + JobLv×0.2 + DEX×0.1 + LUK×0.1 + 20, minus element / crumbs / weapon level', () => {
    const c = newChar(); c.jobLevel = 10; c.stats.dex = 10; c.stats.luk = 10;
    const base = 50 + 2 + 1 + 1 + 20;
    expect(forgeChance(data, c, { recipeId: 'forge_training_knife' })).toBeCloseTo(base / 100, 5);
    expect(forgeChance(data, c, { recipeId: 'forge_training_knife', stone: 'flame_stone', crumbs: 2 })).toBeCloseTo((base - 20 - 30) / 100, 5);
    const lv2 = [...data.recipes.values()].find((r) => data.items.get(r.itemId)!.weaponLevel === 2)!;
    expect(forgeChance(data, c, { recipeId: lv2.id })).toBeCloseTo((base - 20) / 100, 5);
  });

  it('a successful forge makes a named, elemental, star-crumb weapon without card slots', () => {
    const { c } = stocked();
    const res = forgeWeapon(data, c, { recipeId: 'forge_training_knife', stone: 'flame_stone', crumbs: 3 }, 0);
    expect(res.ok && res.success).toBe(true);
    const inst = res.ok && res.item!;
    expect(inst && inst.crafter).toBe('Smithy');
    expect(inst && inst.element).toBe('fire');
    expect(inst && itemDisplayName(data.items.get('training_knife')!, inst)).toBe("Smithy's Very Very Very Strong Fire Training Knife");
    expect(inst && freeSlots(data.items.get('training_knife')!, inst)).toBe(0);
    c.equipment.weapon = inst as never; c.inventory = c.inventory.filter((i) => i !== inst);
    const d = computeDerivedStats(data, c);
    expect(d.weaponElement).toBe('fire');
  });

  it('failure consumes materials, stone, crumbs and fee', () => {
    const { c, r } = stocked();
    const before = r.materials.map((m) => countItem(c, m.itemId)), luma = c.luma;
    const res = forgeWeapon(data, c, { recipeId: r.id, stone: 'flame_stone', crumbs: 1 }, 0.9999);
    expect(res.ok && res.success).toBe(false);
    r.materials.forEach((m, i) => expect(countItem(c, m.itemId)).toBe(before[i] - m.qty));
    expect(countItem(c, 'flame_stone')).toBe(1);
    expect(countItem(c, 'star_crumb')).toBe(5);
    expect(c.luma).toBe(luma - r.fee);
  });

  it('refuses without materials or with more than 3 crumbs', () => {
    const c = newChar(); c.luma = 99999;
    expect(canForge(data, c, { recipeId: 'forge_training_knife' }).ok).toBe(false);
    const { c: c2 } = stocked();
    expect(canForge(data, c2, { recipeId: 'forge_training_knife', crumbs: 4 }).ok).toBe(false);
  });

  it('every forgeable weapon is weapon level 1–3 and every recipe material drops somewhere or is sold', () => {
    const sources = new Set<string>();
    for (const t of data.drops.values()) for (const e of t.entries) sources.add(e.itemId);
    for (const s of data.shops.values()) for (const i of s.items) sources.add(i);
    for (const r of data.recipes.values()) {
      expect(data.items.get(r.itemId)!.weaponLevel).toBeLessThanOrEqual(3);
      for (const m of r.materials) expect(sources.has(m.itemId)).toBe(true);
    }
  });
});
