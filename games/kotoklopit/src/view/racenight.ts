// Ніч у гонці (§8.9 «День і ніч», рішення автора 2026-11-02; розрахунки й числа вигляду — `racelight.ts`): шар світла
// поверх дороги, узбіччя, парковки, машин і будівлі пункту, але під табличкою пункту, смугою прогресу, машинкою на ній,
// джойстиком і написами — HUD гонки не темніє.
//
// - Світло ночі (lightmap): DynamicTexture у пів роздільності кадру, щокадру — тон ночі (`RaceNightLevel.tone`), а поверх
//   додаванням м'які градієнти світла — плями вуличних ліхтарів і ліхтарів парковки, промені фар, червоне світло задніх вогнів
//   (і біле — заднього ходу) та світло таблички. Зображення цієї текстури лягає на кадр множенням (MULTIPLY): де світла немає
//   — темно, а де є — видно барви дороги, як удень.
// - Поверх (додаванням): самі фари й задні вогні — світлі цятки — і ледь помітний ореол таблички; іконка пункту на табличці —
//   над усім цим (`RACE_DEPTH.sign`), тож табличка «світиться».
//
// Градієнти малює код (виняток зі STYLE §4 і §10, рішення автора 2026-11-02: «М'які градієнти»): текстури — Canvas2D,
// попіксельно, один раз (`textures.addCanvas`), спільні для всіх показів сцени. Режими MULTIPLY і ADD діють і у WebGL, і в
// запасному Canvas (`multiply` / `lighter`); tint і фільтри в Canvas не діють — кольори запечено в текстури. Удень (рівень —
// null) усе сховано: кадр до пікселя той самий, що й без цього шару.

import Phaser from "phaser";

import {
  BEAM,
  BEAM_SPREAD,
  beamAlpha,
  BULB,
  LIGHTMAP,
  lightmapSize,
  LIGHT_COLORS,
  poolAlpha,
  SIGN_GLOW,
  TAIL,
  type CarLight,
  type LightPool,
  type RaceNightLevel,
} from "./racelight";

/** Глибини шарів ночі (`RACE_DEPTH` сцени дороги). */
export interface RaceNightDepths {
  /** Світло ночі (множення): над будівлею пункту, під табличкою. */
  night: number;
  /** Самі фари. */
  beams: number;
  /** Задні вогні й задній хід. */
  tails: number;
  /** Ореол таблички. */
  signGlow: number;
}

/**
 * Машина, що світить: її вогні, які видно (`carLights`; у машин потоку — без тих, що під кузовом своєї, `trafficLights`), і
 * наскільки горять фари, задні вогні й задній хід (0–1, уже з непрозорістю машини й згасанням за краєм кадру).
 */
export interface LitCar {
  lights: readonly CarLight[];
  head: number;
  tail: number;
  reverse: number;
}

/** Що світить у кадрі: плями ліхтарів (вулиця й парковка), машини й табличка пункту (null — парковки в кадрі немає). */
export interface NightLights {
  pools: readonly LightPool[];
  cars: readonly LitCar[];
  sign: LightPool | null;
}

/** Кадр дороги: розмір (одиниці інтерфейсу) і масштаб арту. */
export interface NightView {
  width: number;
  height: number;
  k: number;
}

/** Текстури градієнтів: ключ і сторона (px; промінь — висота, а ширина — з кута). */
const TEX = {
  pool: { key: "race-night:pool", size: 128 },
  beam: { key: "race-night:beam", size: 128 },
  tail: { key: "race-night:tail", size: 64 },
  reverse: { key: "race-night:reverse", size: 64 },
  bulb: { key: "race-night:bulb", size: 32 },
  sign: { key: "race-night:sign", size: 128 },
} as const;
/** Lightmap — одна текстура на всі покази сцени дороги. */
const LIGHTMAP_KEY = "race-night:lightmap";

