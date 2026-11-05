// Database editor: every data system of the game (items, monsters, skills, jobs, NPCs, shops,
// quests, drop tables, pets, recipes, bosses, card combos, homunculi, runes, status effects,
// memorial dungeons). Any field can be changed; entries can be added, copied and removed.
// The whole data set is re-checked with the game's own validator before saving.
import { replaceCollection, STUDIO_COLLECTIONS, validateGameData, type StudioCollection } from '../core/data';
import { itemIconUrl, skillIconUrl } from '../game/art/icons';
import { generateMonsterSheet } from '../game/art/monsterSprite';
import { h, setChildren } from '../ui/dom';
import { clone, editText, helpBar, type StudioCtx } from './context';
import { saveCollection } from './store';

export const COLLECTION_LABEL: Record<StudioCollection, string> = {
  items: '🎒 ไอเทม', monsters: '👾 มอนสเตอร์', skills: '✨ สกิล', classes: '🧙 อาชีพ', npcs: '🧑 NPC', shops: '🏪 ร้านค้า', quests: '📜 เควสต์',
  drops: '💰 ของดรอป', pets: '🐾 สัตว์เลี้ยง', recipes: '⚒ สูตรตีอาวุธ', bosses: '☠ บอส', combos: '🃏 คอมโบการ์ด', homunculi: '🧪 โฮมุนคูลัส',
  runes: '⭐ รูน', statuses: '💫 สถานะผิดปกติ', instances: '🏰 ดันเจี้ยนเมมโมเรียล',
};
const LABEL: Record<string, string> = {
  id: 'รหัส (id)', name: 'ชื่อ', description: 'คำอธิบาย', title: 'ตำแหน่ง', type: 'ประเภท', price: 'ราคา', weight: 'น้ำหนัก', level: 'เลเวล', maxHp: 'HP สูงสุด',
  atk: 'พลังโจมตี', matk: 'พลังเวท', def: 'ป้องกัน', mdef: 'ป้องกันเวท', element: 'ธาตุ', race: 'เผ่า', size: 'ขนาด', exp: 'EXP', jobExp: 'Job EXP',
  slot: 'ช่องสวมใส่', rarity: 'ความหายาก', icon: 'ไอคอน', art: 'ภาพ', items: 'ของ', entries: 'รายการ', chance: 'โอกาส', qty: 'จำนวน', itemId: 'ไอเทม',
  monsterId: 'มอนสเตอร์', dropTableId: 'ตารางดรอป', speed: 'ความเร็ว', range: 'ระยะ', cooldown: 'คูลดาวน์', spCost: 'SP ที่ใช้', maxLevel: 'เลเวลสูงสุด',
  classId: 'อาชีพ', dialogue: 'บทพูด', services: 'บริการ', appearance: 'หน้าตา', outfit: 'ชุด', rewards: 'รางวัล', objectives: 'เป้าหมาย',
};

