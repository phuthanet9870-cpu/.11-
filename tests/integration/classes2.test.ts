// Balance measurement for the second jobs: Lv 50, Job 40, Lv 45 shop/drop gear
// and a potion kit, against Archmage Valdris (Lv 44 dungeon boss) in Arcanthe
// Tower. 12 fixed seeds. Thresholds sit just under the measured win counts so a
// balance change that makes a job much weaker fails the test.
import { describe, expect, it } from 'vitest';
import { Bot, fightBoss } from '../helpers/bot';
import { data, newChar, newWorld } from '../helpers/fixtures';
import { levelTo } from '../helpers/scenarios';
import { addItem, equipItem } from '../../src/core/inventory';
import { allocateStat, changeJob, learnSkill } from '../../src/core/character';
import type { StatKey } from '../../src/core/types';
import { TILE } from '../../src/core/mapCompiler';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
type Case = { id: string; first: string; stats: StatKey[]; skills: [string, number][]; gear: string[]; use: string[]; buffs: string[]; kite: number; minWins: number };

const armor = (set: string) => [`runed_${set}_armor`, `runed_${set}_headgear`, `runed_${set}_garment`, `runed_${set}_boots`];
const CASES: Case[] = [
  { id: 'dragoon', first: 'knight', stats: ['str', 'str', 'vit', 'dex', 'agi'], skills: [['impale', 8], ['lance_mastery', 6], ['war_banner', 3], ['iron_hide', 3]], gear: ['runed_spear', ...armor('heavy')], use: ['impale'], buffs: ['war_banner', 'iron_hide'], kite: 0, minWins: 9 },
  { id: 'templar', first: 'knight', stats: ['str', 'vit', 'vit', 'dex'], skills: [['sacred_strike', 8], ['faith', 6], ['holy_bulwark', 3], ['shield_bash', 3]], gear: ['runed_sword', 'runed_shield', ...armor('heavy')], use: ['sacred_strike'], buffs: ['holy_bulwark'], kite: 0, minWins: 7 },
  { id: 'beastmaster', first: 'ranger', stats: ['dex', 'dex', 'agi', 'vit'], skills: [['blitz_falcon', 8], ['falcon_bond', 6], ['keen_senses', 3], ['beast_bane', 3]], gear: ['runed_bow', ...armor('light')], use: ['blitz_falcon'], buffs: ['keen_senses'], kite: 150, minWins: 7 },
  { id: 'minstrel', first: 'ranger', stats: ['dex', 'dex', 'vit', 'int'], skills: [['melody_strike', 8], ['music_lessons', 6], ['song_of_haste', 3], ['song_of_vigor', 3]], gear: ['runed_bow', ...armor('light')], use: ['melody_strike'], buffs: ['song_of_haste', 'song_of_vigor'], kite: 150, minWins: 4 },
  { id: 'sorcerer', first: 'mage', stats: ['int', 'int', 'dex', 'vit'], skills: [['arcane_focus', 6], ['heavens_drive', 8], ['mana_well', 3], ['sightrasher', 3]], gear: ['runed_staff', ...armor('robe')], use: ['heavens_drive'], buffs: ['mana_well'], kite: 160, minWins: 9 },
  { id: 'sage', first: 'mage', stats: ['int', 'int', 'dex', 'vit'], skills: [['study', 6], ['earth_spike_volley', 8], ['double_cast', 3], ['endow_earth', 1]], gear: ['runed_staff', ...armor('robe')], use: ['earth_spike_volley'], buffs: ['double_cast'], kite: 160, minWins: 10 },
  { id: 'bishop', first: 'cleric', stats: ['int', 'vit', 'int', 'dex'], skills: [['turn_undead', 8], ['holy_mastery', 6], ['kyrie', 3], ['greater_heal', 3]], gear: ['runed_staff', ...armor('robe')], use: ['turn_undead'], buffs: ['kyrie'], kite: 0, minWins: 10 },
  { id: 'ascetic', first: 'cleric', stats: ['str', 'agi', 'vit', 'dex'], skills: [['triple_blow', 6], ['iron_fist', 6], ['spirit_spheres', 3], ['chain_combo', 5]], gear: ['runed_knuckle', ...armor('light')], use: ['chain_combo', 'triple_blow'], buffs: ['spirit_spheres'], kite: 0, minWins: 10 },
  { id: 'shadowblade', first: 'rogue', stats: ['agi', 'str', 'agi', 'dex', 'vit'], skills: [['sonic_blade', 8], ['katar_mastery', 6], ['assassin_edge', 3], ['venom_spray', 3]], gear: ['runed_katar', ...armor('light')], use: ['sonic_blade'], buffs: ['assassin_edge'], kite: 0, minWins: 10 },
  { id: 'outlaw', first: 'rogue', stats: ['dex', 'agi', 'str', 'vit'], skills: [['backstab', 8], ['vulture_eye', 6], ['rob_luma', 3], ['strip_armor', 3]], gear: ['runed_sword', ...armor('light')], use: ['backstab'], buffs: [], kite: 0, minWins: 10 },
  { id: 'artisan', first: 'merchant', stats: ['str', 'str', 'vit', 'dex'], skills: [['power_thrust', 5], ['adrenaline_rush', 5], ['smithing', 6], ['cart_crash', 5]], gear: ['runed_axe', ...armor('heavy')], use: ['cart_crash'], buffs: ['power_thrust', 'adrenaline_rush'], kite: 0, minWins: 9 },
  { id: 'alchemist', first: 'merchant', stats: ['dex', 'str', 'vit', 'int'], skills: [['acid_terror', 8], ['potion_research', 6], ['chemical_shield', 3], ['aid_potion', 3]], gear: ['runed_axe', ...armor('heavy')], use: ['acid_terror'], buffs: ['chemical_shield'], kite: 0, minWins: 9 },
];

