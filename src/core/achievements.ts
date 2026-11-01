// Achievements & titles, daily login rewards, and timed bonus events.
//
// Achievements are checked from the character's own state (kills, levels, refine, ...), so nothing
// is counted twice. Each one gives a one-time reward and unlocks a title the player may show under
// their name. Daily rewards use the local calendar day; bonus events use the local clock.

import type { GameData } from './data';
import { addItem, newUid } from './inventory';
import { LOYAL_AT } from './pets';
import type { CharacterState } from './types';

export interface AchievementDef {
  id: string;
  name: string;
  /** Shown under the character's name when chosen. */
  title: string;
  desc: string;
  reward: { luma?: number; items?: { itemId: string; qty: number }[] };
  /** Current progress and goal. */
  progress: (data: GameData, c: CharacterState) => [number, number];
}

const kills = (c: CharacterState) => c.stats_meta.kills;
const bossKills = (c: CharacterState) => Object.values(c.stats_meta.bossKills ?? {}).reduce((a, b) => a + b, 0);
const questsDone = (c: CharacterState) => Object.values(c.quests).filter((q) => q.status === 'completed').length;
const bestRefine = (c: CharacterState) =>
  Math.max(0, ...[...Object.values(c.equipment), ...c.inventory, ...c.storage].map((i) => i?.refine ?? 0));
const tier = (data: GameData, c: CharacterState) => data.classes.get(c.classId)?.tier ?? 0;
const cardsOwned = (data: GameData, c: CharacterState) => {
  const ids = new Set<string>();
  for (const i of [...c.inventory, ...c.storage]) if (data.items.get(i.itemId)?.type === 'card') ids.add(i.itemId);
  for (const i of Object.values(c.equipment)) for (const id of i?.cards ?? []) if (id) ids.add(id);
  return ids.size;
};
const spireBest = (c: CharacterState) => Number(c.flags.instbest_endless_spire ?? 0);
const hours = (c: CharacterState) => Math.floor(c.stats_meta.playTimeMs / 3_600_000);

