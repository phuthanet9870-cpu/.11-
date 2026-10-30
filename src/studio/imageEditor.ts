// Pixel editor for one art image: pencil, eraser, fill, colour picker and selection; import a
// picture into the whole image or the selection; undo/redo; save to this browser.
import { decodeSprite, isSpritePath, setSpriteOverride } from '../game/art/spriteOverrides';
import { artUrl, setArtOverride } from '../game/art/themeArt';
import { h, setChildren } from '../ui/dom';
import { download, fileToImage, pickFile, type StudioCtx } from './context';
import { deleteImage, saveImage } from './store';
import { View } from './view';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'select' | 'line' | 'rect' | 'ellipse';
export type Shape = 'rect' | 'ellipse' | 'lasso';
/** A selection: its bounding box, its shape and (freehand) the outline points in image pixels. */
interface Sel { x: number; y: number; w: number; h: number; shape?: Shape; pts?: [number, number][] }

/** Outline of a selection shape, shifted by (-ox, -oy). */
export function shapePath(s: Sel, ox = 0, oy = 0): Path2D {
  const p = new Path2D();
  if (s.shape === 'ellipse') p.ellipse(s.x - ox + s.w / 2, s.y - oy + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
  else if (s.shape === 'lasso' && s.pts && s.pts.length > 2) { p.moveTo(s.pts[0][0] - ox, s.pts[0][1] - oy); for (const [x, y] of s.pts.slice(1)) p.lineTo(x - ox, y - oy); p.closePath(); }
  else p.rect(s.x - ox, s.y - oy, s.w, s.h);
  return p;
}

const boundsOf = (pts: [number, number][]) => {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x + 1), h: Math.max(1, Math.max(...ys) - y + 1) };
};

/** Grid of a sheet: props are 128px cells, ground sheets 256px blocks. */
function sheetCell(path: string): { w: number; h: number } | null {
  if (path.startsWith('props/')) return { w: 128, h: 128 };
  if (path.startsWith('tiles/')) return { w: 256, h: 256 };
  return null;
}

export interface ImageEditorOptions {
  /** Starting image when nothing was drawn yet (e.g. the game's own sprite sheet). */
  template?: () => HTMLCanvasElement | Promise<HTMLCanvasElement>;
  /** Frame grid of a sprite sheet. */
  grid?: { w: number; h: number };
  /** Hide the "import into the whole image" size change (sprite sheets keep their layout). */
  fixedSize?: boolean;
}

export class ImageEditor {
  readonly root: HTMLElement;
  private work = document.createElement('canvas');
  private wctx = this.work.getContext('2d', { willReadFrequently: true })!;
  private view: View;
  private tool: Tool = 'pencil';
  private color = '#ffffff';
  private alpha = 255;
  private size = 1;
  private grid = true;
  private sel: Sel | null = null;
  private selShape: Shape = 'rect';
  private shapeFill = false;
  /** Line / rectangle / ellipse being dragged out (drawn on release). */
  private shapeDrag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private undo: ImageData[] = [];
  private redo: ImageData[] = [];
  private drag: { x: number; y: number } | null = null;
  private dirty = false;
  private info = h('span', { class: 'st-muted' });
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private colorIn: HTMLInputElement;

