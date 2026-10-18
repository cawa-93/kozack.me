// Іконки інвентаря (§12.4, §11.4): 16 × 16, предмет збоку — так, як його впізнають в інвентарі,
// а не згори, як він лежить у світі. Обведення додається автоматично.
// Стани: звичайний, увімкнений (_lit) і вичерпаний (_spent); у сітках — символи-замінники.

import { Img, PAL as P, fromGrid } from "./lib.mjs";

const IK = {
  k: P.ink,
  K: P.black,
  m: P.metal0,
  M: P.metal1,
  n: P.metal2,
  N: P.metal3,
  d: P.wood1,
  w: P.wood2,
  W: P.wood3,
  T: P.wood4,
  t: P.tan,
  r: P.blood1,
  R: P.blood2,
  o: P.fire0,
  f: P.fire1,
  F: P.fire2,
  y: P.fire3,
  g: P.green0,
  G: P.green1,
  a: P.moss1,
  A: P.moss2,
  h: P.moss0,
  s: P.stone1,
  x: P.stone2,
  S: P.stone3,
  b: P.stone4,
  B: P.parchment,
  e: P.deep,
  u: P.sky1,
  v: P.water1,
  V: P.water2,
  c: 0x9fc3d6,
};

/** Сітка з підстановками символів (замінники станів) → спрайт з обведенням. */
function icon(rows, subs = {}) {
  const r = rows.map((row) => [...row].map((ch) => subs[ch] ?? ch).join(""));
  return fromGrid(r, IK).outline(P.black);
}

/** Замінити рядки сітки (номер → новий рядок). */
const withRows = (rows, patch) => rows.map((row, i) => patch[i] ?? row);

const FLASHLIGHT = [
  "................",
  "................",
  "................",
  "................",
  "..........MnnN..",
  "..........MNNNL.",
  ".nnnnnnnnnMnnNL.",
  ".NNNNNNNNNMnnNL.",
  ".MMRMMMMMMMnnNL.",
  ".MMMMMMMMMMMMML.",
  ".mmmmmmmmmMmmNL.",
  "..........mmmML.",
  "..........mmmm..",
  "................",
  "................",
  "................",
];

// Ліхтар збоку: кільце-ручка, ковпак, скло в оправі, ґніт; q/Q/z — полум'я й ґніт.
const LANTERN = [
  "......nnnn......",
  ".....n....n.....",
  ".....n....n.....",
  "....mMMMMMMm....",
  "...mMNNNNNNMm...",
  "....mmmmmmmm....",
  "....dcVVVVcd....",
  "....dVVVVVVd....",
  "....dVVqqVVd....",
  "....dVqQQqVd....",
  "....dVVzzVVd....",
  "....dVVVVVVd....",
  "...mMMMMMMMMm...",
  "...mmmmmmmmmm...",
  "................",
  "................",
];

const FLARE = [
  "................",
  "................",
  ".......SS.......",
  "......xSSx......",
  "......kkkk......",
  "......rRRr......",
  "......rRRr......",
  "......rBBr......",
  "......rBrr......",
  "......rRRr......",
  "......rRRr......",
  "......rRRr......",
  "......rRRr......",
  "......rrrr......",
  "................",
  "................",
];

const FLARE_FIRE = {
  0: ".....F..y.F.....",
  1: "......FyyF......",
  2: ".....fFyyFf.....",
  3: "......oFFo......",
};

const MATCHBOX = [
  "................",
  "................",
  "......r.r.r.....",
  "......t.t.t.....",
  "..WWWWWWWWWWWW..",
  "..WTTTTTTTTTTW..",
  "..WtRRRRRRRRtW..",
  "..WtRyFFFFyRtW..",
  "..WtRRRRRRRRtW..",
  "..WttttttttttW..",
  "..WttttttttttW..",
  "..wwwwwwwwwwww..",
  "................",
  "................",
  "................",
  "................",
];

const LIGHTER = [
  "................",
  "................",
  "...........nn...",
  "...........nN...",
  "......nNNn.nN...",
  "......kNkNMnN...",
  "......nkNkMnN...",
  ".....mMMMMMmm...",
  ".....nNNNNn.....",
  ".....nNMNNn.....",
  ".....nNNMNn.....",
  ".....nNNNMn.....",
  ".....nNNNNn.....",
  ".....mnnnnm.....",
  "................",
  "................",
];

const LIGHTER_FIRE = {
  1: ".......F........",
  2: "......fyF..nn...",
  3: ".......y...nN...",
};

const BATTERY = [
  "................",
  "................",
  ".......nn.......",
  ".....mmNNmm.....",
  ".....FFFFFF.....",
  ".....FyFFFF.....",
  ".....oooooo.....",
  ".....gGGggg.....",
  ".....gGGygg.....",
  ".....gGyggg.....",
  ".....gyyyyg.....",
  ".....gGGygg.....",
  ".....gGyggg.....",
  ".....gGGggg.....",
  ".....mmmmmm.....",
  "................",
];

