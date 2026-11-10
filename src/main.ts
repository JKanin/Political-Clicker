import '@fontsource/pt-serif/700.css';
import './style.css';
import { createGame } from './game/config';

const fontReady = Promise.race([
  document.fonts.load('700 24px "PT Serif"', 'Гос.власть АБВГД 0123456789'),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]).catch(() => undefined);

void fontReady.then(() => createGame('game'));
