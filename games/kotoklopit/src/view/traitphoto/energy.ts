// Знімки рис розділу «Енергія й сон» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitBubble, TraitCompanion, TraitPhotoShots, TraitProp } from "./types";

/** Іконка як річ на фото: pivot у центрі, тож на підлозі y — мінус половина висоти. */
const icon = (name: string, x: number, y: number, scale = 0.4): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale });

const MOON = icon("moon", -30, -78);
const ZZ = icon("zz", 30, -66, 0.36);
const ALARM = icon("alarm", 44, -12, 0.42);
/** Пилосос позаду ліворуч гуркоче (значок гучності хвилями до кота): у звуку є джерело, тож його не приписують котові. */
const NOISE: readonly TraitProp[] = [{ art: "env/vacuum", state: null, x: -44, y: -6, scale: 0.45 }, icon("loud", -66, -34, 0.3)];
/** М'ячик, що котиться попереду, і лінії швидкості за ним. */
const BALL: readonly TraitProp[] = [
  { art: "item/ball", state: null, x: 66, y: 8, scale: 0.8, front: true },
  { art: "fx/speed", state: null, x: 56, y: 2, scale: 0.5, front: true },
];
/** Сліди забігу: лінії швидкості й пил за котом, що мчить праворуч (pivot — біля хвоста); за розміром кота, щоб у кошеняти не лягали на речі позаду. */
const SPEED: TraitProp = { art: "fx/speed", state: null, x: -28, y: -14, scale: 0.8, withCat: true };
/** Вилизана порожня миска (не синя: синю порожню читали мискою з водою). */
const LICKED_BOWL: TraitProp = { art: "item/bowl/premium", state: "licked", x: 40, y: 10, front: true, scale: 0.7 };

/** Диван: кіт на сидінні (`seat`). Меблі менші за справжні, бо широка річ на фото зменшує кота. */
const SOFA: TraitProp = { art: "env/sofa", state: null, x: -2, y: 11, scale: 0.3 };
/** Ліжко, у якому під ковдрою спите ви (горбик): кіт у самих ногах, на ковдрі; «z-z» над подушкою — ви спите. */
const BED: readonly TraitProp[] = [{ art: "env/bed", state: "hump", x: 29, y: 6, scale: 0.5 }, icon("zz", 58, -54, 0.28)];
/** Ліжко збоку, у ньому під ковдрою спите ви: кіт на підлозі біля нього. */
const BED_BESIDE: TraitProp = { art: "env/bed", state: "hump", x: -46, y: -18, scale: 0.34 };
/** «Z-z» над подушкою ліжка поруч: ви ще спите. */
const ZZ_BESIDE = icon("zz", -40, -62, 0.3);
/** Думка «нявкати ✗»: кіт вирішив не будити. */
const QUIET: TraitBubble = { kind: "think", icon: "meow", mark: "no" };
/** Чистий лоток позаду: кіт щойно з нього. */
const LITTER: TraitProp = { art: "item/litter/cheap", state: "cheap", x: -58, y: -6, scale: 0.6 };
/** Неторканий м'ячик на підлозі перед диваном: гратися ліньки. */
const IDLE_BALL: TraitProp = { ...BALL[0]!, x: 30, y: 36 };
/** Інший кіт гасає позаду, за ним лінії швидкості: герой поруч із ним — статечний. */
const RACER: readonly TraitCompanion[] = [{ age: "adult", still: { base: "run", at: 112, eyes: "round" }, x: -66, y: -18 }];
const RACER_SPEED: TraitProp = { art: "fx/speed", state: null, x: -96, y: -32, scale: 0.8 };

