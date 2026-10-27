// Character progression & derived-stat formulas. Every coefficient lives in
// src/config/balance.json so balance can be tuned without touching code.
import type { GameData } from './data';
import type {
  BaseStats, CharacterState, DerivedStats, EquipSlot, ItemDef, StatModifiers, StatKey,
} from './types';
import { STAT_KEYS } from './types';

export function expToNextBase(data: GameData, level: number): number {
  const { a, b, c } = data.balance.levels.baseExp;
  return Math.round(a * Math.pow(level, b) + c);
}

export function expToNextJob(data: GameData, jobLevel: number): number {
  const { a, b, c } = data.balance.levels.jobExp;
  return Math.round(a * Math.pow(jobLevel, b) + c);
}

/** Stat points granted when reaching `level`. */
export function statPointsForLevel(data: GameData, level: number): number {
  const s = data.balance.levels.statPointsPerLevel;
  return s.base + Math.floor(level / 5) * s.perFiveLevels;
}

/** Total stat points a character of this level should own (allocated + free). */
export function totalStatPointsAtLevel(data: GameData, level: number): number {
  let total = data.balance.levels.startingStatPoints;
  for (let l = 2; l <= level; l++) total += statPointsForLevel(data, l);
  return total;
}

export interface LevelUpResult {
  baseLevelsGained: number;
  jobLevelsGained: number;
}

/** Adds experience, applying level-ups. Mutates the character. */
export function addExperience(data: GameData, c: CharacterState, baseExp: number, jobExp: number): LevelUpResult {
  const res: LevelUpResult = { baseLevelsGained: 0, jobLevelsGained: 0 };
  const maxBase = data.balance.levels.maxBaseLevel;
  const cls = data.classes.get(c.classId)!;

  if (c.baseLevel < maxBase) {
    c.baseExp += Math.max(0, Math.floor(baseExp));
    while (c.baseLevel < maxBase && c.baseExp >= expToNextBase(data, c.baseLevel)) {
      c.baseExp -= expToNextBase(data, c.baseLevel);
      c.baseLevel++;
      c.statPoints += statPointsForLevel(data, c.baseLevel);
      res.baseLevelsGained++;
    }
    if (c.baseLevel >= maxBase) c.baseExp = 0;
  }
  if (c.jobLevel < cls.maxJobLevel) {
    c.jobExp += Math.max(0, Math.floor(jobExp));
    while (c.jobLevel < cls.maxJobLevel && c.jobExp >= expToNextJob(data, c.jobLevel)) {
      c.jobExp -= expToNextJob(data, c.jobLevel);
      c.jobLevel++;
      c.skillPoints += data.balance.levels.skillPointsPerJobLevel;
      res.jobLevelsGained++;
    }
    if (c.jobLevel >= cls.maxJobLevel) c.jobExp = 0;
  }
  return res;
}

// ------------------------------------------------------------------ modifiers
export function mergeMods(target: StatModifiers, src: StatModifiers | undefined, scale = 1): StatModifiers {
  if (!src) return target;
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue;
    if (k === 'elementDamagePct' || k === 'elementResistPct' || k === 'raceDamagePct' || k === 'sizeDamagePct' || k === 'raceResistPct' || k === 'onHitStatusPct') {
      const t = (target[k] ??= {}) as Record<string, number>;
      for (const [el, n] of Object.entries(v as Record<string, number>)) {
        t[el] = (t[el] ?? 0) + n * scale;
      }
    } else {
      const key = k as keyof StatModifiers;
      (target as Record<string, number>)[key] = ((target as Record<string, number>)[key] ?? 0) + (v as number) * scale;
    }
  }
  return target;
}

/** Random option (affix) → stat modifiers. Keys are plain StatModifiers keys, or race/element bonuses as "raceDamagePct.undead". */
export function optionMods(o: { key: string; value: number }): StatModifiers {
  const [k, sub] = o.key.split('.');
  return (sub ? { [k]: { [sub]: o.value } } : { [k]: o.value }) as StatModifiers;
}

/** Bonus applied per refine level (Phase 2 refinement plugs in here). */
export function refineMods(item: ItemDef, refine: number): StatModifiers {
  if (!refine) return {};
  if (item.slot === 'weapon') {
    const per = [2, 3, 5, 7][Math.min(4, Math.max(1, item.weaponLevel ?? 1)) - 1];
    return { patk: refine * per, matk: item.attackKind === 'magic' ? refine * per : 0 };
  }
  // Armor: 0.7 DEF per refine level, rounded (classic rule).
  return { pdef: Math.floor((refine * 70 + 50) / 100) };
}

