// Вміст карток: титулка дня з ранковими повідомленнями, кінець гри, телефон, нова гра.

import { MODIFIERS, WAKE_MINUTE, WAKE_UP } from "../sim/config";
import { supplyCount, utilitiesDue } from "../sim/economy";
import { breedById, MIXED } from "../sim/breeds";
import { giveAwayBlocker } from "../sim/farewell";
import { visibility } from "../sim/knowledge";
import { WEEK_PAIRS } from "../sim/modifiers";
import { inHeat, isNursing, showsPregnancy } from "../sim/reproduction";
import { DEFAULT_NAME } from "../sim/game";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Address, AlbumEntry, Appliance, Cat, Chronotype, Difficulty, GameEnd, GameState, HomeItem, Look, Medicine, NightReport, Quality, Sex, ThingKind } from "../sim/types";
import {
  BREED_ABOUT,
  BREED_HALF,
  CONTROLS_KEYBOARD,
  CONTROLS_RACE_KEYBOARD,
  CONTROLS_RACE_TOUCH,
  CONTROLS_TOUCH,
  DAY_MODIFIER_TEXTS,
  DIFFICULTY_TITLES,
  POSITION_TITLES,
  WEEK_MODIFIER_TEXTS,
  diseaseTitle,
  endingText,
  farewellText,
  fill,
  BIRTH_MESSAGE,
  JOB_SEEKING,
  KITTEN_MESSAGE,
  LEDGER_TEXTS,
  ledgerLines,
  UTILITIES_MESSAGES,
  WAKE_TEXTS,
} from "../texts";
import { element, type Card, type CardAction, type TitleSection } from "./overlay";
import { shopCatalog } from "./shop";
import type { CartLine } from "../sim/shop";
import { plural, PRODUCT_TITLES, THING_TITLES, VARIANT_TITLES } from "./titles";

export { plural };
import { LOOK_OPTIONS } from "./look";
import { drawPortrait, portraitCanvas } from "./portrait";
import { traitChips, traitHint } from "./traits";

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

/**
 * Чи показує титулка модифікатор тижня (§4.1): того, що вже не про персонажа, — ні. Робочого — безробітному (звільнили посеред
 * тижня — «Аврал» уже не про нього; перевірка модифікаторів 2026-10-28), котячого — коли котів немає: останній помер чи пішов
 * у ніч на понеділок, коли тиждень уже обрано за вечором неділі, чи посеред тижня (рецензія реалізації А14). Погода — «Хвиля
 * спеки» й «Похолодання» — лишається: спека й без котів знижує гігієну персонажа.
 */
function weekShown(state: GameState, id: string): boolean {
  const pair = WEEK_PAIRS.find((p) => p.hard === id || p.easy === id);
  if (pair?.when === "work") return !state.job.unemployed;
  if (pair?.when === "cat") return state.cats.length > 0 || id === "heat-wave" || id === "cold-snap";
  return true;
}

