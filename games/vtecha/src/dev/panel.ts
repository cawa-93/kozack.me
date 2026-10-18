// Панель розробника (§12.7). Підключається лише в режимі розробки (import.meta.env.DEV),
// у продакшн-збірку не потрапляє. Кнопки підписані текстом — це не частина гри (§1.3 не діє).

import type { Run } from "../game/run";
import { Item, type ItemKind } from "../game/items";
import type { GameRenderer } from "../render/renderer";
import "./panel.css";
import { spawnDoor, spawnItem, spawnSpider, spawnWeb } from "./spawn";

export interface DevApi {
  spawnItem(kind: ItemKind | "antidote"): boolean;
  spawnWeb(): boolean;
  spawnDoor(): boolean;
  spawnSpider(): boolean;
  jump(level: number): boolean;
  toggleLight(): boolean;
}

const ITEMS: [ItemKind | "antidote", string][] = [
  ["dynamo", "Динамо"],
  ["flashlight", "Ліхтарик"],
  ["gasLamp", "Газова лампа"],
  ["flare", "Шашка"],
  ["matchbook", "Сірники"],
  ["lighter", "Запальничка"],
  ["battery", "Батарейка"],
  ["fuel", "Пальне"],
  ["antidote", "Протиотрута"],
];

export function installDevPanel(parent: HTMLElement, getRun: () => Run | null, renderer: GameRenderer): DevApi {
  const world = () => getRun()?.world ?? null;
  const api: DevApi = {
    spawnItem(kind) {
      const w = world();
      if (!w) return false;
      spawnItem(w, kind === "antidote" ? null : new Item(kind));
      return true;
    },
    spawnWeb: () => {
      const w = world();
      return w ? spawnWeb(w) : false;
    },
    spawnDoor: () => {
      const w = world();
      return w ? spawnDoor(w) : false;
    },
    spawnSpider: () => {
      const w = world();
      return w ? spawnSpider(w) : false;
    },
    jump(level) {
      const run = getRun();
      if (!run || level < 1 || level > 5) return false;
      run.debugJump(level - 1);
      return true;
    },
    toggleLight() {
      renderer.devFullbright = !renderer.devFullbright;
      lightBtn.textContent = renderer.devFullbright ? "Світло: вся мапа" : "Світло: гра";
      lightBtn.classList.toggle("on", renderer.devFullbright);
      return renderer.devFullbright;
    },
  };

  const root = document.createElement("div");
  root.className = "dev-panel";
  const group = (title: string) => {
    const g = document.createElement("div");
    g.className = "dev-group";
    const h = document.createElement("div");
    h.className = "dev-title";
    h.textContent = title;
    g.append(h);
    root.append(g);
    return g;
  };
  const button = (g: HTMLElement, label: string, action: () => boolean) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const ok = action();
      b.classList.add(ok ? "ok" : "fail");
      setTimeout(() => b.classList.remove("ok", "fail"), 300);
    });
    g.append(b);
    return b;
  };

  const items = group("Предмет поруч");
  for (const [kind, label] of ITEMS) button(items, label, () => api.spawnItem(kind));
  const tiles = group("Тайл / павук");
  button(tiles, "Павутина", api.spawnWeb);
  button(tiles, "Двері", api.spawnDoor);
  button(tiles, "Павук", api.spawnSpider);
  const levels = group("Рівень");
  const row = document.createElement("div");
  row.className = "dev-row";
  levels.append(row);
  for (let i = 1; i <= 5; i++) button(row, String(i), () => api.jump(i));
  const light = group("Світло");
  const lightBtn = button(light, "Світло: гра", api.toggleLight);

  parent.append(root);
  (window as unknown as { dev: DevApi }).dev = api;
  return api;
}
