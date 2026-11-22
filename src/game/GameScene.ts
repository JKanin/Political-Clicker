import Phaser from 'phaser';
import { UPGRADES, UpgradeDef, UpgradeKind, formatNumber, upgradeCost } from './upgrades';
import { GAME_CONFIG } from './gameConfig';
import { Sfx } from './audio';
import { BRANCH, COLORS, FONT, FONT_HEAD, TEXT, TIER_COLORS, TIER_TEXT, tierOf } from './theme';
import { FLOOR_NAMES, UPGRADE_ICONS } from './icons';
import { JailGame } from './jailGame';
import { NewspaperEvent } from './NewspaperEvent';
import {
  ActiveMod,
  EVENTS,
  EventChoice,
  EventDef,
  EventEffect,
  EventLine,
  MOD_STATS,
  ModStat,
  describeMod,
  modIsGood,
} from './events';

const SANCTIONS_INCOME_PCT = Math.round(GAME_CONFIG.sanctionsIncomePenalty * 100);
const SANCTIONS_PRICE_PCT = Math.round(GAME_CONFIG.sanctionsPriceMarkup * 100);

const ROW_H = 70;
const ROW_GAP = 6;
const ROW_PITCH = ROW_H + ROW_GAP;
const FLOOR_PAD = 20;

let PORTRAIT = false;
let LEFT_X = 331;
let LEFT_W = 288;
let LEFT_CX = 475;
let DOC_CX = 475;
let DOC_Y = 300;
let HINT_X = 475;
let HINT_Y = 142;
let HEADER_H = 112;
let STAT_Y = 72;
let COLUMN_TOP = 135;
let LIST_TOP = 167;
let ROW_W = 290;
let VISIBLE_ROWS = 6;
let LIST_H = VISIBLE_ROWS * ROW_PITCH - ROW_GAP;
let COLUMN_X: [number, number] = [650, 955];
let FLOORS_X = 14;
let FLOORS_W = 290;
let FLOOR_ICON_PX = 22;
let RALLY_Y = 428;
let BUFF_Y = 542;
let TOAST_Y = 290;
let SANC_X = 370;
let SANC_Y = 164;
let SANC_W = 210;

function applyLayout(width: number, height: number): void {
  PORTRAIT = width < height;
  if (PORTRAIT) {
    HEADER_H = 124;
    STAT_Y = 86;
    LEFT_X = 240;
    LEFT_W = 224;
    DOC_CX = 121;
    DOC_Y = 276;
    HINT_X = 352;
    HINT_Y = 200;
    RALLY_Y = 136;
    BUFF_Y = 256;
    TOAST_Y = 345;
    SANC_X = 240;
    SANC_Y = 350;
    SANC_W = 224;
    COLUMN_TOP = 402;
    LIST_TOP = COLUMN_TOP + 40;
    ROW_W = 440;
    COLUMN_X = [16, 16];
    FLOORS_X = 16;
    FLOORS_W = 440;
    FLOOR_ICON_PX = 30;
    VISIBLE_ROWS = Math.max(3, Math.floor((height - LIST_TOP - 12 + ROW_GAP) / ROW_PITCH));
  } else {
    HEADER_H = 112;
    STAT_Y = 72;
    LEFT_X = 331;
    LEFT_W = 288;
    DOC_CX = 475;
    DOC_Y = 300;
    HINT_X = 475;
    HINT_Y = 142;
    RALLY_Y = 428;
    BUFF_Y = 542;
    TOAST_Y = 290;
    SANC_X = 370;
    SANC_Y = 164;
    SANC_W = 210;
    COLUMN_TOP = 135;
    LIST_TOP = COLUMN_TOP + 32;
    ROW_W = 290;
    COLUMN_X = [650, 955];
    FLOORS_X = 14;
    FLOORS_W = 290;
    FLOOR_ICON_PX = 22;
    VISIBLE_ROWS = 6;
  }
  LEFT_CX = LEFT_X + LEFT_W / 2;
  LIST_H = VISIBLE_ROWS * ROW_PITCH - ROW_GAP;
}

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
  revealed: boolean;
}

interface FloorRow {
  def: UpgradeDef;
  container: Phaser.GameObjects.Container;
  sprites: Phaser.GameObjects.Text[];
  count: Phaser.GameObjects.Text;
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
  private sanctionsWave = 0;
  private sanctionsProgress = 0;
  private sanctionsNextAt = 0;

  private jail: JailGame | null = null;

  private newspaper: NewspaperEvent | null = null;
  private seenEvents: string[] = [];
  private mods: ActiveMod[] = [];
  private nextEventAt = GAME_CONFIG.eventFirstAt;

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
  private bypassBar!: Phaser.GameObjects.Container;
  private bypassFill!: Phaser.GameObjects.Rectangle;
  private bypassText!: Phaser.GameObjects.Text;
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
  private debuffsTitle!: Phaser.GameObjects.Text;
  private columns: UpgradeColumn[] = [];
  private revealAnimations = false;
  private floors: FloorRow[] = [];
  private floorOffset = 0;
  private floorUpBtn!: Phaser.GameObjects.Text;
  private floorDownBtn!: Phaser.GameObjects.Text;
  private floorEmpty!: Phaser.GameObjects.Text;
  private activeTab = 0;
  private tabButtons: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private dragMoved = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    applyLayout(this.scale.width, this.scale.height);
    this.sharpenText();
    this.columns = [];
    this.revealAnimations = false;
    this.floors = [];
    this.floorOffset = 0;
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
    this.sanctionsWave = 0;
    this.sanctionsProgress = 0;
    this.sanctionsNextAt = 0;
    this.jail = null;
    this.newspaper = null;
    this.nextEventAt = GAME_CONFIG.eventFirstAt;
    this.disperseDenyUntil = 0;
    this.loadProgress();
    this.displayPower = this.power;
    this.rallyLevel = 0;
    this.sfx = new Sfx();

