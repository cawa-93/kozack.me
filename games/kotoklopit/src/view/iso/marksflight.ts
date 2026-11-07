// Політ запасів у ізометричному світі (крок 16, T4): іконка запасу летить дугою з ящиків біля входу чи з годівниці у своє
// сховище (§6.4, §9.12). Те саме, що `DayScene.flyIcon` старого вигляду, у манері нової графіки: дуга росте з відстанню
// (квартира в ізометрії вдвічі більша, і стала дуга була б пласкою), іконка вискакує з ящика, хитається в польоті, як кинута
// річ, і пірнає у сховище. Шлях, масштаб і нахил — `markslayout.ts`.

import type Phaser from "phaser";

import { iconTexture, type IconName } from "../iconnames";
import { WORLD_LAYERS } from "../world/layers";
import type { Point } from "../world/part";
import { FLIGHT, flightArc, flightPoint, flightScale, flightTilt } from "./markslayout";

/**
 * Іконка `icon` летить дугою від `from` до `to` (px світу), починаючи за `delay` мс; долетівши, зникає й кличе `onArrive`,
 * якщо він є (сцена показує над сховищем, скільки в ньому тепер). Над баблами, під підписами котів (`WORLD_LAYERS.flying`).
 */
export function flyIsoIcon(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Layer,
  icon: IconName,
  from: Point,
  to: Point,
  delay: number,
  onArrive?: () => void,
): void {
  const arc = flightArc(from, to);
  const image = scene.add.image(from.x, from.y, iconTexture(icon)).setDepth(WORLD_LAYERS.flying).setVisible(false).addToDisplayList(layer);
  const size = (k: number): void => {
    image.setDisplaySize(FLIGHT.icon * k, FLIGHT.icon * k);
  };
  size(flightScale(0));
  const flight = { t: 0 };
  scene.tweens.add({
    targets: flight,
    t: 1,
    delay,
    duration: FLIGHT.ms,
    ease: "Sine.easeInOut",
    onStart: () => image.setVisible(true),
    onUpdate: () => {
      const t = flight.t;
      const p = flightPoint(from, to, t, arc);
      image.setPosition(p.x, p.y).setRotation(flightTilt(t));
      size(flightScale(t));
    },
    onComplete: () => {
      image.destroy();
      onArrive?.();
    },
  });
}
