import Phaser from "phaser";

import { DayScene } from "./scenes/DayScene";
import { Session } from "./session";
import "./style.css";

const session = Session.restore({ sex: "female", difficulty: "normal" });

// Режим розробки (§11.5) не потрапляє в продакшн-збірку.
if (import.meta.env.DEV) {
  const { installDev } = await import("./dev");
  installDev(session);
}

// Горизонтальне полотно 16:9, яке вписується в екран і телефона, і десктопа.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#2b2530",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  scene: [new DayScene(session)],
});
