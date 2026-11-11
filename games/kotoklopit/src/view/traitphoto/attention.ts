// Знімки рис розділу «Увага й ласка» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Ви на фото — персонаж (`TraitShot.person`): стоїте, йдете, сидите в кріслі, тягнетеся погладити, відсмикуєте вкушену руку; де
// вас у кадрі немає, камера — теж ви: «до вас» — обличчям у камеру. Чого кіт хоче чи що каже — баблом над ним, як у грі (§11.4):
// вголос — те, що каже, думка — те, чого хоче мовчки; серце над котом — його почуття до вас (на замку — недовіра, з пластирем —
// образа, що загоїлась).

import type { IconName, Mark } from "../iconnames";
import type { TraitBubble, TraitPerson, TraitPhotoShots, TraitProp } from "./types";

const say = (icon: IconName, mark?: Mark): TraitBubble => ({ kind: "say", icon, ...(mark ? { mark } : {}) });
const think = (icon: IconName, mark?: Mark): TraitBubble => ({ kind: "think", icon, ...(mark ? { mark } : {}) });

const icon = (name: IconName, x: number, y: number, s = 0.3, front = false): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale: s, ...(front ? { front } : {}) });

/** Серце на замку: довіру ще треба заслужити. */
const lockedHeart = (x: number, y: number): TraitProp[] => [icon("heart", x, y, 0.34), icon("lock", x + 8, y + 12, 0.26)];
/** Розбите серце з пластирем на тріщині (як ❤️‍🩹): образа загоїлась. */
const healedHeart = (x: number, y: number, s = 0.5): TraitProp[] => [
  icon("mood-down", x, y, s),
  { art: "icon/bandage", state: null, x: x + 1, y, rot: -35, scale: s * 0.7 },
];

/** Ваші ноги поруч із котом: кіт притулився щокою до гомілки. */
const LEGS_CLOSE: TraitPerson = { pose: "stand", x: 40, y: -12 };
/** Ваші ноги на чемній відстані від кота. */
const LEGS_FAR: TraitPerson = { pose: "stand", x: 86, y: -14 };
/** Ви сидите в кріслі, кіт — на колінах: корінь кота — на стегнах. */
const LAP: TraitPerson = { pose: "lap", x: -4, y: 35 };
/** Кіт пірнає з ваших колін носом донизу: задні лапи ще біля колін, передні — над підлогою, тінь — на підлозі під ними. */
const LAP_LEAP: TraitPerson = { pose: "lap", x: -45, y: 34 };
const LEAP_SHADOW: TraitProp = { art: "fx/shadow/cat", state: null, x: 18, y: 36, scale: 0.8, withCat: true };
const LEAP_FRAME: { w: number; h: number } = { w: 130, h: 100 };
/** Рука гладить кота, що лежить на боці. */
const HAND: TraitPerson = { pose: "pet", x: -50, y: 16, front: true };
/** Рамка для низьких поз (на боці, на спині): кіт більший. */
const LOW: { w: number; h: number } = { w: 76, h: 60 };

/**
 * Тінь під вашими ногами. Персонаж рамку фото не розширює, а тінь — річ знімка: з нею ви в кадрі цілком, а не шматком біля краю.
 * Нахилені (`pet`) біля кошеняти зсуваються за долонею, тож тінь під ними точна лише біля дорослого кота.
 */
const under = (person: TraitPerson): TraitProp => ({ art: "fx/shadow/person", state: null, x: person.x, y: person.y });
/** Рамка, у яку ви, стоячи на повен зріст, уміщаєтеся поруч із котом. */
const FULL: { w: number; h: number } = { w: 170, h: 100 };

