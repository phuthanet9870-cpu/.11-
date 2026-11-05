// What an NPC does, read from its services: used for its shadow-style look and the role badge
// over its head, so players can tell at a glance who sells, refines, heals, warps or teaches jobs.
import type { NpcDef } from '../../core/types';

export type NpcRole = 'job' | 'smith' | 'shop' | 'inn' | 'courier' | 'warp' | 'market' | 'trader' | 'storage' | 'enchant' | 'stable' | 'dungeon' | 'arena' | 'mvp' | 'reset' | 'runes' | 'townsfolk';

export interface RoleInfo { role: NpcRole; emoji: string; label: string; color: string; jobClass?: string }

const INFO: Record<NpcRole, Omit<RoleInfo, 'role'>> = {
  job: { emoji: '🎓', label: 'Job Master', color: '#ffd34d' },
  smith: { emoji: '⚒', label: 'Blacksmith', color: '#ff9a4a' },
  shop: { emoji: '🛒', label: 'Shop', color: '#ffe27a' },
  inn: { emoji: '🛏', label: 'Inn', color: '#ffb0a0' },
  courier: { emoji: '🌀', label: 'Courier · Storage', color: '#7fd6ff' },
  warp: { emoji: '🌀', label: 'Warp', color: '#7fd6ff' },
  market: { emoji: '⚖', label: 'Market Hall', color: '#ffd34d' },
  trader: { emoji: '💰', label: 'Trader', color: '#ffd34d' },
  storage: { emoji: '📦', label: 'Storage', color: '#c8a26b' },
  enchant: { emoji: '✨', label: 'Enchanter', color: '#c9a6ff' },
  stable: { emoji: '🐎', label: 'Stable', color: '#c8a060' },
  dungeon: { emoji: '🏯', label: 'Dungeon Keeper', color: '#ff8a7a' },
  arena: { emoji: '⚔', label: 'Arena', color: '#ff8a8a' },
  mvp: { emoji: '☠', label: 'MVP', color: '#ff5a5a' },
  reset: { emoji: '♻', label: 'Reset', color: '#9fe8ff' },
  runes: { emoji: '⭐', label: 'Runes', color: '#c9a6ff' },
  townsfolk: { emoji: '💬', label: 'Townsfolk', color: '#e8e4d8' },
};

export function npcRole(def: Pick<NpcDef, 'id' | 'services'>): RoleInfo {
  const t = new Set(def.services.map((s) => s.type));
  const job = def.services.find((s) => s.type === 'jobChange') as { classIds: string[] } | undefined;
  let role: NpcRole = 'townsfolk';
  if (/mvp/.test(def.id)) role = 'mvp';
  else if (t.has('shadowArena') || /arena|training/.test(def.id)) role = 'arena';
  else if (job) role = 'job';
  else if (t.has('refine') || t.has('forge')) role = 'smith';
  else if (t.has('heal')) role = 'inn';
  else if (t.has('warp') && t.has('storage')) role = 'courier';
  else if (t.has('warp')) role = 'warp';
  else if (t.has('market')) role = 'market';
  else if (t.has('trader')) role = 'trader';
  else if (t.has('shop')) role = 'shop';
  else if (t.has('storage')) role = 'storage';
  else if (t.has('enchant')) role = 'enchant';
  else if (t.has('stable')) role = 'stable';
  else if (t.has('instance')) role = 'dungeon';
  else if (t.has('resetStats') || t.has('resetSkills')) role = 'reset';
  else if (t.has('runeReset')) role = 'runes';
  return { role, ...INFO[role], ...(job ? { jobClass: job.classIds[job.classIds.length - 1] } : {}) };
}
