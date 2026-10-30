// Нові пози кота й вирази для нового вигляду (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): `catPose` / `catAnim`
// (`src/view/pose.ts`), обличчя `catFace`, разові анімації від подій і змін (`catEventAnims`, `catTransition`), назви анімацій
// за групами N1–N3 (`anim/ids.ts`). Старий вигляд (`poseOf`) — без змін (`fights.test.ts`, `catplay.test.ts`).

import { describe, expect, it } from "vitest";

import { petTolerance } from "../src/sim/actions";
import { createCat, idleAct } from "../src/sim/cat";
import { PETTING } from "../src/sim/config";
import { fallIll } from "../src/sim/diseases";
import type { GameEvent } from "../src/sim/events";
import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { advance, newGame } from "../src/sim/game";
import { objectById } from "../src/sim/home";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { absoluteMinute } from "../src/sim/time";
import type { Cat, CatAct, DiseaseId, Save, TraitLevel } from "../src/sim/types";
import { catEventAnims, catMemory, catTransition } from "../src/view/anim/catevents";
import { blinkEyes, catFace, CAT_EARS, CAT_EYES, CAT_MOUTHS } from "../src/view/anim/catface";
import { CAT_ANIM_GROUPS, CAT_ANIM_IDS, CAT_ONE_SHOT_MS, CAT_OVERLAYS, type CatAnimId } from "../src/view/anim/ids";
import { catAnim, catPose, poseOf } from "../src/view/pose";
import { blinkAmount } from "../src/view/thoughts";
import { recordEvents, withCatCorner } from "./helpers";

function game(seed = 3): Save {
  const save = withCatCorner(newGame({ address: "she", difficulty: "normal", seed }));
  save.current.minute = 17 * 60;
  return save;
}

function withCat(save: Save, at = { x: 9.5, y: 8.5 }, traits: Record<string, TraitLevel> = {}, ageWeeks = 3): Cat {
  const cat = createCat(save.current, createRng(save.current.cats.length + 11), { source: "shelter", ageWeeks, at });
  cat.traits = Object.entries(traits).map(([group, level]) => ({ group, level, seen: 0, known: false }));
  cat.arrivedDay = -10;
  cat.mood = 50;
  cat.love = 50;
  cat.needs = { hunger: 0, thirst: 0, toilet: 0, fatigue: 0, attention: 0, play: 0 };
  cat.act = idleAct(30);
  addCat(save.current, cat);
  return cat;
}

const act = (kind: CatAct["kind"], extra: Partial<CatAct> = {}): CatAct => ({ kind, target: null, goal: null, minutes: 10, elapsed: 0, ...extra });

const ill = (save: Save, cat: Cat, id: DiseaseId): void => {
  fallIll(save.current, cat, id);
};

