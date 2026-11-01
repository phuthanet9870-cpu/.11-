// Contract between the Phaser scenes and the application shell (DOM UI).
import type { Settings } from '../core/types';
import type { World, WorldEvent } from '../core/world';

export interface GameHost {
  world: World;
  settings: Settings;
  paused: boolean;
  pointerWorld: { x: number; y: number } | null;
  onWorldEvents(events: WorldEvent[]): void;
  onFrame(): void;
  /** Opens the Social window (clicking another player outside PvP). */
  openSocial?(): void;
  /** Clicked another player (outside PvP): show what you can do with them. */
  playerMenu?(name: string, e: MouseEvent): void;
  /** Zoom the camera in (+) or out (−) by steps. */
  zoomBy?(steps: number): void;
}
