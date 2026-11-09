// Велика коробка у вітальні (§4.1): кадр коробки — коробка реєстру глибини (на ній лежить кіт), передні стінки — точка на ній
// поверх кота (`bigboxlook.ts`). Частина квартири (`IsoApartmentView`): зображення створено раз, далі лише ховаються й
// показуються.

import type Phaser from "phaser";

import { hasBigBox } from "../../sim/home";
import type { GameState } from "../../sim/types";
import { addArt } from "../art/atlas";
import type { PartContext } from "../world/context";
import { ISO } from "../world/projection";
import { BIG_BOX_AT, BIG_BOX_FOOTPRINT, BIG_BOX_FRAME, BIG_BOX_FRONT, BIG_BOX_FRONT_FRAME, BIG_BOX_ID } from "./bigboxlook";
import type { IsoBoxHandle, IsoDepth, IsoPointHandle } from "./depth";
import type { IsoFrame } from "./looks";

export class IsoBigBoxView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly front: Phaser.GameObjects.Image;
  private readonly box: IsoBoxHandle;
  private readonly frontPoint: IsoPointHandle;
  private shown = false;

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
    if (shown === this.shown) return;
    this.shown = shown;
    this.body.setVisible(shown);
    this.front.setVisible(shown);
    this.box.setActive(shown);
    if (shown) this.frontPoint.place(BIG_BOX_FRONT.x, BIG_BOX_FRONT.y, BIG_BOX_ID);
    else this.frontPoint.hide();
  }

  destroy(): void {
    this.box.remove();
    this.frontPoint.remove();
    this.body.destroy();
    this.front.destroy();
  }
}
