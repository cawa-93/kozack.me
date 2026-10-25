// Породи котів (§9.11, `BREEDS.md`): риси породи, схильності до хвороб і особливості зовнішності.

import type { Rng } from "./rng";
import type { GameState, Genes, Shape } from "./types";

export interface Breed {
  id: string;
  name: string;
  /** Риси породи: група рис (чи "size") → напрям «+» або «−». */
  traits: Readonly<Record<string, 1 | -1>>;
  /** Схильності до хвороб (`DISEASES.md`): органи, назви попередні. */
  risks: readonly string[];
  /** Гени, що задає порода (§9.11): пари алелів, які чистокровний кіт має напевно. */
  genes?: Partial<Omit<Genes, "orange">>;
  /** Порода не буває рудою (суцільні сірі, чорні, шоколадні). */
  noOrange?: true;
  /** Форми, що задає порода (§9.10). */
  shape?: Partial<Shape>;
}

export const MIXED = "mixed";

export const BREEDS: readonly Breed[] = [
  { id: MIXED, name: "Безпородний", traits: { hardiness: 1, longevity: 1 }, risks: [] },
  // Згенеровано з `BREEDS.md`: зовнішність — гени й форми §9.10.
  { id: "meinkun", name: "Мейнкун", traits: { size: 1, sociability: 1, longevity: -1 }, risks: ["серце", "суглоби"], genes: { short: [false, false], full: [true, true] }, shape: { ears: "tufted", tail: "fluffy", build: "stocky" } },
  { id: "norvezka-lisova", name: "Норвезька лісова", traits: { size: 1, climbing: 1, affection: -1 }, risks: [], genes: { short: [false, false] }, shape: { ears: "tufted", tail: "fluffy", build: "stocky" } },
  { id: "perska", name: "Перська", traits: { energy: -1, shedding: 1, affection: 1 }, risks: ["дихання", "нирки", "очі"], genes: { short: [false, false] }, shape: { muzzle: "flat", build: "stocky" } },
  { id: "himalaiska", name: "Гімалайська", traits: { energy: -1, shedding: 1, affection: 1 }, risks: ["дихання", "нирки", "очі"], genes: { short: [false, false], full: [false, false] }, shape: { muzzle: "flat", build: "stocky" } },
  { id: "rahdol", name: "Рагдол", traits: { size: 1, affection: 1, energy: -1 }, risks: ["серце"], genes: { short: [false, false], full: [false, false], white: [1, 0] }, shape: { build: "stocky" } },
  { id: "birmanska", name: "Бірманська", traits: { affection: 1, sociability: 1, talkative: -1 }, risks: [], genes: { short: [false, false], full: [false, false], white: [1, 0] } },
  { id: "balineziiska", name: "Балінезійська", traits: { talkative: 1, affection: 1, energy: 1 }, risks: ["зуби"], genes: { short: [false, false], full: [false, false] }, shape: { muzzle: "long", ears: "large", build: "slim" } },
  { id: "somali", name: "Сомалі", traits: { energy: 1, climbing: 1, curiosity: 1 }, risks: ["нирки", "зуби"], genes: { short: [false, false], tabby: [3, 3], agouti: [true, true], white: [2, 2] }, shape: { ears: "large", tail: "fluffy" } },
  { id: "turetska-anhora", name: "Турецька ангора", traits: { energy: 1, curiosity: 1, sociability: 1 }, risks: [], genes: { short: [false, false], white: [2, 2] }, shape: { ears: "large", tail: "fluffy", build: "slim" } },
  { id: "turetskyi-van", name: "Турецький ван", traits: { water: 1, energy: 1, affection: -1 }, risks: [], genes: { short: [false, false], white: [2, 2] }, shape: { build: "stocky" } },
  { id: "nebelunh", name: "Небелунг", traits: { bravery: -1, affection: 1, talkative: -1 }, risks: [], genes: { short: [false, false], agouti: [false, false], dense: [false, false], black: [true, true], eyes: 0 }, noOrange: true },
  { id: "brytanska-korotkoshersta", name: "Британська короткошерста", traits: { energy: -1, affection: -1, appetite: 1 }, risks: ["серце", "ожиріння"], genes: { agouti: [false, false], dense: [false, false], black: [true, true] }, noOrange: true, shape: { build: "stocky" } },
  { id: "shotlandska-vyslovukha", name: "Шотландська висловуха", traits: { energy: -1, affection: 1 }, risks: ["суглоби"], shape: { ears: "folded", build: "stocky" } },
  { id: "shartrez", name: "Шартрез", traits: { talkative: -1, size: 1, affection: 1 }, risks: [], genes: { agouti: [false, false], dense: [false, false], black: [true, true], eyes: 2 }, noOrange: true, shape: { build: "stocky" } },
  { id: "korat", name: "Корат", traits: { affection: 1, bravery: -1, size: -1 }, risks: [], genes: { agouti: [false, false], dense: [false, false], black: [true, true], eyes: 0 }, noOrange: true },
  { id: "bombeiska", name: "Бомбейська", traits: { affection: 1, appetite: 1, sociability: 1 }, risks: [], genes: { agouti: [false, false], dense: [true, true], black: [true, true], eyes: 2 }, noOrange: true },
  { id: "havana", name: "Гавана", traits: { curiosity: 1, affection: 1 }, risks: [], genes: { agouti: [false, false], dense: [true, true], black: [false, false], eyes: 0 }, noOrange: true },
  { id: "burmanska", name: "Бурманська", traits: { affection: 1, sociability: 1, talkative: 1 }, risks: ["діабет"], genes: { agouti: [false, false], dense: [true, true], black: [false, false], eyes: 1 }, noOrange: true, shape: { build: "stocky" } },
  { id: "tonkinska", name: "Тонкінська", traits: { energy: 1, sociability: 1, talkative: 1 }, risks: [], genes: { full: [false, false] } },
  { id: "amerykanska-korotkoshersta", name: "Американська короткошерста", traits: { longevity: 1, appetite: 1, bravery: 1 }, risks: [], genes: { short: [true, true], tabby: [0, 0] }, shape: { build: "stocky" } },
  { id: "ievropeiska-korotkoshersta", name: "Європейська короткошерста", traits: { bravery: 1, affection: -1, hardiness: 1 }, risks: [], genes: { short: [true, true] } },
  { id: "abissynska", name: "Абіссинська", traits: { energy: 1, climbing: 1, affection: -1 }, risks: ["нирки", "зуби"], genes: { tabby: [3, 3], agouti: [true, true], white: [2, 2] }, shape: { ears: "large", build: "slim" } },
  { id: "sinhapura", name: "Сінгапура", traits: { size: -1, curiosity: 1, affection: 1 }, risks: [], genes: { tabby: [3, 3], agouti: [true, true] }, shape: { ears: "large" } },
  { id: "iehypetska-mau", name: "Єгипетська мау", traits: { energy: 1, bravery: -1 }, risks: [], genes: { tabby: [2, 2], agouti: [true, true], eyes: 0 }, shape: { build: "slim" } },
  { id: "otsyket", name: "Оцикет", traits: { energy: 1, sociability: 1, curiosity: 1 }, risks: [], genes: { tabby: [2, 2], agouti: [true, true] }, shape: { build: "stocky" } },
  { id: "toiher", name: "Тойгер", traits: { energy: 1, affection: 1 }, risks: [], genes: { tabby: [1, 1], agouti: [true, true] }, shape: { build: "stocky" } },
  { id: "snou-shu", name: "Сноу-шу", traits: { talkative: 1, affection: 1, water: 1 }, risks: [], genes: { full: [false, false], white: [1, 0] } },
  { id: "siamska", name: "Сіамська", traits: { talkative: 1, affection: 1, longevity: 1 }, risks: ["зуби", "дихання"], genes: { full: [false, false] }, shape: { muzzle: "long", ears: "large", build: "slim" } },
  { id: "oriientalna-korotkoshersta", name: "Орієнтальна короткошерста", traits: { talkative: 1, energy: 1, affection: 1 }, risks: ["зуби"], genes: { full: [true, true], eyes: 0 }, shape: { muzzle: "long", ears: "large", build: "slim" } },
  { id: "sfinks", name: "Сфінкс", traits: { affection: 1, warmth: 1, shedding: -1 }, risks: ["шкіра", "серце"], shape: { ears: "large", build: "stocky", coat: "hairless" } },
  { id: "ukrainska-levkoia", name: "Українська левкоя", traits: { affection: 1, sociability: 1, warmth: 1 }, risks: ["шкіра"], shape: { muzzle: "long", ears: "folded", build: "slim", coat: "hairless" } },
  { id: "devon-reks", name: "Девон-рекс", traits: { curiosity: 1, climbing: 1, affection: 1 }, risks: [], shape: { ears: "large", build: "slim", coat: "curly" } },
  { id: "kornish-reks", name: "Корніш-рекс", traits: { energy: 1, climbing: 1, warmth: 1 }, risks: [], shape: { muzzle: "long", ears: "large", build: "slim", coat: "curly" } },
  { id: "selkirk-reks", name: "Селкірк-рекс", traits: { energy: -1, affection: 1, shedding: 1 }, risks: [], shape: { build: "stocky", coat: "curly" } },
  { id: "laperm", name: "Лаперм", traits: { affection: 1, curiosity: 1 }, risks: [], shape: { coat: "curly" } },
  { id: "amerykanskyi-kerl", name: "Американський керл", traits: { curiosity: 1, energy: 1 }, risks: [], shape: { ears: "curled" } },
  { id: "menks", name: "Менкс", traits: { energy: 1, climbing: 1 }, risks: ["хребет"], shape: { tail: "none", build: "stocky" } },
  { id: "iaponskyi-bobteil", name: "Японський бобтейл", traits: { energy: 1, talkative: 1, water: 1 }, risks: [], shape: { tail: "bobtail", build: "slim" } },
  { id: "amerykanskyi-bobteil", name: "Американський бобтейл", traits: { sociability: 1, bravery: 1 }, risks: [], shape: { tail: "bobtail", build: "stocky" } },
  { id: "manchkin", name: "Манчкін", traits: { climbing: -1, energy: 1, curiosity: 1 }, risks: ["хребет", "суглоби"], shape: { legs: "short" } },
  { id: "benhalska", name: "Бенгальська", traits: { energy: 1, water: 1, climbing: 1 }, risks: ["серце"], genes: { short: [true, true], tabby: [2, 2], agouti: [true, true] }, shape: { build: "stocky" } },
  { id: "savanna", name: "Саванна", traits: { size: 1, energy: 1, climbing: 1 }, risks: [], genes: { tabby: [2, 2], agouti: [true, true] }, shape: { ears: "large", build: "slim" } },
];

