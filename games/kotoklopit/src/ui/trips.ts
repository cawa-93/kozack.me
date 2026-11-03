// Картки поїздок (§8.5): куди поїхати, подія на місці, аварія.

import { DISEASES, DOCTOR_TREAT, GROOMER, MODIFIERS, SHELTER, STERILIZATION, STORE_GOODS, TRIPS, VET, WEIGHT } from "../sim/config";
import { breederCatPrice, breederCats, groomerWashes, knownSterilizeBlocker, shelterCats, sterilizeMinutes, sterilizePrice, tripCat, vetManner } from "../sim/destinations";
import { breedById, MIXED } from "../sim/breeds";
import { visibility } from "../sim/knowledge";
import { priceFactor, roadFactor } from "../sim/modifiers";
import { roadMinutes, tripBlocker } from "../sim/trips";
import { formatClock } from "../sim/time";
import type { Destination, DiseaseId, GameState, IllnessId, Quality, VisitLog } from "../sim/types";
import { accidentLines, BREED_ABOUT, DAY_MODIFIER_TEXTS, fill, GROOMED, minutesText, VET_ADVICE, VET_MANNER } from "../texts";
import { destinationLabel, diseaseLabel, illnessLabel } from "./icons";
import { shopCatalog, type CatalogOptions } from "./shop";
import { SERVICE_TITLES, STORE_SECTION_TITLES } from "./titles";
import { catalog, type CartLine } from "../sim/shop";
import { element, type Card, type CardAction } from "./overlay";
import { breedLine, breedText, plural } from "./cards";
import { traitChips } from "./traits";

/** Невдале дешеве лікування цієї поїздки не повторюють — ні у ветеринара, ні в лікаря (§8.5; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6). */
const NO_RETRY = "не допомогло — повторно лише наступного разу";

/**
 * Ціна на кнопці: число й «₴» нерозривно, а з назвою послуги — «Звичайне лікування · 30 ₴»: якщо не вміщується, рядок
 * рветься перед «·», і ціна переходить цілою (рецензія хвилі 3: «30 / ₴» і «·» у кінці рядка).
 */
const priced = (title: string, price: number): string => `${title} ·\u00a0${price}\u00a0₴`;

/**
 * Примітка під назвою рядка (`.shop-stock`): частини через « · », а частина з часом «🕐 1 год» — одним нерозривним шматком.
 * Гліф 🕐 — рядковий блок (`glyphs.ts`), а біля нього браузер рве рядок навіть через нерозривний пробіл.
 */
function stockNote(note: string): HTMLElement {
  const stock = element("span", "shop-stock");
  note.split(" · ").forEach((part, i) => {
    if (i > 0) stock.append(" · ");
    stock.append(part.includes("🕐") || part.includes("🚗") ? element("span", "nowrap", part) : part);
  });
  return stock;
}

/**
 * Чому туди не можна. «no-cat» і «newborn» бувають лише з котом на руках, і тоді — в усіх рядках, тож їх кажуть один раз над
 * списком (рецензія реалізації А15, 2026-10-29: у рядку «no-cat» стояв текст «Спершу опустіть кота.», якого ніхто не бачив).
 */
const BLOCKERS = {
  cat: "Візьміть кота на руки й підійдіть із ним до дверей.",
  carrier: "Потрібна переноска: її можна замовити з телефона.",
  "no-cat": "З котом на руках — лише туди, де потрібен кіт.",
  newborn: "Новонароджене — лише біля мами.",
  office: "Їхати в офіс треба лише в день зборів.",
  show: "Виставка — лише в її день.",
} as const;

/** Гроші персонажа в примітці біля заголовка чи в смузі кошика — у картці рівно один раз (§8.5; рішення автора 2026-11-03). */
const purse = (state: GameState): string => `👛 ${Math.floor(state.character.money)} ₴`;

