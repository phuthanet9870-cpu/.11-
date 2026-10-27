// Generates the second jobs, the rebirth (High Novice / high first jobs),
// the transcendent jobs, their skills and the Lv 30–85 gear tiers.
// Run with `npm run jobs:build` (then `npm run world:build` to place gear in
// shops and drop tables). Entries carry `jobgen: true` and are rebuilt on
// every run; hand-written classes, skills and items are left alone.
//
// Mechanics follow Ragnarok Online (two second jobs per first job, rebirth at
// Base 99 / Job 50, transcendent +25% HP/MP); names, skills and numbers are
// original to Veyloria.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type J = Record<string, any>;
const DATA = join(process.cwd(), 'src/data');
const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const write = (f: string, v: unknown) => writeFileSync(join(DATA, f), JSON.stringify(v, null, 2) + '\n');

// ------------------------------------------------------------------ effect helpers
const D = (mult: number, per: number, o: J = {}) => ({ type: 'damage', kind: 'physical', multiplier: mult, perLevel: per, element: 'weapon', ...o });
const M = (mult: number, per: number, element: string, o: J = {}) => ({ type: 'damage', kind: 'magic', multiplier: mult, perLevel: per, element, ...o });
const ST = (status: string, chance: number, per: number, ms: number, o: J = {}) => ({ type: 'status', status, chance, perLevel: per, durationMs: ms, ...o });
const B = (id: string, ms: number, mods: J, per?: J, perMs?: number, o: J = {}) => ({ type: 'buff', buffId: id, durationMs: ms, mods, ...(per ? { modsPerLevel: per } : {}), ...(perMs ? { perLevelMs: perMs } : {}), ...o });
const Z = (id: string, ms: number, r: number, tick: number, kind: string, mult: number, per: number, element: string, o: J = {}) =>
  ({ type: 'groundZone', zoneId: id, durationMs: ms, radius: r, tickMs: tick, kind, multiplier: mult, perLevel: per, element, ...o });
const H = (base: number, per: number, intScale: number) => ({ type: 'heal', base, perLevel: per, intScale });

interface SkillSpec {
  id: string; name: string; kind: 'active' | 'passive' | 'buff' | 'ultimate'; tgt: 'enemy' | 'self' | 'ground' | 'passive';
  desc: string; max?: number; range?: number; mp?: number; mpl?: number; cast?: number; cd?: number;
  fx?: string; glyph: string; color: string; effects?: J[]; passive?: J; req?: [string, number][]; jl?: number; weapon?: string[]; element?: string; luma?: [number, number];
}
const S = (id: string, name: string, kind: SkillSpec['kind'], tgt: SkillSpec['tgt'], desc: string, glyph: string, color: string, o: Partial<SkillSpec> = {}): SkillSpec =>
  ({ id, name, kind, tgt, desc, glyph, color, ...o });

interface JobSpec {
  id: string; name: string; parent: string; role: string; desc: string; hp: number; mp: number; aspd: number; weight: number;
  weapons: string[]; bonus: Record<string, number>; outfit: J; town: string; master: [string, string]; skills: SkillSpec[];
  trans: { id: string; name: string; desc: string; skills: SkillSpec[] };
}

