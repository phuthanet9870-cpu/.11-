// Market prices at the Market Trader NPCs. Every item has a price index that
// moves once an hour (real time): a deterministic, mean-reverting random walk
// whose swings grow with the item's rarity, plus a demand effect — selling a
// lot of one item pushes its price down for a few hours, then it recovers.
// The trader pays base × index, where base is the normal NPC sell price.
// What the trader *sells* (Starter Goods) moves too: the same hourly walk at half
// the swing, and buying a lot of one item pushes its price up for a few hours. A
// floor keeps every buy price above the highest price the trader could ever pay
// for that item, so buying low and selling back high is not possible.
import type { GameData } from './data';
import { buyPrice, canAddItem, canDiscard, sellPrice, findInstance, newUid, removeByUid, type OpResult } from './inventory';
import type { CharacterState, ItemDef, ShopDef } from './types';

export const HOUR_MS = 3_600_000;
export const hourOf = (t: number) => Math.floor(t / HOUR_MS);

/** How far the price swings (± share of base per step), by rarity. Rarer items move more. */
const VOLATILITY: Record<string, number> = { common: 0.12, uncommon: 0.16, rare: 0.22, epic: 0.28, legendary: 0.34 };
/** Rarer items also trade a little above their base. */
const SCARCITY: Record<string, number> = { common: 1, uncommon: 1.04, rare: 1.08, epic: 1.14, legendary: 1.2 };
/** Selling this many of one item within a few hours halves its price (stackables) — singles react faster. */
const DUMP = (def: ItemDef) => (def.stackable ? 40 : 4);
const DEMAND_HOURS = 6;

