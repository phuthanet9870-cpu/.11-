# VEYLORIA ONLINE: *Legends Begin With You*

A 2D fantasy MMORPG with a top-down 3/4 view. It's built with TypeScript, Phaser 3 (WebGL), HTML/CSS UI and Vite.

> **Status: Phase 1 (Playable Game Foundation): done and tested in single-player development mode.**
> The art and audio are **procedural placeholders** that the game generates itself; you can swap in real assets through the asset manifest.
> Online play (accounts, server, party, guild, trading) is planned for Phase 3 and isn't built yet.

## ภาพรวม (Thai summary)
- **โลกสไตล์ Ragnarok Online มี 30 แมพใน 9 ภูมิภาค** มีเมือง 7 เมือง ทุ่ง และดันเจี้ยน แต่ละภูมิภาคมีสี สภาพอากาศ เพลง และมอนสเตอร์ของตัวเอง (ดู [docs/WORLD.md](docs/WORLD.md))
- **เควสมีแค่เควสฝึกสอน 5 เควส** ได้แก่ ลงทะเบียนกิลด์ → ล่า Leaf Slime → ซื้อและสวมอาวุธ → ตีบวก +1 → เก็บ Job Lv 10
- **เปลี่ยนอาชีพที่ Guild Master** (Knight อยู่ Aurelion, Ranger อยู่ Fernhollow, Mage อยู่ Arcanthe)
- **ระบบแบบ Ragnarok (กลไกเท่านั้น ไม่ได้ลอกชื่อหรือข้อมูลของ RO):**
  - การ์ดมอนสเตอร์ 70 ใบ ดรอป 0.01% ใส่ลงช่องการ์ดของอุปกรณ์ได้
  - ตารางอาวุธเทียบขนาดมอนสเตอร์
  - โบนัสความเสียหายตามเผ่าและขนาด, Perfect Dodge
  - น้ำหนักเกิน 90% จะตีและใช้สกิลไม่ได้
  - ระบบ MVP พร้อมป้ายหลุมศพ
  - ดูรายละเอียดที่ [docs/RO_SYSTEMS.md](docs/RO_SYSTEMS.md)
- **ระบบตีบวก +1 ถึง +10:** อาวุธตีได้ปลอดภัยถึง +5 และชุดเกราะถึง +4 ถ้าเกินจากนั้นแล้วตีพลาด ของจะแตก
- ระบบที่ทำเสร็จแล้ว ได้แก่ การเดิน (คลิกเมาส์/WASD), กล้องติดตาม, Collision ที่ตรงกับภาพ, NPC/บทสนทนา, Monster AI แบบ State Machine, การต่อสู้แบบ Real-time พร้อมธาตุและ Status, EXP/เลเวล (Base และ Job), Stat Points, Inventory/Equipment, สกิลและ Hotbar, เควสต์ 17 เควสต์, ร้านค้า, คลังเก็บของ, การเซฟ/โหลดแบบมีเวอร์ชัน, เสียง และ UI ครบชุดสำหรับ Phase 1
- ภาพและเสียงตอนนี้เป็น **Placeholder ที่เกมสร้างขึ้นเอง** (ต้นฉบับทั้งหมด) และเปลี่ยนเป็น Artwork จริงได้ผ่าน `public/assets/asset-manifest.json` โดยไม่ต้องแก้ Logic
- ระบบออนไลน์ยังไม่ได้ทำ (อยู่ใน Phase 3)

---

## Quick start

Requirements: **Node.js 20+** (tested with Node 22) and npm.

```bash
npm install          # install dependencies
npm run dev          # dev server → http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build → http://localhost:4173
```

### Tests
```bash
npm test                 # all unit + integration tests (Vitest)
npm run test:unit        # unit tests only
npm run test:integration # headless playthrough + class balance tests
npm run test:e2e         # builds, then drives the real game in Chromium (Playwright)
npm run assets:manifest  # regenerate public/assets/asset-manifest.json from data
```
`test:e2e` uses Playwright's Chromium. If it isn't installed: `npx playwright install chromium`.

## Controls
| Action | Mouse | Keyboard (rebindable in Settings) |
|---|---|---|
| Move | Left-click the ground (click the minimap to travel) | WASD / arrow keys |
| Attack | Left-click a monster (keeps auto-attacking) | Tab = target the nearest monster |
| Talk / interact | Left-click an NPC or object | F = nearest NPC/object |
| Pick up loot | Left-click the item | Z = nearest item |
| Skills / items | Click a hotbar slot | 1–0 |
| Stop / cancel | Right-click | Esc closes windows |
| Windows | Bottom-right buttons | I inventory · E equipment · C status · K skills · Q quests · M world map · O settings · F8 GM tools |
| Chat | | Enter (`/help` lists commands) |

Ground-target skills (Arrow Rain, Wind Trap, Fire Wall, Thunderstorm, Meteor) land on your current target. If you have no target, they land under the mouse cursor.

## What's in Phase 1

