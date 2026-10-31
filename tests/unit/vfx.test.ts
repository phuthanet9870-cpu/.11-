import { describe, expect, it } from 'vitest';
import skills from '../../src/data/skills.json';
import { parseStep, skillVfx, SKILL_VFX_IDS } from '../../src/game/render/vfxRecipes';

const list = (Array.isArray(skills) ? skills : (skills as { skills: unknown[] }).skills) as { id: string; fx: string; kind: string; targeting: string }[];

describe('skill VFX recipes', () => {
  it('every active skill has its own recipe', () => {
    for (const s of list) {
      if (s.kind === 'passive') { expect(skillVfx(s as never), s.id).toBeNull(); continue; }
      expect(SKILL_VFX_IDS, s.id).toContain(s.id);
      const v = skillVfx(s as never)!;
      expect(v.cast.length + v.hit.length + (v.proj ? 1 : 0), s.id).toBeGreaterThan(0);
    }
  });
  it('recipes only name existing skills', () => {
    const ids = new Set(list.map((s) => s.id));
    for (const id of SKILL_VFX_IDS) expect(ids.has(id), id).toBe(true);
  });
  it('parses step modifiers', () => {
    expect(parseStep('arrow@area*14~40^>hit')).toMatchObject({ s: 'arrow', at: 'area', n: 14, stag: 40, fall: true, then: 'hit' });
    expect(parseStep('circle@target_=1200#ff6a2e')).toMatchObject({ under: true, ms: 1200, c: '#ff6a2e' });
    expect(() => parseStep('nope@self')).toThrow();
  });
});

describe('step numbers', () => {
  it('delay and scale next to each other', () => {
    expect(parseStep('explode@target+250x0.8')).toMatchObject({ d: 250, sc: 0.8 });
    expect(parseStep('meteor@area*6~150^>explode')).toMatchObject({ then: 'explode', n: 6 });
  });
});
