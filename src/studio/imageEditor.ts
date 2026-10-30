// Pixel editor for one art image: pencil, eraser, fill, colour picker and selection; import a
// picture into the whole image or the selection; undo/redo; save to this browser.
import { artUrl, setArtOverride } from '../game/art/themeArt';
import { h } from '../ui/dom';
import { download, fileToImage, pickFile, type StudioCtx } from './context';
import { deleteImage, saveImage } from './store';
import { View } from './view';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'select';
interface Sel { x: number; y: number; w: number; h: number }

/** Grid of a sheet: props are 128px cells, ground sheets 256px blocks. */
function sheetCell(path: string): number | null {
  if (path.startsWith('props/')) return 128;
  if (path.startsWith('tiles/')) return 256;
  return null;
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
  private undo: ImageData[] = [];
  private redo: ImageData[] = [];
  private drag: { x: number; y: number } | null = null;
  private dirty = false;
  private info = h('span', { class: 'st-muted' });
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private colorIn: HTMLInputElement;

  constructor(private st: StudioCtx, readonly path: string, private onChange: () => void) {
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
        this.colorIn, h('span', { class: 'st-muted' }, 'ทึบ'), alphaIn, h('span', { class: 'st-muted' }, 'ขนาด'), sizeIn,
        h('button', { class: 'st-btn', title: 'Ctrl+Z', onclick: () => this.doUndo() }, '↶'), h('button', { class: 'st-btn', title: 'Ctrl+Y', onclick: () => this.doRedo() }, '↷'),
        h('button', { class: 'st-btn', onclick: () => { this.grid = !this.grid; this.view.redraw(); } }, '# กริด')),
      h('div', { class: 'st-bar' },
        h('button', { class: 'st-btn', onclick: () => this.importImage('all') }, '📥 นำเข้ารูป (ทั้งภาพ)'),
        h('button', { class: 'st-btn', onclick: () => this.importImage('sel') }, '📥 นำเข้ารูปลงส่วนที่เลือก'),
        h('button', { class: 'st-btn', onclick: () => this.clearSel() }, '✕ ลบส่วนที่เลือก'),
        h('button', { class: 'st-btn', onclick: () => this.work.toBlob((b) => b && download(`${path.replace(/\//g, '_')}.png`, b), 'image/png') }, '💾 ดาวน์โหลด PNG'),
        h('span', { class: 'st-spacer' }),
        h('button', { class: 'st-btn danger', onclick: () => this.revert() }, 'คืนภาพเดิม'),
        h('button', { class: 'st-btn primary', id: 'img-save', onclick: () => this.save() }, 'บันทึกภาพ')),
      stage);
    this.view = new View(stage, (v) => this.draw(v), 0.1, 32);
    this.bindPointer();
    window.addEventListener('keydown', this.onKey);
    this.setTool('pencil');
    void this.load();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.root.isConnected || (e.target as HTMLElement).matches?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); this.doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.doRedo(); }
    else if (k === 'b') this.setTool('pencil'); else if (k === 'e') this.setTool('eraser'); else if (k === 'f') this.setTool('fill');
    else if (k === 'i') this.setTool('picker'); else if (k === 'm') this.setTool('select');
    else if (k === 'delete') this.clearSel();
  };

  private setTool(t: Tool) {
    this.tool = t;
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
  }

  private async load() {
    const blob = this.st.layer.images.get(this.path);
    let img: HTMLImageElement | null = null;
    try { img = blob ? await fileToImage(blob) : await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = artUrl(this.path); }); } catch { img = null; }
    this.work.width = img?.width ?? 128; this.work.height = img?.height ?? 128;
    if (img) this.wctx.drawImage(img, 0, 0);
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
      const [x, y] = px(e);
      if (this.tool === 'picker') { this.pick(x, y); return; }
      if (this.tool === 'select') { this.drag = { x, y }; this.sel = { x, y, w: 1, h: 1 }; this.view.redraw(); return; }
      this.snapshot();
      if (this.tool === 'fill') this.fill(x, y);
      else { this.stamp(x, y, this.tool === 'eraser'); this.drag = { x, y }; }
      this.view.redraw();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag || this.view.isPanning) return;
      const [x, y] = px(e);
      if (this.tool === 'select') {
        const a = this.drag;
        this.sel = { x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.abs(x - a.x) + 1, h: Math.abs(y - a.y) + 1 };
      } else { this.line(this.drag.x, this.drag.y, x, y, this.tool === 'eraser'); this.drag = { x, y }; }
      this.view.redraw();
    });
    c.addEventListener('pointerup', () => {
      // A click (no drag) with the selection tool on a sheet selects the whole cell.
      const cell = sheetCell(this.path);
      if (this.tool === 'select' && this.sel && this.sel.w === 1 && this.sel.h === 1 && cell) {
        this.sel = { x: Math.floor(this.sel.x / cell) * cell, y: Math.floor(this.sel.y / cell) * cell, w: cell, h: cell };
        this.view.redraw();
      }
      this.drag = null;
    });
  }

  private draw(v: View) {
    const c = v.ctx, W = this.work.width, H = this.work.height, z = v.zoom;
    const ck = 8;
    for (let y = 0; y < H; y += ck) for (let x = 0; x < W; x += ck) { c.fillStyle = ((x + y) / ck) % 2 ? '#2a2433' : '#1f1a27'; c.fillRect(x, y, Math.min(ck, W - x), Math.min(ck, H - y)); }
    c.imageSmoothingEnabled = false;
    c.drawImage(this.work, 0, 0);
    c.lineWidth = 1 / z;
    if (this.grid) {
      const cell = sheetCell(this.path);
      if (cell) { c.strokeStyle = '#ffd98a88'; for (let x = 0; x <= W; x += cell) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y <= H; y += cell) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } }
      if (z >= 8) { c.strokeStyle = '#ffffff18'; for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } }
    }
    c.strokeStyle = '#6a5a8a'; c.strokeRect(0, 0, W, H);
    if (this.sel) { c.strokeStyle = '#7fd6ff'; c.lineWidth = 2 / z; c.setLineDash([4 / z, 3 / z]); c.strokeRect(this.sel.x, this.sel.y, this.sel.w, this.sel.h); c.setLineDash([]); }
  }

  private clearSel() {
    if (!this.sel) return;
    this.snapshot();
    this.wctx.clearRect(this.sel.x, this.sel.y, this.sel.w, this.sel.h);
    this.view.redraw();
  }

  private async importImage(where: 'all' | 'sel') {
    const f = await pickFile('image/*');
    if (!f) return;
    let img: HTMLImageElement;
    try { img = await fileToImage(f); } catch (e) { this.st.toast((e as Error).message); return; }
    if (where === 'sel' && !this.sel) { this.st.toast('เลือกพื้นที่ก่อน (เครื่องมือ ▭ เลือก คลิกหนึ่งครั้งบนชีตจะเลือกทั้งช่อง)'); return; }
    this.snapshot();
    if (where === 'all') {
      this.work.width = img.width; this.work.height = img.height;
      this.wctx.drawImage(img, 0, 0);
      this.view.fit(img.width, img.height, 8);
    } else {
      const s = this.sel!;
      this.wctx.clearRect(s.x, s.y, s.w, s.h);
      if (this.path.startsWith('tiles/')) this.wctx.drawImage(img, s.x, s.y, s.w, s.h); // ground blocks are filled edge to edge
      else {
        const k = Math.min(s.w / img.width, s.h / img.height), w = Math.round(img.width * k), hh = Math.round(img.height * k);
        this.wctx.drawImage(img, s.x + Math.round((s.w - w) / 2), s.y + s.h - hh, w, hh); // bottom-centred, like objects stand
      }
    }
    this.updateInfo();
    this.view.redraw();
  }

  private save() {
    this.work.toBlob(async (b) => {
      if (!b) return;
      await saveImage(this.path, b);
      this.st.layer.images.set(this.path, b);
      setArtOverride(this.path, URL.createObjectURL(b));
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
    this.st.artVersion++;
    this.undo = []; this.redo = []; this.dirty = false;
    await this.load();
    this.onChange();
  }

  destroy() { window.removeEventListener('keydown', this.onKey); this.view.destroy(); }
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
