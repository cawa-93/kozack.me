// Маніфест гардероба «Зачіски» (`WARDROBE.md`, «Волосся»; реєстр — `src/view/wardrobe/hair.ts`): задні й передні частини
// зачісок, у обох ракурсах. Полотно кожної — своє, обрізане довкола малюнка (бюджет атласу), а pivot — та сама шия, що в
// голови (`person/head/*`: полотно 64 × 70, pivot (32, 46)): тож зачіска стає на будь-яку голову без зсувів
// (`art/STYLE.md`, §9). Точка `top` — маківка зачіски, над нею бабли (якір `head` скелета). Кіберпанк — з маскою акценту
// `fill-accent`. «Лиса» кадрів не має; «каре з чубчиком» і «довге з прямим проділом» беруть задню частину каре й «довгої»,
// «низький пучок» і «маллет» — передню «хвостика» й скуйовдженої.

import type { ArtEntry, ArtId, ArtLayer, ArtPoint } from "../types";
import { PART_VIEWS } from "./lib/geometry";

const PLAIN: readonly ArtLayer[] = ["fill-hair", "shade", "ink"];
const ACCENT: readonly ArtLayer[] = ["fill-hair", "fill-accent", "shade", "ink"];

/**
 * Частина зачіски: полотно `w × h`, що на полотні голови починається в (x0, y0) — звідси pivot у тій самій шиї; `top` — у
 * координатах полотна голови.
 */
function part(id: ArtId, w: number, h: number, x0: number, y0: number, top: ArtPoint, layers: readonly ArtLayer[]): ArtEntry {
  return {
    id,
    size: { w, h },
    pivot: { x: 32 - x0, y: 46 - y0 },
    points: { top: { x: top.x - x0, y: top.y - y0 } },
    layers: [...layers],
    views: PART_VIEWS,
  };
}

/** Маківка на полотні голови — як у голови й «короткої» (`a10-person.ts`): нижче бабл не опускається. */
const TOP: ArtPoint = { x: 32.5, y: 4.5 };
/** Афро — висока куля: маківка вища за всі зачіски (бабли й смуга лагодження дроту, `FIX_HEAD`). */
const TOP_AFRO: ArtPoint = { x: 31.5, y: -4 };
/** Зубці скуйовдженої стирчать над маківкою. */
const TOP_SHAGGY: ArtPoint = { x: 33, y: 2 };
/** Чуб андеркату здіймається над лобом. */
const TOP_QUIFF: ArtPoint = { x: 35, y: -1.5 };
/** Хвиляста кучма пишніша за голову й угорі. */
const TOP_MOP: ArtPoint = { x: 32.5, y: 3.5 };
/** Шпичаки їжачка стирчать над маківкою. */
const TOP_SPIKY: ArtPoint = { x: 32.5, y: 2 };
/** Гребінь ірокезу — найвища маківка з усіх (бабли й смуга лагодження дроту, `FIX_HEAD`). */
const TOP_MOHAWK: ArtPoint = { x: 33, y: -8 };
/** Шипи — вищі за афро, нижчі за ірокез. */
const TOP_SPIKES: ArtPoint = { x: 31.5, y: -4.5 };