const count = (n: number, goal: number): [number, number] => [Math.min(n, goal), goal];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: 'First Hunt', title: 'Fledgling', desc: 'Defeat your first monster.', reward: { luma: 100, items: [{ itemId: 'red_potion', qty: 5 }] }, progress: (_d, c) => count(kills(c), 1) },
  { id: 'hunter_100', name: 'Hunter', title: 'Hunter', desc: 'Defeat 100 monsters.', reward: { luma: 1000, items: [{ itemId: 'orange_potion', qty: 10 }] }, progress: (_d, c) => count(kills(c), 100) },
  { id: 'hunter_1000', name: 'Slayer', title: 'Slayer', desc: 'Defeat 1,000 monsters.', reward: { luma: 10000, items: [{ itemId: 'yellow_potion', qty: 10 }] }, progress: (_d, c) => count(kills(c), 1000) },
  { id: 'hunter_10000', name: 'Legend of the Fields', title: 'Fieldbane', desc: 'Defeat 10,000 monsters.', reward: { luma: 100000, items: [{ itemId: 'elder_seed', qty: 1 }] }, progress: (_d, c) => count(kills(c), 10000) },
  { id: 'level_10', name: 'Getting Started', title: 'Wanderer', desc: 'Reach Base Level 10.', reward: { luma: 500, items: [{ itemId: 'wing_of_return', qty: 3 }] }, progress: (_d, c) => count(c.baseLevel, 10) },
  { id: 'level_30', name: 'Seasoned', title: 'Seasoned', desc: 'Reach Base Level 30.', reward: { luma: 3000, items: [{ itemId: 'swiftness_tonic', qty: 3 }] }, progress: (_d, c) => count(c.baseLevel, 30) },
  { id: 'level_60', name: 'Veteran', title: 'Veteran', desc: 'Reach Base Level 60.', reward: { luma: 15000, items: [{ itemId: 'token_of_renewal', qty: 1 }] }, progress: (_d, c) => count(c.baseLevel, 60) },
  { id: 'level_99', name: 'Pinnacle', title: 'Paragon', desc: 'Reach Base Level 99.', reward: { luma: 100000, items: [{ itemId: 'elder_sap', qty: 1 }] }, progress: (_d, c) => count(c.baseLevel, 99) },
  { id: 'first_job', name: 'A Calling', title: 'Apprentice', desc: 'Change to a first job.', reward: { luma: 1000 }, progress: (d, c) => count(tier(d, c) >= 1 ? 1 : 0, 1) },
  { id: 'second_job', name: 'Mastery', title: 'Adept', desc: 'Change to a second job.', reward: { luma: 10000, items: [{ itemId: 'yellow_potion', qty: 20 }] }, progress: (d, c) => count(tier(d, c) >= 2 ? 1 : 0, 1) },
  { id: 'reborn', name: 'Reborn', title: 'the Reborn', desc: 'Be reborn and reach a transcendent class.', reward: { luma: 50000, items: [{ itemId: 'elder_sap', qty: 1 }] }, progress: (d, c) => count(tier(d, c) >= 3 ? 1 : 0, 1) },
  { id: 'mvp_1', name: 'Giant Killer', title: 'Giant Killer', desc: 'Defeat a boss (MVP).', reward: { luma: 5000, items: [{ itemId: 'astral_shard', qty: 3 }] }, progress: (_d, c) => count(bossKills(c), 1) },
  { id: 'mvp_25', name: 'Bane of Kings', title: 'Kingsbane', desc: 'Defeat 25 bosses.', reward: { luma: 50000, items: [{ itemId: 'stellar_shard', qty: 1 }] }, progress: (_d, c) => count(bossKills(c), 25) },
  { id: 'refine_7', name: 'Steady Hands', title: 'Smith\'s Friend', desc: 'Own a +7 item.', reward: { luma: 3000, items: [{ itemId: 'bright_ore', qty: 5 }] }, progress: (_d, c) => count(bestRefine(c), 7) },
  { id: 'refine_10', name: 'Perfect Edge', title: 'the Gleaming', desc: 'Own a +10 item.', reward: { luma: 20000, items: [{ itemId: 'enriched_starsteel', qty: 1 }] }, progress: (_d, c) => count(bestRefine(c), 10) },
  { id: 'rich_100k', name: 'Comfortable', title: 'Merchant Prince', desc: 'Hold 100,000 Luma at once.', reward: { items: [{ itemId: 'swiftness_tonic', qty: 5 }] }, progress: (_d, c) => count(c.luma, 100000) },
  { id: 'rich_1m', name: 'Tycoon', title: 'Tycoon', desc: 'Hold 1,000,000 Luma at once.', reward: { items: [{ itemId: 'elder_sap', qty: 1 }] }, progress: (_d, c) => count(c.luma, 1000000) },
  { id: 'quests_5', name: 'Helping Hand', title: 'Good Neighbor', desc: 'Complete 5 quests.', reward: { luma: 1500, items: [{ itemId: 'wing_of_return', qty: 5 }] }, progress: (_d, c) => count(questsDone(c), 5) },
  { id: 'pet_loyal', name: 'Best Friends', title: 'Beastfriend', desc: 'Raise a pet to Loyal.', reward: { luma: 5000, items: [{ itemId: 'pet_star_sugar', qty: 5 }] }, progress: (_d, c) => count(c.pet && c.pet.intimacy >= LOYAL_AT ? 1 : 0, 1) },
  { id: 'cards_5', name: 'Collector', title: 'Collector', desc: 'Own 5 different cards.', reward: { luma: 10000 }, progress: (d, c) => count(cardsOwned(d, c), 5) },
  { id: 'spire_25', name: 'Climber', title: 'Climber', desc: 'Reach floor 25 of the Endless Spire.', reward: { luma: 20000, items: [{ itemId: 'astral_shard', qty: 5 }] }, progress: (_d, c) => count(spireBest(c), 25) },
  { id: 'spire_100', name: 'Top of the Spire', title: 'Skyborn', desc: 'Clear all 100 floors of the Endless Spire.', reward: { luma: 200000, items: [{ itemId: 'lunar_shard', qty: 2 }] }, progress: (_d, c) => count(spireBest(c), 100) },
  { id: 'played_10h', name: 'Regular', title: 'Regular', desc: 'Play for 10 hours.', reward: { luma: 5000 }, progress: (_d, c) => count(hours(c), 10) },
];

export function achievementDef(id: string) { return ACHIEVEMENTS.find((a) => a.id === id); }