// ------------------------------------------------------------------ second jobs
const JOBS: JobSpec[] = [
  {
    id: 'dragoon', name: 'Dragoon', parent: 'knight', role: 'Mounted lancer', desc: 'Knights who ride war-drakes and break lines with the spear.',
    hp: 21, mp: 4, aspd: 900, weight: 900, weapons: ['dagger', 'club', 'sword', 'spear', 'twohand_sword'], bonus: { s: 5, v: 3, d: 2, a: 2 },
    outfit: { primary: '#2f5a8f', secondary: '#c8d4e6', accent: '#e2c14f', style: 'plate' }, town: 'aurelion', master: ['Sir Caldus', 'Dragoon Captain'],
    skills: [
      S('drake_riding', 'Drake Riding', 'passive', 'passive', 'Ride a war-drake: +4% move speed and +60 carry weight per level.', 'DR', '#7fb0ff', { max: 5, passive: { moveSpeedPct: 4, weightLimit: 60 } }),
      S('lance_mastery', 'Lance Mastery', 'passive', 'passive', '+5 ATK, +1 HIT and +1% damage to Large foes per level.', 'LM', '#c0c8d8', { passive: { patk: 5, hit: 1, sizeDamagePct: { large: 1 } } }),
      S('impale', 'Impale', 'active', 'enemy', 'A charging lance thrust that ignores part of the target\'s DEF.', 'Im', '#ff8a5a', { range: 90, mp: 10, mpl: 1, cd: 1500, fx: 'pierce', effects: [D(1.8, 0.35, { ignoreDefPct: 20 })] }),
      S('drake_sweep', 'Drake Sweep', 'active', 'self', 'Wheel the drake around: spear sweep that hits everything nearby and knocks it back.', 'DS', '#ffb05a', { mp: 18, mpl: 2, cd: 4000, fx: 'whirl', req: [['impale', 3]], effects: [D(1.6, 0.25, { radius: 120 }), { type: 'knockback', distance: 70 }] }),
      S('war_banner', 'War Banner', 'buff', 'self', 'Raise the banner: +3% ATK and +2% attack speed per level.', 'WB', '#ffd34d', { max: 5, mp: 25, mpl: 3, cd: 60000, fx: 'shout', effects: [B('war_banner', 90000, { patkPct: 3, aspdPct: 2 }, { patkPct: 3, aspdPct: 2 })] }),
      S('iron_hide', 'Iron Hide', 'buff', 'self', 'Brace behind your armor: +8% DEF and +4% max HP per level.', 'IH', '#a0a8b8', { max: 5, mp: 20, cd: 45000, fx: 'shout', effects: [B('iron_hide', 30000, { pdefPct: 8, maxHpPct: 4 }, { pdefPct: 8, maxHpPct: 4 })] }),
      S('skewer_line', 'Skewer Line', 'active', 'enemy', 'Drive the lance through a whole line of enemies.', 'SL', '#ff6a3a', { range: 220, mp: 22, mpl: 2, cd: 3000, fx: 'pierce', req: [['impale', 5]], effects: [{ type: 'line', length: 260, width: 50 }, D(2.2, 0.3)] }),
      S('sky_dive', 'Sky Dive', 'ultimate', 'ground', 'ULTIMATE. The drake leaps and crashes down: huge damage in an area, stunning foes.', 'SD', '#ffef8a', { range: 260, mp: 45, mpl: 5, cast: 500, cd: 15000, jl: 30, fx: 'meteor', req: [['skewer_line', 3], ['war_banner', 2]], effects: [D(3.2, 0.5, { radius: 140 }), ST('stun', 0.3, 0.04, 2000, { radius: 140 })] }),
    ],
    trans: { id: 'dragon_lord', name: 'Dragon Lord', desc: 'Reborn dragoons whose drakes have become true dragons.', skills: [
      S('dragon_fury', 'Dragon Fury', 'buff', 'self', 'TRANSCENDENT. +20% ATK and +15% attack speed, but −20% DEF.', 'DF', '#ff3a3a', { max: 5, mp: 50, cd: 90000, fx: 'shout', effects: [B('dragon_fury', 60000, { patkPct: 12, aspdPct: 10, pdefPct: -20 }, { patkPct: 2, aspdPct: 1 })] }),
      S('wyrm_spiral', 'Wyrm Spiral', 'active', 'enemy', 'TRANSCENDENT. A spiralling dragon-lance that hits five times.', 'WS', '#ffb0ff', { range: 90, mp: 40, mpl: 4, cd: 6000, fx: 'pierce', req: [['impale', 5]], effects: [D(1.2, 0.18, { hits: 5, ignoreDefPct: 30 })] }),
    ] },
  },
  {
    id: 'templar', name: 'Templar', parent: 'knight', role: 'Holy defender', desc: 'Shield-bearing knights sworn to the dawn; holy strikes and unbreakable defence.',
    hp: 22, mp: 6, aspd: 940, weight: 800, weapons: ['dagger', 'club', 'sword', 'spear', 'twohand_sword'], bonus: { v: 5, s: 3, i: 2, d: 1 },
    outfit: { primary: '#e8e0c8', secondary: '#8a2a2a', accent: '#ffd34d', style: 'plate' }, town: 'aurelion', master: ['Dame Ysolde', 'Templar Commander'],
    skills: [
      S('faith', 'Faith', 'passive', 'passive', '+3% max HP and 3% holy resist per level.', 'Fa', '#fff3a0', { passive: { maxHpPct: 3, elementResistPct: { holy: 3 } } }),
      S('holy_bulwark', 'Holy Bulwark', 'buff', 'self', 'Lift your shield: 4% chance per level to block with a counter, +5% DEF per level.', 'HB', '#c0d8ff', { max: 5, mp: 20, cd: 30000, fx: 'holy', effects: [B('holy_bulwark', 60000, { counterChance: 4, pdefPct: 5 }, { counterChance: 4, pdefPct: 5 })] }),
      S('shield_bash', 'Shield Bash', 'active', 'enemy', 'Slam your shield into the foe: may stun.', 'SB', '#a0a8b8', { range: 60, mp: 10, mpl: 1, cd: 2000, fx: 'slash', effects: [D(1.5, 0.25), ST('stun', 0.1, 0.03, 1800)] }),
      S('sacred_strike', 'Sacred Strike', 'active', 'enemy', 'A holy weapon strike.', 'SS', '#ffe27a', { range: 60, mp: 12, mpl: 1, cd: 1200, fx: 'holy', element: 'holy', effects: [D(1.7, 0.3, { element: 'holy' })] }),
      S('devotion_aura', 'Devotion Aura', 'buff', 'self', 'An aura of devotion: +2% max HP and +1 HP regen per level.', 'DA', '#ffd8a0', { max: 5, mp: 25, cd: 60000, fx: 'heal', req: [['faith', 3]], effects: [B('devotion_aura', 120000, { maxHpPct: 2, hpRegen: 1 }, { maxHpPct: 2, hpRegen: 1 })] }),
      S('judgement_cross', 'Judgement Cross', 'active', 'self', 'A blazing cross of light around you: holy damage to everything nearby.', 'JC', '#fffbd0', { mp: 30, mpl: 3, cast: 400, cd: 5000, fx: 'holy', element: 'holy', req: [['sacred_strike', 3]], effects: [M(1.6, 0.25, 'holy', { radius: 130 })] }),
      S('provoking_vow', 'Provoking Vow', 'active', 'self', 'Draw every foe nearby to you.', 'PV', '#ff8a5a', { max: 5, mp: 12, cd: 8000, fx: 'shout', effects: [{ type: 'taunt', radius: 220 }] }),
      S('heavens_shield', "Heaven's Shield", 'ultimate', 'self', 'ULTIMATE. For a short time, a wall of light: +40% DEF, +20% max HP and immunity-like holy resist.', 'HS', '#ffffff', { max: 5, mp: 60, cd: 60000, jl: 30, fx: 'holy', req: [['holy_bulwark', 3], ['devotion_aura', 2]], effects: [B('heavens_shield', 12000, { pdefPct: 40, maxHpPct: 20, elementResistPct: { holy: 50, shadow: 30 } }, undefined, 2000)] }),
    ],
    trans: { id: 'high_templar', name: 'High Templar', desc: 'Reborn templars, living fortresses of faith.', skills: [
      S('martyrs_grace', "Martyr's Grace", 'buff', 'self', 'TRANSCENDENT. 30% of damage taken goes to MP instead, +10% DEF.', 'MG', '#c8d4ff', { max: 5, mp: 40, cd: 60000, fx: 'holy', effects: [B('martyrs_grace', 60000, { damageToMpPct: 20, pdefPct: 10 }, { damageToMpPct: 2 })] }),
      S('divine_lance', 'Divine Lance', 'active', 'enemy', 'TRANSCENDENT. A spear of light from the sky.', 'DL', '#fffbd0', { range: 260, mp: 35, mpl: 3, cast: 600, cd: 4000, fx: 'holy', element: 'holy', effects: [M(3.0, 0.4, 'holy')] }),
    ] },
  },
  {
    id: 'beastmaster', name: 'Beastmaster', parent: 'ranger', role: 'Trapper / Falconer', desc: 'Rangers who hunt with traps and a trained falcon.',
    hp: 15, mp: 6, aspd: 920, weight: 700, weapons: ['dagger', 'bow', 'crossbow'], bonus: { d: 5, a: 3, l: 2, s: 1 },
    outfit: { primary: '#4f6a2f', secondary: '#7a5a2e', accent: '#e0c070', style: 'hood' }, town: 'fernhollow', master: ['Old Brannoc', 'Beastmaster Elder'],
    skills: [
      S('falcon_bond', 'Falcon Bond', 'passive', 'passive', 'Your falcon grows stronger: +2 DEX and +1 CRIT per level.', 'FB', '#d8c080', { passive: { dex: 2, crit: 1 } }),
      S('blitz_falcon', 'Blitz Falcon', 'active', 'enemy', 'The falcon dives: damage that always hits, ignoring FLEE.', 'BF', '#ffd34d', { range: 320, mp: 12, mpl: 1, cd: 1500, fx: 'falcon', effects: [D(2.0, 0.3, { element: 'neutral', alwaysHit: true })] }),
      S('snare_trap', 'Snare Trap', 'active', 'ground', 'Set a trap that roots and wounds foes stepping in.', 'ST', '#a0e060', { range: 200, mp: 10, cd: 3000, fx: 'wind', effects: [Z('snare', 8000, 60, 600, 'physical', 0.5, 0.08, 'neutral', { status: 'slow', statusChance: 0.6, statusDurationMs: 3000 })] }),
      S('blast_trap', 'Blast Trap', 'active', 'ground', 'A trap that explodes in fire.', 'BT', '#ff6a2e', { range: 200, mp: 14, cd: 4000, fx: 'fire', element: 'fire', req: [['snare_trap', 3]], effects: [Z('blast', 3000, 80, 500, 'physical', 1.2, 0.15, 'fire', { status: 'burn', statusChance: 0.3, statusDurationMs: 4000 })] }),
      S('beast_bane', 'Beast Bane', 'passive', 'passive', '+4 ATK and +3% damage to beasts and insects per level.', 'BB', '#b07040', { passive: { patk: 4, raceDamagePct: { beast: 3, insect: 3 } } }),
      S('keen_senses', 'Keen Senses', 'buff', 'self', '+10 HIT and +3% attack speed per level.', 'KS', '#9fe07a', { max: 5, mp: 20, cd: 60000, fx: 'shout', effects: [B('keen_senses', 120000, { hit: 10, aspdPct: 3 }, { hit: 10, aspdPct: 3 })] }),
      S('tri_shot', 'Tri Shot', 'active', 'enemy', 'Three arrows at once.', 'TS', '#c0ff90', { range: 320, mp: 14, mpl: 1, cd: 1500, fx: 'arrow', weapon: ['bow', 'crossbow'], effects: [D(0.9, 0.12, { hits: 3 })] }),
      S('falcon_storm', 'Falcon Storm', 'ultimate', 'ground', 'ULTIMATE. Your falcon calls its flock: a storm of talons over an area.', 'FS', '#fff3a0', { range: 320, mp: 45, mpl: 5, cast: 400, cd: 15000, jl: 30, fx: 'falcon', req: [['blitz_falcon', 5], ['blast_trap', 2]], effects: [D(1.0, 0.15, { element: 'neutral', alwaysHit: true, hits: 4, radius: 130 })] }),
    ],
    trans: { id: 'wildlord', name: 'Wildlord', desc: 'Reborn beastmasters who command the wild itself.', skills: [
      S('wolf_pack', 'Wolf Pack', 'active', 'enemy', 'TRANSCENDENT. Spirit wolves maul the target six times.', 'WP', '#c8c8d8', { range: 260, mp: 40, mpl: 3, cd: 6000, fx: 'falcon', effects: [D(0.7, 0.1, { hits: 6, alwaysHit: true })] }),
      S('true_sight', 'True Sight', 'buff', 'self', 'TRANSCENDENT. +5 all stats, +10% CRIT damage, +20 attack range.', 'TS', '#ffe27a', { max: 5, mp: 35, cd: 90000, fx: 'shout', effects: [B('true_sight', 60000, { str: 3, agi: 3, vit: 3, int: 3, dex: 3, luk: 3, critDmg: 10, attackRange: 20 }, { dex: 1, agi: 1 })] }),
    ] },
  },
  {
    id: 'minstrel', name: 'Minstrel', parent: 'ranger', role: 'Bard / Support', desc: 'Travelling musicians whose songs strengthen and whose arrows sing.',
    hp: 17, mp: 8, aspd: 920, weight: 650, weapons: ['dagger', 'bow', 'instrument'], bonus: { d: 4, i: 3, a: 2, v: 2 },
    outfit: { primary: '#8a3a6a', secondary: '#e8c8a0', accent: '#ffd34d', style: 'coat' }, town: 'fernhollow', master: ['Lysander', 'Master of Songs'],
    skills: [
      S('music_lessons', 'Music Lessons', 'passive', 'passive', '+5 ATK, +2 MATK and +1% attack speed per level.', 'ML', '#ffb0d8', { passive: { patk: 5, matk: 2, aspdPct: 1 } }),
      S('song_of_haste', 'Song of Haste', 'buff', 'self', '+4% attack speed and −2% cast time per level.', 'SH', '#9fe8ff', { max: 5, mp: 25, mpl: 3, cd: 30000, fx: 'shout', effects: [B('song_haste', 120000, { aspdPct: 4, castTimePct: -2 }, { aspdPct: 4, castTimePct: -2 })] }),
      S('song_of_vigor', 'Song of Vigor', 'buff', 'self', '+4% max HP and +2 HP regen per level.', 'SV', '#7aff9a', { max: 5, mp: 25, mpl: 3, cd: 30000, fx: 'heal', effects: [B('song_vigor', 120000, { maxHpPct: 4, hpRegen: 2 }, { maxHpPct: 4, hpRegen: 2 })] }),
      S('song_of_fortune', 'Song of Fortune', 'buff', 'self', '+2 CRIT and +2 perfect dodge per level.', 'SF', '#ffe27a', { max: 5, mp: 25, mpl: 3, cd: 30000, fx: 'shout', req: [['music_lessons', 3]], effects: [B('song_fortune', 120000, { crit: 2, perfectDodge: 2 }, { crit: 2, perfectDodge: 2 })] }),
      S('discord', 'Discord', 'active', 'self', 'A grating chord: magic damage to nearby foes, and it may put them to sleep.', 'Di', '#c9a6ff', { mp: 20, cd: 8000, fx: 'arcane', effects: [M(1.0, 0.15, 'neutral', { radius: 130 }), ST('sleep', 0.15, 0.04, 3000, { radius: 130 })] }),
      S('melody_strike', 'Melody Strike', 'active', 'enemy', 'An arrow or chord that rings in the target\'s ears: may silence.', 'MS', '#ffb0ff', { range: 300, mp: 10, cd: 1200, fx: 'arrow', effects: [D(2.3, 0.35), ST('silence', 0.1, 0.03, 4000)] }),
      S('lullaby_zone', 'Lullaby', 'active', 'ground', 'A drowsy melody fills an area: monsters fall asleep.', 'Lu', '#a0b0ff', { range: 240, mp: 30, cd: 12000, fx: 'arcane', req: [['discord', 3]], effects: [Z('lullaby', 6000, 100, 1000, 'magic', 0.2, 0.05, 'neutral', { status: 'sleep', statusChance: 0.35, statusDurationMs: 3000 })] }),
      S('grand_finale', 'Grand Finale', 'ultimate', 'self', 'ULTIMATE. The last chord: heavy magic damage all around you and +15% ATK/MATK for a minute.', 'GF', '#fff3a0', { mp: 60, cast: 600, cd: 30000, jl: 30, fx: 'meteor', req: [['song_of_haste', 3], ['melody_strike', 3]], effects: [M(2.4, 0.35, 'neutral', { radius: 160 }), B('finale', 60000, { patkPct: 15, matkPct: 15 })] }),
    ],
    trans: { id: 'maestro', name: 'Maestro', desc: 'Reborn minstrels whose music bends battles.', skills: [
      S('symphony', 'Symphony', 'buff', 'self', 'TRANSCENDENT. Every song at once: +10% attack speed, +10% max HP, +5 CRIT.', 'Sy', '#ffd8f0', { max: 5, mp: 60, cd: 120000, fx: 'shout', effects: [B('symphony', 90000, { aspdPct: 8, maxHpPct: 8, crit: 4 }, { aspdPct: 1, crit: 1 })] }),
      S('sonic_wave', 'Sonic Wave', 'active', 'enemy', 'TRANSCENDENT. A shock of sound through a line of enemies.', 'SW', '#c9a6ff', { range: 280, mp: 35, cd: 4000, fx: 'arcane', effects: [{ type: 'line', length: 300, width: 60 }, M(2.4, 0.35, 'neutral')] }),
    ] },
  },
  {
    id: 'sorcerer', name: 'Sorcerer', parent: 'mage', role: 'Area caster', desc: 'Mages who master storms, quakes and walls of ice.',
    hp: 11, mp: 13, aspd: 1080, weight: 300, weapons: ['dagger', 'wand', 'staff'], bonus: { i: 6, d: 3, a: 1, v: 1 },
    outfit: { primary: '#3a2a7f', secondary: '#1e1a3a', accent: '#ff7a3a', style: 'robe' }, town: 'arcanthe', master: ['Archmagus Theron', 'Sorcerer Council'],
    skills: [
      S('arcane_focus', 'Arcane Focus', 'passive', 'passive', '+4 MATK and −1% cast time per level.', 'AF', '#c9a6ff', { passive: { matk: 4, castTimePct: -1 } }),
      S('storm_gust', 'Frost Gale', 'active', 'ground', 'A freezing gale over an area: water damage, may freeze.', 'FG', '#bdf0ff', { range: 280, mp: 40, mpl: 3, cast: 1500, cd: 6000, fx: 'ice', element: 'water', effects: [Z('frost_gale', 4000, 110, 500, 'magic', 0.6, 0.08, 'water', { status: 'freeze', statusChance: 0.15, statusDurationMs: 2500 })] }),
      S('lord_of_vermilion', 'Crimson Sky', 'active', 'ground', 'Lightning rains from a red sky.', 'CS', '#ff8a5a', { range: 280, mp: 42, mpl: 3, cast: 1600, cd: 6000, fx: 'lightning', element: 'wind', req: [['storm_gust', 2]], effects: [M(1.0, 0.14, 'wind', { radius: 140, hits: 3 })] }),
      S('heavens_drive', 'Earth Spikes', 'active', 'ground', 'Stone spikes erupt from the ground.', 'ES', '#c8a060', { range: 260, mp: 24, mpl: 2, cast: 800, cd: 3000, fx: 'meteor', element: 'earth', effects: [M(1.4, 0.2, 'earth', { radius: 100 })] }),
      S('ice_wall', 'Ice Wall', 'active', 'ground', 'A wall of ice that freezes and chills anything inside it.', 'IW', '#9ad8ff', { range: 220, mp: 20, cd: 10000, fx: 'ice', element: 'water', effects: [Z('ice_wall', 6000, 70, 1000, 'magic', 0.2, 0.04, 'water', { status: 'slow', statusChance: 0.8, statusDurationMs: 2000 })] }),
      S('sightrasher', 'Flame Ring', 'active', 'self', 'A ring of fire bursts out around you.', 'FR', '#ff6a2e', { mp: 30, mpl: 2, cast: 400, cd: 5000, fx: 'fire', element: 'fire', effects: [M(1.6, 0.22, 'fire', { radius: 140 }), { type: 'knockback', distance: 60 }] }),
      S('mana_well', 'Mana Well', 'buff', 'self', '+3 MP regen and +2% MATK per level.', 'MW', '#7fd6ff', { max: 5, mp: 10, cd: 60000, fx: 'arcane', effects: [B('mana_well', 120000, { mpRegen: 3, matkPct: 2 }, { mpRegen: 3, matkPct: 2 })] }),
      S('meteor_storm', 'Meteor Storm', 'ultimate', 'ground', 'ULTIMATE. A rain of meteors over a wide area; may stun and burn.', 'MS', '#ff3a1e', { range: 300, mp: 80, mpl: 6, cast: 2200, cd: 20000, jl: 30, fx: 'meteor', element: 'fire', req: [['lord_of_vermilion', 3], ['sightrasher', 3]], effects: [M(1.5, 0.2, 'fire', { radius: 170, hits: 4 }), ST('stun', 0.15, 0.03, 2000, { radius: 170 })] }),
    ],
    trans: { id: 'archsorcerer', name: 'Archsorcerer', desc: 'Reborn sorcerers who cast without pause.', skills: [
      S('mystic_amplify', 'Mystic Amplify', 'buff', 'self', 'TRANSCENDENT. +30% MATK for a short time.', 'MA', '#e8b0ff', { max: 5, mp: 50, cd: 60000, fx: 'arcane', effects: [B('mystic_amplify', 20000, { matkPct: 20 }, { matkPct: 2 })] }),
      S('napalm_vulcan', 'Soul Vulcan', 'active', 'enemy', 'TRANSCENDENT. Ghost-element blasts that strike five times.', 'SV', '#c8d4ff', { range: 280, mp: 45, mpl: 4, cast: 900, cd: 5000, fx: 'arcane', element: 'ghost', effects: [M(0.9, 0.12, 'ghost', { hits: 5 })] }),
    ] },
  },
  {
    id: 'sage', name: 'Sage', parent: 'mage', role: 'Battle scholar', desc: 'Scholars of every element who endow weapons and hit with the book.',
    hp: 13, mp: 11, aspd: 1000, weight: 350, weapons: ['dagger', 'wand', 'staff', 'book'], bonus: { i: 4, d: 3, a: 2, v: 2 },
    outfit: { primary: '#2a6a5a', secondary: '#e8dcc0', accent: '#7fd6ff', style: 'robe' }, town: 'arcanthe', master: ['Scholar Imre', 'Sage Academy Dean'],
    skills: [
      S('study', 'Study', 'passive', 'passive', '+3 ATK with books, +3 MATK and +1% attack speed per level.', 'St', '#e8dcc0', { passive: { patk: 3, matk: 3, aspdPct: 1 } }),
      S('endow_fire', 'Endow Fire', 'buff', 'self', 'Your weapon becomes fire (5 minutes + 1 per level).', 'EF', '#ff6a2e', { max: 5, mp: 30, cd: 5000, fx: 'fire', effects: [{ type: 'endow', element: 'fire', durationMs: 300000, perLevelMs: 60000 }] }),
      S('endow_water', 'Endow Water', 'buff', 'self', 'Your weapon becomes water.', 'EW', '#7ab8ff', { max: 5, mp: 30, cd: 5000, fx: 'ice', effects: [{ type: 'endow', element: 'water', durationMs: 300000, perLevelMs: 60000 }] }),
      S('endow_wind', 'Endow Wind', 'buff', 'self', 'Your weapon becomes wind.', 'EA', '#b6f0d0', { max: 5, mp: 30, cd: 5000, fx: 'wind', effects: [{ type: 'endow', element: 'wind', durationMs: 300000, perLevelMs: 60000 }] }),
      S('endow_earth', 'Endow Earth', 'buff', 'self', 'Your weapon becomes earth.', 'EE', '#8b6b3e', { max: 5, mp: 30, cd: 5000, fx: 'meteor', effects: [{ type: 'endow', element: 'earth', durationMs: 300000, perLevelMs: 60000 }] }),
      S('double_cast', 'Double Cast', 'buff', 'self', '−6% cast time and −3% cooldowns per level.', 'DC', '#c9a6ff', { max: 5, mp: 40, cd: 60000, fx: 'arcane', req: [['study', 3]], effects: [B('double_cast', 60000, { castTimePct: -6, cdrPct: 3 }, { castTimePct: -6, cdrPct: 3 })] }),
      S('earth_spike_volley', 'Stone Volley', 'active', 'enemy', 'A volley of earth spikes at one target.', 'SV', '#c8a060', { range: 260, mp: 14, mpl: 2, cast: 500, cd: 1500, fx: 'meteor', element: 'earth', effects: [M(0.8, 0.12, 'earth', { hits: 3 })] }),
      S('elemental_cataclysm', 'Cataclysm', 'ultimate', 'ground', 'ULTIMATE. Four elements crash down at once: fire, water, wind and earth strikes in an area.', 'Ca', '#ffef8a', { range: 280, mp: 70, cast: 1500, cd: 20000, jl: 30, fx: 'meteor', req: [['double_cast', 3], ['earth_spike_volley', 3]], effects: [M(1.0, 0.15, 'fire', { radius: 140 }), M(1.0, 0.15, 'water', { radius: 140 }), M(1.0, 0.15, 'wind', { radius: 140 }), M(1.0, 0.15, 'earth', { radius: 140 })] }),
    ],
    trans: { id: 'archsage', name: 'Archsage', desc: 'Reborn sages who rewrite the elements.', skills: [
      S('endow_holy', 'Endow Holy', 'buff', 'self', 'TRANSCENDENT. Your weapon becomes holy.', 'EH', '#fff6c0', { max: 5, mp: 40, cd: 5000, fx: 'holy', effects: [{ type: 'endow', element: 'holy', durationMs: 300000, perLevelMs: 60000 }] }),
      S('foresight', 'Foresight', 'buff', 'self', 'TRANSCENDENT. −40% cast time for a short time.', 'Fo', '#9fe8ff', { max: 5, mp: 40, cd: 60000, fx: 'arcane', effects: [B('foresight', 15000, { castTimePct: -30 }, { castTimePct: -2 })] }),
    ] },
  },
  {
    id: 'bishop', name: 'Bishop', parent: 'cleric', role: 'Healer / Exorcist', desc: 'High clerics: great heals, blessings and holy judgement.',
    hp: 14, mp: 11, aspd: 1000, weight: 500, weapons: ['club', 'staff', 'wand', 'book'], bonus: { i: 5, v: 3, d: 2, l: 1 },
    outfit: { primary: '#f4f0e0', secondary: '#7a5a2a', accent: '#ffd860', style: 'robe' }, town: 'aurelion', master: ['Bishop Aurenne', 'Bishop of the Dawn'],
    skills: [
      S('greater_heal', 'Greater Heal', 'active', 'self', 'A large heal.', 'GH', '#7aff9a', { mp: 30, mpl: 4, cast: 500, cd: 3000, fx: 'heal', effects: [H(120, 70, 6)] }),
      S('kyrie', 'Kyrie Shield', 'buff', 'self', 'A shield of prayer: 20% (+3%/lv) of damage goes to MP and +5% DEF per level.', 'KS', '#c0d8ff', { mp: 25, cd: 20000, fx: 'holy', effects: [B('kyrie', 60000, { damageToMpPct: 17, pdefPct: 5 }, { damageToMpPct: 3, pdefPct: 5 })] }),
      S('holy_mastery', 'Holy Mastery', 'passive', 'passive', '+3 MATK and +2% holy damage per level.', 'HM', '#ffe27a', { passive: { matk: 3, elementDamagePct: { holy: 2 } } }),
      S('magnificat', 'Magnificat', 'buff', 'self', 'Doubles your MP regeneration for a while.', 'Mg', '#7fd6ff', { max: 5, mp: 40, cd: 60000, fx: 'holy', effects: [B('magnificat', 30000, { mpRegen: 8 }, { mpRegen: 3 }, 10000)] }),
      S('lex_divina', 'Lex Divina', 'active', 'enemy', 'Silence a foe with holy law.', 'LD', '#ffffff', { range: 260, mp: 18, cd: 3000, fx: 'holy', effects: [ST('silence', 0.5, 0.05, 6000)] }),
      S('turn_undead', 'Turn Undead', 'active', 'enemy', 'Huge holy damage against a single target, best against the undead.', 'TU', '#fffbd0', { range: 260, mp: 30, mpl: 3, cast: 1000, cd: 3000, fx: 'holy', element: 'holy', effects: [M(2.6, 0.35, 'holy')] }),
      S('sanctuary', 'Sanctuary', 'active', 'self', 'Holy light around you heals you and burns the enemies nearby.', 'Sa', '#d0fff0', { mp: 40, mpl: 3, cast: 600, cd: 10000, fx: 'heal', req: [['greater_heal', 3]], effects: [H(60, 40, 4), M(1.2, 0.2, 'holy', { radius: 130 })] }),
      S('magnus_judgement', 'Magnus Judgement', 'ultimate', 'ground', 'ULTIMATE. A great cross of holy fire burns everything in it.', 'MJ', '#fff3a0', { range: 280, mp: 80, mpl: 5, cast: 2000, cd: 20000, jl: 30, fx: 'holy', element: 'holy', req: [['turn_undead', 3], ['sanctuary', 2]], effects: [Z('magnus_judgement', 6000, 120, 500, 'magic', 0.9, 0.12, 'holy')] }),
    ],
    trans: { id: 'archbishop', name: 'Archbishop', desc: 'Reborn bishops; their prayers are answered at once.', skills: [
      S('assumptio', 'Assumptio', 'buff', 'self', 'TRANSCENDENT. Halve incoming damage for a short time (+50% DEF, +30% MDEF-like resist).', 'As', '#ffffff', { max: 5, mp: 60, cd: 90000, fx: 'holy', effects: [B('assumptio', 20000, { pdefPct: 50, elementResistPct: { neutral: 20, fire: 20, water: 20, wind: 20, earth: 20, shadow: 30 } }, undefined, 4000)] }),
      S('meditatio', 'Meditatio', 'passive', 'passive', 'TRANSCENDENT. +2% max MP, +1 MP regen and +4% heal power (MATK) per level.', 'Me', '#c8f0ff', { passive: { maxMpPct: 2, mpRegen: 1, matkPct: 2 } }),
    ] },
  },
  {
    id: 'ascetic', name: 'Ascetic', parent: 'cleric', role: 'Martial monk', desc: 'Clerics who left the chapel for the mountain, fighting with fists and spirit.',
    hp: 18, mp: 7, aspd: 860, weight: 600, weapons: ['club', 'knuckle'], bonus: { s: 4, a: 3, v: 2, d: 2 },
    outfit: { primary: '#c86a2a', secondary: '#5a3a1e', accent: '#ffd860', style: 'tunic' }, town: 'aurelion', master: ['Master Kaito', 'Ascetic of the Peak'],
    skills: [
      S('iron_fist', 'Iron Fist', 'passive', 'passive', '+4 ATK and +1 FLEE per level.', 'IF', '#c86a2a', { passive: { patk: 4, flee: 1 } }),
      S('spirit_spheres', 'Spirit Spheres', 'buff', 'self', 'Summon spirit spheres: +3 ATK and +1% attack speed per level.', 'SS', '#9ad8ff', { max: 5, mp: 8, cd: 10000, fx: 'arcane', effects: [B('spirit_spheres', 120000, { patk: 15, aspdPct: 5 }, { patk: 3, aspdPct: 1 })] }),
      S('triple_blow', 'Triple Blow', 'active', 'enemy', 'A quick three-hit combo.', 'TB', '#ffb05a', { range: 60, mp: 6, cd: 800, fx: 'slash', effects: [D(0.8, 0.12, { hits: 3 })] }),
      S('chain_combo', 'Chain Combo', 'active', 'enemy', 'Four hits that follow a Triple Blow.', 'CC', '#ff8a3a', { range: 60, mp: 10, mpl: 1, cd: 1600, fx: 'slash', req: [['triple_blow', 3]], effects: [D(0.9, 0.14, { hits: 4 })] }),
      S('steel_body', 'Steel Body', 'buff', 'self', 'Harden the body: +60% DEF, −30% move speed.', 'SB', '#a0a8b8', { max: 5, mp: 40, cd: 60000, fx: 'shout', effects: [B('steel_body', 20000, { pdefPct: 60, moveSpeedPct: -30 }, undefined, 5000)] }),
      S('ki_explosion', 'Ki Explosion', 'active', 'self', 'Release ki around you, stunning nearby foes.', 'KE', '#fff3a0', { mp: 20, cd: 8000, fx: 'whirl', effects: [D(1.3, 0.2, { radius: 110 }), ST('stun', 0.2, 0.04, 1800, { radius: 110 })] }),
      S('body_relocation', 'Snap Step', 'buff', 'self', 'Light feet: +20% move speed and +3 perfect dodge.', 'SS', '#b6f0d0', { max: 5, mp: 15, cd: 20000, fx: 'wind', effects: [B('snap_step', 15000, { moveSpeedPct: 20, perfectDodge: 3 }, { moveSpeedPct: 2 })] }),
      S('asura_strike', 'Asura Strike', 'ultimate', 'enemy', 'ULTIMATE. Pour all your spirit into a single blow that ignores DEF.', 'AS', '#ff3a3a', { range: 70, mp: 70, mpl: 5, cast: 800, cd: 25000, jl: 30, fx: 'slash', req: [['chain_combo', 3], ['spirit_spheres', 3]], effects: [D(6.0, 1.0, { ignoreDefPct: 100, alwaysHit: true })] }),
    ],
    trans: { id: 'grandmaster', name: 'Grandmaster', desc: 'Reborn ascetics whose fists split mountains.', skills: [
      S('tiger_cannon', 'Tiger Cannon', 'active', 'enemy', 'TRANSCENDENT. A crushing palm strike that knocks the target back.', 'TC', '#ffb05a', { range: 70, mp: 40, mpl: 3, cd: 5000, fx: 'slash', effects: [D(3.4, 0.45, { ignoreDefPct: 40 }), { type: 'knockback', distance: 80 }] }),
      S('root_of_mountain', 'Mountain Root', 'buff', 'self', 'TRANSCENDENT. +20% max HP and 20% counter chance.', 'MR', '#c8a060', { max: 5, mp: 40, cd: 90000, fx: 'shout', effects: [B('mountain_root', 60000, { maxHpPct: 15, counterChance: 15 }, { maxHpPct: 1, counterChance: 1 })] }),
    ] },
  },
  {
    id: 'shadowblade', name: 'Shadowblade', parent: 'rogue', role: 'Assassin', desc: 'Rogues who kill from the shadows with katars and poison.',
    hp: 16, mp: 5, aspd: 760, weight: 500, weapons: ['dagger', 'sword', 'katar'], bonus: { a: 5, s: 3, d: 2, l: 1 },
    outfit: { primary: '#2a2a3a', secondary: '#7a1a2a', accent: '#c0c0d8', style: 'coat' }, town: 'sandara', master: ['The Veiled One', 'Shadowblade Guild'],
    skills: [
      S('katar_mastery', 'Katar Mastery', 'passive', 'passive', '+4 ATK and +1 CRIT per level.', 'KM', '#c0c0d8', { passive: { patk: 4, crit: 1 } }),
      S('cloak_of_shadows', 'Cloak of Shadows', 'buff', 'self', 'Move unseen; monsters lose you until you attack.', 'Cl', '#3a3a5a', { mp: 15, cd: 6000, fx: 'shadow', effects: [B('cloak', 8000, { stealth: 1, moveSpeedPct: -10 }, undefined, 2000, { flags: ['breakOnAttack'] })] }),
      S('sonic_blade', 'Sonic Blade', 'active', 'enemy', 'Eight lightning-fast katar slashes; may stun.', 'SB', '#ff5a5a', { range: 60, mp: 20, mpl: 2, cd: 2000, fx: 'slash', effects: [D(0.6, 0.09, { hits: 8 }), ST('stun', 0.1, 0.02, 1500)] }),
      S('venom_spray', 'Venom Spray', 'active', 'enemy', 'Spray poison on the target: poison damage, likely poisons.', 'VS', '#a0e060', { range: 120, mp: 14, cd: 2000, fx: 'shadow', element: 'poison', effects: [M(1.4, 0.2, 'poison'), ST('poison', 0.4, 0.05, 8000)] }),
      S('enchant_poison', 'Enchant Poison', 'buff', 'self', 'Coat your blade: weapon becomes poison.', 'EP', '#7ad04a', { max: 5, mp: 20, cd: 5000, fx: 'shadow', effects: [{ type: 'endow', element: 'poison', durationMs: 60000, perLevelMs: 20000 }] }),
      S('grimtooth', 'Grimtooth', 'active', 'enemy', 'A katar wave at range that hits around the target.', 'Gr', '#c0c0d8', { range: 180, mp: 12, cd: 1500, fx: 'slash', req: [['cloak_of_shadows', 3]], effects: [D(1.4, 0.2, { radius: 80 })] }),
      S('assassin_edge', 'Lethal Focus', 'buff', 'self', '+5% crit damage and +2 CRIT per level.', 'LF', '#ff8a8a', { max: 5, mp: 25, cd: 60000, fx: 'shout', effects: [B('lethal_focus', 60000, { critDmg: 5, crit: 2 }, { critDmg: 5, crit: 2 })] }),
      S('soul_reap', 'Soul Reap', 'ultimate', 'enemy', 'ULTIMATE. Appear behind the target and cut through its soul; ignores half its DEF.', 'SR', '#7a1a2a', { range: 200, mp: 60, mpl: 4, cd: 18000, jl: 30, fx: 'shadow', req: [['sonic_blade', 5], ['grimtooth', 3]], effects: [D(5.0, 0.7, { ignoreDefPct: 50, alwaysHit: true })] }),
    ],
    trans: { id: 'shadow_reaper', name: 'Shadow Reaper', desc: 'Reborn shadowblades; death walks behind them.', skills: [
      S('meteor_assault', 'Meteor Assault', 'active', 'self', 'TRANSCENDENT. A blur of blades around you; may blind and stun.', 'MA', '#ff5a5a', { mp: 40, mpl: 3, cd: 5000, fx: 'whirl', effects: [D(2.4, 0.35, { radius: 130 }), ST('blind', 0.2, 0.03, 4000, { radius: 130 })] }),
      S('enchant_deadly_poison', 'Deadly Venom', 'buff', 'self', 'TRANSCENDENT. +30% ATK and poison weapon for a short time.', 'DV', '#4aff4a', { max: 5, mp: 50, cd: 90000, fx: 'shadow', effects: [B('deadly_venom', 30000, { patkPct: 20, elementDamagePct: { poison: 20 } }, { patkPct: 2 }), { type: 'endow', element: 'poison', durationMs: 30000 }] }),
    ] },
  },
  {
    id: 'outlaw', name: 'Outlaw', parent: 'rogue', role: 'Trickster / Archer', desc: 'Rogues who rob, strip and outsmart, with blade or bow.',
    hp: 17, mp: 5, aspd: 820, weight: 600, weapons: ['dagger', 'sword', 'bow'], bonus: { d: 4, a: 3, s: 2, l: 2 },
    outfit: { primary: '#5a3a2a', secondary: '#2a4a3a', accent: '#ffd34d', style: 'coat' }, town: 'sandara', master: ['Jax Silverhand', 'Outlaw Boss'],
    skills: [
      S('snatch', 'Snatch', 'active', 'enemy', 'A better steal: higher chance than Pilfer.', 'Sn', '#ffd75a', { range: 60, mp: 12, cd: 1000, fx: 'slash', effects: [{ type: 'steal', chance: 20, perLevel: 7 }] }),
      S('rob_luma', 'Mug', 'active', 'enemy', 'Hit the target and pocket Luma: monster level × (skill level × 3 + LUK / 10), once per monster.', 'Mu', '#ffcc33', { range: 60, mp: 10, cd: 1500, fx: 'slash', effects: [D(1.2, 0.15), { type: 'mug', perLevel: 3 }] }),
      S('strip_armor', 'Strip Armor', 'active', 'enemy', 'Rip at the target\'s gear: may curse it (−25% ATK, slower).', 'SA', '#c0a0a0', { range: 60, mp: 14, cd: 4000, fx: 'slash', effects: [D(0.8, 0.1), ST('curse', 0.3, 0.05, 8000)] }),
      S('backstab', 'Backstab', 'active', 'enemy', 'A brutal stab that never misses.', 'BS', '#ff5a5a', { range: 60, mp: 16, mpl: 1, cd: 2000, fx: 'slash', effects: [D(2.2, 0.35, { alwaysHit: true })] }),
      S('tunnel_drive', 'Tunnel Drive', 'buff', 'self', 'Move while hidden.', 'TD', '#5a5a7a', { max: 5, mp: 12, cd: 5000, fx: 'shadow', effects: [B('tunnel', 10000, { stealth: 1 }, undefined, 2000, { flags: ['breakOnAttack'] })] }),
      S('vulture_eye', 'Vulture Eye', 'passive', 'passive', '+1 HIT and +6 bow range per level.', 'VE', '#ffe27a', { passive: { hit: 1, attackRange: 6 } }),
      S('arrow_storm_rogue', 'Rain of Knives', 'active', 'ground', 'Throw a fan of knives or arrows over an area.', 'RK', '#d8dde8', { range: 260, mp: 20, mpl: 2, cd: 4000, fx: 'arrow_rain', effects: [D(0.8, 0.1, { radius: 110, hits: 2 })] }),
      S('plagiarism', 'Grand Heist', 'ultimate', 'enemy', 'ULTIMATE. A blinding raid: heavy damage, steals an item and blinds the target.', 'GH', '#ffef8a', { range: 80, mp: 50, mpl: 4, cd: 18000, jl: 30, fx: 'shadow', req: [['backstab', 5], ['snatch', 3]], effects: [D(4.0, 0.6), { type: 'steal', chance: 40, perLevel: 5 }, ST('blind', 0.6, 0.04, 6000)] }),
    ],
    trans: { id: 'phantom_outlaw', name: 'Phantom Outlaw', desc: 'Reborn outlaws; nobody saw them come or go.', skills: [
      S('full_strip', 'Full Strip', 'active', 'enemy', 'TRANSCENDENT. Strip everything: curse, blind and slow the target.', 'FS', '#c0a0a0', { range: 60, mp: 40, cd: 15000, fx: 'slash', effects: [ST('curse', 0.4, 0.05, 8000), ST('blind', 0.4, 0.05, 8000), ST('slow', 0.6, 0.04, 8000)] }),
      S('shadow_bounce', 'Shadow Bounce', 'active', 'enemy', 'TRANSCENDENT. Blades bounce between foes near the target.', 'SB', '#5a5a7a', { range: 200, mp: 35, cd: 5000, fx: 'shadow', effects: [D(1.6, 0.25, { radius: 120, hits: 3 })] }),
    ] },
  },
  {
    id: 'artisan', name: 'Artisan', parent: 'merchant', role: 'Blacksmith', desc: 'Merchants turned smiths: they forge better and fight with heavy weapons.',
    hp: 20, mp: 5, aspd: 950, weight: 1000, weapons: ['dagger', 'club', 'sword', 'spear', 'axe'], bonus: { s: 5, d: 3, v: 2, l: 1 },
    outfit: { primary: '#6a4a2a', secondary: '#c8a26b', accent: '#ff8a3a', style: 'apron' }, town: 'tidewatch', master: ['Forge-master Brenna', 'Artisan Guild'],
    skills: [
      S('smithing', 'Smithing', 'passive', 'passive', 'Practised hands: +3 ATK and +2 DEX per level, and +1% forging success per level.', 'Sm', '#c8a26b', { passive: { patk: 3, dex: 2 } }),
      S('adrenaline_rush', 'Adrenaline Rush', 'buff', 'self', '+5% attack speed per level.', 'AR', '#ff8a3a', { max: 5, mp: 20, cd: 30000, fx: 'shout', effects: [B('adrenaline', 30000, { aspdPct: 5 }, { aspdPct: 5 }, 10000)] }),
      S('power_thrust', 'Power Thrust', 'buff', 'self', '+5% ATK per level.', 'PT', '#ff5a3a', { max: 5, mp: 18, cd: 30000, fx: 'shout', effects: [B('power_thrust', 30000, { patkPct: 5 }, { patkPct: 5 }, 10000)] }),
      S('weapon_perfection', 'Weapon Perfection', 'buff', 'self', 'Ignore size penalties: +12% damage to every size per level.', 'WP', '#ffe27a', { max: 5, mp: 18, cd: 30000, fx: 'shout', effects: [B('weapon_perfection', 30000, { sizeDamagePct: { small: 6, medium: 6, large: 6 } }, { sizeDamagePct: { small: 6, medium: 6, large: 6 } }, 10000)] }),
      S('hammerfall', 'Hammerfall', 'active', 'self', 'Slam the ground: stuns everything nearby.', 'Hf', '#a0a8b8', { mp: 15, cd: 6000, fx: 'meteor', effects: [D(1.0, 0.15, { radius: 110 }), ST('stun', 0.3, 0.05, 2000, { radius: 110 })] }),
      S('skin_tempering', 'Skin Tempering', 'passive', 'passive', '+4% fire and +1% neutral resist per level.', 'Sk', '#ff6a2e', { passive: { elementResistPct: { fire: 4, neutral: 1 } } }),
      S('cart_crash', 'Cart Crash', 'active', 'enemy', 'Ram your loaded cart into the target. Costs Luma.', 'CC', '#b07a3a', { range: 70, mp: 15, cd: 2000, fx: 'whirl', luma: [200, 50], effects: [D(2.6, 0.4, { radius: 70 })] }),
      S('meltdown', 'Meltdown', 'ultimate', 'self', 'ULTIMATE. Forge-fire in the veins: +25% ATK, +20% attack speed and fire weapon.', 'Md', '#ff3a1e', { max: 5, mp: 60, cd: 90000, jl: 30, fx: 'fire', req: [['power_thrust', 3], ['adrenaline_rush', 3]], effects: [B('meltdown', 30000, { patkPct: 20, aspdPct: 15 }, { patkPct: 1, aspdPct: 1 }), { type: 'endow', element: 'fire', durationMs: 30000, perLevelMs: 5000 }] }),
    ],
    trans: { id: 'mastersmith', name: 'Mastersmith', desc: 'Reborn artisans; legendary weapons leave their forges.', skills: [
      S('maximum_power', 'Maximum Power', 'buff', 'self', 'TRANSCENDENT. +50 CRIT damage and +30% ATK for a short time.', 'MP', '#ffd34d', { max: 5, mp: 50, cd: 90000, fx: 'shout', effects: [B('max_power', 15000, { critDmg: 30, patkPct: 20 }, { critDmg: 4, patkPct: 2 })] }),
      S('cart_termination', 'Cart Termination', 'active', 'enemy', 'TRANSCENDENT. The cart, the Luma and the hammer in one blow. Costs a lot of Luma.', 'CT', '#ffef8a', { range: 70, mp: 30, cd: 3000, fx: 'whirl', luma: [800, 150], effects: [D(4.5, 0.6, { ignoreDefPct: 30 })] }),
    ] },
  },
  {
    id: 'alchemist', name: 'Alchemist', parent: 'merchant', role: 'Potion maker / Homunculus', desc: 'Merchants of the laboratory: acid, fire flasks and an artificial life-form.',
    hp: 17, mp: 7, aspd: 980, weight: 900, weapons: ['dagger', 'club', 'sword', 'axe'], bonus: { d: 4, i: 3, v: 2, l: 2 },
    outfit: { primary: '#3a6a3a', secondary: '#e8e0c8', accent: '#7fff7a', style: 'apron' }, town: 'tidewatch', master: ['Professor Quill', 'Alchemy Guild'],
    skills: [
      S('potion_research', 'Potion Research', 'passive', 'passive', 'Know-how: +3% max HP, +2% max MP and +1 HP regen per level.', 'PR', '#7fff7a', { passive: { maxHpPct: 3, maxMpPct: 2, hpRegen: 1 } }),
      S('acid_terror', 'Acid Terror', 'active', 'enemy', 'Throw acid: ignores DEF and may cause bleeding.', 'AT', '#c0ff60', { range: 220, mp: 14, mpl: 1, cast: 300, cd: 1500, fx: 'shadow', effects: [D(1.6, 0.3, { ignoreDefPct: 100, element: 'neutral' }), ST('bleed', 0.1, 0.03, 6000)] }),
      S('demonstration', 'Bomb Flask', 'active', 'ground', 'A fire flask that burns the ground.', 'BF', '#ff6a2e', { range: 220, mp: 12, cd: 3000, fx: 'fire', element: 'fire', effects: [Z('bomb_flask', 6000, 70, 500, 'physical', 0.5, 0.08, 'fire', { status: 'burn', statusChance: 0.2, statusDurationMs: 4000 })] }),
      S('chemical_shield', 'Chemical Shield', 'buff', 'self', 'Coat your armor: +6% DEF and 3% resist to every element per level.', 'CS', '#9fe8ff', { max: 5, mp: 25, cd: 60000, fx: 'heal', effects: [B('chem_shield', 300000, { pdefPct: 6, elementResistPct: { fire: 3, water: 3, wind: 3, earth: 3, poison: 3 } }, { pdefPct: 6, elementResistPct: { fire: 3, water: 3, wind: 3, earth: 3, poison: 3 } })] }),
      S('aid_potion', 'Aid Potion', 'active', 'self', 'Throw a healing potion at yourself.', 'AP', '#ff8a8a', { mp: 10, cd: 2000, fx: 'heal', effects: [H(80, 40, 2)] }),
      S('call_homunculus', 'Bioethics', 'passive', 'passive', 'The secret of artificial life. Required to create a homunculus.', 'Bi', '#c9a6ff', { max: 1, passive: {} }),
      S('acid_rain', 'Acid Rain', 'active', 'ground', 'Acid falls over an area.', 'AR', '#c0ff60', { range: 240, mp: 30, mpl: 2, cast: 600, cd: 6000, fx: 'arrow_rain', req: [['acid_terror', 3]], effects: [D(0.7, 0.1, { radius: 110, hits: 3, ignoreDefPct: 50, element: 'neutral' })] }),
      S('acid_demonstration', 'Acid Bomb', 'ultimate', 'enemy', 'ULTIMATE. Acid and fire together: huge damage that ignores DEF, twice.', 'AB', '#ffef8a', { range: 220, mp: 60, mpl: 4, cast: 800, cd: 15000, jl: 30, fx: 'fire', req: [['acid_terror', 5], ['demonstration', 3]], effects: [D(2.4, 0.4, { ignoreDefPct: 100, element: 'neutral', hits: 2 })] }),
    ],
    trans: { id: 'grand_alchemist', name: 'Grand Alchemist', desc: 'Reborn alchemists who brew miracles.', skills: [
      S('full_chemical_protection', 'Full Protection', 'buff', 'self', 'TRANSCENDENT. +20% DEF and +10% max HP for a long time.', 'FP', '#9fe8ff', { max: 5, mp: 50, cd: 120000, fx: 'heal', effects: [B('full_protect', 600000, { pdefPct: 15, maxHpPct: 8 }, { pdefPct: 1, maxHpPct: 1 })] }),
      S('elixir_rain', 'Elixir Rain', 'active', 'self', 'TRANSCENDENT. Drink and spill elixir: big heal and +10% MATK.', 'ER', '#7aff9a', { mp: 40, cd: 20000, fx: 'heal', effects: [H(300, 120, 4), B('elixir', 30000, { matkPct: 10 })] }),
    ] },
  },
];