function hash(s: string): number { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Repeatable noise in [-1, 1] for (item, hour). */
function noise(seed: number, h: number): number {
  let x = (seed ^ Math.imul(h, 2654435761)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0; x ^= x >>> 16;
  return (x / 4294967296) * 2 - 1;
}

/** Player demand at an hour: 0 = nothing sold (or bought) recently; 1 = a dump-sized batch in the last few hours. */
export function demandAt(data: GameData, c: CharacterState | undefined, itemId: string, hour: number, side: 'sell' | 'buy' = 'sell'): number {
  const log = (side === 'sell' ? c?.marketSales : c?.marketBuys)?.[itemId];
  const def = data.items.get(itemId);
  if (!log || !def) return 0;
  let q = 0;
  for (const [h, n] of log) if (h <= hour && h > hour - DEMAND_HOURS) q += n * (1 - (hour - h) / DEMAND_HOURS);
  return q / DUMP(def);
}

/** The hourly random walk in about [-1.5, 1.5]: recent hours weigh most, so prices drift and come back. */
function walk(itemId: string, hour: number): number {
  const seed = hash(itemId);
  let v = 0;
  for (let k = 0; k < 10; k++) v += noise(seed, hour - k) * 0.72 ** k;
  return v / 2.4;
}
/** Largest |walk| possible: Σ 0.72^k for k < 10, over 2.4. */
const WALK_MAX = (1 - 0.72 ** 10) / (1 - 0.72) / 2.4;

/** Price index of an item at an hour (about 0.5–1.8; 1 = base). */
export function marketIndex(data: GameData, c: CharacterState | undefined, itemId: string, hour: number): number {
  const def = data.items.get(itemId);
  if (!def) return 1;
  const vol = VOLATILITY[def.rarity] ?? 0.12;
  const v = walk(itemId, hour);
  const demand = demandAt(data, c, itemId, hour);
  const idx = (SCARCITY[def.rarity] ?? 1) * (1 + vol * 2 * v) / (1 + demand);
  return Math.max(0.35, Math.min(2.2, idx));
}

/** The highest index the trader could ever pay at (no demand). */
function maxSellIndex(def: ItemDef): number {
  return Math.min(2.2, (SCARCITY[def.rarity] ?? 1) * (1 + (VOLATILITY[def.rarity] ?? 0.12) * 2 * WALK_MAX));
}

/** Index of the trader's selling price at an hour: half the swing of the buying side; your recent purchases push it up. */
export function buyIndex(data: GameData, c: CharacterState | undefined, itemId: string, hour: number): number {
  const def = data.items.get(itemId);
  if (!def) return 1;
  const idx = (1 + (VOLATILITY[def.rarity] ?? 0.12) * walk(itemId, hour)) * (1 + 0.5 * demandAt(data, c, itemId, hour, 'buy'));
  return Math.max(0.8, Math.min(1.8, idx));
}

function buyAt(data: GameData, c: CharacterState | undefined, itemId: string, hour: number): number {
  const def = data.items.get(itemId);
  if (!def) return 1;
  const floor = Math.ceil(Math.max(1, sellPrice(data, itemId, c)) * maxSellIndex(def)) + 1;
  return Math.max(floor, Math.round(buyPrice(data, c, itemId) * buyIndex(data, c, itemId, hour)));
}

/** What a Market Trader charges for one right now. */
export function traderBuyPrice(data: GameData, c: CharacterState | undefined, itemId: string, now: number): number {
  return buyAt(data, c, itemId, hourOf(now));
}

/** What a Market Trader pays for one right now. */
export function traderPrice(data: GameData, c: CharacterState | undefined, itemId: string, now: number): number {
  const base = Math.max(1, sellPrice(data, itemId, c));
  return Math.max(1, Math.round(base * marketIndex(data, c, itemId, hourOf(now))));
}

/** Price per hour for the last `hours` hours (oldest first), for the graph. 'sell' = what the trader pays, 'buy' = what it charges. */
export function priceHistory(data: GameData, c: CharacterState | undefined, itemId: string, now: number, hours = 24, side: 'sell' | 'buy' = 'sell'): { hour: number; price: number }[] {
  const base = Math.max(1, sellPrice(data, itemId, c)), h0 = hourOf(now);
  return Array.from({ length: hours }, (_, i) => {
    const hour = h0 - hours + 1 + i;
    return { hour, price: side === 'buy' ? buyAt(data, c, itemId, hour) : Math.max(1, Math.round(base * marketIndex(data, c, itemId, hour))) };
  });
}

/** Change vs one hour ago, in %. */
export function priceChangePct(data: GameData, c: CharacterState | undefined, itemId: string, now: number, side: 'sell' | 'buy' = 'sell'): number {
  const [a, b] = priceHistory(data, c, itemId, now, 2, side).map((p) => p.price);
  return a ? ((b - a) / a) * 100 : 0;
}

/** Sell to a Market Trader at today's price. Records the sale (it lowers the price for a few hours). */
export function traderSell(data: GameData, c: CharacterState, uid: string, qty: number, now: number): OpResult & { gain?: number } {
  const inst = findInstance(c, uid);
  if (!inst) return { ok: false, error: 'Item not found.' };
  const can = canDiscard(data, inst);
  if (!can.ok) return can;
  if (!Number.isInteger(qty) || qty <= 0 || qty > inst.qty) return { ok: false, error: 'Invalid quantity.' };
  const price = traderPrice(data, c, inst.itemId, now), gain = price * qty;
  const def = data.items.get(inst.itemId)!;
  const r = removeByUid(c, uid, qty);
  if (!r.ok) return r;
  c.luma += gain;
  logTrade((c.marketSales ??= {}), def.id, qty, hourOf(now));
  return { ok: true, message: `Sold ${qty}× ${def.name} for ${gain.toLocaleString()} Luma.`, gain };
}

/** Record [hour, qty] for an item and drop entries older than 48 hours. */
function logTrade(book: Record<string, [number, number][]>, itemId: string, qty: number, h: number) {
  const log = (book[itemId] ??= []);
  const last = log[log.length - 1];
  if (last && last[0] === h) last[1] += qty; else log.push([h, qty]);
  for (const [id, l] of Object.entries(book)) { book[id] = l.filter(([hh]) => hh > h - 48); if (!book[id].length) delete book[id]; }
}

/** A rotating shop re-rolls its stock this often. */
export const STOCK_MS = 2 * HOUR_MS;
const STOCK_CONSUMABLES = 5, STOCK_PER_TIER = 2, TIER_LEVELS = 15;

/** Equipment tier: 1–15, 16–30, 31–45, ... by required level. */
export const tierOf = (def: ItemDef) => Math.floor(Math.max(0, (def.equipLevel ?? 1) - 1) / TIER_LEVELS);

/** What a shop sells right now. A rotating shop shows a random pick from its pool: a few consumables plus
 *  two pieces of gear from every level tier, the same for everyone, re-rolled every 2 hours. */
export function shopStock(data: GameData, shop: ShopDef, now: number): string[] {
  if (!shop.rotating) return shop.items;
  const block = Math.floor(now / STOCK_MS);
  const score = (id: string) => noise(hash(`${shop.id}:${id}`), block);
  const pick = (ids: string[], n: number) => [...ids].sort((a, b) => score(a) - score(b)).slice(0, n);
  const pool = shop.items.filter((id) => data.items.has(id));
  const gear = pool.filter((id) => data.items.get(id)!.type === 'equipment');
  const tiers = new Map<number, string[]>();
  for (const id of gear) { const t = tierOf(data.items.get(id)!); if (!tiers.has(t)) tiers.set(t, []); tiers.get(t)!.push(id); }
  const out = pick(pool.filter((id) => data.items.get(id)!.type !== 'equipment'), STOCK_CONSUMABLES);
  for (const t of [...tiers.keys()].sort((a, b) => a - b)) {
    const picked = pick(tiers.get(t)!, STOCK_PER_TIER);
    out.push(...picked.sort((a, b) => (data.items.get(a)!.equipLevel ?? 1) - (data.items.get(b)!.equipLevel ?? 1)));
  }
  return out;
}

/** Milliseconds until a rotating shop re-rolls. */
export const nextRestockMs = (now: number) => STOCK_MS - (now % STOCK_MS);

/** Buy from a Market Trader's shop at the current price. Records the purchase (it raises the price for a while). */
export function traderBuy(data: GameData, c: CharacterState, shopId: string, itemId: string, qty: number, now: number, weightLimit: number): OpResult & { cost?: number } {
  const shop = data.shops.get(shopId);
  if (!shop || !shop.market || !shopStock(data, shop, now).includes(itemId)) return { ok: false, error: 'That item is not sold here.' };
  if (!Number.isInteger(qty) || qty <= 0 || qty > 999) return { ok: false, error: 'Invalid quantity.' };
  const def = data.items.get(itemId)!;
  const cost = traderBuyPrice(data, c, itemId, now) * qty;
  if (cost > c.luma) return { ok: false, error: 'Not enough Luma.' };
  const check = canAddItem(data, c, itemId, qty, { weightLimit });
  if (!check.ok) return check;
  c.luma -= cost;
  if (def.stackable) {
    let left = qty;
    for (const inst of c.inventory) if (left > 0 && inst.itemId === itemId && !inst.locked && inst.qty < def.maxStack) { const n = Math.min(left, def.maxStack - inst.qty); inst.qty += n; left -= n; }
    while (left > 0) { const n = Math.min(left, def.maxStack); c.inventory.push({ uid: newUid(), itemId, qty: n }); left -= n; }
  } else for (let i = 0; i < qty; i++) c.inventory.push({ uid: newUid(), itemId, qty: 1 });
  logTrade((c.marketBuys ??= {}), itemId, qty, hourOf(now));
  return { ok: true, message: `Bought ${qty}× ${def.name} for ${cost} Luma.`, cost };
}
