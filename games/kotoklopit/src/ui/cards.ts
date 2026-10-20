// Вміст карток: титулка дня з ранковими повідомленнями, кінець гри, телефон, нова гра.

import { DIFFICULTY, PRODUCTS, THINGS } from "../sim/config";
import { deliveryPrice, freeSlots, isAppliance, supplyCount, thingDeliveryPrice, utilitiesDue } from "../sim/economy";
import { breedById, MIXED } from "../sim/breeds";
import { visibility } from "../sim/knowledge";
import { inHeat, isNursing, showsPregnancy } from "../sim/reproduction";
import { traitGroup, traitName } from "../sim/traits";
import { weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Cat, Difficulty, GameEnd, GameState, HomeItem, Medicine, NightReport, Product, Quality, Sex, ThingKind } from "../sim/types";
import {
  CONTROLS_KEYBOARD,
  CONTROLS_TOUCH,
  DAY_MODIFIER_TEXTS,
  DIFFICULTY_TITLES,
  diseaseTitle,
  endingText,
  farewellText,
  fill,
  FIRST_DAY_HINT,
  BIRTH_BONUS,
  BIRTH_MESSAGE,
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
  const newCats = (night?.newCats ?? []).map((id) => state.cats.find((c) => c.id === id)).filter((c) => c !== undefined);
  for (const cat of newCats.filter((c) => c.source !== "born")) {
    body.push(fill(KITTEN_MESSAGE, sex, { персонаж: name, кошеня: cat.name }));
    body.push(fill(KITTEN_BONUS, sex, { бонус: DIFFICULTY[state.difficulty].newCatSanity }));
  }
  // Пологи (§9.8): одне повідомлення на кожну матір.
  const born = newCats.filter((c) => c.source === "born");
  for (const motherId of new Set(born.map((c) => c.parents.mother))) {
    const kittens = born.filter((c) => c.parents.mother === motherId);
    const mother = state.cats.find((c) => c.id === motherId);
    const values = { кішка: mother?.name ?? "кішка", кількість: kittens.length, кошенята: kittens.map((c) => c.name).join(", ") };
    // `[одне|кілька]`: «чоловіча» форма — одне кошеня.
    body.push(fill(BIRTH_MESSAGE, kittens.length === 1 ? "male" : "female", values));
    body.push(fill(BIRTH_BONUS, sex, { бонус: DIFFICULTY[state.difficulty].newCatSanity }));
  }
  for (const id of night?.givenCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle);
    body.push(note(`${entry.name} — у нових руках`, text.cause, `«${text.title}». ${text.life}`));
  }
  for (const id of night?.lostCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle);
    body.push(note(`Прощавай, ${entry.name}`, text.cause, `«${text.title}». ${text.life}`, `Здоровий глузд ${DIFFICULTY[state.difficulty].lostCatSanity}.`));
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
  sterileFood: { name: "Корм для стерилізованих", unit: portions, place: "у шафці" },
  litter: { name: "Наповнювач", unit: (n) => `${n} ${plural(n, "чистка", "чистки", "чисток")} лотка`, place: "у запасі" },
  pills: { name: "Таблетки для котів", unit: (n) => `${n} ${plural(n, "таблетка", "таблетки", "таблеток")}`, place: "у шафці" },
  drops: { name: "Краплі для котів", unit: (n) => `${n} ${plural(n, "доза", "дози", "доз")}`, place: "у шафці" },
  humanMeds: { name: "Ліки для себе", unit: (n) => `${n} ${plural(n, "доза", "дози", "доз")}`, place: "у ванній" },
  treats: { name: "Ласощі для котів", unit: (n) => `${n} ${plural(n, "ласощі", "ласощі", "ласощів")}`, place: "у шафці" },
  collar: { name: "Нашийник", unit: (n) => `${n} шт.`, place: "у шафці" },
  bell: { name: "Дзвіночок на нашийник", unit: (n) => `${n} шт.`, place: "у шафці" },
  shampoo: { name: "Шампунь для котів", unit: (n) => `${n} ${plural(n, "купання", "купання", "купань")}`, place: "у ванній" },
  detergent: { name: "Пральний засіб", unit: (n) => `${n} ${plural(n, "прання", "прання", "прань")}`, place: "у ванній" },
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

