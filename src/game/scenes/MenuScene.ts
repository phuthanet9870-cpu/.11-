// Animated Willowbrook backdrop behind the title & character screens.
import Phaser from 'phaser';
import { loadGameData } from '../../core/data';
import { compileMap, TILE } from '../../core/mapCompiler';
import { ensureFxTextures, ensureMapTextures } from '../assets';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const data = loadGameData();
    const map = compileMap(data, data.maps.get('willowbrook')!);
    ensureFxTextures(this);
    const tex = ensureMapTextures(this, data, map);
    this.add.image(0, 0, tex.ground).setOrigin(0);
    this.add.image(0, 0, tex.walls).setOrigin(0);
    for (const o of map.objects) {
      const by = (o.y + o.h) * TILE;
      this.add.image((o.x + o.w / 2) * TILE, by + 2, tex.objects.get(o.uid)!).setOrigin(0.5, 1).setDepth(by);
    }
    map.buildings.forEach((b, i) => this.add.image(b.x * TILE - 4, (b.y + b.h) * TILE + 4, tex.buildings[i]).setOrigin(0, 1).setDepth((b.y + b.h) * TILE));
    this.add.particles(0, 0, 'fx_spark', {
      x: { min: 0, max: map.width * TILE }, y: { min: 0, max: map.height * TILE }, lifespan: 4000, speed: { min: 4, max: 16 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0xffe9a8, 0x9ad8ff], blendMode: Phaser.BlendModes.ADD, frequency: 60,
    }).setDepth(1e5);
    const cam = this.cameras.main;
    cam.setZoom(1.25);
    cam.setBounds(0, 0, map.width * TILE, map.height * TILE);
    cam.centerOn(24 * TILE, 18 * TILE);
    this.tweens.add({ targets: cam, scrollX: cam.scrollX + 260, scrollY: cam.scrollY - 60, duration: 40000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}
