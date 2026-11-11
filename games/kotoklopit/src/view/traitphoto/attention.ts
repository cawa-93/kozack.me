// Знімки рис розділу «Увага й ласка» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Людини на фото немає: камера — це ви, тож «до вас» — обличчям у камеру, «від вас» — спиною. Ваші місця — речі квартири:
// крісло за комп'ютером — коліна, кухонний стілець — ноги, вхідні двері — повернення, кошик з білизною — ваш запах. Чого кіт
// хоче чи що каже — баблом над ним, як у грі (§11.4): вголос — те, що каже, думка — те, чого хоче мовчки.

import type { TraitPhotoShots, TraitProp } from "./types";

/** Крісло за комп'ютером; `x`, `y` — від кореня кота. Щоб кіт сидів на сидінні, — (0, 28): сидіння на 28 вище за pivot. */
const deskChair = (x: number, y: number): TraitProp[] => [
  { art: "env/chair-desk", state: "seat", x, y, scale: 0.8 },
  { art: "env/chair-desk", state: "backrest", x, y, scale: 0.8 },
];
const ON_CHAIR = deskChair(0, 28);
const BY_CHAIR = deskChair(58, -14);

const kitchenChair = (x: number, y: number): TraitProp[] => [
  { art: "env/chair-kitchen", state: "seat", x, y, scale: 0.6 },
  { art: "env/chair-kitchen", state: "backrest", x, y, scale: 0.6 },
];
/** Кіт притулився боком до передньої ніжки. */
const LEG_CLOSE = kitchenChair(34, -10);
const LEG_FAR = kitchenChair(96, -10);

/** Стіл із комп'ютером: корінь кота на клавіатурі — pivot на (6,4; 50,8) × масштаб нижче й правіше; на лівому краї стільниці — (64; 66,8). */
const DESK_SCALE = 0.44;
const desk = (x: number, y: number, state: "on" | "off" = "on"): TraitProp[] => [{ art: "env/computer", state, x: x * DESK_SCALE, y: y * DESK_SCALE, scale: DESK_SCALE }];
const ON_KEYBOARD = desk(6.4, 50.8);
const ON_DESK_EDGE = desk(64, 66.8);
const BY_DESK = desk(80, -72);

const FRONT_DOOR: TraitProp[] = [{ art: "env/door", state: "closed", x: 10, y: -30, scale: 0.38 }];

/** Відчинені двері між кімнатами: поріг, прочинене полотно й правий стояк поверх кота. */
const doorway = (x: number, y: number): TraitProp[] => [
  { art: "env/door", state: "open", x, y, scale: 0.38 },
  { art: "env/door/leaf", state: null, x, y, scale: 0.38 },
  { art: "env/door/post", state: null, x, y, scale: 0.38, front: true },
];
/** Ваші сліди (гліф «👣», A12): куди ви пішли. */
const steps = (x: number, y: number, rot = 0): TraitProp => ({ art: "ui/glyph/steps", state: null, x, y, rot, scale: 0.3, front: true });
const THROUGH_DOOR = [...doorway(-10, -10), steps(-60, 12, -140)];
const BY_DOOR = [...doorway(40, -24), steps(62, -26, 40)];

const HOUSE: TraitProp[] = [{ art: "item/house/premium", state: null, x: -44, y: -20, scale: 0.5 }];

/** Коробка перед котом: визирає з-за неї. */
const BOX: TraitProp[] = [{ art: "env/boxes", state: "pile-1", x: -22, y: 12, scale: 0.32, front: true }];

const icon = (name: string, x: number, y: number, s = 0.3, front = false): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale: s, ...(front ? { front } : {}) });

/**
 * Кадр речі на фото виходить ≈ в 1,6 раза більшим за одиниці місця (підібрано за знімками галереї), тож і точка `icon` фону
 * бабла (`ui/bubble/*`, A12) — у стільки ж разів далі від його pivot. Місця в кошеняти ближчі, а розмір той самий: іконка в нього
 * трохи нижча за середину бабла.
 */
