// Вкладка галереї «Візерунки» (`WARDROBE.md`, «Візерунки»): кожен візерунок на персонажі у вихідній позі — запечений скелет,
// як у грі (шви між торсом, рукою й ногою, затінені дальні частини), спереду й ззаду, — і DOM-портрет, як у редакторі.
// Візерунок верху й низу — той самий, де лягає; кольори верху й низу міняються від клітинки до клітинки, тож видно і «тон у
// тон», і контраст на різних кольорах. Масштаб — галереї (`zoom=phone` — як у грі на телефоні).

import Phaser from "phaser";

import { DEFAULT_LOOK } from "../../../sim/game";
import type { Look } from "../../../sim/types";
import { drawPortrait, portraitCanvas } from "../../../ui/portrait";
import { releaseBaked } from "../../../view/art/bake";
import { farRecipe, personRecipe } from "../../../view/art/recipes";
import type { ArtView } from "../../../view/art/types";
import { PERSON_FAR_SLOTS, PERSON_FIT, PERSON_RIG, personProportions, personSkin, type PersonSlot } from "../../../view/rig/defs/person";
import { RigSprite } from "../../../view/rig/rigsprite";
import { PATTERNS, patternFits } from "../../../view/wardrobe/patterns";
import type { GalleryContext, GalleryTab, GalleryView } from "../tab";

/** Сітка, одиниці світу: клітинка — дві фігури (спереду й ззаду). */
const GRID = { columns: 5, cell: 150, row: 190, left: 20, top: 30, figure: 60 } as const;
const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#f3e9dc", backgroundColor: "#2b2530", padding: { x: 3, y: 1 } } as const;
const FAR: ReadonlySet<string> = new Set<string>(PERSON_FAR_SLOTS);
const VIEWS: readonly ArtView[] = ["front", "back"];

/** Вигляд клітинки: візерунок на верху й низу (де лягає), кольори — від номера. */
function lookOf(pattern: number): Look {
  return {
    ...DEFAULT_LOOK,
    top: pattern % 7,
    bottom: (pattern + 3) % 7,
    topPattern: patternFits(pattern, "top", 0) ? pattern : 0,
    bottomPattern: patternFits(pattern, "bottom", 0) ? pattern : 0,
  };
}

function mount(ctx: GalleryContext): GalleryView {
  const { scene } = ctx;
  const root = new Phaser.GameObjects.Container(scene, 0, 0);
  ctx.layer.add(root);
  const sprites: RigSprite<string, PersonSlot, string>[] = [];
  const owners: string[] = [];
  PATTERNS.forEach((pattern, i) => {
    const look = lookOf(i);
    const recipe = personRecipe(look);
    const far = farRecipe(recipe);
    const x = GRID.left + (i % GRID.columns) * GRID.cell;
    const y = GRID.top + Math.floor(i / GRID.columns) * GRID.row;
    const label = new Phaser.GameObjects.Text(scene, x, y, `${i} · ${pattern.name}`, TEXT_STYLE);
    root.add(label);
    VIEWS.forEach((view, v) => {
      const owner = `gallery:patterns:${i}:${view}`;
      owners.push(owner);
      const sprite = new RigSprite(scene, PERSON_RIG, {
        fit: PERSON_FIT,
        skin: personSkin(look),
        facing: { view, flip: false },
        proportions: personProportions(look),
        baked: { recipe: (slot) => (FAR.has(slot) ? far : recipe), owner },
      });
      sprite.setPosition(x + GRID.figure / 2 + v * GRID.figure, y + GRID.row - 16);
      root.add(sprite);
      sprites.push(sprite);
    });
  });

  // Портрети редактора: та сама фігура компонувальником у DOM.
  const panel = document.createElement("div");
  const title = document.createElement("p");
  title.textContent = "Портрет редактора";
  const strip = document.createElement("div");
  strip.style.display = "flex";
  strip.style.gap = "6px";
  strip.style.flexWrap = "wrap";
  PATTERNS.forEach((pattern, i) => {
    const cell = document.createElement("figure");
    cell.style.margin = "0";
    const canvas = portraitCanvas(56, 92);
    drawPortrait(canvas, lookOf(i));
    const caption = document.createElement("figcaption");
    caption.textContent = `${i} · ${pattern.name}`;
    caption.style.fontSize = "11px";
    cell.append(canvas, caption);
    strip.append(cell);
  });
  panel.append(title, strip);
  ctx.panel.append(panel);

  return {
    update(time) {
      // Запікання розкладено на кадри (`BAKES_PER_FRAME`): фігура дозапікається за кілька кадрів.
      for (const sprite of sprites) sprite.update(time);
    },
    destroy() {
      root.destroy(true);
      for (const owner of owners) releaseBaked(scene, owner);
      panel.remove();
    },
  };
}

export const TAB: GalleryTab = { id: "patterns", title: "Візерунки", order: 45, mount };
