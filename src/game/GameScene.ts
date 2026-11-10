import Phaser from 'phaser';
import { UPGRADES, UpgradeDef, UpgradeKind, formatNumber, upgradeCost } from './upgrades';
import { GAME_CONFIG } from './gameConfig';
import { Sfx } from './audio';
import { BRANCH, COLORS, FONT, FONT_HEAD, TEXT, TIER_COLORS, TIER_TEXT, tierOf } from './theme';
import { UPGRADE_ICONS } from './icons';

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
const DOC_Y = 300;

type ClickSource = 'mouse' | 'space';

interface UpgradeRow {
  def: UpgradeDef;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  cost: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  progress: Phaser.GameObjects.Rectangle;
  flash: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Rectangle;
  shade: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Text;
  x: number;
  hover: boolean;
  denyUntil: number;
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

  private sfx!: Sfx;
  private disperseDenyUntil = 0;
  private muteLabel!: Phaser.GameObjects.Text;
  private paper!: Phaser.GameObjects.Rectangle;
  private paperGlow!: Phaser.GameObjects.Rectangle;
  private paperGroup!: Phaser.GameObjects.Container;
  private hintText!: Phaser.GameObjects.Text;
  private hintArrow!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private clickStat!: Phaser.GameObjects.Text;
  private secStat!: Phaser.GameObjects.Text;
  private powerIcon!: Phaser.GameObjects.Container;
  private displayPower = 0;
  private seal!: Phaser.GameObjects.Container;
  private rallyTint!: Phaser.GameObjects.Rectangle;
  private rallyVignette!: Phaser.GameObjects.Image;
  private rallyLevel = 0;
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
    this.disperseDenyUntil = 0;
    this.loadProgress();
    this.displayPower = this.power;
    this.rallyLevel = 0;
    this.sfx = new Sfx();

