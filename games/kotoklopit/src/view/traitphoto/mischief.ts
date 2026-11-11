// Знімки рис розділу «Бешкет» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Речі на фото виходять ≈ в 1,5 раза більшими відносно кота, ніж їхні одиниці: кіт стає на верх речі масштабу s з висотою h на
// y ≈ 1,5 · s · h (стіл, холодильник, шафа, коробка).

import type { TraitPhotoShots, TraitProp } from "./types";

/** Кухонний стіл, на якому сидить кіт: корінь кота — посередині стільниці. */
const TABLE: TraitProp = { art: "env/table", state: null, x: 4, y: 36, scale: 0.42 };
const MUG_ON_TABLE: TraitProp = { art: "mess/trinket/mug", state: "standing", x: 26, y: 2, scale: 0.5 };
const PHONE_ON_TABLE: TraitProp = { art: "mess/trinket/phone", state: "standing", x: -34, y: -6, scale: 0.6 };
/** Той самий стіл позаду кота, що сидить на підлозі. */
const TABLE_BEHIND: TraitProp = { ...TABLE, x: -40, y: -22 };

/** Диван ліворуч позаду: кіт дере торець підлокітника, де латка й подряпини. */
const SOFA = (x: number): TraitProp[] => [
  { art: "env/sofa", state: null, x, y: -14, scale: 0.32 },
  { art: "env/trace/sofa", state: null, x, y: -14, scale: 0.32 },
];
const SCRATCHER = (x: number, y: number): TraitProp => ({ art: "item/scratcher/cheap", state: null, x, y, scale: 0.6 });

const WIRE = (state: "whole" | "chewed", x: number, y: number, front = true): TraitProp => ({ art: "env/wire", state, x, y, scale: 0.75, front });
const SPARK: TraitProp = { art: "fx/spark", state: "a", x: 18, y: 6, scale: 0.6, front: true };

/** Велика коробка з покупками, у якій сидить кіт: стінки спереду — поверх нього. */
const BOX: TraitProp[] = [
  { art: "env/boxes", state: "pile-1", x: 0, y: 52, scale: 0.6 },
  { art: "env/boxes/front", state: "pile-1", x: 0, y: 52, scale: 0.6, front: true },
];
const NEW_BOX = (x: number, y: number, front = false): TraitProp => ({ art: "env/boxes", state: "pile-1", x, y, scale: 0.4, front });

const FRIDGE_TOP: TraitProp = { art: "env/fridge", state: "closed", x: 0, y: 101, scale: 0.45 };
const WARDROBE_TOP: TraitProp = { art: "env/wardrobe", state: null, x: 0, y: 102, scale: 0.4 };
const WARDROBE_SIDE: TraitProp = { art: "env/wardrobe", state: null, x: 52, y: -18, scale: 0.4 };

/**
 * Вхідні двері в розрізі передньої стіни: низьке полотно з номером і ручкою між стояками. Відчинені — кіт на порозі (pivot —
 * середина порога), правий стояк поверх нього.
 */
const DOOR_SHUT: TraitProp = { art: "env/door", state: "closed", x: 62, y: -20, scale: 0.45 };
const DOOR_OPEN = (x: number, y: number, scale = 0.45): TraitProp[] => [
  { art: "env/door", state: "open", x, y, scale },
  { art: "env/door/leaf", state: null, x, y, scale },
  { art: "env/door/post", state: null, x, y, scale, front: true },
];

const ROLL_EMPTY: TraitProp = { art: "env/toilet-roll", state: "unrolled", x: 54, y: 18, scale: 0.6 };
const PAPER = (front = false): TraitProp => ({ art: "mess/paper", state: null, x: 0, y: 10, scale: 0.8, front });

/** Пташка поруч із котом, що не полює: окремого арту пташки немає — іконка `icon/bird` як річ на підлозі. */
const BIRD = (x: number, y: number): TraitProp => ({ art: "icon/bird", state: null, x, y, scale: 0.45, front: true });
const SOCK = (x: number, y: number, flip = false): TraitProp => ({ art: "mess/sock", state: "peek", x, y, scale: 0.7, front: true, flip });
const FEATHERS = (x: number, y: number): TraitProp => ({ art: "item/toy/cheap", state: "hidden", x, y, scale: 0.6, front: true });
const BASKET: TraitProp = { art: "env/laundry-basket", state: "overflow", x: 52, y: -8, scale: 0.7 };

