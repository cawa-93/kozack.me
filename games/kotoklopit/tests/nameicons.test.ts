// Іконка біля назви (GAME_DESIGN §11.4 «Іконка біля назви», рішення автора 2026-11-02): у магазині біля кожного запасу й речі,
// у ветеринара біля кожної хвороби кота, у лікаря — біля хвороби персонажа стоїть та сама іконка, що в грі. У картці це
// `<img>` із SVG `art/icon/<назва>.svg` (`src/ui/icons.ts`); у тексті — позначка, яку малюнком замінює `drawIcons`.

import { describe, expect, it } from "vitest";

import { iconMark, iconUrl, named, splitIcons, type IconPart } from "../src/ui/icons";
import { ICON_NAMES, type IconName } from "../src/view/iconnames";

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
