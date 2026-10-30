// Маніфест пакета A10 «Персонаж» (крок 16, GRAPHICS_PLAN.md, «Хвиля 2»): частини скелета персонажа в обох ракурсах —
// голови ×3, зачіски ×4 (позаду й спереду голови), очі, торси ×3, рука, нога, взуття; плями на одязі.
//
// Варіанти форми — номери у `Look` (§5.1): `face` → `person/head/<0|1|2>` (`FACES`: кругле, овальне, широке), `hair` →
// `person/hair-back/<0..3>` і `person/hair-front/<0..3>` (`HAIR_STYLES`: коротка, довга, хвостик, кучері), `build` →
// `person/torso/<0|1|2>` (`BUILDS`: струнка, звичайна, кремезна). Кольори — білі заливки, які фарбує компонувальник
// палітрами `src/view/palette.ts`: `fill-skin` (шкіра ×5), `fill-hair` (волосся ×6), `fill-iris` (очі ×4), `fill-top`,
// `fill-bottom`, `fill-shoes` (одяг по 7). Статі немає (рішення автора А4): частини спільні для всіх.
//
// Персонаж ≈ 140 одиниць до маківки (контракт хвилі 1), кремезний, дивиться праворуч (ліворуч — віддзеркалення). Голова,
// обидві зачіски й обличчя лежать в одному полотні з тим самим pivot (шия) — тож шари голови збігаються без зсувів.

import type { ArtEntry, ArtPoint } from "../types";
import { PART_VIEWS } from "./lib/geometry";

/** Полотно голови й усього, що на ній (зачіски), 72 × 88: pivot — шия; довге волосся звисає нижче шиї. */
const HEAD = { size: { w: 72, h: 88 }, pivot: { x: 36, y: 68 } } as const;
/** Де очі й рот на кожному обличчі (`FACES`). */
const FACE_POINTS = [
  { eyes: { x: 44, y: 44 }, mouth: { x: 46, y: 56 } },
  { eyes: { x: 44, y: 42 }, mouth: { x: 46, y: 58 } },
  { eyes: { x: 45, y: 45 }, mouth: { x: 47, y: 57 } },
] as const satisfies readonly { eyes: ArtPoint; mouth: ArtPoint }[];

/** Торс 80 × 84 (усі статури), pivot — таз; плечі й стегна — від статури (`BUILDS`). */
const torso = (shoulder: number, hip: number) => ({
  size: { w: 80, h: 84 },
  pivot: { x: 40, y: 76 },
  points: {
    neck: { x: 43, y: 16 },
    "shoulder-far": { x: 40 - shoulder, y: 22 },
    "shoulder-near": { x: 40 + shoulder, y: 24 },
    "hip-far": { x: 44 - hip, y: 72 },
    "hip-near": { x: 36 + hip, y: 74 },
  },
});
const TORSO = [torso(14, 11), torso(17, 13), torso(21, 17)] as const;
/** Нога від стегна до кісточки, pivot — стегно. */
const LEG = { size: { w: 32, h: 60 }, pivot: { x: 16, y: 8 }, points: { ankle: { x: 16, y: 54 } } } as const;

