import { describe, expect, it } from 'vitest';
import { acceptQuest, isQuestAvailable, questEvents, questsOfferedBy, turnInQuest, npcQuestMarker, DAY_MS } from '../../src/core/quests';
import { addItem, countItem } from '../../src/core/inventory';
import { loadSave, migrateSave, newSaveFile, SAVE_KEY, SAVE_VERSION, writeSave, sanitizeCharacter } from '../../src/core/save';
import { data, newChar } from '../helpers/fixtures';

describe('tutorial quests', () => {
  const done = (c: ReturnType<typeof newChar>, ...ids: string[]) => { for (const q of ids) c.quests[q] = { questId: q, status: 'completed', counts: [1, 1], acceptedAt: 0, completedAt: 0 }; };

  it('only tutorial quests exist, as one chain', () => {
    expect([...data.quests.values()].every((q) => q.category === 'tutorial')).toBe(true);
    expect([...data.quests.keys()]).toEqual(['tut_welcome', 'tut_hunt', 'tut_weapon', 'tut_refine', 'tut_path']);
  });

  it('welcome: offered by Lyra, completed by talking to Seraphine', () => {
    const c = newChar();
    expect(questsOfferedBy(data, c, 'lyra').map((q) => q.id)).toEqual(['tut_welcome']);
    expect(npcQuestMarker(data, c, 'lyra')).toBe('!');
    expect(acceptQuest(data, c, 'tut_welcome').ok).toBe(true);
    expect(acceptQuest(data, c, 'tut_welcome').ok).toBe(false);
    questEvents.talk(data, c, 'seraphine');
    expect(c.quests.tut_welcome.status).toBe('ready');
    const potions = countItem(c, 'red_potion');
    expect(turnInQuest(data, c, 'tut_welcome', 99999).ok).toBe(true);
    expect(countItem(c, 'red_potion')).toBe(potions + 10);
    expect(questsOfferedBy(data, c, 'seraphine').map((q) => q.id)).toContain('tut_hunt');
  });

  it('hunt: counts only Leaf Slimes', () => {
    const c = newChar();
    done(c, 'tut_welcome');
    acceptQuest(data, c, 'tut_hunt');
    questEvents.kill(data, c, 'horn_rabbit');
    expect(c.quests.tut_hunt.counts[0]).toBe(0);
    for (let i = 0; i < 7; i++) questEvents.kill(data, c, 'leaf_slime');
    expect(c.quests.tut_hunt.counts[0]).toBe(5);
    expect(c.quests.tut_hunt.status).toBe('ready');
  });

  it('weapon: buying armor does not count, buying and equipping a weapon does', () => {
    const c = newChar();
    done(c, 'tut_welcome', 'tut_hunt');
    acceptQuest(data, c, 'tut_weapon');
    questEvents.buy(data, c, 'cotton_shirt');
    expect(c.quests.tut_weapon.counts[0]).toBe(0);
    questEvents.buy(data, c, 'oak_club');
    questEvents.equip(data, c, 'weapon');
    expect(c.quests.tut_weapon.status).toBe('ready');
    const ore = countItem(c, 'glimmer_ore');
    expect(turnInQuest(data, c, 'tut_weapon', 99999).ok).toBe(true);
    expect(countItem(c, 'glimmer_ore')).toBe(ore + 3);
  });

  it('refine: a +1 refine completes it; path needs Job Lv 10', () => {
    const c = newChar();
    done(c, 'tut_welcome', 'tut_hunt', 'tut_weapon');
    acceptQuest(data, c, 'tut_refine');
    questEvents.refine(data, c, 1);
    expect(c.quests.tut_refine.status).toBe('ready');
    turnInQuest(data, c, 'tut_refine', 99999);
    expect(acceptQuest(data, c, 'tut_path').ok).toBe(true);
    expect(isQuestAvailable(data, c, data.quests.get('tut_path')!)).toBe(false);
    expect(turnInQuest(data, c, 'tut_path', 99999).ok).toBe(false);
    c.jobLevel = 10;
    expect(turnInQuest(data, c, 'tut_path', 99999).ok).toBe(true);
  });

  it('job change is an NPC service, not a quest reward', () => {
    expect([...data.quests.values()].some((q) => q.rewards.jobChange)).toBe(false);
    for (const cls of ['knight', 'ranger', 'mage']) {
      expect([...data.npcs.values()].some((n) => n.services.some((s) => s.type === 'jobChange' && s.classIds.includes(cls)))).toBe(true);
    }
    void DAY_MS; void addItem;
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
    c.quests.tut_welcome = { questId: 'tut_welcome', status: 'active', counts: [0], acceptedAt: 1 };
    save.characters[1] = c;
    writeSave(st, save);
    const loaded = loadSave(st, data);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.characters[1]?.name).toBe('Saver');
    expect(countItem(loaded.characters[1]!, 'jelly')).toBe(7);
    expect(loaded.characters[1]?.quests.tut_welcome.status).toBe('active');
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
