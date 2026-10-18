// SVG-іконки інтерфейсу (§1.3: іконки замість тексту). Монохромні, колір — currentColor.

const svg = (body: string, vb = "0 0 32 32") =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICON = {
  play: svg(`<path d="M11 8 L24 16 L11 24 Z" fill="currentColor"/>`),
  gear: svg(
    `<circle cx="16" cy="16" r="4.5"/><path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8"/><circle cx="16" cy="16" r="9"/>`,
  ),
  back: svg(`<path d="M20 8 L11 16 L20 24"/><path d="M11 16 H26"/>`),
  speaker: svg(`<path d="M6 13h5l6-5v16l-6-5H6z" fill="currentColor" stroke="none"/><path d="M21 12c1.5 1.2 1.5 6.8 0 8M24 9c3 2.8 3 11.2 0 14"/>`),
  mouse: svg(`<rect x="10" y="5" width="12" height="22" rx="6"/><path d="M16 5v7"/>`),
  eyeWave: svg(`<path d="M3 16c4-6 9-8 13-8s9 2 13 8c-4 6-9 8-13 8s-9-2-13-8z"/><circle cx="16" cy="16" r="3.5"/>`),
  spiderOff: svg(
    `<circle cx="16" cy="17" r="4"/><path d="M12 15l-6-5M12 18l-7 0M12 20l-6 5M20 15l6-5M20 18l7 0M20 20l6 5"/><path d="M4 28 L28 4" stroke-width="2.4"/>`,
  ),
  resetKeys: svg(`<rect x="6" y="10" width="12" height="12" rx="2"/><path d="M22 9a8 8 0 1 1-2 14"/><path d="M22 5v4h4"/>`),
};
