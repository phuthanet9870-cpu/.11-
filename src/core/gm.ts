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

// ======================================================================
// Full GM control: every system in the game. All of these mark the save.
// ======================================================================
import { classLineage, rebirth, resetSkills, resetStats } from './character';
import { newUid } from './inventory';
import { newPetState } from './pets';
import { homunStats } from './homunculus';
import { MAX_REFINE } from './refine';
import { OPTIONS } from './options';
import { STAT_KEYS, type Element, type ItemInstance } from './types';

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Set Base / Job level exactly. Going up uses real EXP; going down refunds stats and skills for the new level. */
export function gmSetLevels(w: World, base: number, job: number): OpResult {
  const c = w.char, maxB = w.data.balance.levels.maxBaseLevel, maxJ = w.data.classes.get(c.classId)!.maxJobLevel;
  base = Math.max(1, Math.min(maxB, Math.trunc(base))); job = Math.max(1, Math.min(maxJ, Math.trunc(job)));
  if (base >= c.baseLevel && job >= c.jobLevel) return gmAddLevels(w, base - c.baseLevel, job - c.jobLevel);
  c.baseLevel = base; c.baseExp = 0; c.jobLevel = job; c.jobExp = 0;
  resetStats(w.data, c); resetSkills(w.data, c);
  c.skillPoints = Math.max(0, (job - 1) * w.data.balance.levels.skillPointsPerJobLevel);
  w.recomputeStats();
  return mark(w, `Base Lv ${base}, Job Lv ${job} (stats and skills refunded).`);
}

export function gmSetAllStats(w: World, value: number): OpResult {
  for (const k of STAT_KEYS) w.char.stats[k] = Math.max(1, Math.min(999, Math.trunc(value)));
  w.recomputeStats();
  return mark(w, `All stats set to ${Math.trunc(value)}.`);
}

/** Learn every skill of the current class line at max level (no points needed). */
export function gmMaxSkills(w: World): OpResult {
  const line = classLineage(w.data, w.char.classId);
  let n = 0;
  for (const s of w.data.skills.values()) if (line.includes(s.classId)) { w.char.skills[s.id] = s.maxLevel; n++; }
  w.recomputeStats(); w.emit({ type: 'jobChanged', classId: w.char.classId });
  return mark(w, `${n} skills set to max level.`);
}

export function gmReset(w: World, what: 'stats' | 'skills'): OpResult {
  if (what === 'stats') resetStats(w.data, w.char); else resetSkills(w.data, w.char);
  w.recomputeStats();
  return mark(w, `${what === 'stats' ? 'Stats' : 'Skills'} reset and refunded.`);
}

export function gmSetLuma(w: World, value: number): OpResult {
  w.char.luma = Math.max(0, Math.trunc(value));
  w.emit({ type: 'statsChanged' });
  return mark(w, `Luma set to ${w.char.luma}.`);
}

export function gmSetHpMp(w: World, hpPct: number, mpPct: number): OpResult {
  w.char.hp = Math.max(1, Math.round((w.stats.maxHp * hpPct) / 100)); w.char.mp = Math.max(0, Math.round((w.stats.maxMp * mpPct) / 100)); w.player.hp = w.char.hp;
  return mark(w, `HP ${hpPct}% / MP ${mpPct}%.`);
}

/** Give an item made to order: refine, element, compounded cards and random options. */
export function gmGiveItemFull(w: World, itemId: string, opts: { qty?: number; refine?: number; element?: string; cards?: string[]; options?: { key: string; value: number }[] }): OpResult {
  const def = w.data.items.get(itemId);
  if (!def) return fail(`Unknown item ${itemId}.`);
  if (def.type !== 'equipment') return gmGiveItem(w, itemId, opts.qty ?? 1);
  for (const cd of opts.cards ?? []) if (w.data.items.get(cd)?.type !== 'card') return fail(`${cd} is not a card.`);
  for (const o of opts.options ?? []) if (!OPTIONS.some((x) => x.key === o.key)) return fail(`Unknown option ${o.key}.`);
  const inst: ItemInstance = { uid: newUid(), itemId, qty: 1 };
  if (opts.refine) inst.refine = Math.max(0, Math.min(MAX_REFINE, Math.trunc(opts.refine)));
  if (opts.element) inst.element = opts.element as Element;
  if (opts.cards?.length) inst.cards = opts.cards.slice(0, 4);
  if (opts.options?.length) inst.options = opts.options.slice(0, 3);
  for (let i = 0; i < Math.max(1, Math.min(20, opts.qty ?? 1)); i++) w.char.inventory.push({ ...inst, uid: newUid() });
  w.afterInventoryChange();
  return mark(w, `Gave ${opts.qty ?? 1}× ${inst.refine ? `+${inst.refine} ` : ''}${def.name}${inst.cards ? ` [${inst.cards.length} card]` : ''}${inst.options ? ` (${inst.options.length} options)` : ''}.`);
}

