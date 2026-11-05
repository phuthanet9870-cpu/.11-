import { describe, expect, it } from 'vitest';
import { canLearnRune, learnRune, resetRunes, runePointsLeft, runePointsTotal } from '../../src/core/runes';
import { computeDerivedStats } from '../../src/core/formulas';
import { levelTo } from '../helpers/scenarios';
import { data, newChar } from '../helpers/fixtures';

describe('Rune Constellation', () => {
  it('opens at Base Lv 30 with one point per two levels', () => {
    const c = newChar();
    expect(canLearnRune(data, c, 'lion_mane').ok).toBe(false);
    levelTo(c, 30, 1);
    expect(runePointsTotal(c)).toBe(1);
    levelTo(c, 50, 1);
    expect(runePointsTotal(c)).toBe(11);
  });

  it('stars need their parents; capstones need both branches; bonuses apply per rank', () => {
    const c = newChar(); levelTo(c, 70, 1);
    expect(learnRune(data, c, 'lion_roar').ok).toBe(false);
    const base = computeDerivedStats(data, c);
    for (let i = 0; i < 3; i++) expect(learnRune(data, c, 'lion_mane').ok).toBe(true);
    expect(learnRune(data, c, 'lion_mane').ok).toBe(false);
    expect(computeDerivedStats(data, c).patk).toBeGreaterThanOrEqual(base.patk + 12);
    learnRune(data, c, 'lion_roar'); learnRune(data, c, 'lion_hide');
    expect(learnRune(data, c, 'lion_king').ok).toBe(false);
    learnRune(data, c, 'lion_claws'); learnRune(data, c, 'lion_pride');
    expect(learnRune(data, c, 'lion_king').ok).toBe(true);
    expect(computeDerivedStats(data, c).sizeDamagePct.large).toBe(10);
    expect(runePointsLeft(c)).toBe(runePointsTotal(c) - 8);
  });

  it('reset refunds every point for Luma', () => {
    const c = newChar(); levelTo(c, 40, 1); c.luma = 20000;
    learnRune(data, c, 'owl_insight'); learnRune(data, c, 'owl_calm');
    expect(resetRunes(c, 10000).ok).toBe(true);
    expect(runePointsLeft(c)).toBe(runePointsTotal(c));
    expect(c.luma).toBe(10000);
  });
});
