// Гардероб, «Волосся» (§5.1, `WARDROBE.md`): зачіски, акцент і кольори волосся — реєстри `src/view/wardrobe/hair.ts` і
// `accents.ts`, кадри — `src/view/art/manifest/a22-person-hair.ts`. Що кадри є в обох ракурсах і що зачіска з акцентом має
// маску `fill-accent`, перевіряють `tests/manifest.test.ts` і `tests/art.test.ts`.

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "../src/sim/game";
import type { Look } from "../src/sim/types";
import { artEntry } from "../src/view/art/manifest";
import { personRecipe } from "../src/view/art/recipes";
import { PERSON_ANIMS } from "../src/view/rig/anims";
import { PERSON_FIT, PERSON_RIG, personSkin } from "../src/view/rig/defs/person";
import { Rig } from "../src/view/rig/rigcore";
import { HAIR_ACCENTS } from "../src/view/wardrobe/accents";
import { HAIR_COLORS, HAIR_STYLES } from "../src/view/wardrobe/hair";

const ACCENTS = HAIR_ACCENTS.flatMap((a) => (a.color === null ? [] : [{ name: a.name, color: a.color }]));
const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

describe("акцент зачіски", () => {
  it("неонові акценти відрізняються між собою й від кожного кольору волосся (ΔE2000 ≥ 15): пасмо видно й на фарбованому", () => {
    expect(HAIR_ACCENTS[0]?.color).toBeNull();
    expect(ACCENTS.length).toBeGreaterThan(0);
    for (const a of ACCENTS) {
      for (const b of ACCENTS) if (b !== a) expect(deltaE2000(a.color, b.color), `${a.name} і ${b.name}`).toBeGreaterThanOrEqual(15);
      for (const hair of HAIR_COLORS) expect(deltaE2000(a.color, hair.color), `${a.name} ${hex(a.color)} і волосся ${hair.name}`).toBeGreaterThanOrEqual(15);
    }
  });

  it("рецепт зачіски з акцентом має крок fill-accent, і кожен акцент — свій ключ запікання; «немає» — колір волосся", () => {
    const hair = HAIR_STYLES.findIndex((style) => style.accent === true);
    expect(hair).toBeGreaterThan(0);
    const look: Look = { ...DEFAULT_LOOK, hair };
    const none = personRecipe(look);
    const step = none.steps.find((s) => s.layer === "fill-accent");
    expect(step?.color).toBe(none.steps.find((s) => s.layer === "fill-hair")?.color);
    const keys = new Set([none.key]);
    for (let hairAccent = 1; hairAccent < HAIR_ACCENTS.length; hairAccent++) {
      const recipe = personRecipe({ ...look, hairAccent });
      expect(recipe.steps.find((s) => s.layer === "fill-accent")?.color, HAIR_ACCENTS[hairAccent]?.name).toBe(HAIR_ACCENTS[hairAccent]?.color);
      keys.add(recipe.key);
    }
    expect(keys.size).toBe(HAIR_ACCENTS.length);
    // Зачіска без маски: акценту в рецепті немає, хоч би що було в `Look`.
    const plain = HAIR_STYLES.findIndex((style) => style.accent !== true);
    expect(personRecipe({ ...DEFAULT_LOOK, hair: plain, hairAccent: 2 }).steps.some((s) => s.layer === "fill-accent")).toBe(false);
  });

  it("усі зачіски «кіберпанк» мають маску акценту", () => {
    for (const style of HAIR_STYLES) if (style.group === "кіберпанк") expect(style.accent, style.name).toBe(true);
  });

  it("у зачіски з акцентом маска fill-accent — у кожному її кадрі, без акценту — ні в жодному", () => {
    for (const style of HAIR_STYLES) {
      for (const id of [style.back, style.front]) {
        if (id === null) continue;
        expect(artEntry(id)?.layers?.includes("fill-accent"), `${style.name}: ${id}`).toBe(style.accent === true);
      }
    }
  });
});

describe("реєстр зачісок", () => {
  it("номери наявних зачісок не міняються: нові — лише в кінці (збереження показує ту саму зачіску)", () => {
    expect(HAIR_STYLES.slice(0, 16).map((s) => s.name)).toEqual([
      "коротка", "довга", "хвостик", "кучері", "каре", "хвилі до плечей", "афро", "скуйовджена", "дреди", "коса на плече", "лиса",
      "андеркат із чубом", "неонові пасма", "візерунок на скроні", "каре з чубчиком", "довге з прямим проділом",
    ]);
    expect(new Set(HAIR_STYLES.map((s) => s.name)).size).toBe(HAIR_STYLES.length);
  });
});

