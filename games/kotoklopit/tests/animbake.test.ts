// Доріжки анімацій рахує збирання (§2.1, «Анімація»; `scripts/anims/`): у модулі групи `rig/anims/<скелет>/<група>.ts`
// кожна анімація стає посиланням на готові дані, а код, що лишився без ужитку (пози, будівники доріжок), зникає. Тут:
// правила заміни на малому прикладі, а на справжніх групах — що модулі з готовими даними експортують точно те саме, що
// й код (значення, порядок ключів, спільні об'єкти, функції для вигляду), і що будівники під час запуску не працюють.

import fs from "node:fs";
import path from "node:path";

import { parseAst, runnerImport, type Plugin } from "vite";
import { describe, expect, it } from "vitest";

import { bakeGroup, type GroupData } from "../scripts/anims/bake";
import { groupData } from "../scripts/anims/load";
import { animsPlugin } from "../scripts/anims/plugin";
import { BOTTOM_CUTS } from "../src/view/wardrobe/bottoms";
import { packAnims, unpackAnims } from "../src/view/rig/animpack";
import * as sourceIndex from "../src/view/rig/anims/index";
import { graphDifference } from "./graph";

const GAME = path.resolve(import.meta.dirname, "..");
const UNPACK = "/src/view/rig/animpack.ts";

// --- Малий приклад ---------------------------------------------------------------------------------

const SAMPLE = `// Група «приклад»: коментар кирилицею перед кодом — позиції вузлів рахуються в символах, а не в байтах.
import { defineAnims } from "../../types";
import { RIG } from "../../defs/sample";

type Anim = { duration: number; loop: boolean };
interface Pose { rot: number }
const DEG = Math.PI / 180;
const REGISTRY = new Map<Anim, number>();

function posed(ms: number): Anim {
  return { duration: ms * SCALE, loop: true };
}
const SCALE = 2;
const SIT: Pose = { rot: posed(1).duration };
const sit: Anim = { duration: SIT.rot, loop: true };

const LEG = measure();
function measure(): number {
  return 20 * DEG;
}
export function legLength(): number {
  return LEG;
}
export type Name = keyof typeof GROUP;

const struggle = posed(3);
REGISTRY.set(struggle, 1);
export const kicks = (anim: Anim): number => REGISTRY.get(anim) ?? 0;

export const GROUP = defineAnims(RIG, {
  sit,
  walk: posed(2),
  "struggle": struggle,
  /** Тримає. */
  hold: { duration: 5, loop: false },
});
export const EXTRA = defineAnims(RIG, { sitToo: sit, run: posed(4) });
`;

const sampleData = (): GroupData => ({
  text: packAnims([{ duration: 2, loop: true }, { duration: 4, loop: true }, { duration: 6, loop: true }, { duration: 5, loop: false }, { duration: 8, loop: true }]),
  dicts: { GROUP: { sit: 0, walk: 1, struggle: 2, hold: 3 }, EXTRA: { sitToo: 0, run: 4 } },
});

const bake = (code: string, data: GroupData = sampleData()): string => bakeGroup(code, data, { unpack: UNPACK, file: "sample.ts" });

