// BATCH 001 — WILLOWBROOK STARTER PACK exporter.
// Writes PNG sheets + JSON metadata into public/assets/, a manifest the game
// loads, contact sheets and a QA report into docs/art/batch001/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCharacterAnims, LAYERS } from './characterSheets';
import { BASE_Y, FH, FW, HAIR_STYLES, VIEWS, weaponSprite, type CharacterSpec } from './humanoid';
import { HUMANOID_ANIMS } from './humanoidAnims';
import { BATCH001_MONSTERS, buildMonsterSheets, MB, MH, MVIEWS, MW, MONSTER_ANIMS } from './monsters';
import { R } from './palette';
import { Pixmap, type Sheet } from './pixel';
import { building, buildWillowbrookProps, WILLOWBROOK_BUILDINGS } from './props';
import { buildWillowbrookTileset, T } from './tiles';
import { BATCH001_VFX, buildVfxSheet } from './vfx';
import { dropIcon } from './icons';
import { runQa, type QaItem } from './qa';
import { exportWillowbrookTmj } from './tiled';

const ROOT = join(process.cwd(), 'public/assets');
const DOCS = join(process.cwd(), 'docs/art/batch001');
const written: string[] = [];
const images = new Map<string, Pixmap>();

function save(rel: string, p: Pixmap) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, p.toPNG());
  written.push(rel);
  images.set(rel, p);
}
function saveJson(rel: string, obj: unknown, root = ROOT) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  if (root === ROOT) written.push(rel);
}

