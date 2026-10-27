// Loads the asset manifest, file-based art replacements and the production
// art batches (manifest → metadata → images), then hands over to the menu.
import Phaser from 'phaser';
import { queueFileAssets, setManifest, type AssetManifest } from '../assets';
import { queueBatchImages, queueBatchManifest, queueBatchMetadata } from '../batchArt';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.json('manifest', 'assets/asset-manifest.json');
    queueBatchManifest(this);
    this.load.on('progress', (p: number) => window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: p * 0.2 })));
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.warn('[assets] failed to load', file.key, '- using placeholder'));
  }

  create() {
    const manifest = this.cache.json.get('manifest') as AssetManifest | undefined;
    if (manifest) setManifest(manifest);
    const stage = (from: number, to: number, queue: () => void, next: () => void) => {
      this.load.off('progress');
      this.load.on('progress', (p: number) => window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: from + p * (to - from) })));
      queue();
      this.load.once('complete', next);
      this.load.start();
    };
    const done = () => {
      window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: 1 }));
      this.scene.start('Menu');
    };
    stage(0.2, 0.3, () => { queueFileAssets(this); queueBatchMetadata(this); }, () => stage(0.3, 1, () => queueBatchImages(this), done));
  }
}