const DRAWN = 1.6;
/** Бабл вголос: `x`, `y` — вістря хвостика (рот того, хто каже). */
const say = (name: string, x: number, y: number, s = 0.34): TraitProp[] => [
  { art: "ui/bubble/say", state: null, x, y, scale: s },
  { art: `icon/${name}`, state: null, x: x + 5.5 * s * DRAWN, y: y - 47 * s * DRAWN, scale: s },
];
/** Бабл-думка: `x`, `y` — найменший кружечок (біля голови того, хто думає); поверх іконки — позначка `icon/mark/*`, якщо є. */
const think = (name: string, x: number, y: number, s = 0.34, mark?: string): TraitProp[] => {
  const at = { x: x + 22.5 * s * DRAWN, y: y - 59 * s * DRAWN };
  return [
    { art: "ui/bubble/think", state: null, x, y, scale: s },
    { art: `icon/${name}`, state: null, ...at, scale: 0.9 * s },
    ...(mark ? [{ art: `icon/mark/${mark}` as const, state: null, ...at, scale: 0.9 * s }] : []),
  ];
};

// Де бабл у пози кота: вістря — трохи праворуч і вище за голову.
const SAY_SIT = { x: 28, y: -68 };
const SAY_LOAF = { x: 38, y: -46 };
const SAY_BEG = { x: 16, y: -88 };
const THINK_SIT = { x: 24, y: -72 };
const THINK_LOAF = { x: 34, y: -50 };
const THINK_BACK = { x: 26, y: -66 };
const THINK_NUDGE = { x: 38, y: -70 };

/** Серце на замку: довіру ще треба заслужити. */
const LOCKED_HEART: TraitProp[] = [icon("heart", 34, -84, 0.34), icon("lock", 42, -72, 0.26)];

const basket = (load: string): TraitProp => ({ art: "env/laundry-basket", state: load, x: 56, y: -12, scale: 0.6 });
const SURPRISE: TraitProp = { art: "mess/surprise", state: null, x: 40, y: 18, front: true, scale: 0.7 };
const TREAT = icon("treats", 34, 10, 0.3, true);
/** Рука гладить кота — іконка «хоче уваги» (A12) над ним. */
const PETTED = icon("attention", 10, -48, 0.4);

