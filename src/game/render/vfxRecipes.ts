import type { SkillDef } from '../../core/types';
import { VFX_SHEETS } from './vfxArt';

// Skill visual effects: animated sprite sheets (vfxArt.ts) combined into a recipe per skill —
// what plays on the caster, what flies to the target and what bursts where it lands.
//
// Recipe steps are written as short strings: `sheet@where` plus modifiers
//   where: self | target | area (scattered in the skill radius) | line (caster → target) | row (across the target)
//   *n  count     +ms  delay     ~ms  stagger between copies     xS  scale     =ms  how long looping sheets stay
//   #rrggbb  colour (default: the skill's icon colour)     !  rotate toward the target
//   _  drawn on the ground under the characters     ^  falls from the sky     >sheet  plays where it lands

export type At = 'self' | 'target' | 'area' | 'line' | 'row';
export interface VfxStep { s: string; at: At; n: number; d: number; stag: number; sc: number; ms?: number; c?: string; rot: boolean; under: boolean; fall: boolean; then?: string }
export interface SkillVfx { cast: VfxStep[]; proj?: { s: string; n: number; stag: number; sc: number; c?: string }; hit: VfxStep[]; shake: number }

export function parseStep(src: string): VfxStep {
  const m = /^(\w+)@(self|target|area|line|row)(.*)$/.exec(src.trim());
  if (!m || !VFX_SHEETS[m[1]]) throw new Error(`bad vfx step "${src}"`);
  const st: VfxStep = { s: m[1], at: m[2] as At, n: 1, d: 0, stag: 0, sc: 1, rot: false, under: false, fall: false };
  const rest = m[3].replace(/([*+~x=])([0-9.]+)|#([0-9a-f]{6})|>([a-z_]+)|([!_^])/g, (_all, k?: string, v?: string, col?: string, then?: string, flag?: string) => {
    if (flag === '!') st.rot = true; else if (flag === '_') st.under = true; else if (flag === '^') st.fall = true;
    else if (col) st.c = `#${col}`;
    else if (then) { if (!VFX_SHEETS[then]) throw new Error(`bad vfx sheet "${then}"`); st.then = then; }
    else if (k === '*') st.n = Number(v); else if (k === '+') st.d = Number(v); else if (k === '~') st.stag = Number(v);
    else if (k === 'x') st.sc = Number(v); else if (k === '=') st.ms = Number(v);
    return '';
  });
  if (rest.trim()) throw new Error(`bad vfx step "${src}"`);
  return st;
}
const steps = (s?: string) => (s ? s.split(';').filter((x) => x.trim()).map(parseStep) : []);

