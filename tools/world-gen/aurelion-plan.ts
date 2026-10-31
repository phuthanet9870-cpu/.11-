// Royal Capital Aurelion: a hand-drawn dry-land plan (no rivers, canals or harbour).
// North: the palace behind a wide walled courtyard. Centre: a wide fountain plaza on the two
// main avenues. Around it, a modest town sized to its 17 NPCs: the Adventurers' and Knight guilds,
// the cathedral, inn, smithy, tools shop, stable, courier, market stalls and a few homes.

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface B { style: string; x: number; y: number; w: number; h: number; sign?: string }

export const AURELION_W = 100, AURELION_H = 84;

export function aurelionPlan() {
  const W = AURELION_W, H = AURELION_H;
  const paint: J[] = [];
  const rect = (tile: string, x: number, y: number, w: number, h: number, layer = 'ground') => paint.push({ op: 'rect', tile, x, y, w, h, layer });
  const road = (x: number, y: number, w: number, h: number) => rect('path_stone', x, y, w, h);
  const object = (kind: string, x: number, y: number, id?: string) => paint.push({ op: 'object', kind, x, y, ...(id ? { id } : {}) });
  const doorX = (b: B) => b.x + Math.floor(b.w / 2);
  const building = (b: B) => { paint.push({ op: 'building', ...b, door: Math.floor(b.w / 2) }); return b; };

  // Streets first: the two avenues, the side streets, the plaza and the palace courtyard.
  road(47, 41, 6, H - 41);              // royal avenue: courtyard gate → south gate
  road(0, 54, W, 4);                    // east–west avenue
  road(36, 45, 28, 21);                 // fountain plaza (28×21)
  road(22, 24, 57, 16);                 // palace courtyard (57×16)
  road(4, 70, 32, 3); road(64, 70, 32, 3); road(30, 77, 40, 2); // side streets
  road(6, 58, 2, 12); road(92, 58, 2, 12);                      // links from the avenue to the side streets
  road(85, 0, 3, 54);                   // north road along the east side
  rect('dirt', 88, 32, 9, 14);          // knights' training yard

  // Courtyard enclosure: hedges on the sides, a wall with the gate on the avenue.
  rect('hedge', 21, 8, 1, 33, 'wall'); rect('hedge', 79, 8, 1, 33, 'wall');
  rect('ruin_wall', 21, 40, 26, 1, 'wall'); rect('ruin_wall', 53, 40, 27, 1, 'wall');

  // Buildings (doors face down onto a street).
  building({ style: 'aurelion_palace', x: 32, y: 12, w: 36, h: 12, sign: 'Royal Palace' });
  const guild = building({ style: 'guild', x: 8, y: 47, w: 8, h: 7, sign: "Adventurers' Guild" });
  const smithy = building({ style: 'smithy', x: 18, y: 48, w: 8, h: 6, sign: 'Capital Smithy' });
  const shop = building({ style: 'shop', x: 27, y: 48, w: 8, h: 6, sign: 'Tools' });
  const knights = building({ style: 'knight_guild', x: 64, y: 47, w: 8, h: 7, sign: 'Knight Guild' });
  const stable = building({ style: 'house', x: 74, y: 48, w: 8, h: 6, sign: 'Stable' });
  const inn = building({ style: 'inn', x: 10, y: 63, w: 8, h: 7, sign: 'Royal Inn' });
  const courier = building({ style: 'house', x: 21, y: 64, w: 8, h: 6, sign: 'Courier' });
  const cathedral = building({ style: 'aurelion_cathedral', x: 69, y: 60, w: 13, h: 10, sign: 'Royal Cathedral' });
  for (const [x, y, h] of [[84, 64, 6], [38, 72, 5], [55, 72, 5]]) building({ style: 'aurelion_residence', x, y, w: 8, h });
  // Market stalls on the plaza's south corners.
  const stalls = [[37, 61, 'red'], [42, 61, 'gold'], [54, 61, 'blue'], [59, 61, 'red']] as const;
  for (const [x, y, c] of stalls) building({ style: `aurelion_stall_${c}`, x, y, w: 4, h: 3 });

  // Landmarks and a little street furniture.
  object('capital_fountain', 47, 53, 'aurelion_fountain');
  object('capital_statue', 39, 29); object('capital_statue', 59, 29);
  for (const [x, y] of [[36, 45], [63, 45], [36, 59], [63, 59], [46, 41], [53, 41], [24, 26], [76, 26]]) object('lamp_post', x, y);
  for (const [x, y] of [[30, 36], [69, 36], [44, 47], [55, 47]]) object('planter', x, y);
  for (const [x, y] of [[90, 34], [93, 34], [96, 34]]) object('capital_training_dummy', x, y);
  object('anvil', smithy.x + smithy.w, smithy.y + smithy.h - 1); object('barrel', shop.x + shop.w, shop.y + shop.h - 1);
  object('haystack', stable.x + stable.w, stable.y + stable.h - 1); object('barrel', inn.x - 1, inn.y + inn.h - 1);
  for (const [x, y] of [[24, 9], [76, 9], [12, 40], [88, 76], [12, 78], [94, 22], [8, 24], [66, 80]]) object('tree_oak', x, y);
  paint.push({ op: 'scatter', kind: 'deco:flowers', density: 0.03, seed: 24061101 });
  paint.push({ op: 'scatter', kind: 'deco:tuft', density: 0.02, seed: 24061102 });

  // City wall and gate sprites over the courtyard wall line.
  const scenery: J[] = [];
  for (const x of [21, 25, 29, 33, 37, 41]) scenery.push({ kind: 'city_wall', x, y: 38.9, w: 4, h: 2.1 });
  for (const x of [53.5, 57.5, 61.5, 65.5, 69.5, 75]) scenery.push({ kind: 'city_wall', x, y: 38.9, w: 4, h: 2.1 });
  scenery.push({ kind: 'city_gate', x: 45.5, y: 34.4, w: 8, h: 6.7 });

  // NPCs stand on the street in front of their building.
  const front = (b: B, dx: number) => ({ x: doorX(b) + dx, y: b.y + b.h + 1 });
  const at: Record<string, { x: number; y: number }> = {
    aurelion_jobmaster: front(guild, -2), aurelion_arena: front(guild, 0), spire_warden: front(guild, 2), training_master: front(guild, 4), arena_gatekeeper: front(guild, 6),
    aurelion_smith: front(smithy, 1), aurelion_merchant: front(shop, 1),
    guild_knight: front(knights, -2), guild_dragoon: front(knights, 0), guild_templar: front(knights, 2),
    aurelion_stable: front(stable, 1),
    aurelion_innkeeper: front(inn, 1), aurelion_courier: front(courier, 1),
    guild_cleric: front(cathedral, -3), guild_bishop: front(cathedral, -1), guild_ascetic: front(cathedral, 1), oracle_rebirth: front(cathedral, 3),
    aurelion_trader: { x: 40, y: 64 }, aurelion_market: { x: 57, y: 64 },
  };
  const portals: Record<string, { x: number; y: number; w: number; h: number }> = {
    to_aurelion_fields_south: { x: 47, y: H - 2, w: 6, h: 2 },
    to_aurelion_fields_north: { x: 85, y: 0, w: 3, h: 2 },
    to_arcanthe_heath: { x: W - 2, y: 54, w: 2, h: 4 },
    to_aurelion_catacombs: { x: 0, y: 54, w: 2, h: 4 },
  };
  const spawnPoints = {
    default: { x: 50, y: 61 },
    from_aurelion_fields_south: { x: 50, y: H - 5 },
    from_aurelion_fields_north: { x: 86, y: 4 },
    from_arcanthe_heath: { x: W - 5, y: 55 },
    from_aurelion_catacombs: { x: 4, y: 55 },
  };
  const areas = [
    { id: 'palace', name: 'Royal Palace', rect: { x: 22, y: 6, w: 57, h: 34 } },
    { id: 'plaza', name: 'Royal Square', rect: { x: 36, y: 45, w: 28, h: 21 } },
    { id: 'guilds', name: 'Guild Row', rect: { x: 4, y: 46, w: 32, h: 8 } },
    { id: 'cathedral', name: 'Royal Cathedral', rect: { x: 66, y: 58, w: 20, h: 14 } },
    { id: 'training', name: 'Training Yard', rect: { x: 88, y: 32, w: 9, h: 14 } },
  ];
  return { width: W, height: H, paint, scenery, npcs: at, portals, spawnPoints, areas, fountain: { x: 47, y: 53 } };
}
