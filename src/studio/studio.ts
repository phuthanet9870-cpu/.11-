// Veyloria Studio: edit maps, object kinds, tileset colours and every art image, saved in this
// browser and used by the game here; export a pack to share it or apply it to the repository.
import { loadGameData, STUDIO_COLLECTIONS } from '../core/data';
import type { MapDef, ObjectKindDef } from '../core/types';
import { paintObject } from '../game/art/mapPainter';
import { ARCH_PARTS, artUrl, loadArt, loadThemeArt, setArtOverride } from '../game/art/themeArt';
import { h, setChildren } from '../ui/dom';
import { clone, download, editText, fileToImage, helpBar, pickFile, row, toast, type StudioCtx } from './context';
import { cropDialog, ImageEditor, newCustomImage } from './imageEditor';
import { applyLayer } from './layer';
import { MapEditor } from './mapEditor';
import { spritesTab } from './spritesTab';
import { databaseTab } from './databaseTab';
import { libraryTab } from './libraryTab';
import { decodeSprite, isSpritePath, setSpriteOverride } from '../game/art/spriteOverrides';
import { clearAll, deleteTileset, exportPack, importPack, isPack, readLayer, saveImage, saveMap, saveObjects, saveTileset, type StudioLayer } from './store';

const THEMES = ['willowbrook', 'capital', 'fernwood', 'arcane', 'desert', 'coast', 'snow'];
const LANDMARKS = ['grand-palace', 'cathedral', 'royal-statue', 'stall-red', 'stall-gold', 'stall-blue', 'training-dummy'];
const DRAWS = ['tree_oak', 'tree_pine', 'tree_dark', 'bush', 'rock', 'rock_big', 'stump', 'crate', 'barrel', 'well', 'fountain', 'signpost', 'anvil', 'tent', 'goblin_tent', 'lamp_post', 'campfire', 'haystack', 'ruin_pillar', 'gravestone', 'obelisk', 'thorn_throne', 'planter', 'glint', 'art'];

export async function mountStudio(parent: HTMLElement) {
  const data = loadGameData();
  const shipped = {
    maps: new Map([...data.maps].map(([k, v]) => [k, clone(v)])), objects: clone([...data.objectKinds.values()]), tilesets: new Map([...data.tilesets].map(([k, v]) => [k, clone(v)])),
    data: new Map(STUDIO_COLLECTIONS.map((c) => [c, clone([...(data[c] as Map<string, unknown>).values()])])),
  };
  let layer: StudioLayer;
  try { layer = await readLayer(); } catch { layer = { images: new Map(), maps: new Map(), objects: null, tilesets: new Map(), data: new Map() }; toast('เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ (IndexedDB ถูกปิด) — แก้ได้แต่จะไม่ถูกเก็บไว้'); }
  for (const [path, blob] of layer.images) if (isSpritePath(path)) setSpriteOverride(path, await decodeSprite(blob));
  const res = applyLayer(data, layer);
  if (res.skipped.length) toast(`บางแมพที่แก้ไว้ใช้ไม่ได้: ${res.skipped.join('; ')}`);

  const tabs: [string, string][] = [['home', '🏠 หน้าแรก'], ['maps', '🗺 แมพ'], ['objects', '🌳 วัตถุ'], ['sprites', '🧍 สไปรต์ & UI'], ['images', '🖼 ภาพฉาก'], ['tilesets', '🎨 สีชุดภาพ'], ['database', '📚 ข้อมูลเกม'], ['library', '📥 คลัง PixelLab'], ['pack', '📦 นำเข้า/ส่งออก']];
  const body = h('div', { class: 'st-body' });
  const tabBtns = new Map<string, HTMLButtonElement>();
  let current: { destroy?: () => void; dirty?: () => boolean } | null = null;
  const st: StudioCtx = { data, shipped, layer, artVersion: 0, toast, openTab: (t, a) => open(t, a) };
  const root = h('div', { class: 'st-root', id: 'studio' },
    h('div', { class: 'st-top' }, h('span', { class: 'st-logo' }, 'VEYLORIA STUDIO'),
      ...tabs.map(([id, label]) => { const b = h('button', { class: 'st-tab', dataset: { tab: id }, onclick: () => open(id) }, label) as HTMLButtonElement; tabBtns.set(id, b); return b; }),
      h('span', { class: 'st-spacer' }),
      h('button', { class: 'st-btn primary', id: 'studio-play', title: 'เปิดเกมในเบราว์เซอร์นี้ เกมจะใช้ทุกอย่างที่บันทึกไว้', onclick: () => { if (current?.dirty?.() && !confirm('ยังมีสิ่งที่ยังไม่บันทึก ออกไปเข้าเกมเลย?')) return; location.hash = '#game'; location.reload(); } }, '▶ เข้าเกม')),
    body);
  parent.appendChild(root);
  window.addEventListener('beforeunload', (e) => { if (current?.dirty?.()) e.preventDefault(); });

  function open(tab: string, arg?: string) {
    if (current?.dirty?.() && !confirm('ยังมีสิ่งที่ยังไม่บันทึกในหน้านี้ ออกจากหน้านี้เลย?')) return;
    current?.destroy?.();
    current = null;
    for (const [id, b] of tabBtns) b.classList.toggle('on', id === tab);
    if (tab === 'home') current = homeTab(st, body);
    else if (tab === 'maps') current = mapsTab(st, body, arg);
    else if (tab === 'objects') current = objectsTab(st, body, arg);
    else if (tab === 'sprites') current = spritesTab(st, body, arg);
    else if (tab === 'tilesets') current = tilesetsTab(st, body);
    else if (tab === 'images') current = imagesTab(st, body, arg);
    else if (tab === 'database') current = databaseTab(st, body, arg);
    else if (tab === 'library') current = libraryTab(st, body, arg);
    else current = packTab(st, body);
  }
  open('home');
}

