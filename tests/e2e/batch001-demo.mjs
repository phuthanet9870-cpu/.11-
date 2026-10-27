// Batch 001 in-game demonstration & alignment test (Chromium via Playwright).
// Runs the production build, plays the new Novice / monster / VFX animations
// in the real game, captures close-up screenshots and checks — from the live
// Phaser objects — that each sprite uses the Batch 001 texture, advances
// through distinct frames, faces the right direction row, and that VFX are
// anchored where the metadata says (target centre / feet).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'tests/e2e/screenshots/batch001');
mkdirSync(shots, { recursive: true });
const PORT = 4174;

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

/** Screenshot a region centred on a world point (camera zoom applied). */
async function shotAt(name, wx, wy, w = 220, h = 200) {
  const r = await page.evaluate(([wx, wy]) => {
    const cam = window.__veyloria.game.scene.getScene('Game').cameras.main;
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    return { x: c.left + ((wx - cam.worldView.x) * cam.zoom / 1280) * c.width, y: c.top + ((wy - cam.worldView.y) * cam.zoom / 720) * c.height };
  }, [wx, wy]);
  const clip = { x: Math.min(1280 - w, Math.max(0, r.x - w / 2)), y: Math.min(720 - h, Math.max(0, r.y - h * 0.65)), width: w, height: h };
  await page.screenshot({ path: join(shots, `${name}.png`), clip });
}

/** Freezes the game, frames a monster by its current position, screenshots, resumes. */
async function shotMonster(name, mid) {
  const m = await page.evaluate((mid) => {
    const a = window.__veyloria; a.game.loop.sleep();
    const m = a.world.monsters.get(mid); return m && { x: m.x, y: m.y };
  }, mid);
  if (m) await shotAt(name, m.x + 16, m.y - 20, 220, 170);
  await page.evaluate(() => window.__veyloria.game.loop.wake());
}

/** Live state of the player sprite. */
const playerSprite = () => page.evaluate(() => {
  const a = window.__veyloria, sc = a.game.scene.getScene('Game'), s = sc.player, p = a.world.player;
  return { key: s.texture.key, frame: Number(s.frame.name), x: s.x, y: s.y, ox: s.originX, oy: s.originY, px: p.x, py: p.y, dir: p.dir, anim: p.anim, flip: s.flipX };
});

const vfxSprites = () => page.evaluate(() => {
  const sc = window.__veyloria.game.scene.getScene('Game');
  return sc.sys.displayList.list.filter((o) => o.texture?.key?.startsWith('file:vfx/')).map((o) => ({ key: o.texture.key, x: o.x, y: o.y, ox: o.originX, oy: o.originY, frame: Number(o.frame.name), blend: o.blendMode }));
});

/** Waits until `gameMs` of world time has passed (headless WebGL runs far below real time). */
const waitGame = (gameMs) => page.evaluate((gameMs) => new Promise((resolve) => {
  const w = window.__veyloria.world, t0 = w.time;
  const tick = () => (w.time - t0 >= gameMs ? resolve() : requestAnimationFrame(tick));
  tick();
}), gameMs);

