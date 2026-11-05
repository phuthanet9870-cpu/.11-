// Runs the real server on a random port with real WebSocket clients.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/server';
import { CASTLE_MAP, EMPERIUM_POS, type ClientMsg, type PresenceInfo, type ServerMsg } from '../../src/net/protocol';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer({ port: 0, dataDir: mkdtempSync(join(tmpdir(), 'veyl-')), woeAlways: true, emperiumHp: 1000, adminToken: 'gm-secret-token' }); });
afterAll(async () => { await srv.close(); });

class Client {
  ws!: WebSocket; inbox: ServerMsg[] = [];
  async open() { this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}`); this.ws.on('message', (d) => this.inbox.push(JSON.parse(String(d)))); await new Promise((r) => this.ws.on('open', r)); return this; }
  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }
  async wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 2000): Promise<Extract<ServerMsg, { t: T }>> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.inbox.findIndex((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timeout waiting for ${t}; inbox: ${JSON.stringify(this.inbox.slice(-5))}`);
  }
}
const info = (name: string, mapId = 'aurelion', x = 500, y = 500): PresenceInfo => ({ name, classId: 'knight', level: 30, mapId, x, y, dir: 'down', anim: 'idle', look: { appearance: {}, outfit: {}, weapon: null }, hpPct: 1, pvp: { level: 30, pdef: 20, mdef: 10, flee: 40, perfectDodge: 1, element: 'neutral' } });
async function player(user: string, mapId?: string, x?: number, y?: number) {
  const c = await new Client().open();
  c.send({ t: 'register', user, pass: 'secret123' }); await c.wait('welcome');
  c.send({ t: 'join', info: info(user, mapId, x, y) }); await c.wait('joined');
  return c;
}

