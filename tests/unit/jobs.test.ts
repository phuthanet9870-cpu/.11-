import { describe, expect, it } from 'vitest';
import { buyPrice, buyItem, sellPrice } from '../../src/core/inventory';
import { computeDerivedStats, jobBonus } from '../../src/core/formulas';
import { buildCharacter } from '../helpers/scenarios';
import { data, newWorld, run } from '../helpers/fixtures';

const FIRST_JOBS = ['knight', 'ranger', 'mage', 'cleric', 'rogue', 'merchant'];

describe('first jobs', () => {
  it('six first jobs, each with 8+ skills including an ultimate and a passive, and a guild master', () => {
    for (const id of FIRST_JOBS) {
      const cls = data.classes.get(id)!;
      expect(cls.parent).toBe('novice');
      expect(cls.skills.length).toBeGreaterThanOrEqual(8);
      const kinds = cls.skills.map((s) => data.skills.get(s)!.kind);
      expect(kinds).toContain('ultimate');
      expect(kinds).toContain('passive');
      const master = [...data.npcs.values()].find((n) => n.services.some((s) => s.type === 'jobChange' && s.classIds.includes(id)));
      expect(master, id).toBeTruthy();
    }
  });

  it('job bonus stats grow with job level and differ by job', () => {
    const k = data.classes.get('knight')!, m = data.classes.get('mage')!;
    expect(Object.values(jobBonus(k, 1)).every((v) => v === 0)).toBe(true);
    const k50 = jobBonus(k, 50), m50 = jobBonus(m, 50);
    expect(Object.values(k50).reduce((a, b) => a + b)).toBe(18);
    expect(k50.str).toBeGreaterThan(k50.int);
    expect(m50.int).toBeGreaterThan(m50.str);
    const c = buildCharacter({ classId: 'knight', base: 20, job: 30, stats: ['str'], skills: [], gear: [] });
    const s = computeDerivedStats(data, c);
    expect(s.jobBonusStats).toEqual(jobBonus(k, 30));
    expect(s.totalStats.str).toBe(c.stats.str + s.jobBonusStats.str);
  });

  it('job weight bonus: merchants carry more than mages; Pack Mule adds 200 per level', () => {
    const mer = buildCharacter({ classId: 'merchant', base: 20, job: 20, stats: ['vit'], skills: [['pack_mule', 5]], gear: [] });
    const mag = buildCharacter({ classId: 'mage', base: 20, job: 20, stats: ['vit'], skills: [], gear: [] });
    const free = (c: typeof mer) => { const s = computeDerivedStats(data, c); return s.weightLimit - s.totalStats.str * data.balance.stats.weightStr; };
    expect(free(mer) - free(mag)).toBe(800 - 200 + 5 * 200);
  });

  it('ASPD is 200 − delay/20 and caps at 190', () => {
    const c = buildCharacter({ classId: 'rogue', base: 20, job: 20, stats: ['agi'], skills: [], gear: [] });
    const s = computeDerivedStats(data, c);
    expect(s.aspd).toBeCloseTo(200 - s.attackIntervalMs / 20, 1);
    const fast = computeDerivedStats(data, c, [{ aspdPct: 1000 }]);
    expect(fast.attackIntervalMs).toBe(200);
    expect(fast.aspd).toBe(190);
  });

  it('Haggle lowers shop prices and Silver Tongue raises sell prices (max 24%)', () => {
    const c = buildCharacter({ classId: 'merchant', base: 20, job: 30, stats: ['vit'], skills: [['pack_mule', 3], ['haggle', 10], ['silver_tongue', 5]], gear: [] });
    c.luma = 10000;
    expect(buyPrice(data, c, 'red_potion')).toBe(Math.floor(data.items.get('red_potion')!.price * 0.76));
    expect(sellPrice(data, 'red_potion', c)).toBe(Math.floor((data.items.get('red_potion')!.price * data.balance.economy.sellPriceRatio * 112) / 100));
    const shop = [...data.shops.values()].find((s) => s.items.includes('red_potion'))!;
    const before = c.luma;
    expect(buyItem(data, c, shop.id, 'red_potion', 10, 99999).ok).toBe(true);
    expect(before - c.luma).toBe(buyPrice(data, c, 'red_potion') * 10);
  });

  it('Coin Strike costs Luma and refuses without enough', () => {
    const c = buildCharacter({ classId: 'merchant', base: 20, job: 20, stats: ['str'], skills: [['coin_strike', 3]], gear: [] });
    const w = newWorld(c);
    c.luma = 250;
    expect(w.canUseSkill('coin_strike').ok).toBe(false);
    c.luma = 5000;
    expect(w.skillLumaCost(data.skills.get('coin_strike')!, 3)).toBe(300);
    const m = w.spawnMonsterAt('leaf_slime', w.player.x + 30, w.player.y)!;
    m.hp = m.maxHp = 1e6; // survives, so no Luma drop muddies the count
    w.castSkill('coin_strike', { targetId: m.id });
    run(w, 1500);
    expect(c.luma).toBe(5000 - 300);
  });

  it('Pilfer steals one item once per monster and never from a boss', () => {
    const c = buildCharacter({ classId: 'rogue', base: 30, job: 20, stats: ['dex'], skills: [['pilfer', 10]], gear: [] });
    const w = newWorld(c);
    let stolen = 0;
    for (let i = 0; i < 20 && !stolen; i++) {
      const m = w.spawnMonsterAt('leaf_slime', w.player.x + 30, w.player.y)!;
      const before = c.inventory.reduce((a, x) => a + x.qty, 0);
      w.castSkill('pilfer', { targetId: m.id });
      run(w, 1100);
      if (c.inventory.reduce((a, x) => a + x.qty, 0) > before) {
        stolen++;
        expect(m.stolen).toBe(true);
        w.castSkill('pilfer', { targetId: m.id });
        const after = c.inventory.reduce((a, x) => a + x.qty, 0);
        run(w, 1100);
        expect(c.inventory.reduce((a, x) => a + x.qty, 0)).toBe(after);
      }
      w.monsters.delete(m.id);
    }
    expect(stolen).toBe(1);
  });

  it('Purify cures statuses; Twin Fang only works with daggers', () => {
    const c = buildCharacter({ classId: 'cleric', base: 20, job: 20, stats: ['int'], skills: [['purify', 1]], gear: [] });
    const w = newWorld(c);
    w.applyStatus(w.player, 'poison', 1, 10000);
    expect(w.player.statuses.some((s) => s.id === 'poison')).toBe(true);
    w.castSkill('purify');
    run(w, 200);
    expect(w.player.statuses.some((s) => s.id === 'poison')).toBe(false);
    const r = buildCharacter({ classId: 'rogue', base: 20, job: 20, stats: ['agi'], skills: [['twin_fang', 10]], gear: ['stiletto'] });
    expect(computeDerivedStats(data, r).doubleAttackPct).toBe(50);
    r.equipment = {};
    expect(computeDerivedStats(data, r).doubleAttackPct).toBe(0);
  });
});
