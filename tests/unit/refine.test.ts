import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '../../src/core/inventory';
import { refineInfo, refineItem } from '../../src/core/refine';
import { computeDerivedStats } from '../../src/core/formulas';
import { data, newChar } from '../helpers/fixtures';

function withKnife() {
  const c = newChar();
  c.luma = 100000;
  addItem(data, c, 'training_knife', 1);
  addItem(data, c, 'starsteel_ore', 20);
  addItem(data, c, 'moonstone_ore', 20);
  addItem(data, c, 'cotton_shirt', 1);
  const knife = c.inventory.find((i) => i.itemId === 'training_knife')!;
  const shirt = c.inventory.find((i) => i.itemId === 'cotton_shirt')!;
  return { c, knife, shirt };
}

describe('refinement', () => {
  it('is always safe up to +5 on weapons and consumes ore + fee', () => {
    const { c, knife } = withKnife();
    const ore = countItem(c, 'starsteel_ore'), luma = c.luma;
    for (let i = 0; i < 5; i++) expect(refineItem(data, c, knife.uid, 0.999).outcome).toBe('success');
    expect(knife.refine).toBe(5);
    expect(countItem(c, 'starsteel_ore')).toBe(ore - 5);
    expect(c.luma).toBeLessThan(luma);
  });

  it('armor is safe to +4 and uses Moonstone Ore', () => {
    const { c, shirt } = withKnife();
    for (let i = 0; i < 4; i++) refineItem(data, c, shirt.uid, 0.999);
    expect(shirt.refine).toBe(4);
    expect(refineInfo(data, c, shirt.uid).ore).toBe('moonstone_ore');
    expect(refineInfo(data, c, shirt.uid).chance).toBeLessThan(1);
  });

  it('a failed risky refine destroys the item', () => {
    const { c, knife } = withKnife();
    for (let i = 0; i < 5; i++) refineItem(data, c, knife.uid, 0);
    const r = refineItem(data, c, knife.uid, 0.99); // +6 is 60%
    expect(r.outcome).toBe('broken');
    expect(c.inventory.some((i) => i.uid === knife.uid)).toBe(false);
  });

  it('refuses without ore, without Luma, and for accessories', () => {
    const { c, knife } = withKnife();
    c.inventory = c.inventory.filter((i) => i.itemId !== 'starsteel_ore');
    expect(refineItem(data, c, knife.uid, 0).ok).toBe(false);
    addItem(data, c, 'starsteel_ore', 1); c.luma = 0;
    expect(refineItem(data, c, knife.uid, 0).ok).toBe(false);
    addItem(data, c, 'copper_ring', 1);
    expect(refineInfo(data, c, c.inventory.find((i) => i.itemId === 'copper_ring')!.uid).ok).toBe(false);
  });

  it('refine level adds attack to the equipped weapon', () => {
    const { c, knife } = withKnife();
    c.equipment.weapon = knife; c.inventory = c.inventory.filter((i) => i !== knife);
    const before = computeDerivedStats(data, c).patk;
    for (let i = 0; i < 3; i++) refineItem(data, c, knife.uid, 0);
    expect(computeDerivedStats(data, c).patk).toBeGreaterThan(before);
  });
});
