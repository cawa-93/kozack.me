// Знімки рис розділу «Енергія й сон» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitPhotoShots, TraitProp } from "./types";

/** Іконка як річ на фото: pivot у центрі, тож на підлозі y — мінус половина висоти. */
const icon = (name: string, x: number, y: number, scale = 0.4): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale });

const MOON = icon("moon", -30, -78);
const ZZ = icon("zz", 30, -66, 0.36);
const ALARM = icon("alarm", 44, -12, 0.42);
const LOUD = icon("loud", 54, -50, 0.34);
/** Ручка, що скотилася зі столу, — перед мордою кота в засідці. */
const PEN: TraitProp = { art: "mess/trinket/pen", state: "fallen", x: 76, y: 6 };
const EMPTY_BOWL: TraitProp = { art: "item/bowl/cheap", state: "empty", x: 40, y: 10, front: true, scale: 0.7 };

/** Диван: кіт на сидінні (`seat`). Меблі менші за справжні, бо широка річ на фото зменшує кота. */
const SOFA: TraitProp = { art: "env/sofa", state: null, x: -2, y: 11, scale: 0.3 };
/** Ліжко: кіт на ковдрі (`blanket`). */
const BED: TraitProp = { art: "env/bed", state: "made", x: 5, y: 14, scale: 0.42 };
/** Ліжко збоку: кіт на підлозі біля нього. */
const BED_BESIDE: TraitProp = { art: "env/bed", state: "made", x: -46, y: -18, scale: 0.34 };

