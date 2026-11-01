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
    for (const id of SKILL_VFX_IDS) if (!id.startsWith('boss:')) expect(ids.has(id), id).toBe(true);
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

import { MOTIF_NAMES, SIGNATURES } from '../../src/game/render/vfxSignature';

describe('signature effects', () => {
  const full = (skills as unknown as { skills?: unknown[] }).skills ?? (skills as unknown[]);
  const active = (full as { id: string; kind: string; icon: { color: string } }[]).filter((s) => s.kind !== 'passive');
  it('every active skill has its own signature, and no two are the same', () => {
    const seen = new Map<string, string>();
    for (const s of active) {
      const sig = SIGNATURES[s.id];
      expect(sig, s.id).toBeDefined();
      expect(MOTIF_NAMES, s.id).toContain(sig.m);
      const key = `${sig.m}|${sig.n}|${sig.v}|${sig.c2}|${s.icon.color}`;
      expect(seen.get(key), `${s.id} looks like ${seen.get(key)}`).toBeUndefined();
      seen.set(key, s.id);
    }
    expect(Object.keys(SIGNATURES).filter((k) => !k.startsWith('boss:')).length).toBe(active.length);
    // MVP boss skills: one signature each, none the same as another boss skill or any player skill.
    const bossKeys = Object.keys(SIGNATURES).filter((k) => k.startsWith('boss:'));
    expect(bossKeys.length).toBe(30);
    const shapes = new Set(Object.values(SIGNATURES).map((g) => `${g.m}|${g.n}|${g.v}`));
    expect(shapes.size).toBe(Object.keys(SIGNATURES).length);
  });
  it('uses many different motifs', () => {
    expect(new Set(Object.values(SIGNATURES).map((s) => s.m)).size).toBeGreaterThanOrEqual(35);
  });
});
