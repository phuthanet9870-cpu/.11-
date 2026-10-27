import { describe, expect, it } from 'vitest';
import { refineOre, refineTable, simulateRefine } from '../../src/core/refine';
import { forgeChanceRaw } from '../../src/core/forge';
import { optionOdds } from '../../src/core/options';

describe('database tools', () => {
  it('refine simulator: safe steps are certain; risky steps multiply; expected costs follow', () => {
    expect(simulateRefine('w1', 0, 7).survive).toBe(1);
    const s = simulateRefine('w1', 7, 10);
    expect(s.steps.map((x) => x.chance)).toEqual([0.6, 0.4, 0.2]);
    expect(s.survive).toBeCloseTo(0.6 * 0.4 * 0.2, 10);
    expect(s.expectedAttempts).toBeCloseTo(1 + 0.6 + 0.24, 10);
    expect(s.expectedItems).toBeCloseTo(1 / 0.048, 6);
    expect(s.expectedLuma).toBeCloseTo(s.expectedOre * 50, 6);
    expect(simulateRefine('w1', 7, 10, true).survive).toBeGreaterThan(s.survive);
    expect(refineTable('armor', true)[5]).toBe(0.9);
    expect(refineOre('w3')).toBe('starsteel_ore');
    expect(refineOre('armor', true)).toBe('enriched_moonstone');
  });

  it('forge calculator matches the formula and clamps to 5–100%', () => {
    expect(forgeChanceRaw({ jobLevel: 50, dex: 50, luk: 30, weaponLevel: 1, stone: false, crumbs: 0 })).toBeCloseTo((50 + 10 + 5 + 3 + 20) / 100, 10);
    expect(forgeChanceRaw({ jobLevel: 50, dex: 50, luk: 30, weaponLevel: 3, stone: true, crumbs: 3 })).toBeCloseTo((88 - 30 - 20 - 45) / 100 > 0.05 ? (88 - 30 - 20 - 45) / 100 : 0.05, 10);
    expect(forgeChanceRaw({ jobLevel: 1, dex: 1, luk: 0, weaponLevel: 3, stone: true, crumbs: 3 })).toBe(0.05);
    expect(forgeChanceRaw({ jobLevel: 50, dex: 130, luk: 130, weaponLevel: 1, stone: false, crumbs: 0 })).toBe(1);
  });

  it('option odds add up to 100% per pool and never mix weapon-only into armor', () => {
    for (const pool of ['weapon', 'armor'] as const) {
      const odds = optionOdds(pool);
      expect(odds.reduce((a, o) => a + o.pct, 0)).toBeCloseTo(100, 8);
      expect(odds.every((o) => o.def.pool === 'any' || o.def.pool === pool)).toBe(true);
    }
  });
});
