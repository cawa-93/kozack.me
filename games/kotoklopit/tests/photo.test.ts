// Фото титрів життя (§4.2): хто на полароїді ключової події й у якій позі, і як фото малюється — нерухомий кадр частин скелета з
// гри, без тла, один раз.

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { removeCat } from "../src/sim/farewell";
import { newGame } from "../src/sim/game";
import { createRng } from "../src/sim/rng";
import type { StoryCat, StoryItem } from "../src/sim/story";
import type { AlbumEntry, Cat, GameState } from "../src/sim/types";
import { drawPhoto } from "../src/ui/photo";
import { portraitFrame, type PortraitPart } from "../src/view/art/compose";
import { artEntries } from "../src/view/art/manifest";
import { resetArtSources, shareArtAtlas } from "../src/view/art/sources";
import { ART_INDEX_VERSION, framesOf, type ArtIndex, type FrameId, type IndexFrame } from "../src/view/art/types";
import { livingCatPhoto, PHOTO_KITTENS, storyPhoto, type CatPhotoPose, type Photo, type PersonPhotoPose } from "../src/view/photo";
import { catPhotoParts, personPhotoParts, photoCat, photoLayout, thingPhotoParts } from "../src/view/photoposes";
import { withCatCorner } from "./helpers";

const CAT_POSES: readonly CatPhotoPose[] = ["curious", "wary", "nursing", "content", "calm", "sulk", "ill"];
const PERSON_POSES: readonly PersonPhotoPose[] = ["unpack", "desk", "gloomy", "phone"];

function game(): GameState {
  return withCatCorner(newGame({ address: "she", difficulty: "normal", seed: 3 })).current;
}

function cat(state: GameState, seed: number, ageWeeks = 30, sex: Cat["sex"] = "female"): Cat {
  return createCat(state, createRng(seed), { source: "shelter", ageWeeks, sex });
}

function album(state: GameState, from: Cat, lifeMood: number): AlbumEntry {
  return { ...removeCat(state, from, { kind: "old" }, 40), lifeMood };
}

const story = (c: Cat | AlbumEntry, ageWeeks = c.ageWeeks): StoryCat => ({ cat: c, ageWeeks });

const catPose = (photo: Photo | null): CatPhotoPose | undefined => {
  const subject = photo?.subjects[0];
  return subject?.kind === "cat" ? subject.pose : undefined;
};

/** Усі кадри атласу (маніфест). */
const FRAMES = new Set<string>(artEntries().flatMap((entry) => framesOf(entry).map((ref) => ref.frame)));

const missing = (parts: readonly PortraitPart[]): string[] => parts.map(portraitFrame).filter((frame) => !FRAMES.has(frame));