    this.createBackdrop();
    this.createHeader();
    this.createDocument(DOC_CX, DOC_Y);
    this.createHint();
    this.createSanctionsBar();
    this.createUpgradePanel();
    this.createFloors();
    this.createTabs();
    this.revealAnimations = true;
    this.createEventCards();
    this.createEffectsWindow();
    this.createRestartButton();
    this.createPauseOverlay();

    this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (event.repeat) return;
      this.click(DOC_CX, DOC_Y - 20, 'space');
    });
    this.input.keyboard?.on('keydown-E', () => this.toggleEffects());
    this.input.keyboard?.on('keydown-M', () => this.toggleMute());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (this.gameOver || this.paused || this.jail || this.newspaper || this.effectsWindow.visible) return;
      this.scrollListAt(pointer.x, pointer.y, dy > 0 ? 1 : -1);
    });

    let dragFrom: number | null = null;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragMoved = false;
      dragFrom = pointer.y >= LIST_TOP && pointer.y <= LIST_TOP + LIST_H ? pointer.y : null;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || dragFrom === null) return;
      if (this.gameOver || this.paused || this.jail || this.newspaper || this.effectsWindow.visible) return;
      const dy = pointer.y - dragFrom;
      if (Math.abs(dy) > 10) this.dragMoved = true;
      if (Math.abs(dy) >= ROW_PITCH) {
        this.scrollListAt(pointer.x, pointer.y, dy < 0 ? 1 : -1);
        dragFrom = pointer.y;
      }
    });

    this.game.events.off('relayout', this.relayout, this);
    this.game.events.on('relayout', this.relayout, this);
    this.events.once('shutdown', () => this.game.events.off('relayout', this.relayout, this));

    this.time.addEvent({ delay: GAME_CONFIG.autosaveInterval, loop: true, callback: () => this.saveProgress() });
    this.refresh();
  }

  private relayout(): void {
    this.saveProgress();
    this.scene.restart();
  }

  private sharpenText(): void {
    const factory = this.add;
    Reflect.deleteProperty(factory, 'text');
    const scale = (this.scale.displaySize.width / this.scale.width) * (window.devicePixelRatio || 1);
    const resolution = Math.min(3, Math.max(1, scale));
    if (resolution < 1.1) return;
    const original = Phaser.GameObjects.GameObjectFactory.prototype.text.bind(factory);
    factory.text = ((...args: Parameters<typeof original>) => original(...args).setResolution(resolution)) as typeof original;
  }

  private tabVisible(index: number): boolean {
    return !PORTRAIT || this.activeTab === index;
  }

  private scrollListAt(x: number, y: number, direction: number): void {
    if (y < COLUMN_TOP || y > LIST_TOP + LIST_H) return;
    if (this.tabVisible(2) && x >= FLOORS_X - 4 && x <= FLOORS_X + FLOORS_W + 4) {
      this.scrollFloors(direction);
      return;
    }
    const column = this.columns.find((c, i) => this.tabVisible(i) && x >= c.x - 4 && x <= c.x + ROW_W + 14);
    if (column) this.scrollColumn(column, direction);
  }

  private createTabs(): void {
    this.tabButtons = [];
    if (!PORTRAIT) return;
    const labels = ['ИНСТРУМЕНТЫ', 'ВЕРТИКАЛЬ', 'ЭТАЖИ'];
    const gap = 6;
    const w = Math.floor((ROW_W - gap * 2) / 3);
    labels.forEach((text, i) => {
      const x = COLUMN_X[0] + i * (w + gap);
      const bg = this.add
        .rectangle(x, COLUMN_TOP, w, 34, COLORS.row)
        .setOrigin(0, 0)
        .setStrokeStyle(2, COLORS.rowEdge)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + w / 2, COLUMN_TOP + 17, text, { fontFamily: FONT_HEAD, fontSize: '13px', color: TEXT.cream, fontStyle: 'bold' })
        .setOrigin(0.5);
      bg.on('pointerdown', () => this.selectTab(i));
      this.tabButtons.push({ bg, label });
    });
    this.selectTab(this.activeTab);
  }

  private selectTab(index: number): void {
    this.activeTab = index;
    this.tabButtons.forEach((tab, i) => {
      const on = i === index;
      tab.bg.setFillStyle(on ? COLORS.rowHover : COLORS.row).setStrokeStyle(on ? 3 : 2, on ? COLORS.gold : COLORS.rowEdge);
      tab.label.setColor(on ? TEXT.gold : TEXT.cream);
    });
    for (const column of this.columns) this.layoutColumn(column);
    this.layoutFloors();
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.paused) return;

    if (this.jail) {
      this.jail.update(delta);
      return;
    }

    if (this.newspaper) return;

    this.elapsed += delta;
    this.updateEvent();
    this.updateSanctions(delta);
    this.updateBuff();
    this.updateNewspaperEvents();
    if (this.newspaper) return;

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
    const base = UPGRADES.reduce((sum, u) => (u.kind === 'click' ? sum + u.value * this.count(u.id) : sum), 1);
    return Math.max(1, Math.round(base * this.modFactor('click')));
  }

  private get perSecond(): number {
    const base = UPGRADES.reduce((sum, u) => (u.kind === 'passive' ? sum + u.value * this.count(u.id) : sum), 0);
    const afterSanctions = this.sanctions ? base * (1 - GAME_CONFIG.sanctionsIncomePenalty) : base;
    return afterSanctions * this.modFactor('income');
  }

  private get buffRewardNow(): number {
    const scaled =
      this.perClick * GAME_CONFIG.buffRewardClicks + this.perSecond * GAME_CONFIG.buffRewardIncomeSeconds;
    return Math.round(Math.max(GAME_CONFIG.buffReward, scaled));
  }

  private get passiveOwned(): number {
    return UPGRADES.reduce((sum, u) => (u.kind === 'passive' ? sum + this.count(u.id) : sum), 0);
  }

  private get bypassTarget(): number {
    return GAME_CONFIG.sanctionsBypassBase + GAME_CONFIG.sanctionsBypassStep * Math.max(0, this.sanctionsWave - 1);
  }

  private get jailRewardMax(): number {
    return Math.round(this.buffRewardNow * Math.max(...GAME_CONFIG.jailRewardMultipliers));
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
    return Math.round(base * (1 + GAME_CONFIG.rallyEscalationPerSecond * seconds) * this.modFactor('drain'));
  }

  private get disperseCost(): number {
    const flat = GAME_CONFIG.disperseCostFlat * Math.pow(GAME_CONFIG.disperseCostGrowth, Math.max(0, this.wave - 1));
    return Math.ceil(flat + GAME_CONFIG.disperseCostIncomeSeconds * this.perSecond);
  }

  private costOf(def: UpgradeDef): number {
    const base = upgradeCost(def, this.count(def.id));
    const withSanctions = this.sanctions ? base * (1 + GAME_CONFIG.sanctionsPriceMarkup) : base;
    return Math.ceil(withSanctions * this.modFactor('price'));
  }

  private count(id: string): number {
    return this.owned[id] ?? 0;
  }

  private buy(def: UpgradeDef): void {
    if (this.gameOver || this.paused || this.newspaper) return;
    const cost = this.costOf(def);
    const row = this.findRow(def);
    if (this.power < cost) {
      this.sfx.deny();
      if (row) this.denyRow(row);
      return;
    }
    this.power -= cost;
    this.owned[def.id] = this.count(def.id) + 1;
    for (const column of this.columns) this.layoutColumn(column);
    this.onFloorPurchased(def);
    this.sfx.buy();
    if (row) this.celebrateRow(row, cost);
    this.saveProgress();
  }

  private modFactor(stat: ModStat): number {
    return this.mods.reduce((factor, mod) => (mod.stat === stat ? factor * mod.multiplier : factor), 1);
  }

  private updateNewspaperEvents(): void {
    this.expireMods();

    if (this.elapsed < this.nextEventAt || this.rallyAt !== null) return;

    const owned = this.totalOwned;
    const ready = EVENTS.filter((e) => !this.seenEvents.includes(e.id) && owned >= e.minOwned);
    if (ready.length === 0) {
      this.nextEventAt = this.hasUnseenEvents() ? this.elapsed + GAME_CONFIG.eventRetryDelay : Infinity;
      return;
    }
    this.showNewspaper(Phaser.Utils.Array.GetRandom(ready));
  }

  private hasUnseenEvents(): boolean {
    return EVENTS.some((e) => !this.seenEvents.includes(e.id));
  }

  private showNewspaper(def: EventDef): void {
    this.effectsWindow.setVisible(false);
    this.nextEventAt = Infinity;
    this.newspaper = new NewspaperEvent(this, this.sfx, def, {
      preview: (choice) => this.eventLines(choice, def.short, false),
      apply: (choice) => {

        if (!this.seenEvents.includes(def.id)) this.seenEvents.push(def.id);
        const lines = this.eventLines(choice, def.short, true);
        this.saveProgress();
        return lines;
      },
      close: () => this.closeNewspaper(),
    });
  }

  private closeNewspaper(): void {
    this.newspaper = null;
    this.nextEventAt = this.hasUnseenEvents()
      ? this.elapsed + Phaser.Math.Between(GAME_CONFIG.eventIntervalMin, GAME_CONFIG.eventIntervalMax)
      : Infinity;
    this.refresh();
  }

  private eventLines(choice: EventChoice, label: string, apply: boolean): EventLine[] {
    return choice.effects.map((effect) => this.runEffect(effect, label, apply));
  }

  private runEffect(effect: EventEffect, label: string, apply: boolean): EventLine {
    if (effect.type === 'gain') {
      const reward = this.perClick * effect.clicks + this.perSecond * effect.seconds;
      const amount = Math.round(Math.max(GAME_CONFIG.eventMinReward, reward));
      if (apply) this.power += amount;
      return { text: `+${formatNumber(amount)} Гос.власти`, good: true };
    }
    if (effect.type === 'loss') {
      const amount = Math.floor(this.power * effect.share);
      if (apply) this.power -= amount;
      return { text: `−${Math.round(effect.share * 100)}% Гос.власти (−${formatNumber(amount)})`, good: false };
    }
    if (apply) {
      this.mods.push({
        stat: effect.stat,
        multiplier: effect.multiplier,
        endsAt: this.elapsed + effect.seconds * 1000,
        label,
      });
    }
    return {
      text: `${describeMod(effect.stat, effect.multiplier)} на ${effect.seconds} с`,
      good: modIsGood(effect.stat, effect.multiplier),
    };
  }

  private expireMods(): void {
    const expired = this.mods.filter((m) => m.endsAt <= this.elapsed);
    if (expired.length === 0) return;
    this.mods = this.mods.filter((m) => m.endsAt > this.elapsed);
    const names = Array.from(new Set(expired.map((m) => m.label))).join(', ');
    this.showToast(`⌛ Эффект закончился\n${names}`, COLORS.panelEdge);
  }

  private modLines(good: boolean): string[] {
    return this.mods
      .filter((m) => modIsGood(m.stat, m.multiplier) === good)
      .map((m) => {
        const left = Math.ceil(Math.max(0, m.endsAt - this.elapsed) / 1000);
        return `• ${m.label}: ${describeMod(m.stat, m.multiplier)} (${left} с)`;
      });
  }

  private updateEvent(): void {
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

  private updateSanctions(delta: number): void {
    if (this.sanctions) {
      const decay = (GAME_CONFIG.sanctionsBypassDecay * delta) / 1000;
      this.sanctionsProgress = Math.max(0, this.sanctionsProgress - decay);
      return;
    }
    const need = GAME_CONFIG.sanctionsStartPassive + GAME_CONFIG.sanctionsStartPassiveStep * this.sanctionsWave;
    if (this.elapsed >= this.sanctionsNextAt && this.passiveOwned >= need) this.startSanctions();
  }

  private startSanctions(): void {
    this.sanctions = true;
    this.sanctionsWave += 1;
    this.sanctionsProgress = 0;
    this.hintStage = -1;
    this.cameras.main.shake(300, 0.005);
    this.sfx.sanctions();
    this.flashBorder(COLORS.sanction);
    const title = this.sanctionsWave > 1 ? `САНКЦИИ: ВОЛНА ${this.sanctionsWave}` : 'ВТОРАЯ ФАЗА: САНКЦИИ';
    this.showToast(
      `⚠ ${title}\nДоход −${SANCTIONS_INCOME_PCT}%, цены улучшений +${SANCTIONS_PRICE_PCT}%\nПодпиши ${this.bypassTarget} указов, чтобы обойти их!`,
      COLORS.sanction,
    );
  }

  private addBypass(): void {
    this.sanctionsProgress += 1;
    if (this.sanctionsProgress >= this.bypassTarget) this.liftSanctions();
  }

  private liftSanctions(): void {
    this.sanctions = false;
    this.sanctionsProgress = 0;
    this.sanctionsNextAt = this.elapsed + GAME_CONFIG.sanctionsCooldown;
    this.hintStage = -1;
    this.sfx.success();
    this.cameras.main.flash(250, 34, 197, 94);
    this.showToast('✔ САНКЦИИ ОБОЙДЕНЫ\nДоход и цены вернулись в норму', COLORS.ok);
  }

  private disperse(): void {
    if (!this.rallyActive || this.gameOver || this.paused || this.newspaper) return;

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

  private createSanctionsBar(): void {
    const track = this.add.rectangle(0, 0, SANC_W, 20, 0x000000, 0.6).setOrigin(0, 0).setStrokeStyle(2, COLORS.sanction);
    this.bypassFill = this.add.rectangle(1, 1, SANC_W - 2, 18, COLORS.sanction).setOrigin(0, 0);
    this.bypassText = this.add
      .text(SANC_W / 2, 10, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: TEXT.white,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.bypassBar = this.add.container(SANC_X, SANC_Y, [track, this.bypassFill, this.bypassText]).setDepth(5).setVisible(false);
  }

  private createEventCards(): void {
    this.rallyGlow = this.add.rectangle(-4, -4, LEFT_W + 8, 112).setOrigin(0, 0).setStrokeStyle(4, COLORS.gold);
    this.rallyBg = this.add
      .rectangle(0, 0, LEFT_W, 104, COLORS.danger)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLORS.white);
    this.rallyTitle = this.add
      .text(12, 18, '', { fontFamily: FONT_HEAD, fontSize: PORTRAIT ? '13px' : '17px', color: TEXT.white, fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.rallyInfo = this.add.text(12, 31, '', {
      fontFamily: FONT,
      fontSize: PORTRAIT ? '12px' : '14px',
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
        fontSize: PORTRAIT ? '15px' : '17px',
        color: TEXT.white,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    this.buffSub = this.add
      .text(LEFT_W / 2, 61, '', {
        fontFamily: FONT,
        fontSize: PORTRAIT ? '12px' : '14px',
        color: '#fef9c3',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: LEFT_W - 16 },
      })
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
    if (PORTRAIT) this.hintText.setVisible(!show);
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
    const toastW = Math.min(560, width - 24);
    const bg = this.add.rectangle(0, 0, toastW, 90, color, 0.95).setStrokeStyle(3, COLORS.white);
    const text = this.add
      .text(0, 0, message, {
        fontFamily: FONT,
        fontSize: PORTRAIT ? '17px' : '20px',
        color: TEXT.white,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: toastW - 24 },
      })
      .setOrigin(0.5);
    const toast = this.add.container(width / 2, TOAST_Y, [bg, text]).setDepth(20).setAlpha(0);
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
    if (!this.buffAvailable || this.gameOver || this.paused || this.jail || this.newspaper) return;

    this.buffAvailable = false;
    this.buffCard.setVisible(false);
    this.jail = new JailGame(this, this.sfx, this.buffRewardNow, (reward) => this.finishJail(reward));
  }

  private finishJail(reward: number): void {
    this.jail = null;
    this.scheduleNextBuff();
    this.power += reward;
    this.sfx.buffCollect();

    const { width, height } = this.scale;
    const floating = this.add
      .text(width / 2, height / 2, `+${formatNumber(reward)}`, {
        fontFamily: FONT,
        fontSize: '36px',
        color: TEXT.ok,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: floating,
      y: floating.y - 90,
      alpha: 0,
      duration: 1000,
      onComplete: () => floating.destroy(),
    });
  }

  private updateSanctionsText(): void {
    this.bypassBar.setVisible(this.sanctions);
    if (!this.sanctions) {
      this.sanctionsText.setText('');
      return;
    }
    this.sanctionsText.setText(`⚠ Санкции: доход −${SANCTIONS_INCOME_PCT}%, цены +${SANCTIONS_PRICE_PCT}%`);
    const target = this.bypassTarget;
    this.bypassFill.setScale(Math.min(1, this.sanctionsProgress / target), 1);
    this.bypassText.setText(`Обход санкций: ${Math.floor(this.sanctionsProgress)} / ${target}`);
  }

  private updateBuffUi(): void {
    if (!this.buffAvailable) return;
    const left = Math.max(0, this.buffEndsAt - this.elapsed);
    const reward = `Мини-игра • до +${formatNumber(this.jailRewardMax)}`;
    this.buffSub.setText(PORTRAIT ? reward : `${reward} • ${Math.ceil(left / 1000)} с`);
    this.buffBar.setScale(left / GAME_CONFIG.buffLifetime, 1);
  }

  private createEffectsWindow(): void {
    const { width, height } = this.scale;
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
      .rectangle(0, 0, Math.min(480, width - 16), 480, COLORS.window, 0.98)
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
    const buffsTitle = head(-50, 'БАФФЫ', '#bbf7d0');
    this.buffsText = body(-24);
    this.debuffsTitle = head(60, 'ДЕБАФФЫ', TEXT.danger);
    this.debuffsText = body(86);

    this.effectsWindow = this.add
      .container(width / 2, height / 2, [
        bg,
        title,
        close,
        upgradesTitle,
        this.upgradesText,
        buffsTitle,
        this.buffsText,
        this.debuffsTitle,
        this.debuffsText,
      ])
      .setDepth(50)
      .setVisible(false);
  }

  private toggleEffects(): void {
    if (this.gameOver || this.paused || this.jail || this.newspaper) return;
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

    const buffs: string[] = [];
    if (this.buffAvailable) {
      const left = Math.ceil(Math.max(0, this.buffEndsAt - this.elapsed) / 1000);
      buffs.push(
        '• Посадить видного оппозиционера',
        `   Мини-игра: до +${formatNumber(this.jailRewardMax)} (осталось ${left} с)`,
      );
    }
    buffs.push(...this.modLines(true));
    this.buffsText.setText(buffs.length ? buffs.join('\n') : 'Нет активных баффов.');

    const debuffs: string[] = [];
    if (this.sanctions) {
      debuffs.push(
        '• Санкции',
        `   Доход −${SANCTIONS_INCOME_PCT}%, цены улучшений +${SANCTIONS_PRICE_PCT}%`,
        `   Обход: ${Math.floor(this.sanctionsProgress)} / ${this.bypassTarget} указов (кликайте по указу)`,
      );
    }
    if (this.rallyActive) {
      debuffs.push(
        `• Митинг оппозиции (волна ${this.wave}): −${formatNumber(this.drain)}/с`,
        `   Разогнать: ${formatNumber(this.disperseCost)} Гос.власти`,
      );
    }
    debuffs.push(...this.modLines(false));
    this.debuffsText.setText(debuffs.length ? debuffs.join('\n') : 'Нет активных дебаффов.');

    this.debuffsTitle.setY(this.buffsText.y + this.buffsText.height + 16);
    this.debuffsText.setY(this.debuffsTitle.y + 26);
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
    if (!PORTRAIT) {
      this.add.text(width - 16, 52, 'P / Esc — пауза', { fontFamily: FONT, fontSize: '12px', color: TEXT.muted }).setOrigin(1, 0);
    }
    this.muteLabel = this.add
      .text(PORTRAIT ? width / 2 : width - 16, PORTRAIT ? 25 : 68, '', {
        fontFamily: FONT,
        fontSize: PORTRAIT ? '14px' : '12px',
        color: TEXT.muted,
        padding: PORTRAIT ? { x: 10, y: 8 } : undefined,
      })
      .setOrigin(PORTRAIT ? 0.5 : 1, PORTRAIT ? 0.5 : 0)
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
        align: 'center',
        wordWrap: { width: width - 40 },
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
    if (this.textures.exists('desk-bg')) {
      const source = this.textures.get('desk-bg').getSourceImage();
      if (source.width !== width || source.height !== height) {
        this.textures.remove('desk-bg');
        this.textures.remove('rally-vignette');
      }
    }
    this.ensureTextures(width, height);

    this.add.image(0, 0, 'desk-bg').setOrigin(0, 0);
    this.rallyTint = this.add.rectangle(0, 0, width, height, 0x3b0a0a, 0).setOrigin(0, 0).setDepth(3);
    this.rallyVignette = this.add.image(0, 0, 'rally-vignette').setOrigin(0, 0).setAlpha(0).setDepth(4);

    this.add.rectangle(0, 0, width, HEADER_H, COLORS.header, 0.94).setOrigin(0, 0);
    this.add.rectangle(0, 0, width, 2, 0x6b4630).setOrigin(0, 0);
    this.add.rectangle(0, HEADER_H + 3, width, 8, 0x000000, 0.3).setOrigin(0, 0);
    this.add.rectangle(0, HEADER_H, width, 3, COLORS.brass).setOrigin(0, 0);

    const panel = (x: number, y: number, w: number, h: number): void => {
      this.add.rectangle(x + 5, y + 8, w, h, 0x000000, 0.45).setOrigin(0, 0);
      this.add.tileSprite(x, y, w, h, 'felt').setOrigin(0, 0);
      this.add.rectangle(x, y, w, h).setOrigin(0, 0).setStrokeStyle(3, COLORS.panelEdge);
      this.add.rectangle(x + 7, y + 7, w - 14, h - 14).setOrigin(0, 0).setStrokeStyle(1, COLORS.stitch, 0.5);
    };
    if (PORTRAIT) {
      panel(6, COLUMN_TOP - 8, width - 12, height - COLUMN_TOP + 2);
    } else {
      panel(6, 122, 306, 510);
      panel(638, 122, 634, 510);
    }
  }

  private toggleMute(): void {
    this.sfx.toggleMute();
    this.updateMuteLabel();
  }

  private updateMuteLabel(): void {
    this.muteLabel.setText(`${PORTRAIT ? 'Звук' : 'M — звук'}: ${this.sfx.muted ? 'выкл' : 'вкл'}`);
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

    if (!PORTRAIT) {
      const title = this.add
        .text(cx, 6, 'КАБИНЕТ ГЛАВЫ ГОСУДАРСТВА', { fontFamily: FONT_HEAD, fontSize: '18px', color: TEXT.cream, fontStyle: 'bold' })
        .setOrigin(0.5, 0);
      const half = title.width / 2 + 14;
      for (const side of [-1, 1]) {
        this.add.rectangle(cx + side * half, 17, 70, 1, COLORS.brass, 0.7).setOrigin(side === 1 ? 0 : 1, 0.5);
        this.add.rectangle(cx + side * (half + 76), 17, 5, 5, COLORS.brass).setAngle(45);
      }
    }

    const powerY = PORTRAIT ? 66 : 50;
    this.powerIcon = this.createCoin(cx - 120, powerY);
    this.powerText = this.add
      .text(cx, powerY, '', {
        fontFamily: FONT_HEAD,
        fontSize: PORTRAIT ? '28px' : '32px',
        color: TEXT.gold,
        fontStyle: 'bold',
        stroke: '#2b1608',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add.rectangle(cx, STAT_Y + 2, 1, 28, COLORS.brass, 0.6).setOrigin(0.5, 0);
    this.clickStat = this.createStat(cx - 110, 'ЗА КЛИК');
    this.secStat = this.createStat(cx + 110, 'В СЕКУНДУ');

    this.sanctionsText = this.add.text(16, PORTRAIT ? 130 : 58, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: TEXT.danger,
      fontStyle: 'bold',
      wordWrap: PORTRAIT ? { width: LEFT_X - 24 } : undefined,
    });
  }

  private createCoin(x: number, y: number): Phaser.GameObjects.Container {
    const outer = this.add.circle(0, 0, 17, COLORS.gold).setStrokeStyle(3, 0xb45309);
    const inner = this.add.circle(0, 0, 11).setStrokeStyle(1, 0xb45309);
    const star = this.add.text(0, 0, '★', { fontFamily: FONT, fontSize: '15px', color: '#92400e' }).setOrigin(0.5);
    return this.add.container(x, y, [outer, inner, star]);
  }

  private createStat(x: number, label: string): Phaser.GameObjects.Text {
    this.add.text(x, STAT_Y, label, { fontFamily: FONT, fontSize: '10px', color: '#c9b48a' }).setOrigin(0.5, 0);
    return this.add
      .text(x, STAT_Y + 11, '', { fontFamily: FONT_HEAD, fontSize: '18px', color: TEXT.white, fontStyle: 'bold' })
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

    const ring = this.add.circle(DOC_CX + 52, DOC_Y + 68, 26).setStrokeStyle(3, 0xfca5a5, 0.9).setDepth(9);
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
      .text(HINT_X, HINT_Y, '', { fontFamily: FONT, fontSize: '20px', color: TEXT.gold, fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    this.hintArrow = this.add
      .text(HINT_X, HINT_Y + 28, '▼', { fontFamily: FONT, fontSize: '26px', color: TEXT.gold })
      .setOrigin(0.5);
    this.tweens.add({ targets: this.hintArrow, y: HINT_Y + 35, duration: 380, yoyo: true, repeat: -1 });
  }

  private updateHint(): void {
    let stage = 2;
    if (this.totalOwned === 0) stage = this.clicks === 0 && this.power <= 0 ? 0 : 1;
    else if (this.sanctions) stage = 3;
    if (stage === this.hintStage) return;
    this.hintStage = stage;

    this.paperGlow.setVisible(stage === 0);
    this.hintArrow.setVisible(stage === 0 && !PORTRAIT);
    if (stage === 0) {
      const text = PORTRAIT ? 'КЛИКАЙ\nПО УКАЗУ!' : 'КЛИКАЙ ПО УКАЗУ!\nили жми ПРОБЕЛ';
      this.hintText.setText(text).setFontSize(18).setColor(TEXT.gold);
    } else if (stage === 1) {
      const text = PORTRAIT ? 'Копи Гос.власть и\nпокупай улучшения ↓' : 'Копи Гос.власть и покупай\nулучшения справа →';
      this.hintText.setText(text).setFontSize(16).setColor(TEXT.gold);
    } else if (stage === 3) {
      const text = PORTRAIT ? 'САНКЦИИ!\nКЛИКАЙ ПО УКАЗУ' : 'САНКЦИИ! ПОДПИСЫВАЙ УКАЗЫ\nО КОНТРСАНКЦИЯХ';
      this.hintText.setText(text).setFontSize(16).setColor('#fdba74');
    } else {
      const text = PORTRAIT ? 'КЛИКАЙ\nПО УКАЗУ' : 'КЛИКАЙ ПО УКАЗУ\nили ЖМИ ПРОБЕЛ';
      this.hintText.setText(text).setFontSize(14).setColor(TEXT.muted);
    }
  }

  private click(x: number, y: number, source: ClickSource): void {
    if (this.gameOver || this.paused || this.jail || this.newspaper) return;

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
    if (this.sanctions) this.addBypass();
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
      { kind: 'click', title: 'ЛИЧНЫЕ ИНСТРУМЕНТЫ', x: COLUMN_X[0] },
      { kind: 'passive', title: 'ВЫСТРАИВАНИЕ ВЕРТИКАЛИ', x: COLUMN_X[1] },
    ];

    for (const def of defs) {
      if (!PORTRAIT) {
        this.add.text(def.x, COLUMN_TOP + 1, def.title, {
          fontFamily: FONT_HEAD,
          fontSize: '15px',
          color: TEXT.cream,
          fontStyle: 'bold',
        });
        this.add.rectangle(def.x, COLUMN_TOP + 25, ROW_W - 56, 2, BRANCH[def.kind].edge, 0.9).setOrigin(0, 0);
      }

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

  private createFloors(): void {
    if (!PORTRAIT) {
      this.add.text(FLOORS_X, COLUMN_TOP + 1, 'ЭТАЖИ ВЛАСТИ', {
        fontFamily: FONT_HEAD,
        fontSize: '15px',
        color: TEXT.cream,
        fontStyle: 'bold',
      });
      this.add.rectangle(FLOORS_X, COLUMN_TOP + 25, FLOORS_W - 56, 2, COLORS.rowEdge, 0.9).setOrigin(0, 0);
    }

    this.floorUpBtn = this.createArrow(FLOORS_X + FLOORS_W - 44, '▲');
    this.floorDownBtn = this.createArrow(FLOORS_X + FLOORS_W - 18, '▼');
    this.floorUpBtn.on('pointerdown', () => this.scrollFloors(-1));
    this.floorDownBtn.on('pointerdown', () => this.scrollFloors(1));

    this.floorEmpty = this.add
      .text(FLOORS_X + FLOORS_W / 2, LIST_TOP + LIST_H / 2, 'Покупайте улучшения —\nздесь появятся этажи\nвашей власти', {
        fontFamily: FONT,
        fontSize: '15px',
        color: TEXT.muted,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    for (const id of Object.keys(this.owned)) {
      const def = UPGRADES.find((u) => u.id === id);
      if (!def || this.count(id) <= 0) continue;
      this.syncFloor(this.addFloor(def), false);
    }
    this.floorOffset = Number.MAX_SAFE_INTEGER;
    this.layoutFloors();
  }

  private addFloor(def: UpgradeDef): FloorRow {
    const branch = BRANCH[def.kind];
    const bg = this.add.rectangle(0, 0, FLOORS_W, ROW_H, branch.fill).setOrigin(0, 0).setStrokeStyle(2, branch.edge);
    const ground = this.add.rectangle(0, ROW_H - 10, FLOORS_W, 10, branch.medal).setOrigin(0, 0);
    const groundLine = this.add.rectangle(0, ROW_H - 10, FLOORS_W, 2, branch.edge).setOrigin(0, 0);
    const label = this.add
      .text(8, 4, FLOOR_NAMES[def.id] ?? def.name, { fontFamily: FONT, fontSize: '11px', color: TEXT.muted })
      .setAlpha(0.8);
    const count = this.add
      .text(FLOORS_W - 8, 3, '', { fontFamily: FONT_HEAD, fontSize: '13px', color: TEXT.muted, fontStyle: 'bold' })
      .setOrigin(1, 0);
    const container = this.add.container(FLOORS_X, 0, [bg, ground, groundLine, label, count]).setVisible(false);
    const floor: FloorRow = { def, container, sprites: [], count };
    this.floors.push(floor);
    return floor;
  }

  private syncFloor(floor: FloorRow, animate: boolean): void {
    const owned = this.count(floor.def.id);
    const shown = Math.min(owned, GAME_CONFIG.floorMaxSprites);
    const step = (FLOORS_W - 2 * FLOOR_PAD) / Math.max(1, GAME_CONFIG.floorMaxSprites - 1);
    while (floor.sprites.length < shown) {
      const i = floor.sprites.length;
      const sprite = this.add
        .text(FLOOR_PAD + i * step, ROW_H - 8, UPGRADE_ICONS[floor.def.id] ?? '★', { fontFamily: FONT, fontSize: `${FLOOR_ICON_PX}px` })
        .setOrigin(0.5, 1);
      floor.container.add(sprite);
      floor.sprites.push(sprite);
      if (animate) {
        sprite.setScale(0);
        this.tweens.add({ targets: sprite, scale: 1, duration: 350, ease: 'Back.Out' });
      }
    }
    floor.count.setText(`×${owned}`);
    this.setTextColor(floor.count, TIER_TEXT[tierOf(owned)]);
  }

  private onFloorPurchased(def: UpgradeDef): void {
    let floor = this.floors.find((f) => f.def.id === def.id);
    const isNew = !floor;
    if (!floor) floor = this.addFloor(def);
    this.syncFloor(floor, true);
    if (isNew) {
      this.floorOffset = Number.MAX_SAFE_INTEGER;
      this.layoutFloors();
      floor.container.setAlpha(0);
      this.tweens.add({ targets: floor.container, alpha: 1, duration: 400 });
    }
  }

  private scrollFloors(direction: number): void {
    this.floorOffset += direction;
    this.layoutFloors();
  }

  private layoutFloors(): void {
    const total = this.floors.length;
    const maxOffset = Math.max(0, total - VISIBLE_ROWS);
    this.floorOffset = Phaser.Math.Clamp(this.floorOffset, 0, maxOffset);

    const shown = this.tabVisible(2);
    this.floors.forEach((floor, i) => {
      const slot = i - this.floorOffset;
      const visible = shown && slot >= 0 && slot < VISIBLE_ROWS;
      floor.container.setVisible(visible);
      if (visible) floor.container.setPosition(FLOORS_X, LIST_TOP + slot * ROW_PITCH);
    });

    const arrows = maxOffset > 0 && shown && !PORTRAIT;
    this.floorUpBtn.setVisible(arrows).setAlpha(this.floorOffset > 0 ? 1 : 0.35);
    this.floorDownBtn.setVisible(arrows).setAlpha(this.floorOffset < maxOffset ? 1 : 0.35);
    this.floorEmpty.setVisible(total === 0 && shown);
  }

  private animateFloors(now: number): void {
    for (const floor of this.floors) {
      if (!floor.container.visible) continue;
      floor.sprites.forEach((sprite, i) => sprite.setY(ROW_H - 8 - 1.5 * (1 + Math.sin(now / 350 + i * 0.8))));
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
      revealed: false,
    };

    bg.setInteractive({ useHandCursor: true });
    if (PORTRAIT) {

      bg.on('pointerup', () => {
        row.hover = false;
        if (!this.dragMoved) this.buy(def);
      });
    } else {
      bg.on('pointerdown', () => this.buy(def));
    }
    bg.on('pointerover', () => (row.hover = true));
    bg.on('pointerout', () => (row.hover = false));
    return row;
  }

  private unlockedCount(column: UpgradeColumn): number {
    let lastOwned = -1;
    column.rows.forEach((row, i) => {
      if (this.count(row.def.id) > 0) lastOwned = i;
    });
    return Math.min(column.rows.length, lastOwned + 2);
  }

  private scrollColumn(column: UpgradeColumn, direction: number): void {
    column.offset += direction;
    this.layoutColumn(column);
  }

  private layoutColumn(column: UpgradeColumn): void {
    const total = this.unlockedCount(column);
    const maxOffset = Math.max(0, total - VISIBLE_ROWS);
    column.offset = Phaser.Math.Clamp(column.offset, 0, maxOffset);

    const shown = this.tabVisible(this.columns.indexOf(column));
    column.rows.forEach((row, i) => {
      const slot = i - column.offset;
      const unlocked = i < total;
      const visible = shown && unlocked && slot >= 0 && slot < VISIBLE_ROWS;
      row.container.setVisible(visible);
      if (visible) row.container.setPosition(column.x, LIST_TOP + slot * ROW_PITCH);
      if (unlocked && !row.revealed) {
        row.revealed = true;
        if (this.revealAnimations && visible) {
          row.container.setAlpha(0);
          this.tweens.add({ targets: row.container, alpha: 1, duration: 400, ease: 'Sine.Out' });
        }
      }
    });

    const scrollable = maxOffset > 0 && shown;
    column.upBtn.setVisible(scrollable && !PORTRAIT).setAlpha(column.offset > 0 ? 1 : 0.35);
    column.downBtn.setVisible(scrollable && !PORTRAIT).setAlpha(column.offset < maxOffset ? 1 : 0.35);
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

    this.animateFloors(now);
    this.updateHint();
    this.updateSanctionsText();
    this.updateEventCards();
    this.updateBuffUi();
    this.updateEffectsWindow();
  }

  private saveProgress(): void {
    if (this.gameOver) return;
    try {
      const mods = this.mods.map((m) => ({
        stat: m.stat,
        multiplier: m.multiplier,
        left: Math.max(0, m.endsAt - this.elapsed),
        label: m.label,
      }));
      localStorage.setItem(
        GAME_CONFIG.saveKey,
        JSON.stringify({ power: this.power, owned: this.owned, events: this.seenEvents, mods }),
      );
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
    this.seenEvents = [];
    this.mods = [];
    try {
      const raw = localStorage.getItem(GAME_CONFIG.saveKey);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        power?: number;
        owned?: Record<string, number>;
        events?: string[];
        mods?: { stat: ModStat; multiplier: number; left: number; label: string }[];
      };
      this.power = data.power ?? 0;
      this.owned = data.owned ?? {};
      if (Array.isArray(data.events)) this.seenEvents = data.events.filter((id) => typeof id === 'string');

      if (Array.isArray(data.mods)) {
        this.mods = data.mods
          .filter((m) => MOD_STATS.includes(m.stat) && typeof m.multiplier === 'number' && m.left > 0)
          .map((m) => ({ stat: m.stat, multiplier: m.multiplier, endsAt: m.left, label: String(m.label) }));
      }
    } catch {
      this.power = 0;
      this.owned = {};
      this.seenEvents = [];
      this.mods = [];
    }
  }
}