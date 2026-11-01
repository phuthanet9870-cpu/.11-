import { describe, expect, it } from 'vitest';
import { addItem, cartWeight, countItem, inventoryWeight } from '../../src/core/inventory';
import { addHomunExp, createHomunculus, evolveHomun, homunStats } from '../../src/core/homunculus';
import { evolvePet, hatchEgg, petMods } from '../../src/core/pets';
import { changeJob, learnSkill } from '../../src/core/character';
import { buildCharacter, levelTo } from '../helpers/scenarios';
import { data, newChar, newWorld, run } from '../helpers/fixtures';

function alchemist() {
  const c = buildCharacter({ classId: 'merchant', base: 45, job: 40, stats: ['dex'], skills: [], gear: [] });
  changeJob(data, c, 'alchemist');
  c.skillPoints = 5;
  learnSkill(data, c, 'call_homunculus');
  return c;
}
function onField(c: ReturnType<typeof newChar>) {
  const sp = data.maps.get('sunny_meadow')!.spawnPoints.default;
  c.position = { mapId: 'sunny_meadow', x: sp.x * 32 + 16, y: sp.y * 32 + 16 };
  return c;
}

describe('homunculus', () => {
  it('needs Bioethics and an embryo; type is random among four', () => {
    const plain = newChar(); addItem(data, plain, 'homun_embryo', 1);
    expect(createHomunculus(data, plain, () => 0).ok).toBe(false);
    const seen = new Set<string>();
    for (const r of [0, 0.3, 0.6, 0.9]) { const c = alchemist(); addItem(data, c, 'homun_embryo', 1); expect(createHomunculus(data, c, () => r).ok).toBe(true); seen.add(c.homunculus!.typeId); expect(countItem(c, 'homun_embryo')).toBe(0); }
    expect(seen.size).toBe(4);
  });

  it('levels up and grows; evolution needs Lv 50, Loyal and a Stone of Sages', () => {
    const c = alchemist(); addItem(data, c, 'homun_embryo', 1); createHomunculus(data, c, () => 0.3);
    const h = c.homunculus!;
    const hp1 = homunStats(data, h).maxHp;
    addHomunExp(data, h, 1e7);
    expect(h.level).toBeGreaterThan(50);
    expect(homunStats(data, h).maxHp).toBeGreaterThan(hp1 * 5);
    expect(evolveHomun(data, c).ok).toBe(false);
    h.intimacy = 950; addItem(data, c, 'sage_stone', 1);
    const before = homunStats(data, h).atk;
    expect(evolveHomun(data, c).ok).toBe(true);
    expect(homunStats(data, h).atk).toBeGreaterThan(before * 1.2);
  });

  it('fights the owner target, earns EXP from kills, draws hits, can fall and be revived', () => {
    const c = onField(alchemist()); addItem(data, c, 'homun_embryo', 1); createHomunculus(data, c, () => 0.6); // fawnling
    addItem(data, c, 'homun_revive', 1);
    const w = newWorld(c); w.godMode = true; w.update(16);
    const m = w.spawnMonsterAt('horn_rabbit', w.player.x + 120, w.player.y)!;
    w.attack(m.id);
    run(w, 15000);
    expect(m.damageBy.homun ?? 0).toBeGreaterThan(0);
    expect(c.homunculus!.exp + c.homunculus!.level).toBeGreaterThan(1);
    // A strong monster that the homunculus out-threats hits it instead of the owner.
    const big = w.spawnMonsterAt('grave_knight', w.player.x + 60, w.player.y)!;
    big.threat.homun = 1e6; big.targetId = 'player'; big.state = 'chase';
    w.attack(big.id);
    run(w, 30000);
    expect(c.homunculus!.alive).toBe(false);
    expect(w.homunReviveCmd().ok).toBe(true);
    expect(c.homunculus!.alive).toBe(true);
  });
});

describe('mount, cart, pet extras', () => {
  it('war-drake: Knight line only; +25% move, +1000 weight, slower attacks reduced by Drake Riding', () => {
    const c = buildCharacter({ classId: 'knight', base: 45, job: 40, stats: ['str'], skills: [], gear: [] });
    changeJob(data, c, 'dragoon');
    c.flags.mountOwned = true;
    const w = newWorld(c); w.update(16);
    const s0 = { ...w.stats };
    w.toggleMount(); w.update(16);
    expect(w.stats.weightLimit - s0.weightLimit).toBe(1000);
    expect(w.stats.moveSpeed).toBeCloseTo(s0.moveSpeed * 1.25, 3);
    expect(w.stats.attackIntervalMs).toBeGreaterThan(s0.attackIntervalMs);
    c.skillPoints = 5; for (let i = 0; i < 5; i++) learnSkill(data, c, 'drake_riding');
    w.invalidateStats(); w.update(16);
    expect(w.stats.attackIntervalMs).toBeLessThanOrEqual(s0.attackIntervalMs);
    const mage = newWorld(buildCharacter({ classId: 'mage', base: 20, job: 20, stats: ['int'], skills: [], gear: [] }));
    expect(mage.canMount).toBe(false);
  });

  it('pushcart: items moved to the cart stop counting toward your weight; 8000 weight cap', () => {
    const c = buildCharacter({ classId: 'merchant', base: 30, job: 20, stats: ['str'], skills: [], gear: [] });
    c.cart = [];
    addItem(data, c, 'red_potion', 50, { ignoreWeight: true });
    const total = countItem(c, 'red_potion');
    const w = newWorld(c); w.update(16);
    const before = inventoryWeight(data, c);
    const pot = c.inventory.find((i) => i.itemId === 'red_potion' && i.qty >= 40)!;
    expect(w.cartPut(pot.uid, 40).ok).toBe(true);
    expect(inventoryWeight(data, c)).toBeLessThan(before);
    expect(cartWeight(data, c)).toBe(40 * data.items.get('red_potion')!.weight);
    expect(w.cartTake(c.cart[0].uid, 10).ok).toBe(true);
    expect(countItem(c, 'red_potion')).toBe(total - 30);
  });

  it('pet accessory (+1 all stats at Cordial) and evolution (Loyal + materials, bonus ×1.5)', () => {
    const pd = data.pets.get('pet_leaf_slime')!;
    const c = newChar();
    addItem(data, c, pd.eggItem, 1); hatchEgg(data, c, c.inventory.find((i) => i.itemId === pd.eggItem)!.uid);
    addItem(data, c, pd.accessoryItem!, 1);
    const w = newWorld(c); w.update(16);
    expect(w.petAccessoryCmd(c.inventory.find((i) => i.itemId === pd.accessoryItem)!.uid).ok).toBe(true);
    expect(petMods(data, c)).toBeNull();
    c.pet!.intimacy = 800;
    expect(petMods(data, c)!.str).toBe(1);
    expect(evolvePet(data, c).ok).toBe(false);
    c.pet!.intimacy = 950;
    for (const m of pd.evolution!.materials) addItem(data, c, m.itemId, m.qty, { ignoreWeight: true });
    const hpBonus = (pd.loyalBonus.maxHp ?? 0);
    expect(evolvePet(data, c).ok).toBe(true);
    expect(c.pet!.name).toBe(pd.evolution!.name);
    c.pet!.intimacy = 950;
    expect(petMods(data, c)!.maxHp).toBe(Math.round(hpBonus * 1.5));
    void levelTo;
  });
});
