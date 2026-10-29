// Two-player end-to-end test: the real Veyloria server plus two browser
// players (separate browser contexts = separate saves). Drives the Social
// window and checks presence, chat, party EXP share, trade, vending, PvP and
// the guild war. Run with `npm run test:online` (builds first).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'tests/e2e/screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 4174, WS = 7272;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const until = (proc, text, ms = 30000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout waiting for "${text}"`)), ms);
  const on = (d) => { if (String(d).includes(text)) { clearTimeout(t); res(); } };
  proc.stdout.on('data', on); proc.stderr.on('data', (d) => process.stderr.write(d));
});

const preview = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
const server = spawn(process.execPath, [join(root, 'scripts/run-ts.mjs'), './server/main.ts', `--port=${WS}`, `--data=${mkdtempSync(join(tmpdir(), 'veyl-e2e-'))}`, '--woe-always', '--emperium-hp=500'], { cwd: root, stdio: 'pipe' });
await Promise.all([until(preview, String(PORT)), until(server, 'listening')]);

// Two windows at once: keep both game loops running at full speed.
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const errors = [];
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/`);
  await page.click('#btn-play'); await page.waitForSelector('.slots');
  await page.click('.slot.empty'); await page.fill('#char-name', name); await page.click('#btn-create');
  await page.waitForSelector('#hud', { timeout: 20000 }); await page.waitForTimeout(800);
  await page.keyboard.press('g'); await page.waitForSelector('#win-social:not(.hidden)');
  await page.fill('#net-url', `ws://localhost:${WS}`); await page.fill('#net-user', name); await page.fill('#net-pass', 'secret123');
  await page.click('#net-register');
  await page.waitForFunction(() => window.__veyloria.online.joined, null, { timeout: 10000 });
  return page;
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const openSocial = async (page) => { await page.evaluate(() => window.__veyloria.windows.open('social')); await page.waitForSelector('#win-social:not(.hidden)'); };
let pages = [];
let step = '';
const W = (page, fn, arg) => { step = fn.toString().slice(0, 90); return page.waitForFunction(fn, arg, { timeout: 15000 }); };

