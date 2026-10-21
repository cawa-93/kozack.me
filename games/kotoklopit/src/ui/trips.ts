// Картки поїздок (§8.5): куди поїхати, подія на місці, аварія.

import { DISEASES, DOCTOR_TREAT, GROOMER, MODIFIERS, SHELTER, STERILIZATION, TRIPS, VET } from "../sim/config";
import { breederCatPrice, breederCats, shelterCats, tripCat } from "../sim/destinations";
import { breedById } from "../sim/breeds";
import { visibility } from "../sim/knowledge";
import { tripBlocker } from "../sim/trips";
import type { AccidentLoss, Destination, DiseaseId, GameState, IllnessId, Quality } from "../sim/types";
import { DESTINATION_TITLES } from "../scenes/RaceScene";
import { diseaseTitle, ILLNESS_TITLES } from "../texts";
import { shopCatalog } from "./shop";
import { SERVICE_TITLES } from "./titles";
import type { CartLine } from "../sim/shop";
import { element, type Card } from "./overlay";
import { breedText, plural } from "./cards";
import { traitChips } from "./traits";

const minutesText = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? ` ${m % 60} хв` : ""}` : `${m} хв`);

const BLOCKERS = {
  cat: "Візьміть кота на руки й підійдіть із ним до дверей.",
  carrier: "Потрібна переноска: її можна замовити з телефона.",
  "no-cat": "Спершу опустіть кота.",
  office: "Їхати в офіс треба лише в день зборів.",
  show: "Виставка — лише в її день.",
} as const;

/** Куди поїхати (§8.5). */
export function destinationCard(state: GameState, onPick: (d: Destination) => void, onCancel: () => void): Card {
  const list = element("div", "shop");
  // Причину, через яку не можна їхати нікуди, кажуть один раз, а не в кожному рядку.
  const everywhere = state.character.held?.kind === "cat" && tripBlocker(state, "shop") === "no-cat";
  for (const destination of Object.keys(TRIPS) as Destination[]) {
    const blocker = tripBlocker(state, destination);
    if ((destination === "office" && blocker === "office") || (destination === "show" && blocker === "show")) continue;
    const row = element("div", "shop-row");
    const trip = TRIPS[destination];
    const name = element("span", "shop-name", DESTINATION_TITLES[destination]);
    const note = blocker === null || (everywhere && blocker === "no-cat") ? `🚗 ~${minutesText(trip.road)} · 🕐 ~${minutesText(trip.visit)}` : BLOCKERS[blocker];
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
    body: [...(everywhere ? ["З котом на руках — лише туди, де потрібен кіт."] : []), list],
    actions: [],
    onDismiss: onCancel,
    closable: true,
  };
}

const LOSS_TEXTS: Record<AccidentLoss, string> = {
  repair: "Ремонт машини: −60 ₴.",
  health: "Легкі забої.",
  sanity: "Нерви на межі.",
  cat: "Кіт у переносці страшенно перелякався.",
};

export function accidentCard(state: GameState, onClose: () => void): Card {
  const losses = state.trip?.losses ?? [];
  return {
    kicker: "Аварія",
    title: "Бам!",
    body: [
      "Сталася аварія. Решту дня довелося оформлювати документи, і додому вдалося потрапити лише ввечері.",
      ...(losses.length > 0 ? losses.map((l) => LOSS_TEXTS[l]) : ["На щастя, без інших втрат."]),
    ],
    actions: [{ label: "Додому", primary: true, onSelect: onClose }],
  };
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

/** Що вже зробили на місці: огляд, лікування, кафе. */
export interface VisitLog {
  exam: { health: number; mood: number } | null;
  done: string[];
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
        body.push(`${cat.name} у переносці. Огляд покаже всі хвороби.`);
        body.push(row("Огляд", "🕐 1 год", button(`Оглянути — ${VET.exam} ₴`, VET.exam, h.exam)));
        break;
      }
      body.push(
        `Ветеринар оглянув ${cat.name}: здоров'я — ${describe(log.exam.health, ["відмінне", "добре", "так собі", "погане"])}, настрій — ${describe(log.exam.mood, ["чудовий", "добрий", "кепський", "жахливий"])}.`,
      );
      const known = cat.diseases.filter((d) => d.known);
      if (known.length === 0) body.push("Хвороб не знайдено.");
      if (cat.pregnancy?.known) body.push(`${cat.name} вагітна.`);
      body.push(`Порода: ${breedText(cat.breed, cat.breedKnown)}.`);
      if (!cat.sterilized)
        body.push(row(cat.sex === "male" ? "Кастрація" : "Стерилізація", "🕐 2 год, потім кілька днів відновлення", button(`Зробити — ${STERILIZATION.price} ₴`, STERILIZATION.price, h.sterilize)));
      const list = element("div", "shop");
      for (const d of known) {
        const chronic = DISEASES[d.id].cure.kind === "control";
        list.append(
          row(
            diseaseTitle(d.id),
            chronic ? "хронічна: ліки на тиждень" : "🕐 1 год",
            button(`${SERVICE_TITLES.treat.cheap} — ${VET.cheap} ₴`, VET.cheap, () => h.treat(d.id, "cheap")),
            button(`${SERVICE_TITLES.treat.premium} — ${VET.premium} ₴`, VET.premium, () => h.treat(d.id, "premium")),
          ),
        );
      }
      if (known.length > 0) body.push(list);
      break;
    }
    case "doctor": {
      if (!log.done.includes("doctor")) {
        body.push("Лікар огляне вас і, якщо треба, призначить лікування й лікарняний.");
        body.push(row("Огляд", "🕐 1 год", button(`Оглянути — 40 ₴`, 40, h.doctor)));
        break;
      }
      const ill = state.character.illnesses;
      if (ill.length === 0) body.push("Лікар оглянув вас: нічого серйозного. Кілька порад — і стало краще.");
      const list = element("div", "shop");
      for (const i of ill) {
        list.append(
          row(
            ILLNESS_TITLES[i.id],
            "минає одразу; лікарняний з завтра",
            button(`${SERVICE_TITLES.treat.cheap} — ${DOCTOR_TREAT.cheap} ₴`, DOCTOR_TREAT.cheap, () => h.treatSelf(i.id, "cheap")),
            button(`${SERVICE_TITLES.treat.premium} — ${DOCTOR_TREAT.premium} ₴`, DOCTOR_TREAT.premium, () => h.treatSelf(i.id, "premium")),
          ),
        );
      }
      if (ill.length > 0) body.push("Лікар знайшов:", list);
      break;
    }
    case "shelter": {
      body.push(`Кіт із притулку — ${SHELTER.price} ₴. Вибір тижня:`);
      const list = element("div", "shop");
      for (const c of shelterCats(state)) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3);
        const breed = breedText(c.breed, c.breedKnown);
        const facts = [...(breed !== "невідома" ? [`порода: ${breed}`] : []), ...(c.sterilized ? [c.sex === "male" ? "кастрований" : "стерилізована"] : [])];
        const r = row(
          `${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`,
          facts.join(", "),
          button(`Взяти — ${SHELTER.price} ₴`, SHELTER.price, () => h.adopt(c.id)),
        );
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      if (log.done.length > 0) body.push(`Тепер удома: ${log.done.join(", ")}.`);
      body.push(list);
      if (cat) body.push(row(`Віддати ${cat.name}`, "притулок прийме одразу й безкоштовно; здоровий глузд постраждає", button("Віддати", 0, h.giveAway)));
      break;
    }
    case "breeder": {
      const { breed, cats } = breederCats(state);
      const price = breederCatPrice(state);
      body.push(`Розплідник цього тижня пропонує кошенят породи «${breedById(breed).name}» з родоводом. Кошеня — ${price} ₴.`);
      const list = element("div", "shop");
      for (const c of cats) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3);
        const r = row(`${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} тижні`, traits.length > 0 ? "" : "Характер: ?", button(`Взяти — ${price} ₴`, price, () => h.buyKitten(c.id)));
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      if (log.done.length > 0) body.push(`Тепер удома: ${log.done.join(", ")}.`);
      body.push(list);
      break;
    }
    case "groomer":
      if (!cat) break;
      if (log.done.includes("groom")) body.push(`${cat.name} вичесаний і пухнастий, хоч і трохи ображений.`);
      else
        body.push(
          `Грумер приведе ${cat.name} до ладу.`,
          row("Стрижка й вичісування", "🕐 1,5 год", button(`${SERVICE_TITLES.groom.cheap} — ${GROOMER.price.cheap} ₴`, GROOMER.price.cheap, () => h.groom("cheap")), button(`${SERVICE_TITLES.groom.premium} — ${GROOMER.price.premium} ₴`, GROOMER.price.premium, () => h.groom("premium"))),
        );
      break;
    case "cafe":
      if (log.done.includes("cafe")) body.push("Чужі коти — теж коти. Трохи полегшало.");
      else
        body.push(
          "Посидіти з чужими котами: 20 ₴ за годину.",
          row("Скільки сидіти?", "", ...[1, 2, 3].map((n) => button(`🕐 ${n} год — ${20 * n} ₴`, 20 * n, () => h.cafe(n)))),
        );
      break;
    case "show": {
      if (!cat) break;
      const result = log.done.find((d) => d.startsWith("show:"));
      if (!result) {
        body.push(`Виставка котів. ${cat.name} у переносці.`);
        body.push(row(`Записати ${cat.name}`, "🕐 3 год", button(`Участь — ${MODIFIERS.show.fee} ₴`, MODIFIERS.show.fee, h.show)));
        break;
      }
      const prize = Number(result.slice(5));
      body.push(prize > 0 ? `${cat.name} отримує приз: ${prize} ₴! Журі в захваті.` : `${cat.name} цього разу без призу, зате всі охали й ахали.`);
      break;
    }
    case "office":
      body.push("Збори в офісі тривали три години. Керівництво бачило вас особисто.");
      break;
  }
  return { kicker: "Поїздка", title: DESTINATION_TITLES[destination], body, actions };
}

