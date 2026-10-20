import Phaser from 'phaser';
import { UPGRADES, UpgradeDef, UpgradeKind, formatNumber, upgradeCost } from './upgrades';
import { GAME_CONFIG } from './gameConfig';

const FONT = 'system-ui, sans-serif';

const SANCTIONS_INCOME_PCT = Math.round(GAME_CONFIG.sanctionsIncomePenalty * 100);
const SANCTIONS_PRICE_PCT = Math.round(GAME_CONFIG.sanctionsPriceMarkup * 100);

interface UpgradeRow {
  def: UpgradeDef;
  bg: Phaser.GameObjects.Rectangle;
  cost: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private power = 0;
  private owned: Record<string, number> = {};
  private elapsed = 0;
  private gameOver = false;
  private paused = false;

  private wave = 0;
  private rallyActive = false;
  private rallyAt: number | null = null;
  private nextWarningAt = GAME_CONFIG.firstWarningAt;

  private buffAvailable = false;
  private buffEndsAt = 0;
  private nextBuffAt = GAME_CONFIG.buffFirstAt;

  private sanctions = false;

  private paper!: Phaser.GameObjects.Rectangle;
  private paperGroup!: Phaser.GameObjects.Container;
  private powerText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private sanctionsText!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private disperseBtn!: Phaser.GameObjects.Rectangle;
  private disperseText!: Phaser.GameObjects.Text;
  private effectsWindow!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private buffButton!: Phaser.GameObjects.Container;
  private buffLabel!: Phaser.GameObjects.Text;
  private buffBar!: Phaser.GameObjects.Rectangle;
  private upgradesText!: Phaser.GameObjects.Text;
  private buffsText!: Phaser.GameObjects.Text;
  private debuffsText!: Phaser.GameObjects.Text;
  private rows: UpgradeRow[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.rows = [];
    this.elapsed = 0;
    this.gameOver = false;
    this.paused = false;
    this.tweens.resumeAll();
    this.wave = 0;
    this.rallyActive = false;
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

    this.createDocument(190, 350);
    this.createUpgradePanel();
    this.createBanner();
    this.createBuffButton();
    this.createEffectsWindow();
    this.createRestartButton();
    this.createPauseOverlay();

    this.add
      .text(190, 172, 'КЛИКАЙ ПО ДОКУМЕНТУ\nили ЖМИ ПРОБЕЛ', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#f1f5f9',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    this.input.keyboard?.on('keydown-SPACE', () => this.click(190, 320));
    this.input.keyboard?.on('keydown-E', () => this.toggleEffects());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
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

  private get drain(): number {
    if (!this.rallyActive) return 0;
    const flat = GAME_CONFIG.rallyDrainFlat * Math.pow(GAME_CONFIG.rallyDrainGrowth, this.wave - 1);
    return Math.round(flat + GAME_CONFIG.rallyDrainIncomeShare * this.perSecond + GAME_CONFIG.rallyDrainPowerShare * this.power);
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
      this.showToast(
        `⚠ ВТОРАЯ ФАЗА: САНКЦИИ\nДоход −${SANCTIONS_INCOME_PCT}%, цены улучшений +${SANCTIONS_PRICE_PCT}%`,
        0xea580c,
      );
    }

    if (this.rallyAt === null && this.elapsed >= this.nextWarningAt) {
      this.rallyAt = this.nextWarningAt + GAME_CONFIG.warningLead;
      this.cameras.main.flash(300, 255, 160, 0);
      this.showToast('⚠ СОБЫТИЕ\nЧерез 30 секунд оппозиция проведёт митинг!', 0xd97706);
    }

    if (this.rallyAt !== null && this.elapsed >= this.rallyAt) {
      const startedAt = this.rallyAt;
      const wasActive = this.rallyActive;

      this.wave += 1;
      this.rallyActive = true;
      this.rallyAt = null;
      const interval = Phaser.Math.Between(GAME_CONFIG.rallyIntervalMin, GAME_CONFIG.rallyIntervalMax);
      this.nextWarningAt = startedAt + interval - GAME_CONFIG.warningLead;

      this.cameras.main.shake(300, 0.006);
      this.showToast(wasActive
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

  private createBanner(): void {
    this.bannerBg = this.add.rectangle(320, 578, 395, 56, 0x56729a).setOrigin(0, 0).setVisible(false);
    this.bannerText = this.add
      .text(335, 606, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold', lineSpacing: 4 })
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.disperseBtn = this.add
      .rectangle(730, 578, 185, 56, 0x2f86c6)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.disperseText = this.add
      .text(822.5, 606, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5)
      .setVisible(false);

    this.disperseBtn.on('pointerdown', () => this.disperse());
  }

  private updateBanner(): void {
    const warning = this.rallyAt !== null;
    const show = this.rallyActive || warning;

    this.bannerBg.setVisible(show);
    this.bannerText.setVisible(show);
    this.disperseBtn.setVisible(this.rallyActive);
    this.disperseText.setVisible(this.rallyActive);
    if (!show) return;

    const lines: string[] = [];
    if (this.rallyActive) lines.push(`✊ Митинг: −${formatNumber(this.drain)} Гос.власти/с`);
    if (this.rallyAt !== null) {
      lines.push(`⚠ Новый митинг через ${Math.ceil((this.rallyAt - this.elapsed) / 1000)} с`);
    }
    this.bannerText.setText(lines.join('\n'));
    this.bannerBg.setFillStyle(this.rallyActive ? 0xdc2626 : 0xd97706);

    if (this.rallyActive) {
      const affordable = this.power >= this.disperseCost;
      this.disperseText.setText(`Разогнать\n${formatNumber(this.disperseCost)}`);
      this.disperseBtn.setFillStyle(affordable ? 0x2f86c6 : 0x7b8fae);
      this.disperseText.setAlpha(affordable ? 1 : 0.6);
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

  private createBuffButton(): void {
    const bg = this.add
      .rectangle(0, 0, 210, 64, 0x8b5cf6)
      .setStrokeStyle(3, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.buffLabel = this.add
      .text(0, -3, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    this.buffBar = this.add.rectangle(-105, 29, 210, 5, 0xfde047).setOrigin(0, 0.5);
    this.buffButton = this.add.container(190, 552, [bg, this.buffLabel, this.buffBar]).setVisible(false);

    bg.on('pointerdown', () => this.collectBuff());
    bg.on('pointerover', () => bg.setFillStyle(0xa78bfa));
    bg.on('pointerout', () => bg.setFillStyle(0x8b5cf6));
  }

  private scheduleNextBuff(): void {
    this.nextBuffAt = this.elapsed + Phaser.Math.Between(GAME_CONFIG.buffIntervalMin, GAME_CONFIG.buffIntervalMax);
  }

  private updateBuff(): void {
    if (!this.buffAvailable && this.elapsed >= this.nextBuffAt) {
      this.buffAvailable = true;
      this.buffEndsAt = this.elapsed + GAME_CONFIG.buffLifetime;
      this.buffButton.setVisible(true).setScale(0.6);
      this.tweens.add({ targets: this.buffButton, scale: 1, duration: 250, ease: 'Back.Out' });
    } else if (this.buffAvailable && this.elapsed >= this.buffEndsAt) {
      this.buffAvailable = false;
      this.buffButton.setVisible(false);
      this.scheduleNextBuff();
    }
  }

  private collectBuff(): void {
    if (!this.buffAvailable || this.gameOver || this.paused) return;

    this.power += GAME_CONFIG.buffReward;
    this.buffAvailable = false;
    this.buffButton.setVisible(false);
    this.scheduleNextBuff();

    const floating = this.add
      .text(190, 515, `+${GAME_CONFIG.buffReward}`, {
        fontFamily: FONT,
        fontSize: '28px',
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
    this.buffLabel.setText(`Посадить видного\nоппозиционера\n+${GAME_CONFIG.buffReward} власти • ${Math.ceil(left / 1000)} с`);
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
    const upgrades = UPGRADES.filter((u) => this.count(u.id) > 0).map((u) => {
      const total = formatNumber(u.value * this.count(u.id));
      const effect = u.kind === 'click' ? `+${total} за клик` : `+${total} в секунду`;
      return `• ${u.name} ×${this.count(u.id)}: ${effect}`;
    });
    this.upgradesText.setText(upgrades.length ? upgrades.join('\n') : 'Пока нет улучшений.\nКупите их.');

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
    this.buffButton.setVisible(false);
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
    this.paper = this.add.rectangle(0, 0, 230, 300, 0xf8fafc).setStrokeStyle(4, 0x94a3b8);
    const title = this.add
      .text(0, -125, 'УКАЗ', { fontFamily: FONT, fontSize: '30px', color: '#0f172a', fontStyle: 'bold' })
      .setOrigin(0.5);

    const lines: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 6; i++) {
      lines.push(this.add.rectangle(0, -80 + i * 22, i === 5 ? 110 : 180, 6, 0xcbd5e1));
    }
    const seal = this.add.circle(60, 95, 30, 0xdc2626, 0.85);
    const sealStar = this.add.text(60, 95, '★', { fontFamily: FONT, fontSize: '28px', color: '#fee2e2' }).setOrigin(0.5);

    this.paperGroup = this.add.container(x, y, [this.paper, title, ...lines, seal, sealStar]);

    this.paper.setInteractive({ useHandCursor: true });
    this.paper.on('pointerdown', (p: Phaser.Input.Pointer) => this.click(p.x, p.y));
  }

  private click(x: number, y: number): void {
    if (this.gameOver || this.paused) return;

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
    const columns: { kind: UpgradeKind; title: string; x: number }[] = [
      { kind: 'click', title: 'ЛИЧНЫЕ ИНСТРУМЕНТЫ', x: 320 },
      { kind: 'passive', title: 'ВЫСТРАИВАНИЕ ВЕРТИКАЛИ', x: 625 },
    ];
    const top = 135;
    const rowH = 72;
    const gap = 6;
    const w = 290;

    for (const col of columns) {
      this.add.text(col.x, top, col.title, { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' });

      UPGRADES.filter((u) => u.kind === col.kind).forEach((def, i) => {
        const ry = top + 32 + i * (rowH + gap);
        const bg = this.add.rectangle(col.x, ry, w, rowH, 0x56729a).setOrigin(0, 0).setStrokeStyle(2, 0x7f9bc0);
        const name = this.add.text(col.x + 12, ry + 7, def.name, { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
        let nameSize = 15;
        while (name.width > w - 24 && nameSize > 10) {
          nameSize -= 1;
          name.setFontSize(nameSize);
        }
        this.add.text(col.x + 12, ry + 28, def.description, { fontFamily: FONT, fontSize: '13px', color: '#e2e8f0' });
        const cost = this.add.text(col.x + 12, ry + 49, '', { fontFamily: FONT, fontSize: '15px', color: '#fde047' });
        const count = this.add
          .text(col.x + w - 12, ry + 50, '', { fontFamily: FONT, fontSize: '13px', color: '#e2e8f0' })
          .setOrigin(1, 0);

        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this.buy(def));
        bg.on('pointerover', () => bg.setStrokeStyle(2, 0xfde047));
        bg.on('pointerout', () => bg.setStrokeStyle(2, 0x7f9bc0));

        this.rows.push({ def, bg, cost, count, name });
      });
    }
  }

  private refresh(): void {
    const net = this.perSecond - this.drain;
    const netText = `${net < 0 ? '−' : ''}${formatNumber(Math.abs(net))}`;

    this.powerText.setText(`Гос.власть: ${formatNumber(this.power)}`);
    this.statsText.setText(`За клик: ${formatNumber(this.perClick)}   •   В секунду: ${netText}`);
    this.statsText.setColor(net < 0 ? '#fecaca' : '#e8eef7');

    for (const row of this.rows) {
      const cost = this.costOf(row.def);
      const affordable = this.power >= cost;
      row.cost.setText(formatNumber(cost));
      row.cost.setColor(affordable ? '#fde047' : '#fecaca');
      row.count.setText(`Куплено: ${this.count(row.def.id)}`);
      row.bg.setFillStyle(affordable ? 0x2f86c6 : 0x56729a);
      row.name.setAlpha(affordable ? 1 : 0.8);
    }

    this.updateSanctionsText();
    this.updateBanner();
    this.updateBuffUi();
    this.updateEffectsWindow();
  }

  private saveProgress(): void {
    if (this.gameOver) return;
    try {
      localStorage.setItem(GAME_CONFIG.saveKey, JSON.stringify({ power: this.power, owned: this.owned }));
    } catch {
    }
  }

  private clearSave(): void {
    try {
      localStorage.removeItem(GAME_CONFIG.saveKey);
    } catch {
      /* ignore */
    }
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