/** Назва сьогоднішньої події дня (§4.1), якщо вона є й `affects` — для примітки біля заголовка картки (§8.5). */
function dayEvent(state: GameState, affects: boolean): string[] {
  const id = state.modifiers.day;
  const title = id === null ? undefined : DAY_MODIFIER_TEXTS[id]?.title;
  return affects && title !== undefined ? [title] : [];
}

/**
 * Скільки товарів каталогу сьогодні з біркою знижки (§6.4): «7 знижок»; нуль — нічого. Де продають лише частину каталогу
 * (`section` — назва її розділу, `STORE_SECTION_TITLES`), — на що знижки: «ліки: 1 знижка», а не просто «1 знижка», яку біля
 * «Лікар» легко прийняти за знижку на лікування (рецензія 2026-11-03).
 */
function discounts(n: number, section?: string): string[] {
  if (n <= 0) return [];
  const count = `${n} ${plural(n, "знижка", "знижки", "знижок")}`;
  return [section === undefined ? count : `${section.toLocaleLowerCase("uk")}: ${count}`];
}

/**
 * Куди поїхати (§8.5). Підпису «Поїздка» немає, а праворуч від заголовка — подія дня, що змінює дорогу («Пробки», «Порожні
 * дороги»), і гроші (рішення автора 2026-11-03).
 */
export function destinationCard(state: GameState, onPick: (d: Destination) => void, onCancel: () => void): Card {
  const list = element("div", "shop");
  // Причину, через яку не можна їхати нікуди, кажуть один раз, а не в кожному рядку.
  const held = state.character.held?.kind === "cat" ? tripBlocker(state, "shop") : null;
  const everywhere = held === "no-cat" || held === "newborn" ? held : null;
  for (const destination of Object.keys(TRIPS) as Destination[]) {
    const blocker = tripBlocker(state, destination);
    if ((destination === "office" && blocker === "office") || (destination === "show" && blocker === "show")) continue;
    // Ветеринар і грумер — коли вже є кіт: до першого кошеняти вони лише муляли б очі (§11.3а).
    if (TRIPS[destination].cat && state.cats.length === 0) continue;
    const row = element("div", "shop-row");
    const trip = TRIPS[destination];
    // Біля назви пункту — його іконка, та сама, що на табличці на даху будівлі біля парковки (§11.4 «Іконка біля назви»).
    const name = element("span", "shop-name", destinationLabel(destination));
    const note = blocker === null || (everywhere !== null && blocker === everywhere) ? `🚗 ~${minutesText(roadMinutes(state, destination))} · 🕐 ~${minutesText(trip.visit)}` : BLOCKERS[blocker];
    name.append(blocker === null || (everywhere !== null && blocker === everywhere) ? stockNote(note) : element("span", "shop-stock", note));
    row.append(name);
    const button = element("button", "button", "Їхати");
    button.disabled = blocker !== null;
    button.addEventListener("click", () => onPick(destination));
    row.append(button);
    list.append(row);
  }
  return {
    title: "Куди поїхати?",
    aside: [...dayEvent(state, roadFactor(state) !== 1), purse(state)],
    body: [...(everywhere !== null ? [BLOCKERS[everywhere]] : []), list],
    actions: [],
    onDismiss: onCancel,
    closable: true,
  };
}

/**
 * Картка аварії (§8.5): скільки забрали документи й ремонт і коли персонаж удома чи що вже ніч (рішення автора 2026-11-02), втрати
 * й кіт у переносці — рядки `accidentLines` (`src/texts.ts`, щоб їх перевіряли тести без сцен).
 */
export function accidentCard(state: GameState, onClose: () => void): Card {
  return {
    kicker: "Аварія",
    title: "Бам!",
    body: accidentLines(state),
    actions: [{ label: "Додому", primary: true, onSelect: onClose }],
  };
}

