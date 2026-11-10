// Унікальна іконка на унікальний кейс (§11.4, правило автора 2026-10-30, `GENERAL_REVIEW.md`, «Відкрите після рішень», п. 7):
// кожен окремий випадок — що бабл події, стан, думка, індикатор сховища чи значок на панелі каже гравцеві — має свою іконку, а
// та сама іконка з тією самою позначкою — лише для того самого значення. Таблицю «випадок → іконка» тест збирає з коду
// (`eventBubbles`, `refusalBubble`, `catThought`, `personThought`, `catAsk`, `stoveIcon`, `itemIcon` і таблиці іконок у
// `symbols.ts`), а не переписує вручну. Свідомо однакові — лише групи одного значення нижче, кожна з причиною (§11.4).

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { PRODUCTS, THINGS, THOUGHTS, TRIPS } from "../src/sim/config";
import type { GameEvent, Refusal } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, Destination, Dish, Item, Product, Save, StatName, ThingKind } from "../src/sim/types";
import type { IconName, Mark } from "../src/view/iconnames";
import { catAsk, DESTINATION_ICONS, DISEASE_ICONS, eventBubbles, HOME_FIXTURE_ICONS, ILLNESS_ICONS, itemIcon, MOOD_ICONS, PERSON_STATE_ICONS, PRODUCT_ICONS, refusalBubble, STAT_ICONS, UTILITIES_ICON, STATE_ICONS, stoveIcon, THING_ICONS, VARIANT_ICONS } from "../src/view/symbols";
import { catThought, personThought } from "../src/view/thoughts";
import { EVENTS, REFUSALS } from "./bubblecases";
import { withCatCorner } from "./helpers";

/** Що бачить гравець: іконка, позначка поверх неї й кількість («0» — окреме значення: закінчилося). */
interface Shown {
  icon: IconName;
  count?: number | string;
  mark?: Mark;
}

const keyOf = (shown: Shown): string => `${shown.icon}|${shown.count === undefined ? "" : shown.count === 0 ? "0" : "N"}|${shown.mark ?? ""}`;

const PRODUCT_LIST = Object.keys(PRODUCTS) as Product[];
const THING_LIST = Object.keys(THINGS) as ThingKind[];
const DESTINATION_LIST = Object.keys(TRIPS) as Destination[];
const STATS: StatName[] = ["health", "satiety", "hygiene", "sanity"];

function itemLabel(item: Item): string {
  if (item.kind === "meal" && item.mom === true) return "mom";
  if (item.kind === "catfood") return item.sterile ? "catfood-sterile" : "catfood";
  return item.kind;
}

function refusalId(refusal: Refusal): string {
  const detail = Object.entries(refusal)
    .filter(([name]) => name !== "reason")
    .map(([, value]) => (typeof value === "object" && value !== null ? itemLabel(value as Item) : String(value)));
  return ["refusal", refusal.reason, ...detail].join(":");
}

/**
 * Випадок події: її тип і все, що каже, що саме сталося, — рядки, так / ні й річ (симптом, причина шипіння, холод чи спека,
 * таблетка чи краплі, дріт чи пакет, шафка відчинилася чи брязкає замок, реакція на м'яту…). Кожен варіант — окремий випадок, тож
 * два варіанти однієї події теж не ділять іконку (рецензія 2026-10-30: раніше всі варіанти події були одним випадком, і свербіж
 * з іконкою очей тест пропускав). Числа — хто й скільки (кіт, кількість), а не інший випадок. Варіанти, що кажуть те саме (дзвінок
 * у двері з пакунком і без, де знайшлася шкарпетка, де подряпав кіт), — у групах одного значення нижче.
 */
function eventId(event: GameEvent): string {
  const detail = Object.entries(event)
    .filter(([name, value]) => name !== "type" && value !== undefined && typeof value !== "number" && !Array.isArray(value))
    .map(([name, value]) => (typeof value !== "object" || value === null ? `${name}=${String(value)}` : "kind" in value ? `${name}=${itemLabel(value as Item)}` : name));
  return ["event", event.type, ...detail].join(":");
}

