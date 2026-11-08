// Живий портрет кота для DOM-картки (§9.7): ті самі частини скелета, що в грі. Кіт сидить, а між паузами робить легкий рух
// (`catportraitmoves.ts`). Без Phaser і DOM: перевіряє `tests/catintro.test.ts`.

import type { Cat } from "../../sim/types";
import type { PortraitPart } from "../art/compose";
import { artEntry } from "../art/manifest";
import { CAT_ANIMS } from "../rig/anims";
import { CAT_FAR_SLOTS } from "../rig/defs/cat";
import { Rig } from "../rig/rigcore";
import { composeCatAnim, type FaceFrames } from "./catanim";
import { ISO_CAT_FIT, ISO_CAT_RIG, isoCatProportions, isoCatSkin } from "./catrig";
import { pickMove, pickPause, type PortraitMove } from "./catportraitmoves";

const FAR: ReadonlySet<string> = new Set<string>(CAT_FAR_SLOTS);
const FACE: FaceFrames = { eyes: "open", mouth: "closed", ears: "up" };
/** Скільки мс поза плавно переходить у рух і назад. */
const BLEND_MS = 160;

type PortraitRig = Rig<string, string, string>;
type Anim = Parameters<PortraitRig["play"]>[0];

const animOf = (move: PortraitMove | null): Anim => composeCatAnim(CAT_ANIMS.sit, move, FACE) as Anim;

/** Кіт у картці: `parts(now)` дає позу в мить `now`, мс, і сам вирішує, коли зробити наступний рух. */
export class CatPoser {
  private readonly rig: PortraitRig;
  private move: PortraitMove | null = null;
  private last: PortraitMove | null = null;
  /** Коли закінчиться поточний рух чи почнеться наступний, мс. */
  private until: number;

  constructor(
    cat: Cat,
    private readonly random: () => number = Math.random,
  ) {
    this.rig = new Rig(ISO_CAT_RIG, {
      fit: ISO_CAT_FIT,
      lookup: artEntry,
      skin: isoCatSkin(cat.shape, false),
      proportions: isoCatProportions(cat),
      facing: { view: "front", flip: false },
    }) as unknown as PortraitRig;
    this.rig.play(animOf(null), 0, { blend: 0 });
    this.until = pickPause(random);
  }

  /** Рух, що триває зараз; null — кіт просто сидить. */
  get moving(): PortraitMove | null {
    return this.move;
  }

  parts(now: number): PortraitPart[] {
    if (now >= this.until) this.next(now);
    this.rig.evaluate(now);
    const parts: PortraitPart[] = [];
    for (const item of this.rig.order) {
      if (item.kind !== "slot") continue;
      const pose = this.rig.slots[item.index];
      if (!pose || !pose.visible || pose.art === null) continue;
      parts.push({
        id: pose.art,
        state: pose.state,
        view: "front",
        x: pose.x,
        y: pose.y,
        rot: pose.rot,
        scaleX: pose.sx,
        scaleY: pose.sy,
        ...(FAR.has(pose.id) ? { far: true } : {}),
      });
    }
    return parts;
  }

  /** Рух закінчився — пауза; пауза закінчилася — наступний рух. */
  private next(now: number): void {
    if (this.move) {
      this.move = null;
      this.until = now + pickPause(this.random);
      this.rig.play(animOf(null), now, { blend: BLEND_MS });
      return;
    }
    const move = pickMove(this.random, this.last);
    this.move = move;
    this.last = move;
    this.until = now + move.duration;
    this.rig.play(animOf(move), now, { blend: BLEND_MS });
  }
}

/** Частини кота в спокої: перший кадр портрета. */
export function catPortraitParts(cat: Cat): PortraitPart[] {
  return new CatPoser(cat).parts(0);
}
