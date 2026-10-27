// Shared data model for Veyloria Online.
// Static game data (definitions) is kept separate from player data (state).

export type Element =
  | 'neutral' | 'fire' | 'water' | 'wind' | 'earth'
  | 'holy' | 'shadow' | 'poison' | 'undead';

export const ELEMENTS: Element[] = [
  'neutral', 'fire', 'water', 'wind', 'earth', 'holy', 'shadow', 'poison', 'undead',
];

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
export type BaseStats = Record<StatKey, number>;

export type StatusId =
  | 'poison' | 'burn' | 'freeze' | 'stun' | 'silence'
  | 'slow' | 'blind' | 'bleed' | 'sleep' | 'curse';

export type Direction = 'down' | 'up' | 'left' | 'right';

// ---------------------------------------------------------------- modifiers
/** Flat or percent bonuses granted by equipment, buffs, passives, cards, runes. */
export interface StatModifiers {
  str?: number; agi?: number; vit?: number; int?: number; dex?: number; luk?: number;
  maxHp?: number; maxMp?: number; maxHpPct?: number; maxMpPct?: number;
  patk?: number; matk?: number; patkPct?: number; matkPct?: number;
  pdef?: number; mdef?: number; pdefPct?: number;
  hit?: number; flee?: number; crit?: number; critDmg?: number;
  aspdPct?: number; moveSpeedPct?: number; castTimePct?: number; cdrPct?: number;
  hpRegen?: number; mpRegen?: number;
  /** % bonus damage by element of the attack. */
  elementDamagePct?: Partial<Record<Element, number>>;
  /** % damage reduction against attacks of an element. */
  elementResistPct?: Partial<Record<Element, number>>;
  weightLimit?: number;
  attackRange?: number;
  /** % chance to counter a melee hit with a basic attack. */
  counterChance?: number;
  /** % of incoming damage redirected to MP. */
  damageToMpPct?: number;
  /** >0 = hidden from monsters until the holder attacks. */
  stealth?: number;
}

// ---------------------------------------------------------------- classes
export interface JobClassDef {
  id: string;
  name: string;
  tier: 0 | 1 | 2;
  role: string;
  description: string;
  parent?: string;
  maxJobLevel: number;
  hpPerLevel: number;
  mpPerLevel: number;
  baseAttackIntervalMs: number;
  weaponTypes: string[];
  skills: string[];
  /** Requirements to change into this job. */
  requirements?: { jobLevel?: number; baseLevel?: number; fromClass?: string; questId?: string };
  outfit: { primary: string; secondary: string; accent: string; style: string };
}

// ---------------------------------------------------------------- skills
export type SkillTargeting = 'enemy' | 'self' | 'ground' | 'ally' | 'passive';

export type SkillEffect =
  | { type: 'damage'; kind: 'physical' | 'magic'; multiplier: number; perLevel: number;
      element?: Element | 'weapon'; hits?: number; radius?: number; ignoreDefPct?: number; alwaysHit?: boolean }
  | { type: 'heal'; base: number; perLevel: number; intScale: number; radius?: number }
  | { type: 'status'; status: StatusId; chance: number; perLevel?: number; durationMs: number; radius?: number }
  | { type: 'buff'; buffId: string; durationMs: number; perLevelMs?: number; mods: StatModifiers;
      modsPerLevel?: StatModifiers; radius?: number; flags?: string[] }
  | { type: 'knockback'; distance: number }
  | { type: 'taunt'; radius: number }
  | { type: 'groundZone'; zoneId: string; durationMs: number; radius: number; tickMs: number;
      kind: 'physical' | 'magic'; multiplier: number; perLevel: number; element: Element;
      status?: StatusId; statusChance?: number; statusDurationMs?: number }
  | { type: 'dash'; distance: number }
  | { type: 'line'; length: number; width: number };

export interface SkillDef {
  id: string;
  name: string;
  classId: string;
  description: string;
  kind: 'active' | 'passive' | 'buff' | 'ultimate';
  targeting: SkillTargeting;
  maxLevel: number;
  range: number;
  mpCost: number;
  mpCostPerLevel: number;
  castTimeMs: number;
  cooldownMs: number;
  element?: Element;
  requires?: { skillId: string; level: number }[];
  requiresJobLevel?: number;
  /** Weapon types required to use the skill (e.g. bows for archery skills). */
  requiresWeapon?: string[];
  /** Passive bonuses applied permanently per skill level. */
  passive?: StatModifiers;
  effects: SkillEffect[];
  fx: string;
  icon: { glyph: string; color: string };
}

