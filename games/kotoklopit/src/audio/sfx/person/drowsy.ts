// «Сонливість» уголос (§8.8, §11.4а): сонний вдих-видих, щойно вона почалася, і зрідка, поки триває. Подією сим її не
// повідомляє — це межа годинника (`isDrowsy`), тож групу питають щокадру.

import { isDrowsy } from "../../../sim/sleep";
import type { GameState } from "../../../sim/types";

/** Як часто повторювати, поки персонаж сонний і не лягає, мс реального часу: «Сонливість» триває близько хвилини. */
export const DROWSY_REPEAT_MS = 25_000;

export class Drowsiness {
  /** Чи була «Сонливість» минулого кадру; null — ще не знаємо (новий показ дня): тоді вона не «почалася», а вже була. */
  private was: boolean | null = null;
  private since = 0;

  reset(): void {
    this.was = null;
    this.since = 0;
  }

  /** Кадр: чи позіхнути зараз. */
  update(state: GameState, dtMs: number): boolean {
    const now = isDrowsy(state);
    const was = this.was;
    this.was = now;
    if (!now) {
      this.since = 0;
      return false;
    }
    if (was === false) {
      this.since = 0;
      return !hidden(state);
    }
    this.since += dtMs;
    if (this.since < DROWSY_REPEAT_MS || hidden(state)) return false;
    this.since = 0;
    return true;
  }
}

/** У душовій кабіні й у поїздці персонажа не видно й не чути. */
function hidden(state: GameState): boolean {
  const activity = state.character.activity;
  return state.trip !== null || (activity?.kind === "use" && activity.inside === true);
}