| Spec item | Status | Where |
|---|---|---|
| Game boot, loading, main menu | ✅ | `src/game/scenes/BootScene.ts`, `src/ui/screens.ts` |
| Character creation (name, body type, hair style/colour, eye colour, skin, 4-direction rotate preview) and 3 slots with create/delete/select | ✅ | `src/ui/screens.ts`, `src/core/character.ts` |
| Movement (click-to-move with A* pathfinding, WASD), camera follow | ✅ | `src/core/world.ts`, `src/core/pathfinding.ts` |
| Map rendering with layers (ground, decoration, walls, objects y-sorted, above-player, collision, spawns, interaction zones, portals) | ✅ | `src/core/mapCompiler.ts`, `src/game/art/mapPainter.ts` |
| Collision that matches the art (no walking through buildings, trees, walls or borders) | ✅ tested | `tests/unit/data.test.ts`, `tests/unit/world.test.ts` |
| NPC interaction and dialogue, quest markers (! ?) | ✅ | `src/ui/windows.ts` |
| Monster AI state machine (Idle → Patrol → Chase → Attack → Return → Death → Respawn); passive, aggressive, assist and magic/ranged types | ✅ | `src/core/world.ts` |
| Combat: auto-attack, range, attack speed, hit/miss/dodge, crits, damage numbers, knockback, death and respawn, aggro, leash | ✅ | `src/core/combat.ts`, `src/core/world.ts` |
| Element system (9 elements, editable 9×9 table) | ✅ | `src/data/elements.json` |
| Status effects (10, each with duration, chance, immunity, stack limit and cure) | ✅ | `src/data/statusEffects.json` |
| EXP and level (Base 1–120, Job 1–10/50), stat points, skill points, stat/skill reset | ✅ | `src/core/formulas.ts`, `src/config/balance.json` |
| Derived stats = Base + Equipment + Passives + Buffs + Statuses (cards and runes plug in later) | ✅ | `computeDerivedStats` |
| Inventory: 60-slot grid, stacking, weight limit, drag & drop, tooltips, sort, filter, lock, use, drop, sell, storage, binding | ✅ | `src/core/inventory.ts`, `src/ui/windows.ts` |
| Equipment: 8 slots, class/level requirements, two-handed rules | ✅ | |
| Skills: Novice (2), **Knight / Ranger / Mage** (8–9 each: active, passive, buff, ultimate), skill tree, cooldowns, cast times, MP, requirements | ✅ | `src/data/skills.json` |
| Job change at Job Lv 10 at a class guild master (Aurelion / Fernhollow / Arcanthe) | ✅ | NPC service `jobChange`, `World.changeJobAt` |
| Tutorial quests only (5): register, hunt, buy & equip a weapon, refine +1, reach Job Lv 10; objective types include buy/equip/refine; journal, tracker, markers | ✅ | `src/data/quests.json`, `src/core/quests.ts` |
| Refinement +1…+10 (ores + Luma, safe limits, failure destroys the item) at blacksmith NPCs | ✅ | `src/core/refine.ts` |
| Ragnarok-style mechanics: monster cards (70, 0.01%, slots, compounding), weapon-vs-size table, race/size bonuses, perfect dodge, 90% weight lock, MVP (top damage, MVP EXP and items, tombstone), Wandering Feather; RO stat-cost curve available but off (measured) | ✅ | `docs/RO_SYSTEMS.md`, `src/core/cards.ts` |
| 30 maps in 9 RO-style regions (7 towns, fields, 8 dungeons, 6 bosses), Courier Guild save/storage/warp, regional palettes, weather and music | ✅ | `docs/WORLD.md`, `tools/world-gen/build-world.ts` |
| Maps: **Willowbrook Village, Sunny Meadow, Whispering Forest** | ✅ | `src/data/maps/` |
| Monsters: 8 normal + 1 boss | ✅ | `src/data/monsters.json` |
| Boss: Grukk the Thornking. Intro, HP bar, 3 phases, enrage, telegraphed AoE (circle, ring, charge line), summons, threat, rare drops, contribution reward, respawn timer | ✅ | `src/data/bosses.json` |
| Save/Load: versioned with migrations, backup, sanitizing, autosave every 30s | ✅ tested | `src/core/save.ts` |
| HUD: HP/MP, EXP/Job EXP, hotbar with cooldowns, chat log, minimap, quest tracker, buffs, target frame, boss bar, cast bar, Luma | ✅ | `src/ui/hud.ts` |
| Windows: status, inventory, equipment, skill tree, quest journal, world map, settings (volume, toggles, key rebinding) | ✅ | `src/ui/windows.ts` |
| Audio: BGM per map, boss music, ambience, SFX; Master/Music/SFX/Ambient volume | ✅ (procedural) | `src/game/audio/audio.ts` |
| Asset manifest and replacement system with sprite metadata | ✅ | `docs/ASSET_PIPELINE.md` |

## GM / admin tools

Open them with the **GM** button (bottom right), **F8**, or `/gm` in chat. You can:
- heal, toggle god mode, add levels / Luma / stat and skill points, change class
- give any item
- teleport, spawn monsters near you, defeat all monsters on the map
- fill or reset quest objectives

