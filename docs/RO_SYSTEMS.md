# Ragnarok Online–style systems

Veyloria borrows Ragnarok Online's game **mechanics** (rules and formulas). It does **not** copy
RO's protected content: no RO names (cities, monsters, items, NPCs), databases, sprites, music or
text. Every card, item, monster and place in the game is original. The mechanics below were
researched from public community wikis (sources at the end) and then implemented and tested.

## What's implemented

| System | RO rule | In Veyloria | Where |
|---|---|---|---|
| Hit chance | 80 + HIT − FLEE, clamped | Same (5%–97%) | `combat.hitChance`, `balance.combat` |
| Perfect dodge | 1 + LUK/10 %, ignores HIT, rolled before FLEE | Same, for players | `formulas.ts`, `combat.resolveAttack` |
| Critical | Rate ≈ LUK × 0.3 + 1; crits ignore DEF; damage 140% | Same (`critDmgBase` 140) | `balance.stats` |
| Weapon vs size | Dagger 100/75/50, 1H sword 75/100/75, spear 75/75/100, mace 75/100/100, bow 100/100/75, staff 100/100/100 | Same table (club = mace) | `balance.combat.sizeModifiers` |
| Races | 10 monster races; players count as demi-human | Monster `race` field; player = demihuman | `combat.ts` |
| Race / size / element bonuses | Cards and gear add +% damage vs a race or size, or −% taken from a race or element | `raceDamagePct`, `sizeDamagePct`, `raceResistPct`, `elementResistPct` modifiers | `types.StatModifiers` |
| Cards | Every monster has a card at 0.01%. Compounded permanently into a slotted item; can't be removed; lost if the item is destroyed | 70 original cards, one per monster, at 0.01%. Weapon cards (race/size/ATK), armor (HP, element resist), shield (race resist), garment, footgear, headgear, accessory | `core/cards.ts`, `tools/world-gen/build-world.ts` |
| Card slots | Up to 4 on weapons, 1 on other gear | Daggers 3, other weapons 2, rare weapons 1, other equipment 1; names show `[used/total]` | generator |
| Weapon levels | Weapons are level 1–4; a higher level is stronger but harder to refine | Starter weapons Lv 1, common Lv 2, uncommon Lv 3, rare/epic Lv 4 | generator, `ItemDef.weaponLevel` |
| Refining | Safe limits by weapon level +7 / +6 / +5 / +4, armor +4; classic success table above that; ATK per refine +2 / +3 / +5 / +7; armor +0.7 DEF per refine; a failure destroys the item and its cards; enriched ores use a better table; refiner fees 50 / 200 / 5,000 / 20,000, armor 2,000 | Same tables and fees (from rAthena's pre-renewal `refine.yml`). Ores per grade: Glimmer (weapon Lv 1) and Bright (Lv 2) are sold by NPCs; Starsteel (Lv 3–4) and Moonstone (armor) only drop. Enriched Starsteel / Moonstone work on any level and drop from Lv 40+ monsters, MVPs and memorial dungeons | `core/refine.ts` |
| Forging | Smiths forge weapons from materials. An element stone makes the weapon elemental, star crumbs (up to 3) add ATK, the maker's name goes on the weapon, and forged weapons have no slots. Chance = 50 + JobLv×0.2 + DEX×0.1 + LUK×0.1 − weapon-level, element and crumb penalties | Same formula, with a +20% forge-master bonus in place of the smith skills. 9 recipes made from monster materials (weapon Lv 1–3); Flame/Frost/Gale/Terra stones drop from monsters of that element; Star Crumbs from Lv 15+ monsters; crumbs give +5 / +10 / +40 ATK | `core/forge.ts`, `recipes.json` |
| Random options | Ragnarok Zero: dropped gear rolls random options from weighted pools; an enchanter adds or rerolls them | Gear drops roll 0–3 options (60 / 25 / 11 / 4%). Options: stats, HP/MP, DEF, FLEE, element resist, ATK/MATK/HIT/CRIT, attack speed, race/size damage, status-on-hit, HP drain. The name colour shows the count. Enchantress Viveka in Arcanthe adds one (5,000 Luma, max 3) or rerolls all (10,000) | `core/options.ts` |
| On-hit effects | Item bonuses such as status-on-hit and HP drain | `onHitStatusPct` and `hpDrainPct` apply on basic attacks. Cards of status-inflicting monsters give that status at 5%; bat cards drain 3% HP | `world.ts` |
| Database | Monster and item databases (like the two linked sites) | Database window (B / DB button) showing every monster, item and card from the game's own data: search, filters, stats, maps, drops with rates, shops, forge recipes, "used to forge" | `windows.renderDatabase` |
| Weight | Limit 2000 + 30×STR. Minor overweight stops regen; major (90%) blocks attacking and skills | Same; regen stops at 70%, attacks and skills stop at 90% | `world.majorOverweight` |
| MVP | Reward to the top damage dealer, only if alive. MVP EXP plus MVP item rolls. A tombstone shows the killer and time | Same. MVP EXP = 50% of the boss's EXP, item rolls (Elder Sap / Elder Seed / ores), banner, and a tombstone with a respawn countdown | `world.ts` boss death, `GameScene.syncTombstones` |
| Teleport items | One wing teleports randomly on the map, another returns to the save point | Wandering Feather (random spot on the map) and Wing of Return | `items.json` |
| Full-heal items | Rare items that restore full or half HP/SP | Elder Sap (full HP/MP) and Elder Seed (half), as MVP rewards | `items.json` |
| Towns and services | Kafra (save, storage, warp), class guilds, refiner | Courier Guild in every town, guild masters for job change, blacksmith refiners | `docs/WORLD.md` |
| Status points per level | floor(level/5) + 3 | Same | `balance.levels.statPointsPerLevel` |
| Elements | 10 elements (Neutral, Fire, Water, Wind, Earth, Holy, Shadow, Poison, Undead, Ghost) with defender element levels 1–4; each level has its own table (e.g. Neutral vs Ghost is 25% at Lv 1–2 and 0% at Lv 3–4) | Same 10×10×4 tables (from rAthena's pre-renewal `attr_fix.yml`, Dark = Shadow). Monsters have element levels by level tier, bosses one higher; ghost monsters added. Elemental converters (Ember / Frost / Gale / Terra Oil, Blessed Water, Wraith Oil) make your weapon elemental for 10 minutes | `elements.json`, `combat.elementModifier` |
| Jobs | Six first jobs (Swordman, Archer, Mage, Acolyte, Thief, Merchant) with job bonus stats per job level and a job weight bonus; ASPD shown as a 0–190 value | Six original first jobs: Knight, Ranger, Mage, Cleric, Rogue, Merchant, each with 8–9 skills incl. an ultimate. Job bonus stats per job level, job weight bonus (Merchant/Knight 800, Ranger 600, Cleric/Rogue 400, Mage 200), ASPD = 200 − delay/20 (cap 190) | `classes.json`, `skills.json`, `formulas.jobBonus` |
| Job mechanics | Steal, Double Attack (daggers), Discount / Overcharge, Mammonite (costs zeny), Enlarge Weight, cure skills | Pilfer (steal once per monster, never bosses), Twin Fang (5%/level with daggers), Haggle / Silver Tongue (max 24%), Coin Strike / Golden Ruin (cost Luma), Pack Mule (+200 weight/level), Purify / Antidote | `world.ts`, `inventory.buyPrice` |
| Pets | Tame with a taming item; capture rate (rate + (BaseLv − MonLv) × 30 + LUK × 20) × (200 − HP%) / 100; egg; hunger drops every minute; intimacy 0–1000 (start 250); feeding when hungry raises it, overfeeding lowers it, starving and owner death lower it; at 0 the pet leaves; Loyal pets give a bonus | Same rules and formula. 14 tameable monsters, lures and food at the Pet Keeper in Fernhollow, pet window (P), the pet follows you and shows a heart when Loyal | `core/pets.ts`, `pets.json` |
| Card / item combos | Wearing certain cards or items together gives an extra bonus | 16 combos: every card set from one field map, plus Rogue / Merchant / Cleric gear sets. Tooltips show ✓ when active | `combos.json`, `formulas.activeCombos` |
| Old Card Album | Opens into a random card | Faded Card Album (from elites, MVPs, memorial dungeons): a random non-boss card | `items.json` |
| Autocast | Some cards cast a spell by themselves on attack | Cards of spell-casting monsters cast a Lv 3 bolt (5%) on basic hits, free of MP | `world.playerBasicAttack` |
| Mini-bosses | Field mini-bosses with better drops | One elite per field map (×6 HP, ×1.5 ATK, 10-minute respawn, own card, card album 2%) | generator |
| Looters | Some monsters pick up items on the ground | Goblins, crabs and gulls pick up items left 3+ seconds and drop them when killed | `world.updateLooter` |
| Memorial dungeons | Timed instances with floors (e.g. Endless Tower), entry cooldown | Endless Spire (10 floors, Lv 20+, 30 min) and Sealed Crypt (4 rooms, Lv 45+, 20 min). A floor's portal stays sealed until it is cleared; no respawns; leaving, dying or timing out ends the run; 1-hour real-time cooldown; rewards on the last floor | `world.enterInstance`, `instances.json` |
| Second jobs | Two second jobs per first job | 12: Dragoon / Templar, Beastmaster / Minstrel, Sorcerer / Sage, Bishop / Ascetic, Shadowblade / Outlaw, Artisan / Alchemist. 8 skills each (passive + ultimate), Job Lv 40 of the first job, guild masters in the first job's town. New weapon types: katar, knuckle, instrument, book | `tools/world-gen/build-jobs.ts` |
| Rebirth / transcendent | At Base 99 / Job 50 a second job is reborn as a High Novice with 100 stat points, goes through a High first job, and becomes the transcendent version of the same path (+25% HP/SP) | Same path rule. Oracle Seraphel in Aurelion. 12 transcendent jobs, each with 2 extra skills and Job Lv 70 | `character.rebirth`, `lineage.ts` |
| Over-upgrade | +11…+20 with special ores and 100,000 zeny; failure breaks the item 20% of the time, otherwise −3 levels (renewal) | Same rates (18/17/15% for weapon Lv 1–3, 8/7/5% for weapon Lv 4 and armor) and bonus totals from rAthena's renewal `refine.yml`. Stellar / Lunar Shards | `core/refine.ts` |
| Homunculus | Alchemists create one from an Embryo (Bioethics); four types; it levels, gets hungry, fights, can die, and evolves (Stone of Sages, Loyal) | Same loop with four original homunculi: Sylph (heals you), Golemite (taunts), Fawnling (combo strikes), Gloom (random-element bolts). Takes hits when it holds more threat than you | `core/homunculus.ts` |
| Mounts and carts | Knights ride Pecos (+speed, +weight, ASPD penalty reduced by Cavalier Mastery); Merchants rent a pushcart | War-drake: +25% move, +1,000 weight, −40% attack speed (Drake Riding gives 8% back per level). Pushcart: 100 slots, 8,000 weight | `world.toggleMount`, `inventory.putInCart` |
| Pet accessories and evolution | Each pet has an accessory; some pets evolve with materials when Loyal | Ribbons give +1 all stats while Cordial+; evolution needs Loyal + 10 of the monster's material + a Spirit Chime, Loyal bonus ×1.5 | `core/pets.ts` |
| Endless Tower | 100 floors, harder every floor | Endless Spire: 100 floors scaled Lv 4–88, elite every 10th, milestone rewards at 25/50/75, 3 hours, once per day | `instances.json` |
| Online play | Party (even share), guild, trade window, vending, PvP, War of Emperium | Real WebSocket server: parties with even EXP share (same map, 15-level gap), guilds, two-sided locked trades, player shops, PvP in the Proving Grounds, guild war over Castle Veyl's Emperium (holding guild +10% EXP). Characters stay on each client, so it is not cheat-proof | `server/server.ts`, `src/ui/online.ts` |
| Database tools | Refine simulator, forge calculator, affix list (the two sites you linked) | Database window tabs: Refine sim (chance per step, survival, expected ore / Luma / items), Forge calc, Options (chance per roll), Combos, Pets, Elements chart | `windows.renderDbTool`, `refine.simulateRefine` |

## Researched but not switched on

**Stat point cost curve.** RO charges floor((x−1)/10) + 2 points to raise a stat from x. This is
implemented (`balance.levels.statCost.mode = "ro"`) and unit-tested, but **off by default**.
Veyloria's ATK/DEF formulas grow linearly with stats, while RO's include a squared STR bonus.
With the RO cost turned on, the bots measured these first-try wins against Grukk:

| | Knight | Ranger | Mage | Playthrough |
|---|---|---|---|---|
| RO cost | 2/6 | 0/6 | 3/6 | fails |
| Flat cost (default) | 6/6 | 5/6 | 3/6 | passes |

Turning it on needs RO-style ATK/MATK/DEF formulas and retuned monsters as one change.

## Not implemented

- **Third jobs** and the renewal job tree beyond transcendent.
- **Skills on other players:** PvP and the Emperium use basic attacks only; skills hit monsters.
- **Server authority:** the server does not own characters or run combat; a modified client could cheat.
- **Hosting:** the published web page cannot reach a server on your computer, so online play needs
  `npm run server` plus `npm run dev` / `npm run preview` on a machine both players can reach.

## Measured class balance (first boss, 24 fixed seeds, Lv 17, same potion kit)

| Knight | Ranger | Mage | Cleric | Rogue | Merchant |
|---|---|---|---|---|---|
| 24/24 | 14/24 | 19/24 | 11/24 | 10/24 | 22/24 |

Ranger, Cleric and Rogue win about half the time. Rogue daggers do 50% against Grukk (Large),
which is the RO size rule. The Cleric bot heals itself with Heal.

## Measured second-job balance (Archmage Valdris, Lv 44 boss, at Lv 50 with Lv 45 gear, 12 seeds)

| Dragoon | Templar | Beastmaster | Minstrel | Sorcerer | Sage | Bishop | Ascetic | Shadowblade | Outlaw | Artisan | Alchemist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 12 | 12 | 7 | 9 | 12 | 12 | 12 | 12 | 12 | 11 | 11 | 10 |

Measured in the boss hall of the widened Arcanthe Tower (four rooms merged). The open hall made the summoned Mana Wisps much more dangerous for melee jobs, so bosses now summon a new wave only when the last one is dead, Templar's Faith gives +2 MDEF per level, and Sacred Strike (1.8 + 0.36/lv) and Backstab (2.6 + 0.45/lv) hit harder. The test bot also stands and casts for 2.5 s after each step back while kiting.

## Sources

The two sites you sent, midgardhub.com (a Ragnarok Zero Global database) and ratemyserver.net (an RO item database), can't be opened from this environment because its network policy blocks them. Their features were researched through web search instead. No item or monster data was copied from them.

- Midgard Community Hub (features: monster DB, refine simulator, forge calculator, affix simulator): https://midgardhub.com/ , https://midgardhub.com/tools/affix
- RateMyServer item DB / refine table / forge calculator: https://ratemyserver.net/index.php?page=item_db , https://ratemyserver.net/index.php?page=misc_table_refine , https://ratemyserver.net/forge_calc.php
- iRO Wiki — Refinement System: https://irowiki.org/classic/Refinement_System ; Forging: https://irowiki.org/wiki/Forging
- RevivalRO wiki — Forging: https://wiki.ragnarevival.com/crafting/blacksmith/forging ; forging calculator notes: https://github.com/breno-m-dev/Ragnarok-Online-Forging-Calculator
- Ragnarok Zero enchant/options: https://wiki.playragnarokzero.com/wiki/Memorial_Dungeon_Equipment , https://midgardhub.com/guides/memorial-dungeons
- rAthena item bonus reference: https://raw.githubusercontent.com/rathena/rathena/master/doc/item_bonus.txt
- rAthena renewal `refine.yml` for the +11…+20 rates and bonuses: https://github.com/rathena/rathena/blob/master/db/re/refine.yml
- rAthena pre-renewal tables used for numbers only (refine rates and fees, element tables, pet capture formula, job stats): https://github.com/rathena/rathena/tree/master/db/pre-re (`refine.yml`, `attr_fix.yml`, `pet_db.yml`, `job_stats.yml`), https://github.com/rathena/rathena/blob/master/doc/yaml/db/pet_db.yml , rAthena `src/map/pet.cpp` (feeding rules)

- iRO Wiki — Size: https://irowiki.org/wiki/Size (and classic: https://irowiki.org/classic/Size)
- iRO Wiki — Weight Limit: https://irowiki.org/wiki/Weight
- iRO Wiki — Card System: https://irowiki.org/wiki/Card , https://irowiki.org/classic/Card
- iRO Wiki — Race: https://irowiki.org/wiki/Race
- iRO Wiki — MVP: https://irowiki.org/wiki/MVP , https://irowiki.org/classic/MVP
- iRO Wiki — Stats / Perfect Dodge: https://irowiki.org/wiki/Stats , https://irowiki.org/wiki/Perfect_Dodge
- StrategyWiki — Leveling Stats and Skills: https://strategywiki.org/wiki/Ragnarok_Online/Leveling_Stats_and_Skills
- Ragnarok Wiki (Fandom) — Stats: https://ragnarok.fandom.com/wiki/Stats_(RO)
- Ragnarok Online official guide (MVP): https://renewal.playragnarok.com/gameguide/HowToPlay_basicsystem05.aspx
- Payon Stories mechanics (hit and accuracy): https://openpscalc.duckdns.org/mechanics/hit-and-accuracy.html

The sources disagree on some numbers (e.g. dagger vs Large, renewal vs classic formulas). Where
they do, the classic (pre-renewal) value is used.