/** Титулка дня (§4): тиждень, день, модифікатор і що сталося вночі. */
/** Титулка дня (§4): тиждень і його ефекти, день і його ефекти, події ночі. Показує `Overlay.title`. */
export function dayTitle(state: GameState, night: NightReport | null): TitleSection[] {
  const { name, address } = state.character;
  const weekBlocks: string[][] = [];
  const week = state.modifiers.week && weekShown(state, state.modifiers.week) ? WEEK_MODIFIER_TEXTS[state.modifiers.week] : undefined;
  if (week) weekBlocks.push([week.title, week.situation]);
  const dayBlocks: string[][] = [];
  const modifier = state.modifiers.day ? DAY_MODIFIER_TEXTS[state.modifiers.day] : undefined;
  if (modifier) dayBlocks.push([modifier.title, modifier.situation]);

  const events: (string | HTMLElement)[][] = [];
  // Хто будив уночі (§8.8): по рядку на кота, без пояснень.
  for (const reason of ["night", "hairball", "morning"] as const) {
    const ids = new Set((night?.wakeUps ?? []).filter((w) => w.reason === reason).map((w) => w.cat));
    for (const id of ids) {
      const cat = state.cats.find((c) => c.id === id) ?? state.album.find((e) => e.id === id);
      if (cat) events.push([fill(WAKE_TEXTS[reason], cat.sex, { кіт: cat.name, час: formatClock(WAKE_UP.morningMinute) })]);
    }
  }
  const newCats = (night?.newCats ?? []).map((id) => state.cats.find((c) => c.id === id)).filter((c) => c !== undefined);
  for (const cat of newCats.filter((c) => c.source !== "born")) {
    events.push([fill(KITTEN_MESSAGE, address, { персонаж: name, кошеня: cat.name })]);
  }
  // Пологи (§9.8): одне повідомлення на кожну матір.
  const born = newCats.filter((c) => c.source === "born");
  for (const motherId of new Set(born.map((c) => c.parents.mother))) {
    const kittens = born.filter((c) => c.parents.mother === motherId);
    const mother = state.cats.find((c) => c.id === motherId) ?? state.album.find((e) => e.id === motherId);
    const values = { кішка: mother?.name ?? "кішка", кількість: kittens.length, кошенята: kittens.map((c) => c.name).join(", ") };
    // `[одне|кілька]`: «чоловіча» форма — одне кошеня.
    events.push([fill(BIRTH_MESSAGE, kittens.length === 1 ? "male" : "female", values)]);
  }
  for (const id of night?.keptCats ?? []) {
    const cat = state.cats.find((c) => c.id === id);
    if (cat) events.push([`Оголошення знято: ${cat.name} годує кошенят і поки що лишається вдома.`]);
  }
  for (const id of night?.givenCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle);
    events.push([fill("{кіт} [поїхав|поїхала] до нових господарів", entry.sex, { кіт: entry.name }), text.cause, `«${text.title}». ${text.life}`, ...(entry.traits.length > 0 ? [traitChips(entry.traits, entry.sex)] : [])]);
  }
  for (const id of night?.lostCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle);
    // На прощанні відкривається весь характер кота (§9.7): риси з описом по дотику. «Прощавай, {кіт}» вимагало б кличного відмінка.
    events.push([`Прощання: ${entry.name}`, text.cause, `«${text.title}». ${text.life}`, ...(entry.traits.length > 0 ? [traitChips(entry.traits, entry.sex)] : [])]);
  }
  const utilities = night?.utilities;
  if (utilities && utilities.outcome !== "evicted") {
    events.push([fill(UTILITIES_MESSAGES[utilities.outcome], address, { сума: utilities.paid, борг: utilities.nextDue })]);
  }
  // Куди пішли гроші минулого тижня (§6.4, рішення автора 2026-10-27, Е4).
  if (night?.ledger) events.push([LEDGER_TEXTS.heading, ...ledgerLines(night.ledger)]);
  if (night === null && state.day === 0) {
    events.push(["Керування", isTouch() ? CONTROLS_TOUCH : CONTROLS_KEYBOARD]);
  }
  const sections: TitleSection[] = [
    { heading: `Тиждень ${weekOf(state.day)}`, blocks: weekBlocks },
    { heading: capitalize(WEEKDAY_NAMES[weekdayOf(state.day)] ?? ""), blocks: dayBlocks },
  ];
  if (events.length > 0) sections.push({ blocks: events });
  return sections;
}

export interface EndHandlers {
  replayDay: () => void;
  replayWeek: () => void;
  newGame: () => void;
}

/**
 * Екран кінця гри (§4.2, §6.1): хто й скільки протримався, назва завершення й текст, на що пішов час,
 * коти. Лише те, що гравець і так бачив: без розбивок і порогів, що розкривали б механіки (§11.3а).
 */
export function endScreen(state: GameState, end: GameEnd, handlers: EndHandlers): { parts: HTMLElement[]; actions: CardAction[] } {
  const { title, text } = endingText(state, end);
  const retired = end === "retirement";
  const { name } = state.character;
  const when = retired ? weeks(weekOf(state.day)) : `тиждень ${weekOf(state.day)}, ${WEEKDAY_NAMES[weekdayOf(state.day)] ?? ""}`;
  const parts: HTMLElement[] = [element("p", "ending-who", `${name} · ${when}`), element("h2", "title-heading", title)];
  for (const paragraph of text.split("\n\n")) parts.push(element("p", "ending-text", paragraph));
  const time = timeBar(state);
  if (time) parts.push(time);
  const cats = catChips(state);
  if (cats) parts.push(cats);
  return {
    parts,
    // Пенсія — успішний кінець: переграти нема чого, лишається нова гра (§6.1).
    actions: retired
      ? [{ label: "Нова гра", primary: true, onSelect: handlers.newGame }]
      : [
          { label: "Переграти день", primary: true, onSelect: handlers.replayDay },
          { label: "Переграти тиждень", onSelect: handlers.replayWeek },
          { label: "Нова гра", onSelect: handlers.newGame },
        ],
  };
}

