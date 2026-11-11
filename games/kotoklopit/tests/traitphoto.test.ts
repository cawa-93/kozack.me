// Знімок риси на фото титрів (§4.2): риса з опису життя (§9.7) додає до пози рівня річ поруч чи зміну пози; знімок — на кожен бік
// кожної групи рис і кожну позу рівня, лише з того, що є в атласі й серед анімацій кота.

import { describe, expect, it } from "vitest";

import { createCat } from "../src/sim/cat";
import { removeCat } from "../src/sim/farewell";
import { DEFAULT_LOOK, newGame } from "../src/sim/game";
import { createRng } from "../src/sim/rng";
import { TRAIT_GROUPS } from "../src/sim/traits";
import type { AlbumEntry, Cat, GameState, Trait } from "../src/sim/types";
import { CAT_EARS, CAT_EYES, CAT_MOUTHS } from "../src/view/anim/catface";
import { CAT_OVERLAYS } from "../src/view/anim/ids";
import { portraitFrame, type PortraitPart } from "../src/view/art/compose";
import { artEntries, artEntry } from "../src/view/art/manifest";
import { framesOf } from "../src/view/art/types";
import type { StoryItem } from "../src/sim/story";
import { lifePhotoPose, livingCatPhoto, retirementPhoto, storyPhoto, type Photo } from "../src/view/photo";
import { personRecipe } from "../src/view/art/recipes";
import { COAT_ICONS, iconCoat, recolorCoat } from "../src/view/photocoat";
import { layoutFrame, photoFrame, PROP_FRAME, type Box } from "../src/view/photoframe";
import { catPhotoParts, PHOTO_BUBBLE_SCALE, PHOTO_PROP_SCALE, photoLayout, personShotContact } from "../src/view/photoposes";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { TRAIT_PHOTOS } from "../src/view/traitphoto";
import { CAT_PHOTO_BONES, LIFE_POSES, type LifePose, type TraitPerson, type TraitShot } from "../src/view/traitphoto/types";
import type { Genes } from "../src/sim/types";
import { withCatCorner } from "./helpers";

const SIDES = ["plus", "minus"] as const;

function game(): GameState {
  return withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 5 })).current;
}

function cat(state: GameState, seed: number, ageWeeks = 30, traits: Trait[] = []): Cat {
  const made = createCat(state, createRng(seed), { source: "shelter", ageWeeks, sex: "female" });
  made.traits = traits;
  return made;
}

function album(state: GameState, from: Cat, lifeMood: number): AlbumEntry {
  return { ...removeCat(state, from, { kind: "old" }, 40), lifeMood };
}

const trait = (group: string, level: Trait["level"], known: boolean): Trait => ({ group, level, seen: 0, known });

/** Усі знімки: група, бік, поза. */
const SHOTS = TRAIT_GROUPS.flatMap((group) =>
  SIDES.flatMap((side) => LIFE_POSES.map((pose) => ({ key: `${group.id}.${side}.${pose}`, pose, shot: TRAIT_PHOTOS[group.area][group.id]?.[side]?.[pose] }))),
);

/** Усі кадри атласу (маніфест). */
const FRAMES = new Set<string>(artEntries().flatMap((entry) => framesOf(entry).map((ref) => ref.frame)));

const catSubject = (photo: Photo | null) => {
  const subject = photo?.subjects[0];
  return subject?.kind === "cat" ? subject : undefined;
};

const isCat = (part: PortraitPart): boolean => part.id.startsWith("cat/");

