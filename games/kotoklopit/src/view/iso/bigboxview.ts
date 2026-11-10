// Велика коробка у вітальні (§4.1): кадр коробки — коробка реєстру глибини (на ній лежить кіт), передні стінки — точка на ній
// поверх кота (`bigboxlook.ts`). Частина квартири (`IsoApartmentView`): зображення створено раз, далі лише ховаються й
// показуються, а коли гра ставить коробку не на її місце (§8.7, «Що ставить гра»), — переїжджають туди.

import type Phaser from "phaser";

import { hasBigBox } from "../../sim/home";
import type { GameState } from "../../sim/types";
import { addArt } from "../art/atlas";
import type { PartContext } from "../world/context";
import { ISO } from "../world/projection";
import { BIG_BOX_AT, BIG_BOX_FOOTPRINT, BIG_BOX_FRAME, BIG_BOX_FRONT, BIG_BOX_FRONT_FRAME, BIG_BOX_ID, bigBoxAt, bigBoxFootprint, bigBoxFront } from "./bigboxlook";
import type { IsoBoxHandle, IsoDepth, IsoPointHandle } from "./depth";
import { placeChanged } from "./geometry";
import type { IsoFrame } from "./looks";

export class IsoBigBoxView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly front: Phaser.GameObjects.Image;
  private readonly box: IsoBoxHandle;
  private readonly frontPoint: IsoPointHandle;
  private shown = false;
  /** Де коробку бачили востаннє (`placeChanged`): на своєму місці. */
  private readonly seen = { x: Number.NaN, y: Number.NaN };

  constructor(ctx: PartContext, depth: IsoDepth) {
    const at = ISO.toScreen(BIG_BOX_AT);
    const art = (frame: IsoFrame): Phaser.GameObjects.Image =>
      addArt(ctx.scene, ctx.layer, frame.id, { state: frame.state }).setPosition(at.x, at.y).setVisible(false);
    const body = art(BIG_BOX_FRAME);
    const front = art(BIG_BOX_FRONT_FRAME);
    this.body = body;
    this.front = front;
    this.box = depth.addBox({ ...BIG_BOX_FOOTPRINT, id: BIG_BOX_ID }, (d) => body.setDepth(d));
    this.box.setActive(false);
    this.frontPoint = depth.addPoint((d) => front.setDepth(d), { half: BIG_BOX_FRONT.half });
  }

  update(state: GameState): void {
    const shown = hasBigBox(state);
    const moved = placeChanged(state, "big-box", this.seen);
    if (moved) {
      const at = ISO.toScreen(bigBoxAt(state));
      this.body.setPosition(at.x, at.y);
      this.front.setPosition(at.x, at.y);
      this.box.move(bigBoxFootprint(state));
    }
    if (shown === this.shown && !moved) return;
    this.shown = shown;
    this.body.setVisible(shown);
    this.front.setVisible(shown);
    this.box.setActive(shown);
    const front = bigBoxFront(state);
    if (shown) this.frontPoint.place(front.x, front.y, BIG_BOX_ID);
    else this.frontPoint.hide();
  }

  destroy(): void {
    this.box.remove();
    this.frontPoint.remove();
    this.body.destroy();
    this.front.destroy();
  }
}
