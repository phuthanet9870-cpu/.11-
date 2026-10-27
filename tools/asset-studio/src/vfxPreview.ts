import { writeFileSync } from 'node:fs';
import { BATCH001_VFX, buildVfxSheet } from './vfx';
import { Pixmap } from './pixel';
export function main() {
  const sheets = BATCH001_VFX.map(buildVfxSheet);
  const w = Math.max(...sheets.map((s) => s.pix.w)), h = sheets.reduce((a, s) => a + s.pix.h + 4, 0);
  const out = new Pixmap(w, h); out.rect(0, 0, w, h, [30, 34, 44, 255]);
  let y = 0; for (const s of sheets) { out.blit(s.pix, 0, y); y += s.pix.h + 4; }
  writeFileSync('/tmp/claude-0/vfx.png', out.scale(1).toPNG());
}