// ---------------------------------------------------------------- items
export type EquipSlot =
  | 'weapon' | 'armor' | 'headgear' | 'shield' | 'garment' | 'boots' | 'accessory1' | 'accessory2';
export const EQUIP_SLOTS: EquipSlot[] = [
  'weapon', 'armor', 'headgear', 'shield', 'garment', 'boots', 'accessory1', 'accessory2',
];

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'consumable' | 'equipment' | 'material' | 'quest' | 'card' | 'misc';

export type UseEffect =
  | { type: 'heal'; hp?: number; mp?: number; hpPct?: number; mpPct?: number }
  | { type: 'cure'; statuses: StatusId[] }
  | { type: 'buff'; buffId: string; durationMs: number; mods: StatModifiers }
  | { type: 'returnToSave' }
  | { type: 'resetStats' }
  | { type: 'resetSkills' };

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  description: string;
  weight: number;
  price: number;
  stackable: boolean;
  maxStack: number;
  bound?: boolean;
  icon: { shape: string; color: string; accent?: string };
  // equipment
  slot?: 'weapon' | 'armor' | 'headgear' | 'shield' | 'garment' | 'boots' | 'accessory';
  weaponType?: string;
  twoHanded?: boolean;
  attackKind?: 'melee' | 'ranged' | 'magic';
  attackRange?: number;
  attackIntervalPct?: number;
  element?: Element;
  equipLevel?: number;
  classes?: string[];
  mods?: StatModifiers;
  cardSlots?: number;
  // consumables
  use?: UseEffect[];
  cooldownMs?: number;
}

export interface ItemInstance {
  uid: string;
  itemId: string;
  qty: number;
  refine?: number;
  cards?: string[];
  locked?: boolean;
  bound?: boolean;
}

// ---------------------------------------------------------------- monsters
export type AiType = 'passive' | 'aggressive' | 'assist' | 'ranged' | 'magic' | 'elite' | 'boss';

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  element: Element;
  race: string;
  size: 'small' | 'medium' | 'large';
  maxHp: number;
  attack: number;
  magicAttack?: number;
  defense: number;
  magicDefense?: number;
  hit?: number;
  flee?: number;
  exp: number;
  jobExp: number;
  attackRange: number;
  attackIntervalMs: number;
  moveSpeed: number;
  aggroRange?: number;
  leashRange?: number;
  aiType: AiType;
  /** Optional extra behaviour flags (e.g. assist for passive slimes). */
  aiFlags?: string[];
  respawnSeconds: number;
  dropTableId: string;
  projectile?: { element: Element; color: string };
  onHitStatus?: { status: StatusId; chance: number; durationMs: number };
  statusImmune?: StatusId[];
  bossId?: string;
  art: { shape: string; w: number; h: number; colors: string[]; scale?: number };
  collisionRadius: number;
}

export interface DropEntry { itemId: string; chance: number; min?: number; max?: number }
export interface DropTable { id: string; entries: DropEntry[]; luma?: [number, number] }

export interface BossSkillDef {
  id: string;
  name: string;
  kind: 'circle' | 'cone' | 'self_circle' | 'summon' | 'charge' | 'ring';
  telegraphMs: number;
  radius?: number;
  multiplier?: number;
  element?: Element;
  status?: { status: StatusId; chance: number; durationMs: number };
  summon?: { monsterId: string; count: number };
  cooldownMs: number;
  minPhase: number;
  fx: string;
}

export interface BossDef {
  id: string;
  monsterId: string;
  title: string;
  intro: string;
  phases: { hpPct: number; name: string; atkMul: number; speedMul: number; message: string }[];
  enrage: { afterMs: number; hpPct: number; atkMul: number; aspdMul: number };
  skills: BossSkillDef[];
  contributionRewards: { minDamagePct: number; items: { itemId: string; qty: number }[]; luma: number };
}

