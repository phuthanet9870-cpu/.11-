// Wire protocol between the game client and the Veyloria server (JSON over
// WebSocket). The server handles accounts, presence, chat, parties, guilds,
// trades, vending, PvP hits and the guild war (castle Emperium). Character
// stats and inventories stay on each client — the server relays and checks
// what it can (online, same map, distance, listing quantities) but does not
// own character data, so it is not cheat-proof.
import type { ItemInstance } from '../core/types';

export interface Look { appearance: unknown; outfit: unknown; weapon: string | null; shield?: boolean }
export interface PresenceInfo {
  name: string; classId: string; level: number; mapId: string; x: number; y: number; dir: string; anim: string;
  look: Look; guild?: string; party?: string; hpPct: number; vending?: string;
  /** Achievement title shown under the name. */
  title?: string;
  /** Combat numbers other players need to hit this player in PvP. */
  pvp: { level: number; pdef: number; mdef: number; flee: number; perfectDodge: number; element: string };
}
export interface PartyInfo { id: string; leader: string; members: { name: string; level: number; mapId: string; hpPct: number; online: boolean }[] }
export interface GuildInfo { id: string; name: string; master: string; members: string[]; online: string[]; notice: string }
export interface Listing { uid: string; itemId: string; qty: number; price: number; inst: ItemInstance }
export interface TradeOffer { items: ItemInstance[]; luma: number; locked: boolean; confirmed: boolean }
/** A Market Hall listing: the item is held by the server until someone buys it or the seller cancels. */
export interface MarketListing { id: string; seller: string; itemId: string; inst: ItemInstance; qty: number; price: number; listedAt: number }
export const MARKET_MAX_LISTINGS = 10;
export interface WoeState { active: boolean; owner: string | null; emperiumHp: number; emperiumMax: number; endsAt: number | null }

export type ClientMsg =
  | { t: 'register'; user: string; pass: string }
  | { t: 'login'; user: string; pass: string }
  | { t: 'join'; info: PresenceInfo }
  | { t: 'move'; mapId: string; x: number; y: number; dir: string; anim: string; hpPct: number; level: number; title?: string }
  | { t: 'chat'; channel: 'map' | 'global' | 'party' | 'guild' | 'whisper'; to?: string; text: string }
  | { t: 'party.invite'; name: string } | { t: 'party.accept'; partyId: string } | { t: 'party.leave' }
  | { t: 'party.exp'; base: number; job: number; mapId: string; monsterLevel: number }
  | { t: 'guild.create'; name: string } | { t: 'guild.invite'; name: string } | { t: 'guild.accept'; guildId: string } | { t: 'guild.leave' }
  | { t: 'trade.request'; name: string } | { t: 'trade.accept'; from: string } | { t: 'trade.offer'; items: ItemInstance[]; luma: number }
  | { t: 'trade.lock' } | { t: 'trade.confirm' } | { t: 'trade.cancel' }
  | { t: 'vend.open'; title: string; listings: Listing[] } | { t: 'vend.close' } | { t: 'vend.view'; seller: string }
  | { t: 'vend.buy'; seller: string; uid: string; qty: number } | { t: 'vend.saleResult'; buyer: string; uid: string; qty: number; ok: boolean; inst?: ItemInstance; price?: number }
  | { t: 'pvp.hit'; target: string; damage: number; crit: boolean } | { t: 'pvp.died'; killer: string }
  | { t: 'woe.hit'; damage: number }
  /** Server GM command; only works with the server's --admin-token. */
  | { t: 'gm'; token: string; cmd: string; args: string[] }
  | { t: 'market.list'; inst: ItemInstance; qty: number; price: number } | { t: 'market.cancel'; id: string } | { t: 'market.browse' }
  | { t: 'market.buy'; id: string; qty: number } | { t: 'market.history'; itemId: string };

export type ServerMsg =
  | { t: 'error'; text: string }
  | { t: 'welcome'; user: string }
  | { t: 'joined'; you: string; players: PresenceInfo[]; woe: WoeState; guild: GuildInfo | null }
  | { t: 'player'; info: PresenceInfo } | { t: 'playerMove'; name: string; mapId: string; x: number; y: number; dir: string; anim: string; hpPct: number; level: number; title?: string }
  | { t: 'playerLeave'; name: string }
  | { t: 'chat'; channel: string; from: string; text: string }
  | { t: 'party.invite'; from: string; partyId: string } | { t: 'party.update'; party: PartyInfo | null } | { t: 'party.exp'; base: number; job: number; from: string }
  | { t: 'guild.invite'; from: string; guildId: string; name: string } | { t: 'guild.update'; guild: GuildInfo | null }
  | { t: 'trade.request'; from: string } | { t: 'trade.open'; with: string } | { t: 'trade.update'; mine: TradeOffer; theirs: TradeOffer }
  | { t: 'trade.complete'; give: TradeOffer; receive: TradeOffer } | { t: 'trade.closed'; reason: string }
  | { t: 'vend.list'; seller: string; title: string; listings: Listing[] } | { t: 'vend.sale'; buyer: string; uid: string; qty: number; price: number }
  | { t: 'vend.bought'; seller: string; inst: ItemInstance; qty: number; price: number }
  | { t: 'pvp.damage'; from: string; damage: number; crit: boolean } | { t: 'pvp.kill'; killer: string; victim: string }
  | { t: 'woe.state'; woe: WoeState }
  | { t: 'gm.result'; ok: boolean; text: string } | { t: 'kicked'; reason: string }
  | { t: 'market.listings'; listings: MarketListing[] } | { t: 'market.listed'; listing: MarketListing }
  | { t: 'market.returned'; inst: ItemInstance; qty: number; reason: string }
  | { t: 'market.bought'; inst: ItemInstance; qty: number; total: number; seller: string }
  | { t: 'market.sold'; itemId: string; qty: number; total: number; buyer: string }
  | { t: 'market.history'; itemId: string; points: [number, number][] };

/** Maps where players may fight each other, and the guild-war castle. */
export const PVP_MAPS = ['proving_grounds', 'castle_veyl'];
export const CASTLE_MAP = 'castle_veyl';
export const EMPERIUM_POS = { x: 20 * 32 + 16, y: 8 * 32 + 16 };
export const PARTY_LEVEL_GAP = 15;
export const GUILD_CREATE_COST = 50000;
