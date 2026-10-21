// Кіт-заглушка (§11.3): простий силует із забарвленням за генами (§9.10), що вже показує пози —
// іде, сидить, їсть, спить клубочком, ховається. Згодом його замінить конструктор із частин (крок 16).

import Phaser from "phaser";

import { isKitten, traitLevel } from "../sim/cat";
import { coatOf, type Coat, type Pigment } from "../sim/genetics";
import { objectAt } from "../sim/home";
import type { Cat, GameState } from "../sim/types";
import type { CatFeeling } from "../sim/actions";
import { objectHeight } from "./apartment";
import { COLORS, depthOf, toScreen } from "./geometry";

const PIGMENT: Record<Pigment, number> = {
  black: 0x2b2627,
  chocolate: 0x5e3b2a,
  blue: 0x7f8b97,
  lilac: 0xb7a7b0,
  orange: 0xd9822b,
  cream: 0xe9c995,
};
const WHITE = 0xf4f0e8;
/** Тіло колорпойнта світле, колір лише на «кінчиках». */
const POINT_BODY = 0xeee2cc;
const EYES = { blue: 0x6fb3e0, green: 0x7fbf5a, yellow: 0xe0c040, copper: 0xd2803a } as const;

const shade = (color: number, k: number): number => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(Math.round(c.red * k), Math.round(c.green * k), Math.round(c.blue * k));
};

export type CatPose = "walk" | "sit" | "eat" | "sleep" | "hide" | "carried";

/** Поза за дією кота. */
export function poseOf(cat: Cat, carried: boolean): CatPose {
  const act = cat.act;
  // На колінах кіт спить клубочком.
  if (act.kind === "lap") return "sleep";
  if (carried) return "carried";
  if (act.goal !== null || act.kind === "toy" || act.kind === "zoomies" || act.kind === "wrestle" || act.kind === "fight") return "walk";
  if (act.kind === "sleep") return "sleep";
  if (act.kind === "hide") return "hide";
  if (act.kind === "eat" || act.kind === "drink") return "eat";
  return "sit";
}

