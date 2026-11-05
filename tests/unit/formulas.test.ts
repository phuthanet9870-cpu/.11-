import { describe, expect, it } from 'vitest';
import { addExperience, computeDerivedStats, expToNextBase, expToNextJob, totalStatPointsAtLevel } from '../../src/core/formulas';
import { allocateStat, resetStats, learnSkill, resetSkills, changeJob, validateName, createCharacter } from '../../src/core/character';
import { data, newChar } from '../helpers/fixtures';

describe('experience & levels', () => {
  it('exp curve is strictly increasing', () => {
    for (let l = 1; l < 120; l++) expect(expToNextBase(data, l + 1)).toBeGreaterThan(expToNextBase(data, l));
    for (let l = 1; l < 50; l++) expect(expToNextJob(data, l + 1)).toBeGreaterThan(expToNextJob(data, l));
  });

  it('levels up and grants stat/skill points', () => {
    const c = newChar();
    const res = addExperience(data, c, expToNextBase(data, 1) + expToNextBase(data, 2), expToNextJob(data, 1));
    expect(res.baseLevelsGained).toBe(2);
    expect(c.baseLevel).toBe(3);
    expect(c.jobLevel).toBe(2);
    expect(c.skillPoints).toBe(1);
    expect(c.statPoints).toBe(totalStatPointsAtLevel(data, 3));
  });

  it('novice job level caps at 10', () => {
    const c = newChar();
    addExperience(data, c, 0, 10_000_000);
    expect(c.jobLevel).toBe(10);
    expect(c.jobExp).toBe(0);
  });

  it('base level caps at max', () => {
    const c = newChar();
    addExperience(data, c, 1e12, 0);
    expect(c.baseLevel).toBe(data.balance.levels.maxBaseLevel);
  });
});

describe('derived stats', () => {
  it('combine base stats, equipment and passives', () => {
    const c = newChar();
    const s0 = computeDerivedStats(data, c);
    c.stats.str += 10;
    const s1 = computeDerivedStats(data, c);
    // Ragnarok Classic melee status ATK: STR + floor(STR/10)^2 (+ DEX/5 + LUK/5, unchanged here).
    const atk = (x: number) => x + Math.floor(x / 10) ** 2;
    const str0 = s0.totalStats.str;
    expect(s1.patk - s0.patk).toBe(atk(str0 + 10) - atk(str0));
    expect(s1.weightLimit - s0.weightLimit).toBe(10 * data.balance.stats.weightStr);

    c.skills.basic_training = 5;
    const s2 = computeDerivedStats(data, c);
    expect(s2.maxHp - s1.maxHp).toBe(30);
    expect(s2.hit - s1.hit).toBe(5);
  });

  it('applies runtime buffs and status modifiers', () => {
    const c = newChar();
    const base = computeDerivedStats(data, c);
    const buffed = computeDerivedStats(data, c, [{ aspdPct: 50, patkPct: 100 }]);
    expect(buffed.attackIntervalMs).toBeLessThan(base.attackIntervalMs);
    expect(buffed.patk).toBeGreaterThanOrEqual(base.patk * 2 - 1);
  });

  it('VIT increases HP, INT increases MP and MATK, AGI speeds attacks, DEX speeds casting', () => {
    const c = newChar();
    const s0 = computeDerivedStats(data, c);
    c.stats.vit += 20; c.stats.int += 20; c.stats.agi += 20; c.stats.dex += 20;
    const s1 = computeDerivedStats(data, c);
    expect(s1.maxHp).toBeGreaterThan(s0.maxHp);
    expect(s1.maxMp).toBeGreaterThan(s0.maxMp);
    expect(s1.matk).toBeGreaterThan(s0.matk);
    expect(s1.attackIntervalMs).toBeLessThan(s0.attackIntervalMs);
    expect(s1.castTimeMul).toBeLessThan(s0.castTimeMul);
    expect(s1.flee).toBeGreaterThan(s0.flee);
  });
});