const JERRYCAN = [
  "................",
  "..........MM....",
  "...rrrrr..nM....",
  "..rR.R.Rr.nm....",
  "..rRRRRRRRRRr...",
  "..rRrRRRRRrRr...",
  "..rRRrRRRrRRr...",
  "..rRRRrRrRRRr...",
  "..rRRRRrRRRRr...",
  "..rRRRrRrRRRr...",
  "..rRRrRRRrRRr...",
  "..rRrRRRRRrRr...",
  "..rRRRRRRRRRr...",
  "..rrrrrrrrrrr...",
  "................",
  "................",
];

const DYNAMO = [
  "................",
  "................",
  "................",
  "................",
  "..........nNN...",
  "..hhhhhhhhnNNL..",
  ".hAAAAAAAAhMNL..",
  ".hAkAkAkAAhMNL..",
  ".hAAAAAAAAhMNL..",
  ".haaaaaaaahMNL..",
  "..hhhhhhhhnNNL..",
  "....M.....nNN...",
  "....M...........",
  "....MMMMM.......",
  "........WW......",
  "................",
];

const ANTIDOTE = [
  "................",
  ".......ww.......",
  ".......WW.......",
  "......bccb......",
  "......bccb......",
  ".....bccccb.....",
  "....bgGGGGgb....",
  "...bgGGuGGGgb...",
  "...bgGGGGGGgb...",
  "...bgGGGGGGgb...",
  "...bggGGGGggb...",
  "....bggggggb....",
  ".....bbbbbb.....",
  "................",
  "................",
  "................",
];

/** Промінь, що б'є з лінзи: світлі пікселі праворуч від неї (стан «увімкнений»). */
function beam(rows, lens) {
  return rows.map((row) => {
    const i = row.indexOf(lens);
    return i >= 0 && i + 1 < row.length ? row.slice(0, i + 1) + "F" + row.slice(i + 2) : row;
  });
}

export function buildIcons(add) {
  add("icon_flashlight", icon(FLASHLIGHT, { L: "c" }));
  add("icon_flashlight_lit", icon(beam(FLASHLIGHT, "L"), { L: "y" }));
  add("icon_flashlight_spent", icon(FLASHLIGHT, { L: "e" }));

  add("icon_gasLamp", icon(LANTERN, { q: "V", Q: "V", z: "k" }));
  add("icon_gasLamp_lit", icon(LANTERN, { V: "f", c: "F", q: "F", Q: "y", z: "y" }));
  add("icon_gasLamp_spent", icon(LANTERN, { V: "e", c: "x", q: "e", Q: "e", z: "k" }));

  add("icon_flare", icon(FLARE));
  add("icon_flare_lit", icon(withRows(FLARE, FLARE_FIRE)));
  add("icon_flare_spent", icon(FLARE, { r: "e", R: "x", B: "s", S: "k", x: "k" }));

  add("icon_matchbook", icon(MATCHBOX));
  add("icon_matchbook_lit", icon(withRows(MATCHBOX, { 0: "......F.........", 1: ".....fyf........", 2: "......y.r.r....." })));
  add("icon_matchbook_spent", icon(withRows(MATCHBOX, { 2: "................", 3: "................" }), { W: "w", T: "W", t: "d", R: "r", y: "d", F: "d" }));

  add("icon_lighter", icon(LIGHTER));
  add("icon_lighter_lit", icon(withRows(LIGHTER, LIGHTER_FIRE)));
  add("icon_lighter_spent", icon(LIGHTER, { N: "x", n: "s", M: "s" }));

  add("icon_battery", icon(BATTERY));
  add("icon_battery_spent", icon(BATTERY, { g: "s", G: "x", y: "e", F: "x", o: "s" }));

  add("icon_fuel", icon(JERRYCAN));
  add("icon_fuel_spent", icon(JERRYCAN, { R: "w", r: "d" }));

  add("icon_dynamo", icon(DYNAMO, { L: "c" }));
  add("icon_dynamo_lit", icon(beam(DYNAMO, "L"), { L: "y" }));

  add("icon_antidote", icon(ANTIDOTE));
}

// ======================= елементи інтерфейсу інвентаря (§12.4) =======================

const SKIN = [0x8a6048, 0xb58f72, 0xd4ae8c];
const BRASS = [0x6e5226, 0xa07a38, 0xd0b060];

/** Відкрита долоня пальцями вгору — знак «рука». */
function hand() {
  const img = new Img(16, 16);
  const [s0, s1, s2] = SKIN;
  // Пальці: вказівний, середній, безіменний, мізинець; права колонка кожного — тінь між пальцями.
  for (const [x, top] of [
    [5, 3],
    [7, 1],
    [9, 2],
    [11, 4],
  ]) {
    img.rect(x, top, 2, 8 - top, s1);
    img.set(x, top, s2);
    img.rect(x + 1, top + 1, 1, 7 - top, s0);
  }
  img.rect(5, 7, 8, 6, s1); // долоня
  img.rect(5, 7, 1, 6, s2);
  img.rect(12, 8, 1, 5, s0);
  img.line(6, 10, 9, 9, s0); // лінія на долоні
  img.line(2, 8, 4, 11, s1); // великий палець
  img.line(3, 8, 5, 11, s1);
  img.set(2, 8, s2);
  img.rect(6, 13, 6, 2, P.stone1); // рукав
  img.rect(6, 13, 6, 1, P.stone2);
  return img.outline(P.black);
}

