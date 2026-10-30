// Sprite sheets of every system that draws characters, monsters or icons: monsters (also used by
// pets and homunculi), NPCs, player characters per job, item icons, skill icons and the HUD menu.
// Each opens in the image editor with the game's current sheet as the starting point and a live
// animation preview; saved sheets replace the drawn ones in the game.
import type { MonsterDef } from '../core/types';
import { generateCharacterSheet, type CharacterLook } from '../game/art/characterSprite';
import { itemIconCanvas, skillIconUrl } from '../game/art/icons';
import { generateMonsterSheet } from '../game/art/monsterSprite';
import { CHAR_ANIMS, CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_SHEET_COLS, MON_ANIMS, MON_SHEET_COLS } from '../game/art/spriteMeta';
import { UI_CELL, UI_MENU, UI_MENU_COLS } from '../game/art/spriteOverrides';
import { h, setChildren } from '../ui/dom';
import { helpBar, type StudioCtx } from './context';
import { ImageEditor, type ImageEditorOptions } from './imageEditor';

type Kind = 'monster' | 'npc' | 'class' | 'item' | 'skill' | 'ui';
interface Entry { kind: Kind; id: string; name: string; path: string; opts: ImageEditorOptions; note: string }

const KINDS: [Kind, string][] = [['monster', '👾 มอนสเตอร์ / สัตว์เลี้ยง'], ['npc', '🧑 NPC'], ['class', '🧙 ตัวละครผู้เล่น (ตามอาชีพ)'], ['item', '🎒 ไอคอนไอเทม'], ['skill', '✨ ไอคอนสกิล'], ['ui', '🖥 ไอคอนเมนู UI']];
const APPEAR = { body: 'a' as const, hairStyle: 'short' as const, hairColor: '#6a4a2a', eyeColor: '#3a6ad8', skinTone: '#f2d2b0' };

function canvasFromUrl(url: string, w: number, hgt: number): Promise<HTMLCanvasElement> {
  return new Promise((res) => {
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    const i = new Image();
    i.onload = () => { c.getContext('2d')!.drawImage(i, 0, 0, w, hgt); res(c); };
    i.onerror = () => res(c);
    i.src = url;
  });
}

