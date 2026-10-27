import { writeFileSync } from 'node:fs';
import { composite, renderFrame, VIEWS, weaponSprite, HAIR_STYLES, POSE0 } from './humanoid';
import { R } from './palette';
import { Pixmap } from './pixel';
export function main() {
  const out = new Pixmap(52 * 8, 66 * 5);
  out.rect(0, 0, out.w, out.h, [92, 110, 84, 255]);
  HAIR_STYLES.forEach((hair, r) => {
    (['a', 'b'] as const).forEach((bt, bi) => VIEWS.forEach((v, c) => {
      const { layers } = renderFrame(v, { ...POSE0, bodyType: bt }, { outfit: { tunic: R.linen, pants: R.cloth_brown, boots: R.leather, belt: R.leather, buckle: R.brass, collar: R.linen, bag: R.satchel, sleeves: 'short' }, hair, weapon: weaponSprite('dagger') });
      out.blit(composite(layers), (bi * 4 + c) * 52, r * 66);
    }));
  });
  writeFileSync('/tmp/claude-0/variants.png', out.scale(3).toPNG());
}