// ------------------------------------------------------------------ job bonus patterns
function pattern(weights: Record<string, number>, total: number, length = 49): string {
  const keys = Object.keys(weights), sum = keys.reduce((a, k) => a + weights[k], 0);
  const acc: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const seq: string[] = [];
  for (let i = 0; i < total; i++) {
    for (const k of keys) acc[k] += weights[k] / sum;
    const k = keys.reduce((a, b) => (acc[b] > acc[a] ? b : a));
    acc[k] -= 1; seq.push(k);
  }
  const out = Array<string>(length).fill('.');
  seq.forEach((k, i) => { out[Math.min(length - 1, Math.round(((i + 1) * length) / (total + 1)) - 1)] = k; });
  return out.join('');
}

function skillDef(s: SkillSpec, classId: string): J {
  return {
    id: s.id, name: s.name, classId, kind: s.kind, targeting: s.tgt, description: s.desc, maxLevel: s.max ?? 10, range: s.range ?? 0,
    mpCost: s.mp ?? 0, mpCostPerLevel: s.mpl ?? 0, castTimeMs: s.cast ?? 0, cooldownMs: s.cd ?? 0,
    ...(s.element ? { element: s.element } : {}), ...(s.req ? { requires: s.req.map(([skillId, level]) => ({ skillId, level })) } : {}),
    ...(s.jl ? { requiresJobLevel: s.jl } : {}), ...(s.weapon ? { requiresWeapon: s.weapon } : {}), ...(s.passive ? { passive: s.passive } : {}),
    ...(s.luma ? { lumaCost: s.luma[0], lumaCostPerLevel: s.luma[1] } : {}),
    effects: s.effects ?? [], fx: s.fx ?? 'none', icon: { glyph: s.glyph, color: s.color }, jobgen: true,
  };
}

