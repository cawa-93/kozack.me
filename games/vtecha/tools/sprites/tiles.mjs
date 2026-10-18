// Тайли й статичний декор рівнів (§11.2, §11.4): 16 × 16 пікселів на тайл.
// Підлога й стіни — процедурно за seed із дизерингом, дрібні речі — піксельними сітками.

import { Img, PAL as P, fbm, fromGrid, hash2, ramp } from "./lib.mjs";

const S = 16;

// Палітри тем (індекс = рівень − 1).
const THEME = [
  // 1 — склад: бетонна підлога, побілена цегла.
  { floor: [P.conc0, P.conc1, P.conc2, P.conc3], wall: [P.lime0, P.lime1, P.lime2], mortar: P.conc2, face: [P.lime3, P.lime2], dark: P.conc0 },
  // 2 — підземелля замку: тесані плити й блоки.
  { floor: [P.slate0, P.slate1, P.slate2, P.slate3], wall: [P.slate0, P.slate1, P.slate2], mortar: P.ink, face: [P.slate4, P.slate3], dark: P.ink },
  // 3 — занедбане підземелля: те саме, темніше, з мохом і водою.
  { floor: [P.shadow, P.slate0, P.slate1, P.slate2], wall: [P.shadow, P.slate0, P.slate1], mortar: P.black, face: [P.slate3, P.slate2], dark: P.ink },
  // 4 — печера: ґрунт і скеля.
  { floor: [P.soil0, P.soil1, P.soil2, P.soil3], wall: [P.ink, P.rock0, P.rock1, P.rock2], mortar: P.black, face: [P.rock3, P.rock2], dark: P.black },
  // 5 — глибока печера: темна органіка.
  { floor: [P.vio0, P.soil0, P.vio1, P.vio2], wall: [P.black, P.ink, P.rock0, P.vio1], mortar: P.black, face: [P.vio3, P.vio2], dark: P.black },
];

// ======================= підлога =======================

function crack(img, seed, color) {
  const r = (i) => hash2(seed, i, 91);
  let x = Math.floor(r(0) * S);
  let y = 0;
  let dx = r(1) < 0.5 ? 1 : -1;
  for (let i = 0; i < 22; i++) {
    img.set(x, y, color);
    if (r(10 + i) < 0.3) x += dx;
    else if (r(40 + i) < 0.15) dx = -dx;
    y++;
    if (y >= S || x < 0 || x >= S) break;
  }
}

function floorConcrete(v) {
  const t = THEME[0];
  const img = new Img(S, S);
  img.fill((x, y) => ramp(t.floor, 0.35 + (fbm(x, y, 300 + v) - 0.5) * 0.6, x, y));
  // Шви між плитами: одна лінія на тайл, щоб на стиках не було подвійних.
  for (let i = 0; i < S; i++) {
    img.set(i, 0, P.conc0);
    img.set(0, i, P.conc0);
  }
  for (let i = 0; i < 10; i++) img.set(1 + Math.floor(hash2(v, i, 5) * 14), 1 + Math.floor(hash2(v, i, 6) * 14), hash2(v, i, 7) < 0.5 ? P.conc3 : P.conc0);
  if (v === 1) crack(img, 17, P.conc0);
  if (v === 2) {
    // Пляма мастила: плоска, витягнута, без чорного ядра (щоб не нагадувала павука).
    img.fill((x, y) => {
      const d = Math.hypot((x - 8) * 0.7, y - 9) + (fbm(x, y, 55) - 0.5) * 3;
      if (d < 2.5) return P.conc0;
      if (d < 3.8 && (x + y) % 2 === 0) return P.conc0;
      return undefined;
    });
  }
  return img;
}

