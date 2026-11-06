// Настільний годинник на панелі (§8.4): корпус із тьмяними сегментами й цифри, що світяться поверх них. Кадри — `ui/hud/clock`
// і `ui/hud/clock-digit`, де стоять цифри — точки запису `ui/hud/clock`.

import type Phaser from "phaser";

import { addArt, setArt } from "./art/atlas";
import { CLOCK_BLINK_MS, CLOCK_DIGIT_SLOTS, clockDigitStates, HUD_ART } from "./iso/hudlook";
import { uiEntry } from "./iso/uilook";

export class DeskClock {
  /** Корпус і цифри: кладуть цілком, усередині все стоїть на точках запису. */
  readonly root: Phaser.GameObjects.Container;
  private readonly digits: Phaser.GameObjects.Image[];
  private readonly colon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    const { points, pivot } = uiEntry(HUD_ART.clock);
    const digit = (slot: string, state: string): Phaser.GameObjects.Image => {
      const at = points?.[slot];
      if (!at) throw new Error(`немає точки «${slot}» у записі ${HUD_ART.clock}`);
      return addArt(scene, null, HUD_ART.clockDigit, { state }).setPosition(at.x - pivot.x, at.y - pivot.y);
    };
    this.digits = CLOCK_DIGIT_SLOTS.map((slot) => digit(slot, "d0"));
    this.colon = digit("colon", "colon");
    this.root = scene.add.container(0, 0, [addArt(scene, null, HUD_ART.clock), ...this.digits, this.colon]);
  }

  /** Показати час «ГГ:ХХ»: кадр міняється лише в цифри, що змінилася (`setArt`). */
  show(clock: string): void {
    clockDigitStates(clock).forEach((state, i) => {
      const digit = this.digits[i];
      if (digit) setArt(digit, HUD_ART.clockDigit, { state });
    });
  }

  /** Двокрапка блимає за часом сцени, мс. */
  blink(time: number): void {
    this.colon.setVisible(Math.floor(time / CLOCK_BLINK_MS) % 2 === 0);
  }
}