// ------------------------------------------------------------------ gear tiers (Lv 30–85)
const TIERS = [{ lv: 30, tag: 'Tempered', rar: 'uncommon', k: 1 }, { lv: 45, tag: 'Runed', rar: 'rare', k: 1.45 }, { lv: 60, tag: 'Starforged', rar: 'rare', k: 1.95 }, { lv: 75, tag: 'Mythril', rar: 'epic', k: 2.5 }];
const WEAPON_KINDS: [string, string, string, number, number, J][] = [
  // type, noun, attackKind, base ATK at Lv30, interval %, extra
  ['dagger', 'Dirk', 'melee', 110, 90, { attackRange: 52 }], ['sword', 'Blade', 'melee', 130, 100, { attackRange: 58 }],
  ['twohand_sword', 'Greatsword', 'melee', 170, 118, { attackRange: 64, twoHanded: true }], ['spear', 'Lance', 'melee', 150, 110, { attackRange: 84, twoHanded: true }],
  ['club', 'Mace', 'melee', 135, 105, { attackRange: 54 }], ['axe', 'Axe', 'melee', 160, 115, { attackRange: 56, twoHanded: true }],
  ['katar', 'Katar', 'melee', 140, 92, { attackRange: 52, twoHanded: true }], ['knuckle', 'Knuckles', 'melee', 115, 85, { attackRange: 48 }],
  ['bow', 'Longbow', 'ranged', 120, 100, { attackRange: 320, twoHanded: true }], ['instrument', 'Lute', 'ranged', 100, 100, { attackRange: 260 }],
  ['wand', 'Wand', 'magic', 40, 105, { attackRange: 230, matk: 120 }], ['staff', 'Staff', 'magic', 50, 110, { attackRange: 240, twoHanded: true, matk: 150 }],
  ['book', 'Tome', 'melee', 105, 100, { attackRange: 54, matk: 60 }],
];
const ARMOR_SETS: [string, string, string[], J][] = [
  ['heavy', 'Plate', ['knight', 'merchant'], { pdef: 34, maxHp: 120 }],
  ['light', 'Leathers', ['ranger', 'rogue', 'cleric'], { pdef: 24, flee: 8 }],
  ['robe', 'Robes', ['mage', 'cleric'], { pdef: 14, mdef: 18, maxMp: 80 }],
];

