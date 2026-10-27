// Draggable game windows: inventory, equipment, status, skills, quests, world
// map, settings — plus NPC dialogue, shop, storage, tooltips and menus.
import type { App } from './app';
import { h, setChildren, RARITY_COLOR } from './dom';
import { itemIconUrl, skillIconUrl } from '../game/art/icons';
import { generateCharacterSheet, portraitFromSheet } from '../game/art/characterSprite';
import { lookForCharacter, SpritePreview } from './screens';
import { getDragData, setDragData } from './hud';
import { classLineage, skillCheck } from '../core/character';
import { buyPrice, canEquip, countItem, filterInventory, inventoryWeight, sellPrice } from '../core/inventory';
import { hungerLabel, intimacyLabel, LOYAL_AT } from '../core/pets';
import { canRaiseStat, expToNextBase, expToNextJob, statRaiseCost } from '../core/formulas';
import {
  activeQuests, isComplete, objectiveTarget, questsOfferedBy, questsToTurnIn,
} from '../core/quests';
import type { EquipSlot, ItemDef, ItemInstance, ItemType, NpcDef, QuestDef, StatKey, StatModifiers } from '../core/types';
import { EQUIP_SLOTS, STAT_KEYS } from '../core/types';
import { DEFAULT_KEYBINDS } from '../core/save';
import { audio } from '../game/audio/audio';
import * as gm from '../core/gm';
import { MAX_REFINE, refineInfo } from '../core/refine';
import { compoundTargets, itemDisplayName } from '../core/cards';
import { canForge, CRUMB_ATK, ELEMENT_STONES, forgeChance, STAR_CRUMB } from '../core/forge';
import { ENCHANT_COST, MAX_OPTIONS, optionLabel, REROLL_COST } from '../core/options';

export type WindowId = 'inventory' | 'equipment' | 'status' | 'skills' | 'quests' | 'worldMap' | 'settings' | 'shop' | 'storage' | 'admin' | 'database' | 'pet';

interface WinState { el: HTMLElement; body: HTMLElement; render: () => void; open: boolean }

const MOD_LABEL: Record<string, string> = {
  str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK', maxHp: 'Max HP', maxMp: 'Max MP', maxHpPct: 'Max HP %', maxMpPct: 'Max MP %',
  patk: 'ATK', matk: 'MATK', patkPct: 'ATK %', matkPct: 'MATK %', pdef: 'DEF', mdef: 'MDEF', pdefPct: 'DEF %', hit: 'HIT', flee: 'FLEE', crit: 'CRIT',
  critDmg: 'Crit DMG %', aspdPct: 'Attack Speed %', moveSpeedPct: 'Move Speed %', castTimePct: 'Cast Time %', cdrPct: 'Cooldown -%', hpRegen: 'HP Regen', mpRegen: 'MP Regen',
  weightLimit: 'Weight Limit', attackRange: 'Range', counterChance: 'Counter %', damageToMpPct: 'Damage → MP %', stealth: 'Stealth',
};

export function modsText(m?: StatModifiers): string[] {
  if (!m) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v == null) continue;
    if (k === 'elementDamagePct' || k === 'elementResistPct') {
      for (const [el, n] of Object.entries(v as Record<string, number>)) out.push(`${el} ${k === 'elementDamagePct' ? 'damage' : 'resist'} ${n > 0 ? '+' : ''}${n}%`);
    } else if (k === 'raceDamagePct' || k === 'sizeDamagePct') {
      for (const [r, n] of Object.entries(v as Record<string, number>)) out.push(`+${n}% damage vs ${r}${k === 'sizeDamagePct' ? '-size' : ''} monsters`);
    } else if (k === 'onHitStatusPct') {
      for (const [st, n] of Object.entries(v as Record<string, number>)) out.push(`${n}% chance to ${st} on hit`);
    } else if (k === 'hpDrainPct') {
      out.push(`Drain ${v}% of damage as HP`);
    } else if (k === 'raceResistPct') {
      for (const [r, n] of Object.entries(v as Record<string, number>)) out.push(`-${n}% damage from ${r} monsters`);
    } else out.push(`${MOD_LABEL[k] ?? k} ${(v as number) > 0 ? '+' : ''}${v}`);
  }
  return out;
}

export class WindowManager {
  private wins = new Map<WindowId, WinState>();
  private z = 100;
  private tooltip = h('div', { class: 'panel tooltip hidden' });
  private ctxMenu: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private modalEl: HTMLElement | null = null;
  shopId: string | null = null;
  invFilter: 'all' | ItemType = 'all';
  selectedQuest: string | null = null;
  private listening: string | null = null;

  constructor(private app: App, private root: HTMLElement) {
    root.appendChild(this.tooltip);
    document.addEventListener('mousedown', (e) => {
      if (this.ctxMenu && !this.ctxMenu.contains(e.target as Node)) this.closeContext();
    });
    this.define('inventory', 'Inventory', 470, 120, () => this.renderInventory());
    this.define('equipment', 'Equipment', 200, 120, () => this.renderEquipment());
    this.define('status', 'Character Status', 330, 90, () => this.renderStatus());
    this.define('skills', 'Skill Tree', 380, 60, () => this.renderSkills());
    this.define('quests', 'Quest Journal', 300, 80, () => this.renderQuests());
    this.define('worldMap', 'World Map', 240, 60, () => this.renderWorldMap());
    this.define('settings', 'Settings', 420, 70, () => this.renderSettings());
    this.define('shop', 'Shop', 16, 90, () => this.renderShop());
    this.define('storage', 'Storage', 16, 90, () => this.renderStorage());
    this.define('admin', 'GM / Admin Tools', 820, 70, () => this.renderAdmin());
    this.define('database', 'Database', 200, 50, () => this.renderDatabase());
    this.define('pet', 'Pet', 520, 90, () => this.renderPet());
  }

  get anyOpen() { return [...this.wins.values()].some((w) => w.open) || !!this.dialogEl || !!this.modalEl; }

