// Знімки рис розділу «Між котами» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Інший кіт — за породою героя, тож поруч стоїть упритул (|x| ≈ 50–70); хто ближче до камери, той поверх. Що кіт робить іншому
// котові (шипить з причиною, муркоче поруч, вихопив ласощі), — баблом гри над тим, хто це каже чи відчуває (`eventBubbles`, §11.4):
// самих виразу й пози сліпі глядачі не читали.

import type { TraitBubble, TraitCompanion, TraitPerson, TraitPhotoShots, TraitProp } from "./types";

const adult = (still: TraitCompanion["still"], x: number, y: number): TraitCompanion => ({ age: "adult", still, x, y });
/** Кошеня: новонароджене (0 тижнів) спить клубочком, тижневе вже сидить і повзає. */
const kitten = (still: TraitCompanion["still"], x: number, y: number, weeks = 1): TraitCompanion => ({ age: "kitten", weeks, still, x, y });

const TREAT = (x: number, y: number): TraitProp => ({ art: "icon/treats", state: null, x, y, scale: 0.42, front: true });
const HEART = (x: number, y: number): TraitProp => ({ art: "icon/heart", state: null, x, y, scale: 0.36 });
const FUR = (x: number, y: number, rot = 0): TraitProp => ({ art: "fx/fur-flying", state: null, x, y, rot, scale: 0.8, front: true });
const BOWL = (state: string, x: number, y: number): TraitProp => ({ art: "item/bowl/cheap", state, x, y, front: true });

/** Шипіння героя вголос (подія `hissed`): злість без причини — на кота, що трапився, і з причиною — миска, рука, кошеня. */
const hiss = (icon: "angry" | "hiss-bowl" | "hiss-hand" | "hiss-kitten", dx?: number): TraitBubble => ({ kind: "say", icon, ...(dx === undefined ? {} : { dx }) });
/** «Приємно» — думка гри того, хто муркоче поруч (`cat-cuddled`) чи кого вилизують (`groom-started`); `over` — інший кіт. */
const pleasant = (over?: number, dx?: number): TraitBubble => ({ kind: "think", icon: "pleasant", ...(over === undefined ? {} : { over }), ...(dx === undefined ? {} : { dx }) });
/** Над буханцем бабл зсунутий назад (`dx`): голова буханця попереду, і бабл ліг би над іншим котом. */
const LOAF_DX = -16;

/**
 * Друг, що хрумтить рибкою праворуч, мордою геть від героя: рибка — впритул під його ротом, над ним — бабл гри «хрумтить ласощами»
 * (`CRUNCH`, як у `treat-snatched`), тож видно, кому перепало; хвіст задерто вгору, щоб не лягав на героя («кусає за хвіст»).
 */
const EATER_X = 84;
const eater = (x = EATER_X): TraitCompanion => adult({ base: "eat", mouth: "eat", eyes: "half", bones: { tail: 75 } }, x, -16);
const eaterTreat = (x = EATER_X): TraitProp => TREAT(x + 31, -11);
const CRUNCH: TraitBubble = { kind: "say", icon: "treats", over: 0, dx: -24 };
/** Друг, якого пестять: лежить на спині й мружиться, над ним — серце. */
const PETTED_X = 70;
const petted = (x = PETTED_X): TraitCompanion => adult({ base: "belly", eyes: "arc" }, x, -8);
const pettedHeart = (x = PETTED_X): TraitProp => HEART(x - 2, -66);
/** Ви гладите друга, що лежить на спині: стоїте праворуч від нього, нахилившись, — подалі від героя та його бабла. */
const PETTED_BY_X = 76;
const pettingHand = (x = PETTED_BY_X): TraitPerson => ({ pose: "pet", x: x + 38, y: -12, flip: true });
/**
 * Друг лежить буханцем упритул за героєм, мордою до нього, низько схиливши голову й мружачись: підставив маківку під язик героя
 * (ніс до носа читалось «труться мордами»). Позаду героя, а не перед ним: кошеня-героя дорослий буханець закривав би.
 */
