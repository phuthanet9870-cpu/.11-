// Rune Constellation: a talent board on top of stats and skills. From Base
// Lv 30 the character earns one rune point every two levels and spends them on
// stars in three constellations. A star needs every star it hangs from; the
// last star of each constellation is a capstone. An Astrologer resets it.
import type { GameData } from './data';
import type { CharacterState, StatModifiers } from './types';
import type { OpResult } from './inventory';

export interface RuneNode { id: string; name: string; max: number; mods: StatModifiers; requires: string[] }
export interface Constellation { id: string; name: string; theme: string; color: string; nodes: RuneNode[] }

export const RUNE_START_LEVEL = 30;
export const RUNE_RESET_COST = 10000;

export function runePointsTotal(c: CharacterState): number { return Math.max(0, Math.floor((c.baseLevel - RUNE_START_LEVEL) / 2) + 1); }
export function runePointsSpent(c: CharacterState): number { return Object.values(c.runes ?? {}).reduce((a, b) => a + b, 0); }
export function runePointsLeft(c: CharacterState): number { return runePointsTotal(c) - runePointsSpent(c); }

export function runeNode(data: GameData, id: string): RuneNode | undefined {
  for (const k of data.runes.values()) { const n = k.nodes.find((x) => x.id === id); if (n) return n; }
  return undefined;
}

export function canLearnRune(data: GameData, c: CharacterState, id: string): OpResult {
  const n = runeNode(data, id);
  if (!n) return { ok: false, error: 'Unknown star.' };
  if (c.baseLevel < RUNE_START_LEVEL) return { ok: false, error: `The constellations open at Base Lv ${RUNE_START_LEVEL}.` };
  if ((c.runes?.[id] ?? 0) >= n.max) return { ok: false, error: `${n.name} is at its maximum rank.` };
  if (runePointsLeft(c) <= 0) return { ok: false, error: 'No rune points left.' };
  const missing = n.requires.find((r) => !(c.runes?.[r]));
  if (missing) return { ok: false, error: `Needs ${runeNode(data, missing)?.name ?? missing} first.` };
  return { ok: true };
}

export function learnRune(data: GameData, c: CharacterState, id: string): OpResult {
  const chk = canLearnRune(data, c, id);
  if (!chk.ok) return chk;
  c.runes = { ...(c.runes ?? {}), [id]: (c.runes?.[id] ?? 0) + 1 };
  return { ok: true, message: `${runeNode(data, id)!.name} rank ${c.runes[id]}.` };
}

export function resetRunes(c: CharacterState, cost = RUNE_RESET_COST): OpResult {
  if (!runePointsSpent(c)) return { ok: false, error: 'No stars to reset.' };
  if (c.luma < cost) return { ok: false, error: `Needs ${cost} Luma.` };
  c.luma -= cost;
  c.runes = {};
  return { ok: true, message: 'The constellations are cleared. Your rune points are back.' };
}

/** All rune bonuses, ready to merge (record keys like sizeDamagePct are scaled per rank too). */
export function runeModList(data: GameData, c: CharacterState): { mods: StatModifiers; rank: number }[] {
  const out: { mods: StatModifiers; rank: number }[] = [];
  for (const [id, rank] of Object.entries(c.runes ?? {})) { const n = runeNode(data, id); if (n && rank > 0) out.push({ mods: n.mods, rank }); }
  return out;
}
