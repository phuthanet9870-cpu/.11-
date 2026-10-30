// Title, character select and character creation screens.
import type { GameData } from '../core/data';
import { EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, validateName } from '../core/character';
import type { Appearance, CharacterState, Direction, SaveFile } from '../core/types';
import { generateCharacterSheet, type CharacterLook } from '../game/art/characterSprite';
import { CHAR_ANIMS, CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_SHEET_COLS, type CharAnim } from '../game/art/spriteMeta';
import { audio } from '../game/audio/audio';
import { getLang, LANGS, type Lang } from './i18n';
import { h, setChildren } from './dom';

/** Animated sprite preview on a canvas, scaled up with crisp pixels. */
export class SpritePreview {
  canvas: HTMLCanvasElement;
  private sheet: HTMLCanvasElement | null = null;
  private raf = 0;
  dir: Direction = 'down';
  anim: CharAnim = 'idle';
  constructor(w: number, h: number, className = 'preview') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.canvas.className = className;
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  setLook(look: CharacterLook) { this.sheet = generateCharacterSheet(look); }
  private draw() {
    if (!this.canvas.isConnected) { cancelAnimationFrame(this.raf); return; }
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.sheet) return;
    const meta = CHAR_ANIMS[this.anim];
    const f = Math.floor(performance.now() / meta.frameMs) % meta.count;
    const col = meta.start + f, row = CHAR_DIRECTIONS.indexOf(this.dir);
    void CHAR_SHEET_COLS;
    ctx.drawImage(this.sheet, col * CHAR_FRAME_W, row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, this.canvas.width, this.canvas.height);
  }
}

export function lookForCharacter(data: GameData, c: CharacterState): CharacterLook {
  const cls = data.classes.get(c.classId)!;
  const w = c.equipment.weapon ? data.items.get(c.equipment.weapon.itemId)?.weaponType ?? null : null;
  return { appearance: c.appearance, outfit: cls.outfit, weapon: w, shield: !!c.equipment.shield, sheet: `class/${c.classId}` };
}

export function titleScreen(onPlay: () => void, onSettings: () => void, onLang: (l: Lang) => void): HTMLElement {
  const langRow = h('div', { id: 'lang-pick', style: 'position:absolute;top:14px;right:16px;display:flex;gap:6px', 'data-noi18n': true },
    ...LANGS.map((l) => h('button', { class: `btn small${getLang() === l.id ? ' primary' : ''}`, dataset: { lang: l.id }, onclick: () => {
      onLang(l.id);
      langRow.querySelectorAll('button').forEach((b) => b.classList.toggle('primary', (b as HTMLElement).dataset.lang === l.id));
    } }, l.label)));
  return h('div', { class: 'screen', id: 'title-screen' }, langRow,
    h('div', { class: 'title-box' },
      h('div', { class: 'logo' }, 'VEYLORIA ONLINE', h('small', {}, 'LEGENDS BEGIN WITH YOU')),
      h('div', { class: 'title-menu' },
        h('button', { class: 'btn primary', id: 'btn-play', onclick: () => { audio.unlock(); audio.play('ui_click'); onPlay(); } }, 'Start Adventure'),
        h('button', { class: 'btn', onclick: () => { audio.unlock(); onSettings(); } }, 'Settings'),
        h('button', { class: 'btn', id: 'btn-studio', onclick: () => { location.hash = '#studio'; location.reload(); } }, 'Studio'),
      ),
      h('div', { class: 'mode-note' },
        'Phase 1 build — single-player development mode. Progress is saved in this browser. ',
        'Online accounts, parties and guilds arrive in Phase 3 (see README).'),
    ),
    h('div', { class: 'version' }, 'v0.1.0 · Phase 1 · placeholder art & procedural audio'),
  );
}

export function characterSelectScreen(
  data: GameData, save: SaveFile,
  handlers: { onPlay: (slot: number) => void; onCreate: (slot: number) => void; onDelete: (slot: number, name: string) => void; onBack: () => void },
): HTMLElement {
  let selected = save.characters.findIndex((c) => !!c);
  const slotsEl = h('div', { class: 'slots' });
  const playBtn = h('button', { class: 'btn primary', id: 'btn-enter', onclick: () => selected >= 0 && save.characters[selected] && handlers.onPlay(selected) }, 'Enter World');
  const delBtn = h('button', {
    class: 'btn danger', onclick: () => {
      const c = save.characters[selected];
      if (c) handlers.onDelete(selected, c.name);
    },
  }, 'Delete');
  const render = () => {
    setChildren(slotsEl, save.characters.slice(0, save.account.maxSlots).map((c, i) => {
      if (!c) {
        return h('div', { class: `slot empty${i === selected ? ' selected' : ''}`, dataset: { slot: String(i) }, onclick: () => handlers.onCreate(i) },
          h('div', { style: 'font-size:42px' }, '+'), 'Create Character');
      }
      const prev = new SpritePreview(144, 192);
      prev.setLook(lookForCharacter(data, c));
      prev.anim = i === selected ? 'walk' : 'idle';
      const cls = data.classes.get(c.classId)!;
      const map = data.maps.get(c.position.mapId)?.name ?? c.position.mapId;
      return h('div', {
        class: `slot${i === selected ? ' selected' : ''}`, dataset: { slot: String(i) },
        onclick: () => { selected = i; audio.play('ui_click'); render(); },
        ondblclick: () => handlers.onPlay(i),
      },
        prev.canvas,
        h('div', { class: 'name' }, c.name),
        h('div', {}, `${cls.name} · Lv.${c.baseLevel} / Job ${c.jobLevel}`),
        h('div', { class: 'muted' }, map),
        h('div', { class: 'muted', style: 'font-size:11px' }, `${c.luma} Luma · ${Math.floor(c.stats_meta.playTimeMs / 60000)} min played`),
      );
    }));
    playBtn.disabled = !(selected >= 0 && save.characters[selected]);
    delBtn.disabled = playBtn.disabled;
  };
  render();
  return h('div', { class: 'screen' },
    h('div', { class: 'panel select-wrap' },
      h('h2', {}, 'Select Character'),
      slotsEl,
      h('div', { class: 'row', style: 'margin-top:18px' },
        h('button', { class: 'btn', onclick: handlers.onBack }, 'Back'),
        h('div', { class: 'spacer' }),
        delBtn, playBtn),
    ),
  );
}

