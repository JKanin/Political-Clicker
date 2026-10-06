import Phaser from 'phaser';
import { UPGRADES, UpgradeDef, UpgradeKind, formatNumber, upgradeCost } from './upgrades';

const SAVE_KEY = 'state-clicker-save-v1';
const FONT = 'system-ui, sans-serif';

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

  private paper!: Phaser.GameObjects.Rectangle;
  private paperGroup!: Phaser.GameObjects.Container;
  private powerText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private rows: UpgradeRow[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.rows = [];
    this.loadProgress();

    const { width } = this.scale;

    this.add
      .text(width / 2, 16, 'КАБИНЕТ ГЛАВЫ ГОСУДАРСТВА', { fontFamily: FONT, fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5, 0);

    this.powerText = this.add
      .text(width / 2, 48, '', { fontFamily: FONT, fontSize: '34px', color: '#facc15', fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    this.statsText = this.add
      .text(width / 2, 94, '', { fontFamily: FONT, fontSize: '16px', color: '#cbd5e1', align: 'center' })
      .setOrigin(0.5, 0);

    this.createDocument(190, 350);
    this.createUpgradePanel();

    this.add
      .text(190, 560, 'Кликай по документу или жми ПРОБЕЛ', { fontFamily: FONT, fontSize: '14px', color: '#64748b' })
      .setOrigin(0.5, 0.5);

    this.input.keyboard?.on('keydown-SPACE', () => this.click(190, 320));

    this.time.addEvent({ delay: 5000, loop: true, callback: () => this.saveProgress() });
    this.refresh();
  }

  update(_time: number, delta: number): void {
    const perSecond = this.perSecond;
    if (perSecond > 0) this.power += (perSecond * delta) / 1000;
    this.refresh();
  }

  // ---------- Экономика ----------

  private get perClick(): number {
    return UPGRADES.reduce((sum, u) => (u.kind === 'click' ? sum + u.value * this.count(u.id) : sum), 1);
  }

  private get perSecond(): number {
    return UPGRADES.reduce((sum, u) => (u.kind === 'passive' ? sum + u.value * this.count(u.id) : sum), 0);
  }

  private count(id: string): number {
    return this.owned[id] ?? 0;
  }

  private buy(def: UpgradeDef): void {
    const cost = upgradeCost(def, this.count(def.id));
    if (this.power < cost) {
      this.cameras.main.shake(80, 0.002);
      return;
    }
    this.power -= cost;
    this.owned[def.id] = this.count(def.id) + 1;
    this.saveProgress();
  }

  // ---------- Интерфейс ----------

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
    const gain = this.perClick;
    this.power += gain;

    this.tweens.killTweensOf(this.paperGroup);
    this.paperGroup.setScale(0.94);
    this.tweens.add({ targets: this.paperGroup, scale: 1, duration: 120, ease: 'Back.Out' });

    const floating = this.add
      .text(x + Phaser.Math.Between(-20, 20), y - 10, `+${formatNumber(gain)}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#facc15',
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
      { kind: 'click', title: 'ЗА КЛИК', x: 320 },
      { kind: 'passive', title: 'ПАССИВНЫЙ ДОХОД', x: 625 },
    ];
    const top = 135;
    const rowH = 72;
    const gap = 6;
    const w = 290;

    for (const col of columns) {
      this.add.text(col.x, top, col.title, { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' });

      UPGRADES.filter((u) => u.kind === col.kind).forEach((def, i) => {
        const ry = top + 32 + i * (rowH + gap);
        const bg = this.add.rectangle(col.x, ry, w, rowH, 0x1e293b).setOrigin(0, 0).setStrokeStyle(2, 0x334155);
        const name = this.add.text(col.x + 12, ry + 7, def.name, { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
        this.add.text(col.x + 12, ry + 28, def.description, { fontFamily: FONT, fontSize: '13px', color: '#94a3b8' });
        const cost = this.add.text(col.x + 12, ry + 49, '', { fontFamily: FONT, fontSize: '15px', color: '#facc15' });
        const count = this.add
          .text(col.x + w - 12, ry + 50, '', { fontFamily: FONT, fontSize: '13px', color: '#94a3b8' })
          .setOrigin(1, 0);

        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this.buy(def));
        bg.on('pointerover', () => bg.setStrokeStyle(2, 0x38bdf8));
        bg.on('pointerout', () => bg.setStrokeStyle(2, 0x334155));

        this.rows.push({ def, bg, cost, count, name });
      });
    }
  }

  private refresh(): void {
    this.powerText.setText(`Гос.власть: ${formatNumber(this.power)}`);
    this.statsText.setText(`За клик: ${formatNumber(this.perClick)}   •   В секунду: ${formatNumber(this.perSecond)}`);

    for (const row of this.rows) {
      const cost = upgradeCost(row.def, this.count(row.def.id));
      const affordable = this.power >= cost;
      row.cost.setText(formatNumber(cost));
      row.cost.setColor(affordable ? '#facc15' : '#ef4444');
      row.count.setText(`Куплено: ${this.count(row.def.id)}`);
      row.bg.setFillStyle(affordable ? 0x1e3a5f : 0x1e293b);
      row.name.setAlpha(affordable ? 1 : 0.6);
    }
  }

  // ---------- Сохранение ----------

  private saveProgress(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ power: this.power, owned: this.owned }));
    } catch {
      /* хранилище недоступно — играем без сохранения */
    }
  }

  private loadProgress(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
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