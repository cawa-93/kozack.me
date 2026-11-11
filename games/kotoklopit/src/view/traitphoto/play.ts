// Знімки рис розділу «Гра й розваги» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitBubble, TraitPerson, TraitPhotoShots, TraitProp } from "./types";

/** Вудочка на підлозі: pivot — під серединою палички. */
const TOY: TraitProp = { art: "item/toy/cheap", state: "floor", x: 34, y: 12, front: true, scale: 0.55 };
/** Гілочка котячої м'яти на підлозі. */
const CATNIP: TraitProp = { art: "item/catnip", state: null, x: 40, y: 6, scale: 0.8, front: true };

/**
 * Велике вікно, на підвіконні якого сидить кіт: за склом пташка на гілці. Удвічі більше за свій арт — як вікна квартири проти
 * кота. Pivot кадру — середина дошки підвіконня; кіт — лівіше вздовж неї (2 : 1), тож голова — на тлі вузької стулки, а пташка у
 * великій шибці — перед мордою, а не за головою.
 */
const WINDOW: TraitProp = { art: "env/window-bird", state: "bird", x: 32, y: 16, size: 2 };
/** Рамка, у яку входить і кіт, і пташка у великій шибці праворуч від нього. */
const VIEW = { w: 170, h: 140 } as const;
/** Вудочка в зубах: pivot — де кіт її тримає. */
const TOY_TEETH: TraitProp = { art: "item/toy/cheap", state: "teeth", x: 0, y: 0, socket: "teeth", scale: 0.55 };
/** Вудочка спереду, пір'ям на виду, а кіт відвернувся від неї (`flip`). */
const TOY_SNUBBED: TraitProp = { ...TOY, x: 40, y: 12 };
/** Думка гри «хочу гратися». */
const WANTS_PLAY: TraitBubble = { kind: "think", icon: "toy" };
/** Думка «гратися ✗». */
const NO_PLAY: TraitBubble = { kind: "think", icon: "toy", mark: "no" };
/** Ваші ноги перед котом: до них він і приніс вудочку. */
const LEGS: TraitPerson = { pose: "stand", x: 52, y: -12 };
/** Бабл гри «шипить біля вікна» (`HISS_ICONS.window`). */
const HISS_WINDOW: TraitBubble = { kind: "say", icon: "hiss-window" };

