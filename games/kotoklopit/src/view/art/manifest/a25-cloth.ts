// Маніфест гардероба «Візерунки» (`WARDROBE.md`, «Візерунки»; `art/STYLE.md`, «cloth»): плитки й принти тканини, якими
// компонувальник вкриває заливку верху чи низу персонажа (`cloth.ts`, `compose.ts`). Реєстр — `PATTERNS`
// (`src/view/wardrobe/patterns.ts`).
//
// Плитка — один період візерунка край у край, pivot — кут (0, 0): компонувальник кладе її від pivot частини, тож у всіх
// станах і ракурсах вона та сама. Принт — малюнок із полем 4, pivot — центр: стає в точку `print` торса чи `cuff` рукава
// (`a10-person.ts`). Шари: `fill` — біла маска другого тону (тон у тон чи контраст фарбує компонувальник), `detail` — свої
// кольори. Ракурсів немає.

import type { ArtEntry, ArtLayer } from "../types";

const MASK: readonly ArtLayer[] = ["fill"];
const OWN: readonly ArtLayer[] = ["detail"];

const tile = (name: string, layers: readonly ArtLayer[]): ArtEntry => ({ id: `cloth/${name}`, size: { w: 8, h: 8 }, pivot: { x: 0, y: 0 }, layers });
const print = (name: string, w: number, h: number, layers: readonly ArtLayer[]): ArtEntry => ({
  id: `cloth/print/${name}`,
  size: { w, h },
  pivot: { x: w / 2, y: h / 2 },
  layers,
});

export const MANIFEST: readonly ArtEntry[] = [
  // Смужка й вертикальна смужка (та сама плитка, повернута): смуга 3 другого тону.
  tile("stripe", MASK),
  // Горошок: дві горошини Ø ≈ 3,6 у шаховому порядку, контрастом.
  tile("dots", MASK),
  // Клітинка: смуги 3 в обидва боки другим тоном, перехрестя темніше (тінь у `detail`).
  tile("check", ["fill", "detail"]),
  // Шотландка: широкі й вужчі смуги тінню — клітка відтінками кольору одягу.
  tile("tartan", OWN),
  // Камуфляж: оливкова, коричнева й темна плями.
  tile("camo", OWN),
  // Леопард: розетка з темних дужок довкола рудої середини.
  tile("leopard", OWN),
  // У лапки: котячий слід, тон у тон.
  tile("paws", MASK),
  // Ромби: ромб на всю плитку, тон у тон.
  tile("rhombs", MASK),
  // Мозаїка: три кольорові квадратні плитки, четверта — колір одягу.
  tile("mosaic", OWN),
  // Тигр: темні клини згори й знизу.
  tile("tiger", OWN),
  // Петриківські квіточки: червона квітка, листочки-мазки.
  tile("petrykivka", OWN),
  // Сердечко на грудях, контрастом.
  print("heart", 22, 22, MASK),
  // Котяча мордочка на грудях: очі й ніс — прорізи.
  print("cat", 22, 23, MASK),
  // Лапка на грудях.
  print("paw", 20, 20, MASK),
  // Рибка на грудях головою догори.
  print("fish", 16, 23, MASK),
  // Вишиванка: світла вишита кокетка й пазуха; рукав — манжет і смуга вздовж.
  print("vyshyvanka", 30, 48, OWN),
  print("vyshyvanka-cuff", 22, 84, OWN),
  // Зимовий светр: смуга орнаменту через груди й на манжетах.
  print("winter", 72, 30, OWN),
  print("winter-cuff", 26, 15, OWN),
];
