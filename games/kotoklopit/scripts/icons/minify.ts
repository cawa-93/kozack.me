// Мініфікація SVG інтерфейсу для збірки (§2.1 «Малювання й завантаження»): без коментарів (у вихідних файлах це робочі
// нотатки художника) і без пробілів та переносів між тегами. Чиста функція без Node: її кличуть плагін і тести.
//
// Стискає лише те, що напевно не змінює малюнок. Усередині текстових елементів і під `xml:space="preserve"` пробіли —
// частина вмісту, тож там усе лишається до символу. Файл, який не вдалося розібрати, повертається як є.

/** Елементи, у яких пробіли й переноси — вміст: текст, стилі, скрипти, описи, чужа розмітка. */
const VERBATIM: ReadonlySet<string> = new Set(["text", "tspan", "textPath", "tref", "style", "script", "title", "desc", "foreignObject"]);

/** Атрибути-переліки чисел і слів: будь-яка кількість пробілів і переносів у них рівнозначна одному пробілу. */
const LISTS: ReadonlySet<string> = new Set(["d", "points", "transform", "gradientTransform", "patternTransform", "viewBox", "class"]);

const NAME = /[A-Za-z_][\w:.-]*/y;
const ATTR = /\s+([^\s=/>"'<]+)(?:\s*=\s*("[^"]*"|'[^']*'))?/y;
const TAG_END = /\s*(\/?)\s*>/y;
const CLOSE = /<\/([A-Za-z_][\w:.-]*)\s*>/y;

class Unparsed extends Error {}

/** SVG без коментарів і зайвих пробілів; малюнок — той самий. */
export function minifySvg(text: string): string {
  try {
    return minify(text);
  } catch (error) {
    if (error instanceof Unparsed) return text;
    throw error;
  }
}

function minify(text: string): string {
  let out = "";
  // Відкриті елементи: чи вміст елемента (з усіма вкладеними) лишається як є.
  const open: { name: string; verbatim: boolean }[] = [];
  const verbatim = (): boolean => open[open.length - 1]?.verbatim ?? false;
  /** Шматок до `end` (включно з ним) — у результат як є. */
  const copyTo = (from: number, end: string, skip: number): number => {
    const at = text.indexOf(end, from + skip);
    if (at < 0) throw new Unparsed();
    out += text.slice(from, at + end.length);
    return at + end.length;
  };

  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = text.slice(i, lt < 0 ? text.length : lt);
    if (verbatim() || chunk.trim() !== "") {
      // Текст поза кореневим елементом — не SVG.
      if (open.length === 0) throw new Unparsed();
      out += chunk;
    }
    if (lt < 0) break;
    i = lt;

    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) throw new Unparsed();
      if (verbatim()) out += text.slice(i, end + 3);
      i = end + 3;
    } else if (text.startsWith("<![CDATA[", i)) i = copyTo(i, "]]>", 9);
    else if (text.startsWith("<?", i)) i = copyTo(i, "?>", 2);
    else if (text.startsWith("<!", i)) {
      // DOCTYPE із внутрішніми оголошеннями (`[ … ]`) простим пошуком `>` не розібрати.
      const end = text.indexOf(">", i);
      if (end < 0 || text.slice(i, end).includes("[")) throw new Unparsed();
      i = copyTo(i, ">", 2);
    } else if (text.startsWith("</", i)) {
      CLOSE.lastIndex = i;
      const close = CLOSE.exec(text);
      const top = open.pop();
      if (!close || !top || top.name !== close[1]) throw new Unparsed();
      out += verbatim() || top.verbatim ? close[0] : `</${top.name}>`;
      i = CLOSE.lastIndex;
    } else {
      NAME.lastIndex = i + 1;
      const name = NAME.exec(text)?.[0];
      if (name === undefined) throw new Unparsed();
      let at = NAME.lastIndex;
      let tag = `<${name}`;
      let preserve = false;
      for (;;) {
        ATTR.lastIndex = at;
        const attr = ATTR.exec(text);
        if (!attr) break;
        const [, key = "", quoted] = attr;
        at = ATTR.lastIndex;
        if (quoted === undefined) {
          tag += ` ${key}`;
          continue;
        }
        if (key === "xml:space" && quoted.slice(1, -1) === "preserve") preserve = true;
        const quote = quoted[0] ?? '"';
        tag += ` ${key}=${LISTS.has(key) ? `${quote}${quoted.slice(1, -1).replace(/\s+/g, " ").trim()}${quote}` : quoted}`;
      }
      TAG_END.lastIndex = at;
      const end = TAG_END.exec(text);
      if (!end) throw new Unparsed();
      const selfClosed = end[1] === "/";
      out += verbatim() ? text.slice(i, TAG_END.lastIndex) : `${tag}${selfClosed ? "/" : ""}>`;
      if (!selfClosed) open.push({ name, verbatim: verbatim() || preserve || VERBATIM.has(name) });
      i = TAG_END.lastIndex;
    }
  }
  if (open.length > 0) throw new Unparsed();
  return out;
}
