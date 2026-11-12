// Вміст карток: титулка дня з ранковими повідомленнями, кінець гри, телефон, нова гра.

import { PALETTE } from "../../art/palette";
import "./phone.css";
import { MODIFIERS, NAME_MAX_LENGTH, WAKE_UP } from "../sim/config";
import { supplyCount } from "../sim/economy";
import { breedById, MIXED } from "../sim/breeds";
import { diseaseMedicine, dosedToday } from "../sim/diseases";
import { canGiveAway, giveAwayBlocker } from "../sim/farewell";
import { hasFurryCat, isShowDay, WEEK_PAIRS } from "../sim/modifiers";
import { hasFertileFemale, inHeat, isNursing, showsPregnancy } from "../sim/reproduction";
import { DEFAULT_NAME } from "../sim/game";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Address, AlbumEntry, Appliance, Cat, Chronotype, Difficulty, GameEnd, GameState, HomeItem, Look, Medicine, NightReport, Quality, Sex, ThingKind } from "../sim/types";
import {
  ADDRESS_TEXTS,
  BILL_TEXTS,
  BIRTH_MESSAGE,
  CALL_TEXTS,
  BREED_ABOUT,
  BREED_HALF,
  CAT_DOSE_TODAY,
  CONTROLS_TITLES,
  DAY_MODIFIER_TEXTS,
  SHOW_EVE_TEXTS,
  DIFFICULTY_TITLES,
  diseaseTitle,
  endingText,
  farewellText,
  fill,
  GAME_TEXTS,
  DISCARD_LABEL,
  GIVE_AWAY_LABEL,
  HOME_FIXTURE_TITLES,
  KITTEN_MESSAGE,
  LEDGER_TEXTS,
  ledgerLines,
  minutesText,
  parcelsPickupText,
  PROFILE_TEXTS,
  SOUND_TEXTS,
  WAKE_TEXTS,
  WEEK_MODIFIER_TEXTS,
} from "../texts";
import { allControls, homeControls } from "./controls";
import { creditsLink } from "./creditslink";
import { destinationLabel, diseaseLabel, iconImage, named, productLabel } from "./icons";
import { choiceGroup, element, type Card, type CardAction, type TitleSection } from "./overlay";
import { shopCatalog, variantLabel } from "./shop";
import { phoneStatusBar } from "./phonebar";
import type { CartLine } from "../sim/shop";
import { plural } from "./titles";

export { plural };
import { wearOf } from "../view/wardrobe/index";
import { LOOK_OPTIONS, LOOK_PAGE, LOOK_TABS, rowChoices, shownRow, type LookRow, type LookTab } from "./look";
import { catProfile, type CatFacts } from "./catprofile";
import { drawPortrait, portraitCanvas } from "./portrait";
import { billCard } from "./bill";
import { chipRow, knownTraitChips, type TraitChip } from "./traits";
import { profileTab } from "./profile";
import { DESTINATION_ICONS, HOME_FIXTURE_ICONS } from "../view/symbols";

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
 * Чи показує титулка модифікатор тижня (§4.1): того, що вже не про персонажа, — ні. Робочого — безробітному, котячого — коли
 * котів немає (останній помер чи пішов, коли тиждень уже обрано), «Котячого березня» й «Спокійного сезону» — без нестерилізованої
 * дорослої кішки, «Линьки» й «Зимового хутра» — без кота з шерстю. Погода — «Хвиля спеки» й «Похолодання» — лишається: і без котів вона змінює гігієну персонажа.
 */
function weekShown(state: GameState, id: string): boolean {
  const pair = WEEK_PAIRS.find((p) => p.hard === id || p.easy === id);
  if (pair?.when === "work") return !state.job.unemployed;
  if (pair?.when === "cat") return state.cats.length > 0 || id === "heat-wave" || id === "cold-snap";
  if (pair?.when === "fertile") return hasFertileFemale(state);
  if (pair?.when === "furry") return hasFurryCat(state);
  return true;
}

