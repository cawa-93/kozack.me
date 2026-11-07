// Кроки персонажа (§11.4а): у такт ходи, яку малює вигляд. Темп — з контракту ходи N4a (`personGait`, `personGaitSpeed`),
// тож звук і ноги йдуть разом; удар — на початку опори кожної ноги. Пам'ять — у полях, щокадру нових об'єктів немає.

import { BODY_SECONDS_PER_GAME_HOUR, DASH_SPEED, MINUTES_PER_HOUR, WALK_TILES_PER_MINUTE } from "../../../sim/config";
import type { GameState, IllnessId } from "../../../sim/types";
import { personGait, personGaitSpeed, type PersonGait } from "../../../view/rig/anims/person/move";
import { ISO_TILE } from "../../../view/world/projection";
import { floorAt, type Floor } from "./floor";

/** Як вигляд згладжує швидкість (`PACE_SMOOTH_MS` у `iso/personlook.ts`): кадри й кроки сима нерівні. */
const SMOOTH_MS = 80;
/** Найшвидший справжній рух — ривок, клітинок за секунду; швидше — персонажа переставили (новий день, повернення з поїздки). */
const MAX_TILES_PER_SECOND = ((WALK_TILES_PER_MINUTE * DASH_SPEED) / BODY_SECONDS_PER_GAME_HOUR) * MINUTES_PER_HOUR * 2;
/** Далі за це за кадр — теж переставили, хоч би яким довгим був кадр. */
const TELEPORT_TILES = 4;
/** Повільніше — стоїть (уперся в стіну, ледь рушив): кроків немає. */
const MIN_TILES_PER_SECOND = 0.5;
/** Рушив з місця — перший крок майже одразу, а не через пів циклу. */
const START_PHASE = 0.95;
/** Довгий кадр (вкладка у фоні) не дає цілої черги кроків. */
const MAX_DT_MS = 250;

export interface Step {
  floor: Floor;
  gait: PersonGait;
}

const ill = (state: GameState, id: IllnessId): boolean => {
  for (const illness of state.character.illnesses) if (illness.id === id) return true;
  return false;
};

/** Хода, як її обирає вигляд (`personAnim`): ривок, паморочиться, кульгає з травмою, плететься виснажений, іде. */
function gaitOf(state: GameState): PersonGait {
  const body = state.character.body;
  if (body.dash > 0) return "dash";
  if (body.glitch > 0) return "dizzy";
  if (ill(state, "injury")) return "limp";
  if (ill(state, "exhaustion")) return "trudge";
  return "walk";
}

export class Steps {
  private x = 0;
  private y = 0;
  private known = false;
  /** Згладжена швидкість, клітинок за секунду. */
  private vx = 0;
  private vy = 0;
  /** Частка циклу ходи. */
  private phase = START_PHASE;
  private readonly step: Step = { floor: "wood", gait: "walk" };

  reset(): void {
    this.known = false;
    this.vx = 0;
    this.vy = 0;
    this.phase = START_PHASE;
  }

  /** Кадр: крок, якщо нога саме стала на підлогу (той самий об'єкт щоразу), інакше null. */
  update(state: GameState, dtMs: number): Readonly<Step> | null {
    const character = state.character;
    const body = character.body;
    const activity = character.activity;
    // У поїздці й у душовій кабіні персонажа не видно, оглушений стоїть на місці — кроків немає, а пам'ять починається заново.
    if (state.trip !== null || body.stun > 0 || (activity?.kind === "use" && activity.inside === true)) {
      this.reset();
      return null;
    }
    const dx = body.x - this.x;
    const dy = body.y - this.y;
    this.x = body.x;
    this.y = body.y;
    const seconds = Math.min(dtMs, MAX_DT_MS) / 1000;
    const distance = Math.hypot(dx, dy);
    if (!this.known || !(seconds > 0) || distance > TELEPORT_TILES || distance / seconds > MAX_TILES_PER_SECOND) {
      this.known = true;
      this.vx = 0;
      this.vy = 0;
      this.phase = START_PHASE;
      return null;
    }
    const k = 1 - Math.exp((-seconds * 1000) / SMOOTH_MS);
    this.vx += (dx / seconds - this.vx) * k;
    this.vy += (dy / seconds - this.vy) * k;
    if (Math.hypot(this.vx, this.vy) < MIN_TILES_PER_SECOND) {
      this.phase = START_PHASE;
      return null;
    }
    const gait = gaitOf(state);
    const info = personGait(gait);
    // Швидкість на екрані, як її бачить вигляд: x − y і x + y клітинок — по півплитки.
    const sx = ((this.vx - this.vy) * ISO_TILE.width) / 2;
    const sy = ((this.vx + this.vy) * ISO_TILE.height) / 2;
    const rate = personGaitSpeed(gait, sx, sy);
    const from = this.phase;
    const to = from + Math.min(0.5, (rate * seconds * 1000 * info.cycles) / info.ms);
    this.phase = to - Math.floor(to);
    if (!crossed(from, to, info.near[0]) && !crossed(from, to, info.far[0])) return null;
    this.step.floor = floorAt(body);
    this.step.gait = gait;
    return this.step;
  }
}

/** Чи фаза `from → to` (`to` може бути більшою за 1) перейшла через точку циклу `at`. */
function crossed(from: number, to: number, at: number): boolean {
  return Math.floor(to - at) > Math.floor(from - at);
}
