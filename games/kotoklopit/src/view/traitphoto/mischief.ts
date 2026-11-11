// Знімки рис розділу «Бешкет» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Речі на фото виходять ≈ в 1,5 раза більшими відносно кота, ніж їхні одиниці: кіт стає на верх речі масштабу s з висотою h на
// y ≈ 1,5 · s · h (стіл, холодильник, шафа, коробка).
//
// Тиха половина («−») має власний знак — думку з перекресленою іконкою прояву «+», як «Делікатний» над кухлем у грі: інакше
// єдина річ у кадрі — знак плюса, і фото читається як плюс.

import type { IconName } from "../iconnames";
import type { TraitBubble, TraitPhotoShots, TraitProp } from "./types";

/** Думка «не буду»: прояв риси «+», перекреслений. */
const NOT: (icon: IconName) => TraitBubble[] = (icon) => [{ kind: "think", icon, mark: "no" }];
/** Та сама думка, зсунута за спину кота: попереду висока річ, і бабл не закриває її. */
const BACK_NOT: (icon: IconName) => TraitBubble[] = (icon) => [{ kind: "think", icon, mark: "no", dx: -26 }];

/** Кухонний стіл, на якому сидить кіт: корінь кота — посередині стільниці. */
const TABLE: TraitProp = { art: "env/table", state: null, x: 4, y: 36, scale: 0.42 };
/** Стілець перед лівою ніжкою стола: ховає складений папірець під нею (арт стола), який читали «щось упало». */
const TABLE_CHAIR: TraitProp[] = [
  { art: "env/chair-kitchen", state: "seat", x: -46, y: 40, scale: 0.42, front: true },
  { art: "env/chair-kitchen", state: "backrest", x: -46, y: 40, scale: 0.42, front: true },
];
const MUG_ON_TABLE: TraitProp = { art: "mess/trinket/mug", state: "standing", x: 26, y: 2, scale: 0.5 };
const PHONE_ON_TABLE: TraitProp = { art: "mess/trinket/phone", state: "standing", x: -34, y: -6, scale: 0.6 };
/** Той самий стіл позаду кота, що сидить на підлозі. */
const TABLE_BEHIND: TraitProp = { ...TABLE, x: -40, y: -22 };

/** Диван позаду: кіт дере торець підлокітника, де латка й подряпини. */
const SOFA = (x: number): TraitProp[] => [
  { art: "env/sofa", state: null, x, y: -14, scale: 0.32 },
  { art: "env/trace/sofa", state: null, x, y: -14, scale: 0.32 },
];
const SCRATCHER = (x: number, y: number): TraitProp => ({ art: "item/scratcher/cheap", state: null, x, y, scale: 0.6 });
/** Дорога кігтеточка: стовпчик із полицею, без великого помпона дешевої (той читали «нема з ким гратися»). */
const SCRATCHER_PREMIUM = (x: number, y: number): TraitProp => ({ art: "item/scratcher/premium", state: null, x, y, scale: 0.6 });

const WIRE = (state: "whole" | "chewed", x: number, y: number, front = true): TraitProp => ({ art: "env/wire", state, x, y, scale: 0.75, front });
const SPARK: TraitProp = { art: "fx/spark", state: "a", x: 18, y: 6, scale: 0.6, front: true };
/** Цілий дріт позаду кота, не навколо: петля навколо кота читалася «гризе дроти». */
const WIRE_BEHIND = WIRE("whole", 58, -38, false);

/** Велика коробка з покупками, у якій сидить кіт: стінки спереду — поверх нього. */
const BOX: TraitProp[] = [
  { art: "env/boxes", state: "pile-1", x: 0, y: 52, scale: 0.6 },
  { art: "env/boxes/front", state: "pile-1", x: 0, y: 52, scale: 0.6, front: true },
];
const NEW_BOX = (x: number, y: number): TraitProp => ({ art: "env/boxes", state: "pile-1", x, y, scale: 0.4 });

