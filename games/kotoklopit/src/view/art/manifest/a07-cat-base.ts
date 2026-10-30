// Маніфест пакета A7 «Кіт — основа» (крок 16, GRAPHICS_PLAN.md, «Хвиля 2»): частини скелета кота в обох ракурсах —
// тулуб ×3 статури, голова, звичайні вуха, морда, лапи й хвіст; очі й рот зі станами для виразів (§9.4, §11.4).
//
// Кожна частина — свій SVG на ракурс (`art/<id>/front.svg`, `art/<id>/back.svg`) з шарами шерсті `CAT_COAT`: білий
// силует `fill`, маски табі, черепахових і білих плям, колорпойнт, `shade`, `ink`; тулуб, голова й хвіст — ще й `fluff`
// / `fluff-ink` (пасма довгої шерсті). Фарбує компонувальник (`compose.ts`) за `coatOf` (§9.10).
//
// Маски шерсті малює пакет A9 у цих самих SVG (і в SVG A8): окремих записів у A9 немає. Пасма `fluff` — довга шерсть
// із пакета A8, теж у цих SVG. Ракурс `back` (¾ ззаду) — для очей, рота й морди слот прихований скелетом, але кадр є
// (порожні групи шарів), щоб кадри всіх частин були однакові.
//
// Пози (`CatPose`, `pose.ts`: іде, сидить, їсть, спить клубочком, буханець, на спині, дуга, вилизує…) — анімації скелета
// (пакети N1–N3), а не кадри: окремих тулубів на пози немає. Вирази — підміна станів очей і рота (а вуха притискає й
// опускає поворот кістки вуха).

import type { ArtEntry, ArtLayer } from "../types";
import { CAT_BACK_LEGS, CAT_EARS, CAT_EYES, CAT_FRONT_LEGS, CAT_HEAD, CAT_MOUTH, CAT_MUZZLES, CAT_TAILS, catBody } from "./lib/cat";
import { CAT_COAT, CAT_FLUFF, PART_VIEWS } from "./lib/geometry";

/** Шари частини з пасмами довгої шерсті (тулуб, голова, хвіст). */
const FLUFFY: readonly ArtLayer[] = [...CAT_COAT, ...CAT_FLUFF];
/** Шари очей: шерсть повік і райдужка (`fill-iris`, 4 кольори очей `coatOf`). */
const EYES: readonly ArtLayer[] = ["fill", "fill-iris", ...CAT_COAT.slice(1)];

export const MANIFEST: readonly ArtEntry[] = [
  // Тулуб стрункої статури (§9.10: орієнтальні, сіамські): довгий і тонкий. Pivot — середина хребта; `neck`, плечі, стегна й
  // `tail` — куди кріпляться голова, лапи й хвіст. Повного кота ширшає вигляд (`girthOf`), а не кадр.
  { id: "cat/body/slim", ...catBody("slim"), layers: FLUFFY, views: PART_VIEWS },
  // Тулуб звичайної статури — найчастіший у безпородних.
  { id: "cat/body/normal", ...catBody("normal"), layers: FLUFFY, views: PART_VIEWS },
  // Тулуб кремезної статури (британці, мейнкуни, перси): коротший, глибокий, з широкими грудьми.
  { id: "cat/body/stocky", ...catBody("stocky"), layers: FLUFFY, views: PART_VIEWS },
  // Голова (одна на всіх: форму дають вуха й морда): велика, кругла, з щоками; у `back` — потилиця. Pivot — шия.
  { id: "cat/head/base", ...CAT_HEAD, layers: FLUFFY, views: PART_VIEWS },
  // Звичайні вуха (§9.10): трикутні, з пухом усередині. Слоти `ear-far` і `ear-near` — той самий кадр; притиснуті й
  // опущені вуха — поворот кістки вуха.
  { id: "cat/ear/normal", ...CAT_EARS.normal, layers: CAT_COAT, views: PART_VIEWS },
  // Звичайна морда: щічки, ніс і вуса (вуса — `ink`). Pivot — де морда прилягає до голови.
  { id: "cat/muzzle/normal", ...CAT_MUZZLES.normal, layers: CAT_COAT, views: PART_VIEWS },
  // Очі (§11.4, §9.4): `open` — розплющені; `half` — напівзаплющені (сум, вилизує друга, кліпання); `closed` — заплющені
  // (сон, повільне кліпання); `arc` — дужки (подобається, мружиться); `squint` — сердито примружені навскіс (терпить);
  // `round` — круглі з цятками-зіницями (пручається, перед ворогом, гра); `sick` — сльозяться й примружені (кон'юнктивіт,
  // застуда, §9.5). Повіки — шерсть (маски), райдужка — `fill-iris`.
  { id: "cat/eyes", ...CAT_EYES, layers: EYES, views: PART_VIEWS, states: ["open", "half", "closed", "arc", "squint", "round", "sick"] },
  // Рот (§9.4, §9.12): `closed` — закритий; `meow` — нявкає; `hiss` — шипить, з іклами (дуга, протистояння); `yawn` —
  // позіхає; `eat` — жує; `tongue` — висунутий язичок (вилизує себе чи друга, п'є).
  { id: "cat/mouth", ...CAT_MOUTH, layers: CAT_COAT, views: PART_VIEWS, states: ["closed", "meow", "hiss", "yawn", "eat", "tongue"] },
  // Передня лапа звичайної довжини (слоти `leg-front-far`, `leg-front-near`): pivot — плече, `paw` — подушечка.
  { id: "cat/leg-front/normal", ...CAT_FRONT_LEGS.normal, layers: CAT_COAT, views: PART_VIEWS },
  // Задня лапа звичайної довжини зі стегном (слоти `leg-back-far`, `leg-back-near`): pivot — кульшовий суглоб.
  { id: "cat/leg-back/normal", ...CAT_BACK_LEGS.normal, layers: CAT_COAT, views: PART_VIEWS },
  // Довгий хвіст (найчастіший): у вихідній позі — дугою вгору; виляє, трубою, униз — поворот кісток. Pivot — корінь.
  { id: "cat/tail/long", ...CAT_TAILS.long, layers: FLUFFY, views: PART_VIEWS },
];
