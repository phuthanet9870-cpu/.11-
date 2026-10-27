// Versioned save format with forward migrations. Single-player builds persist
// to localStorage; the same SaveFile shape is what the Phase 3 server stores.
import type { GameData } from './data';
import type { CharacterState, SaveFile, Settings } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'veyloria.save';

export const DEFAULT_KEYBINDS: Record<string, string> = {
  hotbar1: '1', hotbar2: '2', hotbar3: '3', hotbar4: '4', hotbar5: '5',
  hotbar6: '6', hotbar7: '7', hotbar8: '8', hotbar9: '9', hotbar10: '0',
  inventory: 'i', equipment: 'e', status: 'c', skills: 'k', quests: 'q',
  worldMap: 'm', settings: 'o', database: 'b', pet: 'p', homun: 'h', cart: 'v', runes: 'n', social: 'g', auto: 'u', pickup: 'z', interact: 'f', cancel: 'Escape',
  up: 'w', down: 's', left: 'a', right: 'd',
};

export function defaultSettings(): Settings {
  return {
    volume: { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.5 },
    keybinds: { ...DEFAULT_KEYBINDS },
    showDamageNumbers: true,
    autoLoot: false,
    showCollision: false,
    wasdMovement: true,
  };
}

export function newSaveFile(accountName = 'Local Adventurer'): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    account: { id: `local-${Date.now().toString(36)}`, name: accountName, createdAt: Date.now(), maxSlots: 3 },
    characters: [null, null, null],
    settings: defaultSettings(),
  };
}

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * migrations[n] upgrades a version-n save to version n+1.
 * v0 → v1: early prototype saves had no account block and a single character.
 * v1 → v2: adds hotbar, storage and per-character stats_meta.
 */
const migrations: Record<number, Migration> = {
  0: (s) => {
    const character = s.character as Record<string, unknown> | undefined;
    return {
      version: 1,
      savedAt: s.savedAt ?? Date.now(),
      account: { id: `local-${Date.now().toString(36)}`, name: 'Local Adventurer', createdAt: Date.now(), maxSlots: 3 },
      characters: [character ?? null, null, null],
      settings: s.settings ?? defaultSettings(),
    };
  },
  1: (s) => {
    const chars = (s.characters as (Record<string, unknown> | null)[]).map((c) => {
      if (!c) return null;
      return {
        hotbar: [null, null, null, null, null, null, null, null, null, null],
        storage: [],
        stats_meta: { kills: 0, deaths: 0, playTimeMs: 0, bossKills: {} },
        ...c,
      };
    });
    return { ...s, version: 2, characters: chars };
  },
};

export function migrateSave(raw: unknown): SaveFile {
  if (!raw || typeof raw !== 'object') throw new Error('Corrupt save: not an object');
  let s = raw as Record<string, unknown>;
  let v = typeof s.version === 'number' ? s.version : 0;
  if (v > SAVE_VERSION) throw new Error(`Save version ${v} is newer than this game (${SAVE_VERSION}).`);
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    s = m(s);
    v = s.version as number;
  }
  const save = s as unknown as SaveFile;
  save.settings = { ...defaultSettings(), ...save.settings, keybinds: { ...DEFAULT_KEYBINDS, ...(save.settings?.keybinds ?? {}) } };
  while (save.characters.length < save.account.maxSlots) save.characters.push(null);
  return save;
}

/** Drops references to content that no longer exists so old saves keep loading after data changes. */
export function sanitizeCharacter(data: GameData, c: CharacterState): string[] {
  const warnings: string[] = [];
  if (!data.classes.has(c.classId)) { warnings.push(`unknown class ${c.classId} → novice`); c.classId = 'novice'; }
  const keep = (id: string) => data.items.has(id);
  const beforeInv = c.inventory.length;
  c.inventory = c.inventory.filter((i) => keep(i.itemId) && i.qty > 0);
  c.storage = (c.storage ?? []).filter((i) => keep(i.itemId) && i.qty > 0);
  if (c.inventory.length !== beforeInv) warnings.push('removed unknown inventory items');
  for (const [slot, inst] of Object.entries(c.equipment)) {
    if (inst && !keep(inst.itemId)) { delete c.equipment[slot as keyof typeof c.equipment]; warnings.push(`removed unknown equipment in ${slot}`); }
  }
  for (const id of Object.keys(c.skills)) if (!data.skills.has(id)) delete c.skills[id];
  for (const id of Object.keys(c.quests)) if (!data.quests.has(id)) delete c.quests[id];
  if (!data.maps.has(c.position.mapId)) {
    c.position = { mapId: 'willowbrook', x: 24 * 32 + 16, y: 21 * 32 + 16 };
    warnings.push('unknown map → Willowbrook');
  }
  if (!data.maps.has(c.savePoint.mapId)) c.savePoint = { mapId: 'willowbrook', spawn: 'default' };
  c.luma = Math.max(0, Math.floor(c.luma || 0));
  c.hotbar = (c.hotbar ?? []).slice(0, 10);
  while (c.hotbar.length < 10) c.hotbar.push(null);
  return warnings;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSave(storage: SaveStorage, data: GameData): SaveFile {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return newSaveFile();
  const save = migrateSave(JSON.parse(raw));
  for (const c of save.characters) if (c) sanitizeCharacter(data, c);
  return save;
}

export function writeSave(storage: SaveStorage, save: SaveFile): void {
  save.version = SAVE_VERSION;
  save.savedAt = Date.now();
  const json = JSON.stringify(save);
  // Keep the previous save as a backup in case the new one is corrupted mid-write.
  const prev = storage.getItem(SAVE_KEY);
  if (prev) storage.setItem(`${SAVE_KEY}.backup`, prev);
  storage.setItem(SAVE_KEY, json);
}