/** На що пішов час (§4.2): смуга з чотирьох частин, під нею — іконка й години кожної. */
const TIME_PARTS = [
  { key: "work", glyph: "💻", color: "#5a7fc0" },
  { key: "cats", glyph: "🐱", color: "#e8a25a" },
  { key: "self", glyph: "☕", color: "#6fae6a" },
  { key: "bustle", glyph: "👣", color: "#7a6a78" },
] as const;

function timeBar(state: GameState): HTMLElement | null {
  const minutes = state.stats.minutes;
  const total = TIME_PARTS.reduce((sum, p) => sum + minutes[p.key], 0);
  if (total <= 0) return null;
  const box = element("div", "ending-time");
  const bar = element("div", "ending-bar");
  const legend = element("div", "ending-legend");
  for (const part of TIME_PARTS) {
    const value = minutes[part.key];
    const segment = element("span");
    segment.style.width = `${(value / total) * 100}%`;
    segment.style.background = part.color;
    bar.append(segment);
    const item = element("span", undefined, `${part.glyph} ${Math.round(value / 60)} год`);
    item.style.setProperty("--part", part.color);
    legend.append(item);
  }
  box.append(bar, legend);
  return box;
}

/** Коти, що жили з персонажем (§4.2): з альбому — з назвою рівня життя з прощання, живі — з іконкою дому. */
function catChips(state: GameState): HTMLElement | null {
  if (state.album.length === 0 && state.cats.length === 0) return null;
  const box = element("div", "ending-cats");
  for (const entry of state.album) {
    const chip = element("span", "ending-cat", entry.name);
    chip.append(element("small", undefined, farewellText(entry, diseaseTitle).title));
    box.append(chip);
  }
  for (const cat of state.cats) box.append(element("span", "ending-cat", `🏠 ${cat.name}`));
  return box;
}

export type PhoneTab = "shop" | "mine" | "cats" | "album" | "game";

/** Річ без місця в «Моїх речах» (§8.7): техніка, автогодівниця над місцем миски, переноска чи замок на шафку. */
export type DiscardThing = { appliance: Appliance } | { feeder: string } | { owned: "carrier" | "lock" };

export interface PhoneHandlers {
  /** Оплатити кошик доставкою (§6.4). */
  checkout: (cart: CartLine[]) => void;
  discard: (item: HomeItem) => void;
  /** Викинути техніку, автогодівницю (над місцем миски `slot`), переноску чи замок на шафку. */
  discardThing: (thing: DiscardThing) => void;
  advertise: (cat: Cat) => void;
  cancelAd: (cat: Cat) => void;
  newGame: () => void;
  exportSave: () => void;
  importSave: (file: File) => void;
  tab: (tab: PhoneTab) => void;
  close: () => void;
}

const PHONE_TABS: Record<PhoneTab, string> = { shop: "🛒 Магазин", mine: "🏠 Речі", cats: "🐱 Коти", album: "Альбом", game: "Гра" };

/** Телефон персонажа (§6.4): магазин із доставкою, викинути річ, коти, альбом, гра. */
export function phoneCard(state: GameState, wanted: PhoneTab, handlers: PhoneHandlers): Card {
  // Коти й альбом з'являються, коли в них є що показати (§11.3а): до першого кота — лише порожні сторінки.
  const tabs = (Object.keys(PHONE_TABS) as PhoneTab[]).filter((t) => (t !== "cats" || state.cats.length > 0) && (t !== "album" || state.album.length > 0));
  const tab = tabs.includes(wanted) ? wanted : "shop";
  const body: (string | HTMLElement)[] = [];
  // Що вже їде, видно в рядку кожного товару (§6.4).
  if (tab === "shop") body.push(shopCatalog(state, "delivery", handlers.checkout));
  if (tab === "mine") {
    body.push(`Комунальні: ${utilitiesDue(state)} ₴ на тиждень.`);
    // З попередженням — борг і скільки треба в понеділок (§6.4, рішення автора 2026-10-27, Е4).
    const debt = state.home.utilitiesDebt;
    if (debt > 0) body.push(fill(LEDGER_TEXTS.debt, state.character.address, { борг: debt, платіж: debt + utilitiesDue(state) }));
    body.push(myThings(state, handlers));
  }
  if (tab === "cats") body.push(...catCards(state, handlers));
  if (tab === "album") body.push(...albumCards(state));
  if (tab === "game") body.push(...gameMenu(state, handlers));
  // Вкладки — компактний рядок угорі, закрити — хрестиком: на телефоні горизонтально лишається місце для вмісту.
  return {
    title: "",
    tabs: tabs.map((t) => ({ label: PHONE_TABS[t], active: t === tab, onSelect: () => handlers.tab(t) })),
    body,
    actions: [],
    onDismiss: handlers.close,
    closable: true,
  };
}

