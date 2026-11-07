// Що прибрав пилосос у руках (§8.7, «Пилосос у руках»): з подій `vacuumed` від персонажа — місця жмутів шерсті й пилу та id
// безладу. Лише це вигляд втягує в щітку (`iso/floor.ts`, `SUCK`); прибране роботом-пилососом зникає, як і без пилососа в
// руках, хоч би де він їхав (рецензія пилососа 2026-11-02: поки пилосос у руках, у щітку летіло все, що зникло, — і жмути, які
// робот о 12:00 прибрав через пів квартири). Без Phaser: перевіряє `tests/vacuum.test.ts`.

import type { GameEvent } from "../../sim/events";

export class PersonSwept {
  /** Місця жмутів шерсті (`FUR_SPOTS`). */
  readonly tufts = new Set<number>();
  /** Місця пилу (`DUST_SPOTS`). */
  readonly dust = new Set<number>();
  /** Id безладу. */
  readonly messes = new Set<number>();

  /** Подія симуляції: прибране пилососом у руках — запам'ятати до наступного кадру вигляду. */
  onEvent(event: GameEvent): void {
    if (event.type !== "vacuumed" || event.by !== "person") return;
    for (const index of event.tufts) this.tufts.add(index);
    for (const index of event.dust) this.dust.add(index);
    for (const mess of event.messes) this.messes.add(mess.id);
  }

  /** Кадр вигляду розібрав, що зникло: забути (`iso/floor.ts`), як і на новий день. */
  clear(): void {
    this.tufts.clear();
    this.dust.clear();
    this.messes.clear();
  }
}
