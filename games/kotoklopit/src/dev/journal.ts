// Журнал режиму розробки (§11.5): приховані зміни й кидки випадковості з подій симуляції.

import { CHEWING, GIFTS } from "../sim/config";
import { onEvent, type GameEvent } from "../sim/events";
import { formatClock, weekdayOf, weekOf } from "../sim/time";
import type { Delivery, GameState, Item, Quality } from "../sim/types";

export interface JournalEntry {
  stamp: string;
  text: string;
}

const LIMIT = 300;
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"] as const;

const number = (value: number, digits = 1): string =>
  (Math.round(value * 10 ** digits) / 10 ** digits).toLocaleString("uk-UA");
const signed = (value: number, digits = 1): string => (value >= 0 ? `+${number(value, digits)}` : `−${number(-value, digits)}`);
const quality = (q: Quality): string => (q === "premium" ? "дорога" : "дешева");
const item = (i: Item): string => {
  if (i.kind === "cat") return "кіт";
  if (i.kind === "toy") return `іграшка (${quality(i.toy.quality)})`;
  const name = { raw: "сира порція", meal: "страва", burnt: "підгоріла страва", catfood: "порція корму" }[i.kind];
  return `${name} (${quality(i.quality)})`;
};
/** Де кіт точить кігті (§9.12). */
const SCRATCH_SPOTS = { post: "кігтеточка", sofa: "диван, ремонт до комунальних", doorframe: "одвірок, ремонт до комунальних", rug: "потягується на килимку", boxes: "коробки біля входу" } as const;
const goods = (d: Delivery): string => ("product" in d ? d.product : d.thing);
const catName = (state: GameState, id: number): string => state.cats.find((c) => c.id === id)?.name ?? `кіт ${id}`;

export function stampOf(state: GameState): string {
  return `т${weekOf(state.day)} ${WEEKDAYS[weekdayOf(state.day)]} ${formatClock(state.minute)}`;
}

