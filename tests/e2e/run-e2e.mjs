// End-to-end smoke test in a real browser (Chromium via Playwright).
// Builds are served with `vite preview`; the test drives the real UI and
// reads state through the window.__veyloria debug hook.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'tests/e2e/screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(); } });
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
});

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const sleep = (ms) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => {
  const a = window.__veyloria;
  const w = a.world;
  if (!w) return null;
  return {
    map: w.map.def.id, x: w.player.x, y: w.player.y, hp: w.char.hp, level: w.char.baseLevel, exp: w.char.baseExp,
    quests: Object.fromEntries(Object.entries(w.char.quests).map(([k, v]) => [k, v.status])), kills: w.char.stats_meta.kills,
    monsters: [...w.monsters.values()].filter((m) => !m.dead).length,
  };
});
/** Page coordinates of a world point in the game camera. */
const toScreen = (wx, wy) => page.evaluate(([wx, wy]) => {
  const a = window.__veyloria;
  const cam = a.game.scene.getScene('Game').cameras.main;
  const canvas = document.querySelector('#game canvas');
  const r = canvas.getBoundingClientRect();
  const gx = (wx - cam.worldView.x) * cam.zoom, gy = (wy - cam.worldView.y) * cam.zoom;
  return { x: r.left + (gx / 1280) * r.width, y: r.top + (gy / 720) * r.height };
}, [wx, wy]);

