// Рахунок за комунальні у вкладці «Дім» телефона (§6.4): бланк-чек на всю ширину — назва й тиждень угорі, одержувач і сума в
// рамці посередині, рядок цифр чека й кнопка «Сплатити» внизу; без грошей кнопка неактивна. Вигляд — `.bill` в `overlay.css`.

import { utilitiesBill } from "../sim/economy";
import { weekOf } from "../sim/time";
import type { GameState } from "../sim/types";
import { BILL_TEXTS, fill } from "../texts";
import { UTILITIES_ICON } from "../view/symbols";
import { iconImage } from "./icons";
import { element } from "./overlay";

/** Рахунок; коли сплачувати нічого — напівпрозоре місце для нього: гравець бачить, де рахунки з'являтимуться. */
export function billCard(state: GameState, onPay: () => void): HTMLElement {
  const bill = utilitiesBill(state);
  if (bill === 0) return element("div", "bill-empty", BILL_TEXTS.paid);
  const { address } = state.character;
  const week = weekOf(state.day);
  const box = element("div", "bill");

  const head = element("div", "bill-head");
  const icon = iconImage(UTILITIES_ICON);
  if (icon) head.append(icon);
  head.append(element("p", "bill-title", BILL_TEXTS.title));
  const date = element("p", "bill-date bill-hand", fill(BILL_TEXTS.week, address, { n: week }));

  const payee = element("div", "bill-payee");
  payee.append(element("span", "bill-label", BILL_TEXTS.payeeLabel), element("span", "bill-line bill-hand", BILL_TEXTS.payee), element("span", "bill-sum", `${bill} ₴`));

  // Рядок цифр чека — прикраса: тиждень і сума, як номер рахунку й сума внизу справжнього чека.
  // Символів MICR (⑆, ⑈) у шрифтах телефонів часто немає — замість них ASCII.
  const micr = element("p", "bill-micr", `|: ${String(week).padStart(4, "0")} |: ${String(bill).padStart(6, "0")} ||`);
  micr.setAttribute("aria-hidden", "true");

  // Сума — на чеку, а сплачують лише всю: на кнопці її немає.
  const pay = element("button", "button primary bill-pay", BILL_TEXTS.pay);
  pay.disabled = state.character.money < bill;
  pay.addEventListener("click", onPay);
  box.append(head, date, payee, micr, pay);
  return box;
}
