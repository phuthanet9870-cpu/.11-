// Market prices at the Market Trader NPCs. Every item has a price index that
// moves once an hour (real time): a deterministic, mean-reverting random walk
// whose swings grow with the item's rarity, plus a demand effect — selling a
// lot of one item pushes its price down for a few hours, then it recovers.
// The trader pays base × index, where base is the normal NPC sell price.
import type { GameData } from './data';
import { canDiscard, sellPrice, findInstance, removeByUid, type OpResult } from './inventory';
import type { CharacterState, ItemDef } from './types';

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

/** Player demand at an hour: 0 = nothing sold recently; 1 = a dump-sized batch in the last few hours. */
export function demandAt(data: GameData, c: CharacterState | undefined, itemId: string, hour: number): number {
  const log = c?.marketSales?.[itemId];
  const def = data.items.get(itemId);
  if (!log || !def) return 0;
  let q = 0;
  for (const [h, n] of log) if (h <= hour && h > hour - DEMAND_HOURS) q += n * (1 - (hour - h) / DEMAND_HOURS);
  return q / DUMP(def);
}

/** Price index of an item at an hour (about 0.5–1.8; 1 = base). */
export function marketIndex(data: GameData, c: CharacterState | undefined, itemId: string, hour: number): number {
  const def = data.items.get(itemId);
  if (!def) return 1;
  const seed = hash(itemId), vol = VOLATILITY[def.rarity] ?? 0.12;
  // Mean-reverting walk: recent hours weigh most, so prices drift and come back.
  let v = 0;
  for (let k = 0; k < 10; k++) v += noise(seed, hour - k) * 0.72 ** k;
  v /= 2.4;
  const demand = demandAt(data, c, itemId, hour);
  const idx = (SCARCITY[def.rarity] ?? 1) * (1 + vol * 2 * v) / (1 + demand);
  return Math.max(0.35, Math.min(2.2, idx));
}

/** What a Market Trader pays for one right now. */
export function traderPrice(data: GameData, c: CharacterState | undefined, itemId: string, now: number): number {
  const base = Math.max(1, sellPrice(data, itemId, c));
  return Math.max(1, Math.round(base * marketIndex(data, c, itemId, hourOf(now))));
}

/** Price per hour for the last `hours` hours (oldest first), for the graph. */
export function priceHistory(data: GameData, c: CharacterState | undefined, itemId: string, now: number, hours = 24): { hour: number; price: number }[] {
  const base = Math.max(1, sellPrice(data, itemId, c)), h0 = hourOf(now);
  return Array.from({ length: hours }, (_, i) => {
    const hour = h0 - hours + 1 + i;
    return { hour, price: Math.max(1, Math.round(base * marketIndex(data, c, itemId, hour))) };
  });
}

/** Change vs one hour ago, in %. */
export function priceChangePct(data: GameData, c: CharacterState | undefined, itemId: string, now: number): number {
  const [a, b] = priceHistory(data, c, itemId, now, 2).map((p) => p.price);
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
  const h = hourOf(now);
  c.marketSales ??= {};
  const log = (c.marketSales[def.id] ??= []);
  const last = log[log.length - 1];
  if (last && last[0] === h) last[1] += qty; else log.push([h, qty]);
  for (const [id, l] of Object.entries(c.marketSales)) { c.marketSales[id] = l.filter(([hh]) => hh > h - 48); if (!c.marketSales[id].length) delete c.marketSales[id]; }
  return { ok: true, message: `Sold ${qty}× ${def.name} for ${gain.toLocaleString()} Luma.`, gain };
}
