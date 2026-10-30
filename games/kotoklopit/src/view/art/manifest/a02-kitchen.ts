// Маніфест пакета A2 «Кухня» (крок 16, GRAPHICS_PLAN.md, «Хвиля 2»): холодильник (5 станів заповнення, відчинений,
// судочки), стільниці, плита (сире, готується, готове, пригоріло), смітник (стоїть і перекинутий), стіл, шафка з кормом
// (відчинена, 5 станів; замок — `item/lock/*` пакета A5 на її дверцятах).
//
// Усі речі кухні стоять у ряду 1 під задньою стіною y = 0 (шафка — біля правої передньої стіни x = 19): лицьова грань —
// та, що до кімнати, тобто грань y + 1 (на екрані — ліворуч донизу). Шафка й смітник стоять так, що їхні «справжні»
// дверцята дивилися б від камери, — дверцята малюємо на видній грані.
//
// Наповнення сховищ (§6.4, `src/sim/storage.ts`) — окремі накладки `env/<річ>/<запас>` у тому самому полотні й з тим
// самим pivot, що річ: їх ставлять у ту саму точку поверх речі. Стан `full-N` — `fillStage` 0–4: 0 — порожньо, 1 — мало,
// 2 — половина, 3 — багато, 4 — ущерть (як `storagelook.ts`). Що видно в кожному стані — таблиця «Наповнення сховищ»
// §6.4: холодильник із наповненням 0 відчинений (`iso/looks.ts`), тож `full-0` лягає на `open`, а `full-1`…`full-4` — на
// `closed`; пакет корму стоїть на кришці шафки й однаково лягає і на зачинену, і на відчинену котом.

import { objectById, TRINKETS } from "../../../sim/home";
import type { ArtEntry } from "../types";
import { drawn, furniture } from "./lib/geometry";

/** Стани наповнення сховища (`FillStage` 0–4). */
const FULL = ["full-0", "full-1", "full-2", "full-3", "full-4"] as const;

const fridge = objectById("fridge");
const counterLeft = objectById("counter-left");
const stove = objectById("stove");
const counterRight = objectById("counter-right");
const trash = objectById("trash");
const table = objectById("table");
const cabinet = objectById("cat-cabinet");

/** Висота стільниці (контракт: ≈ 62) і стола (≈ 54). */
const COUNTER = 62;
const TABLE = 54;

/** Холодильник — еталон F1a (`art/env/fridge.svg`): полотно під відчинені дверцята, pivot — підлога під центром сліду. */
const FRIDGE = drawn(fridge, { size: { w: 192, h: 224 }, pivot: { x: 124, y: 188 } });
const COUNTER_LEFT = furniture(counterLeft, { top: COUNTER });
const STOVE = furniture(stove, { top: COUNTER, tall: 84 });
const COUNTER_RIGHT = furniture(counterRight, { top: COUNTER });
const TRASH = furniture(trash, { top: 46, pad: { left: 40, bottom: 28 } });
const TABLE_BOX = furniture(table, { top: TABLE });
const CABINET = furniture(cabinet, { top: 80, pad: { left: 48, bottom: 24 } });

/** Де на речі лежить дрібничка зі столу (`TRINKETS[].at` — частка ширини, посередині глибини). */
const trinketAt = (kind: "mug" | "phone" | "pen"): number => TRINKETS.find((t) => t.kind === kind)?.at ?? 0.5;

