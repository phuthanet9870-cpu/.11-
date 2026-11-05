import { describe, expect, it } from 'vitest';
import { data, newChar, newWorld } from '../helpers/fixtures';
import { RUNE_KINDS, runeItemId, runeValue } from '../../src/core/runestones';
import { BREAK_CHANCE, MAX_REFINE, refineInfo, refineItem, refineTable, simulateRefine } from '../../src/core/refine';
import { computeDerivedStats } from '../../src/core/formulas';
import { equipItem } from '../../src/core/inventory';

describe('rune stones', () => {
  it('14 kinds × 5 levels exist, including the four drain runes', () => {
    expect(RUNE_KINDS.length).toBe(14);
    for (const k of RUNE_KINDS) for (let lv = 1; lv <= 5; lv++) expect(data.items.get(runeItemId(k.id, lv))?.slot).toBe('rune');
    for (const id of ['siphon', 'soulsiphon', 'leech', 'bloodrite']) expect(RUNE_KINDS.some((k) => k.id === id)).toBe(true);
  });

  it('effects grow with level and refine; two runes go into two slots', () => {
    expect(runeValue('siphon', 5)).toBeGreaterThan(runeValue('siphon', 1));
    expect(runeValue('siphon', 1, 10)).toBeCloseTo(runeValue('siphon', 1) * 2.2, 1);
    const c = newChar();
    c.inventory.push({ uid: 'r1', itemId: runeItemId('siphon', 3), qty: 1, refine: 4 }, { uid: 'r2', itemId: runeItemId('leech', 2), qty: 1 });
    expect(equipItem(data, c, 'r1').ok).toBe(true);
    expect(equipItem(data, c, 'r2').ok).toBe(true);
    expect(c.equipment.rune1?.uid).toBe('r1'); expect(c.equipment.rune2?.uid).toBe('r2');
    const st = computeDerivedStats(data, c);
    expect(st.mpDrainPct).toBeCloseTo(runeValue('siphon', 3, 4), 5);
    expect(st.hpDrainPct).toBeCloseTo(runeValue('leech', 2), 5);
  });

  it('basic attacks restore MP with a Siphon rune', () => {
    const c = newChar();
    c.inventory.push({ uid: 'r1', itemId: runeItemId('siphon', 5), qty: 1, refine: 10 });
    equipItem(data, c, 'r1');
    const w = newWorld(c, 3);
    w.char.mp = 0;
    const m = [...w.monsters.values()][0] ?? w.spawnMonsterAt('leaf_slime', w.player.x + 30, w.player.y)!;
    (w as unknown as { drainMp(d: number, p: number): void }).drainMp(500, w.stats.mpDrainPct);
    expect(w.char.mp).toBeGreaterThan(0);
    void m;
  });
});

describe('refining (+10 cap, safe to +5, separate break roll)', () => {
  it('chances fall every level; nothing breaks up to +5', () => {
    const t = refineTable('w1');
    for (let n = 2; n <= MAX_REFINE; n++) expect(t[n]).toBeLessThanOrEqual(t[n - 1]);
    expect(MAX_REFINE).toBe(10);
    for (let n = 1; n <= 5; n++) expect(BREAK_CHANCE[n]).toBe(0);
    for (let n = 7; n <= 10; n++) expect(BREAK_CHANCE[n]).toBeGreaterThan(BREAK_CHANCE[n - 1]);
    expect(refineTable('rune5')[8]).toBeLessThan(refineTable('rune1')[8]);
  });

  it('a failure only breaks when the separate break roll says so; otherwise the item stays', () => {
    const c = newChar();
    c.luma = 1e7;
    c.inventory.push({ uid: 'r', itemId: runeItemId('fury', 2), qty: 1, refine: 7 });
    expect(refineInfo(data, c, 'r').ok).toBe(true);
    const fail = refineItem(data, c, 'r', 0.999, false, 0.99);
    expect(fail.outcome).toBe('failed'); expect(c.inventory.find((i) => i.uid === 'r')?.refine).toBe(7);
    const broke = refineItem(data, c, 'r', 0.999, false, 0.0);
    expect(broke.outcome).toBe('broken'); expect(c.inventory.some((i) => i.uid === 'r')).toBe(false);
    c.inventory.push({ uid: 's', itemId: runeItemId('fury', 2), qty: 1, refine: 3 });
    expect(refineItem(data, c, 's', 0.999, false, 0).outcome).toBe('failed'); // +4 is safe
    expect(simulateRefine('w1', 0, 5).survive).toBe(1);
    expect(simulateRefine('w1', 0, 10).survive).toBeLessThan(1);
  });
});