/** Титулка дня (§4): тиждень, день, модифікатор і що сталося вночі. */
/** Титулка дня (§4): тиждень і його ефекти, день і його ефекти, події ночі. Показує `Overlay.title`. */
export function dayTitle(state: GameState, night: NightReport | null): TitleSection[] {
  const { name, address } = state.character;
  const weekBlocks: string[][] = [];
  const week = state.modifiers.week && weekShown(state, state.modifiers.week) ? WEEK_MODIFIER_TEXTS[state.modifiers.week] : undefined;
  if (week) weekBlocks.push([week.title, ...(week.situation ? [week.situation] : [])]);
  const dayBlocks: string[][] = [];
  const modifier = state.modifiers.day ? DAY_MODIFIER_TEXTS[state.modifiers.day] : undefined;
  if (modifier) dayBlocks.push([modifier.title, ...(modifier.situation ? [modifier.situation] : [])]);
  // Про виставку котів знають заздалегідь (§4.1): напередодні — окремий блок.
  if (isShowDay(state, state.day + 1)) dayBlocks.push([SHOW_EVE_TEXTS.title, SHOW_EVE_TEXTS.situation]);

  const events: (string | HTMLElement)[][] = [];
  // Хто будив уночі (§8.8): по рядку на кота, без пояснень.
  for (const reason of ["night", "hairball", "morning"] as const) {
    const ids = new Set((night?.wakeUps ?? []).filter((w) => w.reason === reason).map((w) => w.cat));
    for (const id of ids) {
      const cat = state.cats.find((c) => c.id === id) ?? state.album.find((e) => e.id === id);
      if (cat) events.push([fill(WAKE_TEXTS[reason], cat.sex, { кіт: cat.name, час: formatClock(WAKE_UP.morningMinute) })]);
    }
  }
  // Сусіди розбудили раніше (§4.1): ефект — наступного ранку, коли модифікатор уже інший, тож титулка називає причину.
  if (night?.neighborsWoke !== undefined) events.push([fill(WAKE_TEXTS.neighbors, address, { час: formatClock(night.neighborsWoke) })]);
  // Сусідка забрала посилки, поки персонаж спав (§4.1): учорашня подія, тож титулка каже, чим скінчилося.
  if (night?.parcels) events.push([parcelsPickupText(night.parcels, true)]);
  const newCats = (night?.newCats ?? []).map((id) => state.cats.find((c) => c.id === id)).filter((c) => c !== undefined);
  for (const cat of newCats.filter((c) => c.source !== "born")) {
    events.push([fill(KITTEN_MESSAGE, address, { персонаж: name, кошеня: cat.name })]);
  }
  // Пологи (§9.8): одне повідомлення на кожну матір.
  const born = newCats.filter((c) => c.source === "born");
  for (const motherId of new Set(born.map((c) => c.parents.mother))) {
    const kittens = born.filter((c) => c.parents.mother === motherId);
    const mother = state.cats.find((c) => c.id === motherId) ?? state.album.find((e) => e.id === motherId);
    const values = { кішка: mother?.name ?? "кішка", кількість: `${kittens.length} ${plural(kittens.length, "кошеня", "кошеняти", "кошенят")}`, кошенята: kittens.map((c) => c.name).join(", ") };
    // `[одне|кілька]`: «чоловіча» форма — одне кошеня.
    events.push([fill(BIRTH_MESSAGE, kittens.length === 1 ? "male" : "female", values)]);
  }
  for (const id of night?.keptCats ?? []) {
    const cat = state.cats.find((c) => c.id === id);
    if (cat) events.push([`Оголошення знято: ${cat.name} годує кошенят.`]);
  }
  for (const id of night?.givenCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    const text = farewellText(entry, diseaseTitle, state);
    events.push([fill("{кіт} [поїхав|поїхала] до нових господарів", entry.sex, { кіт: entry.name }), text.cause, ...farewellTraits(state, entry)]);
  }
  for (const id of night?.lostCats ?? []) {
    const entry = state.album.find((e) => e.id === id);
    if (!entry) continue;
    // Хвороба, від якої кіт помер, — з іконкою, як у ветеринара (§11.4 «Іконка біля назви»).
    const text = farewellText(entry, diseaseLabel, state);
    // «Прощавай, {кіт}» вимагало б кличного відмінка. Опису прожитого життя на титулці немає (§9.7): він — у титрах життя.
    events.push([`Прощання: ${entry.name}`, text.cause, ...farewellTraits(state, entry)]);
  }
  // Прийшов рахунок за комунальні (§6.4); нульового немає.
  const utilities = night?.utilities;
  if (utilities?.outcome === "billed" && utilities.bill > 0) events.push([fill(utilities.recalculated ? BILL_TEXTS.arrivedRecalculated : BILL_TEXTS.arrived, address, { сума: utilities.bill })]);
  // Куди пішли гроші минулого тижня (§6.4, рішення автора 2026-10-27, Е4).
  if (night?.ledger) events.push([LEDGER_TEXTS.heading, ...ledgerLines(night.ledger)]);
  if (night === null && state.day === 0) {
    events.push([CONTROLS_TITLES.first, homeControls(isTouch())]);
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
 * Екран програшу (§4.2, §6.1): хто й скільки протримався, назва завершення й текст, на що пішов час, коти. Лише те, що гравець і
 * так бачив: без розбивок і порогів, що розкривали б механіки (§11.3а). Пенсія — титри життя (`lifecredits.ts`).
 */
export function endScreen(state: GameState, end: Exclude<GameEnd, "retirement">, handlers: EndHandlers): { parts: HTMLElement[]; actions: CardAction[] } {
  const { title, text } = endingText(state, end);
  const { name } = state.character;
  const when = `тиждень ${weekOf(state.day)}, ${WEEKDAY_NAMES[weekdayOf(state.day)] ?? ""}`;
  const parts: HTMLElement[] = [element("p", "ending-who", `${name} · ${when}`), element("h2", "title-heading", title)];
  for (const paragraph of text.split("\n\n")) parts.push(element("p", "ending-text", paragraph));
  const time = timeBar(state);
  if (time) parts.push(time);
  const cats = catChips(state);
  if (cats) parts.push(cats);
  return {
    parts,
    actions: [
      { label: "Переграти день", primary: true, onSelect: handlers.replayDay },
      { label: "Переграти тиждень", onSelect: handlers.replayWeek },
      { label: "Нова гра", onSelect: handlers.newGame },
    ],
  };
}

/**
 * На що пішов час (§4.2): смуга з чотирьох частин, під нею — іконка й години кожної. Кольори — палітра арту: відрізок смуги
 * основним тоном, кружечок під іконкою в легенді — світлішим («…Hi»), бо він на темному екрані.
 */
const TIME_PARTS = [
  { key: "work", glyph: "💻", bar: PALETTE.blue, legend: PALETTE.blueHi },
  { key: "cats", glyph: "🐱", bar: PALETTE.orange, legend: PALETTE.orangeHi },
  { key: "self", glyph: "☕", bar: PALETTE.green, legend: PALETTE.greenHi },
  { key: "bustle", glyph: "👣", bar: PALETTE.grey, legend: PALETTE.greyHi },
] as const;

export function timeBar(state: GameState): HTMLElement | null {
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
    segment.style.background = part.bar;
    bar.append(segment);
    const item = element("span", undefined, `${part.glyph} ${Math.round(value / 60)} год`);
    item.style.setProperty("--part", part.legend);
    legend.append(item);
  }
  box.append(bar, legend);
  return box;
}

/** Коти, що жили з персонажем (§4.2): ті, з ким попрощалися, — з назвою рівня життя, живі — з іконкою дому. */
function catChips(state: GameState): HTMLElement | null {
  if (state.album.length === 0 && state.cats.length === 0) return null;
  const box = element("div", "ending-cats");
  for (const entry of state.album) {
    const chip = element("span", "ending-cat", entry.name);
    chip.append(element("small", undefined, farewellText(entry, diseaseTitle, state).title));
    box.append(chip);
  }
  for (const cat of state.cats) box.append(element("span", "ending-cat", `🏠 ${cat.name}`));
  return box;
}

export type PhoneTab = "shop" | "home" | "cats" | "profile" | "game";

/** Річ без місця в «Моїх речах» (§8.7): техніка, автогодівниця над місцем миски, переноска чи замок на шафку. */
export type DiscardThing = { appliance: Appliance } | { feeder: string } | { carrier: number } | { owned: "lock" };

export interface PhoneHandlers {
  /** Оплатити кошик доставкою (§6.4). */
  checkout: (cart: CartLine[]) => void;
  /** Сплатити рахунок за комунальні (§6.4). */
  payUtilities: () => void;
  discard: (item: HomeItem) => void;
  /** Викинути техніку, автогодівницю (над місцем миски `slot`), переноску чи замок на шафку; `quality` — для назви в підтвердженні. */
  discardThing: (thing: DiscardThing, quality: Quality) => void;
  advertise: (cat: Cat) => void;
  cancelAd: (cat: Cat) => void;
  newGame: () => void;
  exportSave: () => void;
  importSave: (file: File) => void;
  tab: (tab: PhoneTab) => void;
  close: () => void;
  /** Гучність звуків (§11.4а) — вподобання гравця, як і радіо. */
  effects: { volume: number; set: (volume: number) => void };
  /** Змінити складність посеред гри (§5.2). */
  difficulty: (difficulty: Difficulty) => void;
}

/** Вкладки телефона по порядку: за місцем вкладки `phone.css` фарбує її плитку, тож порядок і іконки — разом із ним. */
const PHONE_TABS: Record<PhoneTab, string> = { shop: "🛒 Магазин", home: "🏠 Дім", cats: "🐱 Коти", profile: PROFILE_TEXTS.tab, game: GAME_TEXTS.tab };

/** Телефон персонажа (§6.4): магазин із доставкою, викинути річ, коти, профіль, гра. */
export function phoneCard(state: GameState, wanted: PhoneTab, handlers: PhoneHandlers): Card {
  // Коти з'являються, коли їх є що показати (§11.3а): до першого кота — лише порожня сторінка.
  const tabs = (Object.keys(PHONE_TABS) as PhoneTab[]).filter((t) => t !== "cats" || state.cats.length > 0);
  const tab = tabs.includes(wanted) ? wanted : "shop";
  // Рядок стану з годинником гри — угорі екрана, над вкладками (`phone.css`), хоч у картці він першим у тілі, після вкладок.
  const body: (string | HTMLElement)[] = [phoneStatusBar(state.minute)];
  // Що вже їде, видно в рядку кожного товару (§6.4); смуга кошика з «Замовити» — внизу картки (рішення автора 2026-11-03).
  const shop = tab === "shop" ? shopCatalog(state, "delivery", { checkout: handlers.checkout }) : null;
  if (shop) body.push(shop.list);
  if (tab === "home") {
    body.push(billCard(state, handlers.payUtilities), myThings(state, handlers));
  }
  if (tab === "cats") body.push(...catCards(state, handlers));
  if (tab === "profile") body.push(...profileTab(state));
  if (tab === "game") body.push(...gameMenu(state, handlers));
  // Вкладки — компактний рядок угорі, закрити — хрестиком: на телефоні горизонтально лишається місце для вмісту. Вигляд
  // смартфона набік — `phone.css`.
  return {
    title: "",
    skin: "phone",
    tabs: tabs.map((t) => ({ label: PHONE_TABS[t], id: t, active: t === tab, onSelect: () => handlers.tab(t) })),
    body,
    ...(shop ? { bar: shop.bar } : {}),
    actions: [],
    onDismiss: handlers.close,
    closable: true,
  };
}

/**
 * Меню гри (§4.2, §5): вибір складності, керування — щоб перечитати підказку першого дня (§11.3а), гучність звуків, нова гра, експорт і
 * імпорт збереження; унизу — посилання на титри (§2.1). Хто персонаж і його посада — у «Профілі» (`profile.ts`).
 */
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
  const effects = element("input", "sound-volume");
  effects.type = "range";
  effects.min = "0";
  effects.max = "100";
  effects.value = String(Math.round(handlers.effects.volume * 100));
  effects.setAttribute("aria-label", SOUND_TEXTS.effects);
  effects.addEventListener("input", () => handlers.effects.set(Number(effects.value) / 100));
  const sound = element("label", "sound-volume-box", SOUND_TEXTS.effects);
  sound.append(effects);
  const difficulty = element("div", "game-difficulty");
  const caption = element("span", "game-player", GAME_TEXTS.difficulty);
  caption.id = "game-difficulty";
  const choices = choiceGroup(DIFFICULTIES.map((d) => ({ label: DIFFICULTY_TITLES[d], chosen: d === state.difficulty, onSelect: () => handlers.difficulty(d) })));
  choices.setAttribute("aria-labelledby", caption.id);
  difficulty.append(caption, choices);
  return [
    difficulty,
    allControls(isTouch()),
    sound,
    box,
    element("p", "game-note", "Браузер може стерти гру — часом зберігайте її файлом."),
    creditsLink(),
  ];
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
  // Невідома половина останньою — без крапки після «?».
  return breed[0] === MIXED && breed[1] === MIXED ? `${text.replace(/^./, (c) => c.toUpperCase())}.` : `Порода: ${text}${text.endsWith("?") ? "" : "."}`;
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
    lines.push(halfBreed ? `${fill(BREED_HALF, cat.sex, { порода: breedById(id).name.toLowerCase() })} ${about}` : about);
  }
  return lines;
}