export const SHOTS: TraitPhotoShots = {
  affection: {
    plus: {
      content: {
        idea: "Стоїть із хвостом трубою й тягнеться лобом уперед, заплющивши очі від блаженства, а над ним — рожеві сердечка: бодається в руку того, хто фотографує, — ласки вдосталь.",
        still: { base: "nudge", at: 320 },
        props: [icon("pleasant", 42, -86, 0.3)],
      },
      calm: {
        idea: "Хвіст трубою, треться щокою об невидиму руку, очі спокійно напівзаплющені: по ласку — щодня, як на роботу.",
        still: { base: "nudge", at: 820, eyes: "half" },
      },
      sulk: {
        idea: "Тягнеться лобом уперед, але хвіст і вуха опущені, погляд сумний, а в думці — сердечка: просить ласки, якої бракує.",
        still: { base: "nudge", at: 320, view: "front", bones: { tail: -45 } },
        props: think("pleasant", THINK_NUDGE.x, THINK_NUDGE.y),
      },
      ill: {
        idea: "Хворий лежить буханцем, але тягне голову вгору, ніби бодається в руку, а в думці — сердечка: мріє про ласку, якої поруч немає.",
        still: { bones: { neck: -8, head: -20 } },
        props: think("pleasant", THINK_LOAF.x, THINK_LOAF.y - 4, 0.28),
      },
    },
    minus: {
      content: {
        idea: "Лежить біля власного будиночка й задоволено мружиться сам до себе: у нього свої сховки, і ласка йому потрібна лише тоді, коли сам захоче.",
        still: { base: "loaf", flip: true },
        props: HOUSE,
      },
      calm: {
        idea: "Іде геть спиною до камери, хвіст рівно: щойно потяглися погладити, чемно вислизнув з-під руки.",
        still: { base: "walk", at: 100, view: "back", bones: { tail: 20 } },
      },
      sulk: {
        idea: "Іде геть спиною до камери, похнюпившись і опустивши хвіст: тримається осторонь, хоч самотньо.",
        still: { base: "walk", at: 100, bones: { head: 12, tail: -40 } },
      },
      ill: {
        idea: "Хворий лежить біля свого будиночка, відвернувшись від усіх: забився у свій куток і нікого не чекає.",
        still: { flip: true },
        props: HOUSE,
      },
    },
  },
  petting: {
    plus: {
      content: {
        idea: "Розтікся на боці, очі заплющені від блаженства, а над ним — рука, що гладить: такого можна гладити годинами — і гладять.",
        still: { base: "sprawl" },
        props: [PETTED],
      },
      calm: {
        idea: "Спокійно лежить на боці, підставивши бік, очі напівзаплющені, а над ним — рука, що гладить: терпить будь-які пестощі й не думає кусатися.",
        still: { base: "sprawl", eyes: "half" },
        props: [PETTED],
      },
      sulk: {
        idea: "Лежить на боці спиною до камери, а в думці — рука, що гладить: терпіння на години пестощів, а гладять хвилинку.",
        still: { base: "sprawl" },
        props: think("attention", 30, -40),
      },
      ill: {
        idea: "Хворий безсило лежить на боці з хворими очима, а над ним — рука, що гладить: усе одно підставляє бік під руку.",
        still: { base: "sprawl" },
        props: [PETTED],
      },
    },
    minus: {
      content: {
        idea: "«Пастка на животику»: лежить на спині, пухнастий живіт напоказ, задоволено мружиться, а поруч — покусана долоня: радісно хапає кожну руку, що спокусилася.",
        still: { base: "belly" },
        props: [icon("bite", 46, -56, 0.3)],
      },
      calm: {
        idea: "Лежить на спині животом догори, але вуха притиснуті, а поруч — покусана долоня: живіт — приманка, торкнешся — вкусить.",
        still: { base: "belly", ears: "flat" },
        props: [icon("bite", 46, -56, 0.3)],
      },
      sulk: {
        idea: "Живіт напоказ, проте очі сердито примружені й вуха притиснуті, а поруч — покусана долоня: кожну ласку спершу перевіряє на зуб.",
        still: { base: "belly", view: "front", eyes: "squint", ears: "flat" },
        props: [icon("bite", 46, -56, 0.3)],
      },
      ill: {
        idea: "Хворий лежить буханцем і шипить, вишкіривши ікла, вуха назад, а поруч — покусана долоня: від болю кусає кожну руку.",
        still: { mouth: "hiss", ears: "back" },
        props: [icon("bite", 48, -46, 0.28)],
      },
    },
  },
  demanding: {
    plus: {
      content: {
        idea: "Звівся на задні лапи й нявчить у камеру, мружачись, а в баблі вголос — рука, що гладить: вимагає уваги й знає, що отримає.",
        still: { base: "beg", at: 1300, mouth: "meow" },
        props: say("attention", SAY_BEG.x, SAY_BEG.y),
      },
      calm: {
        idea: "Стоїть на задніх лапах і нявчить просто в камеру, а в баблі вголос — рука, що гладить: «увага — зараз».",
        still: { base: "beg", at: 1300, mouth: "meow" },
        props: say("attention", SAY_BEG.x, SAY_BEG.y),
      },
      sulk: {
        idea: "На задніх лапах нявчить у камеру, але погляд ображений і вуха опущені, а в баблі вголос — рука, що гладить: уваги вимагає щодня, та її не дають.",
        still: { base: "beg", at: 1300, view: "front", mouth: "meow" },
        props: say("attention", SAY_BEG.x, SAY_BEG.y),
      },
      ill: {
        idea: "Хворий, сидить і, піднявши лапу, нявчить у камеру, а в баблі вголос — рука, що гладить: до хрипоти благає уваги.",
        still: { base: "beg", at: 160, mouth: "meow" },
        props: say("attention", 24, -80, 0.3),
      },
    },
    minus: {
      content: {
        idea: "Скромно сидить, схиливши голову, задоволено мружиться, а ласку лише уявляє в думці: нічого не просить — і щасливий тим, що має.",
        still: { bones: { head: 12 } },
        props: think("attention", THINK_SIT.x, THINK_SIT.y),
      },
      calm: {
        idea: "Сидить тихенько, схиливши голову, і лише думає про ласку: чемно чекає, поки помітять, і не пхається.",
        still: { bones: { head: 12 } },
        props: think("attention", THINK_SIT.x, THINK_SIT.y),
      },
      sulk: {
        idea: "Сидить, низько опустивши голову й вуха, а ласка — лише в думці: не дочекався уваги, а попросити так і не наважився.",
        still: { base: "sit", view: "front", bones: { head: 18 } },
        props: think("attention", THINK_SIT.x, THINK_SIT.y),
      },
      ill: {
        idea: "Хворий лежить буханцем, низько схиливши голову, а ласка — лише в думці: так і не наважився попросити уваги.",
        still: { bones: { neck: 14, head: 22 } },
        props: think("attention", THINK_LOAF.x, THINK_LOAF.y + 4, 0.28),
      },
    },
  },
  talkative: {
    plus: {
      content: {
        idea: "Задер голову й співає на все горло, мружачись від задоволення, а в баблі — нявкання з дугами звуку: оперний співак, і його охоче слухають.",
        still: { mouth: "meow", bones: { head: -22, tail: 20 } },
        props: say("meow", SAY_SIT.x, SAY_SIT.y - 4),
      },
      calm: {
        idea: "Сидить і голосно нявчить у камеру, а в баблі — нявкання з дугами звуку: коментує все, що діється вдома.",
        still: { mouth: "meow", bones: { head: -16 } },
        props: say("meow", SAY_SIT.x, SAY_SIT.y),
      },
      sulk: {
        idea: "Нявчить, задерши голову, але погляд ображений і вуха опущені, а в баблі — нявкання з дугами звуку: скаржиться на весь дім.",
        still: { base: "sit", view: "front", mouth: "meow", bones: { head: -16 } },
        props: say("meow", SAY_SIT.x, SAY_SIT.y),
      },
      ill: {
        idea: "Хворий лежить буханцем і кличе, розтуливши рота, а в баблі — нявкання: голос слабкий, а відповіді немає.",
        still: { mouth: "meow", bones: { neck: -6, head: -12 } },
        props: say("meow", SAY_LOAF.x, SAY_LOAF.y - 4, 0.3),
      },
    },
    minus: {
      content: {
        idea: "Сидить, стуливши рота, і лагідно мружиться, а в баблі — лише три крапки: розуміє вас без слів.",
        still: { bones: { head: -6 } },
        props: say("meow-silent", SAY_SIT.x, SAY_SIT.y),
      },
      calm: {
        idea: "Розтуляє рота, а в баблі замість звуку — три крапки: «Німе кіно» просить, не видавши ні звуку.",
        still: { mouth: "meow", bones: { head: -8 } },
        props: say("meow-silent", SAY_SIT.x, SAY_SIT.y),
      },
      sulk: {
        idea: "Сидить, вуха опущені, рот розтулено, а в баблі — три крапки: скривджений, але й не пискне.",
        still: { base: "sit", view: "front", mouth: "meow" },
        props: say("meow-silent", SAY_SIT.x, SAY_SIT.y),
      },
      ill: {
        idea: "Хворий лежить буханцем, а в баблі — три крапки: навіть тепер не скаржиться вголос.",
        props: say("meow-silent", SAY_LOAF.x, SAY_LOAF.y, 0.3),
      },
    },
  },
  follower: {
    plus: {
      content: { idea: "Біжить слідом крізь відчинені двері в іншу кімнату, хвіст трубою, мружиться: тінь господаря.", still: { base: "walk", at: 100, flip: true }, props: THROUGH_DOOR },
      calm: { idea: "Крокує крізь дверний проріз за вами: з кімнати в кімнату, ні на крок не відстаючи.", still: { base: "walk", at: 100, flip: true }, props: THROUGH_DOOR },
      sulk: {
        idea: "Плентається крізь двері слідом, похнюпившись і опустивши хвіст: ходить за вами, хоч на нього рідко озираються.",
        still: { base: "sadWalk", at: 100, flip: true, eyes: "half", ears: "side" },
        props: THROUGH_DOOR,
      },
      ill: { idea: "Хворий, понуро бреде крізь двері слідом за вами: і тепер не лишається сам.", still: { base: "sadWalk", at: 100, flip: true }, props: THROUGH_DOOR },
    },
    minus: {
      content: { idea: "Лежить буханцем біля відчинених дверей і мружиться: чекає там, де його лишили, — знає, що ви повернетеся.", still: { base: "loaf" }, props: BY_DOOR },
      calm: { idea: "Сидить біля відчинених дверей і нікуди не йде: де лишили, там і шукайте.", props: BY_DOOR },
      sulk: { idea: "Сидить спиною до камери й дивиться в двері, за якими ви зникли: чекає, але слідом не йде.", props: BY_DOOR },
      ill: { idea: "Хворий лежить біля дверей, яких не переступає: днями чекає у своєму кутку.", props: BY_DOOR },
    },
  },
  legs: {
    plus: {
      content: { idea: "Треться щокою й боком об ніжку стільця, хвіст трубою, очі заплющені: «вісімка» під ногами — з любов'ю.", still: { base: "nudge", at: 820 }, props: LEG_CLOSE },
      calm: { idea: "Треться щокою об ніжку стільця, хвіст угору: щоденна «вісімка» біля ніг.", still: { base: "nudge", at: 820, eyes: "half" }, props: LEG_CLOSE },
      sulk: {
        idea: "Треться об ніжку стільця спиною до камери, похнюпившись і опустивши хвіст: пхається під ноги, а чує бурчання.",
        still: { base: "nudge", at: 820, view: "back", bones: { head: 8, tail: -40 } },
        props: LEG_CLOSE,
      },
      ill: { idea: "Хворий лежить, притулившись до ніжки стільця: тулиться до ніг, які рідко зупиняються поруч.", props: kitchenChair(30, -14) },
    },
    minus: {
      content: { idea: "Сидить на чемній відстані від стільця й задоволено мружиться: поруч, але не під ногами.", props: LEG_FAR },
      calm: { idea: "Сидить поодаль від стільця: особистий простір понад усе.", props: LEG_FAR },
      sulk: { idea: "Сидить спиною на відстані від стільця: чекає збоку, поки підійдуть самі, — та проходять повз.", props: LEG_FAR },
      ill: { idea: "Хворий лежить далеко від стільця: давно не чекає тепла біля ніг.", props: LEG_FAR },
    },
  },
  helper: {
    plus: {
      content: { idea: "Розлігся просто на клавіатурі перед увімкненим монітором і мружиться: співавтор вносить правки у звіт.", still: { base: "sprawl" }, props: ON_KEYBOARD },
      calm: { idea: "Лежить буханцем на клавіатурі перед увімкненим монітором: прокинувся саме тоді, коли вам працювати.", still: { base: "loaf" }, props: ON_KEYBOARD },
      sulk: { idea: "Сидить на робочому столі спиною до камери й дивиться в монітор: годинами стежить, як ви працюєте, і чекає уваги.", props: ON_DESK_EDGE },
      ill: { idea: "Хворий лежить на клавіатурі перед погаслим монітором: гріється там, де давно ніхто не працює.", props: desk(6.4, 50.8, "off") },
    },
    minus: {
      content: {
        idea: "Лежить буханцем на підлозі біля робочого столу й мружиться, а в думці — кіт на клавіатурі, перекреслений: не заважає працювати — найкращий колега.",
        still: { base: "loaf" },
        props: [...BY_DESK, ...think("cat-laptop", 6, -50, 0.34, "no")],
      },
      calm: {
        idea: "Лежить біля робочого столу, а не на ньому, а в думці — перекреслений кіт на клавіатурі: клавіатура — ваша, він лише складає компанію.",
        still: { base: "loaf" },
        props: [...BY_DESK, ...think("cat-laptop", 6, -50, 0.34, "no")],
      },
      sulk: {
        idea: "Сидить біля столу спиною до камери, а в думці — перекреслений кіт на клавіатурі: ви працюєте, а він нудьгує й чекає, коли відірветеся від екрана.",
        props: [...BY_DESK, ...think("cat-laptop", -14, -64, 0.34, "no")],
      },
      ill: {
        idea: "Хворий лежить біля робочого столу, а в думці — перекреслений кіт на клавіатурі: не сміє завадити роботі.",
        props: [...BY_DESK, ...think("cat-laptop", 6, -46, 0.3, "no")],
      },
    },
  },
  lap: {
    plus: {
      content: { idea: "Згорнувся клубком на вашому кріслі й солодко спить: де коліна — там і він, а нема колін — то хоч їхнє місце.", still: { base: "sleep" }, props: ON_CHAIR },
      calm: { idea: "Лежить буханцем на сидінні крісла: чекає, поки сядете, щоб перебратися на коліна.", still: { base: "loaf" }, props: ON_CHAIR },
      sulk: { idea: "Сидить на кріслі спиною до камери: чатує на коліна, а ви сідаєте так рідко.", props: ON_CHAIR },
      ill: { idea: "Хворий лежить на кріслі, де мали б бути ваші коліна.", props: ON_CHAIR },
    },
    minus: {
      content: {
        idea: "Сидить на підлозі біля порожнього крісла, відвернувшись від нього, і щасливо мружиться: любить вас, але суто з підлоги — на коліна нізащо.",
        still: { flip: true },
        props: BY_CHAIR,
      },
      calm: {
        idea: "Сидить біля порожнього крісла, відвернувшись, вуха набік, а над ним — сліди кігтів: на руки — ні, бо подряпає.",
        still: { flip: true, ears: "side" },
        props: [...BY_CHAIR, icon("claws", -40, -70, 0.26)],
      },
      sulk: {
        idea: "Б'є лапою з притиснутими вухами й сердитими очима, а над ним — сліди кігтів: «не чіпай мене» — з рук виривається.",
        still: { base: "paw", at: 0, view: "front", eyes: "squint", ears: "flat" },
        props: [...BY_CHAIR, icon("claws", -36, -86, 0.26)],
      },
      ill: {
        idea: "Хворий лежить біля крісла, відвернувшись, вуха притиснуті, а над ним — сліди кігтів: з рук виривається, хоч сил і мало.",
        still: { flip: true, ears: "flat" },
        props: [...BY_CHAIR, icon("claws", -42, -52, 0.24)],
      },
    },
  },
  devotion: {
    plus: {
      content: { idea: "Сидить під вхідними дверима обличчям до вас і повільно, щасливо мружиться: зустрів і каже по-котячому «люблю».", still: { overlay: "slowBlink" }, props: FRONT_DOOR },
      calm: { idea: "Зустрічає біля вхідних дверей, повільно моргаючи в камеру: дочекався.", still: { overlay: "slowBlink", eyes: "half" }, props: FRONT_DOOR },
      sulk: { idea: "Сидить спиною до камери й дивиться на зачинені вхідні двері: цілий день чекав, а ви все барилися.", props: FRONT_DOOR },
      ill: { idea: "Хворий лежить під вхідними дверима: вірить, що ось-ось почує ваші кроки.", props: FRONT_DOOR },
    },
    minus: {
      content: {
        idea: "Визирає з-за коробки й обережно мружиться, а над ним — сердечко: довго придивлявся, перш ніж відтанути, — зате тепер назавжди.",
        props: [...BOX, icon("heart", 30, -86, 0.3)],
      },
      calm: {
        idea: "Сидить, підозріло примруживши очі, а над ним — серце на замку: не поспішає довіряти, довіру треба заслужити.",
        still: { eyes: "squint" },
        props: LOCKED_HEART,
      },
      sulk: {
        idea: "Сидить, сердито примружившись, вуха опущені, а над ним — серце на замку: довіряє по крихті, а після кожної прикрості — знову спочатку.",
        still: { base: "sit", view: "front", eyes: "squint" },
        props: LOCKED_HEART,
      },
      ill: {
        idea: "Хворий лежить буханцем, а над ним — серце на замку: нікого не підпускає до серця, навіть тепер.",
        props: [icon("heart", 40, -66, 0.32), icon("lock", 48, -55, 0.24)],
      },
    },
  },
  touchy: {
    plus: {
      content: {
        idea: "Сидить боком, демонстративно відвернувшись і задерши носа, але мружиться, а в думці — надута образа: ображається величаво — і скоро так само величаво пробачить.",
        still: { flip: true, bones: { head: -14 } },
        props: think("sulk", -24, -72),
      },
      calm: {
        idea: "Сидить спиною до камери, підкреслено не помічаючи вас, а в думці — надута образа: дметься через дрібницю.",
        still: { base: "sulk", view: "back", ears: "up" },
        props: think("sulk", THINK_BACK.x, THINK_BACK.y),
      },
      sulk: {
        idea: "Сидить спиною до камери, низько схиливши голову, вуха притиснуті, а в думці — надута образа: образа надовго.",
        still: { ears: "flat", bones: { head: 10 } },
        props: think("sulk", THINK_BACK.x, THINK_BACK.y),
      },
      ill: {
        idea: "Хворий лежить, відвернувшись від камери, а в думці — надута образа: і хворіє, і ображається мовчки.",
        still: { flip: true },
        props: think("sulk", -30, -50, 0.28),
      },
    },
    minus: {
      content: {
        idea: "Іде просто до камери, хвіст трубою, мружиться, а в думці — надута образа, перекреслена мазком «ні»: хоч би що сталося, уже йде ластитися — прощає ще до перепросин.",
        still: { base: "walk", at: 100 },
        props: think("sulk", 30, -66, 0.34, "no"),
      },
      calm: {
        idea: "Іде до камери з хвостом угору, а в думці — перекреслена образа: після будь-якої халепи за хвилину знову по ласку, наче нічого не сталося.",
        still: { base: "walk", at: 100 },
        props: think("sulk", 30, -66, 0.34, "no"),
      },
      sulk: {
        idea: "Іде до камери, хоч вуха ще опущені й погляд сумний, а в думці — перекреслена образа: прикрість уже викинув з голови й знову по ласку.",
        still: { base: "walk", at: 100, view: "front" },
        props: think("sulk", 30, -66, 0.34, "no"),
      },
      ill: {
        idea: "Хворий, понуро бреде до камери, а в думці — перекреслена образа: без докору знову йде по ласку, якої бракує.",
        still: { base: "sadWalk", at: 100 },
        props: think("sulk", 36, -56, 0.28, "no"),
      },
    },
  },
  vengeful: {
    plus: {
      content: { idea: "Сидить біля кошика з білизною поруч зі своїм «сюрпризом» і задоволено мружиться: карає рідко й лише за діло.", props: [basket("load-1"), SURPRISE] },
      calm: {
        idea: "Біля кошика з вашою білизною — свіжий «сюрприз», а кіт хитро мружиться: звів рахунки за прикрість.",
        still: { eyes: "squint" },
        props: [basket("load-3"), SURPRISE],
      },
      sulk: { idea: "Сидить спиною до камери біля кошика з білизною й «сюрпризу»: ображений — і вже помстився.", props: [basket("load-4"), SURPRISE] },
      ill: {
        idea: "Хворий лежить біля переповненого кошика з білизною, поруч смердить «сюрприз»: тиха війна, у якій немає переможців.",
        props: [basket("overflow"), SURPRISE, { art: "fx/smell", state: "a", x: 40, y: 8, front: true, scale: 0.6 }],
      },
    },
    minus: {
      content: {
        idea: "Облизується біля кошика з білизною над рибкою-ласощами й мружиться — і довкола чисто: будь-яка образа тане від одного ласого шматочка.",
        still: { mouth: "tongue" },
        props: [basket("load-2"), TREAT],
      },
      calm: {
        idea: "Спокійно лежить біля кошика з білизною й облизується на рибку-ласощі, підлога чиста: прикрість забута за смаколик.",
        still: { base: "loaf", mouth: "tongue" },
        props: [basket("load-2"), TREAT],
      },
      sulk: {
        idea: "Сидить спиною до камери біля кошика з білизною — ображений, але без «сюрпризу», а в думці — рибка-ласощі: чекає смаколика, щоб пробачити.",
        props: [basket("load-4"), ...think("treats", -30, -64)],
      },
      ill: {
        idea: "Хворий лежить біля кошика з білизною, довкола чисто, а в думці — рибка-ласощі: навіть тепер не мститься, пробачив би за шматочок.",
        props: [basket("overflow"), ...think("treats", -24, -46, 0.28)],
      },
    },
  },
};