// ---------------------------------------------------------------- home
function homeTab(st: StudioCtx, body: HTMLElement) {
  const l = st.layer;
  const card = (tab: string, icon: string, title: string, text: string, arg?: string) =>
    h('button', { class: 'st-bigcard', dataset: { home: tab }, onclick: () => st.openTab(tab, arg) }, h('span', { class: 'big' }, icon), h('b', {}, title), h('span', {}, text));
  const edits = [`ภาพ/สไปรต์ ${l.images.size}`, `แมพ ${l.maps.size}`, `วัตถุ ${l.objects ? 'แก้แล้ว' : '—'}`, `สีชุดภาพ ${l.tilesets.size}`, `หมวดข้อมูล ${l.data.size}`];
  setChildren(body, h('div', { class: 'st-scroll' }, h('div', { class: 'st-home' },
    h('h2', {}, 'ยินดีต้อนรับสู่ Veyloria Studio'),
    h('div', { class: 'st-muted' }, 'แก้ได้ทุกส่วนของเกม: แมพ วัตถุ ตัวละคร มอนสเตอร์ ไอคอน เมนู และข้อมูลทุกระบบ ทุกอย่างที่บันทึกจะถูกใช้ในเกมทันทีเมื่อกด ▶ เข้าเกม'),
    h('div', { class: 'st-steps' },
      h('div', { class: 'st-step' }, h('b', {}, '1'), 'เลือกสิ่งที่อยากแก้จากการ์ดด้านล่าง หรือแท็บด้านบน'),
      h('div', { class: 'st-step' }, h('b', {}, '2'), 'แก้ไข แล้วกดปุ่มสีเขียว "บันทึก…" ของหน้านั้น (จุด • แปลว่ายังไม่บันทึก)'),
      h('div', { class: 'st-step' }, h('b', {}, '3'), 'กด ▶ เข้าเกม มุมขวาบน เพื่อเล่นและดูผล · กลับมาแก้ต่อได้จากปุ่ม Studio ในหน้าแรกของเกม')),
    h('div', { class: 'st-cards' },
      card('maps', '🗺', 'แมพ', 'ย้าย/ลบ/วางวัตถุ อาคาร NPC ประตูวาร์ป จุดเกิด · ลากครอบเพื่อเลือกหลายชิ้นแล้วลบทีเดียว · ทาพื้นและกำแพง · ปรับขนาดอาคาร/โซน'),
      card('objects', '🌳', 'วัตถุ', 'ต้นไม้ หิน บ่อน้ำ ฯลฯ: ขนาดภาพ ขนาดพื้นที่ ขวางทางหรือไม่ · สร้างวัตถุใหม่จากรูป'),
      card('sprites', '👾', 'มอนสเตอร์ / สัตว์เลี้ยง', 'วาดหรือนำเข้าสไปรต์ชีตทุกท่า (ยืน เดิน โจมตี โดนตี ตาย) พร้อมดูแอนิเมชันสด', 'monster'),
      card('sprites', '🧑', 'NPC และตัวละครผู้เล่น', 'ชีต 4 ทิศ × ทุกท่า ของ NPC แต่ละคน และของผู้เล่นแต่ละอาชีพ', 'npc'),
      card('sprites', '🎒', 'ไอคอนไอเทม / สกิล', 'ไอคอน 32×32 ของไอเทมและสกิลทุกอัน', 'item'),
      card('sprites', '🖥', 'ไอคอนเมนู UI', 'สไปรต์ชีตปุ่มเมนูทั้ง 16 ระบบ (สถานะ ไอเทม สกิล เควสต์ แผนที่ สัตว์เลี้ยง…)', 'ui'),
      card('images', '🖼', 'ภาพฉาก', 'พื้น ชีตวัตถุ อาคาร 7 ธีม สถานที่สำคัญ · นำเข้ารูป ตัดเฉพาะส่วน ย่อ/ขยาย แล้ววาง'),
      card('tilesets', '🎨', 'สีชุดภาพ', 'สีที่ใช้วาดกำแพง พุ่มไม้ขอบแมพ และของตกแต่งในแต่ละธีม'),
      card('database', '📚', 'ข้อมูลเกมทุกระบบ', 'ไอเทม มอนสเตอร์ สกิล อาชีพ NPC ร้านค้า เควสต์ ดรอป สัตว์เลี้ยง บอส การ์ด รูน ดันเจี้ยน…'),
      card('library', '📥', 'คลัง PixelLab', 'ของทั้งหมดจากบัญชี PixelLab: วัตถุ 525 ชิ้น ตัวละคร 12 ตัว พื้น 45 ชุด และแผง UI — วางในแมพ หรือใช้เป็นไอคอน NPC มอนสเตอร์ กรอบหน้าต่าง'),
      card('pack', '📦', 'นำเข้า / ส่งออก', 'รวมงานทั้งหมดเป็นไฟล์เดียว ย้ายไปเครื่องอื่น หรือใส่ลงโปรเจกต์')),
    h('h2', { style: 'margin-top:18px' }, 'สิ่งที่แก้ไว้ในเบราว์เซอร์นี้'), h('div', {}, edits.join(' · ')),
    h('h2', { style: 'margin-top:18px' }, 'ปุ่มลัด'),
    h('div', { class: 'st-muted', style: 'line-height:1.8' },
      'ล้อเมาส์ = ซูม · คลิกขวาลาก หรือกด Space ค้างแล้วลาก = เลื่อนมุมมอง · Ctrl+Z / Ctrl+Y = ย้อน / ทำซ้ำ · Delete = ลบที่เลือก · ลูกศร = ขยับทีละช่อง',
      h('br', {}), 'แมพ: Shift+ลาก = ครอบเลือกหลายชิ้น · Shift+คลิก = เพิ่ม/เอาออกจากที่เลือก · Ctrl+S = บันทึกแมพ',
      h('br', {}), 'ภาพ: Ctrl+C / Ctrl+X / Ctrl+V = คัดลอก / ตัด / วาง · Enter = วางชิ้นที่ลอยอยู่ · Esc = ยกเลิก'))));
  return {};
}

