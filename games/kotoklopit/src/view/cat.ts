// Кіт-заглушка (§11.3): простий силует із забарвленням за генами (§9.10), що вже показує пози —
// іде, сидить, їсть, спить клубочком, ховається. Згодом його замінить конструктор із частин (крок 16).

import Phaser from "phaser";

import { isKitten, traitLevel } from "../sim/cat";
import { coatOf, type Coat, type Pigment } from "../sim/genetics";
import { CARRIER_SPOT, HIGH_PLACES, objectAt } from "../sim/home";
import type { Cat, GameState } from "../sim/types";
import type { CatFeeling } from "../sim/actions";
import { objectHeight } from "./apartment";
import { drawSock, drawToy } from "./catcorner";
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
/** На скільки пікселів кіт, що їсть чи п'є з миски, сидить за нею (§9.12): корм у мисці видно спереду. */
const BOWL_BEHIND = 9;

const shade = (color: number, k: number): number => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(Math.round(c.red * k), Math.round(c.green * k), Math.round(c.blue * k));
};

export type CatPose = "walk" | "sit" | "eat" | "sleep" | "hide" | "carried" | "belly" | "bury" | "groom" | "mark" | "cough" | "scratch" | "stretch" | "carrier" | "crouch";

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

/** Поза за дією кота. */
export function poseOf(cat: Cat, carried: boolean): CatPose {
  const act = cat.act;
  // На колінах кіт спить клубочком; «Поважає роботу» так само лежить поруч зі столом (§9.12).
  if (act.kind === "lap" || (act.kind === "idle" && act.target === "desk" && act.goal === null)) return "sleep";
  if (carried) return "carried";
  if (act.goal !== null || act.kind === "toy" || act.kind === "zoomies" || act.kind === "wrestle" || act.kind === "fight") return "walk";
  // Спить у переносці (§9.12, «Переноска»): крізь дверцята видно клубочок шерсті.
  if (act.kind === "sleep" && act.target === "carrier") return "carrier";
  if (act.kind === "sleep") return "sleep";
  if (act.kind === "hide") return "hide";
  // У засідці (§9.12, «Засідки»): припав до підлоги й виляє задом.
  if (act.kind === "ambush") return "crouch";
  // Їсть, п'є, обнюхує дрібничку на столі чи нову річ (§9.12, «Скидання речей», «Допитливість»): голова донизу.
  const sniffing = (act.kind === "knock" && act.refused === true) || (act.kind === "idle" && (act.target?.startsWith("sniff:") === true || act.target?.startsWith("shun:") === true));
  // Гризе дріт чи пакет (§9.12, «Гризіння») — так само голова донизу.
  if (act.kind === "eat" || act.kind === "drink" || act.kind === "chew" || sniffing) return "eat";
  // Гребе лапою (§9.12): закопує корм біля миски.
  if (act.kind === "bury") return "bury";
  // Мітить: стоїть, задерши хвіст; кахикає: пригнувся й смикається (§9.12).
  if (act.kind === "mark") return "mark";
  if (act.kind === "cough") return "cough";
  // Точить кігті: стоїть на задніх лапах; на килимку — потягується, витягнувши лапи вперед (§9.12, «Дряпання»).
  if (act.kind === "scratch") return act.target === "rug" ? "stretch" : "scratch";
  // Лапає рулон туалетного паперу на стіні — так само на задніх лапах (§9.12, «Мисливський інстинкт»).
  if (act.kind === "unroll") return "scratch";
  // Вмивається сам — нервово чи після їди (§9.12): лапка біля рота.
  if (act.kind === "groom" && !act.target?.startsWith("cat:")) return "groom";
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
  /** Настрій з поведінки в цьому кадрі (§11.4): сумна поза чи повільне моргання. */
  private look: CatMoodLook | null = null;

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
   * притиснутими вухами. `look` — настрій з поведінки (§11.4): сумна поза чи повільне моргання до персонажа.
   * Показуй, а не розказуй (§11.3а).
   */
  draw(
    state: GameState,
    cat: Cat,
    time: number,
    carriedAt: { x: number; y: number; depth: number } | null,
    interaction: "pet" | "play" | null = null,
    feeling: CatFeeling | null = null,
    look: CatMoodLook | null = null,
  ): void {
    this.shape = cat.shape;
    // «Пастка на животику» й під рукою лежить животом догори — у цьому й пастка (§9.12).
    // Хто ховається нагорі — на холодильнику чи шафі (§9.12, «Лазіння»), — лежить там клубочком, а не визирає з-під низу.
    const onHigh = carriedAt === null && HIGH_PLACES.includes(objectAt(state, Math.floor(cat.x), Math.floor(cat.y))?.id ?? "");
    const base = look?.belly === true && carriedAt === null ? "belly" : interaction ? "sit" : poseOf(cat, carriedAt !== null);
    const pose = onHigh && base === "hide" ? "sleep" : base;
    this.feeling = feeling;
    this.look = look;
    this.lash = feeling === "reluctant" ? Math.sin(time / 70) : feeling === "struggling" ? Math.sin(time / 40) : 0;
    // Нерухомого кота не перемальовувати щокадру (§8.5): з десятками котів це головна робота кадру.
    const blinking = (look?.blink ?? 0) > 0 || look?.nudge === true;
    const key =
      pose === "walk" || pose === "bury" || pose === "groom" || pose === "mark" || pose === "cough" || pose === "scratch" || pose === "stretch" || pose === "crouch" || interaction || feeling || blinking
        ? null
        : `${pose}|${cat.x}|${cat.y}|${cat.facing}|${cat.away}|${carriedAt?.x}|${carriedAt?.y}|${Math.floor(time / 900)}|${cat.ageWeeks}|${look?.sad}|${look?.face}|${look?.belly}|${look?.back}`;
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
    // Дорослий кіт — приблизно до пояса персонажу; кошеня менше.
    // Розмір породи (§9.11) — ±6% за одиницю. Кошеня помітно менше й підростає щотижня:
    // новонароджене — 0,4 дорослого, тижневе — 0,55, двотижневе — 0,65 (правка автора 2026-10-21).
    const age = cat.ageWeeks === 0 ? 0.4 : isKitten(cat) ? 0.45 + 0.1 * cat.ageWeeks : 1;
    const size = 1 + 0.06 * traitLevel(cat, "size");
    const scale = 1.25 * age * size * (cat.shape.build === "stocky" ? 1.08 : cat.shape.build === "slim" ? 0.94 : 1);
    // Відданий кіт дивиться на персонажа, коли моргає до нього.
    const dir = look?.face ?? (cat.facing >= 0 ? 1 : -1);
    const sad = look?.sad === true;
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

    if (pose !== "carried" && pose !== "hide" && pose !== "carrier") g.fillStyle(0x000000, 0.22).fillEllipse(x, y, 34 * s, 9 * s);

    switch (pose) {
      case "belly": {
        // На спині: світлий живіт, чотири лапки догори, голова збоку — так і хочеться погладити (§9.12).
        this.tail(g, x - dir * 15 * s, y - 6 * s, s, dir, "rest");
        g.fillStyle(this.coat.pointed ? point : body);
        for (const lx of [-10, -4, 4, 10]) g.fillRoundedRect(x + lx * s - 2, y - 22 * s, 4 * s, 9 * s, 2);
        g.fillStyle(body).fillEllipse(x, y - 9 * s, 32 * s, 14 * s);
        g.fillStyle(WHITE, 0.6).fillEllipse(x, y - 11 * s, 20 * s, 7 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 9 * s, 32 * s, 14 * s);
        this.headAt(g, x + dir * 17 * s, y - 11 * s, s, dir, body, point);
        this.back = { x: x - dir * 2 * s, y: y - 14 * s };
        return;
      }
      case "sleep": {
        // Клубочок із хвостом довкола.
        g.fillStyle(body).fillEllipse(x, y - 9 * s, 34 * s, 20 * s);
        this.patches(g, x, y - 9 * s, 34 * s, 20 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 9 * s, 34 * s, 20 * s);
        g.lineStyle(5 * s, this.coat.pointed ? point : body).beginPath().arc(x, y - 8 * s, 15 * s, 0.2, 2.4).strokePath();
        this.ears(g, x + dir * 9 * s, y - 16 * s, s * 0.85, dir, point);
        // Сопе лише той, хто спить: кіт біля столу просто лежить.
        const sleeping = cat.act.kind === "sleep" || cat.act.kind === "lap";
        if (sleeping && Math.floor(time / 900 + cat.id) % 2 === 0) g.fillStyle(COLORS.ink, 0.5).fillCircle(x + dir * 14 * s, y - 26 * s, 2);
        this.head = { x, y: y - 26 * s };
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
        g.fillStyle(body).fillEllipse(x, y - 17 * s, 17 * s, 32 * s);
        this.patches(g, x, y - 17 * s, 17 * s, 32 * s);
        if (this.coat.tabby) this.stripes(g, x, y - 18 * s, 14 * s, stripe, false);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 17 * s, 17 * s, 32 * s);
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
        g.fillStyle(body).fillEllipse(x - dir * 5 * s, y - 15 * s, 22 * s, 13 * s).fillEllipse(x + dir * 6 * s, y - 9 * s, 20 * s, 11 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x - dir * 5 * s, y - 15 * s, 22 * s, 13 * s);
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
        g.fillStyle(body).fillEllipse(x - dir * 3 * s + wiggle * 0.5, y - 9 * s, 30 * s, 11 * s);
        this.patches(g, x - dir * 3 * s, y - 9 * s, 30 * s, 11 * s);
        if (this.coat.tabby) this.stripes(g, x - dir * 3 * s, y - 9 * s, 24 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x - dir * 3 * s + wiggle * 0.5, y - 9 * s, 30 * s, 11 * s);
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
        g.fillStyle(body).fillEllipse(x, y - 14 * s, 32 * s, 15 * s);
        this.patches(g, x, y - 14 * s, 32 * s, 15 * s);
        if (this.coat.tabby) this.stripes(g, x, y - 14 * s, 26 * s, stripe, true);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 14 * s, 32 * s, 15 * s);
        this.headAt(g, x + dir * 15 * s, y - 22 * s, s, dir, body, point);
        this.inMouth(g, cat, x + dir * 21 * s, y - 15 * s, s);
        return;
      }
      case "carried":
      case "sit":
      case "eat":
      case "bury":
      case "groom":
      case "cough": {
        // Кахикає: витягає шию вперед і смикається.
        const jerk = pose === "cough" ? Math.abs(Math.sin(time / 90)) * 3 * s : 0;
        const hx = x + dir * (3 + (pose === "cough" ? 5 : 0)) * s + dir * jerk;
        // Сумний кіт опускає голову; той, хто їсть чи гребе лапою (корм біля миски, наповнювач у лотку), — до самої підлоги;
        // хто вмивається — хитає головою.
        const headY =
          pose === "eat" ? y - 8 * s : pose === "bury" ? y - 12 * s : pose === "cough" ? y - 18 * s : pose === "groom" ? y - 30 * s + Math.sin(time / 160) * 1.5 * s : y - (sad ? 29 : 33) * s;
        this.tail(g, x - dir * 10 * s, y - 4 * s, s, dir, "rest");
        g.fillStyle(body).fillEllipse(x, y - 13 * s, 22 * s, 26 * s);
        this.patches(g, x, y - 13 * s, 22 * s, 26 * s);
        if (this.coat.tabby) this.stripes(g, x, y - 15 * s, 18 * s, stripe, false);
        // Біла грудка — спереду: у кота, що сидить спиною, її не видно.
        if (this.coat.white >= 1 && look?.back !== true) g.fillStyle(WHITE).fillEllipse(x + dir * 3 * s, y - 13 * s, 9 * s, 14 * s);
        g.lineStyle(2.5, COLORS.ink).strokeEllipse(x, y - 13 * s, 22 * s, 26 * s);
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

  /** Річ у зубах (§9.12, «Подарунки й схованки»): іграшка чи ваша шкарпетка, поки кіт її несе. */
  private inMouth(g: Phaser.GameObjects.Graphics, cat: Cat, x: number, y: number, s: number): void {
    const act = cat.act;
    if (act.kind !== "carry" || act.picked !== true || act.dropped === true) return;
    if (act.carry === "sock") drawSock(g, x, y + 4 * s, 0.7 * s);
    else drawToy(g, "cheap", x, y + 2 * s, 0.6 * s);
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
      // Повіки (§11.4): сумний кіт дивиться з-під напівзаплющених, відданий повільно моргає до персонажа.
      const lid = Math.max(this.look?.sad ? SAD_LID : 0, this.look?.blink ?? 0);
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
    this.head = { x, y: y - r - 8 * s };
  }

  private ears(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, color: number): void {
    const shape = this.shape.ears;
    const big = shape === "large" || shape === "tufted" ? 1.3 : 1;
    // Невдоволений чи переляканий кіт притискає вуха (§9.12).
    const folded = shape === "folded" || this.feeling === "struggling" || this.feeling === "reluctant";
    // Сумний кіт опускає вуха вбік (§11.4).
    const droop = !folded && this.look?.sad === true;
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
      } else {
        g.fillTriangle(bx - 4 * s, y - 5 * s, bx + 4 * s, y - 5 * s, bx + side * 1 * s, y - (12 + 4 * (big - 1) * 3) * s);
        g.lineStyle(2, COLORS.ink).strokeTriangle(bx - 4 * s, y - 5 * s, bx + 4 * s, y - 5 * s, bx + side * 1 * s, y - (12 + 4 * (big - 1) * 3) * s);
      }
    }
  }

  /** Хвіст: «up» — трубою в ході, «rest» — лежить біля сидячого (смикається), «down» — опущений у сумного. */
  private tail(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, dir: number, pose: "up" | "rest" | "down"): void {
    const shape = this.shape.tail;
    if (shape === "none") return;
    const length = shape === "bobtail" ? 0.3 : shape === "short" ? 0.6 : 1;
    const width = (shape === "fluffy" || this.coat.long ? 7 : 4.5) * s;
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
