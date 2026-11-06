// Відривний календарик на панелі (§8.4): тиждень у шапці, день тижня на аркуші. Кадр — `ui/hud/calendar`, де стоять написи — його точки.

import type Phaser from "phaser";

import { addArt } from "./art/atlas";
import { CALENDAR_TEXT, HUD_ART } from "./iso/hudlook";
import { UI_TEXT, uiEntry } from "./iso/uilook";

type Label = (size: number, color: string) => Phaser.GameObjects.Text;

export class DeskCalendar {
  /** Кадр із написами: кладуть цілком, усередині все стоїть на точках запису. */
  readonly root: Phaser.GameObjects.Container;
  private readonly week: Phaser.GameObjects.Text;
  private readonly day: Phaser.GameObjects.Text;

  /** `label` створює напис панелі: його роздільність далі веде сама панель. */
  constructor(scene: Phaser.Scene, label: Label) {
    const { points, pivot } = uiEntry(HUD_ART.calendar);
    const place = (made: Phaser.GameObjects.Text, slot: string): Phaser.GameObjects.Text => {
      const at = points?.[slot];
      if (!at) throw new Error(`немає точки «${slot}» у записі ${HUD_ART.calendar}`);
      return made.setOrigin(0.5).setPosition(at.x - pivot.x, at.y - pivot.y);
    };
    this.week = place(label(CALENDAR_TEXT.week, UI_TEXT.main), "week");
    // На папері обвідка панелі не потрібна: чорнило й так читається.
    this.day = place(label(CALENDAR_TEXT.day, UI_TEXT.onPaper).setStroke(UI_TEXT.onPaper, 0), "day");
    this.root = scene.add.container(0, 0, [addArt(scene, null, HUD_ART.calendar), this.week, this.day]);
  }

  /** Показати тиждень і день; довгий напис стискається вшир, щоб лишитися на аркуші. */
  show(week: string, day: string): void {
    for (const [text, value] of [[this.week, week], [this.day, day]] as const) {
      text.setText(value);
      text.setScale(Math.min(1, CALENDAR_TEXT.width / Math.max(1, text.width)), 1);
    }
  }
}