// ---------------------------------------------------------------- maps
let lastMap = 'aurelion';
function mapsTab(st: StudioCtx, body: HTMLElement, mapId?: string) {
  const list = h('div', { class: 'st-list' });
  const filter = h('input', { placeholder: 'ค้นหาแมพ…', oninput: () => renderList() }) as HTMLInputElement;
  const holder = h('div', { class: 'st-body' });
  let ed: MapEditor | null = null;
  const renderList = () => setChildren(list, ...[...st.data.maps.values()].filter((m) => m.type !== 'instance' || st.layer.maps.has(m.id))
    .filter((m) => !filter.value || `${m.id} ${m.name}`.toLowerCase().includes(filter.value.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => h('button', { class: `st-item${ed?.id === m.id ? ' on' : ''}`, dataset: { map: m.id }, onclick: () => openMap(m.id) },
      h('span', {}, m.name, h('br', {}), h('span', { class: 'st-muted' }, `${m.id} · ${m.type}`), st.layer.maps.has(m.id) ? h('span', { class: 'st-edited' }, ' · แก้แล้ว') : null))));
  const openMap = (id: string) => {
    lastMap = id;
    ed?.destroy();
    ed = new MapEditor(st, id, renderList);
    setChildren(holder, ed.root);
    renderList();
  };
  const newMap = async () => {
    const id = prompt('id ของแมพใหม่ (a-z, 0-9, _)', 'my_map')?.trim();
    if (!id) return;
    if (!/^[a-z0-9_]+$/.test(id) || st.data.maps.has(id)) { st.toast('id ใช้ไม่ได้หรือซ้ำกับแมพที่มีอยู่'); return; }
    const def: MapDef = {
      id, name: id, region: 'Studio', type: 'field', width: 60, height: 50, tileset: 'sunny_meadow', base: 'grass', border: { kind: 'thicket', thickness: 2 },
      bgm: 'field_meadow', ambient: 'meadow', weather: [], worldMapPos: { x: -1, y: -1 }, paint: [], portals: [], spawnPoints: { default: { x: 30, y: 25 } },
      npcs: [], monsterSpawns: [], objects: [], areas: [],
    };
    await saveMap(def);
    st.layer.maps.set(id, def); st.data.maps.set(id, def);
    openMap(id);
    st.toast('สร้างแมพแล้ว — เพิ่มประตูวาร์ปจากแมพอื่นมาที่นี่ (targetMap = id นี้) เพื่อเดินเข้ามาในเกม');
  };
  setChildren(body,
    h('div', { class: 'st-side', style: 'width:220px' }, h('div', { class: 'st-h' }, 'แมพ'), filter, h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: newMap }, '＋ แมพใหม่')), list),
    holder);
  // `place:<kind>` / `ground:<set>` come from the PixelLab library: open the last map with that tool ready.
  const preset = mapId && /^(place|ground):/.test(mapId) ? mapId : null;
  openMap(!preset && mapId && st.data.maps.has(mapId) ? mapId : lastMap);
  if (preset) (ed as MapEditor | null)?.preset(preset);
  return { destroy: () => ed?.destroy(), dirty: () => ed?.isDirty() ?? false };
}