export function gmRefineEquipped(w: World, slot: string, level: number): OpResult {
  const inst = w.char.equipment[slot as keyof typeof w.char.equipment];
  if (!inst) return fail(`Nothing equipped in ${slot}.`);
  inst.refine = Math.max(0, Math.min(MAX_REFINE, Math.trunc(level)));
  w.recomputeStats();
  return mark(w, `${w.data.items.get(inst.itemId)?.name} is now +${inst.refine}.`);
}

export function gmClearInventory(w: World): OpResult {
  const n = w.char.inventory.length;
  w.char.inventory = [];
  w.afterInventoryChange();
  return mark(w, `Removed ${n} inventory stacks.`);
}

/** Rebirth now, whatever the level (keeps the current second job as the reborn path). */
export function gmRebirth(w: World): OpResult {
  const c = w.char;
  const cls = w.data.classes.get(c.classId)!;
  if (cls.tier !== 2) return fail('Become a second job first (Set class).');
  c.baseLevel = Math.max(c.baseLevel, 99); c.jobLevel = Math.max(c.jobLevel, 50);
  const r = rebirth(w.data, c);
  if (!r.ok) return r;
  w.recomputeStats();
  w.emit({ type: 'jobChanged', classId: c.classId });
  return mark(w, r.message ?? 'Reborn.');
}

/** Give a hatched pet with the given intimacy. */
export function gmPet(w: World, monsterId: string, intimacy = 950): OpResult {
  const pd = [...w.data.pets.values()].find((p) => p.monsterId === monsterId || p.id === monsterId);
  if (!pd) return fail(`${monsterId} is not a tameable pet.`);
  w.char.pet = { ...newPetState(pd), intimacy: Math.max(1, Math.min(1000, Math.trunc(intimacy))) };
  w.recomputeStats();
  return mark(w, `Pet ${pd.name} out with intimacy ${w.char.pet.intimacy}.`);
}

export function gmHomun(w: World, typeId: string, level = 1): OpResult {
  const d = w.data.homunculi.get(typeId);
  if (!d) return fail(`Unknown homunculus ${typeId} (${[...w.data.homunculi.keys()].join(', ')}).`);
  const h = { typeId, name: d.name, level: Math.max(1, Math.min(99, Math.trunc(level))), exp: 0, hp: 0, hunger: 80, intimacy: 950, alive: true, out: true, evolved: false };
  h.hp = homunStats(w.data, h).maxHp;
  w.char.homunculus = h;
  return mark(w, `${d.name} Lv ${h.level} created.`);
}

export function gmMountCart(w: World): OpResult {
  w.char.flags.mountOwned = true;
  if (!w.char.cart) w.char.cart = [];
  return mark(w, 'War-drake and pushcart granted (the mount works for the Knight line, the cart window for everyone).');
}

export function gmRunePoints(w: World, n: number): OpResult {
  w.char.flags.gmRunePoints = Math.max(0, Math.trunc(n));
  w.recomputeStats();
  return mark(w, `+${Math.trunc(n)} bonus rune points.`);
}

export function gmTeleportXY(w: World, mapId: string, x: number, y: number): OpResult {
  const def = w.data.maps.get(mapId);
  if (!def) return fail(`Unknown map ${mapId}.`);
  w.enterMap(mapId, { x: Math.trunc(x) * TILE + TILE / 2, y: Math.trunc(y) * TILE + TILE / 2 });
  return mark(w, `Teleported to ${def.name} (${x}, ${y}).`);
}

export function gmRespawnBoss(w: World): OpResult {
  return w.respawnBossNow() ? mark(w, 'Boss respawned.') : fail('This map has no boss.');
}

