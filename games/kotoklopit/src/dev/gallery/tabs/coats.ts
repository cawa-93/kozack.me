// Вкладка галереї «Шерсть і вигляд» (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): тулуб і голова кота в обох
// ракурсах із різними забарвленнями з генетики (`coatOf`) і кілька зовнішностей персонажа — запечені компонувальником
// (`bake.ts`) так само, як у грі. Поки арту немає, це маджентові заглушки з синтетичними масками в кольорах рецепта; з
// еталонами F1 після зведення стане справжнім. Перемикачі станів (тьмяна шерсть, залисини, нашийник) перезапікають котів, а
// кнопка «втратити контекст» перевіряє, що запечене переживає втрату WebGL-контексту. Поруч — DOM-портрети
// (`composePortrait`), а без атласу — запасний малюнок `ui/portrait.ts`, як буде в редакторі.

import Phaser from "phaser";

import { coatOf } from "../../../sim/genetics";
import type { Genes, Look, Shape } from "../../../sim/types";
import { drawPortrait, portraitCanvas } from "../../../ui/portrait";
import { addBakedArt, bakedFrame, bakeStats, releaseBaked, setBakedArt } from "../../../view/art/bake";
import { composePortrait } from "../../../view/art/compose";
import { catRecipe, personRecipe, type CatAppearance, type CatRecipeOptions } from "../../../view/art/recipes";
import type { ArtId, ArtView, TintRecipe } from "../../../view/art/types";
import { BUILDS, FACES } from "../../../view/palette";
import type { GalleryContext, GalleryTab, GalleryView } from "../tab";

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

interface CoatSample {
  label: string;
  genes: Partial<Genes>;
  fur?: Shape["coat"];
  /** Видимі стани, які зразок має завжди (тьмяна шерсть). */
  opts?: CatRecipeOptions;
  seed: number;
}

/** Забарвлення: рудий мармуровий, чорний, блакитний, черепаховий з білим, сіамський, тікований, ван, тьмяний, довгошерстий, безшерстий. */
const COAT_SAMPLES: readonly CoatSample[] = [
  { label: "Рудий мармуровий табі", genes: { orange: [true], agouti: [true, true], tabby: [0, 0] }, seed: 1 },
  { label: "Чорний", genes: {}, seed: 2 },
  { label: "Блакитний (розбавлений)", genes: { dense: [false, false] }, seed: 3 },
  { label: "Черепаховий з білим", genes: { orange: [true, false], white: [1, 1] }, seed: 4 },
  { label: "Сіамський (сил-пойнт)", genes: { full: [false, false] }, seed: 5 },
  { label: "Тікований табі", genes: { agouti: [true, true], tabby: [3, 3], eyes: 2 }, seed: 6 },
  { label: "Білий (ван)", genes: { white: [2, 2] }, seed: 7 },
  { label: "Тьмяна шерсть (глисти)", genes: { agouti: [true, true], tabby: [1, 1], eyes: 0 }, opts: { dull: true }, seed: 8 },
  { label: "Довгошерста блакитно-кремова", genes: { orange: [true, false], dense: [false, false], agouti: [true, true], short: [false, false] }, seed: 9 },
  { label: "Безшерстий", genes: { white: [1, 0] }, fur: "hairless", seed: 10 },
];

interface LookSample {
  label: string;
  look: Look;
  stained?: boolean;
}

const LOOK_SAMPLES: readonly LookSample[] = [
  { label: "Світла шкіра, біляве", look: { face: 0, skin: 0, hair: 0, hairColor: 3, eyes: 1, build: 1, top: 1, bottom: 0, shoes: 1 } },
  { label: "Темна шкіра, чорне довге", look: { face: 1, skin: 3, hair: 1, hairColor: 0, eyes: 3, build: 0, top: 4, bottom: 2, shoes: 0 } },
  { label: "Дуже темна, сиві кучері", look: { face: 2, skin: 4, hair: 3, hairColor: 5, eyes: 2, build: 2, top: 6, bottom: 3, shoes: 3 } },
  { label: "Руде, плями на одязі", look: { face: 1, skin: 2, hair: 2, hairColor: 4, eyes: 0, build: 1, top: 2, bottom: 1, shoes: 2 }, stained: true },
];

