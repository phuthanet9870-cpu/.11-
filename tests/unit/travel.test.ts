import { describe, expect, it } from 'vitest';
import { newWorld, run } from '../helpers/fixtures';

describe('World Map auto travel and skill auto-arrange', () => {
  it('walks to a picked map through the portals by itself', () => {
    const w = newWorld();
    w.godMode = true;
    const start = w.map.def.id;
    // Two maps away: the nearest neighbour's neighbour.
    const hop1 = w.map.def.portals.map((p) => p.targetMap).find((id) => w.data.maps.get(id)?.type === 'field')!;
    const hop2 = w.data.maps.get(hop1)!.portals.map((p) => p.targetMap).find((id) => id !== start && w.data.maps.get(id)?.type !== 'instance')!;
    expect(w.auto.startTravel(hop2)).toBe(true);
    expect(w.auto.mode).toBe('travel');
    for (let t = 0; t < 600 && w.map.def.id !== hop2; t++) run(w, 1000);
    expect(w.map.def.id).toBe(hop2);
    run(w, 500);
    expect(w.auto.mode).toBe('off');
  });

  it('refuses maps with no walking route', () => {
    const w = newWorld();
    expect(w.auto.startTravel('mvp_sanctum')).toBe(false);
    expect(w.auto.startTravel(w.map.def.id)).toBe(false);
  });
});
