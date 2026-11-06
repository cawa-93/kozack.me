// Підказки керування (§11.3а): іконка й призначення. На клавіатурі іконка — клавіша, на телефоні — сама кнопка екрана, щоб
// гравець упізнав її під пальцем. Показує вкладка «Гра» телефона й титулка першого дня.
//
// Кнопки екрана — ті самі SVG, що й атлас (`art/ui/touch/*`, `art/ui/hud/phone.svg`). У них кілька станів, а `<img>` показав
// би всі разом, тож стан вибирає `svgInState` — так само, як конвеєр арту.

import {
  CONTROLS_KEYBOARD,
  CONTROLS_RACE_KEYBOARD,
  CONTROLS_RACE_TOUCH,
  CONTROLS_TITLES,
  CONTROLS_TOUCH,
  type ControlHint,
  type TouchButton,
} from "../texts";
import { iconUrl } from "./icons";
import { element } from "./overlay";

/** SVG кнопок екрана: шлях → текст файлу. */
const BUTTON_SVGS = import.meta.glob<string>(["../../art/ui/touch/*.svg", "../../art/ui/hud/phone.svg"], { query: "?raw", import: "default", eager: true });

/** У якому стані кнопки показані на підказці: вільні й готові. */
export const BUTTON_STATES = { action: "idle", dash: "ready", phone: "idle" } as const;

/** Куди відхилено ручку джойстика на підказці: кожен рух у гонці видно з малюнка. */
const STICK_KNOBS: Record<"stick" | "stick-up" | "stick-down" | "stick-side", readonly string[]> = {
  stick: ["center"],
  "stick-up": ["up"],
  "stick-down": ["down"],
  "stick-side": ["left", "right"],
};

/** Іконка речі на кнопці перестановки: у грі її кладе код, а на підказці — будь-яка річ. */
const CARRY_SAMPLE = "cat-house";

/** Показати лише стан `state`: конвеєр арту ховає `[class*="st-"]` і показує `.st-<стан>`. */
export function svgInState(svg: string, state: string): string {
  return svg.replace(/<svg\b[^>]*>/u, (open) => `${open}<style>[class*="st-"]{display:none}.st-${state}{display:inline}</style>`);
}

/** Малюнок із файлу кнопки: адреса `data:` — окремого файлу для стану немає. */
function buttonImage(name: string, state?: string, className = "control-art"): HTMLElement {
  const path = Object.keys(BUTTON_SVGS).find((file) => file.endsWith(`/${name}.svg`));
  const svg = path === undefined ? "" : (BUTTON_SVGS[path] ?? "");
  const image = element("img", className);
  image.src = `data:image/svg+xml,${encodeURIComponent(state === undefined ? svg : svgInState(svg, state))}`;
  image.alt = "";
  image.draggable = false;
  return image;
}

/** Джойстик: основа й ручка, відхилена туди, куди тягнути. */
function stickIcon(button: keyof typeof STICK_KNOBS): HTMLElement {
  const box = element("span", "control-stack");
  box.append(buttonImage("stick-base"));
  for (const knob of STICK_KNOBS[button]) box.append(buttonImage("stick-knob", undefined, `control-knob ${knob}`));
  return box;
}

/** Кнопка перестановки: порожній диск і річ на ньому, як у грі. */
function carryIcon(): HTMLElement {
  const box = element("span", "control-stack");
  box.append(buttonImage("carry"));
  const url = iconUrl(CARRY_SAMPLE);
  if (url !== null) {
    const item = element("img", "control-item");
    item.src = url;
    item.alt = "";
    item.draggable = false;
    box.append(item);
  }
  return box;
}

function touchIcon(button: TouchButton): HTMLElement {
  if (button === "carry") return carryIcon();
  if (button === "action" || button === "dash" || button === "phone") return buttonImage(button, BUTTON_STATES[button]);
  return stickIcon(button);
}

/** Рядок підказки: іконка й призначення. */
function hintRow(hint: ControlHint): HTMLElement {
  const row = element("li", "control");
  const icon = element("span", "control-icon");
  if ("keys" in hint) for (const key of hint.keys) icon.append(element("kbd", "key", key));
  else icon.append(touchIcon(hint.button));
  row.append(icon, element("span", "control-what", hint.what));
  return row;
}

function hintList(hints: readonly ControlHint[]): HTMLElement {
  const list = element("ul", "controls-list");
  list.append(...hints.map(hintRow));
  return list;
}

/** Керування вдома — для титулки першого дня. */
export function homeControls(touch: boolean): HTMLElement {
  const box = element("div", "controls");
  box.append(hintList(touch ? CONTROLS_TOUCH : CONTROLS_KEYBOARD));
  return box;
}

/** Керування вдома й у гонці — для вкладки «Гра». */
export function allControls(touch: boolean): HTMLElement {
  const box = element("div", "controls");
  const group = (title: string, hints: readonly ControlHint[]): HTMLElement => {
    const section = element("div", "controls-group");
    section.append(element("p", "controls-title", title), hintList(hints));
    return section;
  };
  box.append(group(CONTROLS_TITLES.home, touch ? CONTROLS_TOUCH : CONTROLS_KEYBOARD), group(CONTROLS_TITLES.race, touch ? CONTROLS_RACE_TOUCH : CONTROLS_RACE_KEYBOARD));
  return box;
}