export function main() {
  const classes: J[] = read('classes.json').filter((c: J) => !c.jobgen);
  const skills: J[] = read('skills.json').filter((s: J) => !s.jobgen);
  const items: J[] = read('items.json').filter((i: J) => !i.jobgen);
  const firsts = classes.filter((c) => c.tier === 1);

  // Second jobs
  for (const j of JOBS) {
    const parent = classes.find((c) => c.id === j.parent)!;
    classes.push({
      id: j.id, name: j.name, tier: 2, role: j.role, parent: j.parent, description: j.desc, maxJobLevel: 50, hpPerLevel: j.hp, mpPerLevel: j.mp,
      baseAttackIntervalMs: j.aspd, weaponTypes: j.weapons, skills: j.skills.map((s) => s.id), requirements: { jobLevel: 40, fromClass: j.parent },
      outfit: j.outfit, jobBonus: pattern(j.bonus, 24), weightBonus: j.weight, guildMaster: { town: j.town, name: j.master[0], title: j.master[1] }, jobgen: true,
    });
    for (const s of j.skills) skills.push(skillDef(s, j.id));
    void parent;
  }
  // Rebirth: High Novice and high first jobs (same skills as the first jobs via `inherits`)
  const novice = classes.find((c) => c.id === 'novice')!;
  classes.push({ ...novice, id: 'high_novice', name: 'High Novice', tier: 0, inherits: 'novice', skills: [], description: 'A reborn adventurer, starting over with the strength of a past life.', hpMpMul: 1.25, jobgen: true });
  for (const f of firsts) {
    classes.push({ ...f, id: `high_${f.id}`, name: `High ${f.name}`, parent: 'high_novice', inherits: f.id, skills: [], hpMpMul: 1.25,
      description: `A reborn ${f.name}. Same skills, stronger body.`, requirements: { jobLevel: 10, fromClass: 'high_novice' }, jobgen: true });
  }
  // Transcendent jobs: inherit the second job, need the matching high first job and the same pre-rebirth path
  for (const j of JOBS) {
    const second = classes.find((c) => c.id === j.id)!;
    classes.push({
      ...second, id: j.trans.id, name: j.trans.name, tier: 3, parent: `high_${j.parent}`, inherits: j.id, description: j.trans.desc,
      hpPerLevel: Math.round(j.hp * 1.1), mpPerLevel: Math.round(j.mp * 1.1), hpMpMul: 1.25, skills: j.trans.skills.map((s) => s.id),
      requirements: { jobLevel: 40, fromClass: `high_${j.parent}`, rebornFrom: j.id }, maxJobLevel: 70, jobBonus: pattern(j.bonus, 30, 69), guildMaster: undefined, jobgen: true,
    });
    for (const s of j.trans.skills) skills.push(skillDef(s, j.trans.id));
  }

  // Gear tiers
  for (const t of TIERS) {
    for (const [type, noun, kind, atk, iv, extra] of WEAPON_KINDS) {
      const { matk, ...rest } = extra;
      items.push({
        id: `${t.tag.toLowerCase()}_${type}`, name: `${t.tag} ${noun}`, type: 'equipment', rarity: t.rar, description: `A Lv ${t.lv} ${type.replace('_', '-')}${kind === 'magic' ? ' for casters' : ''}.`,
        weight: type === 'dagger' || type === 'wand' ? 50 : type === 'twohand_sword' || type === 'axe' ? 160 : 100, price: Math.round(2500 * t.k * t.k * 4), stackable: false, maxStack: 1,
        icon: { shape: type === 'twohand_sword' || type === 'katar' || type === 'knuckle' ? 'sword' : type === 'instrument' || type === 'book' ? 'wand' : type, color: ['#c8d0dc', '#7fd6ff', '#ffd34d', '#c9a6ff'][TIERS.indexOf(t)] },
        slot: 'weapon', weaponType: type, attackKind: kind, attackIntervalPct: iv, equipLevel: t.lv, ...rest,
        mods: { patk: Math.round(atk * t.k), ...(matk ? { matk: Math.round(matk * t.k) } : {}), ...(t.lv >= 60 ? { hit: 5 } : {}) },
        soldIn: t.lv <= 45 ? ['sandara', 'frostholm', 'tidewatch'] : [], dropBand: [t.lv - 5, t.lv + 15], jobgen: true,
      });
    }
    for (const [set, noun, cls, base] of ARMOR_SETS) {
      const scale = (o: J) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v as number) * t.k)]));
      const piece = (slot: string, nm: string, mul: number, shape: string) => ({
        id: `${t.tag.toLowerCase()}_${set}_${slot}`, name: `${t.tag} ${noun === 'Plate' ? 'Plate' : noun === 'Robes' ? 'Mystic' : 'Ranger'} ${nm}`, type: 'equipment', rarity: t.rar,
        description: `Lv ${t.lv} ${set} ${slot}.`, weight: set === 'heavy' ? 60 : 25, price: Math.round(1800 * t.k * t.k * 3 * mul), stackable: false, maxStack: 1,
        icon: { shape, color: ['#c8d0dc', '#7fd6ff', '#ffd34d', '#c9a6ff'][TIERS.indexOf(t)] }, slot, equipLevel: t.lv, classes: cls,
        mods: Object.fromEntries(Object.entries(scale(base)).map(([k, v]) => [k, Math.max(1, Math.round((v as number) * mul))])),
        soldIn: t.lv <= 45 ? ['sandara', 'frostholm', 'tidewatch'] : [], dropBand: [t.lv - 5, t.lv + 15], jobgen: true,
      });
      items.push(piece('armor', set === 'robe' ? 'Robe' : 'Armor', 1, set === 'robe' ? 'robe' : 'armor'), piece('headgear', 'Helm', 0.3, 'helm'),
        piece('garment', 'Cloak', 0.25, 'cape'), piece('boots', 'Boots', 0.25, 'boots'));
    }
    items.push({ id: `${t.tag.toLowerCase()}_shield`, name: `${t.tag} Shield`, type: 'equipment', rarity: t.rar, description: `Lv ${t.lv} shield.`, weight: 80,
      price: Math.round(1500 * t.k * t.k * 3), stackable: false, maxStack: 1, icon: { shape: 'shield', color: '#c8d0dc' }, slot: 'shield', equipLevel: t.lv,
      mods: { pdef: Math.round(12 * t.k), maxHp: Math.round(60 * t.k) }, soldIn: t.lv <= 45 ? ['sandara', 'frostholm'] : [], dropBand: [t.lv - 5, t.lv + 15], jobgen: true });
    items.push({ id: `${t.tag.toLowerCase()}_ring`, name: `${t.tag} Ring`, type: 'equipment', rarity: t.rar, description: `Lv ${t.lv} ring.`, weight: 5,
      price: Math.round(1500 * t.k * t.k * 3), stackable: false, maxStack: 1, icon: { shape: 'ring', color: '#ffd34d' }, slot: 'accessory', equipLevel: t.lv,
      mods: { str: Math.round(2 * t.k), dex: Math.round(2 * t.k), maxHp: Math.round(40 * t.k) }, soldIn: [], dropBand: [t.lv - 5, t.lv + 15], jobgen: true });
  }
  // Starter weapons for the new weapon types
  for (const [id, name, type, atk, iv, extra] of [
    ['bronze_katar', 'Bronze Katar', 'katar', 80, 92, { attackRange: 52, twoHanded: true }], ['wrapped_knuckles', 'Wrapped Knuckles', 'knuckle', 65, 85, { attackRange: 48 }],
    ['traveler_lute', "Traveler's Lute", 'instrument', 60, 100, { attackRange: 250, attackKind: 'ranged' }], ['scholar_tome', "Scholar's Tome", 'book', 60, 100, { attackRange: 54, mods: { matk: 30 } }],
  ] as [string, string, string, number, number, J][]) {
    const { mods, attackKind, ...rest } = extra;
    items.push({ id, name, type: 'equipment', rarity: 'uncommon', description: `A starter ${type} for second jobs.`, weight: 60, price: 3000, stackable: false, maxStack: 1,
      icon: { shape: type === 'instrument' || type === 'book' ? 'wand' : 'sword', color: '#c8a26b' }, slot: 'weapon', weaponType: type, attackKind: attackKind ?? 'melee',
      attackIntervalPct: iv, equipLevel: 20, ...rest, mods: { patk: atk, ...(mods ?? {}) }, soldIn: ['aurelion', 'sandara', 'tidewatch', 'fernhollow', 'arcanthe'], jobgen: true });
  }

  write('classes.json', classes);
  write('skills.json', skills);
  write('items.json', items);
  console.log(`${classes.length} classes, ${skills.length} skills, ${items.filter((i) => i.jobgen).length} generated gear items`);
}

