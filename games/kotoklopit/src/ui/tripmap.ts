// «Куди поїхати?» — паперова мапа міста (§8.5 «Оформлення поїздок»): де стоять дім і шпильки пунктів. Чисті розрахунки без DOM
// (`tests/tripmap.test.ts`); малює `destinationCard` (`trips.ts`), вигляд — `tripmap.css`.
//
// Одиниця мапи — сота частка її ширини (`cqw` у `tripmap.css`), тож мапа з усім, що на ній, масштабується як малюнок: шпильки,
// що не перекриваються тут, не перекриваються на жодному екрані. Розміри шпильки звідси ж ставить на мапу `destinationCard`.

import type { Destination } from "../sim/types";
import { DESTINATION_TITLES } from "./titles";

/** Розміри мапи й шпильки в одиницях мапи (ширина мапи — 100). */
export const TRIP_MAP = {
  /** Висота мапи: вона вміщується на телефоні набік разом із заголовком картки. */
  height: 38,
  /** Дім — коло посередині. */
  home: { x: 50, y: 19, size: 7 },
  pin: {
    /** Висота шпильки: назва й два рядки часу. */
    height: 7.5,
    /** Голівка — коло з іконкою пункту; від краю шпильки до неї — `inset`. */
    head: 5,
    inset: 0.3,
    /** Табличка з назвою заходить під голівку на `tuck`; усе, крім тексту, — `chrome` завширшки. */
    tuck: 1.2,
    chrome: 7.1,
    /** Кегль назви й часу. */
    name: 2.2,
    time: 1.65,
  },
  /** Відстань від дому до голівки: найкоротша дорога — `near`, найдовша — `far`. */
  near: 12,
  far: 33.5,
  /** Найменші проміжки: між шпильками (і домом) і від шпильки до краю мапи. */
  gap: 1,
  edge: 0.6,
} as const;

/**
 * Ширина тексту в кеглях — з запасом: літера назви рукописним шрифтом ≤ 0,52 кегля, а найдовший рядок часу «🕐 ~1 год 30 хв»
 * системним шрифтом — 7,1 кегля у Windows (на телефоні шрифт інший, тож запас більший). Шпилька ширша за цю оцінку не стане:
 * `tripmap.css` обмежує її ширину нею ж і обрізає текст, що не вмістився.
 */
const NAME_EM_PER_CHAR = 0.52;
const TIME_EM = 7.8;

/**
 * Напрямок кожного пункту від дому, градуси проти годинникової стрілки від «на схід», і бік таблички з назвою: `east` — праворуч від
 * голівки, `west` — ліворуч. Сталі, щоб гравець запам'ятав мапу; табличка — від дому, щоб дорога не йшла під нею. Підібрано так, щоб
 * шпильки, дім і дороги не налазили одне на одне, коли видно всі вісім пунктів (`tests/tripmap.test.ts`), — тож і коли частини немає.
 */
const DIRECTIONS: Record<Destination, { deg: number; side: PinSide }> = {
  shop: { deg: 90, side: "east" },
  show: { deg: 20, side: "east" },
  vet: { deg: -10, side: "east" },
  shelter: { deg: -40, side: "east" },
  groomer: { deg: -90, side: "west" },
  breeder: { deg: -160, side: "west" },
  doctor: { deg: 170, side: "west" },
  office: { deg: 135, side: "west" },
};

export type PinSide = "east" | "west";

/** Прямокутник в одиницях мапи. */
export interface MapBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MapPin {
  /** Центр голівки — кінець дороги від дому. */
  x: number;
  y: number;
  side: PinSide;
  /** Найбільша ширина шпильки (`--pin-w` у `tripmap.css`). */
  width: number;
  /** Уся шпилька: голівка й табличка. */
  box: MapBox;
  /** Дорога від дому: довжина й кут за годинниковою стрілкою від «на схід» (як `rotate` у CSS). */
  road: { length: number; angle: number };
}

/** Найбільша ширина шпильки пункту. */
export function pinWidth(destination: Destination): number {
  const { name, time, chrome } = TRIP_MAP.pin;
  return Math.max(DESTINATION_TITLES[destination].length * NAME_EM_PER_CHAR * name, TIME_EM * time) + chrome;
}

/**
 * Шпильки всіх пунктів на мапі за часом дороги до кожного (`roadMinutes`): що довша дорога, то далі від дому, — від `near` до `far`
 * між найкоротшою й найдовшою з `roads`. Подія дня змінює всі дороги в те саме число разів, тож мапа щодня та сама. Шпилька
 * пункту не залежить від того, які ще пункти видно.
 */
export function tripMapLayout(roads: Readonly<Record<Destination, number>>): Record<Destination, MapPin> {
  const values = Object.values(roads);
  const shortest = Math.min(...values);
  const span = Math.max(...values) - shortest;
  const { home, pin, near, far } = TRIP_MAP;
  const reach = (head: number): number => pin.inset + pin.head / 2 + head;
  return Object.fromEntries(
    (Object.keys(DIRECTIONS) as Destination[]).map((destination) => {
      const { deg, side } = DIRECTIONS[destination];
      const share = span > 0 ? (roads[destination] - shortest) / span : 0;
      const length = near + share * (far - near);
      const rad = (deg * Math.PI) / 180;
      const x = home.x + length * Math.cos(rad);
      const y = home.y - length * Math.sin(rad);
      const width = pinWidth(destination);
      const x0 = side === "east" ? x - reach(0) : x + reach(0) - width;
      const box = { x0, y0: y - pin.height / 2, x1: x0 + width, y1: y + pin.height / 2 };
      return [destination, { x, y, side, width, box, road: { length, angle: -deg } }];
    }),
  ) as Record<Destination, MapPin>;
}

/** Дім на мапі — квадрат довкола кола. */
export function homeBox(): MapBox {
  const { x, y, size } = TRIP_MAP.home;
  return { x0: x - size / 2, y0: y - size / 2, x1: x + size / 2, y1: y + size / 2 };
}
