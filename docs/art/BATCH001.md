# Batch 001: Willowbrook Starter Pack

Status: **made, QA-checked and running in the game.** Everything below is regenerated with
`npm run assets:batch001`. The in-game demo and alignment test is `npm run demo:batch001`.

## How the art is made

There was no image-generation model in this pipeline. Every pixel comes from
`tools/asset-studio/`, a deterministic pixel-art generator written for this project:

- Parts are drawn as material shapes (ellipses, capsules, polygons) on a *material canvas*.
  Shading is automatic cel shading with light from the upper-left: top/left edges take the
  light tone, bottom/right edges the shadow tone, and the bottom-right corner the deep tone.
  The selective outline is the darkest tone of each ramp.
- Every material uses a hand-picked 5-tone hue-shifted ramp (`palette.ts`). No anti-aliasing:
  alpha is 0 or 255 only. Fades use 4×4 Bayer ordered dithering.
- Pose transforms (mirroring, falling, lying down) are applied to the materials *before*
  shading, so lighting stays upper-left in every frame and direction.
- The QA (`qa.ts`) measures the actual pixels. It never just assumes a check passed.

## Files produced (121 files under `public/assets/`)

| Asset | Files | Frames / size |
|---|---|---|
| Novice composite sheets | `characters/novice/novice_{idle,walk,attack,cast,hit,death}_sheet.png` | 48×64, 4 rows (down, left, right, up). idle 5 @160ms, walk 8 @90, attack 6 @75, cast 6 @100, hit 3 @90, death 8 @110 |
| Novice layers (for customisation) | `characters/novice/layers/` (66 PNGs): body A/B, hair front ×5 styles, hair back (long, ponytail), dagger over/under, per animation | same grid as the sheets |
| Novice concept / portrait | `characters/novice/novice_concept.png`, `portraits/novice_portrait.png` | 4 views + palette |
| Dagger | `weapons/dagger/weapon_dagger.png` | 12×5 |
| Novice metadata | `animations/novice.json` | frame timings, events (footstep, impact, cast, land), weapon socket and angle per frame, VFX attach points, hitbox, palette-swap keys |
| Leaf Slime, Mushling, Horn Rabbit | `monsters/<id>/<id>_{idle,walk,attack,hit,death}_sheet.png` | 48×48, 4 rows. idle 5, walk 8, attack 6, hit 3, death 8 |
| Monster metadata / portraits / drops | `animations/monsters/<id>.json`, `portraits/monsters/<id>_portrait.png`, `items/{jelly,mushling_cap,rabbit_horn}.png` | drop icons 32×32 |
| Willowbrook ground tileset | `tilesets/willowbrook/willowbrook_ground.{png,json,tsj}` | 32×32. Grass ×4, dual-grid autotiles (15 masks + variants) for dirt, cobble path and farm soil; flowers, tufts, pebbles, crops; thicket, fences, canopy overhang. The `.tsj` has Tiled wang sets |
| Environment props | `environment/willowbrook/willowbrook_objects.{png,json}` (Phaser atlas) | 3 oak variants, bush, rock, crate, barrel, well, fountain, signpost, anvil, lamp post, planter, haystack |
| Buildings | `environment/willowbrook/buildings/willowbrook_{inn_8x6,smithy_8x6,shop_7x5,guild_10x6,house_6x5,house_5x4}.png` | timber-frame. Signboards use icons, not text |
| Tiled map | `maps/willowbrook/willowbrook.tmj` | Ground, terrain overlays, decoration, walls, above-player, objects, buildings, collision, spawns, interaction zones, portals |
| VFX | `vfx/physical/fx_sword_slash_sheet.png` (64×64 ×6 @50ms), `vfx/physical/fx_hit_basic_sheet.png` (48×48 ×5 @45), `vfx/holy/fx_heal_sheet.png` (64×96 ×10 @70), `vfx/special/fx_level_up_sheet.png` (96×128 ×12 @80), each with a `.json` | origin, impact frame, attach point, sound event |
| Batch manifest | `manifests/batch001.json` | entry point the game loads |