export const MANIFEST: readonly ArtEntry[] = [
  // Холодильник (§6.4, сховище продуктів і маминих судочків) заввишки 150: на нього вилазять коти (`top`), з-під нього
  // визирає загнана іграшка. `open` — відчинений (еталон F1a: світло й їжа всередині; порожнім і темним його робить
  // накладка `full-0`); дверцята відчиняються до кімнати, тож полотно має запас ліворуч і донизу.
  { id: "env/fridge", ...FRIDGE.geometry, points: { top: FRIDGE.at(0.5, 0.5, 150) }, states: ["closed", "open"] },
  // Накладка холодильника «продукти» (§6.4): 0 — на відчиненому: нутро темне (вимкнений), полиці й дверцята порожні
  // (закриває їжу еталона `open`); 1–4 — на зачиненому: зелений вогник, банка огірків зверху (від 2), хлібина (від 3);
  // ущерть (4) — ще й роздуті боки й морква з ковбасою, що стирчать із дверцят.
  { id: "env/fridge/food", ...FRIDGE.geometry, states: FULL },
  // Накладка «мамині судочки» (§6.4, рішення автора 2026-10-26): судочок із синьою кришкою зверху холодильника біля
  // переднього кута, поки вони є (холодильник тоді зачинений).
  { id: "env/fridge/mom-meal", ...FRIDGE.geometry },
  // Ліва стільниця (між холодильником і плитою) заввишки 62: синій корпус, дерев'яна стільниця, рушник на шухляді; на ній
  // лежить страва (`dish`) і телефон (`phone`, §9.12 «Скидання речей»).
  {
    id: "env/counter-left",
    ...COUNTER_LEFT.geometry,
    points: { dish: COUNTER_LEFT.at(0.4, 0.5, COUNTER), phone: COUNTER_LEFT.at(trinketAt("phone"), 0.5, COUNTER) },
  },
  // Плита (§8.7: готує сама) — стільниця з конфорками й задньою панеллю з ручками (до 84). Страву на плиті показує сама
  // плита — сковорода з вмістом посередині плити, а не `item/dish/*`: `off` — порожня й холодна, `raw` — сире (рожеве),
  // `cooking` — під кришкою, `ready` — золотаве смажене (і мамин судочок, що гріється), `burnt` — чорні вуглинки; у всіх,
  // крім `off`, під сковородою полум'я й горить вогник на панелі (плита гріє, доки не пригорить). Пара й дим, що
  // підіймаються, — `fx/steam` і `fx/smoke` з точки `pan` — середини сковороди (центр плити на висоті стільниці).
  {
    id: "env/stove",
    ...STOVE.geometry,
    points: { pan: STOVE.at(0.5, 0.5, COUNTER) },
    states: ["off", "raw", "cooking", "ready", "burnt"],
  },
  // Права стільниця 2 × 1 між плитою й смітником: на ній лежить страва (`dish`; середина вільна), біля стіни праворуч —
  // глечик із ложками й вазон.
  { id: "env/counter-right", ...COUNTER_RIGHT.geometry, points: { dish: COUNTER_RIGHT.at(0.5, 0.5, COUNTER) } },
  // Смітник із педаллю заввишки 46 (§8.7: туди викидають пригоріле) — металеве відро, контур `LINE_SMALL` (річ менша за
  // 60). `tipped` — лежить на боці отвором до кімнати, кришка відлетіла (§9.12, «Кмітливість у бешкеті»), поки сміття
  // (`mess/garbage`) не прибрали; тому полотно має запас ліворуч і донизу.
  { id: "env/trash", ...TRASH.geometry, states: ["standing", "tipped"] },
  // Кухонний стіл 2 × 1 заввишки 54: на ньому лежить страва (`dish`) і стоїть кухоль (`mug`, §9.12 «Скидання речей»).
  {
    id: "env/table",
    ...TABLE_BOX.geometry,
    points: { dish: TABLE_BOX.at(0.4, 0.5, TABLE), mug: TABLE_BOX.at(trinketAt("mug"), 0.5, TABLE) },
  },
  // Шафка з котячим кормом (§6.4, §9.12 «Кмітливість у бешкеті») заввишки 80: дві дверцята з лапкою й рибкою. `open` —
  // відчинив кіт: праві дверцята розчахнуті, всередині темно (полотно з запасом під дверцята). Замок `item/lock/<якість>`
  // висить на стику дверцят (`lock`), а на відчиненій — на лівих (`lock-open`).
  {
    id: "env/cat-cabinet",
    ...CABINET.geometry,
    points: { lock: CABINET.at(0.5, 1, 44), "lock-open": CABINET.at(0.25, 1, 44), top: CABINET.at(0.5, 0.5, 80) },
    states: ["closed", "open"],
  },
  // Накладка шафки «котячий корм» (§6.4): пакет корму зверху, що росте з наповненням; ущерть — ще й гранули довкола.
  { id: "env/cat-cabinet/cat-food", ...CABINET.geometry, states: FULL },
];
