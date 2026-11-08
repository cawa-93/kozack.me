// Що звучить на події й моменти групи `person` (`SOUND_PLAN.md`, «Хто що озвучує»). Відповіді — сталі масиви: подій багато,
// а нових об'єктів на кожну не треба. Голос персонажа — без слів, за звертанням (§5.1): «він» і «вона».

import type { GameEvent } from "../../../sim/events";
import type { Address, GameState, MessKind } from "../../../sim/types";
import type { Cue, SceneMoment } from "../types";

const NONE: readonly Cue[] = [];

type Voiced = Readonly<Record<Address, readonly Cue[]>>;

/** Те саме для обох звертань, лише голос свій. */
function voiced(make: (voice: Address) => readonly Cue[]): Voiced {
  return { he: make("he"), she: make("she") };
}

const at = "person";

const DASH: readonly Cue[] = [{ sound: "dash", at }];
// Збили з ніг: короткий зойк, удар тіла й підлоги.
const FALL = voiced((voice) => [
  { sound: `gasp-${voice}`, at },
  { sound: "fall", at, delayMs: 90 },
  { sound: "knock", at, delayMs: 110 },
]);
// Посковзнувся: ноги їдуть, потім падіння.
const SLIP = voiced((voice) => [
  { sound: "slide", at, rate: 0.8 },
  { sound: `gasp-${voice}`, at, delayMs: 60 },
  { sound: "fall", at, delayMs: 230 },
  { sound: "knock", at, delayMs: 250 },
]);
// Поїв — тарілку відставили.
const ATE: readonly Cue[] = [{ sound: "plate", at }];
const SHOWERED: readonly Cue[] = [{ sound: "shower-off", at: "shower" }];
const LITTER: readonly Cue[] = [
  { sound: "scoop", at },
  { sound: "litter-pour", at, delayMs: 650 },
];
const WIPE: readonly Cue[] = [{ sound: "wipe", at }];
const SWEEP: readonly Cue[] = [{ sound: "sweep", at }];
const FED: readonly Cue[] = [{ sound: "kibble", at }];
const WATERED: readonly Cue[] = [{ sound: "water", at }];
const TREAT: readonly Cue[] = [{ sound: "treat", at }];
const COLLAR: readonly Cue[] = [
  { sound: "buckle", at },
  { sound: "bell", at, delayMs: 120 },
];
const PILLS: readonly Cue[] = [{ sound: "pills", at }];
const MEDS: readonly Cue[] = [
  { sound: "pills", at, gain: 0.8 },
  { sound: "swallow", at, delayMs: 650 },
];
const SNEEZE = voiced((voice) => [{ sound: `sneeze-${voice}`, at }]);
const GASP = voiced((voice) => [{ sound: `gasp-${voice}`, at }]);
const PANT = voiced((voice) => [{ sound: `pant-${voice}`, at }]);
export const YAWN = voiced((voice) => [{ sound: `yawn-${voice}`, at }]);
const FALL_ASLEEP = voiced((voice) => [
  { sound: "blanket", at },
  { sound: `yawn-${voice}`, at, delayMs: 400 },
]);
const COLLAPSE = voiced((voice) => [
  { sound: "fall", at, gain: 1.15 },
  { sound: "knock", at, delayMs: 20 },
  { sound: `sigh-${voice}`, at, delayMs: 550 },
]);

/** Мокрий безлад витирають, сухий — підмітають. */
const WET: Readonly<Record<MessKind, boolean>> = {
  surprise: true,
  vomit: true,
  hairball: true,
  mark: true,
  pee: true,
  puddle: true,
  litter: false,
  broken: false,
  fur: false,
  paper: false,
  garbage: false,
};

/** Події групи: решта — чужі (`SOUND_PLAN.md`). */
export function personEventCues(event: GameEvent, state: GameState): readonly Cue[] {
  const voice = state.character.address;
  switch (event.type) {
    case "dash":
      return DASH;
    case "tripped":
    case "knocked-down":
    case "ambushed":
      return FALL[voice];
    case "slipped":
      return SLIP[voice];
    case "ate":
      return ATE;
    case "showered":
      return SHOWERED;
    case "cleaned":
      return event.what === "litter" ? LITTER : WET[event.what] ? WIPE : SWEEP;
    case "fed":
      return FED;
    case "watered":
      return WATERED;
    case "treat":
      return TREAT;
    case "collar":
      return COLLAR;
    case "medicine":
      return event.medicine === "pills" ? PILLS : NONE;
    case "person-ill":
      return event.illness === "cold" ? SNEEZE[voice] : event.illness === "injury" ? GASP[voice] : PANT[voice];
    case "person-meds":
      return MEDS;
    default:
      return NONE;
  }
}

/** Засинання в ліжку й падіння без сил; ранок і кінець гри — не цієї групи. */
export function personSceneCues(moment: SceneMoment, state: GameState): readonly Cue[] {
  const voice = state.character.address;
  if (moment === "fall-asleep") return FALL_ASLEEP[voice];
  if (moment === "collapse") return COLLAPSE[voice];
  return NONE;
}
