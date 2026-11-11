// Знімки рис розділу «Здоров'я й тіло» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitPhotoShots, TraitProp } from "./types";

/** Іконка як річ на фото: pivot у центрі, тож на підлозі y — мінус половина висоти. */
const icon = (name: string, x: number, y: number, scale = 0.4): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale });

/** Переноска, у якій давно не їздили: павутина на ній. */
const DUSTY_CARRIER: readonly TraitProp[] = [
  { art: "item/carrier/cheap", state: "body", x: 56, y: -6, scale: 0.6 },
  { art: "mess/cobweb", state: "corner", x: 58, y: 56, scale: 0.4 },
];
const TROPHY = icon("cat-show", 44, -14, 0.45);
/** М'яка подушка (іконка «відпочив»): кіт на ній. */
const PILLOW = icon("rested", 0, -6, 0.8);

const PILLS = icon("pills", 40, -4, 0.36);
const THERMOMETER = icon("thermometer", -42, -6, 0.36);
const SNEEZE: TraitProp = { art: "fx/sneeze", state: null, x: 30, y: -32, scale: 0.8 };

const FULL_BOWL: TraitProp = { art: "item/bowl/premium", state: "premium-2", x: 42, y: 10, front: true, scale: 0.7 };
const EMPTY_BOWL: TraitProp = { art: "item/bowl/cheap", state: "empty", x: 42, y: 10, front: true, scale: 0.7 };
const TREATS = icon("treats", -40, -8, 0.36);
/** Дві вилизані миски збоку, позаду кота: їв за двох. */
const TWO_EMPTY_BOWLS: readonly TraitProp[] = [
  { ...EMPTY_BOWL, x: 50, y: -2, front: false },
  { ...EMPTY_BOWL, x: 68, y: 8, front: false },
];

/** Підвіконня з батареєю: кіт на дошці (`seat`). */
const RADIATOR: TraitProp = { art: "env/sill-living", state: null, x: 13, y: 45, scale: 0.55 };
const COLD = icon("chilly", 34, -60, 0.36);
const HOT = icon("hot", 34, -50, 0.4);
const WATER: TraitProp = { art: "item/water/cheap", state: "full", x: -44, y: 8, scale: 0.7 };

