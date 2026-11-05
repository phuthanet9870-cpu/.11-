// Rune stones: socketed into the two rune slots. Each kind has five levels; a stone can be
// refined (+0…+10) at a blacksmith like equipment (refine.ts), each + adding 12% of its base effect. Higher levels drop from
// stronger monsters and more rarely, and are harder to refine.
import type { StatModifiers } from './types';

export interface RuneKind { id: string; name: string; glyph: string; color: string; stat: string; base: [number, number, number, number, number]; unit: '%' | ''; text: string }

export const RUNE_KINDS: RuneKind[] = [
  { id: 'siphon', name: 'Siphon', glyph: 'ᛗ', color: '#5aa8ff', stat: 'mpDrainPct', base: [1, 2, 3, 4.5, 6], unit: '%', text: 'Basic attacks restore MP equal to {v} of the damage dealt.' },
  { id: 'soulsiphon', name: 'Soul Siphon', glyph: 'ᛋ', color: '#8a7aff', stat: 'skillMpDrainPct', base: [1, 1.5, 2.5, 3.5, 5], unit: '%', text: 'Skill hits restore MP equal to {v} of the damage dealt.' },
  { id: 'leech', name: 'Leech', glyph: 'ᛚ', color: '#ff4a5a', stat: 'hpDrainPct', base: [1, 2, 3, 4, 5], unit: '%', text: 'Basic attacks restore HP equal to {v} of the damage dealt.' },
  { id: 'bloodrite', name: 'Bloodrite', glyph: 'ᛒ', color: '#c81a3a', stat: 'skillHpDrainPct', base: [0.5, 1, 1.5, 2.5, 3.5], unit: '%', text: 'Skill hits restore HP equal to {v} of the damage dealt.' },
  { id: 'fury', name: 'Fury', glyph: 'ᚠ', color: '#ff8a2e', stat: 'crit', base: [2, 4, 6, 9, 12], unit: '', text: '+{v} critical rate.' },
  { id: 'haste', name: 'Haste', glyph: 'ᚺ', color: '#b6f0d0', stat: 'aspdPct', base: [2, 4, 6, 8, 11], unit: '%', text: '+{v} attack speed.' },
  { id: 'wisdom', name: 'Wisdom', glyph: 'ᚹ', color: '#7fd6ff', stat: 'cdrPct', base: [2, 3, 5, 7, 9], unit: '%', text: '{v} shorter skill cooldowns.' },
  { id: 'focus', name: 'Focus', glyph: 'ᚾ', color: '#c9a6ff', stat: 'castTimePct', base: [-3, -5, -8, -11, -15], unit: '%', text: '{v} cast time.' },
  { id: 'titan', name: 'Titan', glyph: 'ᛏ', color: '#e2b23a', stat: 'maxHpPct', base: [3, 5, 8, 11, 15], unit: '%', text: '+{v} max HP.' },
  { id: 'mystic', name: 'Mystic', glyph: 'ᛉ', color: '#4ad0ff', stat: 'maxMpPct', base: [3, 6, 9, 12, 16], unit: '%', text: '+{v} max MP.' },
  { id: 'might', name: 'Might', glyph: 'ᛘ', color: '#ff5a3a', stat: 'patkPct', base: [2, 4, 6, 8, 11], unit: '%', text: '+{v} ATK.' },
  { id: 'sorcery', name: 'Sorcery', glyph: 'ᛊ', color: '#ff5aff', stat: 'matkPct', base: [2, 4, 6, 8, 11], unit: '%', text: '+{v} MATK.' },
  { id: 'bulwark', name: 'Bulwark', glyph: 'ᛝ', color: '#a8b0c0', stat: 'pdefPct', base: [3, 5, 8, 11, 15], unit: '%', text: '+{v} DEF.' },
  { id: 'gale', name: 'Gale', glyph: 'ᚱ', color: '#9ad8a8', stat: 'moveSpeedPct', base: [2, 3, 5, 7, 9], unit: '%', text: '+{v} move speed.' },
];
export const RUNE_BY_ID = new Map(RUNE_KINDS.map((k) => [k.id, k]));
export const RUNE_MAX_REFINE = 10;

/** Item id of a rune stone. */
export const runeItemId = (kind: string, level: number) => `rune_${kind}_${level}`;

/** Effect value of a stone (rounded to 0.1). */
export function runeValue(kind: string, level: number, refine = 0): number {
  const k = RUNE_BY_ID.get(kind);
  if (!k) return 0;
  return Math.round(k.base[Math.max(1, Math.min(5, level)) - 1] * (1 + 0.12 * Math.min(RUNE_MAX_REFINE, refine)) * 10) / 10;
}

export function runeStoneMods(kind: string, level: number, refine = 0): StatModifiers {
  const k = RUNE_BY_ID.get(kind);
  return k ? ({ [k.stat]: runeValue(kind, level, refine) } as StatModifiers) : {};
}

export function runeText(kind: string, level: number, refine = 0): string {
  const k = RUNE_BY_ID.get(kind);
  if (!k) return '';
  const v = runeValue(kind, level, refine);
  return k.text.replace('{v}', `${v}${k.unit}`);
}

/** Lowest monster level that drops each rune level, and the drop chance per kill. */
export const RUNE_DROP: { minMonsterLevel: number; chance: number }[] = [
  { minMonsterLevel: 1, chance: 0.004 }, { minMonsterLevel: 25, chance: 0.0025 }, { minMonsterLevel: 50, chance: 0.0015 },
  { minMonsterLevel: 75, chance: 0.0008 }, { minMonsterLevel: 100, chance: 0.0004 },
];
