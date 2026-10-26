// Data-driven quest manager. Progress is stored on the character so it is
// saved/loaded together with everything else.
import type { GameData } from './data';
import { addExperience } from './formulas';
import { addItem, canAddItem, countItem, removeItem, type OpResult } from './inventory';
import { changeJob } from './character';
import type { CharacterState, QuestDef, QuestProgress } from './types';

const ok = (message?: string): OpResult => ({ ok: true, message });
const fail = (error: string): OpResult => ({ ok: false, error });

export const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(t: number): number {
  return Math.floor(t / DAY_MS);
}

export function isQuestAvailable(data: GameData, c: CharacterState, q: QuestDef, now = Date.now()): boolean {
  const prog = c.quests[q.id];
  if (prog) {
    if (prog.status !== 'completed') return false;
    if (q.repeatable !== 'daily') return false;
    if (dayIndex(prog.completedAt ?? 0) >= dayIndex(now)) return false;
  }
  return prerequisitesMet(data, c, q);
}

export function prerequisitesMet(_data: GameData, c: CharacterState, q: QuestDef): boolean {
  const p = q.prerequisites;
  if (p.baseLevel && c.baseLevel < p.baseLevel) return false;
  if (p.jobLevel && c.jobLevel < p.jobLevel) return false;
  if (p.classes && !p.classes.includes(c.classId)) return false;
  if (p.notClasses && p.notClasses.includes(c.classId)) return false;
  for (const pre of p.quests ?? []) if (c.quests[pre]?.status !== 'completed' && !c.quests[pre]?.completedAt) return false;
  return true;
}

export function questsOfferedBy(data: GameData, c: CharacterState, npcId: string, now = Date.now()): QuestDef[] {
  return [...data.quests.values()].filter((q) => q.giverNpc === npcId && isQuestAvailable(data, c, q, now));
}

export function activeQuests(data: GameData, c: CharacterState): { def: QuestDef; prog: QuestProgress }[] {
  const out: { def: QuestDef; prog: QuestProgress }[] = [];
  for (const prog of Object.values(c.quests)) {
    if (prog.status === 'completed') continue;
    const def = data.quests.get(prog.questId);
    if (def) out.push({ def, prog });
  }
  return out;
}

export function questsToTurnIn(data: GameData, c: CharacterState, npcId: string): QuestDef[] {
  return activeQuests(data, c).filter(({ def, prog }) => def.turnInNpc === npcId && isComplete(def, prog, c)).map((x) => x.def);
}

export function acceptQuest(data: GameData, c: CharacterState, questId: string, now = Date.now()): OpResult {
  const q = data.quests.get(questId);
  if (!q) return fail('Unknown quest.');
  if (!isQuestAvailable(data, c, q, now)) return fail('You cannot accept this quest right now.');
  c.quests[questId] = { questId, status: 'active', counts: q.objectives.map(() => 0), acceptedAt: now };
  refreshQuest(data, c, questId);
  return ok(`Quest accepted: ${q.name}`);
}

export function abandonQuest(data: GameData, c: CharacterState, questId: string): OpResult {
  const prog = c.quests[questId];
  const q = data.quests.get(questId);
  if (!prog || prog.status === 'completed' || !q) return fail('Quest not active.');
  if (q.category === 'main') return fail('Main quests cannot be abandoned.');
  delete c.quests[questId];
  return ok(`Abandoned ${q.name}.`);
}

/** Objective counter target. */
export function objectiveTarget(o: QuestDef['objectives'][number]): number {
  return 'count' in o ? o.count : 1;
}

export function isComplete(def: QuestDef, prog: QuestProgress, c: CharacterState): boolean {
  return def.objectives.every((o, i) => {
    if (o.type === 'collect' || o.type === 'deliver') return countItem(c, o.itemId) >= o.count;
    return prog.counts[i] >= objectiveTarget(o);
  });
}

/** Re-evaluates collect objectives against inventory and updates status. */
export function refreshQuest(data: GameData, c: CharacterState, questId: string): void {
  const prog = c.quests[questId];
  const def = data.quests.get(questId);
  if (!prog || !def || prog.status === 'completed') return;
  def.objectives.forEach((o, i) => {
    if (o.type === 'collect' || o.type === 'deliver') prog.counts[i] = Math.min(o.count, countItem(c, o.itemId));
    if (o.type === 'reachLevel') {
      const okLvl = (!o.baseLevel || c.baseLevel >= o.baseLevel) && (!o.jobLevel || c.jobLevel >= o.jobLevel);
      prog.counts[i] = okLvl ? 1 : 0;
    }
  });
  prog.status = isComplete(def, prog, c) ? 'ready' : 'active';
}

export function refreshAllQuests(data: GameData, c: CharacterState): void {
  for (const id of Object.keys(c.quests)) refreshQuest(data, c, id);
}

type Progressor = (o: QuestDef['objectives'][number]) => boolean;

