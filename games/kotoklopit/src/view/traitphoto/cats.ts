// Знімки рис розділу «Між котами» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Інший кіт — завжди дорослого розміру, а герой буває й дрібнішої породи, і місця знімка менші разом із ним: тож інший кіт —
// позаду героя (менший y), щоб не закривав його морди; поруч — від |x| ≈ 90, а впритул (клубком, вилизує) — лише позаду.

import type { TraitCompanion, TraitPhotoShots, TraitProp } from "./types";

const adult = (still: TraitCompanion["still"], x: number, y: number): TraitCompanion => ({ age: "adult", still, x, y });
const kitten = (still: TraitCompanion["still"], x: number, y: number): TraitCompanion => ({ age: "kitten", still, x, y });

const TREAT = (x: number, y: number): TraitProp => ({ art: "icon/treats", state: null, x, y, scale: 0.42, front: true });
const HEART = (x: number, y: number): TraitProp => ({ art: "icon/heart", state: null, x, y, scale: 0.36 });
const FUR = (x: number, y: number, rot = 0): TraitProp => ({ art: "fx/fur-flying", state: null, x, y, rot, scale: 0.8, front: true });
const BOWL = (state: string, x = 34, y = 10): TraitProp => ({ art: "item/bowl/cheap", state, x, y, front: true });

/** Друг, що їсть рибку позаду праворуч, мордою геть від героя: рибка — під його носом, а героєві видно, як той їсть. */
const eater = (x = 76): TraitCompanion => adult({ base: "eat", mouth: "eat", eyes: "half" }, x, -16);
const eaterTreat = (x = 76): TraitProp => TREAT(x + 36, -8);
/** Друг, якого пестять: лежить на спині й мружиться, над ним — серце. */
const PETTED_X = 100;
const petted = (x = PETTED_X): TraitCompanion => adult({ base: "belly", eyes: "arc" }, x, -8);
const pettedHeart = (x = PETTED_X): TraitProp => HEART(x - 2, -66);
/** Друг сидить праворуч позаду, мордою до героя, й мружиться: його шия — під язиком героя, а морди обох видно. */
const GROOMED = adult({ base: "sit", flip: true, eyes: "arc" }, 48, -6);
/** Миска героя праворуч, з неї їсть інший кіт, що підійшов з того боку. */
const SHARED = BOWL("cheap-2", 36, 10);
const SHARER = adult({ base: "eat", flip: true, mouth: "eat", eyes: "half" }, 76, -10);
/** Друг тягнеться вилизати героя. */
const LICKER = adult({ base: "lick", at: 280, flip: true, mouth: "tongue", eyes: "half" }, 86, -8);