/** Give items, using storage when the bag is full, so a reward is never lost. */
function grantItems(data: GameData, c: CharacterState, items: { itemId: string; qty: number }[]) {
  for (const it of items) {
    if (!data.items.has(it.itemId)) continue;
    if (!addItem(data, c, it.itemId, it.qty, { ignoreWeight: true }).ok) c.storage.push({ uid: newUid(), itemId: it.itemId, qty: it.qty });
  }
}

/** Award every achievement whose goal is met and not yet earned. Returns the newly earned ones. */
export function checkAchievements(data: GameData, c: CharacterState, now: number): AchievementDef[] {
  const got = (c.achievements ??= {});
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (got[a.id]) continue;
    const [n, goal] = a.progress(data, c);
    if (n < goal) continue;
    got[a.id] = now;
    if (a.reward.luma) c.luma += a.reward.luma;
    if (a.reward.items) grantItems(data, c, a.reward.items);
    fresh.push(a);
  }
  return fresh;
}

export function setTitle(c: CharacterState, id: string | null): { ok: boolean; error?: string } {
  if (id == null || id === '') { c.title = undefined; return { ok: true }; }
  if (!c.achievements?.[id]) return { ok: false, error: 'You have not earned that title.' };
  c.title = id;
  return { ok: true };
}

export function titleOf(c: CharacterState): string | undefined {
  return c.title ? achievementDef(c.title)?.title : undefined;
}

// ---------------------------------------------------------------- daily login

/** The 7-day reward cycle. Day 7 is the big one; then it starts over. */
export const DAILY_REWARDS: { luma: number; items: { itemId: string; qty: number }[] }[] = [
  { luma: 500, items: [{ itemId: 'red_potion', qty: 10 }] },
  { luma: 800, items: [{ itemId: 'wing_of_return', qty: 2 }] },
  { luma: 1200, items: [{ itemId: 'orange_potion', qty: 10 }] },
  { luma: 1500, items: [{ itemId: 'blue_potion', qty: 5 }] },
  { luma: 2000, items: [{ itemId: 'swiftness_tonic', qty: 2 }] },
  { luma: 3000, items: [{ itemId: 'yellow_potion', qty: 5 }] },
  { luma: 5000, items: [{ itemId: 'token_of_renewal', qty: 1 }, { itemId: 'elder_seed', qty: 1 }] },
];

export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayKey(now: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}

/** Which day (1–7) the next claim is, and whether it can be claimed today. */
export function dailyStatus(c: CharacterState, now: number): { day: number; canClaim: boolean } {
  const d = c.daily;
  if (!d) return { day: 1, canClaim: true };
  const today = dayKey(now);
  if (d.lastDay === today) return { day: d.streak, canClaim: false };
  const keeps = d.lastDay === yesterdayKey(now);
  return { day: keeps ? (d.streak % 7) + 1 : 1, canClaim: true };
}

export function claimDaily(data: GameData, c: CharacterState, now: number): { ok: boolean; error?: string; day?: number } {
  const s = dailyStatus(c, now);
  if (!s.canClaim) return { ok: false, error: 'You already claimed today\'s reward. Come back tomorrow.' };
  const r = DAILY_REWARDS[s.day - 1];
  c.luma += r.luma;
  grantItems(data, c, r.items);
  c.daily = { lastDay: dayKey(now), streak: s.day };
  return { ok: true, day: s.day };
}

// ---------------------------------------------------------------- timed events

/** Bonus hours by the local clock: EXP +50% at lunch and evening; drops +50% on weekends. */
export const BONUS_HOURS: [number, number][] = [[12, 13], [20, 22]];

export function bonusNow(now: number): { exp: number; drop: number; labels: string[]; nextChangeMs: number } {
  const d = new Date(now);
  const h = d.getHours();
  const day = d.getDay();
  const labels: string[] = [];
  let exp = 1, drop = 1;
  if (BONUS_HOURS.some(([a, b]) => h >= a && h < b)) { exp = 1.5; labels.push('EXP +50%'); }
  if (day === 0 || day === 6) { drop = 1.5; labels.push('Drops +50%'); }
  const next = new Date(d); next.setMinutes(0, 0, 0); next.setHours(h + 1);
  return { exp, drop, labels, nextChangeMs: next.getTime() - now };
}
