import { describe, expect, it } from 'vitest';
import {
  addItem, buyItem, countItem, depositToStorage, equipItem, inventoryWeight, removeItem, sellItem, sortInventory,
  toggleLock, unequipItem, withdrawFromStorage,
} from '../../src/core/inventory';
import { changeJob } from '../../src/core/character';
import { computeDerivedStats } from '../../src/core/formulas';
import { data, newChar } from '../helpers/fixtures';

describe('inventory', () => {
  it('stacks stackable items up to maxStack', () => {
    const c = newChar();
    c.inventory = [];
    expect(addItem(data, c, 'jelly', 500).ok).toBe(true);
    expect(addItem(data, c, 'jelly', 600).ok).toBe(true);
    const stacks = c.inventory.filter((i) => i.itemId === 'jelly');
    expect(stacks.map((s) => s.qty).sort((a, b) => b - a)).toEqual([999, 101]);
    expect(countItem(c, 'jelly')).toBe(1100);
  });

  it('enforces slot limit atomically', () => {
    const c = newChar();
    c.inventory = [];
    for (let i = 0; i < data.balance.economy.inventorySlots; i++) addItem(data, c, 'bandana', 1);
    const before = JSON.stringify(c.inventory);
    expect(addItem(data, c, 'jelly', 1).ok).toBe(false);
    expect(JSON.stringify(c.inventory)).toBe(before);
  });

  it('enforces weight limit', () => {
    const c = newChar();
    expect(addItem(data, c, 'old_bone', 5000, { weightLimit: 100 }).ok).toBe(false);
    expect(inventoryWeight(data, c)).toBeGreaterThan(0);
  });

  it('removes exact counts or fails without change', () => {
    const c = newChar();
    addItem(data, c, 'jelly', 5);
    expect(removeItem(c, 'jelly', 6).ok).toBe(false);
    expect(countItem(c, 'jelly')).toBe(5);
    expect(removeItem(c, 'jelly', 5).ok).toBe(true);
    expect(countItem(c, 'jelly')).toBe(0);
  });

  it('sorts and merges stacks', () => {
    const c = newChar();
    c.inventory = [{ uid: 'a', itemId: 'jelly', qty: 3 }, { uid: 'b', itemId: 'red_potion', qty: 1 }, { uid: 'c', itemId: 'jelly', qty: 4 }];
    sortInventory(data, c, 'name');
    expect(c.inventory.map((i) => `${i.itemId}:${i.qty}`)).toEqual(['jelly:7', 'red_potion:1']);
  });
});

describe('equipment', () => {
  it('applies equipment bonuses to derived stats', () => {
    const c = newChar();
    const before = computeDerivedStats(data, c);
    addItem(data, c, 'copper_ring', 1);
    const ring = c.inventory.find((i) => i.itemId === 'copper_ring')!;
    expect(equipItem(data, c, ring.uid).ok).toBe(true);
    const after = computeDerivedStats(data, c);
    expect(after.totalStats.str).toBe(before.totalStats.str + 1);
    expect(unequipItem(data, c, 'accessory1').ok).toBe(true);
    expect(computeDerivedStats(data, c).totalStats.str).toBe(before.totalStats.str);
  });

  it('enforces class and level requirements', () => {
    const c = newChar();
    addItem(data, c, 'iron_sword', 1);
    const sword = c.inventory.find((i) => i.itemId === 'iron_sword')!;
    expect(equipItem(data, c, sword.uid).ok).toBe(false); // novice
    c.jobLevel = 10;
    changeJob(data, c, 'knight');
    expect(equipItem(data, c, sword.uid).ok).toBe(false); // level 8 required
    c.baseLevel = 8;
    expect(equipItem(data, c, sword.uid).ok).toBe(true);
    expect(c.equipment.weapon?.itemId).toBe('iron_sword');
    expect(c.inventory.some((i) => i.itemId === 'training_knife')).toBe(true);
  });

  it('two-handed weapons remove the shield', () => {
    const c = newChar();
    c.jobLevel = 10; changeJob(data, c, 'knight'); c.baseLevel = 20;
    addItem(data, c, 'wooden_buckler', 1);
    addItem(data, c, 'knight_spear', 1);
    equipItem(data, c, c.inventory.find((i) => i.itemId === 'wooden_buckler')!.uid);
    expect(c.equipment.shield).toBeTruthy();
    equipItem(data, c, c.inventory.find((i) => i.itemId === 'knight_spear')!.uid);
    expect(c.equipment.weapon?.itemId).toBe('knight_spear');
    expect(c.equipment.shield).toBeUndefined();
  });

  it('accessories fill both slots', () => {
    const c = newChar();
    addItem(data, c, 'copper_ring', 2);
    for (const r of c.inventory.filter((i) => i.itemId === 'copper_ring')) equipItem(data, c, r.uid);
    expect(c.equipment.accessory1?.itemId).toBe('copper_ring');
    expect(c.equipment.accessory2?.itemId).toBe('copper_ring');
  });
});

describe('shop & storage', () => {
  it('buys with luma, never going negative', () => {
    const c = newChar();
    c.luma = 100;
    expect(buyItem(data, c, 'pip_tools', 'red_potion', 4, 9999).ok).toBe(true);
    expect(c.luma).toBe(0);
    expect(buyItem(data, c, 'pip_tools', 'red_potion', 1, 9999).ok).toBe(false);
    expect(c.luma).toBe(0);
    expect(buyItem(data, c, 'pip_tools', 'iron_sword', 1, 9999).ok).toBe(false); // not sold there
    expect(buyItem(data, c, 'pip_tools', 'red_potion', -5, 9999).ok).toBe(false);
    expect(buyItem(data, c, 'pip_tools', 'red_potion', 1.5, 9999).ok).toBe(false);
  });

  it('sells for half price, refuses bound or locked items', () => {
    const c = newChar();
    c.luma = 0;
    addItem(data, c, 'jelly', 10);
    const j = c.inventory.find((i) => i.itemId === 'jelly')!;
    expect(sellItem(data, c, j.uid, 10).ok).toBe(true);
    expect(c.luma).toBe(30);
    addItem(data, c, 'lost_pendant', 1);
    const p = c.inventory.find((i) => i.itemId === 'lost_pendant')!;
    expect(sellItem(data, c, p.uid, 1).ok).toBe(false);
    addItem(data, c, 'rabbit_horn', 2);
    const h = c.inventory.find((i) => i.itemId === 'rabbit_horn')!;
    toggleLock(c, h.uid);
    expect(sellItem(data, c, h.uid, 1).ok).toBe(false);
    expect(sellItem(data, c, h.uid, 99).ok).toBe(false);
  });

  it('deposits and withdraws without duplication', () => {
    const c = newChar();
    c.luma = 1000;
    addItem(data, c, 'jelly', 10);
    const j = c.inventory.find((i) => i.itemId === 'jelly')!;
    expect(depositToStorage(data, c, j.uid, 4).ok).toBe(true);
    expect(countItem(c, 'jelly')).toBe(6);
    expect(c.storage.find((i) => i.itemId === 'jelly')?.qty).toBe(4);
    const s = c.storage.find((i) => i.itemId === 'jelly')!;
    expect(withdrawFromStorage(data, c, s.uid, 5, 99999).ok).toBe(false);
    expect(withdrawFromStorage(data, c, s.uid, 4, 99999).ok).toBe(true);
    expect(countItem(c, 'jelly')).toBe(10);
    expect(c.storage.length).toBe(0);
    expect(c.luma).toBe(1000 - data.balance.economy.storageFee);
  });
});
