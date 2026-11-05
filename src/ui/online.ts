// Online play controller: connects the NetClient to the running World and the
// UI. It keeps the social state (players nearby, party, guild, trade, shops,
// guild war), sends presence ~8 times a second, turns world events (PvP hits,
// Emperium hits, party EXP) into server messages, and applies what the server
// sends back (other players, chat, shared EXP, completed trades and sales).
import type { App } from './app';
import { NetClient } from '../net/client';
import { CASTLE_MAP, EMPERIUM_POS, GUILD_CREATE_COST, PARTY_LEVEL_GAP, type GuildInfo, type Listing, type MarketListing, type PartyInfo, type PresenceInfo, type ServerMsg, type TradeOffer, type WoeState } from '../net/protocol';
import type { WorldEvent } from '../core/world';
import type { ItemInstance } from '../core/types';
import { addItem, findInstance, newUid, removeByUid, removeItem } from '../core/inventory';
import { lookForCharacter } from './screens';
import { titleOf } from '../core/achievements';

export class Online {
  net = new NetClient();
  players = new Map<string, PresenceInfo>();
  party: PartyInfo | null = null;
  guild: GuildInfo | null = null;
  woe: WoeState | null = null;
  trade: { with: string; mine: TradeOffer; theirs: TradeOffer } | null = null;
  shopView: { seller: string; title: string; listings: Listing[] } | null = null;
  myShop: { title: string; listings: Listing[] } | null = null;
  invites: { kind: 'party' | 'guild' | 'trade'; from: string; id: string; label: string }[] = [];
  joined = false;
  private lastSent = 0;

  private unhook: (() => void) | null = null;
  constructor(private app: App) {
    this.net.onMessage((m) => this.onMessage(m));
    // Presence runs on a timer, not on rendered frames, so a background tab still updates.
    setInterval(() => this.tick(), 120);
  }

  /** Listen to the current world's events as they happen. */
  private hookWorld() {
    this.unhook?.();
    this.unhook = this.world ? this.world.onEvent((e) => this.onWorldEvents([e])) : null;
  }

  get world() { return this.app.world; }
  private log(text: string, ch: 'chat' | 'system' | 'quest' | 'error' | 'loot' = 'system') { this.app.hud?.log(text, ch); this.app.markWindowsDirty(); }

  async connect(url: string, user: string, pass: string, register: boolean) {
    await this.net.connect(url);
    this.net.send(register ? { t: 'register', user, pass } : { t: 'login', user, pass });
  }

  disconnect() { this.net.disconnect(); this.reset(); }

  private reset() {
    this.players.clear(); this.party = null; this.guild = null; this.trade = null; this.shopView = null; this.myShop = null; this.invites = []; this.joined = false;
    if (this.world) { this.world.remotes.clear(); this.world.partyShareWith = 0; this.world.expBonusPct = 0; }
  }

  presence(): PresenceInfo {
    const w = this.world, c = w.char, s = w.stats;
    return {
      name: c.name, classId: c.classId, level: c.baseLevel, mapId: w.map.def.id, x: w.player.x, y: w.player.y, dir: w.player.dir, anim: w.player.anim,
      look: lookForCharacter(w.data, c), hpPct: c.hp / s.maxHp, title: titleOf(c),
      pvp: { level: c.baseLevel, pdef: s.pdef, mdef: s.mdef, flee: s.flee, perfectDodge: s.perfectDodge, element: 'neutral' },
    };
  }

  /** Called when a character enters the world (and after login). */
  join() { if (this.net.online && this.world) { this.hookWorld(); this.net.send({ t: 'join', info: this.presence() }); } }

