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
| Refining | Safe limit, then a failure destroys the item (and its cards) | Weapons safe to +5, armor to +4, max +10. Ores plus a fee; a failure destroys the item and its cards | `core/refine.ts` |
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
- **Other systems:** pets and taming, homunculi, card sets / combo bonuses, upgrade materials by
  weapon level, the ASPD 190 cap model, and job-specific weight bonuses.

## Sources

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
