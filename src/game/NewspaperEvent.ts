import Phaser from 'phaser';
import { Sfx } from './audio';
import { EventChoice, EventDef, EventLine } from './events';
import { COLORS, FONT, FONT_HEAD } from './theme';

export interface NewspaperHost {
  preview(choice: EventChoice): EventLine[];
  apply(choice: EventChoice): EventLine[];
  close(): void;
}

const DEPTH = 80;
const FADE_MS = 250;
const SCREEN_MARGIN = 12;

const INK = '#2a2118';
const INK_SOFT = '#5b4a2e';
const INK_FAINT = '#8a7650';
const CREAM = '#f3ead3';
const RED = '#7f1d1d';
const GOOD = '#166534';
const BAD = '#991b1b';
const INK_FILL = 0x2a2118;
const AGED_FILL = 0x8a6a2c;
const CHOICE_FILL = 0xe9ddbd;
const CHOICE_HOVER = 0xf8f0da;
const PHOTO_FILL = 0xd6cbad;
const GOOD_FILL = 0x16a34a;
const BAD_FILL = 0xb91c1c;
const BODY_FONT = 'Georgia, "Times New Roman", serif';

const PRICES = ['ЦЕНА: 2 КОП.', 'ЦЕНА: 5 КОП.', 'ЦЕНА: 1 РУБ.'];

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomFrom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export class NewspaperEvent {
  private readonly root: Phaser.GameObjects.Container;
  private readonly sheet: Phaser.GameObjects.Container;
  private readonly portrait: boolean;
  private readonly panelW: number;
  private readonly baseH: number;
  private readonly pad: number;
  private readonly seed: number;

  private readonly shadow: Phaser.GameObjects.Rectangle;
  private readonly paperRect: Phaser.GameObjects.Rectangle;
  private readonly frameOuter: Phaser.GameObjects.Rectangle;
  private readonly frameInner: Phaser.GameObjects.Rectangle;
  private readonly decor: Phaser.GameObjects.Graphics;

  private panelH: number;
  private contentBottom = 0;
  private choiceObjects: Phaser.GameObjects.GameObject[] = [];
  private stamp: Phaser.GameObjects.Container | null = null;
  private resolved = false;
  private done = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sfx: Sfx,
    private readonly def: EventDef,
    private readonly host: NewspaperHost,
  ) {
    const { width, height } = scene.scale;
    this.portrait = width < height;
    this.panelW = Math.min(width - 16, this.portrait ? 464 : 760);
    this.baseH = Math.min(height - SCREEN_MARGIN, this.portrait ? 720 : 628);
    this.panelH = this.baseH;
    this.pad = this.portrait ? 18 : 30;
    this.seed = seedOf(def.id);

    this.root = scene.add.container(0, 0).setDepth(DEPTH).setAlpha(0);
    this.root.add(scene.add.rectangle(0, 0, width, height, COLORS.overlay, 0.88).setOrigin(0, 0).setInteractive());
    this.sheet = scene.add.container(0, 0);
    this.root.add(this.sheet);

    this.shadow = this.put(scene.add.rectangle(7, 9, this.panelW, this.baseH, 0x000000, 0.5).setOrigin(0, 0));
    this.paperRect = this.put(
      scene.add.rectangle(0, 0, this.panelW, this.baseH, COLORS.paper).setOrigin(0, 0).setStrokeStyle(3, COLORS.paperEdge),
    );
    this.decor = this.put(scene.add.graphics());
    this.frameOuter = this.put(scene.add.rectangle(7, 7, 10, 10).setOrigin(0, 0).setStrokeStyle(2, INK_FILL, 0.55));
    this.frameInner = this.put(scene.add.rectangle(11, 11, 10, 10).setOrigin(0, 0).setStrokeStyle(1, INK_FILL, 0.35));

    this.buildPaper();
    this.showChoices();

    scene.tweens.add({ targets: this.root, alpha: 1, duration: FADE_MS });
    scene.cameras.main.flash(180, 255, 240, 200);
    this.sfx.newspaper();
  }

  destroy(): void {
    if (this.stamp) this.scene.tweens.killTweensOf(this.stamp);
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy();
  }

  private put<T extends Phaser.GameObjects.GameObject>(object: T, bucket?: Phaser.GameObjects.GameObject[]): T {
    this.sheet.add(object);
    bucket?.push(object);
    return object;
  }

  private text(
    x: number,
    y: number,
    content: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    bucket?: Phaser.GameObjects.GameObject[],
  ): Phaser.GameObjects.Text {
    return this.put(this.scene.add.text(x, y, content, style), bucket);
  }

  private rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    bucket?: Phaser.GameObjects.GameObject[],
    alpha = 1,
  ): Phaser.GameObjects.Rectangle {
    return this.put(this.scene.add.rectangle(x, y, w, h, fill, alpha).setOrigin(0, 0), bucket);
  }

  private ruleWithLabel(y: number, label: string, bucket?: Phaser.GameObjects.GameObject[]): number {
    const x = this.pad;
    const innerW = this.panelW - this.pad * 2;
    const title = this.text(
      x,
      y,
      label,
      { fontFamily: FONT_HEAD, fontSize: '14px', color: RED, fontStyle: 'bold' },
      bucket,
    ).setLetterSpacing(2);
    const lineX = x + title.width + 10;
    this.rect(lineX, y + title.height / 2 - 1, innerW - title.width - 10, 1, INK_FILL, bucket, 0.6);
    this.rect(lineX, y + title.height / 2 + 2, innerW - title.width - 10, 1, INK_FILL, bucket, 0.3);
    return y + title.height + 8;
  }

  private fit(content: number): void {
    const { width, height } = this.scene.scale;
    const h = Math.max(this.baseH, content);
    const w = this.panelW;
    this.panelH = h;

    this.shadow.setSize(w, h);
    this.paperRect.setSize(w, h);
    this.frameOuter.setSize(w - 14, h - 14);
    this.frameInner.setSize(w - 22, h - 22);
    this.drawDecor(w, h);

    const scale = Math.min(1, (height - SCREEN_MARGIN) / h, (width - SCREEN_MARGIN) / w);
    this.sheet.setScale(scale).setPosition((width - w * scale) / 2, (height - h * scale) / 2);
  }

  private drawDecor(w: number, h: number): void {
    const g = this.decor;
    g.clear();

    const bands = [
      { inset: 0, alpha: 0.1 },
      { inset: 6, alpha: 0.07 },
      { inset: 12, alpha: 0.04 },
    ];
    for (const band of bands) {
      g.fillStyle(AGED_FILL, band.alpha);
      g.fillRect(band.inset, 0, w - band.inset * 2, 6);
      g.fillRect(band.inset, h - 6, w - band.inset * 2, 6);
      g.fillRect(0, band.inset, 6, h - band.inset * 2);
      g.fillRect(w - 6, band.inset, 6, h - band.inset * 2);
    }

    const random = randomFrom(this.seed);
    for (let i = 0; i < 90; i++) {
      const size = random() < 0.2 ? 2 : 1;
      g.fillStyle(random() < 0.5 ? 0x5b4a2e : 0x8a6a2c, 0.1 + random() * 0.18);
      g.fillRect(14 + random() * (w - 28), 14 + random() * (h - 28), size, size);
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x8a6a2c, 0.06);
      g.fillCircle(30 + random() * (w - 60), 30 + random() * (h - 60), 10 + random() * 16);
    }

    const foldY = Math.round(h / 2);
    g.lineStyle(1, 0x5b4a2e, 0.2);
    g.lineBetween(4, foldY, w - 4, foldY);
    g.lineStyle(1, 0xffffff, 0.35);
    g.lineBetween(4, foldY + 1, w - 4, foldY + 1);
    g.fillStyle(0x5b4a2e, 0.035);
    g.fillRect(4, foldY + 2, w - 8, 14);
  }

  private buildPaper(): void {
    const { def, panelW, pad, portrait, seed } = this;
    const innerW = panelW - pad * 2;
    const cx = panelW / 2;
    const metaStyle = { fontFamily: BODY_FONT, fontSize: portrait ? '9px' : '10px', color: INK_SOFT, fontStyle: 'bold' };

    let y = portrait ? 18 : 20;

    const priceLabel = this.text(pad, y, PRICES[seed % PRICES.length], metaStyle).setLetterSpacing(1);
    const circulation = this.text(pad + innerW, y, `ТИРАЖ: ${(seed % 900) + 100} 000 ЭКЗ.`, metaStyle)
      .setOrigin(1, 0)
      .setLetterSpacing(1);
    if (!portrait) this.text(cx, y, '✦  ЕЖЕДНЕВНО  ✦', metaStyle).setOrigin(0.5, 0).setLetterSpacing(2);
    y += Math.max(priceLabel.height, circulation.height) + 3;
    this.rect(pad, y, innerW, 1, INK_FILL, undefined, 0.7);
    y += 6;

    const mastheadW = innerW - (portrait ? 64 : 110);
    const masthead = this.text(cx, y, def.paper, {
      fontFamily: FONT_HEAD,
      fontSize: portrait ? '26px' : '36px',
      color: INK,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: mastheadW },
    }).setOrigin(0.5, 0);
    const orn = { fontFamily: FONT, fontSize: portrait ? '20px' : '26px', color: INK_SOFT };
    this.text(pad + (portrait ? 12 : 22), y + masthead.height / 2, '★', orn).setOrigin(0.5);
    this.text(pad + innerW - (portrait ? 12 : 22), y + masthead.height / 2, '★', orn).setOrigin(0.5);
    y += masthead.height + 2;

    const issue = this.text(cx, y, def.issue, {
      fontFamily: BODY_FONT,
      fontSize: portrait ? '11px' : '12px',
      color: INK_SOFT,
      fontStyle: 'italic',
      align: 'center',
      wordWrap: { width: innerW - 40 },
    }).setOrigin(0.5, 0);
    const sideW = Math.max(12, (innerW - issue.width) / 2 - 10);
    this.rect(pad, y + issue.height / 2, sideW, 1, INK_FILL, undefined, 0.5);
    this.rect(pad + innerW - sideW, y + issue.height / 2, sideW, 1, INK_FILL, undefined, 0.5);
    y += issue.height + 6;

    this.rect(pad, y, innerW, 3, INK_FILL);
    this.rect(pad, y + 5, innerW, 1, INK_FILL);
    y += 13;

    const kicker = this.text(pad + 8, y + 2, def.kicker, {
      fontFamily: FONT_HEAD,
      fontSize: portrait ? '10px' : '11px',
      color: CREAM,
      fontStyle: 'bold',
    }).setLetterSpacing(1);
    const tag = this.rect(pad, y, kicker.width + 16, kicker.height + 4, COLORS.sealDark);
    tag.setStrokeStyle(1, COLORS.sealRed);
    this.sheet.bringToTop(kicker);
    this.text(pad + innerW, y + (kicker.height + 4) / 2, def.byline, {
      fontFamily: BODY_FONT,
      fontSize: portrait ? '10px' : '11px',
      color: INK_FAINT,
      fontStyle: 'italic',
      align: 'right',
      wordWrap: { width: Math.max(60, innerW - kicker.width - 36) },
    }).setOrigin(1, 0.5);
    y += kicker.height + 10;

    const headline = this.text(cx, y, def.headline, {
      fontFamily: FONT_HEAD,
      fontSize: portrait ? '21px' : '28px',
      color: INK,
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: innerW },
    }).setOrigin(0.5, 0);
    y += headline.height + 9;

    const half = (innerW - 24) / 2;
    this.rect(pad, y + 5, half, 1, INK_FILL, undefined, 0.8);
    this.rect(pad + innerW - half, y + 5, half, 1, INK_FILL, undefined, 0.8);
    this.text(cx, y + 6, '◆', { fontFamily: FONT, fontSize: '11px', color: INK }).setOrigin(0.5);
    y += 18;

    y = portrait ? this.buildBodyPortrait(y, innerW) : this.buildBodyLandscape(y, innerW);

    this.rect(pad, y + 4, innerW, 1, INK_FILL, undefined, 0.8);
    this.rect(pad, y + 7, innerW, 1, INK_FILL, undefined, 0.4);
    this.contentBottom = y + 18;
  }

  private buildPhoto(cx: number, cy: number, w: number, h: number, iconSize: number): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    g.fillStyle(0xf8f2e0, 1);
    g.fillRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
    g.lineStyle(1, INK_FILL, 0.6);
    g.strokeRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
    g.fillStyle(PHOTO_FILL, 1);
    g.fillRect(-w / 2, -h / 2, w, h);

    g.lineStyle(1, 0x5b4a2e, 0.18);
    for (let d = -h; d < w; d += 6) {
      const x1 = Math.max(0, d);
      const y1 = d < 0 ? -d : 0;
      const x2 = Math.min(w, d + h);
      const y2 = x2 - d;
      g.lineBetween(-w / 2 + x1, -h / 2 + y1, -w / 2 + x2, -h / 2 + y2);
    }
    g.fillStyle(0x2a2118, 0.12);
    g.fillRect(-w / 2, -h / 2, w, 5);
    g.fillRect(-w / 2, h / 2 - 5, w, 5);
    g.fillRect(-w / 2, -h / 2, 5, h);
    g.fillRect(w / 2 - 5, -h / 2, 5, h);
    g.lineStyle(2, INK_FILL, 1);
    g.strokeRect(-w / 2, -h / 2, w, h);

    const icon = this.scene.add.text(0, 2, this.def.icon, { fontFamily: FONT, fontSize: `${iconSize}px` }).setOrigin(0.5);
    const tabLabel = this.scene.add
      .text(-w / 2 + 6, -h / 2 + 5, 'ФОТО', {
        fontFamily: FONT_HEAD,
        fontSize: '9px',
        color: CREAM,
        fontStyle: 'bold',
        backgroundColor: INK,
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0, 0)
      .setLetterSpacing(1);
    const tape = this.scene.add.rectangle(0, -h / 2 - 5, 44, 14, 0xe8d9a0, 0.75).setAngle(-3);
    tape.setStrokeStyle(1, 0xb09a5a, 0.6);

    const group = this.scene.add.container(cx, cy, [g, icon, tabLabel, tape]);
    group.setAngle(-1.2);
    return this.put(group);
  }

  private splitLead(): { lead: string; rest: string } {
    const match = this.def.body.match(/^(.+?[.!?])\s+([\s\S]*)$/);
    return match ? { lead: match[1], rest: match[2] } : { lead: this.def.body, rest: '' };
  }

  private addBody(x: number, y: number, w: number, lead: number, rest: number): number {
    const { lead: leadText, rest: restText } = this.splitLead();
    const leadObj = this.text(x, y, leadText, {
      fontFamily: BODY_FONT,
      fontSize: `${lead}px`,
      color: INK,
      fontStyle: 'bold',
      lineSpacing: 3,
      wordWrap: { width: w },
    });
    let bottom = leadObj.y + leadObj.height;
    if (restText) {
      const restObj = this.text(x, bottom + 5, restText, {
        fontFamily: BODY_FONT,
        fontSize: `${rest}px`,
        color: INK,
        lineSpacing: 4,
        wordWrap: { width: w },
      });
      bottom = restObj.y + restObj.height;
    }
    return bottom;
  }

  private buildBodyLandscape(y: number, innerW: number): number {
    const x = this.pad;
    const photoW = 150;
    const photoH = 112;
    const gap = 26;

    this.buildPhoto(x + photoW / 2 + 5, y + photoH / 2 + 5, photoW, photoH, 62);

    const captionY = y + photoH + 16;
    this.rect(x, captionY, photoW + 10, 1, INK_FILL, undefined, 0.5);
    const caption = this.text(x, captionY + 4, this.def.caption, {
      fontFamily: BODY_FONT,
      fontSize: '10px',
      color: INK_SOFT,
      fontStyle: 'italic',
      wordWrap: { width: photoW + 10 },
    });

    const colX = x + photoW + 10 + gap;
    const textBottom = this.addBody(colX, y, innerW - (colX - x), 16, 15);
    const bottom = Math.max(caption.y + caption.height, textBottom);
    this.rect(x + photoW + 10 + gap / 2, y, 1, bottom - y, INK_FILL, undefined, 0.45);
    return bottom;
  }

  private buildBodyPortrait(y: number, innerW: number): number {
    const x = this.pad;
    const boxH = 58;

    this.buildPhoto(x + 5 + 44, y + boxH / 2 + 4, 78, boxH, 36);
    const caption = this.text(x + 108, y + boxH / 2 + 4, this.def.caption, {
      fontFamily: BODY_FONT,
      fontSize: '11px',
      color: INK_SOFT,
      fontStyle: 'italic',
      wordWrap: { width: innerW - 108 },
    }).setOrigin(0, 0.5);
    this.rect(x + 98, y + 2, 1, boxH + 4, INK_FILL, undefined, 0.45);
    y += Math.max(boxH + 14, caption.height) + 4;

    return this.addBody(x, y, innerW, 14, 13);
  }

  private showChoices(): void {
    const x = this.pad;
    const innerW = this.panelW - this.pad * 2;
    let y = this.ruleWithLabel(this.contentBottom, 'ВАШЕ РЕШЕНИЕ', this.choiceObjects);

    let index = 1;
    for (const choice of this.def.choices) {
      y = this.addChoice(choice, index, x, y, innerW) + 9;
      index++;
    }
    this.fit(y + this.pad - 4);
  }

  private addChoice(choice: EventChoice, index: number, x: number, y: number, w: number): number {
    const bucket = this.choiceObjects;
    const shadow = this.rect(x + 3, y + 3, w, 60, 0x000000, bucket, 0.22);
    const bg = this.rect(x, y, w, 60, CHOICE_FILL, bucket).setStrokeStyle(2, COLORS.brassDark);
    const band = this.rect(x, y, 6, 60, COLORS.sealDark, bucket);

    const textX = x + 48;
    const labelW = this.portrait ? w - 62 : Math.floor(w * 0.48);
    const label = this.text(
      textX,
      y + 10,
      choice.label,
      {
        fontFamily: FONT_HEAD,
        fontSize: this.portrait ? '15px' : '16px',
        color: INK,
        fontStyle: 'bold',
        wordWrap: { width: labelW },
      },
      bucket,
    );

    const effectsX = this.portrait ? textX : textX + labelW + 20;
    const effectsW = this.portrait ? w - 62 : w - (effectsX - x) - 12;
    let effectsY = this.portrait ? label.y + label.height + 5 : y + 10;
    for (const line of this.host.preview(choice)) {
      const row = this.text(
        effectsX,
        effectsY,
        `${line.good ? '▲' : '▼'} ${line.text}`,
        {
          fontFamily: FONT,
          fontSize: '13px',
          color: line.good ? GOOD : BAD,
          fontStyle: 'bold',
          wordWrap: { width: effectsW },
        },
        bucket,
      );
      effectsY += row.height + 2;
    }

    const contentBottom = Math.max(label.y + label.height, effectsY - 2);
    const h = Math.max(54, contentBottom - y + 12);

    shadow.setSize(w, h);
    band.setSize(6, h);
    bg.setSize(w, h).setInteractive({ useHandCursor: true });

    const badge = this.put(this.scene.add.circle(x + 27, y + h / 2, 13, COLORS.sealDark).setStrokeStyle(2, COLORS.sealRed), bucket);
    this.text(
      x + 27,
      y + h / 2,
      String(index),
      { fontFamily: FONT_HEAD, fontSize: '15px', color: CREAM, fontStyle: 'bold' },
      bucket,
    ).setOrigin(0.5);

    if (!this.portrait) {
      this.rect(effectsX - 11, y + 8, 1, h - 16, INK_FILL, bucket, 0.3);
    }

    bg.on('pointerover', () => {
      bg.setFillStyle(CHOICE_HOVER).setStrokeStyle(2, COLORS.sealRed);
      badge.setFillStyle(COLORS.sealRed);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(CHOICE_FILL).setStrokeStyle(2, COLORS.brassDark);
      badge.setFillStyle(COLORS.sealDark);
    });
    bg.on('pointerdown', () => this.choose(choice));
    return y + h;
  }

  private choose(choice: EventChoice): void {
    if (this.done || this.resolved) return;
    this.resolved = true;

    const lines = this.host.apply(choice);
    this.sfx.buy();
    for (const object of this.choiceObjects) object.destroy();
    this.choiceObjects = [];
    this.showResult(choice, lines);
  }

  private showResult(choice: EventChoice, lines: EventLine[]): void {
    const x = this.pad;
    const innerW = this.panelW - this.pad * 2;
    const cx = this.panelW / 2;
    let y = this.contentBottom;

    const stampText = this.scene.add
      .text(0, -7, 'РЕШЕНИЕ ПРИНЯТО', {
        fontFamily: FONT_HEAD,
        fontSize: this.portrait ? '24px' : '30px',
        color: '#b91c1c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const docNo = this.scene.add
      .text(0, stampText.height / 2 - 4, `ДОКУМЕНТ № ${(this.seed % 9000) + 1000} • КАБИНЕТ`, {
        fontFamily: BODY_FONT,
        fontSize: '10px',
        color: '#b91c1c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2);
    const frameW = Math.max(stampText.width, docNo.width) + 36;
    const frameH = stampText.height + docNo.height + 14;
    const outer = this.scene.add.rectangle(0, 0, frameW, frameH).setStrokeStyle(4, COLORS.sealRed);
    const inner = this.scene.add.rectangle(0, 0, frameW - 10, frameH - 10).setStrokeStyle(1, COLORS.sealRed);
    this.stamp = this.scene.add.container(cx, y + frameH / 2 + 4, [outer, inner, stampText, docNo]).setAngle(-4).setScale(2.2).setAlpha(0);
    this.sheet.add(this.stamp);
    this.scene.tweens.add({ targets: this.stamp, scale: 1, alpha: 0.92, duration: 260, ease: 'Back.Out' });
    y += frameH + 22;

    const chosen = this.text(x, y, `Вы выбрали: «${choice.label}»`, {
      fontFamily: FONT_HEAD,
      fontSize: this.portrait ? '15px' : '17px',
      color: INK,
      fontStyle: 'bold',
      wordWrap: { width: innerW },
    });
    y += chosen.height + 10;

    const outcome = this.text(x + 14, y, choice.outcome, {
      fontFamily: BODY_FONT,
      fontSize: this.portrait ? '14px' : '16px',
      color: INK_SOFT,
      fontStyle: 'italic',
      lineSpacing: 3,
      wordWrap: { width: innerW - 14 },
    });
    this.rect(x, y - 1, 3, outcome.height + 2, COLORS.sealDark);
    y += outcome.height + 16;

    y = this.ruleWithLabel(y, 'ПОСЛЕДСТВИЯ');

    for (const line of lines) {
      const row = this.text(x + 14, y + 4, `${line.good ? '▲' : '▼'} ${line.text}`, {
        fontFamily: FONT,
        fontSize: this.portrait ? '16px' : '18px',
        color: line.good ? GOOD : BAD,
        fontStyle: 'bold',
        wordWrap: { width: innerW - 24 },
      });
      const accent = line.good ? GOOD_FILL : BAD_FILL;
      const bg = this.rect(x, y, innerW, row.height + 8, accent, undefined, 0.12);
      this.rect(x, y, 4, bg.height, accent);
      this.sheet.bringToTop(row);
      y += bg.height + 5;
    }

    const buttonH = 48;
    this.fit(y + 14 + buttonH + 18);
    const buttonY = this.panelH - 18 - buttonH / 2;

    this.rect(cx - 160 + 3, buttonY - buttonH / 2 + 3, 320, buttonH, 0x000000, undefined, 0.3);
    const button = this.put(
      this.scene.add
        .rectangle(cx, buttonY, 320, buttonH, COLORS.sealDark)
        .setStrokeStyle(3, COLORS.sealRed)
        .setInteractive({ useHandCursor: true }),
    );
    this.text(cx, buttonY, 'Принять к исполнению', {
      fontFamily: FONT,
      fontSize: '19px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    button.on('pointerover', () => button.setFillStyle(COLORS.sealRed));
    button.on('pointerout', () => button.setFillStyle(COLORS.sealDark));
    button.on('pointerdown', () => this.finish());
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.destroy();
    this.host.close();
  }
}