export const SHOTS: TraitPhotoShots = {
  energy: {
    plus: {
      content: {
        idea: "Кіт злітає в стрибку, витягнувши передні лапи вперед, і мружиться від радості: невгамовний стрибун не всидів і на фото.",
        still: { base: "jumpUp", at: 90 },
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
        idea: "Хворий кіт із градусником припав до підлоги в засідці на м'ячик просто перед лапами, хвіст угору, думка «гратися»: навіть знесилений, рветься гратися.",
        still: { base: "crouch", bones: { tail: 30 } },
        props: [{ ...BALL[0]!, x: 44, y: 10 }],
        bubbles: [{ kind: "think", icon: "toy" }],
      },
    },
    minus: {
      content: {
        idea: "Кіт блаженно лежить буханцем на дивані й мружиться, м'ячик на підлозі лежить неторканий: диванний філософ на своєму троні.",
        still: { base: "loaf" },
        props: [SOFA, IDLE_BALL],
      },
      calm: {
        idea: "Кіт дрімає буханцем на дивані, над ним «z-z», м'ячик на підлозі лежить неторканий: поспішати нікуди, бігати — нема причини.",
        still: { base: "loaf", eyes: "closed" },
        props: [SOFA, { ...ZZ, x: 26, y: -60 }, IDLE_BALL],
      },
      sulk: {
        idea: "Насуплений кіт сидить на дивані й куняє, над ним «z-z», м'ячик на підлозі лежить неторканий: ображений, а встати однаково ліньки.",
        props: [SOFA, { ...ZZ, x: 26, y: -72 }, IDLE_BALL],
      },
      ill: {
        idea: "Хворий кіт непорушно лежить на дивані й куняє, над ним «z-z», м'ячик на підлозі лежить неторканий: це вже не спокій, а знесилення.",
        props: [SOFA, { ...ZZ, x: 26, y: -60 }, IDLE_BALL],
      },
    },
  },
  sleep: {
    plus: {
      content: {
        idea: "Кіт солодко спить клубком просто на робот-пилососі, що гуркоче й здіймає пил: такого сну не перерве жоден гуркіт.",
        still: { base: "sleep", eyes: "closed", shadow: false },
        props: [
          { art: "fx/sweep-dust", state: "b", x: -32, y: 12, scale: 0.8 },
          { art: "item/robot/cheap", state: "cleaning", x: 0, y: 10, withCat: true },
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
        idea: "Уночі кіт солодко спить клубком на ліжку в ногах того, хто спить під ковдрою («z-z» над подушкою): найкраща грілка в ноги.",
        still: { base: "sleep", eyes: "closed", flip: true, shadow: false },
        props: [...BED, { ...MOON, y: -70 }],
      },
      calm: {
        idea: "Під місяцем кіт дрімає буханцем на ліжку в ногах того, хто спить під ковдрою, «z-z» — над обома: ночами сумлінно спить разом із вами.",
        still: { base: "loaf", eyes: "closed", flip: true, shadow: false },
        props: [...BED, { ...MOON, x: -46, y: -78 }, { ...ZZ, x: -12, y: -58, scale: 0.28 }],
      },
      sulk: {
        idea: "Насуплений кіт лежить буханцем у самих ногах ліжка під місяцем і куняє («z-z» над ним і над подушкою), поруч горбик того, хто спить під ковдрою: ображений, а щоночі однаково приходить грітися.",
        still: { base: "loaf", flip: true, shadow: false },
        props: [{ ...BED[0]!, x: 38, y: 2 }, { ...BED[1]!, x: 67, y: -58 }, { ...MOON, x: -46, y: -78 }, { ...ZZ, x: -12, y: -58, scale: 0.28 }],
      },
      ill: {
        idea: "Хворий кіт зіщулився буханцем на ліжку під місяцем, у ногах того, хто спить під ковдрою: тулиться до єдиного тепла.",
        still: { flip: true, shadow: false },
        props: [...BED, { ...MOON, y: -70 }],
      },
    },
  },
  morning: {
    plus: {
      content: {
        idea: "Поруч будильник, а кіт мружиться й гучно нявчить: живий будильник, що будить з поваги до традицій.",
        still: { mouth: "meow" },
        props: [ALARM],
      },
      calm: {
        idea: "Кіт звівся на задні лапи й вимогливо нявчить біля будильника: ранок почався, сніданку!",
        still: { base: "beg", at: 1000, mouth: "meow" },
        props: [ALARM],
      },
      sulk: {
        idea: "Насуплений кіт біля будильника вголос вимагає корму: щоранку будить заради сніданку, якого довго чекати.",
        still: { mouth: "meow" },
        props: [{ ...ALARM, x: -40 }],
        bubbles: [{ kind: "say", icon: "kibble" }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем біля будильника й кричить уголос: щоранку будить, аж поки не сяде голос.",
        still: { mouth: "meow" },
        props: [{ ...ALARM, x: -42 }],
        bubbles: [{ kind: "say", icon: "meow" }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено лежить буханцем біля ліжка, де ви ще спите під ковдрою, і вилизаної миски, думка «нявкати ✗»: дає доспати.",
        still: { base: "loaf", mouth: "closed" },
        props: [BED_BESIDE, ZZ_BESIDE, LICKED_BOWL],
        bubbles: [QUIET],
      },
      calm: {
        idea: "Кіт тихо лежить буханцем біля ліжка, де ви ще спите, і вилизаної миски, думка «нявкати ✗»: терпляче чекає, поки ви прокинетеся.",
        still: { base: "loaf", mouth: "closed" },
        props: [BED_BESIDE, ZZ_BESIDE, LICKED_BOWL],
        bubbles: [QUIET],
      },
      sulk: {
        idea: "Насуплений кіт лежить буханцем біля ліжка, де ви спите, і вилизаної миски, думка «нявкати ✗»: голодний і ображений, а не будить.",
        still: { base: "loaf", mouth: "closed" },
        props: [BED_BESIDE, ZZ_BESIDE, LICKED_BOWL],
        bubbles: [QUIET],
      },
      ill: {
        idea: "Хворий кіт тихо лежить біля ліжка, де ви спите, і порожньої миски й думає про корм: не наважується розбудити, хоч голодний.",
        props: [BED_BESIDE, ZZ_BESIDE, LICKED_BOWL],
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
        idea: "Хворий кіт із градусником лежить буханцем, за ним — лінії швидкості, пил і скалки розбитого кухля: щойно мчав, не розбираючи дороги, — і геть знесилився.",
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
        idea: "Хворий кіт із градусником повільно бреде, а позаду щодуху гасає інший кіт: з останніх сил, але так само поважно.",
        still: { base: "sadWalk", at: 0 },
        props: [RACER_SPEED],
        companions: RACER,
      },
    },
  },
};
