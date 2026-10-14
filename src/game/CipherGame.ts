import { ALPHABET_SIZE, decrypt, encrypt, wrapShift } from './cipher';
import {
  ENEMY_ORDERS,
  ENEMY_SIGNATURES,
  FRIENDLY_SIGNATURE,
  LONG_ORDERS,
  SHORT_ORDERS,
  TRAPS,
  TUTORIAL_TEXT,
  type TrapPair,
} from './content';
import {
  FAST_ANSWER_SHARE,
  getDayRules,
  JOURNAL_SIZE,
  MAX_TRUST,
  START_TRUST,
  TRAP_MIN_KEY_GAP,
  TUTORIAL_KEY,
  type DayRules,
} from './levels';

export type DispatchKind = 'friendly' | 'enemy' | 'trap';
export type Verdict = 'sent' | 'burned' | 'expired';

export interface Dispatch {
  number: number;
  kind: DispatchKind;
  cipherText: string;
  /** Настоящий текст (с подписью). */
  plainText: string;
  /** Текст для журнала приказов (без подписи). */
  journalText: string;
  key: number;
  /** Для ловушки: второй сдвиг и подложный текст на нём. */
  trap: { key: number; text: string } | null;
  /** null — без таймера (обучение). */
  timerMs: number | null;
  hint: string | null;
}

export interface Outcome {
  verdict: Verdict;
  correct: boolean;
  fast: boolean;
  trustDelta: number;
  message: string;
}

type Plan =
  | { kind: 'friendly'; text: string }
  | { kind: 'enemy'; text: string }
  | { kind: 'trap'; trap: TrapPair };

class Deck<T> {
  private pile: T[] = [];

  constructor(
    private readonly items: readonly T[],
    private readonly random: () => number,
  ) {}

  draw(): T {
    if (this.pile.length === 0) this.pile = shuffle(this.items, this.random);
    const item = this.pile.pop();
    if (item === undefined) throw new Error('Deck is empty');
    return item;
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sign(text: string, signature: string): string {
  return `${text} ${signature}`;
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, ALPHABET_SIZE - d);
}

/**
 * Вся игровая логика «Шифровальщика» без отрисовки.
 * Сцена только вызывает методы и рисует состояние.
 */
export class CipherGame {
  day = 1;
  trust = START_TRUST;
  shift = 0;
  timeLeftMs = 0;
  answered = 0;
  decoded = 0;
  journal: string[] = [];
  current!: Dispatch;

  private dispatchInDay = 0;
  private dispatchNumber = 0;
  private awaitingAnswer = false;
  private queue: Plan[] = [];

  private readonly shortDeck: Deck<string>;
  private readonly longDeck: Deck<string>;
  private readonly enemyDeck: Deck<string>;
  private readonly signatureDeck: Deck<string>;
  private readonly trapDeck: Deck<TrapPair>;

  constructor(private readonly random: () => number = Math.random) {
    this.shortDeck = new Deck(SHORT_ORDERS, random);
    this.longDeck = new Deck(LONG_ORDERS, random);
    this.enemyDeck = new Deck(ENEMY_ORDERS, random);
    this.signatureDeck = new Deck(ENEMY_SIGNATURES, random);
    this.trapDeck = new Deck(TRAPS, random);
  }

  get rules(): DayRules {
    return getDayRules(this.day);
  }

  get isGameOver(): boolean {
    return this.trust <= 0;
  }

  get isDayOver(): boolean {
    return this.dispatchInDay >= this.rules.dispatchCount;
  }

  get accuracy(): number {
    return this.answered === 0 ? 0 : this.decoded / this.answered;
  }

  /** Доля оставшегося времени 0..1 (для полоски таймера). */
  get timeShare(): number {
    if (this.current.timerMs === null) return 1;
    return this.timeLeftMs / this.current.timerMs;
  }

  /** То, что видит игрок в строке расшифровки при текущем сдвиге. */
  get decodedText(): string {
    const { trap, cipherText } = this.current;
    if (trap && this.shift === trap.key) return trap.text;
    return decrypt(cipherText, this.shift);
  }

  start(): void {
    this.dispatchInDay = 1;
    this.dispatchNumber = 1;
    this.shift = 0;
    this.current = {
      number: this.dispatchNumber,
      kind: 'friendly',
      cipherText: encrypt(TUTORIAL_TEXT, TUTORIAL_KEY),
      plainText: TUTORIAL_TEXT,
      journalText: TUTORIAL_TEXT,
      key: TUTORIAL_KEY,
      trap: null,
      timerMs: null,
      hint: 'Крути колесо, пока текст не станет читаемым. Потом — «Отправить в штаб».',
    };
    this.awaitingAnswer = true;
  }

