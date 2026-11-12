// Поле імені кота (§9.7): нове ім'я діє одразу, з кожною літерою, а порожнє поле лишає те, що було, — і тоді, коли ім'я стерли
// по літері (на телефоні так і стирають — утриманням).

import { describe, expect, it } from "vitest";

import { catNameEditor } from "../src/ui/catname";

describe("поле імені кота (§9.7)", () => {
  it("нове ім'я діє з кожною літерою", () => {
    const cat = { name: "Барсик" };
    const editor = catNameEditor(cat);
    editor.focus();
    editor.input("Мур");
    expect(cat.name).toBe("Мур");
    expect(editor.blur()).toBe("Мур");
    expect(cat.name).toBe("Мур");
  });

  it("стерли ім'я по літері й вийшли з поля — лишилося те, що було", () => {
    const cat = { name: "Барсик" };
    const editor = catNameEditor(cat);
    editor.focus();
    for (const value of ["Барси", "Барс", "Бар", "Ба", "Б", ""]) editor.input(value);
    expect(editor.blur()).toBe("Барсик");
    expect(cat.name).toBe("Барсик");
  });

  it("лише пробіли — так само порожнє", () => {
    const cat = { name: "Барсик" };
    const editor = catNameEditor(cat);
    editor.focus();
    for (const value of ["Б", "", " ", "  "]) editor.input(value);
    expect(editor.blur()).toBe("Барсик");
    expect(cat.name).toBe("Барсик");
  });

  it("стерли й написали нове — нове", () => {
    const cat = { name: "Барсик" };
    const editor = catNameEditor(cat);
    editor.focus();
    for (const value of ["Б", "", "Р", "Ри", "Рижик"]) editor.input(value);
    expect(editor.blur()).toBe("Рижик");
    expect(cat.name).toBe("Рижик");
  });

  it("друге перейменування пам'ятає ім'я з першого", () => {
    const cat = { name: "Барсик" };
    const editor = catNameEditor(cat);
    editor.focus();
    editor.input("Мурко");
    editor.blur();
    editor.focus();
    for (const value of ["Мурк", "Мур", "Му", "М", ""]) editor.input(value);
    expect(editor.blur()).toBe("Мурко");
    expect(cat.name).toBe("Мурко");
  });
});
