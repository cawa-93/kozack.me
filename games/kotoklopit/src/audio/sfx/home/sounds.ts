// Звуки групи «дім» (§11.4а, `SOUND_PLAN.md`, «Ефекти»): назва → файли з `audio/sfx/home/`. Разові вирівняно за піком, петлі —
// за RMS, тож гучність між ними підганяє `gain`: петлі техніки тихіші за разові, пилосос гучний (§9.12 — гучний звук на всю
// квартиру), часті звуки — з розкидом висоти, щоб не набридали.

import type { SoundDef } from "../types";

const variants = (name: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

export const HOME_SOUNDS = {
  // Речі кухні (`took`, `put`): холодильник — дверцята, шафки — дверцята, страва — тихо.
  "fridge-open": { files: variants("fridge-open", 2), gain: 0.5, pitch: 0.04 },
  "fridge-close": { files: variants("fridge-close", 2), gain: 0.55, pitch: 0.04 },
  cabinet: { files: variants("cabinet", 3), gain: 0.5, pitch: 0.05 },
  "dish-pick": { files: variants("dish-pick", 3), gain: 0.3, pitch: 0.05 },
  "dish-put": { files: variants("dish-put", 2), gain: 0.4, pitch: 0.05 },
  // Речі котячого кутка переставляють (`thing-moved`): узяли — тихо, поставили — глухий стук.
  "thing-take": { files: variants("dish-pick", 3), gain: 0.3, pitch: 0.06 },
  "thing-put": { files: ["parcel"], gain: 0.4, pitch: 0.06 },
  trash: { files: ["trash"], gain: 0.5, pitch: 0.04 },
  discard: { files: ["discard"], gain: 0.45, pitch: 0.04 },
  // Запаси й пакунки.
  unpack: { files: variants("unpack", 2), gain: 0.55, pitch: 0.04 },
  parcel: { files: ["parcel"], gain: 0.55 },
  // Запаси сідають у сховища один за одним: тихо, коротка пауза.
  land: { files: ["parcel"], gain: 0.2, pitch: 0.06, cooldownMs: 150 },
  // Двері й гості. Кілька пакунків за раз дзвонять одним дзвінком.
  doorbell: { files: ["doorbell"], gain: 0.8, cooldownMs: 1500, voices: 1 },
  door: { files: ["door"], gain: 0.55 },
  lock: { files: ["lock"], gain: 0.45 },
  knock: { files: ["knock"], gain: 0.65 },
  guests: { files: ["guests"], gain: 0.4, voices: 1 },
  papers: { files: ["papers"], gain: 0.5 },
  "vet-case": { files: ["vet-case"], gain: 0.5 },
  bucket: { files: ["bucket"], gain: 0.45 },
  fireworks: { files: ["fireworks"], gain: 0.55, voices: 1 },
  carrier: { files: ["carrier"], gain: 0.55 },
  // Плита.
  timer: { files: ["timer"], gain: 0.65 },
  // Шипіння тихіше за сплеск на початку, а пік вирівняно саме за ним — тож на повну.
  burnt: { files: ["burnt"], gain: 1 },
  "stove-loop": { files: ["stove-loop"], gain: 0.3, loop: true },
  // Прання.
  "washer-close": { files: ["washer-close"], gain: 0.5 },
  "washer-open": { files: ["washer-open"], gain: 0.5 },
  "spin-start": { files: ["spin-start"], gain: 0.6 },
  "washer-done": { files: ["washer-done"], gain: 0.45 },
  hung: { files: ["hung"], gain: 0.45, pitch: 0.04 },
  "wash-loop": { files: ["wash-loop"], gain: 0.33, loop: true },
  "spin-loop": { files: ["spin-loop"], gain: 0.6, loop: true },
  // Пилосос у руках і робот.
  "vacuum-on": { files: ["vacuum-on"], gain: 0.85 },
  "vacuum-off": { files: ["vacuum-off"], gain: 0.75 },
  "vacuum-loop": { files: ["vacuum-loop"], gain: 0.85, loop: true },
  "robot-loop": { files: ["robot-loop"], gain: 0.3, loop: true },
  "beep-high": { files: ["beep-high"], gain: 0.35 },
  "beep-low": { files: ["beep-low"], gain: 0.35 },
  // Поломки, дріт, мухи.
  broke: { files: variants("broke", 2), gain: 0.75, pitch: 0.05, cooldownMs: 200 },
  wire: { files: ["wire"], gain: 0.5 },
  "flies-loop": { files: ["flies-loop"], gain: 0.22, loop: true },
} satisfies Record<string, SoundDef>;

export type HomeSound = keyof typeof HOME_SOUNDS;