describe("кадри зачісок", () => {
  it("«лиса» — без кадрів волосся, а маківка (якір бабла) — точка `top` голови", () => {
    const bald = HAIR_STYLES.findIndex((style) => style.back === null && style.front === null);
    expect(HAIR_STYLES[bald]?.name).toBe("лиса");
    const skin = personSkin({ ...DEFAULT_LOOK, hair: bald });
    expect([skin["hair-back"], skin["hair-front"]]).toEqual([null, null]);
    // Голова й «коротка» мають ту саму маківку на тому самому полотні: якір лисої — там само.
    const head = artEntry("person/head/0")!;
    const short = artEntry("person/hair-front/0")!;
    expect(head.points?.["top"]).toEqual(short.points?.["top"]);
    const anchor = (hair: number) => {
      const rig = new Rig(PERSON_RIG, { fit: PERSON_FIT, lookup: artEntry, skin: personSkin({ ...DEFAULT_LOOK, face: 0, hair }) });
      rig.play(PERSON_ANIMS.idle, 0, { blend: 0 });
      rig.evaluate(0);
      return rig.anchor("head");
    };
    expect(anchor(bald)).toEqual(anchor(0));
  });

  it("задня й передня частини зачіски — на тому самому pivot у шиї й з тією самою маківкою, що й голова", () => {
    const head = artEntry("person/head/0")!;
    const local = (id: string, name: string) => {
      const e = artEntry(id)!;
      const p = e.points?.[name];
      return p ? { x: p.x - e.pivot.x, y: p.y - e.pivot.y } : null;
    };
    for (const style of HAIR_STYLES) {
      const tops = [style.back, style.front].flatMap((id) => (id === null ? [] : [local(id, "top")]));
      for (const top of tops) {
        expect(top, style.name).not.toBeNull();
        expect(top, style.name).toEqual(tops[0]);
      }
      // Маківка зачіски — над маківкою голови, не нижче.
      for (const top of tops) expect(top!.y, style.name).toBeLessThanOrEqual(local(head.id, "top")!.y);
    }
  });

  it("гребінь ірокезу й шипи — своя маківка, вища за афро; ірокез — найвищий: під нього `FIX_HEAD`", () => {
    const topOf = (name: string): number => {
      const style = HAIR_STYLES.find((s) => s.name === name)!;
      const e = artEntry(style.front!)!;
      return e.points!["top"]!.y - e.pivot.y;
    };
    const afro = topOf("афро");
    expect(topOf("неоновий ірокез")).toBeLessThan(topOf("шипи"));
    expect(topOf("шипи")).toBeLessThan(afro);
    for (const style of HAIR_STYLES) if (style.front) expect(topOf(style.name), style.name).toBeGreaterThanOrEqual(topOf("неоновий ірокез"));
  });

  it("маківка (якір бабла) — не всередині волосся: висока зачіска без своєї `top` ховала б бабл у гребені", () => {
    // Полотно обрізане довкола малюнка з полем ≈4 (`art/STYLE.md`, §2): верх малюнка з контуром — на ≈4 нижче за верх
    // полотна; маківка — не глибше за пів лінії під ним.
    const FIELD = 4;
    const HALF_LINE = 2;
    for (const style of HAIR_STYLES) {
      for (const id of [style.back, style.front]) {
        if (id === null) continue;
        const e = artEntry(id)!;
        expect(e.points!["top"]!.y, `${style.name}: ${id}`).toBeLessThanOrEqual(FIELD + HALF_LINE);
      }
    }
  });
});

describe("колір волосся", () => {
  it("кожен колір — свій, нові (фарбовані) — з меншою вагою «Випадково», ніж природні", () => {
    expect(new Set(HAIR_COLORS.map((c) => c.color)).size).toBe(HAIR_COLORS.length);
    const natural = HAIR_COLORS.slice(0, 6);
    for (const c of natural) expect(c.weight ?? 1, c.name).toBe(1);
    for (const c of HAIR_COLORS.slice(6)) expect(c.weight ?? 1, c.name).toBeLessThan(1);
  });
});

// --- Різниця кольорів (CIEDE2000), як у `tests/compose.test.ts` ------------------------------------------------------------

function lab(color: number): [number, number, number] {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = lin(((color >> 16) & 255) / 255);
  const g = lin(((color >> 8) & 255) / 255);
  const b = lin((color & 255) / 255);
  const f = (v: number): number => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE2000(c1: number, c2: number): number {
  const [l1, a1, b1] = lab(c1);
  const [l2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number): number => ((Math.atan2(b, a) / rad) % 360 + 360) % 360;
  const h1 = hue(b1, a1p);
  const h2 = hue(b2, a2p);
  let dh = h2 - h1;
  if (c1p * c2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * rad);
  const lb = (l1 + l2) / 2;
  const cbp = (c1p + c2p) / 2;
  let hb = h1 + h2;
  if (c1p * c2p !== 0) hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cbp ** 7 / (cbp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lb - 50) ** 2) / Math.sqrt(20 + (lb - 50) ** 2);
  const sc = 1 + 0.045 * cbp;
  const sh = 1 + 0.015 * cbp * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  const dl = (l2 - l1) / sl;
  const dc = (c2p - c1p) / sc;
  const dhh = dH / sh;
  return Math.sqrt(dl * dl + dc * dc + dhh * dhh + rt * dc * dhh);
}
