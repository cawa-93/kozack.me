// Іконка біля назви (GAME_DESIGN §11.4 «Іконка біля назви», рішення автора 2026-11-02): у магазині біля кожного запасу й речі,
// у ветеринара біля кожної хвороби кота, у лікаря — біля хвороби персонажа, на кнопках догляду біля аптечки — біля запасу,
// біля назви пункту поїздки (§8.5 «На місці — кадр парковки») — стоїть та сама іконка, що в грі. У картці це `<img>` із SVG
// `art/icon/<назва>.svg` (`src/ui/icons.ts`); у тексті — позначка, яку малюнком замінює `drawIcons`.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCat } from "../src/sim/cat";
import { DISEASES, ILLNESSES, MODIFIERS, TRIPS } from "../src/sim/config";
import { newGame } from "../src/sim/game";
import { addCat } from "../src/sim/night";
import { createRng } from "../src/sim/rng";
import { GOODS, goodsKey, variants } from "../src/sim/shop";
import type { AlbumEntry, Destination, DiseaseId, IllnessId, Product, ThingKind } from "../src/sim/types";
import { diseaseTitle, farewellText, homeVetText, ILLNESS_TITLES, minutesText } from "../src/texts";
import { albumCause, careCard, foundlingCard } from "../src/ui/cards";
import { destinationLabel, diseaseLabel, iconMark, iconUrl, illnessLabel, named, productLabel, splitIcons, type IconPart } from "../src/ui/icons";
import { goodsIcon, variantLabel, variantTitle } from "../src/ui/shop";
import { DESTINATION_TITLES, PRODUCT_TITLES, VARIANT_TITLES } from "../src/ui/titles";
import { destinationCard, visitCard, type VisitHandlers } from "../src/ui/trips";
import { ICON_NAMES, type IconName } from "../src/view/iconnames";
import { DESTINATION_ICONS, DISEASE_ICONS, eventBubbles, ILLNESS_ICONS, PRODUCT_ICONS, refusalBubble, THING_ICONS, VARIANT_ICONS } from "../src/view/symbols";

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
    // Слово через дефіс нерозривне з іконкою лише до дефіса: далі рядок може перенестися (рецензія 2026-11-03).
    expect(splitIcons(named("toy", "Іграшка-вудочка"))).toEqual([{ icon: "toy", word: "Іграшка-" }, "вудочка"]);
    expect(plain(named("toy", "Іграшка-вудочка"))).toBe("Іграшка-вудочка");
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
  it("два варіанти одного товару — дві різні іконки, обидві намальовані, а одна з них — іконка самого запасу чи речі", () => {
    for (const goods of GOODS) {
      const qualities = variants(goods);
      if (qualities.length < 2) continue;
      const icons = qualities.map((q) => goodsIcon(goods, q));
      expect(new Set(icons).size, goodsKey(goods)).toBe(icons.length);
      expect(icons, goodsKey(goods)).toContain(goodsIcon(goods));
      for (const icon of icons) {
        expect(ICON_NAMES, `${goodsKey(goods)}: ${icon}`).toContain(icon);
        expect(iconUrl(icon), `${goodsKey(goods)}: ${icon}`).not.toBeNull();
      }
    }
  });

  it("пластир — пачка, бинт — рулон: різні іконки, і жодна — не травма (пластир навскіс)", () => {
    const plaster = goodsIcon({ product: "dressing" }, "cheap");
    const bandage = goodsIcon({ product: "dressing" }, "premium");
    expect(plaster).not.toBe(bandage);
    expect(bandage).toBe(PRODUCT_ICONS.dressing);
    expect([plaster, bandage]).not.toContain(ILLNESS_ICONS.injury);
    expect(ICON_NAMES).toContain(plaster);
  });

  it("біля кожного варіанта запасу — іконка запасу (PRODUCT_ICONS), лише пластир — свою; речі — іконка речі (THING_ICONS); назва — варіанта", () => {
    expect(GOODS.length).toBeGreaterThan(0);
    for (const goods of GOODS) {
      const icon = "product" in goods ? PRODUCT_ICONS[goods.product] : THING_ICONS[goods.thing];
      expect(goodsIcon(goods), goodsKey(goods)).toBe(icon);
      for (const q of variants(goods)) {
        const own = VARIANT_ICONS[goodsKey(goods)]?.[q] ?? icon;
        expect(goodsIcon(goods, q), `${goodsKey(goods)} ${q}`).toBe(own);
        expect(iconOf(variantLabel(goods, q)), `${goodsKey(goods)} ${q}`).toBe(own);
        expect(plain(variantLabel(goods, q)), `${goodsKey(goods)} ${q}`).toBe(VARIANT_TITLES[goodsKey(goods)]?.[q]);
        expect(variantTitle(goods, q), `${goodsKey(goods)} ${q}`).toBe(VARIANT_TITLES[goodsKey(goods)]?.[q]);
      }
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

  it("назва запасу з іконкою (productLabel) — та сама іконка, що на його картках у магазині, і загальна назва", () => {
    for (const goods of GOODS) {
      if (!("product" in goods)) continue;
      expect(iconOf(productLabel(goods.product)), goods.product).toBe(goodsIcon(goods));
      expect(plain(productLabel(goods.product)), goods.product).toBe(PRODUCT_TITLES[goods.product].name);
    }
  });

  it("відомі відповідності: корм — гранули, миска — миска, автогодівниця — та, що досипає корм", () => {
    expect(goodsIcon({ product: "catFood" })).toBe("kibble");
    expect(goodsIcon({ product: "litter" })).toBe("litter");
    expect(goodsIcon({ thing: "bowl" })).toBe("food-bowl");
    expect(goodsIcon({ thing: "litter" })).toBe("litter-box");
    expect(goodsIcon({ thing: "feeder" })).toBe("kibble-pour");
  });
});

describe("іконка біля назви: догляд біля аптечки (§8.7, §9.10, §9.12)", () => {
  it("на кожній кнопці запасу — його іконка, та сама, що в магазині; текст кнопки той самий", () => {
    const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
    const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 3, at: { x: 9.5, y: 8.5 } });
    addCat(save.current, cat);
    save.current.character.held = { kind: "cat", cat: cat.id };
    cat.collar = false;
    Object.assign(save.current.home.supplies, {
      pills: { cheap: 2, premium: 0 },
      drops: { cheap: 0, premium: 1 },
      treats: { cheap: 3, premium: 1 },
      catnip: { cheap: 1, premium: 2 },
      collar: { cheap: 1, premium: 0 },
    });
    const labels = careCard(save.current, cat, () => {}, () => {}).actions.map((a) => a.label);
    // Ліки — загальною назвою, тож і іконкою запасу; ласощі й м'ята — назвою варіанта, тож і його іконкою (§11.4).
    const shop = (product: Product, quality?: "cheap" | "premium"): IconName => goodsIcon({ product }, quality);
    expect(labels.map(iconOf)).toEqual([shop("pills"), shop("drops"), shop("treats", "premium"), shop("treats", "cheap"), shop("catnip", "premium"), shop("catnip", "cheap"), shop("collar")]);
    // Без «для котів» (картка й так про кота; рецензія 2026-11-03): ліки — загальною назвою (обидва варіанти разом), нашийник —
    // назвою з каталогу.
    expect(labels.map(plain)).toEqual(["Таблетки ×2", "Краплі ×1", "Делікатеси ×1", "Смаколики ×3", "Мататабі ×2", "Сушена котяча м'ята ×1", `${VARIANT_TITLES["collar"]?.cheap} ×1`]);
    expect(PRODUCT_TITLES.pills.name).toBe("Таблетки для котів");
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

  it("біля кожної хвороби персонажа в лікаря — її іконка: застуда й травма — як у відмові ривка", () => {
    for (const id of illnesses) {
      expect(iconOf(illnessLabel(id)), id).toBe(ILLNESS_ICONS[id]);
      expect(plain(illnessLabel(id)), id).toBe(ILLNESS_TITLES[id]);
      expect(iconUrl(ILLNESS_ICONS[id]), id).not.toBeNull();
    }
    expect(iconOf(illnessLabel("cold"))).toBe(refusalBubble({ reason: "cold" }).icon);
    expect(iconOf(illnessLabel("injury"))).toBe(refusalBubble({ reason: "injured" }).icon);
  });

  it("виснаження — своя іконка, не батарейка відмови «без сил» (рецензія 2026-11-02)", () => {
    // Ривок забирають застуда, травма й здоров'я нижче 25 (`dashRefusal`), а виснаження — ні: відмова «weak» — не про нього.
    expect(iconOf(illnessLabel("exhaustion"))).toBe("exhausted");
    expect(iconOf(illnessLabel("exhaustion"))).not.toBe(refusalBubble({ reason: "weak" }).icon);
    expect(refusalBubble({ reason: "weak" }).icon).toBe("battery-low");
    // І не інша хвороба персонажа чи кота.
    const others = [...illnesses.filter((id) => id !== "exhaustion").map((id) => ILLNESS_ICONS[id]), ...Object.values(DISEASE_ICONS)];
    expect(others).not.toContain(ILLNESS_ICONS.exhaustion);
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

/**
 * Найпростіший DOM для карток поїздок без браузера: картки будують рядки через `element` (`document.createElement`), а тест
 * дивиться лише на текст назв. Елемент пам'ятає клас, текст і дітей; решта — те, що картки викликають, без дії.
 */
class FakeElement {
  className = "";
  textContent = "";
  disabled = false;
  type = "";
  readonly style: Record<string, string> = {};
  readonly children: (FakeElement | string)[] = [];
  readonly classList = { add: (): void => {}, remove: (): void => {}, toggle: (): void => {}, contains: (): boolean => false };

  constructor(readonly tagName: string) {}

  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }

  prepend(...nodes: (FakeElement | string)[]): void {
    this.children.unshift(...nodes);
  }

  addEventListener(): void {}

  setAttribute(): void {}

  /** Усі нащадки з класом (селектор — лише `.клас`). */
  findAll(className: string): FakeElement[] {
    const own = this.children.filter((c): c is FakeElement => typeof c !== "string");
    return own.flatMap((c) => [...(c.className.split(" ").includes(className) ? [c] : []), ...c.findAll(className)]);
  }

  querySelector(selector: string): FakeElement | null {
    return this.findAll(selector.replace(/^\./, ""))[0] ?? null;
  }
}

describe("іконка біля назви: пункти поїздок (§8.5 «На місці — кадр парковки», §11.4)", () => {
  const destinations = Object.keys(TRIPS) as Destination[];
  const noop = (): void => {};
  const handlers: VisitHandlers = { checkout: noop, exam: noop, nextCat: noop, treat: noop, treatSelf: noop, adopt: noop, sterilize: noop, buyKitten: noop, groom: noop, show: noop, home: noop };

  beforeAll(() => {
    // Магазин на місці одразу малює гліфи підсумку (`drawGlyphs`): обхід тексту без вузлів нічого не знаходить.
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag), createTreeWalker: () => ({ nextNode: () => null }) });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  });
  afterAll(() => vi.unstubAllGlobals());

  /** Звичайний день без зборів і виставки, удома кіт (тоді в списку є й ветеринар із грумером). */
  function setup(): { save: ReturnType<typeof newGame>; cat: number } {
    const save = newGame({ address: "she", difficulty: "normal", seed: 8 });
    save.current.modifiers.day = null;
    save.current.character.money = 400;
    const cat = createCat(save.current, createRng(3), { source: "shelter", ageWeeks: 20, at: { x: 9.5, y: 8.5 } });
    addCat(save.current, cat);
    return { save, cat: cat.id };
  }

  it("назва пункту з іконкою (destinationLabel): іконка — DESTINATION_ICONS, назва та сама (DESTINATION_TITLES), SVG є", () => {
    expect(destinations.length).toBe(8);
    for (const d of destinations) {
      expect(iconOf(destinationLabel(d)), d).toBe(DESTINATION_ICONS[d]);
      expect(plain(destinationLabel(d)), d).toBe(DESTINATION_TITLES[d]);
      expect(iconUrl(DESTINATION_ICONS[d]), d).not.toBeNull();
    }
    // Магазин — вітрина з навісом, а не кошик 🛒 (замовлення з телефона, гліф `ui/glyph/cart`).
    expect(DESTINATION_ICONS.shop).toBe("store");
  });

  it("«Куди поїхати?»: у шпильці кожного пункту — назва і його іконка (на голівці шпильки поруч)", () => {
    const { save } = setup();
    const card = destinationCard(save.current, noop, noop);
    const map = card.body.find((b): b is HTMLElement => typeof b !== "string") as unknown as FakeElement;
    const pins = map.findAll("tripmap-pin").map((pin) => ({
      name: pin.findAll("tripmap-name")[0]?.textContent,
      icon: (pin.findAll("tripmap-head")[0]?.findAll("name-icon")[0] as { src?: string } | undefined)?.src,
    }));
    // Збори в офісі й виставка — лише в їхній день: у звичайний день їх на мапі немає. Порядок шпильок — за мапою, а не за переліком.
    const shown = destinations.filter((d) => d !== "office" && d !== "show");
    expect(pins.map((p) => p.name).sort()).toEqual(shown.map((d) => DESTINATION_TITLES[d]).sort());
    for (const d of shown) expect(pins.find((p) => p.name === DESTINATION_TITLES[d])?.icon, d).toBe(iconUrl(DESTINATION_ICONS[d]));
  });

  it("заголовок картки пункту — назва з його іконкою, у кожного пункту", () => {
    for (const d of destinations) {
      const { save, cat } = setup();
      save.current.trip = {
        destination: d,
        phase: "visit",
        cat: TRIPS[d].cat ? cat : null,
        race: { road: 10, done: 10, minutes: 10, lane: 1, targetLane: 1, speed: 1, cars: [], spawned: 0, rng: 1 },
        losses: [],
        visit: 0,
        seed: 5,
      };
      const { title } = visitCard(save.current, { exam: null, done: [] }, handlers);
      expect(iconOf(title), d).toBe(DESTINATION_ICONS[d]);
      expect(plain(title), d).toBe(DESTINATION_TITLES[d]);
    }
  });

  it("знайда: на кнопці «Віднести в притулок» — іконка притулку, та сама, що в «Куди поїхати?»; текст той самий", () => {
    const label = foundlingCard(noop, noop).actions[0]?.label ?? "";
    expect(iconOf(label)).toBe(DESTINATION_ICONS.shelter);
    expect(plain(label)).toBe(`Віднести в притулок · 🕐 ${minutesText(MODIFIERS.foundlingShelterMinutes)}`);
  });
});