function build(cs: Case, seedName: string) {
  const c = newChar(seedName);
  levelTo(c, c.baseLevel, 10); c.jobLevel = 10;
  changeJob(data, c, cs.first);
  levelTo(c, 40, 40);
  changeJob(data, c, cs.id);
  levelTo(c, 50, 40);
  let i = 0;
  for (let g = 0; g < 2000 && c.statPoints > 0; g++) allocateStat(data, c, cs.stats[i++ % cs.stats.length], 1);
  c.skillPoints += 60;
  for (const [s, n] of cs.skills) for (let k = 0; k < n; k++) learnSkill(data, c, s);
  for (const g of cs.gear) { addItem(data, c, g, 1, { ignoreWeight: true }); const r = equipItem(data, c, c.inventory.find((x) => x.itemId === g)!.uid); if (!r.ok) throw new Error(`${cs.id} ${g}: ${r.error}`); }
  addItem(data, c, 'yellow_potion', 40, { ignoreWeight: true }); addItem(data, c, 'blue_potion', 20, { ignoreWeight: true });
  c.luma = 50000;
  // Seven tiles south of the boss, in its hall.
  const boss = data.maps.get('arcanthe_tower')!.bossSpawn!;
  c.position = { mapId: 'arcanthe_tower', x: boss.x * TILE, y: (boss.y + 7) * TILE };
  return c;
}

describe('second jobs vs Archmage Valdris (Lv 44 boss) at Lv 50', () => {
  for (const cs of CASES) {
    it(`${cs.id}: ≥${cs.minWins}/${SEEDS.length}`, () => {
      let wins = 0; const res: string[] = [];
      for (const seed of SEEDS) {
        const c = build(cs, `T${cs.id}`);
        for (const [s] of cs.skills) if (!c.skills[s]) throw new Error(`${cs.id}: could not learn ${s}`);
        const w = newWorld(c, seed * 7919);
        for (const m of w.monsters.values()) if (!m.boss) w.monsters.delete(m.id);
        const bot = new Bot(w);
        bot.combatSkills = cs.use.map((id) => ({ id }));
        bot.selfBuffs = cs.buffs;
        w.update(16);
        const won = fightBoss(bot, 400_000, cs.kite) && bot.deaths === 0;
        if (won) wins++;
        res.push(won ? `${Math.round(bot.simMs / 1000)}s` : `lost@${Math.round(bot.simMs / 1000)}s`);
      }
      console.log(`${cs.id}: ${wins}/${SEEDS.length} — ${res.join(', ')}`);
      expect(wins).toBeGreaterThanOrEqual(cs.minWins);
    }, 300_000);
  }
});
