// Balance regression test: each Phase 1 class, at the intended level band
// (Lv.17, three levels under the boss) with the same shop-bought potion kit,
// must beat Grukk the Thornking on the first attempt in most runs.
// Seeds are fixed, so results are deterministic; thresholds document the
// intended difficulty and should be revisited when balance data changes.
import { describe, expect, it } from 'vitest';
import { Bot, fightBoss } from '../helpers/bot';
import { newWorld } from '../helpers/fixtures';
import { buildCharacter } from '../helpers/scenarios';
import { TILE } from '../../src/core/mapCompiler';

const kit: [string, number][] = [['orange_potion', 30], ['blue_potion', 10]];
const SEEDS = [1, 2, 3, 4, 5, 6];

const cases = [
  {
    name: 'Knight', kite: 0, minWins: 5,
    build: () => buildCharacter({ classId: 'knight', base: 17, job: 16, stats: ['str', 'str', 'vit', 'agi', 'dex'],
      skills: [['bash', 5], ['sword_mastery', 5], ['spiral_pierce', 3], ['shield_guard', 2]], gear: ['iron_sword', 'leather_jacket', 'wooden_buckler', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'spiral_pierce' }, { id: 'bash' }], buffs: ['shield_guard'],
  },
  {
    name: 'Ranger', kite: 140, minWins: 5,
    build: () => buildCharacter({ classId: 'ranger', base: 17, job: 16, stats: ['dex', 'dex', 'agi', 'str', 'vit'],
      skills: [['double_shot', 5], ['eagle_eye', 3], ['falcon_strike', 4], ['rapid_fire', 2]], gear: ['hunter_bow', 'hunter_vest', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'falcon_strike' }, { id: 'double_shot' }], buffs: ['rapid_fire'],
  },
  {
    // Glass cannon: strongest damage (fire vs. an earth boss) but lowest HP.
    name: 'Mage', kite: 150, minWins: 3,
    build: () => buildCharacter({ classId: 'mage', base: 17, job: 16, stats: ['int', 'int', 'dex', 'vit'],
      skills: [['fire_bolt', 8], ['mana_shield', 3], ['fire_wall', 2], ['astral_attunement', 3]], gear: ['oak_staff', 'apprentice_robe', 'bandana', 'sandals'], potions: kit }),
    skills: [{ id: 'fire_bolt' }], buffs: ['mana_shield'],
  },
];

describe('every Phase 1 class can defeat Grukk the Thornking', () => {
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
