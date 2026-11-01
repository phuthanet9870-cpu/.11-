// Entry point. Opens a launcher (Game or Studio); `#game` / `#studio` in the URL skip it.
import './ui/style.css';
import './studio/studio.css';
import { validateGameData, loadGameData } from './core/data';
import { applyBrowserLayer } from './studio/layer';
import { STUDIO_SPRITES } from './data/studio';
import { applyWindowSkin, decodeSprite, setSpriteOverride } from './game/art/spriteOverrides';
import { artUrl } from './game/art/themeArt';

async function startGame() {
  document.title = 'Veyloria Online';
  const data = loadGameData();
  // Sprite sheets committed from the Studio (public/art) are decoded before anything is drawn.
  await Promise.all(STUDIO_SPRITES.map(async (p) => setSpriteOverride(p, await decodeSprite(artUrl(p)))));
  // Edits saved in the Studio (this browser) are laid over the shipped data first.
  const layer = await applyBrowserLayer(data);
  if (layer.skipped.length) console.warn('[studio] edits skipped:', layer.skipped);
  const problems = validateGameData(data);
  if (problems.length) console.error('[data] validation problems:', problems);
  applyWindowSkin();
  const { App } = await import('./ui/app');
  const app = new App();
  window.addEventListener('error', (e) => console.error('[veyloria] uncaught', e.error ?? e.message));
  try {
    app.start();
  } catch (err) {
    console.error(err);
    app.showFatal(String(err));
  }
}

async function startStudio() {
  document.title = 'Veyloria Studio';
  document.getElementById('stage')!.style.display = 'none';
  const { mountStudio } = await import('./studio/studio');
  await mountStudio(document.body);
}

function launcher() {
  const el = document.createElement('div');
  el.className = 'launcher';
  el.id = 'launcher';
  el.innerHTML = `<h1>VEYLORIA ONLINE</h1>
    <div class="choices">
      <button id="launch-game"><b>▶ เข้าเกม</b><span>Play the game</span></button>
      <button id="launch-studio"><b>🛠 เข้า Studio</b><span>แก้แมพ วัตถุ tileset และภาพ</span></button>
    </div>`;
  document.body.appendChild(el);
  const go = (mode: 'game' | 'studio') => {
    history.replaceState(null, '', `#${mode}`);
    el.remove();
    void (mode === 'game' ? startGame() : startStudio());
  };
  el.querySelector('#launch-game')!.addEventListener('click', () => go('game'));
  el.querySelector('#launch-studio')!.addEventListener('click', () => go('studio'));
}

const mode = location.hash.replace('#', '');
if (mode === 'game') void startGame();
else if (mode === 'studio') void startStudio();
else launcher();
