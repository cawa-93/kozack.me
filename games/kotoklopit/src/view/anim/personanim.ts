// Що грає персонаж нового вигляду (крок 16, GRAPHICS_PLAN.md, «Вибір анімації»): основна анімація за справою
// (`character.activity`), рухом, ривком, оглушенням, хворобами й засинанням; накладка рук за тим, що в руках (`held`); ракурс
// за `body.facing`. Разові — від подій, які сцена вже отримує (`personEventAnim`): узяв, поклав, насипав, вкусили,
// спіткнувся… Плита готує сама (§8.7), тож готування — лише «поклав» і «взяв». Без Phaser.

import { petOver } from "../../sim/actions";
import type { GameEvent } from "../../sim/events";
import { cleaningTool } from "../../sim/household";
import { isIll } from "../../sim/illness";
import { collapseMinute, isDrowsy } from "../../sim/sleep";
import type { GameState, Item } from "../../sim/types";
import { inMeeting } from "../../sim/work";
import type { ArtView } from "../art/types";
import type { RigFacing } from "../rig/types";
import { personFacing } from "./catfacing";
import { PERSON_BY_PROGRESS, PERSON_ONE_SHOT_MS, PERSON_OWN_ARMS, type PersonAnimId, type PersonOneShotId } from "./ids";

/** Що сцена знає про персонажа, крім стану гри (`WorldFrame`), і що вигляд пам'ятає з минулого кадру. */
export interface PersonLocal {
  /** Персонаж іде (`WorldFrame.moving`): кнопка руху натиснута, і він не зайнятий справою й не оглушений. */
  moving: boolean;
  /** Засинання 0–1 (`WorldFrame.sleepiness`, §8.8). */
  sleepiness: number;
  /** Засинає, бо впав без сил, а не ліг у ліжко (§8.8); без поля — з часу (`collapseMinute`). */
  collapsed?: boolean;
  /** Ракурс минулого кадру: гістерезис, щоб не тремтів на межі. */
  prev?: RigFacing | null;
}

/**
 * Що в руках (§8.4) — що кріпиться в гніздо рук: кіт (`arms`), сира порція, готова й пригоріла страва, мамин судочок, совок
 * звичайного корму й корму для стерилізованих, вудочка (`held`, `rod`), вертикальний пилосос (`held`, щітка на підлозі
 * попереду; §8.7, рішення автора 2026-11-02, «Пилосос у руках»).
 */
export type HeldThing = "cat" | "raw" | "meal" | "burnt" | "mom-meal" | "scoop" | "sterile-scoop" | "rod" | "vacuum" | "thing";

/** Річ у руках як `HeldThing`; null — руки порожні. */
export function heldThing(item: Item | null): HeldThing | null {
  if (item === null) return null;
  switch (item.kind) {
    case "cat":
      return "cat";
    case "toy":
      return "rod";
    case "catfood":
      return item.sterile ? "sterile-scoop" : "scoop";
    case "meal":
      return item.mom === true ? "mom-meal" : "meal";
    case "raw":
    case "burnt":
    case "vacuum":
    case "thing":
      return item.kind;
  }
}

/** Параметри анімації персонажа. */
export interface PersonAnimParams {
  /** Швидкість відтворення: 1 — як намальовано. */
  speed: number;
  /** Поступ 0–1 для анімацій за поступом (`PERSON_BY_PROGRESS`: засинання); null — за годинником. */
  progress: number | null;
  /** Що в гнізді рук; null — порожні. */
  held: HeldThing | null;
  /** Наскільки заплющені очі 0–1: засинання, сонний увечері, виснажений (§8.8, §6.5). */
  eyes: number;
  /** Ціль справи (`activity.target`, `cat:<id>` пестощів і гри): біля чого персонаж і куди тягнеться рука; null — немає. */
  target: string | null;
  /** Персонажа не видно: у поїздці чи в душовій кабіні (§8.5, §8.7). */
  hidden: boolean;
  /** Чистого одягу немає (§8.7): плями на одязі й хвилі запаху. */
  dirty: boolean;
}

