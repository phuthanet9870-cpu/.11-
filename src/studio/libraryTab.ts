// PixelLab library: every object, character, ground tile set and UI panel brought in from the
// project's PixelLab account (tools/pixellab/), with one-click ways to use each in the game.
import PL from '../data/pixellab/library.json';
import { CHAR_FRAME_H, CHAR_FRAME_W, MON_SHEET_COLS } from '../game/art/spriteMeta';
import { applyWindowSkin, decodeSprite, setSpriteOverride, UI_CELL, UI_MENU, UI_MENU_COLS } from '../game/art/spriteOverrides';
import { artUrl, setArtOverride } from '../game/art/themeArt';
import { h, setChildren } from '../ui/dom';
import { fileToImage, helpBar, type StudioCtx } from './context';
import { saveImage } from './store';
import { uiTemplate } from './spritesTab';

type Section = 'objects' | 'characters' | 'tiles' | 'ui';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`โหลดภาพไม่ได้: ${src}`)); i.src = src; });
}

/** Saves a canvas as a sprite / icon / UI image and makes it live at once (Studio and game). */
async function saveSprite(st: StudioCtx, path: string, c: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  await saveImage(path, blob);
  st.layer.images.set(path, blob);
  setArtOverride(path, URL.createObjectURL(blob));
  setSpriteOverride(path, await decodeSprite(blob));
  st.artVersion++;
}

/** Draws an image into a w×h box, whole and standing on the bottom edge. */
function contain(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, hh: number) {
  const k = Math.min(w / sw, hh / sh), dw = Math.round(sw * k), dh = Math.round(sh * k);
  ctx.imageSmoothingEnabled = k < 1;
  ctx.drawImage(img, sx, sy, sw, sh, x + Math.round((w - dw) / 2), y + hh - dh, dw, dh);
}

/** Small modal to pick one target (item, skill, NPC, …). */
function choose(title: string, options: [string, string][]): Promise<string | null> {
  return new Promise((resolve) => {
    const q = h('input', { placeholder: 'ค้นหา…' }) as HTMLInputElement;
    const sel = h('select', { size: 12, style: 'width:100%' }) as HTMLSelectElement;
    const fill = () => setChildren(sel, ...options.filter(([v, l]) => !q.value || `${v} ${l}`.toLowerCase().includes(q.value.toLowerCase())).slice(0, 400).map(([v, l]) => h('option', { value: v }, `${l} (${v})`)));
    q.oninput = fill; fill();
    const close = (v: string | null) => { m.remove(); resolve(v); };
    sel.ondblclick = () => close(sel.value || null);
    const m = h('div', { class: 'st-modal' }, h('div', { style: 'width:min(520px,94vw)' },
      h('div', { class: 'st-h' }, title), q, sel,
      h('div', { class: 'st-row' }, h('button', { class: 'st-btn primary', id: 'lib-choose-ok', onclick: () => close(sel.value || null) }, 'ใช้'), h('button', { class: 'st-btn', onclick: () => close(null) }, 'ยกเลิก'))));
    document.body.appendChild(m);
    q.focus();
  });
}

