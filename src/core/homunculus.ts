// Homunculus, Ragnarok-style: an artificial life-form an Alchemist creates
// from an Embryo (needs the Bioethics skill). It follows its owner, fights the
// owner's target, gains EXP and levels, gets hungry, and can die and be
// revived. Loyal homunculi fight 10% harder; at Lv 50 a Loyal homunculus can
// evolve with a Stone of Sages (+25% stats).
import type { GameData } from './data';
import type { CharacterState, Element, HomunculusState } from './types';
import { addItem, removeItem, type OpResult } from './inventory';

export interface HomunDef {
  id: string; name: string; role: string; description: string; art: string;
  base: { hp: number; atk: number; matk: number; def: number; flee: number; hit: number; aspdMs: number; range: number; magic: boolean; element: Element };
  growth: { hp: number; atk: number; matk: number; def: number; flee: number; hit: number };
  skill: { kind: 'heal' | 'taunt' | 'flurry' | 'bolt'; name: string; cooldownMs: number; value: number };
}

export const HOMUN_MAX_LEVEL = 99;
export const HOMUN_EVOLVE_LEVEL = 50;
export const EMBRYO = 'homun_embryo';
export const HOMUN_FOOD = 'homun_ration';
export const HOMUN_REVIVE = 'homun_revive';
export const SAGE_STONE = 'sage_stone';
const HUNGER_TICK_MS = 60000;
const HUNGER_PER_TICK = 2;

export function homunExpToNext(level: number): number { return Math.round(60 * Math.pow(level, 1.8)); }

export interface HomunStats { maxHp: number; atk: number; matk: number; def: number; flee: number; hit: number; aspdMs: number; range: number; magic: boolean; element: Element }
export function homunStats(data: GameData, h: HomunculusState): HomunStats {
  const d = data.homunculi.get(h.typeId)!;
  const mul = (h.evolved ? 1.25 : 1) * (h.intimacy >= 910 ? 1.1 : 1);
  const g = (k: keyof HomunDef['growth']) => Math.round((d.base[k] + d.growth[k] * (h.level - 1)) * mul);
  return { maxHp: g('hp'), atk: g('atk'), matk: g('matk'), def: g('def'), flee: g('flee'), hit: g('hit'),
    aspdMs: Math.max(350, Math.round(d.base.aspdMs * (h.evolved ? 0.85 : 1))), range: d.base.range, magic: d.base.magic, element: d.base.element };
}

/** Use an Embryo: needs Bioethics (call_homunculus). The type is random. */
export function createHomunculus(data: GameData, c: CharacterState, rand: () => number): OpResult {
  if (!(c.skills.call_homunculus > 0)) return { ok: false, error: 'Only an Alchemist who knows Bioethics can create a homunculus.' };
  if (c.homunculus) return { ok: false, error: 'You already have a homunculus.' };
  if (!removeItem(c, EMBRYO, 1).ok) return { ok: false, error: 'You need a Homunculus Embryo.' };
  const types = [...data.homunculi.values()];
  const d = types[Math.floor(rand() * types.length)];
  c.homunculus = { typeId: d.id, name: d.name, level: 1, exp: 0, hp: 0, hunger: 50, intimacy: 250, alive: true, out: true, evolved: false };
  c.homunculus.hp = homunStats(data, c.homunculus).maxHp;
  return { ok: true, message: `A ${d.name} (${d.role}) was born from the embryo!` };
}

export function addHomunExp(data: GameData, h: HomunculusState, exp: number): number {
  let gained = 0;
  if (h.level >= HOMUN_MAX_LEVEL) return 0;
  h.exp += Math.max(0, Math.floor(exp));
  while (h.level < HOMUN_MAX_LEVEL && h.exp >= homunExpToNext(h.level)) { h.exp -= homunExpToNext(h.level); h.level++; gained++; }
  if (gained) h.hp = homunStats(data, h).maxHp;
  return gained;
}

export function feedHomun(c: CharacterState): OpResult & { delta?: number } {
  const h = c.homunculus;
  if (!h || !h.alive) return { ok: false, error: 'You have no living homunculus.' };
  if (!removeItem(c, HOMUN_FOOD, 1).ok) return { ok: false, error: 'You need a Homunculus Ration.' };
  const delta = h.hunger > 90 ? -50 : h.hunger > 75 ? 10 : 20;
  h.intimacy = Math.max(0, Math.min(1000, h.intimacy + delta));
  h.hunger = Math.min(100, h.hunger + 20);
  return { ok: true, delta, message: delta < 0 ? `${h.name} is overfed. (Intimacy ${delta})` : `${h.name} eats. (Intimacy +${delta})` };
}

/** Hunger drops while the homunculus is out; starving costs intimacy, and at 0 it leaves. */
export function tickHomun(c: CharacterState, now: number): 'left' | 'hungry' | null {
  const h = c.homunculus;
  if (!h || !h.out || !h.alive) { if (h) h.nextHungerAt = undefined; return null; }
  h.nextHungerAt ??= now + HUNGER_TICK_MS;
  let ev: 'hungry' | null = null;
  while (now >= h.nextHungerAt) {
    h.nextHungerAt += HUNGER_TICK_MS;
    const before = h.hunger;
    h.hunger = Math.max(0, h.hunger - HUNGER_PER_TICK);
    if (before > 25 && h.hunger <= 25) ev = 'hungry';
    if (h.hunger === 0) h.intimacy = Math.max(0, h.intimacy - 10);
    if (h.intimacy <= 0) { c.homunculus = null; return 'left'; }
  }
  return ev;
}

export function reviveHomun(data: GameData, c: CharacterState): OpResult {
  const h = c.homunculus;
  if (!h) return { ok: false, error: 'You have no homunculus.' };
  if (h.alive) return { ok: false, error: `${h.name} is alive.` };
  if (!removeItem(c, HOMUN_REVIVE, 1).ok) return { ok: false, error: 'You need a Revival Tonic.' };
  h.alive = true; h.out = true; h.hp = Math.round(homunStats(data, h).maxHp * 0.3);
  return { ok: true, message: `${h.name} is revived.` };
}

export function evolveHomun(data: GameData, c: CharacterState): OpResult {
  const h = c.homunculus;
  if (!h || !h.alive) return { ok: false, error: 'You have no living homunculus.' };
  if (h.evolved) return { ok: false, error: 'Already evolved.' };
  if (h.level < HOMUN_EVOLVE_LEVEL) return { ok: false, error: `Needs Lv ${HOMUN_EVOLVE_LEVEL}.` };
  if (h.intimacy < 910) return { ok: false, error: 'Needs Loyal intimacy (910+).' };
  if (!removeItem(c, SAGE_STONE, 1).ok) return { ok: false, error: 'Needs a Stone of Sages.' };
  h.evolved = true;
  h.name = h.name.startsWith('Greater ') ? h.name : `Greater ${h.name}`;
  h.hp = homunStats(data, h).maxHp;
  return { ok: true, message: `${h.name} evolved! (+25% stats)` };
}

/** Give up the homunculus: it returns to an Embryo. */
export function releaseHomun(data: GameData, c: CharacterState): OpResult {
  if (!c.homunculus) return { ok: false, error: 'You have no homunculus.' };
  c.homunculus = null;
  addItem(data, c, EMBRYO, 1, { ignoreWeight: true });
  return { ok: true, message: 'The homunculus returns to an embryo.' };
}
