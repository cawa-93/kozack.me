// Іконки інтерфейсу карток (§11.4): у тексті стоять символи-позначки (🛒 👛 🏠 🕐 🚗), а на екрані —
// намальовані іконки в чорнильному стилі гри, однакові на будь-якому телефоні.

const INK = "#1f1a24";

/** SVG кожної іконки, поле 24×24. */
const GLYPHS: Record<string, string> = {
  // Кошик.
  "🛒": `<path d="M2 5h3l2.5 10h11L21 8H7" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 9h11.5l-1.7 5H9.2z" fill="#e8b93a"/><circle cx="9.5" cy="19" r="1.8" fill="${INK}"/><circle cx="17" cy="19" r="1.8" fill="${INK}"/>`,
  // Гаманець.
  "👛": `<rect x="3" y="7" width="18" height="13" rx="3" fill="#c0675a" stroke="${INK}" stroke-width="2"/><path d="M6 7l9-3 2 3" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><rect x="14" y="11.5" width="7" height="4.5" rx="1.5" fill="#e9b0a6" stroke="${INK}" stroke-width="1.6"/><circle cx="16.5" cy="13.75" r="1" fill="${INK}"/>`,
  // Дім.
  "🏠": `<path d="M3 11.5L12 4l9 7.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M5.5 10v10h13V10" fill="#e8d3a6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="6" fill="#8b5e3c"/>`,
  // Годинник.
  "🕐": `<circle cx="12" cy="12.5" r="8.5" fill="#fffaf2" stroke="${INK}" stroke-width="2.2"/><path d="M12 8v4.5l3 2" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  // Машина.
  "🚗": `<path d="M3 15v-3l2.5-5h13l2.5 5v3z" fill="#5a7fc0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M7 8.5h10l1.3 3H5.7z" fill="#cfe3ec"/><circle cx="7.5" cy="16.5" r="2.3" fill="${INK}"/><circle cx="16.5" cy="16.5" r="2.3" fill="${INK}"/>`,
};

const PATTERN = new RegExp(`(${Object.keys(GLYPHS).join("|")})`, "u");

/** Замінити символи-позначки в тексті вузла на намальовані іконки. */
export function drawGlyphs(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (PATTERN.test(n.nodeValue ?? "")) nodes.push(n as Text);
  for (const node of nodes) {
    const parts = (node.nodeValue ?? "").split(PATTERN);
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      const svg = GLYPHS[part];
      if (!svg) {
        if (part) fragment.append(part);
        continue;
      }
      const span = document.createElement("span");
      span.className = "glyph";
      span.setAttribute("aria-hidden", "true");
      span.innerHTML = `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em">${svg}</svg>`;
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }
}
