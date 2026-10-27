import { describe, expect, it } from 'vitest';
import { addItem } from '../../src/core/inventory';
import { enchantAdd, enchantReroll, MAX_OPTIONS, OPTIONS, rollDropOptions, rollOption } from '../../src/core/options';
import { computeDerivedStats } from '../../src/core/formulas';
import { Rng } from '../../src/core/rng';
import { data, newChar, newWorld } from '../helpers/fixtures';

describe('random options (affixes)', () => {
  it('drop rolls give 0–3 options with roughly the configured distribution and no duplicate keys', () => {
    const rng = new Rng(3), def = data.items.get('iron_sword')!;
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      const o = rollDropOptions(def, () => rng.next());
      counts[o.length]++;
      expect(new Set(o.map((x) => x.key)).size).toBe(o.length);
    }
    expect(counts[0] / 4000).toBeGreaterThan(0.55);
    expect(counts[3] / 4000).toBeLessThan(0.07);
  });

  it('weapons only roll weapon/any options, armor only armor/any', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 300; i++) {
      const w = rollOption(data.items.get('iron_sword')!, [], () => rng.next());
      expect(OPTIONS.find((o) => o.key === w.key)!.pool).not.toBe('armor');
      const a = rollOption(data.items.get('chain_mail')!, [], () => rng.next());
      expect(OPTIONS.find((o) => o.key === a.key)!.pool).not.toBe('weapon');
    }
  });

  it('options add stats when worn; enchanter adds up to the cap and rerolls', () => {
    const c = newChar(); c.luma = 1_000_000;
    addItem(data, c, 'chain_mail', 1);
    const mail = c.inventory.find((i) => i.itemId === 'chain_mail')!;
    mail.options = [{ key: 'vit', value: 3 }, { key: 'elementResistPct.fire', value: 10 }];
    c.equipment.armor = mail; const d = computeDerivedStats(data, c);
    expect(d.totalStats.vit).toBe(c.stats.vit + 3);
    expect(d.elementResistPct.fire).toBe(10);
    delete c.equipment.armor;
    const rng = new Rng(1);
    expect(enchantAdd(data, c, mail.uid, () => rng.next()).ok).toBe(true);
    expect(mail.options).toHaveLength(MAX_OPTIONS);
    expect(enchantAdd(data, c, mail.uid, () => rng.next()).ok).toBe(false);
    const before = JSON.stringify(mail.options);
    expect(enchantReroll(data, c, mail.uid, () => rng.next()).ok).toBe(true);
    expect(mail.options).toHaveLength(MAX_OPTIONS);
    expect(JSON.stringify(mail.options)).not.toBe(before);
  });

  it('on-hit status and HP drain procs fire on basic attacks', () => {
    const w = newWorld();
    w.enterMap('sunny_meadow', 'default');
    addItem(data, w.char, 'oak_club', 1);
    const club = w.char.inventory.find((i) => i.itemId === 'oak_club')!;
    club.options = [{ key: 'onHitStatusPct.stun', value: 100 }, { key: 'hpDrainPct', value: 3 }];
    expect(w.equip(club.uid).ok).toBe(true);
    w.char.hp = 10;
    const m = [...w.monsters.values()].find((x) => x.def.id === 'mushling')!;
    m.hp = m.maxHp = 100000;
    w.player.x = m.x + 30; w.player.y = m.y;
    w.attack(m.id);
    for (let t = 0; t < 4000 && !m.statuses.some((s) => s.id === 'stun'); t += 50) w.update(50);
    expect(m.statuses.some((s) => s.id === 'stun')).toBe(true);
    expect(w.char.hp).toBeGreaterThan(10);
  });
});
