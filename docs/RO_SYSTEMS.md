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
| Refining | Safe limits by weapon level +7 / +6 / +5 / +4, armor +4; classic success table above that; ATK per refine +2 / +3 / +5 / +7; a failure destroys the item and its cards | Same. Ores per grade: Glimmer (weapon Lv 1) and Bright (Lv 2) are sold by NPCs; Starsteel (Lv 3–4) and Moonstone (armor) only drop | `core/refine.ts` |
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
| Element table | 9×9 element modifiers | 9 elements, tunable | `elements.json` |

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

- **Multiplayer systems:** party EXP sharing, guilds, War of Emperium, trading and vending need
  the Phase 3 server.
- **Jobs:** RO's full job tree (6 first jobs, two second jobs each, transcendent classes). There
  are 3 classes now.
- **Monster classes:** element levels 1–4 per monster, and the mini-boss tier.
- **Other systems:**
  - pets and taming, homunculi
  - card sets / combo bonuses, enriched ores, over-upgrade above +10
  - memorial dungeons (timed instances)
  - autocast skills on hit
  - the ASPD 190 cap model, and job-specific weight bonuses

## Sources

The two sites you sent, midgardhub.com (a Ragnarok Zero Global database) and ratemyserver.net (an RO item database), can't be opened from this environment because its network policy blocks them. Their features were researched through web search instead. No item or monster data was copied from them.

- Midgard Community Hub (features: monster DB, refine simulator, forge calculator, affix simulator): https://midgardhub.com/ , https://midgardhub.com/tools/affix
- RateMyServer item DB / refine table / forge calculator: https://ratemyserver.net/index.php?page=item_db , https://ratemyserver.net/index.php?page=misc_table_refine , https://ratemyserver.net/forge_calc.php
- iRO Wiki — Refinement System: https://irowiki.org/classic/Refinement_System ; Forging: https://irowiki.org/wiki/Forging
- RevivalRO wiki — Forging: https://wiki.ragnarevival.com/crafting/blacksmith/forging ; forging calculator notes: https://github.com/breno-m-dev/Ragnarok-Online-Forging-Calculator
- Ragnarok Zero enchant/options: https://wiki.playragnarokzero.com/wiki/Memorial_Dungeon_Equipment , https://midgardhub.com/guides/memorial-dungeons
- rAthena item bonus reference: https://raw.githubusercontent.com/rathena/rathena/master/doc/item_bonus.txt

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