/** Що про кота вже відомо (§9.9): вік, порода й стерилізація, опис породи, стани, хвороби й здогадки та риси, відомі цілком. */
export function catFacts(state: GameState, cat: Cat): CatFacts {
  const lines: string[] = [...breedAbout(cat)];
  const states: string[] = [];
  if (cat.pregnancy?.known) states.push("вагітна");
  else if (showsPregnancy(state, cat)) states.push("здається, вагітна");
  if (inHeat(state, cat)) states.push("у тічці");
  if (isNursing(state, cat)) states.push("годує кошенят");
  if (states.length > 0) lines.push(`${states.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()));
  // Біля хвороби, на яку діють ліки, — чи дали їх сьогодні (§9.5): персонаж сам давав.
  const found = cat.diseases.filter((d) => d.known).map((d) => {
    const medicine = diseaseMedicine(d.id);
    const dosed = medicine !== null && dosedToday(state, cat, medicine);
    return dosed && medicine ? `${diseaseLabel(d.id)} (${CAT_DOSE_TODAY[medicine]})` : diseaseLabel(d.id);
  });
  // Хворобу могла знайти й ветеринарка вдома; назви посеред речення — з малої (крок 17, вичитка 2026-10-29); іконка — як у картці
  // ветеринара (§11.4 «Іконка біля назви»).
  if (found.length > 0) lines.push(`Хвороби: ${found.join(", ").toLowerCase()}.`);
  // Помічені риси — чипами (§9.9): відомі — назвою, решта — «…?»; бабл каже опис, підказку без боку чи лише розділ. Ім'я вже в
  // заголовку картки, тож підказка — без нього, як у новині телефона.
  const chips: TraitChip[] = knownTraitChips(state, cat);
  if (chips.length === 0) lines.push("Характер: ?");
  // Вік, порода й стерилізація — одним рядком (стать — знаком за ім'ям); невідоме — без нього.
  const breed = breedText(cat.breed, cat.breedKnown, cat.sex);
  const sterilized = cat.sterilized && cat.sterilizedKnown ? [cat.sex === "male" ? "кастрований" : "стерилізована"] : [];
  return { head: [weeks(cat.ageWeeks), ...(breed === null ? [] : [breed]), ...sterilized].join(" · "), lines, chips };
}

/** Картки котів (§9.7, §9.9): та сама картка, що й у знайомстві, а під нею — оголошення. */
function catCards(state: GameState, handlers: PhoneHandlers): (string | HTMLElement)[] {
  return state.cats.map((cat) => {
    const card = element("div", "cat-profile-extra");
    // Оголошення (§9.8): з підтвердженням (картку показує сцена) і можна зняти; новонародженого й матір новонароджених — ні,
    // а на важчих складностях кнопки немає зовсім.
    const blocker = canGiveAway(state) ? giveAwayBlocker(state, cat) : "difficulty";
    let action: HTMLElement | undefined;
    if (state.ads.includes(cat.id)) {
      card.append(note(`Завтра вранці ${cat.name} поїде до нових господарів.`));
      const cancel = element("button", "button", "Зняти оголошення");
      cancel.addEventListener("click", () => handlers.cancelAd(cat));
      card.append(cancel);
    } else if (blocker === null) action = giveAwayButton(() => handlers.advertise(cat));
    return catProfile(cat, catFacts(state, cat), { action, extra: card, rename: "title" });
  });
}

/** «Віддати в добрі руки» (§9.8): кнопка-іконка притулку праворуч у рядку імені; назва — підказкою й для читача екрана. */
function giveAwayButton(onClick: () => void): HTMLButtonElement {
  const button = element("button", "button give-away");
  const icon = iconImage(DESTINATION_ICONS.shelter);
  if (icon) button.append(icon);
  button.title = GIVE_AWAY_LABEL;
  button.setAttribute("aria-label", GIVE_AWAY_LABEL);
  button.addEventListener("click", onClick);
  return button;
}

/** Риси кота на прощанні — як у картці кота (§9.9): прощання рис не відкриває; нічого не відомо — нічого. */
function farewellTraits(state: GameState, entry: AlbumEntry): HTMLElement[] {
  const chips = knownTraitChips(state, entry);
  return chips.length > 0 ? [chipRow(chips)] : [];
}


/**
 * «Мої речі» в телефоні (§8.7): річ — та сама іконка й та сама назва варіанта, що на її картці в магазині (§11.4 «Іконка біля
 * назви»; рішення автора 2026-11-03, «Кожен товар у своїй картці»: назва варіанта стоїть сама, без назви речі над нею).
 */
function myThings(state: GameState, handlers: PhoneHandlers): HTMLElement {
  const shop = element("div", "shop");
  // Що є завжди (§8.4): радіо, комп'ютер і віник — без «Викинути»; куплений пилосос стоїть замість віника й викидається (§8.7).
  const fixtures = (["radio", "computer", ...(state.home.appliances.vacuum === null ? (["broom"] as const) : [])] as const).map((id) => {
    const row = element("div", "shop-row");
    row.append(element("span", "shop-name", named(HOME_FIXTURE_ICONS[id], HOME_FIXTURE_TITLES[id])));
    return row;
  });
  shop.append(...fixtures);
  for (const item of state.home.items) {
    const row = element("div", "shop-row");
    row.append(element("span", "shop-name", variantLabel({ thing: item.kind }, item.quality)));
    row.append(discardButton(() => handlers.discard(item)));
    shop.append(row);
  }
  // Техніка й автогодівниці теж (§8.7): раніше їх тут не було, тож викинути їх не можна було зовсім (перевірка побуту 2026-10-28);
  // переноска й замок на шафку — так само (загальна ревізія 2026-10-29), щоб дешеві можна було замінити дорожчими.
  const { carriers, lock } = state.home;
  const extra: { kind: ThingKind; quality: Quality; thing: DiscardThing }[] = [
    ...carriers.map((c, index) => ({ kind: "carrier" as const, quality: c.quality, thing: { carrier: index } })),
    ...(lock === undefined ? [] : [{ kind: "lock" as const, quality: lock, thing: { owned: "lock" as const } }]),
    ...(["fountain", "robot", "vacuum"] as const).flatMap((a) => {
      const quality = state.home.appliances[a];
      return quality === null ? [] : [{ kind: a, quality, thing: { appliance: a } }];
    }),
    ...(state.home.feeders ?? []).map((f) => ({ kind: "feeder" as const, quality: f.quality, thing: { feeder: f.slot } })),
  ];
  for (const { kind, quality, thing } of extra) {
    const row = element("div", "shop-row");
    row.append(element("span", "shop-name", variantLabel({ thing: kind }, quality)));
    row.append(discardButton(() => handlers.discardThing(thing, quality)));
    shop.append(row);
  }
  return shop;
}


/** «Викинути» (§8.7): кнопка-іконка смітника (гліф 🗑 малює `Overlay`); назва — підказкою й для читача екрана. */
function discardButton(onClick: () => void): HTMLButtonElement {
  const button = element("button", "button discard", "🗑");
  button.title = DISCARD_LABEL;
  button.setAttribute("aria-label", DISCARD_LABEL);
  button.addEventListener("click", onClick);
  return button;
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

/**
 * Назва в картці догляду — без «для котів» наприкінці: картка й так про кота, а інакше «для котів» стояло б у п'яти кнопках із
 * семи (рецензія 2026-11-03, рішення виконавця; `TEXTS.md`, «Догляд»).
 */
const careTitle = (label: string): string => label.replace(/ для котів$/u, "");

/**
 * Догляд за котом на руках біля аптечки (§8.7, §9.5, §9.10, §9.12): ліки, ласощі, котяча м'ята, нашийник. Біля назви кожного
 * запасу — його іконка, як у магазині (§11.4 «Іконка біля назви», `productLabel`): ліки — загальною назвою (скільки є обох
 * варіантів), ласощі й м'ята — назвою варіанта, нашийник — назвою з каталогу (`variantLabel`); усі без «для котів» (`careTitle`).
 */
export function careCard(state: GameState, cat: Cat, onPick: (choice: CareChoice) => void, onCancel: () => void): Card {
  const supply = state.home.supplies;
  const actions: CardAction[] = [];
  for (const m of ["pills", "drops"] as const) {
    if (supplyCount(state, m) > 0) actions.push({ label: `${careTitle(productLabel(m))} ×${supplyCount(state, m)}`, onSelect: () => onPick({ medicine: m }) });
  }
  for (const q of ["premium", "cheap"] as const) {
    if (supply.treats[q] > 0) actions.push({ label: `${careTitle(variantLabel({ product: "treats" }, q))} ×${supply.treats[q]}`, onSelect: () => onPick({ treat: q }) });
  }
  // Котяча м'ята (§9.12): кіт зістрибне з рук — що він із нею робитиме, видно з нього самого.
  for (const q of ["premium", "cheap"] as const) {
    if (supply.catnip[q] > 0) actions.push({ label: `${careTitle(variantLabel({ product: "catnip" }, q))} ×${supply.catnip[q]}`, onSelect: () => onPick({ catnip: q }) });
  }
  if (canPutCollar(state, cat)) actions.push({ label: `${careTitle(variantLabel({ product: "collar" }, "cheap"))} ×${supplyCount(state, "collar")}`, onSelect: () => onPick("collar") });
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

/**
 * Знайда (§8.5, §4.1): взяти кошеня чи віднести в притулок. Біля «притулок» на кнопці — іконка притулку, та сама, що в «Куди
 * поїхати?» (§11.4 «Іконка біля назви»).
 */
export function foundlingCard(onTake: () => void, onShelter: () => void): Card {
  return {
    kicker: "Знайда",
    title: "Кошеня під дверима",
    body: ["Худеньке, тремтить і дивиться так, ніби давно на вас чекало."],
    actions: [
      { label: `Віднести в ${destinationLabel("shelter").toLowerCase()} · 🕐 ${minutesText(MODIFIERS.foundlingShelterMinutes)}`, onSelect: onShelter },
      { label: "Узяти додому", primary: true, onSelect: onTake },
    ],
    steps: true,
  };
}

/** Дзвінок мами (§4.1): відповісти — пів години, не відповісти — здоровий глузд падає. Без котів мама питає про кота, а не про котів. */
export function callCard(cats: boolean, onAnswer: () => void, onIgnore: () => void): Card {
  return {
    kicker: "Телефон",
    title: "Дзвонить мама",
    body: [cats ? CALL_TEXTS.body : CALL_TEXTS.bodyNoCats],
    actions: [
      { label: "Не відповідати", onSelect: onIgnore },
      { label: `Відповісти · 🕐 ${minutesText(MODIFIERS.call.minutes)}`, primary: true, onSelect: onAnswer },
    ],
    steps: true,
  };
}

const LOOK_TITLE = "Який у вас вигляд?";

/** Меню на старті (§4.2): продовжити збережену гру чи почати нову. */
export function titleCard(state: GameState, onContinue: () => void, onNew: () => void): Card {
  const { name } = state.character;
  return {
    solid: true,
    title: "Котоклопіт",
    body: [`${name}, тиждень ${weekOf(state.day)}, ${WEEKDAY_NAMES[weekdayOf(state.day)]}.`],
    actions: [
      { label: "Нова гра", onSelect: onNew },
      { label: "Продовжити", primary: true, onSelect: onContinue },
    ],
    steps: true,
  };
}

/** «Назад» кроку нової гри: ліворуч, не головна дія (`Card.steps`). */
const back = (onSelect: () => void): CardAction => ({ label: "Назад", onSelect });

/** «Далі» кроку нової гри: праворуч, головна дія; вимкнена, поки не обрано варіант. */
const next = (onSelect: () => void, disabled = false): CardAction => ({ label: "Далі", primary: true, disabled, onSelect });

/**
 * Створення персонажа (§5.1), крок 1: зовнішність — портрет на весь зріст і повзунки; портрет змінюється одразу. Редактор один для
 * всіх: будь-які частини в будь-якому поєднанні, без статі. «Випадково» — під повзунками, нова випадкова зовнішність (`shuffle`);
 * з такої редактор і починає. Перший крок — без «Назад».
 */
export function lookCard(start: Look, onDone: (look: Look) => void, shuffle: () => Look): Card {
  const editor = lookEditor(start, shuffle);
  return {
    kicker: "Нова гра · 1 з 5",
    solid: true,
    title: LOOK_TITLE,
    body: [editor.root],
    actions: [next(() => onDone({ ...editor.look }))],
    steps: true,
  };
}

/** Біля шафи (§8.7): той самий редактор поверх гри; хрестик чи Esc — без змін. */
export function wardrobeCard(start: Look, onDone: (look: Look) => void, onCancel: () => void, shuffle: () => Look): Card {
  const editor = lookEditor(start, shuffle);
  return {
    kicker: "Шафа",
    title: LOOK_TITLE,
    body: [editor.root],
    actions: [{ label: "Готово", primary: true, onSelect: () => onDone({ ...editor.look }) }],
    steps: true,
    closable: true,
    onDismiss: onCancel,
  };
}

/**
 * Редактор зовнішності (§5.1): портрет і повзунки рядів гардеробу; `look` — те, що обрано зараз. Повзунок іде лише доступними
 * варіантами (`rowChoices`), ряд, що не діє, — вимкнений і підписаний чому. Рядів більше, ніж уміщує картка (`LOOK_PAGE`), —
 * вкладки (тіло, волосся, верх, низ, взуття) з короткими підписами, а «Випадково» — у їхньому рядку: на телефоні набік під
 * повзунками йому місця вже немає. Будь-яка зміна показує всі ряди заново: від зачіски залежить акцент, від фасону — візерунок
 * і низ.
 */
function lookEditor(start: Look, shuffle: () => Look): { root: HTMLElement; look: Look } {
  const look: Look = { ...start };
  const editor = element("div", "look-editor");
  const canvas = portraitCanvas(130, 220);
  const redraw = (): void => drawPortrait(canvas, look);
  redraw();
  const sliders = element("div", "look-sliders");
  const rows = LOOK_OPTIONS.filter(shownRow);
  const paged = rows.length > LOOK_PAGE;
  const tabs = (Object.keys(LOOK_TABS) as LookTab[]).filter((id) => rows.some((row) => row.tab === id));
  let tab: LookTab = tabs[0] ?? "body";
  const shows: (() => void)[] = [];
  const showAll = (): void => {
    for (const show of shows) show();
  };
  const changed = (): void => {
    showAll();
    redraw();
  };
  for (const row of rows) shows.push(lookRow(row, paged ? row.short : row.label, look, sliders, () => paged && row.tab !== tab, changed));
  showAll();
  const random = element("button", "button look-random", "Випадково");
  random.addEventListener("click", () => {
    Object.assign(look, shuffle());
    changed();
  });
  const side = element("div", "look-side");
  if (paged) {
    const bar = element("div", "look-bar");
    const list = element("div", "card-tabs look-tabs");
    list.setAttribute("role", "tablist");
    const buttons = tabs.map((id) => {
      const button = element("button", "card-tab", LOOK_TABS[id]);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => {
        tab = id;
        mark();
        showAll();
      });
      return button;
    });
    const mark = (): void =>
      buttons.forEach((button, i) => {
        button.classList.toggle("active", tabs[i] === tab);
        button.setAttribute("aria-selected", String(tabs[i] === tab));
      });
    mark();
    list.append(...buttons);
    bar.append(list, random);
    side.append(bar, sliders);
  } else side.append(sliders, random);
  editor.append(canvas, side);
  return { root: editor, look };
}

/**
 * Ряд редактора в `parent`: підпис, назва варіанта (чи чому ряд не діє) і повзунок доступними варіантами. Повертає, як
 * показати ряд за поточним виглядом; `hidden` — ряд на іншій вкладці, `changed` — гравець вибрав інший варіант.
 */
function lookRow(row: LookRow, label: string, look: Look, parent: HTMLElement, hidden: () => boolean, changed: () => void): () => void {
  const el = element("label", "look-row");
  const value = element("span", "look-value");
  const slider = element("input");
  slider.type = "range";
  slider.min = "0";
  slider.step = "1";
  slider.className = "look-slider";
  let choices: number[] = [];
  slider.addEventListener("input", () => {
    look[row.key] = choices[Number(slider.value)] ?? 0;
    changed();
  });
  const head = element("span", "look-head");
  head.append(element("span", "look-label", label), value);
  el.append(head, slider);
  parent.append(el);
  return () => {
    const wear = wearOf(look);
    const off = row.off?.(wear) ?? null;
    choices = rowChoices(row, wear);
    slider.max = String(Math.max(0, choices.length - 1));
    slider.value = String(Math.max(0, choices.indexOf(wear[row.key])));
    slider.disabled = off !== null || choices.length < 2;
    value.textContent = off ?? row.options[wear[row.key]] ?? "";
    el.classList.toggle("off", off !== null);
    el.hidden = hidden();
  };
}

/** Крок 2: звертання «він / вона» (§5.1). Над вибором — портрет щойно складеної зовнішності; поки не обрано, «Далі» вимкнене. */
export function addressCard(look: Look, chosen: Address | null, onChoose: (address: Address) => void, onNext: (address: Address) => void, onBack: () => void): Card {
  const canvas = portraitCanvas(90, 150);
  canvas.classList.add("address-portrait");
  drawPortrait(canvas, look);
  return {
    kicker: "Нова гра · 2 з 5",
    solid: true,
    title: ADDRESS_TEXTS.title,
    body: [canvas],
    choices: (["he", "she"] as const).map((address) => ({ label: ADDRESS_TEXTS.options[address], chosen: address === chosen, onSelect: () => onChoose(address) })),
    actions: [back(onBack), next(() => chosen && onNext(chosen), chosen === null)],
    steps: true,
    onDismiss: onBack,
  };
}

/**
 * Крок 3: сова чи жайворонок (§5.1) — незалежно від звертання; без пояснень, лише вибір. Спершу обрано жайворонка, як і без
 * вибору; повернувшись «Назад», гравець бачить свій.
 */
export function chronotypeCard(chosen: Chronotype, onChoose: (chronotype: Chronotype) => void, onNext: () => void, onBack: () => void): Card {
  return {
    kicker: "Нова гра · 3 з 5",
    solid: true,
    title: "Сова чи жайворонок?",
    body: [],
    choices: [
      { label: "Жайворонок", chosen: chosen === "lark", onSelect: () => onChoose("lark") },
      { label: "Сова", chosen: chosen === "owl", onSelect: () => onChoose("owl") },
    ],
    actions: [back(onBack), next(onNext)],
    steps: true,
    onDismiss: onBack,
  };
}

/** Що гравець лишив у полі кроку «Ім'я» («Далі» чи «Назад») і з яким звертанням. */
export interface EnteredName {
  readonly name: string;
  readonly address: Address;
}

/**
 * Ім'я, з яким відкривається крок «Ім'я»: власне ім'я гравця лишається, хоч би яке звертання він потім обрав, а ім'я за
 * замовчуванням («Тарас», «Марта») — за звертанням, щоб узгоджувалося з текстами (§5.1). За замовчуванням — лише те, що гравець
 * лишив незмінним за свого звертання: «Марта», яку він сам увів для «він», — теж власне ім'я.
 */
export function startName(address: Address, entered: EnteredName | null): string {
  if (entered === null) return DEFAULT_NAME[address];
  const own = entered.name.trim();
  return own !== "" && own !== DEFAULT_NAME[entered.address] ? own : DEFAULT_NAME[address];
}

/**
 * Крок 4: ім'я героя; заголовок — за звертанням. Поруч із полем — «Випадково» (`shuffle` дає інше ім'я за звертанням). «Назад»
 * віддає введене, щоб, повернувшись, гравець побачив його знову.
 */
export function nameCard(address: Address, start: string, onDone: (name: string) => void, onBack: (name: string) => void, shuffle: (current: string) => string): Card {
  const input = element("input");
  input.type = "text";
  input.value = start;
  input.maxLength = NAME_MAX_LENGTH;
  input.className = "button name-input";
  input.setAttribute("aria-label", "Ім'я");
  const random = element("button", "button", "Випадково");
  random.addEventListener("click", () => {
    input.value = shuffle(input.value);
  });
  const row = element("div", "name-row");
  row.append(input, random);
  return {
    kicker: "Нова гра · 4 з 5",
    solid: true,
    title: address === "she" ? "Як її звати?" : "Як його звати?",
    body: [row],
    actions: [back(() => onBack(input.value)), next(() => onDone(input.value))],
    steps: true,
    onDismiss: () => onBack(input.value),
  };
}

const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard", "ukro"];

/** Створення персонажа (§5.2), крок 5: складність; спершу обрано середню. Останній крок — «Почати гру» замість «Далі». */
export function difficultyCard(chosen: Difficulty, onChoose: (difficulty: Difficulty) => void, onStart: () => void, onBack: () => void): Card {
  return {
    kicker: "Нова гра · 5 з 5",
    solid: true,
    title: "Складність",
    body: [],
    choices: DIFFICULTIES.map((difficulty) => ({ label: DIFFICULTY_TITLES[difficulty], chosen: difficulty === chosen, onSelect: () => onChoose(difficulty) })),
    actions: [back(onBack), { label: "Почати гру", primary: true, onSelect: onStart }],
    steps: true,
    onDismiss: onBack,
  };
}
