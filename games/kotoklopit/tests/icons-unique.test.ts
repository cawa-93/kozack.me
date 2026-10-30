// Унікальна іконка на унікальний кейс (§11.4, правило автора 2026-10-30, `GENERAL_REVIEW.md`, «Відкрите після рішень», п. 7):
// кожен окремий випадок — що бабл події, стан, думка, індикатор сховища чи значок на панелі каже гравцеві — має свою іконку, а
// та сама іконка з тією самою позначкою — лише для того самого значення. Таблицю «випадок → іконка» тест збирає з коду
// (`eventBubbles`, `refusalBubble`, `catThought`, `personThought`, `catAsk`, `stoveIcon`, `itemIcon` і таблиці іконок у
// `symbols.ts`), а не переписує вручну. Свідомо однакові — лише групи одного значення нижче, кожна з причиною (§11.4).

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { PRODUCTS, THOUGHTS } from "../src/sim/config";
import type { GameEvent, Refusal } from "../src/sim/events";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import type { Cat, CatAct, Dish, Item, Product, Save, StatName } from "../src/sim/types";
import type { IconName, Mark } from "../src/view/iconnames";
import { catAsk, eventBubbles, itemIcon, MOOD_ICONS, PRODUCT_ICONS, refusalBubble, STAT_ICONS, STATE_ICONS, stoveIcon } from "../src/view/symbols";
import { catThought, personThought } from "../src/view/thoughts";
import { EVENTS, REFUSALS } from "./bubblecases";
import { withCatCorner } from "./helpers";

/** Що бачить гравець: іконка, позначка поверх неї й кількість («0» — окреме значення: закінчилося). */
interface Shown {
  icon: IconName;
  count?: number;
  mark?: Mark;
}

const keyOf = (shown: Shown): string => `${shown.icon}|${shown.count === undefined ? "" : shown.count === 0 ? "0" : "N"}|${shown.mark ?? ""}`;

const PRODUCT_LIST = Object.keys(PRODUCTS) as Product[];
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
  // Показники персонажа: панель і думка, коли показник низький.
  const { save, cat } = setup();
  for (const stat of STATS) {
    add(`stat:${stat}`, { icon: STAT_ICONS[stat] });
    for (const other of STATS) save.current.character.stats[other] = other === stat ? THOUGHTS.personLow - 10 : 100;
    const thought = personThought(save.current);
    if (thought) add(`thought:person:${stat}`, { icon: thought });
  }
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
  };
  for (const [id, dish] of Object.entries(dishes)) {
    const stove = stoveIcon(dish);
    if (stove) add(`stove:${id}`, { icon: stove });
    add(`table:${id}`, { icon: itemIcon(dish) });
  }
  // Бабли стану над речами, котами й персонажем.
  for (const [name, value] of Object.entries(STATE_ICONS)) {
    if (typeof value === "string") add(`state:${name}`, { icon: value });
    else for (const [sub, icon] of Object.entries(value)) add(`state:${name}.${sub}`, { icon: icon as IconName });
  }
  // Сердечка настрою кота.
  add("mood:up", { icon: MOOD_ICONS.up });
  add("mood:down", { icon: MOOD_ICONS.down });
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
  catFood: { why: "голод кота — корм: думка, прохання вголос біля миски й «Терплячий зранку» біля ліжка (кіт хоче саме корму)", ids: ["thought:cat:hunger", "ask:bowl", "ask:bed"] },
  momMeal: { why: "мамин судочок — та сама річ на плиті, на столі й у холодильнику", ids: ["stove:mom", "table:mom"] },
  catnip: { why: "котяча м'ята: кіт блаженствує саме від неї", ids: ["event:catnip:reaction=roll"] },
  treats: { why: "ласощі: «Заздрісник» хрумтить саме ними", ids: ["event:treat-snatched"] },
};
for (const [product, extra] of Object.entries(ALSO)) {
  const group = SAME[`запас:${product}`];
  if (group && extra) {
    group.ids.push(...extra.ids);
    group.why += `; ${extra.why}`;
  }
}
Object.assign(SAME, {
  страва: { why: "готова страва на плиті й на столі — одна річ", ids: ["stove:meal", "table:meal"] },
  крадіжка: { why: "кіт вкрав і хрумтить вашу їжу — хоч готову страву з плити, хоч сиру порцію зі столу: та сама втрата", ids: ["event:stole:object=stove:item=meal", "event:stole:object=table:item=raw"] },
  підгоріле: { why: "підгоріла страва на плиті й на столі — одна річ", ids: ["stove:burnt", "table:burnt"] },
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
  "немає інтернету": { why: "стан комп'ютера над ним і у відмові працювати", ids: ["state:computer.noInternet", "refusal:no-internet"] },
  "пральна машина пере": { why: "стан машини над нею і у відмові прати ще", ids: ["state:washer.washing", "refusal:washing"] },
  відеодзвінок: { why: "летучка чи нарада почалася й іде — камера над комп'ютером", ids: ["state:computer.call", "event:standup-started", "event:modifier:kind=meeting-start"] },
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
