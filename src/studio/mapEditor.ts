// Map editor: the map drawn with the game's own painters; select, drag, delete and place
// objects, buildings, NPCs, portals, spawn points, scenery and areas; paint ground, walls and
// decoration by hand; edit any field; check reachability and save to this browser.
import { compileMap, TILE, type CompiledMap } from '../core/mapCompiler';
import type { MapDef, PaintOp } from '../core/types';
import { generateCharacterSheet } from '../game/art/characterSprite';
import { paintBuilding, paintGroundLayer, paintObject, paintWallLayer, LANDMARK_STYLE } from '../game/art/mapPainter';
import { mapArtPaths, scenerySprite } from '../game/art/scenery';
import { loadThemeArt } from '../game/art/themeArt';
import { CHAR_FRAME_H, CHAR_FRAME_W } from '../game/art/spriteMeta';
import { h, setChildren } from '../ui/dom';
import { clone, editText, row, type StudioCtx } from './context';
import { deleteEntity, entities, entityData, freezeScatter, mapProblems, moveEntity, paintCell, type Entity } from './mapEdit';
import { deleteMap, saveMap } from './store';
import { View } from './view';

type Tool = 'select' | 'object' | 'building' | 'ground' | 'wall' | 'deco';
const T = TILE, CH = 16;
const BUILDING_STYLES = ['house', 'inn', 'shop', 'smithy', 'guild', 'knight_guild', 'ranger_guild', 'mage_guild', 'merchant_guild', 'aurelion_residence', ...Object.keys(LANDMARK_STYLE)];
const SCENERY = ['city_wall', 'city_gate', 'castle'];

export class MapEditor {
  readonly root: HTMLElement;
  private def!: MapDef;
  private cm!: CompiledMap;
  private view: View;
  private tool: Tool = 'select';
  private sel: Entity | null = null;
  private undo: string[] = [];
  private redo: string[] = [];
  private chunks = new Map<string, { g: HTMLCanvasElement; w: HTMLCanvasElement }>();
  private sprites = new Map<string, HTMLCanvasElement>();
  private drag: { e: Entity; ox: number; oy: number; moved: boolean; before: string } | null = null;
  private painting: string | null = null;
  private hover: [number, number] | null = null;
  private show = { grid: false, collision: false, zones: true };
  private dirty = false;
  private artSeen = -1;
  private ready = false;
  private side = h('div', { class: 'st-side' });
  private props = h('div', { class: 'st-side right' });
  private status = h('span', { class: 'st-muted' });
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private pick = { object: 'tree_oak', building: 'house', ground: 'grass', wall: 'thicket', deco: 'flowers', brush: 1 };

  constructor(private st: StudioCtx, private mapId: string, private onChange: () => void) {
    const stage = h('div', { class: 'st-stage' });
    const tb = (t: Tool, label: string, key: string) => {
      const b = h('button', { class: 'st-btn', title: `${label} (${key})`, onclick: () => this.setTool(t) }, label) as HTMLButtonElement;
      this.toolBtns.set(t, b);
      return b;
    };
    const toggle = (k: keyof MapEditor['show'], label: string) => {
      const b = h('button', { class: `st-btn${this.show[k] ? ' on' : ''}`, onclick: () => { this.show[k] = !this.show[k]; b.classList.toggle('on', this.show[k]); this.view.redraw(); } }, label);
      return b;
    };
    this.root = h('div', { class: 'st-body' }, this.side,
      h('div', { class: 'st-main' },
        h('div', { class: 'st-bar' },
          tb('select', '🖐 เลือก/ย้าย', 'V'), tb('object', '🌳 วางวัตถุ', 'O'), tb('building', '🏠 วางอาคาร', 'B'),
          tb('ground', '🟩 ทาพื้น', 'G'), tb('wall', '🧱 ทากำแพง', 'W'), tb('deco', '🌼 ทาของตกแต่ง', 'D'),
          h('span', { class: 'st-spacer' }), toggle('grid', '# กริด'), toggle('collision', '⛔ จุดเดินไม่ได้'), toggle('zones', '▭ โซนมอนสเตอร์')),
        h('div', { class: 'st-bar' },
          h('button', { class: 'st-btn', title: 'Ctrl+Z', onclick: () => this.doUndo() }, '↶ ย้อน'), h('button', { class: 'st-btn', title: 'Ctrl+Y', onclick: () => this.doRedo() }, '↷ ทำซ้ำ'),
          h('button', { class: 'st-btn', onclick: () => this.addMenu() }, '＋ เพิ่ม…'),
          h('button', { class: 'st-btn', onclick: () => this.editJson() }, '{ } JSON ทั้งแมพ'),
          h('button', { class: 'st-btn', onclick: () => this.check(true) }, '✔ ตรวจแมพ'),
          this.status, h('span', { class: 'st-spacer' }),
          h('button', { class: 'st-btn danger', onclick: () => this.revert() }, 'คืนแมพเดิม'),
          h('button', { class: 'st-btn primary', id: 'map-save', onclick: () => this.save() }, 'บันทึกแมพ')),
        stage),
      this.props);
    this.view = new View(stage, (v) => this.draw(v), 0.05, 6);
    this.bindPointer();
    window.addEventListener('keydown', this.onKey);
    this.setTool('select');
    void this.open();
  }