interface Raw { c?: string; p?: string; h?: string; k?: number }
/** One recipe per active skill. */
const RECIPES: Record<string, Raw> = {
  first_aid: { c: 'rise@self; ring@selfx0.5' },
  // Knight / Dragoon / Templar lines
  bash: { h: 'slash@target; burst@target+60x0.8', k: 1 },
  provoke: { c: 'ring@self', h: 'burst@targetx0.6; ring@targetx0.6+80' },
  shield_guard: { c: 'shield@self; ring@selfx0.5' },
  spiral_pierce: { c: 'pierce@self!', h: 'whirl@targetx0.5+80; burst@target+80' },
  war_cry: { c: 'ring@self; ring@self+150; aura@self' },
  counter_attack: { c: 'cross@selfx0.7; aura@self' },
  blade_storm: { c: 'whirl@selfx1.3; whirl@self+220x1.1; ring@self; slash@area*6~60', k: 2 },
  impale: { c: 'pierce@self!', h: 'burst@target+70' },
  drake_sweep: { c: 'whirl@self; ring@self; slash@area*3~70', k: 1 },
  war_banner: { c: 'aura@self; ring@self; pillar@selfx0.5' },
  iron_hide: { c: 'shield@self; aura@self#a0a8b8' },
  skewer_line: { c: 'pierce@line*3~60!', h: 'burst@target+120' },
  sky_dive: { h: 'pillar@target; explode@target+250x0.9; ring@target+250; spikes@target+250x0.8', k: 3 },
  holy_bulwark: { c: 'shield@self; holycross@selfx0.6' },
  shield_bash: { h: 'burst@target; ring@targetx0.4' },
  sacred_strike: { h: 'holycross@target; slash@target+120' },
  devotion_aura: { c: 'aura@self; circle@self_=1400' },
  judgement_cross: { c: 'holycross@selfx1.2; cross@selfx1.5+150; ring@self+150', k: 1 },
  provoking_vow: { c: 'ring@self; ring@self+150; burst@selfx0.6' },
  heavens_shield: { c: 'pillar@self; shield@selfx1.3+120; circle@self_=1600; rise@self' },
  dragon_fury: { c: 'aura@self; flame@self; ring@self' },
  wyrm_spiral: { c: 'pierce@self!', h: 'whirl@targetx0.6+60; burst@target+60' },
  martyrs_grace: { c: 'pillar@self; shield@self+120' },
  divine_lance: { c: 'pierce@self!x1.2', h: 'holycross@target+60; pillar@targetx0.6+60' },
  // Ranger / Beastmaster / Minstrel lines
  double_shot: { p: 'arrow*2~90', h: 'hit@target; hit@target+90' },
  arrow_rain: { h: 'arrow@area*14~40^>hit; ring@targetx0.8' },
  falcon_strike: { p: 'bird', h: 'claw@target; burst@targetx0.7' },
  wind_trap: { h: 'circle@target_=1200; wind@target' },
  rapid_fire: { c: 'wind@selfx0.7; aura@self' },
  camouflage: { c: 'smoke@self; tendrils@selfx0.6' },
  piercing_arrow: { p: 'arrowx1.5', h: 'pierce@line*3~50!; burst@target' },
  blitz_falcon: { p: 'bird*2~120', h: 'claw@target; burst@target+120' },
  snare_trap: { h: 'circle@target_=1200; spikes@targetx0.5' },
  blast_trap: { h: 'circle@target_=500; explode@target+300x0.8' },
  keen_senses: { c: 'rise@self; ring@selfx0.6' },
  tri_shot: { p: 'arrow*3~70', h: 'hit@target; hit@target+70; hit@target+140' },
  falcon_storm: { h: 'bird@area*6~90^>claw; ring@target', k: 1 },
  song_of_haste: { c: 'notes@self; wind@selfx0.6' },
  song_of_vigor: { c: 'notes@self; rise@self' },
  song_of_fortune: { c: 'notes@self; coins@selfx0.6' },
  discord: { c: 'notes@selfx1.2; ring@self; ring@self+150' },
  melody_strike: { p: 'orb', h: 'notes@target; burst@targetx0.7' },
  lullaby_zone: { h: 'circle@target_=1500; notes@area*4~120' },
  grand_finale: { c: 'notes@selfx1.4; ring@self; pillar@self; burst@area*6~80', k: 2 },
  wolf_pack: { h: 'claw@area*4~90; burst@target+300' },
  true_sight: { c: 'rise@self; ring@selfx0.6' },
  symphony: { c: 'notes@selfx1.3; ring@self; rise@self' },
  sonic_wave: { c: 'wind@line*3~60!', h: 'notes@target+120' },
  // Mage / Sorcerer / Sage lines
  fire_bolt: { p: 'orb*3~80#ff6a2e', h: 'explode@targetx0.45; explode@target+80x0.4; explode@target+160x0.45' },
  ice_bolt: { p: 'shard*3~80', h: 'spikes@targetx0.45; burst@target+80x0.7' },
  lightning_bolt: { h: 'bolt@target; bolt@target+120; burst@target+60' },
  fire_wall: { h: 'flame@row*5~40' },
  frost_nova: { c: 'ring@selfx1.2; spikes@area*6~30x0.5; burst@self' },
  thunderstorm: { h: 'circle@target_=1000; bolt@area*8~90' },
  meteor: { h: 'meteor@area*6~150^>explode; ring@target+600', k: 3 },
  mana_shield: { c: 'shield@self; circle@self_=900' },
  storm_gust: { h: 'circle@target_=1600; tornado@area*3~200; spikes@area*4~150x0.5' },
  lord_of_vermilion: { h: 'circle@target_=1200#ff8a5a; bolt@area*10~70; ring@target+300', k: 2 },
  heavens_drive: { h: 'spikes@area*5~60', k: 1 },
  ice_wall: { h: 'spikes@row*4~50x0.6' },
  sightrasher: { c: 'explode@area*8~40x0.45; ring@self', k: 1 },
  mana_well: { c: 'circle@self_=1200; rise@self' },
  meteor_storm: { h: 'meteor@area*10~110^>explode; ring@target+700', k: 3 },
  endow_fire: { c: 'flame@self; aura@self' },
  endow_water: { c: 'aura@self; rise@self' },
  endow_wind: { c: 'wind@selfx0.7; aura@self' },
  endow_earth: { c: 'spikes@selfx0.5; aura@self' },
  double_cast: { c: 'circle@self_=900; burst@selfx0.6; burst@self+150x0.6' },
  earth_spike_volley: { h: 'spikes@target; spikes@target+150x0.7', k: 1 },
  elemental_cataclysm: { h: 'circle@target_=1600; explode@area*4~120x0.7; bolt@area*4~110#fff27a; spikes@area*3~130#c8a060; tornado@target+300#b6f0d0', k: 3 },
  mystic_amplify: { c: 'circle@self_=1200; aura@self' },
  napalm_vulcan: { p: 'orb*3~90', h: 'burst@target; burst@target+90; burst@target+180; tendrils@targetx0.6+100' },
  endow_holy: { c: 'pillar@selfx0.6; aura@self' },
  foresight: { c: 'circle@self_=1000; rise@self' },
  // Cleric / Bishop / Ascetic lines
  holy_light: { p: 'orbx0.8', h: 'holycross@targetx0.7; burst@targetx0.7' },
  heal: { c: 'circle@self_=900; rise@self; pillar@selfx0.6' },
  benediction: { c: 'pillar@self; rise@self' },
  swift_grace: { c: 'wind@selfx0.6; rise@self' },
  aegis_hymn: { c: 'shield@self; notes@self' },
  purify: { c: 'pillar@selfx0.6; rise@self' },
  sanctum_nova: { h: 'circle@target_=1500; pillar@area*4~120; holycross@target+200', k: 1 },
  greater_heal: { c: 'circle@self_=1200; pillar@self; rise@self' },
  kyrie: { c: 'shield@self; holycross@selfx0.5' },
  magnificat: { c: 'circle@self_=1200; notes@self; rise@self' },
  lex_divina: { h: 'holycross@targetx0.6; smoke@target+150' },
  turn_undead: { h: 'pillar@target; holycross@target+100; burst@target+200' },
  sanctuary: { c: 'circle@self_=2000; rise@area*4~150' },
  magnus_judgement: { h: 'circle@target_=1600; holycross@area*4~120; pillar@target+300', k: 2 },
  assumptio: { c: 'pillar@self; shield@self+120; rise@self' },
  spirit_spheres: { c: 'orb@area*5~60; aura@self' },
  triple_blow: { h: 'fist@targetx0.7; fist@target+100x0.7; fist@target+200x0.9' },
  chain_combo: { h: 'fist@area*4~80x0.7' },
  steel_body: { c: 'shield@self#a0a8b8; aura@self' },
  ki_explosion: { c: 'fist@selfx1.3; ring@self; burst@self', k: 1 },
  body_relocation: { c: 'smoke@self; wind@selfx0.6' },
  asura_strike: { h: 'fist@targetx1.6; explode@target+120; ring@target+120; crit@target+120', k: 4 },
  tiger_cannon: { h: 'fist@targetx1.4; explode@target+100x0.8; ring@target+100', k: 3 },
  root_of_mountain: { c: 'spikes@selfx0.6; shield@self' },
  // Rogue / Shadowblade / Outlaw lines
  pilfer: { h: 'coins@targetx0.6; smoke@target' },
  shadow_veil: { c: 'smoke@self; tendrils@selfx0.7' },
  venom_edge: { h: 'claw@target; cloud@targetx0.5+100' },
  grit_toss: { h: 'cloud@targetx0.6; hit@target' },
  knife_throw: { p: 'shard', h: 'hit@target' },
  antidote: { c: 'rise@self' },
  hundred_cuts: { h: 'slash@area*8~45x0.6; crit@target+400', k: 1 },
  cloak_of_shadows: { c: 'smoke@self; tendrils@self' },
  sonic_blade: { h: 'cross@target; slash@target+80' },
  venom_spray: { h: 'cloud@target; cloud@area*2~120x0.7' },
  enchant_poison: { c: 'aura@self; cloud@selfx0.5' },
  grimtooth: { h: 'spikes@line*4~60x0.5' },
  assassin_edge: { c: 'aura@self; cross@selfx0.6' },
  soul_reap: { h: 'tendrils@target; claw@target+150; crit@target+250', k: 2 },
  snatch: { h: 'coins@targetx0.6; smoke@target' },
  rob_luma: { h: 'coins@target; slash@target+60' },
  strip_armor: { h: 'burst@target; cross@targetx0.6+60' },
  backstab: { h: 'smoke@target; slash@target+80; crit@target+120' },
  tunnel_drive: { c: 'smoke@self; tendrils@selfx0.6' },
  arrow_storm_rogue: { h: 'arrow@area*16~35^>hit' },
  plagiarism: { c: 'smoke@self', h: 'tendrils@target; burst@target+150' },
  meteor_assault: { c: 'tendrils@self; whirl@self; ring@self; crit@area*4~70', k: 2 },
  enchant_deadly_poison: { c: 'aura@self; cloud@selfx0.6' },
  full_strip: { h: 'cross@target; burst@target+80; smoke@target+120' },
  shadow_bounce: { p: 'shard*2~90', h: 'claw@target; smoke@target+90' },
  // Merchant / Artisan / Alchemist lines
  coin_strike: { h: 'coins@target; slash@target+60' },
  cart_sweep: { h: 'whirl@targetx0.7; burst@target', k: 1 },
  market_shout: { c: 'ring@self; coins@selfx0.6' },
  golden_ruin: { h: 'coins@targetx1.3; explode@target+150x0.8; crit@target+150', k: 2 },
  adrenaline_rush: { c: 'aura@self; wind@selfx0.6' },
  power_thrust: { c: 'aura@self; burst@selfx0.6' },
  weapon_perfection: { c: 'aura@self; rise@self' },
  hammerfall: { c: 'ring@self; spikes@selfx0.7; burst@self', k: 2 },
  cart_crash: { h: 'whirl@targetx0.6; burst@target; crit@target+80', k: 1 },
  meltdown: { c: 'flame@self; aura@self; ring@self' },
  maximum_power: { c: 'aura@self; ring@self; burst@selfx0.6' },
  cart_termination: { h: 'coins@target; whirl@targetx0.7; explode@target+120x0.6', k: 2 },
  acid_terror: { p: 'orb', h: 'cloud@targetx0.6; burst@targetx0.7' },
  demonstration: { h: 'explode@targetx0.6; flame@area*3~80+200' },
  chemical_shield: { c: 'shield@self; rise@self' },
  aid_potion: { c: 'rise@self; burst@selfx0.5' },
  acid_rain: { h: 'orb@area*12~45^>hit' },
  acid_demonstration: { p: 'orb*2~100', h: 'explode@target; cloud@target+200', k: 2 },
  full_chemical_protection: { c: 'circle@self_=1200; shield@self; rise@self' },
  elixir_rain: { c: 'circle@self_=1400; rise@area*5~80' },
};