/**
 * Узяті коти, що їдуть додому (притулок, розплідник): дієслово — за числом (крок 17, вичитка 2026-10-28). У журналі цих поїздок
 * лише імена взятих: віддавати в притулку нічого (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15), а записи «віддали» зі
 * старих збережень прибирає `upgradeTrip`.
 */
function goingHome(body: (string | HTMLElement)[], log: VisitLog): void {
  const names = log.done;
  if (names.length > 0) body.push(`${names.length === 1 ? "Їде" : "Їдуть"} додому з вами: ${names.join(", ")}.`);
}

export interface VisitHandlers {
  /** Купити кошик на місці (§6.4): у магазині, ліки — у ветеринара й лікаря (§8.5). */
  checkout: (cart: CartLine[]) => void;
  exam: () => void;
  treat: (disease: DiseaseId, quality: Quality) => void;
  treatSelf: (illness: IllnessId, quality: Quality) => void;
  adopt: (cat: number) => void;
  sterilize: () => void;
  buyKitten: (cat: number) => void;
  groom: (quality: Quality) => void;
  show: () => void;
  home: () => void;
}


const describe = (value: number, words: [string, string, string, string]): string => words[value >= 75 ? 0 : value >= 50 ? 1 : value >= 25 ? 2 : 3];

/**
 * Подія на місці (§8.5). Де щось продають (`STORE_GOODS`: магазин, ліки у ветеринара й лікаря) — каталог із кошиком, а внизу
 * смуга кошика з грошима й «Додому» / «Купити» (рішення автора 2026-11-03); деінде — «Додому» кнопкою внизу, а гроші — у
 * примітці праворуч від заголовка. `store` — кошик, що переживає оновлення картки після послуги (`CatalogOptions.kept`), і чи
 * картка — перша після покупки (`CatalogOptions.bought`: мить «✓ Куплено» замість «Додому»).
 */