const THING_TITLES: Record<ThingKind, string> = {
  bowl: "Миска для корму",
  water: "Миска для води",
  litter: "Лоток",
  toy: "Іграшка-вудочка",
  house: "Будиночок",
  scratcher: "Кігтеточка",
  carrier: "Переноска",
  feeder: "Автогодівниця",
  fountain: "Фонтанчик для води",
  robot: "Робот-пилосос",
};

export type PhoneTab = "supplies" | "things" | "mine" | "cats" | "album";

export interface PhoneHandlers {
  order: (product: Product, quality: Quality) => void;
  orderThing: (thing: ThingKind, quality: Quality) => void;
  discard: (item: HomeItem) => void;
  advertise: (cat: Cat) => void;
  tab: (tab: PhoneTab) => void;
  close: () => void;
}

const PHONE_TABS: Record<PhoneTab, string> = { supplies: "Запаси", things: "Речі для котів", mine: "Мої речі", cats: "Коти", album: "Альбом пам'яті" };

/** Телефон персонажа (§6.4): доставка запасів і речей для котів, викинути річ. */
export function phoneCard(state: GameState, tab: PhoneTab, handlers: PhoneHandlers): Card {
  const money = Math.floor(state.character.money);
  const waiting = state.home.deliveries.length;
  const body: (string | HTMLElement)[] = [];
  if (tab === "supplies") body.push(`Гроші: ${money}. Доставка коштує на 10% дорожче, ніж у магазині, і привозить пакунок приблизно за 6 годин. Пакунок чекатиме під дверима.`, suppliesShop(state, money, handlers));
  if (tab === "things") body.push(`Гроші: ${money}. Нова річ стане на вільне місце, а кожна, крім іграшок, трохи збільшує комунальні.`, thingsShop(state, money, handlers));
  if (tab === "mine") body.push(`Комунальні цього тижня: ${utilitiesDue(state)}. Викинута річ зникає, і комунальні зменшуються.`, myThings(state, handlers));
  if (tab === "cats") body.push(...catCards(state, handlers));
  if (tab === "album") body.push(...albumCards(state));
  if (waiting > 0) body.push(note(`У дорозі: ${waiting} ${plural(waiting, "пакунок", "пакунки", "пакунків")}`));
  return {
    kicker: "Телефон",
    title: PHONE_TABS[tab],
    body,
    actions: [
      ...(Object.keys(PHONE_TABS) as PhoneTab[]).filter((t) => t !== tab).map((t) => ({ label: PHONE_TABS[t], onSelect: () => handlers.tab(t) })),
      { label: "Закрити", primary: true, onSelect: handlers.close },
    ],
    onDismiss: handlers.close,
  };
}

const weeks = (n: number): string => `${n} ${plural(n, "тиждень", "тижні", "тижнів")}`;

/** Порода, як її знає персонаж (§9.11): «Мейнкун × ?», «невідома». */
export function breedText(breed: readonly [string, string], known: readonly [boolean, boolean]): string {
  const [a, b] = breed;
  if (a === MIXED && b === MIXED) return known[0] || known[1] ? "безпородний" : "невідома";
  if (a === b) return known[0] || known[1] ? `${breedById(a).name}, чистокровна` : "невідома";
  const half = (id: string, k: boolean): string => (k ? (id === MIXED ? "безпородний" : breedById(id).name) : "?");
  return known[0] || known[1] ? `${half(a, known[0])} × ${half(b, known[1])}` : "невідома";
}