describe('Veyloria server', () => {
  it('accounts: register, wrong password refused, login works', async () => {
    const a = await new Client().open();
    a.send({ t: 'register', user: 'Acct1', pass: 'hunter22' }); await a.wait('welcome');
    a.send({ t: 'register', user: 'acct1', pass: 'whatever1' }); expect((await a.wait('error')).text).toMatch(/taken/);
    a.ws.close();
    const b = await new Client().open();
    b.send({ t: 'login', user: 'Acct1', pass: 'nope123' }); expect((await b.wait('error')).text).toMatch(/Wrong/);
    b.send({ t: 'login', user: 'Acct1', pass: 'hunter22' }); expect((await b.wait('welcome')).user).toBe('Acct1');
    b.ws.close();
  });

  it('presence and chat: map, whisper, rate limit', async () => {
    const a = await player('Alia'), b = await player('Bran');
    expect((await a.wait('player', (m) => m.info.name === 'Bran')).info.mapId).toBe('aurelion');
    b.send({ t: 'move', mapId: 'aurelion', x: 600, y: 520, dir: 'left', anim: 'walk', hpPct: 1, level: 30 });
    expect((await a.wait('playerMove')).x).toBe(600);
    a.send({ t: 'chat', channel: 'map', text: 'hello' }); expect((await b.wait('chat')).text).toBe('hello');
    a.send({ t: 'chat', channel: 'whisper', to: 'Bran', text: 'psst' }); expect((await b.wait('chat', (m) => m.channel === 'whisper')).text).toBe('psst');
    for (let i = 0; i < 6; i++) a.send({ t: 'chat', channel: 'map', text: `spam${i}` });
    expect((await a.wait('error')).text).toMatch(/too fast/);
    a.ws.close(); b.ws.close();
  });

  it('party: invite, accept, even EXP share within 15 levels on the same map', async () => {
    const a = await player('Pax'), b = await player('Pbx'), c = await player('Pcx', 'clover_hills');
    a.send({ t: 'party.invite', name: 'Pbx' });
    const inv = await b.wait('party.invite');
    b.send({ t: 'party.accept', partyId: inv.partyId });
    expect((await a.wait('party.update', (m) => (m.party?.members.length ?? 0) === 2)).party!.leader).toBe('Pax');
    a.send({ t: 'party.invite', name: 'Pcx' }); c.send({ t: 'party.accept', partyId: (await c.wait('party.invite')).partyId });
    await a.wait('party.update', (m) => (m.party?.members.length ?? 0) === 3);
    a.send({ t: 'party.exp', base: 900, job: 600, mapId: 'aurelion', monsterLevel: 30 });
    const share = await b.wait('party.exp');
    expect([share.base, share.job]).toEqual([450, 300]); // Pc is on another map
    expect(c.inbox.some((m) => m.t === 'party.exp')).toBe(false);
    a.ws.close(); b.ws.close(); c.ws.close();
  });

  it('trade: both sides lock and confirm, then each gets the other offer', async () => {
    const a = await player('Tax'), b = await player('Tbx', 'aurelion', 520, 500);
    a.send({ t: 'trade.request', name: 'Tbx' }); b.send({ t: 'trade.accept', from: (await b.wait('trade.request')).from });
    await a.wait('trade.open'); await b.wait('trade.open');
    const sword = { uid: 'x1', itemId: 'iron_sword', qty: 1, refine: 4 };
    a.send({ t: 'trade.offer', items: [sword], luma: 0 }); b.send({ t: 'trade.offer', items: [], luma: 5000 });
    a.send({ t: 'trade.confirm' }); expect((await a.wait('error')).text).toMatch(/lock/);
    a.send({ t: 'trade.lock' }); b.send({ t: 'trade.lock' });
    await a.wait('trade.update', (m) => m.mine.locked && m.theirs.locked);
    await b.wait('trade.update', (m) => m.mine.locked && m.theirs.locked);
    a.send({ t: 'trade.confirm' }); b.send({ t: 'trade.confirm' });
    const ca = await a.wait('trade.complete'), cb = await b.wait('trade.complete');
    expect(ca.receive.luma).toBe(5000);
    expect(cb.receive.items[0]).toMatchObject({ itemId: 'iron_sword', refine: 4 });
    a.ws.close(); b.ws.close();
  });

  it('vending: the seller confirms each sale; the buyer then receives the item', async () => {
    const s = await player('Vsx'), b = await player('Vbx', 'aurelion', 540, 500);
    const inst = { uid: 'p1', itemId: 'red_potion', qty: 20 };
    s.send({ t: 'vend.open', title: 'Cheap pots', listings: [{ uid: 'p1', itemId: 'red_potion', qty: 20, price: 30, inst }] });
    expect((await b.wait('player', (m) => m.info.name === 'Vsx' && !!m.info.vending)).info.vending).toBe('Cheap pots');
    b.send({ t: 'vend.view', seller: 'Vsx' }); expect((await b.wait('vend.list')).listings[0].qty).toBe(20);
    b.send({ t: 'vend.buy', seller: 'Vsx', uid: 'p1', qty: 5 });
    const sale = await s.wait('vend.sale');
    expect(sale).toMatchObject({ buyer: 'Vbx', qty: 5, price: 150 });
    s.send({ t: 'vend.saleResult', buyer: 'Vbx', uid: 'p1', qty: 5, ok: true, inst: { ...inst, qty: 5 }, price: 150 });
    expect(await b.wait('vend.bought')).toMatchObject({ qty: 5, price: 150 });
    expect((await b.wait('vend.list')).listings[0].qty).toBe(15);
    b.send({ t: 'vend.buy', seller: 'Vsx', uid: 'p1', qty: 99 }); expect((await b.wait('error')).text).toMatch(/Not enough/);
    s.ws.close(); b.ws.close();
  });

  it('guilds, PvP only in PvP maps, and the guild war over the Emperium', async () => {
    const a = await player('Gax', CASTLE_MAP, EMPERIUM_POS.x, EMPERIUM_POS.y + 60), b = await player('Gbx', CASTLE_MAP, EMPERIUM_POS.x + 40, EMPERIUM_POS.y + 60);
    a.send({ t: 'guild.create', name: 'Dawn Wolves' }); expect((await a.wait('guild.update')).guild!.name).toBe('Dawn Wolves');
    a.send({ t: 'guild.invite', name: 'Gbx' }); b.send({ t: 'guild.accept', guildId: (await b.wait('guild.invite')).guildId });
    expect((await a.wait('guild.update', (m) => m.guild?.members.length === 2)).guild!.members).toEqual(['Gax', 'Gbx']);
    // Same guild: no friendly fire in the castle.
    a.send({ t: 'pvp.hit', target: 'Gbx', damage: 100, crit: false });
    const c = await player('Gcx', CASTLE_MAP, EMPERIUM_POS.x, EMPERIUM_POS.y + 80);
    a.send({ t: 'pvp.hit', target: 'Gcx', damage: 123, crit: true });
    expect((await c.wait('pvp.damage')).damage).toBe(123);
    expect(b.inbox.some((m) => m.t === 'pvp.damage')).toBe(false);
    // Emperium: guild members break it and their guild takes the castle.
    for (let i = 0; i < 5; i++) a.send({ t: 'woe.hit', damage: 250 });
    const st = await a.wait('woe.state', (m) => m.woe.owner === 'Dawn Wolves');
    expect(st.woe.emperiumHp).toBe(st.woe.emperiumMax);
    c.send({ t: 'woe.hit', damage: 100 }); expect((await c.wait('error')).text).toMatch(/guild/);
    // Outside PvP maps nobody can be hit.
    const d = await player('Gdx'), e = await player('Gex');
    d.send({ t: 'pvp.hit', target: 'Gex', damage: 50, crit: false }); expect((await d.wait('error')).text).toMatch(/PvP/);
    for (const x of [a, b, c, d, e]) x.ws.close();
  });

  it('server GM: needs the admin token; announce, players, kick, woe close/open', async () => {
    const gmc = await player('GmBoss'), b = await player('Victim');
    gmc.send({ t: 'gm', token: 'wrong', cmd: 'announce', args: ['hi'] });
    expect((await gmc.wait('gm.result')).ok).toBe(false);
    gmc.send({ t: 'gm', token: 'gm-secret-token', cmd: 'announce', args: ['Maintenance', 'soon'] });
    expect((await b.wait('chat', (m) => m.from === 'GM')).text).toBe('Maintenance soon');
    gmc.send({ t: 'gm', token: 'gm-secret-token', cmd: 'players', args: [] });
    expect((await gmc.wait('gm.result', (m) => /Victim/.test(m.text))).ok).toBe(true);
    gmc.send({ t: 'gm', token: 'gm-secret-token', cmd: 'woe', args: ['close'] });
    expect((await b.wait('woe.state', (m) => !m.woe.active)).woe.active).toBe(false);
    gmc.send({ t: 'gm', token: 'gm-secret-token', cmd: 'woe', args: ['auto'] });
    await b.wait('woe.state', (m) => m.woe.active);
    gmc.send({ t: 'gm', token: 'gm-secret-token', cmd: 'kick', args: ['Victim', 'bye'] });
    expect((await b.wait('kicked')).reason).toBe('bye');
    if (b.ws.readyState !== WebSocket.CLOSED) await new Promise((r) => b.ws.on('close', r));
    gmc.ws.close();
  });

  it('Market Hall: list, real players buy, seller paid (also when offline), sale history, cancel returns the item', async () => {
    const a = await player('MkSeller'), b = await player('MkBuyer');
    const inst = { uid: 'u-sword', itemId: 'iron_sword', qty: 1, refine: 5 };
    a.send({ t: 'market.list', inst, qty: 1, price: 777 });
    const listed = (await a.wait('market.listed')).listing;
    expect(listed.price).toBe(777);
    a.send({ t: 'market.list', inst, qty: 1, price: 5 });
    expect((await a.wait('error')).text).toMatch(/already listed/);
    b.send({ t: 'market.browse' });
    const ls = (await b.wait('market.listings')).listings;
    expect(ls.some((l) => l.id === listed.id)).toBe(true);
    a.send({ t: 'market.buy', id: listed.id, qty: 1 });
    expect((await a.wait('error')).text).toMatch(/own listing/);
    b.send({ t: 'market.buy', id: listed.id, qty: 1 });
    const got = await b.wait('market.bought');
    expect(got.inst.refine).toBe(5); expect(got.total).toBe(777);
    expect((await a.wait('market.sold')).total).toBe(777);
    b.send({ t: 'market.history', itemId: 'iron_sword' });
    expect((await b.wait('market.history')).points.at(-1)?.[1]).toBe(777);
    // Seller offline: paid on the next join.
    a.send({ t: 'market.list', inst: { uid: 'u-pot', itemId: 'red_potion', qty: 20 }, qty: 20, price: 30 });
    const l2 = (await a.wait('market.listed')).listing;
    a.ws.close(); await new Promise((r) => setTimeout(r, 100));
    b.send({ t: 'market.buy', id: l2.id, qty: 5 });
    await b.wait('market.bought');
    const a2 = await new Client().open();
    a2.send({ t: 'login', user: 'MkSeller', pass: 'secret123' }); await a2.wait('welcome');
    a2.send({ t: 'join', info: info('MkSeller') }); await a2.wait('joined');
    expect((await a2.wait('market.sold')).total).toBe(150);
    // Cancel returns the remaining 15.
    a2.send({ t: 'market.cancel', id: l2.id });
    expect((await a2.wait('market.returned')).qty).toBe(15);
    a2.ws.close(); b.ws.close();
  });
});