export function equipmentMods(data: GameData, c: CharacterState): StatModifiers {
  const mods: StatModifiers = {};
  for (const inst of Object.values(c.equipment)) {
    if (!inst) continue;
    const def = data.items.get(inst.itemId);
    if (!def) continue;
    mergeMods(mods, def.mods);
    mergeMods(mods, refineMods(def, inst.refine ?? 0));
    for (const cardId of inst.cards ?? []) mergeMods(mods, data.items.get(cardId)?.card?.mods);
    if (inst.starCrumbs) mergeMods(mods, { patk: [0, 5, 10, 40][inst.starCrumbs] });
    for (const o of inst.options ?? []) mergeMods(mods, optionMods(o));
  }
  return mods;
}

export function passiveSkillMods(data: GameData, c: CharacterState): StatModifiers {
  const mods: StatModifiers = {};
  for (const [id, lvl] of Object.entries(c.skills)) {
    const s = data.skills.get(id);
    if (s?.passive && lvl > 0) mergeMods(mods, s.passive, lvl);
  }
  return mods;
}

export function weaponOf(data: GameData, c: CharacterState): ItemDef | undefined {
  const w = c.equipment.weapon;
  return w ? data.items.get(w.itemId) : undefined;
}

/**
 * Derived stats = base stats + equipment + passives + runtime modifiers
 * (buffs, status effects; later cards and runes).
 */
const BONUS_KEY: Record<string, StatKey> = { s: 'str', a: 'agi', v: 'vit', i: 'int', d: 'dex', l: 'luk' };
/** Stats a job grants at a job level (Ragnarok job bonus): one point per pattern letter reached. */
export function jobBonus(cls: { jobBonus?: string }, jobLevel: number): BaseStats {
  const out = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 } as BaseStats;
  for (const ch of (cls.jobBonus ?? '').slice(0, Math.max(0, jobLevel - 1))) if (BONUS_KEY[ch]) out[BONUS_KEY[ch]]++;
  return out;
}

