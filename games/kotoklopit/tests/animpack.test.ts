// Готові дані анімацій (§2.1, «Анімація»; `src/view/rig/animpack.ts`): текст, у якому збирання кладе пораховані доріжки в
// код гри. Запис і читання нічого не гублять: значення ті самі до біта (−0), порядок ключів той самий, спільні об'єкти
// лишаються спільними; чого текст передати не може (undefined, NaN, функції) — помилка, а не мовчазна заміна.

import { describe, expect, it } from "vitest";

import { packAnims, unpackAnims } from "../src/view/rig/animpack";
import { graphDifference } from "./graph";

const ANIM_MODULES = import.meta.glob<Record<string, unknown>>("../src/view/rig/anims/*/*.ts", { eager: true });

/** Туди й назад: корені після читання, у тому самому порядку. */
const roundTrip = (roots: readonly object[]): unknown[] => unpackAnims(packAnims(roots)).slice(0, roots.length);

describe("graphDifference (порівняння тестів)", () => {
  it("бачить −0, порядок ключів і спільні посилання", () => {
    const shared = { t: 0 };
    expect(graphDifference([{ a: 1, b: [shared, shared] }], [{ a: 1, b: [shared, shared] }])).toBeNull();
    expect(graphDifference({ v: 0 }, { v: -0 })).not.toBeNull();
    expect(graphDifference({ a: 1, b: 2 }, { b: 2, a: 1 })).not.toBeNull();
    expect(graphDifference([shared, shared], [{ t: 0 }, { t: 0 }])).not.toBeNull();
    expect(graphDifference([{ t: 0 }, { t: 0 }], [shared, shared])).not.toBeNull();
    expect(graphDifference({ a: undefined }, {})).not.toBeNull();
  });
});

describe("готові дані анімацій", () => {
  it("туди й назад — ті самі значення, порядок ключів і спільні об'єкти", () => {
    const keys = [{ t: 0, v: -0 }, { t: 120, v: 1.0000000000000002, ease: "inOut" }, { t: 240, v: { x: 1e-7, y: -12.5 } }];
    const hidden = { visible: [{ t: 0, v: false }] };
    const back = { bones: { "leg-near": { rot: keys } }, slots: { ear: hidden } };
    const first = { duration: 240, loop: true, bones: { tail: { rot: keys }, head: { rot: keys } }, slots: { ear: hidden, "it's \"x\"\\": { frame: [{ t: 0, v: "ʼ\n " }] } }, views: { back } };
    const second = { loop: false, duration: 1e21, views: { back, front: null }, bones: {} };
    const out = roundTrip([first, second]);
    expect(graphDifference(out, [first, second])).toBeNull();
    expect(Object.is((out[0] as typeof first).bones.tail.rot[0]?.v, -0)).toBe(true);
  });

  it("корінь, на який посилається інший корінь, — той самий об'єкт", () => {
    const base = { duration: 100, loop: true };
    const wrap = { duration: 100, loop: true, of: [base] };
    const out = roundTrip([wrap, base]);
    expect(graphDifference(out, [wrap, base])).toBeNull();
    expect((out[0] as typeof wrap).of[0]).toBe(out[1]);
  });

  it("чого текст не передасть — помилка з місцем", () => {
    const bad: [string, unknown][] = [
      ["undefined", { a: undefined }],
      ["NaN", { a: [Number.NaN] }],
      ["Infinity", { a: Number.POSITIVE_INFINITY }],
      ["функція", { a: () => 0 }],
      ["Map", { a: new Map() }],
      ["діра в масиві", { a: [1, , 3] }],
      ["символ", { [Symbol("s")]: 1 }],
      ["заморожений", { a: Object.freeze({ t: 0 }) }],
      ["bigint", { a: 1n }],
    ];
    for (const [name, value] of bad) expect(() => packAnims([value as object]), name).toThrow(/\$0/);
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expect(() => packAnims([loop])).toThrow(/коло/);
  });

  it("усі групи анімацій гри проходять туди й назад без втрат", () => {
    const roots: object[] = [];
    for (const module of Object.values(ANIM_MODULES)) {
      for (const group of Object.values(module)) if (typeof group === "object" && group !== null) roots.push(...(Object.values(group) as object[]));
    }
    expect(roots.length).toBeGreaterThan(90);
    expect(graphDifference(roundTrip(roots), roots)).toBeNull();
  });
});
