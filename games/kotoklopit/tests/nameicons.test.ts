// Іконка біля назви (GAME_DESIGN §11.4 «Іконка біля назви», рішення автора 2026-11-02): у магазині біля кожного запасу й речі,
// у ветеринара біля кожної хвороби кота, у лікаря — біля хвороби персонажа стоїть та сама іконка, що в грі. У картці це
// `<img>` із SVG `art/icon/<назва>.svg` (`src/ui/icons.ts`); у тексті — позначка, яку малюнком замінює `drawIcons`.

import { describe, expect, it } from "vitest";

import { DISEASES, ILLNESSES } from "../src/sim/config";
import { GOODS, goodsKey } from "../src/sim/shop";
import type { AlbumEntry, DiseaseId, IllnessId, Product, ThingKind } from "../src/sim/types";
import { diseaseTitle, farewellText, homeVetText, ILLNESS_TITLES } from "../src/texts";
import { albumCause } from "../src/ui/cards";
import { diseaseLabel, iconMark, iconUrl, illnessLabel, named, splitIcons, thingLabel, type IconPart } from "../src/ui/icons";
import { goodsIcon, goodsLabel } from "../src/ui/shop";
import { PRODUCT_TITLES, THING_TITLES } from "../src/ui/titles";
import { ICON_NAMES, type IconName } from "../src/view/iconnames";
import { DISEASE_ICONS, eventBubbles, ILLNESS_ICONS, PRODUCT_ICONS, refusalBubble, THING_ICONS } from "../src/view/symbols";

/** Перша іконка в тексті з позначками. */
const iconOf = (text: string): IconName | undefined => splitIcons(text).find((p): p is Exclude<IconPart, string> => typeof p !== "string")?.icon;
/** Текст без позначок — те, що прочитає гравець. */
const plain = (text: string): string => splitIcons(text).map((p) => (typeof p === "string" ? p : p.word)).join("");

describe("іконка біля назви: адреса SVG", () => {
  const file = (name: string): Record<string, string> => ({ [`../../art/icon/${name}.svg`]: `/assets/${name}.svg` });

  it("іконка — свій файл art/icon/<назва>.svg, чужий не підходить", () => {
    expect(iconUrl("kibble", file("kibble"))).toBe("/assets/kibble.svg");
    // «kibble-pour» — не «kibble», «hiss-litter» — не «litter».
    expect(iconUrl("kibble", file("kibble-pour"))).toBeNull();
    expect(iconUrl("litter", file("hiss-litter"))).toBeNull();
    expect(iconUrl("kibble", {})).toBeNull();
  });

  it("файл є для кожної іконки — окремим файлом, а не адресою data: у коді гри", () => {
    for (const name of ICON_NAMES) {
      const url = iconUrl(name);
      expect(url, name).toMatch(new RegExp(`/${name}\\.svg`));
      expect(url, name).not.toMatch(/^data:/);
    }
  });
});

describe("іконка біля назви: позначка в тексті", () => {
  it("позначка — іконка разом зі словом за нею, решта тексту — як є", () => {
    expect(splitIcons(`Вилікувано: ${named("sneeze", "застуда")}, ${named("itch", "блохи")}.`)).toEqual([
      "Вилікувано: ",
      { icon: "sneeze", word: "застуда," },
      " ",
      { icon: "itch", word: "блохи." },
    ]);
    expect(plain(`Вилікувано: ${named("sneeze", "застуда")}, ${named("itch", "блохи")}.`)).toBe("Вилікувано: застуда, блохи.");
    expect(splitIcons(named("food-bowl", "Миска для корму"))).toEqual([{ icon: "food-bowl", word: "Миска" }, " для корму"]);
    expect(splitIcons("Без іконок")).toEqual(["Без іконок"]);
  });

  it("назва посеред речення з малої — позначка переживає toLowerCase", () => {
    const label = named("kibble-pour", "Автогодівниця");
    expect(label.toLowerCase()).toBe(named("kibble-pour", "автогодівниця"));
    expect(iconOf(label.toLowerCase())).toBe("kibble-pour");
  });

  it("позначка невідомої іконки зникає, слово лишається", () => {
    const fake = iconMark("kibble").replace("kibble", "no-such-icon");
    expect(splitIcons(`${fake}Корм`)).toEqual(["Корм"]);
  });
});

