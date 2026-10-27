// In-game HUD (HTML overlay above the Phaser canvas).
import { expToNextBase, expToNextJob } from '../core/formulas';
import { countItem } from '../core/inventory';
import { activeQuests, objectiveTarget } from '../core/quests';
import { TILE } from '../core/mapCompiler';
import type { HotbarSlot } from '../core/types';
import { itemIconUrl, skillIconUrl } from '../game/art/icons';
import { portraitFromSheet, generateCharacterSheet } from '../game/art/characterSprite';
import { h, setChildren } from './dom';
import type { App } from './app';
import { lookForCharacter } from './screens';

type Channel = 'system' | 'combat' | 'loot' | 'quest' | 'error' | 'chat';
const DRAG_MIME = 'application/x-veyloria';

export function setDragData(e: DragEvent, payload: { type: 'skill' | 'item' | 'inv' | 'equip'; id: string }) {
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer?.setData('text/plain', payload.id);
}
export function getDragData(e: DragEvent): { type: 'skill' | 'item' | 'inv' | 'equip'; id: string } | null {
  const raw = e.dataTransfer?.getData(DRAG_MIME);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export class Hud {
  root: HTMLElement;
  private portrait = h('canvas', { class: 'portrait', width: 96, height: 96 });
  private whoName = h('div', { class: 'who' });
  /** Clock and active raid. */
  private clockEl = h('div', { id: 'world-clock', style: 'position:absolute;top:8px;right:222px;min-width:110px;text-align:center;padding:2px 6px;background:#1c1622cc;border:1px solid #5a4a3a;border-radius:5px;color:#e8dcc0;font-size:11px;z-index:5' });
  /** Memorial-dungeon timer (floor and time left). */
  private instTimer = h('div', { id: 'inst-timer', style: 'position:absolute;top:8px;left:50%;transform:translateX(-50%);padding:4px 12px;background:#1c1622dd;border:1px solid #c8a26b;border-radius:6px;color:#ffe9a8;font-size:13px;display:none;z-index:5' });
  private hpBar = bar('hp');
  private mpBar = bar('mp');
  private expBar = bar('exp');
  private jexpBar = bar('jexp');
  private buffsEl = h('div', { class: 'buffs passthrough' });
  private targetEl = h('div', { class: 'panel hud-target hidden passthrough' });
  private bossEl = h('div', { class: 'panel hud-boss hidden passthrough' });
  private miniCanvas = h('canvas', { width: 186, height: 140 });
  private miniBase: HTMLCanvasElement | null = null;
  private miniName = h('div', { class: 'mname' });
  private miniCoords = h('div', { class: 'coords' });
  private trackerEl = h('div', { class: 'panel tracker' });
  private chatLog = h('div', { class: 'log' });
  private chatInput = h('input', { placeholder: 'Press Enter to chat · /help for commands', maxlength: 120 });
  private chatFilter: Channel | 'all' = 'all';
  private hotbarEl = h('div', { class: 'panel hotbar' });
  private castEl = h('div', { class: 'panel castbar hidden passthrough' });
  private toastArea = h('div', { class: 'toast-area' });
  private lumaEl = h('span', { class: 'gold' });
  private lastSlow = 0;
  private lastPortraitKey = '';

  constructor(private app: App) {
    const chatTabs = h('div', { class: 'tabs' }, ...(['all', 'combat', 'loot', 'quest', 'system'] as const).map((c) =>
      h('span', { class: `tab${c === 'all' ? ' on' : ''}`, onclick: (e: Event) => {
        this.chatFilter = c;
        (e.target as HTMLElement).parentElement!.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
        (e.target as HTMLElement).classList.add('on');
        this.applyChatFilter();
      } }, c)));
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.submitChat(); this.chatInput.blur(); }
      if (e.key === 'Escape') this.chatInput.blur();
    });
    this.miniCanvas.addEventListener('click', (e) => {
      const w = this.app.world; if (!w) return;
      const r = this.miniCanvas.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width, sy = (e.clientY - r.top) / r.height;
      w.moveTo(sx * w.map.width * TILE, sy * w.map.height * TILE);
    });
    const menu = h('div', { class: 'menu-buttons' },
      ...([['status', 'Status'], ['inventory', 'Items'], ['equipment', 'Equip'], ['skills', 'Skills'], ['quests', 'Quests'], ['worldMap', 'Map'], ['database', 'DB'], ['pet', 'Pet'], ['runes', 'Runes'], ['homun', 'Homun'], ['cart', 'Cart'], ['settings', 'Menu']] as const)
        .map(([id, label]) => h('button', { class: 'btn', title: `${label} (${this.app.keyLabel(id)})`, onclick: () => this.app.windows.toggle(id) }, label)),
      h('button', { class: 'btn', id: 'btn-gm', title: 'GM / Admin tools (F8 or /gm)', onclick: () => this.app.windows.toggle('admin') }, 'GM'));
    this.root = h('div', { id: 'hud', class: 'passthrough', style: 'position:absolute;inset:0' },
      h('div', { class: 'panel hud-status' }, this.portrait, this.whoName, this.hpBar.el, this.mpBar.el),
      this.buffsEl,
      this.targetEl,
      this.bossEl,
      h('div', { class: 'panel minimap' }, this.miniName, this.miniCanvas, this.miniCoords),
      this.trackerEl,
      h('div', { class: 'panel chat' }, chatTabs, this.chatLog, this.chatInput),
      this.hotbarEl,
      this.castEl,
      this.toastArea,
      h('div', { class: 'expbars' },
        h('div', { class: 'row' }, h('span', { style: 'font-size:10px;width:30px' }, 'EXP'), this.expBar.el),
        h('div', { class: 'row' }, h('span', { style: 'font-size:10px;width:30px' }, 'JOB'), this.jexpBar.el),
        h('div', { class: 'row' }, this.lumaEl, menu)),
    );
    for (const el of [this.root.querySelector('.hud-status'), this.root.querySelector('.minimap'), this.trackerEl, this.root.querySelector('.chat'), this.hotbarEl, this.root.querySelector('.expbars')]) {
      (el as HTMLElement).style.pointerEvents = 'auto';
    }
    this.buildHotbar();
  }

  focusChat() { this.chatInput.focus(); }
  get chatFocused() { return document.activeElement === this.chatInput; }

  private submitChat() {
    const text = this.chatInput.value.trim();
    this.chatInput.value = '';
    if (!text) return;
    if (text.startsWith('/')) { this.app.chatCommand(text); return; }
    this.log(`[${this.app.world?.char.name ?? 'You'}] ${text}  (offline — multiplayer chat arrives in Phase 3)`, 'chat');
  }

  log(text: string, channel: Channel = 'system') {
    const line = h('div', { class: `m-${channel}`, dataset: { ch: channel } }, text);
    if (this.chatFilter !== 'all' && this.chatFilter !== channel) line.classList.add('hidden');
    const atBottom = this.chatLog.scrollTop + this.chatLog.clientHeight >= this.chatLog.scrollHeight - 4;
    this.chatLog.appendChild(line);
    while (this.chatLog.childElementCount > 200) this.chatLog.firstElementChild!.remove();
    if (atBottom) this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private applyChatFilter() {
    for (const el of Array.from(this.chatLog.children) as HTMLElement[]) {
      el.classList.toggle('hidden', this.chatFilter !== 'all' && el.dataset.ch !== this.chatFilter && !(this.chatFilter === 'system' && el.dataset.ch === 'error'));
    }
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  /** Big centre-screen announcements, shown one at a time. */
  banner(title: string, sub = '', kind: '' | 'boss' = '') {
    if (this.bannerQueue.some((b) => b.title === title)) return;
    this.bannerQueue.push({ title, sub, kind });
    if (this.bannerQueue.length > 4) this.bannerQueue.splice(1, 1);
    if (this.bannerQueue.length === 1) this.showNextBanner();
  }

  private bannerQueue: { title: string; sub: string; kind: '' | 'boss' }[] = [];

  private showNextBanner() {
    const next = this.bannerQueue[0];
    if (!next) return;
    const fast = this.bannerQueue.length > 1;
    const ms = fast ? 1800 : 3200;
    const b = h('div', { class: `banner ${next.kind}`, style: { animationDuration: `${ms}ms` } }, h('div', { class: 'b1' }, next.title), next.sub ? h('div', { class: 'b2' }, next.sub) : null);
    this.root.appendChild(b);
    setTimeout(() => { b.remove(); this.bannerQueue.shift(); this.showNextBanner(); }, ms);
  }

  toast(text: string, error = false) {
    const t = h('div', { class: `toast${error ? ' error' : ''}` }, text);
    this.toastArea.appendChild(t);
    while (this.toastArea.childElementCount > 4) this.toastArea.firstElementChild!.remove();
    setTimeout(() => t.remove(), 2700);
  }

  // ---------------------------------------------------------------- hotbar
  buildHotbar() {
    const w = this.app.world;
    const slots = w?.char.hotbar ?? [];
    setChildren(this.hotbarEl, Array.from({ length: 10 }, (_, i) => {
      const s = slots[i] ?? null;
      const el = h('div', { class: 'hslot', dataset: { i: String(i) }, title: this.slotTitle(s) },
        s ? h('img', { src: this.slotIcon(s), draggable: false }) : null,
        h('span', { class: 'key' }, this.app.keyLabel(`hotbar${i + 1}`)),
        h('span', { class: 'cnt' }),
        h('div', { class: 'cd' }),
        h('span', { class: 'cdt' }));
      el.addEventListener('click', () => this.app.useHotbar(i));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (w) { w.char.hotbar[i] = null; this.buildHotbar(); } });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('over');
        const d = getDragData(e);
        if (!d || !w) return;
        if (d.type === 'skill') this.app.assignHotbar(i, { type: 'skill', id: d.id });
        else if (d.type === 'item') this.app.assignHotbar(i, { type: 'item', id: d.id });
        else if (d.type === 'inv') {
          const inst = w.char.inventory.find((x) => x.uid === d.id);
          if (inst) this.app.assignHotbar(i, { type: 'item', id: inst.itemId });
        }
      });
      return el;
    }));
  }

  private slotIcon(s: HotbarSlot): string {
    const d = this.app.data;
    if (s.type === 'skill') { const sk = d.skills.get(s.id); return sk ? skillIconUrl(sk) : ''; }
    const it = d.items.get(s.id);
    return it ? itemIconUrl(it) : '';
  }

  private slotTitle(s: HotbarSlot | null): string {
    if (!s) return 'Empty — drag a skill or item here';
    const d = this.app.data;
    return s.type === 'skill' ? d.skills.get(s.id)?.name ?? s.id : d.items.get(s.id)?.name ?? s.id;
  }

  private updateHotbar() {
    const w = this.app.world!;
    const slots = this.hotbarEl.children;
    for (let i = 0; i < 10; i++) {
      const s = w.char.hotbar[i];
      const el = slots[i] as HTMLElement;
      if (!el) continue;
      const cnt = el.querySelector('.cnt') as HTMLElement, cd = el.querySelector('.cd') as HTMLElement, cdt = el.querySelector('.cdt') as HTMLElement;
      if (!s) { cnt.textContent = ''; cd.style.background = ''; cdt.textContent = ''; continue; }
      let until = 0, total = 1;
      if (s.type === 'skill') {
        const sk = w.data.skills.get(s.id);
        until = w.player.cooldowns[s.id] ?? 0;
        total = sk?.cooldownMs || 1;
        const lvl = w.skillLevel(s.id);
        cnt.textContent = lvl ? `${lvl}` : '';
        el.classList.toggle('nomp', !!sk && (lvl === 0 || w.char.mp < w.skillMpCost(sk, Math.max(1, lvl))));
      } else {
        const it = w.data.items.get(s.id);
        until = w.player.itemCooldowns[s.id] ?? 0;
        total = it?.cooldownMs || 500;
        const n = countItem(w.char, s.id);
        cnt.textContent = `${n}`;
        el.classList.toggle('nomp', n === 0);
      }
      const left = until - w.time;
      if (left > 0) {
        const pct = Math.min(1, left / total);
        cd.style.background = `conic-gradient(rgba(0,0,0,0.65) ${pct * 360}deg, transparent 0)`;
        cdt.textContent = left > 1000 ? `${Math.ceil(left / 1000)}` : '';
      } else { cd.style.background = ''; cdt.textContent = ''; }
    }
  }

  // ---------------------------------------------------------------- minimap
  resetMinimap() {
    const w = this.app.world!;
    const map = w.map;
    const c = document.createElement('canvas');
    c.width = map.width * 3; c.height = map.height * 3;
    const ctx = c.getContext('2d')!;
    const pal = w.data.tilesets.get(map.def.tileset)!.palette;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const g = map.ground[i];
      // Colours come from the map's tileset palette so every region reads differently.
      let col = g === 'water' ? pal.water1 : g === 'dirt' || g === 'soil' ? pal.dirt2 : g === 'path_stone' ? pal.stone2 : g === 'ruin_floor' ? (pal.ruin2 ?? pal.stone2) : g === 'sand' ? pal.sand1 : pal.grass3;
      if (map.collision[i]) col = map.wall[i] === 'thicket' ? pal.thicket2 : map.wall[i] === 'ruin_wall' ? (pal.thicket1 ?? '#4a3a2a') : '#4a3a2a';
      ctx.fillStyle = col;
      ctx.fillRect(x * 3, y * 3, 3, 3);
    }
    for (const b of map.buildings) { ctx.fillStyle = '#8a4a3a'; ctx.fillRect(b.x * 3, b.y * 3, b.w * 3, b.h * 3); }
    this.miniBase = c;
    this.miniName.textContent = map.def.name;
    this.buildHotbar();
  }

  private drawMinimap() {
    const w = this.app.world!;
    if (!this.miniBase) this.resetMinimap();
    const ctx = this.miniCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 186, 140);
    ctx.drawImage(this.miniBase!, 0, 0, 186, 140);
    const sx = 186 / (w.map.width * TILE), sy = 140 / (w.map.height * TILE);
    const dot = (x: number, y: number, col: string, r = 2) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x * sx) - r, Math.round(y * sy) - r, r * 2, r * 2); };
    for (const p of w.map.def.portals) dot((p.x + p.w / 2) * TILE, (p.y + p.h / 2) * TILE, '#7fd6ff', 3);
    for (const m of w.monsters.values()) if (!m.dead) dot(m.x, m.y, m.boss ? '#ff3b30' : m.targetId ? '#ff8a3a' : '#e04a3a', m.boss ? 4 : 1.5);
    for (const n of w.npcs) dot(n.x, n.y, '#ffd34d', 2);
    dot(w.player.x, w.player.y, '#ffffff', 3);
    this.miniCoords.textContent = `${Math.floor(w.player.x / TILE)}, ${Math.floor(w.player.y / TILE)}${w.map.def.levelRange ? `  ·  Lv.${w.map.def.levelRange.join('–')}` : w.map.def.type === 'instance' ? '  ·  Memorial dungeon' : w.map.def.type === 'town' ? '  ·  Town' : ''}`;
  }

  // ---------------------------------------------------------------- per frame
  update() {
    const w = this.app.world;
    if (!w) return;
    const c = w.char, s = w.stats;
    this.hpBar.set(c.hp, s.maxHp);
    this.mpBar.set(c.mp, s.maxMp);
    const now = performance.now();
    this.updateCast();
    this.updateBoss();
    if (now - this.lastSlow < 120) return;
    this.lastSlow = now;
    if (!this.instTimer.parentElement) this.root.appendChild(this.instTimer);
    if (!this.clockEl.parentElement) this.root.appendChild(this.clockEl);
    const hr = w.hourOfDay, hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    const ev = w.event;
    const evLeft = ev ? Math.max(0, Math.ceil((ev.endsAt - w.time) / 1000)) : 0;
    this.clockEl.textContent = `${w.isNight ? '☾' : '☀'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${ev && !ev.done ? `  ·  ⚔ Raid: ${ev.mapName} ${Math.floor(evLeft / 60)}:${String(evLeft % 60).padStart(2, '0')}` : ''}`;
    const ins = w.instance, idef = ins && w.data.instances.get(ins.id);
    if (ins && idef) {
      const left = Math.max(0, Math.ceil((ins.endsAt - w.time) / 1000));
      this.instTimer.style.display = 'block';
      this.instTimer.textContent = ins.done ? `${idef.name} — cleared!` : `${idef.name} · ${idef.floors.length > 4 ? 'Floor' : 'Room'} ${ins.floor}/${idef.floors.length}${ins.cleared ? ' · cleared' : ''} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    } else this.instTimer.style.display = 'none';
    const cls = w.data.classes.get(c.classId)!;
    setChildren(this.whoName, c.name, h('span', {}, `${cls.name} · Lv ${c.baseLevel} / ${c.jobLevel}`));
    const bn = expToNextBase(w.data, c.baseLevel), jn = expToNextJob(w.data, c.jobLevel);
    this.expBar.set(c.baseExp, bn, `${((c.baseExp / bn) * 100).toFixed(1)}%`);
    this.jexpBar.set(c.jobExp, jn, c.jobLevel >= cls.maxJobLevel ? 'MAX' : `${((c.jobExp / jn) * 100).toFixed(1)}%`);
    this.lumaEl.textContent = `${c.luma.toLocaleString()} Luma`;
    const portraitKey = JSON.stringify(lookForCharacter(w.data, c));
    if (portraitKey !== this.lastPortraitKey) {
      this.lastPortraitKey = portraitKey;
      const p = portraitFromSheet(generateCharacterSheet(lookForCharacter(w.data, c)), 3);
      const ctx = this.portrait.getContext('2d')!;
      ctx.clearRect(0, 0, 96, 96);
      ctx.drawImage(p, 0, 0);
    }
    this.updateHotbar();
    this.drawMinimap();
    this.updateBuffs();
    this.updateTarget();
    this.updateTracker();
  }

  private updateCast() {
    const w = this.app.world!;
    const cast = w.player.cast;
    if (!cast) { this.castEl.classList.add('hidden'); return; }
    this.castEl.classList.remove('hidden');
    const pct = (w.time - cast.startedAt) / (cast.endsAt - cast.startedAt);
    const name = w.data.skills.get(cast.skillId)?.name ?? cast.skillId;
    setChildren(this.castEl, `Casting ${name}`, h('div', { class: 'bar' }, h('div', { class: 'fill', style: { width: `${Math.min(100, pct * 100)}%` } })));
  }

  private updateBuffs() {
    const w = this.app.world!;
    const items: HTMLElement[] = [];
    for (const b of w.player.buffs) {
      items.push(h('div', { class: 'buff', style: { background: b.color }, title: b.name }, `${Math.ceil((b.expiresAt - w.time) / 1000)}`));
    }
    for (const st of w.player.statuses) {
      const def = w.data.statuses.get(st.id)!;
      items.push(h('div', { class: 'buff debuff', style: { background: def.color }, title: `${def.name}: ${def.description}` }, `${Math.ceil((st.expiresAt - w.time) / 1000)}`));
    }
    setChildren(this.buffsEl, items);
  }

  private updateTarget() {
    const w = this.app.world!;
    const t = w.currentTarget;
    if (!t || t.dead || t.boss) { this.targetEl.classList.add('hidden'); return; }
    this.targetEl.classList.remove('hidden');
    const sts = t.statuses.map((s) => w.data.statuses.get(s.id)!.name).join(', ');
    setChildren(this.targetEl,
      h('div', { class: 'tname' }, `${t.def.name}  `, h('span', { class: 'muted' }, `Lv.${t.def.level} · ${t.def.element} ${t.def.elementLevel ?? 1} · ${t.def.race}`)),
      barEl('hp', t.hp, t.maxHp, `${Math.ceil(t.hp)} / ${t.maxHp}`),
      sts ? h('div', { class: 'muted', style: 'font-size:11px;margin-top:2px' }, sts) : null);
  }

  private updateBoss() {
    const w = this.app.world!;
    const b = w.activeBoss;
    if (!b || !b.boss) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    this.bossEl.classList.toggle('enraged', b.boss.enraged);
    setChildren(this.bossEl,
      h('div', { class: 'bname' }, `${b.def.name}`, b.boss.enraged ? h('span', { class: 'bad' }, '  ENRAGED') : null),
      h('div', { class: 'bphase' }, `${b.boss.def.title} — ${b.boss.def.phases[b.boss.phase].name}`),
      barEl('hp', b.hp, b.maxHp, `${Math.ceil(b.hp).toLocaleString()} / ${b.maxHp.toLocaleString()}  (${Math.ceil((b.hp / b.maxHp) * 100)}%)`));
  }

  private updateTracker() {
    const w = this.app.world!;
    const list = activeQuests(w.data, w.char).sort((a, b) => order(a.def.category) - order(b.def.category));
    if (!list.length) {
      setChildren(this.trackerEl, h('h4', {}, 'Quests'), h('div', { class: 'muted', style: 'font-size:11px' }, 'No active quests. Look for NPCs with a ! above them.'));
      return;
    }
    setChildren(this.trackerEl, h('h4', {}, `Quests (${list.length})`), list.slice(0, 5).map(({ def, prog }) =>
      h('div', { class: 'q' },
        h('div', { class: 'qn' }, prog.status === 'ready' ? '✔ ' : '', def.name),
        prog.status === 'ready'
          ? h('div', { class: 'qo done' }, `Return to ${w.data.npcs.get(def.turnInNpc)?.name}`)
          : def.objectives.map((o, i) => {
            const n = objectiveTarget(o);
            const done = prog.counts[i] >= n;
            return h('div', { class: `qo${done ? ' done' : ''}` }, `${o.label}${n > 1 ? ` ${prog.counts[i]}/${n}` : done ? ' ✔' : ''}`);
          }))));
  }
}

function order(cat: string) { return ['main', 'job', 'side', 'daily', 'event'].indexOf(cat); }

function bar(kind: string) {
  const fill = h('div', { class: 'fill' });
  const txt = h('div', { class: 'txt' });
  const el = h('div', { class: `bar ${kind}` }, fill, txt);
  return {
    el,
    set(v: number, max: number, label?: string) {
      fill.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
      txt.textContent = label ?? `${Math.floor(v)} / ${max}`;
    },
  };
}

function barEl(kind: string, v: number, max: number, label: string) {
  const b = bar(kind);
  b.set(v, max, label);
  return b.el;
}
