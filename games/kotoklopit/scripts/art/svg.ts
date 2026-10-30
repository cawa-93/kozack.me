// SVG арту без растеризації (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): простий розбір тегів, перевірки
// файлу проти запису маніфесту (полотно, шари, стани, заборонене), кольорів проти палітри й товщини контуру, пошук
// осиротілих SVG, а для растеризації — підготовлений SVG і таблиця стилів, що ховає все, крім одного шару й одного стану.
//
// Чисті функції без Node і sharp: їх кличуть конвеєр (`build.ts`) і `tests/art.test.ts`. Розбір — не повний XML, а
// рівно стільки, скільки потрібно для перевірок: теги з атрибутами, вкладеність, текст `<style>`, коментарі, CDATA.

import { framesOf, isArtLayer, svgPath, type ArtEntry, type ArtSize } from "../../src/view/art/types";

/** Елемент SVG: назва, атрибути (значення з розкодованими сутностями), батько й діти. */
export interface SvgNode {
  name: string;
  attrs: Readonly<Record<string, string>>;
  parent: SvgNode | null;
  children: SvgNode[];
  /** Текст усередині (для `<style>`): разом із CDATA. */
  text: string;
  /** Де в тексті файлу відкривальний тег: від `<` до `>` включно. */
  start: number;
  end: number;
}

/** Розібраний SVG: корінь, усі елементи по порядку й помилки розбору. */
export interface SvgDoc {
  root: SvgNode | null;
  nodes: readonly SvgNode[];
  problems: readonly string[];
}

const TAG = /<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/y;
const CLOSE = /<\/([A-Za-z_][\w:.-]*)\s*>/y;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

/** Розкодувати сутності XML у значенні атрибута чи тексті. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, code: string) => {
    if (code === "amp") return "&";
    if (code === "lt") return "<";
    if (code === "gt") return ">";
    if (code === "quot") return '"';
    if (code === "apos") return "'";
    const n = code.startsWith("#x") ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return String.fromCodePoint(n);
  });
}

/** Розібрати SVG на елементи. Помилки (незакритий тег, зайвий закривальний, сутності DOCTYPE) — у `problems`. */
export function parseSvg(text: string): SvgDoc {
  const nodes: SvgNode[] = [];
  const problems: string[] = [];
  let root: SvgNode | null = null;
  let current: SvgNode | null = null;
  let i = 0;
  const appendText = (value: string): void => {
    if (current) current.text += value;
  };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      appendText(text.slice(i));
      break;
    }
    if (lt > i) appendText(decodeEntities(text.slice(i, lt)));
    i = lt;
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) {
        problems.push("незакритий коментар");
        break;
      }
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);
      if (end < 0) {
        problems.push("незакритий CDATA");
        break;
      }
      appendText(text.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i + 2);
      if (end < 0) {
        problems.push("незакрита інструкція <?…?>");
        break;
      }
      i = end + 2;
      continue;
    }
    if (text.startsWith("<!", i)) {
      const end = text.indexOf(">", i + 2);
      const decl = text.slice(i, end < 0 ? text.length : end + 1);
      if (/\[|ENTITY/i.test(decl)) problems.push("DOCTYPE із сутностями — без нього");
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    CLOSE.lastIndex = i;
    const close = CLOSE.exec(text);
    if (close) {
      const name = close[1] ?? "";
      if (!current || current.name !== name) problems.push(`зайвий закривальний тег </${name}>`);
      else current = current.parent;
      i = CLOSE.lastIndex;
      continue;
    }
    TAG.lastIndex = i;
    const open = TAG.exec(text);
    if (!open) {
      problems.push(`не тег на позиції ${i}`);
      i++;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const match of (open[2] ?? "").matchAll(ATTR)) {
      const name = match[1] ?? "";
      attrs[name] = decodeEntities(match[2] ?? match[3] ?? "");
    }
    const node: SvgNode = { name: open[1] ?? "", attrs, parent: current, children: [], text: "", start: i, end: TAG.lastIndex };
    nodes.push(node);
    if (current) current.children.push(node);
    else if (root) problems.push(`другий кореневий елемент <${node.name}>`);
    else root = node;
    if (open[3] !== "/") current = node;
    i = TAG.lastIndex;
  }
  if (current) problems.push(`незакритий тег <${current.name}>`);
  return { root, nodes, problems };
}

// --- Перевірка файлу проти запису -----------------------------------------------------------------

/** Що SVG має відповідати: полотно, шари й стани запису маніфесту. */
export interface SvgSpec {
  size: ArtSize;
  layers?: readonly string[] | undefined;
  states?: readonly string[] | undefined;
}

