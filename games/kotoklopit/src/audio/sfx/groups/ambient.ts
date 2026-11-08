// Тло квартири (§11.4а, «Тло»; `SOUND_PLAN.md`, «Ефекти», рядок `ambient`).

import { AMBIENT_SOUNDS } from "../ambient/sounds";
import type { SoundGroup } from "../types";

export const group: SoundGroup = {
  id: "ambient",
  sounds: AMBIENT_SOUNDS,
};
