import Phaser from "phaser";

import { AudioEngine } from "./audio/engine";
import { STATIONS } from "./audio/radio/playlist";
import { Radio } from "./audio/radio/radio";
import { AudioPrefs, browserStorage } from "./audio/settings";
import { Sounds } from "./audio/sfx/sounds";
import { DayScene } from "./scenes/DayScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { RaceScene } from "./scenes/RaceScene";
import { fullscreenOnFirstAction } from "./screen";
import { Session } from "./session";
import "./style.css";
import { browserTab, openGame } from "./tablock";
import { catRenderConfig, isSoftwareRenderer, webglRenderer } from "./view/iso/catrender";
import { fitCanvas, startCanvas } from "./view/viewport";

// Одна вкладка (§4.2): гра відкривається — і читає збереження — лише коли в інших вкладках її не відкрито.
const session = await openGame(browserTab(), () => Session.restore({ address: "she", difficulty: "normal" }));

// На програмному WebGL — одна текстура на пакет малювання (запечені частини котів; `iso/catrender.ts`, крок 16) і полотно
// без пікселів пристрою (`canvasFit`): там кожен піксель малює процесор.
const renderer = webglRenderer();
const software = isSoftwareRenderer(renderer);
const render = catRenderConfig(() => renderer);

// Режим розробки (§11.5): у `npm run dev` і на прев'ю Netlify; у продакшн-збірку не потрапляє.
if (__DEV_TOOLS__) {
  const { installDev } = await import("./dev");
  installDev(session);
}

// Гра на весь екран (§10): полотно на все вікно, без порожніх смуг, у пікселях пристрою (`fitCanvas`: розмір веде гра, а
// не Phaser — `Phaser.Scale.NONE`, CSS-розмір полотна — уся тека, style.css); що з квартири видно, вирішує камера (§8.4).
fullscreenOnFirstAction();
// Звук живе поза сценами: музика грає й у поїздках (§8.10), картки звучать будь-де (§11.4а).
const engine = new AudioEngine();
engine.start();
const prefs = new AudioPrefs(browserStorage(), STATIONS.map((station) => station.id));
const radio = new Radio(engine, prefs);
// Справжня гра відкривається меню (§4.2), і там радіо мовчить (§8.10); сценарій режиму розробки — одразу гра.
if (session.persistent) radio.hold();
radio.start();
const sounds = new Sounds(engine, prefs);
sounds.start();
const canvas = startCanvas(document.getElementById("game"), software);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: canvas.width,
  height: canvas.height,
  backgroundColor: "#2b2530",
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  input: { activePointers: 3 },
  // Звук гри — `src/audio/`: другий AudioContext не потрібен.
  audio: { noAudio: true },
  ...(render ? { render } : {}),
  // Спершу атлас арту (крок 16), потім день; гонку запускає DayScene.
  scene: [new PreloadScene("day"), new DayScene(session, radio, sounds), new RaceScene(session)],
});
fitCanvas(game, software);
