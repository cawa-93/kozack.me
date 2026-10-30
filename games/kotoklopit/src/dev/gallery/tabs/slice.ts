// Вкладка галереї «Зріз» (крок 16, GRAPHICS_PLAN.md: контрольна точка автора після хвилі 1) — головний екран для оцінки
// стилю: еталони F1 разом і так, як їх показуватиме гра. Кухня в ізометрії з еталонів F1a (плити підлоги й стіни,
// холодильник, кігтеточка), у ній три персонажі й троє котів — скелети F4a з частин F1b, пофарбовані компонувальником F4b
// (`bake.ts`, `recipes.ts`; як у грі), що ходять на місці пробною ходою (час — повзунок шелла). Поруч — вікно спальні на
// стіні-манекені, холодильник зачинений і відчинений, іконки 64 і 32 px і парад: кожен персонаж і кіт спереду й ззаду,
// праворуч і ліворуч. 1 одиниця арту = 1 px світу, тож кнопки масштабу «як у грі» показують той самий розмір, що й гра.
//
// Не арт (так і підписано в панелі): стіна-манекен під вікном, тіні під ногами (їх малюватиме вигляд, T1/T2) і затінення
// дальніх частин (пропозиція F1b, `farRecipe`; перемикач).

import Phaser from "phaser";

import { PALETTE as ART } from "../../../../art/palette";
import { DEFAULT_LOOK } from "../../../sim/game";
import { coatOf } from "../../../sim/genetics";
import type { Genes, Look } from "../../../sim/types";
import { addArt, isArtStub, setArt } from "../../../view/art/atlas";
import { isBakedStub, releaseBaked } from "../../../view/art/bake";
import { catRecipe, farRecipe, personRecipe } from "../../../view/art/recipes";
import type { ArtId, ArtView, TintRecipe } from "../../../view/art/types";
import { CAT_TRIAL } from "../../../view/rig/anims/cat/trial";
import { PERSON_TRIAL } from "../../../view/rig/anims/person/trial";
import { CAT_FAR_SLOTS, CAT_FIT, CAT_RIG } from "../../../view/rig/defs/cat";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin } from "../../../view/rig/defs/person";
import type { RigFit } from "../../../view/rig/rigcore";
import { RigSprite, type RigBaked } from "../../../view/rig/rigsprite";
import type { RigAnim, RigDef } from "../../../view/rig/types";
import { ISO } from "../../../view/world/projection";
import { cameraZoom, HUD_HEIGHT } from "../../../view/zoom";
import { addLabel, galleryView, onGalleryView, requestGalleryZoom } from "../kit";
import { PHONE_ZOOM } from "../params";
import type { GalleryContext, GalleryTab, GalleryView } from "../tab";

type LooseRig = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;
type LooseSprite = RigSprite<string, string, string>;

// --- Хто в зрізі ---------------------------------------------------------------------------------

/** Гени за замовчуванням: чорний короткошерстий без малюнка й білого; зразок задає лише те, чим відрізняється. */
const PLAIN: Genes = {
  orange: [false],
  black: [true, true],
  dense: [true, true],
  agouti: [false, false],
  tabby: [1, 1],
  white: [0, 0],
  full: [true, true],
  short: [true, true],
  eyes: 1,
};

interface CatSample {
  title: string;
  genes: Partial<Genes>;
  /** Число кота: з нього — варіант черепахових плям. */
  seed: number;
}

/** Троє котів: рудий класичний табі (мідні очі), чорний з білим (жовті), черепахова (зелені). */
const CATS: readonly CatSample[] = [
  { title: "рудий класичний табі", genes: { orange: [true], agouti: [true, true], tabby: [0, 0], eyes: 2 }, seed: 1 },
  { title: "чорний з білим", genes: { white: [1, 1], eyes: 1 }, seed: 2 },
  { title: "черепахова", genes: { orange: [true, false], eyes: 0 }, seed: 4 },
];

interface LookSample {
  title: string;
  look: Look;
}

/**
 * Три персонажі: типова зовнішність гри (`DEFAULT_LOOK`) і ще дві. Обличчя, зачіска й статура — ті, що вже намальовані
 * (F1b: обличчя 0, коротка зачіска, звичайна статура; решту малює A10), тож у типової зовнішності зачіска коротка.
 */
