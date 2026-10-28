// Картки поїздок (§8.5): куди поїхати, подія на місці, аварія.

import { ACCIDENT, BREEDING, CAFE, DISEASES, DOCTOR, DOCTOR_TREAT, GROOMER, MODIFIERS, SHELTER, STERILIZATION, TRIPS, VET, WEIGHT } from "../sim/config";
import { breederCatPrice, breederCats, shelterCats, sterilizeBlocker, tripCat, vetManner } from "../sim/destinations";
import { giveAwayBlocker } from "../sim/farewell";
import { breedById, MIXED } from "../sim/breeds";
import { visibility } from "../sim/knowledge";
import { tripBlocker } from "../sim/trips";
import type { AccidentLoss, Destination, DiseaseId, GameState, IllnessId, Quality, VisitLog } from "../sim/types";
import { DESTINATION_TITLES } from "../scenes/RaceScene";
import { BREED_ABOUT, diseaseTitle, farewellText, fill, ILLNESS_TITLES, SHELTER_GIVEN, VET_ADVICE, VET_MANNER } from "../texts";
import { shopCatalog } from "./shop";
import { SERVICE_TITLES } from "./titles";
import type { CartLine } from "../sim/shop";
import { element, type Card } from "./overlay";
import { breedLine, breedText, plural } from "./cards";
import { traitChips } from "./traits";

