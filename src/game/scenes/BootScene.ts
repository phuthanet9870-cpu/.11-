// Nothing to load from disk: all art is drawn procedurally. Hands over to the menu.
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: 1 }));
    this.scene.start('Menu');
  }
}
