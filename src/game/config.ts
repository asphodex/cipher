import Phaser from 'phaser';
import { GameScene } from './GameScene';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    // Вертикальный «лист бумаги»: удобно и на телефоне, и на мониторе.
    width: 720,
    height: 1060,
    backgroundColor: '#3b3128',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}
