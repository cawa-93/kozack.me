// Знімки рис розділу «Сміливість і стрес» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitPhotoShots, TraitProp } from "./types";

/** Робот під котом: верх кришки (`top`) — на висоті кореня кота, тож кіт сидить на ньому. */
const ROBOT: TraitProp = { art: "item/robot/cheap", state: "cleaning", x: 0, y: 10, scale: 1.2 };
const VACUUM = (x: number, y: number, scale = 0.7): TraitProp => ({ art: "env/vacuum", state: null, x, y, scale });
const RIDE: TraitProp[] = [VACUUM(-58, -16, 0.6), ROBOT];
/**
 * Кіт у великій коробці, як у квартирі (`bigboxlook.ts`): коробка — під котом на висоті, де він сидить у ній (`perch` 48 × масштаб),
 * передні стінки — поверх нього; пилосос — по той бік.
 */
const BOX_SCALE = 0.6;
/** `lift` — на скільки кіт вищий за дно (коробка нижча на фото): буханець і спину без нього майже не видно з-за борту. */
const box = (lift = 0): TraitProp[] => [
  VACUUM(-84, -12 + lift, 0.55),
  { art: "env/boxes", state: "pile-1", x: 0, y: 48 * BOX_SCALE + lift, scale: BOX_SCALE },
  { art: "env/boxes/front", state: "pile-1", x: 0, y: 48 * BOX_SCALE + lift, scale: BOX_SCALE, front: true },
];
const BOX = box();
/** Гучномовець ліворуч, хвилі звуку — просто на кота. */
const LOUD: TraitProp = { art: "icon/loud", state: null, x: -58, y: -16, scale: 0.55 };
const DOZE: TraitProp = { art: "icon/zz", state: null, x: 32, y: -68, scale: 0.32 };
const FUR: TraitProp[] = [
  { art: "mess/fur", state: null, x: 40, y: 12, front: true, scale: 0.8 },
  { art: "mess/fur-tuft", state: null, x: -58, y: 4, front: true, flip: true },
];
/** Переноска позаду ліворуч, кіт лежить у відчинених дверцятах: передні стінки (`grate`) ховають його зад. */
const carrierIn = (x: number, y = -6, scale = 0.8): TraitProp[] => [
  { art: "item/carrier/premium", state: "body", x, y, scale },
  { art: "item/carrier/premium", state: "grate", x, y, scale, front: true },
];
/** Ціла відчинена переноска праворуч, навпроти кота. */
const CARRIER_FOE: TraitProp = { art: "item/carrier/premium", state: "body", x: 74, y: -12, scale: 0.75 };
/** Уламки тієї самої вишневої переноски: дверцята з ґратками й ручку видно. */
const WRECK: TraitProp = { art: "mess/carrier/premium", state: null, x: 54, y: 8 };
/** Стетоскоп і градусник — огляд, а не ліки (ліки — хвороба, а не вдача). */
const EXAM: TraitProp[] = [
  { art: "icon/doctor-office", state: null, x: 62, y: -6, scale: 0.45 },
  { art: "icon/thermometer", state: null, x: 42, y: 12, rot: 70, scale: 0.42, front: true },
];
/** Слід кігтів поверх стетоскопа: ветеринарові дісталося. */
const CLAWS: TraitProp = { art: "icon/claws", state: null, x: 84, y: -30, scale: 0.4, front: true };
const BELL = (x: number, y: number): TraitProp => ({ art: "icon/bell", state: null, x, y, scale: 0.42 });
const DOOR: TraitProp[] = [{ art: "env/door", state: "closed", x: -36, y: -24, scale: 0.42 }, BELL(-50, -96)];
/** Двері з дзвінком далеко ліворуч, ближче — будиночок поверх кота: кіт за ним ховається від дверей. */
const HIDE: TraitProp[] = [
  { art: "env/door", state: "closed", x: -112, y: -36, scale: 0.4 },
  BELL(-126, -106),
  { art: "item/house/cheap", state: null, x: -50, y: 14, scale: 0.5, front: true },
];
const TABLE: TraitProp[] = [
  { art: "env/table", state: null, x: 60, y: -10, scale: 0.55 },
  { art: "item/dish/meal", state: "premium", x: 56, y: -40, scale: 0.8 },
];
/** Зірочка над головою — «молодець». */
const STAR = (x: number, y: number): TraitProp => ({ art: "icon/promotion", state: null, x, y, scale: 0.34 });
const STOVE: TraitProp = { art: "env/stove", state: "off", x: 0, y: 34, scale: 0.55 };

