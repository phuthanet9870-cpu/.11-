import { describe, expect, it } from 'vitest';
import { canChangeJob, changeJob, classLineage, learnSkill, rebirth } from '../../src/core/character';
import { canEquip, addItem } from '../../src/core/inventory';
import { computeDerivedStats } from '../../src/core/formulas';
import { forgeChance } from '../../src/core/forge';
import { buildCharacter, levelTo } from '../helpers/scenarios';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

const FIRST = ['knight', 'ranger', 'mage', 'cleric', 'rogue', 'merchant'];

describe('second jobs', () => {
  it('two second jobs per first job, 8 skills each with a passive and an ultimate, and a guild master', () => {
    for (const f of FIRST) {
      const seconds = [...data.classes.values()].filter((c) => c.tier === 2 && c.parent === f);
      expect(seconds.length, f).toBe(2);
      for (const s of seconds) {
        expect(s.skills.length).toBe(8);
        const kinds = s.skills.map((id) => data.skills.get(id)!.kind);
        expect(kinds).toContain('ultimate');
        expect(kinds).toContain('passive');
        expect([...data.npcs.values()].some((n) => n.services.some((x) => x.type === 'jobChange' && x.classIds.includes(s.id)))).toBe(true);
      }
    }
  });

  it('promotion needs Job Lv 40 of the right first job; second jobs keep first-job skills and gear', () => {
    const c = buildCharacter({ classId: 'knight', base: 45, job: 39, stats: ['str'], skills: [], gear: [] });
    expect(canChangeJob(data, c, 'dragoon').ok).toBe(false);
    expect(canChangeJob(data, c, 'sorcerer').ok).toBe(false);
    c.jobLevel = 40;
    expect(changeJob(data, c, 'dragoon').ok).toBe(true);
    expect(classLineage(data, 'dragoon')).toEqual(['novice', 'knight', 'dragoon']);
    c.skillPoints = 10;
    expect(learnSkill(data, c, 'bash').ok).toBe(true);
    expect(learnSkill(data, c, 'impale').ok).toBe(true);
    expect(learnSkill(data, c, 'fire_bolt').ok).toBe(false);
    expect(canEquip(data, c, data.items.get('iron_sword')!).ok).toBe(true);
  });

  it('every weapon type a job can use has gear at Lv 30, 45, 60 and 75', () => {
    const types = new Set([...data.classes.values()].flatMap((c) => c.weaponTypes));
    for (const t of types) {
      if (t === 'crossbow' || t === 'twohand_sword') continue;
      for (const lv of [30, 45, 60, 75]) expect([...data.items.values()].some((i) => i.weaponType === t && i.equipLevel === lv), `${t} ${lv}`).toBe(true);
    }
    expect([...data.shops.values()].some((s) => s.items.includes('tempered_katar'))).toBe(true);
    expect([...data.drops.values()].some((d) => d.entries.some((e) => e.itemId === 'mythril_axe'))).toBe(true);
  });
});

describe('rebirth and transcendent jobs', () => {
  function readyDragoon() {
    const c = buildCharacter({ classId: 'knight', base: 50, job: 40, stats: ['str'], skills: [], gear: [] });
    changeJob(data, c, 'dragoon');
    levelTo(c, 99, 50);
    return c;
  }

  it('needs a second job at Base 99 / Job 50; resets to High Novice with 100 stat points', () => {
    const c = readyDragoon();
    expect(c.baseLevel).toBe(99);
    expect(rebirth(data, c).ok).toBe(true);
    expect(c.classId).toBe('high_novice');
    expect([c.baseLevel, c.jobLevel, c.statPoints]).toEqual([1, 1, 100]);
    expect(c.skills).toEqual({});
    expect(c.flags.rebornFrom).toBe('dragoon');
    const k = buildCharacter({ classId: 'knight', base: 99, job: 50, stats: ['str'], skills: [], gear: [] });
    expect(rebirth(data, k).ok).toBe(false);
  });

  it('reborn path: High Knight, then only the transcendent job of the old second job, with +25% HP', () => {
    const c = readyDragoon();
    rebirth(data, c);
    levelTo(c, 10, 10);
    expect(changeJob(data, c, 'high_knight').ok).toBe(true);
    expect(learnSkill(data, { ...c, skillPoints: 5 }, 'bash').ok).toBe(true);
    levelTo(c, 60, 40);
    expect(canChangeJob(data, c, 'high_templar').ok).toBe(false);
    expect(changeJob(data, c, 'dragon_lord').ok).toBe(true);
    expect(classLineage(data, 'dragon_lord')).toEqual(expect.arrayContaining(['knight', 'dragoon', 'high_knight', 'dragon_lord']));
    const plain = { ...c, classId: 'dragoon' };
    expect(computeDerivedStats(data, c).maxHp).toBeGreaterThan(computeDerivedStats(data, plain).maxHp * 1.2);
  });

  it('world: the Oracle in Aurelion performs the rebirth', () => {
    const c = readyDragoon();
    const town = data.maps.get('aurelion')!;
    const spot = town.npcs.find((n) => n.npcId === 'oracle_rebirth')!;
    c.position = { mapId: 'aurelion', x: spot.x * 32 + 16, y: (spot.y + 1) * 32 + 16 };
    addItem(data, c, 'iron_sword', 1);
    const w = newWorld(c);
    w.update(16);
    expect(w.rebirthAt().ok).toBe(true);
    expect(c.classId).toBe('high_novice');
    expect(Object.keys(c.equipment).length).toBe(0);
  });
});

describe('new skill effects', () => {
  it('Endow Fire makes the weapon fire; Mug pockets Luma once; Smithing raises forge chance', () => {
    const sg = buildCharacter({ classId: 'mage', base: 50, job: 40, stats: ['int'], skills: [], gear: [] });
    changeJob(data, sg, 'sage'); sg.skillPoints = 5; learnSkill(data, sg, 'endow_fire');
    const w = newWorld(sg); w.update(16);
    w.castSkill('endow_fire'); run(w, 200);
    expect(w.stats.weaponElement).toBe('fire');

    const ol = buildCharacter({ classId: 'rogue', base: 50, job: 40, stats: ['luk'], skills: [], gear: ['stiletto'] });
    changeJob(data, ol, 'outlaw'); ol.skillPoints = 5; learnSkill(data, ol, 'rob_luma');
    const w2 = newWorld(ol); w2.update(16);
    const m = w2.spawnMonsterAt('leaf_slime', w2.player.x + 30, w2.player.y)!; m.hp = m.maxHp = 1e6;
    const l0 = ol.luma;
    w2.castSkill('rob_luma', { targetId: m.id }); run(w2, 1600);
    const l1 = ol.luma;
    expect(l1).toBeGreaterThan(l0);
    w2.castSkill('rob_luma', { targetId: m.id }); run(w2, 1600);
    expect(ol.luma).toBe(l1);

    const ar = newChar(); ar.jobLevel = 30;
    const r = [...data.recipes.values()][0];
    const before = forgeChance(data, ar, { recipeId: r.id });
    ar.skills.smithing = 10;
    expect(forgeChance(data, ar, { recipeId: r.id })).toBeCloseTo(Math.min(1, before + 0.1), 10);
  });
});