export function characterCreateScreen(onCreate: (name: string, ap: Appearance) => string | null, onBack: () => void): HTMLElement {
  const ap: Appearance = { body: 'a', hairStyle: 'short', hairColor: HAIR_COLORS[2], eyeColor: EYE_COLORS[0], skinTone: SKIN_TONES[1] };
  const preview = new SpritePreview(192, 256);
  const outfit = { primary: '#c8a26b', secondary: '#7a5634', accent: '#e8dcc0', style: 'tunic' };
  const refresh = () => preview.setLook({ appearance: ap, outfit, weapon: 'dagger' });
  refresh();
  const dirs: Direction[] = ['down', 'left', 'up', 'right'];
  let dirIdx = 0;
  const rotate = (d: number) => { dirIdx = (dirIdx + d + 4) % 4; preview.dir = dirs[dirIdx]; };
  const nameIn = h('input', { class: 'text-input', id: 'char-name', maxlength: 16, placeholder: 'Enter a name (2–16 characters)' });
  const err = h('div', { class: 'error-text' });

  const choiceGroup = <T extends string>(label: string, values: T[], get: () => T, set: (v: T) => void, names?: Record<string, string>) => {
    const wrap = h('div', { class: 'swatches' });
    const draw = () => setChildren(wrap, values.map((v) => h('span', {
      class: `choice${get() === v ? ' on' : ''}`, onclick: () => { set(v); refresh(); draw(); audio.play('ui_click'); },
    }, names?.[v] ?? v)));
    draw();
    return h('div', { class: 'opt-group' }, h('label', {}, label), wrap);
  };
  const swatchGroup = (label: string, values: string[], get: () => string, set: (v: string) => void) => {
    const wrap = h('div', { class: 'swatches' });
    const draw = () => setChildren(wrap, values.map((v) => h('span', {
      class: `swatch${get() === v ? ' on' : ''}`, style: { background: v }, onclick: () => { set(v); refresh(); draw(); audio.play('ui_click'); },
    })));
    draw();
    return h('div', { class: 'opt-group' }, h('label', {}, label), wrap);
  };
  const animBtns = h('div', { class: 'row' },
    ...(['idle', 'walk', 'attack', 'cast'] as CharAnim[]).map((a) => h('button', { class: 'btn small', onclick: () => { preview.anim = a; } }, a)));

  return h('div', { class: 'screen' },
    h('div', { class: 'panel create-wrap' },
      h('div', { class: 'create-preview' },
        h('h2', { style: 'margin:0' }, 'New Adventurer'),
        preview.canvas,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => rotate(-1) }, '◀ Rotate'),
          h('button', { class: 'btn small', onclick: () => rotate(1) }, 'Rotate ▶')),
        animBtns,
        h('div', { class: 'muted', style: 'font-size:11px;text-align:center' }, 'Every adventurer begins as a Novice in Willowbrook Village.'),
      ),
      h('div', {},
        h('div', { class: 'opt-group' }, h('label', {}, 'Name'), nameIn, err),
        choiceGroup('Body Type', ['a', 'b'] as Appearance['body'][], () => ap.body, (v) => { ap.body = v; }, { a: 'Type A (broad)', b: 'Type B (slim)' }),
        choiceGroup('Hair Style', HAIR_STYLES, () => ap.hairStyle, (v) => { ap.hairStyle = v; }),
        swatchGroup('Hair Color', HAIR_COLORS, () => ap.hairColor, (v) => { ap.hairColor = v; }),
        swatchGroup('Eye Color', EYE_COLORS, () => ap.eyeColor, (v) => { ap.eyeColor = v; }),
        swatchGroup('Skin Tone', SKIN_TONES, () => ap.skinTone, (v) => { ap.skinTone = v; }),
        h('div', { class: 'row', style: 'margin-top:16px' },
          h('button', { class: 'btn', onclick: onBack }, 'Cancel'),
          h('div', { class: 'spacer' }),
          h('button', {
            class: 'btn primary', id: 'btn-create', onclick: () => {
              const e = validateName(nameIn.value);
              if (e) { err.textContent = e; audio.play('error'); return; }
              const r = onCreate(nameIn.value.trim(), { ...ap });
              if (r) { err.textContent = r; audio.play('error'); }
            },
          }, 'Create Character')),
      ),
    ),
  );
}
