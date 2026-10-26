// End-to-end Phase 1 playthrough on the real simulation: create a character,
// follow the main quest line, change job, level up, and defeat the first boss.
import { describe, expect, it } from 'vitest';
import { Bot, fightBoss } from '../helpers/bot';
import { data, newChar, newWorld } from '../helpers/fixtures';
import { countItem } from '../../src/core/inventory';

describe('Phase 1 playthrough (Knight)', () => {
  it('goes from character creation to defeating Grukk and completing Chapter 1', () => {
    const c = newChar('Aria');
    const w = newWorld(c, 42);
    const bot = new Bot(w, ['str', 'str', 'vit', 'agi', 'dex'], ['basic_training', 'first_aid']);

    // --- Chapter 1 opening in Willowbrook
    expect(w.map.def.id).toBe('willowbrook');
    bot.accept('main_awakening');
    bot.talkTo('seraphine');
    expect(c.quests.main_awakening.status).toBe('ready');
    bot.turnIn('main_awakening');
    bot.accept('main_slimes');
    bot.accept('side_old_well');
    bot.interactObject('willowbrook', 'old_well');
    expect(countItem(c, 'well_water')).toBe(1);
    bot.turnIn('side_old_well');

    // --- Sunny Meadow: first fights
    bot.travelTo('sunny_meadow');
    expect(w.map.def.id).toBe('sunny_meadow');
    bot.grind(['leaf_slime'], () => c.quests.main_slimes.status === 'ready');
    bot.grind(['leaf_slime'], () => countItem(c, 'jelly') >= 5);
    bot.turnIn('main_slimes');
    bot.accept('main_garrick');
    bot.turnIn('main_garrick');
    // Equip the reward buckler & bandana.
    for (const id of ['wooden_buckler', 'bandana', 'sandals']) {
      const inst = c.inventory.find((i) => i.itemId === id);
      if (inst) expect(w.equip(inst.uid).ok).toBe(true);
    }
    expect(c.equipment.shield?.itemId).toBe('wooden_buckler');

    bot.accept('side_rabbit_horns');
    bot.grind(['horn_rabbit', 'leaf_slime'], () => countItem(c, 'rabbit_horn') >= 6);
    bot.turnIn('side_rabbit_horns');
    bot.grind(['horn_rabbit', 'mushling', 'leaf_slime'], () => c.jobLevel >= 10);
    expect(c.jobLevel).toBe(10);
    bot.grind(['mushling', 'buzz_wasp'], () => c.baseLevel >= 11);

    // --- Job change: Knight trial in the Whispering Forest
    bot.accept('job_knight');
    bot.travelTo('whispering_forest');
    bot.grind(['forest_goblin'], () => c.quests.job_knight.status === 'ready');
    bot.turnIn('job_knight');
    expect(c.classId).toBe('knight');
    bot.skillPlan = ['bash', 'sword_mastery', 'shield_guard', 'spiral_pierce', 'provoke', 'war_cry'];
    bot.combatSkills = [{ id: 'spiral_pierce' }, { id: 'bash' }];
    bot.selfBuffs = [];
    bot.spendPoints();
    const sword = c.inventory.find((i) => i.itemId === 'iron_sword');
    if (sword) {
      // Level requirement 8 should be met by now.
      expect(w.equip(sword.uid).ok).toBe(true);
    }

    // --- Main quest: into the forest
    bot.accept('main_forest');
    bot.talkTo('elwin');
    bot.turnIn('main_forest');
    bot.accept('main_goblins');
    bot.travelTo('whispering_forest');
    bot.grind(['forest_goblin'], () => c.quests.main_goblins.status === 'ready');
    bot.turnIn('main_goblins');

    // Level up for the boss.
    bot.grind(['forest_goblin', 'thorn_wolf', 'venom_spore'], () => c.baseLevel >= 16, 6 * 3_600_000);
    // Stock up on potions and better armour.
    bot.talkTo('elwin');
    w.setSavePoint();
    bot.buy('pip', 'pip_tools', 'orange_potion', Math.min(30, Math.floor((c.luma * 0.5) / 80)));
    bot.buy('pip', 'pip_tools', 'blue_potion', Math.min(8, Math.floor((c.luma * 0.4) / 150)));
    if (c.luma >= 1400 && c.baseLevel >= 12) {
      bot.buy('garrick', 'garrick_smithy', 'chain_mail', 1);
      const cm = c.inventory.find((i) => i.itemId === 'chain_mail');
      if (cm) w.equip(cm.uid);
    }
    bot.spendPoints();

    // --- Boss: Grukk the Thornking
    bot.accept('main_thornking');
    bot.travelTo('whispering_forest');
    const findBoss = () => [...w.monsters.values()].find((m) => m.boss && !m.dead);
    let attempts = 0;
    bot.events = [];
    while (c.quests.main_thornking.status !== 'ready') {
      if (++attempts > 6) throw new Error(`Boss not defeated after 6 attempts. Log:\n${bot.log.slice(-30).join('\n')}`);
      bot.travelTo('whispering_forest');
      bot.runUntil(() => !!findBoss(), 400_000);
      const won = fightBoss(bot);
      if (won) { bot.lootAll(); continue; }
      // Retreat, level a bit more, restock, and try again.
      const goal = c.baseLevel + 1;
      bot.grind(['forest_goblin', 'thorn_wolf'], () => c.baseLevel >= goal, 3_600_000);
      bot.buy('elwin', 'elwin_camp', 'orange_potion', Math.min(20, Math.floor((c.luma * 0.6) / 80)));
    }
    expect(bot.events.some((e) => e.type === 'bossIntro')).toBe(true);
    expect(c.stats_meta.bossKills.grukk).toBeGreaterThanOrEqual(1);
    expect(countItem(c, 'thorn_crown')).toBeGreaterThanOrEqual(1);
    bot.turnIn('main_thornking');
    bot.accept('main_report');
    bot.turnIn('main_report');
    expect(c.flags.chapter1_complete).toBe(true);

    const deathsByMap: Record<string, number> = {};
    for (const l of bot.log) { const m = l.match(/DIED on (\S+) \(lv (\d+)\)/); if (m) deathsByMap[`${m[1]}@${m[2]}`] = (deathsByMap[`${m[1]}@${m[2]}`] ?? 0) + 1; }
    console.log("deaths by map@level", JSON.stringify(deathsByMap));
    // Summary for the test report.
    console.log(`Playthrough complete in ${(bot.simMs / 60000).toFixed(1)} simulated minutes: ` +
      `Base Lv ${c.baseLevel}, Job Lv ${c.jobLevel} ${data.classes.get(c.classId)!.name}, kills ${c.stats_meta.kills}, deaths ${c.stats_meta.deaths}, boss attempts ${attempts}.`);
  }, 300_000);
});