  private define(id: WindowId, title: string, x: number, y: number, render: () => void) {
    const body = h('div', { class: 'wbody' });
    const titleBar = h('div', { class: 'wtitle' }, title, h('span', { class: 'x', onclick: () => this.close(id) }, '✕'));
    const el = h('div', { class: 'panel win hidden', id: `win-${id}`, style: { left: `${x}px`, top: `${y}px` } }, titleBar, body);
    el.addEventListener('mousedown', () => { el.style.zIndex = String(++this.z); });
    // Drag by title bar (positions are in the 1280x720 UI space).
    titleBar.addEventListener('mousedown', (e) => {
      const scale = this.app.uiScale;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
      const move = (ev: MouseEvent) => { el.style.left = `${Math.max(0, Math.min(1180, ox + (ev.clientX - sx) / scale))}px`; el.style.top = `${Math.max(0, Math.min(680, oy + (ev.clientY - sy) / scale))}px`; };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    this.root.appendChild(el);
    this.wins.set(id, { el, body, render, open: false });
  }

  open(id: WindowId) {
    const w = this.wins.get(id)!;
    w.open = true;
    w.el.classList.remove('hidden');
    w.el.style.zIndex = String(++this.z);
    w.render();
    audio.play('ui_open');
  }
  close(id: WindowId) {
    const w = this.wins.get(id)!;
    w.open = false;
    w.el.classList.add('hidden');
    this.hideTooltip();
    if (id === 'shop') this.shopId = null;
  }
  toggle(id: WindowId) { if (this.wins.get(id)!.open) this.close(id); else this.open(id); }
  isOpen(id: WindowId) { return this.wins.get(id)?.open ?? false; }
  closeAll() {
    for (const id of this.wins.keys()) this.close(id);
    this.closeDialog();
    this.closeContext();
  }
  /** Close the top-most thing; returns false if nothing was open. */
  closeTop(): boolean {
    if (this.ctxMenu) { this.closeContext(); return true; }
    if (this.modalEl && this.modalEl.dataset.dismissable === '1') { this.closeModal(); return true; }
    if (this.dialogEl) { this.closeDialog(); return true; }
    let top: [WindowId, WinState] | null = null;
    for (const e of this.wins) if (e[1].open && (!top || Number(e[1].el.style.zIndex) > Number(top[1].el.style.zIndex))) top = e;
    if (top) { this.close(top[0]); return true; }
    return false;
  }
  refresh() { for (const w of this.wins.values()) if (w.open) w.render(); }

  // ---------------------------------------------------------------- tooltip / context
  showTooltip(e: MouseEvent, content: HTMLElement[]) {
    setChildren(this.tooltip, content);
    this.tooltip.classList.remove('hidden');
    const r = this.root.getBoundingClientRect(), s = this.app.uiScale;
    let x = (e.clientX - r.left) / s + 16, y = (e.clientY - r.top) / s + 12;
    if (x > 1280 - 290) x -= 310;
    if (y > 720 - 220) y -= 200;
    this.tooltip.style.left = `${x}px`; this.tooltip.style.top = `${y}px`;
  }
  hideTooltip() { this.tooltip.classList.add('hidden'); }

  private openContext(e: MouseEvent, items: [string, () => void][]) {
    this.closeContext();
    const r = this.root.getBoundingClientRect(), s = this.app.uiScale;
    this.ctxMenu = h('div', { class: 'panel ctx-menu', style: { left: `${(e.clientX - r.left) / s}px`, top: `${(e.clientY - r.top) / s}px` } },
      items.map(([label, fn]) => h('div', { onclick: () => { this.closeContext(); fn(); } }, label)));
    this.root.appendChild(this.ctxMenu);
  }
  private closeContext() { this.ctxMenu?.remove(); this.ctxMenu = null; }

  itemTooltip(def: ItemDef, inst?: ItemInstance): HTMLElement[] {
    const w = this.app.world!;
    const optCol = ['', '#7fb0ff', '#5ad8c8', '#c9a6ff'][Math.min(3, inst?.options?.length ?? 0)];
    const out: HTMLElement[] = [h('div', { class: 'tn', style: { color: optCol || RARITY_COLOR[def.rarity] } }, itemDisplayName(def, inst))];
    const typeLine = def.type === 'equipment'
      ? `${def.rarity} ${def.weaponType ?? def.slot}${def.weaponLevel ? ` · Weapon Lv ${def.weaponLevel}` : ''}${def.twoHanded ? ' (two-handed)' : ''}${(inst?.element ?? def.element) ? ` · ${inst?.element ?? def.element}` : ''}`
      : `${def.rarity} ${def.type}`;
    out.push(h('div', { class: 'tt' }, typeLine));
    for (const line of modsText(def.mods)) out.push(h('div', { class: 'good' }, line));
    if (def.card) {
      out.push(h('div', { class: 'tt' }, `Compounds into: ${def.card.equip}`));
      for (const line of modsText(def.card.mods)) out.push(h('div', { class: 'good' }, line));
    }
    for (const ac of [def.autocast, def.card?.autocast]) if (ac) out.push(h('div', { style: 'color:#7fd6ff' }, `${ac.chancePct}% on hit: cast ${w.data.skills.get(ac.skillId)?.name ?? ac.skillId} Lv.${ac.level}`));
    const active = new Set(w.stats.activeCombos);
    for (const cb of w.data.combos.values()) if (cb.parts.includes(def.id)) {
      out.push(h('div', { style: `color:${active.has(cb.id) ? '#6fe08a' : '#b0a890'}` }, `${active.has(cb.id) ? '✓' : '○'} ${cb.name}: ${modsText(cb.mods).join(', ')}`));
      out.push(h('div', { class: 'muted', style: 'font-size:10px' }, `   with ${cb.parts.filter((x) => x !== def.id).map((x) => w.data.items.get(x)?.name ?? x).join(' + ')}`));
    }
    for (const o of inst?.options ?? []) out.push(h('div', { style: `color:${optCol}` }, `✦ ${optionLabel(o)}`));
    if (inst?.crafter) out.push(h('div', { class: 'muted' }, `Forged by ${inst.crafter}${inst.starCrumbs ? ` · +${CRUMB_ATK[inst.starCrumbs]} ATK from star crumbs` : ''}`));
    for (const cardId of inst?.cards ?? []) {
      const cd = w.data.items.get(cardId);
      if (cd?.card) out.push(h('div', { style: 'color:#c9a6ff' }, `◆ ${cd.name}: ${modsText(cd.card.mods).join(', ')}`));
    }
    if (def.cardSlots && !inst) out.push(h('div', { class: 'muted' }, `${def.cardSlots} card slot${def.cardSlots > 1 ? 's' : ''}`));
    if (def.attackRange && def.slot === 'weapon') out.push(h('div', {}, `Range ${def.attackRange} · ${def.attackKind}`));
    if (def.use) for (const u of def.use) {
      if (u.type === 'heal') out.push(h('div', { class: 'good' }, `Restores ${[u.hp ? `${u.hp} HP` : '', u.mp ? `${u.mp} MP` : ''].filter(Boolean).join(' & ')}`));
    }
    if (inst?.pet) out.push(h('div', { style: 'color:#ffb0d8' }, `♥ ${inst.pet.name} · ${intimacyLabel(inst.pet.intimacy)} (${inst.pet.intimacy}/1000) · ${hungerLabel(inst.pet.hunger)}`));
    if (def.lure) out.push(h('div', { class: 'muted' }, 'Target the monster, then use this item.'));
    out.push(h('div', { style: 'margin-top:4px' }, def.description));
    if (def.type === 'equipment') {
      const chk = canEquip(w.data, w.char, def);
      if (def.equipLevel && def.equipLevel > 1) out.push(h('div', { class: w.char.baseLevel >= def.equipLevel ? 'muted' : 'bad' }, `Requires Lv.${def.equipLevel}`));
      if (def.classes) out.push(h('div', { class: def.classes.includes(w.char.classId) ? 'muted' : 'bad' }, `Class: ${def.classes.map((c) => w.data.classes.get(c)?.name).join(', ')}`));
      if (!chk.ok && !def.classes && !(def.equipLevel && def.equipLevel > w.char.baseLevel)) out.push(h('div', { class: 'bad' }, chk.error));
    }
    out.push(h('div', { class: 'tt', style: 'margin-top:4px' }, `Weight ${def.weight} · Sell ${sellPrice(w.data, def.id, w.char)} Luma${inst?.bound || def.bound ? ' · Bound' : ''}${inst?.locked ? ' · Locked' : ''}`));
    return out;
  }

  /** Enchanter: pick unequipped equipment, then add one random option or reroll all. */
  private enchantDialog(uid?: string) {
    const w = this.app.world!, d = w.data, c = w.char;
    if (!uid) {
      const items = c.inventory.filter((i) => d.items.get(i.itemId)?.type === 'equipment');
      this.modal('Enchant equipment', [
        h('p', { class: 'muted', style: 'max-width:420px' }, `Add a random option (${ENCHANT_COST} Luma, up to ${MAX_OPTIONS}) or reroll every option (${REROLL_COST} Luma). Only unequipped items in your bag can be enchanted.`),
        ...(items.length ? items.map((i) => h('button', { class: 'btn small', style: 'display:block;width:100%;margin:2px 0;text-align:left', onclick: () => this.enchantDialog(i.uid) },
          `${itemDisplayName(d.items.get(i.itemId)!, i)}${i.options?.length ? ` · ${i.options.length} option${i.options.length > 1 ? 's' : ''}` : ''}`)) : [h('p', {}, 'No unequipped equipment in your bag.')]),
      ], [['Close', () => this.closeModal()]], true);
      return;
    }
    const inst = c.inventory.find((i) => i.uid === uid);
    if (!inst) { this.enchantDialog(); return; }
    const def = d.items.get(inst.itemId)!;
    this.modal(itemDisplayName(def, inst), [
      h('div', { style: 'min-width:340px' },
        ...(inst.options?.length ? inst.options.map((o) => h('div', { style: 'color:#c9a6ff' }, `✦ ${optionLabel(o)}`)) : [h('div', { class: 'muted' }, 'No options yet.')]),
        h('div', { class: 'muted', style: 'margin-top:6px' }, `You have ${c.luma} Luma.`)),
    ], [
      [`Add option (${ENCHANT_COST})`, () => { w.enchant(uid, 'add'); this.enchantDialog(uid); }],
      [`Reroll all (${REROLL_COST})`, () => { w.enchant(uid, 'reroll'); this.enchantDialog(uid); }],
      ['Back', () => this.enchantDialog()],
    ], true);
  }

  /** Forging: recipe list → materials, optional element stone and star crumbs, live success chance. */
  private forgeDialog(recipeId?: string, stone = '', crumbs = 0) {
    const w = this.app.world!, d = w.data, c = w.char;
    const name = (id: string) => d.items.get(id)?.name ?? id;
    if (!recipeId) {
      const rows = [...d.recipes.values()].map((r) => {
        const def = d.items.get(r.itemId)!;
        const ready = canForge(d, c, { recipeId: r.id }).ok;
        return h('button', { class: 'btn small', style: `display:block;width:100%;margin:2px 0;text-align:left;${ready ? '' : 'opacity:0.7'}`, onclick: () => this.forgeDialog(r.id) },
          `${def.name} (Weapon Lv ${def.weaponLevel ?? 1})${ready ? ' ✔' : ''}`);
      });
      this.modal('Forge a weapon', [h('p', { class: 'muted', style: 'max-width:420px' }, 'Pick a weapon. Materials and the fee are used up even if forging fails. Forged weapons have no card slots but carry your name.'), ...rows], [['Close', () => this.closeModal()]], true);
      return;
    }
    const r = d.recipes.get(recipeId)!, def = d.items.get(r.itemId)!;
    const choice = { recipeId, stone: stone || undefined, crumbs };
    const chance = Math.round(forgeChance(d, c, choice) * 100);
    const check = canForge(d, c, choice);
    const stones = Object.keys(ELEMENT_STONES).filter((id) => countItem(c, id) > 0);
    const stoneSel = h('select', { id: 'forge-stone' }, h('option', { value: '' }, 'No element'), stones.map((id) => h('option', { value: id }, `${name(id)} → ${ELEMENT_STONES[id]}`)));
    stoneSel.value = stone;
    stoneSel.addEventListener('change', () => this.forgeDialog(recipeId, stoneSel.value, crumbs));
    const maxCrumbs = Math.min(3, countItem(c, STAR_CRUMB));
    const crumbSel = h('select', { id: 'forge-crumbs' }, [0, 1, 2, 3].filter((n) => n <= maxCrumbs).map((n) => h('option', { value: String(n) }, n ? `${n} Star Crumb (+${CRUMB_ATK[n]} ATK)` : 'No star crumbs')));
    crumbSel.value = String(Math.min(crumbs, maxCrumbs));
    crumbSel.addEventListener('change', () => this.forgeDialog(recipeId, stone, Number(crumbSel.value)));
    this.modal(`Forge ${def.name}`, [
      h('div', { style: 'min-width:380px' },
        ...r.materials.map((m) => h('div', { class: countItem(c, m.itemId) >= m.qty ? 'good' : 'bad' }, `${name(m.itemId)}: ${countItem(c, m.itemId)} / ${m.qty}`)),
        h('div', { class: c.luma >= r.fee ? 'good' : 'bad' }, `Fee: ${r.fee} Luma`),
        h('div', { class: 'row', style: 'margin-top:6px' }, stoneSel, crumbSel),
        h('div', { style: 'margin-top:6px;font-weight:bold' }, `Success chance: ${chance}%`),
        h('div', { class: 'muted', style: 'font-size:11px' }, '50% + Job Lv×0.2 + DEX×0.1 + LUK×0.1 + forge bonus 20%; −20/−30% for Lv 2/3 weapons, −20% with an element, −15% per star crumb.'),
        check.ok ? null : h('div', { class: 'bad' }, check.error)),
    ], [
      ['Forge', () => { if (!check.ok) return; const res = w.forge(choice); if (res.ok) this.app.hud?.banner(res.success ? 'Forged!' : 'Forging failed', res.message!); this.forgeDialog(recipeId, stone, crumbs); }],
      ['Back', () => this.forgeDialog()],
    ], true);
  }

  /** Pick an unequipped item with a free slot of the right type, confirm, compound (permanent). */
  private compoundDialog(card: ItemInstance) {
    const w = this.app.world!, d = w.data, cardDef = d.items.get(card.itemId)!;
    const targets = compoundTargets(d, w.char, card.itemId);
    const rows = targets.map((t) => {
      const def = d.items.get(t.itemId)!;
      return h('button', { class: 'btn small', style: 'display:block;width:100%;margin:3px 0;text-align:left', onclick: () => {
        this.closeModal();
        this.confirmAction('Compound card', `Compound ${cardDef.name} into ${itemDisplayName(def, t)}? This is permanent: the card cannot be removed, and it is lost if the item is ever destroyed.`, 'Compound', () => w.compound(card.uid, t.uid));
      } }, itemDisplayName(def, t));
    });
    this.modal(`Compound ${cardDef.name}`, [
      h('p', {}, `${modsText(cardDef.card!.mods).join(', ')} — fits ${cardDef.card!.equip} equipment.`),
      ...(rows.length ? rows : [h('p', { class: 'muted' }, `No unequipped ${cardDef.card!.equip} with a free card slot in your bag. Unequip the item first.`)]),
    ], [['Close', () => this.closeModal()]], true);
  }

  // ---------------------------------------------------------------- inventory
  private renderInventory() {
    const w = this.app.world!;
    const body = this.wins.get('inventory')!.body;
    const filters: [typeof this.invFilter, string][] = [['all', 'All'], ['equipment', 'Equip'], ['consumable', 'Use'], ['material', 'Material'], ['card', 'Card'], ['quest', 'Quest']];
    const items = filterInventory(w.data, w.char, this.invFilter);
    const slots = w.data.balance.economy.inventorySlots;
    const grid = h('div', { class: 'inv-grid' });
    for (let i = 0; i < slots; i++) {
      const inst = items[i];
      const el = h('div', { class: 'islot' });
      if (inst) {
        const def = w.data.items.get(inst.itemId)!;
        el.draggable = true;
        el.style.borderColor = def.rarity !== 'common' ? RARITY_COLOR[def.rarity] + '88' : '';
        el.append(h('img', { src: itemIconUrl(def) }), inst.qty > 1 ? h('span', { class: 'q' }, String(inst.qty)) : '', inst.locked ? h('span', { class: 'lock' }, '🔒') : '');
        el.addEventListener('dragstart', (e) => { setDragData(e, { type: 'inv', id: inst.uid }); this.hideTooltip(); });
        el.addEventListener('dblclick', () => this.useOrEquip(inst));
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const actions: [string, () => void][] = [];
          if (def.type === 'consumable') actions.push(['Use', () => this.useOrEquip(inst)]);
          if (def.type === 'equipment') actions.push(['Equip', () => this.useOrEquip(inst)]);
          if (def.type === 'consumable') actions.push(['Add to hotbar', () => this.app.assignHotbar(-1, { type: 'item', id: def.id })]);
          if (def.card) actions.push(['Compound into…', () => this.compoundDialog(inst)]);
          if (this.shopId) actions.push(['Sell', () => this.sellPrompt(inst)]);
          if (this.isOpen('storage')) actions.push(['Store', () => this.qtyPrompt(inst, 'Store how many?', (n) => w.deposit(inst.uid, n))]);
          actions.push([inst.locked ? 'Unlock' : 'Lock', () => w.lock(inst.uid)]);
          actions.push(['Drop', () => this.qtyPrompt(inst, 'Drop how many?', (n) => w.dropItem(inst.uid, n))]);
          this.openContext(e, actions);
        });
      }
      grid.appendChild(el);
    }
    // Drop items from equipment back into the bag.
    grid.addEventListener('dragover', (e) => e.preventDefault());
    grid.addEventListener('drop', (e) => {
      const d = getDragData(e);
      if (d?.type === 'equip') { e.preventDefault(); w.unequip(d.id as EquipSlot); }
    });
    const weight = inventoryWeight(w.data, w.char);
    setChildren(body,
      h('div', { class: 'filters' },
        filters.map(([f, label]) => h('span', { class: `choice${this.invFilter === f ? ' on' : ''}`, onclick: () => { this.invFilter = f; this.renderInventory(); } }, label)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => w.sort('type') }, 'Sort: Type'),
        h('button', { class: 'btn small', onclick: () => w.sort('name') }, 'Name'),
        h('button', { class: 'btn small', onclick: () => w.sort('rarity') }, 'Rarity')),
      grid,
      h('div', { class: 'row', style: 'margin-top:8px;font-size:12px' },
        h('span', {}, `Slots ${w.char.inventory.length}/${slots}`),
        h('span', { class: weight > w.weightLimit * 0.7 ? 'bad' : 'muted' }, `Weight ${weight} / ${w.weightLimit}${weight > w.weightLimit * 0.7 ? ' (no regen)' : ''}`),
        h('span', { class: 'spacer' }),
        h('span', { class: 'gold' }, `${w.char.luma.toLocaleString()} Luma`)),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' }, 'Double-click to use/equip · Right-click for options · Drag to hotbar or equipment'),
    );
  }

  private useOrEquip(inst: ItemInstance) {
    const w = this.app.world!;
    const def = w.data.items.get(inst.itemId)!;
    if (def.type === 'equipment') w.equip(inst.uid); else w.useItem(inst.uid);
  }

  private qtyPrompt(inst: ItemInstance, msg: string, fn: (n: number) => void) {
    if (inst.qty === 1) { fn(1); return; }
    this.askNumber(msg, inst.qty, fn);
  }

  /** In-game number input dialog (browser prompt() is not used). */
  askNumber(title: string, max: number, onOk: (n: number) => void) {
    const input = h('input', { class: 'text-input', id: 'qty-input', type: 'number', min: 1, max, value: max, style: 'width:120px;text-align:center' });
    const err = h('div', { class: 'error-text' });
    const submit = () => {
      const n = Math.floor(Number(input.value));
      if (!(n >= 1 && n <= max)) { err.textContent = `Enter a number from 1 to ${max}.`; return; }
      this.closeModal();
      onOk(n);
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); if (e.key === 'Escape') this.closeModal(); });
    this.modal(title, [h('div', { class: 'muted' }, `1 – ${max}`), input, err], [['OK', submit], ['Cancel', () => this.closeModal()]], true);
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  /** In-game confirmation dialog (browser confirm() is not used). */
  confirmAction(title: string, text: string, okLabel: string, onOk: () => void) {
    this.modal(title, [h('p', {}, text)], [[okLabel, () => { this.closeModal(); onOk(); }], ['Cancel', () => this.closeModal()]], true);
  }

  /** Confirmation that requires typing an exact word (e.g. a character name before deletion). */
  confirmTyped(title: string, text: string, expected: string, okLabel: string, onOk: () => void) {
    const input = h('input', { class: 'text-input', id: 'confirm-input', placeholder: expected, style: 'margin-top:6px' });
    const btnRow: [string, () => void][] = [[okLabel, () => { if (input.value.trim() === expected) { this.closeModal(); onOk(); } else { input.style.borderColor = 'var(--bad)'; } }], ['Cancel', () => this.closeModal()]];
    input.addEventListener('keydown', (e) => e.stopPropagation());
    this.modal(title, [h('p', {}, text), input], btnRow, true);
    setTimeout(() => input.focus(), 0);
  }

  private sellPrompt(inst: ItemInstance) {
    const w = this.app.world!;
    this.qtyPrompt(inst, 'Sell how many?', (n) => w.sell(inst.uid, n));
  }

  // ---------------------------------------------------------------- equipment
  private renderEquipment() {
    const w = this.app.world!;
    const body = this.wins.get('equipment')!.body;
    const slotEl = (slot: EquipSlot) => {
      const inst = w.char.equipment[slot];
      const def = inst ? w.data.items.get(inst.itemId)! : null;
      const el = h('div', { class: 'eslot', title: slot }, def ? h('img', { src: itemIconUrl(def) }) : null, h('span', { class: 'lbl' }, slot.replace('accessory', 'acc ')));
      if (def && inst) {
        el.draggable = true;
        el.addEventListener('dragstart', (e) => setDragData(e, { type: 'equip', id: slot }));
        el.addEventListener('dblclick', () => w.unequip(slot));
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); w.unequip(slot); });
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
      }
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('over');
        const d = getDragData(e);
        if (d?.type === 'inv') w.equip(d.id, slot);
      });
      return el;
    };
    const prev = new SpritePreview(120, 160, 'equip-preview');
    prev.setLook(lookForCharacter(w.data, w.char));
    setChildren(body,
      h('div', { class: 'equip-layout' },
        slotEl('headgear'), prev.canvas, slotEl('accessory1'),
        slotEl('armor'), slotEl('accessory2'),
        slotEl('weapon'), slotEl('shield'),
        slotEl('garment'), slotEl('boots')),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:8px;text-align:center' }, 'Drag items here · Double-click a slot to unequip'),
      h('table', { class: 'stat-table', style: 'margin-top:6px' },
        h('tr', {}, h('td', {}, 'ATK'), h('td', { class: 'v' }, String(w.stats.patk)), h('td', {}, 'DEF'), h('td', { class: 'v' }, String(w.stats.pdef))),
        h('tr', {}, h('td', {}, 'MATK'), h('td', { class: 'v' }, String(w.stats.matk)), h('td', {}, 'MDEF'), h('td', { class: 'v' }, String(w.stats.mdef)))),
    );
    void EQUIP_SLOTS;
  }

  // ---------------------------------------------------------------- status
  private renderStatus() {
    const w = this.app.world!;
    const c = w.char, s = w.stats;
    const cls = w.data.classes.get(c.classId)!;
    const body = this.wins.get('status')!.body;
    const statRow = (k: StatKey) => {
      const bonus = s.totalStats[k] - c.stats[k];
      return h('tr', {},
        h('td', {}, k.toUpperCase()),
        h('td', { class: 'v' }, String(c.stats[k]), bonus ? h('span', { class: bonus > 0 ? 'good' : 'bad' }, ` ${bonus > 0 ? '+' : ''}${bonus}`) : ''),
        h('td', {}, h('button', {
          class: 'btn small', id: `alloc-${k}`, title: `Costs ${statRaiseCost(w.data, c.stats[k])} point(s). Shift-click: up to 10.`, disabled: !canRaiseStat(w.data, c, k),
          onclick: (e: MouseEvent) => {
            // Raise as many times as affordable (Ragnarok cost grows every 10 points).
            let n = 0, left = c.statPoints;
            while (n < (e.shiftKey ? 10 : 1) && left >= statRaiseCost(w.data, c.stats[k] + n)) { left -= statRaiseCost(w.data, c.stats[k] + n); n++; }
            if (n) w.allocate(k, n);
          },
        }, '+')),
        h('td', { class: 'muted', style: 'font-size:10px' }, `${statRaiseCost(w.data, c.stats[k])}pt`));
    };
    const d = (label: string, v: string | number) => h('tr', {}, h('td', {}, label), h('td', { class: 'v' }, String(v)));
    setChildren(body,
      h('div', { class: 'row', style: 'margin-bottom:8px' },
        h('div', {}, h('div', { style: 'font-size:16px;font-weight:bold' }, c.name), h('div', { class: 'muted' }, `${cls.name} — ${cls.role}`))),
      h('div', { class: 'row', style: 'align-items:flex-start;gap:16px' },
        h('table', { class: 'stat-table', style: 'width:150px' }, STAT_KEYS.map(statRow),
          h('tr', {}, h('td', { class: 'gold' }, 'Points'), h('td', { class: 'v gold' }, String(c.statPoints)), h('td', {}))),
        h('table', { class: 'stat-table', style: 'width:200px' },
          d('HP', `${c.hp} / ${s.maxHp}`), d('MP', `${c.mp} / ${s.maxMp}`), d('ATK', s.patk), d('MATK', s.matk), d('DEF', s.pdef), d('MDEF', s.mdef),
          d('HIT', s.hit), d('FLEE', s.flee), d('CRIT', `${s.crit.toFixed(1)}%`), d('Crit DMG', `${s.critDmg}%`),
          d('ASPD', `${s.aspd} (${(1000 / s.attackIntervalMs).toFixed(2)}/s)`), d('Move Speed', Math.round(s.moveSpeed)),
          d('Cast Time', `${Math.round(s.castTimeMul * 100)}%`), d('Cooldown -', `${s.cdrPct}%`), d('Range', s.attackRange))),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:8px' },
        `Base Lv ${c.baseLevel} (${c.baseExp}/${expToNextBase(w.data, c.baseLevel)}) · Job Lv ${c.jobLevel}/${cls.maxJobLevel} (${c.jobExp}/${expToNextJob(w.data, c.jobLevel)})`),
      h('div', { class: 'muted', style: 'font-size:11px' }, 'STR: ATK & weight · AGI: attack speed & FLEE · VIT: HP & DEF · INT: MATK & MP · DEX: HIT & cast speed · LUK: CRIT. Shift-click + adds 10.'),
      h('div', { class: 'muted', style: 'font-size:11px' }, `Kills ${c.stats_meta.kills} · Deaths ${c.stats_meta.deaths} · Played ${Math.floor(c.stats_meta.playTimeMs / 60000)} min`),
    );
  }

  // ---------------------------------------------------------------- skills
  private renderSkills() {
    const w = this.app.world!;
    const c = w.char;
    const body = this.wins.get('skills')!.body;
    const lineage = classLineage(w.data, c.classId);
    const sections = lineage.map((clsId) => {
      const cls = w.data.classes.get(clsId)!;
      return h('div', {},
        h('div', { class: 'gold', style: 'margin:8px 0 2px;font-weight:bold' }, `${cls.name} Skills`),
        cls.skills.map((sid) => {
          const sk = w.data.skills.get(sid)!;
          const lvl = c.skills[sid] ?? 0;
          const chk = skillCheck(w.data, c, sk);
          const reqs = [
            ...(sk.requires ?? []).map((r) => `${w.data.skills.get(r.skillId)?.name} Lv.${r.level}`),
            sk.requiresJobLevel ? `Job Lv.${sk.requiresJobLevel}` : '',
            sk.requiresWeapon ? `${sk.requiresWeapon.join('/')}` : '',
          ].filter(Boolean);
          const img = h('img', { src: skillIconUrl(sk), draggable: lvl > 0 && sk.kind !== 'passive', title: lvl > 0 ? 'Drag to the hotbar' : '' });
          img.addEventListener('dragstart', (e) => setDragData(e, { type: 'skill', id: sid }));
          img.addEventListener('dblclick', () => { if (lvl > 0 && sk.kind !== 'passive') this.app.assignHotbar(-1, { type: 'skill', id: sid }); });
          const mp = sk.kind === 'passive' ? '' : ` · MP ${w.skillMpCost(sk, Math.max(1, lvl))}`;
          const timing = sk.kind === 'passive' ? 'Passive' : `${sk.castTimeMs ? `Cast ${(sk.castTimeMs / 1000).toFixed(1)}s · ` : ''}CD ${(sk.cooldownMs / 1000).toFixed(1)}s${mp}`;
          return h('div', { class: `skill${lvl === 0 ? ' locked' : ''}` },
            img,
            h('div', {},
              h('div', { class: 'sn' }, sk.name, h('span', { class: 'muted', style: 'font-weight:normal' }, `  Lv ${lvl}/${sk.maxLevel}  · ${sk.kind}`)),
              h('div', { class: 'sd' }, sk.description),
              h('div', { class: 'sd' }, timing),
              reqs.length ? h('div', { class: 'req' }, `Requires: ${reqs.join(', ')}`) : null),
            h('button', { class: 'btn small', disabled: !chk.ok, title: chk.ok ? 'Learn / level up' : chk.error, onclick: () => w.learn(sid) }, '+'));
        }));
    });
    setChildren(body,
      h('div', { class: 'row' }, h('span', { class: 'gold' }, `Skill Points: ${c.skillPoints}`), h('span', { class: 'spacer' }),
        h('span', { class: 'muted', style: 'font-size:11px' }, 'Drag learned skills onto the hotbar')),
      h('div', { style: 'width:470px' }, sections));
  }

  // ---------------------------------------------------------------- quests
  private renderQuests() {
    const w = this.app.world!;
    const body = this.wins.get('quests')!.body;
    const active = activeQuests(w.data, w.char);
    const done = Object.values(w.char.quests).filter((p) => p.status === 'completed').map((p) => w.data.quests.get(p.questId)!).filter(Boolean);
    if (!this.selectedQuest && active[0]) this.selectedQuest = active[0].def.id;
    const sel = this.selectedQuest ? w.data.quests.get(this.selectedQuest) : null;
    const prog = sel ? w.char.quests[sel.id] : null;
    const item = (q: QuestDef) => h('div', { class: `qi${q.id === this.selectedQuest ? ' on' : ''}`, onclick: () => { this.selectedQuest = q.id; this.renderQuests(); } },
      h('span', { class: `tag ${q.category}` }, q.category), q.name, w.char.quests[q.id]?.status === 'ready' ? ' ✔' : '');
    setChildren(body,
      h('div', { style: 'display:grid;grid-template-columns:220px 320px;gap:12px' },
        h('div', { class: 'quest-list' },
          h('div', { class: 'gold', style: 'font-weight:bold' }, `Active (${active.length})`),
          active.map((a) => item(a.def)),
          h('div', { class: 'gold', style: 'font-weight:bold;margin-top:8px' }, `Completed (${done.length})`),
          done.map(item)),
        sel ? h('div', {},
          h('div', { style: 'font-size:15px;font-weight:bold' }, sel.name),
          h('div', { class: 'muted', style: 'margin:4px 0 8px' }, sel.summary),
          h('div', { class: 'gold' }, 'Objectives'),
          sel.objectives.map((o, i) => {
            const n = objectiveTarget(o), cnt = prog?.counts[i] ?? 0;
            return h('div', { class: prog?.status === 'completed' || cnt >= n ? 'good' : '' }, `• ${o.label}${n > 1 ? ` (${Math.min(cnt, n)}/${n})` : ''}`);
          }),
          h('div', { class: 'muted', style: 'margin-top:6px' }, `Given by ${w.data.npcs.get(sel.giverNpc)?.name} · Turn in to ${w.data.npcs.get(sel.turnInNpc)?.name}`),
          h('div', { class: 'gold', style: 'margin-top:8px' }, 'Rewards'),
          h('div', { style: 'font-size:12px' }, rewardText(this.app, sel)),
          prog && prog.status !== 'completed' && sel.category !== 'main'
            ? h('button', { class: 'btn small danger', style: 'margin-top:10px', onclick: () => { w.abandon(sel.id); this.selectedQuest = null; this.renderQuests(); } }, 'Abandon') : null,
        ) : h('div', { class: 'muted' }, 'No quest selected.')));
  }

  // ---------------------------------------------------------------- world map
  private renderWorldMap() {
    const w = this.app.world!;
    const body = this.wins.get('worldMap')!.body;
    const box = h('div', { class: 'worldmap' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const MW = 760, MH = 460;
    svg.setAttribute('width', String(MW)); svg.setAttribute('height', String(MH));
    svg.style.position = 'absolute'; svg.style.inset = '0';
    for (const m of w.data.maps.values()) for (const p of m.portals) {
      const t = w.data.maps.get(p.targetMap)!;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(m.worldMapPos.x * MW)); line.setAttribute('y1', String(m.worldMapPos.y * MH));
      line.setAttribute('x2', String(t.worldMapPos.x * MW)); line.setAttribute('y2', String(t.worldMapPos.y * MH));
      line.setAttribute('stroke', '#c8a26b'); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-dasharray', '5 4'); line.setAttribute('opacity', '0.7');
      svg.appendChild(line);
    }
    box.appendChild(svg);
    for (const m of w.data.maps.values()) {
      const here = m.id === w.map.def.id;
      const col = m.type === 'town' ? '#ffd34d' : m.type === 'field' ? '#6fe08a' : '#ff6a5a';
      const node = h('div', { class: `wm-node ${m.type}${here ? ' here' : ''}`, title: `${m.name} — ${m.region}${m.levelRange ? ` (Lv.${m.levelRange[0]}–${m.levelRange[1]})` : ''}`, style: { left: `${m.worldMapPos.x * MW}px`, top: `${m.worldMapPos.y * MH}px` } },
        h('div', { class: 'dot', style: { background: col } }),
        h('div', { class: 'wm-name' }, m.type === 'town' ? m.name.replace(/^(Royal Capital|Tower City|Desert City|Port Town|Snow Town) /, '').replace(/ Village$/, '') : m.name),
        m.levelRange ? h('div', { class: 'muted' }, `Lv.${m.levelRange[0]}–${m.levelRange[1]}`) : null);
      box.appendChild(node);
    }
    setChildren(body, box, h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px;display:flex;gap:14px' },
      h('span', {}, h('b', { style: 'color:#ffd34d' }, '●'), ' Town'), h('span', {}, h('b', { style: 'color:#6fe08a' }, '●'), ' Field'), h('span', {}, h('b', { style: 'color:#ff6a5a' }, '●'), ' Dungeon'),
      h('span', {}, `You are in ${w.map.def.name} — ${w.map.def.region}. Hover a place for details; Courier Guild NPCs warp between towns.`)));
  }

  // ---------------------------------------------------------------- settings
  private renderSettings() {
    const app = this.app;
    const st = app.settings;
    const body = this.wins.get('settings')!.body;
    const slider = (key: keyof typeof st.volume, label: string) => {
      const val = h('span', {}, `${Math.round(st.volume[key] * 100)}`);
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(st.volume[key] * 100) });
      input.addEventListener('input', () => { st.volume[key] = Number(input.value) / 100; val.textContent = input.value; app.applySettings(); });
      return h('div', { class: 'range-row' }, h('span', {}, label), input, val);
    };
    const toggle = (key: 'showDamageNumbers' | 'autoLoot' | 'showCollision' | 'wasdMovement', label: string) => {
      const cb = h('input', { type: 'checkbox', checked: st[key] });
      cb.addEventListener('change', () => { st[key] = cb.checked; app.applySettings(); });
      return h('label', { class: 'row', style: 'margin-bottom:4px' }, cb, label);
    };
    const binds = Object.keys(DEFAULT_KEYBINDS).map((action) => {
      const btn = h('button', { class: `btn small${this.listening === action ? ' listening' : ''}` }, this.listening === action ? 'Press a key…' : app.keyLabel(action));
      btn.addEventListener('click', () => { this.listening = action; this.renderSettings(); });
      return h('div', { class: 'keybind' }, h('span', {}, action), btn);
    });
    setChildren(body,
      h('div', { style: 'width:380px' },
        h('div', { class: 'gold', style: 'font-weight:bold' }, 'Audio'),
        slider('master', 'Master'), slider('music', 'Music'), slider('sfx', 'SFX'), slider('ambient', 'Ambient'),
        h('div', { class: 'gold', style: 'font-weight:bold;margin-top:8px' }, 'Gameplay'),
        toggle('showDamageNumbers', 'Show damage numbers'), toggle('autoLoot', 'Auto-loot drops'), toggle('wasdMovement', 'WASD movement'),
        toggle('showCollision', 'Show collision / spawn debug overlay'),
        h('div', { class: 'gold', style: 'font-weight:bold;margin-top:8px' }, 'Key Bindings'),
        h('div', { style: 'max-height:180px;overflow:auto;padding-right:6px' }, binds),
        h('button', { class: 'btn small', style: 'margin-top:4px', onclick: () => { st.keybinds = { ...DEFAULT_KEYBINDS }; app.applySettings(); this.renderSettings(); } }, 'Reset key bindings'),
        app.world ? h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'btn primary', onclick: () => app.saveNow(true) }, 'Save Game'),
          h('button', { class: 'btn', onclick: () => app.exitToSelect() }, 'Character Select')) : null));
  }

  // ---------------------------------------------------------------- database (monsters / items / cards)
  private db = { tab: 'monsters' as 'monsters' | 'items' | 'cards', q: '', filter: '', sel: '' };
  // ---------------------------------------------------------------- pet
  private renderPet() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('pet')!.body;
    const bar = (v: number, max: number, col: string) => h('div', { style: 'height:8px;background:#2a2433;border-radius:4px;overflow:hidden;width:180px' },
      h('div', { style: `height:100%;width:${Math.round((v / max) * 100)}%;background:${col}` }));
    const pet = c.pet;
    if (!pet) {
      const eggs = c.inventory.filter((i) => d.items.get(i.itemId)?.petEgg);
      setChildren(body, h('div', { style: 'width:300px' },
        h('div', { class: 'muted' }, 'You have no pet out.'),
        eggs.length ? h('div', { style: 'margin-top:6px' }, eggs.map((e) => h('div', { class: 'row', style: 'margin:3px 0' },
          h('span', {}, `${d.items.get(e.itemId)!.name}${e.pet ? ` — ${e.pet.name} (${intimacyLabel(e.pet.intimacy)})` : ''}`), h('span', { class: 'spacer' }),
          h('button', { class: 'btn small', id: `pet-hatch-${e.uid}`, onclick: () => { w.hatchPet(e.uid); this.renderPet(); } }, 'Hatch'))))
          : h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px' },
            `How to tame: buy a monster's lure from the Pet Keeper in Fernhollow, weaken that monster, target it and use the lure. Tameable: ${[...d.pets.values()].map((p) => p.name).join(', ')}.`)));
      return;
    }
    const pd = d.pets.get(pet.petId)!;
    const food = d.items.get(pd.foodItem)!;
    const loyal = pet.intimacy >= LOYAL_AT;
    const name = h('input', { type: 'text', value: pet.name, maxlength: 16, style: 'width:120px', id: 'pet-name' }) as HTMLInputElement;
    setChildren(body, h('div', { style: 'width:300px' },
      h('div', { style: 'font-size:15px;font-weight:bold;color:#ffd8f0' }, `${pet.name}`, h('span', { class: 'muted', style: 'font-weight:normal;font-size:11px' }, `  ${pd.name}`)),
      h('div', { style: 'margin-top:6px' }, `Hunger: ${hungerLabel(pet.hunger)} (${pet.hunger}/100)`), bar(pet.hunger, 100, pet.hunger <= 25 ? '#e0a040' : '#6fe08a'),
      h('div', { style: 'margin-top:6px' }, `Intimacy: ${intimacyLabel(pet.intimacy)} (${pet.intimacy}/1000)`), bar(pet.intimacy, 1000, '#ff7aa8'),
      h('div', { style: 'margin-top:6px', class: loyal ? 'good' : 'muted' }, `Loyal bonus: ${pd.loyalText}${loyal ? ' (active)' : ' (inactive until Loyal)'}`),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `Food: ${food.name} (you have ${countItem(c, food.id)}). Feed it when Hungry or Neutral; feeding when Stuffed lowers intimacy, and so does starving or dying.`),
      h('div', { class: 'row', style: 'margin-top:8px;gap:6px' },
        h('button', { class: 'btn small', id: 'pet-feed', onclick: () => { w.feedPetCmd(); this.renderPet(); } }, `Feed ${food.name}`),
        h('button', { class: 'btn small', id: 'pet-egg', onclick: () => { w.petToEgg(); this.renderPet(); } }, 'Return to egg')),
      h('div', { class: 'row', style: 'margin-top:6px;gap:6px' }, name, h('button', { class: 'btn small', onclick: () => { w.renamePetCmd(name.value); this.renderPet(); } }, 'Rename'))));
  }

  private renderDatabase() {
    const w = this.app.world!, d = w.data, body = this.wins.get('database')!.body, st = this.db;
    const pct = (c: number) => (c >= 0.01 ? `${+(c * 100).toFixed(2)}%` : `${+(c * 100).toFixed(3)}%`);
    const itemName = (id: string) => d.items.get(id)?.name ?? id;
    const mapsOf = (monsterId: string) => [...d.maps.values()].filter((m) => m.monsterSpawns.some((s) => s.monsterId === monsterId) || (m.bossSpawn && d.bosses.get(m.bossSpawn.bossId)?.monsterId === monsterId)).map((m) => m.name);
    const droppedBy = (itemId: string) => [...d.monsters.values()].flatMap((m) => {
      const e = d.drops.get(m.dropTableId)?.entries.find((x) => x.itemId === itemId);
      return e ? [{ m, chance: e.chance }] : [];
    }).sort((a, b) => b.chance - a.chance);
    const link = (label: string, tab: typeof st.tab, id: string) => h('a', { href: '#', style: 'color:#7fd6ff', onclick: (e: MouseEvent) => { e.preventDefault(); Object.assign(st, { tab, sel: id }); this.renderDatabase(); } }, label);

    // List
    const q = st.q.toLowerCase();
    let rows: { id: string; label: string; sub: string }[] = [];
    let filters: [string, string][] = [];
    if (st.tab === 'monsters') {
      filters = [['', 'All races'], ...[...new Set([...d.monsters.values()].map((m) => m.race))].sort().map((r): [string, string] => [r, r])];
      rows = [...d.monsters.values()].filter((m) => (!st.filter || m.race === st.filter) && m.name.toLowerCase().includes(q))
        .sort((a, b) => a.level - b.level).map((m) => ({ id: m.id, label: `${m.name}`, sub: `Lv ${m.level} · ${m.element} ${m.elementLevel ?? 1} · ${m.size}${m.aiType === 'boss' ? ' · MVP' : m.elite ? ' · Elite' : ''}${m.looter ? ' · Looter' : ''}` }));
    } else {
      const cards = st.tab === 'cards';
      filters = cards ? [['', 'All slots'], ...['weapon', 'armor', 'shield', 'garment', 'boots', 'headgear', 'accessory'].map((s): [string, string] => [s, s])]
        : [['', 'All types'], ['equipment', 'equipment'], ['consumable', 'consumable'], ['material', 'material'], ...['weapon', 'armor', 'headgear', 'shield', 'garment', 'boots', 'accessory'].map((s): [string, string] => [`slot:${s}`, `· ${s}`])];
      rows = [...d.items.values()].filter((i) => (cards ? i.type === 'card' && (!st.filter || i.card?.equip === st.filter)
        : i.type !== 'card' && (!st.filter || (st.filter.startsWith('slot:') ? i.slot === st.filter.slice(5) : i.type === st.filter))) && i.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ id: i.id, label: i.name, sub: cards ? `${i.card!.equip}` : `${i.weaponType ?? i.slot ?? i.type}${i.weaponLevel ? ` · W.Lv ${i.weaponLevel}` : ''}` }));
    }
    if (!rows.some((r) => r.id === st.sel)) st.sel = rows[0]?.id ?? '';
    const search = h('input', { id: 'db-search', class: 'text-input', placeholder: 'Search…', value: st.q, style: 'width:100%' });
    search.addEventListener('input', () => { st.q = search.value; this.renderDatabase(); const el = document.getElementById('db-search') as HTMLInputElement | null; el?.focus(); el?.setSelectionRange(st.q.length, st.q.length); });
    const filt = h('select', { id: 'db-filter', style: 'width:100%' }, filters.map(([v, l]) => h('option', { value: v }, l)));
    filt.value = st.filter;
    filt.addEventListener('change', () => { st.filter = filt.value; this.renderDatabase(); });
    const list = h('div', { style: 'height:330px;overflow:auto;margin-top:4px' }, rows.map((r) => h('div', {
      class: 'db-row', style: `padding:3px 5px;cursor:pointer;border-radius:3px;${r.id === st.sel ? 'background:rgba(255,211,77,0.18)' : ''}`,
      onclick: () => { st.sel = r.id; this.renderDatabase(); },
    }, h('div', {}, r.label), h('div', { class: 'muted', style: 'font-size:10px' }, r.sub))));

    // Detail
    const detail: HTMLElement[] = [];
    const kv = (k: string, v: string | number) => h('tr', {}, h('td', { class: 'muted', style: 'padding-right:8px' }, k), h('td', {}, String(v)));
    if (st.tab === 'monsters' && st.sel) {
      const m = d.monsters.get(st.sel)!;
      const table = d.drops.get(m.dropTableId);
      detail.push(h('h3', { style: 'margin:0 0 4px' }, `${m.name}${m.aiType === 'boss' ? ' (MVP)' : ''}`),
        h('table', {}, kv('Level', m.level), kv('Race / Size', `${m.race} / ${m.size}`), kv('Element', `${m.element} ${m.elementLevel ?? 1}`), kv('Type', m.aiType === 'boss' ? 'MVP boss' : m.elite ? 'Elite mini-boss' : m.aiType), ...(m.looter ? [kv('Looter', 'Picks up items on the ground')] : []), kv('HP', m.maxHp),
          kv('ATK / DEF / MDEF', `${m.attack} / ${m.defense} / ${m.magicDefense ?? 0}`), kv('Base / Job EXP', `${m.exp} / ${m.jobExp}`),
          kv('Behaviour', m.aiType), kv('Luma', table?.luma ? `${table.luma[0]}–${table.luma[1]}` : '—')),
        h('div', { class: 'gold', style: 'margin-top:6px' }, 'Found in'), h('div', {}, mapsOf(m.id).join(', ') || '—'),
        h('div', { class: 'gold', style: 'margin-top:6px' }, 'Drops'),
        h('table', {}, (table?.entries ?? []).map((e) => h('tr', {}, h('td', { style: 'padding-right:8px' }, link(itemName(e.itemId), d.items.get(e.itemId)?.type === 'card' ? 'cards' : 'items', e.itemId)), h('td', { class: 'muted' }, pct(e.chance))))));
    } else if (st.sel) {
      const it = d.items.get(st.sel)!;
      detail.push(...this.itemTooltip(it));
      if (it.weaponLevel) detail.push(h('div', {}, `Weapon Lv ${it.weaponLevel} · safe refine +${[7, 6, 5, 4][it.weaponLevel - 1]}`));
      if (it.cardSlots) detail.push(h('div', {}, `Card slots: ${it.cardSlots}`));
      const by = droppedBy(it.id);
      detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Dropped by'),
        by.length ? h('table', {}, by.slice(0, 12).map(({ m, chance }) => h('tr', {}, h('td', { style: 'padding-right:8px' }, link(`${m.name} (Lv ${m.level})`, 'monsters', m.id)), h('td', { class: 'muted' }, pct(chance))))) : h('div', { class: 'muted' }, '—'));
      const shops = [...d.shops.values()].filter((s) => s.items.includes(it.id)).map((s) => s.name);
      if (shops.length) detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Sold at'), h('div', {}, shops.join(', ')));
      const rec = [...d.recipes.values()].find((r) => r.itemId === it.id);
      if (rec) detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Forge recipe'), h('div', {}, `${rec.materials.map((m) => `${m.qty}× ${itemName(m.itemId)}`).join(', ')} · ${rec.fee} Luma`));
      const usedIn = [...d.recipes.values()].filter((r) => r.materials.some((m) => m.itemId === it.id)).map((r) => itemName(r.itemId));
      if (usedIn.length) detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Used to forge'), h('div', {}, usedIn.join(', ')));
    }
    const tabs = h('div', { class: 'filters' }, (['monsters', 'items', 'cards'] as const).map((t) => h('button', {
      class: `btn small${st.tab === t ? ' active' : ''}`, id: `db-tab-${t}`, onclick: () => { Object.assign(st, { tab: t, filter: '', sel: '' }); this.renderDatabase(); },
    }, t === 'monsters' ? `Monsters (${d.monsters.size})` : t === 'items' ? 'Items' : 'Cards')));
    setChildren(body, h('div', { style: 'width:720px' }, tabs,
      h('div', { style: 'display:grid;grid-template-columns:240px 1fr;gap:12px;margin-top:6px' },
        h('div', {}, search, filt, list),
        h('div', { id: 'db-detail', style: 'height:400px;overflow:auto' }, detail))));
  }

  // ---------------------------------------------------------------- GM / admin
  private adminSel: Record<string, string> = {};
  private renderAdmin() {
    const app = this.app, w = app.world, body = this.wins.get('admin')!.body;
    if (!w) { setChildren(body, h('div', {}, 'Enter the game to use GM tools.')); return; }
    const d = w.data;
    const run = (r: { ok: boolean; message?: string; error?: string }) => {
      app.hud?.toast(r.ok ? r.message ?? 'Done.' : r.error ?? 'Failed.', !r.ok);
      this.refresh(); // re-renders every open window, this one included
    };
    const sel = (key: string, opts: [string, string][]) => {
      const el = h('select', { id: `gm-${key}`, style: 'flex:1;min-width:0' }, opts.map(([v, label]) => h('option', { value: v }, label)));
      el.value = this.adminSel[key] ?? opts[0]?.[0] ?? '';
      this.adminSel[key] = el.value;
      el.addEventListener('change', () => { this.adminSel[key] = el.value; });
      return el;
    };
    const num = (key: string, value: number, width = 56) => {
      const el = h('input', { id: `gm-${key}`, type: 'number', value: String(this.adminSel[key] ?? value), style: `width:${width}px` });
      el.addEventListener('change', () => { this.adminSel[key] = el.value; });
      return el;
    };
    const val = (key: string, dflt = 0) => Number(this.adminSel[key] ?? dflt);
    const btn = (label: string, fn: () => void, cls = 'btn small') => h('button', { class: cls, onclick: fn }, label);
    const section = (title: string, ...rows: HTMLElement[]) => h('div', { style: 'margin-bottom:8px' },
      h('div', { class: 'gold', style: 'font-weight:bold;margin-bottom:3px' }, title), ...rows.map((r) => { r.style.marginBottom = '4px'; return r; }));
    const row = (...c: (HTMLElement | string)[]) => h('div', { class: 'row' }, ...c);
    const c = w.char;
    setChildren(body, h('div', { style: 'width:400px' },
      h('div', { style: 'font-size:11px;opacity:0.75;margin-bottom:6px' }, 'Local single-player tools. Changes apply to this save only; using them marks the character as GM-edited.'),
      section('Character',
        row(`${c.name} · ${d.classes.get(c.classId)!.name} · Base Lv ${c.baseLevel} · Job Lv ${c.jobLevel} · ${c.luma} Luma`),
        row(btn('Full heal', () => run(gm.gmHeal(w))), btn(`God mode: ${w.godMode ? 'ON' : 'OFF'}`, () => run(gm.gmGodMode(w, !w.godMode)), w.godMode ? 'btn small primary' : 'btn small')),
        row('Base +', num('lvB', 1, 48), 'Job +', num('lvJ', 0, 48), btn('Level up', () => run(gm.gmAddLevels(w, val('lvB', 1), val('lvJ'))))),
        row('Luma', num('luma', 1000, 80), btn('Give', () => run(gm.gmGiveLuma(w, val('luma', 1000))))),
        row('Stat pts', num('sp', 5, 48), 'Skill pts', num('kp', 1, 48), btn('Give', () => run(gm.gmGivePoints(w, val('sp', 5), val('kp', 1))))),
        row('Class', sel('cls', [...d.classes.values()].map((x) => [x.id, x.name])), btn('Set class', () => run(gm.gmSetClass(w, this.adminSel.cls))))),
      section('Items',
        row(sel('item', [...d.items.values()].sort((a, b) => a.name.localeCompare(b.name)).map((x) => [x.id, `${x.name} (${x.type})`])), num('qty', 1, 48), btn('Give', () => run(gm.gmGiveItem(w, this.adminSel.item, val('qty', 1)))))),
      section('World',
        row(sel('map', [...d.maps.values()].map((x) => [x.id, x.name])), btn('Teleport', () => run(gm.gmTeleport(w, this.adminSel.map)))),
        row(sel('mon', [...d.monsters.values()].map((x) => [x.id, `${x.name} Lv.${x.level}`])), num('cnt', 3, 44), btn('Spawn near me', () => run(gm.gmSpawn(w, this.adminSel.mon, val('cnt', 3))))),
        row(btn('Defeat all monsters here', () => run(gm.gmKillAll(w))), btn('…incl. boss', () => run(gm.gmKillAll(w, true)), 'btn small danger'))),
      section('Quests',
        row(sel('quest', [...d.quests.values()].map((x) => [x.id, `${x.name}${c.quests[x.id] ? ` [${c.quests[x.id].status}]` : ''}`])),
          btn('Fill objectives', () => run(gm.gmQuest(w, this.adminSel.quest, 'complete'))), btn('Reset', () => run(gm.gmQuest(w, this.adminSel.quest, 'reset'))))),
      row(btn('Save game', () => app.saveNow(true), 'btn small primary'), btn('Toggle collision overlay', () => { app.settings.showCollision = !app.settings.showCollision; app.applySettings(); }))));
  }

  /** Called by the app's key handler while rebinding. Returns true if consumed. */
  captureKey(e: KeyboardEvent): boolean {
    if (!this.listening) return false;
    e.preventDefault();
    if (e.key !== 'Escape') {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      for (const [a, k] of Object.entries(this.app.settings.keybinds)) if (k === key && a !== this.listening) this.app.settings.keybinds[a] = '';
      this.app.settings.keybinds[this.listening] = key;
      this.app.applySettings();
    }
    this.listening = null;
    this.renderSettings();
    return true;
  }

  // ---------------------------------------------------------------- dialogue
  openNpcDialog(npcId: string) {
    const w = this.app.world!;
    const npc = w.data.npcs.get(npcId)!;
    const turnIns = questsToTurnIn(w.data, w.char, npcId);
    const offers = questsOfferedBy(w.data, w.char, npcId, w.now());
    const inProgress = activeQuests(w.data, w.char).filter(({ def, prog }) => def.turnInNpc === npcId && !isComplete(def, prog, w.char));
    const opts: [string, () => void][] = [];
    for (const q of turnIns) opts.push([`✔ ${q.name} (complete)`, () => this.questDialog(npc, q, 'complete')]);
    for (const q of offers) opts.push([`! ${q.name}`, () => this.questDialog(npc, q, 'offer')]);
    for (const { def } of inProgress) opts.push([`… ${def.name}`, () => this.questDialog(npc, def, 'progress')]);
    for (const s of npc.services) {
      if (s.type === 'shop') opts.push([s.label ?? 'Shop', () => { this.closeDialog(); this.shopId = s.shopId; this.open('inventory'); this.open('shop'); }]);
      if (s.type === 'storage') opts.push(['Open storage', () => { this.closeDialog(); this.open('inventory'); this.open('storage'); }]);
      if (s.type === 'heal') opts.push([`Rest at the inn (${s.cost} Luma)`, () => { const r = w.healAtInn(s.cost); this.app.hud?.toast(r.ok ? r.message! : r.error, !r.ok); this.closeDialog(); }]);
      if (s.type === 'save') opts.push(['Set save point here', () => { w.setSavePoint(); this.app.saveNow(false); this.app.hud?.toast('Save point set.'); this.closeDialog(); }]);
      if (s.type === 'resetStats') opts.push([`Reset stat points${s.cost ? ` (${s.cost} Luma)` : ' (free)'}`, () => { this.closeDialog(); this.confirmAction('Reset stats', 'Refund every allocated stat point so you can spend them again?', 'Reset stats', () => w.doResetStats(s.cost)); }]);
      if (s.type === 'refine') opts.push(['Refine equipment', () => this.refineDialog(npc)]);
      if (s.type === 'enchant') opts.push(['Enchant equipment', () => { this.closeDialog(); this.enchantDialog(); }]);
      if (s.type === 'forge') opts.push(['Forge a weapon', () => { this.closeDialog(); this.forgeDialog(); }]);
      if (s.type === 'warp') opts.push(['Warp service', () => this.warpDialog(npc, s.destinations)]);
      if (s.type === 'jobChange') for (const id of s.classIds) {
        const cls = w.data.classes.get(id)!;
        const req = cls.requirements ?? {};
        opts.push([`Become a ${cls.name}${req.jobLevel ? ` (needs Job Lv ${req.jobLevel})` : ''}`, () => {
          this.closeDialog();
          this.confirmAction(`Become a ${cls.name}`, `${cls.description} Your job level resets to 1; base level, stats and learned skills are kept.`, 'Change job', () => {
            const r = w.changeJobAt(id);
            if (r.ok) this.app.hud?.banner(`You are now a ${cls.name}!`, 'New skills are available in the Skill Tree (K).');
          });
        }]);
      }
      if (s.type === 'resetSkills') opts.push([`Reset skill points${s.cost ? ` (${s.cost} Luma)` : ' (free)'}`, () => { this.closeDialog(); this.confirmAction('Reset skills', 'Forget every learned skill and refund the skill points? Hotbar skill slots are cleared.', 'Reset skills', () => w.doResetSkills(s.cost)); }]);
    }
    opts.push(['Goodbye', () => this.closeDialog()]);
    const text = npc.greeting[Math.floor(Math.random() * npc.greeting.length)];
    this.showDialog(npc, [text], opts);
  }

  /** Refine flow: pick an item, see the chance and cost, then try. */
  private refineDialog(npc: NpcDef, picked?: string, enriched = false) {
    const w = this.app.world!, d = w.data, c = w.char;
    const label = (inst: ItemInstance) => `${inst.refine ? `+${inst.refine} ` : ''}${d.items.get(inst.itemId)!.name}`;
    if (!picked) {
      const items = [...EQUIP_SLOTS.map((sl) => c.equipment[sl]).filter((i): i is ItemInstance => !!i), ...c.inventory]
        .filter((i) => { const def = d.items.get(i.itemId)!; return def.type === 'equipment' && def.slot && def.slot !== 'accessory'; });
      const opts: [string, () => void][] = items.slice(0, 8).map((i) => [`${label(i)}${Object.values(c.equipment).includes(i) ? ' (equipped)' : ''}`, () => this.refineDialog(npc, i.uid)]);
      opts.push(['Never mind', () => this.openNpcDialog(npc.id)]);
      this.showDialog(npc, [items.length ? 'Which piece shall I work on? Weapons need ore of their level (Glimmer Lv1, Bright Lv2, Starsteel Lv3–4); armor takes Moonstone Ore. Enriched ores work on any level and fail less often.' : 'You have nothing I can refine. Bring me a weapon or some armor.'], opts, null, 'Refine');
      return;
    }
    const info = refineInfo(d, c, picked, enriched);
    const inst = c.inventory.find((i) => i.uid === picked) ?? Object.values(c.equipment).find((i) => i?.uid === picked);
    if (!inst) { this.refineDialog(npc); return; }
    const pct = Math.round(info.chance * 100);
    const lines = [
      `${label(inst)} → +${info.next}`,
      `Success chance ${pct}%. Cost: 1 ${d.items.get(info.ore)?.name ?? info.ore} (you have ${countItem(c, info.ore)}) and ${info.fee} Luma.`,
      info.chance < 1 ? `Safe up to +${info.safe}. Past that, a failed attempt DESTROYS the item.` : `Safe refine (up to +${info.safe} never fails).`,
    ];
    const opts: [string, () => void][] = [];
    const go = () => {
      const r = w.refine(picked, enriched);
      if (r.ok) this.app.hud?.banner(r.outcome === 'success' ? `Refine success: +${r.level}` : 'Refine failed', r.message!);
      if (r.ok && r.outcome === 'success' && (inst.refine ?? 0) < MAX_REFINE) this.refineDialog(npc, picked, enriched); else this.refineDialog(npc);
    };
    if (info.ok) opts.push([`Refine (${pct}%)`, () => (info.chance < 1 ? this.confirmTyped(
      'Risky refine', `${label(inst)} has a ${100 - pct}% chance to be destroyed. Type REFINE to continue.`, 'REFINE', 'Refine', go) : go())]);
    else lines.push(info.error ?? '');
    opts.push([enriched ? 'Use normal ore' : 'Use enriched ore (better odds)', () => this.refineDialog(npc, picked, !enriched)]);
    opts.push(['Choose another item', () => this.refineDialog(npc)]);
    opts.push(['Done', () => this.openNpcDialog(npc.id)]);
    this.showDialog(npc, lines, opts, null, 'Refine');
  }

  private warpDialog(npc: NpcDef, dests: { mapId: string; spawn: string; cost: number }[]) {
    const w = this.app.world!;
    const opts: [string, () => void][] = dests.map((dst) => [`${w.data.maps.get(dst.mapId)!.name} — ${dst.cost} Luma`, () => {
      const r = w.warpTo(dst.mapId);
      if (r.ok) this.closeDialog();
    }]);
    opts.push(['Never mind', () => this.openNpcDialog(npc.id)]);
    this.showDialog(npc, ['Where would you like to go? Warps are paid in advance.'], opts, null, 'Warp Service');
  }

  private questDialog(npc: NpcDef, q: QuestDef, mode: 'offer' | 'progress' | 'complete') {
    const w = this.app.world!;
    const lines = q.dialogue[mode];
    const opts: [string, () => void][] = [];
    const reward = h('div', { class: 'reward' }, `Rewards: ${rewardText(this.app, q)}`);
    if (mode === 'offer') {
      opts.push(['Accept', () => { w.accept(q.id); this.openNpcDialog(npc.id); }]);
      opts.push(['Maybe later', () => this.openNpcDialog(npc.id)]);
    } else if (mode === 'complete') {
      opts.push(['Complete quest', () => {
        const r = w.turnIn(q.id);
        if (r.ok) {
          this.app.hud?.banner('Quest Complete', q.name);
          if (r.jobChanged) this.app.hud?.banner(`You are now a ${w.data.classes.get(r.jobChanged)!.name}!`, 'New skills are available in the Skill Tree (K).');
          this.openNpcDialog(npc.id);
        }
      }]);
    } else opts.push(['I\'ll keep at it', () => this.openNpcDialog(npc.id)]);
    this.showDialog(npc, lines, opts, mode !== 'progress' ? reward : null, q.name);
  }

  private showDialog(npc: NpcDef, lines: string[], opts: [string, () => void][], extra: HTMLElement | null = null, heading?: string) {
    this.closeDialog();
    const portrait = h('canvas', { width: 96, height: 96 });
    const p = portraitFromSheet(generateCharacterSheet({ appearance: npc.appearance, outfit: npc.outfit, weapon: null }), 3);
    portrait.getContext('2d')!.drawImage(p, 0, 0);
    this.dialogEl = h('div', { class: 'panel dialog', id: 'npc-dialog' },
      portrait,
      h('div', {},
        h('div', { class: 'dn' }, npc.name), h('div', { class: 'dt' }, heading ? `${npc.title} — ${heading}` : npc.title),
        h('div', { class: 'dtext' }, lines.map((l) => h('p', { style: 'margin:0 0 4px' }, l))),
        extra,
        h('div', { class: 'dopts' }, opts.map(([label, fn], i) => h('div', { class: 'dopt', dataset: { opt: String(i) }, onclick: () => { audio.play('ui_click'); fn(); } }, `${i + 1}. ${label}`)))));
    this.root.appendChild(this.dialogEl);
  }

  showObjectText(name: string, text: string) {
    this.closeDialog();
    this.dialogEl = h('div', { class: 'panel dialog', style: 'grid-template-columns:1fr' },
      h('div', {}, h('div', { class: 'dn' }, name), h('div', { class: 'dtext' }, text),
        h('div', { class: 'dopts' }, h('div', { class: 'dopt', onclick: () => this.closeDialog() }, 'Close'))));
    this.root.appendChild(this.dialogEl);
  }

  /** Number keys pick dialogue options. */
  dialogKey(n: number): boolean {
    if (!this.dialogEl) return false;
    const opt = this.dialogEl.querySelector(`[data-opt="${n - 1}"]`) as HTMLElement | null;
    opt?.click();
    return !!opt;
  }
  get dialogOpen() { return !!this.dialogEl; }
  closeDialog() { this.dialogEl?.remove(); this.dialogEl = null; }

  // ---------------------------------------------------------------- modal
  showModal(title: string, text: string, buttons: [string, () => void][], dismissable = false) {
    this.modal(title, [h('p', {}, text)], buttons.map(([l, fn]) => [l, () => { this.closeModal(); fn(); }]), dismissable);
  }

  private modal(title: string, body: HTMLElement[], buttons: [string, () => void][], dismissable: boolean) {
    this.closeModal();
    this.modalEl = h('div', { class: 'modal-back', dataset: { dismissable: dismissable ? '1' : '0' } },
      h('div', { class: 'panel modal col', style: 'align-items:center' }, h('h3', {}, title), body,
        h('div', { class: 'row', style: 'justify-content:center;margin-top:8px' }, buttons.map(([l, fn], i) => h('button', { class: `btn${i === 0 ? ' primary' : ''}`, onclick: fn }, l)))));
    this.root.appendChild(this.modalEl);
  }
  closeModal() { this.modalEl?.remove(); this.modalEl = null; }

  // ---------------------------------------------------------------- shop
  private renderShop() {
    const w = this.app.world!;
    const body = this.wins.get('shop')!.body;
    const shop = this.shopId ? w.data.shops.get(this.shopId) : null;
    if (!shop) { setChildren(body, 'No shop open.'); return; }
    const rows = shop.items.map((id) => {
      const def = w.data.items.get(id)!;
      const qty = h('input', { type: 'number', min: 1, max: 99, value: 1 });
      const icon = h('img', { src: itemIconUrl(def) });
      icon.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def)));
      icon.addEventListener('mouseleave', () => this.hideTooltip());
      const usable = def.type !== 'equipment' || canEquip(w.data, w.char, def).ok;
      return h('div', { class: 'shop-row' }, icon,
        h('div', {}, h('div', { style: { color: RARITY_COLOR[def.rarity] } }, def.name), h('div', { class: usable ? 'muted' : 'bad', style: 'font-size:10px' }, def.type === 'equipment' ? (usable ? 'Can equip' : 'Cannot equip yet') : def.description)),
        h('div', { class: 'gold' }, buyPrice(w.data, w.char, id) < def.price ? h('span', { title: `Discount (list price ${def.price})` }, `${buyPrice(w.data, w.char, id)} L`) : `${def.price} L`), qty,
        h('button', { class: 'btn small', onclick: () => w.buy(shop.id, id, Math.floor(Number(qty.value) || 1)) }, 'Buy'));
    });
    setChildren(body,
      h('div', { style: 'width:420px' },
        h('div', { class: 'row' }, h('span', { class: 'gold', style: 'font-weight:bold' }, shop.name), h('span', { class: 'spacer' }), h('span', {}, `You have ${w.char.luma.toLocaleString()} Luma`)),
        h('div', { style: 'max-height:380px;overflow:auto;margin-top:6px' }, rows),
        h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `To sell: right-click an item in your inventory and choose Sell (${sellPrice(w.data, 'red_potion', w.char) > sellPrice(w.data, 'red_potion') ? '50% of its value + Overcharge' : '50% of its value'}).`)));
  }

  // ---------------------------------------------------------------- storage
  private renderStorage() {
    const w = this.app.world!;
    const body = this.wins.get('storage')!.body;
    const grid = h('div', { class: 'inv-grid' });
    const slots = w.data.balance.economy.storageSlots;
    for (let i = 0; i < Math.min(slots, 60); i++) {
      const inst = w.char.storage[i];
      const el = h('div', { class: 'islot' });
      if (inst) {
        const def = w.data.items.get(inst.itemId)!;
        el.append(h('img', { src: itemIconUrl(def) }), inst.qty > 1 ? h('span', { class: 'q' }, String(inst.qty)) : '');
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        el.addEventListener('dblclick', () => this.qtyPrompt(inst, 'Withdraw how many?', (n) => w.withdraw(inst.uid, n)));
      }
      grid.appendChild(el);
    }
    grid.addEventListener('dragover', (e) => e.preventDefault());
    grid.addEventListener('drop', (e) => {
      const d = getDragData(e);
      if (d?.type !== 'inv') return;
      e.preventDefault();
      const inst = w.char.inventory.find((x) => x.uid === d.id);
      if (inst) this.qtyPrompt(inst, 'Store how many?', (n) => w.deposit(inst.uid, n));
    });
    setChildren(body,
      h('div', { class: 'row', style: 'margin-bottom:6px' }, h('span', {}, `Stored ${w.char.storage.length}/${slots}`), h('span', { class: 'spacer' }),
        h('span', { class: 'muted', style: 'font-size:11px' }, `Fee ${w.data.balance.economy.storageFee} Luma per deposit`)),
      grid,
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'Drag items from your inventory here to store them · Double-click to withdraw'));
  }
}

export function rewardText(app: App, q: QuestDef): string {
  const d = app.data;
  const r = q.rewards;
  return [
    r.exp ? `${r.exp} Base EXP` : '', r.jobExp ? `${r.jobExp} Job EXP` : '', r.luma ? `${r.luma} Luma` : '',
    ...(r.items ?? []).map((i) => `${d.items.get(i.itemId)?.name} ×${i.qty}`),
    r.jobChange ? `Job change: ${d.classes.get(r.jobChange)?.name}` : '',
  ].filter(Boolean).join(', ') || '—';
}
