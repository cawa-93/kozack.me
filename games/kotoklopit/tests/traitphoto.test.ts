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
import { lifePhotoPose, livingCatPhoto, retirementPhoto, storyPhoto, type Photo } from "../src/view/photo";
import { personRecipe } from "../src/view/art/recipes";
import { catPhotoParts, PHOTO_BUBBLE_SCALE, photoLayout } from "../src/view/photoposes";
import { CAT_ANIMS } from "../src/view/rig/anims";
import { TRAIT_PHOTOS } from "../src/view/traitphoto";
import { CAT_PHOTO_BONES, LIFE_POSES, type LifePose, type TraitShot } from "../src/view/traitphoto/types";
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
      { art: "item/bowl/cheap", state: "empty", x: -28, y: 6, front: true, scale: 0.8 },
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
    expect(parts[bowl]).toMatchObject({ x: -28, y: 6, scaleX: 0.8, scaleY: 0.8, state: "empty" });
  });

  it("кошеня — річ ближче до нього, але того самого розміру", () => {
    const state = game();
    const young = cat(state, 4, 1);
    const adult = catPhotoParts({ cat: young, ageWeeks: 30 }, "calm", SHOT).find((p) => p.id === "item/toy/cheap");
    const kitten = catPhotoParts({ cat: young, ageWeeks: 1 }, "calm", SHOT).find((p) => p.id === "item/toy/cheap");
    expect(Math.abs(kitten?.x ?? 0)).toBeLessThan(Math.abs(adult?.x ?? 0));
    expect(kitten?.scaleX ?? 1).toBe(adult?.scaleX ?? 1);
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

  it("річ «за котом» — під кошеням менша, як і її місце; інша — того самого розміру", () => {
    const state = game();
    const shot: TraitShot = { idea: "на роботі", props: [{ art: "item/robot/cheap", state: "charging", x: 0, y: 2, scale: 0.8, withCat: true }, { art: "item/toy/cheap", state: null, x: 30, y: 0 }] };
    const adult = catPhotoParts(hero(state), "calm", shot);
    const kitten = catPhotoParts(hero(state, 1), "calm", shot);
    expect(find(kitten, "item/robot/cheap")!.scaleX ?? 1).toBeLessThan(find(adult, "item/robot/cheap")!.scaleX ?? 1);
    expect(find(adult, "item/robot/cheap")!.scaleX).toBeCloseTo(0.8);
    expect(find(kitten, "item/toy/cheap")!.scaleX ?? 1).toBe(find(adult, "item/toy/cheap")!.scaleX ?? 1);
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
