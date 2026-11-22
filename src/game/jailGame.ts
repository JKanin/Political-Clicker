import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig';
import { Sfx } from './audio';
import { COLORS, FONT, FONT_HEAD, TEXT } from './theme';
import { formatNumber } from './upgrades';

const HEADS = ['🙂', '😎', '🤓', '😠', '🧐'];
const ITEMS = ['📢', '🚩', '📷', '🎒', '📰'];

const DEPTH = 70;
const BETWEEN_MS = 1000;
const MAX_STEP_MS = 100;
const TURN_MIN_MS = 900;
const TURN_MAX_MS = 2400;

const RESULT_PHRASES = [
  'Оппозиционер растворился в толпе…',
  'Одного посадили, остальные ушли.',
  'Хорошая работа, следователь.',
  'Идеальная облава! Все дела закрыты.',
];

type Phase = 'play' | 'between' | 'result';

interface Figure {
  box: Phaser.GameObjects.Container;
  token: Phaser.GameObjects.Arc;
  face: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  isTarget: boolean;
  checked: boolean;
  speed: number;
  angle: number;
  turnIn: number;
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',');
}

export class JailGame {
  private readonly root: Phaser.GameObjects.Container;
  private readonly arena: { x: number; y: number; w: number; h: number };
  private readonly portrait: boolean;
  private readonly tokenR: number;
  private readonly timerW: number;
  private readonly timerFill: Phaser.GameObjects.Rectangle;
  private readonly infoText: Phaser.GameObjects.Text;

  private figures: Figure[] = [];
  private extras: Phaser.GameObjects.GameObject[] = [];
  private wantedToken: Phaser.GameObjects.Container | null = null;

