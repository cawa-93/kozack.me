// Знімки рис розділу «Гра й розваги» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitPhotoShots, TraitProp } from "./types";

/** Іконка як річ на фото: pivot у центрі, тож на підлозі y — мінус половина висоти. */
const icon = (name: string, x: number, y: number, scale = 0.4): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale });

/** Вудочка на підлозі: pivot — під серединою палички. */
const TOY: TraitProp = { art: "item/toy/cheap", state: "floor", x: 34, y: 12, front: true, scale: 0.55 };
const CATNIP = icon("catnip", 42, -10, 0.34);

/** Вікно в задній стіні праворуч від кота: «+» дивиться в його бік, «−» відвертається. */
const WINDOW: TraitProp = { art: "env/window/bedroom", state: null, x: 58, y: -14, scale: 0.42 };
const BIRD = icon("bird", 40, -56, 0.28);
const ANGRY = icon("angry", 30, -56, 0.32);
/** Вудочка в зубах: pivot — де кіт її тримає. */
const TOY_TEETH: TraitProp = { art: "item/toy/cheap", state: "teeth", x: 24, y: -30, front: true, scale: 0.55 };
/** Вудочка позаду, з іншого боку від морди: кіт до неї байдужий. */
const TOY_AWAY: readonly TraitProp[] = [{ ...TOY, x: -36, y: -6, front: false }];

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
        idea: "Ображений кіт сидить спиною, а з рота звисає вудочка: приніс її до ніг і довго чекав — дарма.",
        props: [{ ...TOY_TEETH, x: 22, y: -34 }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем і тримає в зубах вудочку: навіть у найгірші дні пробує гратися.",
        props: [{ ...TOY_TEETH, x: 24, y: -16 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено позіхає на буханці, а вудочка лежить забута: тепло й тиша милші за якусь там гру.",
        still: { base: "loaf", mouth: "yawn" },
        props: TOY_AWAY,
      },
      calm: {
        idea: "Кіт ліниво лежить буханцем і позіхає на вудочку перед носом: пограється хвилинку — і геть.",
        still: { base: "decline", mouth: "yawn", eyes: "half" },
        props: [TOY],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною до вудочки: гратися — рідко й неохоче.",
        props: TOY_AWAY,
      },
      ill: {
        idea: "Хворий кіт лежить, відвернувшись від вудочки: на гру не лишилося ні сил, ні охоти.",
        still: { flip: true },
        props: TOY_AWAY,
      },
    },
  },
  catnip: {
    plus: {
      content: {
        idea: "Кіт блаженно качається на спині серед котячої м'яти й мружиться: фанат м'яти в раю.",
        still: { base: "roll", at: 0 },
        props: [CATNIP, { ...CATNIP, x: -40, y: -6 }],
      },
      calm: {
        idea: "Кіт солодко спить клубком біля гілочки котячої м'яти: накатався й заснув найсолодшим сном.",
        still: { base: "sleep", eyes: "closed" },
        props: [CATNIP],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною біля гілочки м'яти: чекає її, як свята, бо свята бувають нечасто.",
        props: [CATNIP],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем і, заплющивши очі, нюхає гілочку м'яти: єдина розрада — її запах.",
        still: { eyes: "closed" },
        props: [{ ...CATNIP, x: 34, y: -2 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено сидить, відвернувшись від котячої м'яти: радощів у домі й так вистачає.",
        still: { flip: true },
        props: [CATNIP],
      },
      calm: {
        idea: "Кіт понюхав котячу м'яту й неквапом іде геть, навіть не озирнувшись: байдужий до м'яти.",
        still: { base: "walk", at: 0, flip: true },
        props: [CATNIP],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною, а над м'ятою — знаки злості: з м'ятою в нього непрості стосунки.",
        props: [CATNIP, icon("angry", 34, -50, 0.3)],
      },
      ill: {
        idea: "Хворий кіт лежить, відвернувшись від м'яти: навіть вона не додає радості.",
        still: { flip: true },
        props: [CATNIP],
      },
    },
  },
  window: {
    plus: {
      content: {
        idea: "Під вікном кіт мружиться й «кекає» на пташку за склом: орнітолог за улюбленим заняттям.",
        still: { mouth: "meow" },
        props: [WINDOW, BIRD],
      },
      calm: {
        idea: "Кіт сидить під вікном і дивиться на пташку за склом: годинами вартує на підвіконні.",
        still: { bones: { head: -16 } },
        props: [WINDOW, BIRD],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною до нас, обличчям до вікна з пташкою: тікає від домашніх негараздів до своїх горобців.",
        props: [WINDOW, BIRD],
      },
      ill: {
        idea: "Хворий кіт лежить під вікном, а за склом — пташка: інших друзів у нього немає.",
        props: [WINDOW, BIRD],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено сидить спиною до вікна з пташкою: найцікавіше й так удома.",
        still: { flip: true },
        props: [WINDOW, BIRD],
      },
      calm: {
        idea: "Кіт сидить, відвернувшись від вікна, і не дивиться на пташку: підвіконня — для вазонів, а не для порядних котів.",
        still: { flip: true, eyes: "half" },
        props: [WINDOW, BIRD],
      },
      sulk: {
        idea: "Ображений кіт сидить обличчям до вікна, а над ним — знаки злості: за вікном нічого, крім приводу посердитися.",
        props: [WINDOW, ANGRY],
      },
      ill: {
        idea: "Хворий кіт лежить спиною до вікна — і до всього світу.",
        still: { flip: true },
        props: [WINDOW],
      },
    },
  },
};
