import { writeFileSync } from 'node:fs';
import { buildCharacterAnims } from './characterSheets';
import { weaponSprite } from './humanoid';
import { R } from './palette';
import { Pixmap } from './pixel';

export function main(args: string[]) {
  const anims = buildCharacterAnims({
    outfit: { tunic: R.linen, pants: R.cloth_brown, boots: R.leather, belt: R.leather, buckle: R.brass, collar: R.linen, bag: R.satchel, sleeves: 'short' },
    hair: (args[0] as never) ?? 'short', weapon: weaponSprite('dagger'),
  });
  // stack all composite sheets vertically on a mid-grey bg, scaled 4x
  const w = Math.max(...anims.map((a) => a.composite.pix.w)), h = anims.reduce((s, a) => s + a.composite.pix.h + 4, 0);
  const out = new Pixmap(w, h);
  out.rect(0, 0, w, h, [92, 110, 84, 255]);
  let y = 0;
  for (const a of anims) { out.blit(a.composite.pix, 0, y); y += a.composite.pix.h + 4; }
  writeFileSync(args[1] ?? '/tmp/claude-0/novice_preview.png', out.scale(3).toPNG());
}