/** Гра й кіт для думок і прохань: кіт поруч із персонажем, без потреб, у доброму настрої, сидить. */
function setup(): { save: Save; cat: Cat } {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 11 }));
  save.current.modifiers.day = null;
  save.current.day = 8;
  save.current.minute = 14 * 60;
  Object.assign(save.current.character.body, { x: 9.5, y: 8.5 });
  const cat = createCat(save.current, createRng(4), { source: "shelter", ageWeeks: 3, at: { x: 8.5, y: 8.5 } });
  cat.traits = [];
  cat.arrivedDay = -10;
  addCat(save.current, cat);
  cat.mood = 60;
  cat.love = 50;
  return { save, cat };
}

const act = (kind: CatAct["kind"], target: string | null = null): CatAct => ({ kind, target, goal: null, minutes: 10, elapsed: 0 });

/** Усі випадки гри, що показують іконку, — з коду. */
function collectCases(): Map<string, Shown[]> {
  const cases = new Map<string, Shown[]>();
  const add = (id: string, shown: Shown): void => {
    const list = cases.get(id) ?? [];
    list.push(shown);
    cases.set(id, list);
  };
  // Відмови — думка персонажа з причиною.
  for (const refusal of REFUSALS) add(refusalId(refusal), refusalBubble(refusal));
  // Бабли подій (відмови й витрачені запаси — нижче, з усіма причинами й запасами).
  for (const event of EVENTS) {
    if (event.type === "refused" || event.type === "supply-used") continue;
    for (const bubble of eventBubbles(event)) add(eventId(event), bubble);
  }
  // Запаси (§6.4): думка персонажа, що витратив (і взяв останнє), сховище, куди долетів, індикатор сховища (кількість) і телефон,
  // коли запас уперше закінчився (без кількості) — як у `DayScene`, `storage.ts` і `hud.ts`.
  for (const product of PRODUCT_LIST) {
    for (const bubble of eventBubbles({ type: "supply-used", product, left: 3 })) add(`supply:${product}`, bubble);
    for (const bubble of eventBubbles({ type: "supply-used", product, left: 0 })) add(`supply-last:${product}`, bubble);
    add(`landed:${product}`, { icon: PRODUCT_ICONS[product], count: 5 });
    add(`storage:${product}`, { icon: PRODUCT_ICONS[product], count: 5 });
    add(`hint:${product}`, { icon: PRODUCT_ICONS[product] });
  }
  // Варіант товару зі своєю іконкою в картці магазину (§11.4 «Іконка біля назви»): другий варіант — іконка самого товару.
  for (const [key, byQuality] of Object.entries(VARIANT_ICONS)) {
    for (const [quality, icon] of Object.entries(byQuality ?? {})) if (icon) add(`variant:${key}:${quality}`, { icon });
  }
  // Несплачений рахунок за комунальні: квитанція на панелі й рахунок у «Домі» телефона — один випадок.
  add("utilities:unpaid", { icon: UTILITIES_ICON });
  // Показники персонажа: панель і думка, коли показник низький.
  const { save, cat } = setup();
  for (const stat of STATS) {
    add(`stat:${stat}`, { icon: STAT_ICONS[stat] });
    for (const other of STATS) save.current.character.stats[other] = other === stat ? THOUGHTS.personLow - 10 : 100;
    const thought = personThought(save.current);
    if (thought) add(`thought:person:${stat}`, { icon: thought });
  }
  // День без світла (§4.1, рішення автора 2026-11-02): персонаж працює й думає, що інтернету немає. Колись це був стан над
  // комп'ютером і відмова сісти за нього; тепер — лише думка, і групи в неї немає: іконка «немає інтернету» — лише тут.
  for (const stat of STATS) save.current.character.stats[stat] = 100;
  save.current.modifiers.day = "outage";
  save.current.character.activity = { kind: "work", minutes: 0, money: 0, reputation: 0, sanity: 0 };
  const offline = personThought(save.current);
  if (offline) add("thought:person:no-internet", { icon: offline });
  save.current.modifiers.day = null;
  save.current.character.activity = null;
  // Думки кота про стан.
  const needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  const think = (id: string, change: (c: Cat) => void): void => {
    cat.needs = { ...needs };
    cat.mood = 60;
    cat.act = act("idle");
    change(cat);
    const thought = catThought(save.current, cat);
    if (thought) add(`thought:cat:${id}`, { icon: thought });
  };
  think("hunger", (c) => (c.needs.hunger = 95));
  think("thirst", (c) => (c.needs.thirst = 95));
  think("sad", (c) => (c.mood = THOUGHTS.sad - 1));
  think("play", (c) => (c.needs.play = 95));
  think("attention", (c) => (c.needs.attention = 95));
  // Кіт просить: біля миски для води, на умивальнику, там, де миска стояла, біля миски з кормом, під дверима, біля ліжка.
  const water = save.current.home.items.find((i) => i.kind === "water");
  const bowl = save.current.home.items.find((i) => i.kind === "bowl");
  if (!water || !bowl) throw new Error("немає мисок");
  const asks: Record<string, string> = { "water-bowl": `item:${water.id}`, sink: "sink", water: "water", bowl: `item:${bowl.id}`, door: "door", bed: "bed" };
  for (const [id, target] of Object.entries(asks)) {
    cat.act = act("beg", target);
    add(`ask:${id}`, catAsk(save.current, cat));
  }
  // Плита й стіл: страва на них — її іконкою.
  const dishes: Record<string, Dish> = {
    raw: { kind: "raw", quality: "cheap" },
    meal: { kind: "meal", quality: "cheap" },
    mom: { kind: "meal", quality: "cheap", mom: true },
    burnt: { kind: "burnt", quality: "cheap" },
    spoiled: { kind: "spoiled", quality: "cheap" },
  };
  for (const [id, dish] of Object.entries(dishes)) {
    const stove = stoveIcon(dish);
    if (stove) add(`stove:${id}`, { icon: stove });
    add(`table:${id}`, { icon: itemIcon(dish) });
  }
  // Речі магазину (§11.4 «Іконка біля назви», рішення автора 2026-11-02): іконка біля назви речі — як `THING_ICONS`.
  for (const thing of THING_LIST) add(`thing:${thing}`, { icon: THING_ICONS[thing] });
  // Бабли стану над речами, котами й персонажем.
  for (const [name, value] of Object.entries(STATE_ICONS)) {
    if (typeof value === "string") add(`state:${name}`, { icon: value });
    else for (const [sub, icon] of Object.entries(value)) add(`state:${name}.${sub}`, { icon: icon as IconName });
  }
  // Сердечка настрою кота.
  add("mood:up", { icon: MOOD_ICONS.up });
  add("mood:down", { icon: MOOD_ICONS.down });
  // Іконка біля назви хвороби (§11.4 «Іконка біля назви»): кота — у ветеринара, персонажа — у лікаря.
  for (const [disease, icon] of Object.entries(DISEASE_ICONS)) add(`disease:${disease}`, { icon });
  for (const [illness, icon] of Object.entries(ILLNESS_ICONS)) add(`illness:${illness}`, { icon });
  // Стани персонажа на панелі й у профілі телефона (§8.4).
  for (const [id, look] of Object.entries(PERSON_STATE_ICONS)) add(`person-state:${id}`, look);
  // Віддати кота в добрі руки — кнопка-іконка в картці кота.
  add("phone:give-away", { icon: DESTINATION_ICONS.shelter });
  // Речі квартири, що є завжди, у «Домі» телефона.
  for (const [id, icon] of Object.entries(HOME_FIXTURE_ICONS)) add(`home:${id}`, { icon });
  // Пункти поїздок (§11.4 «Іконка біля назви», §8.5 «На місці — кадр парковки»): біля назви пункту в картках і на табличці на
  // даху — кожен свій, без груп одного значення.
  for (const destination of DESTINATION_LIST) add(`destination:${destination}`, { icon: DESTINATION_ICONS[destination] });
  return cases;
}

