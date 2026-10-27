// Builds per-animation, per-layer sprite sheets for a humanoid character.
import { composite, FH, FW, renderFrame, VIEWS, type CharacterSpec, type FrameMeta, type View } from './humanoid';
import { HUMANOID_ANIMS, type AnimDef } from './humanoidAnims';
import { Sheet } from './pixel';

export const LAYERS = ['hairBack', 'weaponUnder', 'body', 'hairFront', 'weaponOver'] as const;
export type LayerName = (typeof LAYERS)[number];

export interface BuiltAnim {
  def: AnimDef;
  layers: Record<LayerName, Sheet>;
  composite: Sheet;
  meta: FrameMeta[][]; // [row][frame]
}

export function buildCharacterAnims(spec: CharacterSpec, bodyType: 'a' | 'b' = 'a', anims = HUMANOID_ANIMS): BuiltAnim[] {
  return anims.map((def) => {
    const layers = Object.fromEntries(LAYERS.map((n) => [n, new Sheet(FW, FH, def.frames, 4)])) as Record<LayerName, Sheet>;
    const comp = new Sheet(FW, FH, def.frames, 4);
    const meta: FrameMeta[][] = [];
    VIEWS.forEach((view: View, row) => {
      meta[row] = [];
      for (let f = 0; f < def.frames; f++) {
        const pose = { ...def.pose(f), bodyType };
        const { layers: l, meta: m } = renderFrame(view, pose, spec);
        for (const n of LAYERS) layers[n].put(f, row, l[n]);
        comp.put(f, row, composite(l));
        meta[row].push(m);
      }
    });
    return { def, layers, composite: comp, meta };
  });
}