// ---------------------------------------------------------------- objects
function objectsTab(st: StudioCtx, body: HTMLElement, preselect?: string) {
  const d = st.data;
  let kinds: ObjectKindDef[] = clone([...d.objectKinds.values()]);
  let selId = preselect && kinds.some((k) => k.id === preselect) ? preselect : kinds[0]?.id;
  let previewTs = 'willowbrook';
  let dirty = false;
  const list = h('div', { class: 'st-list' });
  const form = h('div', { class: 'st-scroll' });
  const usage = (id: string) => [...d.maps.values()].filter((m) => m.paint.some((op) => (op.op === 'object' || op.op === 'scatter') && op.kind === id)).map((m) => m.id);
  const pal = () => d.tilesets.get(previewTs)!.palette;

  async function render() {
    await loadThemeArt(previewTs, kinds.map((k) => k.art).filter((a): a is string => !!a));
    setChildren(list, ...kinds.map((k) => h('button', { class: `st-item${k.id === selId ? ' on' : ''}`, onclick: () => { selId = k.id; void render(); } }, paintObject(k, pal(), 1000, previewTs), k.id)));
    const k = kinds.find((x) => x.id === selId);
    if (!k) { setChildren(form, h('div', { class: 'st-muted' }, 'เลือกวัตถุทางซ้าย')); return; }
    const set = (f: keyof ObjectKindDef, v: unknown) => { (k as unknown as Record<string, unknown>)[f] = v; if (v === '' || v == null || (typeof v === 'number' && isNaN(v))) delete (k as unknown as Record<string, unknown>)[f]; dirty = true; void render(); };
    const num = (f: keyof ObjectKindDef, v: number | undefined) => h('input', { type: 'number', value: v ?? '', onchange: (e: Event) => set(f, (e.target as HTMLInputElement).value === '' ? undefined : +(e.target as HTMLInputElement).value) });
    const arts = ['', ...new Set([...LANDMARKS.map((n) => `aurelion/${n}`), ...[...st.layer.images.keys()].filter((p) => p.startsWith('custom/')), k.art ?? ''])].filter((a, i, l) => l.indexOf(a) === i);
    const char = h('div', { style: 'width:14px;height:43px;background:#6ff0c0aa;border-radius:6px 6px 2px 2px;align-self:flex-end;margin-right:8px', title: 'ตัวละครสูงประมาณ 43px' });
    const used = usage(k.id);
    setChildren(form,
      helpBar('เลือกวัตถุทางซ้าย ปรับขนาด (ความสูงภาพเทียบกับแถบสีเขียวสูงเท่าตัวละคร) แล้วกด "บันทึกวัตถุทั้งหมด" · "จากรูปภาพ" = นำเข้ารูปแล้วตัดเฉพาะส่วนที่ต้องการมาเป็นวัตถุใหม่ · วางวัตถุลงแมพได้ที่แท็บแมพ'),
      h('div', { class: 'st-row' }, h('b', {}, k.id), h('span', { class: 'st-spacer' }), h('span', { class: 'st-muted' }, 'ดูด้วยชุดภาพ'),
        h('select', { onchange: (e: Event) => { previewTs = (e.target as HTMLSelectElement).value; void render(); } }, ...[...d.tilesets.keys()].map((t) => h('option', { value: t, selected: t === previewTs }, t)))),
      h('div', { class: 'st-preview' }, char, paintObject(k, pal(), 1000, previewTs)),
      h('div', { class: 'st-muted' }, 'แถบสีเขียวคือความสูงตัวละคร ใช้เทียบขนาดให้สมจริง'),
      row('กินพื้นที่ (ช่อง)', h('span', {}, 'กว้าง ', h('input', { type: 'number', min: 1, value: k.footprint.w, onchange: (e: Event) => { k.footprint.w = Math.max(1, +(e.target as HTMLInputElement).value); dirty = true; void render(); } }),
        ' สูง ', h('input', { type: 'number', min: 1, value: k.footprint.h, onchange: (e: Event) => { k.footprint.h = Math.max(1, +(e.target as HTMLInputElement).value); dirty = true; void render(); } }))),
      row('ขวางทางเดิน', h('input', { type: 'checkbox', checked: k.blocks, onchange: (e: Event) => set('blocks', (e.target as HTMLInputElement).checked) })),
      row('ความสูงภาพ (px)', num('artH', k.artH), h('span', { class: 'st-muted' }, 'ว่าง = ขนาดตามภาพ')),
      row('ภาพ', h('select', { onchange: (e: Event) => { set('art', (e.target as HTMLSelectElement).value); if ((e.target as HTMLSelectElement).value) set('draw', 'art'); } }, ...arts.map((a) => h('option', { value: a, selected: a === (k.art ?? '') }, a || '(จากชีตวัตถุของชุดภาพ)')))),
      row('แบบวาดสำรอง', h('select', { onchange: (e: Event) => set('draw', (e.target as HTMLSelectElement).value) }, ...DRAWS.map((x) => h('option', { value: x, selected: x === k.draw }, x))), h('span', { class: 'st-muted' }, 'ช่องในชีตวัตถุ / ภาพตอนยังโหลดไม่เสร็จ')),
      row('ขนาดกล่องภาพ', num('spriteW', k.spriteW), num('spriteH', k.spriteH)),
      h('div', { class: 'st-row' },
        k.art ? h('button', { class: 'st-btn', onclick: () => st.openTab('images', k.art) }, '✏ วาด/แก้ภาพนี้') : h('button', { class: 'st-btn', onclick: () => st.openTab('images', `props/${previewTs}`) }, '✏ แก้ชีตวัตถุของ ' + previewTs),
        h('button', { class: 'st-btn', onclick: () => { const c = clone(k); c.id = uniqueId(`${k.id}_copy`); kinds.push(c); selId = c.id; dirty = true; void render(); } }, '⧉ ทำสำเนา'),
        h('button', { class: 'st-btn danger', disabled: used.length > 0, title: used.length ? `ใช้อยู่ใน: ${used.join(', ')}` : '', onclick: () => { kinds = kinds.filter((x) => x !== k); selId = kinds[0]?.id; dirty = true; void render(); } }, '🗑 ลบ')),
      used.length ? h('div', { class: 'st-muted' }, `ใช้อยู่ใน ${used.length} แมพ (ลบไม่ได้จนกว่าจะเอาออกจากแมพ): ${used.slice(0, 12).join(', ')}${used.length > 12 ? '…' : ''}`) : null,
      h('div', { class: 'st-h' }, 'บันทึก'),
      h('div', { class: 'st-row' },
        h('button', { class: 'st-btn primary', id: 'objects-save', onclick: save }, `บันทึกวัตถุทั้งหมด${dirty ? ' •' : ''}`),
        h('button', { class: 'st-btn danger', onclick: reset }, 'คืนค่าเดิมทั้งหมด'),
        h('button', { class: 'st-btn', onclick: async () => { const t = await editText(`วัตถุ ${k.id} (JSON)`, JSON.stringify(k, null, 2)); if (t == null) return; try { Object.assign(k, JSON.parse(t)); dirty = true; void render(); } catch (e) { st.toast(String(e)); } } }, '{ } JSON')));
  }
  const uniqueId = (base: string) => { let id = base, i = 2; while (kinds.some((k) => k.id === id)) id = `${base}${i++}`; return id; };
  async function save() {
    await saveObjects(kinds);
    st.layer.objects = clone(kinds);
    d.objectKinds.clear();
    for (const k of kinds) d.objectKinds.set(k.id, clone(k));
    dirty = false; st.artVersion++;
    st.toast('บันทึกวัตถุแล้ว');
    void render();
  }
  async function reset() {
    if (!confirm('คืนวัตถุทั้งหมดเป็นค่าเดิมของเกม?')) return;
    await saveObjects(null);
    st.layer.objects = null;
    d.objectKinds.clear();
    for (const k of st.shipped.objects) d.objectKinds.set(k.id, clone(k));
    kinds = clone(st.shipped.objects); dirty = false; st.artVersion++;
    void render();
  }
  async function fromImage() {
    const f = await pickFile('image/*');
    if (!f) return;
    let picture: HTMLImageElement;
    try { picture = await fileToImage(f); } catch (e) { st.toast((e as Error).message); return; }
    // Cut out just the part to use (e.g. one object from a sheet of many).
    const img = await cropDialog(picture);
    if (!img) return;
    const id = uniqueId(f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'object');
    // The custom image has no 8px margin, unlike the supplied art; add one so the sprite is not cropped.
    const c = document.createElement('canvas'); c.width = img.width + 16; c.height = img.height + 16;
    c.getContext('2d')!.drawImage(img, 8, 8);
    const padded = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    await saveImage(`custom/${id}`, padded); st.layer.images.set(`custom/${id}`, padded); setArtOverride(`custom/${id}`, URL.createObjectURL(padded));
    const hgt = Math.min(240, img.height), w = Math.round(img.width * hgt / img.height);
    kinds.push({ id, footprint: { w: Math.max(1, Math.round(w / 40)), h: 1 }, blocks: true, draw: 'art', art: `custom/${id}`, artH: hgt, spriteW: w, spriteH: hgt });
    selId = id; dirty = true;
    st.toast(`สร้างวัตถุ ${id} จากรูปแล้ว — กดบันทึกวัตถุทั้งหมดเพื่อเก็บ`);
    void render();
  }
  const newBlank = async () => {
    const id = uniqueId('new_object');
    const path = await newCustomImage(st, id, 80, 80);
    kinds.push({ id, footprint: { w: 1, h: 1 }, blocks: true, draw: 'art', art: path, artH: 48, spriteW: 48, spriteH: 48 });
    selId = id; dirty = true; void render();
  };
  setChildren(body,
    h('div', { class: 'st-side' }, h('div', { class: 'st-h' }, 'วัตถุ'),
      h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: fromImage }, '📥 จากรูปภาพ'), h('button', { class: 'st-btn', onclick: newBlank }, '＋ วาดใหม่')), list),
    h('div', { class: 'st-main' }, form));
  void render();
  return {};
}