const BED_BEHIND: TraitProp = { art: "env/bed", state: "made", x: -56, y: -22, scale: 0.28 };

const CABINET_OPEN: TraitProp[] = [
  { art: "env/cat-cabinet", state: "open", x: -26, y: -28, scale: 0.42 },
  { art: "env/cat-cabinet/cat-food", state: "full-3", x: -26, y: -28, scale: 0.42 },
];
const CABINET_SHUT: TraitProp = { art: "env/cat-cabinet", state: "closed", x: -40, y: -16, scale: 0.42 };
const BOWL = (state: string): TraitProp => ({ art: "item/bowl/cheap", state, x: 26, y: 8, scale: 0.6, front: true });
const TRASH: TraitProp[] = [
  { art: "env/trash", state: "tipped", x: 46, y: -10, scale: 0.55 },
  { art: "mess/garbage", state: null, x: 26, y: 14, scale: 0.6, front: true },
];

export const SHOTS: TraitPhotoShots = {
  knocking: {
    plus: {
      content: {
        idea: "Щасливий кіт на столі, мружачись, штовхає лапою кухоль за край — той уже хилиться, а ручка лежить на підлозі.",
        still: { base: "knock", at: 300 },
        props: [TABLE, { ...MUG_ON_TABLE, rot: 30 }, { art: "mess/trinket/pen", state: "fallen", x: 44, y: 54, scale: 0.6, front: true }],
      },
      calm: {
        idea: "Спокійний кіт на столі дивиться просто в камеру й лапою підсуває кухоль до краю; під столом — уламки попереднього.",
        still: { base: "knock", at: 600 },
        props: [TABLE, MUG_ON_TABLE, { art: "mess/broken", state: null, x: 40, y: 56, scale: 0.6, front: true }],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною під столом біля уламків розбитого кухля — його насварили.",
        props: [TABLE_BEHIND, { art: "mess/broken", state: null, x: 30, y: 14, scale: 0.7, front: true }, { art: "mess/trinket/phone", state: "fallen", x: -32, y: 8, scale: 0.6 }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем під столом серед скинутого: розбитий кухоль, телефон, ще один кухоль — на гуркіт ніхто не прийшов.",
        props: [
          TABLE_BEHIND,
          { art: "mess/broken", state: null, x: 34, y: 12, scale: 0.6, front: true },
          { art: "mess/trinket/phone", state: "fallen", x: -36, y: 4, scale: 0.6 },
          { art: "mess/trinket/mug", state: "fallen", x: -14, y: 22, scale: 0.5, front: true },
        ],
      },
    },
    minus: {
      content: {
        idea: "Щасливий кіт мружиться на столі між телефоном і кухлем, не зачепивши жодного.",
        props: [TABLE, MUG_ON_TABLE, PHONE_ON_TABLE],
      },
      calm: {
        idea: "Спокійний кіт обережно ступає по столу повз телефон і кухоль, нічого не зачепивши.",
        still: { base: "walk", at: 200 },
        props: [TABLE, { ...MUG_ON_TABLE, x: 30, y: 14, front: true }, PHONE_ON_TABLE],
      },
      sulk: {
        idea: "Ображений кіт сидить на столі спиною до нас біля кухля з вистиглим чаєм і навіть не торкається його.",
        props: [TABLE, MUG_ON_TABLE],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем на столі поміж кухлем і телефоном — і навіть тепер нічого не зачепив.",
        props: [TABLE, { ...MUG_ON_TABLE, x: 36, y: 6 }, PHONE_ON_TABLE],
      },
    },
  },
  scratching: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, стоїть на задніх лапах і дере торець дивана — там уже латка й нитки.",
        still: { base: "scratch", at: 300, flip: true },
        props: SOFA(-58),
      },
      calm: {
        idea: "Спокійний кіт стоїть на задніх лапах і точить кігті об подертий диван.",
        still: { base: "scratch", at: 750, flip: true },
        props: SOFA(-58),
      },
      sulk: {
        idea: "Ображений кіт, похмуро примруживши очі й опустивши вуха, однаково дере диван — уже обдертий до ниток.",
        still: { base: "scratch", at: 300, flip: true, view: "front", eyes: "half", ears: "side" },
        props: SOFA(-58),
      },
      ill: { idea: "Хворий кіт лежить буханцем біля подертого дивана — єдиного м'якого, що йому траплялося.", props: SOFA(-74) },
    },
    minus: {
      content: {
        idea: "Щасливий кіт, мружачись, дере дорогу кігтеточку з лежанкою — диван йому не потрібен.",
        still: { base: "scratch", at: 300 },
        props: [{ art: "item/scratcher/premium", state: null, x: 20, y: -6, scale: 0.6 }],
      },
      calm: { idea: "Спокійний кіт дере звичайну кігтеточку, як належить.", still: { base: "scratch", at: 750 }, props: [SCRATCHER(20, -6)] },
      sulk: { idea: "Ображений кіт сидить спиною біля потертої кігтеточки — свою справу знає, хоч і нерадісно.", props: [SCRATCHER(40, -10)] },
      ill: { idea: "Хворий кіт лежить буханцем біля підніжжя кігтеточки.", props: [SCRATCHER(40, -10)] },
    },
  },
  chewing: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, лежить на дроті й гризе його — дріт уже перегризений, сиплються іскри.",
        still: { base: "chew", at: 300 },
        props: [WIRE("chewed", 44, -4, false), SPARK],
      },
      calm: { idea: "Спокійний кіт лежить на дроті від комп'ютера й гризе його, схиливши голову набік.", still: { base: "chew", at: 300 }, props: [WIRE("whole", 30, 4, false)] },
      sulk: { idea: "Ображений кіт сидить спиною біля перегризеного дроту — дістав на горіхи.", props: [WIRE("chewed", 30, 8, false)] },
      ill: { idea: "Хворий кіт лежить буханцем біля перегризеного дроту, що іскрить, — гриз із тривоги.", props: [WIRE("chewed", 30, 8, false), { ...SPARK, x: 2, y: 14 }] },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться посеред петлі цілого дроту — не надкусив його й не збирається.", props: [WIRE("whole", 4, -2)] },
      calm: { idea: "Спокійний кіт сидить біля цілого дроту й навіть не дивиться на нього.", props: [WIRE("whole", 4, -2)] },
      sulk: { idea: "Ображений кіт сидить спиною поруч із цілим дротом — гризти нічого, та він і не гризе.", props: [WIRE("whole", 4, -2)] },
      ill: { idea: "Хворий кіт лежить буханцем біля цілого дроту — навіть тепер його не надкусив.", props: [WIRE("whole", 4, -2)] },
    },
  },
  curiosity: {
    plus: {
      content: { idea: "Щасливий кіт мружиться, сидячи в коробці з-під покупок, — випробував її на зручність.", props: BOX },
      calm: { idea: "Спокійний кіт визирає з коробки, допитливо схиливши голову.", still: { bones: { head: 16 } }, props: BOX },
      sulk: { idea: "Ображений кіт нудьгує в коробці спиною до нас.", props: BOX },
      ill: { idea: "Хворий кіт лежить у старій коробці — шукав там затишку.", props: BOX },
    },
    minus: {
      content: {
        idea: "Щасливий кіт, мружачись, іде геть від нової коробки — йому й без неї добре.",
        still: { base: "walk", at: 200, eyes: "arc" },
        props: [NEW_BOX(-70, -12)],
      },
      calm: {
        idea: "Спокійний кіт насторожено тягнеться носом до нової коробки здалеку, притиснувши вуха.",
        still: { base: "sniff", at: 0, flip: true, ears: "flat" },
        props: [NEW_BOX(-84, -8)],
      },
      sulk: { idea: "Ображений кіт сидить спиною до нової коробки, ніби її тут немає.", props: [NEW_BOX(-50, 16, true)] },
      ill: {
        idea: "Хворий кіт лежить буханцем, притиснувши вуха й відвернувшись від нової коробки, — до нового не підходить.",
        still: { flip: true, ears: "flat" },
        props: [NEW_BOX(56, -6)],
      },
    },
  },
  climbing: {
    plus: {
      content: { idea: "Щасливий кіт мружиться на вершині холодильника.", props: [FRIDGE_TOP] },
      calm: { idea: "Спокійний кіт сидить на шафі й дивиться на нас згори.", props: [WARDROBE_TOP] },
      sulk: { idea: "Ображений кіт сидить на шафі спиною — пересиджує негаразди нагорі.", props: [WARDROBE_TOP] },
      ill: { idea: "Хворий кіт лежить буханцем на холодильнику — тулиться до теплого.", props: [FRIDGE_TOP] },
    },
    minus: {
      content: { idea: "Щасливий кіт лежить животом догори на підлозі біля високої шафи — нагору йому не треба.", still: { base: "belly", at: 0 }, props: [WARDROBE_SIDE] },
      calm: { idea: "Спокійний кіт сидить на підлозі біля підніжжя високої шафи й насторожено дивиться вгору.", still: { bones: { head: -30, neck: -10 }, ears: "flat" }, props: [WARDROBE_SIDE] },
      sulk: { idea: "Ображений кіт сидить спиною на підлозі під високою шафою, поглядаючи на неї знизу.", props: [WARDROBE_SIDE] },
      ill: { idea: "Хворий кіт лежить буханцем на холодній підлозі під шафою — не наважується піднятися.", props: [WARDROBE_SIDE] },
    },
  },
  escape: {
    plus: {
      content: { idea: "Щасливий кіт, мружачись, щодуху вибігає у відчинені двері — на сходи.", still: { base: "run", at: 150, flip: true }, props: DOOR_OPEN(4, -6) },
      calm: { idea: "Спокійний кіт сидить під зачиненими дверима, тягне до них лапу й нявчить.", still: { base: "beg", at: 1000, mouth: "meow" }, props: [DOOR_SHUT] },
      sulk: { idea: "Ображений кіт сидить спиною до нас, носом до зачинених дверей, і мріє про інше життя.", props: [DOOR_SHUT] },
      ill: { idea: "Хворий кіт лежить буханцем під зачиненими дверима й хрипко нявчить.", still: { mouth: "meow" }, props: [DOOR_SHUT] },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться спиною до відчинених дверей — йому й удома добре.", still: { flip: true }, props: DOOR_OPEN(70, -12, 0.4) },
      calm: { idea: "Спокійний кіт іде геть від відчинених дверей, назад у кімнату.", still: { base: "walk", at: 300, flip: true }, props: DOOR_OPEN(70, -12, 0.4) },
      sulk: { idea: "Ображений кіт сидить, відвернувшись від відчинених дверей, — за поріг ні кроку.", still: { flip: true }, props: DOOR_OPEN(70, -12, 0.4) },
      ill: { idea: "Хворий кіт лежить буханцем, притиснувши вуха й відвернувшись від відчинених дверей.", still: { flip: true, ears: "flat" }, props: DOOR_OPEN(70, -12, 0.4) },
    },
  },
  hunting: {
    plus: {
      content: { idea: "Щасливий кіт, мружачись, притискає лапами вполювану стрічку туалетного паперу; позаду — порожня втулка.", still: { base: "pounce", at: 900 }, props: [ROLL_EMPTY, PAPER()] },
      calm: { idea: "Спокійний кіт стоїть на задніх лапах і лапає рулон туалетного паперу.", still: { base: "scratch", at: 300 }, props: [{ art: "env/toilet-roll", state: "full", x: 26, y: 0, scale: 0.7 }] },
      sulk: { idea: "Ображений кіт сидить спиною посеред розмотаного паперу — іграшок йому не купують.", props: [ROLL_EMPTY, PAPER(true)] },
      ill: { idea: "Хворий кіт лежить буханцем на розмотаному папері — єдиній здобичі в порожній квартирі.", props: [ROLL_EMPTY, PAPER()] },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться, а пташка спокійно походжає в нього під носом.", props: [BIRD(56, 8)] },
      calm: { idea: "Спокійний кіт лежить буханцем і ліниво дивиться на пташку поруч — полювати не тягне.", still: { base: "decline", at: 0 }, props: [BIRD(56, 8)] },
      sulk: { idea: "Ображений кіт сидить спиною, а пташка поруч його анітрохи не цікавить.", props: [BIRD(56, 8)] },
      ill: { idea: "Хворий кіт лежить буханцем; пташка сидить зовсім поруч — немає сил навіть глянути.", props: [BIRD(56, 8)] },
    },
  },
  gifts: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, несе в зубах вашу шкарпетку до схованки.",
        still: { base: "carry", at: 0 },
        props: [{ art: "mess/sock", state: "carried", x: 31, y: -36, scale: 0.6, front: true }],
      },
      calm: { idea: "Спокійний кіт лежить буханцем біля своєї схованки: дві шкарпетки й пір'я іграшки.", still: { base: "loaf" }, props: [SOCK(30, 10), SOCK(-30, 12, true), FEATHERS(4, 20)] },
      sulk: { idea: "Ображений кіт сидить спиною, стерегучи купку шкарпеток і пір'я.", props: [SOCK(34, 10), FEATHERS(-28, 10)] },
      ill: { idea: "Хворий кіт лежить буханцем, обійнявши вашу шкарпетку, — хоч щось, що пахне вами.", props: [SOCK(18, 14)] },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться біля повного кошика білизни — шкарпетки лишаються в ньому.", props: [BASKET] },
      calm: { idea: "Спокійний кіт сидить біля кошика білизни й нічого з нього не тягне.", props: [BASKET] },
      sulk: { idea: "Ображений кіт сидить спиною біля кошика — нічого свого в нього немає.", props: [BASKET] },
      ill: { idea: "Хворий кіт лежить буханцем біля кошика — нічого не відкладає про запас.", props: [BASKET] },
    },
  },
  ambush: {
    plus: {
      content: { idea: "Щасливий кіт, мружачись, вистрибує з-за ліжка — просто на ноги.", still: { base: "pounce", at: 600 }, props: [BED_BEHIND] },
      calm: {
        idea: "Спокійний кіт у засідці біля ліжка: припав до підлоги, задерши зад, і втупився в нас круглими очима — ось-ось стрибне на ноги.",
        still: { base: "crouch", at: 160, eyes: "round", ears: "up" },
        props: [BED_BEHIND],
      },
      sulk: {
        idea: "Ображений кіт понуро припав до підлоги в засідці біля ліжка — ноги так і не прийшли.",
        still: { base: "crouch", at: 160, view: "front", eyes: "half", ears: "side" },
        props: [BED_BEHIND],
      },
      ill: {
        idea: "Хворий кіт ледь тримається в засідці біля ліжка, чатуючи на кроки, яких майже не чути.",
        still: { base: "crouch", at: 0, eyes: "sick", ears: "side" },
        props: [BED_BEHIND],
      },
    },
    minus: {
      content: { idea: "Щасливий кіт розлігся животом догори біля ліжка, посеред проходу, — ні на кого не нападає.", still: { base: "belly", at: 0 }, props: [BED_BEHIND] },
      calm: { idea: "Спокійний кіт лежить буханцем на видноті біля ліжка, де міг би влаштувати засідку.", still: { base: "loaf" }, props: [BED_BEHIND] },
      sulk: { idea: "Ображений кіт сидить спиною біля ліжка на видноті й лише зітхає вслід.", props: [BED_BEHIND] },
      ill: { idea: "Хворий кіт тихо лежить біля ліжка, нікого не чіпаючи.", props: [BED_BEHIND] },
    },
  },
  cunning: {
    plus: {
      content: { idea: "Щасливий кіт, мружачись, відчиняє лапою шафку з кормом, як власний холодильник.", still: { base: "knock", at: 600, flip: true }, props: CABINET_OPEN },
      calm: { idea: "Спокійний кіт сидить біля відчиненої шафки з кормом із невинним виглядом.", props: CABINET_OPEN },
      sulk: { idea: "Ображений кіт сидить спиною біля перекинутого смітника.", props: TRASH },
      ill: { idea: "Хворий кіт лежить буханцем біля перекинутого смітника — шукав там бодай щось їстівне.", props: TRASH },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться над повною мискою; шафка з кормом позаду зачинена — йому й на думку не спадає.", props: [CABINET_SHUT, BOWL("cheap-2")] },
      calm: {
        idea: "Спокійний кіт чемно чекає біля порожньої миски й здивовано схиляє голову до зачиненої шафки з кормом: як її відчинити — і на думку не спадає.",
        still: { bones: { head: 16 } },
        props: [CABINET_SHUT, BOWL("empty")],
      },
      sulk: { idea: "Ображений кіт сидить спиною біля порожньої миски; поруч зачинена шафка, яку він і не пробує відчинити.", props: [CABINET_SHUT, BOWL("empty")] },
      ill: { idea: "Хворий кіт лежить біля порожньої миски, не здогадуючись, що корм — за дверцятами шафки.", props: [CABINET_SHUT, { ...BOWL("empty"), x: 30 }] },
    },
  },
};