describe('character management', () => {
  it('validates names', () => {
    expect(validateName('A')).not.toBeNull();
    expect(validateName('Hero')).toBeNull();
    expect(validateName('ลีร่า')).toBeNull();
    expect(validateName('bad<name>')).not.toBeNull();
    expect(() => createCharacter(data, '', { body: 'a', hairStyle: 'short', hairColor: '#000', eyeColor: '#000', skinTone: '#fff' })).toThrow();
  });

  it('starts as a Novice with starter gear equipped', () => {
    const c = newChar();
    expect(c.classId).toBe('novice');
    expect(c.equipment.weapon?.itemId).toBe('training_knife');
    expect(c.equipment.armor?.itemId).toBe('cotton_shirt');
    expect(c.inventory.find((i) => i.itemId === 'red_potion')?.qty).toBe(5);
  });

  it('allocates and resets stats', () => {
    const c = newChar();
    const pts = c.statPoints;
    expect(allocateStat(data, c, 'str', 2).ok).toBe(true);
    expect(c.stats.str).toBe(7);
    expect(allocateStat(data, c, 'str', 999).ok).toBe(false);
    resetStats(data, c);
    expect(c.stats.str).toBe(5);
    expect(c.statPoints).toBe(pts);
  });

  it('enforces skill prerequisites, class and points', () => {
    const c = newChar();
    expect(learnSkill(data, c, 'first_aid').ok).toBe(false); // no points
    c.skillPoints = 5;
    expect(learnSkill(data, c, 'first_aid').ok).toBe(true);
    expect(learnSkill(data, c, 'bash').ok).toBe(false); // wrong class
    c.jobLevel = 10;
    expect(changeJob(data, c, 'knight').ok).toBe(true);
    expect(learnSkill(data, c, 'spiral_pierce').ok).toBe(false); // needs bash 5
    for (let i = 0; i < 4; i++) learnSkill(data, c, 'bash');
    expect(c.skills.bash).toBe(4);
    const r = resetSkills(data, c);
    expect(r.ok).toBe(true);
    expect(c.skills).toEqual({});
    expect(c.skillPoints).toBe(5);
  });

  it('job change requires job level 10 from Novice', () => {
    const c = newChar();
    expect(changeJob(data, c, 'mage').ok).toBe(false);
    c.jobLevel = 10;
    expect(changeJob(data, c, 'mage').ok).toBe(true);
    expect(c.classId).toBe('mage');
    expect(c.jobLevel).toBe(1);
    expect(changeJob(data, c, 'knight').ok).toBe(false);
  });
});

describe('Ragnarok Classic stat rules', () => {
  it('points per level, status ATK/MATK, FLEE, CRIT and ASPD follow the classic formulas', async () => {
    const { statPointsForLevel, totalStatPointsAtLevel } = await import('../../src/core/formulas');
    expect([2, 5, 6, 10, 11, 99].map((l) => statPointsForLevel(data, l))).toEqual([3, 3, 4, 4, 5, 22]);
    expect(totalStatPointsAtLevel(data, 1)).toBe(48);
    expect(totalStatPointsAtLevel(data, 99)).toBe(1273); // the classic total at Base Lv 99
    expect(totalStatPointsAtLevel(data, 1, true)).toBe(100); // reborn
    const c = newChar();
    c.stats = { str: 30, agi: 40, vit: 20, int: 35, dex: 25, luk: 10 };
    const s = computeDerivedStats(data, c);
    const t = s.totalStats;
    expect(s.matkMin).toBe(t.int + Math.floor(t.int / 7) ** 2);
    expect(s.matkMax).toBe(t.int + Math.floor(t.int / 5) ** 2);
    expect(s.flee).toBe(c.baseLevel + t.agi);
    expect(s.hit).toBe(c.baseLevel + t.dex);
    expect(s.crit).toBe(1 + Math.floor(t.luk * 0.3));
    expect(s.mdef).toBe(t.int);
  });
});
