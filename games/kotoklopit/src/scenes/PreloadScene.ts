// Завантаження атласу арту (крок 16, GRAPHICS_PLAN.md: «Арт, маніфест і атласи»): перша сцена гри. Бере
// `<BASE_URL>art/index.json` і сторінки атласу тим самим завантажувачем, що й галерея (`loadArtAtlas`, `atlasload.ts`):
// одна текстура `ART_TEXTURE` з кадрами за контрактом `src/view/art/atlas.ts`. Потім позначає `<html data-art>` і запускає
// DayScene.
//
// Індикатор — заставка з index.html (`#boot`: назва гри й смуга, видно ще до коду гри): поки коду немає, смуга біжить
// туди-сюди, а тут вона заповнюється ходом завантаження (`--boot-progress`) — за байтами сторінок атласу, рівномірно й без
// повернень назад (`loadArtAtlas` → `AtlasLoadProgress`). Гра готова — заставку прибрано.
//
// Атласу немає (404, порожній, не той формат, сторінка не прийшла й після повторів Phaser): у продакшні заставка каже, що
// гра не завантажилася, і кнопка «Спробувати ще» довантажує лише те, чого бракує (`atlasload.ts` пам'ятає сторінки, що
// прийшли); гра на маджентових заглушках гравцеві не потрібна. У режимі розробки (`__DEV_TOOLS__`: dev і прев'ю) гра, як і
// раніше, йде далі на заглушках `atlas.ts` — так видно, чого бракує.
//
// `loadArtAtlas` кличеться з `create()` і сам запускає обидва проходи завантажувача (спершу `index.json`, потім сторінки),
// тож не чекає кадрів гри: скрипт знімків тримає кадри на паузі, доки сторінка не готова. DayScene стартує, щойно атлас
// готовий, ще до першого кадру — у ту саму мить гри, що й раніше без PreloadScene, тож знімки старого вигляду не змінилися.
//
// Сторінки — джерела-зображення (Image) однієї текстури: після втрати контексту WebGL Phaser сам завантажує їх знову.

import Phaser from "phaser";

import { LOAD_FAILED } from "../texts";
import { markArtReady } from "../view/art/atlas";
import { loadArtAtlas, type ArtAtlasState } from "../view/art/atlasload";

/** Заставка з index.html: назва, смуга й місце для повідомлення, що гра не завантажилася. */
interface Boot {
  root: HTMLElement;
  fail: HTMLElement | null;
}

/** Заставка сторінки, якщо вона є (у галереї й тестах її немає). */
function bootScreen(): Boot | null {
  const root = typeof document === "undefined" ? null : document.getElementById("boot");
  return root ? { root, fail: root.querySelector<HTMLElement>(".boot-fail") } : null;
}

/** Перша сцена: заставка зі смугою, атлас, потім `next` (DayScene). */
export class PreloadScene extends Phaser.Scene {
  private readonly next: string;
  private boot: Boot | null = null;

  constructor(next = "day") {
    super("preload");
    this.next = next;
  }

  create(): void {
    this.boot = bootScreen();
    this.attempt();
  }

  /** Спроба завантажити атлас (перша чи «Спробувати ще»): смуга — з нуля, далі за байтами, що прийшли. */
  private attempt(): void {
    this.progress(0);
    void loadArtAtlas(this, undefined, (value) => this.progress(value)).then(
      (result) => this.loaded(result.state),
      () => this.loaded("none"),
    );
  }

  /** Смуга заставки: частка 0–1. */
  private progress(value: number): void {
    const root = this.boot?.root;
    if (!root) return;
    root.classList.add("boot-progress");
    root.style.setProperty("--boot-progress", String(Math.min(1, Math.max(0, value))));
  }

  private loaded(state: ArtAtlasState): void {
    if (state === "none" && !__DEV_TOOLS__ && this.boot?.fail) {
      this.failed(this.boot);
      return;
    }
    this.finish(state);
  }

  /** Атлас не завантажився: повідомлення й кнопка, що пробує ще раз. */
  private failed(boot: Boot): void {
    const fail = boot.fail!;
    const title = document.createElement("p");
    title.textContent = LOAD_FAILED.title;
    title.style.fontWeight = "700";
    const text = document.createElement("p");
    text.textContent = LOAD_FAILED.body;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button primary";
    retry.textContent = LOAD_FAILED.retry;
    retry.addEventListener("click", () => {
      boot.root.classList.remove("boot-failed");
      fail.replaceChildren();
      this.attempt();
    });
    fail.replaceChildren(title, text, retry);
    boot.root.classList.add("boot-failed");
    retry.focus();
  }

  /**
   * Атлас готовий (чи його немає): ця сцена зупиняється, а `next` стартує одразу, не чекаючи кадру, — через менеджер сцен
   * гри, а не `this.scene.start`, що відклав би старт до наступного кадру. `<html data-art>` (`markArtReady`) з'являється в
   * тому самому завданні, що й старт DayScene, тож скрипт знімків, який чекає його, бачить гру вже створеною.
   */
  private finish(state: ArtAtlasState): void {
    const game = this.sys.game;
    if (!game || !this.sys.isActive()) return;
    this.boot?.root.remove();
    this.boot = null;
    try {
      game.scene.stop(this.scene.key);
      game.scene.start(this.next);
    } finally {
      // І якщо сцена впала: скрипт знімків покаже її помилку, а не «не дочекався атласу».
      markArtReady(state);
    }
  }
}
