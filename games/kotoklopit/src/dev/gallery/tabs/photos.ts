// Вкладка галереї «Фото титрів» (§4.2, «Титри життя»): кожна поза фото на кількох котах (кошеня, дорослі різних шерстей і
// форм), мама з кошенятами, пози персонажа на трьох зовнішностях і три речі — тим самим `drawPhoto`, що й стрічка, на полях
// полароїда. Сітка — DOM поверх області перегляду. `?photos=cats|litters|people|things` — лише один розділ (для знімків).
// `?photos=traits` — знімки рис (§4.2, `src/view/traitphoto/`): кожен бік кожної групи в кожній позі рівня; фільтри `area=`, `group=`
// (через кому), `side=plus|minus`, інший кіт — `cat=<номер у CATS>`. Полотно знімка має `data-shot="<група>.<бік>.<поза>"`
// (`shots.ts --canvases`).

import { createCat } from "../../../sim/cat";
import { DEFAULT_LOOK, newGame } from "../../../sim/game";
import { createRng } from "../../../sim/rng";
import type { StoryCat } from "../../../sim/story";
import { TRAIT_GROUPS } from "../../../sim/traits";
import type { Cat, Genes, GameState, Look, Shape } from "../../../sim/types";
import { drawPhoto } from "../../../ui/photo";
import { portraitCanvas } from "../../../ui/portrait";
import { storyPhoto, type CatPhotoPose, type Photo, type PersonPhotoPose } from "../../../view/photo";
import { TRAIT_PHOTOS } from "../../../view/traitphoto";
import { LIFE_POSES } from "../../../view/traitphoto/types";
import type { GalleryContext, GalleryTab, GalleryView } from "../tab";

const CAT_POSES: readonly [CatPhotoPose, string][] = [
  ["curious", "цікаво"],
  ["wary", "насторожено"],
  ["nursing", "годує"],
  ["content", "задоволено (7–9)"],
  ["calm", "спокійно (5–6)"],
  ["sulk", "ображено (3–4)"],
  ["ill", "хворий (0–2)"],
];

const PERSON_POSES: readonly [PersonPhotoPose, string][] = [
  ["unpack", "розпаковує"],
  ["desk", "за столом"],
  ["gloomy", "понуро"],
  ["phone", "телефон"],
  ["proud", "гордо (пенсія)"],
];

/** Розмір фото в стрічці, CSS px (стрічка — ≈ 180–280); `?photo=<px>` — інший. */
const PHOTO_DEFAULT = 200;

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
  label: string;
  ageWeeks: number;
  genes: Partial<Genes>;
  shape?: Partial<Shape>;
}

const CATS: readonly CatSample[] = [
  { label: "Кошеня 1 тиж., руде мармурове", ageWeeks: 1, genes: { orange: [true], agouti: [true, true], tabby: [0, 0], eyes: 0 } },
  { label: "Дорослий чорний", ageWeeks: 40, genes: {} },
  { label: "Черепахова довгошерста з білим", ageWeeks: 40, genes: { orange: [true, false], white: [1, 1], short: [false, false], eyes: 3 } },
  { label: "Сіамський висловухий кремезний", ageWeeks: 40, genes: { full: [false, false], eyes: 0 }, shape: { ears: "folded", build: "stocky" } },
  { label: "Сірий смугастий худий, короткий хвіст", ageWeeks: 40, genes: { agouti: [true, true], dense: [false, false], tabby: [1, 1] }, shape: { build: "slim", tail: "bobtail" } },
];

const LOOKS: readonly [string, Look][] = [
  ["За замовчуванням", { ...DEFAULT_LOOK }],
  ["Темна шкіра, чорне довге", { ...DEFAULT_LOOK, face: 1, skin: 3, hair: 1, hairColor: 0, eyes: 3, build: 0, top: 4, bottom: 2, shoes: 0 }],
  ["Руде, кремезний", { ...DEFAULT_LOOK, face: 2, skin: 0, hair: 2, hairColor: 4, eyes: 2, build: 2, top: 2, bottom: 1, shoes: 2 }],
];

