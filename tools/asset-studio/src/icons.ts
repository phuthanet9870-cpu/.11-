// Drop icons (32×32) for Batch 001 monster materials.
import { Mat } from './mat';
import { Pixmap } from './pixel';
import { R } from './palette';

export function dropIcon(id: string): Pixmap {
  const m = new Mat(32, 32);
  if (id === 'jelly') {
    m.ellipse(16, 19, 11, 8, m.id(R.slime, { band2: true }));
    m.ellipse(12, 16, 3, 2, m.id(R.slime, { tone: 'l' }));
    m.ellipse(20, 9, 4, 2, m.id(R.leaf));
  } else if (id === 'mushling_cap') {
    m.ellipse(16, 15, 12, 7, m.id(R.mush_cap, { band2: true }));
    m.rect(5, 15, 23, 3, m.id(R.mush_cap, { band2: true }));
    for (const [x, y, r] of [[10, 13, 2], [17, 10, 2.5], [23, 14, 1.6]] as const) m.ellipse(x, y, r, r * 0.8, m.id(R.mush_stem, { tone: 'l' }));
    m.rect(12, 18, 8, 9, m.id(R.mush_stem, { band2: true }));
  } else if (id === 'rabbit_horn') {
    const horn = m.id(R.horn, { band2: true });
    m.limb(9, 26, 22, 6, 3, horn);
    const ridge = m.id(R.horn, { tone: 's' });
    for (let i = 0; i < 4; i++) m.line(10 + i * 3, 21 - i * 4, 14 + i * 3, 23 - i * 4, ridge);
  }
  return m.render(true);
}
