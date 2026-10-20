// Картки поїздок (§8.5): куди поїхати, подія на місці, аварія.

import { DISEASES, DOCTOR_TREAT, GROOMER, MODIFIERS, SHELTER, STERILIZATION, TRIPS, VET } from "../sim/config";
import { breederCatPrice, breederCats, GOODS, goodsKey, shelterCats, shopModifier, shopPrice, tripCat, type Goods } from "../sim/destinations";
import { breedById } from "../sim/breeds";
import { fitsStorage, freeSlots } from "../sim/economy";
import { visibility } from "../sim/knowledge";
import { traitName } from "../sim/traits";
import { tripBlocker } from "../sim/trips";
import type { AccidentLoss, Destination, DiseaseId, GameState, IllnessId, Quality } from "../sim/types";
import { DESTINATION_TITLES } from "../scenes/RaceScene";
import { diseaseTitle, fill, ILLNESS_TITLES } from "../texts";
import { element, type Card } from "./overlay";
import { breedText, plural } from "./cards";

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
  for (const destination of Object.keys(TRIPS) as Destination[]) {
    const blocker = tripBlocker(state, destination);
    if ((destination === "office" && blocker === "office") || (destination === "show" && blocker === "show")) continue;
    const row = element("div", "shop-row");
    const trip = TRIPS[destination];
    const name = element("span", "shop-name", DESTINATION_TITLES[destination]);
    name.append(element("span", "shop-stock", blocker ? BLOCKERS[blocker] : `дорога ~${minutesText(trip.road)}, на місці ~${minutesText(trip.visit)}`));
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
    body: [
      "Дорогою — гонка: оминайте машини. Повільно — безпечно, але довго; швидко — ризиковано. Поки вас немає, коти вдома самі.",
      list,
    ],
    actions: [{ label: "Залишитися вдома", primary: true, onSelect: onCancel }],
    onDismiss: onCancel,
  };
}

