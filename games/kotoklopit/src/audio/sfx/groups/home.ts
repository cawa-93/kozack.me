// Група «дім» (§11.4а): техніка, речі, двері й гості — що якій події звучить, `SOUND_PLAN.md`, «Ефекти», рядок `home`.

import { homeCues } from "../home/cues";
import { homeLoops } from "../home/loops";
import { HOME_SOUNDS } from "../home/sounds";
import type { SoundGroup } from "../types";

export const group: SoundGroup = {
  id: "home",
  sounds: HOME_SOUNDS,
  onEvent: homeCues,
  loops: homeLoops,
};