export function databaseTab(st: StudioCtx, body: HTMLElement, arg?: string) {
  let coll: StudioCollection = (STUDIO_COLLECTIONS as readonly string[]).includes(arg ?? '') ? (arg as StudioCollection) : 'items';
  let list: Record<string, unknown>[] = [];
  let selId: string | undefined;
  let dirty = false;
  const colList = h('div', { class: 'st-list' });
  const entryList = h('div', { class: 'st-list' });
  const search = h('input', { placeholder: 'ค้นหา id หรือชื่อ…', oninput: () => renderEntries() }) as HTMLInputElement;
  const form = h('div', { class: 'st-scroll' });

  const load = () => { list = clone([...(st.data[coll] as Map<string, unknown>).values()]) as Record<string, unknown>[]; dirty = false; selId = list[0]?.id as string; };
  const renderCols = () => setChildren(colList, ...STUDIO_COLLECTIONS.map((c) => h('button', { class: `st-item${c === coll ? ' on' : ''}`, dataset: { coll: c }, onclick: () => {
    if (dirty && !confirm('ยังไม่ได้บันทึก ทิ้งการแก้ในหมวดนี้?')) return;
    coll = c; load(); renderAll();
  } }, h('span', {}, COLLECTION_LABEL[c], ' ', h('span', { class: 'st-muted' }, String((st.data[c] as Map<string, unknown>).size)), st.layer.data.has(c) ? h('span', { class: 'st-edited' }, ' · แก้แล้ว') : null))));
  const renderEntries = () => setChildren(entryList, ...list
    .filter((e) => !search.value || `${e.id} ${e.name ?? ''}`.toLowerCase().includes(search.value.toLowerCase()))
    .slice(0, 400)
    .map((e) => h('button', { class: `st-item${e.id === selId ? ' on' : ''}`, onclick: () => { selId = e.id as string; renderAll(); } }, thumb(e), h('span', {}, String(e.name ?? e.id), h('br', {}), h('span', { class: 'st-muted' }, String(e.id))))));

  function thumb(e: Record<string, unknown>): Node | null {
    try {
      if (coll === 'items') return h('img', { src: itemIconUrl(e as never) });
      if (coll === 'skills') return h('img', { src: skillIconUrl(e as never) });
      if (coll === 'monsters') {
        const m = e as never as { art: { w: number; h: number } };
        const sheet = generateMonsterSheet(e as never), c = document.createElement('canvas');
        c.width = m.art.w; c.height = m.art.h; c.getContext('2d')!.drawImage(sheet, 0, 0);
        return c;
      }
    } catch { /* an entry being edited may be incomplete */ }
    return null;
  }

  /** The data with this collection's draft swapped in, checked by the game's validator. */
  function problems(): string[] {
    const d = { ...st.data, [coll]: new Map(st.data[coll] as Map<string, unknown>) } as typeof st.data;
    try { replaceCollection(d, coll, list); return validateGameData(d); } catch (e) { return [String((e as Error).message)]; }
  }

  function field(e: Record<string, unknown>, key: string): HTMLElement {
    const v = e[key];
    const set = (nv: unknown) => { e[key] = nv; dirty = true; if (key === 'id' || key === 'name') renderEntries(); updateStatus(); };
    let input: HTMLElement;
    if (typeof v === 'boolean') input = h('input', { type: 'checkbox', checked: v, onchange: (ev: Event) => set((ev.target as HTMLInputElement).checked) });
    else if (typeof v === 'number') input = h('input', { type: 'number', step: 'any', value: v, onchange: (ev: Event) => set(+(ev.target as HTMLInputElement).value) });
    else if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) input = h('span', { class: 'st-row' }, h('input', { type: 'color', value: v, onchange: (ev: Event) => set((ev.target as HTMLInputElement).value) }), v);
    else if (typeof v === 'string') input = v.length > 60 ? h('textarea', { onchange: (ev: Event) => set((ev.target as HTMLTextAreaElement).value) }, v) : h('input', { value: v, onchange: (ev: Event) => set((ev.target as HTMLInputElement).value) });
    else {
      const ta = h('textarea', { spellcheck: false, onchange: () => { try { set(JSON.parse(ta.value)); ta.style.borderColor = ''; } catch { ta.style.borderColor = '#d85a5a'; st.toast(`ช่อง ${key}: JSON ไม่ถูกต้อง`); } } }, JSON.stringify(v, null, 1)) as HTMLTextAreaElement;
      ta.rows = Math.min(10, JSON.stringify(v, null, 1).split('\n').length);
      input = ta;
    }
    return h('div', { class: 'st-field' }, h('label', {}, LABEL[key] ?? key, LABEL[key] ? h('small', {}, key) : null), input);
  }

  const status = h('div', { class: 'st-warn' });
  const updateStatus = () => {
    const p = problems();
    status.textContent = p.length ? `⚠ ${p.length} ปัญหา: ${p.slice(0, 6).join(' · ')}${p.length > 6 ? ' …' : ''}` : '✔ ข้อมูลถูกต้อง';
    saveBtn.textContent = `บันทึกหมวดนี้${dirty ? ' •' : ''}`;
  };
  const saveBtn = h('button', { class: 'st-btn primary', id: 'db-save', onclick: async () => {
    const p = problems();
    if (p.length && !confirm(`ข้อมูลมีปัญหา ${p.length} ข้อ:\n${p.slice(0, 10).join('\n')}\n\nบันทึกต่อไหม? (เกมอาจทำงานผิดพลาด)`)) return;
    const ids = new Set<string>();
    for (const e of list) { if (!e.id || ids.has(e.id as string)) { st.toast(`id ว่างหรือซ้ำ: ${e.id}`); return; } ids.add(e.id as string); }
    await saveCollection(coll, list);
    st.layer.data.set(coll, clone(list));
    replaceCollection(st.data, coll, clone(list));
    dirty = false; st.artVersion++;
    st.toast(`บันทึก${COLLECTION_LABEL[coll]}แล้ว — เกมในเบราว์เซอร์นี้จะใช้ข้อมูลใหม่`);
    renderAll();
  } }, 'บันทึกหมวดนี้');

  function renderForm() {
    const e = list.find((x) => x.id === selId);
    const links: Node[] = [];
    if (e && coll === 'items') links.push(h('button', { class: 'st-btn', onclick: () => st.openTab('sprites', `item:${e.id}`) }, '🎨 วาดไอคอน'));
    if (e && coll === 'skills') links.push(h('button', { class: 'st-btn', onclick: () => st.openTab('sprites', `skill:${e.id}`) }, '🎨 วาดไอคอน'));
    if (e && coll === 'monsters') links.push(h('button', { class: 'st-btn', onclick: () => st.openTab('sprites', `monster:${e.id}`) }, '🎨 วาดสไปรต์ชีต'));
    if (e && coll === 'npcs') links.push(h('button', { class: 'st-btn', onclick: () => st.openTab('sprites', `npc:${e.id}`) }, '🎨 วาดสไปรต์ชีต'));
    if (e && coll === 'classes') links.push(h('button', { class: 'st-btn', onclick: () => st.openTab('sprites', `class:${e.id}`) }, '🎨 วาดตัวละครอาชีพนี้'));
    setChildren(form,
      helpBar('เลือกหมวดทางซ้าย แล้วเลือกรายการ แก้ค่าในช่อง (ช่องที่เป็นกลุ่มข้อมูลแก้เป็น JSON) กด "บันทึกหมวดนี้" เพื่อใช้ในเกม · ระบบตรวจข้อมูลแบบเดียวกับเกมจะแจ้งถ้ามีอะไรอ้างถึงของที่ไม่มีอยู่'),
      h('div', { class: 'st-row' }, h('b', {}, COLLECTION_LABEL[coll]), h('span', { class: 'st-spacer' }),
        h('button', { class: 'st-btn', onclick: () => addEntry(e) }, '＋ เพิ่มใหม่ (จากรายการนี้)'),
        e ? h('button', { class: 'st-btn danger', onclick: () => { if (!confirm(`ลบ ${e.id}?`)) return; list = list.filter((x) => x !== e); selId = list[0]?.id as string; dirty = true; renderAll(); } }, '🗑 ลบรายการ') : null,
        e ? h('button', { class: 'st-btn', onclick: async () => { const t = await editText(`${e.id} (JSON)`, JSON.stringify(e, null, 2)); if (t == null) return; try { const v = JSON.parse(t); for (const k of Object.keys(e)) delete e[k]; Object.assign(e, v); selId = e.id as string; dirty = true; renderAll(); } catch (err) { st.toast(String(err)); } } }, '{ } JSON') : null,
        ...links),
      h('div', { class: 'st-row' }, saveBtn,
        h('button', { class: 'st-btn danger', onclick: async () => {
          if (!confirm(`คืน${COLLECTION_LABEL[coll]}ทั้งหมดเป็นค่าเดิมของเกม?`)) return;
          await saveCollection(coll, null);
          st.layer.data.delete(coll);
          replaceCollection(st.data, coll, clone(st.shipped.data.get(coll)!));
          load(); renderAll();
        } }, 'คืนค่าเดิมทั้งหมวด')),
      status,
      e ? h('div', {}, ...Object.keys(e).map((k) => field(e, k))) : h('div', { class: 'st-muted' }, 'ไม่มีรายการ'));
    updateStatus();
  }

  function addEntry(from?: Record<string, unknown>) {
    const base = from ?? list[0];
    if (!base) return;
    const id = prompt('id ของรายการใหม่ (a-z, 0-9, _)', `${base.id}_new`)?.trim();
    if (!id) return;
    if (list.some((x) => x.id === id)) { st.toast('id นี้มีอยู่แล้ว'); return; }
    const e = clone(base); e.id = id;
    if (typeof e.name === 'string') e.name = `${e.name} (ใหม่)`;
    list.push(e); selId = id; dirty = true; renderAll();
  }

  function renderAll() { renderCols(); renderEntries(); renderForm(); }
  setChildren(body,
    h('div', { class: 'st-side', style: 'width:210px' }, h('div', { class: 'st-h' }, 'หมวดข้อมูล'), colList),
    h('div', { class: 'st-side', style: 'width:230px' }, search, entryList),
    h('div', { class: 'st-main' }, form));
  load(); renderAll();
  return { dirty: () => dirty };
}