/** Ви йдете, а кіт — слідом, за п'ятами. */
const WALK_AHEAD: TraitPerson = { pose: "walk", x: 62, y: -8 };
/** Ви йдете геть і вже далеко, а кіт лишився, де був. */
const WALK_AWAY: TraitPerson = { pose: "walk", x: 108, y: -20 };
/** Ви стоїте за спиною в кота й дивитеся на нього. */
const LEGS_BEHIND: TraitPerson = { pose: "stand", x: 74, y: -10, flip: true };
/** Ви стоїте поруч, відвернувшись: кота не помічаєте. */
const LEGS_UNAWARE: TraitPerson = { pose: "stand", x: 62, y: -12 };
/** Ви нахилилися погладити кота, а він уже відійшов: долоня лишилася далеко за його хвостом. */
const HAND_AFTER: TraitPerson = { pose: "pet", x: -90, y: -2 };
/** Ви відсмикуєте вкушену руку, стоячи над котом; «ой!» — бабл укусу вголос біля вашої голови, як у грі. */
const BITTEN: TraitPerson = { pose: "bitten", x: -20, y: -12 };
const OUCH: TraitBubble = { kind: "say", icon: "bite", over: "person", dx: 52, dy: 42 };
const BITTEN_FRAME: { w: number; h: number } = { w: 184, h: 100 };
/** Ви простягаєте долоню назустріч котові, що йде до вас: перед його лобом; `_LOW` — над головою понурого. */
const OFFERED_HAND: TraitPerson = { pose: "pet", x: 68, y: -22, flip: true };
const OFFERED_HAND_LOW: TraitPerson = { pose: "pet", x: 64, y: -16, flip: true };
/** Ваша долоня там, куди кіт бодається лобом; `_LOW` — над головою кота, що лежить. */
const NUDGED_HAND: TraitPerson = { pose: "pet", x: 60, y: -22, flip: true };
const NUDGED_HAND_LOW: TraitPerson = { pose: "pet", x: 46, y: -18, flip: true };
/** Рамка, у яку ви, нахилившись до кота, вміщаєтеся з головою. */
const BENT: { w: number; h: number } = { w: 138, h: 100 };
/** Думка «погладьте?» — над спиною кота, а не над вашими ногами. */
const QUIET_ASK: TraitBubble = { kind: "think", icon: "attention", mark: "ask", dx: -14 };
/** Сталий нахил кота, що пірнає з колін: усе тіло носом донизу, голова трохи вирівняна. */
const LEAP_DOWN = { root: 34, head: -12 } as const;
/** Пара від носа (😤), як у пози рівня «ображено»: іде за головою. */
const HUFF: TraitProp = { art: "fx/huff", state: null, x: 4, y: 2, rot: 10, socket: "teeth" };

/** Стіл із комп'ютером: корінь кота на клавіатурі — pivot на (6,4; 50,8) × масштаб нижче й правіше. */
const DESK_SCALE = 0.7;
const desk = (x: number, y: number, state: "on" | "off" = "on"): TraitProp[] => [{ art: "env/computer", state, x: x * DESK_SCALE, y: y * DESK_SCALE, scale: DESK_SCALE }];
const ON_KEYBOARD = desk(6.4, 50.8);
const BY_DESK = desk(80, -72);

const FRONT_DOOR: TraitProp[] = [{ art: "env/door", state: "closed", x: 20, y: -44, scale: 0.6 }];

const basket = (load: string): TraitProp => ({ art: "env/laundry-basket", state: load, x: 64, y: -14, scale: 0.8 });
const SURPRISE: TraitProp = { art: "mess/surprise", state: null, x: 46, y: 20, front: true, scale: 0.85 };
const TREAT = icon("treats", 40, 14, 0.36, true);
/** Рибка-ласощі під самим носом кота. */
const treatAt = (x: number, y: number): TraitProp => icon("treats", x, y, 0.36, true);