export function computeDerivedStats(data: GameData, c: CharacterState, runtimeMods: StatModifiers[] = []): DerivedStats {
  const B = data.balance.stats;
  const cls = data.classes.get(c.classId)!;
  const mods: StatModifiers = {};
  mergeMods(mods, equipmentMods(data, c));
  mergeMods(mods, passiveSkillMods(data, c));
  for (const m of runtimeMods) mergeMods(mods, m);

  const jobBonusStats = jobBonus(cls, c.jobLevel);
  const total = {} as BaseStats;
  for (const k of STAT_KEYS) total[k] = Math.max(k === 'luk' ? 0 : 1, c.stats[k] + jobBonusStats[k] + (mods[k] ?? 0));
  const { str, agi, vit, int, dex, luk } = total;
  const L = c.baseLevel;

  const weapon = weaponOf(data, c);
  const attackKind = weapon?.attackKind ?? 'melee';
  const pct = (n: number | undefined) => 1 + (n ?? 0) / 100;

  const maxHp = Math.max(1, Math.floor(
    (Math.floor((B.hpBase + L * cls.hpPerLevel) * (1 + (vit * B.hpVitPct) / 100)) + (mods.maxHp ?? 0)) * pct(mods.maxHpPct)));
  const maxMp = Math.max(1, Math.floor(
    (Math.floor((B.mpBase + L * cls.mpPerLevel) * (1 + (int * B.mpIntPct) / 100)) + (mods.maxMp ?? 0)) * pct(mods.maxMpPct)));

  const unarmed = weapon ? 0 : data.balance.combat.unarmedAtk;
  const patk = Math.max(1, Math.floor(
    (str * B.patkStr + Math.floor(dex / B.patkDexDiv) + Math.floor(luk / B.patkLukDiv) + Math.floor(L / B.patkLevelDiv) +
      unarmed + (mods.patk ?? 0)) * pct(mods.patkPct)));
  const matk = Math.max(1, Math.floor(
    (Math.floor(int * B.matkInt) + Math.floor(dex / B.matkDexDiv) + Math.floor(L / B.matkLevelDiv) + (mods.matk ?? 0)) * pct(mods.matkPct)));
  const pdef = Math.max(0, Math.floor((vit * B.pdefVit + (mods.pdef ?? 0)) * pct(mods.pdefPct)));
  const mdef = Math.max(0, Math.floor(int * B.mdefInt + vit * B.mdefVit + (mods.mdef ?? 0)));
  const hit = Math.floor(L + B.hitBase + dex * B.hitDex + (mods.hit ?? 0));
  const flee = Math.floor(L + agi * B.fleeAgi + luk * B.fleeLuk + (mods.flee ?? 0));
  const crit = Math.max(0, B.critBase + luk * B.critLuk + (mods.crit ?? 0));
  const critDmg = B.critDmgBase + (mods.critDmg ?? 0);

  const weaponIntervalPct = (weapon?.attackIntervalPct ?? 100) / 100;
  const statSpeed = Math.max(0.35, 1 - (agi * B.aspdAgiPct) / 100 - (dex * B.aspdDexPct) / 100);
  const attackIntervalMs = Math.max(B.minAttackIntervalMs,
    Math.round((cls.baseAttackIntervalMs * weaponIntervalPct * statSpeed) / Math.max(0.2, pct(mods.aspdPct))));
  const moveSpeed = Math.max(30, B.moveSpeed * pct(mods.moveSpeedPct));
  const castTimeMul = Math.max(0, (1 - dex / B.castDexDivisor) * pct(mods.castTimePct));
  const cdrPct = Math.min(50, mods.cdrPct ?? 0);
  const hpRegen = Math.max(0, Math.floor(maxHp * B.hpRegenPctMax) + Math.floor(vit / B.hpRegenVitDiv) + (mods.hpRegen ?? 0));
  const mpRegen = Math.max(0, Math.floor(maxMp * B.mpRegenPctMax) + Math.floor(int / B.mpRegenIntDiv) + 1 + (mods.mpRegen ?? 0));
  const baseRange = weapon?.attackRange ?? data.balance.combat.meleeRange;
  const attackRange = baseRange + (attackKind !== 'melee' ? mods.attackRange ?? 0 : 0);

  return {
    maxHp, maxMp, patk, matk, pdef, mdef, hit, flee, crit, critDmg,
    attackIntervalMs, aspd: Math.max(0, Math.round((200 - attackIntervalMs / 20) * 10) / 10), moveSpeed, castTimeMul, cdrPct, hpRegen, mpRegen,
    attackRange, attackKind,
    weaponElement: c.equipment.weapon?.element ?? weapon?.element ?? 'neutral',
    weightLimit: B.weightBase + str * B.weightStr + (cls.weightBonus ?? 0) + (mods.weightLimit ?? 0),
    doubleAttackPct: weapon?.weaponType === 'dagger' ? Math.min(50, mods.doubleAttackPct ?? 0) : 0,
    jobBonusStats,
    elementDamagePct: mods.elementDamagePct ?? {},
    elementResistPct: mods.elementResistPct ?? {},
    raceDamagePct: mods.raceDamagePct ?? {},
    sizeDamagePct: mods.sizeDamagePct ?? {},
    raceResistPct: mods.raceResistPct ?? {},
    perfectDodge: B.perfectDodgeBase + luk / B.perfectDodgeLukDiv + (mods.perfectDodge ?? 0),
    onHitStatusPct: mods.onHitStatusPct ?? {},
    hpDrainPct: Math.min(20, mods.hpDrainPct ?? 0),
    weaponType: weapon?.weaponType ?? 'unarmed',
    totalStats: total,
  };
}

/** Extra numeric modifiers that are not stat-sheet values (counter, mana shield, stealth). */
export function specialMods(runtimeMods: StatModifiers[]): { counterChance: number; damageToMpPct: number; stealth: number } {
  let counterChance = 0, damageToMpPct = 0, stealth = 0;
  for (const m of runtimeMods) {
    counterChance += m.counterChance ?? 0;
    damageToMpPct += m.damageToMpPct ?? 0;
    stealth += m.stealth ?? 0;
  }
  return { counterChance, damageToMpPct: Math.min(90, damageToMpPct), stealth };
}

/** Status points needed to raise a stat that is currently `value` by one (Ragnarok rule by default). */
export function statRaiseCost(data: GameData, value: number): number {
  const sc = data.balance.levels.statCost;
  if (!sc || sc.mode === 'flat') return 1;
  return Math.floor((value - 1) / sc.every) + sc.base;
}

export function canRaiseStat(data: GameData, c: CharacterState, stat: StatKey): boolean {
  return c.statPoints >= statRaiseCost(data, c.stats[stat]) && c.stats[stat] < data.balance.levels.maxStat;
}

export function slotForItem(def: ItemDef, c: CharacterState): EquipSlot | null {
  if (!def.slot) return null;
  if (def.slot === 'accessory') return c.equipment.accessory1 ? (c.equipment.accessory2 ? 'accessory1' : 'accessory2') : 'accessory1';
  return def.slot;
}