function progress(data: GameData, c: CharacterState, match: Progressor): string[] {
  const updated: string[] = [];
  for (const { def, prog } of activeQuests(data, c)) {
    let changed = false;
    def.objectives.forEach((o, i) => {
      if (match(o) && prog.counts[i] < objectiveTarget(o)) {
        prog.counts[i]++;
        changed = true;
      }
    });
    if (changed) {
      refreshQuest(data, c, def.id);
      updated.push(def.id);
    }
  }
  return updated;
}

export const questEvents = {
  kill: (data: GameData, c: CharacterState, monsterId: string) =>
    progress(data, c, (o) => o.type === 'kill' && o.monsterId === monsterId),
  bossKill: (data: GameData, c: CharacterState, bossId: string) =>
    progress(data, c, (o) => o.type === 'defeatBoss' && o.bossId === bossId),
  talk: (data: GameData, c: CharacterState, npcId: string) =>
    progress(data, c, (o) => o.type === 'talk' && o.npcId === npcId),
  explore: (data: GameData, c: CharacterState, mapId: string, areaId?: string) =>
    progress(data, c, (o) => o.type === 'explore' && o.mapId === mapId && (!o.areaId || o.areaId === areaId)),
  interact: (data: GameData, c: CharacterState, objectId: string) =>
    progress(data, c, (o) => o.type === 'interact' && o.objectId === objectId),
  craft: (data: GameData, c: CharacterState, itemId: string) =>
    progress(data, c, (o) => o.type === 'craft' && o.itemId === itemId),
};

/** Talk objectives are satisfied by speaking to the NPC, but only in order: earlier objectives must be done. */
export function talkObjectivePending(data: GameData, c: CharacterState, npcId: string): boolean {
  return activeQuests(data, c).some(({ def, prog }) =>
    def.objectives.some((o, i) => o.type === 'talk' && o.npcId === npcId && prog.counts[i] < 1));
}

export interface TurnInResult { ok: boolean; error?: string; levelUps?: { base: number; job: number }; jobChanged?: string }

export function turnInQuest(data: GameData, c: CharacterState, questId: string, weightLimit: number, now = Date.now()): TurnInResult {
  const def = data.quests.get(questId);
  const prog = c.quests[questId];
  if (!def || !prog || prog.status === 'completed') return { ok: false, error: 'Quest not active.' };
  refreshQuest(data, c, questId);
  if (!isComplete(def, prog, c)) return { ok: false, error: 'Objectives are not complete yet.' };
  // Job quests must still satisfy class prerequisites (e.g. not already changed job).
  const p = def.prerequisites;
  if (p.classes && !p.classes.includes(c.classId)) return { ok: false, error: 'Your class no longer qualifies.' };

  // Validate rewards fit before consuming anything (atomic turn-in).
  const consumed = def.objectives.filter((o) => o.type === 'collect' || o.type === 'deliver') as { itemId: string; count: number }[];
  const sim: CharacterState = { ...c, inventory: c.inventory.map((i) => ({ ...i })) };
  if (def.consumeItems !== false) for (const o of consumed) removeItem(sim, o.itemId, o.count);
  for (const r of def.rewards.items ?? []) {
    const chk = canAddItem(data, sim, r.itemId, r.qty, { ignoreWeight: true });
    if (!chk.ok) return { ok: false, error: 'Not enough inventory space for the reward.' };
    addItem(data, sim, r.itemId, r.qty, { ignoreWeight: true });
  }
  void weightLimit;

  if (def.consumeItems !== false) for (const o of consumed) removeItem(c, o.itemId, o.count);
  for (const r of def.rewards.items ?? []) addItem(data, c, r.itemId, r.qty, { ignoreWeight: true });
  c.luma += def.rewards.luma ?? 0;
  for (const f of def.rewards.flags ?? []) c.flags[f] = true;
  let jobChanged: string | undefined;
  if (def.rewards.jobChange) {
    const r = changeJob(data, c, def.rewards.jobChange);
    if (r.ok) jobChanged = def.rewards.jobChange;
  }
  const lv = addExperience(data, c, def.rewards.exp ?? 0, def.rewards.jobExp ?? 0);
  prog.status = 'completed';
  prog.completedAt = now;
  return { ok: true, levelUps: { base: lv.baseLevelsGained, job: lv.jobLevelsGained }, jobChanged };
}

/** Marker shown above an NPC: '?' = turn-in ready, '!' = quest available, '…' = in progress. */
export function npcQuestMarker(data: GameData, c: CharacterState, npcId: string, now = Date.now()): '?' | '!' | '…' | null {
  if (questsToTurnIn(data, c, npcId).length) return '?';
  if (talkObjectivePending(data, c, npcId)) return '?';
  if (questsOfferedBy(data, c, npcId, now).length) return '!';
  if (activeQuests(data, c).some(({ def }) => def.turnInNpc === npcId)) return '…';
  return null;
}
