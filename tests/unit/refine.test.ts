import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '../../src/core/inventory';
import { refineFee, refineInfo, refineItem, refineTable, safeLimit, WEAPON_ORES } from '../../src/core/refine';
import { computeDerivedStats } from '../../src/core/formulas';
import { data, newChar } from '../helpers/fixtures';

function withKnife() {
  const c = newChar();
  c.luma = 100000;
  addItem(data, c, 'training_knife', 1); // weapon level 1
  addItem(data, c, 'glimmer_ore', 20);
  addItem(data, c, 'moonstone_ore', 20);
  addItem(data, c, 'cotton_shirt', 1);
  const knife = c.inventory.find((i) => i.itemId === 'training_knife')!;
  const shirt = c.inventory.find((i) => i.itemId === 'cotton_shirt')!;
  return { c, knife, shirt };
}

describe('refinement (weapon levels)', () => {
  it('every item is safe from breaking up to +5; harder items have lower chances', () => {
    for (const id of ['training_knife', 'iron_sword', 'knight_spear', 'thornbane_blade', 'cotton_shirt']) expect(safeLimit(data.items.get(id)!)).toBe(5);
    expect(refineTable('w4')[7]).toBeLessThan(refineTable('w1')[7]);
    expect(refineTable('armor')[7]).toBeLessThan(refineTable('w1')[7]);
    expect([1, 2, 3, 4].map((l) => WEAPON_ORES[l - 1])).toEqual(['glimmer_ore', 'bright_ore', 'starsteel_ore', 'starsteel_ore']);
  });

  it('each attempt consumes ore + fee; the fee grows with the level', () => {
    const { c, knife } = withKnife();
    const ore = countItem(c, 'glimmer_ore'), luma = c.luma;
    for (let i = 0; i < 5; i++) expect(refineItem(data, c, knife.uid, 0).outcome).toBe('success');
    expect(knife.refine).toBe(5);
    expect(countItem(c, 'glimmer_ore')).toBe(ore - 5);
    expect(c.luma).toBe(luma - [1, 2, 3, 4, 5].reduce((sum, n) => sum + refineFee('w1', n), 0));
    expect(refineInfo(data, c, knife.uid).chance).toBeLessThan(1);
  });

  it('armor uses Moonstone Ore', () => {
    const { c, shirt } = withKnife();
    for (let i = 0; i < 4; i++) refineItem(data, c, shirt.uid, 0);
    expect(shirt.refine).toBe(4);
    expect(refineInfo(data, c, shirt.uid).ore).toBe('moonstone_ore');
  });

  it('above +5 a failure may break the item (separate roll); otherwise it stays', () => {
    const { c, knife } = withKnife();
    for (let i = 0; i < 7; i++) refineItem(data, c, knife.uid, 0);
    expect(refineItem(data, c, knife.uid, 0.99, false, 0.99).outcome).toBe('failed');
    expect(knife.refine).toBe(7);
    const r = refineItem(data, c, knife.uid, 0.99, false, 0);
    expect(r.outcome).toBe('broken');
    expect(c.inventory.some((i) => i.uid === knife.uid)).toBe(false);
  });

  it('refuses without the right ore, without Luma, and for accessories', () => {
    const { c, knife } = withKnife();
    c.inventory = c.inventory.filter((i) => i.itemId !== 'glimmer_ore');
    addItem(data, c, 'starsteel_ore', 1);
    expect(refineItem(data, c, knife.uid, 0).ok).toBe(false); // wrong grade
    addItem(data, c, 'glimmer_ore', 1); c.luma = 0;
    expect(refineItem(data, c, knife.uid, 0).ok).toBe(false);
    addItem(data, c, 'copper_ring', 1);
    expect(refineInfo(data, c, c.inventory.find((i) => i.itemId === 'copper_ring')!.uid).ok).toBe(false);
  });

  it('ATK per refine depends on weapon level (2 / 3 / 5 / 7)', () => {
    const { c, knife } = withKnife();
    c.equipment.weapon = knife; c.inventory = c.inventory.filter((i) => i !== knife);
    const before = computeDerivedStats(data, c).patk;
    for (let i = 0; i < 3; i++) refineItem(data, c, knife.uid, 0);
    expect(computeDerivedStats(data, c).patk - before).toBe(6);
  });
});

describe('Ragnarok-style character rules', () => {
  it('stat raise cost grows every 10 points: floor((x-1)/10)+2', async () => {
    const { statRaiseCost } = await import('../../src/core/formulas');
    const { allocateStat } = await import('../../src/core/character');
    const ro = { ...data, balance: { ...data.balance, levels: { ...data.balance.levels, statCost: { ...data.balance.levels.statCost, mode: 'ro' } } } } as typeof data;
    expect([1, 9, 10, 11, 20, 21, 50, 98].map((v) => statRaiseCost(ro, v))).toEqual([2, 2, 2, 3, 3, 4, 6, 11]);
    expect(statRaiseCost(data, 50)).toBe(1); // default: flat
    const c = newChar(); c.stats.str = 10; c.statPoints = 4;
    expect(allocateStat(ro, c, 'str', 2).ok).toBe(false); // 10→11 costs 2, 11→12 costs 3
    expect(allocateStat(ro, c, 'str', 1).ok).toBe(true);
    expect(c.statPoints).toBe(2);
  });

  it('at 90% weight the player cannot attack or use skills', async () => {
    const { newWorld } = await import('../helpers/fixtures');
    const w = newWorld();
    w.char.skills.first_aid = 1;
    expect(w.canUseSkill('first_aid').ok).toBe(true);
    addItem(data, w.char, 'red_potion', Math.ceil((w.weightLimit * 0.9) / 7), { ignoreWeight: true } as never);
    expect(w.majorOverweight).toBe(true);
    expect(w.canUseSkill('first_aid').ok).toBe(false);
  });
  it('enriched ore works on any weapon level and adds 10% to the chance', () => {
    const { c, knife } = withKnife();
    addItem(data, c, 'enriched_starsteel', 5);
    knife.refine = 7;
    const n = refineInfo(data, c, knife.uid), e = refineInfo(data, c, knife.uid, true);
    expect(e.chance).toBeCloseTo(n.chance + 0.1, 5);
    expect(e.ore).toBe('enriched_starsteel');
    expect(refineItem(data, c, knife.uid, 0, true).outcome).toBe('success');
    expect(countItem(c, 'enriched_starsteel')).toBe(4);
  });

  it('armor refine gives 0.7 DEF per level, rounded', () => {
    const { c, shirt } = withKnife();
    const base = computeDerivedStats(data, { ...c, equipment: { armor: { ...shirt, refine: 0 } } }).pdef;
    const at = (r: number) => computeDerivedStats(data, { ...c, equipment: { armor: { ...shirt, refine: r } } }).pdef - base;
    expect([1, 2, 3, 4, 10].map(at)).toEqual([1, 1, 2, 3, 7]);
  });
});
