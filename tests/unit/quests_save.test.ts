import { describe, expect, it } from 'vitest';
import { acceptQuest, isQuestAvailable, questEvents, questsOfferedBy, turnInQuest, npcQuestMarker, DAY_MS } from '../../src/core/quests';
import { addItem, countItem } from '../../src/core/inventory';
import { loadSave, migrateSave, newSaveFile, SAVE_KEY, SAVE_VERSION, writeSave, sanitizeCharacter } from '../../src/core/save';
import { data, newChar } from '../helpers/fixtures';

describe('quests', () => {
  it('first quest is offered by Lyra and completes by talking to Seraphine', () => {
    const c = newChar();
    expect(questsOfferedBy(data, c, 'lyra').map((q) => q.id)).toContain('main_awakening');
    expect(npcQuestMarker(data, c, 'lyra')).toBe('!');
    expect(acceptQuest(data, c, 'main_awakening').ok).toBe(true);
    expect(acceptQuest(data, c, 'main_awakening').ok).toBe(false);
    questEvents.talk(data, c, 'seraphine');
    expect(c.quests.main_awakening.status).toBe('ready');
    const potions = countItem(c, 'red_potion');
    const r = turnInQuest(data, c, 'main_awakening', 99999);
    expect(r.ok).toBe(true);
    expect(countItem(c, 'red_potion')).toBe(potions + 5);
    expect(c.quests.main_awakening.status).toBe('completed');
    expect(questsOfferedBy(data, c, 'seraphine').map((q) => q.id)).toContain('main_slimes');
  });

  it('kill objectives count only matching monsters', () => {
    const c = newChar();
    c.quests.main_awakening = { questId: 'main_awakening', status: 'completed', counts: [1], acceptedAt: 0, completedAt: 0 };
    acceptQuest(data, c, 'main_slimes');
    questEvents.kill(data, c, 'horn_rabbit');
    expect(c.quests.main_slimes.counts[0]).toBe(0);
    for (let i = 0; i < 7; i++) questEvents.kill(data, c, 'leaf_slime');
    expect(c.quests.main_slimes.counts[0]).toBe(5);
    expect(c.quests.main_slimes.status).toBe('ready');
  });

  it('deliver objectives consume items atomically on turn-in', () => {
    const c = newChar();
    for (const q of ['main_awakening', 'main_slimes']) c.quests[q] = { questId: q, status: 'completed', counts: [1], acceptedAt: 0, completedAt: 0 };
    acceptQuest(data, c, 'main_garrick');
    addItem(data, c, 'jelly', 3);
    expect(turnInQuest(data, c, 'main_garrick', 99999).ok).toBe(false);
    expect(countItem(c, 'jelly')).toBe(3);
    addItem(data, c, 'jelly', 4);
    expect(turnInQuest(data, c, 'main_garrick', 99999).ok).toBe(true);
    expect(countItem(c, 'jelly')).toBe(2);
    expect(countItem(c, 'wooden_buckler')).toBe(1);
  });

  it('job quests require job level 10 and change class', () => {
    const c = newChar();
    expect(isQuestAvailable(data, c, data.quests.get('job_mage')!)).toBe(false);
    c.jobLevel = 10;
    expect(acceptQuest(data, c, 'job_mage').ok).toBe(true);
    questEvents.interact(data, c, 'astral_obelisk');
    addItem(data, c, 'mushling_cap', 5);
    const r = turnInQuest(data, c, 'job_mage', 99999);
    expect(r.ok).toBe(true);
    expect(r.jobChanged).toBe('mage');
    expect(c.classId).toBe('mage');
    expect(countItem(c, 'apprentice_wand')).toBe(1);
  });

  it('daily quests reset the next day', () => {
    const c = newChar();
    const day0 = 100 * DAY_MS + 1000;
    for (const q of ['main_awakening', 'main_slimes']) c.quests[q] = { questId: q, status: 'completed', counts: [1], acceptedAt: 0, completedAt: 0 };
    expect(acceptQuest(data, c, 'daily_pest_control', day0).ok).toBe(true);
    for (let i = 0; i < 10; i++) questEvents.kill(data, c, 'leaf_slime');
    expect(turnInQuest(data, c, 'daily_pest_control', 99999, day0).ok).toBe(true);
    expect(acceptQuest(data, c, 'daily_pest_control', day0 + 1000).ok).toBe(false);
    expect(acceptQuest(data, c, 'daily_pest_control', day0 + DAY_MS).ok).toBe(true);
  });
});

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('save / load', () => {
  it('round-trips a character', () => {
    const st = new MemStorage();
    const save = newSaveFile();
    const c = newChar('Saver');
    addItem(data, c, 'jelly', 7);
    c.quests.main_awakening = { questId: 'main_awakening', status: 'active', counts: [0], acceptedAt: 1 };
    save.characters[1] = c;
    writeSave(st, save);
    const loaded = loadSave(st, data);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.characters[1]?.name).toBe('Saver');
    expect(countItem(loaded.characters[1]!, 'jelly')).toBe(7);
    expect(loaded.characters[1]?.quests.main_awakening.status).toBe('active');
    expect(loaded.characters[0]).toBeNull();
  });

  it('migrates a v0 prototype save', () => {
    const c = newChar('Old') as unknown as Record<string, unknown>;
    delete c.hotbar; delete c.storage; delete c.stats_meta;
    const migrated = migrateSave({ character: c, savedAt: 5 });
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.characters[0]?.name).toBe('Old');
    expect(migrated.characters[0]?.hotbar).toHaveLength(10);
    expect(migrated.characters[0]?.storage).toEqual([]);
    expect(migrated.characters).toHaveLength(3);
  });

  it('rejects saves from a newer version and corrupt data', () => {
    expect(() => migrateSave({ version: SAVE_VERSION + 1 })).toThrow();
    expect(() => migrateSave(null)).toThrow();
    const st = new MemStorage();
    st.setItem(SAVE_KEY, '{not json');
    expect(() => loadSave(st, data)).toThrow();
  });

  it('sanitizes references to removed content', () => {
    const c = newChar();
    c.inventory.push({ uid: 'x', itemId: 'removed_item', qty: 1 });
    c.position.mapId = 'gone_map';
    c.luma = -50;
    const warnings = sanitizeCharacter(data, c);
    expect(warnings.length).toBeGreaterThan(0);
    expect(c.inventory.some((i) => i.itemId === 'removed_item')).toBe(false);
    expect(c.position.mapId).toBe('willowbrook');
    expect(c.luma).toBe(0);
  });
});