The full list is in `docs/art/batch001/files.txt`. Contact sheets and the QA report are in
`docs/art/batch001/`.

## QA: 551 / 551 checks passed

Per sprite sheet:
- Sheet dimensions match the frame grid.
- Binary alpha.
- At most 64 colours.
- No empty frames.
- No frame touches the cell edge (no clipping).
- Transparent corners.
- Every frame is distinct within its direction.
- Feet on the baseline: y = 61 for the character (except death), y = 45 for monster idle and hit.
- The idle pose is centred within ±3 px.
- The left and right rows mirror each other (silhouette IoU ≥ 90%).

Tileset:
- Tiles are on the 32 px grid.
- Binary alpha.
- Autotile seams match on every shared edge (worst mismatch ≤ 2 px).
- Full tiles are opaque.

Every other PNG (layers, portraits, icons, concept, weapon, buildings, atlas) gets the image
checks: binary alpha, not empty, transparent background, and the colour budget.

## In-game integration

- `src/game/batchArt.ts` loads the batch manifest, then the metadata, then the images.
  - The Novice player sprite is built at runtime from the layers in the chosen hair style and
    body type. Skin, hair and eye colours are recoloured from the palette keys into
    hue-shifted ramps generated from the player's chosen colours.
  - The dagger layer is drawn only when a dagger is equipped.
- Leaf Slime, Mushling and Horn Rabbit use the 4-direction sheets. The feet pivot is 45/48 and
  no mirroring is applied.
- The four VFX replace the old particle versions:
  - the slash on melee swings and on Bash / Counter Attack
  - the hit spark on physical damage
  - heal from potions, First Aid and respawn
  - the level-up pillar
- Effects attached to a target follow it while they play.
- Willowbrook's ground, terrain transitions, decoration, walls and canopy are drawn from the
  tileset with the same dual-grid rule as the `.tmj` export. Props come from the atlas and
  buildings from the building PNGs.
- If any Batch 001 file is missing, the game falls back to the procedural placeholders.

### Demo / alignment test: `tests/e2e/batch001-demo.mjs`: 26 / 26 passed

The demo runs in real Chromium and checks the live Phaser objects:
- The player uses the composed Novice texture, and its pivot sits on the world position.
- Idle cycles through all 5 frames.
- WASD walking uses the correct direction row (down 0, left 1, right 2, up 3) with no mirroring.
- Heal and Level Up are anchored at the feet.
- For each of the three monsters:
  - It uses its 4-direction sheet with the feet pivot.
  - The slash is centred on the target, and the hit spark lands on the target.
  - The player's attack animation faces the monster.
  - The monster's hit or attack animation plays, then its death animation.

The screenshots are in `docs/art/batch001/ingame/`.

The demo also found two bugs, now fixed:
- Keyboard movement never switched the player to the walk animation (Phase 1 bug; a
  regression test has been added).
- Monster sprites didn't switch texture between animations (a bug in the new integration code,
  caught before commit).

## Known limits / not in this batch

- **Novice:** the spec's run, victory, sit and emote animations aren't made yet. Only the
  dagger has weapon art, so a club is not drawn.
- **Other characters:** Knight, Ranger and Mage, and all NPCs, still use the procedural sheets.
- **Other content:** the other 5 monsters, the boss, and the Sunny Meadow and Whispering
  Forest tilesets are still procedural.
- **Character creation and HUD:** the preview and HUD portrait still show the procedural look.
- **Monster hit reaction:** it plays only when the monster isn't mid-attack (a world-timing
  rule), so it's rarely visible on the Horn Rabbit.
- **Test speed:** headless Chromium (software WebGL) runs the game at roughly 15% of real
  time, so the demo waits on game time.
