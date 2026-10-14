const BEST_KEY = 'cipher.best';
const MUTED_KEY = 'cipher.muted';

export interface BestResult {
  decoded: number;
  days: number;
}

export function loadBest(): BestResult | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<BestResult>;
    if (typeof data.decoded !== 'number' || typeof data.days !== 'number') return null;
    return { decoded: data.decoded, days: data.days };
  } catch {
    return null;
  }
}

/** Сохраняет результат, если он лучше прежнего. Возвращает true при новом рекорде. */
export function saveBestIfBetter(result: BestResult): boolean {
  if (result.decoded <= 0) return false;
  const best = loadBest();
  if (best && best.decoded >= result.decoded) return false;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(result));
  } catch {
    // хранилище недоступно — просто не запоминаем
  }
  return true;
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
}
