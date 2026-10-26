// Generates public/assets/asset-manifest.json from the game data files.
// Every texture key the game uses is listed with its sprite contract. Set
// "source": "file" and "file": "<path under public/assets>" on an entry to
// replace the procedural placeholder with real artwork (no code changes).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const outPath = join(root, 'public/assets/asset-manifest.json');
const previous = existsSync(outPath) ? read('public/assets/asset-manifest.json') : { entries: [] };
const keep = new Map(previous.entries.filter((e) => e.source === 'file').map((e) => [e.key, e]));

const CHAR_ANIMS = {
  idle: { start: 0, count: 2, frameMs: 520, loop: true }, walk: { start: 2, count: 4, frameMs: 130, loop: true },
  attack: { start: 6, count: 3, frameMs: 90, loop: false }, cast: { start: 9, count: 3, frameMs: 160, loop: true },
  hit: { start: 12, count: 1, frameMs: 200, loop: false }, death: { start: 13, count: 3, frameMs: 220, loop: false },
};
const MON_ANIMS = {
  idle: { start: 0, count: 2, frameMs: 450, loop: true }, walk: { start: 2, count: 4, frameMs: 140, loop: true },
  attack: { start: 6, count: 3, frameMs: 110, loop: false }, hit: { start: 9, count: 1, frameMs: 180, loop: false },
  death: { start: 10, count: 3, frameMs: 200, loop: false },
};

const entries = [];
const add = (e) => entries.push(keep.get(e.key) ?? { source: 'procedural', placeholder: true, ...e });

for (const c of read('src/data/classes.json')) {
  add({ key: `chr_${c.id}`, type: 'spritesheet', frameWidth: 48, frameHeight: 64, rows: ['down', 'left', 'right', 'up'], animations: CHAR_ANIMS,
    pivot: { x: 0.5, y: 0.9375 }, collisionBox: { w: 18, h: 12 }, notes: `${c.name} base body; player sheets are composed from appearance + class outfit + weapon at runtime` });
}
for (const n of read('src/data/npcs.json')) {
  add({ key: `npc_${n.id}`, type: 'spritesheet', frameWidth: 48, frameHeight: 64, rows: ['down', 'left', 'right', 'up'], animations: CHAR_ANIMS,
    pivot: { x: 0.5, y: 0.9375 }, collisionBox: { w: 32, h: 32 }, notes: n.name });
  add({ key: `portrait_${n.id}`, type: 'image', notes: `${n.name} dialogue portrait (96x96 or larger)` });
}
for (const m of read('src/data/monsters.json')) {
  add({ key: `mon_${m.id}`, type: 'spritesheet', frameWidth: m.art.w, frameHeight: m.art.h, rows: ['left (mirrored for right)'], animations: MON_ANIMS,
    pivot: { x: 0.5, y: 1 }, collisionBox: { w: Math.round(m.collisionRadius * 1.4), h: Math.round(m.collisionRadius * 0.9) }, notes: m.name });
}
for (const id of ['willowbrook', 'sunny_meadow', 'whispering_forest']) {
  const map = read(`src/data/maps/${id}.json`);
  for (const layer of ['ground', 'walls', 'above']) add({ key: `map_${id}_${layer}`, type: 'image', notes: `${map.name} ${layer} layer, ${map.width * 32}x${map.height * 32}px` });
}
for (const it of read('src/data/items.json')) add({ key: `icon_item_${it.id}`, type: 'image', notes: `${it.name} icon (32x32)` });
for (const s of read('src/data/skills.json')) add({ key: `icon_skill_${s.id}`, type: 'image', notes: `${s.name} icon (32x32)` });
for (const fx of ['fx_dot', 'fx_glow', 'fx_spark', 'fx_arrow']) add({ key: fx, type: 'image', notes: 'particle texture' });

const manifest = {
  version: 1,
  generated: 'scripts/generate-asset-manifest.mjs',
  namingConvention: {
    'chr_<classId>': 'Player class body sprite sheet', 'npc_<npcId>': 'NPC sprite sheet', 'portrait_<npcId>': 'NPC portrait',
    'mon_<monsterId>': 'Monster sprite sheet', 'map_<mapId>_<layer>': 'Map layer artwork (ground|walls|above)',
    'obj_<tilesetId>_<objectKind>_<variant>': 'World object sprite', 'icon_item_<itemId>': 'Item icon', 'icon_skill_<skillId>': 'Skill icon',
    'fx_<name>': 'Effect / particle texture', 'bgm_<trackId>': 'Music track', 'sfx_<name>': 'Sound effect',
  },
  entries,
};
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${entries.length} entries to ${outPath} (${entries.filter((e) => e.source === 'file').length} file-backed)`);
