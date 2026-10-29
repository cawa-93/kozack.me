import Phaser from "phaser";

import { DayScene } from "./scenes/DayScene";
import { RaceScene } from "./scenes/RaceScene";
import { fullscreenOnFirstAction } from "./screen";
import { Session } from "./session";
import "./style.css";
import { BASE_HEIGHT, BASE_WIDTH } from "./view/geometry";

const session = Session.restore({ address: "she", difficulty: "normal" });

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
  scene: [new DayScene(session), new RaceScene(session)],
});
