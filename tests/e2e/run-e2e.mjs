// End-to-end smoke test in a real browser (Chromium via Playwright).
// Builds are served with `vite preview`; the test drives the real UI and
// reads state through the window.__veyloria debug hook.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'tests/e2e/screenshots');
mkdirSync(shots, { recursive: true });
const PORT = Number(process.env.E2E_PORT ?? 4173);
const URL = `http://localhost:${PORT}/#game`;

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
  await page.click('#lang-pick button[data-lang=th]');
  await sleep(100);
  const thTitle = await page.textContent('#btn-play');
  await page.click('#lang-pick button[data-lang=en]');
  await sleep(100);
  const enTitle = await page.textContent('#btn-play');
  check('language switch on the title screen (Thai ↔ English)', thTitle === 'เริ่มการผจญภัย' && enTitle === 'Start Adventure', `${thTitle} / ${enTitle}`);
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
  // Daily login calendar opens on the first login of the day; claim it and close it.
  {
    const opened = await page.isVisible('#win-daily');
    const luma0 = await page.evaluate(() => window.__veyloria.world.char.luma);
    await page.click('#daily-claim');
    await sleep(100);
    const d = await page.evaluate(() => ({ daily: window.__veyloria.world.char.daily, luma: window.__veyloria.world.char.luma }));
    await page.click('#win-daily .x');
    check('daily reward calendar opens at login and Day 1 can be claimed once', opened && d.daily?.streak === 1 && d.luma === luma0 + 500, JSON.stringify(d.daily));
  }
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
  await page.click('#npc-dialog .dopt >> text=Welcome, Novice');
  await page.screenshot({ path: join(shots, '04-dialogue.png') });
  await page.click('#npc-dialog .dopt >> text=Accept');
  await sleep(200);
  s = await state();
  check('tutorial quest accepted through dialogue', s.quests.tut_welcome === 'active', JSON.stringify(s.quests));
  await page.keyboard.press('Escape');

  // Ragnarok-style cell cursor under the mouse; clicking ground walks to that cell's centre; the big map streams in chunks.
  {
    const p0 = await state();
    const target = await toScreen(p0.x + 4 * 32, p0.y + 2 * 32);
    await page.mouse.move(target.x, target.y);
    await sleep(150);
    const cur = await page.evaluate(() => {
      const sc = window.__veyloria.game.scene.getScene('Game');
      return { cmds: sc.cellCursor.commandBuffer.length, chunks: sc.chunks.size, w: window.__veyloria.world.map.width };
    });
    await page.mouse.click(target.x, target.y);
    await sleep(100);
    const goal = await page.evaluate(() => { const m = window.__veyloria.world.player.move; return m ? { x: m.goalX, y: m.goalY } : null; });
    await sleep(1500);
    check('cell cursor follows the mouse; clicks walk to the cell centre; map drawn in chunks', cur.cmds > 0 && cur.chunks >= 4 && !!goal && goal.x % 32 === 16 && goal.y % 32 === 16,
      `cursor cmds=${cur.cmds} chunks=${cur.chunks} map width=${cur.w} goal=${goal && `${goal.x},${goal.y}`}`);
  }

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
  // Willowbrook is big now: start near the east portal (as if walking there), then click-walk into it.
  await page.evaluate(() => {
    const w = window.__veyloria.world, p = w.map.def.portals.find((x) => x.targetMap === 'sunny_meadow');
    w.player.x = (p.x - 6) * 32; w.player.y = (p.y + p.h / 2) * 32;
    w.moveTo((p.x + p.w / 2) * 32, (p.y + p.h / 2) * 32);
  });
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
  check('loaded character resumes on the saved map with quest progress', s.map === 'sunny_meadow' && s.quests.tut_welcome === 'active', `${s.map} ${JSON.stringify(s.quests)}`);
  await page.screenshot({ path: join(shots, '08-reloaded.png') });

  // Whispering Forest render check (boss map)
  // A render check only: GM god mode keeps the Lv 1 character from being killed by the boss meanwhile.
  await page.evaluate(() => { const w = window.__veyloria.world; w.godMode = true; w.enterMap('whispering_forest', 'from_meadow'); const b = w.map.def.bossSpawn; w.player.x = (b.x - 3) * 32; w.player.y = (b.y + 1) * 32; });
  await sleep(1500);
  await page.screenshot({ path: join(shots, '09-forest-boss.png') });
  const boss = await page.evaluate(() => [...window.__veyloria.world.monsters.values()].some((m) => m.boss));
  check('Whispering Forest loads with its boss', boss);

  // ---- UI flows in town: shop, drag & drop equip, stats, job change, skills, hotbar, death.
  await page.evaluate(() => { const w = window.__veyloria.world; w.godMode = false; w.enterMap('willowbrook', 'default'); });
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

  // Refine at Garrick through the dialogue: +0 → +1 (safe refine).
  await page.evaluate(() => {
    const w = window.__veyloria.world;
    w.enterMap('willowbrook', 'default');
    const g = w.npcs.find((n) => n.npcId === 'garrick');
    w.player.x = g.x; w.player.y = g.y + 40;
    w.giveItem('training_knife', 1, 'test'); w.giveItem('glimmer_ore', 1, 'test'); w.char.luma += 500;
    w.interactNpc('garrick');
  });
  await page.waitForSelector('#npc-dialog', { timeout: 20000 });
  await page.click('#npc-dialog .dopt >> text=Refine equipment');
  await page.click('#npc-dialog .dopt >> text=Training Knife');
  await page.screenshot({ path: join(shots, '12a-refine.png') });
  await page.click('#npc-dialog .dopt >> text=Refine (100%)');
  await sleep(300);
  const refined = await page.evaluate(() => { const c = window.__veyloria.world.char; return Math.max(0, ...[...c.inventory, ...Object.values(c.equipment)].filter((i) => i?.itemId === 'training_knife').map((i) => i.refine ?? 0)); });
  check('refine +1 at the blacksmith through the dialogue', refined === 1, `+${refined}`);
  await page.keyboard.press('Escape');

  // Job change at the Knight guild master in the capital Aurelion.
  await page.evaluate(() => {
    const w = window.__veyloria.world;
    w.char.jobLevel = 10;
    w.enterMap('aurelion', 'default');
    const g = w.npcs.find((n) => n.npcId === 'guild_knight');
    w.player.x = g.x; w.player.y = g.y + 40;
    w.interactNpc('guild_knight');
  });
  await page.waitForSelector('#npc-dialog', { timeout: 20000 });
  await page.click('#npc-dialog .dopt >> text=Become a Knight');
  await page.click('button:has-text("Change job")');
  await sleep(400);
  const cls = await page.evaluate(() => window.__veyloria.world.char.classId);
  check('job change to Knight at the guild master in Aurelion', cls === 'knight', cls);
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

  // Zoom with the mouse wheel; second hotbar row on Shift+number; click an item → Equip button.
  {
    const z0 = await page.evaluate(() => window.__veyloria.game.scene.getScene('Game').cameras.main.zoom);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Escape'); // no window over the map
    await page.evaluate(() => window.__veyloria.windows.closeTop?.());
    const c = await page.evaluate(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.35 }; });
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -200);
    await sleep(400);
    const z1 = await page.evaluate(() => window.__veyloria.game.scene.getScene('Game').cameras.main.zoom);
    await page.click('#zoom-out'); await page.click('#zoom-out');
    await sleep(400);
    const z2 = await page.evaluate(() => ({ cam: window.__veyloria.game.scene.getScene('Game').cameras.main.zoom, saved: window.__veyloria.settings.zoom, label: document.querySelector('.zoom-box .zval').textContent }));
    await page.evaluate(() => window.__veyloria.setZoom(1.5));
    const pots0 = await page.evaluate(() => { const a = window.__veyloria; a.assignHotbar(10, { type: 'item', id: 'red_potion' }); a.world.char.hp = 5; return a.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((n, i) => n + i.qty, 0); });
    await page.keyboard.down('Shift'); await page.keyboard.press('Digit1'); await page.keyboard.up('Shift');
    await sleep(200);
    const pots1 = await page.evaluate(() => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_potion').reduce((n, i) => n + i.qty, 0));
    const slots = await page.$$eval('.hotbar .hslot', (els) => els.length);
    await page.evaluate(() => { const a = window.__veyloria; a.world.char.inventory.push({ uid: 'e2e-cap', itemId: 'leaf_cap', qty: 1 }); a.windows.open('inventory'); a.windows.refresh(); });
    await sleep(200);
    const capIdx = await page.evaluate(() => window.__veyloria.world.char.inventory.findIndex((i) => i.uid === 'e2e-cap'));
    await page.click(`#win-inventory .islot >> nth=${capIdx}`);
    const mainBtn = await page.textContent('#item-actions .ctx-main');
    await page.click('#item-actions .ctx-main');
    await sleep(200);
    const worn = await page.evaluate(() => window.__veyloria.world.char.equipment.headgear?.uid === 'e2e-cap');
    check('zoom (wheel + buttons, saved), 20-slot hotbar with Shift row, click item → Equip button',
      z1 > z0 && z2.cam < z1 && z2.saved === z2.cam && slots === 20 && pots1 === pots0 - 1 && mainBtn === 'Equip' && worn,
      `zoom ${z0}→${z1}→${z2.cam} (${z2.label}) slots=${slots} potions ${pots0}→${pots1} button=${mainBtn} worn=${worn}`);
    await page.keyboard.press('Escape');
  }

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
  await page.click('#win-admin button:has-text("Character") >> nth=0');
  await page.fill('#gm-luma', '777');
  await page.dispatchEvent('#gm-luma', 'change');
  await page.click('#win-admin button:has-text("Give") >> nth=0');
  await page.click('#win-admin .gm-tile[data-id="leaf_slime"]');
  await page.click('#win-admin button:has-text("near me")');
  await sleep(300);
  await page.screenshot({ path: join(shots, '16-gm-tools.png') });
  const gmMid = await page.evaluate(() => ({ luma: window.__veyloria.world.char.luma, mons: window.__veyloria.world.monsters.size, flag: window.__veyloria.world.char.flags.gmUsed }));
  await page.click('#win-admin .gm-tile[data-id="sunny_meadow"]');
  await page.click('#win-admin button:has-text("Teleport")');
  await sleep(800);
  const gmMap = await page.evaluate(() => window.__veyloria.world.map.def.id);
  check('GM window: give Luma, spawn monsters, teleport', gmMid.luma === gmBefore.luma + 777 && gmMid.mons === gmBefore.mons + 3 && gmMid.flag === true && gmMap === 'sunny_meadow',
    `luma +${gmMid.luma - gmBefore.luma}, monsters +${gmMid.mons - gmBefore.mons}, map ${gmMap}`);
  // Pets: GM gives an egg + food, hatch it from the pet window (P), feed it.
  // Item browser: category tabs and an icon grid; pick an item, then Give.
  await page.click('#win-admin button:has-text("Items") >> nth=0');
  await page.click('#win-admin .gm-cat:has-text("Pet items")');
  await page.click('#win-admin .islot[data-item="egg_leaf_slime"]');
  await page.click('#gm-give-item');
  await page.click('#win-admin .islot[data-item="pet_dewdrop"]');
  await page.click('#gm-give-item');
  await page.click('#win-admin .x');
  await page.keyboard.press('p');
  await page.waitForSelector('#win-pet:not(.hidden)');
  await page.click('#win-pet button:has-text("Hatch")');
  await sleep(1500);
  const pet = await page.evaluate(() => { const w = window.__veyloria.world; return { name: w.char.pet?.name, actor: !!w.petActor, hunger: w.char.pet?.hunger }; });
  await page.screenshot({ path: join(shots, '17-pet.png') });
  await page.evaluate(() => { window.__veyloria.world.char.pet.hunger = 50; });
  await page.click('#pet-feed');
  const fed = await page.evaluate(() => window.__veyloria.world.char.pet?.intimacy);
  check('pet: hatch from the pet window, it follows the player, feeding raises intimacy', !!pet.name && pet.actor && fed > 250, `${pet.name} actor=${pet.actor} intimacy=${fed}`);
  await page.keyboard.press('p');

  // Database tools: refine simulator, forge calculator, element chart.
  await page.keyboard.press('b');
  await page.waitForSelector('#win-database:not(.hidden)');
  await page.click('#db-tab-refine');
  await page.selectOption('#dbt-rk', 'w4');
  const refineTxt = await page.textContent('#db-refine');
  await page.click('#db-tab-forge');
  const forgeTxt = await page.textContent('#dbt-forge-result');
  await page.click('#db-tab-elements');
  const elemCells = await page.locator('#db-elements td').count();
  await page.screenshot({ path: join(shots, '18-db-tools.png') });
  check('database tools: refine simulator, forge calculator, element chart', /\+4 → \+5/.test(refineTxt) && /Success: \d/.test(forgeTxt) && elemCells === 100, `${forgeTxt} cells=${elemCells}`);
  await page.keyboard.press('b');

  // Auto: ⚙ opens the auto settings; Auto Quest starts from the quest tracker; AUTO beside the hotbar farms at once.
  await page.click('#btn-auto-settings');
  const settingsOpen = await page.evaluate(() => !document.getElementById('win-auto').classList.contains('hidden') && !!document.getElementById('auto-radius'));
  await page.click('#btn-auto-settings');
  await page.evaluate(() => { const w = window.__veyloria.world; w.godMode = true; });
  const kAuto0 = await page.evaluate(() => window.__veyloria.world.char.stats_meta.kills);
  await page.click('#btn-auto-farm');
  await page.waitForFunction((k0) => window.__veyloria.world.char.stats_meta.kills >= k0 + 2, kAuto0, { timeout: 120000 }).catch(async (err) => {
    console.log('AUTO DEBUG', await page.evaluate(() => { const w = window.__veyloria.world; return `${w.map.def.id} ${w.auto.mode} ${w.auto.status} kills=${w.char.stats_meta.kills} pos=${Math.round(w.player.x / 32)},${Math.round(w.player.y / 32)} near=${[...w.monsters.values()].filter((m) => !m.dead && Math.hypot(m.x - w.player.x, m.y - w.player.y) < 600).length}`; }));
    throw err;
  });
  const autoBar = await page.textContent('#auto-status');
  await page.screenshot({ path: join(shots, '18b-auto-farm.png') });
  const cv = await page.locator('#game canvas').boundingBox();
  await page.mouse.click(cv.x + cv.width * 0.3, cv.y + cv.height * 0.3);
  await sleep(300);
  const autoMode = await page.evaluate(() => window.__veyloria.world.auto.mode);
  await page.click('#btn-auto-quest');
  const questMode = await page.evaluate(() => window.__veyloria.world.auto.mode);
  await page.click('#btn-auto-quest');
  await page.evaluate(() => { window.__veyloria.world.godMode = false; });
  check('AUTO button farms by itself and stops on a manual click; ⚙ opens auto settings; Auto Quest from the tracker', /AUTO FARM/.test(autoBar) && autoMode === 'off' && settingsOpen && questMode === 'quest', `${autoBar?.slice(0, 60)} → ${autoMode} settings=${settingsOpen} quest=${questMode}`);

  // Memorial dungeon: talk to the Spire Warden in Aurelion and enter; the HUD shows floor + timer.
  await page.evaluate(() => { const w = window.__veyloria.world; w.char.baseLevel = Math.max(w.char.baseLevel, 20); w.enterMap('aurelion', 'default'); });
  await sleep(600);
  await page.evaluate(() => { const w = window.__veyloria.world; const n = w.npcs.find((x) => x.npcId === 'spire_warden'); w.player.x = n.x; w.player.y = n.y + 40; w.interactNpc('spire_warden'); });
  await page.waitForSelector('#npc-dialog .dopt:has-text("Enter the Endless Spire")');
  await page.click('#npc-dialog .dopt:has-text("Enter the Endless Spire")');
  await page.click('.modal button:has-text("Enter")');
  await sleep(1200);
  const inst = await page.evaluate(() => ({ map: window.__veyloria.world.map.def.id, timer: document.getElementById('inst-timer')?.textContent ?? '' }));
  await page.screenshot({ path: join(shots, '19-endless-spire.png') });
  check('memorial dungeon entered through the keeper; HUD shows floor and time', inst.map === 'endless_spire_f1' && /Floor 1\/100/.test(inst.timer), `${inst.map} "${inst.timer}"`);

  // Thai in game: settings dropdown, HUD, windows, game messages and GM commands; then back to English.
  await page.evaluate(() => window.__veyloria.windows.open('settings'));
  await page.selectOption('#set-language', 'th');
  await sleep(200);
  await page.evaluate(() => { window.__veyloria.windows.open('inventory'); window.__veyloria.gmCommand('@heal'); });
  await sleep(200);
  const th = await page.evaluate(() => ({
    title: document.querySelector('#win-inventory .wtitle')?.textContent ?? '',
    log: [...document.querySelectorAll('#hud .log div')].slice(-3).map((d) => d.textContent).join(' | '),
    chat: document.querySelector('#hud .chat input')?.getAttribute('placeholder') ?? '',
    saved: window.__veyloria.settings.language,
  }));
  await page.selectOption('#set-language', 'en');
  await sleep(200);
  const en = await page.evaluate(() => document.querySelector('#win-inventory .wtitle')?.textContent ?? '');
  check('Thai in game: windows, messages and chat box translate, and switch back', th.title.includes('กระเป๋า') && th.log.includes('ฟื้นฟู') && th.chat.includes('แชท') && th.saved === 'th' && en.includes('Inventory'), `${th.title} · ${th.log.slice(-60)} · ${th.chat} → ${en}`);
  await page.evaluate(() => { window.__veyloria.windows.close?.('settings'); window.__veyloria.windows.close?.('inventory'); });

  // The quest panel disappears once every quest is completed.
  {
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('#hud .tracker')).display);
    await page.evaluate(() => { window.__veyloria.gmCommand('@questall complete'); });
    await sleep(400);
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('#hud .tracker')).display);
    check('quest panel hides when all quests are completed', before !== 'none' && after === 'none', `${before} → ${after}`);
  }

  // Market Trader: hourly price chart and instant sale.
  {
    await page.evaluate(() => {
      const w = window.__veyloria.world;
      w.enterMap('willowbrook', 'default');
      const n = w.npcs.find((x) => x.npcId === 'willowbrook_trader');
      w.player.x = n.x + 40; w.player.y = n.y;
      w.char.inventory = w.char.inventory.filter((i) => i.itemId !== 'rabbit_horn');
      w.char.inventory.push({ uid: 'e2e-horn', itemId: 'rabbit_horn', qty: 5 });
      window.__veyloria.windows.open('trader');
    });
    await page.waitForSelector('#trader-list .trow[data-item=rabbit_horn] button');
    const charts = await page.locator('#win-trader canvas').count();
    const luma0 = await page.evaluate(() => window.__veyloria.world.char.luma);
    await page.click('#trader-list .trow[data-item=rabbit_horn] button');
    await page.fill('#qty-input', '2');
    await page.click('.modal button:has-text("OK")');
    await sleep(150);
    const after = await page.evaluate(() => ({ luma: window.__veyloria.world.char.luma, horn: window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'rabbit_horn').reduce((a, i) => a + i.qty, 0) }));
    check('Market Trader: price graph shown, selling 2 of 5 pays at once', charts >= 2 && after.horn === 3 && after.luma > luma0, `charts=${charts} luma ${luma0}→${after.luma} left=${after.horn}`);
    await page.evaluate(() => { window.__veyloria.windows.close('trader'); window.__veyloria.windows.open('market'); });
    const offline = await page.textContent('#win-market');
    check('Market Hall says it needs a server when offline (only real players buy)', /offline/.test(offline), offline.slice(0, 80));
    await page.evaluate(() => window.__veyloria.windows.close('market'));
  }

  // Item compare in the tooltip.
  {
    const txt = await page.evaluate(() => {
      const a = window.__veyloria, w = a.world;
      const inst = { uid: 'e2e-sword', itemId: 'iron_sword', qty: 1 };
      w.char.inventory.push(inst);
      return a.windows.itemTooltip(w.data.items.get('iron_sword'), inst).map((e) => e.textContent).join(' | ');
    });
    check('item tooltip compares with what is equipped (ATK ▲/▼)', /Compared with/.test(txt) && /ATK [▲▼]/.test(txt), txt.slice(-160));
  }

  // Achievements & titles (the first kill was earned in combat above).
  {
    await page.click('#menu-grid [data-win=achievements]').catch(async () => page.evaluate(() => window.__veyloria.windows.open('achievements')));
    await page.waitForSelector('#ach-list');
    const done = await page.locator('#ach-list .ach.done').count();
    await page.click('#ach-list .ach.done button:has-text("Use title")');
    await sleep(200);
    const label = await page.evaluate(() => window.__veyloria.game.scene.getScene('Game').playerName.text);
    check('achievements earned from play; a title shows under the name', done >= 1 && /«.+»/.test(label), `done=${done} label=${JSON.stringify(label)}`);
    await page.evaluate(() => window.__veyloria.windows.close('achievements'));
  }

  // Alchemist brewing: the Medicine Bowl opens the brewing window; a brew uses the bowl and materials.
  {
    const herbs0 = await page.evaluate(() => window.__veyloria.world.char.inventory.filter((i) => i.itemId === 'red_herb').reduce((a, i) => a + i.qty, 0));
    await page.evaluate(() => {
      const w = window.__veyloria.world;
      w.char.classId = 'alchemist'; w.char.skills.potion_research = 5;
      w.char.inventory.push({ uid: 'e2e-bowl', itemId: 'medicine_bowl', qty: 1 }, { uid: 'e2e-herb', itemId: 'red_herb', qty: 1 }, { uid: 'e2e-bottle', itemId: 'empty_bottle', qty: 1 });
      w.useItem('e2e-bowl');
    });
    await page.waitForSelector('#win-brew:not(.hidden) #brew-list');
    await page.click('#brew-list .brow[data-recipe=brew_red_potion] button');
    await sleep(150);
    const b = await page.evaluate(() => { const inv = window.__veyloria.world.char.inventory; return { bowl: inv.some((i) => i.itemId === 'medicine_bowl'), herbs: inv.filter((i) => i.itemId === 'red_herb').reduce((a, i) => a + i.qty, 0) }; });
    const log = await page.textContent('#hud');
    check('brewing window: a brew uses the Medicine Bowl and herbs (success or failure is logged)', !b.bowl && b.herbs === herbs0 && /Brewing (succeeded|failed)/.test(log), JSON.stringify(b));
    await page.evaluate(() => window.__veyloria.windows.close('brew'));
  }

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

  // Studio: launcher, edit a map, an image and an object kind, export a pack, then the game uses the edits.
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
    const sp = await ctx2.newPage();
    sp.on('pageerror', (e) => errors.push(`studio pageerror: ${e.message}`));
    sp.on('dialog', (d) => d.accept());
    await sp.goto(URL.replace('#game', ''));
    await sp.waitForSelector('#launcher');
    check('launcher offers the game and the studio', await sp.isVisible('#launch-game') && await sp.isVisible('#launch-studio'));
    await sp.click('#launch-studio');
    await sp.waitForSelector('#studio [data-home]');
    check('studio opens on a home page with a card for every section', (await sp.locator('[data-home]').count()) >= 10);
    await sp.click('[data-tab=maps]');
    await sp.waitForSelector('#studio .st-canvas');
    await sp.waitForTimeout(3000);
    const cv = await sp.locator('.st-canvas').first().boundingBox();
    await sp.click('.st-side .st-item:has-text("Royal Inn")');
    await sp.waitForTimeout(200);
    const title = await sp.textContent('.st-side.right .st-h');
    const x0 = +(await sp.inputValue('.st-side.right input[type=number] >> nth=0'));
    for (let i = 0; i < 3; i++) await sp.keyboard.press('ArrowRight');
    await sp.waitForTimeout(200);
    const x1 = +(await sp.inputValue('.st-side.right input[type=number] >> nth=0'));
    check('studio map editor: click selects, arrow keys move', !!title && x1 === x0 + 3, `${title} ${x0} → ${x1}`);
    // Box-select several things and delete them at once.
    const count = async () => +(/(\d+) วัตถุ/.exec(await sp.textContent('.st-bar .st-muted'))?.[1] ?? -1);
    const n0 = await count();
    await sp.keyboard.press('Escape');
    // From the empty margin around the map, across the whole map.
    await sp.mouse.move(cv.x + 3, cv.y + 3); await sp.mouse.down();
    await sp.mouse.move(cv.x + cv.width - 3, cv.y + cv.height - 3, { steps: 10 }); await sp.mouse.up();
    await sp.waitForTimeout(200);
    const boxed = /เลือกอยู่ (\d+)/.exec(await sp.textContent('.st-side.right .st-h'))?.[1];
    await sp.locator('.st-side.right .st-row:has-text("วัตถุ") button').first().click();
    const objs = +(/เลือกอยู่ (\d+)/.exec(await sp.textContent('.st-side.right .st-h'))?.[1] ?? 1);
    await sp.click('#map-delete-selected');
    await sp.waitForTimeout(400);
    const n1 = await count();
    check('studio map: a dragged box selects several things and one click deletes them all', +boxed > 1 && n1 === n0 - objs && objs > 1, `boxed ${boxed}, objects ${n0} → ${n1}`);
    await sp.click('#map-save');
    await sp.waitForTimeout(500);
    // Sprite sheet: draw on a monster and save.
    await sp.click('[data-tab=sprites]');
    await sp.waitForSelector('[data-sprite="sprites/monster/leaf_slime"]');
    await sp.click('[data-sprite="sprites/monster/leaf_slime"]');
    await sp.waitForTimeout(800);
    const scv = await sp.locator('.st-canvas').first().boundingBox();
    for (let i = 0; i < 4; i++) await sp.mouse.click(scv.x + scv.width / 2 + i * 4, scv.y + scv.height / 2);
    await sp.click('#img-save');
    await sp.waitForTimeout(500);
    // Database: rename an item.
    await sp.click('[data-tab=database]');
    await sp.waitForSelector('#db-save');
    await sp.fill('.st-field:has(small:text-is("name")) input', 'Studio Potion');
    await sp.press('.st-field:has(small:text-is("name")) input', 'Enter');
    await sp.click('#db-save');
    await sp.waitForTimeout(500);
    await sp.click('[data-tab=images]');
    await sp.waitForTimeout(1500);
    const ic = await sp.locator('.st-canvas').first().boundingBox();
    for (let i = 0; i < 5; i++) await sp.mouse.click(ic.x + ic.width / 2 + i * 6, ic.y + 40);
    await sp.click('#img-save');
    await sp.waitForTimeout(500);
    await sp.click('[data-tab=objects]');
    await sp.waitForTimeout(800);
    await sp.fill('.st-scroll input[type=number] >> nth=2', '100');
    await sp.press('.st-scroll input[type=number] >> nth=2', 'Enter');
    await sp.waitForTimeout(300);
    await sp.click('#objects-save');
    await sp.waitForTimeout(500);
    await sp.click('[data-tab=pack]');
    const [dl] = await Promise.all([sp.waitForEvent('download'), sp.click('button:has-text("ส่งออกแพ็ก")')]);
    const pack = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    check('studio exports a pack with the edited map, image and objects', pack.format === 'veyloria-studio-pack' && !!pack.maps.aurelion && !!pack.images['props/willowbrook'] && pack.objects?.find((o) => o.id === 'tree_oak')?.artH === 100);
    await sp.click('#studio-play');
    await sp.waitForFunction(() => window.__veyloria?.data, null, { timeout: 30000 });
    const g = await sp.evaluate(() => ({ layer: window.__studioLayer, oak: window.__veyloria.data.objectKinds.get('tree_oak').artH, potion: window.__veyloria.data.items.get('red_potion').name }));
    check('the game uses the studio edits (map, image, objects, sprite sheet, item data)',
      g.layer.maps.includes('aurelion') && g.layer.images.includes('props/willowbrook') && g.layer.images.includes('sprites/monster/leaf_slime') && g.oak === 100 && g.potion === 'Studio Potion', JSON.stringify(g));
    await ctx2.close();
  }

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
