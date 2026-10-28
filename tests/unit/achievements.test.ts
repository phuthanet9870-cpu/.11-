import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, bonusNow, checkAchievements, claimDaily, dailyStatus, DAILY_REWARDS, titleOf } from '../../src/core/achievements';
import { countItem } from '../../src/core/inventory';
import { World } from '../../src/core/world';
import { Rng } from '../../src/core/rng';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0).getTime();

describe('achievements and titles', () => {
  it('rewards each achievement once, and unlocks its title', () => {
    for (const a of ACHIEVEMENTS) for (const it of a.reward.items ?? []) expect(data.items.has(it.itemId), it.itemId).toBe(true);
    const c = newChar();
    c.stats_meta.kills = 100;
    const luma = c.luma;
    const got = checkAchievements(data, c, 1).map((a) => a.id);
    expect(got).toContain('first_blood');
    expect(got).toContain('hunter_100');
    expect(got).not.toContain('hunter_1000');
    expect(c.luma).toBe(luma + 100 + 1000);
    expect(countItem(c, 'orange_potion')).toBeGreaterThanOrEqual(10);
    expect(checkAchievements(data, c, 2)).toEqual([]); // no double rewards
  });

  it('the world checks achievements while playing and lets you show a title', () => {
    const w = newWorld();
    expect(w.setTitle('hunter_100').ok).toBe(false); // not earned
    w.char.stats_meta.kills = 1;
    run(w, 1200);
    expect(w.char.achievements?.first_blood).toBeTruthy();
    expect(w.drainEvents().some((e) => e.type === 'achievement')).toBe(true);
    expect(w.setTitle('first_blood').ok).toBe(true);
    expect(titleOf(w.char)).toBe('Fledgling');
    w.setTitle(null);
    expect(titleOf(w.char)).toBeUndefined();
  });
});

describe('daily login rewards', () => {
  it('claims once a day, keeps the streak on consecutive days, and resets after a gap', () => {
    const c = newChar();
    expect(claimDaily(data, c, at(2026, 3, 1)).day).toBe(1);
    expect(claimDaily(data, c, at(2026, 3, 1, 20)).ok).toBe(false); // same day
    expect(claimDaily(data, c, at(2026, 3, 2)).day).toBe(2);
    expect(claimDaily(data, c, at(2026, 3, 3)).day).toBe(3);
    expect(dailyStatus(c, at(2026, 3, 5))).toEqual({ day: 1, canClaim: true }); // missed a day
    const c2 = newChar();
    for (let d = 1; d <= 8; d++) claimDaily(data, c2, at(2026, 3, d));
    expect(c2.daily!.streak).toBe(1); // day 8 starts the cycle again
    expect(DAILY_REWARDS).toHaveLength(7);
  });
});

describe('timed bonus events', () => {
  it('gives EXP +50% in bonus hours and drops +50% on weekends', () => {
    expect(bonusNow(at(2026, 3, 4, 12)).exp).toBe(1.5); // Wednesday noon
    expect(bonusNow(at(2026, 3, 4, 9)).exp).toBe(1);
    expect(bonusNow(at(2026, 3, 4, 21)).exp).toBe(1.5);
    expect(bonusNow(at(2026, 3, 4, 9)).drop).toBe(1);
    expect(bonusNow(at(2026, 3, 7, 9)).drop).toBe(1.5); // Saturday
  });

  it('applies the EXP bonus to monster kills', () => {
    const exp = (hour: number) => {
      const w = new World(data, newChar(), { rng: new Rng(1), now: () => at(2026, 3, 4, hour) });
      w.timedBonuses = true;
      w.enterMap('sunny_meadow', 'default');
      const m = [...w.monsters.values()].find((x) => !x.def.elite && x.def.aiType !== 'boss')!;
      const before = w.char.baseExp;
      m.hp = 1; m.damageBy.player = 1;
      (w as unknown as { killMonster(m: unknown): void }).killMonster(m);
      return w.char.baseExp - before;
    };
    expect(exp(12)).toBeGreaterThan(exp(9));
  });
});
