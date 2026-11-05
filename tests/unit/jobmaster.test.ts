import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/core/mapCompiler';
import { data, newChar, newWorld } from '../helpers/fixtures';

const standAt = (w: ReturnType<typeof newWorld>, mapId: string, npcId: string) => {
  const n = data.maps.get(mapId)!.npcs.find((x) => x.npcId === npcId)!;
  w.enterMap(mapId, 'default');
  w.player.x = n.x * TILE + 16; w.player.y = (n.y + 1) * TILE + 16;
};

describe('Job Master NPC (every job change in one place)', () => {
  it('stands in every town and offers every job and rebirth', () => {
    const jobs = [...data.classes.values()].filter((c) => c.requirements?.fromClass).map((c) => c.id).sort();
    for (const town of ['willowbrook', 'aurelion', 'fernhollow', 'arcanthe', 'sandara', 'tidewatch', 'frostholm']) {
      expect(data.maps.get(town)!.npcs.some((n) => n.npcId === `${town}_jobmaster`)).toBe(true);
      const npc = data.npcs.get(`${town}_jobmaster`)!;
      const s = npc.services.find((x) => x.type === 'jobChange') as { classIds: string[] };
      expect([...s.classIds].sort()).toEqual(jobs);
      expect(npc.services.some((x) => x.type === 'rebirth')).toBe(true);
    }
  });

  it('takes a Novice to any first job in Willowbrook, then to a second job, with the normal requirements', () => {
    const w = newWorld(newChar());
    const c = w.char;
    standAt(w, 'willowbrook', 'willowbrook_jobmaster');
    expect(w.changeJobAt('mage').ok).toBe(false); // needs Job Lv 10
    c.jobLevel = 10;
    expect(w.changeJobAt('sage').ok).toBe(false); // wrong path
    expect(w.changeJobAt('mage').ok).toBe(true);
    expect(c.classId).toBe('mage');
    c.jobLevel = 40;
    standAt(w, 'tidewatch', 'tidewatch_jobmaster');
    expect(w.changeJobAt('sage').ok).toBe(true);
    expect(c.classId).toBe('sage');
  });

  it('rebirth works at a Job Master too', () => {
    const w = newWorld(newChar());
    const c = w.char;
    c.classId = 'knight'; c.jobLevel = 40;
    standAt(w, 'frostholm', 'frostholm_jobmaster');
    expect(w.changeJobAt('templar').ok).toBe(true);
    c.baseLevel = 99; c.jobLevel = 50;
    expect(w.rebirthAt().ok).toBe(true);
    expect(c.classId).toBe('high_novice');
  });
});