export const SHOTS: TraitPhotoShots = {
  affection: {
    plus: {
      content: {
        idea: "Стоїть із хвостом трубою й тягнеться лобом уперед, заплющивши очі від блаженства, а над ним — рожеві сердечка: бодається в руку того, хто фотографує, — ласки вдосталь.",
        still: { base: "nudge", at: 320 },
        props: [icon("pleasant", 42, -86, 0.3)],
      },
      calm: {
        idea: "Хвіст трубою, треться щокою об невидиму руку, а над ним — менші сердечка: по ласку — щодня, як на роботу.",
        still: { base: "nudge", at: 820 },
        props: [icon("pleasant", 42, -80, 0.26)],
      },
      sulk: {
        idea: "Насуплений, хвіст опущений, а однаково підійшов і бодається лобом у вашу простягнуту долоню, над спиною — сердечка: ображений, та по ласку приходить сам.",
        still: { base: "nudge", at: 320, bones: { head: 10, tail: -45 } },
        person: NUDGED_HAND,
        props: [under(NUDGED_HAND), icon("pleasant", -26, -68, 0.26)],
        frame: BENT,
      },
      ill: {
        idea: "Хворий лежить буханцем із градусником, але тягне голову вгору — під вашу долоню, над спиною — сердечка: і хворий тягнеться по ласку.",
        still: { bones: { neck: -8, head: -20 } },
        person: NUDGED_HAND_LOW,
        props: [under(NUDGED_HAND_LOW), icon("pleasant", -28, -48, 0.26)],
        frame: BENT,
      },
    },
    minus: {
      content: {
        idea: "Ви нахилилися й тягнетеся його погладити, а він, хвіст трубою, задоволено мружачись, іде геть від вашої долоні: щасливий сам по собі, рук не треба.",
        still: { base: "walk", at: 100, bones: { tail: 30 } },
        person: HAND_AFTER,
        props: [under(HAND_AFTER)],
      },
      calm: {
        idea: "Ви нахилилися й тягнетеся погладити, а він спокійно, не озираючись, іде геть від вашої долоні, хвіст рівно: щойно простягли руку, чемно вислизнув.",
        still: { base: "walk", at: 100, bones: { tail: 10 } },
        person: HAND_AFTER,
        props: [under(HAND_AFTER)],
      },
      sulk: {
        idea: "Ви тягнетеся погладити, а він, насуплений, з парою від носа й опущеним хвостом, іде геть від вашої долоні: ображений, а рук однаково не підпускає.",
        still: { base: "walk", at: 100, bones: { head: 10, tail: -35 } },
        person: HAND_AFTER,
        props: [under(HAND_AFTER)],
      },
      ill: {
        idea: "Ви тягнетеся погладити хворого, а він із градусником у роті понуро бреде геть від вашої долоні: і тепер не хоче, щоб його чіпали.",
        still: { base: "sadWalk", at: 100 },
        person: HAND_AFTER,
        props: [under(HAND_AFTER)],
      },
    },
  },
  petting: {
    plus: {
      content: {
        idea: "Розтікся на боці, очі заплющені від блаженства, а ваша рука гладить його: такого можна гладити годинами — і гладять.",
        still: { base: "sprawl" },
        person: HAND,
        frame: LOW,
      },
      calm: {
        idea: "Спокійно дрімає на боці під вашою рукою, очі заплющені: терпить будь-які пестощі й не думає кусатися.",
        still: { base: "sprawl", eyes: "closed" },
        person: HAND,
        frame: LOW,
      },
      sulk: {
        idea: "Лежить на боці, розплющені очі сумні, вуха притиснуті, а в думці — рука, що гладить: терпіння на години пестощів, а гладять хвилинку.",
        still: { base: "sprawl", eyes: "open", ears: "flat" },
        bubbles: [think("attention")],
        frame: LOW,
      },
      ill: {
        idea: "Хворий безсило лежить на боці з градусником у роті, ваша рука гладить його, а в думці — сердечка: і хворому приємно під рукою, підставляє бік.",
        still: { base: "sprawl" },
        person: HAND,
        bubbles: [think("pleasant")],
        frame: LOW,
      },
    },
    minus: {
      content: {
        idea: "«Пастка на животику»: лежить на спині животом догори й задоволено мружиться, а ви, відсахнувшись, відсмикуєте руку, біля вашої голови — «ой!» з покусаною долонею: радісно ловить кожну руку, що спокусилася на живіт.",
        still: { base: "belly" },
        person: BITTEN,
        bubbles: [OUCH],
        frame: BITTEN_FRAME,
      },
      calm: {
        idea: "Спокійно лежить на спині животом догори, наче нічого не сталося, а ви відсмикуєте руку з «ой!» і покусаною долонею в баблі: живіт — приманка, торкнешся — вкусить.",
        still: { base: "belly" },
        person: BITTEN,
        bubbles: [OUCH],
        frame: BITTEN_FRAME,
      },
      sulk: {
        idea: "Лежить на спині животом догори, очі сердито примружені, вуха назад, шипить, вишкіривши ікла, а ви відсмикуєте руку з «ой!» і покусаною долонею в баблі: кожну ласку перевіряє на зуб.",
        still: { base: "belly", mouth: "hiss" },
        person: BITTEN,
        bubbles: [OUCH],
        frame: BITTEN_FRAME,
      },
      ill: {
        idea: "Хворий лежить буханцем із градусником, вуха назад, а ви відсмикуєте руку з «ой!» і покусаною долонею в баблі: і хворий кусає руку, що гладить.",
        still: { ears: "back" },
        person: BITTEN,
        bubbles: [OUCH],
        frame: BITTEN_FRAME,
      },
    },
  },
  demanding: {
    plus: {
      content: {
        idea: "Звівся на задні лапи й нявчить у камеру, мружачись, а в баблі вголос — рука, що гладить: вимагає уваги й знає, що отримає.",
        still: { base: "beg", at: 1300, mouth: "meow" },
        bubbles: [say("attention")],
      },
      calm: {
        idea: "Стоїть на задніх лапах і нявчить просто в камеру, а в баблі вголос — рука, що гладить: «увага — зараз».",
        still: { base: "beg", at: 1300, mouth: "meow" },
        bubbles: [say("attention")],
      },
      sulk: {
        idea: "На задніх лапах нявчить у камеру, але очі сердито примружені й вуха притиснуті, а в баблі вголос — рука, що гладить: уваги вимагає щодня, та її не дають.",
        still: { base: "beg", at: 1300, mouth: "meow", eyes: "squint" },
        bubbles: [say("attention")],
      },
      ill: {
        idea: "Хворий, сидить і, піднявши лапу, нявчить у камеру, а в баблі вголос — рука, що гладить: до хрипоти благає уваги.",
        still: { base: "beg", at: 160, mouth: "meow" },
        bubbles: [say("attention")],
      },
    },
    minus: {
      content: {
        idea: "Ви стоїте поруч, відвернувшись, а він мовчки сидить біля ваших ніг, задерши до вас голову й задоволено мружачись, у думці — рука, що гладить, зі знаком питання: «може, погладите?» — і не нявкне, щасливий тим, що має.",
        still: { bones: { head: -10 } },
        person: LEGS_UNAWARE,
        props: [under(LEGS_UNAWARE)],
        bubbles: [QUIET_ASK],
        frame: FULL,
      },
      calm: {
        idea: "Ви стоїте поруч, відвернувшись, а він тихо сидить біля ваших ніг, задерши до вас голову, рот стулений, у думці — рука, що гладить, зі знаком питання: чемно чекає, поки помітять, і не пхається.",
        still: { bones: { head: -10 } },
        person: LEGS_UNAWARE,
        props: [under(LEGS_UNAWARE)],
        bubbles: [QUIET_ASK],
        frame: FULL,
      },
      sulk: {
        idea: "Ви стоїте поруч, відвернувшись, а він сидить біля ваших ніг насуплений, опустивши голову, у думці — рука, що гладить, зі знаком питання: не дочекався уваги, а попросити вголос так і не наважився.",
        person: LEGS_UNAWARE,
        props: [under(LEGS_UNAWARE)],
        bubbles: [{ ...QUIET_ASK, dx: -24 }],
        frame: FULL,
      },
      ill: {
        idea: "Ви стоїте поруч, відвернувшись, а хворий мовчки лежить біля ваших ніг із градусником у роті, у думці — рука, що гладить, зі знаком питання: так і не наважився попросити уваги.",
        person: LEGS_UNAWARE,
        props: [under(LEGS_UNAWARE)],
        bubbles: [{ ...QUIET_ASK, dx: -36 }],
        frame: FULL,
      },
    },
  },
  talkative: {
    plus: {
      content: {
        idea: "Задер голову й співає на все горло, мружачись від задоволення, а в баблі — нявкання з дугами звуку: оперний співак, і його охоче слухають.",
        still: { mouth: "meow", bones: { head: -22, tail: 20 } },
        bubbles: [say("meow")],
      },
      calm: {
        idea: "Сидить і голосно нявчить у камеру, а в баблі — нявкання з дугами звуку: коментує все, що діється вдома.",
        still: { mouth: "meow", bones: { head: -16 } },
        bubbles: [say("meow")],
      },
      sulk: {
        idea: "Нявчить, задерши голову, але погляд ображений і вуха притиснуті, а в баблі — нявкання з дугами звуку: скаржиться на весь дім.",
        still: { mouth: "meow", bones: { head: -16, tail: -30 } },
        bubbles: [say("meow")],
      },
      ill: {
        idea: "Хворий лежить буханцем і кличе, розтуливши рота, а в баблі — нявкання: голос слабкий, а відповіді немає.",
        still: { mouth: "meow", bones: { neck: -6, head: -12 } },
        bubbles: [say("meow")],
      },
    },
    minus: {
      content: {
        idea: "Сидить, лагідно мружиться й розтуляє рота, а в баблі замість звуку — лише три крапки: нявкає беззвучно, і його розуміють без слів.",
        still: { mouth: "meow", bones: { head: -6 } },
        bubbles: [say("meow-silent")],
      },
      calm: {
        idea: "Сидить і розтуляє рота до камери, а в баблі замість звуку — три крапки: «Німе кіно» просить, не видавши ні звуку.",
        still: { mouth: "meow", bones: { head: -8 } },
        bubbles: [say("meow-silent")],
      },
      sulk: {
        idea: "Сидить насуплений, вуха притиснуті, рот стулений, а в баблі — три крапки: скривджений, але й не пискне.",
        bubbles: [say("meow-silent")],
      },
      ill: {
        idea: "Хворий лежить буханцем і розтуляє рота, а в баблі замість звуку — три крапки: навіть тепер скаржиться беззвучно.",
        still: { mouth: "meow" },
        bubbles: [say("meow-silent")],
      },
    },
  },
  follower: {
    plus: {
      content: {
        idea: "Ви йдете, а він радісно, хвіст трубою, задерши до вас голову, крокує слідом — за самими п'ятами: тінь господаря.",
        still: { base: "walk", at: 100, bones: { head: -10, tail: 30 } },
        person: WALK_AHEAD,
        props: [under(WALK_AHEAD)],
        frame: FULL,
      },
      calm: {
        idea: "Ви йдете, а він спокійно крокує слідом, за п'ятами: з кімнати в кімнату, ні на крок не відстаючи.",
        still: { base: "walk", at: 100, bones: { tail: 10 } },
        person: WALK_AHEAD,
        props: [under(WALK_AHEAD)],
        frame: FULL,
      },
      sulk: {
        idea: "Ви йдете, а він плентається слідом за п'ятами, похнюпившись, насуплений, з парою від носа, хвіст опущений: ходить за вами, хоч на нього рідко озираються.",
        still: { base: "sadWalk", at: 100 },
        person: WALK_AHEAD,
        props: [under(WALK_AHEAD)],
        frame: FULL,
      },
      ill: {
        idea: "Ви йдете, а хворий із градусником у роті понуро бреде слідом за п'ятами: і тепер не відстає ні на крок.",
        still: { base: "sadWalk", at: 100 },
        person: WALK_AHEAD,
        props: [under(WALK_AHEAD)],
        frame: FULL,
      },
    },
    minus: {
      content: {
        idea: "Ви йдете геть і вже далеко, а він лежить буханцем, де лежав, і мружиться: слідом не пішов — знає, що повернетеся.",
        still: { base: "loaf" },
        person: WALK_AWAY,
        props: [under(WALK_AWAY)],
        frame: FULL,
      },
      calm: {
        idea: "Ви йдете геть і вже далеко, а він спокійно сидить, де сидів: слідом не пішов — де лишили, там і шукайте.",
        person: WALK_AWAY,
        props: [under(WALK_AWAY)],
        frame: FULL,
      },
      sulk: {
        idea: "Ви йдете геть і вже далеко, а він сидить насуплений, де сидів, з парою від носа: сумує, що лишили, але слідом не йде.",
        person: WALK_AWAY,
        props: [under(WALK_AWAY)],
        frame: FULL,
      },
      ill: {
        idea: "Ви йдете геть і вже далеко, а хворий лежить буханцем із градусником, де лежав: днями чекає там, де лишили.",
        person: WALK_AWAY,
        props: [under(WALK_AWAY)],
        frame: FULL,
      },
    },
  },
  legs: {
    plus: {
      content: {
        idea: "Треться щокою й боком об вашу ногу, хвіст трубою, очі заплющені: «вісімка» під ногами — з любов'ю.",
        still: { base: "nudge", at: 820 },
        person: LEGS_CLOSE,
      },
      calm: {
        idea: "Треться щокою об вашу гомілку, хвіст угору: щоденна «вісімка» біля ніг.",
        still: { base: "nudge", at: 820 },
        person: LEGS_CLOSE,
      },
      sulk: {
        idea: "Треться об вашу ногу, але похнюпився, вуха притиснуті, хвіст опущений: пхається під ноги, а чує бурчання.",
        still: { base: "nudge", at: 820, bones: { head: 10, tail: -40 } },
        person: LEGS_CLOSE,
      },
      ill: {
        idea: "Хворий лежить, притулившись до ваших ніг: тулиться до них і тепер.",
        person: { pose: "stand", x: 34, y: -14 },
      },
    },
    minus: {
      content: {
        idea: "Ви стоїте, а він сидить на чемній відстані боком до ваших ніг, дивиться у свій бік і задоволено мружиться: поруч, але не під ногами.",
        still: { flip: true },
        person: LEGS_FAR,
        props: [under(LEGS_FAR)],
        frame: FULL,
      },
      calm: {
        idea: "Ви стоїте, а він спокійно сидить поодаль боком до ваших ніг і дивиться у свій бік: особистий простір понад усе.",
        still: { flip: true },
        person: LEGS_FAR,
        props: [under(LEGS_FAR)],
        frame: FULL,
      },
      sulk: {
        idea: "Сидить насуплений на відстані від ваших ніг: чекає збоку, поки підійдуть самі, — та проходять повз.",
        person: LEGS_FAR,
        frame: { w: 170, h: 100 },
      },
      ill: {
        idea: "Хворий лежить на відстані від ваших ніг: і тепер не тулиться.",
        person: LEGS_FAR,
        frame: { w: 170, h: 100 },
      },
    },
  },
  helper: {
    plus: {
      content: { idea: "Розлігся просто на клавіатурі перед увімкненим монітором і мружиться: співавтор вносить правки у звіт.", still: { base: "sprawl" }, props: ON_KEYBOARD },
      calm: { idea: "Лежить буханцем на клавіатурі перед увімкненим монітором: прокинувся саме тоді, коли вам працювати.", still: { base: "loaf" }, props: ON_KEYBOARD },
      sulk: {
        idea: "Лежить буханцем на клавіатурі перед увімкненим монітором, насуплений, вуха притиснуті: займає ваше місце, бо інакше уваги не дочекатися.",
        still: { base: "loaf", bones: { head: 12 } },
        props: ON_KEYBOARD,
      },
      ill: { idea: "Хворий лежить на клавіатурі перед погаслим монітором: гріється там, де давно ніхто не працює.", props: desk(6.4, 50.8, "off") },
    },
    minus: {
      content: {
        idea: "Лежить буханцем на підлозі біля робочого столу й мружиться, а в думці — кіт на клавіатурі, перекреслений: не заважає працювати — найкращий колега.",
        still: { base: "loaf" },
        props: BY_DESK,
        bubbles: [think("cat-laptop", "no")],
      },
      calm: {
        idea: "Лежить біля робочого столу, а не на ньому, а в думці — перекреслений кіт на клавіатурі: клавіатура — ваша, він лише складає компанію.",
        still: { base: "loaf" },
        props: BY_DESK,
        bubbles: [think("cat-laptop", "no")],
      },
      sulk: {
        idea: "Сидить насуплений на підлозі біля столу з увімкненим монітором: нудно, а на стіл однаково не лізе — чекає, поки відірветеся від екрана.",
        props: BY_DESK,
      },
      ill: {
        idea: "Хворий лежить на підлозі біля столу з увімкненим монітором: тихо складає компанію, поки ви працюєте.",
        props: BY_DESK,
      },
    },
  },
  lap: {
    plus: {
      content: {
        idea: "Лежить буханцем у вас на колінах і блаженно мружиться: де коліна — там і він.",
        still: { base: "loaf", shadow: false },
        person: LAP,
      },
      calm: {
        idea: "Спокійно вмостився буханцем у вас на колінах: щойно сіли — він уже тут.",
        still: { base: "loaf", shadow: false },
        person: LAP,
      },
      sulk: {
        idea: "Сидить у вас на колінах, але насуплений, вуха притиснуті: на коліна дістався, а гладити його й не думають.",
        still: { shadow: false },
        person: LAP,
      },
      ill: {
        idea: "Хворий із градусником у роті лежить у вас на колінах, а в думці — сердечка: і хворому на руках найкраще.",
        still: { shadow: false },
        person: LAP,
        bubbles: [{ ...think("pleasant"), dx: 16, dy: 4 }],
      },
    },
    minus: {
      content: {
        idea: "Задоволено пірнає з ваших колін на підлогу: тіло похило донизу, задні лапи ще біля колін, передні тягнуться до підлоги — на руках не всидить, воля дорожча.",
        still: { base: "jumpDown", at: 125, bones: LEAP_DOWN, shadow: false },
        person: LAP_LEAP,
        props: [LEAP_SHADOW],
        frame: LEAP_FRAME,
      },
      calm: {
        idea: "Пірнає з ваших колін на підлогу носом донизу, притиснувши вуха, а в баблі вголос — злість: на руках не всидить і хвилини.",
        still: { base: "jumpDown", at: 125, bones: LEAP_DOWN, ears: "flat", shadow: false },
        person: LAP_LEAP,
        props: [LEAP_SHADOW],
        bubbles: [say("angry")],
        frame: LEAP_FRAME,
      },
      sulk: {
        idea: "Вириваючись, пірнає з ваших колін на підлогу носом донизу, очі сердито примружені, вуха притиснуті, з носа — пара, а в баблі вголос — злість: «не чіпай мене».",
        still: { base: "jumpDown", at: 125, bones: LEAP_DOWN, eyes: "squint", ears: "flat", shadow: false },
        person: LAP_LEAP,
        props: [LEAP_SHADOW],
        bubbles: [say("angry")],
        frame: LEAP_FRAME,
      },
      ill: {
        idea: "Хворий лежить у вас на колінах, але вуха притиснуті, шипить, а в баблі вголос — злість: на руках не всидить, хоч сил і мало.",
        still: { ears: "flat", mouth: "hiss", shadow: false },
        person: LAP,
        bubbles: [say("angry")],
      },
    },
  },
  devotion: {
    plus: {
      content: { idea: "Сидить під вхідними дверима обличчям до вас і повільно, щасливо мружиться, а над ним — серце: зустрів і каже по-котячому «люблю».", still: { overlay: "slowBlink" }, props: [...FRONT_DOOR, icon("heart", 34, -84, 0.34)] },
      calm: { idea: "Зустрічає біля вхідних дверей, повільно моргаючи в камеру, а над ним — серце: дочекався.", still: { overlay: "slowBlink" }, props: [...FRONT_DOOR, icon("heart", 34, -84, 0.34)] },
      sulk: {
        idea: "Сидить насуплений під зачиненими вхідними дверима обличчям до вас, а над ним — серце: цілий день чекав, а ви все барилися.",
        props: [...FRONT_DOOR, icon("heart", 34, -80, 0.34)],
      },
      ill: { idea: "Хворий лежить під вхідними дверима, а над ним — серце: вірить, що ось-ось почує ваші кроки.", props: [...FRONT_DOOR, icon("heart", 40, -66, 0.32)] },
    },
    minus: {
      content: {
        idea: "Сидить і щасливо мружиться, а над ним — серце на замку: живе собі радо, але довіряє не одразу.",
        props: lockedHeart(34, -84),
      },
      calm: {
        idea: "Спокійно сидить, а над ним — серце на замку: не поспішає довіряти, довіру треба заслужити.",
        props: lockedHeart(34, -84),
      },
      sulk: {
        idea: "Сидить, сердито примружившись, вуха притиснуті, а над ним — серце на замку: довіряє по крихті, а після кожної прикрості — знову спочатку.",
        still: { eyes: "squint" },
        props: lockedHeart(34, -84),
      },
      ill: {
        idea: "Хворий лежить буханцем, а над ним — серце на замку: нікого не підпускає до серця, навіть тепер.",
        props: lockedHeart(40, -66),
      },
    },
  },
  touchy: {
    plus: {
      content: {
        idea: "Ви стоїте й дивитеся на нього, а він відійшов і сів до вас спиною, задерши носа, з носа — пара, хоч очі й мружаться: ображається величаво — і скоро так само величаво пробачить.",
        still: { flip: true, bones: { head: -14 } },
        person: LEGS_BEHIND,
        props: [under(LEGS_BEHIND), HUFF],
        frame: FULL,
      },
      calm: {
        idea: "Ви стоїте й дивитеся на нього, а він відійшов і сів до вас спиною, задерши носа й пирхаючи парою: дметься через дрібницю й підкреслено вас не помічає.",
        still: { flip: true, bones: { head: -14 } },
        person: LEGS_BEHIND,
        props: [under(LEGS_BEHIND), HUFF],
        frame: FULL,
      },
      sulk: {
        idea: "Ви стоїте й дивитеся на нього, а він сидить до вас спиною, насуплений, задерши носа, вуха назад, з носа — пара, хвіст опущений: образа надовго.",
        still: { flip: true, bones: { head: -14, tail: -40 } },
        person: LEGS_BEHIND,
        props: [under(LEGS_BEHIND)],
        frame: FULL,
      },
      ill: {
        idea: "Ви стоїте й дивитеся на нього, а хворий із градусником у роті лежить, відвернувшись від вас: і хворіє, і дметься мовчки.",
        still: { flip: true },
        person: LEGS_BEHIND,
        props: [under(LEGS_BEHIND)],
        frame: FULL,
      },
    },
    minus: {
      content: {
        idea: "Іде просто до камери, хвіст трубою, мружиться, а над ним — розбите серце з пластирем: хоч би що сталося, уже йде ластитися — прощає ще до перепросин.",
        still: { base: "walk", at: 100 },
        props: healedHeart(34, -84),
      },
      calm: {
        idea: "Іде до камери з хвостом угору, а над ним — розбите серце з пластирем: після будь-якої халепи за хвилину знову по ласку, наче нічого не сталося.",
        still: { base: "walk", at: 100 },
        props: healedHeart(34, -84),
      },
      sulk: {
        idea: "Ще насуплений, з парою від носа, а вже йде під вашу простягнуту долоню, над спиною — розбите серце з пластирем: прикрість загоюється, і він знову дає себе погладити.",
        still: { base: "walk", at: 100 },
        person: OFFERED_HAND,
        props: [under(OFFERED_HAND), ...healedHeart(-20, -74, 0.46)],
        frame: BENT,
      },
      ill: {
        idea: "Хворий із градусником у роті понуро бреде під вашу простягнуту долоню, над спиною — розбите серце з пластирем: без докору знову йде по ласку.",
        still: { base: "sadWalk", at: 100 },
        person: OFFERED_HAND_LOW,
        props: [under(OFFERED_HAND_LOW), ...healedHeart(-20, -64, 0.46)],
        frame: BENT,
      },
    },
  },
  vengeful: {
    plus: {
      content: { idea: "Сидить біля кошика з вашою білизною поруч зі своїм «сюрпризом» і задоволено мружиться: карає рідко й лише за діло.", props: [basket("load-3"), SURPRISE] },
      calm: {
        idea: "Біля кошика з вашою білизною — свіжий «сюрприз», а кіт хитро мружиться: звів рахунки за прикрість.",
        still: { eyes: "squint" },
        props: [basket("load-3"), SURPRISE],
      },
      sulk: { idea: "Сидить насуплений біля кошика з вашою білизною й свого «сюрпризу»: ображений — і вже помстився.", props: [basket("load-4"), SURPRISE] },
      ill: {
        idea: "Хворий лежить біля переповненого кошика з білизною, поруч смердить «сюрприз»: тиха війна, у якій немає переможців.",
        props: [basket("overflow"), SURPRISE, { art: "fx/smell", state: "a", x: 48, y: 6, front: true, scale: 0.5 }],
      },
    },
    minus: {
      content: {
        idea: "Облизується над рибкою-ласощами біля кошика з білизною й мружиться, довкола чисто, а над ним — розбите серце з пластирем: будь-яка образа тане від одного ласого шматочка.",
        still: { mouth: "tongue" },
        props: [basket("load-3"), TREAT, ...healedHeart(18, -88)],
      },
      calm: {
        idea: "Спокійно лежить біля кошика з білизною й облизується на рибку-ласощі, підлога чиста, а над ним — серце з пластирем: прикрість забута за смаколик.",
        still: { base: "loaf", mouth: "tongue" },
        props: [basket("load-3"), TREAT, ...healedHeart(14, -70)],
      },
      sulk: {
        idea: "Сидить біля кошика з білизною ще насуплений, вуха назад, але вже облизується на рибку-ласощі під самим носом, довкола чисто, а над ним — розбите серце з пластирем: смаколик гоїть образу.",
        still: { mouth: "tongue" },
        props: [basket("load-4"), treatAt(30, 12), ...healedHeart(18, -88)],
      },
      ill: {
        idea: "Хворий лежить біля кошика з білизною й облизується на рибку-ласощі під самим носом, довкола чисто, а над ним — серце з пластирем: навіть тепер не мститься, пробачив за шматочок.",
        still: { mouth: "tongue" },
        props: [basket("load-4"), treatAt(28, 8), ...healedHeart(24, -70, 0.46)],
      },
    },
  },
};