  private cell: { w: number; h: number } | null;
  /** A picture floating above the image (imported, pasted or lifted) until it is placed. */
  private float: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; back?: { x: number; y: number } } | null = null;
  private floatDrag: { mode: 'move' | 'size'; px: number; py: number; x: number; y: number; w: number; h: number } | null = null;
  private clip: HTMLCanvasElement | null = null;
  private floatBar = h('div', { class: 'st-bar', style: 'display:none;background:#2a2140' });

  constructor(private st: StudioCtx, readonly path: string, private onChange: () => void, private opts: ImageEditorOptions = {}) {
    this.cell = opts.grid ?? sheetCell(path);
    const stage = h('div', { class: 'st-stage' });
    this.colorIn = h('input', { type: 'color', value: this.color, oninput: () => { this.color = this.colorIn.value; } }) as HTMLInputElement;
    const tb = (t: Tool, label: string, key: string) => {
      const b = h('button', { class: 'st-btn', title: `${label} (${key})`, onclick: () => this.setTool(t) }, label) as HTMLButtonElement;
      this.toolBtns.set(t, b);
      return b;
    };
    const sizeIn = h('input', { type: 'range', min: 1, max: 16, value: 1, oninput: () => { this.size = +sizeIn.value; } }) as HTMLInputElement;
    const alphaIn = h('input', { type: 'range', min: 0, max: 255, value: 255, title: 'ความทึบ', oninput: () => { this.alpha = +alphaIn.value; } }) as HTMLInputElement;
    this.root = h('div', { class: 'st-main' },
      h('div', { class: 'st-bar' },
        h('b', {}, path), this.info,
        tb('pencil', '✏ ดินสอ', 'B'), tb('eraser', '⌫ ยางลบ', 'E'), tb('fill', '🪣 เทสี', 'F'), tb('picker', '💧 ดูดสี', 'I'), tb('select', '▭ เลือก', 'M'),
        h('select', { title: 'รูปทรงของการเลือก (ใช้กับ คัดลอก/ตัด/ย้าย/ลบ)', onchange: (e: Event) => { this.selShape = (e.target as HTMLSelectElement).value as Shape; this.setTool('select'); } },
          h('option', { value: 'rect' }, '▭ สี่เหลี่ยม'), h('option', { value: 'ellipse' }, '◯ วงรี'), h('option', { value: 'lasso' }, '✎ อิสระ')),
        tb('line', '╱ เส้น', 'L'), tb('rect', '□ กรอบ', 'R'), tb('ellipse', '○ วงรี', 'O'),
        h('label', { class: 'st-muted', title: 'รูปทรงแบบเติมสีเต็ม' }, h('input', { type: 'checkbox', onchange: (e: Event) => { this.shapeFill = (e.target as HTMLInputElement).checked; } }), ' เติมสี'),
        this.colorIn, h('span', { class: 'st-muted' }, 'ทึบ'), alphaIn, h('span', { class: 'st-muted' }, 'ขนาด'), sizeIn,
        h('button', { class: 'st-btn', title: 'Ctrl+Z', onclick: () => this.doUndo() }, '↶'), h('button', { class: 'st-btn', title: 'Ctrl+Y', onclick: () => this.doRedo() }, '↷'),
        h('button', { class: 'st-btn', onclick: () => { this.grid = !this.grid; this.view.redraw(); } }, '# กริด')),
      h('div', { class: 'st-bar' },
        h('button', { class: 'st-btn', title: 'เลือกรูป ตัดเฉพาะส่วนที่ต้องการ แล้วลาก/ย่อขยายก่อนวาง (ถ้าเลือกพื้นที่ไว้ รูปจะพอดีพื้นที่นั้น)', onclick: () => void this.importImage('crop') }, '📥 นำเข้ารูป + ตัด'),
        h('button', { class: 'st-btn', title: 'ใช้รูปที่เลือกแทนภาพนี้ทั้งภาพ', onclick: () => void this.importImage('all') }, '🖼 แทนทั้งภาพ'),
        h('button', { class: 'st-btn', title: 'ยกส่วนที่เลือกขึ้นมาเพื่อย้ายหรือย่อ/ขยาย', onclick: () => this.lift() }, '⤡ ย้าย/ย่อขยายส่วนที่เลือก'),
        h('button', { class: 'st-btn', title: 'Ctrl+C', onclick: () => this.copy(false) }, '⧉ คัดลอก'),
        h('button', { class: 'st-btn', title: 'Ctrl+X', onclick: () => this.copy(true) }, '✂ ตัด'),
        h('button', { class: 'st-btn', title: 'Ctrl+V', onclick: () => this.paste() }, '📋 วาง'),
        h('button', { class: 'st-btn', title: 'Delete', onclick: () => this.clearSel() }, '✕ ลบส่วนที่เลือก'),
        opts.fixedSize ? null : h('button', { class: 'st-btn', onclick: () => this.resizeImage() }, '⤢ ปรับขนาดภาพ'),
        h('button', { class: 'st-btn', onclick: () => this.work.toBlob((b) => b && download(`${path.replace(/\//g, '_')}.png`, b), 'image/png') }, '💾 ดาวน์โหลด PNG'),
        h('span', { class: 'st-spacer' }),
        h('button', { class: 'st-btn danger', onclick: () => this.revert() }, 'คืนภาพเดิม'),
        h('button', { class: 'st-btn primary', id: 'img-save', onclick: () => this.save() }, 'บันทึกภาพ')),
      this.floatBar,
      stage);
    this.view = new View(stage, (v) => this.draw(v), 0.1, 32);
    this.bindPointer();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('paste', this.onPaste);
    this.setTool('pencil');
    void this.load();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.root.isConnected || (e.target as HTMLElement).matches?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (this.float && k === 'enter') { e.preventDefault(); this.commitFloat(); return; }
    if (this.float && k === 'escape') { e.preventDefault(); this.cancelFloat(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'c') { e.preventDefault(); this.copy(false); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'x') { e.preventDefault(); this.copy(true); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'v') { if (this.clip) { e.preventDefault(); this.paste(); } return; }
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); this.doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.doRedo(); }
    else if (k === 'b') this.setTool('pencil'); else if (k === 'e') this.setTool('eraser'); else if (k === 'f') this.setTool('fill');
    else if (k === 'i') this.setTool('picker'); else if (k === 'm') this.setTool('select');
    else if (k === 'l') this.setTool('line'); else if (k === 'r') this.setTool('rect'); else if (k === 'o') this.setTool('ellipse');
    else if (k === 'delete') this.clearSel();
  };

  private setTool(t: Tool) {
    this.tool = t;
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
  }

  private async load() {
    const blob = this.st.layer.images.get(this.path);
    let img: CanvasImageSource & { width: number; height: number } | null = null;
    try {
      if (blob) img = await fileToImage(blob);
      else if (this.opts.template) img = await this.opts.template();
      else img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = artUrl(this.path); });
    } catch { img = null; }
    this.work.width = img?.width ?? 128; this.work.height = img?.height ?? 128;
    this.wctx.clearRect(0, 0, this.work.width, this.work.height);
    if (img) this.wctx.drawImage(img, 0, 0);
    this.onChange();
    this.updateInfo();
    this.view.fit(this.work.width, this.work.height, 8);
  }

  private updateInfo() { this.info.textContent = `${this.work.width}×${this.work.height}${this.dirty ? ' · ยังไม่บันทึก' : ''}${this.st.layer.images.has(this.path) ? ' · แก้แล้ว' : ''}`; }

  private snapshot() {
    this.undo.push(this.wctx.getImageData(0, 0, this.work.width, this.work.height));
    if (this.undo.length > 40) this.undo.shift();
    this.redo = [];
    this.dirty = true;
    this.updateInfo();
  }
  private doUndo() { const s = this.undo.pop(); if (!s) return; this.redo.push(this.wctx.getImageData(0, 0, this.work.width, this.work.height)); this.restore(s); }
  private doRedo() { const s = this.redo.pop(); if (!s) return; this.undo.push(this.wctx.getImageData(0, 0, this.work.width, this.work.height)); this.restore(s); }
  private restore(s: ImageData) {
    if (s.width !== this.work.width || s.height !== this.work.height) { this.work.width = s.width; this.work.height = s.height; }
    this.wctx.putImageData(s, 0, 0);
    this.dirty = true; this.updateInfo(); this.view.redraw();
  }

  private rgba(): [number, number, number, number] {
    const n = parseInt(this.color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, this.alpha];
  }

  private stamp(x: number, y: number, erase: boolean) {
    const s = this.size, x0 = Math.floor(x - (s - 1) / 2), y0 = Math.floor(y - (s - 1) / 2);
    if (erase) this.wctx.clearRect(x0, y0, s, s);
    else {
      const [r, g, b, a] = this.rgba();
      this.wctx.clearRect(x0, y0, s, s);
      this.wctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      this.wctx.fillRect(x0, y0, s, s);
    }
  }

  private line(ax: number, ay: number, bx: number, by: number, erase: boolean) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let i = 0; i <= n; i++) this.stamp(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), erase);
  }

  private fill(x: number, y: number) {
    const W = this.work.width, H = this.work.height;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = this.wctx.getImageData(0, 0, W, H), d = img.data;
    const at = (i: number) => (d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3];
    const target = at((y * W + x) * 4), [r, g, b, a] = this.rgba();
    if (target === ((r << 24) | (g << 16) | (b << 8) | a)) return;
    const stack = [y * W + x];
    const sel = this.sel;
    while (stack.length) {
      const p = stack.pop()!, px = p % W, py = (p - px) / W;
      if (sel && (px < sel.x || py < sel.y || px >= sel.x + sel.w || py >= sel.y + sel.h)) continue;
      const i = p * 4;
      if (at(i) !== target) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      if (px > 0) stack.push(p - 1); if (px < W - 1) stack.push(p + 1); if (py > 0) stack.push(p - W); if (py < H - 1) stack.push(p + W);
    }
    this.wctx.putImageData(img, 0, 0);
  }

  private pick(x: number, y: number) {
    const [r, g, b, a] = this.wctx.getImageData(x, y, 1, 1).data;
    this.color = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    this.colorIn.value = this.color;
    this.alpha = a;
  }

  private bindPointer() {
    const c = this.view.canvas;
    const px = (e: PointerEvent) => { const [x, y] = this.view.toWorld(e.offsetX, e.offsetY); return [Math.floor(x), Math.floor(y)] as const; };
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.view.isPanning) return;
      c.setPointerCapture(e.pointerId);
      if (this.float) {
        const [wx, wy] = this.view.toWorld(e.offsetX, e.offsetY), f = this.float, hs = 12 / this.view.zoom;
        const onHandle = Math.abs(wx - (f.x + f.w)) < hs && Math.abs(wy - (f.y + f.h)) < hs;
        const inside = wx >= f.x && wy >= f.y && wx <= f.x + f.w && wy <= f.y + f.h;
        if (onHandle || inside) { this.floatDrag = { mode: onHandle ? 'size' : 'move', px: wx, py: wy, x: f.x, y: f.y, w: f.w, h: f.h }; return; }
        this.commitFloat(); // a click elsewhere places the picture
        return;
      }
      const [x, y] = px(e);
      if (this.tool === 'picker') { this.pick(x, y); return; }
      if (this.tool === 'select') { this.drag = { x, y }; this.sel = { x, y, w: 1, h: 1, shape: this.selShape, pts: this.selShape === 'lasso' ? [[x, y]] : undefined }; this.view.redraw(); return; }
      if (this.tool === 'line' || this.tool === 'rect' || this.tool === 'ellipse') { this.shapeDrag = { x0: x, y0: y, x1: x, y1: y }; this.drag = { x, y }; return; }
      this.snapshot();
      if (this.tool === 'fill') this.fill(x, y);
      else { this.stamp(x, y, this.tool === 'eraser'); this.drag = { x, y }; }
      this.view.redraw();
    });
    c.addEventListener('pointermove', (e) => {
      if (this.floatDrag && this.float) {
        const [wx, wy] = this.view.toWorld(e.offsetX, e.offsetY), d = this.floatDrag, f = this.float;
        if (d.mode === 'move') { f.x = Math.round(d.x + wx - d.px); f.y = Math.round(d.y + wy - d.py); }
        else {
          // Keeps the proportions unless Shift is held.
          let w = Math.max(1, Math.round(d.w + wx - d.px)), hh = Math.max(1, Math.round(d.h + wy - d.py));
          if (!e.shiftKey) { const k = Math.max(w / d.w, hh / d.h); w = Math.max(1, Math.round(d.w * k)); hh = Math.max(1, Math.round(d.h * k)); }
          f.w = w; f.h = hh;
        }
        this.updateFloatBar();
        this.view.redraw();
        return;
      }
      if (!this.drag || this.view.isPanning) return;
      const [x, y] = px(e);
      if (this.tool === 'select' && this.sel?.shape === 'lasso') {
        const pts = this.sel.pts!;
        const [lx, ly] = pts[pts.length - 1];
        if (lx !== x || ly !== y) pts.push([x, y]);
        Object.assign(this.sel, boundsOf(pts));
      } else if (this.tool === 'select') {
        const a = this.drag;
        this.sel = { x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.abs(x - a.x) + 1, h: Math.abs(y - a.y) + 1, shape: this.selShape };
      } else if (this.shapeDrag) {
        this.shapeDrag.x1 = x; this.shapeDrag.y1 = y;
        if (e.shiftKey && this.tool !== 'line') { const d = Math.max(Math.abs(x - this.shapeDrag.x0), Math.abs(y - this.shapeDrag.y0)); this.shapeDrag.x1 = this.shapeDrag.x0 + Math.sign(x - this.shapeDrag.x0 || 1) * d; this.shapeDrag.y1 = this.shapeDrag.y0 + Math.sign(y - this.shapeDrag.y0 || 1) * d; }
      } else { this.line(this.drag.x, this.drag.y, x, y, this.tool === 'eraser'); this.drag = { x, y }; }
      this.view.redraw();
    });
    c.addEventListener('pointerup', () => {
      this.floatDrag = null;
      if (this.shapeDrag) { this.snapshot(); this.drawShape(this.wctx, this.shapeDrag); this.shapeDrag = null; this.view.redraw(); }
      // A click (no drag) with the selection tool on a sheet selects the whole cell.
      const cell = this.cell;
      if (this.tool === 'select' && this.sel && this.sel.w === 1 && this.sel.h === 1 && cell) {
        this.sel = { x: Math.floor(this.sel.x / cell.w) * cell.w, y: Math.floor(this.sel.y / cell.h) * cell.h, w: cell.w, h: cell.h, shape: 'rect' };
        this.view.redraw();
      }
      this.drag = null;
    });
  }

  /** Draws the line / rectangle / ellipse tool's shape. */
  private drawShape(ctx: CanvasRenderingContext2D, d: { x0: number; y0: number; x1: number; y1: number }) {
    const [r, g, b, a] = this.rgba();
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    ctx.lineWidth = this.size;
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0) + 1, hh = Math.abs(d.y1 - d.y0) + 1;
    if (this.tool === 'line') { this.line(d.x0, d.y0, d.x1, d.y1, false); ctx.restore(); return; }
    const p = new Path2D();
    if (this.tool === 'rect') p.rect(x + this.size / 2, y + this.size / 2, w - this.size, hh - this.size);
    else p.ellipse(x + w / 2, y + hh / 2, Math.max(0.5, w / 2 - this.size / 2), Math.max(0.5, hh / 2 - this.size / 2), 0, 0, Math.PI * 2);
    if (this.shapeFill) ctx.fill(p); else ctx.stroke(p);
    ctx.restore();
  }

  /** The image being edited (live, for previews). */
  get canvas() { return this.work; }
  isDirty() { return this.dirty; }

  private draw(v: View) {
    const c = v.ctx, W = this.work.width, H = this.work.height, z = v.zoom;
    const ck = 8;
    for (let y = 0; y < H; y += ck) for (let x = 0; x < W; x += ck) { c.fillStyle = ((x + y) / ck) % 2 ? '#2a2433' : '#1f1a27'; c.fillRect(x, y, Math.min(ck, W - x), Math.min(ck, H - y)); }
    c.imageSmoothingEnabled = false;
    c.drawImage(this.work, 0, 0);
    c.lineWidth = 1 / z;
    if (this.grid) {
      const cell = this.cell;
      if (cell) { c.strokeStyle = '#ffd98a88'; for (let x = 0; x <= W; x += cell.w) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y <= H; y += cell.h) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } }
      if (z >= 8) { c.strokeStyle = '#ffffff18'; for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } }
    }
    c.strokeStyle = '#6a5a8a'; c.strokeRect(0, 0, W, H);
    if (this.sel) { c.strokeStyle = '#7fd6ff'; c.lineWidth = 2 / z; c.setLineDash([4 / z, 3 / z]); c.stroke(shapePath(this.sel)); c.setLineDash([]); }
    if (this.shapeDrag) {
      const d = this.shapeDrag;
      if (this.tool === 'line') { c.strokeStyle = this.color; c.lineWidth = this.size; c.beginPath(); c.moveTo(d.x0 + 0.5, d.y0 + 0.5); c.lineTo(d.x1 + 0.5, d.y1 + 0.5); c.stroke(); }
      else this.drawShape(c, d);
    }
    if (this.float) {
      const f = this.float, hs = 10 / z;
      c.imageSmoothingEnabled = !this.pixelScale();
      c.drawImage(f.img, f.x, f.y, f.w, f.h);
      c.strokeStyle = '#ffd34d'; c.lineWidth = 2 / z; c.setLineDash([6 / z, 4 / z]); c.strokeRect(f.x, f.y, f.w, f.h); c.setLineDash([]);
      c.fillStyle = '#ffd34d'; c.fillRect(f.x + f.w - hs / 2, f.y + f.h - hs / 2, hs, hs);
    }
  }

  /** Whole-number enlargement keeps hard pixel edges; other sizes are smoothed. */
  private pixelScale() {
    const f = this.float;
    if (!f) return true;
    const kx = f.w / f.img.width, ky = f.h / f.img.height;
    return kx >= 1 && ky >= 1 && Number.isInteger(kx) && Number.isInteger(ky);
  }

  // ---------------------------------------------------------------- floating picture
  private startFloat(img: HTMLCanvasElement, back?: { x: number; y: number }) {
    if (this.float) this.commitFloat();
    const s = this.sel;
    let x: number, y: number, w = img.width, hh = img.height;
    if (back) { x = back.x; y = back.y; }
    else if (s) {
      // Fits the selection: ground blocks edge to edge, everything else whole and standing on the bottom.
      if (this.path.startsWith('tiles/')) { w = s.w; hh = s.h; x = s.x; y = s.y; }
      else { const k = Math.min(s.w / img.width, s.h / img.height); w = Math.max(1, Math.round(img.width * k)); hh = Math.max(1, Math.round(img.height * k)); x = s.x + Math.round((s.w - w) / 2); y = s.y + s.h - hh; }
    } else {
      const k = Math.min(1, this.work.width / img.width, this.work.height / img.height);
      w = Math.max(1, Math.round(img.width * k)); hh = Math.max(1, Math.round(img.height * k));
      x = Math.round((this.work.width - w) / 2); y = Math.round((this.work.height - hh) / 2);
    }
    this.float = { img, x, y, w, h: hh, back };
    this.setTool('select');
    this.updateFloatBar();
    this.view.redraw();
  }

  private updateFloatBar() {
    const f = this.float;
    this.floatBar.style.display = f ? '' : 'none';
    if (!f) return;
    const num = (v: number, set: (n: number) => void) => h('input', { type: 'number', min: 1, value: v, onchange: (e: Event) => { set(Math.max(1, +(e.target as HTMLInputElement).value)); this.view.redraw(); } });
    setChildren(this.floatBar,
      h('b', {}, '🖼 รูปที่ลอยอยู่'), h('span', { class: 'st-muted' }, 'ลากเพื่อย้าย · ลากจุดเหลืองมุมขวาล่างเพื่อย่อ/ขยาย (Shift = ไม่ล็อกสัดส่วน)'),
      'กว้าง', num(f.w, (n) => { f.w = n; }), 'สูง', num(f.h, (n) => { f.h = n; }),
      h('button', { class: 'st-btn', onclick: () => { f.w = f.img.width; f.h = f.img.height; this.updateFloatBar(); this.view.redraw(); } }, '1:1'),
      h('button', { class: 'st-btn', onclick: () => { const c = document.createElement('canvas'); c.width = f.img.width; c.height = f.img.height; const x = c.getContext('2d')!; x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(f.img, 0, 0); f.img = c; this.view.redraw(); } }, '↔ พลิก'),
      h('span', { class: 'st-spacer' }),
      h('button', { class: 'st-btn', onclick: () => this.cancelFloat() }, '✕ ยกเลิก (Esc)'),
      h('button', { class: 'st-btn primary', id: 'img-place', onclick: () => this.commitFloat() }, '✔ วางลงภาพ (Enter)'));
  }

  private commitFloat() {
    const f = this.float;
    if (!f) return;
    this.snapshot();
    this.wctx.imageSmoothingEnabled = !this.pixelScale();
    this.wctx.imageSmoothingQuality = 'high';
    this.wctx.drawImage(f.img, f.x, f.y, f.w, f.h);
    this.wctx.imageSmoothingEnabled = false;
    this.float = null;
    this.updateFloatBar();
    this.view.redraw();
  }

  private cancelFloat() {
    const f = this.float;
    if (!f) return;
    this.float = null;
    // A lifted piece goes back where it was.
    if (f.back) this.wctx.drawImage(f.img, f.back.x, f.back.y);
    this.updateFloatBar();
    this.view.redraw();
  }

  private selCanvas(): HTMLCanvasElement | null {
    const s = this.sel;
    if (!s) { this.st.toast('เลือกพื้นที่ก่อน (เครื่องมือ ▭ เลือก)'); return null; }
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.work, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    if (s.shape && s.shape !== 'rect') { ctx.globalCompositeOperation = 'destination-in'; ctx.fill(shapePath(s, s.x, s.y)); }
    return c;
  }

  private copy(cut: boolean) {
    const c = this.selCanvas();
    if (!c) return;
    this.clip = c;
    if (cut) this.clearSel();
    this.st.toast(cut ? 'ตัดแล้ว — กด Ctrl+V เพื่อวาง' : 'คัดลอกแล้ว — กด Ctrl+V เพื่อวาง');
  }

  private paste() {
    if (!this.clip) { this.st.toast('ยังไม่มีอะไรให้วาง (คัดลอกหรือตัดก่อน หรือนำเข้ารูป)'); return; }
    const c = document.createElement('canvas');
    c.width = this.clip.width; c.height = this.clip.height;
    c.getContext('2d')!.drawImage(this.clip, 0, 0);
    this.startFloat(c);
  }

  private lift() {
    const c = this.selCanvas();
    if (!c) return;
    const s = this.sel!;
    this.snapshot();
    this.clearShape(s);
    this.sel = null;
    this.startFloat(c, { x: s.x, y: s.y });
  }

  private onPaste = async (e: ClipboardEvent) => {
    if (!this.root.isConnected || (e.target as HTMLElement).matches?.('input, textarea')) return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    const img = await fileToImage(file);
    const cut = await cropDialog(img);
    if (cut) this.startFloat(cut);
  };

  private resizeImage() {
    const v = prompt(`ขนาดใหม่ กว้างxสูง (ตอนนี้ ${this.work.width}x${this.work.height})`, `${this.work.width}x${this.work.height}`);
    const [w, hh] = (v ?? '').split(/[x×*, ]+/).map(Number);
    if (!(w > 0 && hh > 0 && w <= 4096 && hh <= 4096)) return;
    const stretch = confirm('ยืด/ย่อรูปเดิมให้พอดีขนาดใหม่?\nตกลง = ยืด/ย่อรูป · ยกเลิก = คงรูปเดิม แล้วเพิ่ม/ตัดพื้นที่ขอบ');
    this.snapshot();
    const old = document.createElement('canvas');
    old.width = this.work.width; old.height = this.work.height;
    old.getContext('2d')!.drawImage(this.work, 0, 0);
    this.work.width = w; this.work.height = hh;
    this.wctx.imageSmoothingEnabled = stretch && !(Number.isInteger(w / old.width) && Number.isInteger(hh / old.height));
    if (stretch) this.wctx.drawImage(old, 0, 0, w, hh); else this.wctx.drawImage(old, 0, 0);
    this.wctx.imageSmoothingEnabled = false;
    this.updateInfo();
    this.view.fit(w, hh, 8);
  }

  private clearSel() {
    if (!this.sel) return;
    this.snapshot();
    this.clearShape(this.sel);
    this.view.redraw();
  }

  /** Clears the pixels inside a selection's shape. */
  private clearShape(s: Sel) {
    this.wctx.save();
    this.wctx.clip(shapePath(s));
    this.wctx.clearRect(s.x, s.y, s.w, s.h);
    this.wctx.restore();
  }

  private async importImage(where: 'all' | 'crop') {
    const f = await pickFile('image/*');
    if (!f) return;
    let img: HTMLImageElement;
    try { img = await fileToImage(f); } catch (e) { this.st.toast((e as Error).message); return; }
    if (where === 'crop') {
      const cut = await cropDialog(img);
      if (cut) this.startFloat(cut);
      return;
    }
    this.snapshot();
    if (where === 'all' && this.opts.fixedSize) {
      // Sprite sheets keep their frame layout: the picture is scaled onto the whole sheet.
      this.wctx.clearRect(0, 0, this.work.width, this.work.height);
      this.wctx.drawImage(img, 0, 0, this.work.width, this.work.height);
    } else if (where === 'all') {
      this.work.width = img.width; this.work.height = img.height;
      this.wctx.drawImage(img, 0, 0);
      this.view.fit(img.width, img.height, 8);
    }
    this.updateInfo();
    this.view.redraw();
  }

  private save() {
    if (this.float) this.commitFloat();
    this.work.toBlob(async (b) => {
      if (!b) return;
      await saveImage(this.path, b);
      this.st.layer.images.set(this.path, b);
      setArtOverride(this.path, URL.createObjectURL(b));
      if (isSpritePath(this.path)) setSpriteOverride(this.path, await decodeSprite(b));
      this.st.artVersion++;
      this.dirty = false; this.updateInfo();
      this.onChange();
      this.st.toast(`บันทึก ${this.path} แล้ว — เกมในเบราว์เซอร์นี้จะใช้ภาพใหม่`);
    }, 'image/png');
  }

  private async revert() {
    if (!confirm(`คืน ${this.path} เป็นภาพเดิมของเกม?`)) return;
    await deleteImage(this.path);
    this.st.layer.images.delete(this.path);
    setArtOverride(this.path, null);
    if (isSpritePath(this.path)) setSpriteOverride(this.path, null);
    this.st.artVersion++;
    this.undo = []; this.redo = []; this.dirty = false;
    await this.load();
    this.onChange();
  }

  destroy() { window.removeEventListener('keydown', this.onKey); window.removeEventListener('paste', this.onPaste); this.view.destroy(); }
}