const GROOMED = adult({ base: "loaf", flip: true, eyes: "arc", bones: { neck: 15, head: 25 } }, 46, -2);
/** «Приємно» над другом, якого вилизують: зсунуте від героя, щоб стояло над другом, а не між котами. */
const GROOMED_PLEASANT = pleasant(0, -40);
/** Миска героя праворуч, з неї їсть інший кіт, що підійшов з того боку. */
const SHARED = BOWL("cheap-2", 36, 10);
const SHARER = adult({ base: "eat", flip: true, mouth: "eat", eyes: "half" }, 76, -10);
/** Миска Цербера — ліворуч від нього: він між мискою й іншим котом, а не їсть з неї. */
const GUARDED = BOWL("cheap-2", -36, 14);
/** Друг лагідно тягнеться вилизати героя. */
const LICKER = adult({ base: "lick", at: 280, flip: true, mouth: "tongue", eyes: "arc" }, 60, -8);
/** Той самий друг упритул: язик — біля потилиці героя, що сидить; до буханця ще й нахилив голову. */
const LICKER_CLOSE = { ...LICKER, x: 46 };
const LICKER_LOW = { ...LICKER_CLOSE, still: { ...LICKER.still, bones: { head: 20 } } };
const REFUSED: TraitBubble = { kind: "think", icon: "lick", mark: "no" };

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
      sulk: {
        idea: "Насуплено сидить, а позаду, притулившись, спить інший кіт: біду ділять навпіл.",
        companions: [adult({ base: "sleep", eyes: "closed", flip: true }, 44, -16)],
      },
      ill: {
        idea: "Хворий лежить буханцем, а інший кіт ліг поруч, щокою до щоки, і лагідно мружиться — гріє й розраджує.",
        companions: [adult({ base: "loaf", flip: true, eyes: "arc" }, 64, -10)],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться й шипить (бабл злості), а інший кіт з притиснутими вухами тікає, і в повітрі ще літає шерсть: прогнав.",
        companions: [adult({ base: "run", at: 150, ears: "flat", eyes: "round" }, 76, -10)],
        props: [FUR(40, -36, 30)],
        bubbles: [hiss("angry")],
      },
      calm: {
        idea: "Недобре дивиться, прищуливши вуха, і шипить (бабл злості) на кота, що з притиснутими вухами прошмигує повз: тут ходять з його дозволу.",
        still: { eyes: "half", ears: "back" },
        companions: [adult({ base: "walk", at: 100, ears: "flat", eyes: "round" }, 74, -12)],
        bubbles: [hiss("angry")],
      },
      sulk: {
        idea: "Насуплено шипить (бабл злості) услід котові, що, притиснувши вуха, понуро йде геть; між ними ще літає шерсть.",
        still: { ears: "flat" },
        companions: [adult({ base: "sadWalk", eyes: "half", ears: "flat" }, 84, -10)],
        props: [FUR(42, -40, 30)],
        bubbles: [hiss("angry")],
      },
      ill: {
        idea: "Хворий, а все одно шипить (бабл злості), притиснувши вуха, і другий кіт тікає від нього; між ними літає шерсть.",
        still: { ears: "flat" },
        companions: [adult({ base: "run", at: 150, ears: "flat", eyes: "round" }, 84, -10)],
        props: [FUR(44, -44, 30)],
        bubbles: [hiss("angry", LOAF_DX)],
      },
    },
  },
  envy: {
    plus: {
      content: {
        idea: "Блаженно мружиться з вихопленою рибкою в зубах (бабл «хрум» ласощами), а обділений кіт з порожнім місцем під носом думає «ласощів нема».",
        props: [{ ...TREAT(24, -30), scale: 0.3 }],
        companions: [adult({ base: "eat", flip: true, eyes: "round", ears: "flat" }, 70, -16)],
        bubbles: [
          { kind: "say", icon: "treats", dx: -10 },
          { kind: "think", icon: "treats", mark: "no", over: 0, dx: -34 },
        ],
      },
      calm: {
        idea: "Сидить, притиснувши вуха, і шипить (бабл злості) на кота, що хрумтить рибкою (над ним бабл «хрумтить ласощами»), яка дісталася не йому.",
        still: { eyes: "half", ears: "flat" },
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [hiss("angry"), CRUNCH],
      },
      sulk: {
        idea: "Насуплено сидить, притиснувши вуха, і шипить (бабл злості) на кота, що хрумтить рибкою (над ним бабл «хрумтить ласощами»), яка дісталася не йому.",
        still: { ears: "flat" },
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [hiss("angry"), CRUNCH],
      },
      ill: {
        idea: "Хворий лежить буханцем, а все одно притиснув вуха й шипить (бабл злості) на кота, що хрумтить рибкою (над ним бабл «хрумтить ласощами»).",
        still: { ears: "flat" },
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [hiss("angry", LOAF_DX), CRUNCH],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, лежачи поруч із котом, що хрумтить рибкою (над ним бабл «хрумтить ласощами»), і думає «приємно»: радіє чужому, як своєму.",
        still: { base: "loaf", eyes: "arc" },
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [pleasant(undefined, LOAF_DX), CRUNCH],
      },
      calm: {
        idea: "Спокійно лежить буханцем поруч із котом, що хрумтить рибкою (над ним бабл «хрумтить ласощами»), повільно кліпає й думає «приємно» — не рахує чужих смаколиків.",
        still: { base: "loaf", overlay: "slowBlink", at: 200, eyes: "half" },
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [pleasant(undefined, LOAF_DX), CRUNCH],
      },
      sulk: {
        idea: "Сам невеселий, а сидить поруч із котом, що хрумтить рибкою (над ним бабл «хрумтить ласощами»), і думає «приємно» — чужа радість його не гнітить.",
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [pleasant(), CRUNCH],
      },
      ill: {
        idea: "Хворий лежить буханцем поруч із котом, що хрумтить рибкою (над ним бабл «хрумтить ласощами»), і думає «приємно» — тішиться за іншого.",
        props: [eaterTreat()],
        companions: [eater()],
        bubbles: [pleasant(undefined, LOAF_DX), CRUNCH],
      },
    },
  },
  jealousy: {
    plus: {
      content: {
        idea: "Мружиться буханцем у вас на колінах і шипить, вишкіривши ікла (бабл «шипить за руку» просто над ним), а кіт, якого він звідти зігнав, притиснувши вуха, понуро йде геть по підлозі.",
        still: { base: "loaf", mouth: "hiss", shadow: false },
        person: { pose: "lap", x: -4, y: 35 },
        companions: [adult({ base: "sadWalk", eyes: "half", ears: "flat" }, 78, 38)],
        bubbles: [hiss("hiss-hand", 14)],
      },
      calm: {
        idea: "Сидить, притиснувши вуха, і шипить (бабл «шипить за руку») на кота, що блаженно лежить на спині під серцем: ласку не ділить ні з ким.",
        still: { eyes: "half", ears: "flat" },
        props: [pettedHeart()],
        companions: [petted()],
        bubbles: [hiss("hiss-hand")],
      },
      sulk: {
        idea: "Насуплено відвернувся від кота, якого пестять, притиснув вуха й шипить через плече (бабл «шипить за руку»).",
        still: { ears: "flat", flip: true },
        props: [pettedHeart()],
        companions: [petted()],
        bubbles: [hiss("hiss-hand")],
      },
      ill: {
        idea: "Хворий, а все одно притиснув вуха й шипить (бабл «шипить за руку») на кота, якого пестять.",
        still: { ears: "flat" },
        props: [pettedHeart(74)],
        companions: [petted(74)],
        bubbles: [hiss("hiss-hand", LOAF_DX)],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, лежачи поруч із котом, якого гладить ваша рука, і думає «приємно»: муркоче за компанію.",
        still: { base: "loaf", eyes: "arc" },
        person: pettingHand(),
        companions: [petted(PETTED_BY_X)],
        bubbles: [pleasant(undefined, -28)],
      },
      calm: {
        idea: "Спокійно лежить буханцем поряд із котом, якого гладить ваша рука, і думає «приємно»: любові вистачить на всіх.",
        still: { base: "loaf", eyes: "half" },
        person: pettingHand(),
        companions: [petted(PETTED_BY_X)],
        bubbles: [pleasant(undefined, -28)],
      },
      sulk: {
        idea: "Сам невеселий, а сидить поруч із котом, якого гладить ваша рука, і думає «приємно» — без жодного шипіння.",
        person: pettingHand(),
        companions: [petted(PETTED_BY_X)],
        bubbles: [pleasant(undefined, -26)],
      },
      ill: {
        idea: "Хворий лежить буханцем поруч із котом, якого гладить ваша рука, і думає «приємно» — тішиться хоч чужою ласкою.",
        person: pettingHand(),
        companions: [petted(PETTED_BY_X)],
        bubbles: [pleasant(undefined, -38)],
      },
    },
  },
  territorial: {
    plus: {
      content: {
        idea: "Задоволено мружиться між своєю повною мискою й котом, на якого шипить (бабл «шипить за миску»), а той, притиснувши вуха, йде геть.",
        props: [GUARDED],
        companions: [adult({ base: "sadWalk", eyes: "half", ears: "flat" }, 76, -12)],
        bubbles: [hiss("hiss-bowl")],
      },
      calm: {
        idea: "Сидить між своєю мискою й котом, що підходить, притиснув вуха й шипить (бабл «шипить за миску»): ближче не підпустить.",
        still: { eyes: "half", ears: "flat" },
        props: [GUARDED],
        companions: [adult({ base: "walk", at: 100, flip: true, ears: "side" }, 80, -10)],
        bubbles: [hiss("hiss-bowl")],
      },
      sulk: {
        idea: "Насуплено сидить між своєю мискою й котом, що дивиться на неї, і шипить (бабл «шипить за миску»): не підпускає.",
        still: { ears: "flat" },
        props: [GUARDED],
        companions: [adult({ base: "sit", flip: true, ears: "side", eyes: "half" }, 78, -10)],
        bubbles: [hiss("hiss-bowl")],
      },
      ill: {
        idea: "Хворий лежить носом до своєї миски й, притиснувши вуха, шипить (бабл «шипить за миску») на кота, що сидить поодаль навпроти, — стереже її.",
        still: { ears: "flat" },
        props: [BOWL("cheap-1", 38, 10)],
        companions: [adult({ base: "sit", flip: true, ears: "side", eyes: "half" }, 104, -10)],
        bubbles: [hiss("hiss-bowl")],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться біля своєї миски, а з неї спокійно їсть інший кіт: усе спільне.",
        props: [SHARED],
        companions: [SHARER],
      },
      calm: { idea: "Спокійно сидить біля своєї миски й дивиться, як із неї хрумтить інший кіт, — не відганяє.", props: [SHARED], companions: [SHARER] },
      sulk: { idea: "Невесело сидить, а з його миски поруч спокійно їсть інший кіт — не відганяє.", props: [SHARED], companions: [SHARER] },
      ill: {
        idea: "Хворий лежить буханцем, а з його майже порожньої миски поруч їсть інший кіт — ділиться останнім.",
        props: [{ ...SHARED, state: "cheap-1", x: 50, y: 4 }],
        companions: [{ ...SHARER, x: 90 }],
      },
    },
  },
  nurturing: {
    plus: {
      content: {
        idea: "Мружиться, лежачи буханцем, а перед ним спить пригорнуте крихітне кошеня — гріє малечу.",
        still: { base: "loaf", eyes: "arc" },
        companions: [kitten({ base: "sleep", eyes: "closed" }, 16, 12, 0)],
      },
      calm: {
        idea: "Дбайливо вилизує голову кошеняті, а те мружиться й думає «приємно».",
        still: { base: "lick", at: 280, eyes: "half", mouth: "tongue" },
        companions: [kitten({ base: "sit", flip: true, eyes: "arc" }, 36, 8)],
        bubbles: [pleasant(0, -14)],
      },
      sulk: {
        idea: "Сам невеселий, а до його лап пригорнулося й спить крихітне кошеня — і він його не проганяє.",
        companions: [kitten({ base: "sleep", eyes: "closed" }, 26, 14, 0)],
      },
      ill: {
        idea: "Хворий лежить буханцем, а все одно гріє крихітне кошеня, що спить біля його грудей і думає «приємно».",
        companions: [kitten({ base: "sleep", eyes: "closed" }, 28, 14, 0)],
        bubbles: [pleasant(0)],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться й шипить (бабл «шипить на кошеня») на кошеня, що з притиснутими вухами тримається подалі.",
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 64, -4)],
        bubbles: [hiss("hiss-kitten")],
      },
      calm: {
        idea: "Сидить, прищуливши вуха, і шипить (бабл «шипить на кошеня») на кошеня, що з переляку присіло поодаль: до нього малечі зась.",
        still: { eyes: "half", ears: "back" },
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 62, -2)],
        bubbles: [hiss("hiss-kitten")],
      },
      sulk: {
        idea: "Насуплено сидить, притиснувши вуха, і шипить (бабл «шипить на кошеня») на перелякане кошеня — не підпускає малечу.",
        still: { ears: "flat" },
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 60, -2)],
        bubbles: [hiss("hiss-kitten")],
      },
      ill: {
        idea: "Хворий, а все одно притиснув вуха й шипить (бабл «шипить на кошеня») на кошеня, що тягнеться до нього.",
        still: { ears: "flat" },
        companions: [kitten({ base: "crouch", flip: true, ears: "flat", eyes: "round" }, 68, -2)],
        bubbles: [hiss("hiss-kitten")],
      },
    },
  },
  grooming: {
    plus: {
      content: {
        idea: "Мружиться, вилизуючи маківку іншому котові, а той ліг упритул і низько схилив голову, мружиться й думає «приємно».",
        still: { base: "lick", at: 280, eyes: "arc", mouth: "tongue" },
        companions: [GROOMED],
        bubbles: [GROOMED_PLEASANT],
      },
      calm: {
        idea: "Спокійно вилизує маківку іншому котові, а той ліг упритул і низько схилив голову й думає «приємно».",
        still: { base: "lick", at: 280, eyes: "half", mouth: "tongue" },
        companions: [GROOMED],
        bubbles: [GROOMED_PLEASANT],
      },
      sulk: {
        idea: "Насуплено, відвівши вуха, вилизує маківку іншому котові, що ліг упритул і низько схилив голову, а тому однаково приємно — щоб нудьгувати разом.",
        still: { base: "lick", at: 280, mouth: "tongue" },
        companions: [GROOMED],
        bubbles: [GROOMED_PLEASANT],
      },
      ill: {
        idea: "Хворий, а все одно вилизує маківку іншому котові, що ліг упритул і низько схилив голову, і тому приємно — хоч так відчути тепло.",
        still: { base: "lick", at: 280, eyes: "sick", mouth: "tongue", ears: "side" },
        companions: [GROOMED],
        bubbles: [GROOMED_PLEASANT],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, відвернувшись від кота, що лагідно тягнеться його вилизати, і думає «не вилизуй»: зачіска — недоторканна.",
        still: { flip: true, ears: "back" },
        companions: [LICKER],
        bubbles: [REFUSED],
      },
      calm: {
        idea: "Відвернувся, притиснувши вуха, від кота, що впритул тягнеться язиком до його потилиці, і думає «не вилизуй».",
        still: { flip: true, eyes: "half", ears: "flat" },
        companions: [LICKER_CLOSE],
        bubbles: [REFUSED],
      },
      sulk: {
        idea: "Насуплено відвернувся, притиснувши вуха, від кота, що марно тягнеться його вилизати, і думає «не вилизуй».",
        still: { flip: true, ears: "flat" },
        companions: [LICKER],
        bubbles: [REFUSED],
      },
      ill: {
        idea: "Хворий, а відвернувся, притиснувши вуха, від кота, що нахилився впритул вилизати йому спину, і думає «не вилизуй».",
        still: { flip: true, ears: "flat" },
        companions: [LICKER_LOW],
        bubbles: [REFUSED],
      },
    },
  },
};
