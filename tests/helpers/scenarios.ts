// Builds pre-levelled characters for focused integration tests.
import { addExperience, expToNextBase, expToNextJob, statRaiseCost } from '../../src/core/formulas';
import { addItem, equipItem } from '../../src/core/inventory';
import { allocateStat, changeJob, learnSkill } from '../../src/core/character';
import type { CharacterState, StatKey } from '../../src/core/types';
import { data, newChar } from './fixtures';

export function levelTo(c: CharacterState, base: number, job: number) {
  let b = 0; for (let l = c.baseLevel; l < base; l++) b += expToNextBase(data, l);
  let j = 0; for (let l = c.jobLevel; l < job; l++) j += expToNextJob(data, l);
  addExperience(data, c, b, j);
}

export function buildCharacter(opts: {
  classId: 'knight' | 'ranger' | 'mage'; base: number; job: number; stats: StatKey[]; skills: [string, number][]; gear: string[]; potions?: [string, number][];
}): CharacterState {
  const c = newChar(`Test${opts.classId}`);
  levelTo(c, c.baseLevel, 10);
  c.jobLevel = 10;
  changeJob(data, c, opts.classId);
  levelTo(c, opts.base, opts.job);
  let i = 0;
  // Spend points through the real rule (respects the configured stat cost curve).
  for (let guard = 0; guard < 2000 && c.statPoints > 0; guard++) { const k = opts.stats[i++ % opts.stats.length]; if (!allocateStat(data, c, k, 1).ok && opts.stats.every((s) => statRaiseCost(data, c.stats[s]) > c.statPoints)) break; }
  c.skillPoints += 20;
  for (const [s, n] of opts.skills) for (let k = 0; k < n; k++) learnSkill(data, c, s);
  for (const g of opts.gear) {
    addItem(data, c, g, 1, { ignoreWeight: true });
    const inst = c.inventory.find((x) => x.itemId === g)!;
    const r = equipItem(data, c, inst.uid);
    if (!r.ok) throw new Error(`${g}: ${r.error}`);
  }
  for (const [p, n] of opts.potions ?? []) addItem(data, c, p, n, { ignoreWeight: true });
  return c;
}