describe("назви анімацій кота (`anim/ids.ts`)", () => {
  it("кожна назва — рівно в одній групі N1–N3; разові й накладки — з цих назв", () => {
    const all = Object.values(CAT_ANIM_GROUPS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(CAT_ANIM_IDS).toEqual(all);
    for (const id of Object.keys(CAT_ONE_SHOT_MS)) expect(all).toContain(id);
    for (const id of CAT_OVERLAYS) expect(all).toContain(id);
    for (const ms of Object.values(CAT_ONE_SHOT_MS)) expect(ms).toBeGreaterThan(0);
  });

  it("усі пози старого вигляду мають відповідник: тих самих назв (крім `lie` → `decline`)", () => {
    for (const legacy of ["walk", "sit", "eat", "sleep", "hide", "carried", "belly", "roll", "bury", "groom", "mark", "cough", "scratch", "stretch", "carrier", "crouch", "blanket", "sprawl", "arch", "brawl", "lick", "paw", "kick"]) {
      expect(CAT_ANIM_IDS).toContain(legacy);
    }
    expect(CAT_ANIM_IDS).toContain("decline");
  });
});

describe("нові пози кота (`catPose`)", () => {
  it("на лотку присідає; чистюля, що відмовився від брудного, нюхає; мстивий присідає на ліжку", () => {
    const save = game();
    const cat = withCat(save, { x: 8.5, y: 3.5 });
    const box = save.current.home.items.find((i) => i.kind === "litter")!;
    cat.act = act("toilet", { target: `item:${box.id}` });
    expect(catPose(save.current, cat)).toBe("squat");
    cat.act.refused = true;
    expect(catPose(save.current, cat)).toBe("sniff");
    cat.act = act("revenge", { target: "bed" });
    expect(catPose(save.current, cat)).toBe("squat");
    // Іде до лотка — іде.
    cat.act = act("toilet", { target: `item:${box.id}`, goal: { x: 8, y: 3 } });
    expect(catPose(save.current, cat)).toBe("walk");
  });

  it("травмований кульгає — і в ході, і в зумі; з хворим хребтом — незграбна хода; сумний — сумна хода", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("wander", { goal: { x: 3, y: 8 } });
    expect(catPose(save.current, cat)).toBe("walk");
    cat.mood = 10;
    expect(catPose(save.current, cat)).toBe("sadWalk");
    ill(save, cat, "spine");
    expect(catPose(save.current, cat)).toBe("clumsy");
    ill(save, cat, "injury");
    expect(catPose(save.current, cat)).toBe("limp");
    cat.act = act("zoomies", { goal: { x: 3, y: 8 } });
    expect(catPose(save.current, cat)).toBe("limp");
  });

  it("хода повільніша за швидкістю кота (травма), біг — ні", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("wander", { goal: { x: 3, y: 8 } });
    expect(catAnim(save.current, cat).speed).toBe(1);
    ill(save, cat, "injury");
    expect(catAnim(save.current, cat)).toMatchObject({ anim: "limp" });
    expect(catAnim(save.current, cat).speed).toBeLessThan(1);
    const healthy = withCat(save, { x: 12.5, y: 8.5 });
    healthy.act = act("zoomies", { goal: { x: 3, y: 8 } });
    expect(catAnim(save.current, healthy)).toEqual({ anim: "run", overlay: null, speed: 1 });
  });

  it("з проблемами з диханням хропе уві сні й на колінах; здоровий спить клубком", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("sleep", { minutes: 300 });
    expect(catPose(save.current, cat)).toBe("sleep");
    ill(save, cat, "breathing");
    expect(catPose(save.current, cat)).toBe("snore");
    cat.act = act("lap", { minutes: 60 });
    expect(catPose(save.current, cat)).toBe("snore");
    // Під ковдрою й у переносці — свої пози, хоч і хропе.
    cat.act = act("sleep", { minutes: 300, blanket: true });
    expect(catPose(save.current, cat)).toBe("blanket");
  });

  it("нюхає корм, від якого відмовився перебірливий, дрібничку, яку обходить «Делікатний», нову річ і м'яту", () => {
    const save = game();
    const cat = withCat(save, { x: 17.5, y: 3.5 });
    const bowl = save.current.home.items.find((i) => i.kind === "bowl")!;
    cat.act = act("eat", { target: `item:${bowl.id}` });
    expect(catPose(save.current, cat)).toBe("eat");
    cat.act.refused = true;
    expect(catPose(save.current, cat)).toBe("sniff");
    cat.act = act("knock", { target: "trinket:mug", refused: true });
    expect(catPose(save.current, cat)).toBe("sniff");
    cat.act = act("knock", { target: "trinket:mug" });
    expect(catPose(save.current, cat)).toBe("knock");
    cat.act = act("idle", { target: `sniff:${bowl.id}` });
    expect(catPose(save.current, cat)).toBe("sniff");
    cat.act = act("idle", { target: "catnip" });
    expect(catPose(save.current, cat)).toBe("sniff");
  });

  it("буханцем: біля столу («Поважає роботу»), поруч із тим, кого гладять, нагорі в схованці й від утоми", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("idle", { target: "desk" });
    expect(catPose(save.current, cat)).toBe("loaf");
    cat.act = act("idle", { target: "cuddle:999" });
    expect(catPose(save.current, cat)).toBe("loaf");
    cat.act = idleAct(10);
    expect(catPose(save.current, cat)).toBe("sit");
    cat.needs.fatigue = 70;
    expect(catPose(save.current, cat)).toBe("loaf");
    const fridge = objectById("fridge");
    cat.x = fridge.x + 0.5;
    cat.y = fridge.y + 0.5;
    cat.act = act("hide", { target: "high" });
    expect(catPose(save.current, cat)).toBe("loaf");
    cat.x = 14.5;
    cat.y = 10.5;
    expect(catPose(save.current, cat)).toBe("hide");
  });

  it("бешкет: лапає зачинену шафку, з відчиненої — їсть; перекидає смітник лапою", () => {
    const save = game();
    const cat = withCat(save, { x: 17.5, y: 3.5 });
    cat.act = act("raid", { target: "cabinet" });
    expect(catPose(save.current, cat)).toBe("knock");
    save.current.home.cabinetOpen = true;
    expect(catPose(save.current, cat)).toBe("eat");
    cat.act = act("raid", { target: "trash" });
    expect(catPose(save.current, cat)).toBe("knock");
  });

  it("з вудкою стрибає за пером, під рукою сидить; свою іграшку б'є лапами; несе іграшку в зубах", () => {
    const save = game();
    const cat = withCat(save);
    save.current.character.activity = { kind: "play", cat: cat.id, minutes: 0 };
    expect(catPose(save.current, cat)).toBe("pounce");
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 0 };
    expect(catPose(save.current, cat)).toBe("sit");
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 0, bitten: true };
    expect(catPose(save.current, cat)).toBe("sit");
    save.current.character.activity = null;
    cat.act = act("toy", { target: "item:1" });
    expect(catPose(save.current, cat)).toBe("pounce");
    cat.act = act("toy", { target: "item:1", goal: { x: 5, y: 8 } });
    expect(catPose(save.current, cat)).toBe("run");
    cat.act = act("carry", { carry: "toy", picked: true, dest: "sofa", goal: { x: 14, y: 9 } });
    expect(catPose(save.current, cat)).toBe("carry");
    delete cat.act.picked;
    expect(catPose(save.current, cat)).toBe("walk");
  });

  it("просить, біля вікна, на клавіатурі, не хоче гратися — свої пози", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("beg", { target: "sink" });
    expect(catPose(save.current, cat)).toBe("beg");
    cat.act = act("window", { target: "sill-bedroom" });
    expect(catPose(save.current, cat)).toBe("window");
    cat.act = act("keyboard", { target: "computer" });
    expect(catPose(save.current, cat)).toBe("keyboard");
    cat.act = act("idle", { target: "declined:5" });
    expect(catPose(save.current, cat)).toBe("decline");
    expect(poseOf(cat, false)).toBe("lie");
  });

  it("сценарій «Хворі коти» (`scenarios/sick-cats.json`): Кульгас кульгає, Бурчик їсть, утомлений Дідусь (серце) лежить буханцем", () => {
    const scenario = FILE_SCENARIOS["sick-cats"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const named = (name: string): Cat => save.current.cats.find((c) => c.name === name)!;
    expect(catPose(save.current, named("Кульгас"))).toBe("limp");
    expect(catPose(save.current, named("Бурчик"))).toBe("eat");
    const grandpa = named("Дідусь");
    expect(catPose(save.current, grandpa)).toBe(grandpa.needs.fatigue >= 60 ? "loaf" : "sit");
  });

  it("сценарій «Десять котів» (`scenarios/ten-cats.json`): нова поза лише уточнює стару — тієї самої родини", () => {
    const scenario = FILE_SCENARIOS["ten-cats"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    // Стара поза → які нові можуть її уточнювати (хвороби, смуток, утома, нюхання, буханець, бешкет, прохання…).
    const family: Partial<Record<ReturnType<typeof poseOf>, readonly CatAnimId[]>> = {
      walk: ["walk", "run", "carry", "limp", "clumsy", "sadWalk", "pounce"],
      eat: ["eat", "drink", "chew", "sniff"],
      sleep: ["sleep", "snore", "loaf"],
      sit: ["sit", "loaf", "beg", "nudge", "sulk", "knock", "window", "keyboard", "pounce", "squat", "sniff", "hide"],
      arch: ["arch"],
      brawl: ["brawl"],
      lick: ["lick"],
      groom: ["groom"],
    };
    const seen = new Set<string>();
    for (let t = 0; t < 120; t += 1) {
      advance(save, 1);
      for (const cat of save.current.cats) {
        if (cat.away !== null || save.current.character.held?.kind === "cat") continue;
        const legacy = poseOf(cat, false);
        const allowed = family[legacy];
        if (allowed === undefined) continue;
        seen.add(legacy);
        expect(allowed).toContain(catPose(save.current, cat));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe("накладки кота (`catAnim`)", () => {
  it("під рукою — «подобається» чи «терпить», на руках проти волі — «пручається», вилизують — «подобається»", () => {
    const save = game();
    const cat = withCat(save);
    cat.needs.attention = 90;
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 0 };
    expect(catAnim(save.current, cat)).toMatchObject({ anim: "sit", overlay: "content" });
    cat.needs.attention = 0;
    expect(catAnim(save.current, cat).overlay).toBe("reluctant");
    // За хвилину до кінця терпіння — «попереджає», свій вигляд (§10, рішення автора 2026-10-30, п. 4), і в того, хто хоче уваги.
    cat.needs.attention = 90;
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: petTolerance(cat) - PETTING.warnMinutes + 0.25 };
    expect(catAnim(save.current, cat)).toMatchObject({ anim: "sit", overlay: "warn" });
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 999 };
    expect(catAnim(save.current, cat).overlay).toBe("struggle");
    save.current.character.activity = null;
    const friend = withCat(save, { x: 10.1, y: 8.5 });
    cat.act = act("idle", { target: `licked:${friend.id}` });
    expect(catAnim(save.current, cat)).toMatchObject({ anim: "sit", overlay: "content" });
  });

  it("щасливий і відданий поруч із персонажем повільно кліпає; перед ворогом — ні", () => {
    const save = game();
    const cat = withCat(save, { x: 9.5, y: 8.5 });
    save.current.character.body.x = 11.5;
    save.current.character.body.y = 8.5;
    cat.mood = 90;
    cat.love = 90;
    expect(catAnim(save.current, cat)).toMatchObject({ anim: "sit", overlay: "slowBlink" });
    const foe = withCat(save, { x: 10.1, y: 8.5 });
    cat.act = act("standoff", { target: `cat:${foe.id}` });
    expect(catAnim(save.current, cat)).toMatchObject({ anim: "arch", overlay: null });
  });
});

describe("обличчя кота (`catFace`)", () => {
  it("стани — лише з контракту маніфесту: очі, рот, вуха", () => {
    expect(CAT_EYES).toEqual(["open", "half", "closed", "arc", "squint", "round", "sick"]);
    expect(CAT_MOUTHS).toEqual(["closed", "meow", "hiss", "yawn", "eat", "tongue"]);
    expect(CAT_EARS.length).toBeGreaterThan(0);
  });

  it("спить — очі заплющені; під рукою мружиться дужками, терпить — примружені, пручається — круглі, вуха притиснуті", () => {
    const save = game();
    const cat = withCat(save);
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "open", mouth: "closed", ears: "up" });
    cat.act = act("sleep", { minutes: 300 });
    expect(catFace(save.current, cat, 0).eyes).toBe("closed");
    cat.act = idleAct(30);
    cat.needs.attention = 90;
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 0 };
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "arc", mouth: "closed", ears: "up" });
    cat.needs.attention = 0;
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "squint", mouth: "closed", ears: "flat" });
    // Попереджає: вуха «літачком», як перед ворогом, — не так, як у того, хто терпить (§10, п. 4).
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: petTolerance(cat) - PETTING.warnMinutes + 0.25 };
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "squint", mouth: "closed", ears: "back" });
    save.current.character.activity = { kind: "pet", cat: cat.id, minutes: 999 };
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "round", mouth: "closed", ears: "flat" });
  });

  it("сумний — напівзаплющені, вуха вбік; повільне кліпання — за часом; дуга — круглі, вуха назад, щойно шипів — рот з іклами", () => {
    const save = game();
    const cat = withCat(save);
    cat.mood = 10;
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "half", mouth: "closed", ears: "side" });
    cat.mood = 90;
    cat.love = 90;
    save.current.character.body.x = 11.5;
    save.current.character.body.y = 8.5;
    const open = [...Array(8000).keys()].find((t) => blinkAmount(t, cat.id) === 0)!;
    const closed = [...Array(8000).keys()].find((t) => blinkAmount(t, cat.id) === 1)!;
    expect(catFace(save.current, cat, open).eyes).toBe("open");
    expect(catFace(save.current, cat, closed).eyes).toBe("closed");
    expect(blinkEyes(closed, cat.id)).toBe("closed");
    const foe = withCat(save, { x: 10.1, y: 8.5 });
    cat.act = act("standoff", { target: `cat:${foe.id}` });
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "round", mouth: "closed", ears: "back" });
    cat.hissedAt = absoluteMinute(save.current.day, save.current.minute);
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "round", mouth: "hiss", ears: "back" });
  });

  it("вилизує друга й себе — язичок, їсть — рот жує, кон'юнктивіт — хворі очі (крім заплющених)", () => {
    const save = game();
    const cat = withCat(save);
    const friend = withCat(save, { x: 10.1, y: 8.5 });
    cat.act = act("groom", { target: `cat:${friend.id}` });
    expect(catFace(save.current, cat, 0)).toEqual({ eyes: "half", mouth: "tongue", ears: "up" });
    cat.act = act("groom", { target: "wash" });
    expect(catFace(save.current, cat, 0).mouth).toBe("tongue");
    cat.act = act("eat", { target: "item:1" });
    expect(catFace(save.current, cat, 0).mouth).toBe("eat");
    ill(save, cat, "conjunctivitis");
    expect(catFace(save.current, cat, 0).eyes).toBe("sick");
    cat.act = act("sleep", { minutes: 300 });
    expect(catFace(save.current, cat, 0).eyes).toBe("closed");
  });
});

