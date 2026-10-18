// Змінні об'єкти (§11.4): предмети, двері, павутина, сірники, плювок.
// Предмети дивляться «вперед» праворуч (+x): у руці їх повертають за поглядом.

import { Img, PAL as P, fromGrid, hash2 } from "./lib.mjs";

// Спільний ключ символів для піксельних сіток предметів.
const K = {
  k: P.ink,
  K: P.black,
  m: P.metal0,
  M: P.metal1,
  n: P.metal2,
  N: P.metal3,
  d: P.wood1,
  w: P.wood2,
  W: P.wood3,
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
  S: P.stone3,
  b: P.stone4,
  B: P.parchment,
  u: P.sky1,
  v: P.water1,
  V: P.water2,
  e: P.deep,
  L: P.metal3,
};

/** Предмет у трьох станах: звичайний, увімкнений (lit), вичерпаний (spent); зміни — підстановки символів. */
function variants(add, name, rows, lit, spent) {
  add(`item_${name}`, fromGrid(rows, K));
  const sub = (map) => rows.map((r) => [...r].map((c) => map[c] ?? c).join(""));
  if (lit) add(`item_${name}_lit`, fromGrid(lit.rows ?? sub(lit), K));
  if (spent) add(`item_${name}_spent`, fromGrid(spent.rows ?? sub(spent), K));
}

function items(add) {
  // Динамо-ліхтар: оливковий корпус, лінза праворуч, ручка генератора знизу.
  variants(
    add,
    "dynamo",
    [".hhhhhh..", "haAAAAahn", "hAkkAAahL", "haAAAAahn", ".hhhhhh..", "...M.....", "...MM...."],
    { L: "y", n: "F" },
    null,
  );
  // Ліхтарик: темний корпус, розширена голова, лінза.
  variants(
    add,
    "flashlight",
    ["..........", ".mmmmmMnn.", "mMMMMMMnNS", "mMsMMMMnNS", ".mmmmmMnn.", ".........."],
    { S: "u", N: "u" },
    { S: "k", N: "M" },
  );
  // Газова лампа згори: оправа, скло, полум'я.
  variants(
    add,
    "gasLamp",
    ["..ddd..", ".dsSsd.", "dsSbSsd", "dSbbbSd", "dsSbSsd", ".dsSsd.", "..ddd.."],
    { s: "f", S: "F", b: "y" },
    { s: "e", S: "k", b: "K" },
  );
  // Сигнальна шашка: червоний корпус, темний ковпачок; запалена — іскри з кінця.
  variants(
    add,
    "flare",
    ["..........", "sSrRRRRRk.", "sSrrrrrrk.", ".........."],
    { rows: ["........F.", "sSrRRRRRoy", "sSrrrrrrfF", "........y."] },
    { rows: ["..........", "sskeekeeK.", "sskkekkkK.", ".........."] },
  );
  // Пачка сірників; запалена — сірник горить над пачкою.
  variants(
    add,
    "matchbook",
    ["tttttt", "tWWWWt", "rrrrrr", "tWWWWt", "tttttt"],
    { rows: ["....fy", "...t..", "tttttt", "tWWWWt", "rrrrrr", "tWWWWt", "tttttt"] },
    { t: "w", W: "d", r: "d" },
  );
  // Запальничка з відкинутою кришкою; запалена — язичок полум'я.
  variants(
    add,
    "lighter",
    [".....", "....n", "NNNNn", "NnnnN", "NMMMN", "NnnnN", "NNNNn"],
    { rows: ["...F.", "..fyn", "NNNNn", "NnnnN", "NMMMN", "NnnnN", "NNNNn"] },
    { N: "s", n: "k", M: "e" },
  );
  // Батарейка: зелений циліндр із жовтою смугою й полюсом.
  variants(add, "battery", ["FgGGGGgn", "FgggggGn", "FgGGGGgn"], null, { F: "s", g: "e", G: "s", n: "M" });
  // Пальне: невелика червона каністра з етикеткою й носиком.
  variants(add, "fuel", ["...kkk", ".rrrrk", "rRRRRr", "rRFFRr", "rRFFRr", "rRRRRr", ".rrrr."], null, { R: "d", r: "w", F: "d" });
  // Протиотрута: флакон із зеленою рідиною й коркою.
  add("item_antidote", fromGrid([".w.", "bBb", "bGb", "bGb", "bGb", ".b."], K));
  // Кайданки.
  add("item_handcuffs", fromGrid([".nnn.nnn.", "n...M...n", "n.......n", ".nnn.nnn."], K));
}