describe("іконка біля назви: магазин (§6.4)", () => {
  it("біля кожного запасу — його іконка (PRODUCT_ICONS), біля кожної речі — іконка речі (THING_ICONS)", () => {
    expect(GOODS.length).toBeGreaterThan(0);
    for (const goods of GOODS) {
      const icon = "product" in goods ? PRODUCT_ICONS[goods.product] : THING_ICONS[goods.thing];
      expect(goodsIcon(goods), goodsKey(goods)).toBe(icon);
      expect(iconOf(goodsLabel(goods)), goodsKey(goods)).toBe(icon);
      expect(plain(goodsLabel(goods)), goodsKey(goods)).toBe("product" in goods ? PRODUCT_TITLES[goods.product].name : THING_TITLES[goods.thing]);
      expect(iconUrl(icon), goodsKey(goods)).not.toBeNull();
    }
  });

  it("у магазині кожен запас і кожна річ — з іконкою", () => {
    const products = GOODS.flatMap((g) => ("product" in g ? [g.product] : []));
    const things = GOODS.flatMap((g) => ("thing" in g ? [g.thing] : []));
    // Мамині судочки — лише від мами (§6.4): у магазині їх немає.
    expect(new Set(products)).toEqual(new Set((Object.keys(PRODUCT_ICONS) as Product[]).filter((p) => p !== "momMeal")));
    expect(new Set(things)).toEqual(new Set(Object.keys(THING_ICONS) as ThingKind[]));
  });

  it("запас — та сама іконка, що в думці персонажа й у відмові «скінчилося» (і на телефоні, коли запас уперше скінчився)", () => {
    for (const goods of GOODS) {
      if (!("product" in goods)) continue;
      const { product } = goods;
      expect(goodsIcon(goods), product).toBe(eventBubbles({ type: "supply-used", product, left: 1 })[0]?.icon);
      expect(goodsIcon(goods), product).toBe(refusalBubble({ reason: "empty", product }).icon);
    }
  });

  it("«Мої речі» в телефоні — та сама іконка речі й та сама назва, що в магазині", () => {
    for (const thing of Object.keys(THING_ICONS) as ThingKind[]) expect(thingLabel(thing), thing).toBe(goodsLabel({ thing }));
  });

  it("відомі відповідності: корм — гранули, миска — миска, автогодівниця — та, що досипає корм", () => {
    expect(goodsIcon({ product: "catFood" })).toBe("kibble");
    expect(goodsIcon({ product: "litter" })).toBe("litter");
    expect(goodsIcon({ thing: "bowl" })).toBe("food-bowl");
    expect(goodsIcon({ thing: "litter" })).toBe("litter-box");
    expect(goodsIcon({ thing: "feeder" })).toBe("kibble-pour");
  });
});

describe("іконка біля назви: ветеринар і лікар (§8.5, §6.5)", () => {
  const diseases = Object.keys(DISEASES) as DiseaseId[];
  const illnesses = Object.keys(ILLNESSES) as IllnessId[];

  it("біля кожної хвороби кота — її іконка (DISEASE_ICONS), назва та сама", () => {
    expect(diseases.length).toBe(15);
    for (const id of diseases) {
      expect(iconOf(diseaseLabel(id)), id).toBe(DISEASE_ICONS[id]);
      expect(plain(diseaseLabel(id)), id).toBe(diseaseTitle(id));
      expect(iconUrl(DISEASE_ICONS[id]), id).not.toBeNull();
    }
    // Невідома хвороба — без іконки, як і без назви.
    expect(diseaseLabel("no-such")).toBe("no-such");
  });

  it("у ветеринара — та сама іконка, що в баблі-ознаці кота: чхання, «свербить» (блохи й дерматит), очі, крик болю", () => {
    const bubble = (symptom: "sneeze" | "itch" | "eyes" | "pain"): IconName | undefined => eventBubbles({ type: "symptom", cat: 1, symptom })[0]?.icon;
    expect(iconOf(diseaseLabel("cold"))).toBe(bubble("sneeze"));
    expect(iconOf(diseaseLabel("fleas"))).toBe(bubble("itch"));
    expect(iconOf(diseaseLabel("dermatitis"))).toBe(bubble("itch"));
    expect(iconOf(diseaseLabel("conjunctivitis"))).toBe(bubble("eyes"));
    expect(iconOf(diseaseLabel("urolithiasis"))).toBe(bubble("pain"));
  });

  it("біля кожної хвороби персонажа в лікаря — іконка його відмови ривка", () => {
    for (const id of illnesses) {
      expect(iconOf(illnessLabel(id)), id).toBe(ILLNESS_ICONS[id]);
      expect(plain(illnessLabel(id)), id).toBe(ILLNESS_TITLES[id]);
    }
    expect(iconOf(illnessLabel("cold"))).toBe(refusalBubble({ reason: "cold" }).icon);
    expect(iconOf(illnessLabel("exhaustion"))).toBe(refusalBubble({ reason: "weak" }).icon);
    expect(iconOf(illnessLabel("injury"))).toBe(refusalBubble({ reason: "injured" }).icon);
  });

  it("«Заходила ветеринарка»: ті самі слова, біля кожної хвороби — її іконка", () => {
    const cats = [
      { name: "Мурка", sex: "female" as const, diseases: ["fleas", "heart"], manner: null },
      { name: "Барсик", sex: "male" as const, diseases: [], manner: null },
    ];
    const text = homeVetText(cats, diseaseLabel);
    expect(plain(text)).toBe(homeVetText(cats));
    const icons = splitIcons(text).flatMap((p) => (typeof p === "string" ? [] : [p.icon]));
    expect(icons).toEqual([DISEASE_ICONS.fleas, DISEASE_ICONS.heart]);
  });

  it("альбом і прощання: хвороба, від якої кіт помер, — з тією самою іконкою, слова ті самі", () => {
    const entry = { id: 3, name: "Мурка", sex: "female", lifeMood: 60, cause: { kind: "disease", disease: "heart" } } as AlbumEntry;
    expect(iconOf(albumCause(entry, diseaseLabel))).toBe(DISEASE_ICONS.heart);
    expect(plain(albumCause(entry, diseaseLabel))).toBe(albumCause(entry));
    expect(iconOf(farewellText(entry, diseaseLabel).cause)).toBe(DISEASE_ICONS.heart);
    expect(plain(farewellText(entry, diseaseLabel).cause)).toBe(farewellText(entry, diseaseTitle).cause);
    // Старість — без іконки.
    expect(albumCause({ ...entry, cause: { kind: "old" } }, diseaseLabel)).toBe("старість");
  });
});