function catOf(state: GameState, seed: number, sample: CatSample, sex: Cat["sex"] = "female"): Cat {
  const cat = createCat(state, createRng(seed), { source: "shelter", ageWeeks: sample.ageWeeks, sex });
  cat.genes = { ...PLAIN, ...sample.genes };
  cat.shape = { ...cat.shape, muzzle: "normal", ears: "normal", tail: "long", build: "normal", legs: "normal", coat: null, ...sample.shape };
  cat.diseases = [];
  cat.collar = false;
  return cat;
}

const story = (cat: Cat, ageWeeks = cat.ageWeeks): StoryCat => ({ cat, ageWeeks });

/** Кіт знімків рис: світлий смугастий, на якому видно і вираз, і обрис. */
const TRAIT_CAT: CatSample = { label: "Світлий смугастий", ageWeeks: 40, genes: { agouti: [true, true], dense: [false, false], tabby: [1, 1] } };

/** Перша форма назви рівня: «[Спокійний|Спокійна]» → «Спокійний». */
const firstForm = (name: string): string => name.replace(/\[([^|\]]*)\|[^\]]*\]/g, "$1");

function mount(ctx: GalleryContext): GalleryView {
  const state = newGame({ address: "she", difficulty: "normal", seed: 1 }).current;
  const params = new URLSearchParams(location.search);
  const only = params.get("photos");
  const size = Math.min(600, Math.max(80, Number(params.get("photo")) || PHOTO_DEFAULT));
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "absolute",
    inset: "0",
    overflow: "auto",
    padding: "12px 16px 32px",
    background: "#3a3340",
    color: "#f3e9dc",
    font: "12px/1.35 system-ui, sans-serif",
    zIndex: "2",
    cursor: "auto",
  } satisfies Partial<CSSStyleDeclaration>);

  const section = (id: string, title: string): HTMLElement | null => {
    if (only !== null && only !== id) return null;
    const head = document.createElement("h3");
    head.textContent = title;
    head.style.margin = "12px 0 6px";
    const grid = document.createElement("div");
    Object.assign(grid.style, { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-start" });
    root.append(head, grid);
    return grid;
  };
  const row = (grid: HTMLElement, label: string, width = 90): HTMLElement => {
    const line = document.createElement("div");
    Object.assign(line.style, { display: "flex", gap: "10px", alignItems: "flex-end", width: "100%" });
    const name = document.createElement("div");
    name.textContent = label;
    Object.assign(name.style, { width: `${width}px`, flex: "none", alignSelf: "center" });
    line.append(name);
    grid.append(line);
    return line;
  };
  const polaroid = (into: HTMLElement, photo: Photo | null, caption: string, shot?: string): void => {
    if (!photo) return;
    const card = document.createElement("figure");
    Object.assign(card.style, { margin: "0", padding: "8px 8px 6px", background: "#f6f1e7", borderRadius: "2px", boxShadow: "0 2px 6px rgba(0,0,0,.35)", color: "#2b2530" });
    const canvas = portraitCanvas(size, size);
    if (shot !== undefined) canvas.dataset["shot"] = shot;
    canvas.style.display = "block";
    canvas.style.background = "#e9e1d3";
    drawPhoto(canvas, photo);
    const text = document.createElement("figcaption");
    text.textContent = caption;
    Object.assign(text.style, { marginTop: "4px", fontSize: "11px", textAlign: "center" });
    card.append(canvas, text);
    into.append(card);
  };

  const cats = section("cats", "Пози кота");
  if (cats) {
    CATS.forEach((sample, i) => {
      const line = row(cats, sample.label);
      const cat = catOf(state, 100 + i, sample);
      for (const [pose, title] of CAT_POSES) polaroid(line, { subjects: [{ kind: "cat", cat: story(cat), pose }] }, title);
    });
  }

  const litters = section("litters", "Мама з кошенятами");
  if (litters) {
    const line = row(litters, "Пологи");
    const mother = catOf(state, 200, CATS[2]!);
    const litter: readonly Partial<Genes>[] = [{}, { orange: [true, false] }, { white: [1, 1] }, { orange: [true] }, {}];
    const kittens = litter.map((genes, k) => catOf(state, 210 + k, { label: "", ageWeeks: 0, genes }));
    const births = (m: Cat | null, n: number): Photo | null => storyPhoto({ kind: "births", day: 9, at: 12960, mother: m ? story(m) : null, kittens: kittens.slice(0, n).map((k) => story(k, 0)) }, state);
    for (const n of [1, 2, 3, 5]) polaroid(line, births(mother, n), `кошенят: ${n}`);
    polaroid(line, births(null, 2), "без мами");
    const adult = catOf(state, 230, CATS[1]!);
    polaroid(line, { subjects: [{ kind: "cat", cat: story(adult, 1), pose: "curious" }] }, "приїхав кошеням");
  }

  // Знімки рис — лише на прохання: їх сотні.
  const traits = only === "traits" ? section("traits", "Знімки рис") : null;
  if (traits) {
    const list = (name: string): string[] | null => params.get(name)?.split(",").filter(Boolean) ?? null;
    const areas = list("area");
    const groups = list("group");
    const sides = (list("side") ?? ["plus", "minus"]).filter((side): side is "plus" | "minus" => side === "plus" || side === "minus");
    const sample = CATS[Number(params.get("cat"))] ?? TRAIT_CAT;
    const model = catOf(state, 300, sample);
    for (const group of TRAIT_GROUPS) {
      if (areas && !areas.includes(group.area)) continue;
      if (groups && !groups.includes(group.id)) continue;
      for (const side of sides) {
        const names = side === "plus" ? [group.names[0], group.names[1]] : [group.names[2], group.names[3]];
        const line = row(traits, `${group.title} ${side === "plus" ? "+" : "−"}: ${names.map(firstForm).join(", ")}`, 170);
        const shots = TRAIT_PHOTOS[group.area][group.id]?.[side];
        for (const pose of LIFE_POSES) {
          const title = CAT_POSES.find(([p]) => p === pose)?.[1] ?? pose;
          const shot = shots?.[pose];
          polaroid(line, { subjects: [{ kind: "cat", cat: story(model), pose, ...(shot ? { shot } : {}) }] }, shot ? title : `${title} · без знімка`, `${group.id}.${side}.${pose}`);
        }
      }
    }
  }

  const people = section("people", "Персонаж");
  if (people) {
    for (const [label, look] of LOOKS) {
      const line = row(people, label);
      for (const [pose, title] of PERSON_POSES) polaroid(line, { subjects: [{ kind: "person", look, pose }] }, title);
    }
  }

  const things = section("things", "Перша техніка");
  if (things) {
    const line = row(things, "Речі");
    for (const thing of ["robot", "fountain", "feeder"] as const) {
      for (const quality of ["cheap", "premium"] as const) polaroid(line, { subjects: [{ kind: "thing", thing, quality }] }, `${thing} · ${quality}`);
    }
  }

  const broke = section("broke", "Поломки");
  if (broke) {
    for (const [label, sample] of [["Дорослий", CATS[4]!], ["Кошеня", CATS[0]!]] as const) {
      const line = row(broke, label);
      const who = story(catOf(state, 400, sample));
      for (const thing of ["carrier", "house", "scratcher"] as const) {
        for (const quality of ["cheap", "premium"] as const) {
          polaroid(line, storyPhoto({ kind: "broke", day: 8, at: 11520, thing, quality, cat: who }, state), `${thing} · ${quality}`, `broke.${label === "Кошеня" ? "kitten" : "adult"}.${thing}.${quality}`);
        }
      }
    }
  }

  const stage = document.querySelector<HTMLElement>(".g-stage") ?? ctx.panel;
  stage.append(root);
  return {
    destroy() {
      root.remove();
    },
  };
}

export const TAB: GalleryTab = { id: "photos", title: "Фото титрів", order: 60, mount };