try {
  const a = await player('Alya'), b = await player('Borin');
  pages = [a, b];
  // Presence: both stand in Willowbrook and see each other.
  await W(a, () => window.__veyloria.world.remotes.has('Borin'));
  await W(b, () => window.__veyloria.world.remotes.has('Alya'));
  await a.waitForTimeout(600);
  await a.screenshot({ path: join(shots, 'online-01-presence.png') });
  check('two players see each other in Willowbrook', true);

  // Chat on the map.
  await a.keyboard.press('Escape'); await a.keyboard.press('Enter'); await a.keyboard.type('hello Borin'); await a.keyboard.press('Enter');
  await W(b, () => document.querySelector('.chat')?.textContent?.includes('Alya: hello Borin'));
  check('map chat reaches the other player', true);

  // Party: invite from the Social window, accept, then a kill shares EXP evenly.
  await openSocial(a);
  await a.click('#win-social button:has-text("Party")');
  await W(b, () => window.__veyloria.online.invites.some((i) => i.kind === 'party'));
  await b.click('#net-accept-party');
  await W(a, () => window.__veyloria.online.party?.members.length === 2);
  await ev(a, () => { const w = window.__veyloria.world; w.enterMap('sunny_meadow', 'default'); });
  await ev(b, () => { const w = window.__veyloria.world; w.enterMap('sunny_meadow', 'default'); });
  await W(a, () => window.__veyloria.world.partyShareWith === 1);
  await ev(b, () => { const w = window.__veyloria.world; const f = w.receivePartyExp.bind(w); w.receivePartyExp = (base, job, from) => { window.__shared = { base, job, from }; f(base, job, from); }; });
  // Kill once Alya has counted Borin as a nearby member for a full second (Borin's tab is in the background).
  await ev(a, async () => {
    const w = window.__veyloria.world;
    for (let ok = 0; ok < 10;) { await new Promise((r) => setTimeout(r, 100)); ok = w.partyShareWith === 1 ? ok + 1 : 0; }
    const m = w.spawnMonsterAt('leaf_slime', w.player.x + 40, w.player.y); m.damageBy.player = 1; w.killMonster(m);
  });
  await W(b, () => window.__shared !== undefined);
  const shared = await ev(b, () => window.__shared);
  check('party: kill EXP is shared evenly with the member on the same map', shared.base === 6 && shared.job === 4, `Borin got ${shared.base}/${shared.job} of 12/8`);

  // Trade: Alya gives 2 potions, Borin gives 300 Luma.
  await ev(b, () => { const w = window.__veyloria.world; w.char.luma += 1000; });
  const bPotions0 = await ev(b, () => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((x, i) => x + i.qty, 0));
  // Pay out any achievement earned in the party fight now, so its reward is not counted as trade Luma.
  for (const p of [a, b]) await ev(p, () => window.__veyloria.world.updateAchievements());
  const aLuma0 = await ev(a, () => window.__veyloria.world.char.luma);
  await ev(b, () => { const w = window.__veyloria.world, pa = window.__veyloria.online.players.get('Alya'); w.player.x = pa.x + 30; w.player.y = pa.y; });
  await a.waitForTimeout(400);
  await openSocial(a);
  await a.click('#net-trade-Borin');
  await W(b, () => window.__veyloria.online.invites.some((i) => i.kind === 'trade'));
  await openSocial(b);
  await b.click('#net-accept-trade');
  await W(a, () => !!window.__veyloria.online.trade);
  await a.waitForSelector('#net-trade-item');
  const potUid = await ev(a, () => window.__veyloria.world.char.inventory.find((i) => i.itemId === 'red_potion').uid);
  await a.selectOption('#net-trade-item', potUid); await a.fill('#net-trade-qty', '2'); await a.click('#net-trade-add');
  await b.waitForSelector('#net-trade-luma'); await b.fill('#net-trade-luma', '300'); await b.click('#win-social button:has-text("Set Luma")');
  await W(a, () => window.__veyloria.online.trade?.theirs.luma === 300);
  await a.click('#net-trade-lock'); await b.click('#net-trade-lock');
  await W(a, () => window.__veyloria.online.trade?.mine.locked && window.__veyloria.online.trade?.theirs.locked);
  await a.click('#net-trade-confirm'); await b.click('#net-trade-confirm');
  await W(b, () => !window.__veyloria.online.trade);
  await a.waitForTimeout(300);
  const bPotions1 = await ev(b, () => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((x, i) => x + i.qty, 0));
  const aLuma1 = await ev(a, () => window.__veyloria.world.char.luma);
  check('trade: offers, lock, confirm; items and Luma change hands', bPotions1 === bPotions0 + 2 && aLuma1 === aLuma0 + 300, `potions ${bPotions0}→${bPotions1}, Alya Luma +${aLuma1 - aLuma0}`);

  // Vending: Alya (as a Merchant) opens a shop; Borin buys one potion.
  await ev(a, () => { const w = window.__veyloria.world; w.char.classId = 'merchant'; window.__veyloria.markWindowsDirty(); });
  await a.waitForTimeout(400);
  await a.waitForSelector('#net-shop-item');
  const pot2 = await ev(a, () => window.__veyloria.world.char.inventory.find((i) => i.itemId === 'red_potion').uid);
  await a.selectOption('#net-shop-item', pot2); await a.fill('#net-shop-qty', '1'); await a.fill('#net-shop-price', '77'); await a.click('#net-shop-add');
  await a.click('#net-shop-open');
  await W(b, () => !!window.__veyloria.online.players.get('Alya')?.vending);
  await b.waitForTimeout(400);
  await b.click('#net-shop-Alya');
  await W(b, () => !!window.__veyloria.online.shopView);
  const aLumaV = await ev(a, () => window.__veyloria.world.char.luma), bLumaV = await ev(b, () => window.__veyloria.world.char.luma);
  await b.click(`#win-social button:has-text("Buy 1")`);
  await W(a, (l) => window.__veyloria.world.char.luma === l + 77, aLumaV);
  await W(b, (l) => window.__veyloria.world.char.luma === l - 77, bLumaV);
  check('vending: a Merchant shop sells to another player', true);

  // PvP in the Proving Grounds.
  await ev(a, () => window.__veyloria.world.enterMap('proving_grounds', 'default'));
  await ev(b, () => window.__veyloria.world.enterMap('proving_grounds', 'default'));
  await W(a, () => window.__veyloria.world.remotes.has('Borin'));
  const hpB0 = await ev(b, () => window.__veyloria.world.char.hp);
  await ev(a, () => window.__veyloria.world.attackRemote('Borin'));
  await W(b, (h0) => window.__veyloria.world.char.hp < h0, hpB0);
  await a.screenshot({ path: join(shots, 'online-02-pvp.png') });
  check('PvP: attacks in the Proving Grounds damage the other player', true);
  await ev(a, () => window.__veyloria.world.stop());

  // Guild war: Alya founds a guild, goes to Castle Veyl and breaks the Emperium.
  await ev(a, () => { window.__veyloria.world.char.luma += 60000; window.__veyloria.online.guildCreate('Dawn Wolves'); });
  await W(a, () => window.__veyloria.online.guild?.name === 'Dawn Wolves');
  await ev(a, () => { const w = window.__veyloria.world; w.enterMap('castle_veyl', 'default'); w.godMode = true; w.char.stats.str = 99; w.invalidateStats(); });
  await W(a, () => window.__veyloria.world.remotes.has('emperium'));
  await ev(a, () => window.__veyloria.world.attackRemote('emperium'));
  await a.waitForFunction(() => window.__veyloria.online.woe?.owner === 'Dawn Wolves', null, { timeout: 90000 }).catch(async (e) => { console.log('DEBUG woe', await ev(a, () => JSON.stringify({ woe: window.__veyloria.online.woe, intent: window.__veyloria.world.player.intent, err: window.__veyloria.online.net.lastError, pos: [window.__veyloria.world.player.x, window.__veyloria.world.player.y] }))); throw e; });
  await a.waitForTimeout(500);
  await a.screenshot({ path: join(shots, 'online-03-woe.png') });
  check('guild war: breaking the Emperium gives the castle to the guild (+10% EXP)', await ev(a, () => window.__veyloria.world.expBonusPct === 10));

  check('no page errors in either browser', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) await p.screenshot({ path: join(shots, `online-fail-${i}.png`) }).catch(() => {});
  check('online e2e run completed', false, `${String(e).split('\n')[0]} at: ${step}`);
} finally {
  await browser.close(); preview.kill(); server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} online e2e checks passed`);
process.exit(failed ? 1 : 0);
