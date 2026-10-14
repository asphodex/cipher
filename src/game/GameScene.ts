import Phaser from 'phaser';
import { ALPHABET } from './cipher';
import { CipherGame, type Outcome, type Verdict } from './CipherGame';
import { getDayRules, MAX_TRUST } from './levels';
import { SoundFx } from './sound';
import { loadBest, loadMuted, saveBestIfBetter, saveMuted } from './storage';

const FONT = '"Courier New", Courier, monospace';

const COLOR = {
  desk: 0x3b3128,
  paper: 0xefe6d2,
  paperDark: 0xe0d3b4,
  ruling: 0xd9cbab,
  ink: 0x2b2b2b,
  red: 0xa8322d,
};
const CSS = {
  ink: '#2b2b2b',
  faded: '#6e6556',
  red: '#a8322d',
};

const MARGIN = 50;
const TEXT_WRAP = 620;
const CURSOR_BLINK_MS = 500;
const STAMP_HOLD_MS = 1400;
const LOW_TIME_SHARE = 0.3;
const DRUM_SIDE_LETTERS = 3;

const STAMP_LABEL: Record<Verdict, string> = {
  sent: 'ПЕРЕДАНО',
  burned: 'СОЖЖЕНО',
  expired: 'ПРОСРОЧЕНО',
};

type Phase = 'play' | 'stamp' | 'panel';

