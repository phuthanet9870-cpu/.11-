// Loads the asset manifest and any file-based art replacements, then hands
// over to the menu background scene.
import Phaser from 'phaser';
import { queueFileAssets, setManifest, type AssetManifest } from '../assets';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.json('manifest', 'assets/asset-manifest.json');
    this.load.on('progress', (p: number) => window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: p * 0.5 })));
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.warn('[assets] failed to load', file.key, '- using placeholder'));
  }

  create() {
    const manifest = this.cache.json.get('manifest') as AssetManifest | undefined;
    if (manifest) setManifest(manifest);
    queueFileAssets(this);
    this.load.on('progress', (p: number) => window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: 0.5 + p * 0.5 })));
    this.load.once('complete', () => {
      window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: 1 }));
      this.scene.start('Menu');
    });
    this.load.start();
  }
}