/** Плити 2 × 2 по 8 пікселів (рівні 2–3); worn — тріщини й мох. */
function floorFlags(ti, v, worn) {
  const t = THEME[ti];
  const img = new Img(S, S);
  const off = v % 2 === 0 ? 0 : 4;
  img.fill((x, y) => {
    const row = y < 8 ? 0 : 1;
    const sx = (x + (row ? off : 0)) % S;
    const stone = row * 2 + (sx < 8 ? 0 : 1);
    const lx = sx % 8;
    const ly = y % 8;
    if (lx === 0 || ly === 0) return t.floor[0];
    const base = 0.35 + hash2(stone, v, 20 + ti) * 0.3 + (fbm(x, y, 400 + v + ti * 10) - 0.5) * 0.35;
    if (lx === 1 || ly === 1) return ramp(t.floor, base + 0.25, x, y); // освітлений край
    if (lx === 7 || ly === 7) return ramp(t.floor, base - 0.2, x, y);
    return ramp(t.floor, base, x, y);
  });
  if (worn) {
    if (v !== 3) crack(img, 30 + v, t.floor[0]);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(hash2(v, i, 60) * S);
      const y = Math.floor(hash2(v, i, 61) * S);
      if (hash2(v, i, 62) < 0.6) img.set(x, y, hash2(v, i, 63) < 0.5 ? P.moss1 : P.moss2);
    }
    if (v === 3) {
      // Калюжа.
      img.fill((x, y) => {
        const d = Math.hypot(x - 8, (y - 9) * 1.6) + (fbm(x, y, 77) - 0.5) * 4;
        if (d < 3) return (x + y) % 5 === 0 ? P.water2 : P.water1;
        if (d < 4.5) return P.water0;
        return undefined;
      });
    }
  }
  return img;
}

function floorSoil(ti, v) {
  const t = THEME[ti];
  const img = new Img(S, S);
  img.fill((x, y) => ramp(t.floor, 0.3 + (fbm(x, y, 500 + v + ti * 10, [6, 3, 2]) - 0.5) * 0.9, x, y));
  // Камінці: світлий піксель із тінню знизу.
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(hash2(v, i, 70 + ti) * 13);
    const y = 1 + Math.floor(hash2(v, i, 71 + ti) * 13);
    img.set(x, y, ti === 3 ? P.rock3 : P.vio3);
    img.set(x + 1, y, ti === 3 ? P.rock2 : P.vio2);
    img.set(x, y + 1, t.floor[0]);
  }
  if (ti === 3 && v === 2) for (let i = 0; i < 4; i++) img.set(Math.floor(hash2(i, 3, 80) * S), Math.floor(hash2(i, 4, 80) * S), P.teal1);
  if (ti === 4 && v === 3) {
    // Уламок кістки.
    img.line(4, 9, 9, 7, P.bone);
    img.set(3, 9, P.bone);
    img.set(10, 7, P.bone);
  }
  return img;
}

function floor(ti, v) {
  if (ti === 0) return floorConcrete(v);
  if (ti === 1) return floorFlags(1, v, false);
  if (ti === 2) return floorFlags(2, v, true);
  return floorSoil(ti, v);
}

// ======================= стіни =======================

/** Кладка рядами: висоти рядів, ширина каменя, зсув парних рядів. */
function masonry(ti, v, rows, width, stagger, extra) {
  const t = THEME[ti];
  const img = new Img(S, S);
  const rowOf = (y) => {
    let acc = 0;
    for (let r = 0; r < rows.length; r++) {
      if (y < acc + rows[r]) return [r, y - acc, rows[r]];
      acc += rows[r];
    }
    return [rows.length - 1, 0, 1];
  };
  img.fill((x, y) => {
    const [r, ly, rh] = rowOf(y);
    const sx = x + (r % 2 ? stagger : 0);
    const block = Math.floor(sx / width);
    const lx = ((sx % width) + width) % width;
    if (lx === 0 || ly === rh - 1) return t.mortar;
    const base = 0.3 + hash2(block * 7 + r, v, 30 + ti) * 0.45 + (fbm(x, y, 600 + v + ti * 10) - 0.5) * 0.3;
    if (ly === 0) return ramp(t.wall, base + 0.3, x, y);
    return ramp(t.wall, base, x, y);
  });
  extra?.(img);
  return img;
}

function rock(ti, v) {
  const t = THEME[ti];
  const img = new Img(S, S);
  img.fill((x, y) => {
    const n = fbm(x, y, 700 + v + ti * 10, [8, 4, 2]);
    if (n < 0.3) return t.mortar; // ущелини
    return ramp(t.wall, (n - 0.3) * 1.5, x, y);
  });
  if (ti === 4 && v !== 1) {
    // Павутинні нашарування на стінах (§11.2, рівень 5).
    img.line(0, 3 + v, 15, 9 - v, P.stone1);
    img.line(3, 0, 9, 15, P.stone0);
  }
  return img;
}