// ---------------------------------------------------------------- tilesets
function tilesetsTab(st: StudioCtx, body: HTMLElement) {
  const d = st.data;
  let sel = [...d.tilesets.keys()][0];
  const list = h('div', { class: 'st-list' });
  const main = h('div', { class: 'st-scroll' });
  const render = () => {
    setChildren(list, ...[...d.tilesets.values()].map((t) => h('button', { class: `st-item${t.id === sel ? ' on' : ''}`, onclick: () => { sel = t.id; render(); } },
      h('img', { src: artUrl(`tiles/${t.id}`), style: 'object-fit:cover;object-position:top' }), h('span', {}, t.name, st.layer.tilesets.has(t.id) ? h('span', { class: 'st-edited' }, ' · แก้แล้ว') : null))));
    const t = clone(d.tilesets.get(sel)!);
    setChildren(main,
      helpBar('แต่ละชุดภาพมีภาพพื้น 10 แบบ ชีตวัตถุ 24 ช่อง และชุดสี กดปุ่มแก้ภาพเพื่อวาด/นำเข้า หรือเปลี่ยนสีแล้วกดบันทึก'),
      h('div', { class: 'st-row' }, h('b', {}, `${t.name} (${t.id})`)),
      row('ชื่อ', h('input', { value: t.name, onchange: (e: Event) => { t.name = (e.target as HTMLInputElement).value; } })),
      h('div', { class: 'st-h' }, 'ภาพของชุดนี้'),
      h('div', { class: 'st-grid' },
        h('div', { class: 'st-card' }, h('img', { src: artUrl(`tiles/${t.id}`), style: 'width:100%;height:160px;object-fit:cover;object-position:top;image-rendering:pixelated' }), 'พื้น 10 แบบ (ชีต 256×2560)', h('button', { class: 'st-btn', onclick: () => st.openTab('images', `tiles/${t.id}`) }, '✏ แก้ภาพพื้น')),
        h('div', { class: 'st-card' }, h('img', { src: artUrl(`props/${t.id}`), style: 'width:100%;height:160px;object-fit:contain;image-rendering:pixelated' }), 'วัตถุ 24 ช่อง (ชีต 768×512)', h('button', { class: 'st-btn', onclick: () => st.openTab('images', `props/${t.id}`) }, '✏ แก้ภาพวัตถุ'))),
      h('div', { class: 'st-h' }, 'สีของชุดภาพ'),
      h('div', { class: 'st-muted' }, 'ใช้วาดส่วนที่ไม่มีภาพ (กำแพง พุ่มไม้ขอบแมพ รั้ว ของตกแต่ง) และตอนภาพยังโหลดไม่เสร็จ'),
      h('div', { class: 'st-pal' }, ...Object.entries(t.palette).map(([k, v]) => h('label', { class: 'st-row' },
        h('input', { type: 'color', value: v.slice(0, 7), onchange: (e: Event) => { t.palette[k] = (e.target as HTMLInputElement).value + (v.length > 7 ? v.slice(7) : ''); } }), k))),
      h('div', { class: 'st-row', style: 'margin-top:12px' },
        h('button', { class: 'st-btn primary', onclick: async () => { await saveTileset(t); st.layer.tilesets.set(t.id, t); d.tilesets.set(t.id, clone(t)); st.artVersion++; st.toast('บันทึก tileset แล้ว'); render(); } }, 'บันทึก'),
        h('button', { class: 'st-btn danger', onclick: async () => { await deleteTileset(t.id); st.layer.tilesets.delete(t.id); d.tilesets.set(t.id, clone(st.shipped.tilesets.get(t.id)!)); st.artVersion++; render(); } }, 'คืนค่าเดิม')));
  };
  setChildren(body, h('div', { class: 'st-side' }, h('div', { class: 'st-h' }, 'Tilesets'), list), h('div', { class: 'st-main' }, main));
  render();
  return {};
}