describe("разові анімації кота (`catEventAnims`, `catTransition`)", () => {
  it("симптоми: чхає, чухається задньою лапою, тре очі; у лотку кричить від болю — обличчям", () => {
    const save = game();
    const state = save.current;
    expect(catEventAnims({ type: "symptom", cat: 1, symptom: "sneeze" }, state)).toEqual([{ cat: 1, anim: "sneeze", face: { eyes: "closed", mouth: "meow" }, ms: CAT_ONE_SHOT_MS.sneeze }]);
    expect(catEventAnims({ type: "symptom", cat: 1, symptom: "itch" }, state)[0]).toMatchObject({ anim: "itch", ms: CAT_ONE_SHOT_MS.itch });
    expect(catEventAnims({ type: "symptom", cat: 1, symptom: "eyes" }, state)[0]).toMatchObject({ anim: "rubEyes" });
    expect(catEventAnims({ type: "symptom", cat: 1, symptom: "pain" }, state)[0]).toMatchObject({ anim: null, face: { mouth: "meow" } });
  });

  it("під меблями й на руках чухатися всім тілом нема як — лише обличчям; чхання (накладка) — і на руках", () => {
    const save = game();
    const cat = withCat(save, { x: 14.5, y: 10.5 });
    cat.act = act("hide", { target: "sofa" });
    expect(catEventAnims({ type: "symptom", cat: cat.id, symptom: "itch" }, save.current)).toEqual([
      { cat: cat.id, anim: null, face: { eyes: "squint" }, ms: CAT_ONE_SHOT_MS.itch },
    ]);
    cat.act = idleAct(10);
    save.current.character.held = { kind: "cat", cat: cat.id };
    expect(catEventAnims({ type: "symptom", cat: cat.id, symptom: "eyes" }, save.current)[0]?.anim).toBeNull();
    expect(catEventAnims({ type: "symptom", cat: cat.id, symptom: "sneeze" }, save.current)[0]?.anim).toBe("sneeze");
  });

  it("блює й зригує грудку той кіт, чий це безлад; чужий безлад — ні", () => {
    const state = game().current;
    expect(catEventAnims({ type: "mess", mess: { id: 1, kind: "vomit", x: 1, y: 1, cat: 7 } }, state)[0]).toMatchObject({ cat: 7, anim: "vomit" });
    expect(catEventAnims({ type: "mess", mess: { id: 1, kind: "hairball", x: 1, y: 1, cat: 7 } }, state)[0]).toMatchObject({ cat: 7, anim: "vomit" });
    expect(catEventAnims({ type: "mess", mess: { id: 1, kind: "vomit", x: 1, y: 1, cat: null } }, state)).toEqual([]);
    expect(catEventAnims({ type: "mess", mess: { id: 1, kind: "litter", x: 1, y: 1, cat: 7 } }, state)).toEqual([]);
  });

  it("задишка після гри — лише в кота з проблемами з диханням чи хворим серцем", () => {
    const save = game();
    const a = withCat(save);
    const b = withCat(save, { x: 11.5, y: 8.5 });
    expect(catEventAnims({ type: "played", cat: a.id, minutes: 5 }, save.current)).toEqual([]);
    ill(save, a, "breathing");
    ill(save, b, "heart");
    expect(catEventAnims({ type: "played", cat: a.id, minutes: 5 }, save.current)).toEqual([{ cat: a.id, anim: "pant", face: null, ms: CAT_ONE_SHOT_MS.pant }]);
    expect(catEventAnims({ type: "cats-played", cats: [a.id, b.id] }, save.current).map((s) => s.cat)).toEqual([a.id, b.id]);
  });

  it("шипіння, укус, нявкання — свої; подія не про кота — нічого", () => {
    const state = game().current;
    expect(catEventAnims({ type: "hissed", cat: 2, at: 3 }, state)[0]).toMatchObject({ cat: 2, anim: "hiss", face: { mouth: "hiss" } });
    expect(catEventAnims({ type: "bite", cat: 2 }, state)[0]).toMatchObject({ anim: "hiss" });
    expect(catEventAnims({ type: "meow", cat: 2 }, state)[0]).toMatchObject({ anim: null, face: { mouth: "meow" } });
    expect(catEventAnims({ type: "dash" }, state)).toEqual([]);
    expect(catEventAnims({ type: "took", object: "fridge", item: { kind: "raw", quality: "cheap" } }, state)).toEqual([]);
  });

  it("сценарій «Хворі коти»: кожен симптом, що чути чи видно, дає разову анімацію саме того кота", () => {
    const scenario = FILE_SCENARIOS["sick-cats"];
    if (!scenario) throw new Error("немає сценарію");
    const save = applyScenario(scenario);
    const { events, stop } = recordEvents();
    for (let t = 0; t < 180; t += 1) advance(save, 1);
    stop();
    const symptoms = events.filter((e): e is Extract<GameEvent, { type: "symptom" }> => e.type === "symptom");
    expect(new Set(symptoms.map((e) => e.symptom))).toEqual(new Set(["sneeze", "itch", "eyes", "pain"]));
    const expected = { sneeze: "sneeze", itch: "itch", eyes: "rubEyes", pain: null } as const;
    for (const event of symptoms) {
      const [shot] = catEventAnims(event, save.current);
      expect(shot).toMatchObject({ cat: event.cat, anim: expected[event.symptom] });
      expect(shot!.ms).toBeGreaterThan(0);
    }
  });

  it("стрибок угору на диван і вниз; під диван — без стрибка; нагору сховатися — стрибок; переставили — нічого", () => {
    const save = game();
    const cat = withCat(save, { x: 13.5, y: 9.9 });
    const sofa = objectById("sofa");
    cat.act = act("wander", { goal: { x: sofa.x, y: sofa.y } });
    const before = catMemory(cat);
    cat.y = sofa.y + 0.1;
    expect(catTransition(save.current, cat, before)).toMatchObject({ cat: cat.id, anim: "jumpUp", ms: CAT_ONE_SHOT_MS.jumpUp });
    const up = catMemory(cat);
    cat.y = 9.9;
    expect(catTransition(save.current, cat, up)).toMatchObject({ anim: "jumpDown" });
    cat.act = act("hide", { goal: { x: sofa.x, y: sofa.y } });
    expect(catTransition(save.current, cat, catMemory(cat))).toBeNull();
    const under = catMemory(cat);
    cat.y = sofa.y + 0.1;
    expect(catTransition(save.current, cat, under)).toBeNull();
    const fridge = objectById("fridge");
    cat.x = fridge.x + 0.5;
    cat.y = fridge.y + 1.1;
    const floor = catMemory(cat);
    cat.y = fridge.y + 0.9;
    expect(catTransition(save.current, cat, floor)).toMatchObject({ anim: "jumpUp" });
    cat.act = act("wander");
    const far = { x: 3.5, y: 8.5, asleep: false };
    expect(catTransition(save.current, cat, far)).toBeNull();
    expect(catTransition(save.current, cat, null)).toBeNull();
  });

  it("прокинувся — позіхає (і на руках, коли розбудили); заснув — ні", () => {
    const save = game();
    const cat = withCat(save);
    cat.act = act("sleep", { minutes: 300 });
    const sleeping = catMemory(cat);
    expect(sleeping.asleep).toBe(true);
    expect(catTransition(save.current, cat, sleeping)).toBeNull();
    cat.act = idleAct(10);
    expect(catTransition(save.current, cat, sleeping)).toMatchObject({ anim: null, face: { mouth: "yawn" } });
    expect(catTransition(save.current, cat, catMemory(cat))).toBeNull();
  });
});
