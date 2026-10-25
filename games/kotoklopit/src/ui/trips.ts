// Картки поїздок (§8.5): куди поїхати, подія на місці, аварія.

import { CAFE, DISEASES, DOCTOR, DOCTOR_TREAT, GROOMER, MODIFIERS, SHELTER, STERILIZATION, TRIPS, VET } from "../sim/config";
import { breederCatPrice, breederCats, shelterCats, tripCat, vetExam, vetManner } from "../sim/destinations";
import { breedById } from "../sim/breeds";
import { visibility } from "../sim/knowledge";
import { tripBlocker } from "../sim/trips";
import type { AccidentLoss, Destination, DiseaseId, GameState, IllnessId, Quality } from "../sim/types";
import { DESTINATION_TITLES } from "../scenes/RaceScene";
import { diseaseTitle, fill, ILLNESS_TITLES, VET_MANNER } from "../texts";
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
    // Ветеринар і грумер — коли вже є кіт: до першого кошеняти вони лише муляли б очі (§11.3а).
    if (TRIPS[destination].cat && state.cats.length === 0) continue;
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
  exam: ReturnType<typeof vetExam>;
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
        body.push(`${cat.name} у переносці.`);
        body.push(row("Огляд", "🕐 1 год", button(`${VET.exam} ₴`, VET.exam, h.exam)));
        break;
      }
      body.push(
        `${cat.name}: здоров'я — ${describe(log.exam.health, ["відмінне", "добре", "так собі", "погане"])}, настрій — ${describe(log.exam.mood, ["чудовий", "добрий", "кепський", "жахливий"])}.`,
      );
      // Як кіт поводився на огляді (§9.12): спокійний, шипів чи вирвався.
      if (log.exam.manner) body.push(fill(VET_MANNER.vet[log.exam.manner], cat.sex, { кіт: cat.name }));
      const known = cat.diseases.filter((d) => d.known);
      if (known.length === 0) body.push("Хвороб не знайдено.");
      if (cat.pregnancy?.known) body.push(`${cat.name} вагітна.`);
      body.push(`Порода: ${breedText(cat.breed, cat.breedKnown)}.`);
      if (!cat.sterilized)
        body.push(row(cat.sex === "male" ? "Кастрація" : "Стерилізація", "🕐 2 год", button(`${STERILIZATION.price} ₴`, STERILIZATION.price, h.sterilize)));
      const list = element("div", "shop");
      for (const d of known) {
        const chronic = DISEASES[d.id].cure.kind === "control";
        // Що дало лікування цієї поїздки: без цього рядок не змінювався, і хотілося платити знову.
        const result = log.done.filter((x) => x.startsWith(`${d.id}:`)).at(-1)?.split(":")[1];
        const note = result === "failed" ? "не допомогло" : result === "controlled" ? "✓ під контролем" : chronic ? "хронічна" : "🕐 1 год";
        list.append(
          row(
            diseaseTitle(d.id),
            note,
            button(`${SERVICE_TITLES.treat.cheap} · ${VET.cheap} ₴`, VET.cheap, () => h.treat(d.id, "cheap"), result === "controlled"),
            button(`${SERVICE_TITLES.treat.premium} · ${VET.premium} ₴`, VET.premium, () => h.treat(d.id, "premium"), result === "controlled"),
          ),
        );
      }
      if (known.length > 0) body.push(list);
      break;
    }
    case "doctor": {
      if (!log.done.includes("doctor")) {
        body.push(row("Огляд", "🕐 1 год", button(`${DOCTOR.exam} ₴`, DOCTOR.exam, h.doctor)));
        break;
      }
      const ill = state.character.illnesses;
      if (ill.length === 0) body.push("Лікар оглянув вас: нічого серйозного.");
      const list = element("div", "shop");
      for (const i of ill) {
        list.append(
          row(
            ILLNESS_TITLES[i.id],
            "",
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
        const breed = breedText(c.breed, c.breedKnown);
        const facts = [...(breed !== "невідома" ? [`порода: ${breed}`] : []), ...(c.sterilized ? [c.sex === "male" ? "кастрований" : "стерилізована"] : [])];
        const r = row(
          `${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`,
          facts.join(", "),
          button(`${SHELTER.price} ₴`, SHELTER.price, () => h.adopt(c.id)),
        );
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      if (log.done.length > 0) body.push(`Тепер удома: ${log.done.join(", ")}.`);
      body.push(list);
      if (cat) body.push(row(`${cat.name} → притулок`, "", button("Віддати", 0, h.giveAway)));
      break;
    }
    case "breeder": {
      const { breed, cats } = breederCats(state);
      const price = breederCatPrice(state);
      body.push(`«${breedById(breed).name}», з родоводом.`);
      const list = element("div", "shop");
      for (const c of cats) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3);
        const r = row(`${c.name} ${c.sex === "male" ? "♂" : "♀"} · ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`, traits.length > 0 ? "" : "Характер: ?", button(`${price} ₴`, price, () => h.buyKitten(c.id)));
        if (traits.length > 0) r.querySelector(".shop-name")?.append(traitChips(traits, c.sex));
        list.append(r);
      }
      if (log.done.length > 0) body.push(`Тепер удома: ${log.done.join(", ")}.`);
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
      body.push("Збори в офісі тривали три години. Керівництво бачило вас особисто.");
      break;
  }
  return { kicker: "Поїздка", title: DESTINATION_TITLES[destination], body, actions };
}

