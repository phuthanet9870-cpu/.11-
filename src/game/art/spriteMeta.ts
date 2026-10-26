// Sprite sheet contracts. Replacement artwork must follow these layouts
// (or ship its own atlas JSON with the same animation names) — see
// docs/ASSET_PIPELINE.md and public/assets/asset-manifest.json.
import type { Direction } from '../../core/types';

export const CHAR_FRAME_W = 48;
export const CHAR_FRAME_H = 64;
export const CHAR_SHEET_COLS = 16;
/** Row order of the character sheet. */
export const CHAR_DIRECTIONS: Direction[] = ['down', 'left', 'right', 'up'];
export const CHAR_PIVOT = { x: 0.5, y: 60 / 64 };
export const CHAR_COLLISION_BOX = { w: 18, h: 12, offsetY: 0 };

export type CharAnim = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death';
export const CHAR_ANIMS: Record<CharAnim, { start: number; count: number; frameMs: number; loop: boolean }> = {
  idle: { start: 0, count: 2, frameMs: 520, loop: true },
  walk: { start: 2, count: 4, frameMs: 130, loop: true },
  attack: { start: 6, count: 3, frameMs: 90, loop: false },
  cast: { start: 9, count: 3, frameMs: 160, loop: true },
  hit: { start: 12, count: 1, frameMs: 200, loop: false },
  death: { start: 13, count: 3, frameMs: 220, loop: false },
};

/** Monster sheets: one row (facing left; right is mirrored at runtime). */
export type MonAnim = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
export const MON_ANIMS: Record<MonAnim, { start: number; count: number; frameMs: number; loop: boolean }> = {
  idle: { start: 0, count: 2, frameMs: 450, loop: true },
  walk: { start: 2, count: 4, frameMs: 140, loop: true },
  attack: { start: 6, count: 3, frameMs: 110, loop: false },
  hit: { start: 9, count: 1, frameMs: 180, loop: false },
  death: { start: 10, count: 3, frameMs: 200, loop: false },
};
export const MON_SHEET_COLS = 13;