// ---------------------------------------------------------------- statuses / buffs
export interface StatusDef {
  id: StatusId;
  name: string;
  description: string;
  defaultDurationMs: number;
  stackLimit: number;
  /** Damage over time: fraction of max HP per tick, plus flat amount. */
  dot?: { pctMaxHp: number; flat: number; tickMs: number; element: Element; canKill: boolean };
  preventsMove?: boolean;
  preventsAction?: boolean;
  preventsSkills?: boolean;
  breaksOnDamage?: boolean;
  mods?: StatModifiers;
  /** Stat that reduces chance & duration: chance *= (1 - stat * resistPerPoint). */
  resistStat?: StatKey;
  resistPerPoint?: number;
  /** Elements/races immune to it. */
  immuneElements?: Element[];
  curedBy: string[];
  color: string;
}

// ---------------------------------------------------------------- maps
export interface Rect { x: number; y: number; w: number; h: number }

export type PaintOp =
  | { op: 'rect'; tile: string; x: number; y: number; w: number; h: number; layer?: 'ground' | 'deco' | 'wall' }
  | { op: 'path'; tile: string; points: [number, number][]; width: number }
  | { op: 'building'; x: number; y: number; w: number; h: number; style: string; door?: number; sign?: string }
  | { op: 'object'; kind: string; x: number; y: number; id?: string }
  | { op: 'fence'; x: number; y: number; length: number; dir: 'h' | 'v' }
  | { op: 'clear'; x: number; y: number; w: number; h: number }
  | { op: 'scatter'; kind: string; area?: Rect; density: number; seed: number }
  | { op: 'blob'; tile: string; cx: number; cy: number; rx: number; ry: number; layer?: 'ground' | 'wall'; seed?: number };

export interface PortalDef {
  id: string;
  x: number; y: number; w: number; h: number;
  targetMap: string;
  targetSpawn: string;
  label: string;
}

export interface MonsterSpawnDef {
  monsterId: string;
  count: number;
  area: Rect;
}

export interface MapObjectDef {
  id: string;
  kind: string;
  x: number; y: number;
  name: string;
  interact?: { text: string; questFlag?: string; giveItem?: { itemId: string; qty: number } };
}

export interface MapDef {
  id: string;
  name: string;
  region: string;
  type: 'town' | 'field' | 'dungeon' | 'boss';
  levelRange?: [number, number];
  width: number;
  height: number;
  tileset: string;
  base: string;
  border: { kind: string; thickness: number };
  bgm: string;
  ambient: string;
  weather: string[];
  isSavePoint?: boolean;
  worldMapPos: { x: number; y: number };
  paint: PaintOp[];
  portals: PortalDef[];
  spawnPoints: Record<string, { x: number; y: number }>;
  npcs: { npcId: string; x: number; y: number; facing?: Direction }[];
  monsterSpawns: MonsterSpawnDef[];
  bossSpawn?: { bossId: string; x: number; y: number; respawnSeconds: number };
  objects: MapObjectDef[];
  areas: { id: string; name: string; rect: Rect }[];
}

export interface TileDef {
  id: string;
  layer: 'ground' | 'deco' | 'wall' | 'above';
  walkable: boolean;
  draw: string;
}

export interface TilesetDef {
  id: string;
  name: string;
  palette: Record<string, string>;
}

/** World object kinds: trees, rocks, crates... Rendered y-sorted, block a footprint. */
export interface ObjectKindDef {
  id: string;
  footprint: { w: number; h: number };
  blocks: boolean;
  draw: string;
  spriteW: number;
  spriteH: number;
}

// ---------------------------------------------------------------- npcs & quests
export interface NpcDef {
  id: string;
  name: string;
  title: string;
  appearance: Appearance;
  outfit: { primary: string; secondary: string; accent: string; style: string };
  greeting: string[];
  services: NpcService[];
}

export type NpcService =
  | { type: 'shop'; shopId: string; label?: string }
  | { type: 'storage' }
  | { type: 'heal'; cost: number }
  | { type: 'jobChange'; classIds: string[] }
  | { type: 'refine' }
  | { type: 'warp'; destinations: { mapId: string; spawn: string; cost: number }[] }
  | { type: 'resetStats'; cost: number }
  | { type: 'resetSkills'; cost: number }
  | { type: 'save' };