function wall(ti, v) {
  if (ti === 0)
    return masonry(0, v, [4, 4, 4, 4], 8, 4, (img) => {
      // Побілка місцями обсипалась — видно цеглу.
      if (v === 1) img.fill((x, y) => (Math.hypot(x - 11, y - 5) < 2.6 && (x + y) % 3 !== 0 ? P.brick : undefined));
    });
  if (ti === 1) return masonry(1, v, [5, 5, 6], 8, 4);
  if (ti === 2)
    return masonry(2, v, [5, 5, 6], 8, 4, (img) => {
      crack(img, 50 + v, P.ink);
      for (let i = 0; i < 6; i++) img.set(Math.floor(hash2(v, i, 90) * S), 11 + Math.floor(hash2(v, i, 91) * 5), P.moss1);
    });
  return rock(ti, v);
}

/** Освітлена грань стіни з боку прохідного тайла: смуга 3 пікселі з дизерингом (§7.2, «Стіни на межі зору»). */
function edge(ti) {
  const t = THEME[ti];
  const img = new Img(S, S);
  for (let x = 0; x < S; x++) {
    img.set(x, 0, t.face[0]);
    img.set(x, 1, t.face[1]);
  }
  return img;
}

// ======================= особливі тайли =======================

/** Отвір павука (§5.2): кладка з боків, вузький пролом посередині, бахрома павутини. Стіна тягнеться вздовж x. */
function hole(ti) {
  const t = THEME[ti];
  const img = new Img(S, S);
  const w = wall(ti, 0);
  for (let y = 0; y < S; y++) {
    const jag = Math.floor(hash2(y, ti, 99) * 2);
    for (let x = 0; x < 5 + jag; x++) img.set(x, y, w.get(x, y));
    for (let x = 11 - jag; x < S; x++) img.set(x, y, w.get(x, y));
    img.set(5 + jag, y, t.face[1]);
    img.set(10 - jag, y, t.face[1]);
  }
  // Бахрома павутини — тьмяна, щоб не сперечатися з павутинним тайлом.
  for (const y0 of [3, 10]) img.line(6, y0, 9, y0 + 2, P.stone3);
  img.set(7, 7, P.stone2);
  img.set(8, 13, P.stone2);
  return img;
}

/** Ґрати камери (§5.4.1): поперечина й 4 прути там само, де їхні тіні (CELL_BAR_POS). */
function bars() {
  const img = new Img(S, S);
  for (let x = 0; x < S; x++) {
    img.set(x, 7, P.metal0);
    img.set(x, 8, P.metal0);
  }
  for (const p of [0.12, 0.37, 0.62, 0.87]) {
    const cx = Math.round(p * S);
    img.rect(cx - 1, 6, 2, 4, P.metal1);
    img.set(cx - 1, 6, P.metal3);
    img.set(cx - 1, 7, P.metal2);
    img.set(cx, 9, P.metal0);
  }
  return img;
}

/** Пролом назовні (§5.5), назовні — ліворуч: небо, трава, рвані краї кладки. */
function breach() {
  const img = new Img(S, S);
  const cols = [P.sky1, P.sky1, P.sky1, P.sky0, P.sky0, P.sky0, P.sky0, P.grass1, P.grass1, P.grass0, P.grass1, P.grass0, P.vio1, P.vio1, P.soil0, P.soil0];
  img.fill((x, y) => {
    if (x >= 7 && x <= 11 && hash2(x, y, 5) < 0.25) return x < 9 ? P.grass0 : P.grass1;
    return cols[x];
  });
  const w = wall(4, 2);
  for (let x = 0; x < S; x++) {
    const top = 2 + Math.floor(hash2(x, 1, 44) * 3);
    const bot = 2 + Math.floor(hash2(x, 2, 44) * 3);
    for (let y = 0; y < top; y++) img.set(x, y, w.get(x, y));
    for (let y = S - bot; y < S; y++) img.set(x, y, w.get(x, y));
    img.set(x, top, P.vio3);
  }
  for (let i = 0; i < 5; i++) img.set(12 + Math.floor(hash2(i, 0, 46) * 3), 3 + Math.floor(hash2(i, 1, 46) * 10), P.rock2);
  return img;
}