interface Button {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

function stars(trust: number): string {
  return '★'.repeat(trust) + '☆'.repeat(MAX_TRUST - trust);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/**
 * Сцена «Шифровальщика»: только отрисовка и ввод.
 * Правила игры живут в CipherGame.
 */
export class GameScene extends Phaser.Scene {
  private session!: CipherGame;
  private sfx!: SoundFx;
  private phase: Phase = 'panel';
  private panelAction: (() => void) | null = null;

  private dayText!: Phaser.GameObjects.Text;
  private trustText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private numberText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerLabel!: Phaser.GameObjects.Text;
  private cipherText!: Phaser.GameObjects.Text;
  private decodedText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private drumText!: Phaser.GameObjects.Text;
  private shiftText!: Phaser.GameObjects.Text;
  private journalText!: Phaser.GameObjects.Text;
  private stamp!: Phaser.GameObjects.Container;
  private stampLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.sfx = new SoundFx(loadMuted());
    this.session = new CipherGame();

    this.drawPaper();
    this.createHud();
    this.createDispatchArea();
    this.createWheel();
    this.createActions();
    this.createStamp();
    this.bindKeyboard();

    this.showIntro();
  }

  update(time: number, delta: number): void {
    if (this.phase !== 'play') return;

    const outcome = this.session.tick(delta);
    this.renderTimer();
    if (outcome) {
      this.resolve(outcome);
      return;
    }

    const cursorOn = Math.floor(time / CURSOR_BLINK_MS) % 2 === 0;
    this.decodedText.setText(this.session.decodedText + (cursorOn ? '_' : ' '));
  }

  // ---------- построение интерфейса ----------

  private drawPaper(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(COLOR.desk).fillRect(0, 0, width, height);
    g.fillStyle(COLOR.paperDark).fillRect(20, 20, width - 40, height - 40);
    g.fillStyle(COLOR.paper).fillRect(26, 26, width - 52, height - 52);

    g.lineStyle(1, COLOR.ruling, 0.6);
    for (let y = 160; y < height - 40; y += 36) g.lineBetween(36, y, width - 36, y);
    g.lineStyle(2, COLOR.red, 0.25).lineBetween(38, 30, 38, height - 30);

    this.add
      .text(width - 60, 140, 'СЕКРЕТНО', { fontFamily: FONT, fontSize: '22px', color: CSS.red, fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setAngle(-6)
      .setAlpha(0.35);
  }

  private createHud(): void {
    const { width } = this.scale;
    const style = { fontFamily: FONT, fontSize: '24px', color: CSS.ink, fontStyle: 'bold' };

    this.dayText = this.add.text(MARGIN, 52, '', style).setOrigin(0, 0.5);
    this.trustText = this.add
      .text(width / 2, 52, '', { ...style, fontSize: '34px', color: CSS.red })
      .setOrigin(0.5);
    this.scoreText = this.add.text(width - MARGIN, 52, '', style).setOrigin(1, 0.5);

    const small = { fontFamily: FONT, fontSize: '18px', color: CSS.faded };
    this.numberText = this.add.text(MARGIN, 94, '', small).setOrigin(0, 0.5);
    this.muteText = this.add
      .text(width - MARGIN, 94, '', small)
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleMute());
    this.renderMute();

    this.add.rectangle(MARGIN, 116, width - MARGIN * 2, 2, COLOR.ink).setOrigin(0, 0.5);
  }

  private createDispatchArea(): void {
    const { width } = this.scale;
    const label = { fontFamily: FONT, fontSize: '18px', color: CSS.faded };
    const body = {
      fontFamily: FONT,
      fontSize: '30px',
      color: CSS.ink,
      wordWrap: { width: TEXT_WRAP },
      lineSpacing: 6,
    };

    this.add.rectangle(MARGIN, 186, TEXT_WRAP, 12).setOrigin(0, 0.5).setStrokeStyle(2, COLOR.ink);
    this.timerBar = this.add.rectangle(MARGIN, 186, TEXT_WRAP, 12, COLOR.ink).setOrigin(0, 0.5);
    this.timerLabel = this.add
      .text(width / 2, 186, 'БЕЗ ТАЙМЕРА', { ...label, fontSize: '16px', backgroundColor: '#efe6d2' })
      .setOrigin(0.5);

    this.add.text(MARGIN, 214, 'ШИФРОВКА:', label);
    this.cipherText = this.add.text(MARGIN, 242, '', { ...body, color: CSS.faded });
    this.add.text(MARGIN, 368, 'РАСШИФРОВКА:', label);
    this.decodedText = this.add.text(MARGIN, 396, '', { ...body, fontStyle: 'bold' });

    this.messageText = this.add
      .text(width / 2, 548, '', {
        fontFamily: FONT,
        fontSize: '21px',
        color: CSS.ink,
        align: 'center',
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5);
  }

  private createWheel(): void {
    const { width } = this.scale;
    const cx = width / 2;

    this.drumText = this.add
      .text(cx, 628, '', { fontFamily: FONT, fontSize: '28px', color: CSS.faded })
      .setOrigin(0.5);
    this.shiftText = this.add
      .text(cx, 708, '00', { fontFamily: FONT, fontSize: '76px', color: CSS.ink, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 766, 'СДВИГ', { fontFamily: FONT, fontSize: '18px', color: CSS.faded })
      .setOrigin(0.5);

    this.makeButton(130, 708, 160, 130, '◀', 60, () => this.rotate(-1));
    this.makeButton(width - 130, 708, 160, 130, '▶', 60, () => this.rotate(1));
  }

  private createActions(): void {
    const { width } = this.scale;

    this.makeButton(262, 862, 424, 104, 'ОТПРАВИТЬ\nВ ШТАБ', 28, () => this.answer('send'));
    const burn = this.makeButton(582, 862, 176, 104, 'СЖЕЧЬ', 28, () => this.answer('burn'));
    burn.label.setColor(CSS.red);
    burn.rect.setStrokeStyle(3, COLOR.red);

    const hasTouch = this.sys.game.device.input.touch;
    if (!hasTouch) {
      this.add
        .text(width / 2, 930, '← → сдвиг · Enter отправить · Del сжечь · M звук', {
          fontFamily: FONT,
          fontSize: '16px',
          color: CSS.faded,
        })
        .setOrigin(0.5);
    }

    this.journalText = this.add.text(MARGIN, hasTouch ? 932 : 952, '', {
      fontFamily: FONT,
      fontSize: '19px',
      color: CSS.faded,
      lineSpacing: 2,
    });
    this.journalText.setMaxLines(4);
  }

  private createStamp(): void {
    const { width } = this.scale;
    const frame = this.add.rectangle(0, 0, 440, 110).setStrokeStyle(7, COLOR.red);
    this.stampLabel = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '62px', color: CSS.red, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.stamp = this.add.container(width / 2, 380, [frame, this.stampLabel]).setDepth(10).setVisible(false);
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    fontSize: number,
    onClick: () => void,
  ): Button {
    const rect = this.add
      .rectangle(x, y, w, h, COLOR.paperDark)
      .setStrokeStyle(3, COLOR.ink)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${fontSize}px`, color: CSS.ink, fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);

    rect.on('pointerover', () => rect.setFillStyle(COLOR.ruling));
    rect.on('pointerout', () => rect.setFillStyle(COLOR.paperDark));
    rect.on('pointerdown', onClick);
    return { rect, label };
  }

  private bindKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.on('keydown', (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowLeft':
          this.rotate(-1);
          break;
        case 'ArrowRight':
          this.rotate(1);
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (event.repeat) return;
          if (this.phase === 'panel') this.panelAction?.();
          else this.answer('send');
          break;
        case 'Delete':
        case 'Backspace':
          if (!event.repeat) this.answer('burn');
          break;
        case 'KeyM':
          this.toggleMute();
          break;
      }
    });
  }

  // ---------- игровой поток ----------

  private rotate(delta: number): void {
    if (this.phase !== 'play') return;
    this.session.rotate(delta);
    this.sfx.click();
    this.renderShift();
  }

  private answer(action: 'send' | 'burn'): void {
    if (this.phase !== 'play') return;
    const outcome = action === 'send' ? this.session.send() : this.session.burn();
    if (outcome) this.resolve(outcome);
  }

  private resolve(outcome: Outcome): void {
    this.phase = 'stamp';
    this.decodedText.setText(this.session.decodedText);
    this.renderHud();
    this.showStamp(STAMP_LABEL[outcome.verdict]);

    const bonus = outcome.trustDelta > 0 ? '  +★ быстро!' : outcome.trustDelta < 0 ? '  −★' : '';
    this.messageText.setText(outcome.message + bonus).setColor(outcome.correct ? CSS.ink : CSS.red);

    if (!outcome.correct) {
      this.sfx.error();
      this.shakeText();
    }

    this.time.delayedCall(STAMP_HOLD_MS, () => this.afterStamp());
  }

  private afterStamp(): void {
    this.stamp.setVisible(false);
    const s = this.session;

    if (s.isGameOver) {
      this.showGameOver();
    } else if (s.isDayOver) {
      this.showDaySummary();
    } else {
      s.nextDispatch();
      this.renderDispatch();
    }
  }

  private startGame(): void {
    this.session = new CipherGame();
    this.session.start();
    this.renderDispatch();
  }

  // ---------- отрисовка состояния ----------

  private renderDispatch(): void {
    const d = this.session.current;
    this.phase = 'play';
    this.cipherText.setText(d.cipherText);
    this.messageText.setText(d.hint ?? '').setColor(CSS.ink);
    this.renderHud();
    this.renderShift();
    this.renderTimer();
    this.renderJournal();
  }

  private renderHud(): void {
    const s = this.session;
    this.dayText.setText(`ДЕНЬ ${s.day}`);
    this.trustText.setText(stars(s.trust));
    this.scoreText.setText(`ДЕПЕШ: ${s.decoded}`);
    this.numberText.setText(`ДЕПЕША № ${pad(s.current.number, 3)}`);
  }

  private renderShift(): void {
    const shift = this.session.shift;
    this.shiftText.setText(pad(shift, 2));

    const letters: string[] = [];
    for (let i = -DRUM_SIDE_LETTERS; i <= DRUM_SIDE_LETTERS; i += 1) {
      const letter = ALPHABET.charAt((shift + i + ALPHABET.length) % ALPHABET.length);
      letters.push(i === 0 ? `[${letter}]` : letter);
    }
    this.drumText.setText(letters.join(' '));
    this.decodedText.setText(this.session.decodedText);
  }

  private renderTimer(): void {
    const s = this.session;
    const hasTimer = s.current.timerMs !== null;
    this.timerLabel.setVisible(!hasTimer);
    this.timerBar.setVisible(hasTimer);
    if (!hasTimer) return;

    const share = s.timeShare;
    this.timerBar.setScale(share, 1);
    this.timerBar.setFillStyle(share < LOW_TIME_SHARE ? COLOR.red : COLOR.ink);
  }

  private renderJournal(): void {
    const entries = this.session.journal;
    const lines = entries.length > 0 ? entries.map((e) => `· ${e}`) : ['· (пусто)'];
    this.journalText.setText(['ЖУРНАЛ ПРИКАЗОВ:', ...lines].join('\n'));
  }

  private renderMute(): void {
    this.muteText.setText(this.sfx.muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ');
  }

  private toggleMute(): void {
    saveMuted(this.sfx.toggle());
    this.renderMute();
  }

  // ---------- эффекты ----------

  private showStamp(label: string): void {
    this.sfx.stamp();
    this.stampLabel.setText(label);
    this.stamp
      .setVisible(true)
      .setScale(2.4)
      .setAlpha(0)
      .setAngle(Phaser.Math.Between(-14, -5));

    this.tweens.add({
      targets: this.stamp,
      scale: 1,
      alpha: 0.9,
      duration: 160,
      ease: 'Quad.easeIn',
      onComplete: () => this.cameras.main.shake(110, 0.006),
    });
  }

  private shakeText(): void {
    const targets = [this.cipherText, this.decodedText];
    this.tweens.add({
      targets,
      x: MARGIN + 9,
      duration: 45,
      yoyo: true,
      repeat: 4,
      onComplete: () => targets.forEach((t) => t.setX(MARGIN)),
    });
  }

  // ---------- панели между днями ----------

  private showIntro(): void {
    const best = loadBest();
    this.showPanel(
      'ШИФРОВАЛЬЩИК',
      [
        'Штаб. Война. Ты — шифровальщик.',
        'Депеши приходят зашифрованными шифром Цезаря.',
        '',
        'Крути колесо сдвига (◀ ▶ или стрелки), пока из мусора не проступит текст.',
        'Свои приказы — «Отправить в штаб». Вражеские — «Сжечь».',
        '',
        best ? `Лучший результат: ${best.decoded} депеш, день ${best.days}` : '',
      ],
      'ПРИСТУПИТЬ',
      () => this.startGame(),
    );
  }

  private showDaySummary(): void {
    const s = this.session;
    const next = getDayRules(s.day + 1);
    this.showPanel(
      `ДЕНЬ ${s.day} ОКОНЧЕН`,
      [`Доверие штаба ${stars(s.trust)}`, `Расшифровано депеш: ${s.decoded}`, '', `ДЕНЬ ${s.day + 1}:`, next.intro],
      'ЗАСТУПИТЬ НА СМЕНУ',
      () => {
        s.startNextDay();
        this.renderDispatch();
      },
    );
  }

  private showGameOver(): void {
    const s = this.session;
    const record = saveBestIfBetter({ decoded: s.decoded, days: s.day });
    const best = loadBest();
    this.showPanel(
      'ФРОНТ ПАЛ',
      [
        'Штаб больше не доверяет твоим депешам.',
        '',
        `Дней службы: ${s.day}`,
        `Расшифровано депеш: ${s.decoded}`,
        `Точность: ${Math.round(s.accuracy * 100)}%`,
        '',
        record ? 'НОВЫЙ РЕКОРД!' : best ? `Рекорд: ${best.decoded} депеш, день ${best.days}` : '',
      ],
      'НАЧАТЬ ЗАНОВО',
      () => this.startGame(),
    );
  }

  private showPanel(title: string, lines: string[], buttonText: string, onClose: () => void): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    this.phase = 'panel';

    const shade = this.add.rectangle(0, 0, width, height, COLOR.desk, 0.88).setOrigin(0).setInteractive();
    const card = this.add.rectangle(cx, cy, 620, 640, COLOR.paper).setStrokeStyle(3, COLOR.ink);
    const titleText = this.add
      .text(cx, cy - 250, title, { fontFamily: FONT, fontSize: '44px', color: CSS.red, fontStyle: 'bold' })
      .setOrigin(0.5);
    const body = this.add
      .text(cx, cy - 190, lines.join('\n'), {
        fontFamily: FONT,
        fontSize: '23px',
        color: CSS.ink,
        align: 'center',
        lineSpacing: 8,
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5, 0);

    const panel = this.add.container(0, 0, [shade, card, titleText, body]).setDepth(20);
    const close = (): void => {
      panel.destroy();
      this.panelAction = null;
      onClose();
    };
    const button = this.makeButton(cx, cy + 240, 420, 90, buttonText, 28, close);
    panel.add([button.rect, button.label]);
    this.panelAction = close;
  }
}