export const SHOTS: TraitPhotoShots = {
  bravery: {
    plus: {
      content: {
        idea: "Мружиться від задоволення верхи на роботі-пилососі, а поруч стоїть і великий пилосос: машини, від яких інші коти тікають, для нього — карета.",
        props: RIDE,
      },
      calm: {
        idea: "Спокійно сидить упритул до пилососа й дивиться на нього — прийшов подивитися, що це там гуде, а не втік.",
        still: { bones: { head: -14 } },
        props: [VACUUM(46, -6)],
      },
      sulk: { idea: "Ображено сидить спиною, але верхи на роботі-пилососі, поруч із великим пилососом: гуркіт його не лякає, хоч радості в житті й мало.", props: RIDE },
      ill: { idea: "Хворий лежить буханцем просто на роботі-пилососі, поруч гуде великий пилосос: болить, але не страшно.", props: RIDE },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, сховавшись у коробку, а поруч стоїть пилосос: схованка — найзатишніше місце в домі.",
        props: BOX,
      },
      calm: {
        idea: "Визирає з коробки, притиснувши вуха, а поруч стоїть пилосос: не вилізе, поки той не стихне.",
        still: { ears: "flat" },
        props: BOX,
      },
      sulk: { idea: "Ображено сидить спиною в коробці, притиснувши вуха, — сховався від пилососа, що стоїть поруч.", still: { ears: "flat" }, props: box(8) },
      ill: {
        idea: "Хворий, з притиснутими вухами, забився в коробку подалі від пилососа.",
        still: { ears: "flat" },
        props: box(16),
      },
    },
  },
  stress: {
    plus: {
      content: {
        idea: "Блаженно розлігся животом догори просто під гучномовцем, що гримить: гармидер довкола його не обходить.",
        still: { base: "belly", eyes: "arc", ears: "up" },
        props: [LOUD],
      },
      calm: {
        idea: "Дрімає буханцем, напівзаплющивши очі, а гучномовець гримить просто на нього — навіть вухом не веде.",
        still: { base: "loaf", eyes: "half" },
        props: [LOUD, DOZE],
      },
      sulk: { idea: "Ображено сидить спиною під гуркіт гучномовця: негаразди його не ламають, хоч і не тішать.", props: [LOUD] },
      ill: { idea: "Хворий тихо лежить буханцем під гуркіт гучномовця — перечікує біду, як негоду.", props: [LOUD] },
    },
    minus: {
      content: {
        idea: "Мружиться, нервово вилизуючи лапу, з вухами «літачком», а довкола — вилизані жмути шерсті: хвилюється через усе, хоч і щасливий.",
        still: { base: "groom", at: 600, ears: "back" },
        props: FUR,
      },
      calm: {
        idea: "Прищуливши вуха, зосереджено вилизує лапу серед жмутів власної шерсті — так заспокоюється після кожної дрібниці.",
        still: { base: "groom", at: 600, eyes: "half", ears: "back" },
        props: FUR,
      },
      sulk: { idea: "Сидить спиною, притиснувши вуха, серед вилизаних з нервів жмутів шерсті.", still: { ears: "flat" }, props: FUR },
      ill: { idea: "Хворий буханцем, вуха притиснуті, довкола — жмути шерсті, вилизаної з нервів.", still: { ears: "flat" }, props: FUR },
    },
  },
  carrier: {
    plus: {
      content: {
        idea: "Блаженно мружиться, вмостившись буханцем у дверцятах переноски, як у власному будиночку.",
        still: { base: "loaf", eyes: "arc" },
        props: carrierIn(-20),
      },
      calm: { idea: "Спокійно лежить буханцем у дверцятах переноски — це його місце.", still: { base: "loaf" }, props: carrierIn(-26) },
      sulk: {
        idea: "Ображено сидить спиною до світу перед відчиненою переноскою — збирається сховатися в неї: там його ніхто не чіпає.",
        props: [{ art: "item/carrier/premium", state: "body", x: -46, y: -24, scale: 0.8 }],
      },
      ill: { idea: "Хворий лежить буханцем у дверцятах переноски: відлежується в єдиному місці, що належить тільки йому.", props: carrierIn(-20) },
    },
    minus: {
      content: { idea: "Задоволено мружиться над уламками переноски: відвоював право їздити хіба що на руках.", props: [WRECK] },
      calm: {
        idea: "Сидить навпроти відчиненої переноски, притиснувши вуха й насупившись: туди його не заманиш, посадка щоразу — битва.",
        still: { eyes: "half", ears: "flat" },
        props: [CARRIER_FOE],
      },
      sulk: { idea: "Ображено сидить спиною біля уламків переноски, притиснувши вуха: поїздки — зрада, і він її не пробачає.", still: { ears: "flat" }, props: [WRECK] },
      ill: {
        idea: "Хворий лежить буханцем, а все одно притиснув вуха й шипить на відчинену переноску.",
        still: { mouth: "hiss", ears: "flat" },
        props: [CARRIER_FOE],
      },
    },
  },
  vet: {
    plus: {
      content: { idea: "Мружиться й муркоче біля стетоскопа й градусника: огляд для нього — як процедура в салоні.", props: EXAM },
      calm: { idea: "Спокійно сидить біля стетоскопа й градусника й не відсахується: терпить огляд.", props: EXAM },
      sulk: { idea: "Ображено сидить спиною, але не тікає від стетоскопа й градусника — стійко витримує огляд за оглядом.", props: EXAM },
      ill: { idea: "Хворий лежить буханцем біля стетоскопа й градусника й сумирно дає себе оглянути.", props: EXAM },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, відвернувшись від стетоскопа й градусника й відвівши вуха: знову переміг ветеринара.",
        still: { flip: true, ears: "back" },
        props: [...EXAM.map((prop) => ({ ...prop, x: prop.x + 24 })), CLAWS],
      },
      calm: {
        idea: "Сидить, притиснувши вуха й насупившись, біля подряпаного стетоскопа й градусника: ветеринарові від нього вже дісталося.",
        still: { eyes: "half", ears: "flat" },
        props: [...EXAM, { ...CLAWS, x: 60 }],
      },
      sulk: { idea: "Сидить спиною до стетоскопа й градусника, притиснувши вуха, — ображено мовчить після огляду.", still: { ears: "flat", flip: true }, props: EXAM },
      ill: { idea: "Хворий буханцем, а все одно шипить на стетоскоп і градусник, притиснувши вуха.", still: { mouth: "hiss", ears: "flat" }, props: EXAM },
    },
  },
  guests: {
    plus: {
      content: { idea: "Мружиться й нявкає біля вхідних дверей, у які дзвонять: кожен гість — свято.", still: { mouth: "meow" }, props: DOOR },
      calm: { idea: "Сидить біля вхідних дверей, у які дзвонять, і чекає, хто ж прийшов.", props: DOOR },
      sulk: { idea: "Ображено сидить спиною під самими вхідними дверима, у які дзвонять, і чекає гостей — удома погомоніти нема з ким.", props: DOOR },
      ill: { idea: "Хворий лежить буханцем під вхідними дверима, у які дзвонять, — сподівається, що прийшли до нього.", props: DOOR },
    },
    minus: {
      content: { idea: "Задоволено мружиться, сховавшись за будиночком від дзвінка в двері: щастя — коли вдома лише свої.", still: { base: "crouch", eyes: "arc" }, props: HIDE },
      calm: { idea: "Притиснувши вуха, зіщулився за будиночком: у двері дзвонять, і він не вилізе, поки гості не підуть.", still: { base: "crouch", ears: "flat" }, props: HIDE },
      sulk: { idea: "Ображено сидить спиною, сховавшись за будиночком від дзвінка в двері.", still: { ears: "flat" }, props: HIDE },
      ill: { idea: "Хворий тремтить за будиночком, притиснувши вуха, і шипить на дзвінок у двері.", still: { base: "crouch", eyes: "sick", ears: "flat", mouth: "hiss" }, props: HIDE },
    },
  },
  obedience: {
    plus: {
      content: { idea: "Мружиться від похвали — над головою зірочка «молодець», — сидячи біля столу зі стравою: на стіл не лізе.", props: [...TABLE, STAR(-4, -84)] },
      calm: { idea: "Чемно сидить біля столу й дивиться на страву на ньому — пам'ятає «ні», і над головою за це зірочка.", still: { bones: { head: -16 } }, props: [...TABLE, STAR(-4, -84)] },
      sulk: {
        idea: "Сидить спиною й дивиться на стіл зі стравою, але не стрибає — згадав «ні»; над головою зірочка «молодець».",
        props: [{ ...TABLE[0]!, x: 24, y: -40 }, { ...TABLE[1]!, x: 20, y: -70 }, STAR(4, -68)],
      },
      ill: { idea: "Хворий лежить буханцем під столом зі стравою, але й не думає на нього стрибнути; над ним зірочка «молодець».", props: [...TABLE, STAR(-6, -58)] },
    },
    minus: {
      content: { idea: "Задоволено мружиться, сидячи просто на плиті: усі заборони давно капітулювали.", props: [STOVE] },
      calm: { idea: "Спокійно сидить на кухонній плиті, куди йому сто разів казали «ні».", props: [STOVE] },
      sulk: { idea: "Ображено сидить спиною на плиті: його знімали — а він знову тут.", props: [STOVE] },
      ill: { idea: "Хворий лежить буханцем на кухонній плиті, куди йому не можна.", props: [STOVE] },
    },
  },
};