  private phase: Phase = 'play';
  private round = 0;
  private caught = 0;
  private roundMs = 0;
  private timeLeft = 0;
  private betweenLeft = 0;
  private reward = 0;
  private lowTime = false;
  private done = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sfx: Sfx,
    private readonly baseReward: number,
    private readonly onFinish: (reward: number) => void,
  ) {
    const { width, height } = scene.scale;
    this.portrait = width < height;
    const panelW = Math.min(width - 16, 600);
    const panelH = Math.min(height - 24, this.portrait ? 640 : 560);
    const left = (width - panelW) / 2;
    const top = (height - panelH) / 2;
    this.arena = { x: left + 16, y: top + 156, w: panelW - 32, h: panelH - 156 - 16 };
    this.tokenR = this.portrait ? 24 : 26;
    this.timerW = panelW - 40;

    const dim = scene.add.rectangle(0, 0, width, height, COLORS.overlay, 0.88).setOrigin(0, 0).setInteractive();
    const panel = scene.add
      .rectangle(left, top, panelW, panelH, COLORS.window, 0.99)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLORS.windowEdge);
    const arenaBg = scene.add
      .rectangle(this.arena.x, this.arena.y, this.arena.w, this.arena.h, COLORS.panel)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLORS.panelEdge);
    const title = scene.add
      .text(width / 2, top + 26, 'ПОСАДИТЬ ВИДНОГО ОППОЗИЦИОНЕРА', {
        fontFamily: FONT_HEAD,
        fontSize: this.portrait ? '17px' : '21px',
        color: TEXT.white,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.infoText = scene.add
      .text(width / 2, top + 52, '', { fontFamily: FONT, fontSize: this.portrait ? '12px' : '14px', color: TEXT.muted })
      .setOrigin(0.5);

    const cardW = Math.min(310, panelW - 40);
    const cardY = top + 92;
    const card = scene.add.rectangle(width / 2, cardY, cardW, 56, COLORS.paper).setStrokeStyle(2, COLORS.paperEdge);
    const cardLabel = scene.add
      .text(width / 2 - cardW / 2 + 14, cardY - 9, 'ОРИЕНТИРОВКА', {
        fontFamily: FONT_HEAD,
        fontSize: '14px',
        color: '#2a2118',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const cardHint = scene.add
      .text(width / 2 - cardW / 2 + 14, cardY + 10, 'совпасть должны\nи лицо, и предмет', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#5b4a2e',
        lineSpacing: 0,
      })
      .setOrigin(0, 0.5);

    const timerY = top + 138;
    const timerTrack = scene.add
      .rectangle(width / 2 - this.timerW / 2, timerY, this.timerW, 10, 0x000000, 0.55)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, COLORS.brassDark);
    this.timerFill = scene.add
      .rectangle(width / 2 - this.timerW / 2, timerY, this.timerW, 6, COLORS.gold)
      .setOrigin(0, 0.5);

    this.root = scene.add
      .container(0, 0, [dim, panel, arenaBg, title, this.infoText, card, cardLabel, cardHint, timerTrack, this.timerFill])
      .setDepth(DEPTH)
      .setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 200 });

    this.sfx.buffAppear();
    this.startRound();
  }

  update(delta: number): void {
    if (this.done) return;
    const dt = Math.min(delta, MAX_STEP_MS);

    if (this.phase === 'play') {
      this.moveFigures(dt);
      this.timeLeft -= dt;
      this.updateTimer();
      if (this.timeLeft <= 0) this.endRound(false);
    } else if (this.phase === 'between') {
      this.betweenLeft -= dt;
      if (this.betweenLeft <= 0) this.nextRound();
    }
  }

  destroy(): void {
    const tweens = this.scene.tweens;
    for (const figure of this.figures) {
      tweens.killTweensOf(figure.box);
      figure.box.destroy();
    }
    this.figures = [];
    for (const item of this.extras) {
      tweens.killTweensOf(item);
      item.destroy();
    }
    this.extras = [];
    tweens.killTweensOf(this.root);
    this.root.destroy();
  }

  private startRound(): void {
    const cfg = GAME_CONFIG.jailRounds[this.round];
    this.roundMs = cfg.seconds * 1000;
    this.timeLeft = this.roundMs;
    this.lowTime = false;
    this.timerFill.setFillStyle(COLORS.gold);

    const head = Phaser.Utils.Array.GetRandom(HEADS);
    const item = Phaser.Utils.Array.GetRandom(ITEMS);
    this.showWanted(head, item);
    this.spawnFigures(cfg.figures, cfg.speed, head, item);
    this.updateInfo();
    this.updateTimer();
    this.phase = 'play';
  }

  private endRound(success: boolean): void {
    this.phase = 'between';
    this.betweenLeft = BETWEEN_MS;
    const target = this.figures.find((f) => f.isTarget);

    for (const figure of this.figures) {
      figure.hit.disableInteractive();
      if (!figure.isTarget) figure.box.setAlpha(0.3);
    }

    if (success) {
      this.caught += 1;
      this.sfx.buffCollect();
      if (target) {
        target.face.setText('🔒');
        target.token.setFillStyle(COLORS.sealRed);
      }
      this.showBanner('✔ ЗАДЕРЖАН!', TEXT.ok);
    } else {
      this.sfx.deny();
      if (target) {

        target.token.setStrokeStyle(5, COLORS.gold);
        this.scene.tweens.add({ targets: target.box, scale: 1.25, duration: 250, yoyo: true, repeat: 2 });
      }
      this.showBanner('✖ СКРЫЛСЯ!', TEXT.danger);
    }
    this.updateInfo();
  }

  private nextRound(): void {
    this.clearRound();
    this.round += 1;
    if (this.round >= GAME_CONFIG.jailRounds.length) this.showResult();
    else this.startRound();
  }

  private clearRound(): void {
    for (const figure of this.figures) {
      this.scene.tweens.killTweensOf(figure.box);
      figure.box.destroy();
    }
    this.figures = [];
    for (const item of this.extras) {
      this.scene.tweens.killTweensOf(item);
      item.destroy();
    }
    this.extras = [];
  }

  private other(pool: string[], exclude: string): string {
    return Phaser.Utils.Array.GetRandom(pool.filter((p) => p !== exclude));
  }

  private spawnFigures(count: number, speed: number, targetHead: string, targetItem: string): void {
    const specs = [{ head: targetHead, item: targetItem, isTarget: true }];
    for (let i = 1; i < count; i++) {
      if (i % 3 === 0) specs.push({ head: targetHead, item: this.other(ITEMS, targetItem), isTarget: false });
      else if (i % 3 === 1) specs.push({ head: this.other(HEADS, targetHead), item: targetItem, isTarget: false });
      else {
        specs.push({
          head: this.other(HEADS, targetHead),
          item: Phaser.Utils.Array.GetRandom(ITEMS),
          isTarget: false,
        });
      }
    }
    Phaser.Utils.Array.Shuffle(specs);

    const a = this.arena;
    const r = this.tokenR;
    for (const spec of specs) {
      const x = Phaser.Math.Between(a.x + r, a.x + a.w - r);
      const y = Phaser.Math.Between(a.y + r, a.y + a.h - r);
      const parts = this.makeToken(x, y, r, spec.head, spec.item);
      const figure: Figure = {
        ...parts,
        isTarget: spec.isTarget,
        checked: false,
        speed: speed * Phaser.Math.FloatBetween(0.8, 1.2),
        angle: Phaser.Math.FloatBetween(0, Math.PI * 2),
        turnIn: Phaser.Math.Between(TURN_MIN_MS, TURN_MAX_MS),
      };
      figure.box.setDepth(DEPTH + 1).setScale(0);
      figure.hit.setInteractive({ useHandCursor: true });
      figure.hit.on('pointerdown', () => this.pick(figure));
      this.scene.tweens.add({
        targets: figure.box,
        scale: 1,
        duration: 220,
        delay: Phaser.Math.Between(0, 150),
        ease: 'Back.Out',
      });
      this.figures.push(figure);
    }
  }

  private makeToken(x: number, y: number, r: number, head: string, item: string) {
    const token = this.scene.add.circle(0, 0, r, COLORS.row).setStrokeStyle(3, COLORS.rowEdge);
    const face = this.scene.add
      .text(0, -1, head, { fontFamily: FONT, fontSize: `${Math.round(r * 1.15)}px` })
      .setOrigin(0.5);
    const tool = this.scene.add
      .text(r * 0.62, r * 0.66, item, { fontFamily: FONT, fontSize: `${Math.round(r * 0.8)}px` })
      .setOrigin(0.5);
    const hit = this.scene.add.rectangle(0, 0, r * 2, r * 2, 0xffffff, 0.01);
    const box = this.scene.add.container(x, y, [token, face, tool, hit]);
    return { box, token, face, hit };
  }

  private showWanted(head: string, item: string): void {
    this.wantedToken?.destroy();
    const { width } = this.scene.scale;
    const cardW = Math.min(310, this.arena.w - 8);
    const y = this.arena.y - 64;
    const parts = this.makeToken(width / 2 + cardW / 2 - 44, y, 22, head, item);
    this.wantedToken = parts.box;
    this.root.add(parts.box);
  }

  private moveFigures(dt: number): void {
    const a = this.arena;
    const r = this.tokenR;
    for (const f of this.figures) {
      f.turnIn -= dt;
      if (f.turnIn <= 0) {
        f.angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        f.turnIn = Phaser.Math.Between(TURN_MIN_MS, TURN_MAX_MS);
      }
      let vx = Math.cos(f.angle) * f.speed;
      let vy = Math.sin(f.angle) * f.speed;
      let x = f.box.x + (vx * dt) / 1000;
      let y = f.box.y + (vy * dt) / 1000;
      if (x < a.x + r || x > a.x + a.w - r) {
        x = Phaser.Math.Clamp(x, a.x + r, a.x + a.w - r);
        vx = -vx;
      }
      if (y < a.y + r || y > a.y + a.h - r) {
        y = Phaser.Math.Clamp(y, a.y + r, a.y + a.h - r);
        vy = -vy;
      }
      f.angle = Math.atan2(vy, vx);
      f.box.setPosition(x, y);
    }
  }

  private pick(figure: Figure): void {
    if (this.phase !== 'play' || figure.checked) return;
    figure.checked = true;

    if (figure.isTarget) {
      this.endRound(true);
      return;
    }

    this.sfx.deny();
    this.timeLeft = Math.max(0, this.timeLeft - GAME_CONFIG.jailWrongPenalty);
    figure.hit.disableInteractive();
    figure.box.setAlpha(0.35);
    this.floatText(figure.box.x, figure.box.y - this.tokenR, `−${seconds(GAME_CONFIG.jailWrongPenalty)} с`, TEXT.danger);
    this.scene.cameras.main.shake(60, 0.002);
    this.updateTimer();
  }

  private updateInfo(): void {
    const total = GAME_CONFIG.jailRounds.length;
    const round = Math.min(this.round + 1, total);
    this.infoText.setText(
      `Дело ${round} из ${total}  •  Задержано: ${this.caught}  •  Ошибка: −${seconds(GAME_CONFIG.jailWrongPenalty)} с`,
    );
  }

  private updateTimer(): void {
    const ratio = Phaser.Math.Clamp(this.timeLeft / this.roundMs, 0, 1);
    this.timerFill.setScale(ratio, 1);
    const low = ratio < 0.3;
    if (low !== this.lowTime) {
      this.lowTime = low;
      this.timerFill.setFillStyle(low ? COLORS.danger : COLORS.gold);
    }
  }

  private floatText(x: number, y: number, message: string, color: string): void {
    const text = this.scene.add
      .text(x, y, message, { fontFamily: FONT, fontSize: '18px', color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(DEPTH + 3);
    this.scene.tweens.add({ targets: text, y: y - 40, alpha: 0, duration: 800, onComplete: () => text.destroy() });
  }

  private showBanner(message: string, color: string): void {
    const a = this.arena;
    const banner = this.scene.add
      .text(a.x + a.w / 2, a.y + a.h / 2, message, {
        fontFamily: FONT_HEAD,
        fontSize: this.portrait ? '34px' : '46px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 3)
      .setScale(0.6);
    this.scene.tweens.add({ targets: banner, scale: 1, duration: 200, ease: 'Back.Out' });
    this.extras.push(banner);
  }

  private showResult(): void {
    this.phase = 'result';
    const multipliers = GAME_CONFIG.jailRewardMultipliers;
    const multiplier = multipliers[Math.min(this.caught, multipliers.length - 1)] ?? 0;
    this.reward = Math.round(this.baseReward * multiplier);

    const total = GAME_CONFIG.jailRounds.length;
    const a = this.arena;
    const cx = a.x + a.w / 2;
    this.timerFill.setVisible(false);
    this.wantedToken?.setVisible(false);

    if (this.caught >= total) this.sfx.success();
    else if (this.caught > 0) this.sfx.buffCollect();
    else this.sfx.deny();

    const cover = this.scene.add.rectangle(a.x, a.y, a.w, a.h, COLORS.panel).setOrigin(0, 0).setStrokeStyle(3, COLORS.panelEdge);
    const heading = this.scene.add
      .text(cx, a.y + 46, 'ДЕЛО ЗАКРЫТО', { fontFamily: FONT_HEAD, fontSize: '32px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5);
    const score = this.scene.add
      .text(cx, a.y + 96, `Задержано: ${this.caught} из ${total}`, { fontFamily: FONT, fontSize: '22px', color: TEXT.cream })
      .setOrigin(0.5);
    const phrase = this.scene.add
      .text(cx, a.y + 132, RESULT_PHRASES[Math.min(this.caught, RESULT_PHRASES.length - 1)], {
        fontFamily: FONT,
        fontSize: '15px',
        color: TEXT.muted,
        align: 'center',
        wordWrap: { width: a.w - 40 },
      })
      .setOrigin(0.5);
    const rewardLabel = this.scene.add
      .text(cx, a.y + 184, 'НАГРАДА', { fontFamily: FONT, fontSize: '13px', color: '#c9b48a' })
      .setOrigin(0.5);
    const rewardText = this.scene.add
      .text(cx, a.y + 224, `+${formatNumber(this.reward)} Гос.власти`, {
        fontFamily: FONT_HEAD,
        fontSize: this.portrait ? '30px' : '38px',
        color: TEXT.gold,
        fontStyle: 'bold',
        stroke: '#2b1608',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    const button = this.scene.add
      .rectangle(cx, a.y + a.h - 50, 260, 54, COLORS.primary)
      .setStrokeStyle(3, COLORS.white)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(cx, a.y + a.h - 50, 'Принять награду', { fontFamily: FONT, fontSize: '21px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5);
    button.on('pointerover', () => button.setFillStyle(COLORS.primaryHover));
    button.on('pointerout', () => button.setFillStyle(COLORS.primary));
    button.on('pointerdown', () => this.finish());

    this.root.add([cover, heading, score, phrase, rewardLabel, rewardText, button, label]);
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    const reward = this.reward;
    this.destroy();
    this.onFinish(reward);
  }
}
