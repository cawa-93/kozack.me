// Шум ефіру радіо (`src/audio/sfx/groups/radio.ts`; грає `src/audio/radio/broadcast.ts`).

import type { AboutGroup } from "../about";

export const ABOUT: AboutGroup = {
  title: "Радіо",
  sections: [
    {
      title: "Ефір",
      sounds: {
        static: ["Шум ефіру (петля)", "Між станціями: поки станція настроюється чи її шматок ще не завантажився, радіо шумить."],
      },
    },
  ],
};
