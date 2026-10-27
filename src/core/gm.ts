// GM / admin commands. They run on the local World and change the local save only.
// When the game moves to an authoritative server (Phase 3), these must become
// server-side commands behind an admin role. A client must never be trusted with them.
// Every command marks the character with flags.gmUsed so edited saves are identifiable.
import type { World } from './world';
import { TILE } from './mapCompiler';
import { expToNextBase, expToNextJob } from './formulas';
import { objectiveTarget, refreshQuest } from './quests';
import type { OpResult } from './inventory';
import type { StatKey } from './types';

const ok = (message: string): OpResult => ({ ok: true, message });
const fail = (error: string): OpResult => ({ ok: false, error });

function mark(w: World, message: string): OpResult {
  w.char.flags.gmUsed = true;
  w.message(`[GM] ${message}`, 'system');
  return ok(message);
}

export function gmHeal(w: World): OpResult {
  if (w.player.dead) w.respawn();
  w.char.hp = w.stats.maxHp; w.char.mp = w.stats.maxMp; w.player.hp = w.char.hp;
  w.cureStatuses(w.player, [...new Set(w.player.statuses.map((s) => s.id))]);
  w.emit({ type: 'fx', fx: 'heal', x: w.player.x, y: w.player.y, targetId: 'player', offsetY: 0 });
  return mark(w, 'HP / MP fully restored.');
}

export function gmGodMode(w: World, on: boolean): OpResult {
  w.godMode = on;
  return mark(w, `God mode ${on ? 'ON' : 'OFF'}.`);
}

/** Levels up through the normal EXP path, so stat/skill points and level-up effects apply. */
export function gmAddLevels(w: World, base: number, job: number): OpResult {
  const c = w.char;
  const b0 = c.baseLevel, j0 = c.jobLevel;
  for (let i = 0; i < base; i++) w.grantExp(Math.max(1, expToNextBase(w.data, c.baseLevel) - c.baseExp), 0);
  for (let i = 0; i < job; i++) w.grantExp(0, Math.max(1, expToNextJob(w.data, c.jobLevel) - c.jobExp));
  return mark(w, `Base Lv ${b0} → ${c.baseLevel}, Job Lv ${j0} → ${c.jobLevel}.`);
}

export function gmGiveLuma(w: World, amount: number): OpResult {
  if (!Number.isFinite(amount) || amount === 0) return fail('Enter an amount.');
  w.char.luma = Math.max(0, w.char.luma + Math.trunc(amount));
  w.emit({ type: 'statsChanged' });
  return mark(w, `Luma ${amount > 0 ? '+' : ''}${Math.trunc(amount)} (now ${w.char.luma}).`);
}

export function gmGiveItem(w: World, itemId: string, qty: number): OpResult {
  const def = w.data.items.get(itemId);
  if (!def) return fail(`Unknown item ${itemId}.`);
  qty = Math.max(1, Math.min(999, Math.trunc(qty) || 1));
  w.giveItem(itemId, qty, 'GM');
  return mark(w, `Gave ${qty}× ${def.name}.`);
}

export function gmGivePoints(w: World, stat: number, skill: number): OpResult {
  w.char.statPoints += Math.max(0, Math.trunc(stat));
  w.char.skillPoints += Math.max(0, Math.trunc(skill));
  w.emit({ type: 'statsChanged' });
  return mark(w, `+${stat} stat points, +${skill} skill points.`);
}

export function gmSetStat(w: World, stat: StatKey, value: number): OpResult {
  w.char.stats[stat] = Math.max(1, Math.min(999, Math.trunc(value)));
  w.recomputeStats();
  return mark(w, `${stat.toUpperCase()} set to ${w.char.stats[stat]}.`);
}

export function gmTeleport(w: World, mapId: string, spawn = 'default'): OpResult {
  const def = w.data.maps.get(mapId);
  if (!def) return fail(`Unknown map ${mapId}.`);
  if (!def.spawnPoints[spawn]) spawn = Object.keys(def.spawnPoints)[0];
  w.enterMap(mapId, spawn);
  return mark(w, `Teleported to ${def.name}.`);
}

/** Spawns monsters in a ring around the player; they do not respawn. */
export function gmSpawn(w: World, monsterId: string, count: number): OpResult {
  const def = w.data.monsters.get(monsterId);
  if (!def) return fail(`Unknown monster ${monsterId}.`);
  count = Math.max(1, Math.min(20, Math.trunc(count) || 1));
  const p = w.player;
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    for (const r of [72, 104, 136, 48]) {
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= w.map.width || ty >= w.map.height || w.map.collision[ty * w.map.width + tx]) continue;
      if (w.spawnMonsterAt(monsterId, x, y)) { placed++; break; }
    }
  }
  return placed ? mark(w, `Spawned ${placed}× ${def.name}.`) : fail('No free ground near you to spawn on.');
}

/** Defeats every living monster on the map (rewards and quest progress apply). */
export function gmKillAll(w: World, includeBoss = false): OpResult {
  let n = 0;
  for (const m of [...w.monsters.values()]) {
    if (m.dead || (m.boss && !includeBoss)) continue;
    m.damageBy.player = (m.damageBy.player ?? 0) + m.hp;
    w.damageMonster(m, m.hp, 'physical', 'neutral', false, false, true);
    n++;
  }
  return mark(w, `Defeated ${n} monster${n === 1 ? '' : 's'}.`);
}

/** Switches class without requirements (job level resets to 1, as with a normal job change). */
export function gmSetClass(w: World, classId: string): OpResult {
  const cls = w.data.classes.get(classId);
  if (!cls) return fail(`Unknown class ${classId}.`);
  const c = w.char;
  if (c.classId === classId) return fail(`Already a ${cls.name}.`);
  c.classId = classId;
  c.classHistory.push(classId);
  c.jobLevel = 1; c.jobExp = 0;
  w.recomputeStats();
  w.emit({ type: 'jobChanged', classId });
  w.emit({ type: 'fx', fx: 'job_change', x: w.player.x, y: w.player.y });
  return mark(w, `Class changed to ${cls.name}.`);
}

/** Fills a quest's objectives (giving collect items) so it can be turned in, or resets it. */
export function gmQuest(w: World, questId: string, action: 'complete' | 'reset'): OpResult {
  const def = w.data.quests.get(questId);
  if (!def) return fail(`Unknown quest ${questId}.`);
  const c = w.char;
  if (action === 'reset') {
    delete c.quests[questId];
    return mark(w, `Quest "${def.name}" reset.`);
  }
  const prog = c.quests[questId] ??= { questId, status: 'active', counts: def.objectives.map(() => 0), acceptedAt: Date.now() };
  if (prog.status === 'completed') return fail(`"${def.name}" is already completed.`);
  def.objectives.forEach((o, i) => {
    if (o.type === 'collect' || o.type === 'deliver') {
      const have = c.inventory.filter((it) => it.itemId === o.itemId).reduce((a, it) => a + it.qty, 0);
      if (have < o.count) w.giveItem(o.itemId, o.count - have, 'GM');
    }
    prog.counts[i] = objectiveTarget(o);
  });
  refreshQuest(w.data, c, questId);
  return mark(w, `Quest "${def.name}" objectives filled — turn it in at the NPC.`);
}
