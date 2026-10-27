// Balance regression test: each first job, at the intended level band
// (Lv.17, three levels under the boss) with the same shop-bought potion kit,
// must be able to beat Grukk the Thornking on the first attempt. Melee and
// support jobs (Ranger, Cleric, Rogue) win about half the time; that is the
// intended difficulty for a solo first boss.
// Seeds are fixed, so results are deterministic; thresholds document the
// intended difficulty and should be revisited when balance data changes.
import { describe, expect, it } from 'vitest';
import { Bot, fightBoss } from '../helpers/bot';
import { newWorld } from '../helpers/fixtures';
import { buildCharacter } from '../helpers/scenarios';
import { TILE } from '../../src/core/mapCompiler';

const kit: [string, number][] = [['orange_potion', 30], ['blue_potion', 10]];
// 24 fixed seeds: boss fights are chaotic enough that 6 seeds swing by ±2 wins.
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

const cases = [
  {
    name: 'Knight', kite: 0, minWins: 22,
    build: () => buildCharacter({ classId: 'knight', base: 17, job: 16, stats: ['str', 'str', 'vit', 'agi', 'dex'],
      skills: [['bash', 5], ['sword_mastery', 5], ['spiral_pierce', 3], ['shield_guard', 2]], gear: ['iron_sword', 'leather_jacket', 'wooden_buckler', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'spiral_pierce' }, { id: 'bash' }], buffs: ['shield_guard'],
  },
  {
    name: 'Ranger', kite: 140, minWins: 12,
    build: () => buildCharacter({ classId: 'ranger', base: 17, job: 16, stats: ['dex', 'dex', 'agi', 'str', 'vit'],
      skills: [['double_shot', 5], ['eagle_eye', 3], ['falcon_strike', 4], ['rapid_fire', 2]], gear: ['hunter_bow', 'hunter_vest', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'falcon_strike' }, { id: 'double_shot' }], buffs: ['rapid_fire'],
  },
  {
    // Glass cannon: strongest damage (fire vs. an earth boss) but lowest HP.
    name: 'Mage', kite: 150, minWins: 17,
    build: () => buildCharacter({ classId: 'mage', base: 17, job: 16, stats: ['int', 'int', 'dex', 'vit'],
      skills: [['fire_bolt', 8], ['mana_shield', 3], ['fire_wall', 2], ['astral_attunement', 3]], gear: ['oak_staff', 'apprentice_robe', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'fire_bolt' }], buffs: ['mana_shield'],
  },
  {
    name: 'Cleric', kite: 0, minWins: 9,
    build: () => buildCharacter({ classId: 'cleric', base: 17, job: 16, stats: ['int', 'vit', 'int', 'vit', 'dex'],
      skills: [['heal', 5], ['holy_light', 8], ['sacred_ward', 3], ['aegis_hymn', 3]], gear: ['prayer_mace', 'pilgrim_vestment', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'holy_light' }], buffs: ['aegis_hymn'],
  },
  {
    name: 'Rogue', kite: 0, minWins: 8,
    build: () => buildCharacter({ classId: 'rogue', base: 17, job: 16, stats: ['agi', 'str', 'agi', 'dex', 'vit'],
      skills: [['twin_fang', 5], ['evasion_instinct', 5], ['venom_edge', 5], ['knife_throw', 3]], gear: ['stiletto', 'shadow_garb', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'venom_edge' }], buffs: [],
  },
  {
    name: 'Merchant', kite: 0, minWins: 20,
    build: () => { const c = buildCharacter({ classId: 'merchant', base: 17, job: 16, stats: ['str', 'str', 'vit', 'dex'],
      skills: [['pack_mule', 5], ['coin_strike', 5], ['cart_sweep', 3], ['steady_grip', 5]], gear: ['hand_axe', 'merchant_apron', 'wooden_buckler', 'bandana', 'sandals'], potions: kit }); c.luma = 20000; return c; },
    skills: [{ id: 'coin_strike' }, { id: 'cart_sweep' }], buffs: [],
  },
];

describe('every first job can defeat Grukk the Thornking', () => {
  for (const cs of cases) {
    it(`${cs.name} (Lv.17) wins on the first attempt in ≥${cs.minWins}/${SEEDS.length} runs`, () => {
      const results: string[] = [];
      let wins = 0;
      for (const seed of SEEDS) {
        const c = cs.build();
        c.position = { mapId: 'whispering_forest', x: 44 * TILE, y: 38 * TILE };
        const w = newWorld(c, seed * 7919);
        const bot = new Bot(w);
        bot.combatSkills = cs.skills;
        bot.selfBuffs = cs.buffs;
        w.update(16);
        const won = fightBoss(bot, 300_000, cs.kite) && bot.deaths === 0;
        if (won) wins++;
        const used = 30 - (c.inventory.find((i) => i.itemId === 'orange_potion')?.qty ?? 0);
        results.push(won ? `${Math.round(bot.simMs / 1000)}s/${used}pot` : 'lost');
      }
      console.log(`${cs.name}: ${wins}/${SEEDS.length} first-try wins — ${results.join(', ')}`);
      expect(wins).toBeGreaterThanOrEqual(cs.minWins);
    }, 120_000);
  }
});