export function gmClearGround(w: World): OpResult {
  const n = w.groundItems.size;
  w.groundItems.clear();
  return mark(w, `Removed ${n} items from the ground.`);
}

export function gmRaid(w: World, mapId: string | 'end'): OpResult {
  if (mapId === 'end') {
    return w.endEvent() ? mark(w, 'Raid ended.') : fail('No raid running.');
  }
  w.event = null;
  return w.startEvent(mapId || undefined) ? mark(w, `Raid started on ${w.event!.mapName}.`) : fail('Could not start a raid there (field maps only).');
}

export function gmInstanceReset(w: World): OpResult {
  for (const k of Object.keys(w.char.flags)) if (k.startsWith('instcd_')) delete w.char.flags[k];
  return mark(w, 'Memorial-dungeon cooldowns cleared.');
}

/** Jump straight to a floor of a memorial dungeon (starts a run there). */
export function gmInstanceFloor(w: World, instanceId: string, floor: number): OpResult {
  const def = w.data.instances.get(instanceId);
  if (!def) return fail(`Unknown dungeon ${instanceId}.`);
  const f = Math.max(1, Math.min(def.floors.length, Math.trunc(floor)));
  w.instance = { id: def.id, floor: f, endsAt: w.time + def.timeLimitMs, cleared: false, done: false };
  w.enterMap(def.floors[f - 1], 'default');
  return mark(w, `${def.name}: floor ${f}.`);
}

export function gmQuestAll(w: World, action: 'complete' | 'reset'): OpResult {
  if (action === 'reset') { w.char.quests = {}; return mark(w, 'All quests reset.'); }
  let n = 0;
  for (const q of w.data.quests.values()) {
    w.char.quests[q.id] = { questId: q.id, status: 'completed', counts: q.objectives.map((o) => objectiveTarget(o)), acceptedAt: Date.now() } as never;
    n++;
  }
  w.emit({ type: 'questUpdate', questIds: [...w.data.quests.keys()] });
  return mark(w, `${n} quests marked completed.`);
}

/** EXP / drop / Luma rates in % (100 = normal), like a server's rate settings. */
export function gmRates(w: World, exp: number, drop: number, luma: number): OpResult {
  const clamp = (v: number) => Math.max(0, Math.min(100000, Math.trunc(v)));
  w.char.flags.gmExpRate = clamp(exp); w.char.flags.gmDropRate = clamp(drop); w.char.flags.gmLumaRate = clamp(luma);
  return mark(w, `Rates: EXP ${clamp(exp)}%, drops ${clamp(drop)}%, Luma ${clamp(luma)}%.`);
}

export type GmToggle = 'oneHit' | 'noCooldown' | 'invisible';
const TOGGLE_FLAG: Record<GmToggle, string> = { oneHit: 'gmOneHit', noCooldown: 'gmNoCooldown', invisible: 'gmInvisible' };
const TOGGLE_NAME: Record<GmToggle, string> = { oneHit: 'One-hit kill', noCooldown: 'No cooldowns / free skills', invisible: 'Invisible to monsters' };
export function gmToggle(w: World, t: GmToggle, on?: boolean): OpResult {
  const now = on ?? !w.char.flags[TOGGLE_FLAG[t]];
  if (now) w.char.flags[TOGGLE_FLAG[t]] = true; else delete w.char.flags[TOGGLE_FLAG[t]];
  w.invalidateStats();
  return mark(w, `${TOGGLE_NAME[t]} ${now ? 'ON' : 'OFF'}.`);
}

export function gmMoveSpeed(w: World, pct: number): OpResult {
  w.char.flags.gmSpeed = Math.max(-80, Math.min(500, Math.trunc(pct)));
  w.invalidateStats();
  return mark(w, `Move speed ${w.char.flags.gmSpeed >= 0 ? '+' : ''}${w.char.flags.gmSpeed}%.`);
}

export function gmTimeScale(w: World, x: number): OpResult {
  const v = Math.max(1, Math.min(10, Math.trunc(x)));
  if (v === 1) delete w.char.flags.gmTimeScale; else w.char.flags.gmTimeScale = v;
  return mark(w, `Game speed ×${v}.`);
}