/** Що грати персонажу: основна анімація, накладка рук, ракурс, повтор і параметри. */
export interface PersonAnimChoice extends RigFacing {
  anim: PersonAnimId;
  /** Накладка рук (`PERSON_OVERLAYS`): несе річ чи тримає кота; null — руки від основної. */
  overlay: PersonAnimId | null;
  loop: boolean;
  params: PersonAnimParams;
}

/** Наскільки заплющені очі сонного ввечері й виснаженого (§8.8, §6.5). */
const DROWSY_EYES = 0.35;
const EXHAUSTED_EYES = 0.25;
/** Засинання ближче за це (ігрові хвилини) до межі падіння без сил — падіння (`DayScene`: зупиняється за 0,01 до межі). */
const COLLAPSE_NEAR = 0.05;

/** Хвилина доби (`state.minute` після півночі буває понад добу). */

/**
 * Тривала дія утриманням (§10) — яка анімація: їсть за столом, лоток, безлад, лагодить дріт, купає кота. Пилосос — не справа
 * біля речі, а річ у руках (рішення автора 2026-11-02, §8.7): з ним персонаж стоїть і ходить (накладка `holdVacuum`).
 */
function useAnim(target: string, bath: boolean): PersonAnimId {
  if (bath) return "bath";
  if (target.startsWith("item:")) return "litter";
  if (target.startsWith("mess:")) return "clean";
  if (target === "computer") return "fix";
  return "eat";
}

/**
 * Основна анімація персонажа (крок 16): у поїздці й у душі його не видно; засинає в ліжку чи падає без сил (за поступом);
 * оглушений чи зі збоєм керування — паморочиться; справа — робота (нарада), тривала дія, пестощі, вудочка; дзвонить мама —
 * телефон (з порожніми руками; з річчю чи котом у руках він їх тримає, а дзвінок показує бабл); іде — ривок, кульгає з
 * травмою, плететься виснажений; стоїть — хворий, виснажений чи просто стоїть. Накладка рук — за тим, що в руках, крім
 * анімацій, які самі ведуть руки (`PERSON_OWN_ARMS`: справи, вудочка — купаючи, кота тримає сама `bath`). `local` — що знає
 * сцена (`PersonLocal`).
 */
export function personAnim(state: GameState, local: PersonLocal): PersonAnimChoice {
  const character = state.character;
  const { body, activity } = character;
  const facing = personFacing(state, local.prev ?? null);
  const held = heldThing(character.held);
  const params: PersonAnimParams = {
    speed: 1,
    progress: null,
    held,
    eyes: local.sleepiness > 0 ? local.sleepiness : isDrowsy(state) ? DROWSY_EYES : isIll(state, "exhaustion") ? EXHAUSTED_EYES : 0,
    target: activity?.kind === "use" ? activity.target : activity?.kind === "pet" || activity?.kind === "play" ? `cat:${activity.cat}` : null,
    hidden: state.trip !== null || (activity?.kind === "use" && activity.inside === true && activity.bath !== true),
    dirty: state.home.clothes <= 0,
  };
  // Накладка рук: кіт на руках, пилосос (ближня рука на ручці, щітка на підлозі — `holdVacuum`), решта — несе перед собою.
  const tool: PersonAnimId = cleaningTool(state) === "vacuum" ? "holdVacuum" : "holdBroom";
  const overlay: PersonAnimId | null = held === "cat" ? "holdCat" : held === "vacuum" ? tool : held !== null ? "carry" : null;
  const choose = (anim: PersonAnimId, view: ArtView = facing.view, flip = facing.flip): PersonAnimChoice => ({
    anim,
    overlay: PERSON_OWN_ARMS.has(anim) ? null : overlay,
    view,
    flip,
    loop: !PERSON_BY_PROGRESS.has(anim) && !(anim in PERSON_ONE_SHOT_MS),
    params,
  });
  if (params.hidden) return choose("idle");
  if (local.sleepiness > 0) {
    params.progress = local.sleepiness;
    const collapsed = local.collapsed ?? collapseMinute(state) - state.minute <= COLLAPSE_NEAR;
    return choose(collapsed ? "collapse" : "fallAsleep");
  }
  if (body.stun > 0 || (body.glitch > 0 && local.moving)) return choose("dizzy");
  if (activity?.kind === "work") return choose(inMeeting(state) ? "meeting" : "work");
  if (activity?.kind === "use") return choose(useAnim(activity.target, activity.bath === true));
  if (activity?.kind === "pet" && !petOver(activity)) return choose("pet");
  if (activity?.kind === "play" && activity.done !== true) return choose("rod");
  // Телефон тримають біля вуха — коли руки вільні; з річчю чи котом у руках накладка тримає їх, а дзвінок видно з бабла.
  if (state.today.callPending === true && held === null) return choose("phone");
  if (local.moving) {
    if (body.dash > 0) return choose("dash");
    if (isIll(state, "injury")) return choose("limp");
    if (isIll(state, "exhaustion")) return choose("trudge");
    return choose("walk");
  }
  if (isIll(state, "exhaustion")) return choose("exhausted");
  if (isIll(state, "cold")) return choose("sick");
  return choose("idle");
}

