// Знімки рис розділу «Бешкет» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Тиха половина («−») має власний знак — думку з перекресленою іконкою прояву «+», як «Делікатний» над кухлем у грі: інакше
// єдина річ у кадрі — знак плюса, і фото читається як плюс. Річ-спокуса поруч із такою думкою читається «хоче, та не можна»,
// тож у «−» її в кадрі немає, або вона далеко за спиною кота, або ціла й на своєму місці; кіт зайнятий своїм.

import type { IconName } from "../iconnames";
import type { TraitBubble, TraitPerson, TraitPhotoShots, TraitProp } from "./types";

/** Думка «не буду»: прояв риси «+», перекреслений. */
const NOT: (icon: IconName) => TraitBubble[] = (icon) => [{ kind: "think", icon, mark: "no" }];
/** Та сама думка, зсунута за спину кота: попереду висока річ, і бабл не закриває її. */
const BACK_NOT: (icon: IconName) => TraitBubble[] = (icon) => [{ kind: "think", icon, mark: "no", dx: -26 }];

/** Кухонний стіл, на якому сидить кіт: корінь кота — посередині стільниці. */
const TABLE: TraitProp = { art: "env/table", state: null, x: 4, y: 36, scale: 0.76 };
/** Стілець перед лівою ніжкою стола: ховає складений папірець під нею (арт стола), який читали «щось упало». */
const TABLE_CHAIR: TraitProp[] = [
  { art: "env/chair-kitchen", state: "seat", x: -46, y: 40, scale: 0.76, front: true },
  { art: "env/chair-kitchen", state: "backrest", x: -46, y: 40, scale: 0.76, front: true },
];
const MUG_ON_TABLE: TraitProp = { art: "mess/trinket/mug", state: "standing", x: 26, y: 2, scale: 0.9 };
/** Стільниця на фото — ромб: на частку довжини від середини (−1 — лівий дальній кінець, 1 — правий ближній) — стільки одиниць. */
const TABLE_ALONG = { x: 48.7, y: 24.3 };
/** Стіл, на якому кіт сидить не посередині, а на частці `at` довжини стільниці: решта стільниці — під цілі речі. */
const tableUnder = (at: number): TraitProp[] => {
  const x = TABLE.x - at * TABLE_ALONG.x;
  const y = TABLE.y - at * TABLE_ALONG.y;
  return [{ ...TABLE, x, y }, ...TABLE_CHAIR.map((part) => ({ ...part, x: x - 50, y: y + 4 }))];
};
/**
 * Ціла дрібничка на стільниці під котом на частці `at`: `along` — уздовж від середини (−1…1), `across` — упоперек (−0,5…0,5,
 * «+» — до камери). Не на краю: кухоль за краєм стільниці читали «падає».
 */
const onTable = (at: number, kind: "mug" | "phone", along: number, across: number): TraitProp => ({
  art: `mess/trinket/${kind}`,
  state: "standing",
  x: Math.round((along - at - across) * TABLE_ALONG.x),
  y: Math.round((along - at + across) * TABLE_ALONG.y),
  scale: 0.9,
  front: true,
});
/** Кіт сидить на лівій половині стола, цілі кухоль і телефон стоять на правій. */
const SIT_AT = -0.55;
const TABLE_INTACT: TraitProp[] = [...tableUnder(SIT_AT), onTable(SIT_AT, "phone", 0.85, -0.15), onTable(SIT_AT, "mug", 0.35, 0.1)];
/** Рамка, у яку входить і друга половина стола з цілими речами: у типовій телефон на її кінці лишався за краєм фото. */
const WHOLE_TABLE = { w: 200, h: 200 } as const;
/** Те саме під буханцем: він довший, тож ближче до середини. */
const LOAF_AT = -0.35;
const TABLE_INTACT_LOAF: TraitProp[] = [...tableUnder(LOAF_AT), onTable(LOAF_AT, "phone", 0.9, -0.2), onTable(LOAF_AT, "mug", 0.55, 0.15)];
/** Той самий стіл позаду кота, що сидить на підлозі. */
const TABLE_BEHIND: TraitProp = { ...TABLE, x: -40, y: -22 };

