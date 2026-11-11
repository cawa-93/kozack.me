// Знімки рис розділу «Гра й розваги» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitPhotoShots, TraitProp } from "./types";

/** Вудочка на підлозі: pivot — під серединою палички. */
const TOY: TraitProp = { art: "item/toy/cheap", state: "floor", x: 34, y: 12, front: true, scale: 0.55 };
/** Гілочка котячої м'яти на підлозі. */
const CATNIP: TraitProp = { art: "item/catnip", state: null, x: 40, y: 6, scale: 0.8, front: true };

/** Вікно з підвіконням у стіні праворуч позаду кота: за склом пташка на гілці (`bird`) чи порожнє небо (`empty`). */
const WINDOW: TraitProp = { art: "env/window-bird", state: "bird", x: 50, y: -16, scale: 0.62 };
/** Вудочка в зубах: pivot — де кіт її тримає. */
const TOY_TEETH: TraitProp = { art: "item/toy/cheap", state: "teeth", x: 24, y: -30, front: true, scale: 0.55 };
/** Вудочка спереду, пір'ям на виду, а кіт відвернувся від неї (`flip`). */
const TOY_SNUBBED: TraitProp = { ...TOY, x: 40, y: 12 };

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
        idea: "Насуплений кіт сидить, а з рота звисає вудочка: приніс її до ніг і довго чекав — дарма.",
        props: [{ ...TOY_TEETH, x: 22, y: -30 }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем і тримає в зубах вудочку: навіть у найгірші дні пробує гратися.",
        props: [{ ...TOY_TEETH, x: 24, y: -16 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено мружиться на буханці, відвернувшись від вудочки, і думає «не хочу гратися»: тепло й тиша милші за якусь там гру.",
        still: { base: "loaf", flip: true },
        props: [TOY_SNUBBED],
        bubbles: [{ kind: "think", icon: "bored" }],
      },
      calm: {
        idea: "Кіт лежить буханцем, відвернувшись від вудочки, хвіст сіпається, думка «не хочу гратися»: пограється хвилинку — і геть.",
        still: { base: "decline", flip: true },
        props: [TOY_SNUBBED],
        bubbles: [{ kind: "think", icon: "bored" }],
      },
      sulk: {
        idea: "Насуплений кіт сидить, відвернувшись від вудочки, думка «не хочу гратися»: гратися — рідко й неохоче.",
        still: { flip: true },
        props: [TOY_SNUBBED],
        bubbles: [{ kind: "think", icon: "bored" }],
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
        idea: "Кіт задоволено сидить, гілочка м'яти лежить позаду, а він думає «м'ята ✗»: до м'яти байдужий, радощів і так вистачає.",
        props: [{ ...CATNIP, x: -40, y: 0, front: false }],
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
        idea: "Під вікном кіт мружиться й «кекає» на пташку за склом: орнітолог за улюбленим заняттям.",
        still: { mouth: "meow" },
        props: [WINDOW],
      },
      calm: {
        idea: "Кіт сидить під вікном і дивиться на пташку за склом: годинами вартує на підвіконні.",
        still: { bones: { head: -16 } },
        props: [WINDOW],
      },
      sulk: {
        idea: "Насуплений кіт сидить під вікном і все ж «кекає» на пташку за склом: від домашніх негараздів тікає до своїх горобців.",
        still: { mouth: "meow" },
        props: [WINDOW],
        bubbles: [{ kind: "say", icon: "bird" }],
      },
      ill: {
        idea: "Хворий кіт лежить під вікном, а за склом — пташка: інших друзів у нього немає.",
        props: [WINDOW],
      },
    },
    minus: {
      content: {
        idea: "Кіт солодко спить клубком спиною до вікна, а за склом сидить пташка: йому байдуже.",
        still: { base: "sleep", eyes: "closed", flip: true },
        props: [WINDOW],
      },
      calm: {
        idea: "Кіт сидить обличчям до вікна з пташкою й думає «пташка ✗»: птахи за склом — привід посердитися.",
        still: { bones: { head: -10 } },
        props: [WINDOW],
        bubbles: [{ kind: "think", icon: "bird", mark: "no" }],
      },
      sulk: {
        idea: "Насуплений кіт біля вікна з пташкою притиснув вуха, хвіст б'є, думка «пташка ✗»: злиться на вікно.",
        still: { overlay: "warn", ears: "back" },
        props: [WINDOW],
        bubbles: [{ kind: "think", icon: "bird", mark: "no" }],
      },
      ill: {
        idea: "Хворий кіт лежить під порожнім вікном, вуха назад, думка «пташка ✗»: навіть хворий злиться на птахів за склом.",
        still: { ears: "back" },
        props: [{ ...WINDOW, state: "empty" }],
        bubbles: [{ kind: "think", icon: "bird", mark: "no" }],
      },
    },
  },
};