/** Recipes for skills without one of their own (new skills), by their effect category. */
const BY_FX: Record<string, Raw> = {
  heal: { c: 'rise@self; circle@self_=800' }, holy: { h: 'holycross@target; burst@target' }, arcane: { p: 'orb', h: 'burst@target' },
  shout: { c: 'ring@self; aura@self' }, slash: { h: 'slash@target; hit@target' }, shadow: { h: 'tendrils@target; smoke@target' },
  meteor: { h: 'meteor@area*4~150^>explode', k: 2 }, whirl: { c: 'whirl@self; ring@self' }, fire: { p: 'orb#ff6a2e', h: 'explode@targetx0.5' },
  pierce: { c: 'pierce@self!', h: 'burst@target' }, wind: { h: 'wind@target; tornado@targetx0.6' }, ice: { p: 'shard', h: 'spikes@targetx0.5' },
  arrow: { p: 'arrow', h: 'hit@target' }, falcon: { p: 'bird', h: 'claw@target' }, arrow_rain: { h: 'arrow@area*10~40^>hit' }, lightning: { h: 'bolt@target' },
};

const cache = new Map<string, SkillVfx | null>();
/** The effect recipe of a skill (null for passives and skills without effects). */
export function skillVfx(skill: Pick<SkillDef, 'id' | 'fx' | 'kind' | 'targeting'>): SkillVfx | null {
  if (cache.has(skill.id)) return cache.get(skill.id)!;
  const raw = RECIPES[skill.id] ?? (skill.kind === 'passive' ? undefined : BY_FX[skill.fx]);
  let out: SkillVfx | null = null;
  if (raw) {
    let proj: SkillVfx['proj'];
    if (raw.p) {
      const name = Object.keys(VFX_SHEETS).filter((k) => raw.p!.startsWith(k)).sort((x, y) => y.length - x.length)[0] ?? raw.p;
      const st = parseStep(`${name}@target${raw.p.slice(name.length)}`);
      proj = { s: st.s, n: st.n, stag: st.stag, sc: st.sc, c: st.c };
    }
    out = { cast: steps(raw.c), proj, hit: steps(raw.h), shake: raw.k ?? 0 };
  }
  cache.set(skill.id, out);
  return out;
}
export const SKILL_VFX_IDS = Object.keys(RECIPES);

