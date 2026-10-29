// Animation clips over a sprite sheet: which frames each animation uses, per direction.
import type { Direction } from '../core/types';

export interface Clip { key: string; cols: number; rows: number; start: number; count: number; frameMs: number; loop: boolean; directions: Direction[] }
export interface Rig { clips: Record<string, Clip>; originX: number; originY: number }

export function clipFrame(c: Clip, dir: Direction, f: number): { frame: number; flipX: boolean } {
  if (c.rows === 1) return { frame: c.start + f, flipX: dir === 'right' };
  return { frame: Math.max(0, c.directions.indexOf(dir)) * c.cols + c.start + f, flipX: false };
}