export interface ShopDef { id: string; name: string; items: string[] }

export type QuestObjective =
  | { type: 'talk'; npcId: string; label: string }
  | { type: 'kill'; monsterId: string; count: number; label: string }
  | { type: 'collect'; itemId: string; count: number; label: string }
  | { type: 'deliver'; itemId: string; count: number; npcId: string; label: string }
  | { type: 'explore'; mapId: string; areaId?: string; label: string }
  | { type: 'defeatBoss'; bossId: string; label: string }
  | { type: 'interact'; objectId: string; label: string }
  | { type: 'craft'; itemId: string; count: number; label: string }
  | { type: 'buy'; slot?: EquipSlot; itemId?: string; label: string }
  | { type: 'equip'; slot: EquipSlot; label: string }
  | { type: 'refine'; level: number; label: string }
  | { type: 'reachLevel'; jobLevel?: number; baseLevel?: number; label: string };

export interface QuestDef {
  id: string;
  name: string;
  category: 'tutorial' | 'main' | 'side' | 'job' | 'daily' | 'event';
  chapter?: number;
  giverNpc: string;
  turnInNpc: string;
  summary: string;
  prerequisites: { quests?: string[]; baseLevel?: number; jobLevel?: number; classes?: string[]; notClasses?: string[] };
  objectives: QuestObjective[];
  rewards: { exp?: number; jobExp?: number; luma?: number; items?: { itemId: string; qty: number }[]; jobChange?: string; flags?: string[] };
  dialogue: { offer: string[]; progress: string[]; complete: string[] };
  repeatable?: 'daily';
  /** Items consumed on turn-in (defaults to collect/deliver objectives). */
  consumeItems?: boolean;
}

// ---------------------------------------------------------------- player state
export interface Appearance {
  body: 'a' | 'b';
  hairStyle: 'short' | 'long' | 'spiky' | 'ponytail' | 'bob';
  hairColor: string;
  eyeColor: string;
  skinTone: string;
}

export type QuestStatus = 'active' | 'ready' | 'completed';
export interface QuestProgress {
  questId: string;
  status: QuestStatus;
  counts: number[];
  acceptedAt: number;
  completedAt?: number;
}

export interface HotbarSlot { type: 'skill' | 'item'; id: string }

export interface CharacterState {
  id: string;
  name: string;
  createdAt: number;
  appearance: Appearance;
  classId: string;
  classHistory: string[];
  baseLevel: number;
  jobLevel: number;
  baseExp: number;
  jobExp: number;
  statPoints: number;
  skillPoints: number;
  stats: BaseStats;
  skills: Record<string, number>;
  hp: number;
  mp: number;
  luma: number;
  inventory: ItemInstance[];
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  storage: ItemInstance[];
  quests: Record<string, QuestProgress>;
  flags: Record<string, boolean | number | string>;
  position: { mapId: string; x: number; y: number };
  savePoint: { mapId: string; spawn: string };
  hotbar: (HotbarSlot | null)[];
  stats_meta: { kills: number; deaths: number; playTimeMs: number; bossKills: Record<string, number> };
}

export interface Settings {
  volume: { master: number; music: number; sfx: number; ambient: number };
  keybinds: Record<string, string>;
  showDamageNumbers: boolean;
  autoLoot: boolean;
  showCollision: boolean;
  wasdMovement: boolean;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  account: { id: string; name: string; createdAt: number; maxSlots: number };
  characters: (CharacterState | null)[];
  settings: Settings;
}

export interface DerivedStats {
  maxHp: number; maxMp: number;
  patk: number; matk: number; pdef: number; mdef: number;
  hit: number; flee: number; crit: number; critDmg: number;
  attackIntervalMs: number; moveSpeed: number;
  castTimeMul: number; cdrPct: number;
  hpRegen: number; mpRegen: number;
  attackRange: number; attackKind: 'melee' | 'ranged' | 'magic';
  weaponElement: Element;
  weightLimit: number;
  elementDamagePct: Partial<Record<Element, number>>;
  elementResistPct: Partial<Record<Element, number>>;
  totalStats: BaseStats;
}
