// Animated Willowbrook backdrop behind the title & character screens.
import Phaser from 'phaser';
import { loadGameData } from '../../core/data';
import { compileMap, TILE } from '../../core/mapCompiler';
import { CHUNK_TILES, ensureFxTextures, ensureMapChunk, ensureMapTextures } from '../assets';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const data = loadGameData();
    const map = compileMap(data, data.maps.get('willowbrook')!);
    ensureFxTextures(this);
    const tex = ensureMapTextures(this, data, map);
    // The village centre (spawn point); only the chunks around it are painted.
    const home = map.def.spawnPoints.default, hx = home.x * TILE, hy = home.y * TILE, span = CHUNK_TILES * TILE;
    for (let cy = Math.max(0, Math.floor((hy - 700) / span)); cy <= Math.min(Math.ceil(map.height / CHUNK_TILES) - 1, Math.floor((hy + 700) / span)); cy++)
      for (let cx = Math.max(0, Math.floor((hx - 900) / span)); cx <= Math.min(Math.ceil(map.width / CHUNK_TILES) - 1, Math.floor((hx + 1200) / span)); cx++) {
        const k = ensureMapChunk(this, data, map, cx, cy);
        this.add.image(cx * span, cy * span, k.ground).setOrigin(0);
        if (k.walls) this.add.image(cx * span, cy * span, k.walls).setOrigin(0);
      }
    for (const o of map.objects) {
      const by = (o.y + o.h) * TILE;
      this.add.image((o.x + o.w / 2) * TILE, by + 2, tex.objects.get(o.uid)!).setOrigin(0.5, 1).setDepth(by);
    }
    map.buildings.forEach((b, i) => this.add.image(b.x * TILE - 4, (b.y + b.h) * TILE + 4, tex.buildings[i]).setOrigin(0, 1).setDepth((b.y + b.h) * TILE));
    // Sparkles only with visual effects on (Settings).
    const fx = (window as unknown as { __veyloria?: { settings: { effects?: boolean } } }).__veyloria?.settings.effects === true;
    if (fx) this.add.particles(0, 0, 'fx_spark', {
      x: { min: 0, max: map.width * TILE }, y: { min: 0, max: map.height * TILE }, lifespan: 4000, speed: { min: 4, max: 16 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0xffe9a8, 0x9ad8ff], blendMode: Phaser.BlendModes.ADD, frequency: 60,
    }).setDepth(1e5);
    const cam = this.cameras.main;
    cam.setZoom(1.25);
    cam.setBounds(0, 0, map.width * TILE, map.height * TILE);
    cam.centerOn(hx, hy - 3 * TILE);
    this.tweens.add({ targets: cam, scrollX: cam.scrollX + 260, scrollY: cam.scrollY - 60, duration: 40000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}