/** Меню гри (§4.2, §5): нова гра, експорт і імпорт збереження; керування — щоб перечитати підказку першого дня (§11.3а). */
function gameMenu(state: GameState, handlers: PhoneHandlers): (string | HTMLElement)[] {
  const box = element("div", "shop");
  const fresh = element("button", "button", "Нова гра");
  fresh.addEventListener("click", handlers.newGame);
  const save = element("button", "button", "Зберегти файлом");
  save.addEventListener("click", handlers.exportSave);
  const input = element("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) handlers.importSave(file);
  });
  const load = element("button", "button", "Завантажити з файлу");
  load.addEventListener("click", () => input.click());
  box.append(fresh, save, load, input);
  const touch = isTouch();
  return [
    playerLine(state),
    "Гра зберігається в браузері сама, але браузер може її стерти — тож довгу гру варто часом зберігати файлом.",
    box,
    `Керування: ${touch ? CONTROLS_TOUCH : CONTROLS_KEYBOARD}`,
    touch ? CONTROLS_RACE_TOUCH : CONTROLS_RACE_KEYBOARD,
  ];
}

/**
 * Перший рядок вкладки «Гра»: «ім'я · посада · складність», безробітному — «шукає роботу» замість посади. Посаду більше ніде
 * не видно, а картка її зміни може загубитися після перезавантаження сторінки; репутації тут немає — вона невидима (§8.6;
 * рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А7).
 */
export function playerLine(state: GameState): string {
  const { name, address } = state.character;
  const job = state.job.unemployed ? JOB_SEEKING : fill(POSITION_TITLES[state.job.position] ?? "", address);
  return `${name} · ${job} · ${DIFFICULTY_TITLES[state.difficulty]}`;
}

const weeks = (n: number): string => `${n} ${plural(n, "тиждень", "тижні", "тижнів")}`;

/**
 * Порода, як її знає персонаж (§9.11): «мейнкун × ?», «[безпородний|безпородна]», «мейнкун, [чистокровний|чистокровна]»; null — невідома.
 * Назви порід посеред речення — з малої, рід — за статтю кота (крок 17, вичитка 2026-10-28: «Порода: безпородний» для кішки).
 */
export function breedText(breed: readonly [string, string], known: readonly [boolean, boolean], sex: Sex): string | null {
  const [a, b] = breed;
  if (!known[0] && !known[1]) return null;
  const name = (id: string): string => breedById(id).name.toLowerCase();
  if (a === MIXED && b === MIXED) return fill("[безпородний|безпородна]", sex);
  if (a === b) return `${name(a)}, ${fill("[чистокровний|чистокровна]", sex)}`;
  // Безпородна половина — теж за статтю кота: «британська короткошерста × безпородна» (загальна ревізія 2026-10-29).
  const half = (id: string, k: boolean): string => (k ? (id === MIXED ? fill("[безпородний|безпородна]", sex) : name(id)) : "?");
  return `${half(a, known[0])} × ${half(b, known[1])}`;
}

/** Рядок картки про породу: «Безпородна.», «Порода: мейнкун × ?.»; null — порода невідома. */
export function breedLine(breed: readonly [string, string], known: readonly [boolean, boolean], sex: Sex): string | null {
  const text = breedText(breed, known, sex);
  if (text === null) return null;
  return breed[0] === MIXED && breed[1] === MIXED ? `${text.replace(/^./, (c) => c.toUpperCase())}.` : `Порода: ${text}.`;
}

/**
 * Опис відомої породи в картці кота (рішення автора 2026-10-28, Д4): кожної відомої половини, без повторів; «безпородний» — лише
 * в безпородного. У напівкровки перед описом половини — рамка: опис написано для чистокровних (загальна ревізія 2026-10-29,
 * рішення самостійно, `TEXTS.md`, «Опис породи»).
 */
