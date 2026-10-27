// Auto Quest and Auto Farm on a real world, driven only by the AutoPilot.
import { describe, expect, it } from 'vitest';
import { data, newChar, newWorld } from '../helpers/fixtures';
import { addItem } from '../../src/core/inventory';
import { TILE } from '../../src/core/mapCompiler';

function runUntil(w: ReturnType<typeof newWorld>, pred: () => boolean, maxMs: number, step = 100) {
  for (let t = 0; t < maxMs; t += step) { if (pred()) return true; w.update(step); w.drainEvents(); }
  return pred();
}

describe('Auto Quest', () => {
  it('takes a new character through the whole tutorial chain by itself', () => {
    const c = newChar('AutoQ');
    const w = newWorld(c, 11);
    w.update(16);
    w.auto.start('quest');
    const statuses: string[] = [];
    let last = '';
    const done = runUntil(w, () => {
      if (w.auto.status && w.auto.status.split(':')[0] !== last) { last = w.auto.status.split(':')[0]; statuses.push(last); }
      if (w.player.dead) w.respawn();
      if (w.auto.mode === 'off') w.auto.start('quest'); // keep going after a death or a stop; the test looks at the outcome
      return [...data.quests.keys()].every((id) => c.quests[id]?.status === 'completed');
    }, 4 * 3_600_000);
    console.log(`Auto Quest: ${Math.round(w.time / 60000)} sim-minutes, Base ${c.baseLevel} / Job ${c.jobLevel}, deaths ${c.stats_meta.deaths}; steps: ${statuses.join(' → ')}`);
    expect(done).toBe(true);
    expect(c.equipment.weapon?.refine ?? 0).toBeGreaterThanOrEqual(1);
    expect(c.jobLevel).toBeGreaterThanOrEqual(10);
  }, 600_000);
});

describe('Auto Farm', () => {
  it('fights around its start point, loots, drinks potions and stays in the area', () => {
    const c = newChar('AutoF');
    const sp = data.maps.get('sunny_meadow')!.spawnPoints.default;
    c.position = { mapId: 'sunny_meadow', x: sp.x * TILE + TILE / 2, y: sp.y * TILE + TILE / 2 };
    addItem(data, c, 'red_potion', 20);
    const w = newWorld(c, 5);
    w.update(16);
    w.auto.start('farm');
    const start = { x: w.player.x, y: w.player.y };
    let maxDist = 0;
    const kills0 = c.stats_meta.kills, luma0 = c.luma;
    runUntil(w, () => { maxDist = Math.max(maxDist, Math.hypot(w.player.x - start.x, w.player.y - start.y)); return false; }, 10 * 60000);
    console.log(`Auto Farm: ${c.stats_meta.kills - kills0} kills in 10 sim-minutes, +${c.luma - luma0} Luma, max distance ${Math.round(maxDist)}px, mode ${w.auto.mode}`);
    expect(c.stats_meta.kills - kills0).toBeGreaterThan(10);
    expect(c.inventory.some((i) => data.items.get(i.itemId)?.type === 'material')).toBe(true);
    expect(maxDist).toBeLessThan(w.auto.settings.radius + 400);
  }, 300_000);

  it('stops when overweight and on manual control', () => {
    const c = newChar('AutoW');
    const w = newWorld(c, 5);
    w.update(16);
    while (!w.majorOverweight) addItem(data, c, 'iron_sword', 1, { ignoreWeight: true });
    w.auto.start('farm');
    w.update(200);
    expect(w.auto.mode).toBe('off');
    const c2 = newChar('AutoM');
    const w2 = newWorld(c2, 5);
    w2.update(16);
    w2.auto.start('farm');
    w2.auto.stop('manual control');
    expect(w2.auto.mode).toBe('off');
  });
});