The tools edit the local save only, and any use sets `flags.gmUsed` on the character. The commands live in `src/core/gm.ts`. When the game moves to a server (Phase 3), they must become server-side commands behind an admin role.

## Test results (this commit)

| Suite | Result |
|---|---|
| Unit (`tests/unit`, 9 files) | **275 / 275 passed** (includes per-map data checks for all 30 maps): refine, tutorial quests, NPC job change and warps, GM commands, data validation and map reachability, formulas, combat and elements, inventory/shop/storage, quests, save/migrations, world simulation (collision, portals, AI, skills, boss, invalid commands, no double-spend) |
| Integration: full playthrough | **passed**. A bot using only player commands finishes the 5 tutorial quests, becomes a Knight at the guild in Aurelion, switches to a spear for the Large boss (RO size rule), refines, and defeats Grukk (≈121 simulated minutes, Base Lv 28, 5 attempts). A second test walks through portals to all 30 maps |
| Integration: class balance | **passed**. First-try boss wins at Lv 17: Knight 6/6, Ranger 6/6, Mage 4/6 (fixed seeds) |
| E2E in Chromium (`npm run test:e2e`) | **24 / 24 checks passed** (incl. GM window, refine and guild job change): boot, create character via UI, WASD, click NPC → dialogue → accept quest, windows by hotkey, portal travel, mouse-click combat kill with EXP, save and reload persistence, shop purchase, drag & drop equip, stat allocation, job change via dialogue, learn skill, drag skill to hotbar, cast by hotkey, death → respawn, drop part of a stack via the quantity dialog, delete a character with typed-name confirmation, zero page errors |

Screenshots from the e2e run are written to `tests/e2e/screenshots/` (git-ignored).

**Batch 001 art (Willowbrook Starter Pack):** asset QA **551 / 551** checks passed (`npm run assets:batch001`), and the in-game demo **26 / 26** (`npm run demo:batch001`). See [docs/art/BATCH001.md](docs/art/BATCH001.md).

## Project structure
```
src/
  core/      game rules & simulation (no rendering): world, combat, formulas, inventory, quests, maps, save
  data/      JSON content: classes, skills, items, monsters, bosses, drops, NPCs, shops, quests, maps, tiles, audio
  config/    balance.json (all tunable numbers)
  game/      Phaser scenes, procedural art, effects, audio, asset registry
  ui/        HTML UI: app shell, screens, HUD, windows, CSS
public/assets/asset-manifest.json   asset keys + sprite contracts (replace placeholders here)
tests/       unit/, integration/, e2e/, helpers/ (bot & scenario builders)
docs/        ARCHITECTURE.md, ASSET_PIPELINE.md
scripts/     generate-asset-manifest.mjs
tools/asset-studio/   pixel-art generator + QA for the production art batches
```
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md).

## Not done yet (honest list)
- **Most art and all audio are still placeholders.** Batch 001 production art covers the Novice, Leaf Slime, Mushling, Horn Rabbit, Willowbrook (tiles, props, buildings) and 4 VFX ([docs/art/BATCH001.md](docs/art/BATCH001.md)). Everything else (the other classes, NPCs, monsters and maps, plus all music and SFX) is still generated at runtime.
- **No multiplayer.** There's no login/register, server, database, party, guild, trading or marketplace (Phase 3). Chat only echoes locally and says so. Saves live in browser `localStorage`.
- **Not built in Phase 1:** Priest, Assassin and Merchant; advanced jobs; refinement (a stat-scaling hook exists in `refineMods`, but there's no UI or NPC); monster cards; Rune Constellation; pets and mounts; crafting; dungeons; world events; day/night; weather; PvP; Guild War.
- All 30 maps exist. Their 64 regular monsters and 6 bosses reuse 14 procedural body types in regional colours, and the stats of the newer monsters come from a level formula. Equipment still tops out around level 20, so the Lv 40–85 regions need new gear tiers and haven't been balance-tested.
- The world map shows the other regions as "Unexplored". They're labels, not playable areas.

## Known issues
- Balance has been tuned with bots (`tests/integration`), not human playtesters. A careless Novice can still die often around Lv 9–11 near wasps and goblins.
- Monsters don't collide with each other, so they can overlap (classic RO-style).
- Name labels can overlap when a player stands right next to an NPC or monster.
- The production JS bundle is about 1.5 MB (mostly Phaser), so Vite prints a chunk-size note.
- Performance has only been checked with the Phase 1 entity counts (about 40 monsters per map). It hasn't been load-tested.
- The layout targets desktop 1280×720 and scales to fit the window. There are no touch controls.

## Next phase (Phase 2: Complete RPG System)
Add Priest, Assassin and Merchant plus the advanced jobs and full skill trees. Add refinement +1…+15 (results resolved in the simulation only), monster cards, Rune Constellation, pets and mounts, and crafting. Expand to 10 maps. All of it plugs into the existing data files and `World` APIs. Phase 3 then moves `World` onto a Node.js (Colyseus) server with PostgreSQL/Redis for authoritative online play.

## Credits & licensing
All code, data, procedural art and synthesized audio in this repository are original. The game is inspired by classic MMORPGs, but it doesn't use any characters, art, maps or sounds from other games.
