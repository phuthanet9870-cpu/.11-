// Entry point: boots the Phaser game and the HTML UI shell.
import './ui/style.css';
import { validateGameData, loadGameData } from './core/data';
import { App } from './ui/app';

const problems = validateGameData(loadGameData());
if (problems.length) console.error('[data] validation problems:', problems);

const app = new App();
window.addEventListener('error', (e) => console.error('[veyloria] uncaught', e.error ?? e.message));
try {
  app.start();
} catch (err) {
  console.error(err);
  app.showFatal(String(err));
}
