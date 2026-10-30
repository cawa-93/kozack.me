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
//
// Полотна, pivot, точки й шари — з еталонів F1b (`art/person/…`, `art/STYLE.md`, розділ 13): голова 0, обидві зачіски 0,
// очі, торс 1, рука, нога, взуття. Решта варіантів — від еталонів: голови й зачіски — те саме полотно 54 × 50 з pivot у
// шиї (як радить F1b для A10), струнка й кремезна статури — торс 1, звужений і розширений від таза. A10 уточнює їх разом із
// SVG. Точка `<назва>-back` — те саме місце в ракурсі back (ближній бік ¾ спереду — ліворуч, ¾ ззаду — праворуч).

import type { ArtEntry, ArtPoint } from "../types";
import { PART_VIEWS } from "./lib/geometry";

/** Полотно голови й усього, що на ній (зачіски), 54 × 50 (еталон F1b): pivot — шия під підборіддям. */
const HEAD = { size: { w: 54, h: 50 }, pivot: { x: 27, y: 42 } } as const;
/** Маківка — над нею бульбашки (`top`, якір `head` скелета). */
const TOP: ArtPoint = { x: 27.5, y: 0.5 };
/** Де очі на кожному обличчі (`FACES`): кругле — еталон, решта поки та сама точка; `top` — маківка. */
const FACE_POINTS = [
  { eyes: { x: 32.3, y: 28.1 }, top: TOP },
  { eyes: { x: 32.3, y: 28.1 }, top: TOP },
  { eyes: { x: 32.3, y: 28.1 }, top: TOP },
] as const satisfies readonly { eyes: ArtPoint; top: ArtPoint }[];

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Торс звичайної статури (еталон F1b `art/person/torso/1`): pivot — таз; шия, плечі, стегна й `arms` (де кіт на руках). */
const TORSO_NORMAL = {
  size: { w: 58, h: 75 },
  pivot: { x: 29, y: 54 },
  points: {
    neck: { x: 30.5, y: 8.5 },
    "neck-back": { x: 28.5, y: 8.5 },
    "neck-base": { x: 29.5, y: 14 },
    "neck-base-back": { x: 28.5, y: 14 },
    "shoulder-far": { x: 44, y: 15.6 },
    "shoulder-far-back": { x: 14, y: 15.6 },
    "shoulder-near": { x: 12, y: 17.6 },
    "shoulder-near-back": { x: 46, y: 17.6 },
    "hip-far": { x: 35, y: 56.6 },
    "hip-far-back": { x: 23, y: 56.6 },
    "hip-near": { x: 22.5, y: 59 },
    "hip-near-back": { x: 35.5, y: 59 },
    arms: { x: 38, y: 34 },
    "arms-back": { x: 39, y: 33 },
  },
} as const;

/** Торс статури: еталон, ширший чи вужчий від таза в `k` разів (орієнтовно, до A10). */
function torso(k: number): { size: { w: number; h: number }; pivot: ArtPoint; points: Record<string, ArtPoint> } {
  const half = Math.ceil(TORSO_NORMAL.pivot.x * k);
  const points = Object.fromEntries(
    Object.entries(TORSO_NORMAL.points).map(([name, p]) => [name, { x: round1(half + (p.x - TORSO_NORMAL.pivot.x) * k), y: p.y }]),
  );
  return { size: { w: 2 * half, h: TORSO_NORMAL.size.h }, pivot: { x: half, y: TORSO_NORMAL.pivot.y }, points };
}
const TORSO = [torso(0.85), TORSO_NORMAL, torso(1.2)] as const;
/** Нога від стегна до кісточки (еталон F1b): pivot — стегно, `foot` — кісточка, куди стає pivot взуття. */
const LEG = { size: { w: 33, h: 74 }, pivot: { x: 16, y: 18 }, points: { foot: { x: 16.6, y: 67.2 } } } as const;

