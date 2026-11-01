// Sprite sheets and icons drawn in the Studio replace the procedural ones. Images are decoded
// before the game starts, so the (synchronous) sheet generators can use them directly.
//   sprites/monster/<id>  monster sheet (also pets and homunculi that use the monster)
//   sprites/npc/<id>      NPC character sheet
//   sprites/class/<id>    player character sheet for a job class
//   icons/item/<id>       32×32 item icon
//   icons/skill/<id>      32×32 skill icon
//   ui/menu               HUD menu icons, one sheet (UI_MENU_COLS × 2 cells of UI_CELL px)

type Img = CanvasImageSource & { width: number; height: number };
const sheets = new Map<string, Img>();

export const SPRITE_PREFIXES = ['sprites/', 'icons/', 'ui/'];
export const isSpritePath = (p: string) => SPRITE_PREFIXES.some((x) => p.startsWith(x));

export const UI_CELL = 48;
export const UI_MENU_COLS = 8;
/** HUD menu buttons in sheet order: [window id, emoji used when there is no sheet, label]. */
export const UI_MENU: [string, string, string][] = [
  ['status', '📊', 'Status'], ['inventory', '🎒', 'Items'], ['equipment', '🛡️', 'Equip'], ['skills', '✨', 'Skills'], ['quests', '📜', 'Quests'], ['worldMap', '🗺️', 'Map'], ['social', '👥', 'Social'], ['settings', '⚙️', 'Menu'],
  ['pet', '🐾', 'Pet'], ['homun', '🧪', 'Homun'], ['cart', '🛒', 'Cart'], ['runes', '⭐', 'Runes'], ['database', '📖', 'DB'], ['achievements', '🏆', 'Titles'], ['daily', '🎁', 'Daily'], ['admin', '👑', 'GM'],
];

export function setSpriteOverride(path: string, img: Img | null) {
  if (img) sheets.set(path, img); else sheets.delete(path);
}
export const spriteOverride = (path: string): Img | null => sheets.get(path) ?? null;

/** The override drawn into a w×h canvas (scaled if the drawn sheet has another size), or null. */
export function overrideCanvas(path: string, w: number, h: number): HTMLCanvasElement | null {
  const img = sheets.get(path);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** One cell of the UI menu sheet as a data URL, or null when the sheet was not drawn. */
export function uiMenuIcon(id: string): string | null {
  const img = sheets.get('ui/menu');
  const i = UI_MENU.findIndex(([w]) => w === id);
  if (!img || i < 0) return null;
  const c = document.createElement('canvas');
  c.width = c.height = UI_CELL;
  const sx = img.width / UI_MENU_COLS, sy = img.height / 2;
  c.getContext('2d')!.drawImage(img, (i % UI_MENU_COLS) * sx, Math.floor(i / UI_MENU_COLS) * sy, sx, sy, 0, 0, UI_CELL, UI_CELL);
  return c.toDataURL();
}

/** Decodes an image (blob or URL) for use as an override. */
export async function decodeSprite(src: Blob | string): Promise<Img | null> {
  try {
    if (typeof src !== 'string') return await createImageBitmap(src);
    return await new Promise<Img | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  } catch { return null; }
}

/** Window frame drawn in the Studio (`ui/window`, e.g. a PixelLab UI panel): a 9-slice border image
 * for every game window. Returns false when there is none. */
export function applyWindowSkin(doc: Document = document): boolean {
  const img = sheets.get('ui/window');
  doc.getElementById('ui-window-skin')?.remove();
  if (!img) return false;
  const c = doc.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const slice = Math.max(8, Math.round(Math.min(img.width, img.height) / 7));
  const style = doc.createElement('style');
  style.id = 'ui-window-skin';
  style.textContent = `.win { border: ${Math.round(slice / 2)}px solid transparent !important; border-image: url(${c.toDataURL()}) ${slice} fill / ${Math.round(slice / 2)}px stretch; background: none !important; box-shadow: 0 6px 24px rgba(0,0,0,.6); }
.win .wtitle { background: rgba(20, 12, 8, .35) !important; border-bottom: none !important; }`;
  doc.head.appendChild(style);
  return true;
}
