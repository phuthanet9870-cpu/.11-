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
  const a = anims.find((x) => x.def.name === (args[1] ?? 'idle'))!;
  const f = Number(args[2] ?? 0);
  const out = new Pixmap(48 * 4 + 12, 64);
  out.rect(0, 0, out.w, out.h, [92, 110, 84, 255]);
  for (let r = 0; r < 4; r++) out.blit(a.composite.cell(f, r), r * 51, 0);
  writeFileSync('/tmp/claude-0/zoom.png', out.scale(5).toPNG());
}