/** Елементи, яких в арті бути не може: текст (шрифти на Windows і Linux різні), растр і зовнішній вміст. */
export const FORBIDDEN_ELEMENTS: ReadonlySet<string> = new Set([
  "text",
  "tspan",
  "textPath",
  "image",
  "foreignObject",
  "script",
  "feImage",
  "font",
  "font-face",
  "iframe",
  "video",
  "audio",
  "canvas",
]);

/** Що може стояти на верхньому рівні SVG із шарами, окрім `<g id="<шар>">`: нічого з цього не малюється. */
const TOP_LEVEL_SERVICE: ReadonlySet<string> = new Set(["defs", "style", "title", "desc", "metadata"]);

const SVG_NS = "http://www.w3.org/2000/svg";
/** Число в атрибуті розміру: без одиниць або `px`. */
const LENGTH = /^\s*(-?\d+(?:\.\d+)?|-?\.\d+)(?:px)?\s*$/;

/** Чи два числа однакові з точністю до тисячної одиниці арту. */
function same(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-3;
}

/** Класи `st-<стан>` елемента. */
export function stateClasses(node: SvgNode): string[] {
  return (node.attrs["class"] ?? "")
    .split(/\s+/)
    .filter((token) => token.startsWith("st-"))
    .map((token) => token.slice(3));
}

/**
 * Що не так із SVG для запису: корінь `<svg xmlns>` з `viewBox="0 0 w h"` = розміру запису (і `width`/`height`, якщо є, —
 * ті самі); у запису з шарами — кожен шар є групою `<g id>` верхнього рівня, інших груп і нічого, що малюється, поза
 * шарами немає; класи `st-*` — лише стани запису; немає тексту, растру, скриптів і зовнішніх посилань; id не повторюються.
 */
