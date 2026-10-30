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
// 2 — половина, 3 — багато, 4 — ущерть (як `storagelook.ts`).

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
  // визирає загнана іграшка. `open` — прочинений і темний усередині (порожній, як у старому вигляді, чи щойно взяли їжу);
  // дверцята відчиняються до кімнати, тож полотно має запас ліворуч і донизу.
  { id: "env/fridge", ...FRIDGE.geometry, points: { top: FRIDGE.at(0.5, 0.5, 150) }, states: ["closed", "open"] },
  // Накладка холодильника «продукти» (§6.4): що видно зовні — зелений вогник, банка зверху (від 2), хлібина (від 3);
  // ущерть (4) — роздуті боки й їжа, що стирчить із дверцят; 0 — нічого (порожнечу показує `open`).
  { id: "env/fridge/food", ...FRIDGE.geometry, states: FULL },
  // Накладка «мамині судочки» (§6.4, рішення автора 2026-10-26): судочок зверху холодильника, поки вони є.
  { id: "env/fridge/mom-meal", ...FRIDGE.geometry },
  // Ліва стільниця (між холодильником і плитою) заввишки 62: на ній лежить страва (`dish`) і телефон (`phone`, §9.12
  // «Скидання речей»).
  {
    id: "env/counter-left",
    ...COUNTER_LEFT.geometry,
    points: { dish: COUNTER_LEFT.at(0.4, 0.5, COUNTER), phone: COUNTER_LEFT.at(trinketAt("phone"), 0.5, COUNTER) },
  },
  // Плита (§8.7: готує сама) — стільниця з конфорками й задньою панеллю з ручками (до 84). Страву на плиті показує сама
  // плита — сковорода з вмістом, а не `item/dish/*`: `off` — порожня й холодна, `raw` — щойно поклали сире, `cooking` —
  // вариться, пара, `ready` — готове (і мамин судочок, що гріється), `burnt` — пригоріле, чорне, з димом (дим, що
  // підіймається, — `fx/smoke`). `pan` — де сковорода.
  { id: "env/stove", ...STOVE.geometry, points: { pan: STOVE.at(0.5, 0.5, COUNTER) }, states: ["off", "raw", "cooking", "ready", "burnt"] },
  // Права стільниця 2 × 1 між плитою й смітником: на ній лежить страва.
  { id: "env/counter-right", ...COUNTER_RIGHT.geometry, points: { dish: COUNTER_RIGHT.at(0.5, 0.5, COUNTER) } },
  // Смітник із педаллю заввишки 46 (§8.7: туди викидають пригоріле). `tipped` — лежить на боці кришкою вперед (§9.12,
  // «Кмітливість у бешкеті»), поки сміття (`mess/garbage`) не прибрали; тому полотно має запас ліворуч і донизу.
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