export const MANIFEST: readonly ArtEntry[] = [
  // Кругле обличчя (`FACES[0]`): голова з вухами й носом, шкіра — `fill-skin`; у `back` — потилиця й вуха. Pivot — шия;
  // `eyes` і `mouth` — куди скелет ставить очі (і де рот для анімацій їжі).
  { id: "person/head/0", ...HEAD, points: FACE_POINTS[0], layers: ["fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Овальне обличчя (`FACES[1]`): видовжене, з гострішим підборіддям.
  { id: "person/head/1", ...HEAD, points: FACE_POINTS[1], layers: ["fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Широке обличчя (`FACES[2]`): кремезне, з широкими вилицями.
  { id: "person/head/2", ...HEAD, points: FACE_POINTS[2], layers: ["fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Коротка зачіска, задня частина (`HAIR_STYLES[0]`): шапочка волосся за головою; у `back` — уся потилиця.
  { id: "person/hair-back/0", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Довга зачіска, задня частина (`HAIR_STYLES[1]`): пасма до плечей, нижче шиї.
  { id: "person/hair-back/1", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Хвостик, задня частина (`HAIR_STYLES[2]`): гумка й хвіст на потилиці.
  { id: "person/hair-back/2", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Кучері, задня частина (`HAIR_STYLES[3]`): кучерики довкола голови.
  { id: "person/hair-back/3", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Коротка зачіска, передня частина: чубчик над лобом (поверх голови й очей).
  { id: "person/hair-front/0", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Довга зачіска, передня частина: пасма обабіч обличчя.
  { id: "person/hair-front/1", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Хвостик, передня частина: гладко зачесане з проділом.
  { id: "person/hair-front/2", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Кучері, передня частина: кучерики над лобом.
  { id: "person/hair-front/3", ...HEAD, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Очі (§8.8: засинаючи, звужуються й заплющуються): `open`, `half`, `closed`. Райдужка — `fill-iris`, повіки — `fill-skin`
  // поверх неї, вії й контур — `ink`. Pivot — посередині (точка `eyes` голови); у `back` слот прихований.
  {
    id: "person/eyes",
    size: { w: 24, h: 12 },
    pivot: { x: 12, y: 6 },
    layers: ["fill-iris", "fill-skin", "ink"],
    views: PART_VIEWS,
    states: ["open", "half", "closed"],
  },
  // Струнка статура (`BUILDS[0]`): торс із тазом — верх (`fill-top`), пояс штанів (`fill-bottom`), шия (`fill-skin`). Pivot —
  // таз; плечі й стегна — куди кріпляться руки й ноги, `neck` — голова.
  { id: "person/torso/0", ...TORSO[0], layers: ["fill-top", "fill-bottom", "fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Звичайна статура (`BUILDS[1]`).
  { id: "person/torso/1", ...TORSO[1], layers: ["fill-top", "fill-bottom", "fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Кремезна статура (`BUILDS[2]`): ширші плечі й живіт.
  { id: "person/torso/2", ...TORSO[2], layers: ["fill-top", "fill-bottom", "fill-skin", "shade", "ink"], views: PART_VIEWS },
  // Рука (слоти `arm-far`, `arm-near`): рукав (`fill-top`) і долоня (`fill-skin`); pivot — плече, `hand` — долоня (гнізда
  // `held`, `rod`, `hand` — рука, що гладить кота, тримає вудку, тарілку, кота).
  {
    id: "person/arm",
    size: { w: 28, h: 64 },
    pivot: { x: 14, y: 8 },
    points: { hand: { x: 14, y: 56 } },
    layers: ["fill-top", "fill-skin", "shade", "ink"],
    views: PART_VIEWS,
  },
  // Нога (слоти `leg-far`, `leg-near`): штанина (`fill-bottom`); pivot — стегно, `ankle` — куди кріпиться взуття.
  { id: "person/leg", ...LEG, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Взуття (слоти `shoe-far`, `shoe-near`): носком уперед; pivot — кісточка.
  { id: "person/shoe", size: { w: 36, h: 22 }, pivot: { x: 14, y: 7 }, layers: ["fill-shoes", "shade", "ink"], views: PART_VIEWS },

  // --- Плями на одязі (§8.7): чистого одягу немає — плями, контрастні до кольору тканини (темний бруд на світлому, світлий
  // пил на темному), у готових кольорах. Накладки в полотні торса й ноги; запах над персонажем — `fx/smell`.

  // Плями на верхі й поясі струнких.
  { id: "person/torso-extra/0", ...TORSO[0], layers: ["extra-stain"], views: PART_VIEWS },
  // Плями на верхі звичайних.
  { id: "person/torso-extra/1", ...TORSO[1], layers: ["extra-stain"], views: PART_VIEWS },
  // Плями на верхі кремезних.
  { id: "person/torso-extra/2", ...TORSO[2], layers: ["extra-stain"], views: PART_VIEWS },
  // Плями на штанині.
  { id: "person/leg-extra", ...LEG, layers: ["extra-stain"], views: PART_VIEWS },
];
