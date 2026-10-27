// Draggable game windows: inventory, equipment, status, skills, quests, world
// map, settings — plus NPC dialogue, shop, storage, tooltips and menus.
import type { App } from './app';
import { h, setChildren, RARITY_COLOR } from './dom';
import { itemIconUrl, skillIconUrl } from '../game/art/icons';
import { generateCharacterSheet, portraitFromSheet } from '../game/art/characterSprite';
import { lookForCharacter, SpritePreview } from './screens';
import { getDragData, setDragData } from './hud';
import { classLineage, skillCheck } from '../core/character';
import { canEquip, filterInventory, inventoryWeight, sellPrice } from '../core/inventory';
import { expToNextBase, expToNextJob } from '../core/formulas';
import {
  activeQuests, isComplete, objectiveTarget, questsOfferedBy, questsToTurnIn,
} from '../core/quests';
import type { EquipSlot, ItemDef, ItemInstance, ItemType, NpcDef, QuestDef, StatKey, StatModifiers } from '../core/types';
import { EQUIP_SLOTS, STAT_KEYS } from '../core/types';
import { DEFAULT_KEYBINDS } from '../core/save';
import { audio } from '../game/audio/audio';
import * as gm from '../core/gm';

export type WindowId = 'inventory' | 'equipment' | 'status' | 'skills' | 'quests' | 'worldMap' | 'settings' | 'shop' | 'storage' | 'admin';

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
    this.define('worldMap', 'World Map', 300, 90, () => this.renderWorldMap());
    this.define('settings', 'Settings', 420, 70, () => this.renderSettings());
    this.define('shop', 'Shop', 16, 90, () => this.renderShop());
    this.define('storage', 'Storage', 16, 90, () => this.renderStorage());
    this.define('admin', 'GM / Admin Tools', 820, 70, () => this.renderAdmin());
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
    const out: HTMLElement[] = [h('div', { class: 'tn', style: { color: RARITY_COLOR[def.rarity] } }, `${def.name}${inst?.refine ? ` +${inst.refine}` : ''}`)];
    const typeLine = def.type === 'equipment'
      ? `${def.rarity} ${def.weaponType ?? def.slot}${def.twoHanded ? ' (two-handed)' : ''}${def.element ? ` · ${def.element}` : ''}`
      : `${def.rarity} ${def.type}`;
    out.push(h('div', { class: 'tt' }, typeLine));
    for (const line of modsText(def.mods)) out.push(h('div', { class: 'good' }, line));
    if (def.attackRange && def.slot === 'weapon') out.push(h('div', {}, `Range ${def.attackRange} · ${def.attackKind}`));
    if (def.use) for (const u of def.use) {
      if (u.type === 'heal') out.push(h('div', { class: 'good' }, `Restores ${[u.hp ? `${u.hp} HP` : '', u.mp ? `${u.mp} MP` : ''].filter(Boolean).join(' & ')}`));
    }
    out.push(h('div', { style: 'margin-top:4px' }, def.description));
    if (def.type === 'equipment') {
      const chk = canEquip(w.data, w.char, def);
      if (def.equipLevel && def.equipLevel > 1) out.push(h('div', { class: w.char.baseLevel >= def.equipLevel ? 'muted' : 'bad' }, `Requires Lv.${def.equipLevel}`));
      if (def.classes) out.push(h('div', { class: def.classes.includes(w.char.classId) ? 'muted' : 'bad' }, `Class: ${def.classes.map((c) => w.data.classes.get(c)?.name).join(', ')}`));
      if (!chk.ok && !def.classes && !(def.equipLevel && def.equipLevel > w.char.baseLevel)) out.push(h('div', { class: 'bad' }, chk.error));
    }
    out.push(h('div', { class: 'tt', style: 'margin-top:4px' }, `Weight ${def.weight} · Sell ${sellPrice(w.data, def.id)} Luma${inst?.bound || def.bound ? ' · Bound' : ''}${inst?.locked ? ' · Locked' : ''}`));
    return out;
  }

  // ---------------------------------------------------------------- inventory
  private renderInventory() {
    const w = this.app.world!;
    const body = this.wins.get('inventory')!.body;
    const filters: [typeof this.invFilter, string][] = [['all', 'All'], ['equipment', 'Equip'], ['consumable', 'Use'], ['material', 'Material'], ['quest', 'Quest']];
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
        h('td', {}, h('button', { class: 'btn small', id: `alloc-${k}`, disabled: c.statPoints <= 0, onclick: (e: MouseEvent) => w.allocate(k, e.shiftKey ? Math.min(10, c.statPoints) : 1) }, '+')));
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
          d('Attack Speed', `${(1000 / s.attackIntervalMs).toFixed(2)}/s`), d('Move Speed', Math.round(s.moveSpeed)),
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
    svg.setAttribute('width', '640'); svg.setAttribute('height', '400');
    svg.style.position = 'absolute'; svg.style.inset = '0';
    for (const m of w.data.maps.values()) for (const p of m.portals) {
      const t = w.data.maps.get(p.targetMap)!;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(m.worldMapPos.x * 640)); line.setAttribute('y1', String(m.worldMapPos.y * 400));
      line.setAttribute('x2', String(t.worldMapPos.x * 640)); line.setAttribute('y2', String(t.worldMapPos.y * 400));
      line.setAttribute('stroke', '#c8a26b'); line.setAttribute('stroke-width', '3'); line.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(line);
    }
    box.appendChild(svg);
    for (const m of w.data.maps.values()) {
      const here = m.id === w.map.def.id;
      const col = m.type === 'town' ? '#ffd34d' : m.type === 'field' ? '#6fe08a' : '#ff6a5a';
      box.appendChild(h('div', { class: `wm-node${here ? ' here' : ''}`, style: { left: `${m.worldMapPos.x * 640}px`, top: `${m.worldMapPos.y * 400}px` } },
        h('div', { class: 'dot', style: { background: col } }),
        h('div', { style: 'font-weight:bold' }, m.name),
        h('div', { class: 'muted' }, m.levelRange ? `Lv.${m.levelRange[0]}–${m.levelRange[1]}` : m.type === 'town' ? 'Town' : ''),
        here ? h('div', { class: 'gold' }, '★ You are here') : null));
    }
    // Regions not yet built in this phase are shown as unexplored.
    const future: [string, number, number][] = [['Silvercrest Kingdom', 0.62, 0.3], ['Emerald Wilds', 0.7, 0.68], ['Sundune Desert', 0.88, 0.8], ['Frostpeak Mountains', 0.82, 0.14], ['Ashen Volcano', 0.94, 0.45], ['Astral Isles', 0.5, 0.1], ['Void Realm', 0.3, 0.12]];
    for (const [name, x, y] of future) {
      box.appendChild(h('div', { class: 'wm-node locked', style: { left: `${x * 640}px`, top: `${y * 400}px` } },
        h('div', { class: 'dot', style: { background: '#555' } }), h('div', {}, name), h('div', { class: 'muted' }, 'Unexplored')));
    }
    setChildren(body, box, h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'Aetheria — the Kingdom of Veyloria. Dashed roads connect regions you can travel between.'));
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
      if (s.type === 'resetSkills') opts.push([`Reset skill points${s.cost ? ` (${s.cost} Luma)` : ' (free)'}`, () => { this.closeDialog(); this.confirmAction('Reset skills', 'Forget every learned skill and refund the skill points? Hotbar skill slots are cleared.', 'Reset skills', () => w.doResetSkills(s.cost)); }]);
    }
    opts.push(['Goodbye', () => this.closeDialog()]);
    const text = npc.greeting[Math.floor(Math.random() * npc.greeting.length)];
    this.showDialog(npc, [text], opts);
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
        h('div', { class: 'gold' }, `${def.price} L`), qty,
        h('button', { class: 'btn small', onclick: () => w.buy(shop.id, id, Math.floor(Number(qty.value) || 1)) }, 'Buy'));
    });
    setChildren(body,
      h('div', { style: 'width:420px' },
        h('div', { class: 'row' }, h('span', { class: 'gold', style: 'font-weight:bold' }, shop.name), h('span', { class: 'spacer' }), h('span', {}, `You have ${w.char.luma.toLocaleString()} Luma`)),
        h('div', { style: 'max-height:380px;overflow:auto;margin-top:6px' }, rows),
        h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'To sell: right-click an item in your inventory and choose Sell (50% of its value).')));
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
