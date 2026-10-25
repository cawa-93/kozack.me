// Вміст карток: титулка дня з ранковими повідомленнями, кінець гри, телефон, нова гра.

import { MODIFIERS, WAKE_UP } from "../sim/config";
import { supplyCount, utilitiesDue } from "../sim/economy";
import { breedById, MIXED } from "../sim/breeds";
import { beardLook, cycleDay, cyclePhase } from "../sim/grooming";
import { needsHumanMeds } from "../sim/illness";
import { visibility } from "../sim/knowledge";
import { inHeat, isNursing, showsPregnancy } from "../sim/reproduction";
import { traitGroup } from "../sim/traits";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Cat, Chronotype, Difficulty, GameEnd, GameState, HomeItem, Look, Medicine, NightReport, Quality, Sex } from "../sim/types";
import {
  CONTROLS_KEYBOARD,
  CONTROLS_TOUCH,
  DAY_MODIFIER_TEXTS,
  DIFFICULTY_TITLES,
  WEEK_MODIFIER_TEXTS,
  diseaseTitle,
  endingText,
  farewellText,
  fill,
  BEARD_TEXTS,
  CYCLE_TEXTS,
  BIRTH_MESSAGE,
  KITTEN_MESSAGE,
  UTILITIES_MESSAGES,
  WAKE_TEXTS,
} from "../texts";
import { element, type Card, type CardAction, type TitleSection } from "./overlay";
import { shopCatalog } from "./shop";
import type { CartLine } from "../sim/shop";
import { plural, PRODUCT_TITLES, THING_TITLES, VARIANT_TITLES } from "./titles";

export { plural };
import { drawPortrait, portraitCanvas } from "./portrait";
import { traitChips } from "./traits";

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
/** Титулка дня (§4): тиждень і його ефекти, день і його ефекти, події ночі. Показує `Overlay.title`. */
export function dayTitle(state: GameState, night: NightReport | null): TitleSection[] {
  const { name, sex } = state.character;
  const weekBlocks: string[][] = [];
  const week = state.modifiers.week ? WEEK_MODIFIER_TEXTS[state.modifiers.week] : undefined;
  if (week) weekBlocks.push([week.title, week.situation]);
  const dayBlocks: string[][] = [];
  const modifier = state.modifiers.day ? DAY_MODIFIER_TEXTS[state.modifiers.day] : undefined;
  if (modifier) dayBlocks.push([modifier.title, modifier.situation]);
  const phase = cyclePhase(state);
  if (phase) dayBlocks.push([fill(CYCLE_TEXTS[phase], sex, { день: cycleDay(state) })]);
  const beard = sex === "male" ? beardLook(state) : null;
  if (beard === "stubble" || beard === "unkempt") dayBlocks.push([BEARD_TEXTS[beard]]);

  const events: (string | HTMLElement)[][] = [];
  // Хто будив уночі (§8.8): по рядку на кота, без пояснень.
  for (const reason of ["night", "morning"] as const) {
    const ids = new Set((night?.wakeUps ?? []).filter((w) => w.reason === reason).map((w) => w.cat));
    for (const id of ids) {
      const cat = state.cats.find((c) => c.id === id) ?? state.album.find((e) => e.id === id);
      if (cat) events.push([fill(WAKE_TEXTS[reason], cat.sex, { кіт: cat.name, час: formatClock(WAKE_UP.morningMinute) })]);
    }
  }
  const newCats = (night?.newCats ?? []).map((id) => state.cats.find((c) => c.id === id)).filter((c) => c !== undefined);
  for (const cat of newCats.filter((c) => c.source !== "born")) {
    events.push([fill(KITTEN_MESSAGE, sex, { персонаж: name, кошеня: cat.name })]);
  }
  // Пологи (§9.8): одне повідомлення на кожну матір.
  const born = newCats.filter((c) => c.source === "born");
  for (const motherId of new Set(born.map((c) => c.parents.mother))) {
    const kittens = born.filter((c) => c.parents.mother === motherId);
    const mother = state.cats.find((c) => c.id === motherId);
    const values = { кішка: mother?.name ?? "кішка", кількість: kittens.length, кошенята: kittens.map((c) => c.name).join(", ") };
    // `[одне|кілька]`: «чоловіча» форма — одне кошеня.
    events.push([fill(BIRTH_MESSAGE, kittens.length === 1 ? "male" : "female", values)]);
  }
  for (const id of night?.givenCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle);
    events.push([`${entry.name} — у нових руках`, text.cause, `«${text.title}». ${text.life}`, ...(entry.traits.length > 0 ? [traitChips(entry.traits, entry.sex)] : [])]);
  }
  for (const id of night?.lostCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle);
    // На прощанні відкривається весь характер кота (§9.7): риси з описом по дотику.
    events.push([`Прощавай, ${entry.name}`, text.cause, `«${text.title}». ${text.life}`, ...(entry.traits.length > 0 ? [traitChips(entry.traits, entry.sex)] : [])]);
  }
  const utilities = night?.utilities;
  if (utilities && utilities.outcome !== "evicted") {
    events.push([fill(UTILITIES_MESSAGES[utilities.outcome], sex, { сума: utilities.paid, борг: utilities.nextDue })]);
  }
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