function exitHatch() {
  return fromGrid(
    [
      "................",
      "..wWWWWWWWWWWw..",
      "..wWWWWWWWWWWw..",
      "..dddddddddddd..",
      "..fkkkkkkkkkkf..",
      "..fk........kf..",
      "..fk.bbbbbb.kf..",
      "..fk........kf..",
      "..fk.bbbbbb.kf..",
      "..fk........kf..",
      "..fk.bbbbbb.kf..",
      "..fk........kf..",
      "..fkkkkkkkkkkf..",
      "..ffffffffffff..",
      "................",
      "................",
    ],
    { w: P.wood3, W: P.wood4, d: P.wood1, f: P.wood2, k: P.black, b: P.wood0 },
  );
}

function exitStairs(ti) {
  const t = THEME[ti];
  const img = new Img(S, S);
  for (let i = 0; i < 6; i++) {
    const y0 = 2 + i * 2;
    const c = [t.floor[3], t.floor[2], t.floor[1], t.floor[0], P.ink, P.black][i];
    img.rect(2, y0, 12, 2, c);
    img.rect(2, y0, 12, 1, i < 3 ? t.face[1] : c);
  }
  img.rect(1, 2, 1, 12, t.wall[0]);
  img.rect(14, 2, 1, 12, t.wall[0]);
  return img;
}

function exitCrack() {
  return fromGrid(
    [
      "................",
      "................",
      "...rk...........",
      "....kkk......r..",
      ".....kkkk..kkk..",
      "......kkkkkkk...",
      ".....kkkkkkkk...",
      "....kkkkkkkkk...",
      "...rkkkkkkkkkr..",
      "....kkkkkkkk....",
      ".....kkkk.kkk...",
      "....kkk.....kkr.",
      "...kk.........k.",
      "..r.............",
      "................",
      "................",
    ],
    { k: P.black, r: P.rock2 },
  );
}

// ======================= світильники (кріплення вгорі, світить униз) =======================

function lampElectric() {
  return fromGrid(
    [
      "................",
      "......mmmm......",
      ".....mMMMMm.....",
      ".....mffffm.....",
      "......FFFF......",
      ".......FF.......",
      "................",
    ],
    { m: P.metal0, M: P.metal1, f: P.fire2, F: P.fire3 },
  );
}

function torch(lit) {
  const rows = [
    "................",
    ".......mm.......",
    ".......ww.......",
    ".......ww.......",
    ".......ww.......",
    "......wwww......",
    lit ? "......o12o......" : "......kkkk......",
    lit ? "......1223......" : ".......kk.......",
    lit ? ".......33......." : "................",
  ];
  return fromGrid(rows, { m: P.metal0, w: P.wood2, k: P.ink, o: P.fire0, 1: P.fire1, 2: P.fire2, 3: P.fire3 });
}

function mushrooms(dim) {
  const a = dim ? P.teal1 : P.teal2;
  const b = dim ? P.teal2 : P.glow;
  return fromGrid(
    [
      "................",
      "....aa....a.....",
      "...abba..aba....",
      "....aa....s.....",
      ".....s...aa.....",
      "....aba.abba....",
      ".....a...aa.....",
    ],
    { a, b, s: P.teal0 },
  );
}

// ======================= полиця складу (§5.7) — вздовж x =======================

function shelf() {
  const img = new Img(S, S);
  // Дошка: рідкі планки, крізь проміжки видно підлогу.
  for (let y = 4; y <= 11; y++) for (let x = 0; x < S; x++) if ((x + y * 3) % 4 === 0) img.set(x, y, P.wood1);
  for (let x = 0; x < S; x++) {
    img.set(x, 2, P.wood3);
    img.set(x, 3, P.wood2);
    img.set(x, 13, P.wood2);
    img.set(x, 12, P.wood3);
  }
  // Стояки на кінцях — там само, де їхні тіні (POSTS у maze/shelves.ts).
  for (const x of [0, 14]) for (const y of [2, 12]) img.rect(x, y, 2, 2, P.wood0);
  return img;
}

