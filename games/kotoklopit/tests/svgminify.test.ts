// SVG інтерфейсу в збірці (§2.1 «Малювання й завантаження»): без коментарів і зайвих пробілів, а малюнок — той самий.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSvg, type SvgNode } from "../scripts/art/svg";
import { minifySvg } from "../scripts/icons/minify";

const ART_DIR = fileURLToPath(new URL("../art", import.meta.url));

/** Усі SVG теки `art/<dir>` (з підтеками): шлях від `art/` → текст. */
function svgs(dir: string): [string, string][] {
  return readdirSync(path.join(ART_DIR, dir), { recursive: true })
    .map((file) => `${dir}/${String(file).replaceAll("\\", "/")}`)
    .filter((file) => file.endsWith(".svg"))
    .map((file) => [file, readFileSync(path.join(ART_DIR, file), "utf8")]);
}

/** Атрибути-переліки чисел і слів: кілька пробілів чи перенос рядка в них — те саме, що один пробіл. */
const LISTS = new Set(["d", "points", "transform", "viewBox", "class"]);

/** Дерево елементів: назви, атрибути й текст — усе, з чого браузер малює. Самі пробіли між тегами — не текст. */
function shape(node: SvgNode): unknown {
  const attrs = Object.entries(node.attrs).map(([name, value]) => [name, LISTS.has(name) ? value.replace(/\s+/g, " ").trim() : value]);
  return { name: node.name, attrs, text: node.text.trim() === "" ? "" : node.text, children: node.children.map(shape) };
}

function sameDrawing(before: string, after: string, label: string): void {
  const was = parseSvg(before);
  const now = parseSvg(after);
  expect(now.problems, label).toEqual([]);
  expect(now.root, label).not.toBeNull();
  expect(now.root && shape(now.root), label).toEqual(was.root && shape(was.root));
}

describe("мініфікація SVG інтерфейсу (§2.1)", () => {
  it("коментарі й переноси між тегами зникають, елементи й атрибути — ті самі", () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
      "<!-- icon/kibble — корм: миска.",
      "size 64×64; pivot (32, 32) -->",
      '  <g id="p-bowl">',
      '    <path d="M7 37C8 47 13 54 17 55Z" fill="#6c84a3"/>',
      "  </g>",
      "</svg>",
      "",
    ].join("\n");
    expect(minifySvg(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><g id="p-bowl"><path d="M7 37C8 47 13 54 17 55Z" fill="#6c84a3"/></g></svg>',
    );
  });

  it("пробіли в тегу між атрибутами — по одному; переноси в `d`, `points` і `transform` — пробілом", () => {
    const svg = '<svg  xmlns="http://www.w3.org/2000/svg"\n  viewBox = "0 0 8 8" >\n<path\n d="M1 2\n   L3 4\n"  transform=" translate(1,  2)\n rotate(3) " />\n<polygon points="1,2\n3,4  5,6" / >\n</svg>';
    expect(minifySvg(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M1 2 L3 4" transform="translate(1, 2) rotate(3)"/><polygon points="1,2 3,4 5,6"/></svg>',
    );
  });

  it("значення решти атрибутів і лапки — як у файлі", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g style="font-family: 'A  B'" data-note='каже "няв"  двічі' aria-label="a  &amp;  b"/></svg>`;
    expect(minifySvg(svg)).toBe(svg);
  });

  it("текст (`<text>`, `<tspan>`), `<style>`, CDATA і `xml:space` лишаються до символу", () => {
    const kept = [
      '<text x="1">  Кіт  <tspan> і  миска </tspan>\n  <!-- не чіпати -->\n</text>',
      "<style>\n  .st-idle { display: none }\n  /* <!-- не коментар --> */\n</style>",
      "<style><![CDATA[\n  .a > .b { fill: red }\n  <!-- і це не коментар -->\n]]></style>",
      '<g xml:space="preserve">\n  <path d="M1 2\n  L3 4"/>\n  </g>',
      "<title>  Назва   іконки </title>",
    ];
    for (const part of kept) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">\n  <!-- нотатка -->\n  ${part}\n  <g>\n  </g>\n</svg>\n`;
      expect(minifySvg(svg), part).toBe(`<svg xmlns="http://www.w3.org/2000/svg">${part}<g></g></svg>`);
    }
  });

  it("текст поза текстовими елементами не зникає", () => {
    expect(minifySvg("<svg>\n <g> а б </g>\n</svg>")).toBe("<svg><g> а б </g></svg>");
  });

  it("кутові дужки й `--` у значенні атрибута — не тег і не коментар", () => {
    const svg = `<svg data-a="1 > 0" data-b='<!-- не коментар -->'>\n<g/>\n</svg>`;
    expect(minifySvg(svg)).toBe(`<svg data-a="1 > 0" data-b='<!-- не коментар -->'><g/></svg>`);
  });

  it("файл, який не розібрати, лишається як є", () => {
    for (const broken of ["<svg><!-- незакритий", '<svg a="1><g/></svg>', "<svg><![CDATA[ x </svg>", "не svg < зовсім"]) expect(minifySvg(broken), broken).toBe(broken);
  });

  const files = [...svgs("icon"), ...svgs("ui/glyph"), ...svgs("ui/touch"), ["ui/hud/phone.svg", readFileSync(path.join(ART_DIR, "ui/hud/phone.svg"), "utf8")] as [string, string]];

  it("кожен SVG карток і кнопок: коректний XML тих самих елементів і атрибутів, без коментарів, не довший", () => {
    expect(files.length).toBeGreaterThan(150);
    for (const [file, text] of files) {
      const small = minifySvg(text);
      sameDrawing(text, small, file);
      expect(small, file).not.toContain("<!--");
      expect(small, file).not.toMatch(/>\s+</);
      expect(small.length, file).toBeLessThan(text.length);
      expect(minifySvg(small), file).toBe(small);
    }
  });
});