export function visitCard(state: GameState, log: VisitLog, h: VisitHandlers, store: Pick<CatalogOptions, "kept" | "bought"> = {}): Card {
  const trip = state.trip;
  const destination = trip?.destination ?? "shop";
  const money = Math.floor(state.character.money);
  const body: (string | HTMLElement)[] = [];
  const button = (label: string, price: number, onClick: () => void, disabled = false): HTMLButtonElement => {
    const b = element("button", "button", label);
    b.disabled = disabled || price > money;
    b.addEventListener("click", onClick);
    return b;
  };
  const row = (title: string, stock: string, ...buttons: HTMLElement[]): HTMLElement => {
    const r = element("div", "shop-row");
    const name = element("span", "shop-name", title);
    if (stock) name.append(stockNote(stock));
    r.append(name, ...buttons);
    return r;
  };
  // Порада ветеринара до знайденої хвороби — одне речення без чисел під її назвою (рішення автора 2026-10-28, Д2).
  const advised = (r: HTMLElement, id: string): HTMLElement => {
    const advice = VET_ADVICE[id];
    if (advice) r.querySelector(".shop-name")?.append(element("span", "shop-stock", advice));
    return r;
  };
  const cat = tripCat(state);
  // Стерилізація чи кастрація (§9.8): огляд у ціні, тож рядок видно й до огляду (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А3).
  // До огляду — лише те, що гравець і так знає: прихована вагітність чи стерилізація розкривається оглядом після натискання.
  const sterilizeRow = (): HTMLElement | null => {
    if (!cat) return null;
    const title = cat.sex === "male" ? "Кастрація" : "Стерилізація";
    const done = cat.sex === "male" ? "кастрований" : "стерилізована";
    const age = STERILIZATION.minAge;
    const why = {
      sterilized: log.done.includes("sterilize") ? `✓ ${done}` : `уже ${done}`,
      young: `замале: оперують з ${age} ${plural(age, "тижня", "тижнів", "тижнів")}`,
      pregnant: "вагітна: стерилізувати можна після пологів",
      nursing: "годує кошенят: після тижня годування",
    };
    const blocker = knownSterilizeBlocker(state, cat);
    if (blocker !== null) return row(title, why[blocker]);
    const price = sterilizePrice(state);
    // До огляду операція забирає й годину огляду (рецензія реалізації А6): «🕐 3 год · огляд у ціні», після окремого огляду — «🕐 2 год».
    return row(title, `🕐 ${minutesText(sterilizeMinutes(state))}${log.exam ? "" : " · огляд у ціні"}`, button(`${price}\u00a0₴`, price, h.sterilize));
  };
  switch (destination) {
    case "shop":
      // Каталог — після перемикача, як і ліки у ветеринара й лікаря.
      break;
    case "vet": {
      if (!cat) break;
      if (!log.exam) {
        body.push(`${cat.name} у переносці.`);
        body.push(row("Огляд", `🕐 ${minutesText(TRIPS.vet.visit)}`, button(`${VET.exam}\u00a0₴`, VET.exam, h.exam)));
        const sterilize = sterilizeRow();
        if (sterilize) body.push(sterilize);
        break;
      }
      body.push(
        `${cat.name}: здоров'я — ${describe(log.exam.health, ["відмінне", "добре", "так собі", "погане"])}, настрій — ${describe(log.exam.mood, ["чудовий", "добрий", "кепський", "жахливий"])}, вага — ${log.exam.weight >= WEIGHT.visible ? "зайва" : "у нормі"}.`,
      );
      // Як кіт поводився на огляді (§9.12): спокійний, шипів чи вирвався.
      if (log.exam.manner) body.push(fill(VET_MANNER.vet[log.exam.manner], cat.sex, { кіт: cat.name }));
      const known = cat.diseases.filter((d) => d.known);
      // Вилікуване цієї поїздки зникає зі списку: без рядка картка казала б «хвороб не знайдено», ніби їх і не було. Назви — з
      // іконкою, як і в рядках хвороб (§11.4 «Іконка біля назви»).
      const cured = log.done.filter((x) => x.endsWith(":cured")).map((x) => diseaseLabel(x.split(":")[0] ?? "").toLowerCase());
      if (cured.length > 0) body.push(`Вилікувано: ${cured.join(", ")}.`);
      else if (known.length === 0) body.push("Хвороб не знайдено.");
      if (cat.pregnancy?.known) body.push(`${cat.name} вагітна.`);
      body.push(breedLine(cat.breed, cat.breedKnown, cat.sex) ?? "Порода: невідома.");
      const sterilize = sterilizeRow();
      if (sterilize) body.push(sterilize);
      const list = element("div", "shop");
      // Біля назви хвороби — та сама іконка, що в баблі, яким кіт про неї сигналізує (§11.4 «Іконка біля назви»).
      for (const d of known) {
        // Ожиріння грошима не лікують — лише дієта й ігри (§9.12, «Схильність до повноти»).
        if (DISEASES[d.id].cure.kind === "weight") {
          list.append(advised(row(diseaseLabel(d.id), "дієта й ігри"), d.id));
          continue;
        }
        const chronic = DISEASES[d.id].cure.kind === "control";
        // Що дало лікування цієї поїздки: без цього рядок не змінювався, і хотілося платити знову.
        const result = log.done.filter((x) => x.startsWith(`${d.id}:`)).at(-1)?.split(":")[1];
        // Скільки ще діє контроль, куплений раніше: інакше гравець платив знову, не знаючи, що хвороба вже під контролем.
        const left = chronic && d.controlled !== null ? d.controlled - state.day + 1 : 0;
        const note =
          result === "failed"
            ? NO_RETRY
            : result === "controlled"
              ? "✓ під контролем"
              : left > 0
                ? `під контролем ще ${left} ${plural(left, "день", "дні", "днів")}`
                : chronic
                  ? "хронічна"
                  : `🕐 ${minutesText(VET.treatMinutes)}`;
        list.append(
          advised(row(
            diseaseLabel(d.id),
            note,
            button(priced(SERVICE_TITLES.treat.cheap, VET.cheap), VET.cheap, () => h.treat(d.id, "cheap"), result === "controlled" || result === "failed" || left > VET.controlDays.cheap),
            button(priced(SERVICE_TITLES.treat.premium, VET.premium), VET.premium, () => h.treat(d.id, "premium"), result === "controlled" || result === "failed" || left > VET.controlDays.premium),
          ), d.id),
        );
      }
      if (known.length > 0) body.push(list);
      break;
    }
    case "doctor": {
      // Огляду немає (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6): хвороби персонажа й так видно на панелі, тож картка одразу
      // показує їх із цінами лікування.
      const ill = state.character.illnesses;
      // Що дало лікування цієї поїздки, як і у ветеринара: інакше вилікуване зникало, і картка казала «нічого серйозного»,
      // а після невдалого дешевого не змінювалася зовсім (перевірка поїздок 2026-10-28).
      const results = log.done.filter((x) => x.startsWith("self:")).map((x) => x.split(":") as [string, IllnessId, string]);
      const cured = results.filter(([, , result]) => result === "cured").map(([, id]) => illnessLabel(id).toLowerCase());
      if (cured.length > 0) body.push(`Вилікувано: ${cured.join(", ")}.`);
      else if (ill.length === 0) body.push("Лікар вислухав вас: нічого серйозного.");
      const list = element("div", "shop");
      // Прийом — година на всі хвороби (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А6): коли лікар цієї поїздки вже
      // лікував, часу в рядках не пишуть.
      const time = trip?.visit ? "" : `🕐 ${minutesText(TRIPS.doctor.visit)}`;
      // Біля назви хвороби — та сама іконка, що у відмові ривка (§11.4 «Іконка біля назви»).
      for (const i of ill) {
        const failed = results.filter(([, id]) => id === i.id).at(-1)?.[2] === "failed";
        list.append(
          row(
            illnessLabel(i.id),
            failed ? NO_RETRY : time,
            button(priced(SERVICE_TITLES.treat.cheap, DOCTOR_TREAT.cheap), DOCTOR_TREAT.cheap, () => h.treatSelf(i.id, "cheap"), failed),
            button(priced(SERVICE_TITLES.treat.premium, DOCTOR_TREAT.premium), DOCTOR_TREAT.premium, () => h.treatSelf(i.id, "premium"), failed),
          ),
        );
      }
      if (ill.length > 0) body.push("Скарги:", list);
      break;
    }
    case "shelter": {
      const list = element("div", "shop");
      for (const c of shelterCats(state)) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3);
        const breed = breedText(c.breed, c.breedKnown, c.sex);
        const mixed = c.breed[0] === MIXED && c.breed[1] === MIXED;
        const facts = [...(breed === null ? [] : [mixed ? breed : `порода: ${breed}`]), ...(c.sterilized ? [c.sex === "male" ? "кастрований" : "стерилізована"] : [])];
        const r = row(
          `${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`,
          facts.join(", "),
          button(`${SHELTER.price}\u00a0₴`, SHELTER.price, () => h.adopt(c.id)),
        );
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      goingHome(body, log);
      // Лише взяти кота: віддають через оголошення в телефоні (§9.8; рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15).
      body.push(list);
      break;
    }
    case "breeder": {
      const { breed, cats } = breederCats(state);
      const price = breederCatPrice(state);
      body.push(`Порода — ${breedById(breed).name.toLowerCase()}, з родоводом.`);
      // Яка порода — одним реченням без чисел (рішення автора 2026-10-28, Д4).
      const about = BREED_ABOUT[breed];
      if (about) body.push(about);
      const list = element("div", "shop");
      for (const c of cats) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3);
        const r = row(`${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`, traits.length > 0 ? "" : "Характер: ?", button(`${price}\u00a0₴`, price, () => h.buyKitten(c.id)));
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      goingHome(body, log);
      body.push(list);
      break;
    }
    case "groomer": {
      if (!cat) break;
      // Безшерстого грумер миє, а не вичісує — і картка каже про це чесно (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А15).
      const washes = groomerWashes(cat);
      if (log.done.includes("groom")) {
        body.push(fill(GROOMED[washes ? "hairless" : "coat"], cat.sex, { кіт: cat.name }));
        // Дорогий грумер вилікував дерматит, про який знали з огляду (§8.5; рецензія реалізації А15) — як у ветеринара.
        if (log.done.includes("dermatitis:cured")) body.push(`Вилікувано: ${diseaseLabel("dermatitis").toLowerCase()}.`);
        const manner = vetManner(cat);
        if (manner) body.push(fill(VET_MANNER[washes ? "wash" : "groomer"][manner], cat.sex, { кіт: cat.name }));
        break;
      }
      const titles = SERVICE_TITLES[washes ? "wash" : "groom"];
      body.push(
        `${cat.name} у переносці.`,
        row("Грумінг", `🕐 ${minutesText(TRIPS.groomer.visit)}`, button(priced(titles.cheap, GROOMER.price.cheap), GROOMER.price.cheap, () => h.groom("cheap")), button(priced(titles.premium, GROOMER.price.premium), GROOMER.price.premium, () => h.groom("premium"))),
      );
      break;
    }
    case "show": {
      if (!cat) break;
      const result = log.done.find((d) => d.startsWith("show:"));
      if (!result) {
        body.push(`${cat.name} у переносці.`);
        body.push(row("Участь", `🕐 ${minutesText(TRIPS.show.visit)}`, button(`${MODIFIERS.show.fee}\u00a0₴`, MODIFIERS.show.fee, h.show)));
        break;
      }
      const prize = Number(result.slice(5));
      body.push(prize > 0 ? `${cat.name} отримує приз: ${prize} ₴! Журі в захваті.` : `${cat.name} цього разу без призу, зате всі охали й ахали.`);
      break;
    }
    case "office":
      // Звільнили дорогою — зборів немає, і персонаж одразу їде назад (`officeMeeting`).
      body.push(trip?.visit === 0 ? "На збори вас уже не пустили: ви тут більше не працюєте." : "Збори в офісі тривали три години. Керівництво бачило вас особисто.");
      break;
  }
  // Заголовок — назва пункту з його іконкою, як у «Куди поїхати?» і на табличці на даху (§11.4 «Іконка біля назви»). Годинник —
  // останнім у примітці праворуч від заголовка, коли картка посередині й напису над парковкою немає (§8.5 «На місці — кадр
  // парковки»); підпису «Поїздка» немає (рішення автора 2026-11-03).
  const card = { awayClock: formatClock(state.minute), title: destinationLabel(destination), body };
  if (STORE_GOODS[destination] === undefined) {
    const home: CardAction = { label: "Додому", primary: true, onSelect: h.home };
    return { ...card, aside: [purse(state)], actions: [home] };
  }
  // Каталог пункту з кошиком (§6.4, §8.5): у ветеринара й лікаря — під послугами. Гроші — у смузі кошика, поруч із сумою, а
  // «Додому» — її головна кнопка, доки кошик порожній.
  const shop = shopCatalog(state, "store", { ...store, checkout: h.checkout, home: h.home });
  body.push(shop.list);
  // Подія дня, що змінює ціни того, що є в каталозі («Акція в зоомагазині», «Подорожчання корму»), і скільки знижок.
  const repriced = catalog(state, "store").some((g) => "product" in g && priceFactor(state, g.product) !== 1);
  return { ...card, aside: [...dayEvent(state, repriced), ...discounts(shop.discounted, STORE_SECTION_TITLES[destination])], bar: shop.bar, actions: [] };
}