// ======================= декор =======================

const DECOR = {
  // Склад: піддон із ящиком під стіною.
  pallet: [
    "................",
    ".wwwwwwwwwwwwww.",
    ".d..d..d..d..d..",
    ".wwwwwwwwwwwwww.",
    ".d..d..d..d..d..",
    ".wwwwwwwwwwwwww.",
  ],
  crate: [
    "ccccccc",
    "cCCCCCc",
    "cCtttCc",
    "cCCCCCc",
    "cCtttCc",
    "cCCCCCc",
    "ccccccc",
  ],
  cornerweb: [
    "xxxxxxxx",
    "x..x..x.",
    "x.x..x..",
    "xx..x...",
    "x..x....",
    "x.x.....",
    "xx......",
    "x.......",
  ],
  chain: ["m", "M", "m", "M", "m", "M", "m", "M"],
  cocoon: [".bb.", "bBBb", "bBwb", "bBBb", "bBwb", "bBBb", ".bb."],
  chitin: ["k..k.", ".k...", "...kk", "k.k.."],
  stalagmite: ["..r...", ".rR...", ".rRr..", "rRRrr.", "rRRRr.", ".kkkk."],
  bones: ["K......K", ".KbbbbK.", "K......K", "....K...", "...KbK..", "....K..."],
  // Камера (§5.4.1): нари, відро, миска, насічки.
  bucket: [".mmmm.", "mMkkMm", "mMkkMm", "mMMMMm", ".mmmm."],
  bowl: [".bbb.", "bBkBb", ".bbb."],
  tally: ["w.w.w.w.w", "w.w.w.w.w", "w.w.w.w.w", "wwwwwwwww", "w.w.w.w.w", "w.w.w.w.w"],
};

const DECOR_KEY = {
  w: P.wood3,
  d: P.wood1,
  c: P.wood1,
  C: P.wood3,
  t: P.tan,
  m: P.metal0,
  M: P.metal1,
  b: P.bone,
  B: P.parchment,
  k: P.ink,
  K: P.stone3,
  x: P.stone2,
  r: P.rock2,
  R: P.rock3,
};

function bunk() {
  const img = new Img(8, 28);
  img.rect(0, 0, 8, 28, P.wood2);
  for (let y = 0; y < 28; y += 5) img.rect(0, y, 8, 1, P.wood0);
  img.rect(0, 0, 1, 28, P.wood1);
  img.rect(7, 0, 1, 28, P.wood1);
  img.rect(1, 1, 6, 5, P.stone2); // зім'ята ковдра
  img.rect(2, 2, 4, 2, P.stone3);
  return img;
}

export function buildTiles(add) {
  for (let ti = 0; ti < 5; ti++) {
    for (let v = 0; v < 4; v++) add(`floor_${ti}_${v}`, floor(ti, v));
    for (let v = 0; v < 3; v++) add(`wall_${ti}_${v}`, wall(ti, v));
    const e = edge(ti);
    add(`edge_${ti}_n`, e);
    add(`edge_${ti}_e`, e.rot90(1));
    add(`edge_${ti}_s`, e.rot90(2));
    add(`edge_${ti}_w`, e.rot90(3));
    const h = hole(ti);
    add(`hole_${ti}_h`, h); // стіна тягнеться вздовж x
    add(`hole_${ti}_v`, h.rot90(1));
  }
  add("bars", bars());
  const b = breach();
  add("breach_l", b);
  add("breach_r", b.flipX());
  add("exit_hatch", exitHatch());
  add("exit_stairs_1", exitStairs(1));
  add("exit_stairs_2", exitStairs(2));
  add("exit_crack", exitCrack());
  add("lamp_electric", lampElectric());
  add("torch_lit", torch(true));
  add("torch_dead", torch(false));
  add("mushroom_3", mushrooms(false));
  add("mushroom_4", mushrooms(true));
  const sh = shelf();
  add("shelf_x", sh);
  add("shelf_y", sh.rot90(1));
  for (const [name, rows] of Object.entries(DECOR)) add(`decor_${name}`, fromGrid(rows, DECOR_KEY));
  add("decor_bunk", bunk());
}
