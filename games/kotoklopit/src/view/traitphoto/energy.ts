// Знімки рис розділу «Енергія й сон» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitBubble, TraitCompanion, TraitPerson, TraitPhotoShots, TraitProp, TraitStill } from "./types";

/** Іконка як річ на фото: pivot у центрі, тож на підлозі y — мінус половина висоти. */
const icon = (name: string, x: number, y: number, scale = 0.4): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale });

const MOON = icon("moon", -30, -78);
const ZZ = icon("zz", 30, -66, 0.36);
/** «Щастя+»: щасливий кіт, що спить, — розлігся й мружиться (як «Співавтор» на клавіатурі). */
const BLISS: TraitStill = { base: "sprawl" };
/** Пилосос позаду ліворуч гуркоче (значок гучності хвилями до кота): у звуку є джерело, тож його не приписують котові. */
const NOISE: readonly TraitProp[] = [{ art: "env/vacuum", state: null, x: -44, y: -6, scale: 0.45 }, icon("loud", -66, -34, 0.3)];
/** М'ячик, що котиться попереду, і лінії швидкості за ним. */
const BALL: readonly TraitProp[] = [
  { art: "item/ball", state: null, x: 66, y: 8, scale: 0.8, front: true },
  { art: "fx/speed", state: null, x: 56, y: 2, scale: 0.5, front: true },
];
/** Сліди забігу: лінії швидкості й пил за котом, що мчить праворуч (pivot — біля хвоста); за розміром кота, щоб у кошеняти не лягали на речі позаду. */
const SPEED: TraitProp = { art: "fx/speed", state: null, x: -28, y: -14, scale: 0.8 };
/** Вилизана порожня миска (не синя: синю порожню читали мискою з водою). */
const LICKED_BOWL: TraitProp = { art: "item/bowl/premium", state: "licked", x: 48, y: 12, front: true };

/** Диван: кіт на сидінні (точка `seat` — на 37 над pivot і на 6,5 правіше). */
const SOFA: TraitProp = { art: "env/sofa", state: null, x: -6.5, y: 37 };
/**
 * Ліжко, у якому під ковдрою спите ви: кіт у самих ногах, на ковдрі; на подушці (точка `pillow` — 45 правіше й 66,5 вище pivot) —
 * ваша голова, над нею «z-z».
 */
const BED_AT = { x: 58, y: 12 } as const;
const bed = (x: number = BED_AT.x, y: number = BED_AT.y): readonly TraitProp[] => [{ art: "env/bed", state: "made", x, y }, icon("zz", x + 51, y - 94, 0.28)];
const asleep = (x: number = BED_AT.x, y: number = BED_AT.y): TraitPerson => ({ pose: "bed", x: x + 45, y: y - 66.5 });
/** Рамка, у яку входить і кіт у ногах ліжка, і ваша голова на подушці за дві клітинки від нього. */
const WHOLE_BED = { w: 200, h: 140 } as const;
/**
 * Ліжко під котом, що сидить у вас на обличчі: з-під ковдри видно лише вашу голову на подушці. Кіт — на лобі, трохи вище середини
 * обличчя: просто на ній він закривав голову цілком, і людини в кадрі не лишалося.
 */
const FACE: TraitPerson = { pose: "bed", x: -4, y: 18 };
const BED_UNDER: TraitProp = { art: "env/bed", state: "made", x: FACE.x - 45, y: FACE.y + 66.5 };
/** Думка «нявкати ✗»: кіт вирішив не будити. */
const QUIET: TraitBubble = { kind: "think", icon: "meow", mark: "no" };
/** Чистий лоток позаду: кіт щойно з нього. */
const LITTER: TraitProp = { art: "item/litter/cheap", state: "cheap", x: -58, y: -6, scale: 0.6 };
/** Інший кіт гасає позаду, за ним лінії швидкості: герой поруч із ним — статечний. */
const RACER: readonly TraitCompanion[] = [{ age: "adult", still: { base: "run", at: 112, eyes: "round" }, x: -66, y: -18 }];
const RACER_SPEED: TraitProp = { art: "fx/speed", state: null, x: -96, y: -32, scale: 0.8 };