export function libraryTab(st: StudioCtx, body: HTMLElement, arg?: string) {
  let section: Section = (['objects', 'characters', 'tiles', 'ui'] as const).find((s) => s === arg) ?? 'objects';
  const search = h('input', { placeholder: 'ค้นหา (ภาษาอังกฤษ เช่น tree, house, sword, icon)…', oninput: () => render() }) as HTMLInputElement;
  const main = h('div', { class: 'st-scroll' });
  const tabs = h('div', { class: 'st-row' });
  let timers: number[] = [];
  const d = st.data;

  const asIcon = async (art: string, path: string, label: string) => {
    const img = await loadImg(artUrl(art));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    contain(c.getContext('2d')!, img, 0, 0, img.width, img.height, 0, 0, 32, 32);
    await saveSprite(st, path, c);
    st.toast(`ใช้เป็น${label}แล้ว — เกมในเบราว์เซอร์นี้จะใช้ไอคอนใหม่`);
  };
  const asMenu = async (art: string) => {
    const slot = await choose('ใช้เป็นไอคอนปุ่มเมนู', UI_MENU.map(([id, emoji, label], i) => [String(i), `${emoji} ${label} (${id})`]));
    if (slot == null) return;
    const blob = st.layer.images.get('ui/menu');
    const sheet = document.createElement('canvas'); sheet.width = UI_CELL * UI_MENU_COLS; sheet.height = UI_CELL * 2;
    const ctx = sheet.getContext('2d')!;
    ctx.drawImage(blob ? await fileToImage(blob) : uiTemplate(), 0, 0, sheet.width, sheet.height);
    const i = +slot, x = (i % UI_MENU_COLS) * UI_CELL, y = Math.floor(i / UI_MENU_COLS) * UI_CELL;
    ctx.clearRect(x, y, UI_CELL, UI_CELL);
    const img = await loadImg(artUrl(art));
    contain(ctx, img, 0, 0, img.width, img.height, x + 4, y + 4, UI_CELL - 8, UI_CELL - 8);
    await saveSprite(st, 'ui/menu', sheet);
    st.toast(`ใช้เป็นไอคอนปุ่ม ${UI_MENU[i][2]} แล้ว`);
  };

  function objectsView(q: string) {
    const list = PL.objects.filter((o) => !q || `${o.slug} ${o.name}`.toLowerCase().includes(q));
    const grid = h('div', { class: 'st-grid' });
    for (const o of list.slice(0, 200)) {
      const kind = `pl_${o.slug}`;
      grid.appendChild(h('div', { class: 'st-card', dataset: { pl: o.slug } },
        h('div', { class: 'st-preview', style: 'min-height:96px' }, h('img', { src: artUrl(o.art), loading: 'lazy', style: 'max-height:120px' })),
        h('div', { title: o.name, style: 'font-size:12px;line-height:1.3;max-height:3.9em;overflow:hidden' }, o.name),
        h('div', { class: 'st-muted' }, `${o.w}×${o.h}${o.frames > 1 ? ` · ${o.frames} เฟรม` : ''}`),
        h('div', { class: 'st-row' },
          h('button', { class: 'st-btn primary', title: 'เปิดแท็บแมพพร้อมเครื่องมือวางวัตถุชิ้นนี้', onclick: () => st.openTab('maps', `place:${kind}`) }, '🗺 วางในแมพ'),
          h('button', { class: 'st-btn', onclick: async () => { const id = await choose('ใช้เป็นไอคอนไอเทม', [...d.items.values()].map((i) => [i.id, i.name])); if (id) await asIcon(o.art, `icons/item/${id}`, 'ไอคอนไอเทม'); } }, '🎒 ไอคอนไอเทม'),
          h('button', { class: 'st-btn', onclick: async () => { const id = await choose('ใช้เป็นไอคอนสกิล', [...d.skills.values()].map((s) => [s.id, s.name])); if (id) await asIcon(o.art, `icons/skill/${id}`, 'ไอคอนสกิล'); } }, '✨ ไอคอนสกิล'),
          h('button', { class: 'st-btn', onclick: () => void asMenu(o.art) }, '🖥 ปุ่มเมนู'),
          h('button', { class: 'st-btn', onclick: () => st.openTab('objects', kind) }, '⚙ ขนาด'),
          h('button', { class: 'st-btn', onclick: () => st.openTab('images', o.art) }, '✏ แก้ภาพ'))));
    }
    return [h('div', { class: 'st-muted' }, `${list.length} ชิ้น${list.length > 200 ? ' (แสดง 200 ชิ้นแรก — พิมพ์ค้นหาเพื่อหาที่เหลือ)' : ''} · ทุกชิ้นเป็นวัตถุในเกมอยู่แล้ว ชื่อ pl_<ชื่อ> ในเครื่องมือ 🌳 วางวัตถุ (กลุ่ม PixelLab)`), grid];
  }

  function charactersView(q: string) {
    const grid = h('div', { class: 'st-grid', style: 'grid-template-columns:repeat(auto-fill,minmax(260px,1fr))' });
    for (const c of PL.characters.filter((x) => !q || `${x.slug} ${x.name}`.toLowerCase().includes(q))) {
      const prev = h('canvas', { width: CHAR_FRAME_W * 2, height: CHAR_FRAME_H * 2, class: 'st-anim' }) as HTMLCanvasElement;
      void loadImg(artUrl(c.chr)).then((sheet) => {
        let f = 0;
        const ctx = prev.getContext('2d')!; ctx.imageSmoothingEnabled = false;
        // Walks around: down, left, up, right.
        const id = window.setInterval(() => {
          const row = [0, 1, 3, 2][Math.floor(f / 8) % 4], col = 2 + (f % 4);
          ctx.clearRect(0, 0, prev.width, prev.height);
          ctx.drawImage(sheet, col * CHAR_FRAME_W, row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, prev.width, prev.height);
          f++;
        }, 140);
        timers.push(id);
      });
      const asSheet = async (path: string, label: string) => {
        const img = await loadImg(artUrl(c.chr));
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        cv.getContext('2d')!.drawImage(img, 0, 0);
        await saveSprite(st, path, cv);
        st.toast(`ใช้เป็น${label}แล้ว`);
      };
      grid.appendChild(h('div', { class: 'st-card', dataset: { pl: c.slug } },
        h('div', { class: 'st-preview', style: 'min-height:0' }, prev),
        h('div', { title: c.name, style: 'font-size:12px;line-height:1.3;max-height:5.2em;overflow:hidden' }, c.name),
        h('div', { class: 'st-muted' }, `ท่าจาก PixelLab: ${c.anims.join(', ') || 'ภาพหมุน 8 ทิศ'}`),
        h('div', { class: 'st-row' },
          h('button', { class: 'st-btn primary', onclick: async () => { const id = await choose('ใช้เป็นภาพ NPC', [...d.npcs.values()].map((n) => [n.id, n.name])); if (id) await asSheet(`sprites/npc/${id}`, `ภาพของ NPC ${id}`); } }, '🧑 ใช้กับ NPC'),
          h('button', { class: 'st-btn', onclick: async () => { const id = await choose('ใช้เป็นตัวละครผู้เล่นของอาชีพ', [...d.classes.values()].map((k) => [k.id, k.name])); if (id) await asSheet(`sprites/class/${id}`, `ตัวละครอาชีพ ${id}`); } }, '🧙 ใช้กับอาชีพ'),
          h('button', { class: 'st-btn', onclick: async () => {
            const id = await choose('ใช้เป็นมอนสเตอร์ / สัตว์เลี้ยง', [...d.monsters.values()].map((m) => [m.id, m.name]));
            if (!id) return;
            const m = d.monsters.get(id)!, img = await loadImg(artUrl(c.mon));
            const cv = document.createElement('canvas'); cv.width = m.art.w * MON_SHEET_COLS; cv.height = m.art.h;
            const ctx = cv.getContext('2d')!;
            for (let i = 0; i < MON_SHEET_COLS; i++) contain(ctx, img, i * c.monW, 0, c.monW, c.monH, i * m.art.w, 0, m.art.w, m.art.h);
            await saveSprite(st, `sprites/monster/${id}`, cv);
            st.toast(`ใช้เป็นมอนสเตอร์ ${m.name} แล้ว`);
          } }, '👾 ใช้กับมอนสเตอร์'),
          h('button', { class: 'st-btn', onclick: () => st.openTab('images', c.chr) }, '✏ แก้ชีต'))));
    }
    return [h('div', { class: 'st-muted' }, 'แปลงเป็นชีตของเกมแล้ว (4 ทิศ: ยืน เดิน โจมตี ร่ายเวท โดนตี ล้ม) และชีตมอนสเตอร์ (หันซ้าย)'), grid];
  }

  function tilesView(q: string) {
    const grid = h('div', { class: 'st-grid', style: 'grid-template-columns:repeat(auto-fill,minmax(300px,1fr))' });
    for (const t of PL.tiles.filter((x) => !q || `${x.slug} ${x.name}`.toLowerCase().includes(q))) {
      grid.appendChild(h('div', { class: 'st-card', dataset: { pl: t.slug } },
        h('img', { src: artUrl(t.art), loading: 'lazy', style: 'width:100%;image-rendering:pixelated;background:#0c0a12' }),
        h('div', { title: t.name, style: 'font-size:12px' }, t.name),
        h('div', { class: 'st-muted' }, `${t.count} แบบ · ${t.kind === 'wang' ? 'ชุดรอยต่อ 2 พื้น' : 'ชุดพื้น'} · เดินได้แบบ ${t.base}`),
        h('div', { class: 'st-row' }, h('button', { class: 'st-btn primary', onclick: () => st.openTab('maps', `ground:${t.slug}`) }, '🟩 ทาพื้นด้วยชุดนี้'), h('button', { class: 'st-btn', onclick: () => st.openTab('images', t.art) }, '✏ แก้ภาพ'))));
    }
    return [h('div', { class: 'st-muted' }, 'อยู่ในเครื่องมือ 🟩 ทาพื้น / 🛤 วาดทางเดิน ของแท็บแมพ (เลือก "PixelLab" ในช่องชุดภาพ)'), grid];
  }

  function uiView() {
    return [h('div', { class: 'st-grid' }, ...PL.ui.map((u) => h('div', { class: 'st-card' },
      h('div', { class: 'st-preview' }, h('img', { src: artUrl(u.art), style: 'max-height:340px' })),
      h('div', {}, `${u.name} · ${u.w}×${u.h}`),
      h('div', { class: 'st-row' },
        h('button', { class: 'st-btn primary', id: 'lib-window-skin', onclick: async () => {
          const img = await loadImg(artUrl(u.art));
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0);
          await saveSprite(st, 'ui/window', cv);
          st.toast('ใช้เป็นกรอบหน้าต่างของเกมแล้ว — กด ▶ เข้าเกมเพื่อดู');
        } }, '🪟 ใช้เป็นกรอบหน้าต่างเกม'),
        h('button', { class: 'st-btn danger', onclick: async () => {
          const { deleteImage } = await import('./store');
          await deleteImage('ui/window'); st.layer.images.delete('ui/window'); setSpriteOverride('ui/window', null); applyWindowSkin();
          st.toast('กลับไปใช้กรอบหน้าต่างเดิม');
        } }, 'กรอบเดิม'),
        h('button', { class: 'st-btn', onclick: () => st.openTab('images', u.art) }, '✏ แก้ภาพ')))))];
  }

  const results = h('div', {});
  function render() {
    for (const t of timers) clearInterval(t);
    timers = [];
    const counts: Record<Section, number> = { objects: PL.objects.length, characters: PL.characters.length, tiles: PL.tiles.length, ui: PL.ui.length };
    const names: Record<Section, string> = { objects: '🌳 วัตถุ', characters: '🧑 ตัวละคร', tiles: '🟩 พื้น', ui: '🪟 UI' };
    setChildren(tabs, ...(Object.keys(names) as Section[]).map((s) => h('button', { class: `st-btn${s === section ? ' on' : ''}`, dataset: { libsec: s }, onclick: () => { section = s; render(); } }, `${names[s]} (${counts[s]})`)));
    const q = search.value.toLowerCase().trim();
    setChildren(results, ...(section === 'objects' ? objectsView(q) : section === 'characters' ? charactersView(q) : section === 'tiles' ? tilesView(q) : uiView()));
  }
  setChildren(main,
    helpBar('ของทุกชิ้นจากบัญชี PixelLab ของโปรเจกต์ (เอาเข้ามาในเกมแล้ว) · วัตถุ: วางในแมพ หรือใช้เป็นไอคอนไอเทม/สกิล/ปุ่มเมนู · ตัวละคร: ใช้กับ NPC อาชีพ หรือมอนสเตอร์ · พื้น: ใช้ในเครื่องมือทาพื้น · UI: ใช้เป็นกรอบหน้าต่าง'),
    tabs, search, results);
  setChildren(body, h('div', { class: 'st-main' }, main));
  render();
  return { destroy: () => { for (const t of timers) clearInterval(t); } };
}
