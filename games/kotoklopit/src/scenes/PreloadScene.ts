// Завантаження атласу арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): перша сцена гри. Бере
// `<BASE_URL>art/index.json` і сторінки атласу тим самим завантажувачем, що й галерея (`loadArtAtlas`, `atlasload.ts`):
// одна текстура `ART_TEXTURE` з кадрами за контрактом `src/view/art/atlas.ts`. Потім позначає `<html data-art>` і запускає
// DayScene. Атласу немає (404, порожній, не той формат, сторінка не завантажилася) — гра йде далі на заглушках `atlas.ts`.
//
// `loadArtAtlas` кличеться з `create()` і сам запускає обидва проходи завантажувача (спершу `index.json`, потім сторінки),
// тож не чекає кадрів гри: скрипт знімків тримає кадри на паузі, доки сторінка не готова. DayScene стартує, щойно атлас
// готовий, ще до першого кадру — у ту саму мить гри, що й раніше без PreloadScene, тож знімки старого вигляду не змінилися.
//
// Сторінки — джерела-зображення (Image) однієї текстури: після втрати контексту WebGL Phaser сам завантажує їх знову.

import Phaser from "phaser";

import { markArtReady } from "../view/art/atlas";
import { loadArtAtlas, type ArtAtlasState } from "../view/art/atlasload";

/** Індикатор: доріжка трохи світліша за тло гри (#2b2530, main.ts), смуга — колір паперу інтерфейсу; без тексту. */
const BAR = { track: 0x3b3340, fill: 0xf3e9dc, height: 6, maxWidth: 280, share: 0.4 };
/** Яку частку смуги займає перший прохід (`index.json` — маленький файл); решта — сторінки атласу. */
const INDEX_SHARE = 0.1;

/** Перша сцена: смуга завантаження, атлас, потім `next` (DayScene). */
export class PreloadScene extends Phaser.Scene {
  private readonly next: string;
  private bar: Phaser.GameObjects.Graphics | null = null;
  private progress = 0;

  constructor(next = "day") {
    super("preload");
    this.next = next;
  }

  create(): void {
    this.bar = this.add.graphics();
    this.draw();
    const onResize = (): void => this.draw();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    // Хід завантаження — події завантажувача сцени: спершу черга з `index.json`, після неї — черга сторінок.
    let pass = 0;
    const onProgress = (value: number): void => {
      this.progress = pass === 0 ? value * INDEX_SHARE : INDEX_SHARE + value * (1 - INDEX_SHARE);
      this.draw();
    };
    const onComplete = (): void => {
      pass++;
    };
    this.load.on(Phaser.Loader.Events.PROGRESS, onProgress);
    this.load.on(Phaser.Loader.Events.COMPLETE, onComplete);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.load.off(Phaser.Loader.Events.PROGRESS, onProgress);
      this.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
    });
    void loadArtAtlas(this).then(
      (result) => this.finish(result.state),
      () => this.finish("none"),
    );
  }

  /** Смуга посередині екрана: доріжка й заповнена частка. */
  private draw(): void {
    const bar = this.bar;
    if (!bar) return;
    const { width, height } = this.scale.gameSize;
    const w = Math.round(Math.min(BAR.maxWidth, width * BAR.share));
    const x = Math.round((width - w) / 2);
    const y = Math.round(height / 2 - BAR.height / 2);
    bar.clear();
    bar.fillStyle(BAR.track, 1).fillRoundedRect(x, y, w, BAR.height, BAR.height / 2);
    const filled = Math.round(w * Math.min(1, Math.max(0, this.progress)));
    if (filled > 0) bar.fillStyle(BAR.fill, 1).fillRoundedRect(x, y, Math.max(BAR.height, filled), BAR.height, BAR.height / 2);
  }

  /**
   * Атлас готовий (чи його немає): ця сцена зупиняється, а `next` стартує одразу, не чекаючи кадру, — через менеджер сцен
   * гри, а не `this.scene.start`, що відклав би старт до наступного кадру. `<html data-art>` (`markArtReady`) з'являється в
   * тому самому завданні, що й старт DayScene, тож скрипт знімків, який чекає його, бачить гру вже створеною.
   */
  private finish(state: ArtAtlasState): void {
    const game = this.sys.game;
    if (!game || !this.sys.isActive()) return;
    this.bar = null;
    try {
      game.scene.stop(this.scene.key);
      game.scene.start(this.next);
    } finally {
      // І якщо сцена впала: скрипт знімків покаже її помилку, а не «не дочекався атласу».
      markArtReady(state);
    }
  }
}