export const SHOTS: TraitPhotoShots = {
  playful: {
    plus: {
      content: {
        idea: "Кіт мружиться від щастя, притиснувши лапами пір'я вудочки: грається так самозабутньо, ніби від гри залежить доля світу.",
        still: { base: "pounce", at: 900 },
        props: [{ ...TOY, x: 30, y: 4 }],
      },
      calm: {
        idea: "Кіт сидить із вудочкою в зубах: приніс іграшку вам до ніг і кличе гратися.",
        props: [TOY_TEETH],
      },
      sulk: {
        idea: "Насуплений кіт сидить перед вашими ногами, вудочка лежить на підлозі між ним і ногами, думка «гратися»: приніс її до ніг і довго чекав — дарма.",
        props: [{ ...TOY, x: 36, y: 14 }],
        person: LEGS,
        bubbles: [{ ...WANTS_PLAY, dx: -26 }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, вудочка — перед лапами, думка «гратися»: навіть у найгірші дні хоче гратися.",
        props: [{ ...TOY, x: 40, y: 14 }],
        bubbles: [WANTS_PLAY],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено мружиться на буханці, відвернувшись від вудочки за спиною, і думає «гратися ✗»: тепло й тиша милші за якусь там гру.",
        still: { base: "loaf", flip: true },
        props: [TOY_SNUBBED],
        bubbles: [NO_PLAY],
      },
      calm: {
        idea: "Кіт лежить буханцем, відвернувшись від вудочки за спиною, хвіст сіпається, думка «гратися ✗»: пограється хвилинку — і геть.",
        still: { base: "decline", flip: true },
        props: [TOY_SNUBBED],
        bubbles: [NO_PLAY],
      },
      sulk: {
        idea: "Насуплений кіт сидить, відвернувшись від вудочки за спиною, думка «гратися ✗»: гратися — рідко й неохоче.",
        still: { flip: true },
        props: [TOY_SNUBBED],
        bubbles: [NO_PLAY],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, відвернувшись від вудочки, хвіст сіпається: на гру не лишилося ні сил, ні охоти.",
        still: { base: "decline", flip: true },
        props: [TOY_SNUBBED],
      },
    },
  },
  catnip: {
    plus: {
      content: {
        idea: "Кіт блаженно качається на спині серед котячої м'яти й мружиться: фанат м'яти в раю.",
        still: { base: "roll", at: 0 },
        props: [CATNIP, { ...CATNIP, x: -40, y: -2, front: false }],
      },
      calm: {
        idea: "Кіт уважно нюхає гілочку котячої м'яти, очі розплющені: зараз почнеться його улюблене.",
        still: { base: "sniff", at: 0, eyes: "open" },
        props: [{ ...CATNIP, x: 30, y: 4 }],
      },
      sulk: {
        idea: "Насуплений кіт сидить і думає про котячу м'яту: м'яти немає, а він її чекає, як свята.",
        bubbles: [{ kind: "think", icon: "catnip" }],
      },
      ill: {
        idea: "Хворий кіт зі сльозою лежить буханцем, схиливши голову до гілочки м'яти: єдина розрада — її запах.",
        still: { bones: { neck: 12, head: 20 } },
        props: [{ ...CATNIP, x: 44, y: 8 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено сидить, відвернувшись від цілої гілочки м'яти за спиною, і думає «м'ята ✗»: до м'яти байдужий, радощів і так вистачає.",
        still: { flip: true },
        props: [{ ...CATNIP, x: 66, y: 4 }],
        bubbles: [{ kind: "think", icon: "catnip", mark: "no" }],
      },
      calm: {
        idea: "Кіт понюхав гілочку м'яти й неквапом іде геть, думка «м'ята ✗»: до м'яти байдужий.",
        still: { base: "walk", at: 0, flip: true },
        props: [{ ...CATNIP, x: 34, y: 4 }],
        bubbles: [{ kind: "think", icon: "catnip", mark: "no" }],
      },
      sulk: {
        idea: "Над гілочкою м'яти кіт вигнув спину дугою й шипить на сірого кота: від м'яти шаленіє й кидається на котів.",
        still: { base: "arch", flip: true },
        props: [{ ...CATNIP, x: -32, y: 4 }],
        companions: [{ age: "adult", still: { base: "crouch", eyes: "round", ears: "flat" }, x: -70, y: -4 }],
        bubbles: [{ kind: "say", icon: "angry", dx: -18 }],
      },
      ill: {
        idea: "Хворий кіт лежить над гілочкою м'яти й шипить на сірого кота: зле, а від м'яти однаково кидається на котів.",
        still: { flip: true, overlay: "hiss", mouth: "hiss" },
        props: [{ ...CATNIP, x: -32, y: 4 }],
        companions: [{ age: "adult", still: { base: "sit", eyes: "round", ears: "flat" }, x: -70, y: -4 }],
        bubbles: [{ kind: "say", icon: "angry", dx: -18 }],
      },
    },
  },
  window: {
    plus: {
      content: {
        idea: "На підвіконні великого вікна кіт мружиться й «кекає» на пташку за склом: орнітолог за улюбленим заняттям.",
        still: { mouth: "meow" },
        props: [WINDOW],
        frame: VIEW,
      },
      calm: {
        idea: "Кіт сидить на підвіконні великого вікна й дивиться на пташку за склом: вартує тут годинами.",
        still: { bones: { head: -16 } },
        props: [WINDOW],
        frame: VIEW,
      },
      sulk: {
        idea: "Насуплений кіт сидить на підвіконні й усе ж «кекає» на пташку за склом: від домашніх негараздів тікає до своїх горобців.",
        still: { mouth: "meow" },
        props: [WINDOW],
        frame: VIEW,
        bubbles: [{ kind: "say", icon: "bird" }],
      },
      ill: {
        idea: "Хворий кіт лежить на підвіконні, а за склом — пташка: інших друзів у нього немає.",
        props: [WINDOW],
        frame: VIEW,
      },
    },
    minus: {
      content: {
        idea: "Кіт солодко спить, розлігшись на підвіконні спиною до скла, а за склом сидить пташка: йому байдуже.",
        still: { base: "sprawl", flip: true },
        props: [WINDOW],
        frame: VIEW,
      },
      calm: {
        idea: "Кіт сидить на підвіконні вікна з пташкою, хвіст б'є, і шипить на вікно (бабл гри): птахи за склом — привід посердитися.",
        still: { overlay: "warn", at: 300 },
        props: [WINDOW],
        frame: VIEW,
        bubbles: [HISS_WINDOW],
      },
      sulk: {
        idea: "Насуплений кіт на підвіконні вікна з пташкою притиснув вуха, хвіст б'є, і шипить на вікно (бабл гри): злиться на вікно.",
        still: { overlay: "warn", at: 300, ears: "back" },
        props: [WINDOW],
        frame: VIEW,
        bubbles: [HISS_WINDOW],
      },
      ill: {
        idea: "Хворий кіт лежить на підвіконні вікна з пташкою, вуха назад, і шипить на вікно (бабл гри): навіть хворий злиться на птахів за склом.",
        still: { ears: "back" },
        props: [WINDOW],
        frame: VIEW,
        bubbles: [HISS_WINDOW],
      },
    },
  },
};