  nextDispatch(): void {
    this.dispatchInDay += 1;
    this.dispatchNumber += 1;
    this.shift = 0;
    this.current = this.build(this.nextPlan());
    this.timeLeftMs = this.current.timerMs ?? 0;
    this.awaitingAnswer = true;
  }

  startNextDay(): void {
    this.day += 1;
    this.dispatchInDay = 0;
    this.nextDispatch();
  }

  rotate(delta: number): void {
    if (!this.awaitingAnswer) return;
    this.shift = wrapShift(this.shift + delta);
  }

  /** Возвращает исход, если таймер истёк. */
  tick(deltaMs: number): Outcome | null {
    if (!this.awaitingAnswer || this.current.timerMs === null) return null;
    this.timeLeftMs = Math.max(0, this.timeLeftMs - deltaMs);
    return this.timeLeftMs === 0 ? this.resolve('expired') : null;
  }

  send(): Outcome | null {
    return this.awaitingAnswer ? this.resolve('sent') : null;
  }

  burn(): Outcome | null {
    return this.awaitingAnswer ? this.resolve('burned') : null;
  }

  private resolve(verdict: Verdict): Outcome {
    this.awaitingAnswer = false;
    const { correct, message } = this.judge(verdict);
    const fast = correct && this.timeShare >= FAST_ANSWER_SHARE;

    let trustDelta = 0;
    if (!correct) trustDelta = -1;
    else if (fast && this.trust < MAX_TRUST) trustDelta = 1;

    this.trust = Math.min(MAX_TRUST, Math.max(0, this.trust + trustDelta));
    this.answered += 1;
    if (correct) this.decoded += 1;
    if (this.current.kind !== 'enemy') this.addToJournal(this.current.journalText);

    return { verdict, correct, fast, trustDelta, message };
  }

  private judge(verdict: Verdict): { correct: boolean; message: string } {
    const { kind, key, trap } = this.current;

    if (verdict === 'expired') return { correct: false, message: 'Депеша просрочена. Штаб недоволен.' };

    if (verdict === 'burned') {
      return kind === 'enemy'
        ? { correct: true, message: 'Вражеская депеша сожжена.' }
        : { correct: false, message: 'Сожжён настоящий приказ штаба!' };
    }

    if (kind === 'enemy') return { correct: false, message: 'На фронт ушёл приказ противника!' };
    if (this.shift === key) return { correct: true, message: 'Приказ передан без искажений.' };
    if (trap && this.shift === trap.key) {
      return { correct: false, message: 'Передан подложный приказ! Сверяйся с журналом.' };
    }
    return { correct: false, message: 'Передана бессмыслица: сдвиг неверный.' };
  }

  private nextPlan(): Plan {
    const queued = this.queue.shift();
    if (queued) return queued;

    const rules = this.rules;
    if (this.random() < rules.trapShare) {
      const trap = this.trapDeck.draw();
      this.queue.push({ kind: 'friendly', text: trap.context[1] }, { kind: 'trap', trap });
      return { kind: 'friendly', text: trap.context[0] };
    }
    if (this.random() < rules.enemyShare) return { kind: 'enemy', text: this.enemyDeck.draw() };

    const deck = this.random() < rules.longTextShare ? this.longDeck : this.shortDeck;
    return { kind: 'friendly', text: deck.draw() };
  }

  private build(plan: Plan): Dispatch {
    const rules = this.rules;
    const key = this.randomKey();
    const base = {
      number: this.dispatchNumber,
      key,
      timerMs: rules.timerSeconds * 1000,
      hint: null,
    };

    if (plan.kind === 'trap') {
      const truth = sign(plan.trap.truth, FRIENDLY_SIGNATURE);
      return {
        ...base,
        kind: 'trap',
        plainText: truth,
        journalText: plan.trap.truth,
        cipherText: encrypt(truth, key),
        trap: { key: this.randomTrapKey(key), text: sign(plan.trap.fake, FRIENDLY_SIGNATURE) },
      };
    }

    const text =
      plan.kind === 'enemy'
        ? sign(plan.text, this.signatureDeck.draw())
        : rules.signed
          ? sign(plan.text, FRIENDLY_SIGNATURE)
          : plan.text;

    return {
      ...base,
      kind: plan.kind,
      plainText: text,
      journalText: plan.text,
      cipherText: encrypt(text, key),
      trap: null,
    };
  }

  /** Случайный сдвиг 1..32 (0 — это открытый текст). */
  private randomKey(): number {
    return 1 + Math.floor(this.random() * (ALPHABET_SIZE - 1));
  }

  private randomTrapKey(trueKey: number): number {
    let key = this.randomKey();
    while (circularDistance(key, trueKey) < TRAP_MIN_KEY_GAP) key = this.randomKey();
    return key;
  }

  private addToJournal(entry: string): void {
    this.journal.unshift(entry);
    this.journal.length = Math.min(this.journal.length, JOURNAL_SIZE);
  }
}