/** Шкіряний рюкзак із клапаном, пряжкою й лямками — знак «рюкзак». */
function backpack() {
  const img = new Img(16, 16);
  img.rect(6, 1, 4, 1, P.wood1); // ручка-петля
  img.rect(5, 2, 1, 2, P.wood1);
  img.rect(10, 2, 1, 2, P.wood1);
  img.rect(3, 4, 10, 11, P.wood2); // корпус
  img.rect(3, 4, 1, 11, P.wood3);
  img.rect(12, 4, 1, 11, P.wood1);
  img.rect(3, 14, 10, 1, P.wood1);
  img.rect(3, 4, 10, 5, P.wood3); // клапан
  img.rect(3, 4, 10, 1, P.wood4);
  img.rect(3, 8, 10, 1, P.wood1);
  img.rect(7, 8, 2, 2, BRASS[1]); // пряжка
  img.set(7, 8, BRASS[2]);
  img.rect(5, 9, 1, 5, P.wood1); // лямки
  img.rect(10, 9, 1, 5, P.wood1);
  img.rect(1, 9, 2, 5, P.wood2); // бокова кишеня
  img.rect(13, 9, 2, 5, P.wood2);
  return img.outline(P.black);
}

/** Кайдани: два залізні браслети з замочками, між ними — ланцюг із виразних ланок. */
function handcuffs() {
  const img = new Img(20, 15);
  const ring = (cx, cy) =>
    img.fill((x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > 3.9 || d < 2.1) return undefined;
      if (dx + dy < -1.8) return P.metal3;
      if (dx + dy > 1.8) return P.metal0;
      return P.metal2;
    });
  ring(4, 6.5);
  ring(16, 6.5);
  // Замочки під браслетами (з шпариною).
  for (const x of [2, 14]) {
    img.rect(x, 10, 4, 3, P.metal1);
    img.rect(x, 10, 4, 1, P.metal2);
    img.set(x + 2, 11, P.ink);
  }
  // Ланцюг: пласка ланка — кругла ланка — пласка ланка.
  const put = (x, y, c) => img.alpha(x, y) === 0 && img.set(x, y, c);
  put(8, 6, P.metal1);
  put(8, 7, P.metal0);
  for (const [x, y] of [[9, 5], [10, 5], [11, 5], [9, 6], [11, 6], [9, 7], [11, 7], [9, 8], [10, 8], [11, 8]]) put(x, y, y === 5 ? P.metal3 : y === 8 ? P.metal0 : P.metal2);
  put(12, 6, P.metal1);
  put(12, 7, P.metal0);
  return img.outline(P.black);
}

/** Навісний замок: слот рюкзака заблоковано. */
function padlock() {
  const img = new Img(12, 12);
  img.fill((x, y) => {
    const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 5);
    return y < 6 && d <= 3.6 && d >= 2.2 ? (x < 6 ? P.metal3 : P.metal2) : undefined;
  });
  img.rect(2, 5, 8, 6, BRASS[1]);
  img.rect(2, 5, 8, 1, BRASS[2]);
  img.rect(2, 5, 1, 6, BRASS[2]);
  img.rect(9, 6, 1, 5, BRASS[0]);
  img.rect(2, 10, 8, 1, BRASS[0]);
  img.set(5, 7, P.ink);
  img.set(6, 7, P.ink);
  img.rect(5, 8, 1, 2, P.ink);
  return img.outline(P.black);
}

/** Ланцюг, що повторюється по горизонталі: кругла ланка й пласка. */
function chainTile() {
  const img = new Img(10, 5);
  for (const [x, y] of [[1, 0], [2, 0], [3, 0]]) img.set(x, y, P.metal3);
  for (const [x, y] of [[0, 1], [0, 2], [0, 3], [4, 1], [4, 2], [4, 3]]) img.set(x, y, P.metal2);
  for (const [x, y] of [[1, 4], [2, 4], [3, 4]]) img.set(x, y, P.metal0);
  img.rect(5, 2, 5, 1, P.metal1);
  img.rect(6, 1, 3, 1, P.metal2);
  img.rect(6, 3, 3, 1, P.metal0);
  return img;
}

const DIGITS = {
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."],
};

/** Клавіша з цифрою (§1.3: зображення клавіші, а не підпис). */
function keycap(n) {
  const img = new Img(9, 9);
  img.rect(0, 0, 9, 8, P.stone3);
  img.rect(0, 0, 9, 1, P.stone4);
  img.rect(0, 7, 9, 2, P.stone1);
  DIGITS[n].forEach((row, y) => [...row].forEach((c, x) => c === "#" && img.set(3 + x, 1 + y, P.ink)));
  return img.outline(P.black);
}

export function buildUi(add) {
  add("ui_hand", hand());
  add("ui_backpack", backpack());
  add("ui_handcuffs", handcuffs());
  add("ui_lock", padlock());
  add("ui_chain", chainTile());
  for (const n of [1, 2, 3]) add(`ui_key_${n}`, keycap(n));
}