/** Межі місць частин (pivot), одиниці арту. */
function extent(parts: readonly PortraitPart[]): { w: number; h: number } {
  const xs = parts.map((p) => p.x ?? 0);
  const ys = parts.map((p) => p.y ?? 0);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const eyes = (parts: readonly PortraitPart[]): string | null | undefined => parts.find((p) => p.id === "cat/eyes")?.state;

describe("подія → фото (§4.2)", () => {
  it("перший день — персонаж розпаковує речі, у своєму вигляді", () => {
    const state = game();
    const photo = storyPhoto({ kind: "start", day: 0 }, state);
    expect(photo?.subjects).toEqual([{ kind: "person", look: state.character.look, pose: "unpack" }]);
  });

  it("новий кіт — цікаво сидить у віці приїзду; знайда — насторожено", () => {
    const state = game();
    const kitten = cat(state, 5, 9);
    const arrived = story(kitten, 1);
    expect(storyPhoto({ kind: "arrival", day: 3, cat: arrived, source: "shelter" }, state)?.subjects).toEqual([{ kind: "cat", cat: arrived, pose: "curious" }]);
    for (const source of ["shelter-forced", "breeder"] as const) expect(catPose(storyPhoto({ kind: "arrival", day: 3, cat: arrived, source }, state))).toBe("curious");
    expect(catPose(storyPhoto({ kind: "arrival", day: 3, cat: arrived, source: "foundling" }, state))).toBe("wary");
  });

  it("пологи — мама годує, поруч кошенята віком 0; багато кошенят — на фото лише кілька", () => {
    const state = game();
    const mother = story(cat(state, 6));
    const kittens = Array.from({ length: 6 }, (_, i) => story(cat(state, 20 + i, 0), 0));
    const photo = storyPhoto({ kind: "births", day: 9, mother, kittens }, state);
    const subjects = photo?.subjects ?? [];
    expect(subjects[0]).toEqual({ kind: "cat", cat: mother, pose: "nursing" });
    expect(PHOTO_KITTENS).toBeGreaterThanOrEqual(2);
    expect(PHOTO_KITTENS).toBeLessThan(6);
    expect(subjects).toHaveLength(1 + PHOTO_KITTENS);
    for (const [i, subject] of subjects.slice(1).entries()) expect(subject).toEqual({ kind: "cat", cat: kittens[i], pose: "nursing" });
    // Одне кошеня — одне на фото; мами вже немає — лише кошенята.
    expect(storyPhoto({ kind: "births", day: 9, mother, kittens: kittens.slice(0, 1) }, state)?.subjects).toHaveLength(2);
    expect(storyPhoto({ kind: "births", day: 9, mother: null, kittens: kittens.slice(0, 2) }, state)?.subjects.map((s) => s.kind === "cat" && s.cat)).toEqual(kittens.slice(0, 2));
  });

  it("перша техніка — сама річ", () => {
    const state = game();
    expect(storyPhoto({ kind: "thing", day: 4, thing: "fountain", quality: "premium" }, state)?.subjects).toEqual([{ kind: "thing", thing: "fountain", quality: "premium" }]);
  });

  it("кар'єра: віхи — за столом, звільнення — понуро; решта — рядок без фото", () => {
    const state = game();
    const career = (change: "promoted" | "demoted" | "fired" | "hired", milestone: boolean): StoryItem => ({ kind: "career", day: 20, change, position: 2, milestone });
    const pose = (item: StoryItem): PersonPhotoPose | null | undefined => {
      const photo = storyPhoto(item, state);
      if (photo === null) return null;
      const subject = photo.subjects[0];
      return subject?.kind === "person" ? subject.pose : undefined;
    };
    expect(pose(career("promoted", true))).toBe("desk");
    expect(pose(career("hired", true))).toBe("desk");
    expect(pose(career("fired", true))).toBe("gloomy");
    expect(pose(career("promoted", false))).toBeNull();
    expect(pose(career("demoted", false))).toBeNull();
    const subject = storyPhoto(career("hired", true), state)?.subjects[0];
    expect(subject?.kind === "person" && subject.look).toEqual(state.character.look);
  });

  it("прощання — поза за рівнем життя (§9.7): щасливе мружиться, звичайне спокійне, нелегке ображене, нещасне хворе", () => {
    const state = game();
    const at = (lifeMood: number): CatPhotoPose | undefined => {
      const entry = album(state, cat(state, 7), lifeMood);
      const photo = storyPhoto({ kind: "farewell", day: 40, entry }, state);
      const subject = photo?.subjects[0];
      if (subject?.kind === "cat") expect(subject.cat).toEqual({ cat: entry, ageWeeks: entry.ageWeeks });
      return catPose(photo);
    };
    expect([100, 95, 70].map(at)).toEqual(["content", "content", "content"]);
    expect([69.9, 55, 50].map(at)).toEqual(["calm", "calm", "calm"]);
    expect([49.9, 35, 30].map(at)).toEqual(["sulk", "sulk", "sulk"]);
    expect([29.9, 10, 0].map(at)).toEqual(["ill", "ill", "ill"]);
  });

  it("живий кіт — та сама шкала за якістю життя досі, у теперішньому віці", () => {
    const state = game();
    const home = cat(state, 8, 12);
    const pose = (history: number[], mood: number): CatPhotoPose | undefined => {
      Object.assign(home, { moodHistory: history, mood });
      const photo = livingCatPhoto(home);
      const subject = photo.subjects[0];
      if (subject?.kind === "cat") expect(subject.cat).toEqual({ cat: home, ageWeeks: 12 });
      return catPose(photo);
    };
    expect(pose([80, 90], 10)).toBe("content");
    expect(pose([60, 50], 90)).toBe("calm");
    expect(pose([40, 30], 90)).toBe("sulk");
    expect(pose([], 20)).toBe("ill");
  });
});

describe("пози кота — частини скелета з гри", () => {
  it("кожна поза — кадри, що є в атласі, і всі пози різні", () => {
    const state = game();
    const one = cat(state, 9);
    const seen = new Set<string>();
    for (const pose of CAT_POSES) {
      const parts = catPhotoParts(story(one), pose);
      expect(parts.length, pose).toBeGreaterThan(5);
      expect(missing(parts), pose).toEqual([]);
      seen.add(JSON.stringify(parts));
    }
    expect(seen.size).toBe(CAT_POSES.length);
  });

  it("вираз: задоволений мружиться дужками, хворий — хворі очі, спокійний — розплющені; ображений сидить спиною", () => {
    const state = game();
    const one = story(cat(state, 10));
    expect(eyes(catPhotoParts(one, "content"))).toBe("arc");
    expect(eyes(catPhotoParts(one, "ill"))).toBe("sick");
    expect(eyes(catPhotoParts(one, "calm"))).toBe("open");
    expect(eyes(catPhotoParts(one, "curious"))).toBe("round");
    expect(catPhotoParts(one, "sulk").every((p) => p.view === "back" || p.view === null)).toBe(true);
    // Новонароджене кошеня при мамі спить: очі заплющені.
    expect(eyes(catPhotoParts(story(cat(state, 11, 0), 0), "nursing"))).toBe("closed");
  });

  it("кошеня — мале, як у грі: той самий кіт у віці приїзду менший, ніж дорослим", () => {
    const state = game();
    const one = cat(state, 12, 30);
    for (const pose of ["curious", "wary", "calm"] as const) {
      const small = extent(catPhotoParts(story(one, 0), pose));
      const big = extent(catPhotoParts(story(one, 30), pose));
      expect(small.w, pose).toBeLessThan(big.w * 0.7);
      expect(small.h, pose).toBeLessThan(big.h * 0.7);
    }
  });

  it("кіт з альбому (без хвороб і нашийника) — той самий малюнок, що живий", () => {
    const state = game();
    const live = cat(state, 13);
    const parts = catPhotoParts(story(live), "content");
    const entry = album(state, live, 80);
    expect(catPhotoParts(story(entry), "content")).toEqual(parts);
    const adapted = photoCat(entry, 3);
    expect(adapted).toMatchObject({ id: entry.id, genes: entry.genes, shape: entry.shape, diseases: [], collar: false, ageWeeks: 3 });
  });
});

describe("пози персонажа й речі", () => {
  const state = (): GameState => game();

  it("кожна поза — кадри, що є в атласі, і всі пози різні", () => {
    const look = state().character.look;
    const seen = new Set<string>();
    for (const pose of PERSON_POSES) {
      const parts = personPhotoParts(look, pose);
      expect(parts.length, pose).toBeGreaterThan(8);
      expect(missing(parts), pose).toEqual([]);
      seen.add(JSON.stringify(parts));
    }
    expect(seen.size).toBe(PERSON_POSES.length);
  });

  it("за столом — стіл із комп'ютером і крісло з квартири: сидіння за персонажем, спинка перед ним", () => {
    const parts = personPhotoParts(state().character.look, "desk");
    const ids = parts.map((p) => `${p.id}${p.state ? `/${p.state}` : ""}`);
    const desk = ids.findIndex((id) => id.startsWith("env/computer"));
    const seat = ids.indexOf("env/chair-desk/seat");
    const back = ids.indexOf("env/chair-desk/backrest");
    const person = ids.map((id, i) => (id.startsWith("person/") ? i : -1)).filter((i) => i >= 0);
    expect(desk).toBeGreaterThanOrEqual(0);
    expect(seat).toBeGreaterThan(desk);
    expect(Math.min(...person)).toBeGreaterThan(seat);
    expect(back).toBeGreaterThan(Math.max(...person));
  });

  it("з телефоном — телефон у руці", () => {
    expect(personPhotoParts(state().character.look, "phone").some((p) => p.id === "mess/trinket/phone")).toBe(true);
  });

  it("річ — її кадр з атласу кожного виду й якості", () => {
    for (const thing of ["robot", "fountain", "feeder"] as const) {
      for (const quality of ["cheap", "premium"] as const) {
        const parts = thingPhotoParts(thing, quality);
        expect(parts.map((p) => p.id)).toEqual([`item/${thing}/${quality}`]);
        expect(missing(parts)).toEqual([]);
      }
    }
  });
});

describe("розклад фото", () => {
  it("мама з кошенятами — один кадр на всіх, кожен своїм рецептом; кошенята менші за маму", () => {
    const s = game();
    const mother = story(cat(s, 14));
    const kittens = [story(cat(s, 30, 0), 0), story(cat(s, 31, 0), 0)];
    const layout = photoLayout({ subjects: [{ kind: "cat", cat: mother, pose: "nursing" }, ...kittens.map((k) => ({ kind: "cat" as const, cat: k, pose: "nursing" as const }))] });
    const own = catPhotoParts(mother, "nursing").length + kittens.reduce((n, k) => n + catPhotoParts(k, "nursing").length, 0);
    expect(layout.pieces).toHaveLength(own);
    expect(new Set(layout.pieces.map((p) => p.recipe.key)).size).toBeGreaterThanOrEqual(3);
    // Рамка фото не менша за дорослого кота — тож кошеня саме по собі на фото мале.
    expect(layout.span.w).toBeGreaterThan(0);
    expect(layout.span.h).toBeGreaterThan(0);
  });

  it("кожна частина кожного виду фото — кадр, що є в атласі", () => {
    const s = game();
    const one = story(cat(s, 15));
    const photos: Photo[] = [
      ...CAT_POSES.map((pose): Photo => ({ subjects: [{ kind: "cat", cat: one, pose }] })),
      ...PERSON_POSES.map((pose): Photo => ({ subjects: [{ kind: "person", look: s.character.look, pose }] })),
      { subjects: [{ kind: "thing", thing: "robot", quality: "cheap" }] },
    ];
    for (const photo of photos) {
      const parts = photoLayout(photo).pieces.map((p) => p.part);
      expect(parts.length).toBeGreaterThan(0);
      expect(missing(parts)).toEqual([]);
    }
  });
});

describe("модулі фото — без Phaser і DOM", () => {
  const sources = import.meta.glob<string>(["../src/view/photo.ts", "../src/view/photo*.ts"], { query: "?raw", import: "default", eager: true });

  it("вибір фото й пози рахуються в Node", () => {
    const files = Object.entries(sources);
    expect(files.map(([file]) => file.replace(/^.*\//, ""))).toEqual(expect.arrayContaining(["photo.ts", "photoposes.ts"]));
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
      expect(source, file).not.toMatch(/\b(window|document|localStorage)\s*[.[]/);
      expect(source, file).not.toMatch(/\bCanvasRenderingContext2D\b|\bHTMLCanvasElement\b|requestAnimationFrame/);
    }
  });
});

// --- Малюнок -----------------------------------------------------------------------------------------

/** Фальшиве полотно 2D: лічить малювання; пікселі — усі непрозорі. */
function fakeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; draws: () => number } {
  let draws = 0;
  const canvas = { width, height } as { width: number; height: number; getContext?: () => unknown };
  const ctx = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    fillRect() {},
    drawImage() {
      draws++;
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) }),
  };
  canvas.getContext = () => ctx;
  return { canvas: canvas as unknown as HTMLCanvasElement, draws: () => draws };
}