    this.createBackdrop();
    this.createHeader();
    this.createDocument(LEFT_CX, DOC_Y);
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
    this.input.keyboard?.on('keydown-M', () => this.toggleMute());
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
    this.refresh(delta);
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
    const row = this.findRow(def);
    if (this.power < cost) {
      this.sfx.deny();
      if (row) this.denyRow(row);
      return;
    }
    this.power -= cost;
    this.owned[def.id] = this.count(def.id) + 1;
    this.sfx.buy();
    if (row) this.celebrateRow(row, cost);
    this.saveProgress();
  }

  private updateEvent(): void {
    if (!this.sanctions && this.power >= GAME_CONFIG.phase2Score) {
      this.sanctions = true;
      this.cameras.main.shake(300, 0.005);
      this.sfx.sanctions();
      this.flashBorder(COLORS.sanction);
      this.showToast(
        `⚠ ВТОРАЯ ФАЗА: САНКЦИИ\nДоход −${SANCTIONS_INCOME_PCT}%, цены улучшений +${SANCTIONS_PRICE_PCT}%`,
        COLORS.sanction,
      );
    }

    if (this.rallyAt === null && this.elapsed >= this.nextWarningAt) {
      this.rallyAt = this.nextWarningAt + GAME_CONFIG.warningLead;
      this.cameras.main.flash(300, 255, 160, 0);
      this.flashBorder(COLORS.warnFlash);
      this.sfx.warning();
      this.showToast(
        '⚠ СОБЫТИЕ\nЧерез 30 секунд оппозиция проведёт митинг!\nКопи Гос.власть: при нуле тебя свергнут',
        COLORS.warn,
      );
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
      this.sfx.rally();
      this.flashBorder(COLORS.dangerHover);
      this.showToast(
        wasActive
          ? `✊ НОВАЯ ВОЛНА МИТИНГА\nДебафф усилен: −${formatNumber(this.drain)} Гос.власти/с`
          : `✊ МИТИНГ НАЧАЛСЯ\nДебафф: −${formatNumber(this.drain)} Гос.власти в секунду`,
        COLORS.danger,
      );
    }
  }

  private disperse(): void {
    if (!this.rallyActive || this.gameOver || this.paused) return;

    const cost = this.disperseCost;
    if (this.power < cost) {
      this.sfx.deny();
      this.cameras.main.shake(80, 0.002);
      this.disperseDenyUntil = this.time.now + 1200;
      return;
    }
    this.power -= cost;
    this.rallyActive = false;
    this.sfx.success();
    this.cameras.main.flash(250, 34, 197, 94);
    this.showToast('🛡 Митинг разогнан!\nДебафф снят', COLORS.ok);
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
    this.rallyGlow = this.add.rectangle(-4, -4, LEFT_W + 8, 112).setOrigin(0, 0).setStrokeStyle(4, COLORS.gold);
    this.rallyBg = this.add
      .rectangle(0, 0, LEFT_W, 104, COLORS.danger)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLORS.white);
    this.rallyTitle = this.add
      .text(12, 18, '', { fontFamily: FONT_HEAD, fontSize: '17px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.rallyInfo = this.add.text(12, 31, '', {
      fontFamily: FONT,
      fontSize: '14px',
      color: TEXT.white,
      lineSpacing: 2,
    });
    this.disperseBtn = this.add
      .rectangle(12, 68, LEFT_W - 24, 30, COLORS.ok)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.white)
      .setInteractive({ useHandCursor: true });
    this.disperseText = this.add
      .text(LEFT_W / 2, 83, '', { fontFamily: FONT, fontSize: '15px', color: TEXT.white, fontStyle: 'bold' })
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
    this.tweens.add({
      targets: this.rallyTitle,
      scale: { from: 1, to: 1.06 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.tweens.add({ targets: this.disperseBtn, alpha: { from: 0.7, to: 1 }, duration: 380, yoyo: true, repeat: -1 });

    const buffGlow = this.add.rectangle(-4, -4, LEFT_W + 8, 90).setOrigin(0, 0).setStrokeStyle(4, COLORS.gold);
    const buffBg = this.add
      .rectangle(0, 0, LEFT_W, 82, COLORS.buff)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLORS.white)
      .setInteractive({ useHandCursor: true });
    const buffTitle = this.add
      .text(LEFT_W / 2, 28, 'ПОСАДИТЬ ВИДНОГО\nОППОЗИЦИОНЕРА', {
        fontFamily: FONT,
        fontSize: '17px',
        color: TEXT.white,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    this.buffSub = this.add
      .text(LEFT_W / 2, 61, '', { fontFamily: FONT, fontSize: '14px', color: '#fef9c3', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.buffBar = this.add.rectangle(0, 79, LEFT_W, 6, COLORS.gold).setOrigin(0, 0.5);

    buffBg.on('pointerdown', () => this.collectBuff());
    buffBg.on('pointerover', () => buffBg.setFillStyle(COLORS.buffHover));
    buffBg.on('pointerout', () => buffBg.setFillStyle(COLORS.buff));

    this.buffCard = this.add
      .container(LEFT_X, BUFF_Y, [buffGlow, buffBg, buffTitle, this.buffSub, this.buffBar])
      .setVisible(false);
    this.tweens.add({ targets: buffGlow, alpha: { from: 0.15, to: 1 }, duration: 400, yoyo: true, repeat: -1 });
  }

  private updateEventCards(): void {
    const target = this.rallyActive ? 1 : 0;
    this.rallyLevel += (target - this.rallyLevel) * 0.06;
    if (Math.abs(target - this.rallyLevel) < 0.002) this.rallyLevel = target;
    this.rallyTint.setAlpha(this.rallyLevel * 0.3);
    this.rallyVignette.setAlpha(this.rallyLevel * (0.6 + 0.25 * Math.sin(this.time.now / 240)));

    const warning = this.rallyAt !== null;
    const show = this.rallyActive || warning;
    this.rallyCard.setVisible(show);
    if (!show) return;

    const seconds = warning && this.rallyAt !== null ? Math.ceil((this.rallyAt - this.elapsed) / 1000) : 0;

    if (this.rallyActive) {
      const affordable = this.power >= this.disperseCost;
      const net = this.perSecond - this.drain;
      const secondsLeft = net < 0 ? Math.ceil(this.power / -net) : Infinity;
      const lines = [
        net < 0
          ? `−${formatNumber(this.drain)}/с • свержение ≈ ${secondsLeft} с`
          : `−${formatNumber(this.drain)}/с • доход покрывает потери`,
      ];
      if (warning) lines.push(`Новая волна через ${seconds} с`);
      this.rallyInfo.setColor(secondsLeft <= 10 ? TEXT.gold : TEXT.white);
      this.rallyTitle.setText(`✊ МИТИНГ ИДЁТ! (волна ${this.wave})`);
      this.rallyInfo.setText(lines.join('\n'));
      this.rallyBg.setFillStyle(COLORS.danger).setSize(LEFT_W, 104);
      this.rallyGlow.setSize(LEFT_W + 8, 112);
      this.disperseBtn.setVisible(true).setFillStyle(affordable ? COLORS.ok : COLORS.disabled);
      this.disperseText
        .setVisible(true)
        .setText(
          this.time.now < this.disperseDenyUntil
            ? `Не хватает: ${formatNumber(this.disperseCost - this.power)}`
            : `РАЗОГНАТЬ: ${formatNumber(this.disperseCost)}`,
        );
    } else {
      this.rallyTitle.setText('⚠ ГОТОВИТСЯ МИТИНГ');
      this.rallyInfo.setText(`Начало через ${seconds} с\nНакопите Гос.власть для разгона`);
      this.rallyBg.setFillStyle(COLORS.warn).setSize(LEFT_W, 72);
      this.rallyGlow.setSize(LEFT_W + 8, 80);
      this.disperseBtn.setVisible(false);
      this.disperseText.setVisible(false);
    }
  }

  private showToast(message: string, color: number): void {
    const { width } = this.scale;
    const bg = this.add.rectangle(0, 0, 560, 90, color, 0.95).setStrokeStyle(3, COLORS.white);
    const text = this.add
      .text(0, 0, message, { fontFamily: FONT, fontSize: '20px', color: TEXT.white, fontStyle: 'bold', align: 'center' })
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
      this.sfx.buffAppear();
      this.flashBorder(COLORS.buffHover);
    } else if (this.buffAvailable && this.elapsed >= this.buffEndsAt) {
      this.buffAvailable = false;
      this.buffCard.setVisible(false);
      this.scheduleNextBuff();
    }
  }

  private collectBuff(): void {
    if (!this.buffAvailable || this.gameOver || this.paused) return;

    this.power += GAME_CONFIG.buffReward;
    this.sfx.buffCollect();
    this.buffAvailable = false;
    this.buffCard.setVisible(false);
    this.scheduleNextBuff();

    const floating = this.add
      .text(LEFT_CX, BUFF_Y, `+${GAME_CONFIG.buffReward}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: TEXT.ok,
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
    this.sanctionsText.setText(`⚠ Санкции: доход −${SANCTIONS_INCOME_PCT}%, цены +${SANCTIONS_PRICE_PCT}%`);
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
      .rectangle(16, 12, 130, 34, COLORS.row)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.brass)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(81, 29, 'Эффекты (E)', { fontFamily: FONT, fontSize: '15px', color: TEXT.white })
      .setOrigin(0.5);
    button.on('pointerdown', () => this.toggleEffects());
    button.on('pointerover', () => button.setFillStyle(COLORS.rowHover));
    button.on('pointerout', () => button.setFillStyle(COLORS.row));

    const bg = this.add
      .rectangle(0, 0, 480, 480, COLORS.window, 0.98)
      .setStrokeStyle(3, COLORS.windowEdge)
      .setInteractive();
    const title = this.add
      .text(0, -215, 'ДЕЙСТВУЮЩИЕ ЭФФЕКТЫ', { fontFamily: FONT_HEAD, fontSize: '22px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5);
    const close = this.add
      .text(220, -215, '✕', { fontFamily: FONT, fontSize: '24px', color: TEXT.muted })
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
    const debuffsTitle = head(95, 'ДЕБАФФЫ', TEXT.danger);
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

    const dim = this.add.rectangle(0, 0, width, height, COLORS.overlay, 0.78).setOrigin(0, 0).setInteractive();
    const title = this.add
      .text(width / 2, height / 2 - 80, 'ПАУЗА', { fontFamily: FONT_HEAD, fontSize: '56px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height / 2 - 20, 'Нажмите P или Esc, чтобы продолжить', { fontFamily: FONT, fontSize: '18px', color: TEXT.muted })
      .setOrigin(0.5);
    const button = this.add
      .rectangle(width / 2, height / 2 + 50, 240, 56, COLORS.primary)
      .setStrokeStyle(3, COLORS.white)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, height / 2 + 50, 'Продолжить', { fontFamily: FONT, fontSize: '22px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5);

    button.on('pointerdown', () => this.togglePause());
    button.on('pointerover', () => button.setFillStyle(COLORS.primaryHover));
    button.on('pointerout', () => button.setFillStyle(COLORS.primary));

    this.pauseOverlay = this.add
      .container(0, 0, [dim, title, hint, button, label])
      .setDepth(90)
      .setVisible(false);
  }

  private createRestartButton(): void {
    const { width } = this.scale;

    const button = this.add
      .rectangle(width - 156, 12, 140, 34, COLORS.danger)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xfecaca)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width - 86, 29, 'Начать заново', { fontFamily: FONT, fontSize: '15px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add.text(width - 16, 52, 'P / Esc — пауза', { fontFamily: FONT, fontSize: '12px', color: TEXT.muted }).setOrigin(1, 0);
    this.muteLabel = this.add
      .text(width - 16, 68, '', { fontFamily: FONT, fontSize: '12px', color: TEXT.muted })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.muteLabel.on('pointerdown', () => this.toggleMute());
    this.updateMuteLabel();

    let armed = false;
    const disarm = () => {
      armed = false;
      label.setText('Начать заново');
      button.setFillStyle(COLORS.danger);
    };

    button.on('pointerover', () => button.setFillStyle(armed ? COLORS.warn : COLORS.dangerHover));
    button.on('pointerout', () => button.setFillStyle(armed ? COLORS.warn : COLORS.danger));
    button.on('pointerdown', () => {
      if (!armed) {
        armed = true;
        label.setText('Точно заново?');
        button.setFillStyle(COLORS.warn);
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
    this.sfx.lose();

    const { width, height } = this.scale;
    const minutes = Math.floor(this.elapsed / 60000);
    const seconds = Math.floor((this.elapsed % 60000) / 1000);

    this.add
      .rectangle(0, 0, width, height, COLORS.overlay, 0.92)
      .setOrigin(0, 0)
      .setDepth(100)
      .setInteractive();

    this.add
      .text(width / 2, height / 2 - 90, 'ВЫ ПРОИГРАЛИ', { fontFamily: FONT_HEAD, fontSize: '52px', color: '#fca5a5', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(
        width / 2,
        height / 2 - 20,
        `ВАС СВЕРГЛИ.\nВы продержались ${minutes}:${seconds.toString().padStart(2, '0')}`,
        { fontFamily: FONT, fontSize: '22px', color: TEXT.muted, align: 'center' },
      )
      .setOrigin(0.5)
      .setDepth(101);

    this.add
      .text(width / 2, height / 2 + 28, 'Совет: копи Гос.власть заранее — разгон митинга стоит дорого', {
        fontFamily: FONT,
        fontSize: '16px',
        color: TEXT.muted,
      })
      .setOrigin(0.5)
      .setDepth(101);

    const button = this.add
      .rectangle(width / 2, height / 2 + 80, 260, 60, COLORS.primary)
      .setStrokeStyle(3, COLORS.white)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height / 2 + 80, 'Прийти к власти снова', { fontFamily: FONT, fontSize: '22px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(102);

    button.on('pointerover', () => button.setFillStyle(COLORS.primaryHover));
    button.on('pointerout', () => button.setFillStyle(COLORS.primary));
    button.on('pointerdown', () => this.scene.restart());
  }

  private ensureTextures(width: number, height: number): void {
    if (!this.textures.exists('desk-bg')) {
      const tex = this.textures.createCanvas('desk-bg', width, height);
      if (tex) {
        const ctx = tex.getContext();
        const base = ctx.createLinearGradient(0, 0, 0, height);
        base.addColorStop(0, '#3b2418');
        base.addColorStop(0.55, '#2a1a11');
        base.addColorStop(1, '#1b100a');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);

        const plank = 160;
        for (let x = 0; x < width; x += plank) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, 0, 2, height);
          ctx.fillStyle = 'rgba(255,200,140,0.04)';
          ctx.fillRect(x + 2, 0, 1, height);
        }
        for (let i = 0; i < 420; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const len = 80 + Math.random() * 220;
          ctx.strokeStyle = Math.random() < 0.7 ? 'rgba(0,0,0,0.14)' : 'rgba(255,190,130,0.05)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 8, y + len / 2, x + (Math.random() - 0.5) * 4, y + len);
          ctx.stroke();
        }

        const light = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        light.addColorStop(0, 'rgba(255,190,120,0.12)');
        light.addColorStop(1, 'rgba(255,190,120,0)');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, width, height);

        const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, width * 0.66);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        tex.refresh();
      }
    }

    if (!this.textures.exists('felt')) {
      const tex = this.textures.createCanvas('felt', 128, 128);
      if (tex) {
        const ctx = tex.getContext();
        ctx.fillStyle = '#1b3b30';
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 1400; i++) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)';
          ctx.fillRect(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128), 1, 1);
        }
        tex.refresh();
      }
    }

    if (!this.textures.exists('rally-vignette')) {
      const tex = this.textures.createCanvas('rally-vignette', width, height);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.62);
        grad.addColorStop(0, 'rgba(220,38,38,0)');
        grad.addColorStop(1, 'rgba(220,38,38,0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        tex.refresh();
      }
    }
  }

  private createBackdrop(): void {
    const { width, height } = this.scale;
    this.ensureTextures(width, height);

    this.add.image(0, 0, 'desk-bg').setOrigin(0, 0);
    this.rallyTint = this.add.rectangle(0, 0, width, height, 0x3b0a0a, 0).setOrigin(0, 0).setDepth(3);
    this.rallyVignette = this.add.image(0, 0, 'rally-vignette').setOrigin(0, 0).setAlpha(0).setDepth(4);

    this.add.rectangle(0, 0, width, 112, COLORS.header, 0.94).setOrigin(0, 0);
    this.add.rectangle(0, 0, width, 2, 0x6b4630).setOrigin(0, 0);
    this.add.rectangle(0, 115, width, 8, 0x000000, 0.3).setOrigin(0, 0);
    this.add.rectangle(0, 112, width, 3, COLORS.brass).setOrigin(0, 0);

    const panel = (x: number, w: number): void => {
      this.add.rectangle(x + 5, 130, w, 510, 0x000000, 0.45).setOrigin(0, 0);
      this.add.tileSprite(x, 122, w, 510, 'felt').setOrigin(0, 0);
      this.add.rectangle(x, 122, w, 510).setOrigin(0, 0).setStrokeStyle(3, COLORS.panelEdge);
      this.add.rectangle(x + 7, 129, w - 14, 496).setOrigin(0, 0).setStrokeStyle(1, COLORS.stitch, 0.5);
    };
    panel(6, 306);
    panel(318, 634);
  }

  private toggleMute(): void {
    this.sfx.toggleMute();
    this.updateMuteLabel();
  }

  private updateMuteLabel(): void {
    this.muteLabel.setText(`M — звук: ${this.sfx.muted ? 'выкл' : 'вкл'}`);
  }

  private floatText(x: number, y: number, message: string, color: string, size = 18, rise = 40): void {
    const text = this.add
      .text(x, y, message, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: text, y: y - rise, alpha: 0, duration: 800, onComplete: () => text.destroy() });
  }

  private burst(x: number, y: number): void {
    for (let i = 0; i < GAME_CONFIG.clickSparks; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(30, 70);
      const spark = this.add.circle(x, y, Phaser.Math.Between(2, 4), COLORS.gold).setDepth(9);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 350,
        onComplete: () => spark.destroy(),
      });
    }
  }

  private findRow(def: UpgradeDef): UpgradeRow | undefined {
    for (const column of this.columns) {
      const row = column.rows.find((r) => r.def.id === def.id);
      if (row) return row;
    }
    return undefined;
  }

  private denyRow(row: UpgradeRow): void {
    this.tweens.killTweensOf(row.container);
    row.container.setX(row.x);
    this.tweens.add({ targets: row.container, x: row.x + 5, duration: 40, yoyo: true, repeat: 2 });
    row.denyUntil = this.time.now + 1200;
  }

  private celebrateRow(row: UpgradeRow, cost: number): void {
    this.tweens.killTweensOf(row.flash);
    row.flash.setAlpha(0.6);
    this.tweens.add({ targets: row.flash, alpha: 0, duration: 400 });
    this.tweens.killTweensOf(row.count);
    row.count.setScale(1.4);
    this.tweens.add({ targets: row.count, scale: 1, duration: 250, ease: 'Back.Out' });
    this.floatText(row.x + ROW_W - 52, row.container.y + 46, `−${formatNumber(cost)}`, TEXT.danger, 18, 22);
  }

  private createHeader(): void {
    const { width } = this.scale;
    const cx = width / 2;

    const title = this.add
      .text(cx, 6, 'КАБИНЕТ ГЛАВЫ ГОСУДАРСТВА', { fontFamily: FONT_HEAD, fontSize: '18px', color: TEXT.cream, fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    const half = title.width / 2 + 14;
    for (const side of [-1, 1]) {
      this.add.rectangle(cx + side * half, 17, 70, 1, COLORS.brass, 0.7).setOrigin(side === 1 ? 0 : 1, 0.5);
      this.add.rectangle(cx + side * (half + 76), 17, 5, 5, COLORS.brass).setAngle(45);
    }

    this.powerIcon = this.createCoin(cx - 120, 50);
    this.powerText = this.add
      .text(cx, 50, '', {
        fontFamily: FONT_HEAD,
        fontSize: '32px',
        color: TEXT.gold,
        fontStyle: 'bold',
        stroke: '#2b1608',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add.rectangle(cx, 74, 1, 28, COLORS.brass, 0.6).setOrigin(0.5, 0);
    this.clickStat = this.createStat(cx - 110, 'ЗА КЛИК');
    this.secStat = this.createStat(cx + 110, 'В СЕКУНДУ');

    this.sanctionsText = this.add.text(16, 58, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: TEXT.danger,
      fontStyle: 'bold',
    });
  }

  private createCoin(x: number, y: number): Phaser.GameObjects.Container {
    const outer = this.add.circle(0, 0, 17, COLORS.gold).setStrokeStyle(3, 0xb45309);
    const inner = this.add.circle(0, 0, 11).setStrokeStyle(1, 0xb45309);
    const star = this.add.text(0, 0, '★', { fontFamily: FONT, fontSize: '15px', color: '#92400e' }).setOrigin(0.5);
    return this.add.container(x, y, [outer, inner, star]);
  }

  private createStat(x: number, label: string): Phaser.GameObjects.Text {
    this.add.text(x, 72, label, { fontFamily: FONT, fontSize: '10px', color: '#c9b48a' }).setOrigin(0.5, 0);
    return this.add
      .text(x, 83, '', { fontFamily: FONT_HEAD, fontSize: '18px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0.5, 0);
  }

  private setTextColor(text: Phaser.GameObjects.Text, color: string): void {
    if (text.style.color !== color) text.setColor(color);
  }

  private popPower(): void {
    this.tweens.killTweensOf(this.powerText);
    this.powerText.setScale(1.08);
    this.tweens.add({ targets: this.powerText, scale: 1, duration: 140, ease: 'Quad.Out' });
  }

  private stampSeal(): void {
    this.tweens.killTweensOf(this.paperGroup);
    this.paperGroup.setScale(1).setY(DOC_Y);
    this.tweens.killTweensOf(this.seal);
    this.seal.setScale(1.6).setAlpha(0.3);
    this.tweens.add({
      targets: this.seal,
      scale: 1,
      alpha: 1,
      duration: 80,
      ease: 'Quad.In',
      onComplete: () => this.stampImpact(),
    });
  }

  private stampImpact(): void {
    this.tweens.killTweensOf(this.paperGroup);
    this.paperGroup.setScale(0.975).setY(DOC_Y + 3);
    this.tweens.add({ targets: this.paperGroup, scale: 1, y: DOC_Y, duration: 150, ease: 'Back.Out' });

    const ring = this.add.circle(LEFT_CX + 52, DOC_Y + 68, 26).setStrokeStyle(3, 0xfca5a5, 0.9).setDepth(9);
    this.tweens.add({
      targets: ring,
      scale: 1.9,
      alpha: 0,
      duration: 260,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
    this.cameras.main.shake(45, 0.0012);
  }

  private createDocument(x: number, y: number): void {
    const W = 210;
    const H = 230;
    const INK = COLORS.paperInk;

    this.paperGlow = this.add.rectangle(0, 0, W + 14, H + 14).setStrokeStyle(5, COLORS.gold);
    const shadowFar = this.add.rectangle(8, 12, W, H, 0x000000, 0.18);
    const shadowNear = this.add.rectangle(4, 6, W, H, 0x000000, 0.28);
    this.paper = this.add.rectangle(0, 0, W, H, COLORS.paper).setStrokeStyle(2, COLORS.paperEdge);
    const frame = this.add.rectangle(0, 0, W - 16, H - 16).setStrokeStyle(1, COLORS.brassDark, 0.55);
    const frame2 = this.add.rectangle(0, 0, W - 22, H - 22).setStrokeStyle(1, COLORS.brassDark, 0.3);

    const emblem = this.add.graphics({ x: 0, y: -84 });
    emblem.fillStyle(COLORS.brass, 1);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        emblem.fillTriangle(side * 9, -8 + i * 5, side * (44 - i * 7), -16 + i * 9, side * 9, -2 + i * 5);
      }
    }
    emblem.fillTriangle(-9, -13, -5, -23, -1, -13);
    emblem.fillTriangle(-5, -13, 0, -26, 5, -13);
    emblem.fillTriangle(1, -13, 5, -23, 9, -13);
    const shield = [
      new Phaser.Math.Vector2(-10, -12),
      new Phaser.Math.Vector2(10, -12),
      new Phaser.Math.Vector2(10, 4),
      new Phaser.Math.Vector2(0, 16),
      new Phaser.Math.Vector2(-10, 4),
    ];
    emblem.fillStyle(0x9a1b1b, 1);
    emblem.fillPoints(shield, true);
    emblem.lineStyle(2, COLORS.brass, 1);
    emblem.strokePoints(shield, true);
    emblem.fillStyle(COLORS.brass, 1);
    emblem.fillCircle(0, -2, 3);

    const title = this.add
      .text(0, -56, 'УКАЗ', { fontFamily: FONT_HEAD, fontSize: '24px', color: '#2a2118', fontStyle: 'bold' })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(0, -40, 'О ПЕРЕДАЧЕ ВСЕЙ ПОЛНОТЫ ВЛАСТИ', { fontFamily: FONT_HEAD, fontSize: '9px', color: '#5b4a2e', fontStyle: 'bold' })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 6; i++) {
      const w = i === 5 ? 90 : i === 0 ? 150 : 168;
      const left = i === 0 ? -70 : -84;
      lines.push(this.add.rectangle(left, -24 + i * 14, w, 3, INK, 0.38).setOrigin(0, 0.5));
    }

    const sig = this.add.graphics();
    sig.lineStyle(2, 0x1e3a8a, 0.9);
    sig.strokePoints(
      [
        [-82, 82],
        [-74, 66],
        [-68, 80],
        [-62, 70],
        [-56, 82],
        [-46, 74],
        [-34, 80],
        [-22, 72],
      ].map(([px, py]) => new Phaser.Math.Vector2(px, py)),
      false,
    );
    const sigLine = this.add.rectangle(-86, 88, 76, 1, INK, 0.5).setOrigin(0, 0.5);
    const sigLabel = this.add
      .text(-48, 98, 'Глава государства', { fontFamily: FONT_HEAD, fontSize: '9px', color: '#5b4a2e' })
      .setOrigin(0.5);

    const sg = this.add.graphics();
    sg.fillStyle(COLORS.sealRed, 0.15);
    sg.fillCircle(0, 0, 31);
    sg.fillStyle(COLORS.sealDark, 1);
    sg.fillCircle(1.5, 2, 28);
    sg.fillStyle(COLORS.sealRed, 0.95);
    sg.fillCircle(0, 0, 27);
    sg.lineStyle(2, 0xef4444, 0.9);
    sg.strokeCircle(-0.5, -0.5, 23);
    sg.lineStyle(1, COLORS.sealDark, 0.9);
    sg.strokeCircle(0.5, 0.5, 18);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      sg.fillStyle(0xfca5a5, 0.7);
      sg.fillCircle(Math.cos(a) * 20.5, Math.sin(a) * 20.5, 1);
    }
    const starDark = this.add.text(1, 1, '★', { fontFamily: FONT, fontSize: '24px', color: '#7f1d1d' }).setOrigin(0.5);
    const starLight = this.add.text(0, 0, '★', { fontFamily: FONT, fontSize: '24px', color: '#fecaca' }).setOrigin(0.5);
    this.seal = this.add.container(52, 68, [sg, starDark, starLight]).setRotation(-0.2);

    this.paperGroup = this.add.container(x, y, [
      this.paperGlow,
      shadowFar,
      shadowNear,
      this.paper,
      frame,
      frame2,
      emblem,
      title,
      subtitle,
      ...lines,
      sig,
      sigLine,
      sigLabel,
      this.seal,
    ]);
    this.tweens.add({ targets: this.paperGlow, alpha: { from: 0.2, to: 1 }, duration: 500, yoyo: true, repeat: -1 });

    this.paper.setInteractive({ useHandCursor: true });
    this.paper.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      this.click(p.x, p.y, 'mouse');
    });
  }

  private createHint(): void {
    this.hintText = this.add
      .text(LEFT_CX, 142, '', { fontFamily: FONT, fontSize: '20px', color: TEXT.gold, fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    this.hintArrow = this.add
      .text(LEFT_CX, 170, '▼', { fontFamily: FONT, fontSize: '26px', color: TEXT.gold })
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
      this.hintText.setText('КЛИКАЙ ПО УКАЗУ!\nили жми ПРОБЕЛ').setFontSize(18).setColor(TEXT.gold);
    } else if (stage === 1) {
      this.hintText.setText('Копи Гос.власть и покупай\nулучшения справа →').setFontSize(16).setColor(TEXT.gold);
    } else {
      this.hintText.setText('КЛИКАЙ ПО УКАЗУ\nили ЖМИ ПРОБЕЛ').setFontSize(14).setColor(TEXT.muted);
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
    this.sfx.click();
    this.burst(x, y);

    this.stampSeal();
    this.popPower();

    const floating = this.add
      .text(x + Phaser.Math.Between(-20, 20), y - 10, `+${formatNumber(gain)}`, {
        fontFamily: FONT_HEAD,
        fontSize: '24px',
        color: TEXT.gold,
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
      { kind: 'click', title: 'ЛИЧНЫЕ ИНСТРУМЕНТЫ', x: 330 },
      { kind: 'passive', title: 'ВЫСТРАИВАНИЕ ВЕРТИКАЛИ', x: 635 },
    ];

    for (const def of defs) {
      this.add.text(def.x, COLUMN_TOP + 1, def.title, {
        fontFamily: FONT_HEAD,
        fontSize: '15px',
        color: TEXT.cream,
        fontStyle: 'bold',
      });
      this.add.rectangle(def.x, COLUMN_TOP + 25, ROW_W - 56, 2, BRANCH[def.kind].edge, 0.9).setOrigin(0, 0);

      const track = this.add.rectangle(def.x + ROW_W + 5, LIST_TOP, 5, LIST_H, COLORS.rowEdge, 0.5).setOrigin(0, 0);
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
        color: TEXT.gold,
        fontStyle: 'bold',
        padding: { x: 5, y: 2 },
      })
      .setInteractive({ useHandCursor: true });
  }

  private createRow(def: UpgradeDef, x: number): UpgradeRow {
    const branch = BRANCH[def.kind];
    const TX = 68;

    const glow = this.add.rectangle(-3, -3, ROW_W + 6, ROW_H + 6).setOrigin(0, 0).setStrokeStyle(2, COLORS.gold);
    const bg = this.add.rectangle(0, 0, ROW_W, ROW_H, branch.fill).setOrigin(0, 0).setStrokeStyle(2, branch.edge);

    const decor: Phaser.GameObjects.GameObject[] = [];
    if (def.kind === 'click') {
      const corners: Array<[number, number]> = [
        [5, 5],
        [ROW_W - 5, 5],
        [5, ROW_H - 5],
        [ROW_W - 5, ROW_H - 5],
      ];
      for (const [cx, cy] of corners) decor.push(this.add.circle(cx, cy, 2, branch.accent));
    } else {
      decor.push(this.add.rectangle(4, 4, ROW_W - 8, ROW_H - 8).setOrigin(0, 0).setStrokeStyle(1, branch.inner, 0.8));
      decor.push(this.add.rectangle(0, 0, 4, ROW_H, branch.edge).setOrigin(0, 0));
    }

    const progress = this.add.rectangle(0, ROW_H - 3, ROW_W, 3, branch.accent).setOrigin(0, 0);
    const shade = this.add.rectangle(0, 0, ROW_W, ROW_H, 0x000000, 0.32).setOrigin(0, 0);
    const flash = this.add.rectangle(0, 0, ROW_W, ROW_H, COLORS.white, 0).setOrigin(0, 0);

    const ring = this.add.circle(34, 31, 21, branch.medal).setStrokeStyle(3, branch.edge);
    const icon = this.add
      .text(34, 31, UPGRADE_ICONS[def.id] ?? '★', { fontFamily: FONT, fontSize: '21px', color: TEXT.white })
      .setOrigin(0.5);
    const stars = this.add.text(34, 60, '', { fontFamily: FONT, fontSize: '9px', color: TEXT.gold }).setOrigin(0.5);

    const name = this.add.text(TX, 7, def.name, { fontFamily: FONT, fontSize: '15px', color: TEXT.white, fontStyle: 'bold' });
    let nameSize = 15;
    while (name.width > ROW_W - TX - 10 && nameSize > 10) {
      nameSize -= 1;
      name.setFontSize(nameSize);
    }
    const description = this.add.text(TX, 28, def.description, { fontFamily: FONT, fontSize: '13px', color: TEXT.muted });
    const cost = this.add.text(TX, 49, '', { fontFamily: FONT, fontSize: '14px', color: TEXT.gold, fontStyle: 'bold' });
    const count = this.add
      .text(ROW_W - 12, 50, '', { fontFamily: FONT_HEAD, fontSize: '18px', color: TEXT.muted, fontStyle: 'bold' })
      .setOrigin(1, 0.5);

    const container = this.add.container(x, 0, [
      glow,
      bg,
      ...decor,
      progress,
      shade,
      flash,
      ring,
      icon,
      stars,
      name,
      description,
      cost,
      count,
    ]);
    const row: UpgradeRow = {
      def,
      container,
      bg,
      cost,
      count,
      name,
      progress,
      flash,
      glow,
      shade,
      ring,
      icon,
      stars,
      x,
      hover: false,
      denyUntil: 0,
    };

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.buy(def));
    bg.on('pointerover', () => (row.hover = true));
    bg.on('pointerout', () => (row.hover = false));
    return row;
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

  private refresh(delta = 16): void {
    const net = this.perSecond - this.drain;
    const netText = `${net < 0 ? '−' : ''}${formatNumber(Math.abs(net))}`;

    const k = 1 - Math.pow(0.001, delta / 1000);
    this.displayPower += (this.power - this.displayPower) * k;
    if (Math.abs(this.power - this.displayPower) < 0.5) this.displayPower = this.power;

    this.powerText.setText(`Гос.власть: ${formatNumber(this.displayPower)}`);
    this.powerIcon.setX(this.powerText.x - this.powerText.displayWidth / 2 - 28);
    this.clickStat.setText(formatNumber(this.perClick));
    this.secStat.setText(netText);
    this.setTextColor(this.secStat, net < 0 ? TEXT.danger : TEXT.white);

    const now = this.time.now;
    for (const column of this.columns) {
      for (const row of column.rows) {
        const branch = BRANCH[row.def.kind];
        const cost = this.costOf(row.def);
        const owned = this.count(row.def.id);
        const tier = tierOf(owned);
        const affordable = this.power >= cost;

        row.cost.setText(now < row.denyUntil ? `Не хватает: ${formatNumber(cost - this.power)}` : formatNumber(cost));
        this.setTextColor(row.cost, affordable ? TEXT.gold : TEXT.danger);

        row.count.setText(owned > 0 ? `×${owned}` : '');
        this.setTextColor(row.count, TIER_TEXT[tier]);
        row.stars.setText('★'.repeat(tier));
        const tierEdge = tier > 0 ? TIER_COLORS[tier] : branch.edge;
        row.ring.setStrokeStyle(tier > 0 ? 4 : 3, tierEdge);

        row.bg.setFillStyle(affordable ? branch.ready : row.hover ? branch.hover : branch.fill);
        row.bg.setStrokeStyle(
          affordable || row.hover ? 3 : 2,
          affordable ? COLORS.gold : row.hover ? branch.accent : tierEdge,
        );
        row.glow.setVisible(affordable).setAlpha(0.3 + 0.3 * Math.sin(now / 260));
        row.shade.setVisible(!affordable && !row.hover);
        row.progress.setVisible(!affordable).setScale(Math.min(1, this.power / cost), 1);
        row.name.setAlpha(affordable ? 1 : 0.7);
        row.icon.setAlpha(affordable ? 1 : 0.5);
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