describe("заміна анімацій у коді групи на готові дані", () => {
  const out = bake(SAMPLE);

  it("анімація-стала й вираз у словнику стають посиланнями на готові дані; словник лишається", () => {
    expect(out).toContain("const sit: Anim = __anims[0];");
    expect(out).toContain("walk: __anims[1],");
    expect(out).toContain("const struggle = __anims[2];");
    expect(out).toContain("hold: __anims[3],");
    expect(out).toContain("export const EXTRA = defineAnims(RIG, { sitToo: sit, run: __anims[4] });");
    expect(out).toContain('"struggle": struggle,');
  });

  it("готові дані читаються раз, текстом із даних групи", () => {
    expect(out).toContain(`import { unpackAnims as __unpackAnims } from ${JSON.stringify(UNPACK)};`);
    const text = /__unpackAnims\('((?:[^'\\]|\\.)*)'\)/.exec(out)?.[1];
    expect(text).toBeDefined();
    // Рядок у коді — той самий текст: у ньому екрановано лише зворотну риску й апостроф.
    expect((text ?? "").replace(/\\(.)/g, "$1")).toBe(sampleData().text);
    expect(out.match(/__unpackAnims\(/g)).toHaveLength(1);
  });

  it("код без ужитку зникає, а потрібний функціям і виразам верхнього рівня — лишається", () => {
    for (const gone of ["function posed", "const SCALE", "const SIT", "posed("]) expect(out, gone).not.toContain(gone);
    for (const kept of ["const DEG = Math.PI / 180;", "const LEG = measure();", "function measure()", "export function legLength()", "const REGISTRY = new Map<Anim, number>();", "REGISTRY.set(struggle, 1);", "export const kicks", "type Anim =", "interface Pose", "export type Name", 'import { RIG } from "../../defs/sample";']) {
      expect(out, kept).toContain(kept);
    }
    expect(() => parseAst(out, { lang: "ts" })).not.toThrow();
  });

  it("анімація, записана рядком у подвійних лапках чи з апострофом у даних, не ламає код", () => {
    const data: GroupData = { text: packAnims([{ duration: 1, loop: true, slots: { "it's": { frame: [{ t: 0, v: 'a\\b"c' }] } } }]), dicts: { GROUP: { only: 0 } } };
    const code = bake(`import { defineAnims } from "../../types";\nexport const GROUP = defineAnims(RIG, { only: build() });\n`, data);
    const literal = /__unpackAnims\(('(?:[^'\\]|\\.)*')\)/.exec(code)?.[1] ?? "";
    // Рядок коду дає назад той самий текст даних.
    expect(new Function(`return ${literal};`)()).toBe(data.text);
    expect(unpackAnims(data.text)[0]).toEqual({ duration: 1, loop: true, slots: { "it's": { frame: [{ t: 0, v: 'a\\b"c' }] } } });
  });

  it("модуль без груп анімацій лишається як є", () => {
    const code = "export const N = 1;\nexport function f(): number { return N; }\n";
    expect(bake(code, { text: packAnims([]), dicts: {} })).toBe(code);
  });

  it("чого не вміє — помилка, а не мовчазний пропуск", () => {
    const head = `import { defineAnims } from "../../types";\n`;
    const one: GroupData = { text: packAnims([{ duration: 1, loop: true }]), dicts: { GROUP: { a: 0 } } };
    const bad: [string, string, GroupData][] = [
      ["розгортання", `${head}const more = {};\nexport const GROUP = defineAnims(RIG, { a: build(), ...more });`, one],
      ["обчислений ключ", `${head}export const GROUP = defineAnims(RIG, { ["a"]: build() });`, one],
      ["назви немає в даних", `${head}export const GROUP = defineAnims(RIG, { b: build() });`, one],
      ["у даних більше анімацій", `${head}export const GROUP = defineAnims(RIG, { a: build() });`, { text: one.text, dicts: { GROUP: { a: 0, b: 0 } } }],
      ["анімація — імпорт", `${head}import { a } from "./other";\nexport const GROUP = defineAnims(RIG, { a });`, one],
      ["анімація — let", `${head}let a = build();\nexport const GROUP = defineAnims(RIG, { a });`, one],
      ["група в даних, якої немає в коді", `${head}export const GROUP = { a: build() };`, one],
      ["група в коді, якої немає в даних", `${head}export const GROUP = defineAnims(RIG, { a: build() });\nexport const MORE = defineAnims(RIG, { a: build() });`, one],
      ["та сама стала — дві різні анімації", `${head}const a = build();\nexport const GROUP = defineAnims(RIG, { a, b: a });`, { text: packAnims([{ duration: 1 }, { duration: 2 }]), dicts: { GROUP: { a: 0, b: 1 } } }],
      ["enum", `${head}enum E { A }\nexport const GROUP = defineAnims(RIG, { a: build() });`, one],
      ["назва зайнята", `${head}const __anims = 1;\nexport const GROUP = defineAnims(RIG, { a: build() });`, one],
    ];
    for (const [name, code, data] of bad) expect(() => bake(code, data), name).toThrow(/sample\.ts/);
  });
});

// --- Справжні групи --------------------------------------------------------------------------------

type Module = Record<string, unknown>;
const SOURCE_GROUPS = import.meta.glob<Module>("../src/view/rig/anims/*/*.ts", { eager: true });
/** `cat/basic` з адреси модуля групи. */
const groupName = (file: string): string => /([^/]+\/[^/]+)\.ts$/.exec(file)?.[1] ?? file;
const SOURCE = new Map(Object.entries(SOURCE_GROUPS).map(([file, module]) => [groupName(file), module]));
const GROUP_NAMES = [...SOURCE.keys()].sort();

/** Експортовані словники анімацій модуля (решта експортів — числа й функції). */
const dictsOf = (module: Module): Record<string, Record<string, object>> =>
  Object.fromEntries(Object.entries(module).filter(([, value]) => typeof value === "object" && value !== null)) as Record<string, Record<string, object>>;

