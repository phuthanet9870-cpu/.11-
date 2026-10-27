import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, EVENT_DURATION_MS } from '../../src/core/world';
import { buildCharacter } from '../helpers/scenarios';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

describe('day and night', () => {
  it('a day lasts 24 real minutes; night (20:00–05:00) makes undead / shadow / ghost monsters hit harder', () => {
    const w = newWorld(newChar(), 1, () => 0);
    expect(w.hourOfDay).toBe(0);
    expect(w.isNight).toBe(true);
    w.time = (DAY_SECONDS / 2) * 1000; // noon
    expect(w.hourOfDay).toBeCloseTo(12, 6);
    expect(w.isNight).toBe(false);
    expect(w.darkness).toBe(0);
    const m = w.spawnMonsterAt('bone_soldier', w.player.x + 40, w.player.y)!;
    const day = (w as unknown as { monsterProfile(x: typeof m): { patk: number } }).monsterProfile(m).patk;
    w.time = (DAY_SECONDS * 22 / 24) * 1000;
    expect(w.isNight).toBe(true);
    expect((w as unknown as { monsterProfile(x: typeof m): { patk: number } }).monsterProfile(m).patk).toBe(Math.round(m.def.attack * 1.15));
    expect(day).toBe(m.def.attack);
  });
});

describe('world events (raids)', () => {
  it('a raid starts after 5 minutes on a field near your level; killing the leader pays out', () => {
    const c = buildCharacter({ classId: 'knight', base: 20, job: 20, stats: ['str'], skills: [], gear: [] });
    const w = newWorld(c, 3, () => 1_700_000_000_000, true);
    w.godMode = true;
    run(w, 5 * 60000 + 200, 100);
    expect(w.event).not.toBeNull();
    const ev = w.event!;
    const map = data.maps.get(ev.mapId)!;
    expect(map.type).toBe('field');
    w.enterMap(ev.mapId, 'default' in map.spawnPoints ? 'default' : Object.keys(map.spawnPoints)[0]);
    w.update(50);
    const raid = [...w.monsters.values()].filter((m) => m.eventRaid);
    expect(raid.filter((m) => m.eventRaid === 'leader').length).toBe(1);
    expect(raid.filter((m) => m.eventRaid === 'raider').length).toBe(8);
    const leader = raid.find((m) => m.eventRaid === 'leader')!;
    const luma = c.luma;
    leader.damageBy.player = 1;
    (w as unknown as { killMonster(x: typeof leader): void }).killMonster(leader);
    expect(c.luma - luma).toBeGreaterThanOrEqual(leader.def.level * 300);
    expect(w.event!.done).toBe(true);
    expect(c.flags.raidsWon).toBe(1);
  });

  it('an unanswered raid ends after 10 minutes and its monsters leave', () => {
    const w = newWorld(newChar(), 3, () => 0, true);
    expect(w.startEvent('clover_hills')).toBe(true);
    w.enterMap('clover_hills', Object.keys(data.maps.get('clover_hills')!.spawnPoints)[0]);
    w.godMode = true;
    w.update(50);
    expect([...w.monsters.values()].some((m) => m.eventRaid)).toBe(true);
    for (const m of w.monsters.values()) m.def = { ...m.def, aiType: 'passive' };
    run(w, EVENT_DURATION_MS + 500, 100);
    expect([...w.monsters.values()].some((m) => m.eventRaid)).toBe(false);
    expect(w.event).toBeNull();
  });
});