  /** Per frame: presence updates and remote actors. */
  tick() {
    const w = this.world;
    if (!w || !this.net.online || !this.joined) return;
    const t = performance.now();
    if (t - this.lastSent > 100) {
      this.lastSent = t;
      this.net.send({ t: 'move', mapId: w.map.def.id, x: Math.round(w.player.x), y: Math.round(w.player.y), dir: w.player.dir, anim: w.player.anim, hpPct: w.char.hp / w.stats.maxHp, level: w.char.baseLevel, title: titleOf(w.char) });
    }
    // Remote actors for drawing / PvP: players on this map, plus the Emperium during the guild war.
    for (const id of [...w.remotes.keys()]) if (id !== 'emperium' && this.players.get(id)?.mapId !== w.map.def.id) w.remotes.delete(id);
    for (const p of this.players.values()) {
      if (p.mapId !== w.map.def.id) continue;
      const r = w.remotes.get(p.name);
      if (r) Object.assign(r, { x: p.x, y: p.y, dir: p.dir, anim: p.anim, hpPct: p.hpPct, info: p });
      else w.remotes.set(p.name, { id: p.name, name: p.name, x: p.x, y: p.y, dir: p.dir as never, anim: p.anim, hpPct: p.hpPct, info: p });
    }
    if (w.map.def.id === CASTLE_MAP && this.woe?.active) {
      w.remotes.set('emperium', { id: 'emperium', name: `Emperium${this.woe.owner ? ` (${this.woe.owner})` : ''}`, x: EMPERIUM_POS.x, y: EMPERIUM_POS.y, dir: 'down', anim: 'idle', hpPct: this.woe.emperiumHp / this.woe.emperiumMax, info: null, emperium: true });
    } else w.remotes.delete('emperium');
    // Even EXP share: party members on this map within the level gap.
    w.partyShareWith = this.party ? this.party.members.filter((m) => m.online && m.name !== w.char.name && m.mapId === w.map.def.id && Math.abs(m.level - w.char.baseLevel) <= PARTY_LEVEL_GAP).length : 0;
    w.expBonusPct = this.woe?.owner && this.guild && this.woe.owner === this.guild.name ? 10 : 0;
  }

  /** World events that go to the server. */
  onWorldEvents(events: WorldEvent[]) {
    if (!this.net.online) return;
    for (const e of events) {
      if (e.type === 'remoteHit') this.net.send(e.target === 'emperium' ? { t: 'woe.hit', damage: e.damage } : { t: 'pvp.hit', target: e.target, damage: e.damage, crit: e.crit });
      if (e.type === 'pvpDeath') this.net.send({ t: 'pvp.died', killer: e.killer });
      if (e.type === 'partyExp') this.net.send({ t: 'party.exp', base: e.base, job: e.job, mapId: e.mapId, monsterLevel: e.monsterLevel });
      if (e.type === 'mapChanged' && this.myShop) this.closeShop();
    }
  }

  // ------------------------------------------------------------ actions (used by the Social window)
  chat(text: string) {
    if (!this.net.online) return false;
    const m = /^\/(p|g|w|gl)\s+(.*)$/.exec(text);
    if (m?.[1] === 'w') { const [to, ...rest] = m[2].split(' '); this.net.send({ t: 'chat', channel: 'whisper', to, text: rest.join(' ') }); return true; }
    if (m) { this.net.send({ t: 'chat', channel: m[1] === 'p' ? 'party' : m[1] === 'g' ? 'guild' : 'global', text: m[2] }); return true; }
    if (text.startsWith('/')) return false;
    this.net.send({ t: 'chat', channel: 'map', text });
    return true;
  }
  /** Server GM command (needs the server's admin token). Returns false when offline. */
  serverGm(token: string, cmd: string, args: string[]) {
    if (!this.net.online) return false;
    this.net.send({ t: 'gm', token, cmd, args });
    return true;
  }
  // ------------------------------------------------------------ Market Hall (player-to-player market)
  marketListings: MarketListing[] = [];
  marketHistory = new Map<string, [number, number][]>();
  get isOnline() { return this.net.online && this.joined; }
  marketBrowse() { if (this.isOnline) this.net.send({ t: 'market.browse' }); }
  marketHistoryOf(itemId: string) { if (this.isOnline) this.net.send({ t: 'market.history', itemId }); }
  marketList(uid: string, qty: number, price: number) {
    const w = this.world, inst = w.char.inventory.find((i) => i.uid === uid);
    if (!inst) return;
    const def = w.data.items.get(inst.itemId)!;
    if (inst.locked || inst.bound || def.bound || def.type === 'quest') { this.log('That item cannot be sold.', 'error'); return; }
    this.net.send({ t: 'market.list', inst: { ...inst }, qty, price });
  }
  marketCancel(id: string) { this.net.send({ t: 'market.cancel', id }); }
  marketBuy(l: MarketListing, qty: number) {
    if (this.world.char.luma < l.price * qty) { this.log('Not enough Luma.', 'error'); return; }
    this.net.send({ t: 'market.buy', id: l.id, qty });
  }