/** Атлас, у якому є всі кадри фото (кожен шар — на сторінці 0). */
function fakeAtlas(frames: readonly FrameId[]): void {
  const entry = (): IndexFrame => ({ size: { w: 40, h: 40 }, res: 1, pivot: { x: 20, y: 36 }, trim: { x: 0, y: 0 }, layers: Object.fromEntries(["all", "fill", "shade", "ink"].map((l) => [l, { page: 0, x: 0, y: 0, w: 40, h: 40 }])) });
  const index: ArtIndex = { version: ART_INDEX_VERSION, pages: [{ file: "page-0.webp", w: 64, h: 64 }], frames: Object.fromEntries(frames.map((f) => [f, entry()])) };
  shareArtAtlas(index, [{ name: "сторінка" } as unknown as CanvasImageSource]);
}

describe("drawPhoto: нерухомий кадр", () => {
  afterEach(() => {
    resetArtSources();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function watchTimers(): { calls: () => number } {
    const raf = vi.fn();
    const interval = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("setInterval", interval);
    const timeout = vi.spyOn(globalThis, "setTimeout");
    return { calls: () => raf.mock.calls.length + interval.mock.calls.length + timeout.mock.calls.length };
  }

  it("атлас готовий — малює героїв одразу й один раз, без циклу анімації", async () => {
    const s = game();
    const photo: Photo = { subjects: [{ kind: "cat", cat: story(cat(s, 16)), pose: "content" }] };
    fakeAtlas(photoLayout(photo).pieces.map((p) => portraitFrame(p.part)));
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          readonly width: number,
          readonly height: number,
        ) {}
        getContext(): unknown {
          return fakeCanvas(this.width, this.height).canvas.getContext("2d");
        }
      },
    );
    const timers = watchTimers();
    const { canvas, draws } = fakeCanvas(240, 240);
    drawPhoto(canvas, photo);
    const once = draws();
    expect(once).toBeGreaterThan(0);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(draws()).toBe(once);
    expect(timers.calls()).toBe(0);
  });

  it("атласу немає — полотно не чіпає й нічого не чекає щокадру", () => {
    const s = game();
    const timers = watchTimers();
    let touched = false;
    const canvas = {
      width: 100,
      height: 100,
      getContext: () => {
        touched = true;
        return null;
      },
    } as unknown as HTMLCanvasElement;
    drawPhoto(canvas, { subjects: [{ kind: "person", look: s.character.look, pose: "desk" }] });
    expect(touched).toBe(false);
    expect(timers.calls()).toBe(0);
  });
});
