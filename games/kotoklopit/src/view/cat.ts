// Кіт-заглушка (§11.3): простий силует із забарвленням за генами (§9.10), що вже показує пози —
// іде, сидить, їсть, спить клубочком, ховається, вигинає спину перед ворогом, клубком б'ється, вилизує друга, бореться
// з ним у грі (§9.4, «Пози стосунків»).
// Згодом його замінить конструктор із частин (крок 16). Яка поза за дією — `pose.ts`.

import Phaser from "phaser";

import { isKitten, traitLevel } from "../sim/cat";
import { coatOf, type Coat, type Pigment } from "../sim/genetics";
import { CARRIER_SPOT, HIGH_PLACES, objectAt } from "../sim/home";
import { absoluteMinute } from "../sim/time";
import { girthOf } from "../sim/weight";
import type { Cat, GameState, Quality } from "../sim/types";
import type { CatFeeling } from "../sim/actions";
import { objectHeight } from "./apartment";
import { drawSock, drawToy } from "./catcorner";
import { COLORS } from "./colors";
import { depthOf, toScreen } from "./geometry";
import { brawlFoe, brawlInFront, isLicked, poseOf, withFriend } from "./pose";

const PIGMENT: Record<Pigment, number> = {
  black: 0x2b2627,
  chocolate: 0x5e3b2a,
  blue: 0x7f8b97,
  lilac: 0xb7a7b0,
  orange: 0xd9822b,
  cream: 0xe9c995,
};
const WHITE = 0xf4f0e8;
/** Ковдра на ліжку — той самий колір, що в `apartment.ts`: під нею спить теплолюб (§9.12, «Теплолюбність»). */
const BLANKET = 0x6c7fa3;
/** Тіло колорпойнта світле, колір лише на «кінчиках». */
const POINT_BODY = 0xeee2cc;
const EYES = { blue: 0x6fb3e0, green: 0x7fbf5a, yellow: 0xe0c040, copper: 0xd2803a } as const;
/** На скільки пікселів кіт, що їсть чи п'є з миски, сидить за нею (§9.12): корм у мисці видно спереду. */
const BOWL_BEHIND = 9;
/** Скільки ігрових хвилин після шипіння в протистоянні рот відкритий, а голова подана вперед (§9.4, «Спина дугою»). */
const HISS_OPEN = 0.8;
/** Відкритий рот, що шипить. */
const MOUTH = 0x5a2232;
/** Язичок того, хто вилизує друга (§9.4, «Вилизує іншого»). */
const TONGUE = 0xe58b9a;
/** Наскільки прикриті очі того, хто вилизує друга: напівзаплющені (§9.4, «Вилизує іншого»). */
const LICK_LID = 0.55;

const shade = (color: number, k: number): number => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(Math.round(c.red * k), Math.round(c.green * k), Math.round(c.blue * k));
};

/**
 * Настрій з поведінки (§11.4, рішення автора 2026-10-25): сумний кіт — вуха вбік, голова нижче, очі
 * напівзаплющені, хвіст униз; щасливий і відданий — повертається до персонажа (`face`) і повільно моргає
 * (`blink`: 0 — очі розплющені, 1 — заплющені).
 */
export interface CatMoodLook {
  sad: boolean;
  blink: number;
  face: number | null;
  /** «Пастка на животику» лежить на спині животом догори (§9.12). */
  belly?: boolean;
  /** Ласкавий кіт бодається головою в руку (§9.12). */
  nudge?: boolean;
  /**
   * «Образливий» дметься й сидить спиною до персонажа (§9.12): видно потилицю й спину — ні очей, ні носа, ні білої
   * грудки (перевірка етапу 2026-10-25: кіт лише дивився в інший бік, а морду було видно, як і завжди).
   */
  back?: boolean;
}

/** Де лежить кіт у ящиках біля входу: на верхній коробці купи, від низу клітинки (§9.12). */
const BOX_TOP = 24;

/** Наскільки прикриті очі сумного кота. */
const SAD_LID = 0.45;
/** На темній шерсті повіку й брівки видно світлою лінією. */
const DARK_LID = 0xc9bfc6;