/** Разова анімація персонажа: що й скільки мс. */
export interface PersonOneShot {
  anim: PersonOneShotId;
  ms: number;
}

const once = (anim: PersonOneShotId): PersonOneShot => ({ anim, ms: PERSON_ONE_SHOT_MS[anim] });

/**
 * Разова анімація персонажа від події (крок 16), null — подія не про його рух. Узяв і поклав — холодильник, плита, стіл,
 * шафка з кормом, судочки (плита готує сама, §8.7); викинув у смітник; насипав корм, налив води, спорожнив годівницю;
 * відкрив кран котові; ліки собі; перев'язався (пластир чи бинт); ліки й нашийник коту на руках (`tend`: кіт лишається на руках); дав котові м'яту (він
 * зістрибує з рук — «опускає кота»); пральна машина (запустив, виймає білизну, вигнав кота з барабана); розпакував ящики;
 * двері (пакунки, гостинці мами, кіт зі сходів); узяв кота на руки й опустив; вкусили й подряпали; спіткнувся об кота, збив
 * кіт, вистрибнув із засідки; посковзнувся; відмова.
 */
export function personEventAnim(event: GameEvent): PersonOneShot | null {
  switch (event.type) {
    case "took":
      return once("take");
    case "put":
      return once("put");
    case "thing-moved":
      return once(event.stage === "taken" ? "take" : "put");
    case "cat-seated":
    case "carrier-opened":
      return once("put");
    case "trashed":
      return once("trash");
    case "fed":
    case "watered":
    case "feeder-emptied":
      return once("bowl");
    case "tap-opened":
      return once("tap");
    case "person-meds":
      return once("meds");
    case "person-dressing":
      return once("dress");
    case "medicine":
    case "medicine-spat":
    case "collar":
      return once("tend");
    case "laundry":
      return event.stage === "started" || event.stage === "hung" || event.stage === "cat" ? once("washer") : null;
    case "unpacked":
      return once("unpack");
    case "received":
      return once("door");
    case "cat-returned":
      return event.caught ? once("door") : null;
    case "modifier":
      // Мамині гостинці під дверима персонаж заносить сам (§4.1).
      return event.kind === "mom-food" && event.value === 0 ? once("door") : null;
    case "picked-up":
      return once("pickUp");
    case "put-down":
    // Котяча м'ята — котові на руках, і він зістрибує (§9.12): руки з пози «тримає кота» опускаються, як «опускає кота».
    case "catnip":
      return once("putDown");
    case "bite":
    case "clawed":
      return once("bitten");
    case "tripped":
    case "knocked-down":
    case "ambushed":
      return once("trip");
    case "slipped":
      return once("slip");
    case "refused":
      return once("refuse");
    default:
      return null;
  }
}