const FRIDGE_TOP: TraitProp = { art: "env/fridge", state: "closed", x: 0, y: 101, scale: 0.45 };
const WARDROBE_TOP: TraitProp = { art: "env/wardrobe", state: null, x: 0, y: 102, scale: 0.4 };
/** Шафа збоку, подалі: біля самих дверцят кіт читався «хоче в шафу». */
const WARDROBE_SIDE: TraitProp = { art: "env/wardrobe", state: null, x: 80, y: -30, scale: 0.4 };

/** Зачинені вхідні двері в розрізі передньої стіни: низьке червоне полотно з номером і ручкою між стояками. */
const DOOR_SHUT: TraitProp = { art: "env/door", state: "closed", x: 62, y: -20, scale: 0.45 };
/** Прочинені вхідні двері на повну висоту, за ними — сходи: двері в розрізі, відчинені, читалися проходом у коридор. */
const FRONT_DOOR = (x: number, y: number, scale = 0.32): TraitProp => ({ art: "env/front-door", state: null, x, y, scale });

const ROLL_EMPTY: TraitProp = { art: "env/toilet-roll", state: "unrolled", x: 54, y: 18, scale: 0.6 };
const PAPER = (front = false): TraitProp => ({ art: "mess/paper", state: null, x: 0, y: 10, scale: 0.8, front });

/** Пташка поруч із котом, що не полює: окремого арту пташки немає — іконка `icon/bird` як річ на підлозі. */
const BIRD = (x: number, y: number): TraitProp => ({ art: "icon/bird", state: null, x, y, scale: 0.45, front: true });
const SOCK = (x: number, y: number, flip = false, front = true): TraitProp => ({ art: "mess/sock", state: "peek", x, y, scale: 0.7, front, flip });
const FEATHERS = (x: number, y: number, front = true): TraitProp => ({ art: "item/toy/cheap", state: "hidden", x, y, scale: 0.6, front });
/**
 * Схованка під диваном: шкарпетки й пір'я позаду кота, а диван (спинкою до камери) — після них, тож передній край накриває
 * манжети, і з-під нього визирають лише п'ятки й пір'я.
 */
const STASH: TraitProp[] = [SOCK(-52, -33, false, false), SOCK(-22, -19, true, false), FEATHERS(-38, -27, false), { art: "env/sofa", state: null, x: -20, y: -46, scale: 0.32 }];

const BED_BEHIND: TraitProp = { art: "env/bed", state: "made", x: -56, y: -22, scale: 0.28 };

