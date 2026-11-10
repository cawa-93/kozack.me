// Шина звуку (§11.4а): світ — квартира з відстанню й приглушенням, інтерфейс — картки й поїздка, музика — під гучністю радіо.

import type { SoundDef } from "./types";

export type SoundBus = "world" | "ui" | "music";

export function soundBus(def: Pick<SoundDef, "ui" | "music">): SoundBus {
  return def.music ? "music" : def.ui ? "ui" : "world";
}