/** Watches a fight for `gameMs`: VFX sprites near the target, player/monster animation keys. */
const watchFight = (mid, gameMs, untilSlash = false) => page.evaluate(([mid, gameMs, untilSlash]) => new Promise((resolve) => {
  const a = window.__veyloria, sc = a.game.scene.getScene('Game'), w = a.world, t0 = w.time;
  const out = { slash: null, hit: null, attack: null, monAnims: [], dead: false };
  const tick = () => {
    const m = w.monsters.get(mid), v = sc.monViews.get(mid);
    if (m && v) {
      const k = v.sprite.texture.key.split('_').slice(-2, -1)[0];
      if (!out.monAnims.includes(k)) out.monAnims.push(k);
      if (!m.dead && w.player.intent.type !== 'attack') w.attack(mid);
      w.char.hp = w.stats.maxHp;
      for (const o of sc.sys.displayList.list) {
        const key = o.texture?.key ?? '';
        const rec = { x: o.x, y: o.y, tx: Math.round(m.x), ty: Math.round(m.y), frame: Number(o.frame?.name), flip: o.flipX, blend: o.blendMode };
        if (key.includes('fx_sword_slash') && !out.slash) out.slash = rec;
        if (key.includes('fx_hit_basic') && !out.hit && Math.abs(o.x - m.x) <= 2) out.hit = rec;
      }
      const ps = sc.player;
      if (!out.attack && w.player.anim === 'attack') {
        const dx = m.x - w.player.x, dy = m.y - w.player.y;
        const toward = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        out.attack = { key: ps.texture.key, dir: w.player.dir, toward, row: Math.floor(Number(ps.frame.name) / 6), frame: Number(ps.frame.name) };
      }
      if (m.dead) out.dead = true;
    }
    if (w.time - t0 >= gameMs || (out.dead && out.monAnims.includes('death')) || (untilSlash && out.slash && out.slash.frame >= 1)) resolve(out); else requestAnimationFrame(tick);
  };
  tick();
}), [mid, gameMs, untilSlash]);

/**
 * Pauses the game loop once a VFX sprite whose texture contains `part` reaches
 * `minFrame`, so the screenshot shows it (sprite animations run on real time,
 * the throttled headless world on game time). Call resume() afterwards.
 */
const freezeOnVfx = (part, minFrame) => page.evaluate(([part, minFrame]) => new Promise((resolve) => {
  const a = window.__veyloria, sc = a.game.scene.getScene('Game');
  let n = 0;
  const tick = () => {
    const o = sc.sys.displayList.list.find((x) => (x.texture?.key ?? '').includes(part) && Number(x.frame.name) >= minFrame);
    if (o) { a.game.loop.sleep(); resolve({ x: o.x, y: o.y, frame: Number(o.frame.name) }); return; }
    if (++n > 2000) resolve(null); else requestAnimationFrame(tick);
  };
  tick();
}), [part, minFrame]);
const resume = () => page.evaluate(() => window.__veyloria.game.loop.wake());