try {
  await page.goto(URL);
  await page.waitForSelector('#btn-play', { timeout: 30000 });
  check('game boots to title screen', true);
  await page.screenshot({ path: join(shots, '01-title.png') });

  await page.click('#btn-play');
  await page.waitForSelector('.slots');
  await page.click('.slot.empty');
  await page.waitForSelector('#char-name');
  await page.fill('#char-name', 'E2E Hero');
  await page.click('.swatch >> nth=4');
  await page.click('text=Rotate ▶');
  await sleep(300);
  await page.screenshot({ path: join(shots, '02-create.png') });
  await page.click('#btn-create');
  await page.waitForSelector('#hud', { timeout: 15000 });
  await sleep(1200);
  let s = await state();
  check('character created and entered Willowbrook', s?.map === 'willowbrook', JSON.stringify(s && { map: s.map }));
  await page.screenshot({ path: join(shots, '03-willowbrook.png') });

  // Keyboard movement (WASD)
  const before = await state();
  await page.keyboard.down('d'); await sleep(700); await page.keyboard.up('d');
  const after = await state();
  check('WASD movement moves the player', after.x > before.x + 30, `${before.x.toFixed(0)} → ${after.x.toFixed(0)}`);

  // Talk to Lyra with a real mouse click on her sprite.
  const lyra = await page.evaluate(() => { const n = window.__veyloria.world.npcs.find((x) => x.npcId === 'lyra'); return { x: n.x, y: n.y }; });
  let pt = await toScreen(lyra.x, lyra.y - 30);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('#npc-dialog', { timeout: 15000 });
  check('clicking an NPC walks over and opens dialogue', true);
  await page.click('#npc-dialog .dopt >> text=A Star-Touched Morning');
  await page.screenshot({ path: join(shots, '04-dialogue.png') });
  await page.click('#npc-dialog .dopt >> text=Accept');
  await sleep(200);
  s = await state();
  check('quest accepted through dialogue', s.quests.main_awakening === 'active', JSON.stringify(s.quests));
  await page.keyboard.press('Escape');

  // Windows
  await page.keyboard.press('i');
  await page.keyboard.press('k');
  await page.keyboard.press('c');
  await sleep(300);
  const winsOpen = await page.evaluate(() => ['inventory', 'skills', 'status'].every((id) => !document.getElementById(`win-${id}`).classList.contains('hidden')));
  check('inventory / skills / status windows open with hotkeys', winsOpen);
  await page.screenshot({ path: join(shots, '05-windows.png') });
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');

  // Travel to Sunny Meadow through the east portal.
  await page.evaluate(() => { const w = window.__veyloria.world; w.moveTo(49 * 32, 18.5 * 32); });
  await page.waitForFunction(() => window.__veyloria.world.map.def.id === 'sunny_meadow', null, { timeout: 30000 });
  await sleep(800);
  s = await state();
  check('portal travel to Sunny Meadow', s.map === 'sunny_meadow' && s.monsters > 10, `monsters=${s.monsters}`);
  await page.screenshot({ path: join(shots, '06-meadow.png') });

  // Attack the nearest slime with a mouse click and wait for the kill.
  const kills0 = s.kills;
  for (let attempt = 0; attempt < 4 && (await state()).kills === kills0; attempt++) {
    const slime = await page.evaluate(() => {
      const w = window.__veyloria.world;
      let best = null, bd = 1e9;
      for (const m of w.monsters.values()) {
        if (m.dead || m.def.id !== 'leaf_slime') continue;
        const d = Math.hypot(m.x - w.player.x, m.y - w.player.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (!best) return null;
      // Walk next to it first so it is on screen.
      w.moveTo(best.x - 40, best.y);
      return best.id;
    });
    if (!slime) break;
    await sleep(2500);
    const pos = await page.evaluate((id) => { const m = window.__veyloria.world.monsters.get(id); return m && !m.dead ? { x: m.x, y: m.y } : null; }, slime);
    if (!pos) continue;
    pt = await toScreen(pos.x, pos.y - 14);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction(([k]) => window.__veyloria.world.char.stats_meta.kills > k, [kills0], { timeout: 20000 }).catch(() => {});
  }
  await sleep(300);
  await page.screenshot({ path: join(shots, '07-combat.png') });
  s = await state();
  check('mouse-click combat kills a monster and grants EXP', s.kills > kills0 && (s.exp > 0 || s.level > 1), `kills=${s.kills} exp=${s.exp}`);

  // Save, reload, character persists.
  await page.evaluate(() => window.__veyloria.saveNow(true));
  await page.reload();
  await page.waitForSelector('#btn-play', { timeout: 30000 });
  await page.click('#btn-play');
  await page.waitForSelector('.slot .name');
  const name = await page.textContent('.slot .name');
  check('save persists across reload', name === 'E2E Hero', name ?? '');
  await page.click('#btn-enter');
  await page.waitForSelector('#hud', { timeout: 15000 });
  await sleep(800);
  s = await state();
  check('loaded character resumes on the saved map with quest progress', s.map === 'sunny_meadow' && s.quests.main_awakening === 'active', `${s.map} ${JSON.stringify(s.quests)}`);
  await page.screenshot({ path: join(shots, '08-reloaded.png') });

  // Whispering Forest render check (boss map)
  await page.evaluate(() => { const w = window.__veyloria.world; w.enterMap('whispering_forest', 'from_meadow'); w.player.x = 44 * 32; w.player.y = 39 * 32; });
  await sleep(1500);
  await page.screenshot({ path: join(shots, '09-forest-boss.png') });
  const boss = await page.evaluate(() => [...window.__veyloria.world.monsters.values()].some((m) => m.boss));
  check('Whispering Forest loads with its boss', boss);

  // ---- UI flows in town: shop, drag & drop equip, stats, job change, skills, hotbar, death.
  await page.evaluate(() => { const w = window.__veyloria.world; w.enterMap('willowbrook', 'default'); });
  await sleep(800);
  await page.evaluate(() => window.__veyloria.world.interactNpc('pip'));
  await page.waitForSelector('#npc-dialog', { timeout: 15000 });
  await page.click('#npc-dialog .dopt >> text=Buy potions');
  await page.waitForSelector('#win-shop:not(.hidden)');
  const luma0 = await page.evaluate(() => window.__veyloria.world.char.luma);
  const pots0 = await page.evaluate(() => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((n, i) => n + i.qty, 0));
  await page.fill('#win-shop .shop-row >> nth=0 >> input', '3');
  await page.click('#win-shop .shop-row >> nth=0 >> button');
  await sleep(200);
  const luma1 = await page.evaluate(() => window.__veyloria.world.char.luma);
  const pots1 = await page.evaluate(() => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((n, i) => n + i.qty, 0));
  check('shop purchase through the shop window', luma1 === luma0 - 75 && pots1 === pots0 + 3, `luma ${luma0}→${luma1}, potions ${pots0}→${pots1}`);
  await page.screenshot({ path: join(shots, '10-shop.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.evaluate(() => { const w = window.__veyloria.world; w.giveItem('bandana', 1); });
  await page.keyboard.press('e');
  await page.keyboard.press('i');
  await sleep(300);
  const bandanaIdx = await page.evaluate(() => window.__veyloria.world.char.inventory.findIndex((i) => i.itemId === 'bandana'));
  await page.dragAndDrop(`#win-inventory .islot >> nth=${bandanaIdx}`, '#win-equipment .eslot[title="headgear"]');
  await sleep(300);
  const head = await page.evaluate(() => window.__veyloria.world.char.equipment.headgear?.itemId);
  check('drag & drop from inventory equips an item', head === 'bandana', String(head));
  await page.screenshot({ path: join(shots, '11-equip-dragdrop.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.keyboard.press('c');
  const str0 = await page.evaluate(() => window.__veyloria.world.char.stats.str);
  await page.click('#alloc-str');
  const str1 = await page.evaluate(() => window.__veyloria.world.char.stats.str);
  check('stat allocation from the status window', str1 === str0 + 1, `${str0}→${str1}`);
  await page.keyboard.press('Escape');

  // Job change through Seraphine's dialogue (objectives pre-completed via the debug hook).
  await page.evaluate(() => {
    const w = window.__veyloria.world;
    w.char.jobLevel = 10;
    w.accept('job_knight');
    w.char.quests.job_knight.counts = [4];
    w.char.quests.job_knight.status = 'ready';
    w.interactNpc('seraphine');
  });
  await page.waitForSelector('#npc-dialog', { timeout: 20000 });
  await page.click('#npc-dialog .dopt >> text=Trial of the Shield');
  await page.click('#npc-dialog .dopt >> text=Complete quest');
  await sleep(400);
  const cls = await page.evaluate(() => window.__veyloria.world.char.classId);
  check('job change to Knight via quest dialogue', cls === 'knight', cls);
  await page.screenshot({ path: join(shots, '12-job-change.png') });
  await page.keyboard.press('Escape');

  // Learn Bash, drag it to hotbar slot 2, cast it with the "2" key on a monster.
  await page.evaluate(() => { window.__veyloria.world.char.skillPoints = 3; });
  await page.keyboard.press('k');
  await page.waitForSelector('#win-skills:not(.hidden)');
  await page.click('#win-skills .skill:has-text("Bash") button');
  await sleep(150);
  const bashLv = await page.evaluate(() => window.__veyloria.world.char.skills.bash ?? 0);
  check('learn a skill in the skill tree', bashLv === 1, `bash=${bashLv}`);
  await page.dragAndDrop('#win-skills .skill:has-text("Bash") img', '.hotbar .hslot >> nth=1');
  const slot2 = await page.evaluate(() => window.__veyloria.world.char.hotbar[1]);
  check('drag a skill onto the hotbar', slot2?.type === 'skill' && slot2?.id === 'bash', JSON.stringify(slot2));
  await page.screenshot({ path: join(shots, '13-skills.png') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const w = window.__veyloria.world; w.enterMap('sunny_meadow', 'from_village'); });
  await sleep(700);
  const target = await page.evaluate(() => {
    const w = window.__veyloria.world;
    const m = w.spawnMonster('mushling', 0);
    m.x = w.player.x + 50; m.y = w.player.y; m.home = { x: m.x, y: m.y };
    w.attack(m.id);
    return m.id;
  });
  await sleep(300);
  const mp0 = await page.evaluate(() => window.__veyloria.world.char.mp);
  await page.keyboard.press('2');
  await sleep(600);
  const cast = await page.evaluate((id) => ({ mp: window.__veyloria.world.char.mp, cd: window.__veyloria.world.player.cooldowns.bash ?? 0, hp: window.__veyloria.world.monsters.get(id)?.hp }), target);
  check('hotbar hotkey casts the skill (MP spent, cooldown started)', cast.mp < mp0 && cast.cd > 0, `mp ${mp0}→${cast.mp}`);
  await page.screenshot({ path: join(shots, '14-skill-cast.png') });

  // Death and respawn.
  await page.evaluate(() => window.__veyloria.world.damagePlayer(999999, 'physical', 'neutral', null, false));
  await page.waitForSelector('.modal >> text=Return to save point', { timeout: 10000 });
  await page.screenshot({ path: join(shots, '15-death.png') });
  await page.click('.modal >> text=Return to save point');
  await sleep(800);
  const alive = await page.evaluate(() => ({ dead: window.__veyloria.world.player.dead, map: window.__veyloria.world.map.def.id }));
  check('death modal respawns the player at the save point', !alive.dead && alive.map === 'willowbrook', JSON.stringify(alive));

  // Drop part of a stack through the context menu + quantity dialog.
  await page.keyboard.press('i');
  await page.waitForSelector('#win-inventory:not(.hidden)');
  const potIdx = await page.evaluate(() => window.__veyloria.world.char.inventory.findIndex((i) => i.itemId === 'red_potion'));
  const potBefore = await page.evaluate(() => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((n, i) => n + i.qty, 0));
  await page.click(`#win-inventory .islot >> nth=${potIdx}`, { button: 'right' });
  await page.click('.ctx-menu >> text=Drop');
  await page.fill('#qty-input', '2');
  await page.keyboard.press('Enter');
  await sleep(200);
  const potAfter = await page.evaluate(() => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((n, i) => n + i.qty, 0));
  const onGround = await page.evaluate(() => [...window.__veyloria.world.groundItems.values()].some((g) => g.itemId === 'red_potion' && g.qty === 2));
  check('drop part of a stack via context menu & quantity dialog', potAfter === potBefore - 2 && onGround, `${potBefore}→${potAfter}`);
  await page.keyboard.press('Escape');

  // GM / admin window: open from the HUD button, give Luma, spawn monsters, teleport.
  await page.click('#btn-gm');
  await page.waitForSelector('#win-admin:not(.hidden)');
  const gmBefore = await page.evaluate(() => ({ luma: window.__veyloria.world.char.luma, mons: window.__veyloria.world.monsters.size }));
  await page.fill('#gm-luma', '777');
  await page.dispatchEvent('#gm-luma', 'change');
  await page.click('#win-admin button:has-text("Give") >> nth=0');
  await page.selectOption('#gm-mon', 'leaf_slime');
  await page.click('#win-admin button:has-text("Spawn near me")');
  await sleep(300);
  await page.screenshot({ path: join(shots, '16-gm-tools.png') });
  const gmMid = await page.evaluate(() => ({ luma: window.__veyloria.world.char.luma, mons: window.__veyloria.world.monsters.size, flag: window.__veyloria.world.char.flags.gmUsed }));
  await page.selectOption('#gm-map', 'sunny_meadow');
  await page.click('#win-admin button:has-text("Teleport")');
  await sleep(800);
  const gmMap = await page.evaluate(() => window.__veyloria.world.map.def.id);
  check('GM window: give Luma, spawn monsters, teleport', gmMid.luma === gmBefore.luma + 777 && gmMid.mons === gmBefore.mons + 3 && gmMid.flag === true && gmMap === 'sunny_meadow',
    `luma +${gmMid.luma - gmBefore.luma}, monsters +${gmMid.mons - gmBefore.mons}, map ${gmMap}`);
  await page.click('#win-admin .x');

  // Delete the character from the select screen (typed-name confirmation).
  await page.evaluate(() => window.__veyloria.exitToSelect());
  await page.waitForSelector('.slot .name');
  await page.click('.slot:has(.name)');
  await page.click('button:has-text("Delete")');
  await page.fill('#confirm-input', 'wrong name');
  await page.click('.modal button:has-text("Delete forever")');
  const stillThere = await page.evaluate(() => !!window.__veyloria.save.characters.find((c) => c?.name === 'E2E Hero'));
  await page.fill('#confirm-input', 'E2E Hero');
  await page.click('.modal button:has-text("Delete forever")');
  await sleep(200);
  const gone = await page.evaluate(() => !window.__veyloria.save.characters.some((c) => c?.name === 'E2E Hero'));
  check('character deletion requires typing the name, then deletes', stillThere && gone);

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (err) {
  check('e2e run completed', false, String(err));
  await page.screenshot({ path: join(shots, 'error.png') }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
process.exit(failed.length ? 1 : 0);
