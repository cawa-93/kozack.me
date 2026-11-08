// Гудки в гонці (§8.5): машина позаду пригальмувала за персонажем (`heldBehind`) — сигналить одразу, а тягнеться за ним і далі —
// знову, не частіше ніж раз на `HORN.repeatMs`. Кличе сцена гонки щокадру: день у поїздці спить, тож `tick` групи тут не працює.

import { heldBehind } from "../../../sim/race";
import type { Race, RaceCar } from "../../../sim/types";

/** Як часто та сама машина сигналить, поки тягнеться за персонажем, мс реального часу. */
export const HORN = { repeatMs: 4000 } as const;

export class Horns {
  /** Час гонки, мс: лише поки вона йде (пауза його зупиняє). */
  private clock = 0;
  /** Коли кожна машина сигналила востаннє. */
  private readonly last = new WeakMap<RaceCar, number>();

  /** Кадр гонки: чи сигналить зараз якась машина. */
  tick(race: Race, dtMs: number): boolean {
    this.clock += dtMs;
    let honk = false;
    for (const car of race.cars) {
      if (!heldBehind(race, car)) continue;
      const last = this.last.get(car);
      if (last !== undefined && this.clock - last < HORN.repeatMs) continue;
      this.last.set(car, this.clock);
      honk = true;
    }
    return honk;
  }
}
