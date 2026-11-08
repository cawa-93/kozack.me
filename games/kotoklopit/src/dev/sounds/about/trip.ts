// Звуки поїздки (`src/audio/sfx/groups/trip.ts`).

import type { AboutGroup } from "../about";

export const ABOUT: AboutGroup = {
  title: "Поїздка",
  sections: [
    {
      title: "Машина",
      sounds: {
        "car-door": ["Двері авто", "Персонаж сів у машину на виїзді; на місці — вийшов, одразу за ручником."],
        handbrake: ["Ручне гальмо", "Персонаж приїхав на місце й тягне ручник."],
      },
    },
  ],
};