// ---------------------------------------------------------------- @commands
export interface GmCommandHelp { cmd: string; args: string; text: string }
export const GM_COMMANDS: GmCommandHelp[] = [
  { cmd: '@heal', args: '', text: 'Full HP/MP, cure, revive' },
  { cmd: '@god', args: 'on|off', text: 'Take no damage' },
  { cmd: '@onehit', args: 'on|off', text: 'Every hit kills' },
  { cmd: '@nocd', args: 'on|off', text: 'No cooldowns, skills cost no MP' },
  { cmd: '@hide', args: 'on|off', text: 'Invisible to monsters' },
  { cmd: '@speed', args: '<move %>', text: 'Move speed bonus (e.g. 100)' },
  { cmd: '@gamespeed', args: '<1-10>', text: 'Run the game faster' },
  { cmd: '@rates', args: '<exp%> <drop%> <luma%>', text: 'Server-style rates (100 = normal)' },
  { cmd: '@lvl', args: '<base> <job>', text: 'Set levels exactly' },
  { cmd: '@baselvl', args: '<+n>', text: 'Add base levels' },
  { cmd: '@joblvl', args: '<+n>', text: 'Add job levels' },
  { cmd: '@stat', args: '<str|agi|vit|int|dex|luk|all> <value>', text: 'Set a stat (or all)' },
  { cmd: '@points', args: '<stat> <skill>', text: 'Give stat / skill points' },
  { cmd: '@maxskills', args: '', text: 'All skills of your class line at max' },
  { cmd: '@reset', args: 'stats|skills', text: 'Refund stats or skills' },
  { cmd: '@luma', args: '<+n>', text: 'Add Luma (@setluma n to set)' },
  { cmd: '@hp', args: '<hp%> <mp%>', text: 'Set HP / MP' },
  { cmd: '@item', args: '<id> [qty] [refine=n] [element=x] [cards=a,b] [opt=key:val,...]', text: 'Give any item, made to order' },
  { cmd: '@refine', args: '<slot> <0-20>', text: 'Set the refine of an equipped item' },
  { cmd: '@clearinv', args: '', text: 'Empty the inventory' },
  { cmd: '@job', args: '<classId>', text: 'Change class (no requirements)' },
  { cmd: '@rebirth', args: '', text: 'Rebirth now (from a second job)' },
  { cmd: '@pet', args: '<monsterId> [intimacy]', text: 'Give a hatched pet' },
  { cmd: '@homun', args: '<sylph|golemite|fawnling|gloom> [level]', text: 'Create a homunculus' },
  { cmd: '@mount', args: '', text: 'Give war-drake and pushcart' },
  { cmd: '@runes', args: '<n>', text: 'Bonus rune points' },
  { cmd: '@warp', args: '<mapId> [x y]', text: 'Teleport' },
  { cmd: '@monster', args: '<id> [n]', text: 'Spawn monsters' },
  { cmd: '@killall', args: '[boss]', text: 'Defeat everything here' },
  { cmd: '@boss', args: '', text: 'Respawn this map\'s boss now' },
  { cmd: '@clearground', args: '', text: 'Remove dropped items' },
  { cmd: '@raid', args: '<mapId>|end', text: 'Start / end a raid' },
  { cmd: '@dungeon', args: '<instanceId> <floor>|reset', text: 'Jump to a memorial floor / clear cooldowns' },
  { cmd: '@quest', args: '<id> complete|reset', text: 'Fill / reset a quest' },
  { cmd: '@questall', args: 'complete|reset', text: 'All quests' },
  { cmd: '@auto', args: 'farm|quest|off', text: 'Auto Farm / Auto Quest' },
  { cmd: '@help', args: '', text: 'This list' },
];

const onOff = (v?: string) => (v === undefined ? undefined : /^(on|1|true|yes)$/i.test(v));