export const SHOTS: TraitPhotoShots = {
  energy: {
    plus: {
      content: {
        idea: "Кіт у високому стрибку, усі лапи в повітрі, мружиться від радості: невгамовний стрибун не всидів і на фото.",
        still: { base: "pounce", at: 600 },
      },
      calm: {
        idea: "Кіт у засідці, задок угору, пильно цілиться в ручку, що скотилася на підлогу: полює на все, що котиться.",
        still: { base: "crouch" },
        props: [PEN],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною серед скинутих зі столу ручки й телефона: розважав себе сам, бо з ним ніхто не грався.",
        props: [
          { art: "mess/trinket/pen", state: "fallen", x: -40, y: 8 },
          { art: "mess/trinket/phone", state: "fallen", x: 38, y: 10, front: true },
        ],
      },
      ill: {
        idea: "Хворий кіт із сумними очима все ж припав до підлоги в засідці на ручку, що скотилася: навіть знесилений, рветься гратися.",
        still: { base: "crouch" },
        props: [PEN],
      },
    },
    minus: {
      content: {
        idea: "Кіт блаженно лежить буханцем на дивані й мружиться: диванний філософ на своєму троні.",
        still: { base: "loaf" },
        props: [SOFA],
      },
      calm: {
        idea: "Кіт напівдрімає буханцем на дивані: поспішати нікуди, бігати — нема причини.",
        still: { base: "loaf", eyes: "half" },
        props: [SOFA],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною на дивані й не рухається з місця: жодна іграшка не варта того, щоб устати.",
        props: [SOFA],
      },
      ill: {
        idea: "Хворий кіт непорушно лежить на дивані, голова похилена: це вже не спокій, а знесилення.",
        props: [SOFA],
      },
    },
  },
  sleep: {
    plus: {
      content: {
        idea: "Кіт солодко спить клубком просто на робот-пилососі, що прибирає: такого сну не перерве жоден гуркіт.",
        still: { base: "sleep", eyes: "closed" },
        props: [{ art: "item/robot/cheap", state: "cleaning", x: 0, y: 10 }, ZZ],
      },
      calm: {
        idea: "Кіт спить клубком під самим пилососом, що стоїть поруч: домашній гуркіт пропускає повз вуха.",
        still: { base: "sleep", eyes: "closed" },
        props: [{ art: "env/vacuum", state: null, x: -40, y: -6, scale: 0.45 }, ZZ],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною й засинає від нудьги: над головою — «z-z».",
        props: [ZZ],
      },
      ill: {
        idea: "Хворий кіт спить буханцем біля порожньої миски: прокинувся заради неї й одразу заснув знову.",
        still: { eyes: "closed" },
        props: [{ ...EMPTY_BOWL, x: 50 }, { ...ZZ, y: -48 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено дрімає буханцем, але вуха нашорошені на гучний звук: щасливо спить упівока, щоб нічого не пропустити.",
        still: { base: "loaf", ears: "up" },
        props: [LOUD],
      },
      calm: {
        idea: "Кіт підхопився з дрімоти буханцем — очі круглі, вуха торчма на гучний звук: чуйний сон.",
        still: { base: "loaf", eyes: "round", ears: "up" },
        props: [LOUD],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною, але вуха насторожено ловлять кожен звук: чуйний і невиспаний.",
        still: { ears: "up" },
        props: [LOUD],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем і здригається від гучного звуку: вуха нашорошені, сну нема.",
        still: { ears: "up" },
        props: [{ ...LOUD, x: 62, y: -34 }],
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
        idea: "Ображений кіт сидить спиною під місяцем: уночі кличе під зачиненими дверима, а ніхто не виходить.",
        props: [MOON],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем під місяцем і жалібно нявчить: уночі йому не спиться від голоду й болю.",
        still: { mouth: "meow" },
        props: [MOON],
      },
    },
    minus: {
      content: {
        idea: "Уночі кіт солодко спить клубком на вашому ліжку: найкраща грілка в ноги.",
        still: { base: "sleep", eyes: "closed" },
        props: [BED, { ...MOON, y: -70 }],
      },
      calm: {
        idea: "Кіт спокійно лежить буханцем на ліжку й дрімає під місяцем: ночами сумлінно спить у вас у ногах.",
        still: { base: "loaf", eyes: "half" },
        props: [BED, { ...MOON, y: -70 }],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною на ліжку під місяцем: попри все щоночі приходить грітися вам у ноги.",
        props: [BED, { ...MOON, y: -70 }],
      },
      ill: {
        idea: "Хворий кіт зіщулився буханцем на ліжку під місяцем: уночі тулиться до ваших ніг — єдиного тепла, яке йому лишилося.",
        props: [BED, { ...MOON, y: -70 }],
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
        idea: "Ображений кіт сидить спиною між будильником і порожньою мискою: щоранку гучно нагадує про сніданок, якого довго чекати.",
        props: [{ ...ALARM, x: -40 }, EMPTY_BOWL],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем біля порожньої миски й будильника і кричить: щоранку кличе до миски, аж поки не сяде голос.",
        still: { mouth: "meow" },
        props: [{ ...ALARM, x: -42 }, EMPTY_BOWL],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено сидить біля ліжка, поки ви спите, а сніданок уже чекає в мисці: дає доспати.",
        props: [BED_BESIDE, { ...EMPTY_BOWL, state: "cheap-2" }],
      },
      calm: {
        idea: "Кіт чемно сидить біля ліжка з порожньою мискою й мовчить: терпляче чекає, поки ви розплющите очі.",
        props: [BED_BESIDE, EMPTY_BOWL],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною біля ліжка й порожньої миски: годинами чекає, поки ви виспитеся й згадаєте про сніданок.",
        props: [BED_BESIDE, EMPTY_BOWL],
      },
      ill: {
        idea: "Хворий кіт тихо лежить біля ліжка й порожньої миски: не наважується розбудити, хоч голодний.",
        props: [BED_BESIDE, EMPTY_BOWL],
      },
    },
  },
  zoomies: {
    plus: {
      content: {
        idea: "Кіт мчить щодуху й мружиться від захвату, позаду — скинутий кухоль: ракета, що змітає все на шляху.",
        still: { base: "run", at: 112, bones: { tail: -20 } },
        props: [{ art: "mess/trinket/mug", state: "fallen", x: -50, y: 4, scale: 0.8 }],
      },
      calm: {
        idea: "Кіт вилітає з лотка щодуху, розкидавши наповнювач: шалений забіг після туалету.",
        still: { base: "run", at: 112, bones: { tail: -20 } },
        props: [
          { art: "item/litter/cheap", state: "cheap", x: -58, y: -6, scale: 0.6 },
          { art: "mess/litter", state: null, x: -30, y: 8, scale: 0.6 },
        ],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною біля скалок розбитого кухля: знову мчав, не розбираючи дороги.",
        props: [{ art: "mess/broken", state: null, x: 40, y: 10, front: true, scale: 0.8 }],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем і важко дихає біля скинутого кухля: знову кидався в сліпий біг.",
        props: [
          { art: "mess/trinket/mug", state: "fallen", x: -46, y: 4, scale: 0.8 },
          { art: "fx/pant", state: "a", x: 34, y: -16 },
        ],
      },
    },
    minus: {
      content: {
        idea: "Кіт статечно крокує, хвіст трубою, голова високо, мружиться: ступає з гідністю, без жодних забігів.",
        still: { base: "walk", at: 0, bones: { head: -10, tail: 30 } },
      },
      calm: {
        idea: "Кіт неквапом ступає, примруживши очі: шалені забіги — справа молодих і легковажних.",
        still: { base: "walk", at: 170, eyes: "half", bones: { head: -6 } },
      },
      sulk: {
        idea: "Ображений кіт повільно й поважно йде геть, спиною до нас: метушитися не в його звичках.",
        still: { base: "walk", at: 0, view: "back" },
      },
      ill: {
        idea: "Хворий кіт повільно бреде до порожньої миски: з останніх сил, але так само поважно.",
        still: { base: "sadWalk", at: 0 },
        props: [{ ...EMPTY_BOWL, x: 50, y: 8, front: false }],
      },
    },
  },
};
