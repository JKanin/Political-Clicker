import Phaser from 'phaser';
import { UPGRADES, UpgradeDef, UpgradeKind, formatNumber, upgradeCost } from './upgrades';
import { GAME_CONFIG } from './gameConfig';

const FONT = 'system-ui, sans-serif';

const SANCTIONS_INCOME_PCT = Math.round(GAME_CONFIG.sanctionsIncomePenalty * 100);
const SANCTIONS_PRICE_PCT = Math.round(GAME_CONFIG.sanctionsPriceMarkup * 100);

const LEFT_X = 16;
const LEFT_W = 288;
const LEFT_CX = LEFT_X + LEFT_W / 2;
const COLUMN_TOP = 135;
const LIST_TOP = COLUMN_TOP + 32;
const ROW_W = 290;
const ROW_H = 70;
const ROW_GAP = 6;
const ROW_PITCH = ROW_H + ROW_GAP;
const VISIBLE_ROWS = 6;
const LIST_H = VISIBLE_ROWS * ROW_PITCH - ROW_GAP;
const RALLY_Y = 428;
const BUFF_Y = 542;

type ClickSource = 'mouse' | 'space';

interface UpgradeRow {
  def: UpgradeDef;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  cost: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
}

interface UpgradeColumn {
  kind: UpgradeKind;
  x: number;
  rows: UpgradeRow[];
  offset: number;
  upBtn: Phaser.GameObjects.Text;
  downBtn: Phaser.GameObjects.Text;
  track: Phaser.GameObjects.Rectangle;
  thumb: Phaser.GameObjects.Rectangle;
}

export class GameScene extends Phaser.Scene {
  private power = 0;
  private owned: Record<string, number> = {};
  private elapsed = 0;
  private gameOver = false;
  private paused = false;

  private clicks = 0;
  private lastClickAt = 0;
  private lastClickSource: ClickSource | null = null;
  private hintStage = -1;

  private wave = 0;
  private rallyActive = false;
  private rallyActiveSince = 0;
  private rallyAt: number | null = null;
  private nextWarningAt = GAME_CONFIG.firstWarningAt;

  private buffAvailable = false;
  private buffEndsAt = 0;
  private nextBuffAt = GAME_CONFIG.buffFirstAt;

  private sanctions = false;

  private paper!: Phaser.GameObjects.Rectangle;
  private paperGlow!: Phaser.GameObjects.Rectangle;
  private paperGroup!: Phaser.GameObjects.Container;
  private hintText!: Phaser.GameObjects.Text;
  private hintArrow!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private sanctionsText!: Phaser.GameObjects.Text;
  private rallyCard!: Phaser.GameObjects.Container;
  private rallyGlow!: Phaser.GameObjects.Rectangle;
  private rallyBg!: Phaser.GameObjects.Rectangle;
  private rallyTitle!: Phaser.GameObjects.Text;
  private rallyInfo!: Phaser.GameObjects.Text;
  private disperseBtn!: Phaser.GameObjects.Rectangle;
  private disperseText!: Phaser.GameObjects.Text;
  private buffCard!: Phaser.GameObjects.Container;
  private buffSub!: Phaser.GameObjects.Text;
  private buffBar!: Phaser.GameObjects.Rectangle;
  private effectsWindow!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private upgradesText!: Phaser.GameObjects.Text;
  private buffsText!: Phaser.GameObjects.Text;
  private debuffsText!: Phaser.GameObjects.Text;
  private columns: UpgradeColumn[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.columns = [];
    this.elapsed = 0;
    this.gameOver = false;
    this.paused = false;
    this.tweens.resumeAll();
    this.clicks = 0;
    this.lastClickAt = 0;
    this.lastClickSource = null;
    this.hintStage = -1;
    this.wave = 0;
    this.rallyActive = false;
    this.rallyActiveSince = 0;
    this.rallyAt = null;
    this.nextWarningAt = GAME_CONFIG.firstWarningAt;
    this.buffAvailable = false;
    this.nextBuffAt = GAME_CONFIG.buffFirstAt;
    this.sanctions = false;
    this.loadProgress();

    const { width } = this.scale;

    this.add
      .text(width / 2, 16, 'КАБИНЕТ ГЛАВЫ ГОСУДАРСТВА', { fontFamily: FONT, fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5, 0);

    this.powerText = this.add
      .text(width / 2, 48, '', { fontFamily: FONT, fontSize: '34px', color: '#fde047', fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    this.statsText = this.add
      .text(width / 2, 94, '', { fontFamily: FONT, fontSize: '16px', color: '#e8eef7', align: 'center' })
      .setOrigin(0.5, 0);
    this.sanctionsText = this.add
      .text(width / 2, 116, '', { fontFamily: FONT, fontSize: '13px', color: '#fecaca', fontStyle: 'bold' })
      .setOrigin(0.5, 0);

    this.createDocument(LEFT_CX, 300);
    this.createHint();
    this.createUpgradePanel();
    this.createEventCards();
    this.createEffectsWindow();
    this.createRestartButton();
    this.createPauseOverlay();

    this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (event.repeat) return;
      this.click(LEFT_CX, 280, 'space');
    });
    this.input.keyboard?.on('keydown-E', () => this.toggleEffects());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (this.gameOver || this.paused || this.effectsWindow.visible) return;
      const column = this.columns.find(
        (c) =>
          pointer.x >= c.x - 4 &&
          pointer.x <= c.x + ROW_W + 14 &&
          pointer.y >= COLUMN_TOP &&
          pointer.y <= LIST_TOP + LIST_H,
      );
      if (column) this.scrollColumn(column, dy > 0 ? 1 : -1);
    });

