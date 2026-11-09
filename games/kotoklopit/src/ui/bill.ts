// Рахунок за комунальні у вкладці «Дім» телефона (§6.4): бланк із сумою тижня й кнопкою «Сплатити»; без грошей вона неактивна.

import { utilitiesBill } from "../sim/economy";
import type { GameState } from "../sim/types";
import { BILL_TEXTS, fill } from "../texts";
import { UTILITIES_ICON } from "../view/symbols";
import { iconImage } from "./icons";
import { element } from "./overlay";

/** Рахунок або null, коли сплачувати нічого: тоді його немає зовсім. */
export function billCard(state: GameState, onPay: () => void): HTMLElement | null {
  const bill = utilitiesBill(state);
  if (bill === 0) return null;
  const box = element("div", "bill");
  const head = element("div", "bill-head");
  const icon = iconImage(UTILITIES_ICON);
  if (icon) head.append(icon);
  head.append(element("p", "bill-title", BILL_TEXTS.title));
  const row = element("div", "bill-row");
  row.append(element("span", "bill-name", BILL_TEXTS.week), element("span", "bill-dots"), element("span", "bill-sum", `${bill} ₴`));
  const pay = element("button", "button primary bill-pay", fill(BILL_TEXTS.pay, state.character.address, { сума: bill }));
  pay.disabled = state.character.money < bill;
  pay.addEventListener("click", onPay);
  box.append(head, row, pay);
  return box;
}
