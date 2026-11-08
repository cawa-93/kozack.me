// Шум ефіру радіо (§8.10; `audio/SOUND.md`, «Хто що озвучує», рядок `radio`). Грає його сам ланцюг станції (`radio/broadcast.ts`) на
// шині музики, з переходами від музики й до неї; група лише описує файл, щоб він був у каталозі звуків і в титрах.

import type { SoundGroup } from "../types";

export const group: SoundGroup = {
  id: "radio",
  sounds: {
    static: { files: ["static"], loop: true },
  },
};
