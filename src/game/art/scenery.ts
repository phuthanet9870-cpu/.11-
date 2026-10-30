// Large painted map pieces (MapDef.scenery): city walls, gates and castles.
import type { CompiledMap } from '../../core/mapCompiler';
import type { SceneryDef } from '../../core/types';
import { LANDMARK_STYLE } from './mapPainter';
import { architectureTheme, extraSprite } from './themeArt';

/** Image path of a scenery piece; walls, gates and castles use the map's architecture theme. */
export function sceneryPath(s: SceneryDef, tileset: string): string | null {
  const theme = architectureTheme(tileset);
  switch (s.kind) {
    case 'city_wall': return `arch/${theme}/wall`;
    case 'city_gate': return `arch/${theme}/gate`;
    case 'castle': return `arch/${theme}/castle`;
    default: return null;
  }
}

export const scenerySprite = (s: SceneryDef, tileset: string) => {
  const p = sceneryPath(s, tileset);
  return p ? extraSprite(p) : null;
};

/** Images a map needs beyond its tileset's own sheets (landmark buildings, painted objects, scenery). */
export function mapArtPaths(map: CompiledMap, artOf: (kind: string) => string | undefined = () => undefined): string[] {
  const out = new Set<string>();
  for (const b of map.buildings) if (LANDMARK_STYLE[b.style]) out.add(LANDMARK_STYLE[b.style]);
  for (const o of map.objects) { const a = artOf(o.kind); if (a) out.add(a); }
  for (const s of map.def.scenery ?? []) { const p = sceneryPath(s, map.def.tileset); if (p) out.add(p); }
  // Ground painted with other tilesets' textures (`sand@desert`) needs those sheets too.
  for (const g of new Set(map.ground)) if (g.includes('@')) out.add(`tiles/${g.slice(g.indexOf('@') + 1)}`);
  return [...out];
}