export const SHOTS: TraitPhotoShots = {
  energy: {
    plus: {
      content: {
        idea: "Кіт летить у стрибку, витягнувши передні лапи до м'ячика, що котиться перед ним, і мружиться від радості: невгамовний стрибун не всидів і на фото.",
        still: { base: "jumpDown", at: 125 },
        props: [{ ...BALL[0]!, x: 52, y: 10 }, SPEED],
      },
      calm: {
        idea: "Кіт із круглими очима летить у стрибку, витягнувши передні лапи до м'ячика, що котиться перед ним: полює на все, що котиться.",
        still: { base: "jumpDown", at: 125, eyes: "round" },
        props: [{ ...BALL[0]!, x: 52, y: 10 }, SPEED],
      },
      sulk: {
        idea: "Насуплений кіт із притиснутими вухами мчить за м'ячиком: ображений, а всидіти однаково не може.",
        still: { base: "run", at: 112 },
        props: [BALL[0]!, SPEED],
      },
      ill: {
        idea: "Хворий кіт припав до підлоги в засідці на м'ячик просто перед лапами, хвіст угору, думка «гратися»: навіть знесилений, рветься гратися.",
        still: { base: "crouch", bones: { tail: 30 } },
        props: [{ ...BALL[0]!, x: 44, y: 10 }],
        bubbles: [{ kind: "think", icon: "toy" }],
      },
    },
    minus: {
      content: {
        idea: "Кіт блаженно розлігся на дивані й мружиться: диванний філософ на своєму троні.",
        still: BLISS,
        props: [SOFA],
      },
      calm: {
        idea: "Кіт дрімає буханцем на дивані, над ним «z-z»: поспішати нікуди, бігати — нема причини.",
        still: { base: "loaf", eyes: "closed" },
        props: [SOFA, { ...ZZ, x: 26, y: -60 }],
      },
      sulk: {
        idea: "Насуплений кіт сидить на дивані й куняє, над ним «z-z»: ображений, а встати однаково ліньки.",
        props: [SOFA, { ...ZZ, x: 26, y: -72 }],
      },
      ill: {
        idea: "Хворий кіт непорушно лежить на дивані й куняє, над ним «z-z»: це вже не спокій, а знесилення.",
        props: [SOFA, { ...ZZ, x: 26, y: -60 }],
      },
    },
  },
  sleep: {
    plus: {
      content: {
        idea: "Кіт солодко спить, розлігшись просто на робот-пилососі, що гуркоче й здіймає пил: такого сну не перерве жоден гуркіт.",
        still: { ...BLISS, shadow: false },
        props: [
          { art: "fx/sweep-dust", state: "b", x: -32, y: 12, scale: 0.8 },
          { art: "item/robot/cheap", state: "cleaning", x: 0, y: 10 },
          ZZ,
          icon("loud", -44, -26, 0.3),
        ],
      },
      calm: {
        idea: "Кіт спить клубком під самим пилососом, що гуркоче поруч: домашній гуркіт пропускає повз вуха.",
        still: { base: "sleep", eyes: "closed" },
        props: [
          { art: "env/vacuum", state: null, x: -40, y: -6, scale: 0.45 },
          { art: "fx/sweep-dust", state: "a", x: -24, y: 4, scale: 0.7 },
          icon("loud", -62, -34, 0.3),
          ZZ,
        ],
      },
      sulk: {
        idea: "Насуплений кіт сидить і засинає просто від нудьги: над головою — «z-z».",
        props: [{ ...ZZ, y: -74 }],
      },
      ill: {
        idea: "Хворий кіт зі сльозою лежить буханцем і засинає, над ним «z-z»: хоч як зле, а сон бере своє.",
        props: [{ ...ZZ, y: -48 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт дрімав буханцем, але пилосос, що гуркоче позаду, його розбудив (думка «сон ✗»), а він і радий: щасливо спить упівока.",
        still: { base: "loaf", ears: "up" },
        props: NOISE,
        bubbles: [{ kind: "think", icon: "zz", mark: "no" }],
      },
      calm: {
        idea: "Кіт підвів голову з буханця — очі круглі, вуха торчма на гуркіт пилососа позаду, думка «сон ✗»: чуйний сон.",
        still: { base: "loaf", eyes: "round", ears: "up" },
        props: NOISE,
        bubbles: [{ kind: "think", icon: "zz", mark: "no" }],
      },
      sulk: {
        idea: "Насуплений кіт сидить біля пилососа, що гуркоче, й думає «сон ✗»: знову розбудили, і він ображений.",
        props: NOISE,
        bubbles: [{ kind: "think", icon: "zz", mark: "no" }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, вуха нашорошені на гуркіт пилососа позаду, думка «сон ✗»: і так зле, а поспати не дають.",
        still: { ears: "up" },
        props: NOISE,
        bubbles: [{ kind: "think", icon: "zz", mark: "no" }],
      },
    },
  },
  nocturnal: {
    plus: {
      content: {
        idea: "Під місяцем кіт задоволено задер голову й співає на всю квартиру: нічний концерт.",
        still: { bones: { head: -20, tail: 30 }, mouth: "meow" },
        props: [MOON],
      },
      calm: {
        idea: "Під місяцем кіт мчить кудись нічною квартирою: ночі — для біганини.",
        still: { base: "run", at: 75 },
        props: [MOON],
      },
      sulk: {
        idea: "Насуплений кіт сидить під місяцем і кличе вголос: уночі кричить під зачиненими дверима, а ніхто не виходить.",
        still: { mouth: "meow" },
        props: [MOON],
        bubbles: [{ kind: "say", icon: "meow" }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем під місяцем і жалібно нявчить: уночі йому не спиться від голоду й болю.",
        still: { mouth: "meow" },
        props: [MOON],
      },
    },
    minus: {
      content: {
        idea: "Уночі кіт солодко спить, розлігшись на ліжку у вас у ногах («z-z» над вашою подушкою): найкраща грілка в ноги.",
        still: { ...BLISS, flip: true, shadow: false },
        props: [...bed(), { ...MOON, y: -70 }],
        person: asleep(),
        frame: WHOLE_BED,
      },
      calm: {
        idea: "Під місяцем кіт дрімає буханцем на ліжку у вас у ногах, «z-z» — над обома: ночами сумлінно спить разом із вами.",
        still: { base: "loaf", eyes: "closed", flip: true, shadow: false },
        props: [...bed(), { ...MOON, x: -46, y: -78 }, { ...ZZ, x: -12, y: -58, scale: 0.28 }],
        person: asleep(),
        frame: WHOLE_BED,
      },
      sulk: {
        idea: "Насуплений кіт лежить буханцем у самих ногах ліжка під місяцем і куняє («z-z» над ним і над вашою подушкою): ображений, а щоночі однаково спить поруч.",
        still: { base: "loaf", flip: true, shadow: false },
        props: [...bed(76, 4), { ...MOON, x: -46, y: -78 }, { ...ZZ, x: -12, y: -58, scale: 0.28 }],
        person: asleep(76, 4),
        frame: WHOLE_BED,
      },
      ill: {
        idea: "Хворий кіт зіщулився буханцем на ліжку під місяцем, у ногах у вас: тулиться до єдиного тепла.",
        still: { flip: true, shadow: false },
        props: [...bed(), { ...MOON, y: -70 }],
        person: asleep(),
        frame: WHOLE_BED,
      },
    },
  },
  morning: {
    plus: {
      content: {
        idea: "Ви ще спите, з-під ковдри видно лише голову, а кіт сидить просто на вашому обличчі, мружиться й гучно нявчить: живий будильник.",
        still: { mouth: "meow", shadow: false },
        props: [BED_UNDER],
        person: FACE,
      },
      calm: {
        idea: "Ви ще спите під ковдрою, а кіт звівся на задні лапи просто на вашому обличчі й вимогливо нявчить: ранок почався, сніданку!",
        still: { base: "beg", at: 1000, mouth: "meow", shadow: false },
        props: [BED_UNDER],
        person: FACE,
      },
      sulk: {
        idea: "Ви ще спите під ковдрою, а насуплений кіт сидить на вашому обличчі й вголос вимагає сніданку, якого довго чекати.",
        still: { mouth: "meow", shadow: false },
        props: [BED_UNDER],
        person: FACE,
      },
      ill: {
        idea: "Ви ще спите під ковдрою, а хворий кіт лежить буханцем на вашому обличчі й кричить, аж поки не сяде голос.",
        still: { mouth: "meow", shadow: false },
        props: [BED_UNDER],
        person: FACE,
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено лежить буханцем біля вилизаної миски, думка «нявкати ✗»: сніданок зачекає, поки ви доспите.",
        still: { base: "loaf", mouth: "closed" },
        props: [LICKED_BOWL],
        bubbles: [QUIET],
      },
      calm: {
        idea: "Кіт тихо лежить буханцем біля вилизаної миски, думка «нявкати ✗»: терпляче чекає, поки ви прокинетеся.",
        still: { base: "loaf", mouth: "closed" },
        props: [LICKED_BOWL],
        bubbles: [QUIET],
      },
      sulk: {
        idea: "Насуплений кіт лежить буханцем біля вилизаної миски, думка «нявкати ✗»: голодний і ображений, а не будить.",
        still: { base: "loaf", mouth: "closed" },
        props: [LICKED_BOWL],
        bubbles: [QUIET],
      },
      ill: {
        idea: "Хворий кіт тихо лежить біля порожньої миски й думає про корм: не наважується розбудити, хоч голодний.",
        props: [LICKED_BOWL],
        bubbles: [{ kind: "think", icon: "kibble" }],
      },
    },
  },
  zoomies: {
    plus: {
      content: {
        idea: "Кіт мчить щодуху й мружиться від захвату, за ним — лінії швидкості й пил, а далеко позаду — скинутий кухоль: ракета, що змітає все на шляху.",
        still: { base: "run", at: 112, bones: { tail: -20 } },
        props: [{ art: "mess/trinket/mug", state: "fallen", x: -62, y: 16, scale: 0.8 }, SPEED],
      },
      calm: {
        idea: "Кіт вилітає з лотка щодуху, розкидавши наповнювач: шалений забіг після туалету.",
        still: { base: "run", at: 112, bones: { tail: -20 } },
        props: [LITTER, { art: "mess/litter", state: null, x: -30, y: 8, scale: 0.6 }],
      },
      sulk: {
        idea: "Насуплений кіт мчить щодуху, за ним лінії швидкості, пил і скалки розбитого кухля: знову мчав, не розбираючи дороги.",
        still: { base: "run", at: 112, bones: { tail: -20 } },
        props: [{ art: "mess/broken", state: null, x: -70, y: 8, scale: 0.7 }, SPEED],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем, за ним — лінії швидкості, пил і скалки розбитого кухля: щойно мчав, не розбираючи дороги, — і геть знесилився.",
        props: [{ art: "mess/broken", state: null, x: -74, y: 8, scale: 0.7 }, { ...SPEED, x: -36, y: -12 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт статечно крокує, хвіст трубою, голова високо, мружиться, а позаду щодуху гасає інший кіт: цей ступає з гідністю, без жодних забігів.",
        still: { base: "walk", at: 0, bones: { head: -10, tail: 30 } },
        props: [RACER_SPEED],
        companions: RACER,
      },
      calm: {
        idea: "Кіт неквапом іде собі, а позаду щодуху гасає інший кіт: шалені забіги — не для нього.",
        still: { base: "walk", at: 170, bones: { head: -6 } },
        props: [RACER_SPEED],
        companions: RACER,
      },
      sulk: {
        idea: "Насуплений кіт повільно й поважно йде, а позаду щодуху гасає інший кіт: метушитися не в його звичках, навіть коли ображений.",
        still: { base: "walk", at: 0 },
        props: [RACER_SPEED],
        companions: RACER,
      },
      ill: {
        idea: "Хворий кіт повільно бреде, а позаду щодуху гасає інший кіт: з останніх сил, але так само поважно.",
        still: { base: "sadWalk", at: 0 },
        props: [RACER_SPEED],
        companions: RACER,
      },
    },
  },
};