  partyInvite(name: string) { this.net.send({ t: 'party.invite', name }); }
  partyLeave() { this.net.send({ t: 'party.leave' }); }
  guildCreate(name: string) {
    const c = this.world.char;
    if (c.luma < GUILD_CREATE_COST) return this.log(`Founding a guild costs ${GUILD_CREATE_COST.toLocaleString()} Luma.`, 'error');
    this.pendingGuildFee = true;
    this.net.send({ t: 'guild.create', name });
  }
  private pendingGuildFee = false;
  guildInvite(name: string) { this.net.send({ t: 'guild.invite', name }); }
  guildLeave() { this.net.send({ t: 'guild.leave' }); }
  accept(inv: Online['invites'][number]) {
    this.invites = this.invites.filter((x) => x !== inv);
    if (inv.kind === 'party') this.net.send({ t: 'party.accept', partyId: inv.id });
    if (inv.kind === 'guild') this.net.send({ t: 'guild.accept', guildId: inv.id });
    if (inv.kind === 'trade') this.net.send({ t: 'trade.accept', from: inv.from });
    this.app.markWindowsDirty();
  }
  tradeRequest(name: string) { this.net.send({ t: 'trade.request', name }); }
  /** Offer items (by uid and quantity) and Luma. Items stay in your bag until the trade completes. */
  tradeOffer(items: { uid: string; qty: number }[], luma: number) {
    const c = this.world.char;
    if (luma > c.luma) return this.log('You do not have that much Luma.', 'error');
    const list: ItemInstance[] = [];
    for (const it of items) {
      const inst = findInstance(c, it.uid);
      if (!inst || inst.locked || it.qty < 1 || it.qty > inst.qty) return this.log('Invalid trade item.', 'error');
      list.push({ ...inst, qty: it.qty });
    }
    this.net.send({ t: 'trade.offer', items: list, luma });
  }
  tradeLock() { this.net.send({ t: 'trade.lock' }); }
  tradeConfirm() {
    // Re-check that what we offered is still in the bag before the final confirm.
    const c = this.world.char, mine = this.trade?.mine;
    if (mine && (mine.luma > c.luma || mine.items.some((i) => (findInstance(c, i.uid)?.qty ?? 0) < i.qty))) { this.net.send({ t: 'trade.cancel' }); return this.log('Your offered items changed; trade cancelled.', 'error'); }
    this.net.send({ t: 'trade.confirm' });
  }
  tradeCancel() { this.net.send({ t: 'trade.cancel' }); }
  openShop(title: string, items: { uid: string; qty: number; price: number }[]) {
    const c = this.world.char;
    const listings: Listing[] = [];
    for (const it of items) {
      const inst = findInstance(c, it.uid);
      if (!inst || it.qty < 1 || it.qty > inst.qty || !(it.price > 0)) return this.log('Invalid shop listing.', 'error');
      listings.push({ uid: it.uid, itemId: inst.itemId, qty: it.qty, price: Math.floor(it.price), inst: { ...inst, qty: it.qty } });
    }
    this.myShop = { title, listings };
    this.net.send({ t: 'vend.open', title, listings });
  }
  closeShop() { this.myShop = null; this.net.send({ t: 'vend.close' }); }
  viewShop(seller: string) { this.net.send({ t: 'vend.view', seller }); }
  buy(seller: string, uid: string, qty: number, price: number) {
    if (this.world.char.luma < price * qty) return this.log('Not enough Luma.', 'error');
    this.net.send({ t: 'vend.buy', seller, uid, qty });
  }

