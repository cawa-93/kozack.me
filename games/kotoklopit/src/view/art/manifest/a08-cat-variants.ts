// Маніфест пакета A8 «Кіт — варіанти» (крок 16, GRAPHICS_PLAN.md, «Хвиля 2»): форми порід (§9.10, §9.11, `BREEDS.md`) —
// вуха ×4 понад звичайні, хвости ×3 понад довгий (безхвостий — порожній слот), морди ×2, короткі лапи; накладки шерсті:
// безшерсті зі складками, кучеряві, тьмяна шерсть, залисини, нашийник; живіт вагітної. Пасма довгої шерсті (`fluff`) —
// шари в SVG основи A7 і в хвостах тут.
//
// Варіанти — ті самі шари шерсті, що в A7 (`CAT_COAT`, у вух, морд і лап — ще й `detail`, як в еталонах F1b; маски малює
// A9 у цих SVG). Полотна варіантів — орієнтовні, від еталонів F1b (`lib/cat.ts`): A8 уточнює їх разом із SVG. Накладки `cat/<частина>-extra/…` — у
// тому самому полотні й з тим самим pivot, що частина, лише шари `extra-*` у готових кольорах (`CAT_EXTRAS`): компонувальник
// кладе потрібні поверх запеченої частини, коли кіт безшерстий (`Shape.coat` «hairless» — складки), кучерявий («curly» —
// завитки), хворий на дерматит (залисини) чи глисти (тьмяна шерсть), має нашийник (`Cat.collar`).

import type { ArtEntry, ArtLayer } from "../types";
import { CAT_BACK_LEGS, CAT_EARS, CAT_FRONT_LEGS, CAT_HEAD, CAT_MUZZLES, CAT_TAILS, catBody } from "./lib/cat";
import { CAT_COAT, CAT_COAT_DETAIL, CAT_EXTRAS, CAT_FLUFF, PART_VIEWS } from "./lib/geometry";

const FLUFFY: readonly ArtLayer[] = [...CAT_COAT, ...CAT_FLUFF];

export const MANIFEST: readonly ArtEntry[] = [
  // --- Форми порід

  // Великі вуха (орієнтальні, сіамські, сфінкси, абіссинці; 15% безпородних).
  { id: "cat/ear/large", ...CAT_EARS.large, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // Висловухі (шотландська висловуха, українська левкоя): складені вперед і вниз.
  { id: "cat/ear/folded", ...CAT_EARS.folded, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // Керл (американський керл): кінчики загнуті назад.
  { id: "cat/ear/curled", ...CAT_EARS.curled, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // З китичками на кінчиках (мейнкун, норвезька лісова).
  { id: "cat/ear/tufted", ...CAT_EARS.tufted, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // Кирпата морда (перська, гімалайська): пласка, ніс майже між очима.
  { id: "cat/muzzle/flat", ...CAT_MUZZLES.flat, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // Видовжена морда (сіамська, орієнтальна, корніш-рекс, левкоя): клином.
  { id: "cat/muzzle/long", ...CAT_MUZZLES.long, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // Короткий хвіст (10% безпородних).
  { id: "cat/tail/short", ...CAT_TAILS.short, layers: FLUFFY, views: PART_VIEWS },
  // Пухнастий хвіст (мейнкун, норвезька лісова, сомалі, ангора; 10% безпородних): широкий, з пасмами навіть у
  // короткошерстих.
  { id: "cat/tail/fluffy", ...CAT_TAILS.fluffy, layers: FLUFFY, views: PART_VIEWS },
  // Бобтейл (японський і американський): помпон замість хвоста. Менкс (`none`) — слот хвоста порожній, кадру немає.
  { id: "cat/tail/bobtail", ...CAT_TAILS.bobtail, layers: FLUFFY, views: PART_VIEWS },
  // Коротка передня лапа (манчкін): та сама лапа, коротша; кіт нижчий і не стрибає високо (`cannotJump`).
  { id: "cat/leg-front/short", ...CAT_FRONT_LEGS.short, layers: CAT_COAT_DETAIL, views: PART_VIEWS },
  // Коротка задня лапа (манчкін).
  { id: "cat/leg-back/short", ...CAT_BACK_LEGS.short, layers: CAT_COAT_DETAIL, views: PART_VIEWS },

  // --- Накладки шерсті (у полотні частини)

  // Накладки тулуба струнких: залисини, тьмяна шерсть, складки безшерстих, завитки кучерявих, нашийник із табличкою на шиї.
  { id: "cat/body-extra/slim", ...catBody("slim"), layers: CAT_EXTRAS.body, views: PART_VIEWS },
  // Накладки тулуба звичайних.
  { id: "cat/body-extra/normal", ...catBody("normal"), layers: CAT_EXTRAS.body, views: PART_VIEWS },
  // Накладки тулуба кремезних.
  { id: "cat/body-extra/stocky", ...catBody("stocky"), layers: CAT_EXTRAS.body, views: PART_VIEWS },
  // Накладки голови: залисини, тьмяна шерсть, складки на лобі (сфінкс), завитки (рекси).
  { id: "cat/head-extra/base", ...CAT_HEAD, layers: CAT_EXTRAS.head, views: PART_VIEWS },
  // Накладки довгого хвоста: тьмяна шерсть, завитки.
  { id: "cat/tail-extra/long", ...CAT_TAILS.long, layers: CAT_EXTRAS.tail, views: PART_VIEWS },
  // Накладки короткого хвоста.
  { id: "cat/tail-extra/short", ...CAT_TAILS.short, layers: CAT_EXTRAS.tail, views: PART_VIEWS },
  // Накладки пухнастого хвоста.
  { id: "cat/tail-extra/fluffy", ...CAT_TAILS.fluffy, layers: CAT_EXTRAS.tail, views: PART_VIEWS },
  // Накладки бобтейла.
  { id: "cat/tail-extra/bobtail", ...CAT_TAILS.bobtail, layers: CAT_EXTRAS.tail, views: PART_VIEWS },

  // --- Живіт вагітної (§9.8, `showsPregnancy` у `reproduction.ts`: з тижня до пологів): округлий живіт під тулубом, з
  // тією самою шерстю (зазвичай `white-1` — світлий живіт). Окрема частина в полотні тулуба: слот під тулубом, видно лише
  // в помітно вагітної.

  // Живіт вагітної стрункої.
  { id: "cat/belly/slim", ...catBody("slim"), layers: FLUFFY, views: PART_VIEWS },
  // Живіт вагітної звичайної статури.
  { id: "cat/belly/normal", ...catBody("normal"), layers: FLUFFY, views: PART_VIEWS },
  // Живіт вагітної кремезної.
  { id: "cat/belly/stocky", ...catBody("stocky"), layers: FLUFFY, views: PART_VIEWS },
];