describe("готові дані справжніх груп", () => {
  const data = groupData();

  it("дані кожної групи — точно те, що експортує її модуль", () => {
    expect(Object.keys(data).sort()).toEqual(GROUP_NAMES);
    expect(GROUP_NAMES).toEqual(expect.arrayContaining(["cat/basic", "cat/behavior", "cat/feelings", "person/chores", "person/move"]));
    for (const name of GROUP_NAMES) {
      const group = data[name];
      const dicts = dictsOf(SOURCE.get(name) ?? {});
      if (!group) throw new Error(name);
      expect(Object.keys(group.dicts), name).toEqual(Object.keys(dicts));
      const nodes = unpackAnims(group.text);
      const baked = Object.fromEntries(Object.entries(group.dicts).map(([dict, anims]) => [dict, Object.fromEntries(Object.entries(anims).map(([anim, i]) => [anim, nodes[i]]))]));
      expect(graphDifference(baked, dicts), name).toBeNull();
    }
  });

  it("у коді групи з готовими даними будівників доріжок немає: під час запуску вони не працюють", () => {
    // Будівники доріжок і поз, якими групи складають анімації; ті, що потрібні функціям для вигляду, сюди не входять.
    const builders = ["posed", "still", "merge", "osc", "anim", "loopKeys", "plant", "legAt", "gaitTracks"];
    const defines = (code: string, builder: string): boolean => new RegExp(`^(function ${builder}\\b|const ${builder} = )`, "m").test(code);
    const sources = GROUP_NAMES.map((name) => fs.readFileSync(path.join(GAME, "src/view/rig/anims", `${name}.ts`), "utf8"));
    // Перелік не застарів: кожен будівник справді є в коді якоїсь групи.
    for (const builder of builders) expect(sources.some((code) => defines(code, builder)), builder).toBe(true);
    GROUP_NAMES.forEach((name, i) => {
      const group = data[name];
      if (!group) throw new Error(name);
      const code = bakeGroup(sources[i] ?? "", group, { unpack: UNPACK, file: name });
      expect(() => parseAst(code, { lang: "ts" }), name).not.toThrow();
      // Кожна анімація словників — посилання на готові дані: прямо в словнику чи сталою, на яку він посилається.
      const roots = new Set(Object.values(group.dicts).flatMap((anims) => Object.values(anims)));
      expect(roots.size, name).toBeGreaterThan(0);
      expect(new Set(code.match(/__anims\[\d+\]/g)).size, name).toBe(roots.size);
      for (const builder of builders) expect(defines(code, builder), `${name}: ${builder}`).toBe(false);
    });
  });
});