const isDark = (color: number): boolean => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue < 90;
};

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
  /** Настрій з поведінки в цьому кадрі (§11.4): сумна поза чи повільне моргання. */
  private look: CatMoodLook | null = null;
  /** Іграшка в зубах (§9.12, «Подарунки й схованки»): якої вона якості — така й пір'їнка. */
  private mouthToy: Quality = "cheap";

  /** Форми частин тіла: від кота, що є зараз (гени й форми не змінюються). */
  private shape: Cat["shape"];
  /** «Спина дугою» (§9.4): вуха притиснуті вбік і назад, очі широко розплющені. */
  private threat = false;
  /** Кіт саме шипить на ворога: рот відкритий. */
  private hissing = false;
  /** Вилизує друга (§9.4, «Вилизує іншого»): очі напівзаплющені, видно язичок. */
  private licking = false;

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
   * притиснутими вухами. `look` — настрій з поведінки (§11.4): сумна поза чи повільне моргання до персонажа.
   * Показуй, а не розказуй (§11.3а).
   */
  draw(
    state: GameState,
    cat: Cat,
    time: number,
    carriedAt: { x: number; y: number; depth: number } | null,
    interaction: "pet" | "play" | null = null,
    given: CatFeeling | null = null,
    look: CatMoodLook | null = null,
  ): void {
    // Кота вилизує друг — мружиться, як під пестощами (§9.4, «Гру й вилизування видно», В1).
    const feeling = given ?? (isLicked(cat) ? "content" : null);
    this.shape = cat.shape;
    // «Пастка на животику» й під рукою лежить животом догори — у цьому й пастка (§9.12).
    // Хто ховається нагорі — на холодильнику чи шафі (§9.12, «Лазіння»), — лежить там клубочком, а не визирає з-під низу.
    const onHigh = carriedAt === null && HIGH_PLACES.includes(objectAt(state, Math.floor(cat.x), Math.floor(cat.y))?.id ?? "");
    const base = look?.belly === true && carriedAt === null ? "belly" : interaction ? "sit" : poseOf(cat, carriedAt !== null);
    const pose = onHigh && base === "hide" ? "sleep" : base;
    this.feeling = feeling;
    // Перед ворогом і в бійці, у грі з другом і поки вилизує чи його вилизують, кіту не до персонажа: ні смутку, ні моргання, ні
    // «дметься спиною» (§9.4, «Пози стосунків»).
    const busy = pose === "arch" || pose === "brawl" || withFriend(cat);
    this.look = busy ? null : look;
    this.threat = pose === "arch";
    this.licking = pose === "lick";
    this.hissing = pose === "arch" && cat.hissedAt !== undefined && absoluteMinute(state.day, state.minute) - cat.hissedAt < HISS_OPEN;
    const toy = cat.act.kind === "carry" && cat.act.carry === "toy" ? state.home.items.find((item) => `item:${item.id}` === cat.act.target) : undefined;
    this.mouthToy = toy?.kind === "toy" ? toy.quality : "cheap";
    this.lash = feeling === "reluctant" ? Math.sin(time / 70) : feeling === "struggling" ? Math.sin(time / 40) : 0;
    // Нерухомого кота не перемальовувати щокадру (§8.5): з десятками котів це головна робота кадру.
    const blinking = (look?.blink ?? 0) > 0 || look?.nudge === true;
    const key =
      pose === "walk" ||
      pose === "arch" ||
      pose === "brawl" ||
      pose === "lick" ||
      pose === "paw" ||
      pose === "kick" ||
      pose === "roll" ||
      pose === "bury" ||
      pose === "groom" ||
      pose === "mark" ||
      pose === "cough" ||
      pose === "scratch" ||
      pose === "stretch" ||
      pose === "crouch" ||
      pose === "lie" ||
      interaction ||
      feeling ||
      blinking
        ? null
        : `${pose}|${cat.x}|${cat.y}|${cat.facing}|${cat.away}|${carriedAt?.x}|${carriedAt?.y}|${Math.floor(time / 900)}|${cat.ageWeeks}|${look?.sad}|${look?.face}|${look?.belly}|${look?.back}|${Math.round(girthOf(cat) * 20)}`;
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
      // У душовій кабіні кіт сидить на мокрому піддоні біля входу, а не на даху кабіни (§9.12, «Любов до води»).
      // У ящиках біля входу кіт лежить у верхній коробці: купа нижча за висоту місця (1–2 коробки, §9.12 «Допитливість»).
      feet.y = pose === "hide" ? bottom - 2 : furniture.kind === "shower" ? bottom - 4 : furniture.kind === "boxes" ? bottom - BOX_TOP : feet.y - objectHeight(furniture.kind) + 6;
    } else if (pose === "eat" && carriedAt === null) {
      // Їсть чи п'є з миски — сидить за нею, схилившись, а не на ній: видно, як корм меншає (§9.12, «Швидкість їжі»;
      // перевірка етапу 2026-10-25 — кіт закривав миску, і корму не було видно). Глибина — та сама, з клітинки кота.
      feet.y -= BOWL_BEHIND;
    }
    g.setDepth(carriedAt ? carriedAt.depth + 1 : feet.depth);
    const scale = this.scaleOf(cat);
    // Відданий кіт дивиться на персонажа, коли моргає до нього; перед ворогом і в бійці — лише на ворога, з другом — на друга.
    const foeFacing = busy;
    const dir = (foeFacing ? null : look?.face) ?? (cat.facing >= 0 ? 1 : -1);
    const sad = look?.sad === true && !foeFacing;
    // Погоня в грі двох котів — швидкістю зумі (§9.4, Г3).
    const pace = cat.act.kind === "zoomies" || cat.act.game?.phase === "chase" ? 35 : cat.act.kind === "toy" ? 50 : 70;
    const bob = pose === "walk" ? -Math.abs(Math.sin(time / pace + cat.id)) * (cat.act.kind === "toy" ? 5 : 2) : 0;
    // Гра — стрибки за пір'їнкою; пестощі — муркотливе погойдування.
    const jump = interaction === "play" ? -Math.abs(Math.sin(time / 130)) * 12 * scale : 0;
    // Задоволений погойдується повільно, невдоволений — смикається, а той, хто пручається, вертиться.
    const sway = feeling === "content" ? Math.sin(time / 280) * 1.5 : feeling === "reluctant" ? Math.sin(time / 90) * 1.2 : feeling === "struggling" ? Math.sin(time / 35) * 3.5 : 0;
    // Вилизує друга чи друг вилизує його (§9.4, «Вилизує іншого»): за 0,4 клітинки обидва трохи відхилені назад, щоб голова того,
    // хто вилизує, діставала до щоки друга, а не закривала його морду.
    const lean = pose === "lick" ? -dir * 7 * scale : pose === "sit" && isLicked(cat) ? -dir * 5 * scale : 0;
    const x = feet.x + sway + lean;
    const y = feet.y + bob + jump;
    const body = this.coat.pointed ? POINT_BODY : PIGMENT[this.coat.base];
    const point = PIGMENT[this.coat.base];
    const stripe = shade(PIGMENT[this.coat.base], 0.72);
    const s = scale;
    // Повний кіт ширшає поступово (§9.12, «Схильність до повноти»): тіло ширшає, а трохи — і вищає.
    const fw = girthOf(cat);
    const fh = 1 + (fw - 1) * 0.4;

    if (pose !== "carried" && pose !== "hide" && pose !== "carrier" && pose !== "brawl") g.fillStyle(0x000000, 0.22).fillEllipse(x, y, 34 * s, 9 * s);

    switch (pose) {
      case "arch": {
        // «Спина дугою» (§9.4, «Пози стосунків»; заглушка до кроку 16): спина — висока дуга підковою догори, живіт підтягнутий,
        // лапи прямі й напружені, шерсть настовбурчена (зубчастий контур), хвіст трубою й пухнастий, вуха притиснуті, очі широко
        // розплющені; кіт дрібно тремтить, а на шипінні подає голову вперед і відкриває рот. Тіло — позаду передніх лап (точки
        // кота): двоє за 0,6 клітинки стоять морда до морди, а не один в одному.
        const shiver = Math.sin(time / 28 + cat.id) * 0.5 * s;
        const lunge = this.hissing ? dir * 1.5 * s : 0;
        const bx = x - dir * 12 * s + shiver;
        const belly = y - 13 * s;
        // Зовнішній край дуги — спина, внутрішній — підтягнутий живіт; у повного кота дуга товща.
        const outerX = 14 * s * fw;
        const outerY = 17 * s * fh;
        const innerX = 7 * s;
        const innerY = Math.max(3 * s, 9 * s - (fw - 1) * 8 * s);
        const at = (a: number, rx: number, ry: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(bx - dir * Math.cos(a) * rx, belly - Math.sin(a) * ry);
        const limb = this.coat.pointed ? point : body;
        this.tail(g, bx - dir * 10 * s, belly - 6 * s, s, dir, "puff");
        g.fillStyle(limb);
        for (const lx of [-12, -8.5, 8.5, 12]) g.fillRoundedRect(bx + dir * lx * s - 2 * s, belly - 2 * s, 4 * s, y - belly + 2 * s, 1.5 * s);
        const n = 20;
        const outline: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= n; i++) {
          const fur = i % 2 === 1 ? 1.08 : 1;
          outline.push(at((Math.PI * i) / n, outerX * fur, outerY * fur));
        }
        for (let i = n; i >= 0; i--) outline.push(at((Math.PI * i) / n, innerX, innerY));
        g.fillStyle(body).fillPoints(outline, true);
        // Забарвлення на дузі: плями черепахового, біле знизу й на грудях, смужки табі поперек спини.
        const midX = (outerX + innerX) / 2;
        const midY = (outerY + innerY) / 2;
        if (this.coat.second && !this.coat.pointed) {
          for (const a of [0.3, 0.62]) {
            const p = at(Math.PI * a, midX, midY);
            g.fillStyle(PIGMENT[this.coat.second]).fillEllipse(p.x, p.y, 8 * s, 6 * s);
          }
        }
        if (this.coat.white >= 2) {
          const band = (this.coat.white >= 3 ? 5 : 3) * s;
          const rim: Phaser.Math.Vector2[] = [];
          for (let i = 0; i <= n; i++) rim.push(at((Math.PI * i) / n, innerX + band / 2, innerY + band / 2));
          g.lineStyle(band, WHITE).strokePoints(rim);
        }
        if (this.coat.white >= 1) {
          const chest = at(Math.PI * 0.9, midX, midY * 0.6);
          g.fillStyle(WHITE).fillEllipse(chest.x, chest.y, 6 * s, 8 * s);
        }
        if (this.coat.tabby === "spotted" || this.coat.tabby === "ticked") {
          g.fillStyle(stripe, this.coat.tabby === "ticked" ? 0.35 : 0.8);
          for (const a of [0.22, 0.38, 0.5, 0.62, 0.78]) {
            const p = at(Math.PI * a, midX + (a === 0.5 ? 2 * s : 0), midY + (a === 0.5 ? 2 * s : 0));
            g.fillCircle(p.x, p.y, 1.8);
          }
        } else if (this.coat.tabby) {
          g.lineStyle(2, stripe, 0.85);
          for (const a of [0.3, 0.42, 0.54, 0.66]) {
            const from = at(Math.PI * a, outerX - 1.5 * s, outerY - 1.5 * s);
            const to = at(Math.PI * a, midX, midY);
            g.lineBetween(from.x, from.y, to.x, to.y);
          }
        }
        g.lineStyle(2.5, COLORS.ink).strokePoints(outline, true);
        const hx = x - dir * 0.5 * s + lunge + shiver;
        const hy = belly - 2 * s;
        this.headAt(g, hx, hy, s, dir, body, point);
        this.head = { x: bx, y: Math.min(belly - outerY * 1.08, hy - 13 * s) - 8 * s };
        this.back = { x: bx, y: belly - outerY };
        return;
      }
      case "brawl": {
        // «Клубок бійки» (§9.4, «Пози стосунків»; заглушка до кроку 16): двоє — одна фігура посередині між котами. Кожен кіт
        // малює свою половину: настовбурчену кулю свого забарвлення, що кружляє довкола середини, з лапами й хвостом, які
        // стирчать і міняються місцями, проблисками вух і очей та клаптями шерсті, що летять навсібіч; позаду — хмара пилу.
        const foe = brawlFoe(state, cat);
        const mx = foe ? (feet.x + toScreen(foe).x) / 2 : x;
        const cy = y - 15 * s;
        const first = foe === null || cat.id < foe.id;
        const spin = time / 120 + (first ? 0 : Math.PI);
        const jitter = Math.sin(time / 23 + cat.id) * 1.2 * s;
        const ox = mx + Math.cos(spin) * 5 * s + jitter;
        const oy = cy + Math.sin(spin) * 3 * s;
        const r = 14 * s * fw;
        // Помітно менша куля (кошеня проти дорослого) — завжди спереду, щоб її було видно.
        const front = brawlInFront(r, foe ? 14 * this.scaleOf(foe) * girthOf(foe) : null, spin);
        const limb = this.coat.pointed ? point : body;
        const pawColor = this.coat.white >= 1 ? WHITE : limb;
        // Верх клубка — за більшим із двох (кошеня б'ється з дорослим): над ним бабл «бійка».
        const topOf = (c: Cat): number => {
          const cs = this.scaleOf(c);
          return y - 15 * cs - 14 * cs * girthOf(c) * 1.14 - 3 * cs;
        };
        const top = Math.min(topOf(cat), foe ? topOf(foe) : Infinity);
        // Хто зараз ближче до нас, той і поверх: клубок крутиться, а не стоїть одним боком.
        g.setDepth(feet.depth + (front ? 0.01 : 0));
        g.fillStyle(0x000000, 0.12).fillEllipse(mx, y, 50 * s, 10 * s);
        if (!front) {
          // Хмара пилу позаду клубка — малює той, хто зараз позаду.
          const rr = (y - top) * 0.55;
          g.fillStyle(0xf3ede2, 0.5);
          for (let i = 0; i < 9; i++) {
            const a = (Math.PI * 2 * i) / 9 + time / 400;
            g.fillCircle(mx + Math.cos(a) * rr * 1.15, (y + top) / 2 + Math.sin(a) * rr * 0.8, rr * 0.45);
          }
        }
        // Хвіст стирчить із клубка й мотається.
        if (this.shape.tail !== "none") {
          const length = (this.shape.tail === "bobtail" ? 0.3 : this.shape.tail === "short" ? 0.6 : 1) * 14 * s;
          const ta = spin + Math.PI * 0.85 + Math.sin(time / 90 + cat.id) * 0.6;
          const width = (this.shape.tail === "fluffy" || this.coat.long ? 8 : 5.5) * s;
          const [x1, y1, x2, y2] = [ox + Math.cos(ta) * r * 0.6, oy + Math.sin(ta) * r * 0.6, ox + Math.cos(ta) * (r + length), oy + Math.sin(ta) * (r + length)];
          g.lineStyle(width + 2.5, COLORS.ink).lineBetween(x1, y1, x2, y2);
          g.lineStyle(width, this.coat.pointed ? point : PIGMENT[this.coat.second ?? this.coat.base]).lineBetween(x1, y1, x2, y2);
        }
        // Лапи дриґають на всі боки.
        for (const k of [0, 1, 2]) {
          const pa = spin * 1.6 + k * 2.1 + Math.sin(time / 70 + k) * 0.4;
          const reach = r + (6 + Math.sin(time / 60 + k * 1.3) * 2) * s;
          const [x1, y1, x2, y2] = [ox + Math.cos(pa) * r * 0.6, oy + Math.sin(pa) * r * 0.6, ox + Math.cos(pa) * reach, oy + Math.sin(pa) * reach];
          g.lineStyle(5 * s + 2.5, COLORS.ink).lineBetween(x1, y1, x2, y2);
          g.lineStyle(5 * s, limb).lineBetween(x1, y1, x2, y2);
          g.fillStyle(pawColor).fillEllipse(x2, y2, 6.5 * s, 5 * s);
          g.lineStyle(1.5, COLORS.ink).strokeEllipse(x2, y2, 6.5 * s, 5 * s);
        }
        // Куля настовбурченої шерсті.
        const n = 18;
        const puff: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < n; i++) {
          const a = spin * 0.7 + (Math.PI * 2 * i) / n;
          const fur = i % 2 === 1 ? 1.14 : 1;
          puff.push(new Phaser.Math.Vector2(ox + Math.cos(a) * r * fur, oy + Math.sin(a) * r * fur * 0.9));
        }
        g.fillStyle(body).fillPoints(puff, true);
        this.patches(g, ox, oy, r * 1.7, r * 1.5);
        if (this.coat.tabby) this.stripes(g, ox, oy, r * 1.3, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokePoints(puff, true);
        // Проблиски вух і очей.
        const ha = -Math.PI / 2 + Math.sin(time / 200 + cat.id) * 0.9;
        if (Math.sin(time / 140 + cat.id * 1.7) > 0.1) {
          const ex = ox + Math.cos(ha) * r * 0.75;
          const ey = oy + Math.sin(ha) * r * 0.75;
          const tall = this.shape.ears === "folded" ? 3 : this.shape.ears === "large" || this.shape.ears === "tufted" ? 8 : 6;
          g.fillStyle(this.coat.pointed ? point : body);
          for (const side of [-1, 1]) g.fillTriangle(ex + side * 1 * s, ey, ex + side * 6 * s, ey + 1 * s, ex + side * 5 * s, ey - tall * s);
          g.lineStyle(1.5, COLORS.ink);
          for (const side of [-1, 1]) g.strokeTriangle(ex + side * 1 * s, ey, ex + side * 6 * s, ey + 1 * s, ex + side * 5 * s, ey - tall * s);
        }
        if (Math.sin(time / 95 + cat.id * 2.3) > 0.6) {
          const ex = ox + Math.cos(ha) * r * 0.35;
          const ey = oy + Math.sin(ha) * r * 0.35 + 3 * s;
          g.fillStyle(EYES[this.coat.eyes]).fillCircle(ex - 2.6 * s, ey, 2.2 * s).fillCircle(ex + 2.6 * s, ey, 2.2 * s);
          g.fillStyle(COLORS.ink).fillEllipse(ex - 2.6 * s, ey, 0.9 * s, 3 * s).fillEllipse(ex + 2.6 * s, ey, 0.9 * s, 3 * s);
        }
        // Клапті шерсті летять навсібіч і тануть.
        for (const k of [0, 1, 2, 3]) {
          const cycle = time / 700 + k / 4 + cat.id * 0.13;
          const p = cycle - Math.floor(cycle);
          const fa = k * 1.7 + cat.id + Math.floor(cycle) * 2.3;
          const fx = mx + Math.cos(fa) * (r + p * 22 * s);
          const fy = cy + Math.sin(fa) * (r * 0.6 + p * 12 * s) - p * 8 * s;
          g.fillStyle(limb, 0.9 * (1 - p)).fillEllipse(fx, fy, 6 * s, 4 * s);
          g.lineStyle(1.2, COLORS.ink, 0.6 * (1 - p)).strokeEllipse(fx, fy, 6 * s, 4 * s);
        }
        this.head = { x: mx, y: top - 6 * s };
        this.back = { x: mx, y: cy };
        return;
      }
      case "paw": {
        // Ігрова боротьба, зверху (§9.4, «Пози стосунків», 4; заглушка до кроку 16): стоїть над другом, що лежить на спині, —
        // тіло відсунуте назад, голова піднята, передня лапа піднята й легенько б'є згори вниз по голові й грудях друга; очі
        // круглі, вуха вперед, хвіст угору й мотається. Поверх того, хто знизу.
        g.setDepth(feet.depth + 0.01);
        const bx = x - dir * 10 * s;
        const limb = this.coat.pointed ? point : body;
        const pawColor = this.coat.white >= 1 ? WHITE : limb;
        this.tail(g, bx - dir * 14 * s + Math.sin(time / 210 + cat.id) * 2 * s, y - 15 * s, s, dir, "up");
        g.fillStyle(limb);
        for (const lx of [-9, -3, 7]) g.fillRoundedRect(bx + dir * lx * s - 2, y - 9 * s, 4 * s, 10 * s, 2);
        g.fillStyle(body).fillEllipse(bx, y - 16 * s, 30 * s * fw, 15 * s * fh);
        this.patches(g, bx, y - 16 * s, 30 * s * fw, 15 * s * fh);
        if (this.coat.tabby) this.stripes(g, bx, y - 16 * s, 24 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(bx, y - 16 * s, 30 * s * fw, 15 * s * fh);
        this.headAt(g, bx + dir * 14 * s, y - 29 * s, s, dir, body, point);
        // Піднята лапа б'є згори вниз.
        const bat = Math.abs(Math.sin(time / 170 + cat.id)) * 8 * s;
        const [sx, sy, px, py] = [bx + dir * 10 * s, y - 19 * s, bx + dir * 22 * s, y - 13 * s - bat];
        g.lineStyle(4.5 * s + 2.5, COLORS.ink).lineBetween(sx, sy, px, py);
        g.lineStyle(4.5 * s, limb).lineBetween(sx, sy, px, py);
        g.fillStyle(pawColor).fillEllipse(px, py, 6 * s, 5 * s);
        g.lineStyle(1.5, COLORS.ink).strokeEllipse(px, py, 6 * s, 5 * s);
        this.back = { x: bx, y: y - 22 * s };
        return;
      }
      case "kick": {
        // Ігрова боротьба, знизу (§9.4, «Пози стосунків», 4; заглушка до кроку 16): на спині, світлий живіт, чотири лапи догори
        // дриґають — повільніше, ніж у «клубку бійки», голова до другого (тіло відсунуте від нього, щоб морду було видно під його
        // лапою), хвіст мотається.
        const bx = x - dir * 10 * s;
        const kick = (phase: number): number => Math.sin(time / 160 + phase + cat.id) * 3.5 * s;
        const rock = Math.sin(time / 330 + cat.id) * 2 * s;
        const limb = this.coat.pointed ? point : body;
        const pawColor = this.coat.white >= 1 ? WHITE : limb;
        this.tail(g, bx - dir * 15 * s, y - 5 * s, s, dir, "rest");
        for (const [i, lx] of [-10, -4, 4, 10].entries()) {
          const lx2 = bx + rock + lx * s;
          const top = y - 22 * s + kick(i * 1.7);
          g.lineStyle(4 * s + 2.5, COLORS.ink).lineBetween(lx2, y - 12 * s, lx2, top);
          g.lineStyle(4 * s, limb).lineBetween(lx2, y - 12 * s, lx2, top);
          g.fillStyle(pawColor).fillEllipse(lx2, top, 5 * s, 4 * s);
          g.lineStyle(1.2, COLORS.ink).strokeEllipse(lx2, top, 5 * s, 4 * s);
        }
        g.fillStyle(body).fillEllipse(bx + rock * 0.6, y - 9 * s, 32 * s * fw, 14 * s * fh);
        g.fillStyle(WHITE, 0.6).fillEllipse(bx + rock * 0.6, y - 11 * s, 20 * s, 7 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(bx + rock * 0.6, y - 9 * s, 32 * s * fw, 14 * s * fh);
        this.headAt(g, bx + dir * 17 * s + rock * 0.3, y - 9 * s, s, dir, body, point);
        this.back = { x: bx - dir * 2 * s, y: y - 14 * s };
        return;
      }
      case "belly": {
        // На спині: світлий живіт, чотири лапки догори, голова збоку — так і хочеться погладити (§9.12).
        this.tail(g, x - dir * 15 * s, y - 6 * s, s, dir, "rest");
        g.fillStyle(this.coat.pointed ? point : body);
        for (const lx of [-10, -4, 4, 10]) g.fillRoundedRect(x + lx * s - 2, y - 22 * s, 4 * s, 9 * s, 2);
        g.fillStyle(body).fillEllipse(x, y - 9 * s, 32 * s * fw, 14 * s * fh);
        g.fillStyle(WHITE, 0.6).fillEllipse(x, y - 11 * s, 20 * s, 7 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 9 * s, 32 * s * fw, 14 * s * fh);
        this.headAt(g, x + dir * 17 * s, y - 11 * s, s, dir, body, point);
        this.back = { x: x - dir * 2 * s, y: y - 14 * s };
        return;
      }
      case "roll": {
        // Катається по м'яті (§9.12): на спині, лапи дриґають, тіло перевалюється з боку на бік, голова закинута.
        const rock = Math.sin(time / 260) * 5 * s;
        const kick = (phase: number): number => Math.sin(time / 120 + phase) * 3 * s;
        this.tail(g, x - dir * 15 * s, y - 5 * s, s, dir, "rest");
        g.fillStyle(this.coat.pointed ? point : body);
        for (const [i, lx] of [-10, -4, 4, 10].entries()) g.fillRoundedRect(x + rock + lx * s - 2, y - 22 * s + kick(i), 4 * s, 9 * s, 2);
        g.fillStyle(body).fillEllipse(x + rock * 0.6, y - 9 * s, 32 * s * fw, 14 * s * fh);
        g.fillStyle(WHITE, 0.6).fillEllipse(x + rock * 0.6, y - 11 * s, 20 * s, 7 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x + rock * 0.6, y - 9 * s, 32 * s * fw, 14 * s * fh);
        this.headAt(g, x + dir * 17 * s + rock * 0.3, y - 9 * s, s, dir, body, point);
        this.back = { x: x - dir * 2 * s, y: y - 14 * s };
        return;
      }
      case "sleep": {
        // Клубочок із хвостом довкола.
        g.fillStyle(body).fillEllipse(x, y - 9 * s, 34 * s * fw, 20 * s * fh);
        this.patches(g, x, y - 9 * s, 34 * s * fw, 20 * s * fh);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 9 * s, 34 * s * fw, 20 * s * fh);
        g.lineStyle(5 * s, this.coat.pointed ? point : body).beginPath().arc(x, y - 8 * s, 15 * s, 0.2, 2.4).strokePath();
        this.ears(g, x + dir * 9 * s, y - 16 * s, s * 0.85, dir, point);
        // Сопе лише той, хто спить: кіт біля столу просто лежить.
        const sleeping = cat.act.kind === "sleep" || cat.act.kind === "lap";
        if (sleeping && Math.floor(time / 900 + cat.id) % 2 === 0) g.fillStyle(COLORS.ink, 0.5).fillCircle(x + dir * 14 * s, y - 26 * s, 2);
        this.head = { x, y: y - 26 * s };
        return;
      }
      case "blanket": {
        // Під ковдрою (§9.12, «Теплолюбність»): горбик ковдри на ліжку, з-під якого стирчать вушка й кінчик хвоста.
        this.ears(g, x + dir * 9 * s, y - 13 * s, s * 0.8, dir, point);
        g.fillStyle(BLANKET).fillEllipse(x, y - 8 * s, 38 * s * fw, 18 * s * fh);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 8 * s, 38 * s * fw, 18 * s * fh);
        g.lineStyle(1.5, COLORS.ink, 0.35).lineBetween(x - 9 * s, y - 14 * s, x - 3 * s, y - 3 * s).lineBetween(x + 4 * s, y - 15 * s, x + 9 * s, y - 4 * s);
        g.lineStyle(4 * s, this.coat.pointed ? point : body).lineBetween(x - dir * 18 * s, y - 4 * s, x - dir * 25 * s, y - 2 * s);
        this.head = { x, y: y - 26 * s };
        return;
      }
      case "sprawl": {
        // Розпластався на прохолодній плитці (§9.12, «Теплолюбність»): лежить на боці, лапи витягнуті, очі заплющені.
        this.tail(g, x - dir * 19 * s, y - 4 * s, s, dir, "rest");
        const pawColor = this.coat.white >= 1 ? WHITE : this.coat.pointed ? point : body;
        g.fillStyle(pawColor);
        for (const lx of [-15, -9, 7, 13]) g.fillRoundedRect(x + dir * lx * s - (dir < 0 ? 9 * s : 0), y - 3 * s, 9 * s, 3.5 * s, 1.5);
        g.fillStyle(body).fillEllipse(x, y - 6 * s, 40 * s * fw, 12 * s * fh);
        this.patches(g, x, y - 6 * s, 40 * s * fw, 12 * s * fh);
        if (this.coat.tabby) this.stripes(g, x, y - 6 * s, 30 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 6 * s, 40 * s * fw, 12 * s * fh);
        const hx = x + dir * 22 * s;
        const hy = y - 7 * s;
        this.ears(g, hx, hy, s * 0.9, dir, point);
        g.fillStyle(this.coat.pointed ? point : body).fillCircle(hx, hy, 8 * s);
        g.lineStyle(2.5, COLORS.ink).strokeCircle(hx, hy, 8 * s);
        g.lineStyle(1.5, COLORS.ink);
        for (const ox of [-2.6, 2.6]) g.beginPath().arc(hx + dir * 2 * s + ox * s, hy - 1 * s, 1.8 * s, 0.2, Math.PI - 0.2).strokePath();
        this.head = { x: hx, y: hy - 16 * s };
        return;
      }
      case "carrier": {
        // Спить у переносці (§9.12): крізь віконце дверцят видно клубочок шерсті й вушко, поверх — ґратки.
        const door = toScreen(CARRIER_SPOT);
        g.setDepth(depthOf(door.y) + 0.5);
        g.fillStyle(body).fillEllipse(door.x, door.y - 9, 18, 10);
        this.patches(g, door.x, door.y - 9, 18, 10);
        g.fillStyle(this.coat.pointed ? point : body).fillTriangle(door.x + 2, door.y - 13, door.x + 7, door.y - 13, door.x + 5, door.y - 16);
        g.lineStyle(1.5, 0xd8d4cc).lineBetween(door.x - 5, door.y - 16, door.x - 5, door.y - 4).lineBetween(door.x, door.y - 16, door.x, door.y - 4).lineBetween(door.x + 5, door.y - 16, door.x + 5, door.y - 4);
        this.head = { x: door.x, y: door.y - 30 };
        return;
      }
      case "hide": {
        // З-під меблів видно лише очі й кінчик хвоста.
        g.fillStyle(COLORS.ink, 0.55).fillEllipse(x, y - 4, 26 * s, 10 * s);
        g.fillStyle(EYES[this.coat.eyes]).fillCircle(x - 4 * s, y - 5, 2.4).fillCircle(x + 4 * s, y - 5, 2.4);
        this.head = { x, y: y - 14 };
        return;
      }
      case "scratch": {
        // Точить кігті (§9.12): стоїть на задніх лапах, витягнувшись угору, і по черзі дере передніми.
        this.tail(g, x - dir * 8 * s, y - 3 * s, s, dir, "rest");
        g.fillStyle(body).fillEllipse(x, y - 17 * s, 17 * s * fw, 32 * s * fh);
        this.patches(g, x, y - 17 * s, 17 * s * fw, 32 * s * fh);
        if (this.coat.tabby) this.stripes(g, x, y - 18 * s, 14 * s, stripe, false);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 17 * s, 17 * s * fw, 32 * s * fh);
        this.headAt(g, x + dir * 2 * s, y - 37 * s, s, dir, body, point);
        const pawColor = this.coat.white >= 1 ? WHITE : this.coat.pointed ? point : body;
        const claw = Math.sin(time / 80) * 4 * s;
        g.fillStyle(pawColor).fillEllipse(x + dir * 9 * s, y - 30 * s + claw, 5 * s, 7 * s).fillEllipse(x + dir * 10 * s, y - 26 * s - claw, 5 * s, 7 * s);
        g.lineStyle(1.5, COLORS.ink).strokeEllipse(x + dir * 9 * s, y - 30 * s + claw, 5 * s, 7 * s).strokeEllipse(x + dir * 10 * s, y - 26 * s - claw, 5 * s, 7 * s);
        this.back = { x: x - dir * 3 * s, y: y - 24 * s };
        return;
      }
      case "stretch": {
        // Потягується на килимку (§9.12, «Дряпання»): зад піднятий, передні лапи далеко вперед і по черзі шкрябають килим.
        this.tail(g, x - dir * 13 * s, y - 20 * s, s, dir, "up");
        g.fillStyle(this.coat.pointed ? point : body);
        for (const lx of [-10, -5] as const) g.fillRoundedRect(x + dir * lx * s - 2, y - 12 * s, 4 * s, 13 * s, 2);
        g.fillStyle(body).fillEllipse(x - dir * 5 * s, y - 15 * s, 22 * s * fw, 13 * s * fh).fillEllipse(x + dir * 6 * s, y - 9 * s, 20 * s * fw, 11 * s * fh);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x - dir * 5 * s, y - 15 * s, 22 * s * fw, 13 * s * fh);
        const scrape = Math.sin(time / 110) * 3 * s;
        const pawColor = this.coat.white >= 1 ? WHITE : this.coat.pointed ? point : body;
        g.fillStyle(pawColor).fillEllipse(x + dir * (20 * s + scrape), y - 1, 7 * s, 4 * s).fillEllipse(x + dir * (17 * s - scrape), y + 1, 7 * s, 4 * s);
        this.headAt(g, x + dir * 13 * s, y - 11 * s, s, dir, body, point);
        this.back = { x: x - dir * 5 * s, y: y - 20 * s };
        return;
      }
      case "crouch": {
        // Засідка (§9.12): тіло притиснуте до підлоги, зад трохи піднятий і виляє, хвіст низько смикається, голова вперед.
        const wiggle = Math.sin(time / 55) * 2 * s;
        this.tail(g, x - dir * 15 * s + wiggle, y - 4 * s, s, dir, "rest");
        g.fillStyle(this.coat.pointed ? point : body);
        for (const lx of [-9, 8]) g.fillRoundedRect(x + dir * lx * s - 3, y - 4 * s, 6 * s, 4 * s, 2);
        g.fillStyle(body).fillEllipse(x - dir * 3 * s + wiggle * 0.5, y - 9 * s, 30 * s * fw, 11 * s * fh);
        this.patches(g, x - dir * 3 * s, y - 9 * s, 30 * s * fw, 11 * s * fh);
        if (this.coat.tabby) this.stripes(g, x - dir * 3 * s, y - 9 * s, 24 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x - dir * 3 * s + wiggle * 0.5, y - 9 * s, 30 * s * fw, 11 * s * fh);
        this.headAt(g, x + dir * 14 * s, y - 10 * s, s, dir, body, point);
        this.back = { x: x - dir * 4 * s, y: y - 14 * s };
        return;
      }
      case "walk":
      case "mark": {
        // Тягне паперову стрічку з ванної (§9.12, «Мисливський інстинкт»): вона в'ється за котом від морди.
        if (cat.act.kind === "wander" && cat.act.target === "paper") {
          const wave = Math.sin(time / 120) * 3;
          g.lineStyle(4, 0xf8f6f0).beginPath().moveTo(x + dir * 18 * s, y - 18 * s).lineTo(x - dir * 6 * s, y - 2 + wave).lineTo(x - dir * 22 * s, y + 1 - wave).lineTo(x - dir * 38 * s, y + wave).strokePath();
        }
        // Тіло горизонтально, голова попереду, хвіст угору; той, хто мітить, стоїть, і піднятий хвіст тремтить (§9.12).
        g.fillStyle(this.coat.pointed ? point : body);
        for (const lx of [-9, -3, 6, 11]) g.fillRoundedRect(x + lx * s - 2, y - 8 * s, 4 * s, 9 * s, 2);
        // Сумний кіт і в ході тримає хвіст донизу.
        const tremble = pose === "mark" ? Math.sin(time / 25) * 1.5 * s : 0;
        this.tail(g, x - dir * 15 * s + tremble, y - 15 * s, s, dir, sad && pose === "walk" ? "down" : "up");
        g.fillStyle(body).fillEllipse(x, y - 14 * s, 32 * s * fw, 15 * s * fh);
        this.patches(g, x, y - 14 * s, 32 * s * fw, 15 * s * fh);
        if (this.coat.tabby) this.stripes(g, x, y - 14 * s, 26 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 14 * s, 32 * s * fw, 15 * s * fh);
        this.headAt(g, x + dir * 15 * s, y - 22 * s, s, dir, body, point);
        this.inMouth(g, cat, x + dir * 21 * s, y - 15 * s, s);
        return;
      }
      case "lie": {
        // «Не хоче гратися» (§9.4, «Пози стосунків», 6; заглушка до кроку 16): лежить «буханцем» — низьке тіло з підібраними
        // лапками, голова піднята до того, хто кликав, очі розплющені, а хвіст лежить позаду й швидко сіпається.
        this.lash = Math.sin(time / 55 + cat.id);
        this.tail(g, x - dir * 14 * s, y - 4 * s, s, dir, "rest");
        g.fillStyle(body).fillEllipse(x, y - 8 * s, 32 * s * fw, 15 * s * fh);
        this.patches(g, x, y - 8 * s, 32 * s * fw, 15 * s * fh);
        if (this.coat.tabby) this.stripes(g, x - dir * 3 * s, y - 9 * s, 22 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 8 * s, 32 * s * fw, 15 * s * fh);
        const pawColor = this.coat.white >= 1 ? WHITE : this.coat.pointed ? point : body;
        g.fillStyle(pawColor).fillEllipse(x + dir * 12 * s, y - 1.5 * s, 7 * s, 3.5 * s).fillEllipse(x + dir * 7 * s, y - 1 * s, 7 * s, 3.5 * s);
        this.headAt(g, x + dir * 12 * s, y - 17 * s, s, dir, body, point);
        this.back = { x: x - dir * 4 * s, y: y - 14 * s };
        return;
      }
      case "carried":
      case "sit":
      case "eat":
      case "bury":
      case "groom":
      case "lick":
      case "cough": {
        // Кахикає: витягає шию вперед і смикається.
        const jerk = pose === "cough" ? Math.abs(Math.sin(time / 90)) * 3 * s : 0;
        // Вилизує друга (§9.4, «Вилизує іншого»): голова тягнеться вперед, до щоки й шиї друга, і погойдується в ритмі лизання;
        // поверх друга.
        const lick = pose === "lick" ? Math.max(0, Math.sin(time / 150 + cat.id)) : 0;
        if (pose === "lick") g.setDepth(feet.depth + 0.01);
        const hx = x + dir * (3 + (pose === "cough" ? 5 : pose === "lick" ? 11 + 2 * lick : 0)) * s + dir * jerk;
        // Сумний кіт опускає голову; той, хто їсть чи гребе лапою (корм біля миски, наповнювач у лотку), — до самої підлоги;
        // хто вмивається — хитає головою.
        const headY =
          pose === "eat"
            ? y - 8 * s
            : pose === "bury"
              ? y - 12 * s
              : pose === "cough"
                ? y - 18 * s
                : pose === "groom"
                  ? y - 30 * s + Math.sin(time / 160) * 1.5 * s
                  : pose === "lick"
                    ? y - (28 + 2 * lick) * s
                    : y - (sad ? 29 : 33) * s;
        this.tail(g, x - dir * 10 * s, y - 4 * s, s, dir, "rest");
        g.fillStyle(body).fillEllipse(x, y - 13 * s, 22 * s * fw, 26 * s * fh);
        this.patches(g, x, y - 13 * s, 22 * s * fw, 26 * s * fh);
        if (this.coat.tabby) this.stripes(g, x, y - 15 * s, 18 * s, stripe, false);
        // Біла грудка — спереду: у кота, що сидить спиною, її не видно.
        if (this.coat.white >= 1 && look?.back !== true) g.fillStyle(WHITE).fillEllipse(x + dir * 3 * s, y - 13 * s, 9 * s, 14 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 13 * s, 22 * s * fw, 26 * s * fh);
        // Передні лапки: у грі — догори, ловлять пір'їнку; задоволений на руках топчеться — лапки по черзі (§9.12).
        const paws = interaction === "play" ? y - 30 * s : y - 1;
        const reach = interaction === "play" ? dir * 6 * s : 0;
        const kneading = pose === "carried" && feeling === "content";
        const knead = (phase: number): number => (kneading ? -Math.max(0, Math.sin(time / 180 + phase)) * 3 * s : 0);
        const pawColor = this.coat.white >= 1 ? WHITE : this.coat.pointed ? point : body;
        // Гребе: передня лапка (з боку морди) ходить уперед-назад по підлозі.
        const scrape = pose === "bury" ? dir * (4 + Math.sin(time / 110) * 5) * s : 0;
        g.fillStyle(pawColor).fillEllipse(x - 3 * s + reach, paws + knead(0), 6 * s, 4 * s);
        if (pose !== "groom") g.fillEllipse(x + 5 * s + reach + scrape, paws + knead(Math.PI), 6 * s, 4 * s);
        // Ласкавий бодається головою: голова раз у раз подається вперед, до руки (§9.12).
        const nudge = look?.nudge === true ? dir * Math.max(0, Math.sin(time / 170)) * 4 * s : 0;
        this.headAt(g, hx + nudge + (feeling === "struggling" ? Math.sin(time / 50) * 2 : 0), headY - Math.abs(nudge) * 0.4, s, dir, body, point);
        // Вмивається: лапка піднята до рота й ходить угору-вниз — поверх морди.
        if (pose === "groom") {
          g.fillStyle(pawColor).fillEllipse(hx + dir * 5 * s, headY + (6 + Math.sin(time / 160) * 2) * s, 5 * s, 7 * s);
          g.lineStyle(1.5, COLORS.ink).strokeEllipse(hx + dir * 5 * s, headY + (6 + Math.sin(time / 160) * 2) * s, 5 * s, 7 * s);
        }
        this.back = { x: x - dir * 4 * s, y: y - 22 * s };
        if (pose === "sit") this.inMouth(g, cat, hx + dir * 5 * s, headY + 7 * s, s);
        return;
      }
    }
  }

  /**
   * Розмір кота на екрані. Дорослий кіт — приблизно до пояса персонажу; кошеня менше. Розмір породи (§9.11) — ±6% за одиницю.
   * Кошеня помітно менше й підростає щотижня: новонароджене — 0,4 дорослого, тижневе — 0,55, двотижневе — 0,65 (правка автора
   * 2026-10-21).
   */
  private scaleOf(cat: Cat): number {
    const age = cat.ageWeeks === 0 ? 0.4 : isKitten(cat) ? 0.45 + 0.1 * cat.ageWeeks : 1;
    const size = 1 + 0.06 * traitLevel(cat, "size");
    return 1.25 * age * size * (cat.shape.build === "stocky" ? 1.08 : cat.shape.build === "slim" ? 0.94 : 1);
  }

  /** Річ у зубах (§9.12, «Подарунки й схованки»): іграшка чи ваша шкарпетка, поки кіт її несе. */
  private inMouth(g: Phaser.GameObjects.Graphics, cat: Cat, x: number, y: number, s: number): void {
    const act = cat.act;
    if (act.kind !== "carry" || act.picked !== true || act.dropped === true) return;
    if (act.carry === "sock") drawSock(g, x, y + 4 * s, 0.7 * s);
    else drawToy(g, this.mouthToy, x, y + 2 * s, 0.6 * s);
  }

  private headAt(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, body: number, point: number): void {
    const feeling = this.feeling;
    const r = 9 * s * (this.shape.muzzle === "long" ? 0.95 : 1);
    this.ears(g, x, y, s, dir, point);
    g.fillStyle(this.coat.pointed ? point : body).fillCircle(x, y, r);
    if (this.coat.second) g.fillStyle(PIGMENT[this.coat.second]).fillCircle(x - dir * 3 * s, y - 2 * s, r * 0.55);
    if (this.coat.white >= 2 && this.look?.back !== true) g.fillStyle(WHITE).fillEllipse(x + dir * 2 * s, y + 3 * s, r * 1.1, r * 0.9);
    g.lineStyle(2.5, COLORS.ink).strokeCircle(x, y, r);
    if (this.coat.long) g.lineStyle(2, COLORS.ink, 0.6).strokeCircle(x, y, r + 2.5 * s);
    // Спиною до персонажа — потилиця: ні очей, ні носа (§9.12, «Образливість»).
    if (this.look?.back === true) {
      this.head = { x, y: y - r - 8 * s };
      return;
    }
    const ex = x + dir * 3 * s;
    if (this.threat) {
      // Перед ворогом (§9.4, «Спина дугою»): очі широко розплющені, зіниці-щілинки, брови насуплені.
      const brow = isDark(this.coat.pointed ? point : body) ? DARK_LID : COLORS.ink;
      for (const side of [-1, 1]) {
        const cx = ex + side * 2.8 * s;
        g.fillStyle(EYES[this.coat.eyes]).fillCircle(cx, y - 1 * s, 2.5 * s);
        g.lineStyle(1.2, COLORS.ink).strokeCircle(cx, y - 1 * s, 2.5 * s);
        g.fillStyle(COLORS.ink).fillEllipse(cx, y - 1 * s, 1 * s, 3.6 * s);
        g.lineStyle(Math.max(1, 1.3 * s), brow).lineBetween(cx + side * 2.6 * s, y - 4.8 * s, cx - side * 1.8 * s, y - 3.4 * s);
      }
      if (this.hissing) {
        // Шипить: рот відкритий, видно ікла.
        g.fillStyle(MOUTH).fillEllipse(ex + dir * 0.5 * s, y + 5.4 * s, 4.6 * s, 3.2 * s);
        g.fillStyle(0xffffff).fillTriangle(ex - 1.6 * s, y + 4 * s, ex - 0.6 * s, y + 4 * s, ex - 1.1 * s, y + 5.6 * s).fillTriangle(ex + 0.9 * s, y + 4 * s, ex + 1.9 * s, y + 4 * s, ex + 1.4 * s, y + 5.6 * s);
      }
    } else if (feeling === "content") {
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
      // Повіки (§11.4): сумний кіт дивиться з-під напівзаплющених, відданий повільно моргає до персонажа; той, хто вилизує
      // друга, — з напівзаплющеними очима (§9.4).
      const lid = Math.max(this.look?.sad ? SAD_LID : 0, this.look?.blink ?? 0, this.licking ? LICK_LID : 0);
      const er = 2.2 * s;
      if (lid > 0) {
        // Видно нижню частину ока, а над нею — рівна повіка; заплющене око — повіка внизу ока.
        const half = er * (1 - lid);
        const line = isDark(this.coat.pointed ? point : body) ? DARK_LID : COLORS.ink;
        const width = Math.max(1, 1.2 * s);
        for (const side of [-1, 1]) {
          const cx = ex + side * 2.6 * s;
          const cy = y - 1 * s + er * lid;
          if (half > 0.3) {
            g.fillStyle(EYES[this.coat.eyes]).fillEllipse(cx, cy, 2 * er, 2 * half);
            g.fillStyle(COLORS.ink).fillEllipse(cx, cy, 2 * s, Math.min(2 * s, 2 * half));
          }
          g.lineStyle(width, line).lineBetween(cx - er, cy - half, cx + er, cy - half);
          // Сумний — брівки будиночком: до носа вище, як на іконці смутку.
          if (this.look?.sad) g.lineBetween(cx + side * er, cy - half - 1.4 * s, cx - side * er * 0.4, cy - half - 2.8 * s);
        }
      } else {
        g.fillStyle(EYES[this.coat.eyes]).fillCircle(ex - 2.6 * s, y - 1 * s, er).fillCircle(ex + 2.6 * s, y - 1 * s, er);
        g.fillStyle(COLORS.ink).fillCircle(ex - 2.6 * s, y - 1 * s, 1 * s).fillCircle(ex + 2.6 * s, y - 1 * s, 1 * s);
      }
    }
    g.fillStyle(0xd88a8a).fillTriangle(ex - 1.4 * s, y + 2.5 * s, ex + 1.4 * s, y + 2.5 * s, ex, y + 4 * s);
    // Язичок того, хто вилизує друга (§9.4): висовується з-під носа вперед.
    if (this.licking) {
      g.fillStyle(TONGUE).fillEllipse(ex + dir * 2.2 * s, y + 5.2 * s, 3 * s, 2.2 * s);
      g.lineStyle(1, COLORS.ink, 0.7).strokeEllipse(ex + dir * 2.2 * s, y + 5.2 * s, 3 * s, 2.2 * s);
    }
    this.head = { x, y: y - r - 8 * s };
  }

  private ears(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, color: number): void {
    const shape = this.shape.ears;
    const big = shape === "large" || shape === "tufted" ? 1.3 : 1;
    // Невдоволений чи переляканий кіт притискає вуха (§9.12).
    const folded = shape === "folded" || this.feeling === "struggling" || this.feeling === "reluctant";
    // Сумний кіт опускає вуха вбік (§11.4).
    const droop = !folded && !this.threat && this.look?.sad === true;
    // Перед ворогом (§9.4, «Спина дугою») вуха притиснуті вбік і назад: з-за голови стирчать лише кінчики.
    const flat = !folded && this.threat;
    g.fillStyle(color);
    for (const side of [-1, 1]) {
      const bx = x + side * 5 * s + dir;
      if (droop) {
        // Опущене вухо звисає вбік і трохи вниз; основу ховає голова, видно саме вухо кольору шерсті.
        const tx = bx + side * 9 * s * big;
        const ty = y + 1 * s;
        g.fillTriangle(bx - side * 1 * s, y - 8 * s, bx + side * 4 * s, y - 3 * s, tx, ty);
        g.lineStyle(2, COLORS.ink).strokeTriangle(bx - side * 1 * s, y - 8 * s, bx + side * 4 * s, y - 3 * s, tx, ty);
      } else if (folded) {
        g.fillTriangle(bx - 3 * s, y - 6 * s, bx + 3 * s, y - 6 * s, bx + side * 4 * s, y - 2 * s);
      } else if (flat) {
        const tx = bx + side * 7 * s * big - dir * 2 * s;
        const ty = y - 8 * s - (big - 1) * 3 * s;
        g.fillTriangle(bx - 3 * s, y - 5 * s, bx + 3 * s, y - 6 * s, tx, ty);
        g.lineStyle(2, COLORS.ink).strokeTriangle(bx - 3 * s, y - 5 * s, bx + 3 * s, y - 6 * s, tx, ty);
      } else {
        g.fillTriangle(bx - 4 * s, y - 5 * s, bx + 4 * s, y - 5 * s, bx + side * 1 * s, y - (12 + 4 * (big - 1) * 3) * s);
        g.lineStyle(2, COLORS.ink).strokeTriangle(bx - 4 * s, y - 5 * s, bx + 4 * s, y - 5 * s, bx + side * 1 * s, y - (12 + 4 * (big - 1) * 3) * s);
      }
    }
  }

  /**
   * Хвіст: «up» — трубою в ході, «rest» — лежить біля сидячого (смикається), «down» — опущений у сумного, «puff» — піднятий,
   * настовбурчений і товщий перед ворогом (§9.4, «Спина дугою»).
   */
  private tail(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, pose: "up" | "rest" | "down" | "puff"): void {
    const shape = this.shape.tail;
    if (shape === "none") return;
    const length = shape === "bobtail" ? 0.3 : shape === "short" ? 0.6 : 1;
    const width = (shape === "fluffy" || this.coat.long ? 7 : 4.5) * s * (pose === "puff" ? 1.7 : 1);
    if (pose === "puff") {
      // Пухнастий хвіст трубою — ланцюжок кружечків із контуром: настовбурчена шерсть, а не палиця.
      const color = this.coat.pointed ? PIGMENT[this.coat.base] : PIGMENT[this.coat.second ?? this.coat.base];
      const tx = x - dir * 5 * s * length;
      const ty = y - 22 * s * length;
      const steps = 6;
      const blobs = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        return { x: x + (tx - x) * t - dir * Math.sin(t * Math.PI) * 2 * s, y: y + (ty - y) * t, r: (width / 2) * (i % 2 === 1 ? 1.15 : 1) * (t > 0.85 ? 0.8 : 1) };
      });
      g.fillStyle(COLORS.ink);
      for (const b of blobs) g.fillCircle(b.x, b.y, b.r + 1.3);
      g.fillStyle(color);
      for (const b of blobs) g.fillCircle(b.x, b.y, b.r);
      return;
    }
    const color = this.coat.pointed ? PIGMENT[this.coat.base] : PIGMENT[this.coat.second ?? this.coat.base];
    g.lineStyle(width, color);
    const tx = x - dir * 12 * s * length;
    const ty = pose === "up" ? y - 16 * s * length : pose === "down" ? y + 8 * s * length : y + 2 - (this.lash + 1) * 5 * s * length;
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