/** Полотно `w × h` з кольором `color` і прозорістю `alpha(x, y)` у кожному пікселі (середина пікселя). */
function gradientCanvas(w: number, h: number, color: number, alpha: (x: number, y: number) => number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const image = context.createImageData(w, h);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, alpha(x + 0.5, y + 0.5))));
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Кругла пляма кольору `color` зі стороною `size` (`poolAlpha`, `flat` — рівна середина). */
function poolCanvas(size: number, color: number, flat = 0): HTMLCanvasElement {
  const half = size / 2;
  return gradientCanvas(size, size, color, (x, y) => poolAlpha(Math.hypot(x - half, y - half) / half, flat));
}

/** Ширина текстури променя заввишки `h`: конус до `BEAM_SPREAD` від осі. */
function beamWidth(h: number): number {
  return 2 * Math.ceil(h * Math.tan(BEAM_SPREAD));
}

/** Промінь фари: вістря — посередині нижнього краю, світить угору (`beamAlpha`). */
function beamCanvas(h: number): HTMLCanvasElement {
  const w = beamWidth(h);
  return gradientCanvas(w, h, LIGHT_COLORS.beam, (x, y) => {
    const dx = x - w / 2;
    const dy = h - y;
    return beamAlpha(Math.hypot(dx, dy) / h, Math.atan2(dx, dy));
  });
}

/** Створити текстури градієнтів, яких ще немає (один раз на гру). */
function ensureTextures(textures: Phaser.Textures.TextureManager): void {
  const add = (key: string, make: () => HTMLCanvasElement): void => {
    if (!textures.exists(key)) textures.addCanvas(key, make());
  };
  add(TEX.pool.key, () => poolCanvas(TEX.pool.size, LIGHT_COLORS.pool));
  add(TEX.beam.key, () => beamCanvas(TEX.beam.size));
  add(TEX.tail.key, () => poolCanvas(TEX.tail.size, LIGHT_COLORS.tail));
  add(TEX.reverse.key, () => poolCanvas(TEX.reverse.size, LIGHT_COLORS.reverse));
  add(TEX.bulb.key, () => poolCanvas(TEX.bulb.size, LIGHT_COLORS.bulb));
  add(TEX.sign.key, () => poolCanvas(TEX.sign.size, LIGHT_COLORS.sign, 0.5));
}

