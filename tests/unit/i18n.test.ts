import { afterAll, describe, expect, it } from 'vitest';
import { setLang, t } from '../../src/ui/i18n';
import { TH } from '../../src/i18n/th';
import { data } from '../helpers/fixtures';

describe('language switch (English / Thai)', () => {
  afterAll(() => setLang('en'));

  it('English is the default and returns text unchanged', () => {
    expect(t('Inventory')).toBe('Inventory');
  });

  it('translates exact text, patterns with values, and keeps names', () => {
    setLang('th');
    expect(t('Inventory')).toBe('กระเป๋า');
    expect(t('Start Adventure')).toBe('เริ่มการผจญภัย');
    expect(t('Bought 3× Red Potion for 150 Luma.')).toBe('ซื้อ 3× Red Potion ราคา 150 ลูมา');
    expect(t('Quest accepted: Training: First Hunt')).toBe('รับเควส: ฝึกฝน: การล่าครั้งแรก');
    expect(t('  Refine  ')).toBe('  ตีบวก  ');
    expect(t('A Lv 45 dagger.')).toBe('มีดสั้น Lv 45');
    expect(t('Leaf Slime')).toBe('Leaf Slime');
  });

  it('translates joined pieces and leaves unknown text alone', () => {
    setLang('th');
    expect(t('Storage · Shop')).toBe('คลังเก็บของ · ร้านค้า');
    expect(t('zzz unknown text')).toBe('zzz unknown text');
  });

  it('handles built-up lines: numbered options, joined stats, rune rows', () => {
    setLang('th');
    expect(t('1. Goodbye')).toBe('1. ลาก่อน');
    expect(t('[GM] HP / MP fully restored.')).toBe('[GM] ฟื้นฟู HP / MP เต็มแล้ว');
    expect(t('Refine (85%)')).toBe('ตีบวก (85%)');
    expect(t('Leaf Slime Card (card)')).toBe('Leaf Slime Card (การ์ด)');
    expect(t('HIT +12, Attack Speed % +5')).toBe('HIT +12, ความเร็วโจมตี % +5');
    expect(t('MP Regen +2 per rank · after Calm')).toBe('ฟื้น MP +2 ต่อขั้น · หลังจาก Calm');
    expect(t('Weight 1 · Sell 39 Luma')).toBe('น้ำหนัก 1 · ขาย 39 ลูมา');
    expect(t('Dropped by Animated Armor. Merchants pay well for it.')).toBe('ดรอปจาก Animated Armor พ่อค้ารับซื้อในราคาดี');
    expect(t('Lv 9 · neutral 1 · Medium · Looter')).toBe('Lv 9 · ไม่มีธาตุ 1 · กลาง · นักเก็บของ');
  });

  it('covers all quest text, NPC dialogue, class and skill descriptions', () => {
    setLang('th');
    const missing: string[] = [];
    const check = (s?: string) => { if (s && t(s) === s) missing.push(s); };
    for (const q of data.quests.values()) {
      check(q.name); check(q.summary);
      for (const o of q.objectives) check(o.label);
      for (const lines of Object.values(q.dialogue ?? {})) for (const l of lines as string[]) check(l);
    }
    for (const n of data.npcs.values()) { check(n.title); for (const g of n.greeting ?? []) check(g); }
    for (const c of data.classes.values()) { check(c.role); check(c.description); }
    for (const s of data.skills.values()) check(s.description);
    for (const i of data.items.values()) check(i.description);
    expect(missing).toEqual([]);
  });

  it('every Thai entry keeps the same number of {} values', () => {
    for (const [en, th] of Object.entries(TH)) {
      const n = (en.match(/\{\}/g) ?? []).length;
      const m = (th.match(/\{\d*\}/g) ?? []).length;
      expect(`${en} → ${m}`).toBe(`${en} → ${n}`);
    }
  });
});
