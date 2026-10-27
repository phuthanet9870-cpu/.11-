// VEYLORIA ART BIBLE — master palette & ramps.
// Light comes from the upper-left: top/left edges take the light tone,
// bottom/right edges the shadow tone, bottom-right corners the deep tone.
// Outlines are "selective": each part is outlined in its own darkest tone.
import { hex, type RGBA } from './pixel';

export interface Ramp { o: RGBA; d: RGBA; s: RGBA; b: RGBA; l: RGBA }

export function ramp(o: string, d: string, s: string, b: string, l: string): Ramp {
  return { o: hex(o), d: hex(d), s: hex(s), b: hex(b), l: hex(l) };
}

export const OUTLINE = hex('#2b1d2a');

export const R = {
  // Palette-swap KEY ramps: exact colours the engine recolours at runtime.
  skin: ramp('#7a3f33', '#b4674f', '#d9977a', '#f5c9a3', '#ffe4c8'),
  hair: ramp('#3a1b10', '#5c2d17', '#7d4222', '#a35d30', '#cf8a4f'),
  eye: ramp('#1a1f3a', '#23305e', '#2f55a0', '#4f8fe0', '#bfe3ff'),

  // Novice outfit
  linen: ramp('#5a3f2a', '#8a6a48', '#b8955f', '#dcc08a', '#f2e2b4'),
  leather: ramp('#2e1c12', '#4a2e1c', '#6a4328', '#8b5a34', '#ab7646'),
  cloth_brown: ramp('#2c2018', '#433226', '#5d4634', '#77604a', '#927a60'),
  satchel: ramp('#3a2414', '#5e3c20', '#7e5530', '#a06f40', '#c48e58'),
  steel: ramp('#2a2c38', '#565a6c', '#8a90a4', '#c4cad8', '#f2f5fa'),
  wood: ramp('#2e1a0e', '#4a2c16', '#6b4222', '#8c5a30', '#b07a48'),
  brass: ramp('#4a3010', '#7a5418', '#b0801e', '#e0b23a', '#ffe48a'),

  // Nature
  grass: ramp('#1d3a1f', '#2f5a2c', '#3f7a36', '#56a043', '#7cc45a'),
  leaf: ramp('#183018', '#25502a', '#367038', '#4f9a45', '#78c460'),
  bark: ramp('#24160e', '#3c2618', '#583822', '#77502e', '#94683e'),
  dirt: ramp('#3a2616', '#5a3e24', '#7d5a36', '#a07a4c', '#c09a68'),
  stone: ramp('#2a2a34', '#4e4e5c', '#74747e', '#9c9aa0', '#c6c4c4'),
  water: ramp('#10243e', '#1d4270', '#2a62a2', '#3f8ad0', '#86c6f0'),
  sand: ramp('#5e4a2a', '#9a7f4c', '#c4a96c', '#e2cc92', '#f6e6b8'),
  roof_red: ramp('#3a1414', '#6a2222', '#963228', '#b84a3a', '#dc7058'),
  roof_slate: ramp('#1a1e28', '#2e3444', '#454c60', '#5e667c', '#7c869c'),
  roof_blue: ramp('#122038', '#1e3a64', '#2c5690', '#3a74b8', '#64a0dc'),
  roof_purple: ramp('#24142e', '#3e2254', '#583276', '#744696', '#9a6cbc'),
  roof_brown: ramp('#2c1a0e', '#4a2c18', '#6e4426', '#8e5c36', '#b07c50'),
  plaster: ramp('#5a4a3a', '#a08c74', '#c8b49a', '#e6d6bc', '#fbf0dc'),
  timber: ramp('#22140a', '#3a2414', '#563820', '#704a2a', '#8c6038'),
  flower_pink: ramp('#5a1a34', '#a03060', '#d0507c', '#f080a0', '#ffc0d4'),
  flower_yellow: ramp('#5a4410', '#a07a10', '#d0a820', '#f2d23a', '#fff09a'),
  flower_white: ramp('#4a4a5a', '#9a9ab0', '#c8c8d8', '#ececf4', '#ffffff'),

  // Monsters
  slime: ramp('#183a1a', '#2c6a2c', '#3f9440', '#62c25a', '#a6ec8a'),
  mush_cap: ramp('#3e1010', '#7a1e1e', '#ac2e28', '#d64a3a', '#f4806a'),
  mush_stem: ramp('#5a4434', '#a08870', '#ccb69a', '#eedcc0', '#fff6e4'),
  rabbit: ramp('#4a4038', '#9a8c7c', '#c6b8a6', '#e8dccc', '#fffaf0'),
  horn: ramp('#4a3a1a', '#8a7040', '#b89a60', '#e0c890', '#fff0c8'),
  pink: ramp('#5a2a34', '#a0505c', '#d0808a', '#f0aab0', '#ffd4d8'),

  // VFX
  fx_white: ramp('#6a7090', '#a8b4d8', '#d8e2ff', '#f4f8ff', '#ffffff'),
  fx_heal: ramp('#0e4a2a', '#1e8a4a', '#3ec46a', '#7af09a', '#d4ffe0'),
  fx_gold: ramp('#5a3a08', '#a06a10', '#e0a020', '#ffd84a', '#fff6c0'),
  fx_red: ramp('#4a0a0a', '#8a1a14', '#d03a20', '#ff7a3a', '#ffd0a0'),
};

export type RampName = keyof typeof R;

/** Swap a key ramp for another (used for hair/skin/eye customisation). */
export function rampSwap(from: Ramp, to: Ramp): Map<string, RGBA> {
  const m = new Map<string, RGBA>();
  for (const k of ['o', 'd', 's', 'b', 'l'] as const) m.set(from[k].slice(0, 3).join(','), to[k]);
  return m;
}
