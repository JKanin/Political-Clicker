import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { TEXT } from './theme';

const LANDSCAPE_SIZE = { width: 1280, height: 640 };
const PORTRAIT_WIDTH = 480;
const PORTRAIT_MIN_HEIGHT = 720;
const PORTRAIT_MAX_HEIGHT = 1100;

/** Размер игрового поля: широкий для ПК и вертикальный (под форму экрана) для телефонов. */
function pickGameSize(): { width: number; height: number } {
  if (window.innerWidth >= window.innerHeight) return LANDSCAPE_SIZE;
  const height = Math.round((PORTRAIT_WIDTH * window.innerHeight) / window.innerWidth);
  return { width: PORTRAIT_WIDTH, height: Phaser.Math.Clamp(height, PORTRAIT_MIN_HEIGHT, PORTRAIT_MAX_HEIGHT) };
}

export function createGame(parent: string): Phaser.Game {
  const size = pickGameSize();
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: size.width,
    height: size.height,
    backgroundColor: TEXT.bg,
    scene: [GameScene],
    input: { activePointers: 3 },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  const game = new Phaser.Game(config);

  // Поворот телефона: перестраиваем интерфейс только при смене ориентации.
  let portrait = size.width < size.height;
  window.addEventListener('resize', () => {
    const next = pickGameSize();
    const nextPortrait = next.width < next.height;
    if (nextPortrait === portrait) return;
    portrait = nextPortrait;
    game.scale.setGameSize(next.width, next.height);
    game.events.emit('relayout');
  });

  return game;
}