// ======================= двері (16 × 16; прохід уздовж y, полотно — уздовж x) =======================

/** Камінь завалу: диск з освітленим верхнім лівим боком, тінню внизу праворуч і темним обведенням. */
function boulder(img, cx, cy, r, base, light, dark) {
  img.fill((x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) return undefined;
    if (d > r - 1) return P.ink;
    if (dx + dy < -r * 0.6) return light;
    if (dx + dy > r * 0.5) return dark;
    return base;
  });
}

function doors(add) {
  // Дерев'яні: полотно з дощок поперек проходу, одвірки біля стін, залізні смуги й кільце.
  const wood = new Img(16, 16);
  wood.rect(0, 4, 2, 8, P.wood0); // одвірки
  wood.rect(14, 4, 2, 8, P.wood0);
  wood.rect(1, 4, 1, 8, P.wood1);
  wood.rect(14, 4, 1, 8, P.wood1);
  wood.rect(2, 4, 12, 8, P.ink); // обведення полотна
  wood.rect(2, 5, 12, 6, P.wood3);
  wood.rect(2, 5, 12, 1, P.wood4);
  wood.rect(2, 10, 12, 1, P.wood1);
  for (const x of [5, 8, 11]) wood.rect(x, 6, 1, 4, P.wood2); // шви між дошками
  for (const y of [6, 9]) {
    wood.rect(2, y, 12, 1, P.metal0); // залізні смуги
    for (const x of [3, 7, 12]) wood.set(x, y, P.metal2); // заклепки
  }
  wood.set(10, 7, P.metal2); // кільце-ручка
  wood.set(11, 7, P.metal3);
  wood.set(10, 8, P.metal1);
  wood.set(11, 8, P.metal2);
  add("door_wood_closed", wood);
  // Відчинені: полотно притиснуте до лівої стіни, одвірки лишаються.
  const woodOpen = new Img(16, 16);
  woodOpen.rect(0, 1, 5, 14, P.ink);
  woodOpen.rect(0, 2, 4, 12, P.wood3);
  woodOpen.rect(0, 2, 1, 12, P.wood4);
  woodOpen.rect(3, 2, 1, 12, P.wood1);
  for (const y of [5, 10]) woodOpen.rect(0, y, 4, 1, P.metal0);
  woodOpen.rect(14, 4, 2, 8, P.wood0);
  woodOpen.rect(14, 4, 1, 8, P.wood1);
  add("door_wood_open", woodOpen);

  // Ґрати: прути там само, де їхні тіні (GRATE_BAR_POS у maze/grid.ts), кріплення біля стін.
  const pos = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => Math.round(p * 16) - 1);
  const grate = new Img(16, 16);
  grate.rect(0, 7, 16, 2, P.metal0);
  for (const x of pos) {
    grate.rect(x, 6, 2, 4, P.metal1);
    grate.rect(x, 7, 2, 2, P.metal2);
    grate.set(x, 6, P.metal3);
  }
  add("door_grate_closed", grate);
  const grateOpen = new Img(16, 16);
  grateOpen.rect(0, 0, 2, 16, P.metal0);
  for (const y of pos) {
    grateOpen.rect(0, y, 2, 2, P.metal1);
    grateOpen.set(0, y, P.metal2);
  }
  add("door_grate_open", grateOpen);

  // Завал: крупні камені з обведенням і світлом згори зліва, між ними — дрібний щебінь.
  const rubble = new Img(16, 16);
  for (let i = 0; i < 14; i++) rubble.set(1 + Math.floor(hash2(i, 8, 7) * 14), 1 + Math.floor(hash2(i, 9, 7) * 14), i % 2 ? P.stone2 : P.stone1);
  const rocks = [
    [4, 4, 3.6, P.stone2, P.stone4, P.stone0],
    [11.5, 3.5, 3.2, P.rock2, P.rock3, P.rock0],
    [8, 8.5, 4, P.stone1, P.stone3, P.shadow],
    [3.5, 12, 3.2, P.rock1, P.rock3, P.ink],
    [12.5, 12, 3.4, P.stone2, P.stone4, P.stone0],
    [8.5, 14, 2.2, P.brick, 0x9a5a44, P.blood0],
  ];
  for (const [cx, cy, r, base, light, dark] of rocks) boulder(rubble, cx, cy, r, base, light, dark);
  add("door_rubble_closed", rubble);
  // Розібраний: уламки біля стін, прохід чистий.
  const rubbleOpen = new Img(16, 16);
  const stones = [P.stone1, P.stone2, P.rock2, P.brick];
  for (let i = 0; i < 6; i++) {
    const side = i % 2;
    boulder(rubbleOpen, side ? 14.5 : 1.5, 2 + i * 2.4, 1.6 + hash2(i, 6, 7) * 0.6, stones[i % stones.length], P.stone3, P.shadow);
  }
  add("door_rubble_open", rubbleOpen);
}