    this.time.addEvent({ delay: GAME_CONFIG.autosaveInterval, loop: true, callback: () => this.saveProgress() });
    this.refresh();
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.paused) return;

    this.elapsed += delta;
    this.updateEvent();
    this.updateBuff();

    const net = this.perSecond - this.drain;
    this.power += (net * delta) / 1000;

    if (this.rallyActive && this.power <= 0) {
      this.power = 0;
      this.endGame();
      return;
    }
    this.refresh();
  }

  private get perClick(): number {
    return UPGRADES.reduce((sum, u) => (u.kind === 'click' ? sum + u.value * this.count(u.id) : sum), 1);
  }

  private get perSecond(): number {
    const base = UPGRADES.reduce((sum, u) => (u.kind === 'passive' ? sum + u.value * this.count(u.id) : sum), 0);
    return this.sanctions ? base * (1 - GAME_CONFIG.sanctionsIncomePenalty) : base;
  }

  private get totalOwned(): number {
    return Object.values(this.owned).reduce((sum, n) => sum + n, 0);
  }

  private get drain(): number {
    if (!this.rallyActive) return 0;
    const flat = GAME_CONFIG.rallyDrainFlat * Math.pow(GAME_CONFIG.rallyDrainGrowth, this.wave - 1);
    const base =
      flat + GAME_CONFIG.rallyDrainIncomeShare * this.perSecond + GAME_CONFIG.rallyDrainPowerShare * this.power;
    const seconds = Math.max(0, (this.elapsed - this.rallyActiveSince) / 1000);
    return Math.round(base * (1 + GAME_CONFIG.rallyEscalationPerSecond * seconds));
  }

  private get disperseCost(): number {
    const flat = GAME_CONFIG.disperseCostFlat * Math.pow(GAME_CONFIG.disperseCostGrowth, Math.max(0, this.wave - 1));
    return Math.ceil(flat + GAME_CONFIG.disperseCostIncomeSeconds * this.perSecond);
  }

  private costOf(def: UpgradeDef): number {
    const base = upgradeCost(def, this.count(def.id));
    return Math.ceil(this.sanctions ? base * (1 + GAME_CONFIG.sanctionsPriceMarkup) : base);
  }

  private count(id: string): number {
    return this.owned[id] ?? 0;
  }

  private buy(def: UpgradeDef): void {
    if (this.gameOver || this.paused) return;
    const cost = this.costOf(def);
    if (this.power < cost) {
      this.cameras.main.shake(80, 0.002);
      return;
    }
    this.power -= cost;
    this.owned[def.id] = this.count(def.id) + 1;
    this.saveProgress();
  }

  private updateEvent(): void {
    if (!this.sanctions && this.power >= GAME_CONFIG.phase2Score) {
      this.sanctions = true;
      this.cameras.main.shake(300, 0.005);
      this.flashBorder(0xea580c);
      this.showToast(
        `⚠ ВТОРАЯ ФАЗА: САНКЦИИ\nДоход −${SANCTIONS_INCOME_PCT}%, цены улучшений +${SANCTIONS_PRICE_PCT}%`,
        0xea580c,
      );
    }

    if (this.rallyAt === null && this.elapsed >= this.nextWarningAt) {
      this.rallyAt = this.nextWarningAt + GAME_CONFIG.warningLead;
      this.cameras.main.flash(300, 255, 160, 0);
      this.flashBorder(0xf59e0b);
      this.showToast('⚠ СОБЫТИЕ\nЧерез 30 секунд оппозиция проведёт митинг!', 0xd97706);
    }

    if (this.rallyAt !== null && this.elapsed >= this.rallyAt) {
      const startedAt = this.rallyAt;
      const wasActive = this.rallyActive;

      this.wave += 1;
      this.rallyActive = true;
      if (!wasActive) this.rallyActiveSince = this.elapsed;
      this.rallyAt = null;
      const interval = Phaser.Math.Between(GAME_CONFIG.rallyIntervalMin, GAME_CONFIG.rallyIntervalMax);
      this.nextWarningAt = startedAt + interval - GAME_CONFIG.warningLead;

      this.cameras.main.shake(400, 0.008);
      this.flashBorder(0xef4444);
      this.showToast(
        wasActive
          ? `✊ НОВАЯ ВОЛНА МИТИНГА\nДебафф усилен: −${formatNumber(this.drain)} Гос.власти/с`
          : `✊ МИТИНГ НАЧАЛСЯ\nДебафф: −${formatNumber(this.drain)} Гос.власти в секунду`,
        0xdc2626,
      );
    }
  }

  private disperse(): void {
    if (!this.rallyActive || this.gameOver || this.paused) return;

    const cost = this.disperseCost;
    if (this.power < cost) {
      this.cameras.main.shake(80, 0.002);
      return;
    }
    this.power -= cost;
    this.rallyActive = false;
    this.cameras.main.flash(250, 34, 197, 94);
    this.showToast('🛡 Митинг разогнан!\nДебафф снят', 0x16a34a);
  }

  private flashBorder(color: number): void {
    const { width, height } = this.scale;
    const frame = this.add.rectangle(0, 0, width, height).setOrigin(0, 0).setStrokeStyle(18, color).setDepth(30);
    this.tweens.add({
      targets: frame,
      alpha: { from: 1, to: 0 },
      duration: 350,
      repeat: 2,
      onComplete: () => frame.destroy(),
    });
  }

  private createEventCards(): void {
    this.rallyGlow = this.add.rectangle(-4, -4, LEFT_W + 8, 112).setOrigin(0, 0).setStrokeStyle(4, 0xfde047);
    this.rallyBg = this.add
      .rectangle(0, 0, LEFT_W, 104, 0xdc2626)
      .setOrigin(0, 0)
      .setStrokeStyle(3, 0xffffff);
    this.rallyTitle = this.add.text(12, 8, '', { fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold' });
    this.rallyInfo = this.add.text(12, 31, '', {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#ffffff',
      lineSpacing: 2,
    });
    this.disperseBtn = this.add
      .rectangle(12, 68, LEFT_W - 24, 30, 0x16a34a)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.disperseText = this.add
      .text(LEFT_W / 2, 83, '', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.disperseBtn.on('pointerdown', () => this.disperse());

    this.rallyCard = this.add
      .container(LEFT_X, RALLY_Y, [
        this.rallyGlow,
        this.rallyBg,
        this.rallyTitle,
        this.rallyInfo,
        this.disperseBtn,
        this.disperseText,
      ])
      .setVisible(false);
    this.tweens.add({ targets: this.rallyGlow, alpha: { from: 0.15, to: 1 }, duration: 450, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: this.disperseBtn, alpha: { from: 0.7, to: 1 }, duration: 380, yoyo: true, repeat: -1 });

    const buffGlow = this.add.rectangle(-4, -4, LEFT_W + 8, 90).setOrigin(0, 0).setStrokeStyle(4, 0xfde047);
    const buffBg = this.add
      .rectangle(0, 0, LEFT_W, 82, 0x8b5cf6)
      .setOrigin(0, 0)
      .setStrokeStyle(3, 0xffffff)
      .setInteractive({ useHandCursor: true });
    const buffTitle = this.add
      .text(LEFT_W / 2, 28, 'ПОСАДИТЬ ВИДНОГО\nОППОЗИЦИОНЕРА', {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    this.buffSub = this.add
      .text(LEFT_W / 2, 61, '', { fontFamily: FONT, fontSize: '14px', color: '#fef9c3', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.buffBar = this.add.rectangle(0, 79, LEFT_W, 6, 0xfde047).setOrigin(0, 0.5);

    buffBg.on('pointerdown', () => this.collectBuff());
    buffBg.on('pointerover', () => buffBg.setFillStyle(0xa78bfa));
    buffBg.on('pointerout', () => buffBg.setFillStyle(0x8b5cf6));

    this.buffCard = this.add
      .container(LEFT_X, BUFF_Y, [buffGlow, buffBg, buffTitle, this.buffSub, this.buffBar])
      .setVisible(false);
    this.tweens.add({ targets: buffGlow, alpha: { from: 0.15, to: 1 }, duration: 400, yoyo: true, repeat: -1 });
  }

  private updateEventCards(): void {
    const warning = this.rallyAt !== null;
    const show = this.rallyActive || warning;
    this.rallyCard.setVisible(show);
    if (!show) return;

    const seconds = warning && this.rallyAt !== null ? Math.ceil((this.rallyAt - this.elapsed) / 1000) : 0;

    if (this.rallyActive) {
      const affordable = this.power >= this.disperseCost;
      const lines = [`Потери: −${formatNumber(this.drain)} Гос.власти в секунду`];
      if (warning) lines.push(`Новая волна через ${seconds} с`);
      this.rallyTitle.setText(`✊ МИТИНГ ИДЁТ! (волна ${this.wave})`);
      this.rallyInfo.setText(lines.join('\n'));
      this.rallyBg.setFillStyle(0xdc2626).setSize(LEFT_W, 104);
      this.rallyGlow.setSize(LEFT_W + 8, 112);
      this.disperseBtn.setVisible(true).setFillStyle(affordable ? 0x16a34a : 0x7b8fae);
      this.disperseText.setVisible(true).setText(`РАЗОГНАТЬ: ${formatNumber(this.disperseCost)}`);
    } else {
      this.rallyTitle.setText('⚠ ГОТОВИТСЯ МИТИНГ');
      this.rallyInfo.setText(`Начало через ${seconds} с\nНакопите Гос.власть для разгона`);
      this.rallyBg.setFillStyle(0xd97706).setSize(LEFT_W, 72);
      this.rallyGlow.setSize(LEFT_W + 8, 80);
      this.disperseBtn.setVisible(false);
      this.disperseText.setVisible(false);
    }
  }

  private showToast(message: string, color: number): void {
    const { width } = this.scale;
    const bg = this.add.rectangle(0, 0, 560, 90, color, 0.95).setStrokeStyle(3, 0xffffff);
    const text = this.add
      .text(0, 0, message, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    const toast = this.add.container(width / 2, 290, [bg, text]).setDepth(20).setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: 1,
      duration: 250,
      hold: 3500,
      yoyo: true,
      onComplete: () => toast.destroy(),
    });
  }

  private scheduleNextBuff(): void {
    this.nextBuffAt = this.elapsed + Phaser.Math.Between(GAME_CONFIG.buffIntervalMin, GAME_CONFIG.buffIntervalMax);
  }

  private updateBuff(): void {
    if (!this.buffAvailable && this.elapsed >= this.nextBuffAt) {
      this.buffAvailable = true;
      this.buffEndsAt = this.elapsed + GAME_CONFIG.buffLifetime;
      this.buffCard.setVisible(true).setAlpha(0).setX(LEFT_X - 70);
      this.tweens.add({ targets: this.buffCard, alpha: 1, x: LEFT_X, duration: 350, ease: 'Back.Out' });
      this.cameras.main.flash(200, 139, 92, 246);
      this.flashBorder(0xa78bfa);
    } else if (this.buffAvailable && this.elapsed >= this.buffEndsAt) {
      this.buffAvailable = false;
      this.buffCard.setVisible(false);
      this.scheduleNextBuff();
    }
  }

  private collectBuff(): void {
    if (!this.buffAvailable || this.gameOver || this.paused) return;

    this.power += GAME_CONFIG.buffReward;
    this.buffAvailable = false;
    this.buffCard.setVisible(false);
    this.scheduleNextBuff();

    const floating = this.add
      .text(LEFT_CX, BUFF_Y, `+${GAME_CONFIG.buffReward}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#86efac',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: floating,
      y: floating.y - 80,
      alpha: 0,
      duration: 900,
      onComplete: () => floating.destroy(),
    });
  }

  private updateSanctionsText(): void {
    if (!this.sanctions) return;
    this.sanctionsText.setText(`Санкции: доход −${SANCTIONS_INCOME_PCT}%, цены +${SANCTIONS_PRICE_PCT}%`);
  }

  private updateBuffUi(): void {
    if (!this.buffAvailable) return;
    const left = Math.max(0, this.buffEndsAt - this.elapsed);
    this.buffSub.setText(`+${GAME_CONFIG.buffReward} Гос.власти • ${Math.ceil(left / 1000)} с`);
    this.buffBar.setScale(left / GAME_CONFIG.buffLifetime, 1);
  }

  private createEffectsWindow(): void {
    const { height } = this.scale;
    const button = this.add
      .rectangle(16, 12, 130, 34, 0x56729a)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xb6c8e0)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(81, 29, 'Эффекты (E)', { fontFamily: FONT, fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5);
    button.on('pointerdown', () => this.toggleEffects());
    button.on('pointerover', () => button.setFillStyle(0x6b88b0));
    button.on('pointerout', () => button.setFillStyle(0x56729a));

    const bg = this.add
      .rectangle(0, 0, 480, 480, 0x4a6488, 0.98)
      .setStrokeStyle(3, 0xe2e8f0)
      .setInteractive();
    const title = this.add
      .text(0, -215, 'ДЕЙСТВУЮЩИЕ ЭФФЕКТЫ', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const close = this.add
      .text(220, -215, '✕', { fontFamily: FONT, fontSize: '24px', color: '#e2e8f0' })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleEffects());

    const head = (y: number, label: string, color: string) =>
      this.add.text(-220, y, label, { fontFamily: FONT, fontSize: '17px', color, fontStyle: 'bold' });
    const body = (y: number) =>
      this.add.text(-220, y, '', { fontFamily: FONT, fontSize: '15px', color: '#f8fafc', lineSpacing: 6 });

    const upgradesTitle = head(-180, 'УЛУЧШЕНИЯ', '#bae6fd');
    this.upgradesText = body(-154);
    const buffsTitle = head(10, 'БАФФЫ', '#bbf7d0');
    this.buffsText = body(36);
    const debuffsTitle = head(95, 'ДЕБАФФЫ', '#fecaca');
    this.debuffsText = body(121);

    this.effectsWindow = this.add
      .container(545, height / 2, [
        bg,
        title,
        close,
        upgradesTitle,
        this.upgradesText,
        buffsTitle,
        this.buffsText,
        debuffsTitle,
        this.debuffsText,
      ])
      .setDepth(50)
      .setVisible(false);
  }

  private toggleEffects(): void {
    if (this.gameOver || this.paused) return;
    this.effectsWindow.setVisible(!this.effectsWindow.visible);
    this.updateEffectsWindow();
  }

  private updateEffectsWindow(): void {
    if (!this.effectsWindow.visible) return;

    const summary = (kind: UpgradeKind) => {
      const list = UPGRADES.filter((u) => u.kind === kind);
      return {
        pieces: list.reduce((sum, u) => sum + this.count(u.id), 0),
        total: list.reduce((sum, u) => sum + u.value * this.count(u.id), 0),
      };
    };
    const click = summary('click');
    const passive = summary('passive');
    if (click.pieces + passive.pieces === 0) {
      this.upgradesText.setText('Пока нет улучшений.\nКупите их.');
    } else {
      this.upgradesText.setText(
        [
          `• Личные инструменты: ${click.pieces} шт.`,
          `   +${formatNumber(click.total)} за клик`,
          `• Вертикаль власти: ${passive.pieces} шт.`,
          `   +${formatNumber(this.perSecond)} в секунду`,
        ].join('\n'),
      );
    }

    if (this.buffAvailable) {
      const left = Math.ceil(Math.max(0, this.buffEndsAt - this.elapsed) / 1000);
      this.buffsText.setText(
        `• Посадить видного оппозиционера\n   Нажмите кнопку слева: +${GAME_CONFIG.buffReward} Гос.власти (осталось ${left} с)`,
      );
    } else {
      this.buffsText.setText('Нет активных баффов.');
    }

    const debuffs: string[] = [];
    if (this.sanctions) {
      debuffs.push('• Санкции', `   Доход −${SANCTIONS_INCOME_PCT}%, цены улучшений +${SANCTIONS_PRICE_PCT}%`);
    }
    if (this.rallyActive) {
      debuffs.push(
        `• Митинг оппозиции (волна ${this.wave}): −${formatNumber(this.drain)}/с`,
        `   Разогнать: ${formatNumber(this.disperseCost)} Гос.власти`,
      );
    }
    this.debuffsText.setText(debuffs.length ? debuffs.join('\n') : 'Нет активных дебаффов.');
  }

  private togglePause(): void {
    if (this.gameOver) return;

    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    if (this.paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  private createPauseOverlay(): void {
    const { width, height } = this.scale;

    const dim = this.add.rectangle(0, 0, width, height, 0x1e293b, 0.78).setOrigin(0, 0).setInteractive();
    const title = this.add
      .text(width / 2, height / 2 - 80, 'ПАУЗА', { fontFamily: FONT, fontSize: '56px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height / 2 - 20, 'Нажмите P или Esc, чтобы продолжить', { fontFamily: FONT, fontSize: '18px', color: '#e2e8f0' })
      .setOrigin(0.5);
    const button = this.add
      .rectangle(width / 2, height / 2 + 50, 240, 56, 0x2f86c6)
      .setStrokeStyle(3, 0xffffff)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, height / 2 + 50, 'Продолжить', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    button.on('pointerdown', () => this.togglePause());
    button.on('pointerover', () => button.setFillStyle(0x4aa3df));
    button.on('pointerout', () => button.setFillStyle(0x2f86c6));

    this.pauseOverlay = this.add
      .container(0, 0, [dim, title, hint, button, label])
      .setDepth(90)
      .setVisible(false);
  }

  private createRestartButton(): void {
    const { width } = this.scale;

    const button = this.add
      .rectangle(width - 16, 12, 140, 34, 0xdc2626)
      .setOrigin(1, 0)
      .setStrokeStyle(2, 0xfecaca)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width - 86, 29, 'Начать заново', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add.text(width - 16, 52, 'P / Esc — пауза', { fontFamily: FONT, fontSize: '12px', color: '#e2e8f0' }).setOrigin(1, 0);

    let armed = false;
    const disarm = () => {
      armed = false;
      label.setText('Начать заново');
      button.setFillStyle(0xdc2626);
    };

    button.on('pointerover', () => button.setFillStyle(armed ? 0xd97706 : 0xef4444));
    button.on('pointerout', () => button.setFillStyle(armed ? 0xd97706 : 0xdc2626));
    button.on('pointerdown', () => {
      if (!armed) {
        armed = true;
        label.setText('Точно заново?');
        button.setFillStyle(0xd97706);
        this.time.delayedCall(3000, disarm);
        return;
      }
      this.clearSave();
      this.scene.restart();
    });
  }

  private endGame(): void {
    this.gameOver = true;
    this.effectsWindow.setVisible(false);
    this.rallyCard.setVisible(false);
    this.buffCard.setVisible(false);
    this.clearSave();

    const { width, height } = this.scale;
    const minutes = Math.floor(this.elapsed / 60000);
    const seconds = Math.floor((this.elapsed % 60000) / 1000);

    this.add
      .rectangle(0, 0, width, height, 0x1e293b, 0.78)
      .setOrigin(0, 0)
      .setDepth(100)
      .setInteractive();

    this.add
      .text(width / 2, height / 2 - 90, 'ВЫ ПРОИГРАЛИ', { fontFamily: FONT, fontSize: '52px', color: '#fca5a5', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(
        width / 2,
        height / 2 - 20,
        `ВАС СВЕРГЛИ.\nВы продержались ${minutes}:${seconds.toString().padStart(2, '0')}`,
        { fontFamily: FONT, fontSize: '22px', color: '#e2e8f0', align: 'center' },
      )
      .setOrigin(0.5)
      .setDepth(101);

    const button = this.add
      .rectangle(width / 2, height / 2 + 80, 260, 60, 0x2f86c6)
      .setStrokeStyle(3, 0xffffff)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height / 2 + 80, 'Прийти к власти снова', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(102);

    button.on('pointerover', () => button.setFillStyle(0x4aa3df));
    button.on('pointerout', () => button.setFillStyle(0x2f86c6));
    button.on('pointerdown', () => this.scene.restart());
  }

  private createDocument(x: number, y: number): void {
    this.paperGlow = this.add.rectangle(0, 0, 224, 244).setStrokeStyle(5, 0xfde047);
    this.paper = this.add.rectangle(0, 0, 210, 230, 0xf8fafc).setStrokeStyle(4, 0x94a3b8);
    const title = this.add
      .text(0, -88, 'УКАЗ', { fontFamily: FONT, fontSize: '26px', color: '#0f172a', fontStyle: 'bold' })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 5; i++) {
      lines.push(this.add.rectangle(0, -50 + i * 20, i === 4 ? 100 : 170, 6, 0xcbd5e1));
    }
    const seal = this.add.circle(52, 72, 26, 0xdc2626, 0.85);
    const sealStar = this.add.text(52, 72, '★', { fontFamily: FONT, fontSize: '26px', color: '#fee2e2' }).setOrigin(0.5);

    this.paperGroup = this.add.container(x, y, [this.paperGlow, this.paper, title, ...lines, seal, sealStar]);
    this.tweens.add({ targets: this.paperGlow, alpha: { from: 0.2, to: 1 }, duration: 500, yoyo: true, repeat: -1 });

    this.paper.setInteractive({ useHandCursor: true });
    this.paper.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      this.click(p.x, p.y, 'mouse');
    });
  }

  private createHint(): void {
    this.hintText = this.add
      .text(LEFT_CX, 136, '', { fontFamily: FONT, fontSize: '20px', color: '#fde047', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    this.hintArrow = this.add
      .text(LEFT_CX, 170, '▼', { fontFamily: FONT, fontSize: '26px', color: '#fde047' })
      .setOrigin(0.5);
    this.tweens.add({ targets: this.hintArrow, y: 177, duration: 380, yoyo: true, repeat: -1 });
  }

  private updateHint(): void {
    let stage = 2;
    if (this.totalOwned === 0) stage = this.clicks === 0 && this.power <= 0 ? 0 : 1;
    if (stage === this.hintStage) return;
    this.hintStage = stage;

    this.paperGlow.setVisible(stage === 0);
    this.hintArrow.setVisible(stage === 0);
    if (stage === 0) {
      this.hintText.setText('КЛИКАЙ ПО УКАЗУ!\nили жми ПРОБЕЛ').setFontSize(20).setColor('#fde047');
    } else if (stage === 1) {
      this.hintText.setText('Копи Гос.власть и покупай\nулучшения справа →').setFontSize(16).setColor('#fde047');
    } else {
      this.hintText.setText('КЛИКАЙ ПО УКАЗУ\nили ЖМИ ПРОБЕЛ').setFontSize(14).setColor('#e2e8f0');
    }
  }

  private click(x: number, y: number, source: ClickSource): void {
    if (this.gameOver || this.paused) return;

    const now = this.time.now;
    if (
      this.lastClickSource !== null &&
      this.lastClickSource !== source &&
      now - this.lastClickAt < GAME_CONFIG.inputSwitchLock
    ) {
      return;
    }
    this.lastClickSource = source;
    this.lastClickAt = now;
    this.clicks += 1;

    const gain = this.perClick;
    this.power += gain;

    this.tweens.killTweensOf(this.paperGroup);
    this.paperGroup.setScale(0.94);
    this.tweens.add({ targets: this.paperGroup, scale: 1, duration: 120, ease: 'Back.Out' });

    const floating = this.add
      .text(x + Phaser.Math.Between(-20, 20), y - 10, `+${formatNumber(gain)}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#fde047',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: floating,
      y: floating.y - 70,
      alpha: 0,
      duration: 700,
      onComplete: () => floating.destroy(),
    });
  }

  private createUpgradePanel(): void {
    const defs: { kind: UpgradeKind; title: string; x: number }[] = [
      { kind: 'click', title: 'ЛИЧНЫЕ ИНСТРУМЕНТЫ', x: 320 },
      { kind: 'passive', title: 'ВЫСТРАИВАНИЕ ВЕРТИКАЛИ', x: 625 },
    ];

    for (const def of defs) {
      this.add.text(def.x, COLUMN_TOP + 2, def.title, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold' });

      const track = this.add.rectangle(def.x + ROW_W + 5, LIST_TOP, 5, LIST_H, 0x7f9bc0, 0.5).setOrigin(0, 0);
      const thumb = this.add.rectangle(def.x + ROW_W + 5, LIST_TOP, 5, 40, 0xf1f5f9).setOrigin(0, 0);
      const upBtn = this.createArrow(def.x + ROW_W - 44, '▲');
      const downBtn = this.createArrow(def.x + ROW_W - 18, '▼');

      const column: UpgradeColumn = { kind: def.kind, x: def.x, rows: [], offset: 0, upBtn, downBtn, track, thumb };
      upBtn.on('pointerdown', () => this.scrollColumn(column, -1));
      downBtn.on('pointerdown', () => this.scrollColumn(column, 1));

      for (const upgrade of UPGRADES.filter((u) => u.kind === def.kind)) {
        column.rows.push(this.createRow(upgrade, def.x));
      }
      this.columns.push(column);
      this.layoutColumn(column);
    }
  }

  private createArrow(x: number, symbol: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, COLUMN_TOP - 2, symbol, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fde047',
        fontStyle: 'bold',
        padding: { x: 5, y: 2 },
      })
      .setInteractive({ useHandCursor: true });
  }

  private createRow(def: UpgradeDef, x: number): UpgradeRow {
    const bg = this.add.rectangle(0, 0, ROW_W, ROW_H, 0x56729a).setOrigin(0, 0).setStrokeStyle(2, 0x7f9bc0);
    const name = this.add.text(12, 7, def.name, { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
    let nameSize = 15;
    while (name.width > ROW_W - 24 && nameSize > 10) {
      nameSize -= 1;
      name.setFontSize(nameSize);
    }
    const description = this.add.text(12, 28, def.description, { fontFamily: FONT, fontSize: '13px', color: '#e2e8f0' });
    const cost = this.add.text(12, 49, '', { fontFamily: FONT, fontSize: '15px', color: '#fde047' });
    const count = this.add
      .text(ROW_W - 12, 50, '', { fontFamily: FONT, fontSize: '13px', color: '#e2e8f0' })
      .setOrigin(1, 0);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.buy(def));
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xfde047));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x7f9bc0));

    const container = this.add.container(x, 0, [bg, name, description, cost, count]);
    return { def, container, bg, cost, count, name };
  }

  private scrollColumn(column: UpgradeColumn, direction: number): void {
    column.offset += direction;
    this.layoutColumn(column);
  }

  private layoutColumn(column: UpgradeColumn): void {
    const total = column.rows.length;
    const maxOffset = Math.max(0, total - VISIBLE_ROWS);
    column.offset = Phaser.Math.Clamp(column.offset, 0, maxOffset);

    column.rows.forEach((row, i) => {
      const slot = i - column.offset;
      const visible = slot >= 0 && slot < VISIBLE_ROWS;
      row.container.setVisible(visible);
      if (visible) row.container.setPosition(column.x, LIST_TOP + slot * ROW_PITCH);
    });

    const scrollable = maxOffset > 0;
    column.upBtn.setVisible(scrollable).setAlpha(column.offset > 0 ? 1 : 0.35);
    column.downBtn.setVisible(scrollable).setAlpha(column.offset < maxOffset ? 1 : 0.35);
    column.track.setVisible(scrollable);
    column.thumb.setVisible(scrollable);
    if (scrollable) {
      const thumbHeight = Math.max(24, (LIST_H * VISIBLE_ROWS) / total);
      column.thumb.setSize(5, thumbHeight);
      column.thumb.setY(LIST_TOP + (LIST_H - thumbHeight) * (column.offset / maxOffset));
    }
  }

  private refresh(): void {
    const net = this.perSecond - this.drain;
    const netText = `${net < 0 ? '−' : ''}${formatNumber(Math.abs(net))}`;

    this.powerText.setText(`Гос.власть: ${formatNumber(this.power)}`);
    this.statsText.setText(`За клик: ${formatNumber(this.perClick)}   •   В секунду: ${netText}`);
    this.statsText.setColor(net < 0 ? '#fecaca' : '#e8eef7');

    for (const column of this.columns) {
      for (const row of column.rows) {
        const cost = this.costOf(row.def);
        const affordable = this.power >= cost;
        row.cost.setText(formatNumber(cost));
        row.cost.setColor(affordable ? '#fde047' : '#fecaca');
        row.count.setText(`Куплено: ${this.count(row.def.id)}`);
        row.bg.setFillStyle(affordable ? 0x2f86c6 : 0x56729a);
        row.name.setAlpha(affordable ? 1 : 0.8);
      }
    }

    this.updateHint();
    this.updateSanctionsText();
    this.updateEventCards();
    this.updateBuffUi();
    this.updateEffectsWindow();
  }

  private saveProgress(): void {
    if (this.gameOver) return;
    try {
      localStorage.setItem(GAME_CONFIG.saveKey, JSON.stringify({ power: this.power, owned: this.owned }));
    } catch {}
  }

  private clearSave(): void {
    try {
      localStorage.removeItem(GAME_CONFIG.saveKey);
    } catch {}
  }

  private loadProgress(): void {
    this.power = 0;
    this.owned = {};
    try {
      const raw = localStorage.getItem(GAME_CONFIG.saveKey);
      if (!raw) return;
      const data = JSON.parse(raw) as { power?: number; owned?: Record<string, number> };
      this.power = data.power ?? 0;
      this.owned = data.owned ?? {};
    } catch {
      this.power = 0;
      this.owned = {};
    }
  }
}