/** Доверие штаба (звёзды). */
export const START_TRUST = 3;
export const MAX_TRUST = 5;

/** Ответ «быстрый», если осталось не меньше этой доли таймера. Даёт +1 звезду. */
export const FAST_ANSWER_SHARE = 0.5;

/** Сдвиг обучающей депеши. */
export const TUTORIAL_KEY = 1;

/** Минимальное расстояние между настоящим и ложным сдвигом в ловушке. */
export const TRAP_MIN_KEY_GAP = 4;

/** Сколько последних приказов показывать в журнале. */
export const JOURNAL_SIZE = 3;

/** После 5-го дня таймер ужимается на столько секунд в день, но не ниже минимума. */
const LATE_TIMER_DROP_SECONDS = 1.5;
const MIN_TIMER_SECONDS = 10;

export interface DayRules {
  timerSeconds: number;
  dispatchCount: number;
  /** Доля длинных депеш среди своих (0..1). */
  longTextShare: number;
  /** Подписывать свои депеши словом «ШТАБ». */
  signed: boolean;
  /** Вероятность вражеской депеши. */
  enemyShare: number;
  /** Вероятность начать цепочку-ловушку (2 депеши контекста + ловушка). */
  trapShare: number;
  /** Что нового в этот день — показывается в сводке перед днём. */
  intro: string;
}

const DAYS: readonly DayRules[] = [
  {
    timerSeconds: 40,
    dispatchCount: 5,
    longTextShare: 0,
    signed: false,
    enemyShare: 0,
    trapShare: 0,
    intro: 'Короткие депеши, времени с запасом. Крути колесо, пока текст не станет читаемым.',
  },
  {
    timerSeconds: 28,
    dispatchCount: 6,
    longTextShare: 1,
    signed: false,
    enemyShare: 0,
    trapShare: 0,
    intro: 'Депеши длиннее, таймер короче.',
  },
  {
    timerSeconds: 26,
    dispatchCount: 6,
    longTextShare: 0.7,
    signed: true,
    enemyShare: 0,
    trapShare: 0,
    intro: 'Свои депеши теперь подписаны: в конце всегда слово ШТАБ. Ищи сдвиг по подписи.',
  },
  {
    timerSeconds: 24,
    dispatchCount: 7,
    longTextShare: 0.7,
    signed: true,
    enemyShare: 0.35,
    trapShare: 0,
    intro: 'Противник шлёт фальшивки за своей подписью (ГЕНЕРАЛ ВОЛК и другие). Их нужно СЖЕЧЬ.',
  },
  {
    timerSeconds: 22,
    dispatchCount: 7,
    longTextShare: 0.7,
    signed: true,
    enemyShare: 0.25,
    trapShare: 0.3,
    intro:
      'Двойной шифр: депеша читается на двух сдвигах. Верен приказ, который согласуется с журналом прошлых приказов.',
  },
];

export function getDayRules(day: number): DayRules {
  const last = DAYS[DAYS.length - 1];
  if (day <= DAYS.length) return DAYS[Math.max(0, day - 1)];

  const extraDays = day - DAYS.length;
  return {
    ...last,
    timerSeconds: Math.max(MIN_TIMER_SECONDS, last.timerSeconds - extraDays * LATE_TIMER_DROP_SECONDS),
    intro: 'Фронт горит. Таймер всё короче.',
  };
}
