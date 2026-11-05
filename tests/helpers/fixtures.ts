import { loadGameData } from '../../src/core/data';
import { createCharacter } from '../../src/core/character';
import { Rng } from '../../src/core/rng';
import { World } from '../../src/core/world';
import type { CharacterState } from '../../src/core/types';

export const data = loadGameData();

export function newChar(name = 'Tester'): CharacterState {
  return createCharacter(data, name, { body: 'a', hairStyle: 'short', hairColor: '#2b2b33', eyeColor: '#3a5a8a', skinTone: '#f2d0b4' });
}

/** Test worlds have timed raids off so bot runs stay deterministic; pass events = true to test them. */
export function newWorld(c: CharacterState = newChar(), seed = 1234, now = () => 1_700_000_000_000, events = false): World {
  return new World(data, c, { rng: new Rng(seed), now, noEvents: !events });
}

/** Runs the world for `ms` milliseconds in fixed 50ms ticks. */
export function run(w: World, ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) w.update(step);
}
