// Іконки інтерфейсу карток (§11.4): у тексті стоять символи-позначки (🛒 👛 🏠 🕐 🚗 💻 🐱 ☕ 👣, «❓» — про рису ще нічого не
// відомо), а на екрані — намальовані іконки в чорнильному стилі гри, однакові на будь-якому телефоні.
//
// Гліф — `<img>` із SVG пакета A12 `art/ui/glyph/<назва>.svg` (назва — `GLYPH_ART` маніфесту, крок 16), а не кадр атласу:
// браузер малює SVG сам, тож гліф чіткий на будь-якій щільності екрана. Файли бере Vite (`?url`); що SVG є для кожного
// гліфа, перевіряють тести арту (як і для решти записів маніфесту).

import { GLYPH_ART } from "../view/art/manifest/a12-icons";

/** SVG гліфів A12 (`art/ui/glyph/<назва>.svg`) → адреса файлу. */
const GLYPH_FILES = import.meta.glob<string>("../../art/ui/glyph/*.svg", { query: "?url", import: "default", eager: true });

/**
 * Адреса SVG, яким замінити символ: файл `ui/glyph/<назва>` серед `files` (шлях → адреса, як дає `import.meta.glob`); не
 * гліф чи файлу немає — null (символ лишається як є). Чистий розрахунок без DOM.
 */
export function glyphUrl(symbol: string, files: Readonly<Record<string, string>> = GLYPH_FILES): string | null {
  const name = GLYPH_ART[symbol];
  if (name === undefined) return null;
  return Object.entries(files).find(([path]) => path.endsWith(`/${name}.svg`))?.[1] ?? null;
}

const PATTERN = new RegExp(`(${Object.keys(GLYPH_ART).join("|")})`, "u");

/** Замінити символи-позначки в тексті вузла на намальовані іконки. */
export function drawGlyphs(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (PATTERN.test(n.nodeValue ?? "")) nodes.push(n as Text);
  for (const node of nodes) {
    const parts = (node.nodeValue ?? "").split(PATTERN);
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      const url = part ? glyphUrl(part) : null;
      if (url === null) {
        if (part) fragment.append(part);
        continue;
      }
      const span = document.createElement("span");
      span.className = "glyph";
      span.setAttribute("aria-hidden", "true");
      // Розмір — 1,15 em, блоком усередині `.glyph`.
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.draggable = false;
      img.style.cssText = "display:block;width:1.15em;height:1.15em";
      span.append(img);
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }
}
