// Map editor: the map drawn with the game's own painters; select, drag, delete and place
// objects, buildings, NPCs, portals, spawn points, scenery and areas; paint ground, walls and
// decoration by hand; edit any field; check reachability and save to this browser.
import { compileMap, TILE, type CompiledMap } from '../core/mapCompiler';
import type { MapDef, PaintOp } from '../core/types';
import { generateCharacterSheet } from '../game/art/characterSprite';
import { paintBuilding, paintGroundLayer, paintObject, paintWallLayer, LANDMARK_STYLE } from '../game/art/mapPainter';
import { mapArtPaths, scenerySprite } from '../game/art/scenery';
import { artUrl, extraSprite, GROUND_ORDER, groundSheet, loadArt, loadThemeArt } from '../game/art/themeArt';
import PL_LIB from '../data/pixellab/library.json';
import { CHAR_FRAME_H, CHAR_FRAME_W } from '../game/art/spriteMeta';
import { h, setChildren } from '../ui/dom';
import { clone, editText, helpBar, row, type StudioCtx } from './context';
import { deleteEntity, entities, entityData, freezeScatter, mapProblems, moveEntity, paintCell, type Entity } from './mapEdit';
import { deleteMap, saveMap } from './store';
import { View } from './view';

/** Things whose size can be dragged from the corner handle. */
const RESIZABLE = new Set(['building', 'portal', 'scenery', 'mobs', 'area']);
type Tool = 'select' | 'object' | 'building' | 'ground' | 'path' | 'wall' | 'deco';
const T = TILE, CH = 16;
const BUILDING_STYLES = ['house', 'inn', 'shop', 'smithy', 'guild', 'knight_guild', 'ranger_guild', 'mage_guild', 'merchant_guild', 'aurelion_residence', ...Object.keys(LANDMARK_STYLE)];
const SCENERY = ['city_wall', 'city_gate', 'castle'];

export class MapEditor {
  readonly root: HTMLElement;
  private def!: MapDef;
  private cm!: CompiledMap;
  private view: View;
  private tool: Tool = 'select';
  /** Everything selected (Shift+drag a box or Shift+click to select several). */
  private selection: Entity[] = [];
  /** The single selected thing (null when none or several are selected). */
  private get sel(): Entity | null { return this.selection.length === 1 ? this.selection[0] : null; }
  private set sel(e: Entity | null) { this.selection = e ? [e] : []; }
  private box: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null;
  private resizing: { e: Entity; before: string; moved: boolean } | null = null;
  private undo: string[] = [];
  private redo: string[] = [];
  private chunks = new Map<string, { g: HTMLCanvasElement; w: HTMLCanvasElement }>();
  private sprites = new Map<string, HTMLCanvasElement>();
  private drag: { fx: number; fy: number; origins: { e: Entity; x: number; y: number }[]; quarter: boolean; moved: boolean; before: string } | null = null;
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
  private pick = { object: 'tree_oak', building: 'house', ground: 'grass', wall: 'thicket', deco: 'flowers', brush: 1, shape: 'square' as 'square' | 'round' | 'rect' | 'ellipse' };
  /** Rectangle / ellipse area being dragged out with a paint tool (filled on release). */
  /** Points of the road being drawn with the path tool (cells). */
  private pathPts: [number, number][] | null = null;
  private pathWidth = 3;
  /** Texture tileset shown in the palette ('' = all). */
  private paletteSet = '';
  private objSearch = '';
  private objGroup: 'game' | 'pl' | 'all' = 'game';

