// World generator: builds the Ragnarok-style world of Veyloria from a compact
// design table (regions → towns, fields, dungeons). It writes map JSON plus
// the monsters, items, drops, shops, NPCs, bosses, tilesets and music those
// maps need into src/data. Generated entries carry "generated": true, so the
// script can be re-run and replaces only what it made. Every map is compiled
// and checked: all portals, spawns and NPCs must be reachable on foot.
//
//   npm run world:build
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), 'src/data');
const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const write = (f: string, v: unknown) => writeFileSync(join(DATA, f), JSON.stringify(v, null, 1) + '\n');
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ------------------------------------------------------------------ deterministic helpers
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hash = (t: string) => { let h = 2166136261; for (const ch of t) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const title = (id: string) => id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// ------------------------------------------------------------------ palettes (one per region / dungeon look)
const P = (o: J): J => ({
  grass1: '#5fae4a', grass2: '#6cbf55', grass3: '#4f9a3e', dirt1: '#b48a5a', dirt2: '#9a7448', stone1: '#b9b2a4', stone2: '#9a9386',
  water1: '#3a8ad8', water2: '#5aa8ee', sand1: '#e2cf96', thicket1: '#2f6a35', thicket2: '#245a2b', leaf1: '#4f9a3e', leaf2: '#6cbf55',
  trunk: '#6a4a2a', flower1: '#ff7aa8', flower2: '#ffe14d', flower3: '#ffffff', fence: '#8b5a2b', accent: '#e8dcc0', soil1: '#7a5634', soil2: '#634428',
  floor1: '#3a5a30', floor2: '#33502b', ruin1: '#8a8a90', ruin2: '#6a6a74', thorn1: '#4a3a2a', thorn2: '#5a7a2e', shadow: '#00000033', ...o,
});
const TILESETS: J[] = [
  { id: 'clover', name: 'Clover Hills', palette: P({ grass1: '#86c95a', grass2: '#97d86a', grass3: '#74b84c', flower1: '#ffffff', flower2: '#ff9ad0', flower3: '#ffe14d' }) },
  { id: 'capital', name: 'Royal Plains', palette: P({ grass1: '#7ab85a', grass2: '#88c466', grass3: '#6aa64c', stone1: '#d8d2c4', stone2: '#b4ad9e', dirt1: '#c2a070', dirt2: '#a8875a', flower1: '#e85a5a', flower2: '#ffd34d', fence: '#7a4a2a' }) },
  { id: 'fernwood', name: 'Fernhollow Woods', palette: P({ grass1: '#3e7a3a', grass2: '#4a8a44', grass3: '#336a30', thicket1: '#1e4a26', thicket2: '#163a1c', leaf1: '#2e6e3a', leaf2: '#3f8a46', trunk: '#4a3220', dirt1: '#7a6040', dirt2: '#655034', flower1: '#c9a6ff', flower2: '#7fd6ff', flower3: '#ffffff', floor1: '#2f5a2e', floor2: '#284e28' }) },
  { id: 'arcane', name: 'Arcane Heath', palette: P({ grass1: '#6a8a9a', grass2: '#7a9aaa', grass3: '#5a7a8c', thicket1: '#3a3a6a', thicket2: '#2a2a52', leaf1: '#6a5aaa', leaf2: '#8a7ac8', trunk: '#4a3a5a', dirt1: '#9a8aa0', dirt2: '#7a6a82', stone1: '#c8c0dc', stone2: '#a29ab8', flower1: '#c9a6ff', flower2: '#7fd6ff', flower3: '#ffffff', accent: '#d8c8ff', water1: '#4a5ac8', water2: '#7a8af0' }) },
  { id: 'desert', name: 'Sunscar Desert', palette: P({ grass1: '#e2c88a', grass2: '#ead49a', grass3: '#d4b878', dirt1: '#c8a066', dirt2: '#b08850', thicket1: '#a07a48', thicket2: '#8a6438', leaf1: '#6a9a4a', leaf2: '#86b25a', trunk: '#7a5634', stone1: '#e8d8b0', stone2: '#c8b48a', sand1: '#ecd8a0', flower1: '#ff8a5a', flower2: '#ffd34d', flower3: '#ffffff', water1: '#3aa8c8', water2: '#6ad0e8', fence: '#9a7448' }) },
  { id: 'coast', name: 'Tidewatch Coast', palette: P({ grass1: '#7ccf6a', grass2: '#8ede78', grass3: '#6abc5a', sand1: '#f2e2b0', dirt1: '#e2cf96', dirt2: '#cbb67c', water1: '#2a9ad8', water2: '#7ad6f8', stone1: '#d8d8d0', stone2: '#b0b0aa', leaf1: '#4fae5a', leaf2: '#7ad070', flower1: '#ff7a8a', flower2: '#ffffff', flower3: '#7ad6f8', fence: '#a07a50' }) },
  { id: 'snow', name: 'Frostpeak', palette: P({ grass1: '#e8eef6', grass2: '#f4f8fc', grass3: '#d6e0ec', dirt1: '#b8c4d4', dirt2: '#9aa8bc', thicket1: '#3a5a5a', thicket2: '#2a4648', leaf1: '#4a6a6a', leaf2: '#dde8ee', trunk: '#5a4a3a', stone1: '#c8d0dc', stone2: '#a2acba', water1: '#8ac8e8', water2: '#c8ecfa', flower1: '#8ac8ff', flower2: '#ffffff', flower3: '#c8a6ff', fence: '#6a5a4a', accent: '#ffffff' }) },
  { id: 'volcano', name: 'Emberfall', palette: P({ grass1: '#4a3a36', grass2: '#56443e', grass3: '#3e302c', dirt1: '#6a4a3a', dirt2: '#583a2c', thicket1: '#2a2224', thicket2: '#1e181a', leaf1: '#5a3a2a', leaf2: '#8a4a2a', trunk: '#2a1a14', stone1: '#7a6a66', stone2: '#5a4c48', water1: '#e8501e', water2: '#ffb03a', flower1: '#ff6a2e', flower2: '#ffd34d', flower3: '#ff3a1e', fence: '#3a2a22', accent: '#ff8a3a', shadow: '#00000055' }) },
  { id: 'swamp', name: 'Shadowmere', palette: P({ grass1: '#4a5a3a', grass2: '#566a42', grass3: '#3e4c30', dirt1: '#5a4a34', dirt2: '#4a3c2a', thicket1: '#2a3622', thicket2: '#1e2818', leaf1: '#3a4a2a', leaf2: '#5a6a3a', trunk: '#3a2e22', water1: '#2e4a3a', water2: '#4a6a4e', flower1: '#a9e04a', flower2: '#c9a6ff', flower3: '#e0e0a0', fence: '#4a3a2a', accent: '#a9e04a', shadow: '#00000055' }) },
  { id: 'ruins', name: 'Ravenhold', palette: P({ grass1: '#5a5a52', grass2: '#666660', grass3: '#4c4c46', dirt1: '#6a6058', dirt2: '#58504a', thicket1: '#2e2a30', thicket2: '#221e24', leaf1: '#4a4a3a', leaf2: '#6a6a50', trunk: '#3a3030', stone1: '#8a8690', stone2: '#6a6672', ruin1: '#7a7682', ruin2: '#5a5662', flower1: '#c83a4a', flower2: '#8a6aaa', flower3: '#d8d8d8', accent: '#c83a4a', shadow: '#00000055' }) },
  // Dungeon looks (ruin_floor / ruin_wall take ruin1/ruin2 + stone + thicket colours).
  { id: 'dg_catacomb', name: 'Catacombs', palette: P({ ruin1: '#7a7268', ruin2: '#5a544c', stone1: '#8a8478', stone2: '#686258', thicket1: '#3a3632', thicket2: '#2a2622', grass1: '#5a564e', grass2: '#625e56', grass3: '#4e4a44', shadow: '#00000066' }) },
  { id: 'dg_cave', name: 'Cave', palette: P({ ruin1: '#6a5a48', ruin2: '#54463a', stone1: '#7a6a58', stone2: '#5e5040', thicket1: '#3a3026', thicket2: '#2a221c', grass1: '#4e5a3a', grass2: '#566442', grass3: '#44502e', shadow: '#00000066' }) },
  { id: 'dg_tower', name: 'Arcane Tower', palette: P({ ruin1: '#6a5a8a', ruin2: '#54487a', stone1: '#8a7aaa', stone2: '#6a5a8a', thicket1: '#2a2248', thicket2: '#1e183a', accent: '#d8c8ff', shadow: '#00000066' }) },
  { id: 'dg_tomb', name: 'Royal Tomb', palette: P({ ruin1: '#c8a870', ruin2: '#a88a58', stone1: '#d8bc84', stone2: '#b49a66', thicket1: '#6a5032', thicket2: '#54402a', accent: '#ffd34d', shadow: '#00000066' }) },
  { id: 'dg_grotto', name: 'Sunken Grotto', palette: P({ ruin1: '#3a7a7a', ruin2: '#2e6262', stone1: '#4a8a8a', stone2: '#3a6e6e', thicket1: '#1e3a44', thicket2: '#162c34', water1: '#1a5a8a', water2: '#3a8ab8', shadow: '#00000066' }) },
  { id: 'dg_ice', name: 'Ice Caverns', palette: P({ ruin1: '#a8d0e8', ruin2: '#88b4d0', stone1: '#c8e4f4', stone2: '#a2c4dc', thicket1: '#4a7a9a', thicket2: '#3a6280', water1: '#6ab0d8', water2: '#c8ecfa', shadow: '#00000055' }) },
  { id: 'dg_magma', name: 'Magma Core', palette: P({ ruin1: '#5a3a30', ruin2: '#462c24', stone1: '#6a4a40', stone2: '#543a32', thicket1: '#2a1a16', thicket2: '#1e1210', water1: '#e8501e', water2: '#ffb03a', shadow: '#00000066' }) },
  { id: 'dg_crypt', name: 'Ravenhold Crypt', palette: P({ ruin1: '#4e4658', ruin2: '#3c3646', stone1: '#5e5668', stone2: '#4a4454', thicket1: '#1e1a24', thicket2: '#16121a', accent: '#c83a4a', shadow: '#00000077' }) },
];

const TRACKS: J = {
  town_capital: { tempo: 104, root: 62, mode: 'major', progression: [0, 3, 4, 0], lead: 'square', pad: 'triangle', bass: 'triangle', density: 0.6, seed: 41 },
  town_forest: { tempo: 88, root: 57, mode: 'dorian', progression: [0, 3, 6, 4], lead: 'triangle', pad: 'sine', bass: 'sine', density: 0.5, seed: 43 },
  town_desert: { tempo: 92, root: 58, mode: 'phrygian', progression: [0, 1, 0, 6], lead: 'square', pad: 'sine', bass: 'triangle', density: 0.55, seed: 47 },
  town_mage: { tempo: 80, root: 60, mode: 'lydian', progression: [0, 1, 4, 3], lead: 'sine', pad: 'triangle', bass: 'sine', density: 0.45, seed: 53 },
  town_port: { tempo: 108, root: 64, mode: 'mixolydian', progression: [0, 6, 3, 4], lead: 'triangle', pad: 'sine', bass: 'triangle', density: 0.6, seed: 59 },
  town_snow: { tempo: 76, root: 61, mode: 'minor', progression: [0, 5, 3, 6], lead: 'sine', pad: 'sine', bass: 'sine', density: 0.4, seed: 61 },
  field_plains: { tempo: 116, root: 64, mode: 'major', progression: [0, 4, 5, 3], lead: 'square', pad: 'triangle', bass: 'triangle', density: 0.55, seed: 67 },
  field_desert: { tempo: 100, root: 57, mode: 'phrygian', progression: [0, 1, 6, 0], lead: 'triangle', pad: 'sine', bass: 'triangle', density: 0.5, seed: 71 },
  field_coast: { tempo: 110, root: 65, mode: 'mixolydian', progression: [0, 3, 6, 4], lead: 'triangle', pad: 'sine', bass: 'triangle', density: 0.55, seed: 73 },
  field_snow: { tempo: 84, root: 59, mode: 'minor', progression: [0, 3, 5, 4], lead: 'sine', pad: 'triangle', bass: 'sine', density: 0.4, seed: 79 },
  field_volcano: { tempo: 128, root: 50, mode: 'harmonic', progression: [0, 5, 1, 4], lead: 'sawtooth', pad: 'triangle', bass: 'square', density: 0.6, seed: 83 },
  field_swamp: { tempo: 78, root: 52, mode: 'dorian', progression: [0, 1, 0, 6], lead: 'triangle', pad: 'sine', bass: 'sine', density: 0.4, seed: 89 },
  dungeon_dark: { tempo: 70, root: 50, mode: 'minor', progression: [0, 1, 5, 6], lead: 'sine', pad: 'triangle', bass: 'sine', density: 0.35, seed: 97 },
  dungeon_cave: { tempo: 82, root: 53, mode: 'dorian', progression: [0, 6, 0, 3], lead: 'triangle', pad: 'sine', bass: 'sine', density: 0.4, seed: 101 },
  dungeon_ice: { tempo: 74, root: 58, mode: 'minor', progression: [0, 3, 6, 5], lead: 'sine', pad: 'sine', bass: 'sine', density: 0.35, seed: 103 },
};
const AMBIENT: J = {
  desert: { wind: 0.5, birds: 0.05, crickets: 0.1, drips: 0 }, snow: { wind: 0.6, birds: 0, crickets: 0, drips: 0.05 },
  cave: { wind: 0.1, birds: 0, crickets: 0, drips: 0.6 }, coast: { wind: 0.35, birds: 0.5, crickets: 0, drips: 0.1 },
  volcano: { wind: 0.45, birds: 0, crickets: 0, drips: 0 }, swamp: { wind: 0.15, birds: 0.1, crickets: 0.7, drips: 0.4 },
};

// ------------------------------------------------------------------ monsters
type Shape = 'slime' | 'rabbit' | 'mushroom' | 'wasp' | 'goblin' | 'spore' | 'wolf' | 'skeleton' | 'bat' | 'crab' | 'golem' | 'ghost' | 'scorpion' | 'drake';
interface MonSpec { id: string; name: string; lv: number; shape: Shape; colors: [string, string, string]; element: string; race: string; ai: string; size?: 'small' | 'medium' | 'large'; projectile?: string; status?: [string, number, number] }
const M = (id: string, name: string, lv: number, shape: Shape, colors: [string, string, string], element: string, race: string, ai = 'aggressive', extra: Partial<MonSpec> = {}): MonSpec => ({ id, name, lv, shape, colors, element, race, ai, ...extra });

const MONSTERS: MonSpec[] = [
  M('dusk_bat', 'Dusk Bat', 8, 'bat', ['#5a4a6a', '#3a2e48', '#ff5a5a'], 'shadow', 'beast', 'passive'),
  M('clover_slime', 'Clover Slime', 6, 'slime', ['#9ad86a', '#5aa84a', '#ffffff'], 'wind', 'plant', 'passive'),
  M('plains_wolf', 'Plains Wolf', 12, 'wolf', ['#9a8a7a', '#6a5e52', '#c8b89a'], 'neutral', 'beast'),
  M('pebble_golem', 'Pebble Golem', 15, 'golem', ['#a49a8a', '#7a7064', '#7fd6ff'], 'earth', 'formless', 'passive', { size: 'medium' }),
  M('road_goblin', 'Road Goblin', 17, 'goblin', ['#7a9a3a', '#5a4a3a', '#3a6ab8'], 'neutral', 'demihuman'),
  M('crypt_bat', 'Crypt Bat', 21, 'bat', ['#4a4a52', '#2a2a32', '#a9e04a'], 'undead', 'undead'),
  M('wailing_spirit', 'Wailing Spirit', 25, 'ghost', ['#c8d4e0', '#2a2a3a', '#7fd6ff'], 'ghost', 'undead', 'magic', { projectile: '#a8c8ff' }),
  M('grave_soldier', 'Grave Soldier', 27, 'skeleton', ['#d8d2bc', '#4a4a5a', '#ff5a3a'], 'undead', 'undead'),
  M('mist_spore', 'Mist Spore', 18, 'spore', ['#5a8aaa', '#c8e8ff', '#e0f0ff'], 'water', 'plant', 'magic', { projectile: '#9ad8ff' }),
  M('pine_goblin', 'Pinewood Goblin', 21, 'goblin', ['#5a8a3a', '#3a4a2a', '#c8a26b'], 'earth', 'demihuman'),
  M('elder_mushling', 'Elder Mushling', 24, 'mushroom', ['#8a4ab8', '#fff0e0', '#e8d0b0'], 'earth', 'plant', 'assist'),
  M('shadow_wolf', 'Shadow Wolf', 28, 'wolf', ['#3a3a4a', '#22222e', '#c83a4a'], 'shadow', 'beast'),
  M('bramble_hornet', 'Bramble Hornet', 26, 'wasp', ['#c88a2e', '#2b2b2b', '#d8f0ff'], 'wind', 'insect', 'aggressive', { status: ['poison', 0.12, 6000] }),
  M('cave_bat', 'Cave Bat', 27, 'bat', ['#6a5a4a', '#4a3e32', '#ffd34d'], 'neutral', 'beast'),
  M('moss_golem', 'Moss Golem', 31, 'golem', ['#6a7a5a', '#4a5a3a', '#a9e04a'], 'earth', 'formless', 'aggressive', { size: 'large' }),
  M('lantern_ghost', 'Lantern Ghost', 33, 'ghost', ['#f2e8b0', '#3a2a1a', '#ffb03a'], 'ghost', 'undead', 'magic', { projectile: '#ffb03a' }),
  M('crystal_slime', 'Crystal Slime', 21, 'slime', ['#7ab8f0', '#4a7ac8', '#ffffff'], 'water', 'formless', 'passive'),
  M('moon_hare', 'Moon Hare', 23, 'rabbit', ['#d8d8f0', '#a8a8c8', '#c8a6ff'], 'holy', 'beast', 'passive'),
  M('arcane_wisp', 'Arcane Wisp', 27, 'ghost', ['#b89af0', '#2a1a4a', '#ffffff'], 'ghost', 'formless', 'magic', { projectile: '#c9a6ff' }),
  M('animated_armor', 'Animated Armor', 34, 'skeleton', ['#a8b0c0', '#3a4a6a', '#7fd6ff'], 'neutral', 'formless', 'aggressive', { size: 'medium' }),
  M('rune_golem', 'Rune Golem', 38, 'golem', ['#6a5a9a', '#4a3a7a', '#d8c8ff'], 'shadow', 'formless', 'aggressive', { size: 'large' }),
  M('mana_wisp', 'Mana Wisp', 36, 'ghost', ['#7ab8ff', '#1a2a4a', '#ffffff'], 'water', 'formless', 'magic', { projectile: '#7ab8ff' }),
  M('dune_slime', 'Dune Slime', 25, 'slime', ['#e2c07a', '#b8945a', '#fff4d0'], 'earth', 'formless', 'passive'),
  M('sand_scorpion', 'Sand Scorpion', 28, 'scorpion', ['#c8945a', '#8a5a2e', '#e8e0c0'], 'earth', 'insect', 'aggressive', { status: ['poison', 0.15, 6000] }),
  M('desert_wolf', 'Desert Wolf', 31, 'wolf', ['#c8a46a', '#8a6a42', '#fff0c0'], 'fire', 'beast'),
  M('oasis_crab', 'Oasis Crab', 32, 'crab', ['#3aa8a8', '#1a7a7a', '#ffffff'], 'water', 'fish', 'passive'),
  M('mirage_wisp', 'Mirage Wisp', 35, 'ghost', ['#ffe08a', '#6a4a1a', '#ffffff'], 'fire', 'formless', 'magic', { projectile: '#ffd34d' }),
  M('giant_scorpion', 'Giant Scorpion', 38, 'scorpion', ['#8a3a2a', '#5a1e14', '#ffd34d'], 'fire', 'insect', 'aggressive', { size: 'large', status: ['poison', 0.2, 7000] }),
  M('tomb_mummy', 'Tomb Mummy', 40, 'skeleton', ['#e8dcc0', '#8a7a5a', '#ffd34d'], 'undead', 'undead'),
  M('gilded_scarab', 'Gilded Scarab', 42, 'scorpion', ['#d8b43a', '#8a6a1a', '#3ad8a8'], 'earth', 'insect'),
  M('tomb_bat', 'Tomb Bat', 39, 'bat', ['#8a7a5a', '#5a4a32', '#ffd34d'], 'shadow', 'beast'),
  M('shore_crab', 'Shore Crab', 19, 'crab', ['#e05a3a', '#a83a22', '#ffffff'], 'water', 'fish', 'passive'),
  M('sea_slime', 'Sea Slime', 21, 'slime', ['#4ad0c8', '#2a9a9a', '#ffffff'], 'water', 'formless', 'passive'),
  M('reef_gull', 'Reef Gull', 24, 'bat', ['#f2f2f2', '#b8c4d4', '#ffb03a'], 'wind', 'beast'),
  M('grotto_crab', 'Grotto Crab', 30, 'crab', ['#5a7ab8', '#3a5a8a', '#ffffff'], 'water', 'fish', 'aggressive', { size: 'medium' }),
  M('kelp_spore', 'Kelp Spore', 31, 'spore', ['#3a8a5a', '#a9e04a', '#e0ffe0'], 'water', 'plant', 'magic', { projectile: '#5ad8a8' }),
  M('drowned_spirit', 'Drowned Spirit', 35, 'ghost', ['#5ab8c8', '#1a3a4a', '#ffffff'], 'water', 'undead', 'aggressive'),
  M('frost_slime', 'Frost Slime', 41, 'slime', ['#c8ecfa', '#7ab8e0', '#ffffff'], 'water', 'formless', 'passive'),
  M('snow_wolf', 'Snow Wolf', 43, 'wolf', ['#eef4f8', '#a8b8c8', '#7fd6ff'], 'water', 'beast'),
  M('ice_golem', 'Ice Golem', 47, 'golem', ['#a8d8f0', '#6aa8d0', '#ffffff'], 'water', 'formless', 'aggressive', { size: 'large', status: ['freeze', 0.08, 2000] }),
  M('ice_bat', 'Ice Bat', 49, 'bat', ['#8ac8e8', '#4a8ab0', '#ffffff'], 'water', 'beast'),
  M('frost_wraith', 'Frost Wraith', 54, 'ghost', ['#dff4ff', '#2a4a6a', '#7fd6ff'], 'water', 'undead', 'magic', { projectile: '#c8ecfa' }),
  M('glacier_golem', 'Glacier Golem', 57, 'golem', ['#7ab0d8', '#3a7ab0', '#e0ffff'], 'water', 'formless', 'aggressive', { size: 'large', status: ['freeze', 0.1, 2000] }),
  M('ember_slime', 'Ember Slime', 56, 'slime', ['#ff7a3a', '#c83a1a', '#ffe08a'], 'fire', 'formless', 'aggressive', { status: ['burn', 0.12, 5000] }),
  M('ash_scorpion', 'Ash Scorpion', 59, 'scorpion', ['#5a4a4a', '#2e2222', '#ff6a2e'], 'fire', 'insect'),
  M('fire_drake', 'Fire Drake', 63, 'drake', ['#c83a2a', '#8a1e14', '#ffd34d'], 'fire', 'dragon', 'aggressive', { size: 'medium', status: ['burn', 0.15, 5000] }),
  M('magma_golem', 'Magma Golem', 65, 'golem', ['#6a3a2a', '#3a1e14', '#ff8a2e'], 'fire', 'formless', 'aggressive', { size: 'large', status: ['burn', 0.15, 5000] }),
  M('flame_drake', 'Flame Drake', 68, 'drake', ['#e86a2a', '#a83a14', '#fff08a'], 'fire', 'dragon', 'magic', { size: 'medium', projectile: '#ff8a2e' }),
  M('bog_slime', 'Bog Slime', 60, 'slime', ['#6a7a3a', '#4a5a2a', '#c8e07a'], 'poison', 'formless', 'aggressive', { status: ['poison', 0.15, 7000] }),
  M('marsh_spore', 'Marsh Spore', 63, 'spore', ['#5a4a6a', '#a9e04a', '#e0d0ff'], 'poison', 'plant', 'magic', { projectile: '#a9e04a' }),
  M('mire_crab', 'Mire Crab', 66, 'crab', ['#4a5a3a', '#2e3a22', '#c8e07a'], 'poison', 'fish', 'aggressive', { size: 'medium' }),
  M('raven_bat', 'Raven Bat', 67, 'bat', ['#2a2a32', '#16161c', '#c83a4a'], 'shadow', 'beast'),
  M('cursed_knight', 'Cursed Knight', 69, 'skeleton', ['#6a6a7a', '#2a2a3a', '#c83a4a'], 'shadow', 'undead', 'aggressive', { size: 'medium', status: ['curse', 0.1, 6000] }),
  M('banshee', 'Banshee', 72, 'ghost', ['#c8c8d8', '#3a2a4a', '#ff5a7a'], 'ghost', 'undead', 'magic', { projectile: '#ff8ab0' }),
  M('grave_knight', 'Grave Knight', 76, 'skeleton', ['#4a4a5a', '#1e1e28', '#7fd6ff'], 'undead', 'undead', 'aggressive', { size: 'medium' }),
  M('lich_spirit', 'Lich Spirit', 79, 'ghost', ['#8a7aaa', '#1a1028', '#a9e04a'], 'undead', 'undead', 'magic', { projectile: '#a9e04a' }),
];

const BOSSES = [
  { id: 'bone_warden', monster: M('bone_warden_boss', 'Bone Warden', 32, 'skeleton', ['#e8e0c8', '#5a3a2a', '#ff3a2a'], 'undead', 'undead', 'boss', { size: 'large' }), scale: 2, title: 'Keeper of the Aurelion Catacombs', element: 'undead', minion: 'grave_soldier', status: 'curse', fx: 'slam', map: 'aurelion_catacombs' },
  { id: 'archmage_valdris', monster: M('valdris_boss', 'Archmage Valdris', 44, 'ghost', ['#9a7af0', '#1a0a3a', '#ffe14d'], 'shadow', 'undead', 'boss', { size: 'large' }), scale: 2.2, title: 'Lost Master of the Tower', element: 'shadow', minion: 'mana_wisp', status: 'silence', fx: 'arcane', map: 'arcanthe_tower' },
  { id: 'sun_king', monster: M('sun_king_boss', 'Sun-King Ankhar', 50, 'skeleton', ['#f2e2b0', '#c8a03a', '#3ad8a8'], 'undead', 'undead', 'boss', { size: 'large' }), scale: 2.2, title: 'Eternal Ruler of the Royal Tomb', element: 'undead', minion: 'tomb_mummy', status: 'curse', fx: 'holy', map: 'kings_tomb' },
  { id: 'pyrewyrm', monster: M('pyrewyrm_boss', 'Pyrewyrm', 74, 'drake', ['#e83a1a', '#7a1a0e', '#ffd34d'], 'fire', 'dragon', 'boss', { size: 'large' }), scale: 2.4, title: 'Heart of the Volcano', element: 'fire', minion: 'fire_drake', status: 'burn', fx: 'fire', map: 'magma_core' },
  { id: 'dread_lord', monster: M('dread_lord_boss', 'Dread Lord Morvane', 85, 'skeleton', ['#3a3a4a', '#12121a', '#c83a4a'], 'shadow', 'undead', 'boss', { size: 'large' }), scale: 2.5, title: 'Fallen King of Ravenhold', element: 'shadow', minion: 'cursed_knight', status: 'curse', fx: 'shadow', map: 'ravenhold_crypt' },
];

const PART: Record<Shape, [string, string]> = {
  slime: ['Gel', 'blob'], rabbit: ['Tuft of Fur', 'pelt'], mushroom: ['Spore Cap', 'mushroom'], wasp: ['Stinger', 'fang'], goblin: ['Tusk', 'fang'],
  spore: ['Spore Dust', 'dust'], wolf: ['Fang', 'fang'], skeleton: ['Bone Shard', 'bone'], bat: ['Wing', 'wing'], crab: ['Shell', 'pelt'],
  golem: ['Core Stone', 'gem'], ghost: ['Ectoplasm', 'dust'], scorpion: ['Venom Tail', 'fang'], drake: ['Scale', 'pelt'],
};

function monsterDef(s: MonSpec, scale = 1): J {
  const lv = s.lv, boss = s.ai === 'boss';
  const hp = Math.round((18 * lv ** 1.35 + 60) * (s.size === 'large' ? 1.4 : s.size === 'medium' ? 1.15 : 1) * (boss ? 14 : 1));
  const exp = Math.round((3.5 * lv ** 1.45 + 8) * (boss ? 18 : 1));
  const big = (s.size ?? 'small') !== 'small' || boss;
  const art = { shape: s.shape, w: boss ? Math.round(56 * scale) : big ? 56 : 44, h: boss ? Math.round(56 * scale) : big ? 56 : 44, colors: s.colors, ...(scale !== 1 ? { scale } : {}) };
  const ranged = s.ai === 'magic';
  return {
    id: s.id, name: s.name, level: lv, element: s.element, race: s.race, size: s.size ?? 'small', maxHp: hp,
    attack: Math.round((5 + 3.2 * lv) * (boss ? 1.6 : 1)), ...(ranged ? { magicAttack: Math.round(6 + 3.4 * lv) } : {}),
    defense: Math.round(lv * 1.1), magicDefense: Math.round(lv * 0.6), hit: Math.round(lv * 1.6 + 10), flee: Math.round(lv * 1.4 + 5),
    exp, jobExp: Math.round(exp * 0.75), attackRange: ranged ? 220 : boss ? 70 : 38, attackIntervalMs: boss ? 1300 : ranged ? 2000 : 1500,
    moveSpeed: s.shape === 'bat' || s.shape === 'wolf' ? 120 : s.shape === 'golem' || s.shape === 'slime' ? 55 : 80,
    aiType: s.ai, ...(s.ai !== 'passive' && s.ai !== 'assist' ? { aggroRange: boss ? 360 : 200 } : {}), ...(boss ? { leashRange: 900, bossId: '' } : {}),
    respawnSeconds: boss ? 600 : 14, dropTableId: `${s.id}_drops`, collisionRadius: boss ? 30 : big ? 16 : 12,
    ...(s.projectile ? { projectile: { element: s.element === 'undead' ? 'shadow' : s.element, color: s.projectile } } : {}),
    ...(s.status ? { onHitStatus: { status: s.status[0], chance: s.status[1], durationMs: s.status[2] } } : {}),
    ...(s.race === 'undead' ? { statusImmune: ['poison', 'bleed'] } : {}),
    art, generated: true,
  };
}

// ------------------------------------------------------------------ regions and maps
type Exit = 'N' | 'S' | 'E' | 'W';
interface MapSpec {
  id: string; name: string; region: string; type: 'town' | 'field' | 'dungeon'; tileset: string; lv?: [number, number];
  bgm: string; ambient: string; weather: string[]; pos: [number, number]; exits: Partial<Record<Exit, string>>;
  monsters?: [string, number][]; boss?: string; trees?: string[]; lake?: 'water' | 'none'; size?: [number, number];
  guild?: string[]; refine?: boolean; enchanter?: boolean; town?: { style: string; shop: string };
}
const REG = {
  wb: 'Willowbrook Region', cap: 'Aurelion — Royal Capital', fern: 'Fernhollow Woods', arc: 'Arcanthe — City of Magic',
  des: 'Sandara Desert', coast: 'Tidewatch Coast', snow: 'Frostpeak Mountains', fire: 'Emberfall Volcano', ruin: 'Ravenhold Ruins',
};
const NEW_MAPS: MapSpec[] = [
  { id: 'clover_hills', name: 'Clover Hills', region: REG.wb, type: 'field', tileset: 'clover', lv: [5, 12], bgm: 'field_meadow', ambient: 'meadow', weather: ['sunny'], pos: [0.3, 0.73], exits: { N: 'sunny_meadow', E: 'aurelion_fields_south' }, monsters: [['clover_slime', 10], ['horn_rabbit', 8], ['dusk_bat', 6]], trees: ['tree_oak', 'bush'] },
  { id: 'aurelion_fields_south', name: 'Aurelion Fields South', region: REG.cap, type: 'field', tileset: 'capital', lv: [10, 18], bgm: 'field_plains', ambient: 'meadow', weather: ['sunny', 'rain'], pos: [0.43, 0.67], exits: { W: 'clover_hills', N: 'aurelion', E: 'coral_beach' }, monsters: [['plains_wolf', 8], ['pebble_golem', 6], ['road_goblin', 6]], trees: ['tree_oak', 'rock'] },
  { id: 'aurelion', name: 'Royal Capital Aurelion', region: REG.cap, type: 'town', tileset: 'capital', bgm: 'town_capital', ambient: 'village', weather: ['sunny'], pos: [0.46, 0.52], exits: { S: 'aurelion_fields_south', N: 'aurelion_fields_north', E: 'arcanthe_heath', W: 'aurelion_catacombs' }, guild: ['knight'], refine: true, town: { style: 'guild', shop: 'capital' } },
  { id: 'aurelion_fields_north', name: 'Aurelion Fields North', region: REG.cap, type: 'field', tileset: 'capital', lv: [12, 20], bgm: 'field_plains', ambient: 'meadow', weather: ['sunny', 'rain'], pos: [0.46, 0.38], exits: { S: 'aurelion', N: 'mistpine_woods' }, monsters: [['thorn_wolf', 7], ['road_goblin', 7], ['pebble_golem', 6]], trees: ['tree_oak', 'tree_pine', 'rock'] },
  { id: 'aurelion_catacombs', name: 'Aurelion Catacombs', region: REG.cap, type: 'dungeon', tileset: 'dg_catacomb', lv: [20, 32], bgm: 'dungeon_dark', ambient: 'cave', weather: [], pos: [0.38, 0.55], exits: { E: 'aurelion' }, monsters: [['crypt_bat', 8], ['grave_soldier', 8], ['wailing_spirit', 6]], boss: 'bone_warden' },
  { id: 'mistpine_woods', name: 'Mistpine Woods', region: REG.fern, type: 'field', tileset: 'fernwood', lv: [15, 25], bgm: 'field_forest', ambient: 'forest', weather: ['fog', 'rain'], pos: [0.46, 0.25], exits: { S: 'aurelion_fields_north', N: 'fernhollow' }, monsters: [['mist_spore', 8], ['pine_goblin', 8], ['venom_spore', 4]], trees: ['tree_pine', 'tree_dark', 'bush'] },
  { id: 'fernhollow', name: 'Fernhollow Village', region: REG.fern, type: 'town', tileset: 'fernwood', bgm: 'town_forest', ambient: 'forest', weather: ['fog'], pos: [0.46, 0.12], exits: { S: 'mistpine_woods', E: 'deepwood_hollow', W: 'fernhollow_cave' }, guild: ['ranger'], town: { style: 'house', shop: 'forest' } },
  { id: 'deepwood_hollow', name: 'Deepwood Hollow', region: REG.fern, type: 'field', tileset: 'fernwood', lv: [22, 32], bgm: 'field_forest', ambient: 'forest', weather: ['fog'], pos: [0.57, 0.1], exits: { W: 'fernhollow' }, monsters: [['elder_mushling', 8], ['shadow_wolf', 7], ['bramble_hornet', 7]], trees: ['tree_dark', 'tree_pine'] },
  { id: 'fernhollow_cave', name: 'Fernhollow Cave', region: REG.fern, type: 'dungeon', tileset: 'dg_cave', lv: [25, 35], bgm: 'dungeon_cave', ambient: 'cave', weather: [], pos: [0.36, 0.12], exits: { E: 'fernhollow' }, monsters: [['cave_bat', 9], ['moss_golem', 6], ['lantern_ghost', 7]] },
  { id: 'arcanthe_heath', name: 'Arcanthe Heath', region: REG.arc, type: 'field', tileset: 'arcane', lv: [20, 30], bgm: 'field_plains', ambient: 'meadow', weather: ['sunny'], pos: [0.57, 0.5], exits: { W: 'aurelion', E: 'arcanthe' }, monsters: [['crystal_slime', 9], ['moon_hare', 7], ['arcane_wisp', 6]], trees: ['tree_pine', 'obelisk', 'rock'] },
  { id: 'arcanthe', name: 'Tower City Arcanthe', region: REG.arc, type: 'town', tileset: 'arcane', bgm: 'town_mage', ambient: 'village', weather: ['sunny'], pos: [0.67, 0.48], exits: { W: 'arcanthe_heath', N: 'arcanthe_tower', S: 'sunscar_dunes' }, guild: ['mage'], enchanter: true, town: { style: 'guild', shop: 'mage' } },
  { id: 'arcanthe_tower', name: 'Arcanthe Tower Depths', region: REG.arc, type: 'dungeon', tileset: 'dg_tower', lv: [30, 44], bgm: 'dungeon_dark', ambient: 'cave', weather: [], pos: [0.67, 0.34], exits: { S: 'arcanthe' }, monsters: [['animated_armor', 8], ['rune_golem', 6], ['mana_wisp', 8]], boss: 'archmage_valdris' },
  { id: 'sunscar_dunes', name: 'Sunscar Dunes', region: REG.des, type: 'field', tileset: 'desert', lv: [25, 35], bgm: 'field_desert', ambient: 'desert', weather: ['sunny'], pos: [0.67, 0.64], exits: { N: 'arcanthe', S: 'sandara' }, monsters: [['dune_slime', 9], ['sand_scorpion', 8], ['desert_wolf', 6]], trees: ['rock', 'rock_big'], lake: 'none' },
  { id: 'sandara', name: 'Desert City Sandara', region: REG.des, type: 'town', tileset: 'desert', bgm: 'town_desert', ambient: 'desert', weather: ['sunny'], pos: [0.67, 0.8], exits: { N: 'sunscar_dunes', E: 'mirage_oasis', S: 'kings_tomb' }, refine: true, town: { style: 'shop', shop: 'desert' } },
  { id: 'mirage_oasis', name: 'Mirage Oasis', region: REG.des, type: 'field', tileset: 'desert', lv: [30, 40], bgm: 'field_desert', ambient: 'desert', weather: ['sunny'], pos: [0.79, 0.8], exits: { W: 'sandara', E: 'shadowmere_marsh' }, monsters: [['oasis_crab', 8], ['mirage_wisp', 7], ['giant_scorpion', 6]], trees: ['tree_oak', 'rock'] },
  { id: 'kings_tomb', name: 'Royal Tomb of Ankhar', region: REG.des, type: 'dungeon', tileset: 'dg_tomb', lv: [38, 50], bgm: 'dungeon_dark', ambient: 'cave', weather: [], pos: [0.67, 0.93], exits: { N: 'sandara' }, monsters: [['tomb_mummy', 9], ['gilded_scarab', 7], ['tomb_bat', 7]], boss: 'sun_king' },
  { id: 'coral_beach', name: 'Coral Beach', region: REG.coast, type: 'field', tileset: 'coast', lv: [18, 28], bgm: 'field_coast', ambient: 'coast', weather: ['sunny', 'rain'], pos: [0.27, 0.86], exits: { W: 'aurelion_fields_south', E: 'tidewatch' }, monsters: [['shore_crab', 9], ['sea_slime', 8], ['reef_gull', 6]], trees: ['tree_oak', 'rock'] },
  { id: 'tidewatch', name: 'Port Town Tidewatch', region: REG.coast, type: 'town', tileset: 'coast', bgm: 'town_port', ambient: 'coast', weather: ['sunny'], pos: [0.16, 0.86], exits: { E: 'coral_beach', S: 'sunken_grotto', N: 'frostpeak_slopes' }, town: { style: 'inn', shop: 'port' } },
  { id: 'sunken_grotto', name: 'Sunken Grotto', region: REG.coast, type: 'dungeon', tileset: 'dg_grotto', lv: [28, 38], bgm: 'dungeon_cave', ambient: 'cave', weather: [], pos: [0.08, 0.95], exits: { N: 'tidewatch' }, monsters: [['grotto_crab', 8], ['kelp_spore', 8], ['drowned_spirit', 7]] },
  { id: 'frostpeak_slopes', name: 'Frostpeak Slopes', region: REG.snow, type: 'field', tileset: 'snow', lv: [40, 50], bgm: 'field_snow', ambient: 'snow', weather: ['snow'], pos: [0.09, 0.63], exits: { S: 'tidewatch', N: 'frostholm' }, monsters: [['frost_slime', 9], ['snow_wolf', 8], ['ice_golem', 5]], trees: ['tree_pine', 'rock'] },
  { id: 'frostholm', name: 'Snow Town Frostholm', region: REG.snow, type: 'town', tileset: 'snow', bgm: 'town_snow', ambient: 'snow', weather: ['snow'], pos: [0.1, 0.42], exits: { S: 'frostpeak_slopes', N: 'ice_caverns', E: 'cinder_wastes' }, refine: true, town: { style: 'inn', shop: 'snow' } },
  { id: 'ice_caverns', name: 'Ice Caverns', region: REG.snow, type: 'dungeon', tileset: 'dg_ice', lv: [48, 58], bgm: 'dungeon_ice', ambient: 'cave', weather: [], pos: [0.1, 0.26], exits: { S: 'frostholm' }, monsters: [['ice_bat', 9], ['frost_wraith', 7], ['glacier_golem', 6]] },
  { id: 'cinder_wastes', name: 'Cinder Wastes', region: REG.fire, type: 'field', tileset: 'volcano', lv: [55, 65], bgm: 'field_volcano', ambient: 'volcano', weather: ['ash'], pos: [0.2, 0.3], exits: { W: 'frostholm', E: 'magma_core' }, monsters: [['ember_slime', 9], ['ash_scorpion', 8], ['fire_drake', 6]], trees: ['rock', 'rock_big'] },
  { id: 'magma_core', name: 'Magma Core', region: REG.fire, type: 'dungeon', tileset: 'dg_magma', lv: [62, 74], bgm: 'dungeon_dark', ambient: 'volcano', weather: [], pos: [0.27, 0.2], exits: { W: 'cinder_wastes' }, monsters: [['magma_golem', 8], ['flame_drake', 8]], boss: 'pyrewyrm' },
  { id: 'shadowmere_marsh', name: 'Shadowmere Marsh', region: REG.ruin, type: 'field', tileset: 'swamp', lv: [60, 70], bgm: 'field_swamp', ambient: 'swamp', weather: ['fog', 'rain'], pos: [0.9, 0.7], exits: { W: 'mirage_oasis', N: 'ravenhold_ruins' }, monsters: [['bog_slime', 9], ['marsh_spore', 8], ['mire_crab', 7]], trees: ['tree_dark', 'stump'] },
  { id: 'ravenhold_ruins', name: 'Ravenhold Castle Ruins', region: REG.ruin, type: 'field', tileset: 'ruins', lv: [66, 76], bgm: 'dungeon_dark', ambient: 'forest', weather: ['fog'], pos: [0.9, 0.5], exits: { S: 'shadowmere_marsh', N: 'ravenhold_crypt' }, monsters: [['raven_bat', 8], ['cursed_knight', 8], ['banshee', 6]], trees: ['ruin_pillar', 'gravestone', 'tree_dark'] },
  { id: 'ravenhold_crypt', name: 'Ravenhold Crypt', region: REG.ruin, type: 'dungeon', tileset: 'dg_crypt', lv: [72, 85], bgm: 'dungeon_dark', ambient: 'cave', weather: [], pos: [0.9, 0.3], exits: { S: 'ravenhold_ruins' }, monsters: [['grave_knight', 9], ['lich_spirit', 8], ['banshee', 4]], boss: 'dread_lord' },
];
// New links on the hand-made Phase 1 maps.
const LINKS: Record<string, Partial<Record<Exit, string>>> = { sunny_meadow: { S: 'clover_hills' } };

const OPP: Record<Exit, Exit> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Portal rect and arrival spawn for an exit on a W×H map. */
function edge(e: Exit, W: number, H: number) {
  const mx = Math.floor(W / 2) - 2, my = Math.floor(H / 2) - 2;
  if (e === 'N') return { portal: { x: mx, y: 0, w: 4, h: 2 }, spawn: { x: mx + 2, y: 4 }, inner: [mx + 1, 3] as [number, number] };
  if (e === 'S') return { portal: { x: mx, y: H - 2, w: 4, h: 2 }, spawn: { x: mx + 2, y: H - 5 }, inner: [mx + 1, H - 4] as [number, number] };
  if (e === 'W') return { portal: { x: 0, y: my, w: 2, h: 4 }, spawn: { x: 4, y: my + 2 }, inner: [3, my + 1] as [number, number] };
  return { portal: { x: W - 2, y: my, w: 2, h: 4 }, spawn: { x: W - 5, y: my + 2 }, inner: [W - 4, my + 1] as [number, number] };
}

interface Built { map: J; npcs: J[]; shops: J[] }

function npc(id: string, name: string, title: string, seed: number, style: string, services: J[], greeting: string[]): J {
  const r = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  return {
    id, name, title,
    appearance: { body: pick(['a', 'b']), hairStyle: pick(['short', 'long', 'spiky', 'ponytail', 'bob']), hairColor: pick(['#3a2a1e', '#8a3a1e', '#e8d090', '#2a2a3a', '#c8c8d8', '#a35d30', '#5a3a8a']), eyeColor: pick(['#4f8fe0', '#5a3a1e', '#3a8a5a', '#8a3ad8']), skinTone: pick(['#f6dcc8', '#e8c0a0', '#c89a78', '#9a6a4a']) },
    outfit: { primary: pick(['#3a6ab8', '#8a2a2a', '#2a6a4a', '#6a4a2a', '#5b3d8f', '#c8a26b']), secondary: pick(['#2a2a3a', '#3a2a1a', '#e8dcc0']), accent: pick(['#f2d23a', '#c8ccd8', '#e8dcc0']), style },
    greeting, services, generated: true,
  };
}

const TOWN_SHOPS: Record<string, { tools: string[]; arms: string[] }> = {
  capital: { tools: ['red_potion', 'orange_potion', 'yellow_potion', 'blue_potion', 'green_potion', 'wing_of_return', 'wandering_feather', 'swiftness_tonic'], arms: ['iron_sword', 'steel_sword', 'knight_spear', 'chain_mail', 'iron_helm', 'iron_shield', 'leather_boots', 'travel_cape'] },
  forest: { tools: ['red_potion', 'orange_potion', 'yellow_potion', 'green_potion', 'wing_of_return', 'wandering_feather'], arms: ['short_bow', 'hunter_bow', 'hunter_vest', 'leather_jacket', 'leaf_cap', 'leather_boots', 'travel_cape'] },
  mage: { tools: ['red_potion', 'orange_potion', 'yellow_potion', 'blue_potion', 'wing_of_return', 'wandering_feather'], arms: ['apprentice_wand', 'oak_staff', 'apprentice_robe', 'sapphire_pendant', 'copper_ring', 'sandals'] },
  desert: { tools: ['orange_potion', 'yellow_potion', 'blue_potion', 'green_potion', 'wing_of_return', 'wandering_feather', 'swiftness_tonic'], arms: ['steel_sword', 'hunter_bow', 'oak_staff', 'chain_mail', 'iron_shield', 'swift_boots'] },
  port: { tools: ['red_potion', 'orange_potion', 'yellow_potion', 'blue_potion', 'green_potion', 'wing_of_return', 'wandering_feather'], arms: ['iron_sword', 'short_bow', 'leather_jacket', 'bandana', 'wooden_buckler', 'sandals', 'copper_ring'] },
  snow: { tools: ['orange_potion', 'yellow_potion', 'blue_potion', 'green_potion', 'wing_of_return', 'wandering_feather'], arms: ['steel_sword', 'knight_spear', 'hunter_bow', 'oak_staff', 'chain_mail', 'iron_helm', 'wolfhide_cloak'] },
};
const GUILD_NPC: Record<string, [string, string, string]> = {
  knight: ['Commander Aldric', 'Knight Guild Master', 'plate'], ranger: ['Ranger Sylvi', 'Ranger Guild Master', 'hood'], mage: ['Magister Ophelia', 'Mage Guild Master', 'robe'],
};
const TOWN_IDS = () => ['willowbrook', ...NEW_MAPS.filter((m) => m.type === 'town').map((m) => m.id)];

function buildTown(s: MapSpec): Built {
  const W = 48, H = 38, cx = 24, cy = 19;
  const paint: J[] = [], portals: J[] = [], spawn: J = {}, npcs: J[] = [], shops: J[] = [], places: J[] = [];
  const base = s.tileset === 'desert' ? 'sand' : 'grass';
  paint.push({ op: 'rect', tile: 'path_stone', x: cx - 7, y: cy - 5, w: 14, h: 10 });
  for (const [e, target] of Object.entries(s.exits) as [Exit, string][]) {
    const g = edge(e, W, H);
    portals.push({ id: `to_${target}`, ...g.portal, targetMap: target, targetSpawn: `from_${s.id}`, label: '' });
    spawn[`from_${target}`] = g.spawn;
    paint.push({ op: 'path', tile: 'path_stone', points: [g.inner, [cx - 1, cy - 1]], width: 3 });
  }
  spawn.default = { x: cx, y: cy + 3 };
  paint.push({ op: 'object', kind: 'fountain', x: cx - 1, y: cy - 2, id: `${s.id}_fountain` });
  for (const [x, y] of [[cx - 7, cy - 5], [cx + 6, cy - 5], [cx - 7, cy + 4], [cx + 6, cy + 4]]) paint.push({ op: 'object', kind: 'lamp_post', x, y });
  // Four buildings in the quadrants (never on the cross-shaped roads), doors facing the plaza roads.
  const B = [
    { style: 'inn', x: 5, y: 4, w: 8, h: 5, door: 4, sign: 'inn' }, { style: 'smithy', x: 34, y: 4, w: 8, h: 5, door: 3, sign: 'smithy' },
    { style: 'shop', x: 5, y: 26, w: 8, h: 5, door: 4, sign: 'shop' }, { style: s.guild ? 'guild' : 'house', x: 34, y: 26, w: 8, h: 5, door: 4, sign: s.guild ? 'guild' : undefined },
  ];
  for (const b of B) paint.push({ op: 'building', ...b });
  paint.push({ op: 'scatter', kind: 'deco:flowers', density: 0.04, seed: hash(s.id) });
  paint.push({ op: 'scatter', kind: (s.trees ?? (s.tileset === 'snow' || s.tileset === 'fernwood' ? ['tree_pine'] : ['tree_oak']))[0], density: 0.012, seed: hash(s.id) + 1 });
  const shopKey = s.town!.shop;
  shops.push({ id: `${s.id}_tools`, name: `${s.name} Tool Shop`, items: TOWN_SHOPS[shopKey].tools, generated: true });
  shops.push({ id: `${s.id}_arms`, name: `${s.name} Armory`, items: ['glimmer_ore', 'bright_ore', ...TOWN_SHOPS[shopKey].arms], generated: true });
  const towns = TOWN_IDS().filter((t) => t !== s.id);
  const short = s.name.split(' ').slice(-1)[0];
  npcs.push(npc(`${s.id}_courier`, `Courier ${['Lina', 'Mira', 'Tessa', 'Nadia', 'Rosa', 'Elsa', 'Kaia'][hash(s.id) % 7]}`, 'Courier Guild Service', hash(s.id) + 3, 'coat',
    [{ type: 'save' }, { type: 'storage' }, { type: 'warp', destinations: towns.map((t) => ({ mapId: t, spawn: 'default', cost: t === 'willowbrook' ? 300 : 600 })) }],
    [`Welcome to ${short}! The Courier Guild can save your position, keep your belongings, or send you to another town.`]));
  npcs.push(npc(`${s.id}_merchant`, `${['Bertram', 'Odile', 'Fenwick', 'Zahra', 'Corin', 'Hilde', 'Pell'][hash(s.id + 'm') % 7]}`, 'Tool Merchant', hash(s.id) + 5, 'tunic',
    [{ type: 'shop', shopId: `${s.id}_tools`, label: 'Buy potions & supplies' }], ['Potions, wings, tonics — everything a traveller needs.']));
  npcs.push(npc(`${s.id}_smith`, `${['Torvald', 'Bruna', 'Kesh', 'Darius', 'Mag', 'Ulf', 'Yara'][hash(s.id + 's') % 7]}`, s.refine ? 'Blacksmith & Refiner' : 'Armorer', hash(s.id) + 7, 'apron',
    [{ type: 'shop', shopId: `${s.id}_arms`, label: 'Browse weapons & armor' }, ...(s.refine ? [{ type: 'refine' }, { type: 'forge' }] : [])], ['Fine steel, fair prices.']));
  npcs.push(npc(`${s.id}_innkeeper`, `${['Greta', 'Amos', 'Sabine', 'Idris', 'Molly', 'Gunnar', 'Fae'][hash(s.id + 'i') % 7]}`, 'Innkeeper', hash(s.id) + 9, 'tunic',
    [{ type: 'heal', cost: 20 }, { type: 'save' }], ['A warm bed and a hot meal, traveller?']));
  places.push([`${s.id}_innkeeper`, 9, 10], [`${s.id}_smith`, 37, 10], [`${s.id}_merchant`, 9, 32], [`${s.id}_courier`, cx + 3, cy + 2]);
  if (s.enchanter) {
    npcs.push(npc(`${s.id}_enchanter`, 'Enchantress Viveka', 'Equipment Enchanter', hash(s.id) + 11, 'robe', [{ type: 'enchant' }],
      ['I weave hidden power into equipment. One more option, or a fresh roll of them all, for a price.']));
    places.push([`${s.id}_enchanter`, cx - 4, cy + 2]);
  }
  for (const g of s.guild ?? []) {
    const [nm, tt, style] = GUILD_NPC[g];
    npcs.push(npc(`guild_${g}`, nm, tt, hash(g), style, [{ type: 'jobChange', classIds: [g] }],
      [`So you wish to walk the path of the ${title(g)}? Prove you've reached Job Level 10 as a Novice and I will accept you.`]));
    places.push([`guild_${g}`, 38, 32]);
  }
  const map = {
    id: s.id, name: s.name, region: s.region, type: 'town', width: W, height: H, tileset: s.tileset, base, border: { kind: 'thicket', thickness: 2 },
    bgm: s.bgm, ambient: s.ambient, weather: s.weather, isSavePoint: true, worldMapPos: { x: s.pos[0], y: s.pos[1] },
    paint, portals, spawnPoints: spawn, npcs: places.map(([id, x, y]) => ({ npcId: id, x, y, facing: 'down' })), monsterSpawns: [],
    objects: [{ id: `${s.id}_fountain`, kind: 'fountain', x: cx - 1, y: cy - 2, name: `${short} Fountain`, interact: { text: `${s.name}. ${s.region}.` } }], areas: [], generated: true,
  };
  return { map, npcs, shops };
}

function buildField(s: MapSpec): Built {
  const W = s.size?.[0] ?? 58, H = s.size?.[1] ?? 44, cx = Math.floor(W / 2), cy = Math.floor(H / 2), r = rng(hash(s.id));
  const paint: J[] = [], portals: J[] = [], spawn: J = {};
  const road = s.tileset === 'desert' ? 'sand' : s.tileset === 'snow' ? 'path_stone' : 'dirt';
  if (s.lake !== 'none') {
    // Lakes / lava pools in two opposite quadrants, away from the cross of roads.
    for (const [qx, qy] of [[-1, -1], [1, 1]]) paint.push({ op: 'blob', tile: 'water', cx: cx + qx * Math.round(W * 0.27), cy: cy + qy * Math.round(H * 0.25), rx: 4 + Math.floor(r() * 3), ry: 3 + Math.floor(r() * 2), seed: hash(s.id) + qx });
  }
  for (const [e, target] of Object.entries(s.exits) as [Exit, string][]) {
    const g = edge(e, W, H);
    portals.push({ id: `to_${target}`, ...g.portal, targetMap: target, targetSpawn: `from_${s.id}`, label: '' });
    spawn[`from_${target}`] = g.spawn;
    const mid: [number, number] = [Math.round((g.inner[0] + cx) / 2 + (r() - 0.5) * 6), Math.round((g.inner[1] + cy) / 2 + (r() - 0.5) * 6)];
    paint.push({ op: 'path', tile: road, points: [g.inner, mid, [cx - 1, cy - 1]], width: 2 });
  }
  spawn.default = Object.values(spawn)[0];
  const trees = s.trees ?? ['tree_oak'];
  trees.forEach((t, i) => paint.push({ op: 'scatter', kind: t, density: i === 0 ? 0.035 : 0.012, seed: hash(s.id) + 10 + i }));
  for (const d of s.tileset === 'volcano' || s.tileset === 'desert' ? ['pebbles'] : s.tileset === 'snow' ? ['pebbles', 'tuft'] : ['flowers', 'tuft']) paint.push({ op: 'scatter', kind: `deco:${d}`, density: 0.05, seed: hash(s.id + d) });
  // Monster areas in the four quadrants (cycling through the species list).
  const quads = [[3, 3], [cx + 2, 3], [3, cy + 2], [cx + 2, cy + 2]];
  const spawns = (s.monsters ?? []).flatMap(([id, n], i) => {
    const out: J[] = [];
    const parts = n > 6 ? 2 : 1;
    for (let k = 0; k < parts; k++) { const [x, y] = quads[(i + k * 2) % 4]; out.push({ monsterId: id, count: Math.ceil(n / parts), area: { x, y, w: cx - 6, h: cy - 6 } }); }
    return out;
  });
  const signText = Object.entries(s.exits).map(([e, t]) => `${{ N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' }[e as Exit]} → ${MAP_NAME[t!]}`).join('.  ');
  const sp = spawn.default;
  paint.push({ op: 'object', kind: 'signpost', x: sp.x + 1, y: sp.y - 2, id: `sign_${s.id}` });
  const map = {
    id: s.id, name: s.name, region: s.region, type: 'field', levelRange: s.lv, width: W, height: H, tileset: s.tileset, base: 'grass', border: { kind: 'thicket', thickness: 2 },
    bgm: s.bgm, ambient: s.ambient, weather: s.weather, worldMapPos: { x: s.pos[0], y: s.pos[1] }, paint, portals, spawnPoints: spawn, npcs: [],
    monsterSpawns: spawns, objects: [{ id: `sign_${s.id}`, kind: 'signpost', x: sp.x + 1, y: sp.y - 2, name: 'Signpost', interact: { text: `${s.name} (Lv.${s.lv![0]}–${s.lv![1]}).  ${signText}.` } }],
    areas: [], generated: true,
  };
  return { map, npcs: [], shops: [] };
}

function buildDungeon(s: MapSpec): Built {
  const W = 50, H = 40, r = rng(hash(s.id));
  const paint: J[] = [], portals: J[] = [], spawn: J = {};
  // 3×3 rooms separated by wall lines; every shared wall gets a 3-tile doorway, so all rooms connect.
  const xs = [17, 33], ys = [14, 26];
  for (const x of xs) {
    const bounds = [2, ...ys, H - 2];
    for (let i = 0; i < 3; i++) {
      const y0 = bounds[i], y1 = bounds[i + 1], gap = y0 + 2 + Math.floor(r() * Math.max(1, y1 - y0 - 6));
      if (gap > y0) paint.push({ op: 'rect', tile: 'ruin_wall', layer: 'wall', x, y: y0, w: 1, h: gap - y0 });
      if (y1 > gap + 3) paint.push({ op: 'rect', tile: 'ruin_wall', layer: 'wall', x, y: gap + 3, w: 1, h: y1 - gap - 3 });
    }
  }
  for (const y of ys) {
    const bounds = [2, ...xs, W - 2];
    for (let i = 0; i < 3; i++) {
      const x0 = bounds[i] + 1, x1 = bounds[i + 1], gap = x0 + 2 + Math.floor(r() * Math.max(1, x1 - x0 - 6));
      if (gap > x0) paint.push({ op: 'rect', tile: 'ruin_wall', layer: 'wall', x: x0, y, w: gap - x0, h: 1 });
      if (x1 > gap + 3) paint.push({ op: 'rect', tile: 'ruin_wall', layer: 'wall', x: gap + 3, y, w: x1 - gap - 3, h: 1 });
    }
  }
  const [e, target] = Object.entries(s.exits)[0] as [Exit, string];
  const g = edge(e, W, H);
  portals.push({ id: `to_${target}`, ...g.portal, targetMap: target, targetSpawn: `from_${s.id}`, label: '' });
  spawn[`from_${target}`] = g.spawn; spawn.default = g.spawn;
  // Keep the corridor from the entrance free of wall lines.
  paint.push({ op: 'path', tile: 'ruin_floor', points: [g.inner, [Math.floor(W / 2), Math.floor(H / 2)]], width: 3 });
  const deco = s.tileset === 'dg_catacomb' || s.tileset === 'dg_crypt' ? ['gravestone', 'ruin_pillar'] : s.tileset === 'dg_tower' || s.tileset === 'dg_tomb' ? ['ruin_pillar', 'obelisk'] : ['rock', 'rock_big'];
  deco.forEach((k, i) => paint.push({ op: 'scatter', kind: k, density: 0.012, seed: hash(s.id) + i, area: { x: 3, y: 3, w: W - 6, h: H - 6 } }));
  paint.push({ op: 'scatter', kind: 'deco:pebbles', density: 0.05, seed: hash(s.id) + 9 });
  const rooms = [[3, 3], [18, 3], [34, 3], [3, 15], [18, 15], [34, 15], [3, 27], [18, 27], [34, 27]];
  const spawns = (s.monsters ?? []).flatMap(([id, n], i) => [0, 1, 2].map((k) => {
    const [x, y] = rooms[(i * 3 + k * 2 + 1) % 9];
    return { monsterId: id, count: Math.max(1, Math.round(n / 3)), area: { x, y, w: 13, h: 10 } };
  }));
  // Boss in the room farthest from the entrance.
  const far = e === 'N' ? [W / 2, H - 7] : e === 'S' ? [W / 2, 7] : e === 'E' ? [8, H / 2] : [W - 9, H / 2];
  const map = {
    id: s.id, name: s.name, region: s.region, type: 'dungeon', levelRange: s.lv, width: W, height: H, tileset: s.tileset, base: 'ruin_floor', border: { kind: 'ruin_wall', thickness: 2 },
    bgm: s.bgm, ambient: s.ambient, weather: [], worldMapPos: { x: s.pos[0], y: s.pos[1] }, paint, portals, spawnPoints: spawn, npcs: [],
    monsterSpawns: spawns, ...(s.boss ? { bossSpawn: { bossId: s.boss, x: Math.round(far[0]), y: Math.round(far[1]), respawnSeconds: 900 } } : {}),
    objects: [], areas: [], generated: true,
  };
  return { map, npcs: [], shops: [] };
}

const MAP_NAME: Record<string, string> = { willowbrook: 'Willowbrook Village', sunny_meadow: 'Sunny Meadow', whispering_forest: 'Whispering Forest' };
for (const m of NEW_MAPS) MAP_NAME[m.id] = m.name;

// ------------------------------------------------------------------ boss defs (Grukk is the template)
function bossDef(b: typeof BOSSES[number], grukk: J): J {
  const el = b.element, n = b.monster.name;
  return {
    id: b.id, monsterId: b.monster.id, title: b.title, intro: `${n} awakens!`,
    phases: [
      { hpPct: 100, name: 'Phase I', atkMul: 1, speedMul: 1, message: `${n} attacks!` },
      { hpPct: 66, name: 'Phase II', atkMul: 1.15, speedMul: 1.1, message: `${n} calls its servants!` },
      { hpPct: 33, name: 'Phase III', atkMul: 1.3, speedMul: 1.2, message: `${n} unleashes its full power!` },
    ],
    enrage: grukk.enrage,
    skills: [
      { id: `${b.id}_slam`, name: 'Crushing Blow', kind: 'circle', telegraphMs: 1300, radius: 100, multiplier: 1.7, element: el, cooldownMs: 6500, minPhase: 0, fx: b.fx },
      { id: `${b.id}_nova`, name: 'Dark Nova', kind: 'self_circle', telegraphMs: 1500, radius: 160, multiplier: 1.3, element: el, status: { status: b.status, chance: 0.5, durationMs: 4000 }, cooldownMs: 11000, minPhase: 0, fx: b.fx },
      { id: `${b.id}_summon`, name: 'Summon Servants', kind: 'summon', telegraphMs: 1000, summon: { monsterId: b.minion, count: 2 }, cooldownMs: 26000, minPhase: 1, fx: 'shout' },
      { id: `${b.id}_charge`, name: 'Rush', kind: 'charge', telegraphMs: 1100, radius: 55, multiplier: 1.5, element: el, cooldownMs: 9000, minPhase: 1, fx: 'dash' },
      { id: `${b.id}_ring`, name: 'Cataclysm', kind: 'ring', telegraphMs: 1700, radius: 230, multiplier: 1.4, element: el, cooldownMs: 13000, minPhase: 2, fx: b.fx },
    ],
    contributionRewards: { minDamagePct: 10, items: [{ itemId: 'starsteel_ore', qty: 3 }, { itemId: 'moonstone_ore', qty: 3 }], luma: 500 + b.monster.lv * 40 },
    mvp: { expPct: 50, items: [{ itemId: 'elder_sap', chance: 0.4 }, { itemId: 'elder_seed', chance: 0.6 }, { itemId: 'starsteel_ore', chance: 0.5 }, { itemId: 'moonstone_ore', chance: 0.5 }] },
    generated: true,
  };
}

// ------------------------------------------------------------------ main
export async function main() {
  const { compileMap } = await import('../../src/core/mapCompiler');
  const strip = (a: J[]) => a.filter((x) => !x.generated);
  const monsters = strip(read('monsters.json')), items = strip(read('items.json')), drops = strip(read('drops.json'));
  const shops = strip(read('shops.json')), npcs = strip(read('npcs.json')), bosses = strip(read('bosses.json'));
  const tilesets = strip(read('tilesets.json')), audio = read('audio.json');
  for (const k of Object.keys(audio.tracks)) if (audio.tracks[k].generated) delete audio.tracks[k];
  for (const k of Object.keys(audio.ambient)) if (audio.ambient[k].generated) delete audio.ambient[k];

  // Monsters + their material + drop table.
  const specs = [...MONSTERS, ...BOSSES.map((b) => b.monster)];
  for (const s of specs) {
    const b = BOSSES.find((x) => x.monster.id === s.id);
    const def = monsterDef(s, b?.scale ?? 1);
    if (b) def.bossId = b.id;
    monsters.push(def);
    const [part, icon] = PART[s.shape];
    const matId = `${s.id.replace(/_boss$/, '')}_${part.toLowerCase().replace(/[^a-z]+/g, '_')}`;
    const baseName = s.name.replace(/^(Sun-King|Archmage|Dread Lord) /, '');
    const matName = baseName.split(' ').pop() === part.split(' ')[0] ? `${baseName} ${part.split(' ').slice(1).join(' ')}` : `${baseName} ${part}`;
    items.push({ id: matId, name: matName, type: 'material', rarity: b ? 'rare' : 'common', description: `Dropped by ${s.name}. Merchants pay well for it.`, weight: 1, price: Math.round(4 + s.lv * (b ? 30 : 2.2)), stackable: true, maxStack: 999, icon: { shape: icon, color: s.colors[0], accent: s.colors[2] }, generated: true });
    const tier = s.lv < 25 ? 'orange_potion' : s.lv < 50 ? 'yellow_potion' : 'yellow_potion';
    drops.push({ id: `${s.id}_drops`, luma: [Math.round(2 + s.lv * 0.6), Math.round(6 + s.lv * 1.4)], entries: [
      { itemId: matId, chance: b ? 1 : 0.55 }, { itemId: tier, chance: b ? 1 : 0.06 },
      { itemId: 'starsteel_ore', chance: b ? 0.5 : Math.min(0.04, 0.004 + s.lv * 0.0004) }, { itemId: 'moonstone_ore', chance: b ? 0.5 : Math.min(0.04, 0.004 + s.lv * 0.0004) },
    ], generated: true });
  }
  // Element levels 1–4 (Ragnarok-style), by level tier; bosses one level higher.
  for (const m of monsters) m.elementLevel = Math.min(4, (m.level < 20 ? 1 : m.level < 45 ? 2 : m.level < 70 ? 3 : 4) + (m.aiType === 'boss' ? 1 : 0));

  // ---------------------------------------------------------------- cards (one per monster)
  const CARD_SLOTS = ['weapon', 'armor', 'shield', 'garment', 'boots', 'headgear', 'accessory'] as const;
  const RACES = ['formless', 'undead', 'beast', 'plant', 'insect', 'fish', 'demon', 'demihuman', 'dragon'];
  const STATS = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
  const cardChance = read('../config/balance.json').drops?.cardChance ?? 0.0001;
  for (const t of drops) t.entries = t.entries.filter((e: J) => !e.card);
  monsters.forEach((m: J, i: number) => {
    const boss = m.aiType === 'boss', tier = 1 + Math.floor(m.level / 20), h = hash(m.id);
    const equip = boss ? (h % 2 ? 'weapon' : 'armor') : CARD_SLOTS[(i + h) % CARD_SLOTS.length];
    const pick = <T>(a: readonly T[], salt = 0) => a[(h >>> salt) % a.length];
    let mods: J;
    switch (equip) {
      case 'weapon': mods = boss ? { patkPct: 10, raceDamagePct: { [pick(RACES, 3)]: 15 } }
        // Procs: monsters that inflict a status give it to their card; bats drain HP.
        : m.onHitStatus ? { onHitStatusPct: { [m.onHitStatus.status]: 5 }, patk: 2 * tier }
          : m.art.shape === 'bat' ? { hpDrainPct: 3 }
            : [{ raceDamagePct: { [pick(RACES, 5)]: 20 } }, { sizeDamagePct: { [pick(['small', 'medium', 'large'], 7)]: 15 } }, { patk: 4 + 3 * tier, hit: 5 * tier }][h % 3];
        break;
      case 'armor': mods = boss ? { maxHpPct: 15, pdef: 3 * tier } : [{ maxHp: 80 * tier }, { vit: 1, maxHpPct: 10 }, { elementResistPct: { [m.element === 'neutral' ? 'fire' : m.element]: 20 } }][h % 3]; break;
      case 'shield': mods = { raceResistPct: { [m.race]: 25 } }; break;
      case 'garment': mods = m.element === 'neutral' ? { flee: 5 + 3 * tier } : { elementResistPct: { [m.element]: 20 }, flee: 2 * tier }; break;
      case 'boots': mods = [{ agi: 1, moveSpeedPct: 5 }, { maxHp: 60 * tier, maxMp: 20 * tier }, { maxMpPct: 10, mpRegen: 2 }][h % 3]; break;
      case 'headgear': mods = [{ int: 1, mdef: 3 }, { dex: 1, hit: 5 }, { luk: 1, crit: 3 }][h % 3]; break;
      default: mods = [{ [pick(STATS, 4)]: 2 }, { crit: 4 }, { hit: 10 }][h % 3];
    }
    items.push({
      id: `card_${m.id}`, name: `${m.name.replace(/ Boss$/, '')} Card`, type: 'card', rarity: boss ? 'epic' : 'rare',
      description: `A card holding the essence of the ${m.name}. Compound it into ${equip === 'armor' ? 'body armor' : equip === 'boots' ? 'footgear' : equip} with a free slot.`,
      weight: 1, price: 20, stackable: true, maxStack: 999, icon: { shape: 'card', color: m.art.colors[0], accent: m.art.colors[2] },
      card: { equip, mods, monsterId: m.id }, generated: true,
    });
    const t = drops.find((d: J) => d.id === m.dropTableId);
    if (t) t.entries.push({ itemId: `card_${m.id}`, chance: cardChance, card: true });
  });
  // Refining ores: grades 1–2 are sold by NPCs, Starsteel (weapon Lv 3–4) and Moonstone (armor) only drop.
  for (const [id, name, price, desc, col] of [
    ['glimmer_ore', 'Glimmer Ore', 50, 'Soft, shiny ore. Used to refine level 1 weapons.', '#c8a86a'],
    ['bright_ore', 'Bright Ore', 200, 'Ore with a steady inner light. Used to refine level 2 weapons.', '#8ab8d8'],
  ] as const) {
    if (!items.some((i: J) => i.id === id)) items.push({ id, name, type: 'material', rarity: 'common', description: desc, weight: 2, price, stackable: true, maxStack: 999, icon: { shape: 'ore', color: col, accent: '#ffffff' }, generated: true });
  }
  const starsteel = items.find((i: J) => i.id === 'starsteel_ore'), moonstone = items.find((i: J) => i.id === 'moonstone_ore');
  starsteel.description = 'Ore with a faint starry glint. Used to refine level 3 and 4 weapons. Found on monsters, not in shops.';
  moonstone.description = 'Pale, cool-to-the-touch ore. Used to refine armor. Found on monsters, not in shops.';
  for (const sh of shops) sh.items = sh.items.filter((i: string) => i !== 'starsteel_ore' && i !== 'moonstone_ore');
  for (const sh of shops) if (sh.items.some((i: string) => items.find((x: J) => x.id === i)?.slot === 'weapon') && !sh.items.includes('glimmer_ore')) sh.items.unshift('glimmer_ore', 'bright_ore');
  // Early monsters drop the drop-only ores rarely, so armor refining is possible from the start.
  for (const t of drops) {
    t.entries = t.entries.filter((e: J) => !e.oreHint);
    if (!t.entries.some((e: J) => e.itemId === 'moonstone_ore')) t.entries.push({ itemId: 'moonstone_ore', chance: 0.005, oreHint: true }, { itemId: 'starsteel_ore', chance: 0.003, oreHint: true });
  }

  // Card slots on equipment (Ragnarok-style: daggers 3, other weapons 2, rarer weapons 1; armor pieces 1).
  for (const it of items) {
    if (it.type !== 'equipment') continue;
    // Weapon level 1–4 by tier: starter 1, common 2, uncommon 3, rare/epic 4.
    if (it.slot === 'weapon') it.weaponLevel = (it.equipLevel ?? 1) <= 1 ? 1 : it.rarity === 'common' ? 2 : it.rarity === 'uncommon' ? 3 : 4;
    it.cardSlots = it.slot === 'weapon' ? (it.rarity === 'rare' || it.rarity === 'epic' ? 1 : it.weaponType === 'dagger' ? 3 : 2) : 1;
  }

  // ---------------------------------------------------------------- forging: stones, crumbs, recipes
  const FORGE_ITEMS: [string, string, string, string, string][] = [
    ['flame_stone', 'Flame Stone', 'A stone that is always warm. Forged into a weapon, it gives the weapon the fire element.', 'gem', '#ff6a2e'],
    ['frost_stone', 'Frost Stone', 'A stone rimed with frost. Forged into a weapon, it gives the weapon the water element.', 'gem', '#7ab8ff'],
    ['gale_stone', 'Gale Stone', 'A stone that hums in the wind. Forged into a weapon, it gives the weapon the wind element.', 'gem', '#b6f0d0'],
    ['terra_stone', 'Terra Stone', 'A heavy stone full of life. Forged into a weapon, it gives the weapon the earth element.', 'gem', '#8b6b3e'],
    ['star_crumb', 'Star Crumb', 'A fragment of a fallen star. Up to three can be forged into a weapon for bonus ATK.', 'gem', '#ffe14d'],
  ];
  for (const [id, name, desc, icon, col] of FORGE_ITEMS) items.push({ id, name, type: 'material', rarity: 'uncommon', description: desc, weight: 1, price: id === 'star_crumb' ? 400 : 300, stackable: true, maxStack: 999, icon: { shape: icon, color: col, accent: '#ffffff' }, generated: true });
  // Elemental converters: a consumable that gives the weapon an element for 10 minutes (RO's converters / holy water).
  const CONVERTERS: [string, string, string, string, number][] = [
    ['ember_oil', 'Ember Oil', 'fire', '#ff6a2e', 300], ['frost_oil', 'Frost Oil', 'water', '#7ab8ff', 300],
    ['gale_oil', 'Gale Oil', 'wind', '#b6f0d0', 300], ['terra_oil', 'Terra Oil', 'earth', '#8b6b3e', 300],
    ['blessed_water', 'Blessed Water', 'holy', '#fff6c0', 450], ['wraith_oil', 'Wraith Oil', 'ghost', '#c8d4ff', 600],
  ];
  for (const [id, name, el, col, price] of CONVERTERS) items.push({ id, name, type: 'consumable', rarity: 'uncommon', description: `Coats your weapon: attacks become ${el} for 10 minutes.`, weight: 2, price, stackable: true, maxStack: 99, cooldownMs: 1000, use: [{ type: 'endow', element: el, durationMs: 600000 }], icon: { shape: 'potion', color: col, accent: '#ffffff' }, generated: true });
  const STONE_OF: Record<string, string> = { fire: 'flame_stone', water: 'frost_stone', wind: 'gale_stone', earth: 'terra_stone' };
  for (const t of drops) t.entries = t.entries.filter((e: J) => !e.forge);
  for (const m of monsters) {
    const t = drops.find((d: J) => d.id === m.dropTableId);
    if (!t) continue;
    if (STONE_OF[m.element]) t.entries.push({ itemId: STONE_OF[m.element], chance: m.aiType === 'boss' ? 0.5 : 0.01, forge: true });
    if (m.level >= 15) t.entries.push({ itemId: 'star_crumb', chance: m.aiType === 'boss' ? 0.5 : 0.005, forge: true });
  }
  // Materials by monster level, for recipes.
  const matByLevel: { id: string; lv: number }[] = [];
  for (const m of monsters) {
    if (m.aiType === 'boss') continue;
    const t = drops.find((d: J) => d.id === m.dropTableId);
    const mat = t?.entries.map((e: J) => items.find((i: J) => i.id === e.itemId)).find((i: J) => i?.type === 'material' && !/_ore$|_stone$|star_crumb/.test(i.id));
    if (mat && !matByLevel.some((x) => x.id === mat.id)) matByLevel.push({ id: mat.id, lv: m.level });
  }
  const recipes: J[] = [];
  for (const w of items.filter((i: J) => i.slot === 'weapon' && (i.weaponLevel ?? 1) <= 3)) {
    const wl = w.weaponLevel ?? 1, hw = hash(w.id);
    const band = wl === 1 ? [1, 12] : wl === 2 ? [8, 25] : [18, 45];
    const pool = matByLevel.filter((m) => m.lv >= band[0] && m.lv <= band[1]);
    const a = pool[hw % pool.length], b = pool[(hw >>> 4) % pool.length];
    const mats = wl === 1 ? [{ itemId: 'glimmer_ore', qty: 2 }, { itemId: a.id, qty: 5 }]
      : wl === 2 ? [{ itemId: 'bright_ore', qty: 3 }, { itemId: a.id, qty: 6 }, ...(b.id !== a.id ? [{ itemId: b.id, qty: 3 }] : [])]
        : [{ itemId: 'starsteel_ore', qty: 2 }, { itemId: 'bright_ore', qty: 4 }, { itemId: a.id, qty: 8 }, ...(b.id !== a.id ? [{ itemId: b.id, qty: 4 }] : [])];
    recipes.push({ id: `forge_${w.id}`, itemId: w.id, materials: mats, fee: 200 * wl * wl });
  }
  write('recipes.json', recipes);
  for (const n of npcs) if (n.services.some((sv: J) => sv.type === 'refine') && !n.services.some((sv: J) => sv.type === 'forge')) n.services.push({ type: 'forge' });

  const grukk = bosses.find((b: J) => b.id === 'grukk');
  for (const b of BOSSES) bosses.push(bossDef(b, grukk));
  tilesets.push(...TILESETS.map((t) => ({ ...t, generated: true })));
  for (const [k, v] of Object.entries(TRACKS)) audio.tracks[k] = { ...v, generated: true };
  for (const [k, v] of Object.entries(AMBIENT)) audio.ambient[k] = { ...v, generated: true };

  // Maps.
  for (const f of readdirSync(join(DATA, 'maps'))) {
    if (!f.endsWith('.json')) continue;
    const m = JSON.parse(readFileSync(join(DATA, 'maps', f), 'utf8'));
    if (m.generated) unlinkSync(join(DATA, 'maps', f));
  }
  const built = NEW_MAPS.map((s) => (s.type === 'town' ? buildTown(s) : s.type === 'field' ? buildField(s) : buildDungeon(s)));
  for (const b of built) { npcs.push(...b.npcs); shops.push(...b.shops); }
  for (const sh of shops) if (['aurelion_tools', 'arcanthe_tools', 'frostholm_tools'].includes(sh.id)) sh.items = [...sh.items.filter((i: string) => !CONVERTERS.some((c) => c[0] === i)), ...CONVERTERS.map((c) => c[0])];
  // Courier in Willowbrook too, so the warp network starts at home.
  npcs.push(npc('willowbrook_courier', 'Courier Fiona', 'Courier Guild Service', 77, 'coat',
    [{ type: 'save' }, { type: 'storage' }, { type: 'warp', destinations: TOWN_IDS().filter((t) => t !== 'willowbrook').map((t) => ({ mapId: t, spawn: 'default', cost: 600 })) }],
    ['The Courier Guild connects every town in Veyloria. Where to?']));

  // Hand-made maps: add new portals and the Willowbrook courier.
  const hand: Record<string, J> = {};
  for (const id of ['willowbrook', 'sunny_meadow', 'whispering_forest']) hand[id] = JSON.parse(readFileSync(join(DATA, 'maps', `${id}.json`), 'utf8'));
  for (const [id, links] of Object.entries(LINKS)) {
    const m = hand[id];
    for (const [e, target] of Object.entries(links) as [Exit, string][]) {
      const g = edge(e, m.width, m.height);
      m.portals = m.portals.filter((p: J) => p.targetMap !== target);
      m.portals.push({ id: `to_${target}`, ...g.portal, targetMap: target, targetSpawn: `from_${id}`, label: MAP_NAME[target] });
      m.spawnPoints[`from_${target}`] = g.spawn;
      m.paint = m.paint.filter((op: J) => !op.generated);
      const hub = m.spawnPoints.default;
      m.paint.push({ op: 'path', tile: 'dirt', points: [g.inner, [g.inner[0], Math.round((g.inner[1] + hub.y) / 2)], [hub.x + 12, hub.y - 3]], width: 2, generated: true });
    }
  }
  const wb = hand.willowbrook;
  wb.npcs = wb.npcs.filter((n: J) => n.npcId !== 'willowbrook_courier');
  wb.npcs.push({ npcId: 'willowbrook_courier', x: 27, y: 24, facing: 'down' });
  wb.region = REG.wb; hand.sunny_meadow.region = REG.wb; hand.whispering_forest.region = REG.wb;
  wb.worldMapPos = { x: 0.19, y: 0.6 }; hand.sunny_meadow.worldMapPos = { x: 0.29, y: 0.59 }; hand.whispering_forest.worldMapPos = { x: 0.31, y: 0.43 };

  // Portal labels from target names.
  const allMaps: J[] = [...Object.values(hand), ...built.map((b) => b.map)];
  for (const m of allMaps) for (const p of m.portals) p.label = MAP_NAME[p.targetMap] ?? p.label;
  // Make every portal's target spawn exist (two-way links).
  const byId = new Map(allMaps.map((m) => [m.id, m]));
  for (const m of allMaps) for (const p of m.portals) {
    const t = byId.get(p.targetMap);
    if (!t) throw new Error(`${m.id}: portal to unknown map ${p.targetMap}`);
    if (!t.spawnPoints[p.targetSpawn]) throw new Error(`${m.id} → ${t.id}: spawn ${p.targetSpawn} missing`);
  }

  // Write data, then compile + check every map with the real data loader rules.
  write('monsters.json', monsters); write('items.json', items); write('drops.json', drops); write('shops.json', shops);
  write('npcs.json', npcs); write('bosses.json', bosses); write('tilesets.json', tilesets); write('audio.json', audio);
  for (const m of allMaps) writeFileSync(join(DATA, 'maps', `${m.id}.json`), JSON.stringify(m, null, 1) + '\n');
  const ids = allMaps.map((m) => m.id);
  writeFileSync(join(DATA, 'maps', 'index.ts'), `// Generated by tools/world-gen/build-world.ts — every map file in this folder.\n${ids.map((id, i) => `import m${i} from './${id}.json';`).join('\n')}\n\nexport const MAP_FILES = [${ids.map((_, i) => `m${i}`).join(', ')}];\n`);

  const objectKinds = new Map(read('objects.json').map((o: J) => [o.id, o]));
  const tiles = new Map(read('tiles.json').tiles.map((t: J) => [t.id, t]));
  const fakeData = { objectKinds, tiles } as never;
  let problems = 0;
  for (const m of allMaps) {
    const cm = compileMap(fakeData, m as never);
    const ok = (x: number, y: number) => cm.reachable[y * cm.width + x] === 1;
    const near = (x: number, y: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ok(x + dx, y + dy));
    const bad: string[] = [];
    for (const [k, sp] of Object.entries(m.spawnPoints) as [string, J][]) if (!ok(sp.x, sp.y)) bad.push(`spawn ${k}`);
    for (const p of m.portals) { let any = false; for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) any ||= near(x, y); if (!any) bad.push(`portal ${p.id}`); }
    for (const n of m.npcs) if (!near(n.x, n.y + 1) && !near(n.x, n.y - 1) && !near(n.x + 1, n.y) && !near(n.x - 1, n.y)) bad.push(`npc ${n.npcId}`);
    if (m.bossSpawn && !near(m.bossSpawn.x, m.bossSpawn.y)) bad.push('boss');
    const reach = cm.reachable.reduce((a: number, v: number) => a + v, 0);
    if (bad.length) { problems++; console.log(`✘ ${m.id}: ${bad.join(', ')}`); }
    else console.log(`✔ ${m.id.padEnd(24)} ${m.type.padEnd(8)} ${m.width}×${m.height} walkable ${reach}`);
  }
  console.log(`\n${allMaps.length} maps, ${monsters.length} monsters, ${items.length} items, ${npcs.length} NPCs, ${bosses.length} bosses${problems ? `, ${problems} MAPS WITH PROBLEMS` : ''}`);
  if (problems) process.exitCode = 1;
}