/** Run one GM text command (RO style, starting with @). Online commands (@announce, @kick, @woe…) are handled by the app. */
export function runGmCommand(w: World, line: string): OpResult {
  const [cmdRaw, ...a] = line.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/^[@/]/, '@');
  switch (cmd) {
    case '@help': return ok(GM_COMMANDS.map((c) => `${c.cmd} ${c.args} — ${c.text}`).join('\n'));
    case '@heal': return gmHeal(w);
    case '@god': return gmGodMode(w, onOff(a[0]) ?? !w.godMode);
    case '@onehit': return gmToggle(w, 'oneHit', onOff(a[0]));
    case '@nocd': return gmToggle(w, 'noCooldown', onOff(a[0]));
    case '@hide': return gmToggle(w, 'invisible', onOff(a[0]));
    case '@speed': return gmMoveSpeed(w, num(a[0]));
    case '@gamespeed': return gmTimeScale(w, num(a[0], 1));
    case '@rates': return gmRates(w, num(a[0], 100), num(a[1], 100), num(a[2], 100));
    case '@lvl': return gmSetLevels(w, num(a[0], w.char.baseLevel), num(a[1], w.char.jobLevel));
    case '@baselvl': return gmAddLevels(w, Math.max(0, num(a[0], 1)), 0);
    case '@joblvl': return gmAddLevels(w, 0, Math.max(0, num(a[0], 1)));
    case '@stat': {
      if (a[0] === 'all') return gmSetAllStats(w, num(a[1], 1));
      if (!STAT_KEYS.includes(a[0] as StatKey)) return fail('Use str, agi, vit, int, dex, luk or all.');
      return gmSetStat(w, a[0] as StatKey, num(a[1], 1));
    }
    case '@points': return gmGivePoints(w, num(a[0]), num(a[1]));
    case '@maxskills': return gmMaxSkills(w);
    case '@reset': return a[0] === 'skills' ? gmReset(w, 'skills') : a[0] === 'stats' ? gmReset(w, 'stats') : fail('@reset stats|skills');
    case '@luma': case '@zeny': return gmGiveLuma(w, num(a[0]));
    case '@setluma': return gmSetLuma(w, num(a[0]));
    case '@hp': return gmSetHpMp(w, num(a[0], 100), num(a[1], 100));
    case '@item': {
      if (!a[0]) return fail('@item <id> [qty] [refine=n] [element=x] [cards=a,b] [opt=key:val,...]');
      const kv = Object.fromEntries(a.slice(1).filter((x) => x.includes('=')).map((x) => x.split('=') as [string, string]));
      const qty = num(a.slice(1).find((x) => /^\d+$/.test(x)), 1);
      const options = kv.opt ? kv.opt.split(',').map((p) => { const [key, v] = p.split(':'); return { key, value: num(v, 1) }; }) : undefined;
      return gmGiveItemFull(w, a[0], { qty, refine: kv.refine ? num(kv.refine) : undefined, element: kv.element, cards: kv.cards?.split(','), options });
    }
    case '@refine': return gmRefineEquipped(w, a[0] ?? 'weapon', num(a[1], 10));
    case '@clearinv': return gmClearInventory(w);
    case '@job': case '@jobchange': return gmSetClass(w, a[0] ?? '');
    case '@rebirth': return gmRebirth(w);
    case '@pet': return gmPet(w, a[0] ?? '', num(a[1], 950));
    case '@homun': return gmHomun(w, a[0] ?? '', num(a[1], 1));
    case '@mount': case '@cart': return gmMountCart(w);
    case '@runes': return gmRunePoints(w, num(a[0], 10));
    case '@warp': return a.length >= 3 ? gmTeleportXY(w, a[0], num(a[1]), num(a[2])) : gmTeleport(w, a[0] ?? '');
    case '@monster': case '@spawn': return gmSpawn(w, a[0] ?? '', num(a[1], 1));
    case '@killall': return gmKillAll(w, a[0] === 'boss');
    case '@boss': return gmRespawnBoss(w);
    case '@clearground': return gmClearGround(w);
    case '@raid': return gmRaid(w, a[0] ?? '');
    case '@dungeon': return a[0] === 'reset' ? gmInstanceReset(w) : gmInstanceFloor(w, a[0] ?? '', num(a[1], 1));
    case '@quest': return gmQuest(w, a[0] ?? '', a[1] === 'reset' ? 'reset' : 'complete');
    case '@questall': return gmQuestAll(w, a[0] === 'reset' ? 'reset' : 'complete');
    case '@auto': { if (a[0] === 'off') { w.auto.stop(); return ok('Auto off.'); } if (a[0] === 'farm' || a[0] === 'quest') { w.auto.start(a[0]); return ok(`Auto ${a[0]} on.`); } return fail('@auto farm|quest|off'); }
    default: return fail(`Unknown GM command ${cmdRaw}. Type @help.`);
  }
}
