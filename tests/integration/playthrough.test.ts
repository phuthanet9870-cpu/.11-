// End-to-end playthrough on the real simulation: create a character, finish
// the tutorial chain, change job at the Knight guild, refine, and defeat Grukk.
import { describe, expect, it } from 'vitest';
import { Bot, fightBoss } from '../helpers/bot';
import { data, newChar, newWorld } from '../helpers/fixtures';
import { countItem } from '../../src/core/inventory';

describe('playthrough (Knight)', () => {
  it('tutorial → job change in Aurelion → defeats Grukk', () => {
    const c = newChar('Aria');
    const w = newWorld(c, 42);
    const bot = new Bot(w, ['str', 'str', 'vit', 'agi', 'dex'], ['basic_training', 'first_aid']);

    // --- Tutorial chain in Willowbrook
    expect(w.map.def.id).toBe('willowbrook');
    bot.accept('tut_welcome');
    bot.talkTo('seraphine');
    expect(c.quests.tut_welcome.status).toBe('ready');
    bot.turnIn('tut_welcome');
    bot.accept('tut_hunt');
    bot.travelTo('sunny_meadow');
    bot.grind(['leaf_slime'], () => c.quests.tut_hunt.status === 'ready');
    bot.turnIn('tut_hunt');
    bot.accept('tut_weapon');
    expect(bot.buy('garrick', 'garrick_smithy', 'oak_club', 1).ok).toBe(true);
    expect(w.equip(c.inventory.find((i) => i.itemId === 'oak_club')!.uid).ok).toBe(true);
    bot.turnIn('tut_weapon');
    bot.accept('tut_refine');
    expect(w.refine(c.equipment.weapon!.uid).ok).toBe(true);
    expect(c.equipment.weapon!.refine).toBe(1);
    bot.turnIn('tut_refine');
    bot.accept('tut_path');
    bot.grind(['horn_rabbit', 'mushling', 'leaf_slime'], () => c.jobLevel >= 10);
    bot.turnIn('tut_path');
    expect(Object.values(c.quests).every((q) => q.status === 'completed')).toBe(true);

    // --- Job change at the Knight guild in the capital Aurelion
    bot.grind(['mushling', 'buzz_wasp'], () => c.baseLevel >= 11);
    bot.talkTo('guild_knight');
    expect(w.map.def.id).toBe('aurelion');
    expect(w.changeJobAt('knight').ok).toBe(true);
    expect(c.classId).toBe('knight');
    bot.skillPlan = ['bash', 'sword_mastery', 'shield_guard', 'spiral_pierce', 'provoke', 'war_cry'];
    bot.combatSkills = [{ id: 'spiral_pierce' }, { id: 'bash' }];
    bot.selfBuffs = [];
    bot.spendPoints();
    // Refine the club safely to +4 with the tutorial ores plus some bought ones.
    bot.buy('aurelion_smith', 'aurelion_arms', 'starsteel_ore', 3);
    for (let i = 0; i < 3 && (c.equipment.weapon!.refine ?? 0) < 4; i++) w.refine(c.equipment.weapon!.uid);
    bot.buy('aurelion_smith', 'aurelion_arms', 'iron_sword', 1);
    const sword = c.inventory.find((i) => i.itemId === 'iron_sword');
    if (sword) expect(w.equip(sword.uid).ok).toBe(true);

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

    // Ragnarok size rule: swords hit Large targets for 75%, spears for 100%, so take a spear
    // to the Large boss and refine it within the safe range.
    // Save up first: spear 1700 + a shield + ~25 potions.
    bot.grind(['forest_goblin', 'thorn_wolf', 'venom_spore'], () => c.luma >= 5000 || c.baseLevel >= 24, 4 * 3_600_000);
    if (c.luma >= 1700) {
      bot.buy('aurelion_smith', 'aurelion_arms', 'knight_spear', 1);
      const spear = c.inventory.find((i) => i.itemId === 'knight_spear');
      if (spear && w.equip(spear.uid).ok) {
        while ((c.equipment.weapon!.refine ?? 0) < 4 && w.refine(c.equipment.weapon!.uid).ok) { /* safe range, tutorial ores */ }
      }
    }
    for (const [item, price] of [['iron_shield', 900], ['chain_mail', 1400]] as const) {
      if (c.luma >= price + 1600) { bot.buy('aurelion_smith', 'aurelion_arms', item, 1); const it = c.inventory.find((i) => i.itemId === item); if (it) w.equip(it.uid); }
    }
    bot.buy('aurelion_merchant', 'aurelion_tools', 'orange_potion', Math.min(30, Math.floor((c.luma * 0.8) / 80)));

    // --- Field boss: Grukk the Thornking in the Whispering Forest
    bot.travelTo('whispering_forest');
    const findBoss = () => [...w.monsters.values()].find((m) => m.boss && !m.dead);
    let attempts = 0;
    bot.events = [];
    while (!(c.stats_meta.bossKills.grukk >= 1)) {
      if (++attempts > 6) throw new Error(`Boss not defeated after 6 attempts. Log:\n${bot.log.slice(-30).join('\n')}`);
      bot.travelTo('whispering_forest');
      bot.runUntil(() => !!findBoss(), 400_000);
      const won = fightBoss(bot);
      if (won) { bot.lootAll(); continue; }
      const goal = c.baseLevel + 1;
      bot.grind(['forest_goblin', 'thorn_wolf'], () => c.baseLevel >= goal, 3_600_000);
      bot.buy('elwin', 'elwin_camp', 'orange_potion', Math.min(20, Math.floor((c.luma * 0.6) / 80)));
    }
    expect(bot.events.some((e) => e.type === 'bossIntro')).toBe(true);
    expect(countItem(c, 'thorn_crown')).toBeGreaterThanOrEqual(1);

    const deathsByMap: Record<string, number> = {};
    for (const l of bot.log) { const m = l.match(/DIED on (\S+) \(lv (\d+)\)/); if (m) deathsByMap[`${m[1]}@${m[2]}`] = (deathsByMap[`${m[1]}@${m[2]}`] ?? 0) + 1; }
    console.log("deaths by map@level", JSON.stringify(deathsByMap));
    // Summary for the test report.
    console.log(`Playthrough complete in ${(bot.simMs / 60000).toFixed(1)} simulated minutes: ` +
      `Base Lv ${c.baseLevel}, Job Lv ${c.jobLevel} ${data.classes.get(c.classId)!.name}, kills ${c.stats_meta.kills}, deaths ${c.stats_meta.deaths}, boss attempts ${attempts}.`);
  }, 300_000);
});

describe('world travel', () => {
  it('walks through portals to every one of the 36 world maps', () => {
    const c = newChar('Wanderer');
    const w = newWorld(c, 7);
    w.godMode = true;
    const bot = new Bot(w);
    const seen = new Set<string>([w.map.def.id]);
    for (const m of data.maps.values()) if (m.type !== 'instance' && m.type !== 'arena' && !m.mvp) { bot.travelTo(m.id); seen.add(w.map.def.id); }
    expect(seen.size).toBe(36);
  }, 300_000);
});
