import { describe, expect, it } from 'vitest';
import * as gm from '../../src/core/gm';
import { runePointsTotal } from '../../src/core/runes';
import { data, newWorld, run } from '../helpers/fixtures';

const say = (w: ReturnType<typeof newWorld>, line: string) => gm.runGmCommand(w, line);

describe('GM full control', () => {
  it('@lvl sets levels exactly, up and down', () => {
    const w = newWorld();
    expect(say(w, '@lvl 40 10').ok).toBe(true);
    expect([w.char.baseLevel, w.char.jobLevel]).toEqual([40, 10]);
    say(w, '@lvl 5 3');
    expect([w.char.baseLevel, w.char.jobLevel]).toEqual([5, 3]);
    expect(w.char.flags.gmUsed).toBe(true);
  });

  it('@stat sets one or all stats; @maxskills learns the class line', () => {
    const w = newWorld();
    say(w, '@stat all 50');
    expect(Object.values(w.char.stats).every((v) => v === 50)).toBe(true);
    say(w, '@stat dex 99');
    expect(w.char.stats.dex).toBe(99);
    gm.gmSetClass(w, 'templar');
    say(w, '@maxskills');
    const line = [...data.skills.values()].filter((s) => ['novice', 'knight', 'templar'].includes(s.classId));
    expect(line.length).toBeGreaterThan(5);
    for (const s of line) expect(w.char.skills[s.id]).toBe(s.maxLevel);
    expect(say(w, '@stat foo 3').ok).toBe(false);
  });

  it('@item makes an item to order', () => {
    const w = newWorld();
    const eq = [...data.items.values()].find((i) => i.type === 'equipment')!;
    const card = [...data.items.values()].find((i) => i.type === 'card')!;
    const r = say(w, `@item ${eq.id} refine=15 element=fire cards=${card.id}`);
    expect(r.ok).toBe(true);
    const inst = w.char.inventory.find((i) => i.itemId === eq.id)!;
    expect(inst.refine).toBe(15);
    expect(inst.element).toBe('fire');
    expect(inst.cards).toEqual([card.id]);
    expect(say(w, '@item not_an_item').ok).toBe(false);
    say(w, '@clearinv');
    expect(w.char.inventory.length).toBe(0);
  });

  it('rates multiply EXP and Luma', () => {
    const a = newWorld(), b = newWorld();
    say(b, '@rates 500 100 300');
    expect(b.gm.expRate).toBe(500);
    for (const w of [a, b]) { w.godMode = true; gm.gmToggle(w, 'oneHit', true); }
    const kill = (w: ReturnType<typeof newWorld>) => {
      const m = w.spawnMonsterAt('leaf_slime', w.player.x + 30, w.player.y)!;
      w.attack(m.id);
      run(w, 4000);
      return w.char.baseExp + w.char.baseLevel * 1e6;
    };
    expect(kill(b)).toBeGreaterThan(kill(a));
  });

  it('one-hit kill, no cooldown and invisibility', () => {
    const w = newWorld();
    say(w, '@onehit on');
    const m = w.spawnMonsterAt('bone_soldier', w.player.x + 30, w.player.y)!;
    w.attack(m.id);
    run(w, 3000);
    expect(m.dead || !w.monsters.has(m.id)).toBe(true);
    say(w, '@nocd on'); say(w, '@hide on');
    expect(w.gm.noCooldown && w.gm.invisible).toBe(true);
    say(w, '@hide off');
    expect(w.gm.invisible).toBe(false);
  });

  it('@gamespeed runs more simulation per frame', () => {
    const w = newWorld();
    say(w, '@gamespeed 4');
    const t = w.time;
    w.update(50);
    expect(w.time - t).toBe(200);
    say(w, '@gamespeed 1');
    expect(w.char.flags.gmTimeScale).toBeUndefined();
  });

  it('companions, rune points, rebirth', () => {
    const w = newWorld();
    expect(say(w, '@pet leaf_slime 900').ok).toBe(true);
    expect(w.char.pet?.intimacy).toBe(900);
    expect(say(w, '@homun sylph 30').ok).toBe(true);
    expect(w.char.homunculus?.level).toBe(30);
    const before = runePointsTotal(w.char);
    say(w, '@runes 7');
    expect(runePointsTotal(w.char)).toBe(before + 7);
    expect(say(w, '@rebirth').ok).toBe(false); // needs a second job
    gm.gmSetClass(w, 'sage');
    expect(say(w, '@rebirth').ok).toBe(true);
    expect(data.classes.get(w.char.classId)!.id.startsWith('high_')).toBe(true);
  });

  it('world: warp x y, boss respawn, raids, dungeon floors, quests', () => {
    const w = newWorld();
    const field = [...data.maps.values()].find((m) => m.type === 'field')!;
    expect(say(w, `@warp ${field.id} 10 12`).ok).toBe(true);
    expect(w.map.def.id).toBe(field.id);
    expect(say(w, '@raid ' + field.id).ok).toBe(true);
    expect(w.event?.mapId).toBe(field.id);
    say(w, '@raid end');
    run(w, 200);
    expect(w.event).toBeNull();
    expect(say(w, '@dungeon endless_spire 42').ok).toBe(true);
    expect(w.instance?.floor).toBe(42);
    say(w, '@questall complete');
    expect(Object.values(w.char.quests).every((q) => q.status === 'completed')).toBe(true);
    say(w, '@questall reset');
    expect(Object.keys(w.char.quests).length).toBe(0);
    const bossMap = [...data.maps.values()].find((m) => m.bossSpawn)!;
    say(w, `@warp ${bossMap.id}`);
    expect(say(w, '@boss').ok).toBe(true);
    expect([...w.monsters.values()].some((m) => m.boss)).toBe(true);
  });

  it('@help lists every command and unknown commands fail', () => {
    const w = newWorld();
    const r = say(w, '@help');
    expect(r.ok && r.message!.split('\n').length).toBe(gm.GM_COMMANDS.length);
    expect(say(w, '@nonsense').ok).toBe(false);
  });
});