/** Creates a new blank image in this browser (custom/<name>). */
export async function newCustomImage(st: StudioCtx, name: string, w: number, hgt: number): Promise<string> {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  const path = `custom/${name}`;
  await saveImage(path, blob);
  st.layer.images.set(path, blob);
  setArtOverride(path, URL.createObjectURL(blob));
  return path;
}

/** Shows a picture and lets the user drag a rectangle around the part to keep. Resolves with
 * that part (or the whole picture), or null when cancelled. */
export function cropDialog(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const maxW = Math.min(window.innerWidth * 0.8, 1000), maxH = window.innerHeight * 0.62;
    const k = Math.min(1, maxW / img.width, maxH / img.height) * (img.width < 200 && img.height < 200 ? 3 : 1);
    const cv = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k), style: 'cursor:crosshair;max-width:100%;image-rendering:pixelated;background:repeating-conic-gradient(#2a2433 0 25%,#1f1a27 0 50%) 0 0/16px 16px' }) as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    let r: Sel = { x: 0, y: 0, w: img.width, h: img.height, shape: 'rect' };
    let shape: Shape = 'rect';
    let start: [number, number] | null = null;
    const info = h('span', { class: 'st-muted' });
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = k < 1;
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      // Darken everything outside the chosen shape.
      ctx.save(); ctx.scale(k, k);
      const outside = new Path2D(); outside.rect(0, 0, img.width, img.height); outside.addPath(shapePath(r));
      ctx.fillStyle = '#0009'; ctx.fill(outside, 'evenodd');
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2 / k; ctx.setLineDash([6 / k, 4 / k]); ctx.stroke(shapePath(r)); ctx.setLineDash([]);
      ctx.restore();
      info.textContent = `ส่วนที่ตัด ${r.w}×${r.h} px จากรูป ${img.width}×${img.height}`;
    };
    const at = (e: PointerEvent): [number, number] => { const b = cv.getBoundingClientRect(); return [Math.max(0, Math.min(img.width, Math.round((e.clientX - b.left) / b.width * img.width))), Math.max(0, Math.min(img.height, Math.round((e.clientY - b.top) / b.height * img.height)))]; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); start = at(e); const p0 = start; if (shape === 'lasso') r = { x: p0[0], y: p0[1], w: 1, h: 1, shape, pts: [p0] }; });
    cv.addEventListener('pointermove', (e) => {
      if (!start) return;
      const [x, y] = at(e);
      if (shape === 'lasso') { r.pts!.push([x, y]); Object.assign(r, boundsOf(r.pts!)); }
      else r = { x: Math.min(x, start[0]), y: Math.min(y, start[1]), w: Math.max(1, Math.abs(x - start[0])), h: Math.max(1, Math.abs(y - start[1])), shape };
      draw();
    });
    cv.addEventListener('pointerup', () => { start = null; });
    const done = (whole: boolean | null) => {
      m.remove();
      if (whole === null) { resolve(null); return; }
      const c = document.createElement('canvas');
      const rr: Sel = whole ? { x: 0, y: 0, w: img.width, h: img.height } : r;
      c.width = rr.w; c.height = rr.h;
      const cx = c.getContext('2d')!;
      cx.drawImage(img, rr.x, rr.y, rr.w, rr.h, 0, 0, rr.w, rr.h);
      // Ellipse and freehand cuts keep only what is inside the shape.
      if (!whole && rr.shape && rr.shape !== 'rect') { cx.globalCompositeOperation = 'destination-in'; cx.fill(shapePath(rr, rr.x, rr.y)); }
      resolve(c);
    };
    const m = h('div', { class: 'st-modal' }, h('div', {},
      h('div', { class: 'st-h' }, '✂ ตัดเฉพาะส่วนที่ต้องการ'),
      h('div', { class: 'st-muted' }, 'เลือกรูปทรง แล้วลากรอบส่วนของรูปที่จะใช้ (แบบอิสระ: ลากวาดเส้นรอบ) กด "ตัดและนำไปวาง" — จากนั้นลาก ย่อ/ขยาย บนภาพได้ก่อนกดวาง'),
      h('div', { class: 'st-row' }, 'รูปทรง', ...([['rect', '▭ สี่เหลี่ยม'], ['ellipse', '◯ วงรี'], ['lasso', '✎ อิสระ']] as [Shape, string][]).map(([v, l]) => {
        const b = h('button', { class: `st-btn${v === 'rect' ? ' on' : ''}`, dataset: { shape: v }, onclick: () => { shape = v; r = { ...r, shape: v, pts: v === 'lasso' ? r.pts : undefined }; if (v === 'lasso' && !r.pts) r.shape = 'rect'; b.parentElement!.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); } }, l);
        return b;
      })),
      h('div', { style: 'overflow:auto;text-align:center' }, cv), info,
      h('div', { class: 'st-row' },
        h('button', { class: 'st-btn primary', id: 'crop-ok', onclick: () => done(false) }, '✂ ตัดและนำไปวาง'),
        h('button', { class: 'st-btn', onclick: () => done(true) }, 'ใช้ทั้งรูป'),
        h('button', { class: 'st-btn', onclick: () => done(null) }, 'ยกเลิก'))));
    document.body.appendChild(m);
    draw();
  });
}