/** Текст події для журналу або null, якщо подія не варта запису. */
export function describe(event: GameEvent, state: GameState): string | null {
  switch (event.type) {
    case "night": {
      const r = event.report;
      const parts = [`Ніч: сон ${number(r.sleptHours)} год${r.collapsed ? " (впав без сил)" : ""}`];
      for (const wake of r.wakeUps) parts.push(`розбудив ${catName(state, wake.cat)} (${wake.reason === "morning" ? "ранкова побудка" : "нічні пісні"})`);
      parts.push(`кроки — ${r.steps.join(", ")}`);
      if (r.utilities) parts.push(`комунальні — ${r.utilities.outcome}, сплачено ${r.utilities.paid}`);
      if (r.newCats.length > 0) parts.push(`нових котів: ${r.newCats.length}`);
      parts.push(`здоровий глузд ${number(r.sanityEvening)} → ${number(r.sanityMorning)}`);
      return parts.join("; ");
    }
    case "game-over":
      return `Кінець гри: ${event.end}`;
    case "took":
      return `Узято з «${event.object}»: ${item(event.item)}`;
    case "call-remark":
      return "Колеги помітили брудний одяг на відеодзвінку";
    case "supply-used":
      return `Запас «${event.product}»: лишилося ${event.left}`;
    case "put":
      return `Покладено на «${event.object}»: ${item(event.item)}`;
    case "trashed":
      return `Викинуто: ${item(event.item)}`;
    case "refused":
      return `Відмова «${event.object}»: ${event.reason}`;
    case "cooked":
      return event.result === "ready" ? "Плита: страва готова" : "Плита: страва підгоріла";
    case "ate":
      return `Їжа: ситість ${signed(event.satiety)}, у холодильнику ${event.food}`;
    case "showered":
      return `Душ: гігієна ${signed(event.hygiene)} (${event.quality ?? "без засобів"}), лишилося ${event.left}`;
    case "work-started":
      return "Сів за комп'ютер";
    case "work-stopped":
      return `Робота ${number(event.minutes / 60, 2)} год: гроші ${signed(event.money)}, репутація ${signed(event.reputation, 2)}, здоровий глузд ${signed(event.sanity)}`;
    case "patience":
      return {
        ok: "Терпіння знову вище 50",
        warning: "Терпіння нижче 50: «!»",
        out: "Терпіння на нулі: «Х», репутація падає",
      }[event.level];
    case "standup-started":
      return "Летучка почалася";
    case "standup":
      return `Летучка: ${event.attended ? "присутність" : "пропуск"}, репутація ${signed(event.reputation, 2)}`;
    case "ordered":
      return `Замовлено ${goods(event.delivery)} (${event.delivery.quality}): −${event.price}`;
    case "job-rejected":
      return `Пошук роботи: вакансія ${event.vacancy} — відмова`;
    case "unpacked":
      return `Ящики розпаковано: ${event.moved.map((m) => `${m.product} ${m.amount}`).join(", ")}`;
    case "doorbell":
      return event.delivery ? `Кур'єр під дверима: ${goods(event.delivery)} (${event.delivery.quality})` : "Дзвонять у двері";
    case "discarded":
      return `Викинуто: ${event.item.kind} (${event.item.quality})`;
    case "cat-gone":
      return `Кота не стало: ${event.entry.name} (${event.entry.cause.kind}${event.entry.cause.kind === "disease" ? ` ${event.entry.cause.disease}` : ""}), середній настрій ${number(event.entry.lifeMood)}`;
    case "cat-ill":
      return `${catName(state, event.cat)} захворів: ${event.disease}`;
    case "cat-cured":
      return `${catName(state, event.cat)} одужав: ${event.disease}`;
    case "symptom":
      return `${catName(state, event.cat)}: симптом ${event.symptom}`;
    case "medicine":
      return `${catName(state, event.cat)}: ліки ${event.medicine} (${quality(event.quality)})`;
    case "trait-noticed":
      return `${catName(state, event.cat)}: риса ${event.group} — рівень видимості ${event.stage}`;
    case "trip-started":
      return `Поїздка: ${event.destination}`;
    case "trip-arrived":
      return `Доїхали: ${event.destination}`;
    case "trip-crashed":
      return `Аварія: ${event.losses.join(", ") || "без втрат"}`;
    case "trip-ended":
      return `Удома після поїздки: ${event.destination}`;
    case "bought":
      return `Куплено в магазині: ${event.goods} (${event.quality})`;
    case "vet-exam":
      return `Огляд у ветеринара: ${catName(state, event.cat)}`;
    case "sterilized":
      return `${catName(state, event.cat)}: стерилізовано`;
    case "heat":
      return `${catName(state, event.cat)}: тічка`;
    case "pregnant":
      return `${catName(state, event.cat)}: вагітна`;
    case "birth":
      return `${catName(state, event.cat)} народила кошенят: ${event.kittens}`;
    case "career":
      return `Кар'єра: ${event.change}, посада ${event.position}`;
    case "person-ill":
      return `Персонаж захворів: ${event.illness}`;
    case "person-cured":
      return `Персонаж одужав: ${event.illness}`;
    case "person-meds":
      return `Ліки для себе (${quality(event.quality)})`;
    case "treat":
      return `${catName(state, event.cat)}: ласощі (${quality(event.quality)})`;
    case "collar":
      return `${catName(state, event.cat)}: новий нашийник`;
    case "collar-lost":
      return `${catName(state, event.cat)} загубив нашийник`;
    case "bathed":
      return `${catName(state, event.cat)}: купання`;
    case "laundry":
      return `Прання: ${event.stage}`;
    case "vacuumed":
      return "Пропилососено";
    case "feeder":
      return `Автогодівниця насипала корм: мисок ${event.bowls.length}`;
    case "feeder-emptied":
      return `Автогодівницю спорожнено: корм повернувся в сховище (${event.products.join(", ")})`;
    case "robot":
      return "Робот-пилосос прибрав шерсть";
    case "broke":
      return `Зламалося: ${event.what}`;
    case "beard":
      return event.kind === "shave" ? "Поголився" : "Підрівняв бороду";
    case "modifier":
      return `Модифікатор: ${event.kind} (${number(event.value)})`;
    case "groomed":
      return `${catName(state, event.cat)} вилизує ${catName(state, event.friend)}`;
    case "cat-fight":
      return `Бійка: ${catName(state, event.cats[0])} і ${catName(state, event.cats[1])}`;
    case "hissed":
      return `${catName(state, event.cat)} шипить на ${catName(state, event.at)}`;
    case "hissed-guests":
      return `${catName(state, event.cat)} шипить на гостей`;
    case "fight-stopped":
      return `Бійку розборонено (${catName(state, event.cat)} на руках)`;
    case "scratched":
      return `${catName(state, event.cat)} точить кігті: ${SCRATCH_SPOTS[event.where]}`;
    case "received":
      return `Забрано пакунків: ${event.deliveries.length}`;
    case "dash":
      return null;
    case "glitch":
      return `Кидок: збій керування (шанс ${number(event.chance * 100, 0)}% за хвилину), зсув ${number(event.angle, 0)}°`;
    case "cat-mood":
      return `${catName(state, event.cat)}: настрій ${signed(event.delta)} — ${event.reason}`;
    case "cat-love":
      return `${catName(state, event.cat)}: любов ${signed(event.delta)} — ${event.reason}`;
    case "cat-day":
      return `${catName(state, event.cat)}: день — середній настрій ${number(event.mood)}, здоров'я ${signed(event.health)}, любов ${signed(event.love)}`;
    case "cat-trait":
      return `${catName(state, event.cat)}: нова риса «${event.title}» ${event.level > 0 ? "+" : ""}${event.level}`;
    case "cat-arrived":
      return `Новий кіт: ${catName(state, event.cat)}`;
    case "cat-ate":
      return `${catName(state, event.cat)} поїв (${quality(event.quality)} корм)`;
    case "cat-refused-food":
      return `${catName(state, event.cat)} відмовився від дешевого корму`;
    case "meow":
    case "purr":
    case "cat-felt":
      return null;
    case "mess":
      return `Безлад: ${event.mess.kind}${event.mess.cat !== null ? ` від ${catName(state, event.mess.cat)}` : ""}`;
    case "cleaned":
      return `Прибрано: ${event.what}, здоровий глузд ${signed(event.sanity)}`;
    case "fed":
      return `Насипано корм: у мисці ${event.food}`;
    case "watered":
      return "Долито воду";
    case "fur-tuft":
      return `Жмут шерсті на руці від ${catName(state, event.cat)}`;
    case "coughing":
      return `${catName(state, event.cat)} кахикає`;
    case "litter-refused":
      return `${catName(state, event.cat)} понюхав брудний лоток і пішов`;
    case "tap-opened":
      return `Відкрито кран: ${catName(state, event.cat)} п'є`;
    case "picked-up":
      return `На руках: ${catName(state, event.cat)}${event.offended ? " (проти волі)" : ""}`;
    case "cat-broke-free":
      return `${catName(state, event.cat)} вирвався з рук і втік`;
    case "sulked":
      return `${catName(state, event.cat)} дметься й відходить`;
    case "cat-left":
      return `${catName(state, event.cat)} не хоче пестощів і йде з-під руки`;
    case "cat-dodged":
      return `${catName(state, event.cat)} не йде на руки: брудний одяг`;
    case "put-down":
      return `Опущено: ${catName(state, event.cat)}`;
    case "bite":
      return `${catName(state, event.cat)} вкусив: здоров'я −1`;
    case "clawed":
      return `${catName(state, event.cat)} подряпав біля переноски: здоров'я −3`;
    case "catnip":
      return `${catName(state, event.cat)}: котяча м'ята — ${event.reaction === "roll" ? "катається" : event.reaction === "frenzy" ? "шаленіє" : "понюхав і пішов"}`;
    case "cat-remembered":
      return `${catName(state, event.cat)} пам'ятає «ні»: не лізе ${event.zone === "desk" ? "на комп'ютер" : "на кухонний стіл"}`;
    case "chatter":
      return `${catName(state, event.cat)} «кекає» на птахів за вікном`;
    case "window-angry":
      return `${catName(state, event.cat)} злиться біля вікна`;
    case "played":
      return `Гра з ${catName(state, event.cat)}: ${number(event.minutes)} хв`;
    case "knocked":
      return `${catName(state, event.cat)} скинув ${item(event.item)} з «${event.object}»`;
    case "trinket-fell":
      return `${catName(state, event.cat)} скинув «${event.trinket}» з «${event.object}»${event.broken ? ": розбився, ремонт" : ""}`;
    case "trinket-sniffed":
      return `${catName(state, event.cat)} обнюхав «${event.trinket}» і обійшов`;
    case "stole":
      return `${catName(state, event.cat)} украв ${item(event.item)} з «${event.object}»`;
    case "toy-broke":
      return "Іграшка зламалася";
    case "keyboard":
      return `${catName(state, event.cat)} сів на клавіатуру: робота зупинилася`;
    case "knocked-down":
      return `${catName(state, event.cat)} збив персонажа на зумі`;
    case "tripped":
      return `Персонаж спіткнувся об ${catName(state, event.cat)}`;
    case "cabinet-pawed":
      return `${catName(state, event.cat)} лапою смикає шафку з кормом: ${event.opened ? "відчинив" : "замок тримає"}`;
    case "trash-tipped":
      return `${catName(state, event.cat)} перекинув смітник`;
    case "chewing":
      return `${catName(state, event.cat)} гризе ${event.what === "wire" ? "дріт комп'ютера" : "пакети біля входу"}`;
    case "wire-chewed":
      return `${catName(state, event.cat)} перегриз дріт: комп'ютер не працює`;
    case "bag-chewed":
      return `${catName(state, event.cat)} прогриз пакет: −1 ${event.product}`;
    case "wire-fixed":
      return `Дріт комп'ютера полагоджено: ремонт +${CHEWING.wireRepair}`;
    case "sock-found":
      return event.where === "trip" ? `Шукали шкарпетку перед виїздом: +${GIFTS.sockSearch} хв` : "Пилосос знайшов шкарпетку в котячій схованці";
    case "ambushed":
      return `${catName(state, event.cat)} вистрибнув із засідки на ноги`;
    case "slipped":
      return "Персонаж посковзнувся на шерстяній грудці";
    case "escaped":
      return `${catName(state, event.cat)} вибіг на сходи`;
    case "scared":
      return `${catName(state, event.cat)} злякався гучного звуку й ховається`;
    case "cat-woke":
      return `${catName(state, event.cat)} прокинувся від шуму`;
    case "nervous":
      return `${catName(state, event.cat)} нервово вилизується й ховатиметься`;
    case "cat-returned":
      return `${catName(state, event.cat)} ${event.caught ? "спіймано на сходах" : "повернувся сам"}`;
  }
}

export class Journal {
  readonly entries: JournalEntry[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly stateOf: () => GameState) {
    onEvent((event, state) => {
      const text = describe(event, state);
      if (text !== null) this.add(text, state);
    });
  }

  add(text: string, state: GameState = this.stateOf()): void {
    this.entries.unshift({ stamp: stampOf(state), text });
    this.entries.length = Math.min(this.entries.length, LIMIT);
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  clear(): void {
    this.entries.length = 0;
    for (const listener of this.listeners) listener();
  }
}