/** Стовпці: частина й ракурс. */
interface Column {
  title: string;
  id: ArtId;
  view: ArtView;
}

const CAT_COLUMNS: readonly Column[] = [
  { title: "тулуб · спереду", id: "cat/body/normal", view: "front" },
  { title: "тулуб · ззаду", id: "cat/body/normal", view: "back" },
  { title: "голова · спереду", id: "cat/head/base", view: "front" },
  { title: "голова · ззаду", id: "cat/head/base", view: "back" },
];

const wrap = (i: number, n: number): number => ((Math.trunc(i) % n) + n) % n;

const personColumns = (look: Look): Column[] => {
  const face = wrap(look.face, FACES.length);
  const build = wrap(look.build, BUILDS.length);
  return [
    { title: "голова · спереду", id: `person/head/${face}`, view: "front" },
    { title: "голова · ззаду", id: `person/head/${face}`, view: "back" },
    { title: "торс · спереду", id: `person/torso/${build}`, view: "front" },
    { title: "торс · ззаду", id: `person/torso/${build}`, view: "back" },
  ];
};

/** Сітка у px світу: підпис ліворуч, далі клітинки. */
const GRID = { left: 230, cell: 150, row: 120, top: 40, zoom: 1.4 } as const;
/** Підписи — світлі на темній підкладці: читаються на будь-якому тлі галереї (світле, темне, підлога). */
const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", fontSize: "14px", color: "#f3e9dc", backgroundColor: "#2b2530", padding: { x: 4, y: 2 } } as const;

interface Placed {
  image: Phaser.GameObjects.Image;
  id: ArtId;
  view: ArtView;
  owner: string;
  /** Центр клітинки. */
  cx: number;
  cy: number;
}

