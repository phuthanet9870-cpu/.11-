import { describe, expect, it } from 'vitest';
import { elementModifier, hitChance, profileFromMonster, resolveAttack, rollStatus, type CombatProfile } from '../../src/core/combat';
import { Rng } from '../../src/core/rng';
import { ELEMENTS } from '../../src/core/types';
import { data } from '../helpers/fixtures';

const base: CombatProfile = {
  level: 10, patk: 100, matk: 100, pdef: 0, mdef: 0, hit: 200, flee: 0, crit: 0, critDmg: 150,
  element: 'neutral', elementDamagePct: {}, elementResistPct: {},
  race: 'formless', size: 'medium', raceDamagePct: {}, sizeDamagePct: {}, raceResistPct: {}, perfectDodge: 0, weaponType: 'unarmed',
};

describe('Ragnarok-style modifiers', () => {
  const avg = (a: CombatProfile, d: CombatProfile) => {
    const rng = new Rng(5); let t = 0;
    for (let i = 0; i < 400; i++) t += resolveAttack(data, rng, a, d, { kind: 'physical', multiplier: 1, element: 'neutral', alwaysHit: true, canCrit: false }).damage;
    return t / 400;
  };
  it('weapon type vs size table: daggers fall off against large targets', () => {
    const dagger = { ...base, weaponType: 'dagger' };
    const small = avg(dagger, { ...base, size: 'small' }), large = avg(dagger, { ...base, size: 'large' });
    expect(large / small).toBeCloseTo(0.5, 1);
    const spear = { ...base, weaponType: 'spear' };
    expect(avg(spear, { ...base, size: 'large' })).toBeGreaterThan(avg(spear, { ...base, size: 'small' }));
  });
  it('race damage and race resistance (card effects) apply', () => {
    const plain = avg(base, { ...base, race: 'undead' });
    expect(avg({ ...base, raceDamagePct: { undead: 20 } }, { ...base, race: 'undead' }) / plain).toBeCloseTo(1.2, 1);
    expect(avg({ ...base, raceDamagePct: { undead: 20 } }, { ...base, race: 'plant' }) / plain).toBeCloseTo(1, 1);
    expect(avg({ ...base, race: 'beast' }, { ...base, raceResistPct: { beast: 30 } }) / avg({ ...base, race: 'beast' }, base)).toBeCloseTo(0.7, 1);
  });
  it('perfect dodge avoids hits even against huge HIT', () => {
    const rng = new Rng(9); let miss = 0;
    for (let i = 0; i < 2000; i++) if (!resolveAttack(data, rng, { ...base, hit: 9999 }, { ...base, perfectDodge: 20 }, { kind: 'physical', multiplier: 1, element: 'neutral' }).hit) miss++;
    expect(miss / 2000).toBeGreaterThan(0.15);
    expect(miss / 2000).toBeLessThan(0.25);
  });
});

describe('element table', () => {
  it('is complete 9x9', () => {
    for (const a of ELEMENTS) for (const d of ELEMENTS) expect(typeof data.elementTable[a][d]).toBe('number');
  });
  it('applies classic counters', () => {
    expect(elementModifier(data, 'fire', 'earth')).toBe(1.5);
    expect(elementModifier(data, 'water', 'fire')).toBe(1.5);
    expect(elementModifier(data, 'holy', 'undead')).toBeGreaterThan(1.5);
    expect(elementModifier(data, 'poison', 'poison')).toBe(0);
  });
});

describe('resolveAttack', () => {
  it('scales with element modifier', () => {
    const rng = new Rng(1);
    const vsEarth = resolveAttack(data, rng, base, { ...base, element: 'earth' }, { kind: 'magic', multiplier: 1, element: 'fire' });
    const rng2 = new Rng(1);
    const vsNeutral = resolveAttack(data, rng2, base, base, { kind: 'magic', multiplier: 1, element: 'fire' });
    expect(vsEarth.damage / vsNeutral.damage).toBeCloseTo(1.5, 1);
  });

  it('defense reduces physical damage', () => {
    const r1 = resolveAttack(data, new Rng(5), base, base, { kind: 'physical', multiplier: 1, element: 'neutral', canCrit: false });
    const r2 = resolveAttack(data, new Rng(5), base, { ...base, pdef: 100 }, { kind: 'physical', multiplier: 1, element: 'neutral', canCrit: false });
    expect(r2.damage).toBeLessThan(r1.damage);
    expect(r2.damage).toBeGreaterThanOrEqual(Math.floor(r1.damage / 2) - 2);
  });

  it('misses when accuracy is far below evasion; magic never misses', () => {
    let misses = 0;
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const r = resolveAttack(data, rng, { ...base, hit: 0 }, { ...base, flee: 500 }, { kind: 'physical', multiplier: 1, element: 'neutral' });
      if (!r.hit) misses++;
    }
    expect(misses).toBeGreaterThan(150);
    for (let i = 0; i < 50; i++) {
      expect(resolveAttack(data, rng, { ...base, hit: 0 }, { ...base, flee: 500 }, { kind: 'magic', multiplier: 1, element: 'neutral' }).hit).toBe(true);
    }
    expect(hitChance(data, 0, 1000)).toBe(data.balance.combat.hitChanceMin / 100);
  });

  it('critical hits deal bonus damage', () => {
    const rng = new Rng(3);
    const r = resolveAttack(data, rng, { ...base, crit: 100 }, { ...base, pdef: 50 }, { kind: 'physical', multiplier: 1, element: 'neutral' });
    expect(r.crit).toBe(true);
    expect(r.damage).toBeGreaterThanOrEqual(130);
  });

  it('immune element deals zero damage', () => {
    const r = resolveAttack(data, new Rng(1), base, { ...base, element: 'poison' }, { kind: 'magic', multiplier: 1, element: 'poison' });
    expect(r.damage).toBe(0);
  });

  it('monster profile uses data file values', () => {
    const slime = profileFromMonster(data, data.monsters.get('leaf_slime')!);
    expect(slime.patk).toBe(8);
    expect(slime.pdef).toBe(2);
    expect(slime.element).toBe('earth');
  });
});

describe('status effects', () => {
  it('respects immunities and element immunity', () => {
    const rng = new Rng(2);
    expect(rollStatus(data, rng, { element: 'neutral', resistValue: () => 0, immune: ['stun'] }, 'stun', 1)).toBe(0);
    expect(rollStatus(data, rng, { element: 'poison', resistValue: () => 0 }, 'poison', 1)).toBe(0);
    expect(rollStatus(data, rng, { element: 'neutral', resistValue: () => 0 }, 'poison', 1)).toBeGreaterThan(0);
  });
  it('every status defines duration, stack limit and cure info', () => {
    for (const s of data.statuses.values()) {
      expect(s.defaultDurationMs).toBeGreaterThan(0);
      expect(s.stackLimit).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(s.curedBy)).toBe(true);
    }
    expect(data.statuses.size).toBe(10);
  });
});