  get id() { return this.mapId; }

  private async open() {
    const src = this.st.data.maps.get(this.mapId)!;
    // Scattered trees and rocks become ordinary objects so each one can be moved or deleted.
    this.def = freezeScatter(this.st.data, clone(src));
    await this.recompile(true);
    this.view.fit(this.def.width * T, this.def.height * T, 1);
    this.ready = true;
    this.renderSide(); this.renderProps();
  }

  private async recompile(loadArt = false) {
    try { this.cm = compileMap(this.st.data, this.def); } catch (e) { this.st.toast(`คอมไพล์แมพไม่ได้: ${(e as Error).message}`); return; }
    if (loadArt) {
      await loadThemeArt(this.def.tileset, mapArtPaths(this.cm, (k) => this.st.data.objectKinds.get(k)?.art));
      // Anything painted while the art was still loading used the fallback drawing.
      this.chunks.clear(); this.sprites.clear();
    }
    this.updateStatus();
    this.view.redraw();
  }

  private updateStatus() {
    this.status.textContent = `${this.def.width}×${this.def.height} · ${this.cm?.objects.length ?? 0} วัตถุ · ${this.cm?.buildings.length ?? 0} อาคาร${this.dirty ? ' · ยังไม่บันทึก' : ''}${this.st.layer.maps.has(this.mapId) ? ' · แก้แล้ว' : ''}`;
  }