const NOVICE_OUTFIT: CharacterSpec['outfit'] = { tunic: R.linen, pants: R.cloth_brown, boots: R.leather, belt: R.leather, buckle: R.brass, collar: R.linen, bag: R.satchel, sleeves: 'short' };
const rampJson = (r: typeof R.skin) => ({ outline: hexOf(r.o), deep: hexOf(r.d), shadow: hexOf(r.s), base: hexOf(r.b), light: hexOf(r.l) });
function hexOf(c: number[]) { return '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''); }

export function main() {
  const qa: QaItem[] = [];
  const manifest: Record<string, unknown> = {
    batch: 'BATCH 001 — WILLOWBROOK STARTER PACK',
    version: 1,
    generator: 'tools/asset-studio (npm run assets:batch001)',
    artBible: { tileSize: T, characterFrame: [FW, FH], baselineY: BASE_Y, light: 'upper-left', outline: 'selective (darkest tone of each part)', filtering: 'nearest' },
    paletteKeys: { skin: rampJson(R.skin), hair: rampJson(R.hair), eye: rampJson(R.eye) },
    characters: {}, monsters: {}, vfx: {}, tilesets: {}, environment: {}, items: {}, portraits: {}, maps: {},
  };

  // ---------------------------------------------------------------- Novice
  const dagger = weaponSprite('dagger');
  const nov: Record<string, unknown> = { classId: 'novice', frameWidth: FW, frameHeight: FH, directions: VIEWS, origin: { x: 0.5, y: BASE_Y / FH }, originPx: { x: FW / 2, y: BASE_Y }, hitbox: { x: -9, y: -6, w: 18, h: 12 }, layerOrder: [...LAYERS], hairStyles: HAIR_STYLES, bodyTypes: ['a', 'b'], animations: {} };
  const defaultBuilt = buildCharacterAnims({ outfit: NOVICE_OUTFIT, hair: 'short', weapon: dagger }, 'a');
  const bodyB = buildCharacterAnims({ outfit: NOVICE_OUTFIT, hair: 'short', weapon: dagger }, 'b');
  const hairBuilt = Object.fromEntries(HAIR_STYLES.map((h) => [h, h === 'short' ? defaultBuilt : buildCharacterAnims({ outfit: NOVICE_OUTFIT, hair: h, weapon: dagger }, 'a')]));
  for (const [i, a] of defaultBuilt.entries()) {
    const n = a.def.name;
    const base = `characters/novice`;
    save(`${base}/novice_${n}_sheet.png`, a.composite.pix);
    save(`${base}/layers/novice_body_a_${n}.png`, a.layers.body.pix);
    save(`${base}/layers/novice_body_b_${n}.png`, bodyB[i].layers.body.pix);
    save(`${base}/layers/weapon_dagger_over_${n}.png`, a.layers.weaponOver.pix);
    save(`${base}/layers/weapon_dagger_under_${n}.png`, a.layers.weaponUnder.pix);
    // Styles without back hair (short, spiky, bob) have no back layer; it is omitted, not shipped empty.
    const backStyles = HAIR_STYLES.filter((h) => !hairBuilt[h][i].layers.hairBack.pix.isEmpty());
    for (const h of HAIR_STYLES) {
      if (backStyles.includes(h)) save(`${base}/layers/hair_${h}_back_${n}.png`, hairBuilt[h][i].layers.hairBack.pix);
      save(`${base}/layers/hair_${h}_front_${n}.png`, hairBuilt[h][i].layers.hairFront.pix);
    }
    (nov.animations as Record<string, unknown>)[n] = {
      key: `novice_${n}`, image: `${base}/novice_${n}_sheet.png`,
      layers: {
        body: { a: `${base}/layers/novice_body_a_${n}.png`, b: `${base}/layers/novice_body_b_${n}.png` },
        hairBack: Object.fromEntries(backStyles.map((h) => [h, `${base}/layers/hair_${h}_back_${n}.png`])),
        hairFront: Object.fromEntries(HAIR_STYLES.map((h) => [h, `${base}/layers/hair_${h}_front_${n}.png`])),
        weaponUnder: `${base}/layers/weapon_dagger_under_${n}.png`, weaponOver: `${base}/layers/weapon_dagger_over_${n}.png`,
      },
      frameWidth: FW, frameHeight: FH, columns: a.def.frames, rows: 4, directions: VIEWS,
      frameDurationMs: a.def.frameMs, repeat: a.def.loop ? -1 : 0, origin: { x: 0.5, y: BASE_Y / FH },
      events: a.def.events,
      weaponSockets: a.meta.map((row) => row.map((m) => ({ x: m.hand.x, y: m.hand.y, angle: m.weaponAngle, layer: m.weaponOver ? 'over' : 'under' }))),
      vfxAttach: { caster: { x: FW / 2, y: BASE_Y - 28 }, feet: { x: FW / 2, y: BASE_Y }, overhead: { x: FW / 2, y: 8 } },
    };
    qa.push(...runQa(`novice_${n}`, a.composite, { kind: 'character', anim: n, frames: a.def.frames, rows: 4 }));
  }
  save('weapons/dagger/weapon_dagger.png', dagger);
  saveJson('animations/novice.json', nov);
  (manifest.characters as Record<string, unknown>).novice = 'animations/novice.json';

  // Concept / turnaround sheet + portrait
  const idle = defaultBuilt[0].composite;
  const concept = new Pixmap(FW * 4 * 4 + 32 * 4 + 24, FH * 4 + 16);
  for (let r = 0; r < 4; r++) concept.blit(idle.cell(0, r).scale(4), 8 + r * FW * 4, 8);
  const portrait = idle.cell(0, 0).crop(8, 10, 32, 32).scale(2);
  concept.blit(portrait.scale(2), FW * 16 + 16, 8);
  // palette swatches
  const sw = [R.skin, R.hair, R.eye, R.linen, R.cloth_brown, R.leather, R.satchel, R.brass, R.steel];
  sw.forEach((rp, i) => (['l', 'b', 's', 'd', 'o'] as const).forEach((t, j) => concept.rect(FW * 16 + 16 + j * 24, 8 + 136 + i * 12, 24, 12, rp[t])));
  save('characters/novice/novice_concept.png', concept);
  save('portraits/novice_portrait.png', portrait);
  (manifest.portraits as Record<string, string>).novice = 'portraits/novice_portrait.png';

  // ---------------------------------------------------------------- Monsters
  const drops: Record<string, string> = { leaf_slime: 'jelly', mushling: 'mushling_cap', horn_rabbit: 'rabbit_horn' };
  for (const mon of BATCH001_MONSTERS) {
    const sheets = buildMonsterSheets(mon.draw);
    const meta: Record<string, unknown> = { id: mon.id, name: mon.name, frameWidth: MW, frameHeight: MH, directions: MVIEWS, origin: { x: 0.5, y: MB / MH }, originPx: { x: MW / 2, y: MB }, animations: {} };
    for (const { def, sheet } of sheets) {
      const rel = `monsters/${mon.id}/${mon.id}_${def.name}_sheet.png`;
      save(rel, sheet.pix);
      (meta.animations as Record<string, unknown>)[def.name] = { key: `${mon.id}_${def.name}`, image: rel, frameWidth: MW, frameHeight: MH, columns: def.frames, rows: 4, directions: MVIEWS, frameDurationMs: def.frameMs, repeat: def.loop ? -1 : 0, origin: { x: 0.5, y: MB / MH }, events: def.events };
      qa.push(...runQa(`${mon.id}_${def.name}`, sheet, { kind: 'monster', anim: def.name, frames: def.frames, rows: 4 }));
    }
    const port = sheets[0].sheet.cell(0, 0).scale(2);
    save(`portraits/monsters/${mon.id}_portrait.png`, port);
    meta.portrait = `portraits/monsters/${mon.id}_portrait.png`;
    const icon = dropIcon(drops[mon.id]);
    save(`items/${drops[mon.id]}.png`, icon);
    (manifest.items as Record<string, string>)[drops[mon.id]] = `items/${drops[mon.id]}.png`;
    meta.dropIcon = `items/${drops[mon.id]}.png`;
    saveJson(`animations/monsters/${mon.id}.json`, meta);
    (manifest.monsters as Record<string, string>)[mon.id] = `animations/monsters/${mon.id}.json`;
  }

  // ---------------------------------------------------------------- Tileset
  const ts = buildWillowbrookTileset();
  save('tilesets/willowbrook/willowbrook_ground.png', ts.image);
  const tsj = {
    type: 'tileset', version: '1.10', tiledversion: '1.10.2', name: 'willowbrook_ground', image: 'willowbrook_ground.png',
    imagewidth: ts.image.w, imageheight: ts.image.h, tilewidth: T, tileheight: T, columns: ts.columns, tilecount: ts.tiles.length, margin: 0, spacing: 0,
    tiles: ts.tiles.map((t) => ({ id: t.id, properties: [{ name: 'name', type: 'string', value: t.name }, { name: 'layer', type: 'string', value: t.layer }, ...(t.mask != null ? [{ name: 'mask', type: 'int', value: t.mask }] : [])] })),
    wangsets: ['dirt', 'path_stone', 'soil'].map((ter) => ({
      name: `grass_${ter}`, type: 'corner', tile: -1,
      colors: [{ name: 'grass', color: '#56a043', tile: 0, probability: 1 }, { name: ter, color: '#a07a4c', tile: ts.tiles.find((t) => t.name === `${ter}_15`)!.id, probability: 1 }],
      // Tiled corner order: top-right, bottom-right, bottom-left, top-left (indices 1,3,5,7 of wangid).
      wangtiles: ts.tiles.filter((t) => t.terrain === ter && t.mask).map((t) => {
        const nw = t.mask! & 1 ? 2 : 1, ne = t.mask! & 2 ? 2 : 1, sw = t.mask! & 4 ? 2 : 1, se = t.mask! & 8 ? 2 : 1;
        return { tileid: t.id, wangid: [0, ne, 0, se, 0, sw, 0, nw] };
      }),
    })),
  };
  saveJson('tilesets/willowbrook/willowbrook_ground.tsj', tsj);
  saveJson('tilesets/willowbrook/willowbrook_ground.json', { image: 'tilesets/willowbrook/willowbrook_ground.png', tileSize: T, columns: ts.columns, autotile: 'dual-grid corner masks (NW=1, NE=2, SW=4, SE=8); grass is the base, other terrains are overlays', tiles: ts.tiles });
  (manifest.tilesets as Record<string, string>).willowbrook = 'tilesets/willowbrook/willowbrook_ground.json';
  qa.push(...runQa('willowbrook_ground', null, { kind: 'tileset', image: ts.image, tiles: ts.tiles }));

  // ---------------------------------------------------------------- Props atlas + buildings
  const props = buildWillowbrookProps();
  const atlasW = 512;
  let ax = 0, ay = 0, rowH = 0;
  const frames: Record<string, unknown> = {};
  const placed: { p: (typeof props)[number]; x: number; y: number }[] = [];
  for (const p of props) {
    if (ax + p.pix.w > atlasW) { ax = 0; ay += rowH + 2; rowH = 0; }
    placed.push({ p, x: ax, y: ay });
    frames[p.key] = { frame: { x: ax, y: ay, w: p.pix.w, h: p.pix.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: p.pix.w, h: p.pix.h }, sourceSize: { w: p.pix.w, h: p.pix.h }, pivot: p.origin, footprint: p.footprint };
    ax += p.pix.w + 2; rowH = Math.max(rowH, p.pix.h);
  }
  const atlas = new Pixmap(atlasW, ay + rowH);
  for (const { p, x, y } of placed) atlas.blit(p.pix, x, y);
  save('environment/willowbrook/willowbrook_objects.png', atlas);
  saveJson('environment/willowbrook/willowbrook_objects.json', { frames, meta: { app: 'veyloria asset-studio', image: 'willowbrook_objects.png', format: 'RGBA8888', size: { w: atlas.w, h: atlas.h }, scale: '1' } });
  const blds: Record<string, unknown> = {};
  for (const b of WILLOWBROOK_BUILDINGS) {
    const bp = building(b.style, b.w, b.h, b.door);
    const rel = `environment/willowbrook/buildings/willowbrook_${bp.key}.png`;
    save(rel, bp.pix);
    blds[bp.key] = { image: rel, footprint: bp.footprint, door: b.door, origin: bp.origin, padding: { x: 4, bottom: 3 } };
    qa.push(...runQa(`building_${bp.key}`, null, { kind: 'image', image: bp.pix }));
  }
  (manifest.environment as Record<string, unknown>).willowbrook = { objects: 'environment/willowbrook/willowbrook_objects.json', objectsImage: 'environment/willowbrook/willowbrook_objects.png', buildings: blds };
  qa.push(...runQa('willowbrook_objects', null, { kind: 'image', image: atlas }));

  // ---------------------------------------------------------------- VFX
  for (const d of BATCH001_VFX) {
    const s = buildVfxSheet(d);
    const rel = `vfx/${d.folder}/${d.key}_sheet.png`;
    save(rel, s.pix);
    const meta = { key: d.key, image: rel, frameWidth: d.fw, frameHeight: d.fh, columns: d.frames, rows: 1, frameDurationMs: d.frameMs, repeat: d.loop ? -1 : 0, origin: d.origin, blendMode: d.blend, attach: d.attach, impactFrame: d.impactFrame, soundEvent: d.sound };
    saveJson(`vfx/${d.folder}/${d.key}.json`, meta);
    (manifest.vfx as Record<string, unknown>)[d.key] = meta;
    qa.push(...runQa(d.key, s, { kind: 'vfx', anim: d.key, frames: d.frames, rows: 1 }));
  }

  // ---------------------------------------------------------------- Tiled map export
  const tmj = exportWillowbrookTmj(ts.tiles);
  saveJson('maps/willowbrook/willowbrook.tmj', tmj);
  (manifest.maps as Record<string, string>).willowbrook = 'maps/willowbrook/willowbrook.tmj';

  saveJson('manifests/batch001.json', manifest);

  // ---------------------------------------------------------------- docs: contact sheets + QA
  mkdirSync(DOCS, { recursive: true });
  const contact = (name: string, sheets: { label: string; sheet: Sheet }[], bg: [number, number, number, number], scale = 2) => {
    const w = Math.max(...sheets.map((s) => s.sheet.pix.w)), h = sheets.reduce((a, s) => a + s.sheet.pix.h + 6, 0);
    const out = new Pixmap(w + 12, h + 6); out.rect(0, 0, out.w, out.h, bg);
    let y = 6; for (const s of sheets) { out.blit(s.sheet.pix, 6, y); y += s.sheet.pix.h + 6; }
    writeFileSync(join(DOCS, name), out.scale(scale).toPNG());
  };
  contact('contact_novice.png', defaultBuilt.map((a) => ({ label: a.def.name, sheet: a.composite })), [92, 110, 84, 255]);
  contact('contact_novice_body_b.png', bodyB.map((a) => ({ label: a.def.name, sheet: a.composite })), [92, 110, 84, 255]);
  for (const mon of BATCH001_MONSTERS) contact(`contact_${mon.id}.png`, buildMonsterSheets(mon.draw).map((x) => ({ label: x.def.name, sheet: x.sheet })), [92, 110, 84, 255]);
  contact('contact_vfx.png', BATCH001_VFX.map((d) => ({ label: d.key, sheet: buildVfxSheet(d) })), [30, 34, 44, 255]);
  writeFileSync(join(DOCS, 'contact_tileset.png'), ts.image.scale(2).toPNG());
  writeFileSync(join(DOCS, 'contact_objects.png'), atlas.scale(2).toPNG());
  writeFileSync(join(DOCS, 'novice_concept.png'), concept.toPNG());
  // Every PNG not covered by a sheet/tileset check above (layers, portraits, icons, concept, weapon) gets the image checks.
  const covered = /_sheet\.png$|willowbrook_ground\.png$|willowbrook_objects\.png$|\/buildings\//;
  for (const [rel, p] of images) if (!covered.test(rel)) qa.push(...runQa(rel, null, { kind: 'image', image: p }));
  const fails = qa.filter((q) => !q.pass);
  saveJson('qa-report.json', { generatedAt: new Date().toISOString(), files: written.length, checks: qa.length, failed: fails.length, results: qa }, DOCS);
  writeFileSync(join(DOCS, 'files.txt'), written.join('\n') + '\n');
  console.log(`Batch 001: wrote ${written.length} files, QA ${qa.length - fails.length}/${qa.length} checks passed`);
  for (const f of fails) console.log('  FAIL', f.asset, f.check, f.detail);
  void HUMANOID_ANIMS; void MONSTER_ANIMS;
}