export class CatView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly coat: Coat;
  /** Точка над котом для баблів. */
  head = { x: 0, y: 0 };
  /** Спинка сидячого кота: тут його гладить рука (§9.12). */
  back = { x: 0, y: 0 };
  /** Хвіст смикається, коли котові не до вподоби: −1…1. */
  private lash = 0;
  /** Що намальовано зараз: якщо нічого не змінилося, кадр не перемальовує кота. */
  private drawn: string | null = null;

  /** Що кіт відчуває в цьому кадрі (§9.12): з цього малюються очі й вуха. */
  private feeling: CatFeeling | null = null;

  /** Форми частин тіла: від кота, що є зараз (гени й форми не змінюються). */
  private shape: Cat["shape"];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, cat: Cat) {
    this.g = scene.add.graphics().addToDisplayList(layer);
    this.coat = coatOf(cat.genes, cat.shape);
    this.shape = cat.shape;
  }

  destroy(): void {
    this.g.destroy();
  }

  /** Намалювати кота: у руках персонажа — біля грудей, інакше — на підлозі. */
  /**
   * `interaction` — персонаж саме гладить кота чи грається з ним (§8.2); `feeling` — що кіт відчуває
   * (§9.12): мружиться й погойдується, терпить з очима-щілинками чи пручається, смикаючись із
   * притиснутими вухами. Показуй, а не розказуй (§11.3а).
   */
  draw(
    state: GameState,
    cat: Cat,
    time: number,
    carriedAt: { x: number; y: number; depth: number } | null,
    interaction: "pet" | "play" | null = null,
    feeling: CatFeeling | null = null,
  ): void {
    this.shape = cat.shape;
    const pose = interaction ? "sit" : poseOf(cat, carriedAt !== null);
    this.feeling = feeling;
    this.lash = feeling === "reluctant" ? Math.sin(time / 70) : feeling === "struggling" ? Math.sin(time / 40) : 0;
    // Нерухомого кота не перемальовувати щокадру (§8.5): з десятками котів це головна робота кадру.
    const key = pose === "walk" || interaction || feeling ? null : `${pose}|${cat.x}|${cat.y}|${cat.facing}|${cat.away}|${carriedAt?.x}|${carriedAt?.y}|${Math.floor(time / 900)}|${cat.ageWeeks}`;
    if (key !== null && key === this.drawn) return;
    this.drawn = key;
    const g = this.g.clear();
    if (cat.away !== null) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const feet = carriedAt ?? { ...toScreen(cat), depth: depthOf(toScreen(cat).y) + 0.5 };
    // На меблях кіт сидить зверху, а ховається — під ними, визираючи з-під краю.
    const furniture = carriedAt ? null : objectAt(state, Math.floor(cat.x), Math.floor(cat.y));
    if (furniture && furniture.kind !== "door") {
      const bottom = toScreen({ x: 0, y: furniture.y + furniture.h }).y;
      feet.depth = depthOf(bottom) + 2;
      feet.y = pose === "hide" ? bottom - 2 : feet.y - objectHeight(furniture.kind) + 6;
    }
    g.setDepth(carriedAt ? carriedAt.depth + 1 : feet.depth);
    // Дорослий кіт — приблизно до пояса персонажу; кошеня менше.
    // Розмір породи (§9.11) — ±6% за одиницю; новонароджені зовсім крихітні.
    const age = cat.ageWeeks === 0 ? 0.55 : isKitten(cat) ? 0.78 : 1;
    const size = 1 + 0.06 * traitLevel(cat, "size");
    const scale = 1.25 * age * size * (cat.shape.build === "stocky" ? 1.08 : cat.shape.build === "slim" ? 0.94 : 1);
    const dir = cat.facing >= 0 ? 1 : -1;
    const pace = cat.act.kind === "zoomies" ? 35 : cat.act.kind === "toy" ? 50 : 70;
    const bob = pose === "walk" ? -Math.abs(Math.sin(time / pace + cat.id)) * (cat.act.kind === "toy" ? 5 : 2) : 0;
    // Гра — стрибки за пір'їнкою; пестощі — муркотливе погойдування.
    const jump = interaction === "play" ? -Math.abs(Math.sin(time / 130)) * 12 * scale : 0;
    // Задоволений погойдується повільно, невдоволений — смикається, а той, хто пручається, вертиться.
    const sway = feeling === "content" ? Math.sin(time / 280) * 1.5 : feeling === "reluctant" ? Math.sin(time / 90) * 1.2 : feeling === "struggling" ? Math.sin(time / 35) * 3.5 : 0;
    const x = feet.x + sway;
    const y = feet.y + bob + jump;
    const body = this.coat.pointed ? POINT_BODY : PIGMENT[this.coat.base];
    const point = PIGMENT[this.coat.base];
    const stripe = shade(PIGMENT[this.coat.base], 0.72);
    const s = scale;

    if (pose !== "carried" && pose !== "hide") g.fillStyle(0x000000, 0.22).fillEllipse(x, y, 34 * s, 9 * s);

    switch (pose) {
      case "sleep": {
        // Клубочок із хвостом довкола.
        g.fillStyle(body).fillEllipse(x, y - 9 * s, 34 * s, 20 * s);
        this.patches(g, x, y - 9 * s, 34 * s, 20 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 9 * s, 34 * s, 20 * s);
        g.lineStyle(5 * s, this.coat.pointed ? point : body).beginPath().arc(x, y - 8 * s, 15 * s, 0.2, 2.4).strokePath();
        this.ears(g, x + dir * 9 * s, y - 16 * s, s * 0.85, dir, point);
        if (Math.floor(time / 900 + cat.id) % 2 === 0) g.fillStyle(COLORS.ink, 0.5).fillCircle(x + dir * 14 * s, y - 26 * s, 2);
        this.head = { x, y: y - 26 * s };
        return;
      }
      case "hide": {
        // З-під меблів видно лише очі й кінчик хвоста.
        g.fillStyle(COLORS.ink, 0.55).fillEllipse(x, y - 4, 26 * s, 10 * s);
        g.fillStyle(EYES[this.coat.eyes]).fillCircle(x - 4 * s, y - 5, 2.4).fillCircle(x + 4 * s, y - 5, 2.4);
        this.head = { x, y: y - 14 };
        return;
      }
      case "walk": {
        // Тіло горизонтально, голова попереду, хвіст угору.
        g.fillStyle(this.coat.pointed ? point : body);
        for (const lx of [-9, -3, 6, 11]) g.fillRoundedRect(x + lx * s - 2, y - 8 * s, 4 * s, 9 * s, 2);
        this.tail(g, x - dir * 15 * s, y - 15 * s, s, dir, true);
        g.fillStyle(body).fillEllipse(x, y - 14 * s, 32 * s, 15 * s);
        this.patches(g, x, y - 14 * s, 32 * s, 15 * s);
        if (this.coat.tabby) this.stripes(g, x, y - 14 * s, 26 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 14 * s, 32 * s, 15 * s);
        this.headAt(g, x + dir * 15 * s, y - 22 * s, s, dir, body, point);
        return;
      }
      case "carried":
      case "sit":
      case "eat": {
        const hx = x + dir * 3 * s;
        const headY = pose === "eat" ? y - 12 * s : y - 33 * s;
        this.tail(g, x - dir * 10 * s, y - 4 * s, s, dir, false);
        g.fillStyle(body).fillEllipse(x, y - 13 * s, 22 * s, 26 * s);
        this.patches(g, x, y - 13 * s, 22 * s, 26 * s);
        if (this.coat.tabby) this.stripes(g, x, y - 15 * s, 18 * s, stripe, false);
        if (this.coat.white >= 1) g.fillStyle(WHITE).fillEllipse(x + dir * 3 * s, y - 13 * s, 9 * s, 14 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 13 * s, 22 * s, 26 * s);
        // Передні лапки: у грі — догори, ловлять пір'їнку.
        const paws = interaction === "play" ? y - 30 * s : y - 1;
        const reach = interaction === "play" ? dir * 6 * s : 0;
        g.fillStyle(this.coat.white >= 1 ? WHITE : this.coat.pointed ? point : body).fillEllipse(x - 3 * s + reach, paws, 6 * s, 4 * s).fillEllipse(x + 5 * s + reach, paws, 6 * s, 4 * s);
        this.headAt(g, hx + (feeling === "struggling" ? Math.sin(time / 50) * 2 : 0), headY, s, dir, body, point);
        this.back = { x: x - dir * 4 * s, y: y - 22 * s };
        return;
      }
    }
  }

  private headAt(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, body: number, point: number): void {
    const feeling = this.feeling;
    const r = 9 * s * (this.shape.muzzle === "long" ? 0.95 : 1);
    this.ears(g, x, y, s, dir, point);
    g.fillStyle(this.coat.pointed ? point : body).fillCircle(x, y, r);
    if (this.coat.second) g.fillStyle(PIGMENT[this.coat.second]).fillCircle(x - dir * 3 * s, y - 2 * s, r * 0.55);
    if (this.coat.white >= 2) g.fillStyle(WHITE).fillEllipse(x + dir * 2 * s, y + 3 * s, r * 1.1, r * 0.9);
    g.lineStyle(2.5, COLORS.ink).strokeCircle(x, y, r);
    if (this.coat.long) g.lineStyle(2, COLORS.ink, 0.6).strokeCircle(x, y, r + 2.5 * s);
    const ex = x + dir * 3 * s;
    if (feeling === "content") {
      // Задоволений кіт мружиться: очі — дужки.
      g.lineStyle(1.6, COLORS.ink);
      for (const ox of [-2.6, 2.6]) g.beginPath().arc(ex + ox * s, y - 0.5 * s, 2 * s, Math.PI * 1.1, Math.PI * 1.9).strokePath();
    } else if (feeling === "reluctant") {
      // Терпить: сердито примружений — видно колір очей, а повіки навскіс, до носа нижче.
      for (const side of [-1, 1]) {
        const cx = ex + side * 2.6 * s;
        g.fillStyle(EYES[this.coat.eyes]).fillEllipse(cx, y - 0.4 * s, 4.4 * s, 2.6 * s);
        g.fillStyle(COLORS.ink).fillCircle(cx, y - 0.2 * s, 0.9 * s);
        g.lineStyle(1.8, COLORS.ink).lineBetween(cx - side * 2.6 * s, y - 0.8 * s, cx + side * 2.4 * s, y - 2.8 * s);
      }
    } else if (feeling === "struggling") {
      // Пручається: очі круглі, зіниці-цятки.
      g.fillStyle(0xffffff).fillCircle(ex - 2.8 * s, y - 1 * s, 2.8 * s).fillCircle(ex + 2.8 * s, y - 1 * s, 2.8 * s);
      g.lineStyle(1.2, COLORS.ink).strokeCircle(ex - 2.8 * s, y - 1 * s, 2.8 * s).strokeCircle(ex + 2.8 * s, y - 1 * s, 2.8 * s);
      g.fillStyle(COLORS.ink).fillCircle(ex - 2.8 * s, y - 1 * s, 0.9 * s).fillCircle(ex + 2.8 * s, y - 1 * s, 0.9 * s);
    } else {
      g.fillStyle(EYES[this.coat.eyes]).fillCircle(ex - 2.6 * s, y - 1 * s, 2.2 * s).fillCircle(ex + 2.6 * s, y - 1 * s, 2.2 * s);
      g.fillStyle(COLORS.ink).fillCircle(ex - 2.6 * s, y - 1 * s, 1 * s).fillCircle(ex + 2.6 * s, y - 1 * s, 1 * s);
    }
    g.fillStyle(0xd88a8a).fillTriangle(ex - 1.4 * s, y + 2.5 * s, ex + 1.4 * s, y + 2.5 * s, ex, y + 4 * s);
    this.head = { x, y: y - r - 8 * s };
  }

  private ears(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, color: number): void {
    const shape = this.shape.ears;
    const big = shape === "large" || shape === "tufted" ? 1.3 : 1;
    // Невдоволений чи переляканий кіт притискає вуха (§9.12).
    const folded = shape === "folded" || this.feeling === "struggling" || this.feeling === "reluctant";
    g.fillStyle(color);
    for (const side of [-1, 1]) {
      const bx = x + side * 5 * s + dir;
      if (folded) {
        g.fillTriangle(bx - 3 * s, y - 6 * s, bx + 3 * s, y - 6 * s, bx + side * 4 * s, y - 2 * s);
      } else {
        g.fillTriangle(bx - 4 * s, y - 5 * s, bx + 4 * s, y - 5 * s, bx + side * 1 * s, y - (12 + 4 * (big - 1) * 3) * s);
        g.lineStyle(2, COLORS.ink).strokeTriangle(bx - 4 * s, y - 5 * s, bx + 4 * s, y - 5 * s, bx + side * 1 * s, y - (12 + 4 * (big - 1) * 3) * s);
      }
    }
  }

  private tail(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, up: boolean): void {
    const shape = this.shape.tail;
    if (shape === "none") return;
    const length = shape === "bobtail" ? 0.3 : shape === "short" ? 0.6 : 1;
    const width = (shape === "fluffy" || this.coat.long ? 7 : 4.5) * s;
    const color = this.coat.pointed ? PIGMENT[this.coat.base] : PIGMENT[this.coat.second ?? this.coat.base];
    g.lineStyle(width, color);
    const tx = x - dir * 12 * s * length;
    const ty = up ? y - 16 * s * length : y + 2 - (this.lash + 1) * 5 * s * length;
    g.beginPath().moveTo(x, y).lineTo((x + tx) / 2 - dir * 2 * s, (y + ty) / 2).lineTo(tx, ty).strokePath();
  }

  /** Плями черепахового й білого забарвлення. */
  private patches(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const coat = this.coat;
    if (coat.second && !coat.pointed) {
      g.fillStyle(PIGMENT[coat.second]).fillEllipse(x - w * 0.18, y - h * 0.12, w * 0.4, h * 0.45).fillEllipse(x + w * 0.22, y + h * 0.1, w * 0.3, h * 0.35);
    }
    if (coat.white >= 2) g.fillStyle(WHITE).fillEllipse(x, y + h * 0.18, w * (coat.white >= 3 ? 0.95 : 0.7), h * (coat.white >= 3 ? 0.8 : 0.5));
  }

  private stripes(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, color: number, horizontal: boolean): void {
    const pattern = this.coat.tabby;
    g.lineStyle(2, color, 0.85);
    if (pattern === "spotted" || pattern === "ticked") {
      g.fillStyle(color, pattern === "ticked" ? 0.35 : 0.8);
      for (const [dx, dy] of [[-0.3, -0.2], [0, -0.3], [0.3, -0.1], [-0.15, 0.15], [0.2, 0.2]] as const) g.fillCircle(x + dx * w, y + dy * w * 0.6, 1.8);
      return;
    }
    for (const t of [-0.3, 0, 0.3]) {
      if (horizontal) g.lineBetween(x + t * w, y - w * 0.25, x + t * w + 2, y + (pattern === "classic" ? 1 : 3));
      else g.lineBetween(x - w * 0.35, y + t * w, x + w * 0.35, y + t * w + 2);
    }
  }
}
