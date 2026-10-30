// A canvas viewport with pan (middle/right drag, or Space + drag) and wheel zoom, shared by the
// map editor and the image editor. Content is drawn in "world" units; the view maps them to pixels.

export class View {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  x = 0; y = 0; zoom = 1;
  private dirty = true;
  private space = false;
  private panning: { px: number; py: number; x: number; y: number } | null = null;
  private ro: ResizeObserver;

  constructor(private host: HTMLElement, private draw: (v: View) => void, private minZoom = 0.1, private maxZoom = 16) {
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.className = 'st-canvas';
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wy] = this.toWorld(e.offsetX, e.offsetY);
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * (e.deltaY > 0 ? 0.85 : 1 / 0.85)));
      this.x = wx - e.offsetX / this.zoom; this.y = wy - e.offsetY / this.zoom;
      this.redraw();
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && this.space)) {
        e.preventDefault();
        this.panning = { px: e.clientX, py: e.clientY, x: this.x, y: this.y };
        this.canvas.setPointerCapture(e.pointerId);
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.panning) return;
      this.x = this.panning.x - (e.clientX - this.panning.px) / this.zoom;
      this.y = this.panning.y - (e.clientY - this.panning.py) / this.zoom;
      this.redraw();
    });
    this.canvas.addEventListener('pointerup', () => { this.panning = null; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => { if (e.code === 'Space' && document.activeElement === this.canvas) { this.space = e.type === 'keydown'; e.preventDefault(); } };

  /** True while the pointer is panning (tools should ignore the event). */
  get isPanning() { return !!this.panning || this.space; }

  toWorld(px: number, py: number): [number, number] { return [this.x + px / this.zoom, this.y + py / this.zoom]; }

  /** Centres the view on a world rectangle, zoomed to fit. */
  fit(w: number, h: number, maxZoom = 4) {
    const cw = this.canvas.width || 800, ch = this.canvas.height || 600;
    this.zoom = Math.min(maxZoom, cw / w, ch / h) * 0.95;
    this.x = w / 2 - cw / 2 / this.zoom; this.y = h / 2 - ch / 2 / this.zoom;
    this.redraw();
  }

  centerOn(wx: number, wy: number) { this.x = wx - this.canvas.width / 2 / this.zoom; this.y = wy - this.canvas.height / 2 / this.zoom; this.redraw(); }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width)); this.canvas.height = Math.max(1, Math.floor(r.height));
    this.redraw();
  }

  redraw() {
    if (this.dirty && this.frame) return;
    this.dirty = true;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0; this.dirty = false;
      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.setTransform(this.zoom, 0, 0, this.zoom, -this.x * this.zoom, -this.y * this.zoom);
      c.imageSmoothingEnabled = this.zoom < 1;
      this.draw(this);
    });
  }
  private frame = 0;

  destroy() {
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.canvas.remove();
  }
}