/** Справжні породи — без безпородних. */
export const PUREBREEDS: readonly Breed[] = BREEDS.filter((b) => b.id !== MIXED);

/**
 * Ціна кошеняти в розпліднику (§8.5, §9.11): від 400 до 800 за рідкісністю — звичайні 500,
 * колорпойнт і незвичні форми дорожчі, гібриди найдорожчі (чернетка).
 */
export function breederPrice(breed: Breed): number {
  if (breed.id === "benhalska" || breed.id === "savanna") return 800;
  const shape = breed.shape ?? {};
  if (shape.coat || shape.legs === "short" || shape.tail === "none" || shape.ears === "folded" || shape.ears === "curled") return 700;
  if (breed.genes?.full?.[0] === false) return 600;
  return breed.traits["size"] ? 550 : 450;
}

const BY_ID = new Map(BREEDS.map((b) => [b.id, b]));

export function breedById(id: string): Breed {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Немає породи «${id}»`);
  return found;
}

/**
 * Рівень породної риси (§9.11): чистокровний ±2, кожна половина суміші ±1, половинки додаються.
 * Безпородний ніколи не чистокровний: обидві половинки «безпородний» дають лише ±1.
 */
export function breedLevel(breed: readonly [string, string], group: string): number {
  const [a, b] = breed;
  const direction = (id: string): number => breedById(id).traits[group] ?? 0;
  if (a === MIXED && b === MIXED) return direction(MIXED);
  return direction(a) + direction(b);
}

/** Чистокровний: дві однакові справжні породи (§9.11). */
export function isPurebred(breed: readonly [string, string]): boolean {
  return breed[0] === breed[1] && breed[0] !== MIXED;
}

/** Що видно про породу (§9.11): легка — усе, середня — чистокровна повністю, напівкровка — половина; важка — нічого. */
export function knownBreedHalves(state: GameState, breed: readonly [string, string], rng: Rng): [boolean, boolean] {
  if (state.difficulty === "easy") return [true, true];
  if (state.difficulty === "hard") return [false, false];
  if (breed[0] === breed[1]) return [true, true];
  const first = rng.chance(0.5);
  return [first, !first];
}