export const SHOTS: TraitPhotoShots = {
  sociability: {
    plus: {
      content: {
        idea: "Мружиться, лежачи буханцем, а за ним, пригорнувшись, спить інший кіт: котячий клубок, у якому всім тепло.",
        still: { base: "loaf", eyes: "arc" },
        companions: [adult({ base: "sleep", eyes: "closed", flip: true }, 40, -14)],
      },
      calm: {
        idea: "Спокійно сидить, а інший кіт лагідно буцається в нього головою: ладнає з кожним.",
        companions: [adult({ base: "nudge", at: 800, flip: true, eyes: "arc" }, 60, -12)],
      },
      sulk: { idea: "Ображено сидить спиною, а позаду притулився інший кіт: біду ділять навпіл.", companions: [adult({ base: "loaf", eyes: "half", flip: true }, 48, -14)] },
      ill: { idea: "Хворий лежить буханцем, а інший кіт згорнувся за ним і гріє його.", companions: [adult({ base: "sleep", eyes: "closed", flip: true }, 40, -14)] },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, поки інший кіт тікає від нього, а в повітрі ще літає шерсть: прогнав із дивана.",
        companions: [adult({ base: "run", at: 150, ears: "flat", eyes: "round" }, 104, -10)],
        props: [FUR(50, -34, 30)],
      },
      calm: {
        idea: "Недобре дивиться, прищуливши вуха, на кота, що з притиснутими вухами прошмигує повз: тут ходять з його дозволу.",
        still: { eyes: "half", ears: "back" },
        companions: [adult({ base: "walk", at: 100, ears: "flat", eyes: "round" }, 98, -12)],
      },
      sulk: {
        idea: "Насуплено сидить спиною до кота, з яким щойно бився: довкола літає шерсть.",
        still: { ears: "flat" },
        companions: [adult({ base: "sit", flip: true, ears: "flat", eyes: "squint" }, 94, -10)],
        props: [FUR(44, -40, 30), FUR(-30, -20, -20)],
      },
      ill: {
        idea: "Хворий, а все одно шипить, притиснувши вуха, на кота, що присів навпроти й шипить у відповідь; між ними літає шерсть.",
        still: { mouth: "hiss", ears: "flat" },
        companions: [adult({ base: "crouch", flip: true, mouth: "hiss", ears: "flat", eyes: "round" }, 96, -10)],
        props: [FUR(26, -58, 30)],
      },
    },
  },
  envy: {
    plus: {
      content: {
        idea: "Блаженно мружиться з чужою рибкою в зубах, а обділений кіт понуро дивиться на нього: найкраще — лише йому.",
        props: [{ ...TREAT(24, -30), scale: 0.3 }],
        companions: [adult({ base: "sit", flip: true, ears: "side", eyes: "half" }, 96, -12)],
      },
      calm: {
        idea: "Сидить, притиснувши вуха, і насуплено дивиться, як інший кіт їсть рибку, що дісталася не йому.",
        still: { eyes: "half", ears: "flat" },
        props: [eaterTreat()],
        companions: [eater()],
      },
      sulk: { idea: "Ображено сидить спиною, притиснувши вуха, поки інший кіт їсть рибку, що дісталася не йому.", still: { ears: "flat" }, props: [eaterTreat()], companions: [eater()] },
      ill: {
        idea: "Хворий лежить буханцем, а все одно притиснув вуха й шипить на кота, що їсть рибку.",
        still: { mouth: "hiss", ears: "flat" },
        props: [eaterTreat()],
        companions: [eater()],
      },
    },
    minus: {
      content: {
        idea: "Мружиться й муркоче, лежачи впритул до кота, що їсть рибку: радіє чужому, як своєму.",
        still: { base: "loaf", eyes: "arc" },
        props: [eaterTreat(50)],
        companions: [eater(50)],
      },
      calm: {
        idea: "Спокійно лежить буханцем поруч із котом, що їсть рибку, й повільно кліпає — не рахує чужих смаколиків.",
        still: { base: "loaf", overlay: "slowBlink", at: 200, eyes: "half" },
        props: [eaterTreat(50)],
        companions: [eater(50)],
      },
      sulk: { idea: "Сам невеселий, сидить спиною, але тулиться до кота, що їсть рибку, — чужа радість його не гнітить.", props: [eaterTreat(46)], companions: [eater(46)] },
      ill: { idea: "Хворий лежить буханцем поруч із котом, що їсть рибку, і тихо муркоче.", still: { eyes: "half" }, props: [eaterTreat(50)], companions: [eater(50)] },
    },
  },
  jealousy: {
    plus: {
      content: {
        idea: "Мружиться під серцем — уся ласка його, — а інший кіт понуро йде геть.",
        props: [HEART(4, -78)],
        companions: [adult({ base: "sadWalk", eyes: "half", ears: "side" }, 100, -10)],
      },
      calm: {
        idea: "Сидить, притиснувши вуха, і насуплено дивиться на кота, що блаженно лежить на спині під серцем: ласку не ділить ні з ким.",
        still: { eyes: "half", ears: "flat" },
        props: [pettedHeart()],
        companions: [petted()],
      },
      sulk: { idea: "Ображено відвернувся спиною від кота, якого пестять, і притиснув вуха.", still: { ears: "flat", flip: true }, props: [pettedHeart()], companions: [petted()] },
      ill: {
        idea: "Хворий, а все одно притиснув вуха й шипить на кота, якого пестять.",
        still: { mouth: "hiss", ears: "flat" },
        props: [pettedHeart(112)],
        companions: [petted(112)],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, лежачи поруч із котом, якого пестять, і муркоче за компанію.",
        still: { base: "loaf", eyes: "arc" },
        props: [pettedHeart(66)],
        companions: [petted(66)],
      },
      calm: {
        idea: "Спокійно лежить буханцем поряд із котом, якого пестять: любові вистачить на всіх.",
        still: { base: "loaf", eyes: "half" },
        props: [pettedHeart(66)],
        companions: [petted(66)],
      },
      sulk: { idea: "Сам невеселий, сидить спиною, але тулиться до кота, якого пестять, — без жодного шипіння.", props: [pettedHeart(62)], companions: [petted(62)] },
      ill: { idea: "Хворий лежить буханцем, пригорнувшись до кота, якого пестять, — тішиться хоч чужою ласкою.", props: [pettedHeart(62)], companions: [petted(62)] },
    },
  },
  territorial: {
    plus: {
      content: {
        idea: "Задоволено мружиться за своєю повною мискою, а інший кіт понуро йде геть — його володіння.",
        props: [BOWL("cheap-2")],
        companions: [adult({ base: "sadWalk", eyes: "half", ears: "side" }, 106, -12)],
      },
      calm: {
        idea: "Сидить за своєю повною мискою, притиснувши вуха й не зводячи очей з кота, що підходить: ближче не підпустить.",
        still: { eyes: "half", ears: "flat" },
        props: [BOWL("cheap-2")],
        companions: [adult({ base: "walk", at: 100, flip: true, ears: "side" }, 100, -10)],
      },
      sulk: {
        idea: "Насуплено сидить спиною над своєю мискою, притиснувши вуха, а інший кіт дивиться на неї здалеку: не підпускає.",
        still: { ears: "flat" },
        props: [BOWL("cheap-2", 6, 20)],
        companions: [adult({ base: "sit", flip: true, ears: "side", eyes: "half" }, 96, -10)],
      },
      ill: {
        idea: "Хворий лежить коло порожньої миски й, притиснувши вуха, шипить на іншого кота — стереже її.",
        still: { ears: "flat", mouth: "hiss" },
        props: [BOWL("empty", 30, 12)],
        companions: [adult({ base: "sit", flip: true, ears: "side", eyes: "half" }, 96, -10)],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться біля своєї миски, а з неї спокійно їсть інший кіт: усе спільне.",
        props: [SHARED],
        companions: [SHARER],
      },
      calm: { idea: "Спокійно сидить біля своєї миски й дивиться, як із неї хрумтить інший кіт, — не відганяє.", props: [SHARED], companions: [SHARER] },
      sulk: { idea: "Невесело сидить спиною, а з його миски поруч спокійно їсть інший кіт — не відганяє.", props: [SHARED], companions: [SHARER] },
      ill: { idea: "Хворий лежить буханцем, а з його майже порожньої миски їсть інший кіт — ділиться останнім.", props: [{ ...SHARED, state: "cheap-1" }], companions: [SHARER] },
    },
  },
  nurturing: {
    plus: {
      content: {
        idea: "Мружиться, лежачи буханцем, а перед ним спить пригорнуте кошеня — гріє малечу.",
        still: { base: "loaf", eyes: "arc" },
        companions: [kitten({ base: "sleep", eyes: "closed" }, 18, 14)],
      },
      calm: {
        idea: "Дбайливо вилизує голову кошеняті, а те мружиться.",
        still: { base: "lick", at: 280, eyes: "half", mouth: "tongue" },
        companions: [kitten({ base: "sit", flip: true, eyes: "arc" }, 46, 8)],
      },
      sulk: { idea: "Сам невеселий, сидить спиною, а до його боку пригорнулося й спить кошеня.", companions: [kitten({ base: "sleep", eyes: "closed" }, 30, 12)] },
      ill: { idea: "Хворий лежить буханцем, а все одно гріє кошеня, що спить, пригорнувшись до нього.", companions: [kitten({ base: "sleep", eyes: "closed" }, -20, 12)] },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться на самоті, а кошеня з притиснутими вухами тримається подалі.",
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 84, -6)],
      },
      calm: {
        idea: "Сидить, прищуливши вуха, і холодно дивиться на кошеня, що з переляку присіло поодаль: до нього малечі зась.",
        still: { eyes: "half", ears: "back" },
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 72, -2)],
      },
      sulk: {
        idea: "Сидить спиною, притиснувши вуха, а перелякане кошеня присіло поодаль — не підпускає малечу.",
        still: { ears: "flat" },
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 64, -2)],
      },
      ill: {
        idea: "Хворий, а все одно притиснув вуха й шипить на кошеня, що тягнеться до нього.",
        still: { mouth: "hiss", ears: "flat" },
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 84, -2)],
      },
    },
  },
  grooming: {
    plus: {
      content: {
        idea: "Мружиться, вилизуючи маківку іншому котові, а той підставив голову й мружиться у відповідь.",
        still: { base: "lick", at: 280, eyes: "arc", mouth: "tongue" },
        companions: [GROOMED],
      },
      calm: { idea: "Спокійно вилизує маківку іншому котові, що підставив голову.", still: { base: "lick", at: 280, eyes: "half", mouth: "tongue" }, companions: [GROOMED] },
      sulk: {
        idea: "Похмуро, з опущеними вухами, вилизує іншого кота — щоб нудьгувати разом.",
        still: { base: "lick", at: 280, view: "front", eyes: "half", mouth: "tongue", ears: "side" },
        companions: [{ ...GROOMED, still: { ...GROOMED.still, eyes: "half" } }],
      },
      ill: {
        idea: "Хворий, а все одно вилизує іншого кота — хоч так відчути тепло.",
        still: { base: "lick", at: 280, eyes: "sick", mouth: "tongue", ears: "side" },
        companions: [GROOMED],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, відвернувшись від кота, що тягнеться його вилизати: зачіска — недоторканна.",
        still: { flip: true, ears: "back" },
        companions: [LICKER],
      },
      calm: { idea: "Відвернувся, притиснувши вуха, від кота, що тягнеться його вилизати.", still: { flip: true, eyes: "half", ears: "flat" }, companions: [LICKER] },
      sulk: { idea: "Сидить спиною, притиснувши вуха, а інший кіт марно тягнеться його вилизати.", still: { ears: "flat" }, companions: [LICKER] },
      ill: {
        idea: "Хворий, а шипить, притиснувши вуха, на кота, що прийшов його вилизати.",
        still: { mouth: "hiss", ears: "flat" },
        companions: [LICKER],
      },
    },
  },
};