// ---------------------------------------------------------------- images
function allImagePaths(st: StudioCtx): [string, string[]][] {
  const ts = [...st.data.tilesets.keys()];
  const custom = [...st.layer.images.keys()].filter((p) => p.startsWith('custom/'));
  return [
    ['พื้น (tiles)', ts.map((t) => `tiles/${t}`)],
    ['วัตถุ (props)', ts.map((t) => `props/${t}`)],
    ...THEMES.map((th) => [`อาคาร: ${th}`, ARCH_PARTS.map((p) => `arch/${th}/${p}`)] as [string, string[]]),
    ['สถานที่สำคัญ (Aurelion)', LANDMARKS.map((n) => `aurelion/${n}`)],
    ['ภาพที่สร้างเอง (custom)', custom],
  ];
}

function imagesTab(st: StudioCtx, body: HTMLElement, path?: string) {
  const list = h('div', { class: 'st-list' });
  const holder = h('div', { class: 'st-main' });
  let ed: ImageEditor | null = null;
  const renderList = () => setChildren(list, ...allImagePaths(st).flatMap(([group, paths]) => [h('div', { class: 'st-h' }, group),
    ...paths.map((p) => h('button', { class: `st-item${ed?.path === p ? ' on' : ''}`, dataset: { img: p }, onclick: () => openImg(p) },
      h('img', { src: st.layer.images.has(p) ? URL.createObjectURL(st.layer.images.get(p)!) : artUrl(p), loading: 'lazy', style: p.startsWith('tiles/') ? 'object-fit:cover;object-position:top' : '' }),
      h('span', {}, p.split('/').slice(1).join('/'), st.layer.images.has(p) ? h('span', { class: 'st-edited' }, ' · แก้แล้ว') : null)))]));
  const openImg = (p: string) => { ed?.destroy(); ed = new ImageEditor(st, p, renderList); setChildren(holder, ed.root); renderList(); };
  const newImg = async () => {
    const name = prompt('ชื่อภาพใหม่ (a-z, 0-9, _)', 'my_image')?.trim();
    if (!name || !/^[a-z0-9_]+$/.test(name)) return;
    const size = prompt('ขนาด กว้างxสูง (px)', '128x128')?.split('x').map(Number) ?? [];
    if (!(size[0] > 0 && size[1] > 0)) return;
    openImg(await newCustomImage(st, name, Math.min(2048, size[0]), Math.min(2048, size[1])));
  };
  setChildren(body, h('div', { class: 'st-side' }, helpBar('เลือกภาพจากรายการ แล้ววาด หรือกด "นำเข้ารูป + ตัด" เพื่อเลือกรูป ตัดเฉพาะส่วน ลากวาง ย่อ/ขยาย แล้วกด Enter · เสร็จแล้วกด "บันทึกภาพ"'), h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: newImg }, '＋ ภาพใหม่')), list), holder);
  void loadArt([]);
  openImg(path ?? 'props/willowbrook');
  return { destroy: () => ed?.destroy(), dirty: () => ed?.isDirty() ?? false };
}