/** Полотно кадру частини на фото (не силует): з масштабом, віддзеркаленням і поворотом. */
function canvasBox(part: PortraitPart): Box | null {
  const entry = artEntry(part.id);
  if (!entry) return null;
  const rad = ((part.rot ?? 0) * Math.PI) / 180;
  const corners = [
    [0, 0],
    [entry.size.w, 0],
    [entry.size.w, entry.size.h],
    [0, entry.size.h],
  ].map(([cx, cy]) => {
    const dx = (cx! - entry.pivot.x) * (part.scaleX ?? 1);
    const dy = (cy! - entry.pivot.y) * (part.scaleY ?? 1);
    return { x: (part.x ?? 0) + dx * Math.cos(rad) - dy * Math.sin(rad), y: (part.y ?? 0) + dx * Math.sin(rad) + dy * Math.cos(rad) };
  });
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

describe("знімки рис — на кожен випадок і з того, що є (§4.2)", () => {
  it("кожна група рис — знімок на обидва боки й кожну позу рівня, із задумом", () => {
    expect(SHOTS.filter((s) => !s.shot?.idea.trim()).map((s) => s.key)).toEqual([]);
  });

  it("у файлі розділу — лише групи цього розділу", () => {
    const strays = Object.entries(TRAIT_PHOTOS).flatMap(([area, shots]) =>
      Object.keys(shots).filter((id) => TRAIT_GROUPS.find((group) => group.id === id)?.area !== area).map((id) => `${area}: ${id}`),
    );
    expect(strays).toEqual([]);
  });

  it("поза — з анімацій кота, обличчя — з його кадрів; накладка — анімація-накладка або кути кісток, не разом (і в інших котів)", () => {
    const wrong: string[] = [];
    const stills = SHOTS.flatMap(({ key, shot }) => [
      { key, still: shot?.still },
      ...(shot?.companions ?? []).map((companion, i) => ({ key: `${key} кіт ${i}`, still: companion.still })),
    ]);
    for (const { key, still } of stills) {
      if (!still) continue;
      if (still.base !== undefined && !(still.base in CAT_ANIMS)) wrong.push(`${key}: основа ${still.base}`);
      if (still.overlay && !CAT_OVERLAYS.has(still.overlay)) wrong.push(`${key}: накладка ${still.overlay}`);
      if (still.overlay !== undefined && still.bones) wrong.push(`${key}: накладка разом із кутами кісток`);
      for (const bone of Object.keys(still.bones ?? {})) if (!(CAT_PHOTO_BONES as readonly string[]).includes(bone)) wrong.push(`${key}: кістка ${bone}`);
      if (still.eyes !== undefined && !CAT_EYES.includes(still.eyes)) wrong.push(`${key}: очі ${still.eyes}`);
      if (still.mouth !== undefined && !CAT_MOUTHS.includes(still.mouth)) wrong.push(`${key}: рот ${still.mouth}`);
      if (still.ears !== undefined && !CAT_EARS.includes(still.ears)) wrong.push(`${key}: вуха ${still.ears}`);
    }
    expect(wrong).toEqual([]);
  });

  it("речі — кадри атласу в стані, який у них є; усе фото — кадри атласу", () => {
    const state = game();
    const wrong: string[] = [];
    for (const { key, pose, shot } of SHOTS) {
      if (!shot) continue;
      for (const prop of shot.props ?? []) {
        const entry = artEntry(prop.art);
        if (!entry) wrong.push(`${key}: немає арту ${prop.art}`);
        else if (prop.state !== null && !(entry.states ?? []).includes(prop.state)) wrong.push(`${key}: ${prop.art} без стану ${prop.state}`);
      }
      const layout = photoLayout({ subjects: [{ kind: "cat", cat: { cat: cat(state, 3), ageWeeks: 30 }, pose, shot }] });
      for (const frame of layout.pieces.map((piece) => portraitFrame(piece.part))) if (!FRAMES.has(frame)) wrong.push(`${key}: немає кадру ${frame}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("знімок риси на фото (§4.2)", () => {
  const SHOT: TraitShot = {
    idea: "іграшка позаду, миска попереду",
    props: [
      { art: "item/toy/cheap", state: null, x: 30, y: -4 },
      { art: "item/bowl/cheap", state: "empty", x: -28, y: 6, front: true },
    ],
  };

  it("річ позаду — перед котом у порядку малювання, поверх — після; на своєму місці від кореня кота", () => {
    const state = game();
    const parts = catPhotoParts({ cat: cat(state, 4), ageWeeks: 30 }, "calm", SHOT);
    const toy = parts.findIndex((p) => p.id === "item/toy/cheap");
    const bowl = parts.findIndex((p) => p.id === "item/bowl/cheap");
    const first = parts.findIndex(isCat);
    const last = parts.length - 1 - [...parts].reverse().findIndex(isCat);
    expect(toy).toBeGreaterThanOrEqual(0);
    expect(toy).toBeLessThan(first);
    expect(bowl).toBeGreaterThan(last);
    expect(parts[toy]).toMatchObject({ x: 30, y: -4 });
    expect(parts[bowl]).toMatchObject({ x: -28, y: 6, scaleX: PHOTO_PROP_SCALE, scaleY: PHOTO_PROP_SCALE, state: "empty" });
  });

  it("кошеня — серед тих самих речей на тих самих місцях: як у квартирі, меншає лише кіт", () => {
    const state = game();
    const young = cat(state, 4, 1);
    const adult = catPhotoParts({ cat: young, ageWeeks: 30 }, "calm", SHOT).find((p) => p.id === "item/toy/cheap");
    const kitten = catPhotoParts({ cat: young, ageWeeks: 1 }, "calm", SHOT).find((p) => p.id === "item/toy/cheap");
    expect({ x: kitten?.x, y: kitten?.y, s: kitten?.scaleX }).toEqual({ x: adult?.x, y: adult?.y, s: adult?.scaleX });
  });

  it("поза риси: обличчя й основа — свої, чого не задано — як у позі рівня", () => {
    const state = game();
    const story = { cat: cat(state, 6), ageWeeks: 30 };
    const plain = catPhotoParts(story, "content");
    const closed = catPhotoParts(story, "content", { idea: "заплющив очі", still: { eyes: "closed" } });
    expect(closed.find((p) => p.id === "cat/eyes")?.state).toBe("closed");
    expect(closed.filter((p) => p.id !== "cat/eyes")).toEqual(plain.filter((p) => p.id !== "cat/eyes"));
    // Нова основа скидає накладку рівня: «задоволено» на буханці — той самий буханець, що «спокійно» на ньому, лише обличчя своє.
    const where = (parts: readonly PortraitPart[]) => parts.map((p) => [p.id, p.x, p.y, p.rot]);
    const loafContent = catPhotoParts(story, "content", { idea: "буханцем", still: { base: "loaf" } });
    const loafCalm = catPhotoParts(story, "calm", { idea: "буханцем", still: { base: "loaf" } });
    expect(where(loafContent)).toEqual(where(loafCalm));
    expect(where(loafContent)).not.toEqual(where(plain));
  });

  it("кути кісток — сталий доворот поверх основи; кіт, що дивиться ліворуч, віддзеркалений, а речі — ні", () => {
    const state = game();
    const story = { cat: cat(state, 6), ageWeeks: 30 };
    const head = (parts: readonly PortraitPart[]) => parts.find((p) => p.id.startsWith("cat/head"))?.rot ?? 0;
    const plain = catPhotoParts(story, "calm");
    const bowed = catPhotoParts(story, "calm", { idea: "схилив голову", still: { bones: { head: 20 } } });
    expect(head(bowed)).not.toBeCloseTo(head(plain));
    const left = catPhotoParts(story, "calm", { ...SHOT, still: { flip: true } });
    const right = catPhotoParts(story, "calm", SHOT);
    const body = (parts: readonly PortraitPart[]) => parts.find((p) => p.id.startsWith("cat/body"));
    expect(body(left)?.x).toBeCloseTo(-(body(right)?.x ?? 0));
    expect(body(left)?.scaleX).toBeCloseTo(-(body(right)?.scaleX ?? 1));
    expect(left.find((p) => p.id === "item/toy/cheap")).toEqual(right.find((p) => p.id === "item/toy/cheap"));
  });

  it("інші коти — поруч, кожен своїм виглядом, не схожим на героя; кошеня менше; ближчий до камери — пізніше", () => {
    const state = game();
    const hero = { cat: cat(state, 4), ageWeeks: 30 };
    const shot: TraitShot = {
      idea: "друг поруч, кошеня позаду",
      companions: [
        { age: "adult", still: { base: "loaf" }, x: 40, y: 10 },
        { age: "kitten", still: { base: "sleep" }, x: -36, y: -6 },
      ],
    };
    const bodies = (photo: Photo) => photoLayout(photo).pieces.filter((piece) => piece.part.id.startsWith("cat/body"));
    const alone = bodies({ subjects: [{ kind: "cat", cat: hero, pose: "calm" }] });
    const [kitten, me, friend] = bodies({ subjects: [{ kind: "cat", cat: hero, pose: "calm", shot }] });
    expect(alone).toHaveLength(1);
    expect(me?.recipe.key).toBe(alone[0]?.recipe.key);
    expect(friend?.recipe.key).not.toBe(me?.recipe.key);
    expect(kitten?.part.x ?? 0).toBeLessThan(me?.part.x ?? 0);
    expect(friend?.part.x ?? 0).toBeGreaterThan(me?.part.x ?? 0);
    expect(Math.abs(kitten?.part.scaleX ?? 1)).toBeLessThan(Math.abs(friend?.part.scaleX ?? 1));
  });

  it("розклад фото кота зі знімком — речі знімка серед частин, як є", () => {
    const state = game();
    const layout = photoLayout({ subjects: [{ kind: "cat", cat: { cat: cat(state, 4), ageWeeks: 30 }, pose: "calm", shot: SHOT }] });
    const toy = layout.pieces.find((piece) => piece.part.id === "item/toy/cheap");
    expect(toy?.recipe.key).toBe("photo/as-is");
  });
});

describe("можливості знімка (§4.2)", () => {
  const hero = (state: GameState, ageWeeks = 30, traits: Trait[] = []) => {
    const made = cat(state, 4, ageWeeks, traits);
    made.shape = { ...made.shape, build: "normal" };
    return { cat: made, ageWeeks };
  };
  const find = (parts: readonly PortraitPart[], id: string) => parts.find((p) => p.id === id);
  const bubbleOf = (kind: "say" | "think") => artEntry(`ui/bubble/${kind}`)!;

  it("бабл гри — над головою кота, іконка й позначка в полі іконки фону, поверх кота; розмір — як у грі, сталий", () => {
    const state = game();
    const shot: TraitShot = { idea: "думка «дметься» з позначкою «ні»", bubbles: [{ kind: "think", icon: "sulk", mark: "no" }] };
    const parts = catPhotoParts(hero(state), "calm", shot);
    const bubble = find(parts, "ui/bubble/think");
    const icon = find(parts, "icon/sulk");
    const mark = find(parts, "icon/mark/no");
    const head = find(parts, "cat/head/normal") ?? parts.find((p) => p.id.startsWith("cat/head"));
    expect(bubble && icon && mark && head).toBeTruthy();
    const last = parts.length - 1 - [...parts].reverse().findIndex(isCat);
    expect(parts.indexOf(bubble!)).toBeGreaterThan(last);
    expect(bubble!.scaleX).toBe(PHOTO_BUBBLE_SCALE);
    expect(bubble!.y ?? 0).toBeLessThan(head!.y ?? 0);
    const entry = bubbleOf("think");
    const point = entry.points!["icon"]!;
    expect(icon!.x).toBeCloseTo((bubble!.x ?? 0) + (point.x - entry.pivot.x) * PHOTO_BUBBLE_SCALE);
    expect(icon!.y).toBeCloseTo((bubble!.y ?? 0) + (point.y - entry.pivot.y) * PHOTO_BUBBLE_SCALE);
    expect({ x: mark!.x, y: mark!.y, s: mark!.scaleX }).toEqual({ x: icon!.x, y: icon!.y, s: icon!.scaleX });
  });

  it("бабл: кіт ліворуч — бабл з іншого боку, але не віддзеркалений; у кошеняти — нижче, того самого розміру; над іншим котом — над ним", () => {
    const state = game();
    const say: TraitShot = { idea: "нявкає", bubbles: [{ kind: "say", icon: "meow" }] };
    const right = find(catPhotoParts(hero(state), "calm", say), "ui/bubble/say")!;
    const left = find(catPhotoParts(hero(state), "calm", { ...say, still: { flip: true } }), "ui/bubble/say")!;
    expect(left.x).toBeCloseTo(-(right.x ?? 0));
    expect(left.scaleX).toBeGreaterThan(0);
    const kitten = find(catPhotoParts(hero(state, 1), "calm", say), "ui/bubble/say")!;
    expect(kitten.y ?? 0).toBeGreaterThan(right.y ?? 0);
    expect(kitten.scaleX).toBe(right.scaleX);
    const friend: TraitShot = { idea: "друг нявкає", companions: [{ age: "adult", still: { base: "sit" }, x: 70, y: 0 }], bubbles: [{ kind: "say", icon: "meow", over: 0 }] };
    const layout = photoLayout({ subjects: [{ kind: "cat", cat: hero(state), pose: "calm", shot: friend }] });
    const over = layout.pieces.find((piece) => piece.part.id === "ui/bubble/say")!.part;
    expect(over.x ?? 0).toBeGreaterThan(50);
  });

  it("персонаж у кадрі — у вигляді гравця, частинами скелета; виходить за край фото, рамку задає кіт", () => {
    const state = game();
    const look = { ...DEFAULT_LOOK, top: DEFAULT_LOOK.top + 1 };
    for (const pose of ["stand", "lap", "pet"] as const) {
      const shot: TraitShot = { idea: `персонаж ${pose}`, person: { pose, x: 40, y: -10 } };
      const layout = photoLayout({ subjects: [{ kind: "cat", cat: hero(state), pose: "calm", shot, look }] });
      const people = layout.pieces.filter((piece) => piece.part.id.startsWith("person/"));
      expect(people.length, pose).toBeGreaterThan(5);
      expect(people.every((piece) => piece.bleed === true && (piece.recipe.key === personRecipe(look).key || piece.part.far === true)), pose).toBe(true);
      expect(layout.pieces.filter((piece) => piece.part.id.startsWith("cat/")).some((piece) => piece.bleed), pose).toBe(false);
      for (const frame of layout.pieces.map((piece) => portraitFrame(piece.part))) expect(FRAMES.has(frame), frame).toBe(true);
    }
    // Без вигляду — типовий.
    const plain = photoLayout({ subjects: [{ kind: "cat", cat: hero(state), pose: "calm", shot: { idea: "ноги", person: { pose: "stand", x: 40, y: -10 } } }] });
    expect(plain.pieces.find((piece) => piece.part.id.startsWith("person/") && !piece.part.far)?.recipe.key).toBe(personRecipe(DEFAULT_LOOK).key);
  });

  it("річ персонажа (капці) — у вигляді гравця, як він сам", () => {
    const state = game();
    const look = { ...DEFAULT_LOOK, shoes: DEFAULT_LOOK.shoes + 1 };
    const shot: TraitShot = { idea: "капці", props: [{ art: "person/shoe/slippers", state: null, x: 30, y: 6, front: true }] };
    const layout = photoLayout({ subjects: [{ kind: "cat", cat: hero(state), pose: "calm", shot, look }] });
    expect(layout.pieces.find((piece) => piece.part.id === "person/shoe/slippers")?.recipe.key).toBe(personRecipe(look).key);
  });

  it("персонаж біля кошеняти — того самого розміру, а разом із котом зсувається точка дотику: ноги, коліна, долоня", () => {
    const state = game();
    const adult = hero(state);
    const kitten = hero(state, 1);
    const where = (who: ReturnType<typeof hero>, person: TraitPerson) =>
      photoLayout({ subjects: [{ kind: "cat", cat: who, pose: "calm", shot: { idea: "з персонажем", person } }] })
        .pieces.filter((piece) => piece.part.id.startsWith("person/"))
        .map((piece) => ({ x: piece.part.x ?? 0, y: piece.part.y ?? 0, s: piece.part.scaleX ?? 1 }));
    const shift = (person: TraitPerson) => {
      const big = where(adult, person);
      return where(kitten, person).map((p, i) => ({ x: p.x - big[i]!.x, y: p.y - big[i]!.y, s: p.s / big[i]!.s }));
    };
    const feet = shift({ pose: "stand", x: 30, y: 0 })[0]!;
    expect(feet.x).toBeLessThan(-5);
    for (const pose of ["stand", "lap", "pet"] as const) {
      for (const flip of [false, true]) {
        const contact = personShotContact(DEFAULT_LOOK, { pose, flip });
        // Точка дотику під котом — персонаж біля кошеняти там само, де біля дорослого, і того самого розміру.
        for (const s of shift({ pose, flip, x: -contact.x, y: -contact.y })) {
          expect(s.x, `${pose} ${flip}`).toBeCloseTo(0);
          expect(s.y, `${pose} ${flip}`).toBeCloseTo(0);
          expect(s.s, `${pose} ${flip}`).toBeCloseTo(1);
        }
        // Точка дотику збоку від кота — зсувається, як ноги, що стоять там само.
        for (const s of shift({ pose, flip, x: 30 - contact.x, y: -contact.y })) {
          expect(s.x, `${pose} ${flip}`).toBeCloseTo(feet.x);
          expect(s.y, `${pose} ${flip}`).toBeCloseTo(feet.y);
        }
      }
    }
    expect(personShotContact(DEFAULT_LOOK, { pose: "stand" })).toEqual({ x: 0, y: 0 });
    for (const pose of ["lap", "pet"] as const) {
      const contact = personShotContact(DEFAULT_LOOK, { pose });
      expect(Math.hypot(contact.x, contact.y), pose).toBeGreaterThan(20);
      expect(personShotContact(DEFAULT_LOOK, { pose, flip: true })).toEqual({ x: -contact.x, y: contact.y });
    }
  });

  it("інший кіт не схожий на героя: у рудого чи черепахового — сірий, в інших — рудий", () => {
    const state = game();
    const colored = (genes: Partial<Genes>) => {
      const one = hero(state);
      one.cat.genes = { ...one.cat.genes, ...genes };
      return one;
    };
    const keys = (who: ReturnType<typeof hero>) => {
      const shot: TraitShot = { idea: "друг позаду", companions: [{ age: "adult", still: { base: "sit" }, x: 60, y: -30 }] };
      const body = (s?: TraitShot) =>
        photoLayout({ subjects: [{ kind: "cat", cat: who, pose: "calm", ...(s ? { shot: s } : {}) }] }).pieces.find((piece) => piece.part.id.startsWith("cat/body"))!.recipe.key;
      return { own: body(), other: body(shot) };
    };
    const base: Partial<Genes> = { black: [true, true], dense: [false, false], tabby: [1, 1], full: [true, true], short: [true, true] };
    const blueWhite = keys(colored({ ...base, orange: [false, false], agouti: [false, false], white: [1, 1] }));
    const greyTabby = keys(colored({ ...base, orange: [false, false], agouti: [true, true], white: [0, 0] }));
    const black = keys(colored({ ...base, orange: [false, false], dense: [true, true], agouti: [false, false], white: [0, 0] }));
    const ginger = keys(colored({ ...base, orange: [true, true], dense: [true, true], agouti: [false, false], white: [0, 0] }));
    const tortie = keys(colored({ ...base, orange: [true, false], dense: [true, true], agouti: [false, false], white: [0, 0] }));
    for (const one of [blueWhite, greyTabby, black, ginger, tortie]) expect(one.other).not.toBe(one.own);
    expect(new Set([blueWhite.other, greyTabby.other, black.other]).size).toBe(1);
    expect(ginger.other).toBe(tortie.other);
    expect(ginger.other).not.toBe(black.other);
  });

  it("пози рівня — без знаків біля морди: ні градусника в роті хворого, ні пари ображеного; настрій каже вираз", () => {
    const state = game();
    const one = hero(state);
    for (const pose of LIFE_POSES) {
      for (const shot of [undefined, { idea: "рот відкритий", still: { mouth: "meow" as const } }, { idea: "ліворуч", still: { flip: true } }]) {
        const ids = catPhotoParts(one, pose, shot).map((p) => p.id);
        expect(ids.filter((id) => !id.startsWith("cat/") && id !== "fx/shadow/cat"), pose).toEqual([]);
      }
    }
  });

  it("кіт в іконці бабла — шерстю того, над ким бабл: рудий лишається рудим, іконки без кота не чіпаємо", () => {
    const state = game();
    const colored = (genes: Partial<Genes>) => {
      const one = hero(state);
      one.cat.genes = { ...one.cat.genes, ...genes };
      return one;
    };
    const grey = colored({ orange: [false, false], black: [true, true], dense: [false, false], agouti: [false, false], white: [0, 0], full: [true, true] });
    const ginger = colored({ orange: [true, true], dense: [true, true], white: [0, 0], full: [true, true] });
    const shot: TraitShot = {
      idea: "думки",
      companions: [{ age: "adult", still: { base: "sit" }, x: 70, y: 0 }],
      bubbles: [{ kind: "think", icon: "attention", mark: "no" }, { kind: "think", icon: "kibble", dx: 30 }, { kind: "say", icon: "meow", over: 0 }],
    };
    const coats = (who: ReturnType<typeof hero>) => {
      const pieces = photoLayout({ subjects: [{ kind: "cat", cat: who, pose: "calm", shot }] }).pieces;
      const coat = (id: string) => pieces.find((piece) => piece.part.id === id)!.coat;
      return { own: coat("icon/attention"), kibble: coat("icon/kibble"), mark: coat("icon/mark/no"), other: coat("icon/meow"), bubble: coat("ui/bubble/think") };
    };
    const g = coats(grey);
    expect(g.own).toBe(iconCoat(grey.cat));
    expect(g.own).toBeTypeOf("number");
    expect([g.kibble, g.mark, g.bubble, g.other]).toEqual([undefined, undefined, undefined, undefined]);
    const o = coats(ginger);
    expect(o.own).toBeUndefined();
    expect(o.other).toBeTypeOf("number");
    expect(iconCoat(ginger.cat)).toBeUndefined();
    // Заміна кольору: руде — у шерсть (світліше лишається світлішим), контур, папір і прозоре — як були.
    const px = new Uint8ClampedArray([0xd9, 0x84, 0x3f, 255, 0xea, 0xa9, 0x67, 255, 0x2e, 0x1f, 0x29, 255, 0xf2, 0xe7, 0xd0, 255, 0xd9, 0x84, 0x3f, 0]);
    recolorCoat(px, 0x7f8b97);
    expect([...px.slice(0, 3)]).toEqual([0x7f, 0x8b, 0x97]);
    expect(px[4]!).toBeGreaterThan(0x7f);
    expect(px[6]! - px[4]!).toBeGreaterThan(10);
    expect([...px.slice(8, 16)]).toEqual([0x2e, 0x1f, 0x29, 255, 0xf2, 0xe7, 0xd0, 255]);
    expect([...px.slice(16, 20)]).toEqual([0xd9, 0x84, 0x3f, 0]);
  });

  it("іконки з рудим котом, які знімки ставлять у бабли, — усі в переліку заміни шерсті", () => {
    const svgs = import.meta.glob<string>("../art/icon/*.svg", { query: "?raw", import: "default", eager: true });
    const used = new Set<string>();
    for (const area of Object.values(TRAIT_PHOTOS)) for (const group of Object.values(area)) for (const side of SIDES) for (const pose of LIFE_POSES) for (const bubble of group[side][pose].bubbles ?? []) used.add(bubble.icon);
    expect(used.size).toBeGreaterThan(10);
    for (const icon of used) {
      const ginger = (svgs[`../art/icon/${icon}.svg`] ?? "").includes("#d9843f");
      if (ginger) expect(COAT_ICONS.has(icon), icon).toBe(true);
    }
    for (const icon of COAT_ICONS) expect(svgs[`../art/icon/${icon}.svg`], icon).toContain("#d9843f");
  });

  it("персонаж іде й відсмикує руку; бабл над персонажем — над його головою", () => {
    const state = game();
    for (const pose of ["walk", "bitten"] as const) {
      const shot: TraitShot = { idea: pose, person: { pose, x: 60, y: -10 }, bubbles: [{ kind: "say", icon: "bite", over: "person" }] };
      const pieces = photoLayout({ subjects: [{ kind: "cat", cat: hero(state), pose: "calm", shot }] }).pieces;
      const people = pieces.filter((piece) => piece.part.id.startsWith("person/"));
      expect(people.length, pose).toBeGreaterThan(5);
      const bubble = pieces.find((piece) => piece.part.id === "ui/bubble/say")!;
      expect(bubble, pose).toBeTruthy();
      expect(pieces.indexOf(bubble), pose).toBeGreaterThan(pieces.indexOf(people[people.length - 1]!));
      expect(bubble.part.y ?? 0, pose).toBeLessThan(Math.min(...people.map((piece) => piece.part.y ?? 0)) + 20);
      expect(Math.abs((bubble.part.x ?? 0) - 60), pose).toBeLessThan(45);
      // Над героєм цього бабла немає.
      expect(pieces.filter((piece) => piece.part.id === "ui/bubble/say").length, pose).toBe(1);
    }
    expect(personShotContact(DEFAULT_LOOK, { pose: "walk" })).toEqual({ x: 0, y: 0 });
    const hand = personShotContact(DEFAULT_LOOK, { pose: "bitten" });
    expect(Math.hypot(hand.x, hand.y)).toBeGreaterThan(20);
  });

  it("річ на коті — у зубах (`teeth`) чи на маківці (`head`): іде за головою й віддзеркалюється з котом; знак меншає з кошеням, річ квартири — ні", () => {
    const state = game();
    const toy = { art: "item/toy/cheap", state: null, x: 0, y: 0, socket: "teeth" } as const;
    const at = (who: ReturnType<typeof hero>, still?: TraitShot["still"]) => {
      const parts = catPhotoParts(who, "calm", { idea: "у зубах", props: [toy], ...(still ? { still } : {}) });
      const part = find(parts, "item/toy/cheap")!;
      return { part, index: parts.indexOf(part), head: parts.findIndex((p) => p.id.startsWith("cat/head")), parts };
    };
    const one = hero(state);
    const sit = at(one);
    expect(sit.index).toBeGreaterThan(sit.head);
    const headPart = sit.parts[sit.head]!;
    expect(Math.hypot((sit.part.x ?? 0) - (headPart.x ?? 0), (sit.part.y ?? 0) - (headPart.y ?? 0))).toBeLessThan(30);
    const low = at(one, { base: "eat" });
    expect(low.part.y ?? 0).toBeGreaterThan((sit.part.y ?? 0) + 5);
    const left = at(one, { flip: true });
    expect(left.part.x).toBeCloseTo(-(sit.part.x ?? 0));
    const kitten = at(hero(state, 1));
    expect(Math.abs(kitten.part.y ?? 0)).toBeLessThan(Math.abs(sit.part.y ?? 0));
    expect(Math.abs(kitten.part.scaleX ?? 1)).toBe(Math.abs(sit.part.scaleX ?? 1));
    expect(Math.abs(sit.part.scaleX ?? 1)).toBe(PHOTO_PROP_SCALE);
    // Знак біля морди (пара, чхання) — за розміром кота.
    const sign = (who: ReturnType<typeof hero>) => find(catPhotoParts(who, "calm", { idea: "пирхає", props: [{ art: "fx/huff", state: null, x: 4, y: 2, socket: "teeth" }] }), "fx/huff")!;
    expect(Math.abs(sign(hero(state, 1)).scaleX ?? 1)).toBeLessThan(Math.abs(sign(one).scaleX ?? 1));
    // На маківці: над головою, вище за зуби; лежить — нижче; ліворуч — дзеркально.
    const bird = (who: ReturnType<typeof hero>, still?: TraitShot["still"]) => {
      const parts = catPhotoParts(who, "calm", { idea: "пташка на голові", props: [{ art: "icon/bird", state: null, x: 0, y: -8, scale: 0.45, socket: "head" }], ...(still ? { still } : {}) });
      const part = find(parts, "icon/bird")!;
      return { part, index: parts.indexOf(part), head: parts.findIndex((p) => p.id.startsWith("cat/head")) };
    };
    const perched = bird(one);
    expect(perched.index).toBeGreaterThan(perched.head);
    expect(perched.part.y ?? 0).toBeLessThan((sit.part.y ?? 0) - 10);
    expect(bird(one, { base: "loaf" }).part.y ?? 0).toBeGreaterThan((perched.part.y ?? 0) + 5);
    expect(bird(one, { flip: true }).part.x).toBeCloseTo(-(perched.part.x ?? 0));
  });

  it("кожен бабл і кожна річ кожного знімка рис потрапляє на фото: є над ким (інший кіт, персонаж) і з чого малювати", () => {
    const state = game();
    for (const who of [hero(state), hero(state, 1)]) {
      for (const [area, groups] of Object.entries(TRAIT_PHOTOS)) {
        for (const [group, sides] of Object.entries(groups)) {
          for (const side of SIDES) {
            for (const pose of LIFE_POSES) {
              const shot = sides[side][pose];
              const name = `${area}.${group}.${side}.${pose}`;
              const pieces = photoLayout({ subjects: [{ kind: "cat", cat: who, pose, shot }] }).pieces;
              const count = (test: (id: string) => boolean) => pieces.filter((piece) => test(piece.part.id)).length;
              // Хмарку знімок може скласти й сам, річчю (`ui/bubble/*` серед `props`).
              const drawn = (shot.props ?? []).filter((prop) => prop.art.startsWith("ui/bubble/")).length;
              expect(count((id) => id.startsWith("ui/bubble/")), name).toBe((shot.bubbles?.length ?? 0) + drawn);
              for (const prop of shot.props ?? []) expect(count((id) => id === prop.art), `${name}: ${prop.art}`).toBeGreaterThan(0);
              for (const piece of pieces) expect(FRAMES.has(portraitFrame(piece.part)), `${name}: ${portraitFrame(piece.part)}`).toBe(true);
              for (const piece of pieces) {
                for (const v of [piece.part.x ?? 0, piece.part.y ?? 0, piece.part.scaleX ?? 1, piece.part.scaleY ?? 1, piece.part.rot ?? 0]) expect(Number.isFinite(v), name).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it("кожну річ квартири кожного знімка видно на фото: рамка обрізає велику річ, але не лишає її за краєм", () => {
    // Рамка тут — за полотнами кадрів (на фото — за силуетами, вона трохи інша), тож оцінка груба: у кадрі — хоч п'ята частина
    // полотна речі.
    const SEEN = 0.2;
    const who = hero(game());
    const hidden: string[] = [];
    for (const { key, pose, shot } of SHOTS) {
      if (!shot) continue;
      const layout = photoLayout({ subjects: [{ kind: "cat", cat: who, pose, shot }] });
      const boxes = layout.pieces.map((piece) => canvasBox(piece.part));
      const frame = layoutFrame(layout.pieces, (i) => boxes[i] ?? null, layout.span)!;
      for (const [i, piece] of layout.pieces.entries()) {
        const box = boxes[i];
        if (!piece.soft || !box) continue;
        const w = Math.min(box.maxX, frame.maxX) - Math.max(box.minX, frame.minX);
        const h = Math.min(box.maxY, frame.maxY) - Math.max(box.minY, frame.minY);
        const share = w > 0 && h > 0 ? (w * h) / ((box.maxX - box.minX) * (box.maxY - box.minY)) : 0;
        if (share < SEEN) hidden.push(`${key}: ${piece.part.id} ${share.toFixed(2)}`);
      }
    }
    expect(hidden).toEqual([]);
  });

  it("речі фото подій — поломки й виставки котів — теж у кадрі: рамка не лишає їх за краєм", () => {
    const SEEN = 0.2;
    const state = game();
    const hidden: string[] = [];
    for (const who of [hero(state), hero(state, 1)]) {
      const events: StoryItem[] = [
        ...(["carrier", "house", "scratcher"] as const).flatMap((thing) => (["cheap", "premium"] as const).map((quality): StoryItem => ({ kind: "broke", day: 8, at: 0, thing, quality, cat: who }))),
        { kind: "broke", day: 8, at: 0, thing: "sofa", cat: who },
        ...([1, 2, 3] as const).map((place): StoryItem => ({ kind: "show", day: 13, at: 0, cat: who, place })),
      ];
      for (const item of events) {
        const photo = storyPhoto(item, state);
        expect(photo, item.kind).not.toBeNull();
        if (!photo) continue;
        const layout = photoLayout(photo);
        const boxes = layout.pieces.map((piece) => canvasBox(piece.part));
        const frame = layoutFrame(layout.pieces, (i) => boxes[i] ?? null, layout.span)!;
        for (const [i, piece] of layout.pieces.entries()) {
          const box = boxes[i];
          if (!piece.soft || !box) continue;
          const w = Math.min(box.maxX, frame.maxX) - Math.max(box.minX, frame.minX);
          const h = Math.min(box.maxY, frame.maxY) - Math.max(box.minY, frame.minY);
          const share = w > 0 && h > 0 ? (w * h) / ((box.maxX - box.minX) * (box.maxY - box.minY)) : 0;
          if (share < SEEN) hidden.push(`${item.kind} ${"thing" in item ? item.thing : item.kind === "show" ? item.place : ""} (вік ${who.ageWeeks}): ${piece.part.id} ${share.toFixed(2)}`);
        }
      }
    }
    expect(hidden).toEqual([]);
  });

  it("латка подертого дивана — у кадрі фото: і в «Дряпуна», і на фото поломки", () => {
    const state = game();
    const who = hero(state);
    const trace = artEntry("env/trace/sofa");
    const torn = trace?.points?.["torn"];
    expect(torn).toBeDefined();
    if (!trace || !torn) return;
    const photos: [string, Photo | null][] = [
      ...LIFE_POSES.map((pose): [string, Photo | null] => [`scratching.plus.${pose}`, { subjects: [{ kind: "cat", cat: who, pose, shot: TRAIT_PHOTOS.mischief["scratching"]!.plus[pose] }] }]),
      ["broke.sofa", storyPhoto({ kind: "broke", day: 8, at: 0, thing: "sofa", cat: who }, state)],
    ];
    for (const [name, photo] of photos) {
      expect(photo, name).not.toBeNull();
      if (!photo) continue;
      const layout = photoLayout(photo);
      const boxes = layout.pieces.map((piece) => canvasBox(piece.part));
      const frame = layoutFrame(layout.pieces, (i) => boxes[i] ?? null, layout.span)!;
      const sofa = layout.pieces.find((piece) => piece.part.id === "env/trace/sofa")?.part;
      expect(sofa, name).toBeDefined();
      if (!sofa) continue;
      // Середина латки на фото: pivot сліду + зсув точки `torn`; з запасом від краю кадру.
      const x = (sofa.x ?? 0) + (torn.x - trace.pivot.x) * (sofa.scaleX ?? 1);
      const y = (sofa.y ?? 0) + (torn.y - trace.pivot.y) * (sofa.scaleY ?? 1);
      const EDGE = 14;
      expect(x, `${name}: x`).toBeGreaterThan(frame.minX + EDGE);
      expect(x, `${name}: x`).toBeLessThan(frame.maxX - EDGE);
      expect(y, `${name}: y`).toBeGreaterThan(frame.minY + EDGE);
      expect(y, `${name}: y`).toBeLessThan(frame.maxY - EDGE);
    }
  });

  it("рамка знімка — замість типової; статура й тінь — свої", () => {
    const state = game();
    const one = hero(state);
    expect(photoLayout({ subjects: [{ kind: "cat", cat: one, pose: "calm", shot: { idea: "низько", frame: { w: 80, h: 60 } } }] }).span).toEqual({ w: 80, h: 60 });
    const shadow = (parts: readonly PortraitPart[]) => find(parts, "fx/shadow/cat");
    const plain = catPhotoParts(one, "calm");
    const fat = catPhotoParts(one, "calm", { idea: "товстий", still: { figure: "fat" } });
    expect(shadow(fat)!.scaleX ?? 1).toBeGreaterThan(shadow(plain)!.scaleX ?? 1);
    const slim = catPhotoParts(one, "calm", { idea: "худий", still: { figure: "slim" } });
    expect(slim.some((p) => p.id === "cat/body/slim")).toBe(true);
    expect(plain.some((p) => p.id === "cat/body/slim")).toBe(false);
    expect(shadow(catPhotoParts(one, "calm", { idea: "на підвіконні", still: { shadow: false } }))).toBeUndefined();
  });

  it("річ квартири на фото — у масштабі гри, хоч би який її `scale` і розмір кота: росте від найближчої до кота точки; знак — свого розміру й місця", () => {
    const state = game();
    const shot: TraitShot = {
      idea: "на дивані",
      props: [
        // Кіт у межах кадру дивана — диван росте від кореня кота: під котом та сама точка.
        { art: "env/sofa", state: null, x: 10, y: 20, scale: 0.4 },
        // Миска осторонь (кадр 56 × 48, pivot 28, 32; поза кадрами дивана й вікна): найближча до кота точка її кадру лишається на місці.
        { art: "item/bowl/cheap", state: "empty", x: 60, y: 80, scale: 0.5, front: true },
        { art: "item/water/cheap", state: "full", x: -60, y: 80, scale: 0.5, flip: true },
        // У масштабі гри — як задано; `size` — більша за масштаб гри (вікно за котом на підвіконні), а місце — те, що задано.
        { art: "mess/sock", state: "peek", x: -100, y: 30, rot: 15 },
        { art: "env/window-bird", state: "bird", x: 24, y: 12, size: 2 },
        { art: "icon/zz", state: null, x: 30, y: -60, scale: 0.3 },
        { art: "fx/speed", state: null, x: -28, y: -14, scale: 0.8 },
      ],
    };
    for (const who of [hero(state), hero(state, 1), hero(state, 30, [trait("size", 2, true)])]) {
      const parts = catPhotoParts(who, "calm", shot);
      const at = (id: string) => {
        const part = find(parts, id)!;
        return [part.x, part.y, part.scaleX, part.scaleY, part.rot ?? 0].map((v) => Math.round((v ?? 0) * 1000) / 1000);
      };
      const g = PHOTO_PROP_SCALE;
      expect(at("env/sofa")).toEqual([25 * g, 50 * g, g, g, 0]);
      // Найближчий до кота кут кадру миски був у (46, 64) — там і лишився: pivot на 28 правіше й 32 нижче.
      expect(at("item/bowl/cheap")).toEqual([46 + 28 * g, 64 + 32 * g, g, g, 0]);
      expect(at("item/water/cheap")).toEqual([-(46 + 28 * g), 64 + 32 * g, -g, g, 0]);
      expect(at("mess/sock")).toEqual([-100, 30, g, g, 15]);
      expect(at("env/window-bird")).toEqual([24 * g, 12 * g, 2 * g, 2 * g, 0]);
      expect(at("icon/zz")).toEqual([30, -60, 0.3, 0.3, 0]);
      expect(at("fx/speed")).toEqual([-28, -14, 0.8, 0.8, 0]);
    }
  });

  it("річ, що стоїть на більшій чи під нею, переїжджає разом із нею: тарілка лишається на стільниці, а знак над котом — на місці", () => {
    const state = game();
    const shot: TraitShot = {
      idea: "стіл зі стравою",
      props: [
        // Кіт у межах кадру стола — стіл росте від кореня кота, у 1 / 0,75 раза.
        { art: "env/table", state: null, x: 66, y: -12, scale: 0.75 },
        // Тарілка на стільниці — у межах кадру стола: їде з ним, а сама — у масштабі гри.
        { art: "item/dish/meal", state: "premium", x: 61, y: -53, scale: 0.9 },
        // Миска далеко від стола — сама по собі: ближчий до кота край на місці.
        { art: "item/bowl/cheap", state: "empty", x: -80, y: 40, scale: 0.5 },
        // Знак над котом теж у межах кадру стола, але лишається біля кота.
        { art: "icon/zz", state: null, x: 30, y: -60, scale: 0.3 },
      ],
    };
    const parts = catPhotoParts(hero(state), "calm", shot);
    const at = (id: string) => {
      const part = find(parts, id)!;
      return [part.x, part.y, part.scaleX].map((v) => Math.round((v ?? 0) * 100) / 100);
    };
    const g = PHOTO_PROP_SCALE;
    expect(at("env/table")).toEqual([88 * g, -16 * g, g]);
    expect(at("item/dish/meal")).toEqual([Math.round((61 / 0.75) * 100 * g) / 100, Math.round((-53 / 0.75) * 100 * g) / 100, g]);
    // Миска (56 × 48, pivot 28, 32) у половину розміру: кадр x −94…−66, y 24…48; найближча до кота точка — (−66, 24).
    expect(at("item/bowl/cheap")).toEqual([-66 - 28 * g, 24 + 32 * g, g]);
    expect(at("icon/zz")).toEqual([30, -60, 0.3]);
  });

  it("бабл речі — у вільній точці від кореня кота (дзвінок у двері): рівно там, раз, і не над героєм", () => {
    const state = game();
    const shot: TraitShot = { idea: "дзвонять у двері", bubbles: [{ kind: "say", icon: "bell", at: { x: -96, y: 12 } }, { kind: "think", icon: "kibble" }] };
    for (const who of [hero(state), hero(state, 1)]) {
      const pieces = photoLayout({ subjects: [{ kind: "cat", cat: who, pose: "calm", shot }] }).pieces;
      const say = pieces.filter((piece) => piece.part.id === "ui/bubble/say");
      expect(say.map((piece) => [piece.part.x, piece.part.y, piece.part.scaleX])).toEqual([[-96, 12, PHOTO_BUBBLE_SCALE]]);
      expect(pieces.filter((piece) => piece.part.id === "icon/bell")).toHaveLength(1);
      expect(pieces.filter((piece) => piece.part.id === "ui/bubble/think")).toHaveLength(1);
      // Бабл — у рамці фото, як і бабли над героями.
      expect(say[0]!.soft ?? say[0]!.bleed).toBeUndefined();
    }
  });

  it("рамку фото задають герої й знаки: речі квартири — м'які (у кадр входять, лише доки він не завеликий), персонаж — поза рамкою", () => {
    const state = game();
    const shot: TraitShot = {
      idea: "на дивані з думкою",
      props: [
        { art: "env/sofa", state: null, x: 10, y: 20 },
        { art: "item/ball", state: null, x: 44, y: 8, front: true },
        // Знаки: іконка, ефект, хмарка, складена річчю, і кадр речі квартири як значок.
        { art: "icon/zz", state: null, x: 30, y: -60, scale: 0.3, front: true },
        { art: "fx/speed", state: null, x: -28, y: -14, scale: 0.8 },
        { art: "ui/bubble/think", state: null, x: 20, y: -80, scale: 0.5, front: true },
        { art: "mess/cobweb", state: "corner", x: 40, y: -20, scale: 0.6, sign: true },
      ],
      companions: [{ age: "adult", still: { base: "sit" }, x: 70, y: 0 }],
      bubbles: [{ kind: "think", icon: "kibble" }],
      person: { pose: "stand", x: -50, y: -10 },
    };
    const pieces = photoLayout({ subjects: [{ kind: "cat", cat: hero(state), pose: "calm", shot }] }).pieces;
    const kind = (piece: (typeof pieces)[number]) => (piece.bleed ? "bleed" : piece.soft ? "soft" : "core");
    const of = (test: (id: string) => boolean) => new Set(pieces.filter((piece) => test(piece.part.id)).map(kind));
    expect(of((id) => id === "env/sofa" || id === "item/ball")).toEqual(new Set(["soft"]));
    expect(of((id) => id === "icon/zz" || id === "fx/speed" || id === "mess/cobweb")).toEqual(new Set(["core"]));
    expect(of((id) => id.startsWith("cat/") || id === "fx/shadow/cat")).toEqual(new Set(["core"]));
    expect(of((id) => id.startsWith("ui/bubble/") || id === "icon/kibble")).toEqual(new Set(["core"]));
    expect(of((id) => id.startsWith("person/"))).toEqual(new Set(["bleed"]));
  });

  it("інший кіт — за породою героя, а не його віком; вік кошеняти можна задати", () => {
    const state = game();
    const shot = (weeks?: number): TraitShot => ({
      idea: "друг і кошеня",
      companions: [
        { age: "adult", still: { base: "sit" }, x: 60, y: 0 },
        { age: "kitten", still: { base: "sleep" }, x: -50, y: 0, ...(weeks === undefined ? {} : { weeks }) },
      ],
    });
    const bodies = (who: ReturnType<typeof hero>, s: TraitShot) =>
      photoLayout({ subjects: [{ kind: "cat", cat: who, pose: "calm", shot: s }] })
        .pieces.filter((piece) => piece.part.id.startsWith("cat/body") && piece.recipe.key !== catRecipeKey(who))
        .map((piece) => Math.abs(piece.part.scaleX ?? 1));
    const catRecipeKey = (who: ReturnType<typeof hero>) => photoLayout({ subjects: [{ kind: "cat", cat: who, pose: "calm" }] }).pieces.find((piece) => piece.part.id.startsWith("cat/body"))!.recipe.key;
    const normal = bodies(hero(state), shot());
    const big = bodies(hero(state, 30, [trait("size", 2, true)]), shot());
    const kittenHero = bodies(hero(state, 1), shot());
    expect(Math.max(...big)).toBeCloseTo(Math.max(...normal) * 1.12);
    expect(Math.max(...kittenHero)).toBeCloseTo(Math.max(...normal));
    expect(Math.min(...bodies(hero(state), shot(0)))).toBeLessThan(Math.min(...normal));
  });
});

describe("який знімок риси на фото (§4.2, §9.7)", () => {
  const shotOf = (group: string, side: "plus" | "minus", pose: LifePose): TraitShot | undefined => {
    const area = TRAIT_GROUPS.find((g) => g.id === group)?.area;
    return area && TRAIT_PHOTOS[area][group]?.[side]?.[pose];
  };

  it("прощання — риса з опису життя: найстарша з відомих, а без відомих — найстарша", () => {
    const state = game();
    const known = album(state, cat(state, 9, 30, [trait("playful", 2, false), trait("appetite", -1, true)]), 80);
    const farewell = catSubject(storyPhoto({ kind: "farewell", day: 40, at: 57600, entry: known }, state));
    expect(farewell?.pose).toBe(lifePhotoPose(80));
    expect(farewell?.shot).toBeDefined();
    expect(farewell?.shot).toBe(shotOf("appetite", "minus", "content"));
    const unknown = album(state, cat(state, 10, 30, [trait("playful", 2, false), trait("appetite", -1, false)]), 20);
    const first = catSubject(storyPhoto({ kind: "farewell", day: 40, at: 57600, entry: unknown }, state));
    expect(first?.shot).toBeDefined();
    expect(first?.shot).toBe(shotOf("playful", "plus", "ill"));
  });

  it("кіт без рис — лише поза рівня", () => {
    const state = game();
    const plain = album(state, cat(state, 11), 60);
    expect(catSubject(storyPhoto({ kind: "farewell", day: 40, at: 57600, entry: plain }, state))?.shot).toBeUndefined();
  });

  it("живий кіт — знімок своєї риси за рівнем життя досі; на фото пенсії коти — без знімків", () => {
    const state = game();
    const home = cat(state, 12, 30, [trait("catnip", 1, true)]);
    Object.assign(home, { moodHistory: [40, 40], mood: 40 });
    state.cats.push(home);
    const living = catSubject(livingCatPhoto(home, state));
    expect(living?.shot).toBeDefined();
    expect(living?.shot).toBe(shotOf("catnip", "plus", "sulk"));
    const beside = retirementPhoto(state).subjects.filter((s) => s.kind === "cat");
    expect(beside.length).toBeGreaterThan(0);
    expect(beside.every((s) => s.kind === "cat" && s.shot === undefined)).toBe(true);
  });

  it("знімок із персонажем — персонаж у вигляді гравця; без персонажа вигляду на фото кота немає", () => {
    const withPerson = SHOTS.find((s) => s.shot?.person);
    if (!withPerson) throw new Error("жоден знімок рис не показує персонажа (ноги, коліна, руку)");
    const [group, side, pose] = withPerson.key.split(".") as [string, "plus" | "minus", LifePose];
    const state = game();
    state.character.look = { ...state.character.look, top: state.character.look.top + 1 };
    const mood = { content: 80, calm: 55, sulk: 35, ill: 5 }[pose];
    const home = cat(state, 13, 30, [trait(group, side === "plus" ? 1 : -1, true)]);
    Object.assign(home, { moodHistory: [mood], mood });
    const living = catSubject(livingCatPhoto(home, state));
    expect(living?.shot).toBe(withPerson.shot);
    expect(living?.look).toEqual(state.character.look);
    const plain = cat(state, 14, 30, [trait("catnip", 1, true)]);
    Object.assign(plain, { moodHistory: [40], mood: 40 });
    expect(catSubject(livingCatPhoto(plain, state))?.look).toBeUndefined();
  });
});

describe("рамка фото за героями (§4.2)", () => {
  const cat = { minX: -30, minY: -60, maxX: 30, maxY: 2 };
  const size = (box: { minX: number; minY: number; maxX: number; maxY: number }) => ({ w: box.maxX - box.minX, h: box.maxY - box.minY });

  it("без речей — рамка героїв; без героїв — рамка речей", () => {
    expect(photoFrame(cat, [])).toEqual(cat);
    expect(photoFrame(null, [{ minX: 0, minY: 0, maxX: 40, maxY: 20 }, { minX: -10, minY: 5, maxX: 5, maxY: 30 }])).toEqual({ minX: -10, minY: 0, maxX: 40, maxY: 30 });
    expect(photoFrame(null, [])).toBeNull();
  });

  it("дрібна річ поруч із котом — у кадрі цілком", () => {
    const bowl = { minX: 34, minY: -14, maxX: 62, maxY: 10 };
    expect(photoFrame(cat, [bowl])).toEqual({ minX: -30, minY: -60, maxX: 62, maxY: 10 });
  });

  it("велика річ обрізається: кадр не більший за найбільшу рамку, і кіт у ньому цілком — приблизно на половину ширини й висоти", () => {
    const sofa = { minX: -200, minY: -150, maxX: 180, maxY: 80 };
    // Дорослий кіт, що сидить.
    const sitting = { minX: -45, minY: -98, maxX: 40, maxY: 2 };
    const frame = photoFrame(sitting, [sofa])!;
    expect(size(frame)).toEqual({ w: PROP_FRAME.w, h: PROP_FRAME.h });
    expect(frame.minX).toBeLessThanOrEqual(sitting.minX);
    expect(frame.maxX).toBeGreaterThanOrEqual(sitting.maxX);
    expect(frame.minY).toBeLessThanOrEqual(sitting.minY);
    expect(frame.maxY).toBeGreaterThanOrEqual(sitting.maxY);
    for (const share of [size(sitting).w / size(frame).w, size(sitting).h / size(frame).h]) {
      expect(share).toBeGreaterThan(0.45);
      expect(share).toBeLessThan(0.7);
    }
  });

  it("рамка розкладу: герої й знаки — цілком, речі квартири — у межах найбільшої рамки, персонаж рамки не міняє", () => {
    const boxes = [cat, { minX: -200, minY: -150, maxX: 180, maxY: 80 }, { minX: 300, minY: -40, maxX: 400, maxY: 0 }, { minX: 20, minY: -90, maxX: 44, maxY: -70 }, null];
    const pieces = [{}, { soft: true as const }, { bleed: true as const }, {}, {}];
    const frame = layoutFrame(pieces, (i) => boxes[i] ?? null)!;
    // Герой і знак над ним — цілком; довкола — диван у межах найбільшої рамки.
    expect(frame.minX).toBeLessThanOrEqual(-30);
    expect(frame.maxX).toBeGreaterThanOrEqual(44);
    expect(frame.minY).toBeLessThanOrEqual(-90);
    expect(frame.maxY).toBeGreaterThanOrEqual(2);
    expect(size(frame)).toEqual({ w: PROP_FRAME.w, h: PROP_FRAME.h });
    expect(layoutFrame(pieces, (i) => boxes[i] ?? null, { w: 200, h: 180 })).toEqual(photoFrame({ minX: -30, minY: -90, maxX: 44, maxY: 2 }, [boxes[1]!], { w: 200, h: 180 }));
    // Самі речі — рамка речей; сам персонаж — рамки немає.
    expect(layoutFrame([{ soft: true as const }], () => boxes[1]!)).toEqual(boxes[1]);
    expect(layoutFrame([{ bleed: true as const }], () => boxes[2]!)).toBeNull();
  });

  it("кадр зсувається туди, де річ: під котом — униз, над ним — угору, збоку — вбік", () => {
    const below = photoFrame(cat, [{ minX: -40, minY: 0, maxX: 40, maxY: 260 }])!;
    expect(below.minY).toBe(cat.minY);
    expect(below.maxY).toBe(cat.minY + PROP_FRAME.h);
    const above = photoFrame(cat, [{ minX: -40, minY: -300, maxX: 40, maxY: 0 }])!;
    expect(above.maxY).toBe(cat.maxY);
    expect(above.minY).toBe(cat.maxY - PROP_FRAME.h);
    const right = photoFrame(cat, [{ minX: 20, minY: -40, maxX: 400, maxY: 0 }])!;
    expect(right.minX).toBe(cat.minX);
    expect(right.maxX).toBe(cat.minX + PROP_FRAME.w);
    // Річ далеко поза найбільшою рамкою — кадру не міняє.
    expect(photoFrame(cat, [{ minX: 300, minY: -40, maxX: 400, maxY: 0 }])).toEqual(cat);
  });

  it("більша рамка знімка — більше вікно для речей: двері за дві клітинки від кота входять у кадр", () => {
    const door = { minX: -200, minY: -20, maxX: 50, maxY: 138 };
    const plain = photoFrame(cat, [door])!;
    expect(size(plain)).toEqual({ w: PROP_FRAME.w, h: PROP_FRAME.h });
    const wide = photoFrame(cat, [door], { w: 180, h: 160 })!;
    expect(size(wide)).toEqual({ w: 180, h: 160 });
    expect(wide.minX).toBeLessThan(plain.minX);
    expect(wide.minY).toBe(cat.minY);
    // Менша за типову рамка знімка вікна не звужує.
    expect(size(photoFrame(cat, [door], { w: 80, h: 56 })!)).toEqual({ w: PROP_FRAME.w, h: PROP_FRAME.h });
  });

  it("герої більші за найбільшу рамку — рамка героїв: речі її не розширюють", () => {
    const wide = { minX: -PROP_FRAME.w, minY: -PROP_FRAME.h - 10, maxX: PROP_FRAME.w, maxY: 2 };
    expect(photoFrame(wide, [{ minX: -400, minY: -400, maxX: 400, maxY: 100 }])).toEqual(wide);
  });
});