  private setTool(t: Tool) {
    this.tool = t;
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
    if (this.ready) this.renderSide();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.root.isConnected || (e.target as HTMLElement).matches?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); this.doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); void this.save(); return; }
    if ((k === 'delete' || k === 'backspace') && this.sel) { e.preventDefault(); this.deleteSel(); return; }
    const tools: Record<string, Tool> = { v: 'select', o: 'object', b: 'building', g: 'ground', w: 'wall', d: 'deco' };
    if (tools[k] && !e.ctrlKey && !e.metaKey) this.setTool(tools[k]);
    if (this.sel && k.startsWith('arrow')) {
      e.preventDefault();
      const d = entityData(this.def, this.sel) as { x: number; y: number };
      const [dx, dy] = k === 'arrowleft' ? [-1, 0] : k === 'arrowright' ? [1, 0] : k === 'arrowup' ? [0, -1] : [0, 1];
      this.mutate(() => moveEntity(this.def, this.sel!, d.x + dx, d.y + dy));
    }
  };

  // ---------------------------------------------------------------- edits
  private snapshot(): string { return JSON.stringify(this.def); }
  private pushUndo(before: string) {
    this.undo.push(before);
    if (this.undo.length > 100) this.undo.shift();
    this.redo = [];
    this.dirty = true;
  }
  /** Runs an edit with undo, then recompiles. */
  private mutate(fn: () => void, groundChanged = false) {
    const before = this.snapshot();
    fn();
    this.pushUndo(before);
    if (groundChanged) this.chunks.clear();
    this.reselect();
    void this.recompile();
    this.renderProps();
  }
  private doUndo() { const s = this.undo.pop(); if (!s) return; this.redo.push(this.snapshot()); this.def = JSON.parse(s); this.afterHistory(); }
  private doRedo() { const s = this.redo.pop(); if (!s) return; this.undo.push(this.snapshot()); this.def = JSON.parse(s); this.afterHistory(); }
  private afterHistory() { this.dirty = true; this.chunks.clear(); this.sel = null; void this.recompile(true); this.renderProps(); }

  /** Keeps the selection pointing at the same thing after the lists change. */
  private reselect() {
    if (!this.sel) return;
    const list = entities(this.st.data, this.def);
    this.sel = list.find((e) => e.type === this.sel!.type && e.key === this.sel!.key) ?? null;
  }

  private deleteSel() {
    if (!this.sel) return;
    const s = this.sel;
    this.sel = null;
    this.mutate(() => deleteEntity(this.def, s));
  }

  // ---------------------------------------------------------------- drawing
  private chunk(cx: number, cy: number) {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (!c) {
      const pal = this.st.data.tilesets.get(this.def.tileset)!.palette;
      const region = { x: cx * CH, y: cy * CH, w: Math.min(CH, this.cm.width - cx * CH), h: Math.min(CH, this.cm.height - cy * CH) };
      c = { g: paintGroundLayer(this.cm, pal, region), w: paintWallLayer(this.cm, pal, region) };
      this.chunks.set(key, c);
    }
    return c;
  }

  private sprite(key: string, make: () => HTMLCanvasElement) {
    let s = this.sprites.get(key);
    if (!s) { s = make(); this.sprites.set(key, s); }
    return s;
  }

  private objectSprite(kind: string) {
    const k = this.st.data.objectKinds.get(kind);
    if (!k) return null;
    const pal = this.st.data.tilesets.get(this.def.tileset)!.palette;
    return this.sprite(`o:${kind}`, () => paintObject(k, pal, 1000, this.def.tileset));
  }

  private buildingSprite(op: Extract<PaintOp, { op: 'building' }>) {
    return this.sprite(`b:${op.style}:${op.w}:${op.h}:${op.door}:${op.sign ?? ''}`, () => paintBuilding({ ...op }, this.def.tileset));
  }

  private npcSprite(npcId: string) {
    return this.sprite(`n:${npcId}`, () => {
      const n = this.st.data.npcs.get(npcId);
      const c = document.createElement('canvas');
      c.width = CHAR_FRAME_W; c.height = CHAR_FRAME_H;
      if (n) c.getContext('2d')!.drawImage(generateCharacterSheet({ appearance: n.appearance, outfit: n.outfit, weapon: null }), 0, 0, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
      return c;
    });
  }

  /** Screen box (world px) an entity is clicked by: the sprite for objects and buildings. */
  private hitBox(e: Entity): [number, number, number, number] {
    if (e.type === 'object') {
      const op = this.def.paint[e.key as number] as Extract<PaintOp, { op: 'object' }>;
      const s = this.objectSprite(op.kind);
      const bx = (e.x + e.w / 2) * T, by = (e.y + e.h) * T + 2;
      return s ? [bx - s.width / 2, by - s.height, s.width, s.height] : [e.x * T, e.y * T, e.w * T, e.h * T];
    }
    if (e.type === 'building') {
      const s = this.buildingSprite(this.def.paint[e.key as number] as Extract<PaintOp, { op: 'building' }>);
      return [e.x * T - 4, (e.y + e.h) * T + 4 - s.height, s.width, s.height];
    }
    if (e.type === 'npc') return [e.x * T + T / 2 - 16, (e.y + 1) * T - 52, 32, 52];
    return [e.x * T, e.y * T, e.w * T, e.h * T];
  }

  private draw(v: View) {
    if (!this.cm) return;
    if (this.artSeen !== this.st.artVersion) { this.artSeen = this.st.artVersion; this.chunks.clear(); this.sprites.clear(); }
    const c = v.ctx, W = this.cm.width, H = this.cm.height;
    const x0 = Math.max(0, Math.floor(v.x / (CH * T))), y0 = Math.max(0, Math.floor(v.y / (CH * T)));
    const x1 = Math.min(Math.ceil(W / CH) - 1, Math.floor((v.x + v.canvas.width / v.zoom) / (CH * T)));
    const y1 = Math.min(Math.ceil(H / CH) - 1, Math.floor((v.y + v.canvas.height / v.zoom) / (CH * T)));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) c.drawImage(this.chunk(cx, cy).g, cx * CH * T, cy * CH * T);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) c.drawImage(this.chunk(cx, cy).w, cx * CH * T, cy * CH * T);

    // Sprites sorted by their base, like the game.
    const items: { y: number; draw: () => void }[] = [];
    for (const [i, op] of this.def.paint.entries()) {
      if (op.op === 'object') {
        const s = this.objectSprite(op.kind), k = this.st.data.objectKinds.get(op.kind);
        if (!s || !k) continue;
        const bx = (op.x + k.footprint.w / 2) * T, by = (op.y + k.footprint.h) * T + 2;
        items.push({ y: by, draw: () => c.drawImage(s, bx - s.width / 2, by - s.height) });
      } else if (op.op === 'building') {
        const s = this.buildingSprite(op);
        items.push({ y: (op.y + op.h) * T, draw: () => c.drawImage(s, op.x * T - 4, (op.y + op.h) * T + 4 - s.height) });
      }
      void i;
    }
    for (const sc of this.def.scenery ?? []) {
      const img = scenerySprite(sc, this.def.tileset);
      if (img) items.push({ y: (sc.y + sc.h) * T, draw: () => c.drawImage(img, sc.x * T, sc.y * T, sc.w * T, sc.h * T) });
    }
    for (const n of this.def.npcs) {
      const s = this.npcSprite(n.npcId);
      items.push({ y: (n.y + 1) * T, draw: () => c.drawImage(s, n.x * T + T / 2 - CHAR_FRAME_W / 2, (n.y + 1) * T - CHAR_FRAME_H + 4) });
    }
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

    const lw = 1 / v.zoom;
    c.lineWidth = 2 * lw;
    const label = (text: string, x: number, y: number, color: string) => {
      if (v.zoom < 0.25) return;
      c.font = `${Math.max(10, 11 / v.zoom)}px system-ui`;
      c.fillStyle = '#000a'; const w = c.measureText(text).width;
      c.fillRect(x - 2 * lw, y - 12 / v.zoom, w + 4 * lw, 14 / v.zoom);
      c.fillStyle = color; c.fillText(text, x, y);
    };
    if (this.show.collision) {
      c.fillStyle = '#ff303040';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.cm.collision[y * W + x]) c.fillRect(x * T, y * T, T, T);
    }
    if (this.show.grid && v.zoom > 0.3) {
      c.strokeStyle = '#ffffff22'; c.lineWidth = lw;
      for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x * T, 0); c.lineTo(x * T, H * T); c.stroke(); }
      for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(0, y * T); c.lineTo(W * T, y * T); c.stroke(); }
      c.lineWidth = 2 * lw;
    }
    for (const e of entities(this.st.data, this.def)) {
      const [x, y, w, hh] = [e.x * T, e.y * T, e.w * T, e.h * T];
      if (e.type === 'portal') { c.fillStyle = '#7fd6ff40'; c.fillRect(x, y, w, hh); c.strokeStyle = '#7fd6ff'; c.strokeRect(x, y, w, hh); label(e.label, x, y - 3 * lw, '#bfe9ff'); }
      if (e.type === 'spawn') { c.fillStyle = '#6ff0c0'; c.beginPath(); c.arc(x + T / 2, y + T / 2, 9, 0, 7); c.fill(); label(`⚑ ${e.label}`, x, y - 3 * lw, '#6ff0c0'); }
      if (e.type === 'boss') { c.fillStyle = '#ff5a5a'; c.beginPath(); c.arc(x + T / 2, y + T / 2, 11, 0, 7); c.fill(); label(`☠ ${e.label}`, x, y - 3 * lw, '#ff9a9a'); }
      if (e.type === 'npc') label(e.label, x - 10, y + T + 12 / v.zoom, '#ffe9a8');
      if (this.show.zones && (e.type === 'mobs' || e.type === 'area')) {
        c.setLineDash([6 * lw, 4 * lw]); c.strokeStyle = e.type === 'mobs' ? '#ffb84d' : '#c89aff'; c.strokeRect(x, y, w, hh); c.setLineDash([]);
        label(e.label, x + 3 * lw, y + 14 / v.zoom, e.type === 'mobs' ? '#ffd38a' : '#e0c8ff');
      }
    }
    if (this.sel) { const [x, y, w, hh] = this.hitBox(this.sel); c.strokeStyle = '#ffd34d'; c.lineWidth = 3 * lw; c.strokeRect(x, y, w, hh); c.strokeStyle = '#ffd34d88'; c.strokeRect(this.sel.x * T, this.sel.y * T, this.sel.w * T, this.sel.h * T); }
    if (this.hover && this.tool !== 'select') {
      const [hx, hy] = this.hover;
      const b = ['ground', 'wall', 'deco'].includes(this.tool) ? this.pick.brush : 1;
      const o = Math.floor((b - 1) / 2);
      c.strokeStyle = '#ffffffaa'; c.lineWidth = 2 * lw;
      if (this.tool === 'object') { const k = this.st.data.objectKinds.get(this.pick.object); c.strokeRect(hx * T, hy * T, (k?.footprint.w ?? 1) * T, (k?.footprint.h ?? 1) * T); }
      else if (this.tool === 'building') c.strokeRect(hx * T, hy * T, 8 * T, 5 * T);
      else c.strokeRect((hx - o) * T, (hy - o) * T, b * T, b * T);
    }
    c.strokeStyle = '#6a5a8a'; c.lineWidth = 2 * lw; c.strokeRect(0, 0, W * T, H * T);
  }

  // ---------------------------------------------------------------- pointer
  private bindPointer() {
    const cv = this.view.canvas;
    const cell = (e: PointerEvent) => { const [x, y] = this.view.toWorld(e.offsetX, e.offsetY); return [x / T, y / T] as const; };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.view.isPanning || !this.cm) return;
      cv.setPointerCapture(e.pointerId);
      const [fx, fy] = cell(e), x = Math.floor(fx), y = Math.floor(fy);
      if (this.tool === 'select') {
        const [wx, wy] = this.view.toWorld(e.offsetX, e.offsetY);
        const list = entities(this.st.data, this.def).reverse();
        // Small things first (NPCs, spawns, portals, objects), then buildings, then big zones.
        const order = ['npc', 'spawn', 'boss', 'portal', 'object', 'scenery', 'building', 'mobs', 'area'];
        list.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
        const hit = list.find((en) => { const [bx, by, bw, bh] = this.hitBox(en); return wx >= bx && wy >= by && wx < bx + bw && wy < by + bh && (this.show.zones || (en.type !== 'mobs' && en.type !== 'area')); }) ?? null;
        this.sel = hit;
        if (hit) { const d = entityData(this.def, hit) as { x: number; y: number }; this.drag = { e: hit, ox: fx - d.x, oy: fy - d.y, moved: false, before: this.snapshot() }; }
        this.renderProps(); this.view.redraw();
      } else if (this.tool === 'object') {
        this.mutate(() => this.def.paint.push({ op: 'object', kind: this.pick.object, x, y }));
      } else if (this.tool === 'building') {
        const style = this.pick.building, big = style === 'aurelion_palace' ? [36, 12] : style === 'aurelion_cathedral' ? [13, 10] : style.startsWith('aurelion_stall') ? [4, 3] : [8, 5];
        this.mutate(() => this.def.paint.push({ op: 'building', style, x, y, w: big[0], h: big[1], door: Math.floor(big[0] / 2) }));
      } else {
        this.painting = this.snapshot();
        this.paintAt(x, y);
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.cm) return;
      const [fx, fy] = cell(e), x = Math.floor(fx), y = Math.floor(fy);
      this.hover = [x, y];
      if (this.drag && !this.view.isPanning) {
        const snap = this.drag.e.type === 'scenery' ? (v: number) => Math.round(v * 4) / 4 : Math.round;
        const nx = snap(fx - this.drag.ox), ny = snap(fy - this.drag.oy);
        const d = entityData(this.def, this.drag.e) as { x: number; y: number };
        if (nx !== d.x || ny !== d.y) { moveEntity(this.def, this.drag.e, nx, ny); this.drag.moved = true; this.reselect(); }
      } else if (this.painting) this.paintAt(x, y);
      this.view.redraw();
    });
    cv.addEventListener('pointerup', () => {
      if (this.drag?.moved) { this.pushUndo(this.drag.before); void this.recompile(); this.renderProps(); }
      this.drag = null;
      if (this.painting) { this.pushUndo(this.painting); this.painting = null; void this.recompile(); }
    });
    cv.addEventListener('pointerleave', () => { this.hover = null; this.view.redraw(); });
  }

  private paintAt(x: number, y: number) {
    const layer = this.tool as 'ground' | 'wall' | 'deco';
    const tile = this.pick[layer] === '(ลบ)' ? null : this.pick[layer];
    const b = this.pick.brush, o = Math.floor((b - 1) / 2);
    for (let yy = y - o; yy < y - o + b; yy++) for (let xx = x - o; xx < x - o + b; xx++) {
      paintCell(this.def, layer, xx, yy, tile);
      if (xx < 0 || yy < 0 || xx >= this.cm.width || yy >= this.cm.height) continue;
      const i = yy * this.cm.width + xx;
      if (layer === 'ground') this.cm.ground[i] = tile ?? this.def.base; else if (layer === 'deco') this.cm.deco[i] = tile; else this.cm.wall[i] = tile;
    }
    // Repaint the touched chunks (and neighbours, for edges that spill over).
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) this.chunks.delete(`${Math.floor((x + dx * b) / CH)},${Math.floor((y + dy * b) / CH)}`);
    this.view.redraw();
  }

  // ---------------------------------------------------------------- panels
  private renderSide() {
    const d = this.st.data;
    const sel = (opts: string[], value: string, on: (v: string) => void) => h('select', { onchange: (e: Event) => on((e.target as HTMLSelectElement).value) },
      ...opts.map((o) => h('option', { value: o, selected: o === value }, o)));
    const tiles = (layer: string) => [...d.tiles.values()].filter((t) => t.layer === layer).map((t) => t.id);
    const brush = row('ขนาดแปรง', sel(['1', '2', '3', '5', '8'], String(this.pick.brush), (v) => { this.pick.brush = +v; }));
    const parts: (Node | null)[] = [h('div', { class: 'st-h' }, 'เครื่องมือ')];
    if (this.tool === 'select') parts.push(h('div', { class: 'st-muted' }, 'คลิกเพื่อเลือก ลากเพื่อย้าย ปุ่มลูกศรขยับทีละช่อง Delete ลบ · ลากด้วยปุ่มขวา/กลาง หรือกด Space ค้างเพื่อเลื่อนมุมมอง ล้อเมาส์ซูม'));
    if (this.tool === 'object') {
      const list = h('div', { class: 'st-list' });
      for (const k of d.objectKinds.values()) {
        const pal = d.tilesets.get(this.def.tileset)!.palette;
        const cv = paintObject(k, pal, 1000, this.def.tileset);
        list.appendChild(h('button', { class: `st-item${k.id === this.pick.object ? ' on' : ''}`, onclick: () => { this.pick.object = k.id; this.renderSide(); } }, cv, k.id));
      }
      parts.push(h('div', { class: 'st-muted' }, 'คลิกบนแมพเพื่อวาง'), list);
    }
    if (this.tool === 'building') parts.push(h('div', { class: 'st-muted' }, 'คลิกบนแมพเพื่อวาง (ประตูหันลงล่าง)'), row('แบบ', sel(BUILDING_STYLES, this.pick.building, (v) => { this.pick.building = v; })));
    if (this.tool === 'ground') parts.push(row('พื้น', sel(tiles('ground'), this.pick.ground, (v) => { this.pick.ground = v; })), brush, h('div', { class: 'st-muted' }, 'ลากเพื่อทาพื้น'));
    if (this.tool === 'wall') parts.push(row('กำแพง', sel([...tiles('wall'), '(ลบ)'], this.pick.wall, (v) => { this.pick.wall = v; })), brush, h('div', { class: 'st-muted' }, 'กำแพงกันการเดิน · (ลบ) เอากำแพงออก'));
    if (this.tool === 'deco') parts.push(row('ตกแต่ง', sel([...tiles('deco'), '(ลบ)'], this.pick.deco, (v) => { this.pick.deco = v; })), brush);
    parts.push(h('div', { class: 'st-h' }, 'รายการบนแมพ'));
    const list = h('div', { class: 'st-list' });
    const names: Record<string, string> = { npc: '🧑', portal: '🌀', spawn: '⚑', building: '🏠', scenery: '🏰', boss: '☠', mobs: '👾', area: '▭' };
    for (const e of entities(d, this.def)) if (e.type !== 'object') list.appendChild(h('button', { class: 'st-item', onclick: () => { this.sel = e; this.view.centerOn((e.x + e.w / 2) * T, (e.y + e.h / 2) * T); this.renderProps(); } }, `${names[e.type] ?? ''} ${e.label}`));
    parts.push(list);
    setChildren(this.side, ...parts);
  }

  private renderProps() {
    const d = this.st.data;
    if (!this.sel) {
      const def = this.def;
      const set = (k: keyof MapDef, v: unknown, ground = false) => this.mutate(() => { (def as unknown as Record<string, unknown>)[k] = v; }, ground);
      setChildren(this.props,
        h('div', { class: 'st-h' }, 'ตั้งค่าแมพ'),
        row('ชื่อ', h('input', { value: def.name, onchange: (e: Event) => set('name', (e.target as HTMLInputElement).value) })),
        row('ชุดภาพ', h('select', { onchange: (e: Event) => { set('tileset', (e.target as HTMLSelectElement).value, true); this.sprites.clear(); void this.recompile(true); } }, ...[...d.tilesets.keys()].map((t) => h('option', { value: t, selected: t === def.tileset }, t)))),
        row('พื้นฐาน', h('select', { onchange: (e: Event) => set('base', (e.target as HTMLSelectElement).value, true) }, ...[...d.tiles.values()].filter((t) => t.layer === 'ground').map((t) => h('option', { value: t.id, selected: t.id === def.base }, t.id)))),
        row('กว้าง', h('input', { type: 'number', min: 20, max: 300, value: def.width, onchange: (e: Event) => set('width', +(e.target as HTMLInputElement).value, true) })),
        row('สูง', h('input', { type: 'number', min: 20, max: 300, value: def.height, onchange: (e: Event) => set('height', +(e.target as HTMLInputElement).value, true) })),
        row('ขอบแมพ', h('select', { onchange: (e: Event) => set('border', { ...def.border, kind: (e.target as HTMLSelectElement).value }, true) }, ...[...d.tiles.values()].filter((t) => t.layer === 'wall').map((t) => h('option', { value: t.id, selected: t.id === def.border.kind }, t.id)))),
        h('div', { class: 'st-muted' }, 'คลิกสิ่งของบนแมพเพื่อแก้ค่าของมัน · ฟิลด์อื่นทั้งหมดแก้ได้ใน { } JSON ทั้งแมพ'),
        h('div', { class: 'st-h' }, 'ปัญหา'), h('div', { class: 'st-warn', id: 'map-problems' }, this.problemsText()));
      return;
    }
    const e = this.sel;
    const rec = e.type === 'mobs' ? this.def.monsterSpawns[e.key as number] : e.type === 'area' ? this.def.areas[e.key as number] : entityData(this.def, e);
    const choices: Record<string, string[]> = {
      kind: e.type === 'scenery' ? SCENERY : [...d.objectKinds.keys()], style: BUILDING_STYLES, targetMap: [...d.maps.keys()].sort(),
      npcId: [...d.npcs.keys()].sort(), monsterId: [...d.monsters.keys()].sort(), bossId: [...d.bosses.keys()], facing: ['down', 'up', 'left', 'right'],
    };
    const fields = Object.entries(rec as Record<string, unknown>).filter(([k, v]) => k !== 'op' && (typeof v !== 'object' || v === null));
    const set = (k: string, v: unknown) => this.mutate(() => { (rec as Record<string, unknown>)[k] = v; if (k === 'kind' || k === 'style') this.sprites.clear(); });
    const input = (k: string, v: unknown) => {
      if (choices[k]) return h('select', { onchange: (ev: Event) => set(k, (ev.target as HTMLSelectElement).value) }, ...choices[k].map((o) => h('option', { value: o, selected: o === v }, o)));
      if (typeof v === 'number') return h('input', { type: 'number', step: e.type === 'scenery' ? 0.25 : 1, value: v, onchange: (ev: Event) => set(k, +(ev.target as HTMLInputElement).value) });
      if (typeof v === 'boolean') return h('input', { type: 'checkbox', checked: v, onchange: (ev: Event) => set(k, (ev.target as HTMLInputElement).checked) });
      return h('input', { value: String(v ?? ''), onchange: (ev: Event) => set(k, (ev.target as HTMLInputElement).value) });
    };
    const titles: Record<string, string> = { building: 'อาคาร', object: 'วัตถุ', npc: 'NPC', portal: 'ประตูวาร์ป', spawn: 'จุดเกิด', scenery: 'ฉาก', boss: 'บอส', mobs: 'โซนมอนสเตอร์', area: 'พื้นที่' };
    setChildren(this.props,
      h('div', { class: 'st-h' }, `${titles[e.type]} · ${e.label}`),
      ...fields.map(([k, v]) => row(k, input(k, v))),
      e.type === 'spawn' ? h('div', { class: 'st-muted' }, `ชื่อจุดเกิด: ${e.key}`) : null,
      h('div', { class: 'st-row' },
        h('button', { class: 'st-btn', onclick: async () => {
          const t = await editText(`แก้ ${titles[e.type]} (JSON)`, JSON.stringify(rec, null, 2));
          if (t == null) return;
          try { const v = JSON.parse(t); this.mutate(() => { for (const k of Object.keys(rec as object)) delete (rec as Record<string, unknown>)[k]; Object.assign(rec as object, v); this.sprites.clear(); }); } catch (err) { this.st.toast(`JSON ไม่ถูกต้อง: ${(err as Error).message}`); }
        } }, '{ } JSON'),
        h('button', { class: 'st-btn', onclick: () => this.duplicate() }, '⧉ ทำสำเนา'),
        h('button', { class: 'st-btn danger', onclick: () => this.deleteSel() }, '🗑 ลบ')),
      h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: () => { this.sel = null; this.renderProps(); this.view.redraw(); } }, '← ตั้งค่าแมพ')));
  }

  private duplicate() {
    const e = this.sel;
    if (!e) return;
    this.mutate(() => {
      const k = e.key as number;
      if (e.type === 'building' || e.type === 'object') { const op = clone(this.def.paint[k]) as { x: number; id?: string }; op.x += 1; delete op.id; this.def.paint.push(op as PaintOp); }
      else if (e.type === 'scenery') { const s = clone(this.def.scenery![k]); s.x += 1; this.def.scenery!.push(s); }
      else if (e.type === 'portal') { const p = clone(this.def.portals[k]); p.x += 1; p.id = `${p.id}_copy`; this.def.portals.push(p); }
      else if (e.type === 'mobs') { const m = clone(this.def.monsterSpawns[k]); m.area.x += 1; this.def.monsterSpawns.push(m); }
      else if (e.type === 'area') { const a = clone(this.def.areas[k]); a.rect.x += 1; a.id = `${a.id}_copy`; this.def.areas.push(a); }
      else this.st.toast('สิ่งนี้ทำสำเนาไม่ได้ (NPC และจุดเกิดต้องไม่ซ้ำ)');
    });
  }

  private addMenu() {
    const d = this.st.data, def = this.def;
    const c = this.view.toWorld(this.view.canvas.width / 2, this.view.canvas.height / 2).map((v) => Math.floor(v / T));
    const usedNpcs = new Set([...d.maps.values()].flatMap((m) => m.npcs.map((n) => n.npcId)));
    const add = (fn: () => void) => { m.remove(); this.mutate(fn); this.renderSide(); };
    const npcSel = h('select', {}, ...[...d.npcs.keys()].sort().map((id) => h('option', { value: id }, `${id}${usedNpcs.has(id) ? '' : ' (ยังไม่อยู่บนแมพใด)'}`))) as HTMLSelectElement;
    const monSel = h('select', {}, ...[...d.monsters.keys()].sort().map((id) => h('option', { value: id }, id))) as HTMLSelectElement;
    const scSel = h('select', {}, ...SCENERY.map((k) => h('option', { value: k }, k))) as HTMLSelectElement;
    const spawnName = h('input', { placeholder: 'ชื่อ เช่น from_xxx', value: `spawn_${Object.keys(def.spawnPoints).length}` }) as HTMLInputElement;
    const m = h('div', { class: 'st-modal' }, h('div', {},
      h('div', { class: 'st-h' }, `เพิ่มลงแมพ (ตรงกลางมุมมอง ${c[0]}, ${c[1]})`),
      row('NPC', npcSel, h('button', { class: 'st-btn', onclick: () => add(() => def.npcs.push({ npcId: npcSel.value, x: c[0], y: c[1], facing: 'down' })) }, 'เพิ่ม')),
      row('ประตูวาร์ป', h('button', { class: 'st-btn', onclick: () => add(() => def.portals.push({ id: `portal_${def.portals.length + 1}`, x: c[0], y: c[1], w: 3, h: 2, targetMap: [...d.maps.keys()][0], targetSpawn: 'default', label: 'Portal' })) }, 'เพิ่ม')),
      row('จุดเกิด', spawnName, h('button', { class: 'st-btn', onclick: () => add(() => { def.spawnPoints[spawnName.value || `spawn_${Date.now()}`] = { x: c[0], y: c[1] }; }) }, 'เพิ่ม')),
      row('โซนมอนสเตอร์', monSel, h('button', { class: 'st-btn', onclick: () => add(() => def.monsterSpawns.push({ monsterId: monSel.value, count: 5, area: { x: c[0], y: c[1], w: 12, h: 10 } })) }, 'เพิ่ม')),
      row('ฉาก', scSel, h('button', { class: 'st-btn', onclick: () => add(() => { const [w, hh] = scSel.value === 'city_wall' ? [4, 2.1] : scSel.value === 'city_gate' ? [8, 6.7] : [8, 9.3]; (def.scenery ??= []).push({ kind: scSel.value, x: c[0], y: c[1], w, h: hh }); }) }, 'เพิ่ม')),
      row('พื้นที่ (ชื่อโซน)', h('button', { class: 'st-btn', onclick: () => add(() => def.areas.push({ id: `area_${def.areas.length + 1}`, name: 'New Area', rect: { x: c[0], y: c[1], w: 10, h: 8 } })) }, 'เพิ่ม')),
      h('div', { class: 'st-muted' }, 'วัตถุและอาคาร: ใช้เครื่องมือ 🌳 / 🏠 แล้วคลิกบนแมพ'),
      h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: () => m.remove() }, 'ปิด'))));
    document.body.appendChild(m);
  }

  private async editJson() {
    const t = await editText(`แมพ ${this.def.id} (JSON)`, JSON.stringify(this.def, null, 1), 'แก้ได้ทุกฟิลด์ของแมพ · id ต้องคงเดิม');
    if (t == null) return;
    try {
      const v = JSON.parse(t) as MapDef;
      if (v.id !== this.def.id) throw new Error('เปลี่ยน id ของแมพไม่ได้');
      compileMap(this.st.data, v);
      this.mutate(() => { this.def = v; }, true);
      this.sel = null; void this.recompile(true); this.renderSide(); this.renderProps();
    } catch (err) { this.st.toast(`ใช้ไม่ได้: ${(err as Error).message}`); }
  }

  private problemsText() { const p = mapProblems(this.st.data, this.def); return p.length ? p.join('\n') : 'ไม่มี ✔'; }

  private check(show: boolean) {
    const p = mapProblems(this.st.data, this.def);
    if (show) this.st.toast(p.length ? `พบ ${p.length} ปัญหา (ดูแผงขวา)` : 'แมพนี้ผ่านการตรวจ ✔');
    this.sel = null; this.renderProps();
    return p;
  }

  private async save() {
    const p = this.check(false);
    if (p.length && !confirm(`แมพนี้มีปัญหา:\n${p.join('\n')}\n\nบันทึกต่อไหม?`)) return;
    const def = clone(this.def);
    await saveMap(def);
    this.st.layer.maps.set(def.id, def);
    this.st.data.maps.set(def.id, def);
    this.dirty = false; this.updateStatus();
    this.onChange();
    this.st.toast(`บันทึกแมพ ${def.id} แล้ว — เกมในเบราว์เซอร์นี้จะใช้แมพใหม่`);
  }

  private async revert() {
    const shipped = this.st.shipped.maps.get(this.mapId);
    if (!confirm(shipped ? `คืนแมพ ${this.mapId} เป็นแบบเดิมของเกม? การแก้ทั้งหมดของแมพนี้จะหายไป` : `ลบแมพ ${this.mapId} ที่สร้างใน Studio?`)) return;
    await deleteMap(this.mapId);
    this.st.layer.maps.delete(this.mapId);
    if (shipped) this.st.data.maps.set(this.mapId, clone(shipped)); else this.st.data.maps.delete(this.mapId);
    this.onChange();
    if (shipped) { this.undo = []; this.redo = []; this.dirty = false; this.sel = null; this.chunks.clear(); this.sprites.clear(); await this.open(); }
  }

  destroy() { window.removeEventListener('keydown', this.onKey); this.view.destroy(); }
}