// ---------------------------------------------------------------- pack
function packTab(st: StudioCtx, body: HTMLElement) {
  const l = st.layer;
  const summary = () => `ภาพ/สไปรต์ ${l.images.size} · แมพ ${l.maps.size} · วัตถุ ${l.objects ? 'แก้แล้ว' : 'เดิม'} · tilesets ${l.tilesets.size} · หมวดข้อมูล ${l.data.size}`;
  setChildren(body, h('div', { class: 'st-scroll', style: 'max-width:820px' },
    helpBar('งานที่บันทึกอยู่ในเบราว์เซอร์นี้เท่านั้น ส่งออกเป็นไฟล์เก็บไว้ หรือนำไปเปิดในเครื่องอื่นด้วยปุ่มนำเข้า'),
    h('div', { class: 'st-h' }, 'สิ่งที่แก้ไว้ในเบราว์เซอร์นี้'), h('div', {}, summary()),
    h('div', { class: 'st-h' }, 'ส่งออก'),
    h('div', { class: 'st-muted' }, 'รวมทุกอย่างที่แก้ (ภาพ แมพ วัตถุ tilesets) เป็นไฟล์เดียว เอาไปเปิดในเบราว์เซอร์อื่น หรือใส่ลง repo ด้วยคำสั่งด้านล่าง'),
    h('div', { class: 'st-row' }, h('button', { class: 'st-btn primary', onclick: async () => {
      const pack = await exportPack();
      download(`veyloria-studio-pack-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(pack)], { type: 'application/json' }));
    } }, '📦 ส่งออกแพ็ก (.json)')),
    h('div', { class: 'st-h' }, 'นำเข้า'),
    h('div', { class: 'st-row' }, h('button', { class: 'st-btn', onclick: async () => {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const v = JSON.parse(await f.text());
        if (!isPack(v)) throw new Error('ไม่ใช่ไฟล์แพ็กของ Veyloria Studio');
        await importPack(v);
        toast('นำเข้าแล้ว กำลังโหลดใหม่…');
        setTimeout(() => location.reload(), 600);
      } catch (e) { toast(`นำเข้าไม่ได้: ${(e as Error).message}`); }
    } }, '📥 นำเข้าแพ็ก (.json)')),
    h('div', { class: 'st-muted' }, 'นำเข้ารูปภาพเดี่ยว: ไปที่แท็บ 🖼 ภาพ แล้วกด "นำเข้ารูป" · สร้างวัตถุจากรูป: แท็บ 🌳 วัตถุ → "จากรูปภาพ"'),
    h('div', { class: 'st-h' }, 'ใส่ลงในโปรเจกต์ (repo)'),
    h('pre', { style: 'background:#0f0c16;padding:8px;border-radius:6px;white-space:pre-wrap' }, 'python3 tools/studio/apply_pack.py veyloria-studio-pack-YYYY-MM-DD.json\nnpm test'),
    h('div', { class: 'st-muted' }, 'ภาพจะถูกเขียนลง public/art (WebP), แมพ วัตถุ และ tilesets ลง src/data/studio — npm run world:build จะไม่ทับของที่แก้'),
    h('div', { class: 'st-h' }, 'ล้างทั้งหมด'),
    h('div', { class: 'st-row' }, h('button', { class: 'st-btn danger', onclick: async () => {
      if (!confirm('ลบทุกอย่างที่แก้ไว้ในเบราว์เซอร์นี้? (ส่งออกแพ็กเก็บไว้ก่อนถ้ายังต้องการ)')) return;
      await clearAll();
      location.reload();
    } }, 'ลบการแก้ทั้งหมดในเบราว์เซอร์นี้'))));
  return {};
}