/** Картки котів (§9.9): ім'я, стать, вік, відомі риси й стани. */
function catCards(state: GameState, handlers: PhoneHandlers): (string | HTMLElement)[] {
  if (state.cats.length === 0) return ["Котів поки немає."];
  return state.cats.map((cat) => {
    const lines = [`${cat.name} — ${cat.sex === "male" ? "кіт" : "кішка"}, ${weeks(cat.ageWeeks)}`, `Порода: ${breedText(cat.breed, cat.breedKnown)}.`];
    const states: string[] = [];
    if (cat.sterilized && cat.sterilizedKnown) states.push(cat.sex === "male" ? "кастрований" : "стерилізована");
    if (cat.pregnancy?.known) states.push("вагітна");
    else if (showsPregnancy(state, cat)) states.push("здається, вагітна");
    if (inHeat(state, cat)) states.push("у тічці");
    if (isNursing(state, cat)) states.push("годує кошенят");
    if (cat.ageWeeks === 0 && cat.source === "born") states.push("новонароджене");
    if (state.ads.includes(cat.id)) states.push("завтра заберуть нові господарі");
    if (states.length > 0) lines.push(`${states.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()));
    const known = cat.diseases.filter((d) => d.known).map((d) => diseaseTitle(d.id));
    if (known.length > 0) lines.push(`Ветеринар знайшов: ${known.join(", ")}.`);
    for (const trait of cat.traits) {
      const seen = visibility(state, trait);
      if (seen === 3) lines.push(`${fill(traitName(trait), cat.sex)} (${traitGroup(trait.group).title})`);
      else if (seen === 2) {
        const signs = traitGroup(trait.group).signs;
        if (signs) lines.push(`Здається, ${cat.name} ${trait.level > 0 ? signs[0] : signs[1]}.`);
      } else if (seen === 1) lines.push("❓ Помічено щось дивне");
    }
    if (cat.traits.every((t) => visibility(state, t) === 0)) lines.push("Характер поки загадка: придивляйтеся.");
    const card = note(...lines);
    if (cat.ageWeeks >= 1 && !state.ads.includes(cat.id)) {
      const ad = element("button", "button", "Дати оголошення «віддам у добрі руки»");
      ad.style.marginTop = "8px";
      ad.addEventListener("click", () => handlers.advertise(cat));
      card.append(ad);
    }
    return card;
  });
}

const CAUSE_TITLES: Record<string, string> = { old: "старість", sorrow: "туга", given: "віддано в добрі руки" };

/** Альбом пам'яті (§9.7): ім'я, вік, усі риси, причина й опис життя. */
function albumCards(state: GameState): (string | HTMLElement)[] {
  if (state.album.length === 0) return ["Альбом поки порожній."];
  return [...state.album].reverse().map((entry) => {
    const cause = entry.cause.kind === "disease" ? `хвороба «${diseaseTitle(entry.cause.disease)}»` : CAUSE_TITLES[entry.cause.kind] ?? "";
    const text = farewellText(entry, diseaseTitle);
    const traits = entry.traits.map((t) => fill(traitName(t), entry.sex)).join(", ") || "без помітних рис";
    return note(`${entry.name}, ${weeks(entry.ageWeeks)} — ${cause}`, `«${text.title}». ${text.life}`, `Характер: ${traits}.`);
  });
}

function thingsShop(state: GameState, money: number, handlers: PhoneHandlers): HTMLElement {
  const shop = element("div", "shop");
  for (const thing of Object.keys(THINGS) as ThingKind[]) {
    const row = element("div", "shop-row");
    const have =
      thing === "carrier" ? (state.home.carrier ? 1 : 0) : isAppliance(thing) ? (state.home.appliances[thing] ? 1 : 0) : state.home.items.filter((i) => i.kind === thing).length;
    const free = freeSlots(state, thing);
    const name = element("span", "shop-name", THING_TITLES[thing]);
    const stock = thing === "toy" ? `Є: ${have}` : `Є: ${have} · вільних місць: ${Math.max(0, free)}`;
    name.append(element("span", "shop-stock", `${stock} · комунальні +${THINGS[thing].utilities}`));
    row.append(name);
    for (const quality of ["cheap", "premium"] as const) {
      const price = thingDeliveryPrice(thing, quality);
      const button = element("button", "button", `${quality === "cheap" ? "Дешева" : "Дорога"} — ${price}`);
      button.disabled = price > money || free <= 0 || state.end !== null;
      button.addEventListener("click", () => handlers.orderThing(thing, quality));
      row.append(button);
    }
    shop.append(row);
  }
  return shop;
}

function myThings(state: GameState, handlers: PhoneHandlers): HTMLElement {
  const shop = element("div", "shop");
  for (const item of state.home.items) {
    const row = element("div", "shop-row");
    const name = element("span", "shop-name", THING_TITLES[item.kind]);
    name.append(element("span", "shop-stock", `${item.quality === "cheap" ? "дешева" : "дорога"} · комунальні +${THINGS[item.kind].utilities}`));
    row.append(name);
    const button = element("button", "button", "Викинути");
    button.addEventListener("click", () => handlers.discard(item));
    row.append(button);
    shop.append(row);
  }
  return shop;
}

function suppliesShop(state: GameState, money: number, handlers: PhoneHandlers): HTMLElement {
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
      button.addEventListener("click", () => handlers.order(product, quality));
      row.append(button);
    }
    shop.append(row);
  }
  return shop;
}

export type CareChoice = { medicine: Medicine } | { treat: Quality } | { collar: Quality } | "bell";

/** Чи є чим доглянути кота біля шафки (§8.7): ліки, ласощі, нашийник, дзвіночок. */
export function hasCareSupplies(state: GameState): boolean {
  return (["pills", "drops", "treats", "collar", "bell"] as const).some((p) => supplyCount(state, p) > 0);
}

/** Догляд за котом на руках біля шафки (§8.7, §9.5, §9.10): ліки, ласощі, нашийник. */
export function careCard(state: GameState, cat: Cat, onPick: (choice: CareChoice) => void, onCancel: () => void): Card {
  const supply = state.home.supplies;
  const actions: { label: string; primary?: boolean; onSelect: () => void }[] = [];
  for (const m of ["pills", "drops"] as const) {
    if (supplyCount(state, m) > 0) actions.push({ label: `${PRODUCT_TITLES[m].name} (${supplyCount(state, m)})`, onSelect: () => onPick({ medicine: m }) });
  }
  for (const q of ["premium", "cheap"] as const) {
    if (supply.treats[q] > 0) actions.push({ label: `${q === "premium" ? "Дорогі" : "Дешеві"} ласощі (${supply.treats[q]})`, onSelect: () => onPick({ treat: q }) });
  }
  for (const q of ["premium", "cheap"] as const) {
    if (supply.collar[q] > 0) actions.push({ label: `${q === "premium" ? "Дорогий" : "Дешевий"} нашийник`, onSelect: () => onPick({ collar: q }) });
  }
  if (cat.collar && !cat.collar.bell && supplyCount(state, "bell") > 0) actions.push({ label: "Дзвіночок на нашийник", onSelect: () => onPick("bell") });
  const first = actions[0];
  if (first) first.primary = true;
  return {
    kicker: "Догляд",
    title: `${cat.name} на руках`,
    body: [
      "Ліки кіт не любить: дати їх — неприємна справа. Таблетка допомагає від застуди, глистів і старечих болячок, краплі — від бліх і кон'юнктивіту. Ласощі одразу після неприємного зменшують образу. З нашийником над котом видно його ім'я.",
    ],
    actions: [...actions, { label: "Скасувати", onSelect: onCancel }],
    onDismiss: onCancel,
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