export const MANIFEST: readonly ArtEntry[] = [
  // Кругле обличчя (`FACES[0]`): голова з вухами й носом, шкіра — `fill-skin`, ніс, рот і рум'янець — `detail`; у `back` —
  // потилиця й вуха. Pivot — шия; `eyes` — куди скелет ставить очі, `top` — маківка.
  { id: "person/head/0", ...HEAD, points: FACE_POINTS[0], layers: ["fill-skin", "detail", "shade", "ink"], views: PART_VIEWS },
  // Овальне обличчя (`FACES[1]`): видовжене, з гострішим підборіддям.
  { id: "person/head/1", ...HEAD, points: FACE_POINTS[1], layers: ["fill-skin", "detail", "shade", "ink"], views: PART_VIEWS },
  // Широке обличчя (`FACES[2]`): кремезне, з широкими вилицями.
  { id: "person/head/2", ...HEAD, points: FACE_POINTS[2], layers: ["fill-skin", "detail", "shade", "ink"], views: PART_VIEWS },
  // Коротка зачіска, задня частина (`HAIR_STYLES[0]`): шапочка волосся за головою; у `back` — уся потилиця.
  { id: "person/hair-back/0", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Довга зачіска, задня частина (`HAIR_STYLES[1]`): пасма до плечей, нижче шиї.
  { id: "person/hair-back/1", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Хвостик, задня частина (`HAIR_STYLES[2]`): гумка й хвіст на потилиці.
  { id: "person/hair-back/2", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Кучері, задня частина (`HAIR_STYLES[3]`): кучерики довкола голови.
  { id: "person/hair-back/3", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Коротка зачіска, передня частина: чубчик над лобом (поверх голови й очей).
  { id: "person/hair-front/0", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Довга зачіска, передня частина: пасма обабіч обличчя.
  { id: "person/hair-front/1", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Хвостик, передня частина: гладко зачесане з проділом.
  { id: "person/hair-front/2", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Кучері, передня частина: кучерики над лобом.
  { id: "person/hair-front/3", ...HEAD, points: { top: TOP }, layers: ["fill-hair", "shade", "ink"], views: PART_VIEWS },
  // Очі (§8.8: засинаючи, звужуються й заплющуються): `open`, `half`, `closed`. Райдужка — `fill-iris`, білки й відблиски —
  // `detail`, вії й контур — `ink`; повік-шкіри немає (еталон F1b): де ока не намальовано, видно голову. Pivot — між очима
  // (точка `eyes` голови); у `back` слот прихований.
  {
    id: "person/eyes",
    size: { w: 26, h: 20 },
    pivot: { x: 13, y: 12 },
    layers: ["fill-iris", "detail", "ink"],
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
  // Рука (слоти `arm-far`, `arm-near`): рукав (`fill-top`) і долоня (`fill-skin`); pivot — плече, `hand` — зап'ясток (кістка
  // кисті, гнізда `held` і `rod`), `grip` — середина долоні (рука, що гладить кота, тримає вудку, тарілку, кота).
  {
    id: "person/arm",
    size: { w: 27, h: 73 },
    pivot: { x: 13, y: 14 },
    points: { hand: { x: 14, y: 54.6 }, grip: { x: 14.2, y: 61 } },
    layers: ["fill-top", "fill-skin", "shade", "ink"],
    views: PART_VIEWS,
  },
  // Нога (слоти `leg-far`, `leg-near`): штанина (`fill-bottom`); pivot — стегно, `foot` — кісточка, куди кріпиться взуття.
  { id: "person/leg", ...LEG, layers: ["fill-bottom", "shade", "ink"], views: PART_VIEWS },
  // Взуття (слоти `shoe-far`, `shoe-near`): носком уперед, підошва й шнурки — `detail`; pivot — кісточка.
  { id: "person/shoe", size: { w: 39, h: 25 }, pivot: { x: 16, y: 8 }, layers: ["fill-shoes", "detail", "shade", "ink"], views: PART_VIEWS },

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