const LOOKS: readonly LookSample[] = [
  { title: "типова (зачіска коротка)", look: { ...DEFAULT_LOOK, hair: 0 } },
  { title: "темна шкіра, зелений верх", look: { face: 0, skin: 3, hair: 0, hairColor: 0, eyes: 3, build: 1, top: 2, bottom: 0, shoes: 1 } },
  { title: "біляве волосся, жовтий верх", look: { face: 0, skin: 0, hair: 0, hairColor: 3, eyes: 2, build: 1, top: 3, bottom: 6, shoes: 2 } },
];

/** Хто де стоїть у кухні: клітинки квартири (кухня — (13…19) × (1…5)), ракурс і напрям. */
interface KitchenSpot {
  who: { cat: number } | { person: number };
  x: number;
  y: number;
  view: ArtView;
  flip: boolean;
}

/**
 * Як на листі F1 `sheet-all`: типовий персонаж іде ззаду до холодильника, черепахова — ззаду до кігтеточки (її голову
 * закриває стовпчик — видно глибину), рудий — спереду праворуч; ще двоє людей і чорно-білий кіт — спереду.
 */
const KITCHEN: readonly KitchenSpot[] = [
  { who: { person: 0 }, x: 14.95, y: 2.35, view: "back", flip: true },
  { who: { person: 1 }, x: 13.7, y: 3.0, view: "front", flip: false },
  { who: { person: 2 }, x: 17.8, y: 4.2, view: "front", flip: true },
  { who: { cat: 2 }, x: 16.55, y: 2.3, view: "back", flip: false },
  { who: { cat: 0 }, x: 15.6, y: 3.6, view: "front", flip: false },
  { who: { cat: 1 }, x: 14.2, y: 4.3, view: "front", flip: true },
];

/** Парад: у кожній групі — спереду праворуч, спереду ліворуч, ззаду праворуч, ззаду ліворуч. */
const PARADE: readonly { view: ArtView; flip: boolean }[] = [
  { view: "front", flip: false },
  { view: "front", flip: true },
  { view: "back", flip: false },
  { view: "back", flip: true },
];

// --- Розкладка (одиниці арту = px світу галереї) -------------------------------------------------

const HALF_W = 64;
const HALF_H = 32;
/** Верхня вершина ромба клітинки (13, 1) — спільний pivot плит кухні (F1a): тут кухня лягає в світ вкладки. */
const KITCHEN_AT = { x: 296, y: 312 } as const;
/** Межі кухні в світі: плита підлоги й стіна навколо `KITCHEN_AT`. */
const KITCHEN_BOX = { x: 24, y: 40, w: 732, h: 604 } as const;
/** Куди дивиться камера, коли все не вміщується: середина кухні, трохи нижче — до котів і людей. */
const KITCHEN_FOCUS = { x: KITCHEN_AT.x + 70, y: KITCHEN_AT.y + 60 } as const;
/** Права колонка: вікно на стіні-манекені, холодильники, іконки. */
const RIGHT = { x: 800, top: 60 } as const;
const FRIDGES = { x: 1220, top: 60 } as const;
const ICONS = { x: 1220, y: 330 } as const;
/** Парад під кухнею: базові лінії персонажів і котів. */
const PARADE_AT = { x: 40, title: 664, person: 846, cat: 958 } as const;
const PARADE_STEP = { person: 62, cat: 80, gap: 34 } as const;
/** Уся сторінка вкладки — для кнопки «уся сторінка». */
const LAYOUT = { w: 1620, h: 985 } as const;

/** Тінь під ногами (F1b: еліпс `shade` 0,3 під коренем) — малюватиме вигляд (T1, T2). */
const SHADOW = { cat: { w: 54, h: 16 }, person: { w: 42, h: 18 }, alpha: 0.3 } as const;

/** Точка підлоги квартири (клітинки) у світі вкладки, z — висота. */
function kitchenPoint(x: number, y: number, z = 0): { x: number; y: number } {
  const dx = x - 13;
  const dy = y - 1;
  return { x: KITCHEN_AT.x + (dx - dy) * HALF_W, y: KITCHEN_AT.y + (dx + dy) * HALF_H - z };
}

/** Точка ізометрії відносно (0, 0) — для стіни-манекена. */
function isoPoint(x: number, y: number, z = 0): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2((x - y) * HALF_W, (x + y) * HALF_H - z);
}

const hex = (color: string): number => Number.parseInt(color.slice(1), 16);

/** Масштаб «як у грі на десктопі 1920 × 1080»: камера квартири (`cameraZoom`) на полотні 1280 × 720 — у CSS px на одиницю. */
function desktopZoom(): number {
  const cssScale = 720 / 1080;
  return cameraZoom({ width: 1280, height: 720 - HUD_HEIGHT, cssScale }, ISO) / cssScale;
}