export const SHOTS: TraitPhotoShots = {
  // Тиха група: знімок — метафора. «+» — кубок довгожителя-рекордсмена, «−» — тендітний кіт на м'якій подушці.
  longevity: {
    plus: {
      content: {
        idea: "Поважний кіт задоволено мружиться біля свого кубка: рекордсмен, над яким роки не мають влади.",
        props: [TROPHY],
      },
      calm: {
        idea: "Кіт статечно сидить, примруживши очі, як мудрий старійшина, поруч — кубок: з віком набирає хіба що поважності.",
        still: { eyes: "half" },
        props: [TROPHY],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною біля кубка: роками стійко терпить усе, що підкидає доля.",
        props: [TROPHY],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем біля кубка: уперто чіпляється за кожен день, як справжній чемпіон.",
        props: [{ ...TROPHY, x: 46 }],
      },
    },
    minus: {
      content: {
        idea: "Тендітний кіт задоволено лежить буханцем на м'якій подушці: найм'якша подушка в домі — його.",
        still: { base: "loaf" },
        props: [PILLOW],
      },
      calm: {
        idea: "Тендітний кіт обережно сидить на м'якій подушці, підібгавши лапку: його бережуть, як скарб.",
        still: { bones: { "leg-front-near": -25 } },
        props: [PILLOW],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною на м'якій подушці: потребує дбайливих рук частіше, ніж їх отримує.",
        props: [PILLOW],
      },
      ill: {
        idea: "Хворий кіт зіщулився на подушці, поруч пластир: тендітний, наче весь світ зі скла.",
        props: [PILLOW, icon("bandage", 44, -8, 0.32)],
      },
    },
  },
  // Тиха група: «+» — переноска в павутинні (до ветеринара не їздили роками), «−» — ліки, градусник і чхання.
  hardiness: {
    plus: {
      content: {
        idea: "Пашить здоров'ям кіт задоволено мружиться біля переноски, обплетеної павутиною: ветеринара знає хіба що в обличчя.",
        props: DUSTY_CARRIER,
      },
      calm: {
        idea: "Кіт спокійно сидить біля переноски в павутинні: до ветеринара не їздили так давно, що павук устиг обжитися.",
        props: DUSTY_CARRIER,
      },
      sulk: {
        idea: "Ображений кіт сидить спиною біля запилюженої переноски: ніколи не хворіє, тож про нього й не дуже хвилюються.",
        props: DUSTY_CARRIER,
      },
      ill: {
        idea: "Нещасний кіт із хворими очима все ж сидить рівно біля переноски в павутинні: тримається на лапах там, де інший зліг би.",
        still: { base: "sit" },
        props: DUSTY_CARRIER,
      },
    },
    minus: {
      content: {
        idea: "Кіт мружиться й чхає, а поруч ліки й градусник: часто нездужає, зате кожна застуда — привід для турботи.",
        props: [PILLS, THERMOMETER, SNEEZE],
      },
      calm: {
        idea: "Кіт спокійно сидить і чхає між ліками й градусником: протоптав до ветеринара стежку ширшу, ніж до миски.",
        props: [PILLS, THERMOMETER, SNEEZE],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною біля ліків і градусника: перехворів на все, що кружляло в повітрі.",
        props: [PILLS, THERMOMETER],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем серед ліків і градусника: раз у раз нездужає й довго одужує.",
        props: [PILLS, THERMOMETER],
      },
    },
  },
  // Повноту на фото не показати (обхват — за вагою кота), тож «+» — повна миска й ласощі, «−» — вилизана миска й гнучкий кіт.
  chubby: {
    plus: {
      content: {
        idea: "Круглий, як колобок, кіт задоволено лежить буханцем між повною мискою й ласощами: гордо носить пишні боки.",
        still: { base: "loaf" },
        props: [FULL_BOWL, TREATS],
      },
      calm: {
        idea: "Кіт з апетитом наминає з повної миски, поруч — ласощі: їсть усе, що дають.",
        still: { base: "eat", at: 300, eyes: "closed" },
        props: [{ ...FULL_BOWL, x: 34, y: 2, front: false }, TREATS],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною між мискою й ласощами: заїдає самотність.",
        props: [FULL_BOWL, TREATS],
      },
      ill: {
        idea: "Хворий кіт важко лежить буханцем біля повної миски й ласощів: повнішає від нудьги й дедалі рідше рушає з місця.",
        props: [FULL_BOWL, TREATS],
      },
    },
    minus: {
      content: {
        idea: "Стрункий кіт радісно потягується біля двох вилизаних мисок: їсть за двох і не змінюється в боках.",
        still: { base: "stretch", at: 600 },
        props: TWO_EMPTY_BOWLS,
      },
      calm: {
        idea: "Легкий, як пір'їнка, кіт стрибає вгору від вилизаних мисок: з'їв усе — і жодного зайвого грама.",
        still: { base: "jumpUp", at: 190 },
        props: TWO_EMPTY_BOWLS,
      },
      sulk: {
        idea: "Ображений худорлявий кіт сидить спиною біля вилизаних мисок: ласощі не додають йому ні грама, ні радості.",
        props: TWO_EMPTY_BOWLS,
      },
      ill: {
        idea: "Хворий кіт, невагомий, мов тінь, лежить біля вилизаних мисок: хоч скільки їсть, а все такий самий.",
        props: TWO_EMPTY_BOWLS,
      },
    },
  },
  warmth: {
    plus: {
      content: {
        idea: "Кіт солодко спить клубком на підвіконні просто над батареєю: живе на батареї.",
        still: { base: "sleep", eyes: "closed" },
        props: [RADIATOR],
      },
      calm: {
        idea: "Кіт спокійно лежить буханцем на теплому підвіконні над батареєю.",
        still: { base: "loaf", eyes: "half" },
        props: [RADIATOR],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною на підвіконні над батареєю: хоч тепло зігріє.",
        props: [RADIATOR],
      },
      ill: {
        idea: "Хворий кіт зіщулився біля холодної батареї, поруч сніжинка: мерзне й шукає тепла, якого бракує.",
        props: [{ ...RADIATOR, x: -48, y: -6 }, { ...COLD, y: -46 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт по-панськи розпластався на прохолодній підлозі й мружиться, поруч сніжинка: полярник, якому холод — у радість.",
        still: { base: "sprawl" },
        props: [{ ...COLD, y: -40 }],
      },
      calm: {
        idea: "Кіт спокійно лежить, розпластавшись на прохолодній підлозі біля миски з водою: прохолода милша за м'яке крісло.",
        still: { base: "sprawl" },
        props: [WATER],
      },
      sulk: {
        idea: "Ображений кіт сидить спиною під пекучим сонцем із краплею поту: спека — не для нього.",
        props: [HOT],
      },
      ill: {
        idea: "Хворий кіт знесилено розпластався на підлозі під пекучим сонцем: знемагає в спеку.",
        still: { base: "sprawl" },
        props: [{ ...HOT, y: -40 }, { ...WATER, state: "empty" }],
      },
    },
  },
};
