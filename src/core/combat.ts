// Pure combat resolution: hit/miss, critical, defense, element modifiers and
// status application. Both player and monster attacks go through these rules.
import type { GameData } from './data';
import type { Rng } from './rng';
import type { DerivedStats, Element, MonsterDef, StatusId } from './types';

export interface CombatProfile {
  level: number;
  patk: number;
  matk: number;
  pdef: number;
  mdef: number;
  hit: number;
  flee: number;
  crit: number;
  critDmg: number;
  /** Element of the defender's body. */
  element: Element;
  elementDamagePct: Partial<Record<Element, number>>;
  elementResistPct: Partial<Record<Element, number>>;
  /** Race / size of this combatant (players are demihuman, medium). */
  race: string;
  size: string;
  raceDamagePct: Partial<Record<string, number>>;
  sizeDamagePct: Partial<Record<string, number>>;
  raceResistPct: Partial<Record<string, number>>;
  perfectDodge: number;
  weaponType: string;
}

export interface AttackOptions {
  kind: 'physical' | 'magic';
  multiplier: number;
  element: Element;
  ignoreDefPct?: number;
  alwaysHit?: boolean;
  canCrit?: boolean;
}

export interface AttackResult {
  hit: boolean;
  crit: boolean;
  damage: number;
  elementMul: number;
}

export function elementModifier(data: GameData, attack: Element, defend: Element): number {
  return (data.elementTable[attack]?.[defend] ?? 100) / 100;
}

export function hitChance(data: GameData, attackerHit: number, defenderFlee: number): number {
  const c = data.balance.combat;
  return Math.min(c.hitChanceMax, Math.max(c.hitChanceMin, c.hitChanceBase + attackerHit - defenderFlee)) / 100;
}

export function defenseMultiplier(data: GameData, def: number): number {
  const k = data.balance.combat.defenseConstant;
  return k / (k + Math.max(0, def));
}

export function resolveAttack(
  data: GameData, rng: Rng, attacker: CombatProfile, defender: CombatProfile, opts: AttackOptions,
): AttackResult {
  const c = data.balance.combat;
  const isPhys = opts.kind === 'physical';
  if (isPhys && !opts.alwaysHit) {
    // Perfect dodge is rolled before HIT/FLEE (Ragnarok rule) and ignores the attacker's HIT.
    if (defender.perfectDodge > 0 && rng.chance(defender.perfectDodge / 100)) return { hit: false, crit: false, damage: 0, elementMul: 1 };
    if (!rng.chance(hitChance(data, attacker.hit, defender.flee))) {
      return { hit: false, crit: false, damage: 0, elementMul: 1 };
    }
  }
  const crit = isPhys && opts.canCrit !== false && rng.chance(attacker.crit / 100);
  const atk = isPhys ? attacker.patk : attacker.matk;
  let dmg = atk * opts.multiplier * rng.range(c.variance[0], c.variance[1]);

  const rawDef = isPhys ? defender.pdef : defender.mdef;
  const def = rawDef * (1 - (opts.ignoreDefPct ?? 0) / 100);
  if (!(crit && c.critIgnoresDefense)) dmg *= defenseMultiplier(data, def);
  if (crit) dmg *= attacker.critDmg / 100;

  const elementMul = elementModifier(data, opts.element, defender.element);
  dmg *= elementMul;
  dmg *= 1 + (attacker.elementDamagePct[opts.element] ?? 0) / 100;
  dmg *= 1 - Math.min(80, defender.elementResistPct[opts.element] ?? 0) / 100;
  // Weapon-vs-size table for physical hits, then race/size bonuses and race resistance (cards).
  const sizeTable = c.sizeModifiers as unknown as Record<string, Record<string, number> | undefined>;
  if (isPhys) dmg *= (sizeTable[attacker.weaponType]?.[defender.size] ?? 100) / 100;
  dmg *= 1 + ((attacker.raceDamagePct[defender.race] ?? 0) + (attacker.sizeDamagePct[defender.size] ?? 0)) / 100;
  dmg *= 1 - Math.min(80, defender.raceResistPct[attacker.race] ?? 0) / 100;

  const damage = elementMul <= 0 ? 0 : Math.max(1, Math.round(dmg));
  return { hit: true, crit, damage, elementMul };
}

export function profileFromDerived(level: number, s: DerivedStats, bodyElement: Element = 'neutral'): CombatProfile {
  return {
    level, patk: s.patk, matk: s.matk, pdef: s.pdef, mdef: s.mdef, hit: s.hit, flee: s.flee,
    crit: s.crit, critDmg: s.critDmg, element: bodyElement,
    elementDamagePct: s.elementDamagePct, elementResistPct: s.elementResistPct,
    race: 'demihuman', size: 'medium', raceDamagePct: s.raceDamagePct, sizeDamagePct: s.sizeDamagePct, raceResistPct: s.raceResistPct,
    perfectDodge: s.perfectDodge, weaponType: s.weaponType,
  };
}

export function profileFromMonster(data: GameData, m: MonsterDef, atkMul = 1): CombatProfile {
  const c = data.balance.combat;
  return {
    level: m.level,
    patk: Math.round(m.attack * atkMul),
    matk: Math.round((m.magicAttack ?? m.attack) * atkMul),
    pdef: m.defense,
    mdef: m.magicDefense ?? Math.floor(m.defense / 2),
    hit: m.hit ?? Math.round(c.monsterHitBase + m.level * c.monsterHitPerLevel),
    flee: m.flee ?? Math.round(c.monsterFleeBase + m.level * c.monsterFleePerLevel),
    crit: m.aiType === 'boss' || m.aiType === 'elite' ? 5 : 1,
    critDmg: 140,
    element: m.element,
    elementDamagePct: {},
    elementResistPct: {},
    race: m.race, size: m.size, raceDamagePct: {}, sizeDamagePct: {}, raceResistPct: {}, perfectDodge: 0, weaponType: 'monster',
  };
}

export interface StatusTarget {
  element: Element;
  /** Value of the stat used for resistance (players) or level (monsters). */
  resistValue: (stat: string) => number;
  immune?: StatusId[];
}

/** Returns effective duration (ms) if the status lands, or 0 when resisted/immune. */
export function rollStatus(
  data: GameData, rng: Rng, target: StatusTarget, status: StatusId, chance: number, durationMs?: number,
): number {
  const def = data.statuses.get(status);
  if (!def) return 0;
  if (target.immune?.includes(status)) return 0;
  if (def.immuneElements?.includes(target.element)) return 0;
  const resist = def.resistStat ? Math.min(0.9, target.resistValue(def.resistStat) * (def.resistPerPoint ?? 0)) : 0;
  if (!rng.chance(chance * (1 - resist))) return 0;
  return Math.max(300, Math.round((durationMs ?? def.defaultDurationMs) * (1 - resist * 0.5)));
}