// ======================= павутина (20 × 20, центр — центр тайла) =======================

function webs(add) {
  const W = 20;
  const c = W / 2;
  const spokes = 10;
  const spokeEnd = (i, r) => [c + Math.cos((i / spokes) * Math.PI * 2 + 0.3) * r, c + Math.sin((i / spokes) * Math.PI * 2 + 0.3) * r];

  const intact = new Img(W, W);
  for (let i = 0; i < spokes; i++) intact.line(c, c, ...spokeEnd(i, 9.5), P.web);
  for (const r of [3, 5.5, 8]) for (let i = 0; i < spokes; i++) intact.line(...spokeEnd(i, r), ...spokeEnd(i + 1, r), i % 3 === 0 ? P.stone4 : P.web);
  add("web_intact", intact);

  // Провисла: одна спиця вирвана, кільця розірвані й провисли (§10.0.1).
  const worn = new Img(W, W);
  const hole = 3;
  for (let i = 0; i < spokes; i++) if (i !== hole) worn.line(c + 1, c + 1, ...spokeEnd(i, 9), i % 2 ? P.web : P.stone4);
  for (const r of [5, 8]) for (let i = 0; i < spokes; i++) {
    if (i === hole || i + 1 === hole || i === hole + 1) continue;
    const [x0, y0] = spokeEnd(i, r);
    const [x1, y1] = spokeEnd(i + 1, r);
    worn.line(x0, y0 + 1, x1, y1 + 1, P.stone4);
  }
  add("web_worn", worn);

  // Порвана: кілька обвислих клаптів.
  const torn = new Img(W, W);
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = spokeEnd(i * 2, 8 + hash2(i, 0, 3) * 1.5);
    const [x1, y1] = spokeEnd(i * 2 + 1, 4);
    torn.line(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2 + 2, P.stone3);
  }
  add("web_torn", torn);

  // Спалена: обвуглена пляма з попелом і тліючими волокнами (§10.0.2).
  const burnt = new Img(W, W);
  burnt.fill((x, y) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) + (hash2(x, y, 9) - 0.5) * 2;
    if (d < 4.5) return P.black;
    if (d < 7.5 && (x + y) % 2 === 0) return P.ink;
    if (d < 8.5 && (x * 3 + y) % 5 === 0) return P.stone1;
    return undefined;
  });
  for (let i = 0; i < 4; i++) burnt.set(4 + Math.floor(hash2(i, 1, 11) * 12), 4 + Math.floor(hash2(i, 2, 11) * 12), i % 2 ? P.fire0 : P.stone3);
  add("web_burnt", burnt);
}

// ======================= сірники й плювок =======================

function small(add) {
  add("match_burning", fromGrid(["....F.", "ttttfy", "....F."], K));
  add("match_burnt", fromGrid(["ddddK"], K));
  // Пляма плювка: три стадії згасання (§9.4), замість прозорості — розрідження пікселів.
  for (let stage = 0; stage < 3; stage++) {
    const img = new Img(8, 7);
    img.fill((x, y) => {
      const d = Math.hypot((x - 3.5) * 1, (y - 3) * 1.3) + (hash2(x, y, 21) - 0.5) * 2;
      if (d > 3.6) return undefined;
      if (stage > 0 && hash2(x, y, 22 + stage) < stage * 0.35) return undefined;
      return d < 1.8 ? P.parchment : P.web;
    });
    add(`spit_decal_${stage}`, img);
  }
  add("spit", fromGrid([".BB.", "BBBb", "BBbb", ".bb."], K));
}

export function buildObjects(add) {
  items(add);
  doors(add);
  webs(add);
  small(add);
}
