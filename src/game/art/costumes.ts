// Job costumes for the character sprites: original chibi designs in the spirit of classic 2D
// MMORPGs (big head, short body, soft three-tone shading, dark outline). Every job line has its own
// outfit and headgear; transcendent (High) jobs add gold trim and capes, third jobs go further.
// Colours come from the class outfit (primary / secondary / accent).

export type Torso = 'tunic' | 'plate' | 'robe' | 'vest' | 'coat' | 'apron' | 'gi' | 'suit' | 'labcoat' | 'frock' | 'tabard';
export type Legs = 'pants' | 'shorts' | 'robe' | 'skirt';
export type Head = 'none' | 'cap' | 'feather_cap' | 'pointed_hat' | 'wide_hat' | 'mitre' | 'hood' | 'bandana' | 'goggles' | 'circlet'
  | 'horn_helm' | 'beret' | 'headband' | 'beast_hood' | 'mortar' | 'crown' | 'tricorn' | 'glasses';
export type Arms = 'sleeve' | 'short' | 'bare' | 'gauntlet' | 'wrap';

export interface Costume {
  torso: Torso;
  legs: Legs;
  head: Head;
  arms: Arms;
  cape?: 'short' | 'long';
  /** Cape colour: a slot of the outfit or a hex colour. */
  capeColor?: 'primary' | 'secondary' | 'accent' | string;
  pauldrons?: 'round' | 'wing' | 'fur';
  mask?: boolean;
  scarf?: boolean;
  emblem?: 'cross' | 'star' | 'gem' | 'flame';
  belt?: boolean;
  bag?: boolean;
  beads?: boolean;
  collar?: boolean;
  /** Gold edging (transcendent jobs). */
  trim?: boolean;
}

const C = (c: Costume) => c;
const BASE: Record<string, Costume> = {
  novice: C({ torso: 'tunic', legs: 'shorts', head: 'none', arms: 'short', bag: true, belt: true }),
  knight: C({ torso: 'plate', legs: 'pants', head: 'none', arms: 'gauntlet', cape: 'short', capeColor: 'primary', pauldrons: 'round', belt: true }),
  dragoon: C({ torso: 'plate', legs: 'pants', head: 'horn_helm', arms: 'gauntlet', cape: 'long', capeColor: 'primary', pauldrons: 'wing', belt: true }),
  templar: C({ torso: 'tabard', legs: 'pants', head: 'circlet', arms: 'gauntlet', cape: 'long', capeColor: 'secondary', pauldrons: 'round', emblem: 'cross' }),
  ranger: C({ torso: 'vest', legs: 'pants', head: 'feather_cap', arms: 'sleeve', cape: 'short', capeColor: 'primary', belt: true, bag: true }),
  beastmaster: C({ torso: 'vest', legs: 'pants', head: 'beast_hood', arms: 'wrap', cape: 'short', capeColor: 'secondary', pauldrons: 'fur', belt: true }),
  minstrel: C({ torso: 'frock', legs: 'pants', head: 'beret', arms: 'sleeve', cape: 'short', capeColor: 'accent', scarf: true }),
  mage: C({ torso: 'robe', legs: 'robe', head: 'hood', arms: 'sleeve', cape: 'short', capeColor: 'secondary', collar: true, emblem: 'gem' }),
  sorcerer: C({ torso: 'robe', legs: 'robe', head: 'wide_hat', arms: 'sleeve', cape: 'long', capeColor: 'secondary', collar: true, emblem: 'flame' }),
  sage: C({ torso: 'robe', legs: 'robe', head: 'mortar', arms: 'sleeve', cape: 'short', capeColor: 'secondary', scarf: true, emblem: 'gem', bag: true }),
  cleric: C({ torso: 'robe', legs: 'robe', head: 'none', arms: 'sleeve', collar: true, emblem: 'cross', beads: true }),
  bishop: C({ torso: 'robe', legs: 'robe', head: 'mitre', arms: 'sleeve', cape: 'long', capeColor: 'accent', emblem: 'cross', collar: true }),
  ascetic: C({ torso: 'gi', legs: 'pants', head: 'headband', arms: 'wrap', beads: true, belt: true }),
  rogue: C({ torso: 'coat', legs: 'pants', head: 'bandana', arms: 'short', mask: true, belt: true }),
  shadowblade: C({ torso: 'suit', legs: 'pants', head: 'hood', arms: 'wrap', mask: true, scarf: true }),
  outlaw: C({ torso: 'coat', legs: 'pants', head: 'tricorn', arms: 'sleeve', scarf: true, belt: true, bag: true }),
  merchant: C({ torso: 'apron', legs: 'pants', head: 'cap', arms: 'short', bag: true, belt: true }),
  artisan: C({ torso: 'apron', legs: 'pants', head: 'goggles', arms: 'bare', belt: true }),
  alchemist: C({ torso: 'labcoat', legs: 'pants', head: 'glasses', arms: 'sleeve', bag: true, belt: true }),
};

/** Third jobs: their second job's outfit, finer. */
const THIRD: Record<string, [string, Partial<Costume>]> = {
  dragon_lord: ['dragoon', { head: 'horn_helm', cape: 'long' }],
  high_templar: ['templar', { head: 'crown' }],
  wildlord: ['beastmaster', { cape: 'long' }],
  maestro: ['minstrel', { cape: 'long' }],
  archsorcerer: ['sorcerer', {}],
  archsage: ['sage', { cape: 'long' }],
  archbishop: ['bishop', {}],
  grandmaster: ['ascetic', { cape: 'short', capeColor: 'secondary' }],
  shadow_reaper: ['shadowblade', { cape: 'long', capeColor: 'secondary' }],
  phantom_outlaw: ['outlaw', { cape: 'long', capeColor: 'secondary', mask: true }],
  mastersmith: ['artisan', { cape: 'short', capeColor: 'secondary' }],
  grand_alchemist: ['alchemist', { cape: 'long', capeColor: 'primary' }],
};

/** Outfit styles of NPCs (no job) map onto the nearest job look. */
const BY_STYLE: Record<string, string> = { tunic: 'novice', plate: 'knight', hood: 'ranger', robe: 'mage', coat: 'rogue', apron: 'merchant' };

export function costumeFor(costumeId: string | undefined, style: string): Costume {
  if (costumeId && BASE[costumeId]) return BASE[costumeId];
  if (costumeId && THIRD[costumeId]) { const [base, extra] = THIRD[costumeId]; return { ...BASE[base], ...extra, trim: true }; }
  // Transcendent first jobs (high_knight…): the first job's outfit with gold trim and a cape.
  if (costumeId?.startsWith('high_')) {
    const base = BASE[costumeId.slice(5)];
    if (base) return { ...base, trim: true, cape: base.cape ?? 'short', capeColor: base.capeColor ?? 'secondary' };
  }
  return BASE[BY_STYLE[style] ?? 'novice'];
}

export const COSTUME_IDS = [...Object.keys(BASE), ...Object.keys(THIRD)];