const minutesText = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? ` ${m % 60} хв` : ""}` : `${m} хв`);

const BLOCKERS = {
  cat: "Візьміть кота на руки й підійдіть із ним до дверей.",
  carrier: "Потрібна переноска: її можна замовити з телефона.",
  "no-cat": "Спершу опустіть кота.",
  newborn: "Новонароджене — лише біля мами.",
  office: "Їхати в офіс треба лише в день зборів.",
  show: "Виставка — лише в її день.",
} as const;

/** Куди поїхати (§8.5). */
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
    const name = element("span", "shop-name", DESTINATION_TITLES[destination]);
    const note = blocker === null || (everywhere !== null && blocker === everywhere) ? `🚗 ~${minutesText(trip.road)} · 🕐 ~${minutesText(trip.visit)}` : BLOCKERS[blocker];
    name.append(element("span", "shop-stock", note));
    row.append(name);
    const button = element("button", "button", "Їхати");
    button.disabled = blocker !== null;
    button.addEventListener("click", () => onPick(destination));
    row.append(button);
    list.append(row);
  }
  return {
    kicker: "Поїздка",
    title: "Куди поїхати?",
    body: [...(everywhere === "no-cat" ? ["З котом на руках — лише туди, де потрібен кіт."] : everywhere === "newborn" ? [BLOCKERS.newborn] : []), list],
    actions: [],
    onDismiss: onCancel,
    closable: true,
  };
}

const LOSS_TEXTS: Record<AccidentLoss, string> = {
  repair: `Ремонт машини: −${ACCIDENT.repair} ₴.`,
  health: "Легкі забої.",
  sanity: "Нерви на межі.",
  cat: "{кіт} у переносці страшенно [перелякався|перелякалася].",
};

/** Ремонт: скільки справді заплатили — грошей могло бути менше (перевірка поїздок 2026-10-28: картка завжди казала «−60 ₴»). */
function repairText(paid: number = ACCIDENT.repair): string {
  if (paid >= ACCIDENT.repair) return LOSS_TEXTS.repair;
  const shown = Math.floor(paid);
  return shown > 0 ? `Ремонт машини: −${shown} ₴ — усе, що було.` : "Ремонт машини: грошей на нього не було.";
}

/** Втрата аварії: ремонт — скільки заплатили, переляканий кіт — той, що їхав у переносці (крок 17, вичитка 2026-10-28). */
function lossText(state: GameState, loss: AccidentLoss): string {
  if (loss === "repair") return repairText(state.trip?.repaired);
  const cat = state.cats.find((c) => c.id === state.trip?.cat);
  return loss === "cat" ? fill(LOSS_TEXTS.cat, cat?.sex ?? "male", { кіт: cat?.name ?? "Кіт" }) : LOSS_TEXTS[loss];
}

export function accidentCard(state: GameState, onClose: () => void): Card {
  const losses = state.trip?.losses ?? [];
  return {
    kicker: "Аварія",
    title: "Бам!",
    body: [
      "Сталася аварія. Решту дня довелося оформлювати документи, і додому вдалося потрапити лише під ніч.",
      ...(losses.length > 0 ? losses.map((l) => lossText(state, l)) : ["На щастя, без інших втрат."]),
    ],
    actions: [{ label: "Додому", primary: true, onSelect: onClose }],
  };
}

/** Узяті коти, що їдуть додому (притулок, розплідник): дієслово — за числом (крок 17, вичитка 2026-10-28). */
function goingHome(body: (string | HTMLElement)[], log: VisitLog): void {
  const names = log.done.filter((x) => !x.startsWith("given:"));
  if (names.length > 0) body.push(`${names.length === 1 ? "Їде" : "Їдуть"} додому з вами: ${names.join(", ")}.`);
}

export interface VisitHandlers {
  /** Купити кошик на місці (§6.4). */
  checkout: (cart: CartLine[]) => void;
  exam: () => void;
  treat: (disease: DiseaseId, quality: Quality) => void;
  doctor: () => void;
  treatSelf: (illness: IllnessId, quality: Quality) => void;
  adopt: (cat: number) => void;
  sterilize: () => void;
  giveAway: () => void;
  buyKitten: (cat: number) => void;
  groom: (quality: Quality) => void;
  cafe: (hours: number) => void;
  show: () => void;
  home: () => void;
}


const describe = (value: number, words: [string, string, string, string]): string => words[value >= 75 ? 0 : value >= 50 ? 1 : value >= 25 ? 2 : 3];

/** Подія на місці (§8.5). */
export function visitCard(state: GameState, log: VisitLog, h: VisitHandlers): Card {
  const trip = state.trip;
  const destination = trip?.destination ?? "shop";
  const money = Math.floor(state.character.money);
  const body: (string | HTMLElement)[] = [`👛 ${money} ₴`];
  const actions = [{ label: "Додому", primary: true, onSelect: h.home }];
  const button = (label: string, price: number, onClick: () => void, disabled = false): HTMLButtonElement => {
    const b = element("button", "button", label);
    b.disabled = disabled || price > money;
    b.addEventListener("click", onClick);
    return b;
  };
  const row = (title: string, stock: string, ...buttons: HTMLElement[]): HTMLElement => {
    const r = element("div", "shop-row");
    const name = element("span", "shop-name", title);
    if (stock) name.append(element("span", "shop-stock", stock));
    r.append(name, ...buttons);
    return r;
  };
  const cat = tripCat(state);
  switch (destination) {
    case "shop":
      body.push(shopCatalog(state, "store", h.checkout));
      break;
    case "vet": {
      if (!cat) break;
      if (!log.exam) {
        body.push(`${cat.name} у переносці.`);
        body.push(row("Огляд", "🕐 1 год", button(`${VET.exam} ₴`, VET.exam, h.exam)));
        break;
      }
      body.push(
        `${cat.name}: здоров'я — ${describe(log.exam.health, ["відмінне", "добре", "так собі", "погане"])}, настрій — ${describe(log.exam.mood, ["чудовий", "добрий", "кепський", "жахливий"])}, вага — ${log.exam.weight >= WEIGHT.visible ? "зайва" : "у нормі"}.`,
      );
      // Як кіт поводився на огляді (§9.12): спокійний, шипів чи вирвався.
      if (log.exam.manner) body.push(fill(VET_MANNER.vet[log.exam.manner], cat.sex, { кіт: cat.name }));
      const known = cat.diseases.filter((d) => d.known);
      // Вилікуване цієї поїздки зникає зі списку: без рядка картка казала б «хвороб не знайдено», ніби їх і не було.
      const cured = log.done.filter((x) => x.endsWith(":cured")).map((x) => diseaseTitle(x.split(":")[0] ?? "").toLowerCase());
      if (cured.length > 0) body.push(`Вилікувано: ${cured.join(", ")}.`);
      else if (known.length === 0) body.push("Хвороб не знайдено.");
      if (cat.pregnancy?.known) body.push(`${cat.name} вагітна.`);
      body.push(breedLine(cat.breed, cat.breedKnown, cat.sex) ?? "Порода: невідома.");
      const blocker = sterilizeBlocker(state, cat);
      const why = { young: `замале: оперують з ${BREEDING.minAge} тижнів`, pregnant: "вагітна: стерилізувати можна після пологів", nursing: "годує кошенят: після тижня годування" };
      if (!cat.sterilized && blocker !== null) body.push(row(cat.sex === "male" ? "Кастрація" : "Стерилізація", why[blocker]));
      else if (!cat.sterilized)
        body.push(row(cat.sex === "male" ? "Кастрація" : "Стерилізація", "🕐 2 год", button(`${STERILIZATION.price} ₴`, STERILIZATION.price, h.sterilize)));
      const list = element("div", "shop");
      for (const d of known) {
        // Ожиріння грошима не лікують — лише дієта й ігри (§9.12, «Схильність до повноти»).
        if (DISEASES[d.id].cure.kind === "weight") {
          list.append(row(diseaseTitle(d.id), "дієта й ігри"));
          continue;
        }
        const chronic = DISEASES[d.id].cure.kind === "control";
        // Що дало лікування цієї поїздки: без цього рядок не змінювався, і хотілося платити знову.
        const result = log.done.filter((x) => x.startsWith(`${d.id}:`)).at(-1)?.split(":")[1];
        // Скільки ще діє контроль, куплений раніше: інакше гравець платив знову, не знаючи, що хвороба вже під контролем.
        const left = chronic && d.controlled !== null ? d.controlled - state.day + 1 : 0;
        const note =
          result === "failed"
            ? "не допомогло"
            : result === "controlled"
              ? "✓ під контролем"
              : left > 0
                ? `під контролем ще ${left} ${plural(left, "день", "дні", "днів")}`
                : chronic
                  ? "хронічна"
                  : "🕐 1 год";
        list.append(
          row(
            diseaseTitle(d.id),
            note,
            button(`${SERVICE_TITLES.treat.cheap} · ${VET.cheap} ₴`, VET.cheap, () => h.treat(d.id, "cheap"), result === "controlled" || left > VET.controlDays.cheap),
            button(`${SERVICE_TITLES.treat.premium} · ${VET.premium} ₴`, VET.premium, () => h.treat(d.id, "premium"), result === "controlled" || left > VET.controlDays.premium),
          ),
        );
      }
      if (known.length > 0) body.push(list);
      // Порада ветеринара до кожної знайденої хвороби — одне речення без чисел (рішення автора 2026-10-28, Д2).
      for (const d of known) {
        const advice = VET_ADVICE[d.id];
        if (advice) body.push(`${diseaseTitle(d.id)}: ${advice.replace(/^./, (c) => c.toLowerCase())}`);
      }
      break;
    }
    case "doctor": {
      if (!log.done.includes("doctor")) {
        body.push(row("Огляд", "🕐 1 год", button(`${DOCTOR.exam} ₴`, DOCTOR.exam, h.doctor)));
        break;
      }
      const ill = state.character.illnesses;
      // Що дало лікування цієї поїздки, як і у ветеринара: інакше вилікуване зникало, і картка казала «нічого серйозного»,
      // а після невдалого дешевого не змінювалася зовсім (перевірка поїздок 2026-10-28).
      const results = log.done.filter((x) => x.startsWith("self:")).map((x) => x.split(":") as [string, IllnessId, string]);
      const cured = results.filter(([, , result]) => result === "cured").map(([, id]) => ILLNESS_TITLES[id].toLowerCase());
      if (cured.length > 0) body.push(`Вилікувано: ${cured.join(", ")}.`);
      else if (ill.length === 0) body.push("Лікар оглянув вас: нічого серйозного.");
      const list = element("div", "shop");
      for (const i of ill) {
        const failed = results.filter(([, id]) => id === i.id).at(-1)?.[2] === "failed";
        list.append(
          row(
            ILLNESS_TITLES[i.id],
            failed ? "не допомогло" : "",
            button(`${SERVICE_TITLES.treat.cheap} · ${DOCTOR_TREAT.cheap} ₴`, DOCTOR_TREAT.cheap, () => h.treatSelf(i.id, "cheap")),
            button(`${SERVICE_TITLES.treat.premium} · ${DOCTOR_TREAT.premium} ₴`, DOCTOR_TREAT.premium, () => h.treatSelf(i.id, "premium")),
          ),
        );
      }
      if (ill.length > 0) body.push("Лікар знайшов:", list);
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
          button(`${SHELTER.price} ₴`, SHELTER.price, () => h.adopt(c.id)),
        );
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      goingHome(body, log);
      // Відданий у притулок кіт: без рядка він просто зникав з картки (крок 17, вичитка 2026-10-28).
      for (const id of log.done.filter((x) => x.startsWith("given:")).map((x) => Number(x.slice(6)))) {
        const entry = state.album.find((e) => e.id === id);
        if (!entry) continue;
        const text = farewellText(entry, diseaseTitle);
        body.push(fill(SHELTER_GIVEN, entry.sex, { кіт: entry.name }), `«${text.title}». ${text.life}`);
      }
      body.push(list);
      // Новонароджених і їхню матір не віддають (§9.8): без підпису кнопка мовчки нічого не робила (перевірка поїздок 2026-10-28).
      const blocker = cat ? giveAwayBlocker(state, cat) : null;
      if (cat && blocker === "newborn") body.push(row(`${cat.name} → притулок`, "замале: притулок бере котів від тижня"));
      else if (cat && blocker === "nursing") body.push(row(`${cat.name} → притулок`, "годує новонароджених — поки що лишається вдома"));
      else if (cat) body.push(row(`${cat.name} → притулок`, "", button("Віддати", 0, h.giveAway)));
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
        const r = row(`${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`, traits.length > 0 ? "" : "Характер: ?", button(`${price} ₴`, price, () => h.buyKitten(c.id)));
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      goingHome(body, log);
      body.push(list);
      break;
    }
    case "groomer":
      if (!cat) break;
      if (log.done.includes("groom")) {
        body.push(fill("{кіт} [вичесаний|вичесана] й [пухнастий|пухнаста], хоч і трохи [ображений|ображена].", cat.sex, { кіт: cat.name }));
        const manner = vetManner(cat);
        if (manner) body.push(fill(VET_MANNER.groomer[manner], cat.sex, { кіт: cat.name }));
      } else
        body.push(
          `${cat.name} у переносці.`,
          row("Грумінг", "🕐 1,5 год", button(`${SERVICE_TITLES.groom.cheap} · ${GROOMER.price.cheap} ₴`, GROOMER.price.cheap, () => h.groom("cheap")), button(`${SERVICE_TITLES.groom.premium} · ${GROOMER.price.premium} ₴`, GROOMER.price.premium, () => h.groom("premium"))),
        );
      break;
    case "cafe":
      if (log.done.includes("cafe")) body.push("Чужі коти — теж коти. Трохи полегшало.");
      else
        body.push(
          row("Посидіти з котами", "", ...[1, 2, 3].map((n) => button(`🕐 ${n} год · ${CAFE.pricePerHour * n} ₴`, CAFE.pricePerHour * n, () => h.cafe(n)))),
        );
      break;
    case "show": {
      if (!cat) break;
      const result = log.done.find((d) => d.startsWith("show:"));
      if (!result) {
        body.push(`${cat.name} у переносці.`);
        body.push(row("Участь", "🕐 3 год", button(`${MODIFIERS.show.fee} ₴`, MODIFIERS.show.fee, h.show)));
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
  return { kicker: "Поїздка", title: DESTINATION_TITLES[destination], body, actions };
}

