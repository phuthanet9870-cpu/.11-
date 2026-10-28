// Touch controls for phones and tablets: a virtual joystick, action buttons and pinch zoom.
// Shown on touch screens (coarse pointer) or when turned on in the settings. Tap-to-move and
// tapping monsters/NPCs already work through the game's normal pointer input.

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
  private pad: HTMLElement;
  private padId: number | null = null;

  constructor(private app: App) {
    this.knob = h('div', { class: 'tc-knob' });
    this.pad = h('div', { class: 'tc-pad', id: 'tc-pad' }, this.knob);
    const btn = (id: string, label: string, title: string, fn: () => void) =>
      h('button', { class: 'tc-btn', id, title, onpointerdown: (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); fn(); } }, label);
    this.root = h('div', { class: 'touch-controls passthrough', id: 'touch-controls' },
      this.pad,
      h('div', { class: 'tc-actions' },
        btn('tc-attack', '⚔', 'Attack the nearest monster', () => this.attackNearest()),
        btn('tc-talk', '💬', 'Talk to the nearest NPC', () => this.app.interactNearest()),
        btn('tc-loot', '✋', 'Pick up the nearest item', () => this.app.world?.pickupNearest()),
        btn('tc-target', '🎯', 'Next target', () => this.app.world?.targetNearestMonster())));
    this.bindPad();
  }

  private attackNearest() {
    const w = this.app.world;
    if (!w) return;
    const t = w.currentTarget && !w.currentTarget.dead ? w.currentTarget : (w.targetNearestMonster(), w.currentTarget);
    if (t) w.attack(t.id);
  }

  private bindPad() {
    const pad = this.pad;
    const update = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
      let dx = (e.clientX - cx) / rad, dy = (e.clientY - cy) / rad;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
      // Small dead zone; otherwise move in the stick's direction.
      if (len < 0.2) this.app.world?.setMoveDir(0, 0);
      else this.app.world?.setMoveDir(dx, dy);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.padId = e.pointerId;
      pad.setPointerCapture?.(e.pointerId);
      update(e);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === this.padId) update(e); });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.padId) return;
      this.padId = null;
      this.knob.style.transform = '';
      this.app.world?.setMoveDir(0, 0);
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
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
