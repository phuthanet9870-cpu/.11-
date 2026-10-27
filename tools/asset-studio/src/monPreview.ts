import { writeFileSync } from 'node:fs';
import { BATCH001_MONSTERS, buildMonsterSheets } from './monsters';
import { Pixmap } from './pixel';
export function main(args: string[]) {
  const mon = BATCH001_MONSTERS.find((m) => m.id === args[0])!;
  const sheets = buildMonsterSheets(mon.draw);
  const w = 48 * 8, h = sheets.reduce((s, x) => s + x.sheet.pix.h + 4, 0);
  const out = new Pixmap(w, h);
  out.rect(0, 0, w, h, [92, 110, 84, 255]);
  let y = 0;
  for (const s of sheets) { out.blit(s.sheet.pix, 0, y); y += s.sheet.pix.h + 4; }
  writeFileSync(`/tmp/claude-0/mon_${args[0]}.png`, out.scale(2).toPNG());
}