function mount(ctx: GalleryContext): GalleryView {
  const { scene } = ctx;
  const root = new Phaser.GameObjects.Container(scene, 0, 0);
  ctx.layer.add(root);
  const state: Required<CatRecipeOptions> = { dull: false, bald: false, collar: false };
  const cats = COAT_SAMPLES.map((sample) => ({ sample, look: appearanceOf(sample) }));
  /** Рецепт зразка зі станами з перемикачів; тьмяний зразок тьмяний завжди. */
  const catRecipeOf = (cat: { sample: CoatSample; look: CatAppearance }): TintRecipe =>
    catRecipe(cat.look, { ...state, dull: state.dull || cat.sample.opts?.dull === true });
  const placed: Placed[] = [];
  const recipes = new Map<string, () => TintRecipe>();
  const owners: string[] = [];

  const label = (x: number, y: number, text: string, size = 14): void => {
    const t = new Phaser.GameObjects.Text(scene, x, y, text, { ...TEXT_STYLE, fontSize: `${size}px` });
    t.setOrigin(0, 0.5);
    root.add(t);
  };
  const cellCenter = (row: number, col: number): { cx: number; cy: number } => ({
    cx: GRID.left + col * GRID.cell + GRID.cell / 2,
    cy: GRID.top + row * GRID.row + GRID.row / 2,
  });
  const place = (row: number, col: number, column: Column, owner: string, recipe: () => TintRecipe): void => {
    const { cx, cy } = cellCenter(row, col);
    const image = addBakedArt(scene, root, column.id, recipe(), { view: column.view, owner });
    const item: Placed = { image, id: column.id, view: column.view, owner, cx, cy };
    image.setScale(image.scaleX * GRID.zoom, image.scaleY * GRID.zoom);
    center(item);
    placed.push(item);
    recipes.set(owner, recipe);
  };
  /** Поставити кадр посередині клітинки: origin — у pivot, тож зсув — від pivot до середини полотна. */
  const center = (item: Placed): void => {
    const baked = bakedFrame(scene, item.image.texture.key);
    const geometry = baked?.geometry;
    const dx = geometry ? geometry.size.w / 2 - geometry.pivot.x : 0;
    const dy = geometry ? geometry.size.h / 2 - geometry.pivot.y : 0;
    item.image.setPosition(item.cx - dx * GRID.zoom, item.cy - dy * GRID.zoom);
  };

  // Коти.
  label(16, GRID.top / 2, "Забарвлення кота", 16);
  CAT_COLUMNS.forEach((column, col) => label(GRID.left + col * GRID.cell + 8, GRID.top / 2, column.title, 12));
  cats.forEach((cat, row) => {
    const owner = `gallery:cat:${row}`;
    owners.push(owner);
    label(16, cellCenter(row, 0).cy, cat.sample.label);
    CAT_COLUMNS.forEach((column, col) => place(row, col, column, owner, () => catRecipeOf(cat)));
  });

  // Персонаж.
  const personTop = cats.length + 1;
  label(16, cellCenter(personTop, 0).cy - GRID.row / 2 + 10, "Зовнішність персонажа", 16);
  LOOK_SAMPLES.forEach((sample, i) => {
    const row = personTop + i;
    const owner = `gallery:person:${i}`;
    owners.push(owner);
    label(16, cellCenter(row, 0).cy, sample.label);
    const recipe = (): TintRecipe => personRecipe(sample.look, sample.stained ? { stained: true } : {});
    personColumns(sample.look).forEach((column, col) => place(row, col, column, owner, recipe));
  });

  // Панель: стани котів, втрата контексту, статистика, портрети.
  const panel = document.createElement("div");
  panel.className = "gallery-coats";
  const stats = document.createElement("p");
  const toggles = document.createElement("div");
  const rebake = (): void => {
    for (const item of placed) {
      const recipe = recipes.get(item.owner);
      if (!recipe) continue;
      setBakedArt(item.image, item.id, recipe(), { view: item.view, owner: item.owner });
      center(item);
    }
  };
  for (const [key, text] of [
    ["dull", "тьмяна шерсть"],
    ["bald", "залисини"],
    ["collar", "нашийник"],
  ] as const) {
    const row = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => {
      state[key] = box.checked;
      rebake();
    });
    row.append(box, ` ${text}`);
    toggles.append(row, document.createElement("br"));
  }
  panel.append(toggles);

  const renderer = scene.game.renderer;
  if (renderer.type === Phaser.WEBGL) {
    const lose = document.createElement("button");
    lose.type = "button";
    lose.textContent = "Втратити WebGL-контекст на 1 с";
    lose.addEventListener("click", () => {
      const gl = (renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
      const ext = gl.getExtension("WEBGL_lose_context");
      if (!ext) return;
      ext.loseContext();
      window.setTimeout(() => ext.restoreContext(), 1000);
    });
    panel.append(lose);
  }
  panel.append(stats);

  const portraits = document.createElement("div");
  portraits.style.display = "flex";
  portraits.style.gap = "8px";
  portraits.style.flexWrap = "wrap";
  for (const sample of LOOK_SAMPLES) {
    const canvas = portraitCanvas(70, 110);
    const redraw = (): void => {
      if (!composePortrait(canvas, sample.look, { stained: sample.stained === true, onReady: redraw })) drawPortrait(canvas, sample.look);
    };
    redraw();
    portraits.append(canvas);
  }
  panel.append(portraits);
  ctx.panel.append(panel);

  const showStats = (): void => {
    const s = bakeStats(scene);
    const mode = renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas";
    stats.textContent = `${mode} · запечено ${s.frames} кадрів (${(s.pixels / 1e6).toFixed(2)} Мпікс), показано ${s.shown}, власників ${s.owners}`;
  };
  showStats();

  const unsubscribe = ctx.onResize?.((width) => {
    const need = GRID.left + CAT_COLUMNS.length * GRID.cell + 16;
    root.setScale(Math.min(1, width / need));
  });

  let since = 0;
  return {
    update(_time, delta) {
      since += delta;
      if (since > 500) {
        since = 0;
        showStats();
      }
    },
    destroy() {
      unsubscribe?.();
      root.destroy(true);
      for (const owner of owners) releaseBaked(scene, owner);
      panel.remove();
    },
  };
}

function appearanceOf(sample: CoatSample): CatAppearance {
  const genes: Genes = { ...PLAIN, ...sample.genes };
  const fur = sample.fur ?? null;
  return { coat: coatOf(genes, { coat: fur }), fur, seed: sample.seed };
}

export const TAB: GalleryTab = { id: "coats", title: "Шерсть і вигляд", order: 40, mount };