export interface PhoneHandlers {
  /** Оплатити кошик доставкою (§6.4). */
  checkout: (cart: CartLine[]) => void;
  discard: (item: HomeItem) => void;
  advertise: (cat: Cat) => void;
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
  if (tab === "mine") body.push(`Комунальні: ${utilitiesDue(state)} ₴ на тиждень.`, myThings(state, handlers));
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

/** Меню гри (§4.2, §5): нова гра, експорт і імпорт збереження. */
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
  const { name } = state.character;
  return [
    `${name} · ${DIFFICULTY_TITLES[state.difficulty]}`,
    "Гра зберігається в браузері сама, але браузер може її стерти — тож довгу гру варто часом зберігати файлом.",
    box,
  ];
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
    const lines = [`${cat.name} ${cat.sex === "male" ? "♂" : "♀"} · ${weeks(cat.ageWeeks)}`];
    const breed = breedText(cat.breed, cat.breedKnown);
    if (breed !== "невідома") lines.push(`Порода: ${breed}.`);
    const states: string[] = [];
    if (cat.sterilized && cat.sterilizedKnown) states.push(cat.sex === "male" ? "кастрований" : "стерилізована");
    if (cat.pregnancy?.known) states.push("вагітна");
    else if (showsPregnancy(state, cat)) states.push("здається, вагітна");
    if (inHeat(state, cat)) states.push("у тічці");
    if (isNursing(state, cat)) states.push("годує кошенят");
    if (cat.ageWeeks === 0 && cat.source === "born") states.push("новонароджене");
    if (state.ads.includes(cat.id)) states.push("завтра заберуть нові господарі");
    if (states.length > 0) lines.push(`${states.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()));
    const found = cat.diseases.filter((d) => d.known).map((d) => diseaseTitle(d.id));
    if (found.length > 0) lines.push(`Ветеринар знайшов: ${found.join(", ")}.`);
    // Відомі риси — назвами-чипами з описом під ними; помічене — здогадкою (§9.9).
    const known = cat.traits.filter((t) => visibility(state, t) === 3);
    for (const trait of cat.traits) {
      const seen = visibility(state, trait);
      if (seen === 2) {
        const signs = traitGroup(trait.group).signs;
        if (signs) lines.push(`Здається, ${cat.name} ${fill(trait.level > 0 ? signs[0] : signs[1], cat.sex)}.`);
      } else if (seen === 1) lines.push("❓ Помічено щось дивне");
    }
    if (cat.traits.every((t) => visibility(state, t) === 0)) lines.push("Характер: ?");
    const card = note(...lines);
    // Ім'я — заголовок картки, навіть коли під ним самі риси.
    const title = card.firstElementChild;
    if (title instanceof HTMLElement) title.style.fontWeight = "600";
    if (known.length > 0) card.append(traitChips(known, cat.sex));
    if (cat.ageWeeks >= 1 && !state.ads.includes(cat.id)) {
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

/** Альбом пам'яті (§9.7): ім'я, вік, усі риси, причина й опис життя. */
function albumCards(state: GameState): (string | HTMLElement)[] {
  if (state.album.length === 0) return ["Альбом поки порожній."];
  return [...state.album].reverse().map((entry) => {
    const cause = entry.cause.kind === "disease" ? `хвороба «${diseaseTitle(entry.cause.disease)}»` : CAUSE_TITLES[entry.cause.kind] ?? "";
    const text = farewellText(entry, diseaseTitle);
    const card = note(`${entry.name}, ${weeks(entry.ageWeeks)} — ${cause}`, `«${text.title}». ${text.life}`);
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
  return shop;
}


export type CareChoice = { medicine: Medicine } | { treat: Quality } | { collar: Quality } | "bell";

/** Чи є чим доглянути кота біля аптечки (§8.7): ліки, ласощі, нашийник, дзвіночок. */
export function hasCareSupplies(state: GameState, cat: Cat): boolean {
  // Дзвіночок — лише на нашийник без дзвіночка: інакше картка відкрилася б порожньою.
  const bell = cat.collar !== null && !cat.collar.bell && supplyCount(state, "bell") > 0;
  return bell || (["pills", "drops", "treats", "collar"] as const).some((p) => supplyCount(state, p) > 0);
}

/** Догляд за котом на руках біля аптечки (§8.7, §9.5, §9.10): ліки, ласощі, нашийник. */
export function careCard(state: GameState, cat: Cat, onPick: (choice: CareChoice) => void, onCancel: () => void): Card {
  const supply = state.home.supplies;
  const actions: { label: string; primary?: boolean; onSelect: () => void }[] = [];
  for (const m of ["pills", "drops"] as const) {
    if (supplyCount(state, m) > 0) actions.push({ label: `${PRODUCT_TITLES[m].name} ×${supplyCount(state, m)}`, onSelect: () => onPick({ medicine: m }) });
  }
  for (const q of ["premium", "cheap"] as const) {
    if (supply.treats[q] > 0) actions.push({ label: `${VARIANT_TITLES["treats"]?.[q] ?? ""} ×${supply.treats[q]}`, onSelect: () => onPick({ treat: q }) });
  }
  for (const q of ["premium", "cheap"] as const) {
    if (supply.collar[q] > 0) actions.push({ label: VARIANT_TITLES["collar"]?.[q] ?? "", onSelect: () => onPick({ collar: q }) });
  }
  if (cat.collar && !cat.collar.bell && supplyCount(state, "bell") > 0) actions.push({ label: `Дзвіночок ×${supplyCount(state, "bell")}`, onSelect: () => onPick("bell") });
  const first = actions[0];
  if (first) first.primary = true;
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
    body: ["Мама питає, як справи, чи ви їсте, і чи не забагато в домі котів."],
    actions: [
      { label: `Відповісти · 🕐 ${MODIFIERS.call.minutes} хв`, primary: true, onSelect: onAnswer },
      { label: "Не відповідати", onSelect: onIgnore },
    ],
  };
}

/** Умивальник для чоловічого персонажа (§5.1, §6.5): гоління, підрівнювання бороди, ліки. */
export function sinkCard(state: GameState, onPick: (choice: "shave" | "trim" | "meds") => void, onCancel: () => void): Card {
  const look = beardLook(state);
  const actions: { label: string; primary?: boolean; onSelect: () => void }[] = [];
  if (look === "neat" || look === "unkempt") actions.push({ label: "Підрівняти бороду · 🕐 5 хв", primary: true, onSelect: () => onPick("trim") });
  actions.push({ label: "Поголитися · 🕐 10 хв", primary: actions.length === 0, onSelect: () => onPick("shave") });
  if (supplyCount(state, "humanMeds") > 0 && needsHumanMeds(state)) actions.push({ label: `Ліки для себе ×${supplyCount(state, "humanMeds")}`, onSelect: () => onPick("meds") });
  const words = { clean: "Обличчя гладеньке.", stubble: "Щетина вже помітна.", neat: "Борода охайна.", unkempt: "Борода стирчить у різні боки." };
  return {
    kicker: "Ванна",
    title: "Умивальник",
    body: [words[look]],
    actions,
    onDismiss: onCancel,
    closable: true,
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

/** Створення персонажа (§5.1), крок 1: стать — натиснути на портрет. */
export function sexCard(looks: Record<Sex, Look>, onPick: (sex: Sex) => void, onCancel?: () => void): Card {
  const choice = element("div", "portrait-choice");
  for (const sex of ["female", "male"] as const) {
    const button = element("button", "portrait-button");
    const canvas = portraitCanvas(110, 160);
    drawPortrait(canvas, looks[sex], sex);
    button.append(canvas, element("span", "portrait-label", sex === "female" ? "Жінка" : "Чоловік"));
    button.addEventListener("click", () => onPick(sex));
    choice.append(button);
  }
  return {
    kicker: "Нова гра · 1 з 5",
    solid: true,
    title: "Хто ви?",
    body: [choice],
    actions: [],
    ...(onCancel ? { onDismiss: onCancel, closable: true } : {}),
  };
}

const LOOK_OPTIONS: { key: keyof Look; label: string; options: readonly string[] }[] = [
  { key: "face", label: "Обличчя", options: ["кругле", "овальне", "широке"] },
  { key: "skin", label: "Шкіра", options: ["світла", "бежева", "смаглява", "темна", "дуже темна"] },
  { key: "hair", label: "Зачіска", options: ["коротка", "довга", "хвостик", "кучері"] },
  { key: "hairColor", label: "Волосся", options: ["чорне", "каштанове", "русяве", "біляве", "руде", "сиве"] },
  { key: "eyes", label: "Очі", options: ["темні", "блакитні", "зелені", "карі"] },
  { key: "build", label: "Статура", options: ["струнка", "звичайна", "кремезна"] },
  { key: "top", label: "Верх", options: ["червоний", "синій", "зелений", "жовтий", "вишневий", "графітовий", "білий"] },
  { key: "bottom", label: "Низ", options: ["графітовий", "білий", "червоний", "синій", "зелений", "жовтий", "вишневий"] },
  { key: "shoes", label: "Взуття", options: ["графітове", "біле", "червоне", "синє", "зелене", "жовте", "вишневе"] },
];

/** Крок 2: зовнішність — портрет на весь зріст і повзунки; портрет змінюється одразу (§5.1). */
export function lookCard(sex: Sex, start: Look, onDone: (look: Look) => void, onBack: () => void): Card {
  const look: Look = { ...start };
  const editor = element("div", "look-editor");
  const canvas = portraitCanvas(130, 220);
  const redraw = (): void => drawPortrait(canvas, look, sex);
  redraw();
  const sliders = element("div", "look-sliders");
  for (const { key, label, options } of LOOK_OPTIONS) {
    const row = element("label", "look-row");
    const value = element("span", "look-value", options[look[key]] ?? "");
    const slider = element("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(options.length - 1);
    slider.step = "1";
    slider.value = String(look[key]);
    slider.className = "look-slider";
    slider.addEventListener("input", () => {
      look[key] = Number(slider.value);
      value.textContent = options[look[key]] ?? "";
      redraw();
    });
    const head = element("span", "look-head");
    head.append(element("span", "look-label", label), value);
    row.append(head, slider);
    sliders.append(row);
  }
  editor.append(canvas, sliders);
  return {
    kicker: "Нова гра · 2 з 5",
    solid: true,
    title: sex === "female" ? "Яка вона?" : "Який він?",
    body: [editor],
    actions: [
      { label: "Далі", primary: true, onSelect: () => onDone(look) },
      { label: "Назад", onSelect: onBack },
    ],
    onDismiss: onBack,
  };
}

/** Крок 3: сова чи жайворонок (§5.1) — незалежно від статі. */
export function chronotypeCard(onPick: (chronotype: Chronotype) => void, onBack: () => void): Card {
  return {
    kicker: "Нова гра · 3 з 5",
    solid: true,
    title: "Сова чи жайворонок?",
    body: [
      "Жайворонок прокидається рано й найбадьоріший зранку.",
      "Сова прокидається пізніше й оживає ближче до вечора.",
    ],
    actions: [
      { label: "Жайворонок", primary: true, onSelect: () => onPick("lark") },
      { label: "Сова", onSelect: () => onPick("owl") },
      { label: "Назад", onSelect: onBack },
    ],
    onDismiss: onBack,
  };
}

/** Крок 4: ім'я героя. */
export function nameCard(sex: Sex, start: string, onDone: (name: string) => void, onBack: () => void): Card {
  const input = element("input");
  input.type = "text";
  input.value = start;
  input.maxLength = 20;
  input.className = "button name-input";
  input.setAttribute("aria-label", "Ім'я");
  return {
    kicker: "Нова гра · 4 з 5",
    solid: true,
    title: sex === "female" ? "Як її звати?" : "Як його звати?",
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