/** Samples the player sprite on every rendered frame until `gameMs` of world time has passed. */
const samplePlayer = (gameMs) => page.evaluate((gameMs) => new Promise((resolve) => {
  const a = window.__veyloria, sc = a.game.scene.getScene('Game'), w = a.world, t0 = w.time, out = [];
  const tick = () => {
    const s = sc.player, p = w.player;
    out.push({ key: s.texture.key, frame: Number(s.frame.name), dir: p.dir, anim: p.anim, flip: s.flipX });
    if (w.time - t0 >= gameMs) resolve(out); else requestAnimationFrame(tick);
  };
  tick();
}), gameMs);

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#btn-play', { timeout: 30000 });
  await page.click('#btn-play');
  await page.waitForSelector('.slots');
  await page.click('.slot.empty');
  await page.waitForSelector('#char-name');
  await page.fill('#char-name', 'Batch Demo');
  await page.click('#btn-create');
  await page.waitForSelector('#hud', { timeout: 15000 });
  await sleep(1500);

  // ---------------------------------------------------------------- Willowbrook tileset / props / buildings
  const mapInfo = await page.evaluate(() => {
    const sc = window.__veyloria.game.scene.getScene('Game');
    const keys = sc.sys.displayList.list.map((o) => o.texture?.key).filter(Boolean);
    return { props: keys.filter((k) => k.startsWith('prop_willowbrook_')).length, objects: window.__veyloria.world.map.objects.length, buildings: keys.filter((k) => k.startsWith('bld_willowbrook_')).length, ground: sc.textures.exists('map_willowbrook_ground') };
  });
  check('Willowbrook uses Batch 001 props and buildings', mapInfo.props === mapInfo.objects && mapInfo.props > 0 && mapInfo.buildings === 7, JSON.stringify(mapInfo));
  await page.screenshot({ path: join(shots, '01-willowbrook-overview.png') });

  // ---------------------------------------------------------------- Novice idle
  let p = await playerSprite();
  check('player uses the Batch 001 Novice texture (layered or composite)', /^(bc_novice_.*_idle|file:characters\/novice\/novice_idle_sheet\.png)$/.test(p.key), p.key);
  check('player sprite pivot is the feet baseline (61/64) at the world position', Math.abs(p.oy - 61 / 64) < 1e-6 && p.x === Math.round(p.px) && p.y === Math.round(p.py), `origin ${p.ox},${p.oy.toFixed(4)} sprite ${p.x},${p.y} world ${p.px.toFixed(1)},${p.py.toFixed(1)}`);
  const idle = await samplePlayer(900);
  check('idle animation cycles through its 5 frames', new Set(idle.map((s) => s.frame)).size === 5, `frames ${[...new Set(idle.map((s) => s.frame))].join(',')}`);
  await shotAt('02-novice-idle', p.px, p.py - 30);

  // ---------------------------------------------------------------- Novice walk, 4 directions
  const dirs = [['down', 0, 1], ['left', -1, 0], ['right', 1, 0], ['up', 0, -1]];
  for (const [dir, dx, dy] of dirs) {
    const key = { down: 's', left: 'a', right: 'd', up: 'w' }[dir];
    await page.keyboard.down(key);
    await waitGame(250);
    const walk = await samplePlayer(800);
    const row = ['down', 'left', 'right', 'up'].indexOf(dir);
    const rows = new Set(walk.filter((s) => s.anim === 'walk').map((s) => Math.floor(s.frame / 8)));
    const frames = new Set(walk.filter((s) => s.anim === 'walk').map((s) => s.frame));
    check(`walk ${dir}: correct direction row, animated, no mirroring`, walk.every((s) => s.dir === dir) && rows.size === 1 && rows.has(row) && frames.size >= 5 && walk.every((s) => !s.flip), `row ${[...rows]} frames ${[...frames].join(',')} key ${walk[0].key.split('_').pop()}`);
    const now = await playerSprite();
    await shotAt(`03-novice-walk-${dir}`, now.px, now.py - 30);
    await page.keyboard.up(key);
    await sleep(200);
  }

  // ---------------------------------------------------------------- Heal VFX (potion) at the feet
  await page.evaluate(() => { const w = window.__veyloria.world; w.char.hp = Math.max(1, w.char.hp - 20); w.useItemById('red_potion'); });
  await sleep(200);
  p = await playerSprite();
  let fx = await vfxSprites();
  const heal = fx.find((f) => f.key.includes('fx_heal'));
  check('Heal VFX plays as a crisp sprite anchored at the player feet', !!heal && heal.x === Math.round(p.px) && heal.y === Math.round(p.py) && Math.abs(heal.oy - 80 / 96) < 1e-6 && heal.blend === 0, JSON.stringify(heal ?? fx));
  if (await freezeOnVfx('fx_heal', 4)) { await shotAt('04-vfx-heal', p.px, p.py - 30); await resume(); }
  await waitGame(800);

  // ---------------------------------------------------------------- Level Up VFX
  await page.evaluate(() => { const w = window.__veyloria.world; w.grantExp(40, 0, 'demo'); });
  await sleep(320);
  p = await playerSprite();
  fx = await vfxSprites();
  const lv = fx.find((f) => f.key.includes('fx_level_up'));
  check('Level Up VFX plays as a sprite anchored at the player feet', !!lv && lv.x === Math.round(p.px) && lv.y === Math.round(p.py) && lv.blend === 0, JSON.stringify(lv ?? fx));
  if (await freezeOnVfx('fx_level_up', 4)) { await shotAt('05-vfx-level-up', p.px, p.py - 40, 260, 260); await resume(); }
  await waitGame(1200);

  // ---------------------------------------------------------------- Sunny Meadow: three monsters, combat
  await page.evaluate(() => window.__veyloria.world.enterMap('sunny_meadow', 'from_village'));
  await sleep(1500);
  for (const id of ['leaf_slime', 'mushling', 'horn_rabbit']) {
    // Park the player next to the closest monster of this type, then attack it.
    const info = await page.evaluate((id) => {
      const w = window.__veyloria.world;
      const m = [...w.monsters.values()].filter((x) => x.def.id === id && !x.dead).sort((a, b) => Math.hypot(a.x - w.player.x, a.y - w.player.y) - Math.hypot(b.x - w.player.x, b.y - w.player.y))[0];
      if (!m) return null;
      w.player.x = m.x + 34; w.player.y = m.y; w.player.move = null;
      w.char.hp = w.stats.maxHp;
      return { mid: m.id };
    }, id);
    if (!info) { check(`${id} present in Sunny Meadow`, false); continue; }
    await waitGame(900); // camera catches up
    const ms = await page.evaluate((mid) => {
      const sc = window.__veyloria.game.scene.getScene('Game'), v = sc.monViews.get(mid), m = window.__veyloria.world.monsters.get(mid);
      return { key: v.sprite.texture.key, oy: v.sprite.originY, sx: v.sprite.x, sy: v.sprite.y, mx: m.x, my: m.y, frame: Number(v.sprite.frame.name), dir: m.dir, flip: v.sprite.flipX };
    }, info.mid);
    check(`${id}: 4-direction Batch 001 sheet, feet pivot`, ms.key.startsWith(`file:monsters/${id}/`) && Math.abs(ms.oy - 45 / 48) < 1e-6 && ms.sx === Math.round(ms.mx) && !ms.flip, `${ms.key.split('/').pop()} dir=${ms.dir} frame=${ms.frame}`);
    await shotMonster(`06-${id}-idle`, info.mid);
    // Low HP so the monster's hit → death sequence plays within the test window.
    // A 1-damage poke guarantees the hit reaction; ~2–3 blows of HP keep the fight short.
    await page.evaluate((mid) => { const w = window.__veyloria.world, m = w.monsters.get(mid); m.hp = Math.min(m.hp, 60); w.damageMonster(m, 1, 'physical', 'neutral', false, false); }, info.mid);
    const first = await watchFight(info.mid, 3000, true);
    const mid0 = await page.evaluate((mid) => { const m = window.__veyloria.world.monsters.get(mid); return { x: m.x, y: m.y }; }, info.mid);
    if (await freezeOnVfx('fx_sword_slash', 1)) { await shotAt(`07-${id}-combat`, mid0.x + 16, mid0.y - 20, 240, 180); await resume(); }
    const rest = await watchFight(info.mid, 6000);
    const fight = { slash: first.slash ?? rest.slash, hit: first.hit ?? rest.hit, attack: first.attack ?? rest.attack, dead: rest.dead || first.dead, monAnims: [...new Set([...first.monAnims, ...rest.monAnims])] };
    const sl = fight.slash, ht = fight.hit, at = fight.attack;
    check(`${id}: sword slash VFX centred on the target`, !!sl && Math.abs(sl.x - sl.tx) <= 2 && Math.abs(sl.y - (sl.ty - 12)) <= 2 && sl.blend === 0, JSON.stringify(sl));
    check(`${id}: hit VFX on the target`, !!ht, JSON.stringify(ht));
    check(`${id}: player plays the Novice attack animation facing the monster`, !!at && /_attack(_sheet\.png)?$/.test(at.key) && at.dir === at.toward && at.row === ['down', 'left', 'right', 'up'].indexOf(at.dir), at ? `${at.key.split('/').pop()} dir=${at.dir} toward=${at.toward} row=${at.row} frame=${at.frame}` : 'none');
    check(`${id}: monster hit/attack and death animations play`, fight.dead && fight.monAnims.includes('death') && (fight.monAnims.includes('hit') || fight.monAnims.includes('attack')), fight.monAnims.join(','));
    await shotMonster(`08-${id}-death`, info.mid);
    await waitGame(1500);
  }
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('demo script completed', false, String(e?.stack ?? e));
  await page.screenshot({ path: join(shots, 'error.png') }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} Batch 001 demo checks passed`);
process.exit(failed ? 1 : 0);
