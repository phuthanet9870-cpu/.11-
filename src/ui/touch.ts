// Touch controls for phones and tablets. Shown on touch screens (coarse pointer) or when turned on
// in the settings. On phones (see App.mobile) the HUD switches to a landscape mobile layout:
//  - a floating joystick: put a thumb anywhere on the left part of the screen and drag;
//  - a big attack button at the bottom right with the hotbar as a ring of skill buttons around it
//    (two pages of 8, swapped with the ⇄ button);
//  - quick buttons: next target, pick up, talk, AUTO;
//  - the icon menu as a drawer (☰), pinch to zoom.
// Tap-to-move and tapping monsters/NPCs still work through the game's normal pointer input.

import type { App } from './app';
import { h } from './dom';

export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch { return false; }
}

export class TouchControls {
  readonly root: HTMLElement;
  private knob: HTMLElement;
  private base: HTMLElement;
  private zone: HTMLElement;
  private padId: number | null = null;
  private origin = { x: 0, y: 0 };
  private page = 0;

  constructor(private app: App) {
    this.knob = h('div', { class: 'tc-knob' });
    this.base = h('div', { class: 'tc-pad', id: 'tc-pad' }, this.knob);
    this.zone = h('div', { class: 'tc-zone', id: 'tc-zone' }, this.base);
    const btn = (id: string, cls: string, label: string, title: string, fn: () => void) =>
      h('button', { class: `tc-btn ${cls}`, id, title, onpointerdown: (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).classList.add('down'); fn(); },
        onpointerup: (e: PointerEvent) => (e.currentTarget as HTMLElement).classList.remove('down'),
        onpointerleave: (e: PointerEvent) => (e.currentTarget as HTMLElement).classList.remove('down') }, label);
    // Dim layer behind open windows on phones: a tap on it closes the top window (or the menu).
    const backdrop = h('div', { class: 'tc-backdrop', id: 'tc-backdrop', onpointerdown: (e: PointerEvent) => { e.preventDefault(); (window as unknown as { veyloriaBack?: () => boolean }).veyloriaBack?.(); } });
    this.root = h('div', { class: 'touch-controls passthrough', id: 'touch-controls' },
      backdrop,
      this.zone,
      h('div', { class: 'tc-actions' },
        btn('tc-attack', 'tc-big', '⚔', 'Attack the nearest monster', () => this.attackNearest()),
        btn('tc-target', 'tc-small', '🎯', 'Next target', () => this.app.world?.targetNearestMonster()),
        btn('tc-loot', 'tc-small', '✋', 'Pick up the nearest item', () => this.app.world?.pickupNearest()),
        btn('tc-talk', 'tc-small', '💬', 'Talk to the nearest NPC', () => this.app.interactNearest()),
        btn('tc-page', 'tc-small', '⇄', 'Other hotbar page', () => this.setPage(1 - this.page))),
      h('div', { class: 'tc-top' },
        btn('tc-menu', 'tc-pill', '☰', 'Menu', () => this.app.hud?.setMenuCollapsed(!this.app.settings.menuCollapsed)),
        btn('tc-chat', 'tc-pill', '✉', 'Chat', () => this.toggleChat()),
        btn('tc-zin', 'tc-pill', '＋', 'Zoom in', () => this.app.zoomBy(1)),
        btn('tc-zout', 'tc-pill', '－', 'Zoom out', () => this.app.zoomBy(-1))));
    this.bindStick();
  }

  /** Re-applies the layout (after the settings or the screen size changed). */
  refresh() {
    document.querySelector('#hud .hotbar')?.classList.toggle('page2', this.page === 1);
  }

  private setPage(p: number) {
    this.page = p;
    this.refresh();
  }

  private toggleChat() {
    const chat = document.querySelector('#hud .chat');
    const on = !chat?.classList.contains('open');
    chat?.classList.toggle('open', on);
    if (on) (chat?.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  private attackNearest() {
    const w = this.app.world;
    if (!w) return;
    const t = w.currentTarget && !w.currentTarget.dead ? w.currentTarget : (w.targetNearestMonster(), w.currentTarget);
    if (t) w.attack(t.id);
  }

  /** Floating joystick: the stick appears where the thumb lands in the zone and follows its drag. */
  private bindStick() {
    const zone = this.zone, base = this.base;
    const scale = () => this.app.uiScale || 1;
    const R = 46;
    const local = (e: PointerEvent) => { const r = zone.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale(), y: (e.clientY - r.top) / scale() }; };
    const update = (e: PointerEvent) => {
      const p = local(e);
      let dx = (p.x - this.origin.x) / R, dy = (p.y - this.origin.y) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      if (len < 0.18) this.app.world?.setMoveDir(0, 0);
      else this.app.world?.setMoveDir(dx, dy);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.padId !== null) return;
      e.preventDefault();
      this.padId = e.pointerId;
      try { zone.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
      const p = local(e);
      // On phones the stick floats to the thumb; on tablets it stays where it is drawn.
      if (this.app.mobile) { this.origin = p; base.style.left = `${p.x}px`; base.style.top = `${p.y}px`; }
      else { const r = base.getBoundingClientRect(), zr = zone.getBoundingClientRect(); this.origin = { x: (r.left + r.width / 2 - zr.left) / scale(), y: (r.top + r.height / 2 - zr.top) / scale() }; }
      base.classList.add('active');
      update(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.padId) update(e); });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.padId) return;
      this.padId = null;
      this.knob.style.transform = '';
      base.classList.remove('active');
      if (this.app.mobile) { base.style.left = ''; base.style.top = ''; }
      this.app.world?.setMoveDir(0, 0);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }
}

/** Two-finger pinch on the game canvas zooms the camera. */
export function bindPinchZoom(el: HTMLElement, app: App) {
  let start = 0, startZoom = 1;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) { start = dist(e.touches); startZoom = app.settings.zoom ?? 1.5; }
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !start) return;
    e.preventDefault();
    app.setZoom(startZoom * (dist(e.touches) / start));
  }, { passive: false });
  el.addEventListener('touchend', (e) => { if (e.touches.length < 2) start = 0; }, { passive: true });
}