/**
 * Групи одного значення (§11.4, «Унікальна іконка на унікальний кейс»): лише тут різні випадки можуть ділити іконку. Кожна — з
 * причиною, чому це той самий випадок.
 */
const SAME: Record<string, { why: string; ids: string[] }> = {
  ...Object.fromEntries(
    PRODUCT_LIST.map((product) => [
      `запас:${product}`,
      {
        why: "запас — його іконка всюди, де йдеться про нього: витратив і скільки лишилося, взяв останнє (як відмова «порожньо»), сховище, індикатор, телефон",
        ids: [`supply:${product}`, `supply-last:${product}`, `landed:${product}`, `storage:${product}`, `hint:${product}`, `refusal:empty:${product}`],
      },
    ]),
  ),
};
/** Ще випадки, що кажуть про той самий запас. */
const ALSO: Partial<Record<Product, { why: string; ids: string[] }>> = {
  food: { why: "ситість поповнюють продукти: показник на панелі й у думці — їхня іконка; сирі продукти на столі — вони ж", ids: ["stat:satiety", "thought:person:satiety", "table:raw"] },
  hygiene: { why: "гігієну поповнюють засоби гігієни — та сама іконка на панелі й у думці", ids: ["stat:hygiene", "thought:person:hygiene"] },
  catFood: { why: "голод кота — корм: думка, прохання вголос біля миски й «Дає доспати» біля ліжка (кіт хоче саме корму)", ids: ["thought:cat:hunger", "ask:bowl", "ask:bed"] },
  momMeal: { why: "мамин судочок — та сама річ на плиті, на столі й у холодильнику", ids: ["stove:mom", "table:mom"] },
  catnip: { why: "котяча м'ята: кіт блаженствує саме від неї", ids: ["event:catnip:reaction=roll"] },
  treats: { why: "ласощі: «Зелений від заздрощів» хрумтить саме ними", ids: ["event:treat-snatched"] },
};
for (const [product, extra] of Object.entries(ALSO)) {
  const group = SAME[`запас:${product}`];
  if (group && extra) {
    group.ids.push(...extra.ids);
    group.why += `; ${extra.why}`;
  }
}
/**
 * Речі магазину з наявною іконкою (§11.4 «Іконка біля назви»): біля назви — та сама іконка, що в баблі про цю річ, щоб гравець
 * вивчив, що бабл каже саме про неї. Решта речей — свої іконки, без груп.
 */