// --- Вкладка -------------------------------------------------------------------------------------

interface Walker {
  sprite: LooseSprite;
  kind: "cat" | "person";
  index: number;
  /** Зсув фази ходи, мс: щоб не крокували в ногу. */
  phase: number;
}

interface State {
  walk: boolean;
  dim: boolean;
  shadows: boolean;
  fridgeOpen: boolean;
}

function mount(ctx: GalleryContext): GalleryView {
  const { scene } = ctx;
  const state: State = { walk: true, dim: true, shadows: true, fridgeOpen: false };
  /** Область перегляду, CSS px (`ctx.onResize` дає її одразу). */
  let size = { w: scene.scale.width / galleryView().dpr, h: scene.scale.height / galleryView().dpr };
  const root = new Phaser.GameObjects.Container(scene, 0, 0);
  ctx.layer.add(root);
  const owners: string[] = [];
  const walkers: Walker[] = [];
  /** Зображення арту зрізу (без скелетів) — для лічильника заглушок. */
  const images: Phaser.GameObjects.Image[] = [];

  // Рецепти: один на істоту, дальні частини — свій (`farRecipe`).
  const catRecipes = CATS.map((sample) => {
    const genes: Genes = { ...PLAIN, ...sample.genes };
    const base = catRecipe({ coat: coatOf(genes, { coat: null }), fur: null, seed: sample.seed });
    return { base, far: farRecipe(base) };
  });
  const personRecipes = LOOKS.map((sample) => {
    const base = personRecipe(sample.look);
    return { base, far: farRecipe(base) };
  });
  const catFar = new Set<string>(CAT_FAR_SLOTS);
  const personFar = new Set<string>(PERSON_FAR_SLOTS);

  const bakedOf = (kind: "cat" | "person", index: number): RigBaked<string> => {
    const recipes = (kind === "cat" ? catRecipes : personRecipes)[index]!;
    const far = kind === "cat" ? catFar : personFar;
    return {
      recipe: (slot: string): TintRecipe => (state.dim && far.has(slot) ? recipes.far : recipes.base),
      owner: `gallery:slice:${kind}:${index}`,
    };
  };
  for (let i = 0; i < CATS.length; i++) owners.push(`gallery:slice:cat:${i}`);
  for (let i = 0; i < LOOKS.length; i++) owners.push(`gallery:slice:person:${i}`);

  const art = (parent: Phaser.GameObjects.Container, id: ArtId, x: number, y: number, artState?: string): Phaser.GameObjects.Image => {
    const image = addArt(scene, parent, id, artState === undefined ? {} : { state: artState });
    image.setPosition(x, y);
    images.push(image);
    return image;
  };

  /** Скелет істоти в точці (x, y) батька `parent`, з тінню під ногами в `shadows`. */
  const walker = (
    parent: Phaser.GameObjects.Container,
    shadows: Phaser.GameObjects.Container,
    kind: "cat" | "person",
    index: number,
    x: number,
    y: number,
    view: ArtView,
    flip: boolean,
  ): Walker => {
    const look = LOOKS[index]?.look ?? DEFAULT_LOOK;
    const sprite =
      kind === "cat"
        ? new RigSprite(scene, CAT_RIG as unknown as LooseRig, { fit: CAT_FIT as RigFit<string, string, string>, facing: { view, flip }, baked: bakedOf(kind, index) })
        : new RigSprite(scene, PERSON_RIG as unknown as LooseRig, {
            fit: PERSON_FIT as RigFit<string, string, string>,
            skin: personSkin(look),
            proportions: personProportions(look),
            facing: { view, flip },
            baked: bakedOf(kind, index),
          });
    sprite.setPosition(x, y);
    parent.add(sprite);
    const foot = SHADOW[kind];
    shadows.add(new Phaser.GameObjects.Ellipse(scene, x, y, foot.w, foot.h, hex(ART.shade), SHADOW.alpha));
    const w: Walker = { sprite, kind, index, phase: (walkers.length * 173) % 640 };
    walkers.push(w);
    return w;
  };

  // --- Кухня: плити, холодильник, кігтеточка, люди й коти — за глибиною (x + y точки на підлозі).
  const kitchen = new Phaser.GameObjects.Container(scene, 0, 0);
  root.add(kitchen);
  art(kitchen, "env/room/kitchen/floor", KITCHEN_AT.x, KITCHEN_AT.y);
  art(kitchen, "env/room/kitchen/wall", KITCHEN_AT.x, KITCHEN_AT.y);
  const kitchenShadows = new Phaser.GameObjects.Container(scene, 0, 0);
  kitchen.add(kitchenShadows);
  const things: { obj: Phaser.GameObjects.GameObject; depth: number }[] = [];
  const fridgeAt = kitchenPoint(13.5, 1.5);
  const fridge = art(kitchen, "env/fridge", fridgeAt.x, fridgeAt.y, "closed");
  things.push({ obj: fridge, depth: 13.5 + 1.5 });
  const scratcherAt = kitchenPoint(17.5, 2.5);
  things.push({ obj: art(kitchen, "item/scratcher/cheap", scratcherAt.x, scratcherAt.y), depth: 17.5 + 2.5 });
  for (const spot of KITCHEN) {
    const at = kitchenPoint(spot.x, spot.y);
    const kind = "cat" in spot.who ? "cat" : "person";
    const index = "cat" in spot.who ? spot.who.cat : spot.who.person;
    const w = walker(kitchen, kitchenShadows, kind, index, at.x, at.y, spot.view, spot.flip);
    things.push({ obj: w.sprite, depth: spot.x + spot.y });
  }
  things.sort((a, b) => a.depth - b.depth);
  for (const thing of things) kitchen.bringToTop(thing.obj);

  // --- Вікно спальні (F1a) на стіні-манекені: шматок задньої стіни y = 0 (клітинки 3…5) і підлоги перед ним. Манекен —
  // не арт: пласкі кольори палітри без контуру, лише щоб вікно стояло на стіні, як у грі.
  const dummy = new Phaser.GameObjects.Container(scene, RIGHT.x, RIGHT.top + 104);
  root.add(dummy);
  const g = new Phaser.GameObjects.Graphics(scene);
  dummy.add(g);
  const poly = (color: string, points: Phaser.Math.Vector2[]): void => {
    g.fillStyle(hex(color), 1);
    g.fillPoints(points, true);
  };
  poly(ART.floorWood, [isoPoint(3, 1), isoPoint(6, 1), isoPoint(6, 3), isoPoint(3, 3)]);
  poly(ART.wallBedroom, [isoPoint(3, 1), isoPoint(6, 1), isoPoint(6, 1, 200), isoPoint(3, 1, 200)]);
  poly(ART.cut, [isoPoint(6, 0), isoPoint(6, 1), isoPoint(6, 1, 200), isoPoint(6, 0, 200)]);
  poly(ART.cut, [isoPoint(3, 0, 200), isoPoint(6, 0, 200), isoPoint(6, 1, 200), isoPoint(3, 1, 200)]);
  const pane = isoPoint(4, 0);
  art(dummy, "env/window/bedroom", pane.x, pane.y);

  // --- Холодильник зачинений і відчинений (еталон F1a, обидва стани).
  const fridges = new Phaser.GameObjects.Container(scene, FRIDGES.x, FRIDGES.top);
  root.add(fridges);
  art(fridges, "env/fridge", 124, 200, "closed");
  art(fridges, "env/fridge", 124 + 200, 200, "open");

  // --- Парад: кожен персонаж і кіт у чотирьох напрямах.
  const parade = new Phaser.GameObjects.Container(scene, 0, 0);
  root.add(parade);
  const paradeShadows = new Phaser.GameObjects.Container(scene, 0, 0);
  parade.add(paradeShadows);
  const groups: { x: number; y: number; title: string }[] = [];
  const personGroup = PARADE.length * PARADE_STEP.person + PARADE_STEP.gap;
  LOOKS.forEach((sample, i) => {
    const x0 = PARADE_AT.x + 30 + i * personGroup;
    PARADE.forEach((dir, j) => walker(parade, paradeShadows, "person", i, x0 + j * PARADE_STEP.person, PARADE_AT.person, dir.view, dir.flip));
    groups.push({ x: x0 - 26, y: PARADE_AT.person + 14, title: sample.title });
  });
  const catGroup = PARADE.length * PARADE_STEP.cat + PARADE_STEP.gap;
  CATS.forEach((sample, i) => {
    const x0 = PARADE_AT.x + 40 + i * catGroup;
    PARADE.forEach((dir, j) => walker(parade, paradeShadows, "cat", i, x0 + j * PARADE_STEP.cat, PARADE_AT.cat, dir.view, dir.flip));
    groups.push({ x: x0 - 38, y: PARADE_AT.cat + 12, title: sample.title });
  });

  // --- Іконки: сталий розмір на екрані (64 і 32 px CSS) за будь-якого масштабу — на папері й на темному.
  const icons = new Phaser.GameObjects.Container(scene, ICONS.x, ICONS.y);
  root.add(icons);
  const ICON_ROW = { pad: 12, h: 88 } as const;
  for (const [row, plate] of [
    [0, hex(ART.paper)],
    [1, 0x2b2530],
  ] as const) {
    const y = row * (ICON_ROW.h + 8);
    icons.add(new Phaser.GameObjects.Rectangle(scene, 0, y, 252, ICON_ROW.h, plate).setOrigin(0, 0));
    let x = ICON_ROW.pad;
    for (const [id, px] of [
      ["icon/kibble", 64],
      ["icon/heart", 64],
      ["icon/kibble", 32],
      ["icon/heart", 32],
    ] as const) {
      const image = addArt(scene, icons, id);
      images.push(image);
      // Полотно іконки — 64 одиниці: 32 px — половина.
      image.setScale(image.scaleX * (px / 64), image.scaleY * (px / 64));
      image.setPosition(x + px / 2, y + ICON_ROW.h / 2 - (px === 64 ? 4 : 0));
      x += px + ICON_ROW.pad;
    }
  }

  // --- Підписи: сталий розмір на екрані, тож за нового масштабу — заново.
  let labels: Phaser.GameObjects.Text[] = [];
  const drawLabels = (): void => {
    for (const label of labels) label.destroy();
    labels = [];
    const z = galleryView().zoom;
    const put = (x: number, y: number, text: string, bold = false): void => {
      labels.push(addLabel(scene, ctx.layer, x, y, text, { size: bold ? 13 : 11, bold }));
    };
    put(KITCHEN_BOX.x, 12, "Кухня (F1a), люди й коти (F1b)", true);
    put(RIGHT.x, 34, "Вікно спальні (F1a), стіна — манекен", true);
    put(FRIDGES.x, 34, "Холодильник: зачинений · відчинений", true);
    put(ICONS.x, ICONS.y - 22 / z, "Іконки 64 і 32 px (на папері й на темному)", true);
    put(PARADE_AT.x - 16, PARADE_AT.title, "Парад: спереду →, спереду ←, ззаду →, ззаду ← (ходять на місці)", true);
    for (const group of groups) put(group.x, group.y, group.title);
  };
  /** Іконки — сталий розмір на екрані: контейнер у CSS px. */
  const scaleIcons = (): void => {
    icons.setScale(1 / galleryView().zoom);
  };

  // --- Камера: усе вміщується — від початку, ні — кухня посередині.
  const camera = scene.cameras.main;
  const frame = (what: "kitchen" | "all"): void => {
    const z = galleryView().zoom;
    const vw = size.w / z;
    const vh = size.h / z;
    if (what === "all" || (vw >= LAYOUT.w && vh >= LAYOUT.h)) {
      camera.setScroll(0, 0);
      return;
    }
    const fitsKitchen = vw >= KITCHEN_BOX.x + KITCHEN_BOX.w && vh >= KITCHEN_BOX.y + KITCHEN_BOX.h;
    const cx = fitsKitchen ? 0 : Math.max(0, KITCHEN_FOCUS.x - vw / 2);
    const cy = fitsKitchen ? 0 : Math.max(0, Math.min(KITCHEN_FOCUS.y - vh / 2, KITCHEN_BOX.y + KITCHEN_BOX.h - vh));
    camera.setScroll(cx, cy);
  };

  // --- Панель.
  const panel = document.createElement("div");
  panel.className = "gallery-slice";
  const para = (html: string): HTMLParagraphElement => {
    const p = document.createElement("p");
    p.innerHTML = html;
    p.style.margin = "0 0 8px";
    panel.append(p);
    return p;
  };
  para("<b>Зріз стилю</b> — еталони хвилі 1 разом і в масштабі гри (1 одиниця арту = 1 px світу).");
  para(
    "Кіт і люди — <b>скелети гри</b> з частин F1b, пофарбовані компонувальником так само, як у грі; ходять на місці пробною " +
      "ходою. Час — повзунок угорі: ⏸ зупиняє, повзунок — кадр за кадром.",
  );
  para(
    "Що оцінити: лінію (контур людей і котів тонший за меблі — чи «одна рука»?), палітру, пропорції кота до людини й " +
      "меблів, глибину (голову черепахової закриває кігтеточка), і як це читається на телефоні.",
  );
  para("Не арт: стіна-манекен під вікном, тіні під ногами (їх малюватиме гра) і затінення дальніх лап, руки й ноги — пропозиція F1b.");
  para("Маджента — заглушка (арту ще немає). У зрізі їх бути не має: лічильник нижче.");
  const button = (text: string, title: string, onClick: () => void): void => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "g-button";
    node.textContent = text;
    node.title = title;
    node.style.display = "block";
    node.style.margin = "0 0 6px";
    node.addEventListener("click", onClick);
    panel.append(node);
  };
  button("Як у грі на телефоні (кіт ≈ 40 px)", "Масштаб камери гри на телефоні 844 × 390: ромб плитки 46 px CSS", () => {
    requestGalleryZoom(PHONE_ZOOM);
    frame("kitchen");
  });
  button(`Як у грі на десктопі (≈ ${desktopZoom().toFixed(2).replace(".", ",")} px / од.)`, "Камера гри на екрані 1920 × 1080: уся квартира", () => {
    requestGalleryZoom(desktopZoom());
    frame("kitchen");
  });
  button("Уся сторінка", "Вмістити весь зріз", () => {
    requestGalleryZoom(Math.min(size.w / LAYOUT.w, size.h / LAYOUT.h));
    frame("all");
  });
  const check = (text: string, key: keyof State, change: () => void): void => {
    const label = document.createElement("label");
    label.style.display = "block";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = state[key];
    box.addEventListener("change", () => {
      state[key] = box.checked;
      change();
    });
    label.append(box, ` ${text}`);
    panel.append(label);
  };
  check("ходять (пробна хода F4a)", "walk", () => startWalk(true));
  check("затінювати дальні частини (F1b)", "dim", () => {
    for (const w of walkers) w.sprite.setBaked(bakedOf(w.kind, w.index));
  });
  check("тіні під ногами", "shadows", () => {
    kitchenShadows.setVisible(state.shadows);
    paradeShadows.setVisible(state.shadows);
  });
  check("холодильник у кухні відчинений", "fridgeOpen", () => setArt(fridge, "env/fridge", { state: state.fridgeOpen ? "open" : "closed" }));
  const stubs = document.createElement("p");
  stubs.style.marginTop = "8px";
  panel.append(stubs);
  ctx.panel.append(panel);

  const walkAnim = { cat: CAT_TRIAL.walk as unknown as LooseAnim, person: PERSON_TRIAL.walk as unknown as LooseAnim };
  const startWalk = (restart: boolean): void => {
    for (const w of walkers) {
      w.sprite.update(ctx.time());
      w.sprite.play(state.walk ? walkAnim[w.kind] : null, { from: w.phase, blend: 0, restart });
    }
  };
  startWalk(false);

  /** Скільки заглушок у зрізі: кадри атласу й запечені частини скелетів. */
  const countStubs = (): number => {
    let n = images.filter((image) => isArtStub(image)).length;
    for (const w of walkers) {
      for (const child of w.sprite.list) {
        if (child instanceof Phaser.GameObjects.Image && child.visible && (isBakedStub(child) || isArtStub(child))) n++;
      }
    }
    return n;
  };
  const showStubs = (): void => {
    const n = countStubs();
    const text = n === 0 ? "Заглушок у зрізі: 0 — усе з еталонів." : `Заглушок у зрізі: ${n} — чогось із еталонів бракує в атласі.`;
    if (stubs.textContent !== text) stubs.textContent = text;
  };

  drawLabels();
  scaleIcons();
  const unsubscribeView = onGalleryView(() => {
    drawLabels();
    scaleIcons();
  });
  const unsubscribe = ctx.onResize?.((w, h) => {
    size = { w, h };
  });
  frame("kitchen");

  let counted = -Infinity;
  return {
    update(time) {
      for (const w of walkers) w.sprite.update(time);
      // Лічильник заглушок — двічі на секунду живого часу (і на паузі теж).
      const now = performance.now();
      if (now - counted > 500) {
        counted = now;
        showStubs();
      }
    },
    destroy() {
      unsubscribe?.();
      unsubscribeView();
      for (const label of labels) label.destroy();
      root.destroy(true);
      for (const owner of owners) releaseBaked(scene, owner);
      panel.remove();
    },
  };
}

export const TAB: GalleryTab = { id: "slice", title: "Зріз", order: 0, mount };