/**
 * Подертий диван позаду, спинкою до камери: кіт стоїть під нею біля правого підлокітника, і латка з розрізами
 * (`env/trace/sofa`: на 27 правіше від pivot і на 4 нижче) — під лапами того, хто дере.
 */
const SOFA: TraitProp[] = [
  { art: "env/sofa", state: null, x: -54, y: -66 },
  { art: "env/trace/sofa", state: null, x: -54, y: -66 },
];
/** Кігтеточка в масштабі гри: стовпчик — біля pivot, лапи кота, що дере, дістають до нього. */
const SCRATCHER = (x: number, y: number): TraitProp => ({ art: "item/scratcher/cheap", state: null, x, y });
/** Дорога кігтеточка: стовпчик із полицею, без великого помпона дешевої (той читали «нема з ким гратися»). */
const SCRATCHER_PREMIUM = (x: number, y: number): TraitProp => ({ art: "item/scratcher/premium", state: null, x, y });

const WIRE = (state: "whole" | "chewed", x: number, y: number, front = true): TraitProp => ({ art: "env/wire", state, x, y, scale: 0.75, front });
const SPARK: TraitProp = { art: "fx/spark", state: "a", x: 18, y: 6, scale: 0.6, front: true };
/** Цілий дріт позаду кота, не навколо: петля навколо кота читалася «гризе дроти». */
const WIRE_BEHIND = WIRE("whole", 58, -38, false);
/** Цілий дріт далеко за спиною кота, що відвернувся: насуплена чи хвора морда біля дроту читалася «гризе, хоч заборонено». */
const WIRE_FAR = WIRE("whole", 76, -30, false);

/** Велика коробка з покупками, у якій сидить кіт: стінки спереду — поверх нього. */
const BOX: TraitProp[] = [
  { art: "env/boxes", state: "pile-1", x: 0, y: 48, scale: 1 },
  { art: "env/boxes/front", state: "pile-1", x: 0, y: 48, scale: 1, front: true },
];
/** Нова коробка поруч: кіт — біля її основи (pivot коробки — підлога під серединою, півширина — 72). */
const NEW_BOX = (x: number, y: number): TraitProp => ({ art: "env/boxes", state: "pile-1", x, y });

const FRIDGE_TOP: TraitProp = { art: "env/fridge", state: "closed", x: 0, y: 101, scale: 0.82 };
const WARDROBE_TOP: TraitProp = { art: "env/wardrobe", state: null, x: 0, y: 102, scale: 0.73 };
/**
 * Шафа, біля основи якої лежить кіт, що тримається землі: pivot шафи — підлога під її серединою, ближній кут — на 40 нижче; кіт —
 * перед ним.
 */
const WARDROBE_BY: TraitProp = { art: "env/wardrobe", state: null, x: 10, y: -44 };

/**
 * Вхідні двері в розрізі передньої стіни, як у квартирі: низьке полотно з номером і ручкою між стояками. Відчинені — кіт на порозі
 * (pivot — середина порога), правий стояк поверх нього. Місця підібрано для дверей розміру `scale`.
 */
const DOOR_SHUT: TraitProp = { art: "env/door", state: "closed", x: 62, y: -20, scale: 0.82 };
const DOOR_OPEN = (x: number, y: number, scale = 0.82): TraitProp[] => [
  { art: "env/door", state: "open", x, y, scale },
  { art: "env/door/leaf", state: null, x, y, scale },
  { art: "env/door/post", state: null, x, y, scale, front: true },
];
/** Двері, відчинені за спиною кота, що не йде: головний знак «−». */
const DOOR_BEHIND = DOOR_OPEN(70, -12, 0.73);
/** Рамка, у яку входить більша частина прорізу дверей поруч із котом: у типовій від них лишався вузький край зі стояком. */
const DOORWAY = { w: 190, h: 150 } as const;

const ROLL_EMPTY: TraitProp = { art: "env/toilet-roll", state: "unrolled", x: 54, y: 18, scale: 0.6 };
const PAPER = (front = false): TraitProp => ({ art: "mess/paper", state: null, x: 0, y: 10, scale: 0.8, front });