export function breedAbout(cat: Cat): string[] {
  const halfBreed = cat.breed[0] !== cat.breed[1];
  const halves = new Set(cat.breed.filter((id, i) => cat.breedKnown[i] && (id !== MIXED || !halfBreed)));
  const lines: string[] = [];
  for (const id of halves) {
    const about = BREED_ABOUT[id];
    if (!about) continue;
    if (halfBreed) lines.push(fill(BREED_HALF, cat.sex, { порода: breedById(id).name.toLowerCase() }));
    lines.push(about);
  }
  return lines;
}

/** Картки котів (§9.9): ім'я, стать, вік, відомі риси й стани. */
function catCards(state: GameState, handlers: PhoneHandlers): (string | HTMLElement)[] {
  if (state.cats.length === 0) return ["Котів поки немає."];
  return state.cats.map((cat) => {
    const lines = [`${cat.name} ${cat.sex === "male" ? "♂" : "♀"} · ${weeks(cat.ageWeeks)}`];
    const breed = breedLine(cat.breed, cat.breedKnown, cat.sex);
    if (breed !== null) lines.push(breed);
    lines.push(...breedAbout(cat));
    const states: string[] = [];
    if (cat.sterilized && cat.sterilizedKnown) states.push(cat.sex === "male" ? "кастрований" : "стерилізована");
    if (cat.pregnancy?.known) states.push("вагітна");
    else if (showsPregnancy(state, cat)) states.push("здається, вагітна");
    if (inHeat(state, cat)) states.push("у тічці");
    if (isNursing(state, cat)) states.push("годує кошенят");
    if (cat.ageWeeks === 0 && cat.source === "born") states.push("новонароджене");
    if (states.length > 0) lines.push(`${states.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()));
    const found = cat.diseases.filter((d) => d.known).map((d) => diseaseTitle(d.id));
    // Хворобу могла знайти й ветеринарка вдома; назви посеред речення — з малої (крок 17, вичитка 2026-10-28).
    if (found.length > 0) lines.push(`Хвороби: ${found.join(", ").toLowerCase()}.`);
    // Відомі риси — назвами-чипами з описом під ними; помічене — здогадкою (§9.9).
    const known = cat.traits.filter((t) => visibility(state, t) === 3);
    for (const trait of cat.traits) {
      const seen = visibility(state, trait);
      if (seen === 2) {
        const hint = traitHint(cat, trait);
        if (hint) lines.push(hint);
      } else if (seen === 1) lines.push("❓ Помічено щось дивне");
    }
    if (cat.traits.every((t) => visibility(state, t) === 0)) lines.push("Характер: ?");
    const card = note(...lines);
    // Ім'я — заголовок картки, навіть коли під ним самі риси.
    const title = card.firstElementChild;
    if (title instanceof HTMLElement) title.style.fontWeight = "600";
    if (known.length > 0) card.append(traitChips(known, cat.sex));
    // Оголошення (§9.8): з підтвердженням (картку показує сцена) і можна зняти; новонародженого й матір новонароджених — ні.
    const blocker = giveAwayBlocker(state, cat);
    if (state.ads.includes(cat.id)) {
      card.append(note(`Оголошення: завтра вранці ${cat.name} поїде до нових господарів.`));
      const cancel = element("button", "button", "Зняти оголошення");
      cancel.style.marginTop = "8px";
      cancel.addEventListener("click", () => handlers.cancelAd(cat));
      card.append(cancel);
    } else if (blocker === "nursing") card.append(note("Годує новонароджених — поки що лишається вдома."));
    else if (blocker === null) {
      const ad = element("button", "button", "Віддати в добрі руки");
      ad.style.marginTop = "8px";
      ad.addEventListener("click", () => handlers.advertise(cat));
      card.append(ad);
    }
    return card;
  });
}

/** Причина в альбомі (§9.7); віддані — «живе в нових руках» (§9.8), як і на титулці. */
const CAUSE_TITLES: Record<string, string> = { old: "старість", sorrow: "туга", given: "живе в нових руках" };

/**
 * Причина в першому рядку альбому: хвороба — сама назва з малої, як «старість» і «туга» (загальна ревізія 2026-10-29: було
 * «хвороба «Хвороба серця»»).
 */
export function albumCause(entry: AlbumEntry): string {
  return entry.cause.kind === "disease" ? diseaseTitle(entry.cause.disease).toLowerCase() : (CAUSE_TITLES[entry.cause.kind] ?? "");
}

/** Альбом пам'яті (§9.7): ім'я, вік, усі риси, причина й опис життя. */
function albumCards(state: GameState): (string | HTMLElement)[] {
  if (state.album.length === 0) return ["Альбом поки порожній."];
  return [...state.album].reverse().map((entry) => {
    const text = farewellText(entry, diseaseTitle);
    const card = note(`${entry.name}, ${weeks(entry.ageWeeks)} — ${albumCause(entry)}`, `«${text.title}». ${text.life}`);
    card.append(entry.traits.length > 0 ? traitChips(entry.traits, entry.sex) : element("p", "trait-about", "Без помітних рис."));
    return card;
  });
}


function myThings(state: GameState, handlers: PhoneHandlers): HTMLElement {
  const shop = element("div", "shop");
  for (const item of state.home.items) {
    const row = element("div", "shop-row");
    const name = element("span", "shop-name", THING_TITLES[item.kind]);
    name.append(element("span", "shop-stock", VARIANT_TITLES[`thing:${item.kind}`]?.[item.quality] ?? ""));
    row.append(name);
    const button = element("button", "button", "Викинути");
    button.addEventListener("click", () => handlers.discard(item));
    row.append(button);
    shop.append(row);
  }
  // Техніка й автогодівниці теж (§8.7): раніше їх тут не було, тож викинути їх не можна було зовсім (перевірка побуту 2026-10-28);
  // переноска й замок на шафку — так само (загальна ревізія 2026-10-29), щоб дешеві можна було замінити дорожчими.
  const { carrier, lock } = state.home;
  const extra: { kind: ThingKind; quality: Quality; thing: DiscardThing }[] = [
    ...(carrier === null ? [] : [{ kind: "carrier" as const, quality: carrier, thing: { owned: "carrier" as const } }]),
    ...(lock === undefined ? [] : [{ kind: "lock" as const, quality: lock, thing: { owned: "lock" as const } }]),
    ...(["fountain", "robot"] as const).flatMap((a) => {
      const quality = state.home.appliances[a];
      return quality === null ? [] : [{ kind: a, quality, thing: { appliance: a } }];
    }),
    ...(state.home.feeders ?? []).map((f) => ({ kind: "feeder" as const, quality: f.quality, thing: { feeder: f.slot } })),
  ];
  for (const { kind, quality, thing } of extra) {
    const row = element("div", "shop-row");
    const name = element("span", "shop-name", THING_TITLES[kind]);
    name.append(element("span", "shop-stock", VARIANT_TITLES[`thing:${kind}`]?.[quality] ?? ""));
    row.append(name);
    const button = element("button", "button", "Викинути");
    button.addEventListener("click", () => handlers.discardThing(thing));
    row.append(button);
    shop.append(row);
  }
  return shop;
}


export type CareChoice = { medicine: Medicine } | { treat: Quality } | { catnip: Quality } | "collar";

/** Чи є чим доглянути кота біля аптечки (§8.7): ліки, ласощі, котяча м'ята, нашийник. */
export function hasCareSupplies(state: GameState, cat: Cat): boolean {
  // Нашийник — лише котові без нашийника: інакше картка відкрилася б порожньою.
  return canPutCollar(state, cat) || (["pills", "drops", "treats", "catnip"] as const).some((p) => supplyCount(state, p) > 0);
}

/**
 * Чи можна надягти котові нашийник (§9.10): він один, без якостей, і не губиться (рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А17), тож лише котові без нашийника й коли нашийник є в аптечці.
 */
function canPutCollar(state: GameState, cat: Cat): boolean {
  return !cat.collar && supplyCount(state, "collar") > 0;
}

/** Догляд за котом на руках біля аптечки (§8.7, §9.5, §9.10, §9.12): ліки, ласощі, котяча м'ята, нашийник. */
export function careCard(state: GameState, cat: Cat, onPick: (choice: CareChoice) => void, onCancel: () => void): Card {
  const supply = state.home.supplies;
  const actions: CardAction[] = [];
  for (const m of ["pills", "drops"] as const) {
    if (supplyCount(state, m) > 0) actions.push({ label: `${PRODUCT_TITLES[m].name} ×${supplyCount(state, m)}`, onSelect: () => onPick({ medicine: m }) });
  }
  for (const q of ["premium", "cheap"] as const) {
    if (supply.treats[q] > 0) actions.push({ label: `${VARIANT_TITLES["treats"]?.[q] ?? ""} ×${supply.treats[q]}`, onSelect: () => onPick({ treat: q }) });
  }
  // Котяча м'ята (§9.12): кіт зістрибне з рук — що він із нею робитиме, видно з нього самого.
  for (const q of ["premium", "cheap"] as const) {
    if (supply.catnip[q] > 0) actions.push({ label: `${VARIANT_TITLES["catnip"]?.[q] ?? ""} ×${supply.catnip[q]}`, onSelect: () => onPick({ catnip: q }) });
  }
  if (canPutCollar(state, cat)) actions.push({ label: `${PRODUCT_TITLES.collar.name} ×${supplyCount(state, "collar")}`, onSelect: () => onPick("collar") });
  // Це меню вибору, як «Куди поїхати?»: головної дії немає, тож пробіл чи Enter нічого не обирають за гравця. Раніше головною
  // була перша дія (таблетки): другий пробіл, що брав кота, давав ліки здоровому коту (загальна ревізія 2026-10-29).
  return {
    kicker: "Догляд",
    title: `${cat.name} на руках`,
    body: [],
    actions,
    onDismiss: onCancel,
    closable: true,
  };
}

/** Знайда (§8.5, §4.1): взяти кошеня чи віднести в притулок. */
export function foundlingCard(onTake: () => void, onShelter: () => void): Card {
  return {
    kicker: "Знайда",
    title: "Кошеня під дверима",
    body: ["Під дверима сидить змокле кошеня й тремтить. Дивиться так, ніби давно на вас чекало."],
    actions: [
      { label: "Узяти додому", primary: true, onSelect: onTake },
      { label: `Віднести в притулок · 🕐 ${MODIFIERS.foundlingShelterMinutes / 60} год`, onSelect: onShelter },
    ],
  };
}

/** Дзвінок мами (§4.1): відповісти — пів години, не відповісти — здоровий глузд падає. */
export function callCard(onAnswer: () => void, onIgnore: () => void): Card {
  return {
    kicker: "Телефон",
    title: "Дзвонить мама",
    body: ["Мама питає, як справи, чи ви їсте і чи не забагато в домі котів."],
    actions: [
      { label: `Відповісти · 🕐 ${MODIFIERS.call.minutes} хв`, primary: true, onSelect: onAnswer },
      { label: "Не відповідати", onSelect: onIgnore },
    ],
  };
}

/** Меню на старті (§4.2): продовжити збережену гру чи почати нову. */
export function titleCard(state: GameState, onContinue: () => void, onNew: () => void): Card {
  const { name } = state.character;
  return {
    kicker: "Котоклопіт",
    solid: true,
    title: "Котоклопіт",
    body: [`Збережена гра: ${name}, тиждень ${weekOf(state.day)}, ${WEEKDAY_NAMES[weekdayOf(state.day)]}.`],
    actions: [
      { label: "Продовжити", primary: true, onSelect: onContinue },
      { label: "Нова гра", onSelect: onNew },
    ],
  };
}

/**
 * Створення персонажа (§5.1), крок 1: зовнішність — портрет на весь зріст і повзунки; портрет змінюється одразу. Редактор один для
 * всіх: будь-які частини в будь-якому поєднанні, без статі (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А4). «Випадково» —
 * нова випадкова зовнішність (`shuffle`); з такої редактор і починає.
 */
export function lookCard(start: Look, onDone: (look: Look) => void, shuffle: () => Look): Card {
  const look: Look = { ...start };
  const editor = element("div", "look-editor");
  const canvas = portraitCanvas(130, 220);
  const redraw = (): void => drawPortrait(canvas, look);
  redraw();
  const sliders = element("div", "look-sliders");
  // Показати на повзунках поточну зовнішність: після «Випадково» змінюються всі одразу.
  const sync: (() => void)[] = [];
  for (const { key, label, options } of LOOK_OPTIONS) {
    const row = element("label", "look-row");
    const value = element("span", "look-value");
    const slider = element("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(options.length - 1);
    slider.step = "1";
    slider.className = "look-slider";
    const show = (): void => {
      slider.value = String(look[key]);
      value.textContent = options[look[key]] ?? "";
    };
    show();
    sync.push(show);
    slider.addEventListener("input", () => {
      look[key] = Number(slider.value);
      show();
      redraw();
    });
    const head = element("span", "look-head");
    head.append(element("span", "look-label", label), value);
    row.append(head, slider);
    sliders.append(row);
  }
  editor.append(canvas, sliders);
  return {
    kicker: "Нова гра · 1 з 5",
    solid: true,
    title: "Як ви виглядаєте?",
    body: [editor],
    actions: [
      { label: "Далі", primary: true, onSelect: () => onDone({ ...look }) },
      {
        label: "Випадково",
        onSelect: () => {
          Object.assign(look, shuffle());
          for (const show of sync) show();
          redraw();
        },
      },
    ],
  };
}

/** Тексти кроку «Звертання» (§5.1, `TEXTS.md`, «Нова гра»). */
export const ADDRESS_TEXTS = {
  title: "Як звертатися?",
  text: "«Він» чи «вона» — лише в текстах гри: «прокинувся» чи «прокинулася».",
  options: { he: "Він", she: "Вона" },
} as const;

/**
 * Крок 2: звертання «він / вона» (§5.1) — лише граматика текстів, на гру не впливає (рішення автора 2026-10-29,
 * `GENERAL_REVIEW.md`, А4). Над вибором — портрет щойно складеної зовнішності; обране раніше (повернулися «Назад») — головна кнопка.
 */
export function addressCard(look: Look, chosen: Address | null, onPick: (address: Address) => void, onBack: () => void): Card {
  const canvas = portraitCanvas(90, 150);
  canvas.classList.add("address-portrait");
  drawPortrait(canvas, look);
  return {
    kicker: "Нова гра · 2 з 5",
    solid: true,
    title: ADDRESS_TEXTS.title,
    body: [canvas, ADDRESS_TEXTS.text],
    actions: [
      ...(["he", "she"] as const).map((address) => ({
        label: ADDRESS_TEXTS.options[address],
        primary: address === chosen,
        onSelect: () => onPick(address),
      })),
      { label: "Назад", onSelect: onBack },
    ],
    onDismiss: onBack,
  };
}

/** Крок 3: сова чи жайворонок (§5.1) — незалежно від звертання. Хронотип — лише час пробудження (рішення автора 2026-10-29, А4). */
export function chronotypeCard(onPick: (chronotype: Chronotype) => void, onBack: () => void): Card {
  return {
    kicker: "Нова гра · 3 з 5",
    solid: true,
    title: "Сова чи жайворонок?",
    body: [
      `Жайворонок прокидається о ${formatClock(WAKE_MINUTE.lark)}.`,
      `Сова прокидається о ${formatClock(WAKE_MINUTE.owl)}.`,
    ],
    actions: [
      { label: "Жайворонок", primary: true, onSelect: () => onPick("lark") },
      { label: "Сова", onSelect: () => onPick("owl") },
      { label: "Назад", onSelect: onBack },
    ],
    onDismiss: onBack,
  };
}

/**
 * Ім'я, з яким відкривається крок «Ім'я»: власне ім'я гравця лишається, хоч би яке звертання він потім обрав, а ім'я за
 * замовчуванням («Тарас», «Марта») — за звертанням, щоб узгоджувалося з текстами (§5.1).
 */
export function startName(address: Address, entered: string | null): string {
  const own = entered?.trim() ?? "";
  return own !== "" && !Object.values(DEFAULT_NAME).includes(own) ? own : DEFAULT_NAME[address];
}

/** Крок 4: ім'я героя; заголовок — за звертанням. */
export function nameCard(address: Address, start: string, onDone: (name: string) => void, onBack: () => void): Card {
  const input = element("input");
  input.type = "text";
  input.value = start;
  input.maxLength = 20;
  input.className = "button name-input";
  input.setAttribute("aria-label", "Ім'я");
  return {
    kicker: "Нова гра · 4 з 5",
    solid: true,
    title: address === "she" ? "Як її звати?" : "Як його звати?",
    body: [input],
    actions: [
      { label: "Далі", primary: true, onSelect: () => onDone(input.value) },
      { label: "Назад", onSelect: onBack },
    ],
    onDismiss: onBack,
  };
}

/** Створення персонажа (§5.2), крок 5: складність. */
export function difficultyCard(onPick: (difficulty: Difficulty) => void, onBack: () => void): Card {
  return {
    kicker: "Нова гра · 5 з 5",
    solid: true,
    title: "Складність",
    body: ["Змінити її потім не вийде."],
    actions: [
      ...(["easy", "normal", "hard"] as const).map((difficulty) => ({
        label: DIFFICULTY_TITLES[difficulty],
        primary: difficulty === "normal",
        onSelect: () => onPick(difficulty),
      })),
      { label: "Назад", onSelect: onBack },
    ],
    onDismiss: onBack,
  };
}