Object.assign(SAME, {
  іграшка: { why: "кіт хоче гратися саме вудочкою: думка показує ту саму іграшку, що біля назви в магазині", ids: ["thought:cat:play", "thing:toy"] },
  "замок на шафку": { why: "кіт смикає шафку, а брязкає той самий замок, що біля назви в магазині", ids: ["event:cabinet-pawed:opened=false", "thing:lock"] },
  автогодівниця: { why: "корм у миску досипає автогодівниця — на іконці вона сама над мискою; та сама річ, що біля назви в магазині", ids: ["event:feeder", "thing:feeder"] },
});
Object.assign(SAME, {
  страва: { why: "готова страва на плиті й на столі — одна річ", ids: ["stove:meal", "table:meal"] },
  крадіжка: { why: "кіт вкрав і хрумтить вашу їжу — хоч готову страву з плити, хоч сиру порцію зі столу: та сама втрата", ids: ["event:stole:object=stove:item=meal", "event:stole:object=table:item=raw"] },
  підгоріле: { why: "підгоріла страва на плиті й на столі — одна річ", ids: ["stove:burnt", "table:burnt"] },
  зіпсоване: { why: "зіпсована страва (§8.7) — одна річ, хоч би де лежала", ids: ["stove:spoiled", "table:spoiled"] },
  "здоров'я": { why: "показник на панелі й думка персонажа, коли він низький", ids: ["stat:health", "thought:person:health"] },
  "здоровий глузд": { why: "показник на панелі й думка персонажа, коли він низький", ids: ["stat:sanity", "thought:person:sanity"] },
  спрага: { why: "кіт хоче пити: думка й прохання вголос біля миски для води, на умивальнику й там, де миска стояла", ids: ["thought:cat:thirst", "ask:water-bowl", "ask:sink", "ask:water"] },
  нявкання: { why: "кіт нявчить; кіт, що втік на сходи, за дверима, і його не видно — те саме нявкання над дверима", ids: ["event:meow", "event:escaped", "state:door.stairs"] },
  злість: { why: "кіт шипить (ображений на руках, на кота без причини, на гостей) чи верещить від м'яти", ids: ["event:hissed", "event:picked-up:offended=true", "event:hissed-guests", "event:catnip:reaction=frenzy"] },
  приємно: { why: "котові приємно: його почав вилизувати друг чи поруч лягла «Щедра душа»", ids: ["event:groom-started", "event:cat-cuddled"] },
  гуркіт: { why: "щось розбилося (дрібничка, скинута страва) чи гуркоче віджим — гучний звук", ids: ["event:trinket-fell:trinket=mug:object=table:broken=true", "event:laundry:stage=spin", "event:knocked:object=table:item=meal"] },
  "тече вода": { why: "вода тече в душовій кабіні й з крана на умивальнику", ids: ["state:shower", "event:tap-opened"] },
  подряпина: { why: "кіт подряпав персонажа — біля переноски, у ванні чи «Ніндзя» в засідці: те саме правило подряпини (CLAW)", ids: ["event:clawed:at=carrier", "event:clawed:at=bath", "event:clawed:at=ambush"] },
  "дзвінок у двері": { why: "хтось дзвонить у двері — з пакунком чи без", ids: ["event:doorbell:delivery", "event:doorbell"] },
  "шкарпетка знайшлася": { why: "персонаж зрозумів, куди поділася шкарпетка, — хоч у поїздці, хоч пилососом", ids: ["event:sock-found:where=trip", "event:sock-found:where=vacuum"] },
  запаморочення: { why: "персонаж відчуває запаморочення: збій керування, спіткнувся, посковзнувся, збив кіт у зумі, напав із засідки", ids: ["event:glitch", "event:tripped", "event:slipped", "event:knocked-down", "event:ambushed"] },
  "брудний лоток": { why: "лоток брудний: над ним і в думці чистюлі, що його понюхав", ids: ["state:litterDirty", "event:litter-refused"] },
  "брудний одяг": { why: "одяг персонажа брудний: кіт через нього не йде на руки, колеги помітили на дзвінку", ids: ["event:cat-dodged:issue=clothes", "event:call-remark:issue=clothes"] },
  "кіт на комп'ютері": { why: "кіт сів на клавіатуру — над комп'ютером і у відмові сісти за нього", ids: ["event:keyboard", "refusal:cat-on-computer"] },
  "дріт перегризено": { why: "стан речі над нею вголос, у мить, коли перегризли, і у відмові працювати", ids: ["state:computer.wireChewed", "event:wire-chewed", "refusal:wire-chewed"] },
  "смітник перекинуто": { why: "смітник перекинувся — над ним і у відмові щось викинути", ids: ["event:trash-tipped", "refusal:trash-tipped"] },
  "пральна машина пере": { why: "стан машини над нею і у відмові прати ще", ids: ["state:washer.washing", "refusal:washing"] },
  "немає світла": {
    why: "у день без світла пральна машина не працює: відмова прати й стан над машиною, де стоїть прання, запущене до відключення (§4.1, рішення автора 2026-11-02); той самий день — стан на панелі й у профілі (§8.4)",
    ids: ["state:washer.noPower", "refusal:no-power", "person-state:noPower"],
  },
  відеодзвінок: { why: "летючка чи нарада почалася й іде — камера над комп'ютером", ids: ["state:computer.call", "event:standup-started", "event:modifier:kind=meeting-start"] },
});
// Хвороби (§11.4 «Іконка біля назви», рішення автора 2026-11-02): біля назви хвороби в картці — та сама іконка, що в баблі, яким
// кіт про неї сигналізує, чи у відмові ривка персонажа: картка вчить, що означає бабл, тож це той самий випадок.
Object.assign(SAME, {
  чхання: { why: "кіт застудився: чхає — бабл, і та сама іконка біля «Застуди» у ветеринара", ids: ["event:symptom:symptom=sneeze", "disease:cold"] },
  свербить: {
    why: "кіт чухається — бабл; біля бліх і дерматиту у ветеринара — та сама іконка: обидві кіт показує однаково (рішення автора 2026-10-27, §9.5), і картка так і вчить: «свербить» — це блохи чи дерматит",
    ids: ["event:symptom:symptom=itch", "disease:fleas", "disease:dermatitis"],
  },
  "болять очі": { why: "кіт тре очі — бабл, і та сама іконка біля кон'юнктивіту у ветеринара", ids: ["event:symptom:symptom=eyes", "disease:conjunctivitis"] },
  "крик болю": { why: "сечокам'яна: кіт кричить у лотку — бабл, і та сама іконка біля неї у ветеринара", ids: ["event:symptom:symptom=pain", "disease:urolithiasis"] },
  травма: { why: "травма — пластир: відмова ривка травмованого персонажа, «Травма» в лікаря й на панелі, травма кота у ветеринара", ids: ["refusal:injured", "illness:injury", "disease:injury", "person-state:injury"] },
  "застуда персонажа": { why: "персонаж застуджений: відмова ривка, «Застуда» в лікаря й на панелі — градусник", ids: ["refusal:cold", "illness:cold", "person-state:cold"] },
  "виснаження персонажа": { why: "персонаж виснажений: «Виснаження» в лікаря й на панелі — та сама хвороба (§6.5)", ids: ["illness:exhaustion", "person-state:exhaustion"] },
  сонливість: { why: "персонаж сонний: думка «zz» над ним і стан на панелі — та сама сонливість (§8.8)", ids: ["state:drowsy", "person-state:drowsy"] },
  "кіт іде з дому": { why: "притулок на карті поїздок і кнопка «Віддати в добрі руки» в картці кота: кіт іде з дому до інших людей (§9.8)", ids: ["destination:shelter", "phone:give-away"] },
  // Виснаження — не група: ривка воно не забирає, а відмова «без сил» (батарейка) — від здоров'я нижче 25 (рецензія 2026-11-02).
});

