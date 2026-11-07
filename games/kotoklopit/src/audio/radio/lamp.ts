// Чи світиться шкала радіо в квартирі (§8.10). Окремий модуль без браузерних залежностей: його читає вигляд квартири.

let lit = false;

export const radioLit = (): boolean => lit;

export function setRadioLit(on: boolean): void {
  lit = on;
}