  /** Remove `inst.qty` of an offered item from the bag (by uid, falling back to item id for stacks). */
  private takeOut(inst: ItemInstance): boolean {
    const c = this.world.char;
    const own = findInstance(c, inst.uid);
    if (own && own.qty >= inst.qty) return removeByUid(c, inst.uid, inst.qty).ok;
    return removeItem(c, inst.itemId, inst.qty).ok;
  }
  private putIn(inst: ItemInstance) {
    const c = this.world.char, d = this.world.data.items.get(inst.itemId);
    if (!d) return;
    if (d.stackable) addItem(this.world.data, c, inst.itemId, inst.qty, { ignoreWeight: true });
    else c.inventory.push({ ...inst, uid: newUid(), locked: false });
  }

  // ------------------------------------------------------------ server messages
  private onMessage(m: ServerMsg) {
    const w = this.world;
    switch (m.t) {
      case 'error': this.log(`[Server] ${m.text}`, 'error'); break;
      case 'welcome': this.log(`Logged in as ${m.user}.`, 'system'); this.join(); break;
      case 'joined':
        this.joined = true; this.players.clear();
        for (const p of m.players) this.players.set(p.name, p);
        this.woe = m.woe; this.guild = m.guild;
        this.log(`Online: ${m.players.length} other player${m.players.length === 1 ? '' : 's'} connected. Chat: plain text = map, /p party, /g guild, /gl global, /w name whisper.`, 'system');
        break;
      case 'player': this.players.set(m.info.name, m.info); this.app.markWindowsDirty(); break;
      case 'playerMove': { const p = this.players.get(m.name); if (p) Object.assign(p, m); break; }
      case 'playerLeave': this.players.delete(m.name); w?.remotes.delete(m.name); this.app.markWindowsDirty(); break;
      case 'chat': this.log(`[${m.channel}] ${m.from}: ${m.text}`, 'chat'); break;
      case 'party.invite': this.invites.push({ kind: 'party', from: m.from, id: m.partyId, label: `${m.from} invites you to a party` }); this.log(`${m.from} invites you to a party (Social window, G).`, 'quest'); break;
      case 'party.update': {
        const changed = JSON.stringify(this.party) !== JSON.stringify(m.party);
        this.party = m.party;
        if (changed) this.app.markWindowsDirty();
        break;
      }
      case 'party.exp': w?.receivePartyExp(m.base, m.job, m.from); break;
      case 'guild.invite': this.invites.push({ kind: 'guild', from: m.from, id: m.guildId, label: `${m.from} invites you to the guild ${m.name}` }); this.log(`${m.from} invites you to the guild ${m.name} (Social window, G).`, 'quest'); break;
      case 'guild.update':
        if (this.pendingGuildFee && m.guild && m.guild.master === w?.char.name) { w.char.luma -= GUILD_CREATE_COST; this.pendingGuildFee = false; this.log(`You founded the guild ${m.guild.name}.`, 'quest'); }
        this.guild = m.guild; this.app.markWindowsDirty(); break;
      case 'trade.request': this.invites.push({ kind: 'trade', from: m.from, id: m.from, label: `${m.from} wants to trade` }); this.log(`${m.from} wants to trade (Social window, G).`, 'quest'); break;
      case 'trade.open': this.trade = { with: m.with, mine: { items: [], luma: 0, locked: false, confirmed: false }, theirs: { items: [], luma: 0, locked: false, confirmed: false } }; this.app.windows.open('social'); break;
      case 'trade.update': if (this.trade) { this.trade.mine = m.mine; this.trade.theirs = m.theirs; } this.app.markWindowsDirty(); break;
      case 'trade.complete': {
        if (!w) break;
        for (const it of m.give.items) this.takeOut(it);
        w.char.luma = w.char.luma - m.give.luma + m.receive.luma;
        for (const it of m.receive.items) this.putIn(it);
        this.log(`Trade complete with ${this.trade?.with ?? 'partner'}.`, 'loot');
        this.trade = null; w.invalidateStats(); this.app.markWindowsDirty();
        break;
      }
      case 'trade.closed': this.trade = null; this.log(m.reason, 'system'); break;
      case 'vend.list': this.shopView = { seller: m.seller, title: m.title, listings: m.listings }; this.app.windows.open('social'); this.app.markWindowsDirty(); break;
      case 'vend.sale': {
        // We are the seller: check the item is still here, take it out, take the money.
        const l = this.myShop?.listings.find((x) => x.uid === m.uid);
        const ok = !!w && !!l && (findInstance(w.char, m.uid)?.qty ?? 0) >= m.qty;
        let inst: ItemInstance | undefined;
        if (ok && w && l) { inst = { ...findInstance(w.char, m.uid)!, qty: m.qty }; removeByUid(w.char, m.uid, m.qty); w.char.luma += m.price; l.qty -= m.qty; this.log(`Sold ${m.qty}× ${w.data.items.get(l.itemId)?.name} to ${m.buyer} for ${m.price} Luma.`, 'loot'); }
        this.net.send({ t: 'vend.saleResult', buyer: m.buyer, uid: m.uid, qty: m.qty, ok, inst, price: m.price });
        if (this.myShop) this.myShop.listings = this.myShop.listings.filter((x) => x.qty > 0);
        if (this.myShop && !this.myShop.listings.length) this.myShop = null;
        this.app.markWindowsDirty();
        break;
      }
      case 'vend.bought': if (w) { w.char.luma -= m.price; this.putIn({ ...m.inst, qty: m.qty }); this.log(`Bought ${m.qty}× ${w.data.items.get(m.inst.itemId)?.name} from ${m.seller} for ${m.price} Luma.`, 'loot'); } break;
      case 'pvp.damage': w?.receivePvpHit(m.from, m.damage, m.crit); break;
      case 'pvp.kill': this.log(`⚔ ${m.killer} defeated ${m.victim}.`, 'quest'); break;
      case 'woe.state': this.woe = m.woe; this.app.markWindowsDirty(); break;
      case 'gm.result': this.log(`[Server GM] ${m.text}`, m.ok ? 'system' : 'error'); break;
      case 'kicked': this.log(`Disconnected: ${m.reason}`, 'error'); break;
      case 'market.listings': this.marketListings = m.listings; this.app.markWindowsDirty(); break;
      case 'market.history': this.marketHistory.set(m.itemId, m.points); this.app.markWindowsDirty(); break;
      case 'market.listed': {
        // The server holds the goods now: take them out of the bag (or cancel if they are gone).
        if (!w) break;
        const inst = w.char.inventory.find((i) => i.uid === m.listing.inst.uid);
        if (!inst || inst.qty < m.listing.qty) { this.net.send({ t: 'market.cancel', id: m.listing.id }); break; }
        removeByUid(w.char, inst.uid, m.listing.qty);
        w.afterInventoryChange();
        this.log(`Listed ${m.listing.qty}× ${w.data.items.get(m.listing.itemId)?.name} for ${m.listing.price.toLocaleString()} Luma each.`, 'loot');
        this.marketBrowse();
        break;
      }
      case 'market.returned': if (w) { this.putIn({ ...m.inst, qty: m.qty }); this.log(`${m.reason} ${m.qty}× ${w.data.items.get(m.inst.itemId)?.name} is back in your bag.`, 'loot'); this.marketBrowse(); } break;
      case 'market.bought': if (w) { w.char.luma -= m.total; this.putIn({ ...m.inst, qty: m.qty }); this.log(`Bought ${m.qty}× ${w.data.items.get(m.inst.itemId)?.name} from ${m.seller} for ${m.total.toLocaleString()} Luma.`, 'loot'); this.marketBrowse(); } break;
      case 'market.sold': if (w) { w.char.luma += m.total; this.log(`Market Hall: ${m.buyer} bought ${m.qty}× ${w.data.items.get(m.itemId)?.name} — +${m.total.toLocaleString()} Luma.`, 'loot'); this.app.markWindowsDirty(); } break;
    }
  }
}
