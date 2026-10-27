import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '../../src/core/inventory';
import { HIGH_FEE, refineInfo, refineItem, simulateRefine } from '../../src/core/refine';
import { computeDerivedStats, refineMods } from '../../src/core/formulas';
import { data, newChar } from '../helpers/fixtures';

function at10(itemId = 'training_knife') {
  const c = newChar();
  c.luma = 10_000_000;
  addItem(data, c, itemId, 1);
  addItem(data, c, 'stellar_shard', 50);
  addItem(data, c, 'lunar_shard', 50);
  addItem(data, c, 'enriched_starsteel', 5);
  const inst = c.inventory.find((i) => i.itemId === itemId && !i.refine)!;
  inst.refine = 10;
  return { c, inst };
}

describe('over-upgrade +11…+20', () => {
  it('uses Stellar Shards and 100,000 Luma, with the renewal chance table', () => {
    const { c, inst } = at10();
    const info = refineInfo(data, c, inst.uid);
    expect([info.ore, info.fee, info.chance]).toEqual(['stellar_shard', HIGH_FEE, 0.18]);
    expect(refineInfo(data, c, inst.uid, true).ok).toBe(false);
    const shirt = at10('cotton_shirt');
    expect(refineInfo(data, shirt.c, shirt.inst.uid)).toMatchObject({ ore: 'lunar_shard', chance: 0.08 });
  });

  it('success +1; failure drops 3 levels (never below +10) or breaks 20% of the time', () => {
    const { c, inst } = at10();
    expect(refineItem(data, c, inst.uid, 0.0, false, 0.9).outcome).toBe('success');
    expect(inst.refine).toBe(11);
    expect(refineItem(data, c, inst.uid, 0.99, false, 0.5)).toMatchObject({ outcome: 'downgraded', level: 10 });
    inst.refine = 15;
    refineItem(data, c, inst.uid, 0.99, false, 0.5);
    expect(inst.refine).toBe(12);
    const shards = countItem(c, 'stellar_shard');
    expect(refineItem(data, c, inst.uid, 0.99, false, 0.1).outcome).toBe('broken');
    expect(c.inventory.some((i) => i.uid === inst.uid)).toBe(false);
    expect(countItem(c, 'stellar_shard')).toBe(shards - 1);
  });

  it('refine bonus keeps growing past +10 (renewal totals)', () => {
    const knife = data.items.get('training_knife')!;
    expect(refineMods(knife, 10).patk).toBe(20);
    expect(refineMods(knife, 11).patk).toBe(22);
    expect(refineMods(knife, 20).patk).toBe(60);
    const shirt = data.items.get('cotton_shirt')!;
    expect(refineMods(shirt, 10).pdef).toBe(7);
    expect(refineMods(shirt, 20).pdef).toBe(21);
    const { c, inst } = at10();
    c.equipment.weapon = inst; c.inventory = c.inventory.filter((i) => i !== inst);
    const a = computeDerivedStats(data, c).patk;
    inst.refine = 15;
    expect(computeDerivedStats(data, c).patk).toBeGreaterThan(a);
  });

  it('simulator handles downgrades as a Markov chain', () => {
    const s = simulateRefine('w1', 10, 12);
    // Reaching +12 without breaking: each failure keeps the item 80% of the time, so survival is well above a plain 0.18 × 0.18.
    expect(s.survive).toBeGreaterThan(0.18 * 0.18);
    expect(s.survive).toBeLessThan(1);
    expect(s.expectedLuma).toBeCloseTo(s.expectedOre * HIGH_FEE, 0);
    const easy = simulateRefine('w1', 10, 11), hard = simulateRefine('armor', 10, 11);
    expect(easy.survive).toBeGreaterThan(hard.survive);
    // one step: P = c / (c + (1-c)·0.2)
    expect(easy.survive).toBeCloseTo(0.18 / (0.18 + 0.82 * 0.2), 6);
  });
});