/** Значення випадку: його група або він сам. */
function meaningOf(id: string): string {
  for (const [name, group] of Object.entries(SAME)) if (group.ids.includes(id)) return name;
  return id;
}

/** Іконки, що означають різне: «іконка: значення, значення». */
function clashesOf(cases: Map<string, Shown[]>): string[] {
  const byKey = new Map<string, Set<string>>();
  for (const [id, shown] of cases) {
    for (const s of shown) {
      const meanings = byKey.get(keyOf(s)) ?? new Set<string>();
      meanings.add(meaningOf(id));
      byKey.set(keyOf(s), meanings);
    }
  }
  return [...byKey].filter(([, meanings]) => meanings.size > 1).map(([key, meanings]) => `${key}: ${[...meanings].join(", ")}`);
}

describe("унікальна іконка на унікальний кейс (§11.4, правило автора 2026-10-30)", () => {
  const cases = collectCases();

  it("різні випадки мають різні іконки, крім груп одного значення", () => {
    expect(clashesOf(cases)).toEqual([]);
  });

  it("варіанти однієї події — різні випадки: чужа іконка варіанта — збіг (рецензія 2026-10-30)", () => {
    const swapped = (id: string, icon: IconName): Map<string, Shown[]> => {
      expect(cases.has(id), id).toBe(true);
      return new Map([...cases].map(([key, shown]) => [key, key === id ? shown.map((s) => ({ ...s, icon })) : shown]));
    };
    // Свербіж з іконкою очей, спека — зі сніжинкою, краплі — з таблеткою, ображений на руках — з «шипить за миску».
    expect(clashesOf(swapped("event:symptom:symptom=itch", "eyes"))).not.toEqual([]);
    expect(clashesOf(swapped("event:weather-felt:feel=hot", "chilly"))).not.toEqual([]);
    expect(clashesOf(swapped("event:medicine-spat:medicine=drops", "spit-pill"))).not.toEqual([]);
    expect(clashesOf(swapped("event:picked-up:offended=true", "hiss-bowl"))).not.toEqual([]);
    expect(clashesOf(swapped("event:cabinet-pawed:opened=false", "cabinet-open"))).not.toEqual([]);
  });

  it("кожен випадок із груп справді є в грі — перелік не застаріває", () => {
    for (const [name, group] of Object.entries(SAME)) for (const id of group.ids) expect(cases.has(id), `${name}: ${id}`).toBe(true);
  });

  it("річ магазину — сама річ, а не стан чи потреба (§11.4 «Іконка біля назви»)", () => {
    const icon = (id: string): IconName | undefined => cases.get(id)?.[0]?.icon;
    for (const thing of THING_LIST) expect(cases.has(`thing:${thing}`), thing).toBe(true);
    // Миска для корму — не корм, миска для води — не спрага й не порожня поїлка, лоток — не наповнювач і не брудний лоток.
    expect(icon("thing:bowl")).not.toBe(icon("supply:catFood"));
    expect(icon("thing:water")).not.toBe(icon("thought:cat:thirst"));
    expect(icon("thing:water")).not.toBe(icon("state:waterEmpty"));
    expect(icon("thing:litter")).not.toBe(icon("supply:litter"));
    expect(icon("thing:litter")).not.toBe(icon("state:litterDirty"));
  });

  it("біля хвороби — та сама іконка, що в баблі кота й у відмові ривка персонажа; виснаження — своя (§11.4 «Іконка біля назви»)", () => {
    const symptom = (s: "sneeze" | "itch" | "eyes" | "pain"): IconName | undefined => eventBubbles({ type: "symptom", cat: 1, symptom: s })[0]?.icon;
    expect(DISEASE_ICONS.cold).toBe(symptom("sneeze"));
    expect(DISEASE_ICONS.fleas).toBe(symptom("itch"));
    expect(DISEASE_ICONS.dermatitis).toBe(symptom("itch"));
    expect(DISEASE_ICONS.conjunctivitis).toBe(symptom("eyes"));
    expect(DISEASE_ICONS.urolithiasis).toBe(symptom("pain"));
    expect(ILLNESS_ICONS.cold).toBe(refusalBubble({ reason: "cold" }).icon);
    expect(ILLNESS_ICONS.injury).toBe(refusalBubble({ reason: "injured" }).icon);
    // Виснаження ривка не забирає: «без сил» (здоров'я нижче 25) — батарейка, а біля «Виснаження» в лікаря — своя іконка
    // (рецензія 2026-11-02); і не сонливість увечері (zz).
    expect(refusalBubble({ reason: "weak" }).icon).toBe("battery-low");
    expect(ILLNESS_ICONS.exhaustion).not.toBe(refusalBubble({ reason: "weak" }).icon);
    expect(ILLNESS_ICONS.exhaustion).not.toBe(STATE_ICONS.drowsy);
    // Виснаження — своя група: лише лікар і панель, без відмови ривка.
    expect(meaningOf("illness:exhaustion")).toBe("виснаження персонажа");
    // Травма кота — той самий пластир, що в персонажа; серце хвороби кота — не серце здоров'я персонажа на панелі.
    expect(DISEASE_ICONS.injury).toBe(ILLNESS_ICONS.injury);
    expect(DISEASE_ICONS.heart).not.toBe(STAT_ICONS.health);
  });

  it("пункт поїздки — свій малюнок, ні з чим не спільний: не ліки, не аптечка, не котячий будиночок (§11.4 «Іконка біля назви»)", () => {
    const icon = (id: string): IconName | undefined => cases.get(id)?.[0]?.icon;
    for (const destination of DESTINATION_LIST) {
      expect(cases.has(`destination:${destination}`), destination).toBe(true);
      // Притулок — спільний лише з кнопкою «Віддати в добрі руки» (група «кіт іде з дому»).
      expect(meaningOf(`destination:${destination}`), destination).toBe(destination === "shelter" ? "кіт іде з дому" : `destination:${destination}`);
    }
    expect(new Set(DESTINATION_LIST.map((d) => DESTINATION_ICONS[d])).size).toBe(DESTINATION_LIST.length);
    // Ветеринар і лікар — не аптечка, не ліки й не хвороби; притулок — не будиночок із магазину.
    const medical = [icon("refusal:kit-empty"), icon("supply:pills"), icon("supply:humanMeds"), icon("supply:dressing"), ...Object.values(ILLNESS_ICONS), ...Object.values(DISEASE_ICONS)];
    expect(medical).not.toContain(DESTINATION_ICONS.vet);
    expect(medical).not.toContain(DESTINATION_ICONS.doctor);
    expect(DESTINATION_ICONS.shelter).not.toBe(THING_ICONS.house);
  });

  it("«немає інтернету» — лише думка персонажа за роботою в день без світла: ні стану над комп'ютером, ні відмови (§4.1, рішення автора 2026-11-02)", () => {
    const withIcon = [...cases].filter(([, shown]) => shown.some((s) => s.icon === "no-internet")).map(([id]) => id);
    expect(withIcon).toEqual(["thought:person:no-internet"]);
    expect(Object.values(STATE_ICONS.computer)).not.toContain("no-internet");
  });

  it("холодна вода в душі без світла — своя іконка (синя крапля зі сніжинкою): не крапля «тече вода» й не сніжинка «кіт мерзне» (§4.1, рішення автора 2026-11-02; малюнок — 2026-11-03)", () => {
    const icon = (id: string): IconName | undefined => cases.get(id)?.[0]?.icon;
    expect(icon("state:coldShower")).toBe("cold-water");
    expect(meaningOf("state:coldShower")).toBe("state:coldShower");
    expect(icon("state:shower")).toBe("drop");
    expect(icon("event:weather-felt:feel=cold")).toBe("chilly");
    expect(icon("state:coldShower")).not.toBe(icon("state:shower"));
    expect(icon("state:coldShower")).not.toBe(icon("event:weather-felt:feel=cold"));
  });

  it("переляк кота — не «!» терпіння, спрага — не крапля душу й не перекреслена крапля порожньої миски", () => {
    const icon = (id: string): IconName | undefined => cases.get(id)?.[0]?.icon;
    expect(icon("event:scared")).not.toBe(icon("state:computer.patienceWarning"));
    expect(icon("thought:cat:thirst")).toBe(icon("ask:water-bowl"));
    expect(icon("thought:cat:thirst")).not.toBe(icon("state:shower"));
    expect(icon("ask:water-bowl")).not.toBe(icon("state:waterEmpty"));
    // «Втікач» у квартирі проситься на сходи — не нявкання кота, що вже втік і чекає за дверима (рецензія 2026-10-30).
    expect(icon("ask:door")).not.toBe(icon("state:door.stairs"));
    expect(icon("ask:door")).not.toBe(icon("event:meow"));
  });
});
