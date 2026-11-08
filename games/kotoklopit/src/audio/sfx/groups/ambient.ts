// Тло квартири (§11.4а, «Тло»; `audio/SOUND.md`, «Хто що озвучує», рядок `ambient`): петлі вулиці, вечірки й холодильника (`loops`),
// ремонт уривками (`tick`). Подій симуляції не озвучує. Сон і поїздка й так беззвучні для квартири (режим сцени).

import { AmbientLoops } from "../ambient/loops";
import { Repairs } from "../ambient/repairs";
import { AMBIENT_SOUNDS } from "../ambient/sounds";
import type { SoundGroup } from "../types";

const loops = new AmbientLoops();
const repairs = new Repairs();

export const group: SoundGroup = {
  id: "ambient",
  sounds: AMBIENT_SOUNDS,
  loops: (state) => loops.read(state),
  tick: (state, dtMs) => repairs.tick(state, dtMs),
  reset: () => repairs.reset(),
};