/** Шар ночі сцени дороги: створюється з артом гонки (з першого кадру), удень — схований. */
export class RaceNight {
  private readonly lightmap: Phaser.Textures.DynamicTexture | null;
  private readonly image: Phaser.GameObjects.Image | null;
  private readonly bulbs: Phaser.GameObjects.Image[] = [];
  private readonly tails: Phaser.GameObjects.Image[] = [];
  private readonly halo: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depths: RaceNightDepths,
  ) {
    ensureTextures(scene.textures);
    const existing = scene.textures.exists(LIGHTMAP_KEY) ? scene.textures.get(LIGHTMAP_KEY) : null;
    this.lightmap = existing instanceof Phaser.Textures.DynamicTexture ? existing : scene.textures.addDynamicTexture(LIGHTMAP_KEY, 2, 2);
    this.image = this.lightmap
      ? scene.add.image(0, 0, LIGHTMAP_KEY).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(depths.night).setVisible(false)
      : null;
    this.halo = scene.add.image(0, 0, TEX.pool.key).setBlendMode(Phaser.BlendModes.ADD).setDepth(depths.signGlow).setVisible(false);
  }

  /**
   * Кадр ночі: `level` — ніч гонки (`raceNight`; null — день: усе сховано), `lights` — що світить. Викликати раз на кадр, коли
   * все інше вже на місцях.
   */
  draw(view: NightView, level: RaceNightLevel | null, lights: NightLights): void {
    const lightmap = this.lightmap;
    const image = this.image;
    if (!level || !lightmap || !image) {
      this.hide();
      return;
    }
    const { k } = view;
    const res = LIGHTMAP.res;
    const { w, h } = lightmapSize(view.width, view.height);
    if (lightmap.width !== w || lightmap.height !== h) {
      lightmap.setSize(w, h);
      image.setTexture(LIGHTMAP_KEY);
    }
    lightmap.fill(level.tone, 1);
    const stamp = (key: string, size: number, x: number, y: number, diameter: number, alpha: number): void => {
      if (alpha <= 0) return;
      lightmap.stamp(key, undefined, x * res, y * res, { alpha, scale: (diameter * res) / size, blendMode: Phaser.BlendModes.ADD });
    };
    for (const pool of lights.pools) stamp(TEX.pool.key, TEX.pool.size, pool.x, pool.y, 2 * pool.radius, pool.alpha * level.lamps);
    if (lights.sign) stamp(TEX.sign.key, TEX.sign.size, lights.sign.x, lights.sign.y, 2 * lights.sign.radius, lights.sign.alpha * level.lamps);

    let bulbs = 0;
    let tails = 0;
    const beamScale = (BEAM.length * k * res) / TEX.beam.size;
    for (const car of lights.cars) {
      for (const light of car.lights) {
        if (light.kind === "head") {
          if (car.head <= 0) continue;
          lightmap.stamp(TEX.beam.key, undefined, light.x * res, light.y * res, {
            alpha: BEAM.alpha * car.head,
            rotation: light.rotation,
            scale: beamScale,
            originX: 0.5,
            originY: 1,
            blendMode: Phaser.BlendModes.ADD,
          });
          this.dot(this.bulbs, bulbs++, TEX.bulb, this.depths.beams, light.x, light.y, 2 * BULB.radius * k, BULB.alpha * car.head);
          continue;
        }
        // Світло задніх вогнів — на асфальті позаду: середина зсунута назад, куди вони світять.
        const behind = TAIL.behind * TAIL.glow * k;
        const gx = light.x + Math.sin(light.rotation) * behind;
        const gy = light.y - Math.cos(light.rotation) * behind;
        if (car.tail > 0) {
          stamp(TEX.tail.key, TEX.tail.size, gx, gy, 2 * TAIL.glow * k, TAIL.glowAlpha * car.tail);
          this.dot(this.tails, tails++, TEX.tail, this.depths.tails, light.x, light.y, 2 * TAIL.dot * k, TAIL.dotAlpha * car.tail);
        }
        if (car.reverse > 0) {
          stamp(TEX.reverse.key, TEX.reverse.size, gx, gy, 2 * TAIL.glow * k, TAIL.glowAlpha * car.reverse);
          this.dot(this.tails, tails++, TEX.reverse, this.depths.tails, light.x, light.y, 2 * TAIL.dot * k, TAIL.reverse * car.reverse);
        }
      }
    }
    lightmap.render();
    image.setScale(1 / res).setVisible(true);
    hideFrom(this.bulbs, bulbs);
    hideFrom(this.tails, tails);

    const sign = lights.sign;
    const halo = SIGN_GLOW.haloAlpha * level.lamps;
    if (sign && halo > 0) {
      this.halo
        .setPosition(sign.x, sign.y)
        .setScale((2 * SIGN_GLOW.halo * k) / TEX.pool.size)
        .setAlpha(halo)
        .setVisible(true);
    } else this.halo.setVisible(false);
  }

  /** Сховати весь шар (день). */
  private hide(): void {
    this.image?.setVisible(false);
    hideFrom(this.bulbs, 0);
    hideFrom(this.tails, 0);
    this.halo.setVisible(false);
  }

  /** Світла цятка з пулу (`ADD`): текстура, глибина, середина й діаметр (px), прозорість. */
  private dot(pool: Phaser.GameObjects.Image[], i: number, tex: { key: string; size: number }, depth: number, x: number, y: number, diameter: number, alpha: number): void {
    let image = pool[i];
    if (!image) {
      image = this.scene.add.image(0, 0, tex.key).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
      pool[i] = image;
    } else if (image.texture.key !== tex.key) image.setTexture(tex.key);
    image
      .setPosition(x, y)
      .setScale(diameter / tex.size)
      .setAlpha(alpha)
      .setVisible(alpha > 0);
  }
}

function hideFrom(pool: Phaser.GameObjects.Image[], from: number): void {
  for (let i = from; i < pool.length; i++) pool[i]?.setVisible(false);
}
