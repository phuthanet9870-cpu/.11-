import { describe, expect, it } from 'vitest';
import classes from '../../src/data/classes.json';
import { shadowDesign } from '../../src/game/art/shadowSprite';

const list = (Array.isArray(classes) ? classes : (classes as { classes: { id: string }[] }).classes) as { id: string }[];

describe('shadow character designs', () => {
  it('every job has its own shadow design', () => {
    const novice = JSON.stringify(shadowDesign('novice'));
    for (const c of list) {
      const d = shadowDesign(c.id);
      expect(d.glow).toMatch(/^#[0-9a-f]{6}$/);
      if (c.id !== 'novice') expect(JSON.stringify(d), c.id).not.toBe(novice);
    }
  });
  it('transcendent jobs add trim, third jobs add an aura', () => {
    expect(shadowDesign('high_knight').trim).toBe(true);
    expect(shadowDesign('dragon_lord').aura).toBe(true);
    expect(shadowDesign('dragon_lord').wings).toBe(true);
  });
});
