// Character creation, stat allocation, skill learning and job changes.
import type { GameData } from './data';
import { addItem, equipItem, type OpResult } from './inventory';
import { statRaiseCost, totalStatPointsAtLevel } from './formulas';
import type { Appearance, CharacterState, SkillDef, StatKey } from './types';
import { STAT_KEYS } from './types';

const ok = (message?: string): OpResult => ({ ok: true, message });
const fail = (error: string): OpResult => ({ ok: false, error });

export const HAIR_STYLES: Appearance['hairStyle'][] = ['short', 'long', 'spiky', 'ponytail', 'bob'];
export const HAIR_COLORS = ['#2b2b33', '#6a3a2a', '#c8862e', '#f2d58a', '#e0e6f2', '#d8506a', '#4a7ae0', '#5fbf6a', '#9a6ad8'];
export const EYE_COLORS = ['#3a5a8a', '#3a8a5a', '#8a5a2a', '#a83a3a', '#7a3ad8', '#2bb8c8', '#d8a82b'];
export const SKIN_TONES = ['#f6dcc8', '#f2d0b4', '#e8bfa0', '#d9a77e', '#b07a52', '#7a5034'];

export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2 || n.length > 16) return 'Name must be 2–16 characters.';
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M} _-]*$/u.test(n)) return 'Use letters, numbers, spaces, - or _ only.';
  return null;
}

export function createCharacter(data: GameData, name: string, appearance: Appearance, id?: string): CharacterState {
  const err = validateName(name);
  if (err) throw new Error(err);
  const lv = data.balance.levels;
  const start = data.maps.get('willowbrook')!;
  const c: CharacterState = {
    id: id ?? `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name.trim(),
    createdAt: Date.now(),
    appearance: { ...appearance },
    classId: 'novice',
    classHistory: ['novice'],
    baseLevel: 1,
    jobLevel: 1,
    baseExp: 0,
    jobExp: 0,
    statPoints: lv.startingStatPoints,
    skillPoints: 0,
    stats: { ...lv.startingStats },
    skills: {},
    hp: 1,
    mp: 1,
    luma: data.balance.economy.startingLuma,
    inventory: [],
    equipment: {},
    storage: [],
    quests: {},
    flags: {},
    position: { mapId: start.id, x: start.spawnPoints.default.x * 32 + 16, y: start.spawnPoints.default.y * 32 + 16 },
    savePoint: { mapId: start.id, spawn: 'default' },
    hotbar: [
      { type: 'item', id: 'red_potion' }, null, null, null, null, null, null, null, null, null,
    ],
    stats_meta: { kills: 0, deaths: 0, playTimeMs: 0, bossKills: {} },
  };
  addItem(data, c, 'training_knife', 1, { ignoreWeight: true });
  addItem(data, c, 'cotton_shirt', 1, { ignoreWeight: true });
  addItem(data, c, 'red_potion', 5, { ignoreWeight: true });
  addItem(data, c, 'wing_of_return', 1, { ignoreWeight: true });
  for (const inst of [...c.inventory]) {
    const d = data.items.get(inst.itemId)!;
    if (d.type === 'equipment') equipItem(data, c, inst.uid);
  }
  c.hp = 999999; // clamped to max HP when the world spawns the player
  c.mp = 999999;
  return c;
}

// ------------------------------------------------------------------ stats
export function allocateStat(data: GameData, c: CharacterState, stat: StatKey, amount = 1): OpResult {
  if (!STAT_KEYS.includes(stat)) return fail('Unknown stat.');
  if (!Number.isInteger(amount) || amount <= 0) return fail('Invalid amount.');
  if (c.stats[stat] + amount > data.balance.levels.maxStat) return fail('Stat is at maximum.');
  let cost = 0;
  for (let v = c.stats[stat]; v < c.stats[stat] + amount; v++) cost += statRaiseCost(data, v);
  if (c.statPoints < cost) return fail(`Not enough stat points (needs ${cost}).`);
  c.stats[stat] += amount;
  c.statPoints -= cost;
  return ok();
}

export function resetStats(data: GameData, c: CharacterState): OpResult {
  c.stats = { ...data.balance.levels.startingStats };
  c.statPoints = totalStatPointsAtLevel(data, c.baseLevel);
  return ok('Stats have been reset.');
}

// ------------------------------------------------------------------ skills
export function classLineage(data: GameData, classId: string): string[] {
  const out: string[] = [];
  let cur = data.classes.get(classId);
  while (cur) {
    out.unshift(cur.id);
    cur = cur.parent ? data.classes.get(cur.parent) : undefined;
  }
  return out;
}

export function skillCheck(data: GameData, c: CharacterState, skill: SkillDef): OpResult {
  if (!classLineage(data, c.classId).includes(skill.classId)) return fail('Your class cannot learn this skill.');
  const lvl = c.skills[skill.id] ?? 0;
  if (lvl >= skill.maxLevel) return fail('Skill is already at max level.');
  if (c.skillPoints <= 0) return fail('No skill points available.');
  if (skill.requiresJobLevel && skill.classId === c.classId && c.jobLevel < skill.requiresJobLevel) {
    return fail(`Requires Job Level ${skill.requiresJobLevel}.`);
  }
  for (const r of skill.requires ?? []) {
    if ((c.skills[r.skillId] ?? 0) < r.level) {
      return fail(`Requires ${data.skills.get(r.skillId)?.name ?? r.skillId} Lv.${r.level}.`);
    }
  }
  return ok();
}

export function learnSkill(data: GameData, c: CharacterState, skillId: string): OpResult {
  const skill = data.skills.get(skillId);
  if (!skill) return fail('Unknown skill.');
  const check = skillCheck(data, c, skill);
  if (!check.ok) return check;
  c.skills[skillId] = (c.skills[skillId] ?? 0) + 1;
  c.skillPoints--;
  return ok(`${skill.name} is now Lv.${c.skills[skillId]}.`);
}

export function resetSkills(data: GameData, c: CharacterState): OpResult {
  let refund = 0;
  for (const [id, lvl] of Object.entries(c.skills)) {
    if (data.skills.has(id)) refund += lvl;
  }
  c.skills = {};
  c.skillPoints += refund;
  c.hotbar = c.hotbar.map((s) => (s?.type === 'skill' ? null : s));
  return ok(`Skills reset. ${refund} skill points refunded.`);
}

// ------------------------------------------------------------------ jobs
export function canChangeJob(data: GameData, c: CharacterState, targetClass: string): OpResult {
  const target = data.classes.get(targetClass);
  if (!target) return fail('Unknown class.');
  const req = target.requirements ?? {};
  if (req.fromClass && req.fromClass !== c.classId) return fail(`Must be a ${data.classes.get(req.fromClass)?.name}.`);
  if (req.jobLevel && c.jobLevel < req.jobLevel) return fail(`Requires Job Level ${req.jobLevel}.`);
  if (req.baseLevel && c.baseLevel < req.baseLevel) return fail(`Requires Base Level ${req.baseLevel}.`);
  return ok();
}

export function changeJob(data: GameData, c: CharacterState, targetClass: string): OpResult {
  const check = canChangeJob(data, c, targetClass);
  if (!check.ok) return check;
  c.classId = targetClass;
  c.classHistory.push(targetClass);
  c.jobLevel = 1;
  c.jobExp = 0;
  return ok(`You are now a ${data.classes.get(targetClass)!.name}!`);
}