/**
 * Пташка сидить просто на голові кота, що не полює (на підлозі поруч із насупленою мордою її читали «підстерігає»): окремого арту
 * пташки немає — іконка `icon/bird` як річ на маківці.
 */
const BIRD: TraitProp = { art: "icon/bird", state: null, x: 0, y: -8, scale: 0.45, socket: "head" };
const SOCK = (x: number, y: number, flip = false, front = true): TraitProp => ({ art: "mess/sock", state: "peek", x, y, scale: 0.7, front, flip });
const FEATHERS = (x: number, y: number, front = true): TraitProp => ({ art: "item/toy/cheap", state: "hidden", x, y, scale: 0.6, front });
/**
 * Схованка під диваном: шкарпетки й пір'я позаду кота, а диван (спинкою до камери) — після них, тож передній край накриває
 * манжети, і з-під нього визирають лише п'ятки й пір'я.
 */
const STASH: TraitProp[] = [SOCK(-52, -33, false, false), SOCK(-22, -19, true, false), FEATHERS(-38, -27, false), { art: "env/sofa", state: null, x: -20, y: -46, scale: 0.32 }];

/** Ваші ноги просто перед мордою кота в засідці: у кадрі поруч із ним. */
const LEGS_AHEAD: TraitPerson = { pose: "stand", x: 38, y: -10 };
/** Думка кота в засідці: «кинутися на ногу» — над спиною, щоб не закривала ніг. */
const POUNCE_THOUGHT: TraitBubble[] = [{ kind: "think", icon: "pounce-leg", dx: -26 }];

