/** Алфавит шифра: 33 буквы русского алфавита, включая Ё. */
export const ALPHABET = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
export const ALPHABET_SIZE = ALPHABET.length;

/** Приводит любой сдвиг к диапазону 0..32 (колесо крутится по кругу). */
export function wrapShift(shift: number): number {
  return ((shift % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE;
}

function shiftLetter(char: string, shift: number): string {
  const index = ALPHABET.indexOf(char);
  if (index === -1) return char; // пробелы и знаки препинания не шифруются
  return ALPHABET.charAt(wrapShift(index + shift));
}

/** Шифр Цезаря: каждая буква сдвигается вперёд по алфавиту на shift. */
export function encrypt(text: string, shift: number): string {
  return Array.from(text, (char) => shiftLetter(char, shift)).join('');
}

export function decrypt(text: string, shift: number): string {
  return encrypt(text, -shift);
}
