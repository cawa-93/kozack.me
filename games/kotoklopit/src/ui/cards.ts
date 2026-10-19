// Вміст карток: титулка дня з ранковими повідомленнями, кінець гри, телефон, нова гра.

import { DIFFICULTY, PRODUCTS } from "../sim/config";
import { deliveryPrice, supplyCount } from "../sim/economy";
import { weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Difficulty, GameEnd, GameState, NightReport, Product, Quality, Sex } from "../sim/types";
import {
  CONTROLS_KEYBOARD,
  CONTROLS_TOUCH,
  DAY_MODIFIER_TEXTS,
  DIFFICULTY_TITLES,
  endingText,
  fill,
  FIRST_DAY_HINT,
  KITTEN_BONUS,
  KITTEN_MESSAGE,
  UTILITIES_MESSAGES,
} from "../texts";
import { element, type Card } from "./overlay";

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function note(...lines: string[]): HTMLElement {
  const box = element("div", "card-note");
  lines.forEach((line, i) => {
    const p = element("p", undefined, line);
    p.style.margin = i === 0 ? "0" : "6px 0 0";
    if (i === 0 && lines.length > 1) p.style.fontWeight = "600";
    box.append(p);
  });
  return box;
}

const isTouch = (): boolean => window.matchMedia("(pointer: coarse)").matches;

/** Титулка дня (§4): тиждень, день, модифікатор і що сталося вночі. */
export function morningCard(state: GameState, night: NightReport | null, onStart: () => void): Card {
  const { name, sex } = state.character;
  const body: (string | HTMLElement)[] = [];
  const modifier = state.modifiers.day ? DAY_MODIFIER_TEXTS[state.modifiers.day] : undefined;
  if (modifier) body.push(note(modifier.title, modifier.situation, modifier.effect));
  for (const id of night?.newCats ?? []) {
    const cat = state.cats.find((c) => c.id === id);
    if (!cat) continue;
    body.push(fill(KITTEN_MESSAGE, sex, { персонаж: name, кошеня: cat.name }));
    body.push(fill(KITTEN_BONUS, sex, { бонус: DIFFICULTY[state.difficulty].newCatSanity }));
  }
  const utilities = night?.utilities;
  if (utilities && utilities.outcome !== "evicted") {
    body.push(fill(UTILITIES_MESSAGES[utilities.outcome], sex, { сума: utilities.paid, борг: utilities.nextDue }));
  }
  if (night === null && state.day === 0) {
    body.push(FIRST_DAY_HINT);
    body.push(note("Керування", isTouch() ? CONTROLS_TOUCH : CONTROLS_KEYBOARD));
  }
  return {
    kicker: `Тиждень ${weekOf(state.day)}`,
    title: capitalize(WEEKDAY_NAMES[weekdayOf(state.day)] ?? ""),
    body,
    actions: [{ label: "Почати день", primary: true, onSelect: onStart }],
    onDismiss: onStart,
  };
}

export interface EndHandlers {
  replayDay: () => void;
  replayWeek: () => void;
  newGame: () => void;
}

/** Екран кінця гри (§6.1). Статистику додасть крок 15 плану. */
export function endCard(state: GameState, end: GameEnd, handlers: EndHandlers): Card {
  const { title, text } = endingText(state, end);
  const retired = end === "retirement";
  return {
    kicker: retired ? "Вихід на пенсію" : "Кінець гри",
    title,
    body: [text],
    actions: [
      { label: "Переграти день", primary: !retired, onSelect: handlers.replayDay },
      { label: "Переграти тиждень", onSelect: handlers.replayWeek },
      { label: "Нова гра", primary: retired, onSelect: handlers.newGame },
    ],
  };
}

const portions = (n: number): string => `${n} ${plural(n, "порція", "порції", "порцій")}`;
const PRODUCT_TITLES: Record<Product, { name: string; unit: (n: number) => string; place: string }> = {
  food: { name: "Продукти", unit: portions, place: "у холодильнику" },
  hygiene: { name: "Засоби гігієни", unit: (n) => `${n} ${plural(n, "душ", "душі", "душів")}`, place: "у ванній" },
  catFood: { name: "Котячий корм", unit: portions, place: "у шафці" },
  litter: { name: "Наповнювач", unit: (n) => `${n} ${plural(n, "чистка", "чистки", "чисток")} лотка`, place: "у запасі" },
};

const QUALITY_TITLES: Record<Quality, string> = { cheap: "Дешеві", premium: "Дорогі" };

/** Українська множина: 1 порція, 2 порції, 5 порцій. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Телефон персонажа: доставка (§6.4). */
export function phoneCard(state: GameState, onOrder: (product: Product, quality: Quality) => void, onClose: () => void): Card {
  const money = Math.floor(state.character.money);
  const shop = element("div", "shop");
  for (const product of Object.keys(PRODUCTS) as Product[]) {
    const titles = PRODUCT_TITLES[product];
    const row = element("div", "shop-row");
    const { units } = PRODUCTS[product];
    const pack = units.cheap === units.premium ? ` · ${titles.unit(units.cheap)}` : "";
    const name = element("span", "shop-name", `${titles.name}${pack}`);
    name.append(element("span", "shop-stock", `Зараз ${titles.place}: ${titles.unit(supplyCount(state, product))}`));
    row.append(name);
    for (const quality of ["cheap", "premium"] as const) {
      const price = deliveryPrice(product, quality);
      const size = pack ? "" : ` (${titles.unit(units[quality])})`;
      const button = element("button", "button", `${QUALITY_TITLES[quality]}${size} — ${price}`);
      button.disabled = price > money || state.end !== null;
      button.addEventListener("click", () => onOrder(product, quality));
      row.append(button);
    }
    shop.append(row);
  }
  const waiting = state.home.deliveries.length;
  const body: (string | HTMLElement)[] = [
    `Гроші: ${money}. Доставка коштує на 10% дорожче, ніж у магазині, і привозить пакунок приблизно за 6 годин. Пакунок чекатиме під дверима.`,
    shop,
  ];
  if (waiting > 0) body.push(note(`У дорозі: ${waiting} ${plural(waiting, "пакунок", "пакунки", "пакунків")}`));
  return {
    kicker: "Телефон",
    title: "Доставка",
    body,
    actions: [{ label: "Закрити", primary: true, onSelect: onClose }],
    onDismiss: onClose,
  };
}

/** Нова гра: персонаж і складність (§5). Повний конструктор додасть крок 15 плану. */
export function newGameCard(onPick: (sex: Sex) => void, onCancel?: () => void): Card {
  const actions = [
    { label: "Марта — жайворонок", primary: true, onSelect: () => onPick("female") },
    { label: "Тарас — сова", onSelect: () => onPick("male") },
  ];
  return {
    kicker: "Нова гра",
    title: "Хто ви?",
    body: [
      "Жайворонок прокидається о 06:00 і легше працює зранку. Сова прокидається о 08:00 і краще почувається ввечері.",
    ],
    actions: onCancel ? [...actions, { label: "Скасувати", onSelect: onCancel }] : actions,
    ...(onCancel ? { onDismiss: onCancel } : {}),
  };
}

export function difficultyCard(onPick: (difficulty: Difficulty) => void): Card {
  return {
    kicker: "Нова гра",
    title: "Складність",
    body: ["Складність змінює заробіток, ціну втрати кота й бонус за нового. Обрати її можна лише на початку гри."],
    actions: (["easy", "normal", "hard"] as const).map((difficulty) => ({
      label: DIFFICULTY_TITLES[difficulty],
      primary: difficulty === "normal",
      onSelect: () => onPick(difficulty),
    })),
  };
}