const CABINET_OPEN: TraitProp[] = [
  { art: "env/cat-cabinet", state: "open", x: -26, y: -28, scale: 0.42 },
  { art: "env/cat-cabinet/cat-food", state: "full-3", x: -26, y: -28, scale: 0.42 },
];
const CABINET_SHUT: TraitProp = { art: "env/cat-cabinet", state: "closed", x: -40, y: -16, scale: 0.42 };
/** Зачинена шафка далеко за спиною голодного кота: упритул до неї вилизану миску читали «намагається відчинити». */
const CABINET_FAR: TraitProp = { ...CABINET_SHUT, x: -72, y: -24 };
/** Рамка, у яку входить і шафка далеко за спиною кота: у типовій від неї лишався вузький край. */
const WITH_CABINET = { w: 190, h: 160 } as const;
/** Ваші ноги перед котом, одразу за вилизаною мискою: корму він чекає від вас, а не з шафки. */
const LEGS_BY_BOWL: TraitPerson = { pose: "stand", x: 44, y: -12 };
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
        idea: "Щасливий кіт мружиться на столі поруч із цілими кухлем і телефоном, що стоять посеред стільниці; на підлозі — нічого, а в думці — перекреслений кухоль: «не чіпати».",
        props: TABLE_INTACT,
        bubbles: BACK_NOT("mug"),
        frame: WHOLE_TABLE,
      },
      calm: {
        idea: "Спокійний кіт на столі лише обнюхує цілий кухоль посеред стільниці, не торкаючись його лапою, і думає «не чіпати» з перекресленим кухлем.",
        still: { base: "sniff", at: 0 },
        props: [...tableUnder(SIT_AT), onTable(SIT_AT, "mug", 0.6, 0)],
        bubbles: BACK_NOT("mug"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить на столі спиною до цілих кухля й телефона, а в думці — перекреслений кухоль: хоч і ображений, нічого не скине.",
        still: { flip: true },
        props: TABLE_INTACT,
        bubbles: NOT("mug"),
        frame: WHOLE_TABLE,
      },
      ill: {
        idea: "Хворий кіт лежить буханцем на столі спиною до цілих кухля й телефона, а в думці — перекреслений кухоль: навіть тепер нічого не зачепить.",
        still: { flip: true },
        props: TABLE_INTACT_LOAF,
        bubbles: NOT("mug"),
        frame: WHOLE_TABLE,
      },
    },
  },
  scratching: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, стоїть на задніх лапах і дере спинку дивана — там уже латка й нитки.",
        still: { base: "scratch", at: 300, flip: true },
        props: SOFA,
      },
      calm: {
        idea: "Спокійний кіт стоїть на задніх лапах і точить кігті об подертий диван.",
        still: { base: "scratch", at: 750, flip: true },
        props: SOFA,
      },
      sulk: {
        idea: "Ображений кіт, похмуро примруживши очі й опустивши вуха, однаково дере диван — уже обдертий до ниток.",
        still: { base: "scratch", at: 300, flip: true, view: "front", eyes: "half", ears: "side" },
        props: SOFA,
      },
      ill: { idea: "Хворий кіт лежить буханцем біля подертого дивана — єдиного м'якого, що йому траплялося.", props: SOFA },
    },
    minus: {
      content: {
        idea: "Щасливий кіт, мружачись, дере дорогу кігтеточку з лежанкою — диван йому не потрібен.",
        still: { base: "scratch", at: 300 },
        props: [SCRATCHER_PREMIUM(24, -6)],
      },
      calm: { idea: "Спокійний кіт дере звичайну кігтеточку, як належить.", still: { base: "scratch", at: 750 }, props: [SCRATCHER(24, -6)] },
      sulk: {
        idea: "Ображений кіт, похмуро примруживши очі й опустивши вуха, однаково дере кігтеточку, а не диван.",
        still: { base: "scratch", at: 300, view: "front", eyes: "half", ears: "side" },
        props: [SCRATCHER(24, -6)],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем на подушці-полиці своєї кігтеточки — найріднішому місці в домі.",
        still: { shadow: false },
        props: [SCRATCHER_PREMIUM(0, 100)],
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
      sulk: {
        idea: "Ображений кіт насуплено сидить спиною до цілого дроту далеко позаду, а в думці — перекреслене «гризти дріт»: зла не зганяє на дротах.",
        still: { flip: true },
        props: [WIRE_FAR],
        bubbles: NOT("chew-wire"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем спиною до цілого дроту далеко позаду, і навіть тепер у думці — перекреслене «гризти дріт».",
        still: { flip: true },
        props: [WIRE_FAR],
        bubbles: NOT("chew-wire"),
      },
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
        props: [NEW_BOX(-78, -14)],
        bubbles: NOT("cat-box"),
      },
      calm: {
        idea: "Спокійний кіт сидить подалі від нової коробки, притиснувши вуха й трохи відвернувши голову, і думає «в коробку — ні».",
        still: { bones: { head: -10 }, ears: "flat" },
        props: [NEW_BOX(-78, -12)],
        bubbles: NOT("cat-box"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить, відвернувшись від нової коробки, і в думці перекреслює «кіт у коробці».",
        props: [NEW_BOX(-78, -12)],
        bubbles: NOT("cat-box"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, притиснувши вуха й відвернувшись від нової коробки, і в думці — перекреслений «кіт у коробці».",
        still: { flip: true, ears: "flat" },
        props: [NEW_BOX(78, -14)],
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
        idea: "Щасливий кіт мружиться, лежачи буханцем на підлозі біля основи шафи, а в думці — перекреслений «кіт нагорі»: нагору йому не треба.",
        still: { base: "loaf" },
        props: [WARDROBE_BY],
        bubbles: NOT("cat-high"),
      },
      calm: {
        idea: "Спокійний кіт лежить буханцем на підлозі біля основи шафи й думає «нагору — ні».",
        still: { base: "loaf" },
        props: [WARDROBE_BY],
        bubbles: NOT("cat-high"),
      },
      sulk: {
        idea: "Ображений кіт насуплено лежить буханцем біля основи шафи, і в думці — перекреслений «кіт нагорі»: навіть сховатися нагору не полізе.",
        still: { base: "loaf" },
        props: [WARDROBE_BY],
        bubbles: NOT("cat-high"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем біля основи шафи, а в думці — перекреслений «кіт нагорі»: нагору не полізе.",
        props: [WARDROBE_BY],
        bubbles: NOT("cat-high"),
      },
    },
  },
  escape: {
    plus: {
      content: {
        idea: "Щасливий кіт щодуху вибігає від нас у відчинені вхідні двері — на сходи, хвіст трубою.",
        still: { base: "run", at: 150, view: "back" },
        props: DOOR_OPEN(4, -6),
        frame: DOORWAY,
      },
      calm: {
        idea: "Спокійний кіт сидить під зачиненими дверима, тягне до них лапу й нявчить — бабл гри «проситься на сходи».",
        still: { base: "beg", at: 1000, mouth: "meow" },
        props: [DOOR_SHUT],
        frame: DOORWAY,
        bubbles: [{ kind: "say", icon: "door-ask" }],
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить під зачиненими дверима, а в думці — «на сходи»: не випускають.",
        props: [DOOR_SHUT],
        frame: DOORWAY,
        bubbles: [{ kind: "think", icon: "door-ask" }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем під зачиненими дверима й хрипко проситься на сходи — бабл гри вголос.",
        still: { mouth: "meow" },
        props: [DOOR_SHUT],
        frame: DOORWAY,
        bubbles: [{ kind: "say", icon: "door-ask" }],
      },
    },
    minus: {
      content: {
        idea: "Щасливий кіт мружиться спиною до відчинених вхідних дверей, а в думці — перекреслене «на сходи»: йому й удома добре.",
        still: { flip: true },
        props: DOOR_BEHIND,
        frame: DOORWAY,
        bubbles: NOT("door-ask"),
      },
      calm: {
        idea: "Спокійний кіт, притиснувши вуха, іде геть від відчинених вхідних дверей, думаючи «на сходи — ні».",
        still: { base: "walk", at: 300, flip: true, ears: "flat" },
        props: DOOR_BEHIND,
        frame: DOORWAY,
        bubbles: NOT("door-ask"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить, відвернувшись від відчинених дверей, і в думці перекреслює «на сходи»: за поріг ні кроку.",
        still: { flip: true },
        props: DOOR_BEHIND,
        frame: DOORWAY,
        bubbles: NOT("door-ask"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, відвернувшись від відчинених дверей, а в думці — перекреслене «на сходи».",
        still: { flip: true },
        props: DOOR_BEHIND,
        frame: DOORWAY,
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
      content: { idea: "Щасливий кіт мружиться, а пташка спокійно сидить у нього просто на голові.", props: [BIRD] },
      calm: {
        idea: "Спокійний кіт лежить буханцем, ліниво примруживши очі й дивлячись геть, а пташка сидить у нього на голові.",
        still: { base: "loaf", flip: true, eyes: "half" },
        props: [BIRD],
      },
      sulk: { idea: "Ображений кіт насуплено сидить, а пташка спокійно вмостилася в нього на голові: навіть не в гуморі він її не чіпає.", props: [BIRD] },
      ill: { idea: "Хворий кіт лежить буханцем, а пташка спокійно сидить у нього на голові — він їй не загроза.", props: [BIRD] },
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
        idea: "Щасливий кіт мружиться на порожній підлозі — ні здобичі, ні схованки, — а в думці — перекреслена шкарпетка: тягати її нікуди не буде.",
        bubbles: NOT("sock"),
      },
      calm: {
        idea: "Спокійний кіт сидить на порожній підлозі; у думці — перекреслена шкарпетка: собі нічого не бере.",
        bubbles: NOT("sock"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить на порожній підлозі й у думці перекреслює шкарпетку: чужого не бере навіть зі злості.",
        bubbles: NOT("sock"),
      },
      ill: {
        idea: "Хворий кіт лежить буханцем на порожній підлозі, а в думці — перекреслена шкарпетка: нічого не відкладає про запас.",
        bubbles: NOT("sock"),
      },
    },
  },
  ambush: {
    plus: {
      content: {
        idea: "Щасливий кіт, мружачись, вилетів із засідки й у стрибку вчепився передніми лапами у вашу ногу, що йде повз, — за ним ще тягнуться лінії швидкості, на нозі — подряпини.",
        still: { base: "pounce", at: 560 },
        // Подряпини на нозі (`claws` — бабл «подряпав» у грі) — знак нападу, а не ласки; заразом тримають ноги в рамці фото.
        props: [{ art: "fx/speed", state: null, x: -26, y: -4, scale: 0.6 }, { art: "icon/claws", state: null, x: 33, y: -40, scale: 0.36, front: true }],
        person: { pose: "walk", x: 26, y: -4 },
      },
      calm: {
        idea: "Спокійний кіт у засідці: припав до підлоги й втупився круглими очима, ваші ноги — просто перед мордою, а в думці — «кинутися на ногу».",
        still: { base: "crouch", at: 160, eyes: "round", ears: "up" },
        person: LEGS_AHEAD,
        bubbles: POUNCE_THOUGHT,
      },
      sulk: {
        idea: "Ображений кіт насуплено припав у засідці просто перед вашими ногами, а в думці — «кинутися на ногу»: чатує й не в гуморі.",
        still: { base: "crouch", at: 160 },
        person: LEGS_AHEAD,
        bubbles: POUNCE_THOUGHT,
      },
      ill: {
        idea: "Хворий кіт ледь тримається в засідці просто перед вашими ногами, а в думці — «кинутися на ногу»: чатує на них навіть тепер.",
        still: { base: "crouch", at: 0 },
        person: LEGS_AHEAD,
        bubbles: POUNCE_THOUGHT,
      },
    },
    minus: {
      // Знак «−» — перекреслена думка «кинутися на ногу», а ноги — поруч у кадрі; ліжка немає: воно вело до «хоче в ліжко».
      content: {
        idea: "Щасливий кіт розлігся животом догори просто біля ваших ніг, а в думці — перекреслене «кинутися на ногу»: нападати й на думці немає.",
        still: { base: "belly", at: 0 },
        person: { pose: "stand", x: 48, y: -12 },
        bubbles: BACK_NOT("pounce-leg"),
      },
      calm: {
        idea: "Спокійний кіт лежить буханцем, ліниво відвернувшись від ваших ніг, що стоять за його спиною, а в думці — перекреслене «кинутися на ногу».",
        still: { base: "loaf", flip: true, eyes: "half" },
        person: { pose: "stand", x: 44, y: -12 },
        bubbles: BACK_NOT("pounce-leg"),
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить спиною до ваших ніг, що стоять одразу за ним, а в думці — перекреслене «кинутися на ногу»: ображений, але не нападає.",
        still: { flip: true },
        person: { pose: "stand", x: 36, y: -12 },
        bubbles: BACK_NOT("pounce-leg"),
      },
      ill: {
        idea: "Хворий кіт тихо лежить буханцем, ваші ноги стоять поруч за його спиною, а в думці — перекреслене «кинутися на ногу»: нікого не чіпає.",
        person: { pose: "stand", x: -34, y: -12 },
        bubbles: BACK_NOT("pounce-leg"),
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
        idea: "Спокійний кіт сидить біля вилизаної миски перед вашими ногами, задерши до вас голову, і вголос просить корм; зачинена шафка — далеко за спиною, а в думці — перекреслена відчинена шафка: чекає, поки насиплете, сам не лізе.",
        still: { bones: { head: -14 }, mouth: "meow" },
        props: [CABINET_FAR, BOWL("licked", 40, 10)],
        person: LEGS_BY_BOWL,
        frame: WITH_CABINET,
        bubbles: [
          { kind: "say", icon: "kibble", dx: 6 },
          { kind: "think", icon: "cabinet-open", mark: "no", dx: -42 },
        ],
      },
      sulk: {
        idea: "Ображений кіт насуплено сидить біля вилизаної миски перед вашими ногами; зачинена шафка — далеко за спиною, а в думці — перекреслена відчинена шафка: чекає, поки нагодуєте, сам не відчинить.",
        props: [CABINET_FAR, BOWL("licked", 40, 10)],
        person: LEGS_BY_BOWL,
        frame: WITH_CABINET,
        bubbles: BACK_NOT("cabinet-open"),
      },
      ill: {
        idea: "Хворий кіт лежить біля вилизаної миски перед вашими ногами; зачинена шафка — далеко за спиною, а в думці — перекреслена відчинена шафка: що корм за дверцятами, не здогадується.",
        props: [CABINET_FAR, BOWL("licked", 42, 9)],
        person: LEGS_BY_BOWL,
        frame: WITH_CABINET,
        bubbles: BACK_NOT("cabinet-open"),
      },
    },
  },
};