function uiTemplate(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = UI_CELL * UI_MENU_COLS; c.height = UI_CELL * 2;
  const ctx = c.getContext('2d')!;
  ctx.font = `${UI_CELL - 14}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  UI_MENU.forEach(([, emoji], i) => ctx.fillText(emoji, (i % UI_MENU_COLS) * UI_CELL + UI_CELL / 2, Math.floor(i / UI_MENU_COLS) * UI_CELL + UI_CELL / 2 + 2));
  return c;
}

function entries(st: StudioCtx, kind: Kind): Entry[] {
  const d = st.data;
  const charOpts = (look: CharacterLook): ImageEditorOptions => ({ template: () => generateCharacterSheet(look), grid: { w: CHAR_FRAME_W, h: CHAR_FRAME_H }, fixedSize: true });
  const charNote = `ชีต ${CHAR_FRAME_W * CHAR_SHEET_COLS}×${CHAR_FRAME_H * CHAR_DIRECTIONS.length}: ช่องละ ${CHAR_FRAME_W}×${CHAR_FRAME_H} · แถว = ทิศ (ลง ซ้าย ขวา ขึ้น) · คอลัมน์ = ${Object.entries(CHAR_ANIMS).map(([a, m]) => `${a} ${m.count}`).join(', ')} เฟรม`;
  switch (kind) {
    case 'monster': return [...d.monsters.values()].map((m: MonsterDef) => ({
      kind, id: m.id, name: m.name, path: `sprites/monster/${m.id}`,
      opts: { template: () => generateMonsterSheet(m), grid: { w: m.art.w, h: m.art.h }, fixedSize: true },
      note: `ชีต ${m.art.w * MON_SHEET_COLS}×${m.art.h}: ช่องละ ${m.art.w}×${m.art.h} หันซ้าย (ขวาเกมกลับภาพให้) · ${Object.entries(MON_ANIMS).map(([a, x]) => `${a} ${x.count}`).join(', ')} เฟรม`,
    }));
    case 'npc': return [...d.npcs.values()].map((n) => ({ kind, id: n.id, name: n.name, path: `sprites/npc/${n.id}`, opts: charOpts({ appearance: n.appearance, outfit: n.outfit, weapon: null, sheet: `npc/${n.id}` }), note: charNote }));
    case 'class': return [...d.classes.values()].map((c) => ({
      kind, id: c.id, name: c.name, path: `sprites/class/${c.id}`, opts: charOpts({ appearance: APPEAR, outfit: c.outfit, weapon: c.weaponTypes?.[0] ?? null, sheet: `class/${c.id}` }),
      note: `${charNote} · ถ้าวาดชีตนี้ ผู้เล่นอาชีพนี้จะใช้ภาพนี้แทน (ไม่ขึ้นกับทรงผม/อาวุธที่เลือก)`,
    }));
    case 'item': return [...d.items.values()].map((it) => ({ kind, id: it.id, name: it.name, path: `icons/item/${it.id}`, opts: { template: () => itemIconCanvas(it), fixedSize: true }, note: 'ไอคอน 32×32' }));
    case 'skill': return [...d.skills.values()].map((sk) => ({ kind, id: sk.id, name: sk.name, path: `icons/skill/${sk.id}`, opts: { template: () => canvasFromUrl(skillIconUrl(sk), 32, 32), fixedSize: true }, note: 'ไอคอน 32×32' }));
    case 'ui': return [{ kind, id: 'menu', name: 'เมนูหลักทั้ง 16 ระบบ', path: 'ui/menu', opts: { template: uiTemplate, grid: { w: UI_CELL, h: UI_CELL }, fixedSize: true }, note: `ชีต ${UI_CELL * UI_MENU_COLS}×${UI_CELL * 2}: ช่องละ ${UI_CELL}×${UI_CELL} เรียงตามปุ่มเมนู: ${UI_MENU.map(([, , l]) => l).join(', ')}` }];
  }
}

export function spritesTab(st: StudioCtx, body: HTMLElement, arg?: string) {
  let kind: Kind = (arg?.split(':')[0] as Kind) ?? 'monster';
  if (!KINDS.some(([k]) => k === kind)) kind = 'monster';
  let selId = arg?.split(':')[1];
  let ed: ImageEditor | null = null;
  let raf = 0;
  const list = h('div', { class: 'st-list' });
  const search = h('input', { placeholder: 'ค้นหา…', oninput: () => renderList() }) as HTMLInputElement;
  const kindSel = h('select', { onchange: () => { kind = kindSel.value as Kind; selId = undefined; renderList(); openFirst(); } }, ...KINDS.map(([k, l]) => h('option', { value: k, selected: k === kind }, l))) as HTMLSelectElement;
  const holder = h('div', { class: 'st-main' });

  const renderList = () => setChildren(list, ...entries(st, kind)
    .filter((e) => !search.value || `${e.id} ${e.name}`.toLowerCase().includes(search.value.toLowerCase()))
    .map((e) => h('button', { class: `st-item${e.id === selId ? ' on' : ''}`, dataset: { sprite: e.path }, onclick: () => open(e) },
      h('span', {}, e.name, h('br', {}), h('span', { class: 'st-muted' }, e.id), st.layer.images.has(e.path) ? h('span', { class: 'st-edited' }, ' · วาดแล้ว') : null))));

  function open(e: Entry) {
    selId = e.id;
    ed?.destroy(); cancelAnimationFrame(raf);
    const prev = document.createElement('canvas');
    prev.className = 'st-anim';
    const animSel = h('select', {}) as HTMLSelectElement;
    const dirSel = h('select', {}, ...CHAR_DIRECTIONS.map((d, i) => h('option', { value: String(i) }, ['ลง', 'ซ้าย', 'ขวา', 'ขึ้น'][i] ?? d))) as HTMLSelectElement;
    const isChar = e.kind === 'npc' || e.kind === 'class';
    const anims = e.kind === 'monster' ? MON_ANIMS : isChar ? CHAR_ANIMS : null;
    if (anims) for (const a of Object.keys(anims)) animSel.appendChild(h('option', { value: a }, a));
    ed = new ImageEditor(st, e.path, renderList, e.opts);
    setChildren(holder,
      h('div', { class: 'st-bar', style: 'align-items:flex-end' },
        h('div', { class: 'st-preview', style: 'min-height:0;padding:6px' }, prev),
        h('div', {},
          h('div', {}, h('b', {}, e.name), ' ', h('span', { class: 'st-muted' }, e.path)),
          h('div', { class: 'st-muted' }, e.note),
          anims ? h('div', { class: 'st-row' }, 'ดูท่า', animSel, isChar ? dirSel : null) : null)),
      ed.root);
    // Live preview from the sheet being edited.
    const start = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const src = ed!.canvas, c = prev.getContext('2d')!;
      if (!src.width) return;
      c.imageSmoothingEnabled = false;
      if (anims) {
        const meta = anims[animSel.value as keyof typeof anims] as { start: number; count: number; frameMs: number };
        const f = meta.start + Math.floor((performance.now() - start) / meta.frameMs) % meta.count;
        const fw = isChar ? CHAR_FRAME_W : src.width / MON_SHEET_COLS, fh = isChar ? CHAR_FRAME_H : src.height;
        const row = isChar ? +dirSel.value : 0;
        prev.width = fw * 2; prev.height = fh * 2;
        c.clearRect(0, 0, prev.width, prev.height);
        c.drawImage(src, f * fw, row * fh, fw, fh, 0, 0, fw * 2, fh * 2);
      } else if (e.kind === 'ui') {
        prev.width = UI_MENU_COLS * 56; prev.height = 2 * 64;
        c.clearRect(0, 0, prev.width, prev.height);
        c.font = '11px system-ui'; c.textAlign = 'center'; c.fillStyle = '#eee6d6';
        UI_MENU.forEach(([, , label], i) => {
          const x = (i % UI_MENU_COLS) * 56, y = Math.floor(i / UI_MENU_COLS) * 64;
          c.fillStyle = '#2c2440'; c.fillRect(x + 2, y + 2, 52, 60); c.fillStyle = '#eee6d6';
          c.drawImage(src, (i % UI_MENU_COLS) * (src.width / UI_MENU_COLS), Math.floor(i / UI_MENU_COLS) * (src.height / 2), src.width / UI_MENU_COLS, src.height / 2, x + 12, y + 6, 32, 32);
          c.fillText(label, x + 28, y + 54);
        });
      } else {
        prev.width = 32 * 3 + 24; prev.height = 64;
        c.clearRect(0, 0, prev.width, prev.height);
        c.drawImage(src, 0, 16, 32, 32); c.drawImage(src, 40, 0, 64, 64);
      }
    };
    tick();
    renderList();
  }
  const openFirst = () => { const all = entries(st, kind); const e = all.find((x) => x.id === selId) ?? all[0]; if (e) open(e); };

  setChildren(body,
    h('div', { class: 'st-side' },
      helpBar('เลือกระบบ แล้วเลือกตัวที่จะวาด ภาพเริ่มต้นคือภาพที่เกมใช้อยู่ตอนนี้ วาดทับหรือนำเข้าชีตใหม่ได้ (เส้นกริดสีทองคือขอบแต่ละเฟรม) กดบันทึกภาพแล้วเกมจะใช้ภาพนี้แทน'),
      kindSel, search, list),
    holder);
  renderList();
  openFirst();
  return { destroy: () => { ed?.destroy(); cancelAnimationFrame(raf); }, dirty: () => ed?.isDirty() ?? false };
}
