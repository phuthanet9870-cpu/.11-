// Shared state of the Studio: the game data with this browser's edits applied, the shipped
// versions (to revert to), and small UI helpers.
import type { GameData } from '../core/data';
import type { MapDef, ObjectKindDef, TilesetDef } from '../core/types';
import { h } from '../ui/dom';
import type { StudioLayer } from './store';

export interface StudioCtx {
  data: GameData;
  /** Data as shipped with the game (before this browser's edits). */
  shipped: { maps: Map<string, MapDef>; objects: ObjectKindDef[]; tilesets: Map<string, TilesetDef>; data: Map<string, unknown[]> };
  layer: StudioLayer;
  /** Bumped whenever an image changes, so editors repaint their cached sprites. */
  artVersion: number;
  toast(msg: string): void;
  openTab(tab: string, arg?: string): void;
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function toast(msg: string) {
  const t = h('div', { class: 'st-toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/** Modal with a text area (JSON editing); resolves with the text, or null when cancelled. */
export function editText(title: string, text: string, note = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const ta = h('textarea', { spellcheck: false }) as HTMLTextAreaElement;
    ta.value = text;
    const close = (v: string | null) => { m.remove(); resolve(v); };
    const m = h('div', { class: 'st-modal' }, h('div', {},
      h('div', { class: 'st-h' }, title), note ? h('div', { class: 'st-muted' }, note) : null, ta,
      h('div', { class: 'st-row' }, h('button', { class: 'st-btn primary', onclick: () => close(ta.value) }, 'ใช้'), h('button', { class: 'st-btn', onclick: () => close(null) }, 'ยกเลิก'))));
    document.body.appendChild(m);
    ta.focus();
  });
}

/** Asks the user for one file. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept }) as HTMLInputElement;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
}

export function download(name: string, blob: Blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name }) as HTMLAnchorElement;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่เบราว์เซอร์เปิดได้'));
    img.src = URL.createObjectURL(file);
  });
}

/** Labelled form row. */
export const row = (label: string, ...children: (Node | string | null)[]) => h('div', { class: 'st-row' }, h('label', {}, label), ...children);

/** Short "how to use" strip shown at the top of a tab; can be folded away. */
export function helpBar(text: string) {
  const d = h('details', { class: 'st-help', open: true }, h('summary', {}, '💡 วิธีใช้'), h('div', {}, text));
  return d;
}
