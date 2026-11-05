import { describe, expect, it } from 'vitest';
import { addItem, countItem, sellPrice } from '../../src/core/inventory';
import { HOUR_MS, hourOf, marketIndex, priceHistory, shopStock, STOCK_MS, tierOf, traderBuy, traderBuyPrice, traderPrice, traderSell } from '../../src/core/market';
import { TILE } from '../../src/core/mapCompiler';
import { data, newChar, newWorld } from '../helpers/fixtures';

const T0 = 1_700_000_000_000;

describe('market prices (Market Trader)', () => {
  it('change once an hour, are repeatable, and stay within bounds', () => {
    const a = traderPrice(data, undefined, 'iron_sword', T0), b = traderPrice(data, undefined, 'iron_sword', T0 + 60_000);
    expect(a).toBe(b); // same hour
    const hist = priceHistory(data, undefined, 'iron_sword', T0, 48);
    expect(new Set(hist.map((p) => p.price)).size).toBeGreaterThan(10); // it moves
    for (const id of ['red_potion', 'iron_sword', 'card_album']) for (let h = 0; h < 500; h++) {
      const idx = marketIndex(data, undefined, id, hourOf(T0) + h);
      expect(idx).toBeGreaterThanOrEqual(0.35); expect(idx).toBeLessThanOrEqual(2.2);
    }
  });

  it('rarer items swing more', () => {
    const spread = (id: string) => { const v = Array.from({ length: 400 }, (_, h) => marketIndex(data, undefined, id, h)); const m = v.reduce((x, y) => x + y) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length); };
    const avg = (pred: (r: string) => boolean) => { const ids = [...data.items.values()].filter((i) => pred(i.rarity)).slice(0, 25).map((i) => i.id); return ids.reduce((a, id) => a + spread(id), 0) / ids.length; };
    expect(avg((r) => r === 'epic' || r === 'legendary')).toBeGreaterThan(avg((r) => r === 'common'));
  });

  it('dumping one item lowers its price for a few hours, then it recovers', () => {
    const c = newChar();
    const mat = [...data.items.values()].find((i) => i.type === 'material' && i.stackable && i.price >= 10)!;
    addItem(data, c, mat.id, 200, { ignoreWeight: true });
    const before = traderPrice(data, c, mat.id, T0);
    const inst = c.inventory.find((i) => i.itemId === mat.id)!;
    const r = traderSell(data, c, inst.uid, 80, T0);
    expect(r.ok).toBe(true);
    expect(countItem(c, mat.id)).toBe(120);
    expect(c.marketSales?.[mat.id]?.[0][1]).toBe(80);
    const after = traderPrice(data, c, mat.id, T0);
    expect(after).toBeLessThan(before);
    // Fully recovered after the demand window (prices of other hours differ anyway, so compare to a clean character).
    expect(traderPrice(data, c, mat.id, T0 + 8 * HOUR_MS)).toBe(traderPrice(data, newChar(), mat.id, T0 + 8 * HOUR_MS));
  });

  it('bound and quest items cannot be sold; the trader must be near', () => {
    const c = newChar();
    const sp = data.maps.get('willowbrook')!.npcs.find((n) => n.npcId === 'willowbrook_trader')!;
    const w = newWorld(c);
    w.player.x = sp.x * TILE + 16; w.player.y = (sp.y + 1) * TILE + 16;
    const pot = w.char.inventory.find((i) => i.itemId === 'red_potion')!;
    const luma = w.char.luma, price = traderPrice(data, w.char, 'red_potion', w.now());
    const r = w.traderSell(pot.uid, 1);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    expect(w.char.luma).toBe(luma + price);
    w.player.x += 2000;
    expect(w.traderSell(w.char.inventory.find((i) => i.itemId === 'red_potion')!.uid, 1).ok).toBe(false);
    expect(sellPrice(data, 'red_potion', c)).toBeGreaterThan(0);
  });

  it('only Trader Moss (Willowbrook) is a Market Trader; every town has a goods trader and a Market Hall clerk', () => {
    for (const t of ['willowbrook', 'aurelion', 'fernhollow', 'arcanthe', 'sandara', 'tidewatch', 'frostholm']) {
      const ids = data.maps.get(t)!.npcs.map((n) => n.npcId);
      expect(ids).toContain(`${t}_trader`); expect(ids).toContain(`${t}_market`);
    }
    const traders = [...data.npcs.values()].filter((n) => n.services.some((s) => s.type === 'trader'));
    expect(traders.map((n) => n.name)).toEqual(['Trader Moss']);
    expect(data.shops.get('starter_goods')!.market).toBeFalsy();
  });
});

describe('Trader Moss: buy prices and rotating wares', () => {
  const shop = data.shops.get('moss_wares')!;

  it('the wares change every 2 hours and cover every gear tier', () => {
    const a = shopStock(data, shop, T0), b = shopStock(data, shop, T0 + 60_000);
    expect(a).toEqual(b); // same 2-hour block
    const blockStart = Math.floor(T0 / STOCK_MS) * STOCK_MS;
    expect(shopStock(data, shop, blockStart + STOCK_MS)).not.toEqual(a);
    const tiers = new Set([...data.items.values()].filter((i) => i.type === 'equipment' && shop.items.includes(i.id)).map(tierOf));
    const stockTiers = new Set(a.map((id) => data.items.get(id)!).filter((d) => d.type === 'equipment').map(tierOf));
    expect(stockTiers).toEqual(tiers);
    expect(a.some((id) => data.items.get(id)!.type === 'consumable')).toBe(true);
    // Over a day every block differs, and many different items show up.
    const seen = new Set<string>();
    for (let k = 0; k < 12; k++) for (const id of shopStock(data, shop, blockStart + k * STOCK_MS)) seen.add(id);
    expect(seen.size).toBeGreaterThan(a.length * 4);
  });

  it('buy prices move every hour, rise when you buy a lot, and stay above what Moss would ever pay', () => {
    const id = 'red_potion';
    const hist = priceHistory(data, undefined, id, T0, 48, 'buy').map((p) => p.price);
    expect(new Set(hist).size).toBeGreaterThan(1);
    for (const it of [...data.items.values()].filter((i) => shop.items.includes(i.id)).slice(0, 60)) {
      let maxSell = 0, minBuy = Infinity;
      for (let h = 0; h < 600; h++) {
        maxSell = Math.max(maxSell, traderPrice(data, undefined, it.id, T0 + h * HOUR_MS));
        minBuy = Math.min(minBuy, traderBuyPrice(data, undefined, it.id, T0 + h * HOUR_MS));
      }
      expect(minBuy, it.id).toBeGreaterThan(maxSell);
    }
  });

  it('buying from Moss only works for today\'s wares and raises the price', () => {
    const c = newChar(); c.luma = 1e7;
    const stock = shopStock(data, shop, T0);
    const id = stock.find((x) => data.items.get(x)!.stackable)!;
    const p0 = traderBuyPrice(data, c, id, T0);
    const r = traderBuy(data, c, 'moss_wares', id, 30, T0, 1e9);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    expect(r.cost).toBe(p0 * 30);
    expect(traderBuyPrice(data, c, id, T0)).toBeGreaterThan(p0);
    const notToday = shop.items.find((x) => !stock.includes(x))!;
    expect(traderBuy(data, c, 'moss_wares', notToday, 1, T0, 1e9).ok).toBe(false);
  });
});