export function svgProblems(text: string, spec: SvgSpec): string[] {
  const doc = parseSvg(text);
  const problems = [...doc.problems];
  const root = doc.root;
  if (!root || root.name !== "svg") return [...problems, "корінь — не <svg>"];
  if (root.attrs["xmlns"] !== SVG_NS) problems.push(`немає xmlns="${SVG_NS}"`);

  const viewBox = (root.attrs["viewBox"] ?? "").trim().split(/[\s,]+/).map(Number);
  const [x0, y0, w, h] = viewBox;
  if (viewBox.length !== 4 || viewBox.some((v) => !Number.isFinite(v))) {
    problems.push(`немає viewBox (має бути "0 0 ${spec.size.w} ${spec.size.h}")`);
  } else if (!(same(x0 ?? NaN, 0) && same(y0 ?? NaN, 0) && same(w ?? NaN, spec.size.w) && same(h ?? NaN, spec.size.h))) {
    problems.push(`viewBox "${root.attrs["viewBox"]}" — не полотно запису "0 0 ${spec.size.w} ${spec.size.h}"`);
  }
  for (const [attr, value] of [
    ["width", spec.size.w],
    ["height", spec.size.h],
  ] as const) {
    const given = root.attrs[attr];
    if (given === undefined) continue;
    const match = LENGTH.exec(given);
    if (!match || !same(Number(match[1]), value)) problems.push(`${attr}="${given}" — не ${value} (як у viewBox або без нього)`);
  }

  const ids = new Set<string>();
  const states = new Set(spec.states ?? []);
  const unknownStates = new Set<string>();
  for (const node of doc.nodes) {
    if (FORBIDDEN_ELEMENTS.has(node.name)) problems.push(`<${node.name}> заборонено (лише вектор без тексту й растру)`);
    const id = node.attrs["id"];
    if (id !== undefined) {
      if (ids.has(id)) problems.push(`id «${id}» повторюється`);
      ids.add(id);
    }
    for (const [attr, value] of Object.entries(node.attrs)) {
      if ((attr === "href" || attr.endsWith(":href") || attr === "src") && !value.startsWith("#")) {
        problems.push(`<${node.name} ${attr}="${value}">: посилання лише всередині файлу (#id)`);
      }
      if (/url\(\s*['"]?(?!#)/i.test(value)) problems.push(`<${node.name} ${attr}>: url() лише всередині файлу (#id)`);
    }
    if (node.name === "style") {
      if (/@import/i.test(node.text)) problems.push("@import у <style> заборонено");
      if (/url\(\s*['"]?(?!#)/i.test(node.text)) problems.push("<style>: url() лише всередині файлу (#id)");
    }
    for (const state of stateClasses(node)) if (!states.has(state)) unknownStates.add(state);
  }
  for (const state of unknownStates) {
    problems.push(spec.states?.length ? `клас st-${state}: у запису немає стану «${state}»` : `клас st-${state}: у запису немає станів`);
  }

  if (spec.layers) {
    const wanted = new Set(spec.layers);
    const found = new Set<string>();
    for (const child of root.children) {
      if (TOP_LEVEL_SERVICE.has(child.name)) continue;
      const id = child.attrs["id"];
      if (child.name === "g" && id !== undefined && wanted.has(id)) {
        found.add(id);
        if (stateClasses(child).length > 0) problems.push(`шар «${id}» має клас st-* (стани — лише всередині шарів)`);
        continue;
      }
      if (child.name === "g" && id !== undefined && isArtLayer(id)) problems.push(`шар «${id}» не з запису (його layers: ${spec.layers.join(", ")})`);
      else problems.push(`<${child.name}${id === undefined ? "" : ` id="${id}"`}> поза шарами (верхній рівень — лише <g id="<шар>">, defs і style)`);
    }
    for (const layer of spec.layers) if (!found.has(layer)) problems.push(`немає шару <g id="${layer}"> верхнього рівня`);
  }
  return problems;
}

// --- Кольори й товщина контуру -------------------------------------------------------------------

/** Властивості, значення яких — колір. */
export const COLOR_PROPS: ReadonlySet<string> = new Set(["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"]);
/** Значення кольору, що не є кольором палітри, але дозволені. */
const COLOR_KEYWORDS: ReadonlySet<string> = new Set(["none", "transparent", "inherit", "currentcolor"]);

/** Декларації CSS `властивість: значення` з атрибута `style` чи тексту `<style>` (без коментарів і селекторів). */
export function cssDeclarations(css: string): { prop: string; value: string }[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // Усередині блоків `{…}`, якщо вони є (текст <style>), інакше — увесь рядок (атрибут style).
  const blocks = body.includes("{") ? [...body.matchAll(/\{([^}]*)\}/g)].map((m) => m[1] ?? "") : [body];
  const out: { prop: string; value: string }[] = [];
  for (const block of blocks) {
    for (const part of block.split(";")) {
      const colon = part.indexOf(":");
      if (colon < 0) continue;
      const prop = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).replace(/!important/i, "").trim();
      if (prop) out.push({ prop, value });
    }
  }
  return out;
}

/** Кожна пара властивість — значення в SVG: атрибути, `style` і текст `<style>`; `where` — для повідомлення. */
function properties(text: string): { prop: string; value: string; where: string }[] {
  const doc = parseSvg(text);
  const out: { prop: string; value: string; where: string }[] = [];
  for (const node of doc.nodes) {
    const label = node.attrs["id"] === undefined ? `<${node.name}>` : `<${node.name} id="${node.attrs["id"]}">`;
    for (const [attr, value] of Object.entries(node.attrs)) {
      if (attr === "style") for (const d of cssDeclarations(value)) out.push({ ...d, where: `${label} style` });
      else out.push({ prop: attr.toLowerCase(), value, where: label });
    }
    if (node.name === "style") for (const d of cssDeclarations(node.text)) out.push({ ...d, where: "<style>" });
  }
  return out;
}

/** Колір у вигляді #rrggbb нижнім регістром; null — це не шістнадцятковий колір без прозорості. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

/**
 * Кольори не з палітри: кожне значення `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`, `color` (в
 * атрибутах, `style` і `<style>`) — колір з `allowed` (#rrggbb чи #rgb), `none`, `transparent`, `inherit`, `currentColor`
 * або `url(#…)` (із запасним кольором — теж з палітри). Назви кольорів, `rgb()`, `hsl()` і прозорість у кольорі (#rrggbbaa)
 * — ні: прозорість — через `opacity`.
 */
export function colorProblems(text: string, allowed: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const { prop, value, where } of properties(text)) {
    if (!COLOR_PROPS.has(prop)) continue;
    let color = value.trim();
    const url = /^url\(\s*['"]?#[^)]*\)\s*(.*)$/i.exec(color);
    if (url) {
      color = (url[1] ?? "").trim();
      if (color === "") continue;
    }
    if (COLOR_KEYWORDS.has(color.toLowerCase())) continue;
    const hex = normalizeHex(color);
    if (hex === null) problems.push(`${where}: ${prop}="${value}" — лише #rrggbb з палітри`);
    else if (!allowed.has(hex)) problems.push(`${where}: ${prop}="${value}" — кольору ${hex} немає в палітрі`);
  }
  return problems;
}

/**
 * Товщина ліній не в межах: кожне `stroke-width` (атрибут, `style`, `<style>`) — число без одиниць чи в px від `min` до
 * `max` одиниць арту. Масштаб `transform` не враховується: контур не масштабують — малюють потрібної товщини.
 */
export function strokeProblems(text: string, line: { readonly min: number; readonly max: number }): string[] {
  const problems: string[] = [];
  for (const { prop, value, where } of properties(text)) {
    if (prop !== "stroke-width") continue;
    if (value.trim().toLowerCase() === "inherit") continue;
    const match = LENGTH.exec(value);
    if (!match) {
      problems.push(`${where}: stroke-width="${value}" — лише число (одиниці арту)`);
      continue;
    }
    const width = Number(match[1]);
    if (width < line.min || width > line.max) problems.push(`${where}: stroke-width="${value}" — поза ${line.min}…${line.max}`);
  }
  return problems;
}

// --- Файли проти маніфесту ----------------------------------------------------------------------

/**
 * Чи SVG явно поза маніфестом: шлях (відносно `art/`), у якому якийсь сегмент починається з `_` (`_sketch.svg`,
 * `_ref/lineweights.svg`), — чернетки, еталони, листи-огляди; конвеєр їх не растеризує, і сиротами вони не вважаються.
 */
export function isPrivateArtPath(file: string): boolean {
  return file.split("/").some((segment) => segment.startsWith("_"));
}

/** SVG усіх записів відносно `art/` (з ракурсами — по одному на ракурс). */
export function expectedSvgs(entries: readonly ArtEntry[]): Set<string> {
  return new Set(entries.flatMap((entry) => framesOf(entry).map((frame) => frame.svg)));
}

/**
 * Осиротілі SVG: файли `.svg` (шляхи відносно `art/` через «/»), яких не бере жоден запис маніфесту, крім явно приватних
 * (`isPrivateArtPath`). Решту файлів (`STYLE.md`, `palette.ts`, растрові еталони) не перевіряє.
 */
export function orphanSvgs(entries: readonly ArtEntry[], files: readonly string[]): string[] {
  const expected = expectedSvgs(entries);
  return files.filter((file) => file.toLowerCase().endsWith(".svg") && !expected.has(file) && !isPrivateArtPath(file)).sort();
}

/**
 * Чи запис намальовано цілком: з ракурсами — SVG є для всіх або ні для жодного (інакше — помилка: половина запису —
 * заглушка); `requireAll` (`KOTOKLOPIT_REQUIRE_ALL_ART`) — SVG мусить бути для всіх. `has` — чи є файл (відносно `art/`).
 */
export function drawnProblems(entry: ArtEntry, has: (svg: string) => boolean, requireAll: boolean): string[] {
  const svgs = (entry.views ?? [null]).map((view) => svgPath(entry, view));
  const missing = svgs.filter((svg) => !has(svg));
  if (missing.length === 0) return [];
  if (requireAll) return [`«${entry.id}»: немає ${missing.join(", ")} (KOTOKLOPIT_REQUIRE_ALL_ART)`];
  if (missing.length < svgs.length) return [`«${entry.id}»: є не всі ракурси — немає ${missing.join(", ")}`];
  return [];
}

// --- Для растеризації ---------------------------------------------------------------------------

/** Форматувати число для атрибута: без зайвих нулів. */
function num(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * SVG для растеризації: у кореневому `<svg>` атрибути `width` і `height` — розмір запису в одиницях арту (тоді щільність
 * `72 · res` дає полотно `size · res` пікселів, а вміст — рівно в масштабі `res`); решта файлу без змін.
 */
export function prepareSvg(text: string, size: ArtSize): string {
  const doc = parseSvg(text);
  const root = doc.root;
  if (!root || root.name !== "svg") throw new Error("корінь — не <svg>");
  const tag = text.slice(root.start, root.end);
  const selfClosing = tag.endsWith("/>");
  const kept = Object.entries(root.attrs)
    .filter(([name]) => name !== "width" && name !== "height")
    .map(([name, value]) => ` ${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`)
    .join("");
  const rebuilt = `<svg${kept} width="${num(size.w)}" height="${num(size.h)}"${selfClosing ? "/>" : ">"}`;
  return text.slice(0, root.start) + rebuilt + text.slice(root.end);
}

/**
 * Таблиця стилів (опція `stylesheet` у sharp, джерело «користувач» із `!important` — перемагає стилі самого файлу), яка
 * лишає видимим лише шар `layer` (усі інші групи-шари `others` сховано) і лише стан `state`: елементи з класами `st-*`
 * без `st-<state>` сховано. `layer` null — усі шари разом (`all`); `state` null — запис без станів.
 */
export function layerStylesheet(layer: string | null, others: readonly string[], state: string | null, states: readonly string[]): string {
  const rules: string[] = [];
  for (const other of others) if (other !== layer) rules.push(`#${other}{display:none!important}`);
  if (state !== null) {
    for (const other of states) if (other !== state) rules.push(`.st-${other}:not(.st-${state}){display:none!important}`);
  }
  return rules.join("\n");
}

/** Групи-шари верхнього рівня SVG: `<g id>` з назвою шару арту (`isArtLayer`). */
export function topLevelLayers(text: string): string[] {
  const root = parseSvg(text).root;
  if (!root) return [];
  return root.children.filter((child) => child.name === "g" && isArtLayer(child.attrs["id"] ?? "")).map((child) => child.attrs["id"] ?? "");
}
