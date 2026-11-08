// Група «дім» (§11.4а): техніка, речі, двері й гості — що якій події звучить, `audio/SOUND.md`, «Хто що озвучує», рядок `home`.

import { Chores, type ChorePlan } from "../chores";
import { homeCues } from "../home/cues";
import { homeLoops } from "../home/loops";
import { HOME_SOUNDS } from "../home/sounds";
import type { SoundGroup } from "../types";

/** Перегризений дріт замотують стрічкою, поки лагодять (§9.12, «Гризіння»): смуга за смугою, а не раз по завершенні. */
const WIRE: ChorePlan = { stroke: [{ sound: "wire", at: "computer" }], everyMs: [1800, 2600] };
const chores = new Chores((_state, activity) => (activity.target === "computer" ? WIRE : null));

export const group: SoundGroup = {
  id: "home",
  sounds: HOME_SOUNDS,
  onEvent: homeCues,
  loops: homeLoops,
  tick: (state, dtMs) => chores.tick(state, dtMs),
  reset: () => chores.reset(),
};