const CABINET_OPEN: TraitProp[] = [
  { art: "env/cat-cabinet", state: "open", x: -26, y: -28, scale: 0.42 },
  { art: "env/cat-cabinet/cat-food", state: "full-3", x: -26, y: -28, scale: 0.42 },
];
const CABINET_SHUT: TraitProp = { art: "env/cat-cabinet", state: "closed", x: -40, y: -16, scale: 0.42 };
/** Миска з кормом: керамічна, не синя — порожню синю читали мискою з водою; вилизана — `licked`. */
const BOWL = (state: string, x = 26, y = 8): TraitProp => ({ art: "item/bowl/premium", state, x, y, scale: 0.6, front: true });
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
        idea: "Ображений кіт насуплено сидить під столом серед уламків розбитого кухля й скинутого телефона — його насварили.",
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
        idea: "Щасливий кіт мружиться на столі між телефоном і кухлем, а над ним — думка з перекресленим кухлем: «не чіпати».",
        props: [TABLE, MUG_ON_TABLE, PHONE_ON_TABLE, ...TABLE_CHAIR],
        bubbles: NOT("mug"),
      },
      calm: {
        idea: "Спокійний кіт обережно йде по столу геть від кухля на самому краю, думаючи «не чіпати» з перекресленим кухлем.",
        still: { base: "walk", at: 200, flip: true },
        props: [TABLE, { ...MUG_ON_TABLE, x: 42, y: 6 }, ...TABLE_CHAIR],
        bubbles: NOT("mug"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить на столі, кухоль — позаду, а в думці перекреслений кухоль: хоч і ображений, нічого не скине.",
        props: [TABLE, { ...MUG_ON_TABLE, x: -30, y: -6 }, ...TABLE_CHAIR],
        bubbles: NOT("mug"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем на столі, кухоль — позаду, а в думці перекреслений кухоль: навіть тепер нічого не зачепить.",
        props: [TABLE, { ...MUG_ON_TABLE, x: -34, y: -8 }, ...TABLE_CHAIR],
        bubbles: NOT("mug"),
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
        props: [SCRATCHER_PREMIUM(20, -6)],
      },
      calm: { idea: "Спокійний кіт дере звичайну кігтеточку, як належить.", still: { base: "scratch", at: 750 }, props: [SCRATCHER(20, -6)] },
      sulk: {
        idea: "Ображений кіт, похмуро примруживши очі й опустивши вуха, однаково дере кігтеточку, а не диван.",
        still: { base: "scratch", at: 300, view: "front", eyes: "half", ears: "side" },
        props: [SCRATCHER(20, -6)],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, притулившись лапами до підставки своєї кігтеточки.",
        props: [SCRATCHER_PREMIUM(30, -8)],
      },
    },
  },
  chewing: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, лежить на дроті й гризе його — дріт уже перегризений, сиплються іскри.",
        still: { base: "chew", at: 300 },
        props: [WIRE("chewed", 44, -4, false), SPARK],
      },
      calm: {
        idea: "Спокійний кіт лежить на перегризеному дроті й гризе його, а над ним — бабл гри «хрумтить дротом».",
        still: { base: "chew", at: 300 },
        props: [WIRE("chewed", 30, 4, false)],
        bubbles: [{ kind: "say", icon: "chew-wire" }],
      },
      sulk: { idea: "Ображений кіт насуплено сидить на перегризеному дроті серед обривків — дістав на горіхи.", props: [WIRE("chewed", 30, 8, false)] },
      ill: { idea: "Хворий кіт лежить буханцем біля перегризеного дроту, що іскрить, — гриз із тривоги.", props: [WIRE("chewed", 30, 8, false), { ...SPARK, x: 2, y: 14 }] },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться перед цілим дротом, а в думці — перекреслене «гризти дріт»: і не збирається.", props: [WIRE_BEHIND], bubbles: NOT("chew-wire") },
      calm: { idea: "Спокійний кіт сидить перед цілим дротом, не торкаючись його, і думає «гризти — ні».", props: [WIRE_BEHIND], bubbles: NOT("chew-wire") },
      sulk: { idea: "Ображений кіт насуплено сидить перед цілим дротом, а в думці — перекреслене «гризти дріт»: зла не зганяє на дротах.", props: [WIRE_BEHIND], bubbles: NOT("chew-wire") },
      ill: { idea: "Хворий кіт лежить буханцем перед цілим дротом, і навіть тепер у думці — перекреслене «гризти дріт».", props: [WIRE_BEHIND], bubbles: NOT("chew-wire") },
    },
  },
  curiosity: {
    plus: {
      content: { idea: "Щасливий кіт мружиться, сидячи в коробці з-під покупок, — випробував її на зручність.", props: BOX },
      calm: { idea: "Спокійний кіт визирає з коробки, допитливо схиливши голову.", still: { bones: { head: 16 } }, props: BOX },
      sulk: { idea: "Ображений кіт насуплено сидить у коробці — нудьгує, а вилазити не збирається.", props: BOX },
      ill: { idea: "Хворий кіт лежить у старій коробці — шукав там затишку.", props: BOX },
    },
    minus: {
      content: {
        idea: "Щасливий кіт, мружачись, іде геть від нової коробки, а в думці — перекреслений «кіт у коробці»: йому й без неї добре.",
        still: { base: "walk", at: 200, eyes: "arc" },
        props: [NEW_BOX(-88, -12)],
        bubbles: NOT("cat-box"),
      },
      calm: {
        idea: "Спокійний кіт сидить подалі від нової коробки, притиснувши вуха й трохи відвернувши голову, і думає «в коробку — ні».",
        still: { bones: { head: -10 }, ears: "flat" },
        props: [NEW_BOX(-88, -8)],
        bubbles: NOT("cat-box"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить, відвернувшись від нової коробки, і в думці перекреслює «кіт у коробці».",
        props: [NEW_BOX(-88, -10)],
        bubbles: NOT("cat-box"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, притиснувши вуха й відвернувшись від нової коробки, і в думці — перекреслений «кіт у коробці».",
        still: { flip: true, ears: "flat" },
        props: [NEW_BOX(70, -10)],
        bubbles: NOT("cat-box"),
      },
    },
  },
  climbing: {
    plus: {
      content: { idea: "Щасливий кіт мружиться на вершині холодильника.", props: [FRIDGE_TOP] },
      calm: { idea: "Спокійний кіт сидить на шафі й дивиться на нас згори.", props: [WARDROBE_TOP] },
      sulk: { idea: "Ображений кіт насуплено сидить на шафі — пересиджує негаразди нагорі.", props: [WARDROBE_TOP] },
      ill: { idea: "Хворий кіт лежить буханцем на холодильнику — тулиться до теплого.", props: [FRIDGE_TOP] },
    },
    minus: {
      content: {
        idea: "Щасливий кіт лежить животом догори на підлозі поодаль від високої шафи, а в думці — перекреслений «кіт нагорі»: нагору йому не треба.",
        still: { base: "belly", at: 0 },
        props: [WARDROBE_SIDE],
        bubbles: BACK_NOT("cat-high"),
      },
      calm: {
        idea: "Спокійний кіт сидить на підлозі поодаль від високої шафи, задерши голову до її верху, і думає «нагору — ні».",
        still: { bones: { head: -40, neck: -10 }, ears: "flat" },
        props: [WARDROBE_SIDE],
        bubbles: NOT("cat-high"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить на підлозі поодаль від шафи, і в думці — перекреслений «кіт нагорі»: навіть сховатися нагору не полізе.",
        props: [WARDROBE_SIDE],
        bubbles: BACK_NOT("cat-high"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем на підлозі поодаль від шафи, а в думці — перекреслений «кіт нагорі»: нагору не полізе.",
        props: [WARDROBE_SIDE],
        bubbles: BACK_NOT("cat-high"),
      },
    },
  },
  escape: {
    plus: {
      content: {
        idea: "Щасливий кіт щодуху біжить від нас у прочинені вхідні двері — на сходи, хвіст трубою.",
        still: { base: "run", at: 150, view: "back" },
        props: [FRONT_DOOR(34, -34, 0.34), { art: "fx/speed", state: null, x: -18, y: 6, scale: 0.6 }],
      },
      calm: {
        idea: "Спокійний кіт сидить під зачиненими дверима, тягне до них лапу й нявчить — бабл гри «проситься на сходи».",
        still: { base: "beg", at: 1000, mouth: "meow" },
        props: [DOOR_SHUT],
        bubbles: [{ kind: "say", icon: "door-ask" }],
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить під зачиненими дверима, а в думці — «на сходи»: не випускають.",
        props: [DOOR_SHUT],
        bubbles: [{ kind: "think", icon: "door-ask" }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем під зачиненими дверима й хрипко проситься на сходи — бабл гри вголос.",
        still: { mouth: "meow" },
        props: [DOOR_SHUT],
        bubbles: [{ kind: "say", icon: "door-ask" }],
      },
    },
    minus: {
      content: {
        idea: "Щасливий кіт мружиться спиною до прочинених вхідних дверей, а в думці — перекреслене «на сходи»: йому й удома добре.",
        still: { flip: true },
        props: [FRONT_DOOR(72, -24)],
        bubbles: NOT("door-ask"),
      },
      calm: {
        idea: "Спокійний кіт, притиснувши вуха, іде геть від прочинених вхідних дверей, думаючи «на сходи — ні».",
        still: { base: "walk", at: 300, flip: true, ears: "flat" },
        props: [FRONT_DOOR(72, -24)],
        bubbles: NOT("door-ask"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить, відвернувшись від прочинених дверей, і в думці перекреслює «на сходи»: за поріг ні кроку.",
        still: { flip: true },
        props: [FRONT_DOOR(72, -24)],
        bubbles: NOT("door-ask"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, відвернувшись від прочинених дверей, а в думці — перекреслене «на сходи».",
        still: { flip: true, ears: "flat" },
        props: [FRONT_DOOR(72, -24)],
        bubbles: NOT("door-ask"),
      },
    },
  },
  hunting: {
    plus: {
      content: { idea: "Щасливий кіт, мружачись, притискає лапами вполювану стрічку туалетного паперу; позаду — порожня втулка.", still: { base: "pounce", at: 900 }, props: [ROLL_EMPTY, PAPER()] },
      calm: { idea: "Спокійний кіт стоїть на задніх лапах і лапає рулон туалетного паперу.", still: { base: "scratch", at: 300 }, props: [{ art: "env/toilet-roll", state: "full", x: 26, y: 0, scale: 0.7 }] },
      sulk: { idea: "Ображений кіт насуплено сидить посеред розмотаного паперу — іграшок йому не купують.", props: [ROLL_EMPTY, PAPER(true)] },
      ill: { idea: "Хворий кіт лежить буханцем на розмотаному папері — єдиній здобичі в порожній квартирі.", props: [ROLL_EMPTY, PAPER()] },
    },
    minus: {
      content: { idea: "Щасливий кіт мружиться, а пташка спокійно походжає в нього під носом.", props: [BIRD(56, 8)] },
      calm: {
        idea: "Спокійний кіт лежить буханцем, ліниво примруживши очі й дивлячись геть, а пташка походжає біля його хвоста.",
        still: { base: "loaf", flip: true, eyes: "half" },
        props: [BIRD(46, 8)],
      },
      sulk: { idea: "Ображений кіт насуплено сидить, відвернувшись, а пташка за його спиною його анітрохи не цікавить.", still: { flip: true }, props: [BIRD(50, 8)] },
      ill: { idea: "Хворий кіт лежить буханцем, відвернувшись; пташка сидить у нього за спиною — він її навіть не помічає.", still: { flip: true }, props: [BIRD(50, 8)] },
    },
  },
  gifts: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, несе в зубах вашу шкарпетку до схованки.",
        still: { base: "carry", at: 0 },
        props: [{ art: "mess/sock", state: "carried", x: 31, y: -36, scale: 0.6, front: true }],
      },
      calm: {
        idea: "Спокійний кіт лежить буханцем перед диваном і стереже схованку: з-під дивана визирають шкарпетки й пір'я іграшки.",
        still: { base: "loaf" },
        props: STASH,
      },
      sulk: { idea: "Ображений кіт насуплено сидить перед схованкою під диваном, звідки визирають шкарпетки й пір'я, — стереже своє.", props: STASH },
      ill: {
        idea: "Хворий кіт лежить буханцем перед своєю схованкою під диваном, обійнявши вашу шкарпетку, — хоч щось, що пахне вами.",
        props: [...STASH, SOCK(18, 14)],
      },
    },
    minus: {
      content: {
        idea: "Щасливий кіт мружиться поруч із вашою шкарпеткою на підлозі, а в думці — перекреслена шкарпетка: тягати її нікуди не буде.",
        props: [SOCK(50, 10)],
        bubbles: NOT("sock"),
      },
      calm: {
        idea: "Спокійний кіт сидить, а ваша шкарпетка лежить на видноті; у думці — перекреслена шкарпетка: собі нічого не бере.",
        props: [SOCK(50, 10)],
        bubbles: NOT("sock"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить, відвернувшись від шкарпетки на підлозі, і в думці її перекреслює: не його.",
        still: { flip: true },
        props: [SOCK(50, 10)],
        bubbles: NOT("sock"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, відвернувшись від шкарпетки на підлозі, а в думці — перекреслена шкарпетка: нічого не відкладає про запас.",
        still: { flip: true },
        props: [SOCK(50, 10)],
        bubbles: NOT("sock"),
      },
    },
  },
  ambush: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, з розгону вилетів з-за ліжка й учепився лапами у вашу ногу — за ним ще тягнуться лінії швидкості.",
        still: { base: "pounce", at: 760 },
        props: [BED_BEHIND, { art: "fx/speed", state: null, x: -24, y: 2, scale: 0.6 }],
        person: { pose: "stand", x: 30, y: -4 },
      },
      calm: {
        idea: "Спокійний кіт у засідці біля ліжка: припав до підлоги й втупився круглими очима у ваші ноги — ось-ось стрибне.",
        still: { base: "crouch", at: 160, eyes: "round", ears: "up" },
        props: [BED_BEHIND],
        person: { pose: "stand", x: 84, y: -12 },
      },
      sulk: {
        idea: "Ображений кіт понуро припав у засідці біля ліжка, примруживши очі на ваші ноги, — чатує, хоч і насуплено.",
        still: { base: "crouch", at: 160, view: "front", eyes: "half", ears: "side" },
        props: [BED_BEHIND],
        person: { pose: "stand", x: 84, y: -12 },
      },
      ill: {
        idea: "Хворий кіт ледь тримається в засідці біля ліжка, втупившись у ваші ноги, — чатує на них навіть тепер.",
        still: { base: "crouch", at: 0, eyes: "sick", ears: "side" },
        props: [BED_BEHIND],
        person: { pose: "stand", x: 84, y: -12 },
      },
    },
    minus: {
      // Перекреслені кігті (`claws`) не годяться: позначка «ні» — та сама червона риска, що й подряпини, і зливається з ними.
      content: {
        idea: "Щасливий кіт розлігся животом догори біля ліжка, просто біля ваших ніг: ноги поруч — а нападати й на думці немає.",
        still: { base: "belly", at: 0 },
        props: [BED_BEHIND],
        person: { pose: "stand", x: 60, y: -14 },
      },
      calm: {
        idea: "Спокійний кіт лежить буханцем біля ліжка, ліниво відвернувшись від ваших ніг, що стоять поруч, — і не думає на них чатувати.",
        still: { base: "loaf", flip: true, eyes: "half" },
        props: [BED_BEHIND],
        person: { pose: "stand", x: 60, y: -14 },
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить біля ліжка, відвернувшись від ваших ніг: ображений, але не припадає й не нападає.",
        still: { flip: true },
        props: [BED_BEHIND],
        person: { pose: "stand", x: 60, y: -14 },
      },
      ill: {
        idea: "Хворий кіт тихо лежить буханцем біля ліжка, а ваші ноги стоять поруч — нікого не чіпає.",
        props: [BED_BEHIND],
        person: { pose: "stand", x: 66, y: -16 },
      },
    },
  },
  cunning: {
    plus: {
      content: { idea: "Щасливий кіт, мружачись, відчиняє лапою шафку з кормом, як власний холодильник.", still: { base: "knock", at: 600, flip: true }, props: CABINET_OPEN },
      calm: { idea: "Спокійний кіт сидить біля відчиненої шафки з кормом із невинним виглядом.", props: CABINET_OPEN },
      sulk: { idea: "Ображений кіт насуплено сидить біля перекинутого смітника, звідки вже нарився.", props: TRASH },
      ill: { idea: "Хворий кіт лежить буханцем біля перекинутого смітника — шукав там бодай щось їстівне.", props: TRASH },
    },
    minus: {
      content: {
        idea: "Щасливий кіт мружиться над повною мискою, шафка з кормом позаду зачинена, а в думці — перекреслена відчинена шафка: і на думку не спадає.",
        props: [CABINET_SHUT, BOWL("premium-2")],
        bubbles: NOT("cabinet-open"),
      },
      calm: {
        idea: "Спокійний кіт чемно чекає біля вилизаної миски й здивовано схиляє голову, а в думці — шафка з питанням: як її відчинити?",
        still: { bones: { head: 16 } },
        props: [CABINET_SHUT, BOWL("licked")],
        bubbles: [{ kind: "think", icon: "cabinet-open", mark: "ask" }],
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить, відвернувшись від зачиненої шафки й вилизаної миски, а в думці — перекреслена відчинена шафка: сам не відчинить.",
        props: [{ ...CABINET_SHUT, x: -50, y: -18 }, BOWL("licked", -18, 12)],
        bubbles: NOT("cabinet-open"),
      },
      ill: {
        idea: "Хворий кіт лежить біля вилизаної миски, а в думці — перекреслена відчинена шафка: що корм за дверцятами, не здогадується.",
        props: [CABINET_SHUT, BOWL("licked", 30)],
        bubbles: NOT("cabinet-open"),
      },
    },
  },
};