describe("модулі груп із готовими даними (як у збірці)", () => {
  interface Entry {
    groups: Record<string, Module>;
    index: typeof sourceIndex;
  }
  /** Модулі, які плагін справді замінив (у їхньому коді — читання готових даних). */
  const replaced: string[] = [];
  const spy: Plugin = {
    name: "baked-spy",
    transform(code, id) {
      if (code.includes("__unpackAnims(")) replaced.push(groupName(id));
      return null;
    },
  };
  const loading = runnerImport<Entry>(path.join(GAME, "tests/fixtures/anims-entry.ts"), { root: GAME, logLevel: "error", plugins: [animsPlugin({ always: true }), spy] });
  const bakedGroups = async (): Promise<Map<string, Module>> => new Map(Object.entries((await loading).module.groups).map(([file, module]) => [groupName(file), module]));

  it("експортують те саме, що й код: числа, словники анімацій з тими самими спільними об'єктами, реєстр", async () => {
    const baked = await bakedGroups();
    expect([...baked.keys()].sort()).toEqual(GROUP_NAMES);
    expect([...replaced].sort()).toEqual(GROUP_NAMES);
    for (const name of GROUP_NAMES) {
      const from = SOURCE.get(name) ?? {};
      const to = baked.get(name) ?? {};
      expect(Object.keys(to), name).toEqual(Object.keys(from));
      for (const [key, value] of Object.entries(from)) {
        expect(typeof to[key], `${name}.${key}`).toBe(typeof value);
        if (typeof value === "number") expect(to[key], `${name}.${key}`).toBe(value);
      }
    }
    // Усі словники всіх груп і реєстр — одним графом: спільні об'єкти між назвами, словниками й модулями ті самі.
    const graph = (groups: Map<string, Module>, index: typeof sourceIndex): unknown => [GROUP_NAMES.map((name) => dictsOf(groups.get(name) ?? {})), index.CAT_ANIMS, index.PERSON_ANIMS];
    const index = (await loading).module.index;
    expect(graphDifference(graph(baked, index), graph(SOURCE, sourceIndex))).toBeNull();
    // Готові дані, а не код: анімація реєстру — той самий об'єкт, що й у групі.
    expect(index.CAT_ANIMS.walk).toBe((baked.get("cat/basic")?.["CAT_BASIC"] as Record<string, unknown>)["walk"]);
    expect(index.PERSON_ANIMS.walk).toBe((baked.get("person/move")?.["PERSON_MOVE"] as Record<string, unknown>)["walk"]);
  });

  it("функції для вигляду дають те саме", async () => {
    const baked = await bakedGroups();
    /** Та сама функція з коду й з готових даних: результати на тих самих аргументах збігаються. */
    const same = (group: string, fn: string, args: (module: Module) => unknown[]): void => {
      const call = (module: Module): unknown => (module[fn] as (...a: unknown[]) => unknown)(...args(module));
      expect(graphDifference(call(baked.get(group) ?? {}), call(SOURCE.get(group) ?? {})), `${group}.${fn}`).toBeNull();
    };
    const fixed = (...args: unknown[]) => (): unknown[] => args;
    for (const speed of [0, 90, 210, 640, 5000]) {
      same("cat/basic", "catWalkRate", fixed(speed));
      same("cat/basic", "catRunRate", fixed(speed, 11));
      same("person/move", "personGaitSpeed", fixed("walk", speed, 40));
      same("person/move", "personGaitSpeed", fixed("dizzy", 12, speed));
    }
    same("cat/basic", "catLegLength", fixed(0.5, true));
    same("cat/basic", "catTail", fixed(-75, 0.9));
    same("cat/behavior", "catBrawlTop", fixed());
    for (const t of [0, 60, 120, 200, 400]) {
      same("cat/basic", "catJumpLift", fixed("jumpUp", t));
      same("cat/basic", "catJumpLift", fixed("jumpDown", t));
      same("person/move", "personCatLift", fixed("pickUp", t));
      same("person/move", "personCatLift", fixed("putDown", t));
    }
    for (const anim of ["belly", "roll", "sit"]) {
      same("cat/basic", "catPetPoint", fixed(anim));
      same("cat/basic", "catUpsideDown", (m) => [(m["CAT_BASIC"] as Module)[anim]]);
      same("cat/basic", "catBlendMs", (m) => [(m["CAT_BASIC"] as Module)[anim], (m["CAT_BASIC"] as Module)["walk"]]);
    }
    for (const gait of ["walk", "dash", "limp", "trudge", "dizzy"]) {
      same("person/move", "personGait", fixed(gait));
      same("person/move", "personGait", fixed(gait, true));
    }
    for (const view of ["front", "back"]) {
      same("person/move", "personVacuumBrush", fixed(view));
      same("person/move", "personCatGrip", fixed(view));
      same("person/move", "personArmsPose", fixed("carry", view));
      same("person/move", "personArmsPose", fixed("holdCat", view));
    }
    same("person/move", "levelHand", fixed(-52, 0.72));
    for (const [base, overlay] of [["walk", "carry"], ["idle", "holdCat"], ["dash", "holdVacuum"], ["walk", "holdBroom"], ["trip", "carry"], ["pickUp", "carry"]]) {
      same("person/move", "personWithArms", (m) => [(m["PERSON_MOVE"] as Module)[base ?? ""], overlay, base]);
    }
  });

  it("накладки кота й хода дрібним кроком знаходять свої анімації серед готових", async () => {
    const baked = await bakedGroups();
    const basic = (module: Map<string, Module>): Module => module.get("cat/basic")?.["CAT_BASIC"] as Module;
    const feelings = baked.get("cat/feelings") ?? {};
    const sourceFeelings = SOURCE.get("cat/feelings") ?? {};
    const fit = (module: Module, overlay: string, base: unknown): unknown => (module["catOverlayOn"] as (o: unknown, b: unknown) => unknown)((module["CAT_FEELINGS"] as Module)[overlay], base);
    for (const overlay of ["struggle", "reluctant", "warn", "content"]) {
      for (const base of ["sit", "belly", "carried", "walk", "loaf"]) {
        const fitted = fit(feelings, overlay, basic(baked)[base]);
        expect(graphDifference(fitted, fit(sourceFeelings, overlay, basic(SOURCE)[base])), `${overlay} на ${base}`).toBeNull();
        expect(fit(feelings, overlay, basic(baked)[base]), `${overlay} на ${base}`).toBe(fitted);
      }
    }
    const move = baked.get("person/move") ?? {};
    const cut = move["personCutAnim"] as (anim: unknown, look: object | null) => unknown;
    const look = { bottomCut: BOTTOM_CUTS.findIndex((c) => c.hobble === true) };
    for (const gait of ["walk", "dash", "limp", "trudge", "dizzy"]) {
      const anim = (move["PERSON_MOVE"] as Module)[gait];
      expect(cut(anim, look), gait).toBe((move["PERSON_HOBBLE"] as Module)[`${gait}Hobble`]);
      expect(cut(anim, null), gait).toBe(anim);
    }
  });
});