export const MANIFEST: readonly ArtEntry[] = [
  // Каре (`HAIR_STYLES` «каре», «каре з чубчиком»): у front — маса за головою до підборіддя в тіні, у back — уся потилиця з
  // рівним зрізом.
  part("person/hair-back/bob", 60, 55, 2, 2, TOP, PLAIN),
  // Каре, передня частина: косий проділ, пасма закривають вухо й обрамлюють обличчя до підборіддя.
  part("person/hair-front/bob", 59, 54, 2, 2, TOP, PLAIN),
  // Каре з чубчиком, передня частина: рівний чубчик над бровами (задня — каре).
  part("person/hair-front/bob-bangs", 59, 54, 2, 2, TOP, PLAIN),
  // Хвилі до плечей: хвиляста маса за головою; у back — потилиця з хвилястими пасмами й кінчиками-завитками.
  part("person/hair-back/waves", 67, 66, -2, 1, TOP, PLAIN),
  // Хвилі до плечей, передня частина: проділ, хвилясті пасма обабіч обличчя, ближнє лягає на плече.
  part("person/hair-front/waves", 64, 64, 0, 2, TOP, PLAIN),
  // Афро: висока куля дрібних кучерів довкола голови (у back — уся, вуха сховані); вище полотно.
  part("person/hair-back/afro", 66, 61, -1, -8, TOP_AFRO, PLAIN),
  // Афро, передня частина: куля над лобом і з боків, ближнє вухо видно.
  part("person/hair-front/afro", 66, 55, -2, -8, TOP_AFRO, PLAIN),
  // Скуйовджена: у front — зубці на всі боки, у back — пасма загинаються від вихору в один бік (промені навсібіч були надто
  // колючі), до потилиці.
  part("person/hair-back/shaggy", 61, 54, 0, 0, TOP_SHAGGY, PLAIN),
  // Скуйовджена, передня частина: зубці над лобом і з боків, чубчик зубцями над бровами.
  part("person/hair-front/shaggy", 64, 51, 0, -4, TOP_SHAGGY, PLAIN),
  // Дреди: товсті джгути до лопаток; у back — потилиця з проділами.
  part("person/hair-back/locs", 65, 70, 0, 2, TOP, PLAIN),
  // Дреди, передня частина: джгути від лінії волосся обабіч обличчя, ближні — перед вухом до плеча.
  part("person/hair-front/locs", 64, 65, -1, 2, TOP, PLAIN),
  // Коса на плече: гладка потилиця, волосся зібране до ближнього боку в косу.
  part("person/hair-back/braid", 56, 61, 4, 2, TOP, PLAIN),
  // Коса на плече, передня частина: гладко зачесане з проділом, коса з-за ближнього вуха на груди.
  part("person/hair-front/braid", 56, 70, 4, 2, TOP, PLAIN),
  // Андеркат із чубом: виголена потилиця (щетина на шкірі — суцільне волосся з чорним читалося як шолом) і чуб, що падає на
  // ближній бік; акцент — довжина чуба.
  part("person/hair-back/undercut", 52, 51, 10, -4, TOP_QUIFF, ACCENT),
  // Андеркат із чубом, передня частина: виголені скроні (щетина) й високий чуб набік до ближньої скроні.
  part("person/hair-front/undercut", 53, 52, 6, -5, TOP_QUIFF, ACCENT),
  // Неонові пасма: каре до щелепи з рваними кінчиками; акцент — два пасма.
  part("person/hair-back/streaks", 60, 55, 2, 2, TOP, ACCENT),
  // Неонові пасма, передня частина: косий рваний чубчик; акцент — пасмо в чубчику й на ближньому боці.
  part("person/hair-front/streaks", 57, 51, 3, 2, TOP, ACCENT),
  // Візерунок на скроні: коротка стрижка, ближня скроня виголена з двома смугами-зигзагами (акцент).
  part("person/hair-back/shaved", 50, 46, 6, 4, TOP, ACCENT),
  // Візерунок на скроні, передня частина.
  part("person/hair-front/shaved", 51, 44, 7, 3, TOP, ACCENT),
  // Довге з прямим проділом, передня частина (задня — «довгої», `person/hair-back/1`): пасма нижче плечей — ближнє на грудях
  // між рукою й шиєю, дальнє на дальньому плечі.
  part("person/hair-front/middle-part", 62, 75, 1, 2, TOP, PLAIN),
  // Низький пучок: пасма сходяться до пучка на потилиці (передня частина — «хвостика», `person/hair-front/2`).
  part("person/hair-back/bun", 58, 53, -1, 3, TOP, PLAIN),
  // Хвиляста кучма: об'ємні хвилі ширші за голову, вище плечей.
  part("person/hair-back/mop", 69, 60, -3, -1, TOP_MOP, PLAIN),
  // Хвиляста кучма, передня частина: хвилястий чубчик набік.
  part("person/hair-front/mop", 68, 61, -3, -1, TOP_MOP, PLAIN),
  // Короткі кучері: шапочка дрібних кучерів.
  part("person/hair-back/curls-short", 53, 49, 4, 2, TOP, PLAIN),
  // Короткі кучері, передня частина.
  part("person/hair-front/curls-short", 53, 45, 5, 2, TOP, PLAIN),
  // Маллет: коротка маківка й довгі пасма з потилиці (передня частина — скуйовдженої, тож і маківка її).
  part("person/hair-back/mullet", 61, 69, -1, -1, TOP_SHAGGY, PLAIN),
  // Кукурудзяні кіски: рядки кісок до потилиці, на шиї — короткі кіски.
  part("person/hair-back/cornrows", 52, 52, 5, 4, TOP, PLAIN),
  // Кукурудзяні кіски, передня частина: рядки від лінії росту назад.
  part("person/hair-front/cornrows", 51, 43, 6, 4, TOP, PLAIN),
  // Під машинку: волосся на черепі всередині лінії голови, без власного силуету.
  part("person/hair-back/buzz", 39, 37, 13, 11, TOP, PLAIN),
  // Під машинку, передня частина.
  part("person/hair-front/buzz", 41, 36, 11, 11, TOP, PLAIN),
  // Їжачок: короткі шпичаки вгору.
  part("person/hair-back/spiky", 56, 54, 3, -3, TOP_SPIKY, PLAIN),
  // Їжачок, передня частина.
  part("person/hair-front/spiky", 57, 50, 3, -3, TOP_SPIKY, PLAIN),
  // Вінчик: лисина, волосся вінцем по потилиці (маківка — як у голови).
  part("person/hair-back/horseshoe", 40, 30, 12, 18, TOP, PLAIN),
  // Вінчик, передня частина: над ближнім вухом і бачки.
  part("person/hair-front/horseshoe", 22, 30, 11, 17, TOP, PLAIN),
  // Неоновий ірокез: гребінь до потилиці, боки виголені; акцент — гребінь; високе полотно.
  part("person/hair-back/mohawk", 51, 65, 7, -13, TOP_MOHAWK, ACCENT),
  // Неоновий ірокез, передня частина.
  part("person/hair-front/mohawk", 57, 60, -2, -13, TOP_MOHAWK, ACCENT),
  // Асиметричне каре: ближній бік довгий, зріз косо; акцент — нижній шар по краю зрізу.
  part("person/hair-back/asym-bob", 60, 63, 2, 2, TOP, ACCENT),
  // Асиметричне каре, передня частина: акцент — ще й уздовж ближнього пасма біля щоки.
  part("person/hair-front/asym-bob", 59, 59, 2, 2, TOP, ACCENT),
  // Шипи: гострі шипи вгору й навсібіч; акцент — шипи над шапочкою.
  part("person/hair-back/spikes", 62, 60, -2, -9, TOP_SPIKES, ACCENT),
  // Шипи, передня частина.
  part("person/hair-front/spikes", 63, 57, -2, -10, TOP_SPIKES, ACCENT),
];
