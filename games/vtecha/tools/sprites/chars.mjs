// Персонаж і тіло павука (§8, §15, §11.4). Обидва дивляться праворуч (+x) і повертаються за поглядом.
// Ноги павука тут не малюються: вони процедурні (IK) і рендеряться в піксельній сітці сцени.

import { Img, PAL as P } from "./lib.mjs";

const SKIN = 0xb58f72;
const SKIN_DARK = 0x8a6048;

// ======================= персонаж (14 × 14, центр 7, 7) =======================

/** Рука: рукав від плеча до кисті, кисть — шкіра. */
function arm(img, sx, sy, hx, hy) {
  img.line(sx, sy, hx, hy, P.stone1);
  img.set(hx, hy, SKIN);
}

/**
 * Тіло згори: плечі в сірій тюремній свиті, голова з темним волоссям.
 * hands — позиції кистей [x, y] (лівої — вгорі, правої — внизу за екраном).
 */
function player(hands, extra) {
  const img = new Img(14, 14);
  // Руки під тулубом.
  arm(img, 6, 3, ...hands[0]);
  arm(img, 6, 10, ...hands[1]);
  // Плечі й тулуб: еліпс із тінню ззаду й світлом спереду.
  img.fill((x, y) => {
    const d = ((x + 0.5 - 5.5) / 3) ** 2 + ((y + 0.5 - 7) / 4.6) ** 2;
    if (d > 1) return undefined;
    if (x < 4) return P.stone0;
    return d < 0.45 && x >= 5 ? P.stone2 : P.stone1;
  });
  // Голова.
  img.disc(7.5, 7, 2.4, P.wood0);
  img.set(8, 6, P.wood1);
  img.set(8, 7, P.wood1);
  img.set(9, 6, P.wood2);
  // Обличчя з'являється лише краєм — ми дивимося на потилицю й маківку.
  img.set(9, 7, SKIN_DARK);
  extra?.(img);
  return img.outline(P.black);
}

function players(add) {
  add("player_idle", player([[9, 3], [9, 10]]));
  add("player_walk1", player([[10, 3], [8, 10]]));
  add("player_walk2", player([[8, 3], [10, 10]]));
  // Тримає предмет: права кисть витягнута вперед (сам предмет малюється окремо, §7.3).
  add("player_hold", player([[11, 5], [9, 10]]));
  // Кайданки: обидві кисті попереду, між ними ланцюг (§11.2.1).
  add(
    "player_cuffed",
    player([[10, 6], [10, 8]], (img) => {
      img.set(11, 6, P.metal2);
      img.set(11, 7, P.metal1);
      img.set(11, 8, P.metal2);
    }),
  );
  // Обплутаний павутиною (плювок §9.4, пробудження §10.3): накладка з волокон.
  const webbed = new Img(14, 14);
  for (const [x0, y0, x1, y1] of [
    [1, 2, 12, 11],
    [2, 12, 12, 1],
    [0, 7, 13, 6],
    [4, 0, 9, 13],
  ])
    webbed.line(x0, y0, x1, y1, P.web);
  add("player_webbed", webbed);
}

// ======================= павук: тіло (18 × 12, центр 9, 6) =======================

function spider(add) {
  const img = new Img(18, 12);
  // Черевце ззаду: темний хітин, вологий відблиск і візерунок уздовж.
  img.fill((x, y) => {
    const d = ((x + 0.5 - 5) / 4.8) ** 2 + ((y + 0.5 - 6) / 3.8) ** 2;
    if (d > 1) return undefined;
    if (d > 0.7) return P.wood0;
    return 0x33251f;
  });
  for (const x of [3, 5, 7]) img.set(x, 6, 0xa06a44);
  img.set(4, 5, 0x5a3624);
  img.set(6, 5, 0x5a3624);
  img.set(6, 4, 0x8a7262); // відблиск
  img.set(7, 4, 0x8a7262);
  // Головогруди й голова.
  img.disc(10.5, 6, 2.6, 0x3a2a22);
  img.disc(13.2, 6, 1.7, 0x43322a);
  img.set(10, 5, 0x5a4234);
  // Хеліцери.
  img.set(15, 5, P.black);
  img.set(15, 7, P.black);
  img.outline(P.black);
  add("spider_body", img);
  // Абстрактна пляма для режиму арахнофобії (§15): той самий габарит, без ніг і очей.
  const blob = new Img(14, 14);
  blob.fill((x, y) => (Math.hypot(x + 0.5 - 7, y + 0.5 - 7) < 5.5 + ((x * 7 + y * 3) % 3) * 0.3 ? P.ink : undefined));
  blob.disc(9, 7, 2, P.shadow);
  add("spider_blob", blob);
}

export function buildChars(add) {
  players(add);
  spider(add);
}
