// Image-generation jobs for the AI art path (OpenAI Images API). Each job is one
// generated image: a reference turnaround per asset, then one sprite sheet per
// animation drawn in a fixed grid (columns = frames, rows = front/left/right/back).
// Frame counts and timings come from the same definitions as the studio art.
import { HUMANOID_ANIMS } from '../humanoidAnims';
import { MONSTER_ANIMS } from '../monsters';
import { BATCH001_VFX } from '../vfx';

export interface AiJob {
  id: string;                // raw file name: tools/asset-studio/ai-raw/<id>.png
  asset: string;             // novice | leaf_slime | ... | fx_*
  kind: 'reference' | 'character' | 'monster' | 'vfx';
  anim?: string;
  frames: number;
  rows: number;
  reference?: string;        // job id whose image is sent as the visual reference
  prompt: string;
}

const STYLE = [
  'Crisp 2D pixel art game sprite sheet for a top-down anime fantasy MMORPG (Ragnarok-like 3/4 view).',
  'Clean pixel clusters, no anti-aliasing, no blur, no gradients, limited palette (about 32 colours), dark selective outline,',
  'light from the upper-left. Fully transparent background. No text, no labels, no numbers, no frame borders, no grid lines.',
  'Every cell is the same size, sprites never overlap or touch each other, each sprite fully inside its cell, consistent scale in every cell.',
].join(' ');

const ROWS = 'Exactly 4 rows: row 1 facing the viewer (front), row 2 facing left, row 3 facing right, row 4 facing away (back).';

const CHARACTERS: Record<string, string> = {
  novice: 'a young adventurer "Novice": short warm-brown hair with a fringe, big blue anime eyes, beige linen tunic with a brown satchel strap across the chest, brown belt with a brass buckle, dark brown trousers, brown boots, a small steel dagger in the right hand. Chibi-leaning proportions, about 3.5 heads tall.',
};

const MONSTERS: Record<string, string> = {
  leaf_slime: 'Leaf Slime: a round, glossy green jelly slime with a small two-leaf sprout on top, cute dot eyes and a tiny mouth.',
  mushling: 'Mushling: a small walking mushroom creature with a red cap with white spots, a cream stem body with a cute face, and two stubby feet.',
  horn_rabbit: 'Horn Rabbit: a fluffy cream-coloured rabbit with long upright ears with pink insides, a short golden spiral horn on its forehead, and a white tail.',
};

const ANIM_TEXT: Record<string, string> = {
  idle: 'idle breathing loop (subtle rise and fall, a blink on the last frame)',
  walk: 'walk cycle in place (alternating legs, contact-down-pass-up), feet stay on the same ground line',
  attack: 'melee attack: wind-up, fast strike, follow-through, recover',
  cast: 'spell cast: hands drawn together at chest height, glow building, release, settle',
  hit: 'getting hit: flinch back, recoil, recover',
  death: 'death: stagger, knees buckle, fall and lie on the ground',
};

const MONSTER_ANIM_TEXT: Record<string, string> = {
  idle: 'idle loop (gentle squash and stretch, blink on the last frame)',
  walk: 'movement loop in place (hop or waddle), returning to the start pose',
  attack: 'attack: anticipation, lunge forward, impact, recoil',
  hit: 'getting hit: squash/flinch, recoil, recover',
  death: 'death: collapse and fade into a flat pose on the ground',
};

export function aiJobs(): AiJob[] {
  const jobs: AiJob[] = [];
  for (const [id, desc] of Object.entries(CHARACTERS)) {
    jobs.push({ id: `${id}_reference`, asset: id, kind: 'reference', frames: 1, rows: 4, prompt: `${STYLE} Character turnaround of ${desc} 1 column, ${ROWS} Standing neutral pose.` });
    for (const a of HUMANOID_ANIMS) {
      jobs.push({
        id: `${id}_${a.name}`, asset: id, kind: 'character', anim: a.name, frames: a.frames, rows: 4, reference: `${id}_reference`,
        prompt: `${STYLE} Same character as the reference image: ${desc} Animation: ${ANIM_TEXT[a.name]}. A grid of exactly ${a.frames} columns (one frame per column, left to right in time order) and ${ROWS} Every frame must be a different pose.`,
      });
    }
  }
  for (const [id, desc] of Object.entries(MONSTERS)) {
    jobs.push({ id: `${id}_reference`, asset: id, kind: 'reference', frames: 1, rows: 4, prompt: `${STYLE} Monster turnaround of ${desc} 1 column, ${ROWS} Neutral pose.` });
    for (const a of MONSTER_ANIMS) {
      jobs.push({
        id: `${id}_${a.name}`, asset: id, kind: 'monster', anim: a.name, frames: a.frames, rows: 4, reference: `${id}_reference`,
        prompt: `${STYLE} Same monster as the reference image: ${desc} Animation: ${MONSTER_ANIM_TEXT[a.name]}. A grid of exactly ${a.frames} columns (one frame per column, in time order) and ${ROWS} Every frame must be a different pose.`,
      });
    }
  }
  const VFX_TEXT: Record<string, string> = {
    fx_sword_slash: 'a white-silver crescent sword slash arc sweeping from upper-left to lower-right, with small sparkles, fading out in the last frames',
    fx_hit_basic: 'a small golden-white impact spark burst: flash, star burst, expanding ring, fade',
    fx_heal: 'a green healing effect: a ground ring opening at the bottom, rising plus-shaped sparkles and a soft column of light, fading out',
    fx_level_up: 'a golden level-up effect: a pillar of golden light rising from a ground ring, rising stars, fading out',
  };
  for (const d of BATCH001_VFX) {
    jobs.push({
      id: d.key, asset: d.key, kind: 'vfx', frames: d.frames, rows: 1,
      prompt: `Crisp 2D pixel art visual effect animation strip for a fantasy RPG: ${VFX_TEXT[d.key]}. Exactly ${d.frames} frames in a single horizontal row, left to right in time order, equal spacing, fully transparent background, no text, no borders, limited palette, no blur.`,
    });
  }
  return jobs;
}
