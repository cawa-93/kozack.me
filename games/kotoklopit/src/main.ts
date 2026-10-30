import Phaser from "phaser";

import { DayScene } from "./scenes/DayScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { RaceScene } from "./scenes/RaceScene";
import { fullscreenOnFirstAction } from "./screen";
import { Session } from "./session";
import "./style.css";
import { currentGfx } from "./view/gfx";
import { BASE_HEIGHT, BASE_WIDTH } from "./view/viewport";

const session = Session.restore({ address: "she", difficulty: "normal" });

// Яка графіка (крок 16): нове оформлення DOM-інтерфейсу (`overlay.css`) до кінця хвилі 3 діє лише під
// `:root[data-gfx="iso"]`, щоб старий вигляд лишався як був.
document.documentElement.dataset.gfx = currentGfx();

// Режим розробки (§11.5): у `npm run dev` і на прев'ю Netlify; у продакшн-збірку не потрапляє.
if (__DEV_TOOLS__) {
  const { installDev } = await import("./dev");
  installDev(session);
}

// Гра на весь екран (§10): полотно 16:9 ширшає чи вищає під форму екрана, без порожніх смуг,
// а що з квартири видно, вирішує камера (§8.4).
fullscreenOnFirstAction();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  backgroundColor: "#2b2530",
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  // Спершу атлас арту (крок 16), потім день; гонку запускає DayScene.
  scene: [new PreloadScene("day"), new DayScene(session), new RaceScene(session)],
});