const LOSS_TEXTS: Record<AccidentLoss, string> = {
  repair: "Ремонт машини: −60.",
  health: "Легкі забої: здоров'я −10.",
  sanity: "Нерви: здоровий глузд −10.",
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
  buy: (goods: Goods, quality: Quality) => void;
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
  const body: (string | HTMLElement)[] = [`Гроші: ${money}.`];
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
    case "shop": {
      body.push("Ціни магазину сьогодні:");
      const list = element("div", "shop");
      for (const g of GOODS) {
        const mod = Math.round(shopModifier(state, g) * 100);
        const tag = mod < 0 ? `ЗНИЖКА ${-mod}%` : mod > 0 ? `ПОДОРОЖЧАННЯ ${mod}%` : "звичайна ціна";
        const full = "thing" in g && freeSlots(state, g.thing) <= 0;
        // Запас, що не влізе у сховище (§6.4).
        const fits = (q: Quality): boolean => !("product" in g) || fitsStorage(state, g.product, q);
        list.append(
          row(
            GOODS_TITLES[goodsKey(g)] ?? goodsKey(g),
            full ? "немає місця вдома" : tag,
            ...(["cheap", "premium"] as const).map((q) => {
              const price = shopPrice(state, g, q);
              const label = fits(q) ? `${q === "cheap" ? "Дешеве" : "Дороге"} — ${price}` : `${q === "cheap" ? "Дешеве" : "Дороге"} — не вміститься`;
              return button(label, price, () => h.buy(g, q), full || !fits(q));
            }),
          ),
        );
      }
      body.push(list);
      break;
    }
    case "vet": {
      if (!cat) break;
      if (!log.exam) {
        body.push(`${cat.name} у переносці. Огляд покаже всі хвороби.`);
        body.push(row("Огляд", "1 година", button(`Оглянути — ${VET.exam}`, VET.exam, h.exam)));
        break;
      }
      body.push(
        `Ветеринар оглянув ${cat.name}: здоров'я — ${describe(log.exam.health, ["відмінне", "добре", "так собі", "погане"])}, настрій — ${describe(log.exam.mood, ["чудовий", "добрий", "кепський", "жахливий"])}.`,
      );
      const known = cat.diseases.filter((d) => d.known);
      if (known.length === 0) body.push("Хвороб не знайдено.");
      if (cat.pregnancy?.known) body.push(`${cat.name} вагітна: кошенята з'являться в ніч на понеділок.`);
      body.push(`Порода: ${breedText(cat.breed, cat.breedKnown)}.`);
      if (!cat.sterilized)
        body.push(row(cat.sex === "male" ? "Кастрація" : "Стерилізація", "операція 2 години, потім 3 дні відновлення; потрібен корм для стерилізованих", button(`Зробити — ${STERILIZATION.price}`, STERILIZATION.price, h.sterilize)));
      const list = element("div", "shop");
      for (const d of known) {
        const chronic = DISEASES[d.id].cure.kind === "control";
        list.append(
          row(
            diseaseTitle(d.id),
            chronic ? "хронічна: ліки на тиждень" : "1 година",
            button(`Дешеве — ${VET.cheap}`, VET.cheap, () => h.treat(d.id, "cheap")),
            button(`Дороге — ${VET.premium}`, VET.premium, () => h.treat(d.id, "premium")),
          ),
        );
      }
      if (known.length > 0) body.push(list);
      break;
    }
    case "doctor": {
      if (!log.done.includes("doctor")) {
        body.push("Лікар огляне вас і, якщо треба, призначить лікування й лікарняний.");
        body.push(row("Огляд", "1 година", button(`Оглянути — 40`, 40, h.doctor)));
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
            button(`Дешеве — ${DOCTOR_TREAT.cheap}`, DOCTOR_TREAT.cheap, () => h.treatSelf(i.id, "cheap")),
            button(`Дороге — ${DOCTOR_TREAT.premium}`, DOCTOR_TREAT.premium, () => h.treatSelf(i.id, "premium")),
          ),
        );
      }
      if (ill.length > 0) body.push("Лікар знайшов:", list);
      break;
    }
    case "shelter": {
      body.push(`Кіт із притулку — ${SHELTER.price}. Вибір тижня:`);
      const list = element("div", "shop");
      for (const c of shelterCats(state)) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3).map((t) => fill(traitName(t), c.sex));
        const facts = [`порода: ${breedText(c.breed, c.breedKnown)}`, ...(c.sterilized ? [c.sex === "male" ? "кастрований" : "стерилізована"] : []), ...traits];
        list.append(
          row(
            `${c.name} — ${c.sex === "male" ? "кіт" : "кішка"}, ${c.ageWeeks} ${plural(c.ageWeeks, "тиждень", "тижні", "тижнів")}`,
            facts.join(", "),
            button(`Взяти — ${SHELTER.price}`, SHELTER.price, () => h.adopt(c.id)),
          ),
        );
      }
      if (log.done.length > 0) body.push(`Тепер удома: ${log.done.join(", ")}.`);
      body.push(list);
      if (cat) body.push(row(`Віддати ${cat.name}`, "притулок прийме одразу й безкоштовно; здоровий глузд постраждає", button("Віддати", 0, h.giveAway)));
      break;
    }
    case "breeder": {
      const { breed, cats } = breederCats(state);
      const price = breederCatPrice(state);
      body.push(`Розплідник цього тижня пропонує кошенят породи «${breedById(breed).name}» з родоводом. Кошеня — ${price}.`);
      const list = element("div", "shop");
      for (const c of cats) {
        const traits = c.traits.filter((t) => visibility(state, t) === 3).map((t) => fill(traitName(t), c.sex));
        list.append(row(`${c.name} — ${c.sex === "male" ? "кіт" : "кішка"}, ${c.ageWeeks} тижні`, traits.join(", ") || "характер — загадка", button(`Взяти — ${price}`, price, () => h.buyKitten(c.id))));
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
          `Грумер вичеше ${cat.name}: шерстяних грудок не буде тиждень (дорогий — два).`,
          row("Стрижка й вичісування", "1,5 години", button(`Дешевий — ${GROOMER.price.cheap}`, GROOMER.price.cheap, () => h.groom("cheap")), button(`Дорогий — ${GROOMER.price.premium}`, GROOMER.price.premium, () => h.groom("premium"))),
        );
      break;
    case "cafe":
      if (log.done.includes("cafe")) body.push("Чужі коти — теж коти. Трохи полегшало.");
      else
        body.push(
          "Посидіти з чужими котами: 20 за годину. Кожна наступна година тішить менше, а вдома ревниві коти відчують чужий запах.",
          row("Скільки сидіти?", "", ...[1, 2, 3].map((n) => button(`${n} год`, 20 * n, () => h.cafe(n)))),
        );
      break;
    case "show": {
      if (!cat) break;
      const result = log.done.find((d) => d.startsWith("show:"));
      if (!result) {
        body.push(`Виставка котів: участь — ${MODIFIERS.show.fee}. Журі дивиться на породу, вигляд і настрій. ${cat.name} у переносці.`);
        body.push(row(`Записати ${cat.name}`, "3 години на місці", button(`Участь — ${MODIFIERS.show.fee}`, MODIFIERS.show.fee, h.show)));
        break;
      }
      const prize = Number(result.slice(5));
      body.push(prize > 0 ? `${cat.name} отримує приз: ${prize}! Журі в захваті.` : `${cat.name} цього разу без призу, зате всі охали й ахали.`);
      break;
    }
    case "office":
      body.push("Збори в офісі тривали три години. Керівництво бачило вас особисто — це рахується як робота.");
      break;
  }
  return { kicker: "Поїздка", title: DESTINATION_TITLES[destination], body, actions };
}

const GOODS_TITLES: Record<string, string> = {
  food: "Продукти",
  hygiene: "Засоби гігієни",
  catFood: "Котячий корм",
  sterileFood: "Корм для стерилізованих",
  litter: "Наповнювач",
  pills: "Таблетки для котів",
  drops: "Краплі для котів",
  humanMeds: "Ліки для себе",
  treats: "Ласощі для котів",
  collar: "Нашийник",
  bell: "Дзвіночок на нашийник",
  shampoo: "Шампунь для котів",
  detergent: "Пральний засіб",
  "thing:bowl": "Миска для корму",
  "thing:water": "Миска для води",
  "thing:litter": "Лоток",
  "thing:toy": "Іграшка-вудочка",
  "thing:house": "Будиночок",
  "thing:scratcher": "Кігтеточка",
  "thing:carrier": "Переноска",
  "thing:feeder": "Автогодівниця",
  "thing:fountain": "Фонтанчик для води",
  "thing:robot": "Робот-пилосос",
};