  /** Opened from the PixelLab library: `place:<object kind>` or `ground:<tile set slug>`. */
  preset(cmd: string) {
    const [what, val] = [cmd.slice(0, cmd.indexOf(':')), cmd.slice(cmd.indexOf(':') + 1)];
    if (what === 'place') { this.pick.object = val; this.objGroup = val.startsWith('pl_') ? 'pl' : 'game'; this.objSearch = val.replace(/^pl_/, ''); this.setTool('object'); }
    if (what === 'ground') { const t = PL_LIB.tiles.find((x) => x.slug === val); this.paletteSet = `pl:${val}`; if (t) this.pick.ground = `${t.base}@pl:${val}:0`; this.setTool('ground'); }
  }
  private area: { x0: number; y0: number; x1: number; y1: number; before: string } | null = null;

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
          tb('ground', '🟩 ทาพื้น', 'G'), tb('path', '🛤 วาดทางเดิน', 'P'), tb('wall', '🧱 ทากำแพง', 'W'), tb('deco', '🌼 ทาของตกแต่ง', 'D'),
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
    if ((k === 'delete' || k === 'backspace') && this.selection.length) { e.preventDefault(); this.deleteSel(); return; }
    if (k === 'escape') { this.selection = []; this.renderProps(); this.view.redraw(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); this.selection = entities(this.st.data, this.def).filter((x) => x.type !== 'mobs' && x.type !== 'area'); this.renderProps(); this.view.redraw(); return; }
    if (this.pathPts) {
      if (k === 'enter') { e.preventDefault(); this.finishPath(); return; }
      if (k === 'escape') { this.pathPts = null; this.view.redraw(); return; }
      if (k === 'backspace') { e.preventDefault(); this.pathPts.pop(); if (!this.pathPts.length) this.pathPts = null; this.view.redraw(); return; }
    }
    const tools: Record<string, Tool> = { v: 'select', o: 'object', b: 'building', g: 'ground', p: 'path', w: 'wall', d: 'deco' };
    if (tools[k] && !e.ctrlKey && !e.metaKey) this.setTool(tools[k]);
    if (this.selection.length && k.startsWith('arrow')) {
      e.preventDefault();
      const [dx, dy] = k === 'arrowleft' ? [-1, 0] : k === 'arrowright' ? [1, 0] : k === 'arrowup' ? [0, -1] : [0, 1];
      this.mutate(() => { for (const s of this.selection) { const d = entityData(this.def, s) as { x: number; y: number }; moveEntity(this.def, s, d.x + dx, d.y + dy); } });
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
  private afterHistory() { this.dirty = true; this.chunks.clear(); this.selection = []; void this.recompile(true); this.renderProps(); }

  /** Keeps the selection pointing at the same thing after the lists change. */
  private reselect() {
    if (!this.selection.length) return;
    const list = entities(this.st.data, this.def);
    this.selection = this.selection.map((s) => list.find((e) => e.type === s.type && e.key === s.key)).filter((e): e is Entity => !!e);
  }

  private isSelected(e: Entity) { return this.selection.some((s) => s.type === e.type && s.key === e.key); }

  /** Deletes everything selected in one step (later list entries first, so indexes stay valid). */
  private deleteSel() {
    if (!this.selection.length) return;
    const group = (e: Entity) => (e.type === 'building' || e.type === 'object' ? 'paint' : e.type);
    const all = [...this.selection].sort((a, b) => (group(a) === group(b) && typeof a.key === 'number' && typeof b.key === 'number' ? b.key - a.key : 0));
    this.selection = [];
    this.mutate(() => { for (const e of all) deleteEntity(this.def, e); });
    this.renderSide();
  }

  /** Selects every object of the same kind (e.g. all trees of one sort). */
  private selectSameKind(kind: string) {
    this.selection = entities(this.st.data, this.def).filter((e) => e.type === 'object' && (this.def.paint[e.key as number] as { kind: string }).kind === kind);
    this.renderProps(); this.view.redraw();
  }

  isDirty() { return this.dirty; }

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
      if (n) c.getContext('2d')!.drawImage(generateCharacterSheet({ appearance: n.appearance, outfit: n.outfit, weapon: null, sheet: `npc/${npcId}` }), 0, 0, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
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
    for (const s of this.selection) { const [x, y, w, hh] = this.hitBox(s); c.strokeStyle = '#ffd34d'; c.lineWidth = 3 * lw; c.strokeRect(x, y, w, hh); c.strokeStyle = '#ffd34d88'; c.strokeRect(s.x * T, s.y * T, s.w * T, s.h * T); }
    const rs = this.sel && RESIZABLE.has(this.sel.type) ? this.sel : null;
    if (rs) { const hs = 10 / v.zoom; c.fillStyle = '#ffd34d'; c.fillRect((rs.x + rs.w) * T - hs / 2, (rs.y + rs.h) * T - hs / 2, hs, hs); }
    if (this.box) {
      const bx = Math.min(this.box.x0, this.box.x1), by = Math.min(this.box.y0, this.box.y1);
      c.fillStyle = '#7fd6ff22'; c.fillRect(bx, by, Math.abs(this.box.x1 - this.box.x0), Math.abs(this.box.y1 - this.box.y0));
      c.strokeStyle = '#7fd6ff'; c.lineWidth = lw; c.setLineDash([5 * lw, 3 * lw]); c.strokeRect(bx, by, Math.abs(this.box.x1 - this.box.x0), Math.abs(this.box.y1 - this.box.y0)); c.setLineDash([]);
    }
    if (this.pathPts?.length) {
      const pts = [...this.pathPts, ...(this.hover ? [this.hover] : [])];
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#ffd34d55'; c.lineWidth = this.pathWidth * T;
      c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo((px + 0.5) * T, (py + 0.5) * T) : c.moveTo((px + 0.5) * T, (py + 0.5) * T))); c.stroke();
      c.strokeStyle = '#ffd34d'; c.lineWidth = 2 * lw; c.stroke();
      c.fillStyle = '#ffd34d'; for (const [px, py] of this.pathPts) { c.beginPath(); c.arc((px + 0.5) * T, (py + 0.5) * T, 5 * lw, 0, 7); c.fill(); }
      c.restore();
    }
    if (this.area) {
      const a = this.area, x0 = Math.min(a.x0, a.x1), y0 = Math.min(a.y0, a.y1), w = (Math.abs(a.x1 - a.x0) + 1) * T, hh = (Math.abs(a.y1 - a.y0) + 1) * T;
      c.strokeStyle = '#ffd34d'; c.fillStyle = '#ffd34d33'; c.lineWidth = 2 * lw;
      c.beginPath();
      if (this.pick.shape === 'ellipse') c.ellipse(x0 * T + w / 2, y0 * T + hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2); else c.rect(x0 * T, y0 * T, w, hh);
      c.fill(); c.stroke();
    }
    if (this.hover && this.tool !== 'select' && this.tool !== 'path' && !this.area) {
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
        // Resize handle of a single selected building, portal, zone or scenery piece.
        const rs = this.sel && RESIZABLE.has(this.sel.type) ? this.sel : null;
        if (rs && Math.abs(wx - (rs.x + rs.w) * T) < 10 / this.view.zoom && Math.abs(wy - (rs.y + rs.h) * T) < 10 / this.view.zoom) {
          this.resizing = { e: rs, before: this.snapshot(), moved: false };
          return;
        }
        const hit = list.find((en) => { const [bx, by, bw, bh] = this.hitBox(en); return wx >= bx && wy >= by && wx < bx + bw && wy < by + bh && (this.show.zones || (en.type !== 'mobs' && en.type !== 'area')); }) ?? null;
        if (!hit) {
          // Empty spot: drag a box to select everything inside it (Shift adds to the selection).
          this.box = { x0: wx, y0: wy, x1: wx, y1: wy, add: e.shiftKey };
          if (!e.shiftKey) this.selection = [];
        } else if (e.shiftKey) {
          this.selection = this.isSelected(hit) ? this.selection.filter((s) => !(s.type === hit.type && s.key === hit.key)) : [...this.selection, hit];
        } else {
          if (!this.isSelected(hit)) this.selection = [hit];
          this.drag = {
            fx, fy, quarter: this.selection.length === 1 && hit.type === 'scenery', moved: false, before: this.snapshot(),
            origins: this.selection.map((s) => { const d = entityData(this.def, s) as { x: number; y: number }; return { e: s, x: d.x, y: d.y }; }),
          };
        }
        this.renderProps(); this.view.redraw();
      } else if (this.tool === 'path') {
        const last = this.pathPts?.[this.pathPts.length - 1];
        if (!last || last[0] !== x || last[1] !== y) (this.pathPts ??= []).push([x, y]);
        this.view.redraw();
      } else if (this.tool === 'object') {
        this.mutate(() => this.def.paint.push({ op: 'object', kind: this.pick.object, x, y }));
        const art = this.st.data.objectKinds.get(this.pick.object)?.art;
        if (art) void loadArt([art]).then(() => { this.sprites.delete(`o:${this.pick.object}`); this.view.redraw(); });
      } else if (this.tool === 'building') {
        const style = this.pick.building, big = style === 'aurelion_palace' ? [36, 12] : style === 'aurelion_cathedral' ? [13, 10] : style.startsWith('aurelion_stall') ? [4, 3] : [8, 5];
        this.mutate(() => this.def.paint.push({ op: 'building', style, x, y, w: big[0], h: big[1], door: Math.floor(big[0] / 2) }));
      } else {
        if (this.pick.shape === 'rect' || this.pick.shape === 'ellipse') this.area = { x0: x, y0: y, x1: x, y1: y, before: this.snapshot() };
        else { this.painting = this.snapshot(); this.paintAt(x, y); }
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.cm) return;
      const [fx, fy] = cell(e), x = Math.floor(fx), y = Math.floor(fy);
      this.hover = [x, y];
      if (this.drag && !this.view.isPanning) {
        const snap = this.drag.quarter ? (v: number) => Math.round(v * 4) / 4 : Math.round;
        const dx = snap(fx - this.drag.fx), dy = snap(fy - this.drag.fy);
        for (const o of this.drag.origins) {
          const d = entityData(this.def, o.e) as { x: number; y: number };
          if (d.x !== o.x + dx || d.y !== o.y + dy) { moveEntity(this.def, o.e, o.x + dx, o.y + dy); this.drag.moved = true; }
        }
        if (this.drag.moved) this.reselect();
      } else if (this.resizing) {
        const r = this.resizing, d = (r.e.type === 'mobs' || r.e.type === 'area' ? entityData(this.def, r.e) : entityData(this.def, r.e)) as { x: number; y: number; w: number; h: number; door?: number };
        const snap = r.e.type === 'scenery' ? (v: number) => Math.max(0.5, Math.round(v * 4) / 4) : (v: number) => Math.max(1, Math.round(v));
        const nw = snap(fx - d.x), nh = snap(fy - d.y);
        if (nw !== d.w || nh !== d.h) {
          d.w = nw; d.h = nh;
          if (r.e.type === 'building' && d.door != null) d.door = Math.min(d.door, nw - 1);
          r.moved = true; this.sprites.clear(); this.reselect();
        }
      } else if (this.box) {
        const [wx, wy] = this.view.toWorld(e.offsetX, e.offsetY);
        this.box.x1 = wx; this.box.y1 = wy;
      } else if (this.area) { this.area.x1 = x; this.area.y1 = y; }
      else if (this.painting) this.paintAt(x, y);
      this.view.redraw();
    });
    cv.addEventListener('pointerup', () => {
      if (this.drag?.moved) { this.pushUndo(this.drag.before); void this.recompile(); this.renderProps(); }
      this.drag = null;
      if (this.resizing?.moved) { this.pushUndo(this.resizing.before); void this.recompile(); this.renderProps(); }
      this.resizing = null;
      if (this.box) {
        const b = this.box, x0 = Math.min(b.x0, b.x1) / T, y0 = Math.min(b.y0, b.y1) / T, x1 = Math.max(b.x0, b.x1) / T, y1 = Math.max(b.y0, b.y1) / T;
        this.box = null;
        if (x1 - x0 > 0.2 || y1 - y0 > 0.2) {
          // Small things are picked when the box touches them; zones and areas only when wholly inside.
          const inside = entities(this.st.data, this.def).filter((en) => (en.type === 'mobs' || en.type === 'area')
            ? this.show.zones && en.x >= x0 && en.y >= y0 && en.x + en.w <= x1 && en.y + en.h <= y1
            : en.x < x1 && en.x + en.w > x0 && en.y < y1 && en.y + en.h > y0);
          this.selection = [...(b.add ? this.selection : []), ...inside.filter((en) => !b.add || !this.isSelected(en))];
        }
        this.renderProps(); this.view.redraw();
      }
      if (this.painting) { this.pushUndo(this.painting); this.painting = null; void this.recompile(); }
      if (this.area) {
        const a = this.area, layer = this.tool as 'ground' | 'wall' | 'deco';
        const tile = this.pick[layer] === '(ลบ)' ? null : this.pick[layer];
        const x0 = Math.min(a.x0, a.x1), x1 = Math.max(a.x0, a.x1), y0 = Math.min(a.y0, a.y1), y1 = Math.max(a.y0, a.y1);
        const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
          if (this.pick.shape === 'rect' || ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) paintCell(this.def, layer, x, y, tile);
        this.area = null;
        this.pushUndo(a.before); this.chunks.clear(); void this.recompile();
      }
    });
    // Double-click ends the road being drawn.
    cv.addEventListener('dblclick', () => { if (this.tool === 'path' && this.pathPts) this.finishPath(); });
    cv.addEventListener('pointerleave', () => { this.hover = null; this.view.redraw(); });
  }

  /** Turns the clicked points into a road (a path op) of the chosen texture and width. */
  private finishPath() {
    const pts = this.pathPts;
    this.pathPts = null;
    if (!pts || pts.length < 2) { this.view.redraw(); return; }
    const tile = this.pick.ground === '(ลบ)' ? this.def.base : this.pick.ground, w = this.pathWidth, o = Math.floor((w - 1) / 2);
    this.mutate(() => this.def.paint.push({ op: 'path', tile, width: w, points: pts.map(([x, y]) => [x - o, y - o] as [number, number]) }), true);
  }

  /** Every ground texture of every tileset as swatches; picking one sets the ground / road texture. */
  private texturePalette(): HTMLElement {
    const d = this.st.data;
    const sets = [...d.tilesets.keys()];
    const ground = [...d.tiles.values()].filter((t) => t.layer === 'ground').map((t) => t.id);
    const grid = h('div', { class: 'st-swatches' });
    const value = (base: string, ts: string) => (ts === this.def.tileset ? base : `${base}@${ts}`);
    const plSets = PL_LIB.tiles;
    const shown = this.paletteSet === 'pl:*' ? plSets.map((t) => `pl:${t.slug}`) : this.paletteSet ? [this.paletteSet] : [this.def.tileset, ...sets.filter((t) => t !== this.def.tileset)];
    const filter = h('select', { onchange: (e: Event) => { this.paletteSet = (e.target as HTMLSelectElement).value; this.renderSide(); } },
      h('option', { value: '' }, `ทุกชุดของเกม (${sets.length} × ${ground.length} = ${sets.length * ground.length} แบบ)`),
      ...sets.map((t) => h('option', { value: t, selected: t === this.paletteSet }, t === this.def.tileset ? `${t} (ชุดของแมพนี้)` : t)),
      h('option', { value: 'pl:*', selected: this.paletteSet === 'pl:*' }, `PixelLab ทั้งหมด (${plSets.length} ชุด, ${plSets.reduce((a, t) => a + t.count, 0)} แบบ)`),
      ...plSets.map((t) => h('option', { value: `pl:${t.slug}`, selected: this.paletteSet === `pl:${t.slug}` }, `PixelLab · ${t.name.slice(0, 48)}`)));
    const reset = h('button', { class: `st-swatch reset${this.pick.ground === '(ลบ)' ? ' on' : ''}`, title: 'คืนเป็นพื้นฐานของแมพ (ลบที่ทาไว้)', onclick: () => { this.pick.ground = '(ลบ)'; this.renderSide(); } }, '↺');
    grid.appendChild(reset);
    const draw: (() => void)[] = [];
    for (const ts of shown.filter((t) => t.startsWith('pl:'))) {
      const set = plSets.find((t) => `pl:${t.slug}` === ts);
      if (!set) continue;
      grid.appendChild(h('div', { class: 'st-swatch-h', title: set.name }, `PixelLab · ${set.name.slice(0, 40)} (เดินได้แบบ ${set.base})`));
      for (let n = 0; n < set.count; n++) {
        const id = `${set.base}@${ts}:${n}`;
        const cv = h('canvas', { width: 32, height: 32 }) as HTMLCanvasElement;
        draw.push(() => { const strip = extraSprite(set.art); if (strip) cv.getContext('2d')!.drawImage(strip, n * 32, 0, 32, 32, 0, 0, 32, 32); });
        grid.appendChild(h('button', { class: `st-swatch${this.pick.ground === id ? ' on' : ''}`, title: `${set.name} #${n + 1}`, dataset: { tex: id }, onclick: () => { this.pick.ground = id; this.renderSide(); } }, cv));
      }
    }
    for (const ts of shown.filter((t) => !t.startsWith('pl:'))) {
      grid.appendChild(h('div', { class: 'st-swatch-h' }, ts));
      for (const base of ground) {
        const id = value(base, ts);
        const cv = h('canvas', { width: 32, height: 32 }) as HTMLCanvasElement;
        draw.push(() => {
          const sheet = groundSheet(ts), b = GROUND_ORDER.indexOf(base), c = cv.getContext('2d')!;
          if (sheet && b >= 0) c.drawImage(sheet, 0, b * 256, 64, 64, 0, 0, 32, 32);
          else { c.fillStyle = '#444'; c.fillRect(0, 0, 32, 32); }
        });
        grid.appendChild(h('button', { class: `st-swatch${this.pick.ground === id ? ' on' : ''}`, title: `${base} · ${ts}`, dataset: { tex: id }, onclick: () => { this.pick.ground = id; this.renderSide(); } }, cv));
      }
    }
    void loadArt(shown.map((t) => (t.startsWith('pl:') ? `pl/tile/${t.slice(3)}` : `tiles/${t}`))).then(() => draw.forEach((f) => f()));
    return h('div', {}, row('ชุดภาพ', filter), grid);
  }

  private paintAt(x: number, y: number) {
    const layer = this.tool as 'ground' | 'wall' | 'deco';
    const tile = this.pick[layer] === '(ลบ)' ? null : this.pick[layer];
    const b = this.pick.brush, o = Math.floor((b - 1) / 2), round = this.pick.shape === 'round' && b > 2;
    for (let yy = y - o; yy < y - o + b; yy++) for (let xx = x - o; xx < x - o + b; xx++) {
      if (round && ((xx - x + o - (b - 1) / 2) ** 2 + (yy - y + o - (b - 1) / 2) ** 2) > (b / 2) ** 2) continue;
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
    const shapes: Record<string, string> = { square: '■ แปรงสี่เหลี่ยม', round: '● แปรงกลม', rect: '▭ ลากเป็นสี่เหลี่ยม', ellipse: '◯ ลากเป็นวงรี' };
    const brush = h('div', {},
      row('รูปทรง', h('select', { onchange: (e: Event) => { this.pick.shape = (e.target as HTMLSelectElement).value as never; } }, ...Object.entries(shapes).map(([v, l]) => h('option', { value: v, selected: v === this.pick.shape }, l)))),
      row('ขนาดแปรง', sel(['1', '2', '3', '5', '8', '12', '16'], String(this.pick.brush), (v) => { this.pick.brush = +v; })));
    const parts: (Node | null)[] = [helpBar('1) เลือกเครื่องมือด้านบน 2) คลิก/ลากบนแมพ 3) กด "บันทึกแมพ" สีเขียว · เลือกหลายชิ้น: ลากกรอบบนที่ว่าง (หรือ Shift+คลิก) แล้วกด Delete เพื่อลบทีเดียว · ล้อเมาส์ซูม คลิกขวาลากเลื่อนมุมมอง'), h('div', { class: 'st-h' }, 'เครื่องมือ')];
    if (this.tool === 'select') parts.push(h('div', { class: 'st-muted' }, 'คลิกเพื่อเลือก ลากเพื่อย้าย · ลากกรอบบนที่ว่างเพื่อเลือกหลายชิ้น · Shift+คลิกเพิ่ม/เอาออก · Ctrl+A เลือกทั้งหมด · ลูกศรขยับ · Delete ลบ · จุดเหลืองมุมขวาล่าง = ปรับขนาด'));
    if (this.tool === 'object') {
      const list = h('div', { class: 'st-list' });
      const search = h('input', { placeholder: 'ค้นหาวัตถุ… (เช่น tree, house, rock)', value: this.objSearch }) as HTMLInputElement;
      const group = h('select', {}, h('option', { value: 'game' }, 'วัตถุของเกม'), h('option', { value: 'pl' }, 'PixelLab'), h('option', { value: 'all' }, 'ทั้งหมด')) as HTMLSelectElement;
      group.value = this.objGroup;
      const pal = d.tilesets.get(this.def.tileset)!.palette;
      const fill = () => {
        const q = search.value.toLowerCase();
        const kinds = [...d.objectKinds.values()].filter((k) => (this.objGroup === 'all' || (this.objGroup === 'pl') === k.id.startsWith('pl_')) && (!q || k.id.toLowerCase().includes(q)));
        setChildren(list, ...kinds.slice(0, 120).map((k) => h('button', { class: `st-item${k.id === this.pick.object ? ' on' : ''}`, title: k.id, dataset: { kind: k.id }, onclick: () => { this.pick.object = k.id; this.renderSide(); } },
          k.art?.startsWith('pl/') ? h('img', { src: artUrl(k.art), loading: 'lazy' }) : paintObject(k, pal, 1000, this.def.tileset), k.id.replace(/^pl_/, ''))),
          kinds.length > 120 ? h('div', { class: 'st-muted' }, `แสดง 120 จาก ${kinds.length} — พิมพ์ค้นหาเพื่อหาที่เหลือ`) : null);
      };
      search.oninput = () => { this.objSearch = search.value; fill(); };
      group.onchange = () => { this.objGroup = group.value as never; fill(); };
      fill();
      parts.push(h('div', { class: 'st-muted' }, `คลิกบนแมพเพื่อวาง · ตอนนี้: ${this.pick.object}`), row('กลุ่ม', group), search, list);
    }
    if (this.tool === 'building') parts.push(h('div', { class: 'st-muted' }, 'คลิกบนแมพเพื่อวาง (ประตูหันลงล่าง)'), row('แบบ', sel(BUILDING_STYLES, this.pick.building, (v) => { this.pick.building = v; })));
    if (this.tool === 'ground') parts.push(brush, h('div', { class: 'st-muted' }, `ลากเพื่อทาพื้น · ตอนนี้: ${this.pick.ground === '(ลบ)' ? 'คืนพื้นฐาน' : this.pick.ground}`), this.texturePalette());
    if (this.tool === 'path') parts.push(
      h('div', { class: 'st-muted' }, 'คลิกทีละจุดตามแนวทางเดิน · ดับเบิลคลิกหรือ Enter = จบเส้น · Backspace = ลบจุดล่าสุด · Esc = ยกเลิก · ทางเดินตัดผ่านพุ่มไม้/กำแพงในแมพได้'),
      row('ความกว้าง', sel(['1', '2', '3', '4', '5', '6', '8'], String(this.pathWidth), (v) => { this.pathWidth = +v; })),
      h('div', { class: 'st-muted' }, `พื้นของทาง: ${this.pick.ground === '(ลบ)' ? this.def.base : this.pick.ground}`), this.texturePalette());
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
    if (this.selection.length > 1) {
      const counts = new Map<string, number>();
      for (const e of this.selection) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const names: Record<string, string> = { building: 'อาคาร', object: 'วัตถุ', npc: 'NPC', portal: 'ประตูวาร์ป', spawn: 'จุดเกิด', scenery: 'ฉาก', boss: 'บอส', mobs: 'โซนมอนสเตอร์', area: 'พื้นที่' };
      setChildren(this.props,
        h('div', { class: 'st-h' }, `เลือกอยู่ ${this.selection.length} ชิ้น`),
        h('div', { class: 'st-muted' }, 'ลากชิ้นใดก็ได้เพื่อย้ายทั้งหมด · ปุ่มลูกศรขยับทั้งหมด · Delete ลบทั้งหมด · Esc ยกเลิกการเลือก'),
        ...[...counts].map(([t, n]) => h('div', { class: 'st-row' }, `${names[t] ?? t} ×${n}`,
          h('button', { class: 'st-btn', title: 'เหลือเฉพาะชนิดนี้ในที่เลือก', onclick: () => { this.selection = this.selection.filter((e) => e.type === t); this.renderProps(); this.view.redraw(); } }, 'เลือกเฉพาะชนิดนี้'))),
        h('div', { class: 'st-row' },
          h('button', { class: 'st-btn danger', id: 'map-delete-selected', onclick: () => this.deleteSel() }, `🗑 ลบทั้งหมด (${this.selection.length})`),
          h('button', { class: 'st-btn', onclick: () => this.duplicateAll() }, '⧉ ทำสำเนาทั้งหมด')),
        h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: () => { this.selection = []; this.renderProps(); this.view.redraw(); } }, '← ยกเลิกการเลือก')));
      return;
    }
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
      RESIZABLE.has(e.type) ? h('div', { class: 'st-muted' }, 'ปรับขนาด: ลากจุดสีเหลืองมุมขวาล่าง หรือแก้ w / h') : null,
      e.type === 'object' ? h('div', { class: 'st-muted' }, 'ขนาดวัตถุเป็นของทั้งชนิด: ปรับได้ที่แท็บ 🌳 วัตถุ (ความสูงภาพ / พื้นที่)') : null,
      h('div', { class: 'st-row' },
        h('button', { class: 'st-btn', onclick: async () => {
          const t = await editText(`แก้ ${titles[e.type]} (JSON)`, JSON.stringify(rec, null, 2));
          if (t == null) return;
          try { const v = JSON.parse(t); this.mutate(() => { for (const k of Object.keys(rec as object)) delete (rec as Record<string, unknown>)[k]; Object.assign(rec as object, v); this.sprites.clear(); }); } catch (err) { this.st.toast(`JSON ไม่ถูกต้อง: ${(err as Error).message}`); }
        } }, '{ } JSON'),
        h('button', { class: 'st-btn', onclick: () => this.duplicate() }, '⧉ ทำสำเนา'),
        e.type === 'object' ? h('button', { class: 'st-btn', title: 'เลือกวัตถุชนิดนี้ทุกชิ้นบนแมพ (เช่นลบต้นไม้ชนิดนี้ทั้งหมดทีเดียว)', onclick: () => this.selectSameKind((rec as { kind: string }).kind) }, '◎ เลือกชนิดนี้ทั้งแมพ') : null,
        h('button', { class: 'st-btn danger', onclick: () => this.deleteSel() }, '🗑 ลบ')),
      h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: () => { this.sel = null; this.renderProps(); this.view.redraw(); } }, '← ตั้งค่าแมพ')));
  }

  /** Copies everything selected one tile to the right (NPCs and spawn points are skipped: they must stay unique). */
  private duplicateAll() {
    const sel = [...this.selection];
    this.mutate(() => {
      for (const e of sel) {
        const k = e.key as number;
        if (e.type === 'building' || e.type === 'object') { const op = clone(this.def.paint[k]) as { x: number; id?: string }; op.x += 1; delete op.id; this.def.paint.push(op as PaintOp); }
        else if (e.type === 'scenery') { const sc = clone(this.def.scenery![k]); sc.x += 1; this.def.scenery!.push(sc); }
        else if (e.type === 'mobs') { const m = clone(this.def.monsterSpawns[k]); m.area.x += 1; this.def.monsterSpawns.push(m); }
      }
    });
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
