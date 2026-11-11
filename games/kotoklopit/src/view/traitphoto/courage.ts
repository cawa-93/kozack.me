// Знімки рис розділу «Сміливість і стрес» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Хворий плаче (поза рівня), і сліпі глядачі шукають причину сльози в сцені: на хворих фото «добрих» боків поруч із джерелом
// шуму кіт спить (очі заплющені, «zz»), а рису каже дія (дрімає, дається оглянути) чи бабл гри.

import type { TraitBubble, TraitPerson, TraitPhotoShots, TraitProp } from "./types";

/** Робот під котом: верх кришки (`top`) — на висоті кореня кота, тож кіт сидить на ньому. */
const ROBOT: TraitProp = { art: "item/robot/cheap", state: "cleaning", x: 0, y: 12, scale: 1.4, withCat: true };
const VACUUM = (x: number, y: number, scale = 0.7): TraitProp => ({ art: "env/vacuum", state: null, x, y, scale });
const RIDE: TraitProp[] = [VACUUM(-66, -16, 0.6), ROBOT];
/**
 * Кіт у великій коробці, як у квартирі (`bigboxlook.ts`): коробка — під котом на висоті, де він сидить у ній (`perch` 48 × масштаб),
 * передні стінки — поверх нього; пилосос — по той бік.
 */
const BOX_SCALE = 1;
/**
 * `lift` — на скільки кіт вищий за дно (коробка нижча на фото): буханець і спину без нього майже не видно з-за борту. `hum` —
 * пилосос гуде й стоїть ближче: хвилі звуку — з-за його корпусу в бік коробки (тихий пилосос поодаль читався «любить коробки»).
 */
const box = (lift = 0, hum = false): TraitProp[] => [
  ...(hum ? [{ art: "icon/loud", state: null, x: -72, y: -38 + lift, scale: 0.45 } satisfies TraitProp] : []),
  VACUUM(hum ? -80 : -96, -12 + lift, 0.6),
  { art: "env/boxes", state: "pile-1", x: 0, y: 48 * BOX_SCALE + lift, scale: BOX_SCALE, withCat: true },
  { art: "env/boxes/front", state: "pile-1", x: 0, y: 48 * BOX_SCALE + lift, scale: BOX_SCALE, withCat: true, front: true },
];
const BOX = box();
const BOX_HUM = box(0, true);
/** Гучномовець ліворуч, хвилі звуку — просто на кота. */
const LOUD: TraitProp = { art: "icon/loud", state: null, x: -58, y: -16, scale: 0.55 };
/** «zz» над котом, що дрімає: над тим, що сидить, і над буханцем. */
const DOZE: TraitProp = { art: "icon/zz", state: null, x: 32, y: -68, scale: 0.32 };
const DOZE_LOW: TraitProp = { ...DOZE, x: 34, y: -50 };
/** Нервове вилизування — думка гри (подія `nervous`); жмутики шерсті поруч читались линянням — їх немає. */
const NERVOUS: TraitBubble = { kind: "think", icon: "lick-nervous" };
/** Переноска позаду ліворуч, кіт лежить у відчинених дверцятах: морда — перед ними, зад — в отворі. */
const carrierIn = (x = -26, y = -6, scale = 0.95): TraitProp[] => [{ art: "item/carrier/premium", state: "body", x, y, scale, withCat: true }];
/** Ціла відчинена переноска праворуч, навпроти кота. */
const CARRIER_FOE: TraitProp = { art: "item/carrier/premium", state: "body", x: 78, y: -12, scale: 0.8 };
/** Стетоскоп і градусник — огляд, а не ліки (ліки — хвороба, а не вдача). */
const EXAM: TraitProp[] = [
  { art: "icon/doctor-office", state: null, x: 62, y: -6, scale: 0.45 },
  { art: "icon/thermometer", state: null, x: 42, y: 12, rot: 70, scale: 0.42, front: true },
];
/** Слід кігтів поверх стетоскопа: ветеринарові дісталося. */
const CLAWS: TraitProp = { art: "icon/claws", state: null, x: 84, y: -30, scale: 0.4, front: true };
/** Та сама відчинена переноска зі слідом кігтів на боці, трохи далі: дісталося їй (уламки переноски читались порваною сумкою). */
const SCRATCHED: TraitProp[] = [
  { ...CARRIER_FOE, x: 90 },
  { ...CLAWS, x: 78, y: -30, scale: 0.45 },
];
const ANGRY: TraitBubble = { kind: "say", icon: "angry" };
/** Над буханцем бабл зсунутий назад: голова буханця попереду, і бабл ліг би на річ навпроти. */
const LOAF_DX = -16;
/** Рука на спині кота, що сидить, і буханця: огляд іде просто зараз. */
const VET_SIT: TraitPerson = { pose: "pet", x: -40, y: -8, front: true };
const VET_LOAF: TraitPerson = { pose: "pet", x: -30, y: -4, front: true };
/** Стетоскоп, притулений диском до грудей кота, трубки — від нього вбік. */
const stethoscope = (x: number, y: number): TraitProp => ({ ...EXAM[0]!, x, y, scale: 0.36, front: true, flip: true });
const BELL = (x: number, y: number): TraitProp => ({ art: "icon/bell", state: null, x, y, scale: 0.42 });
const DOOR: TraitProp[] = [{ art: "env/door", state: "closed", x: -50, y: -26, scale: 0.6 }, BELL(-70, -126)];
/** Двері з дзвінком далеко ліворуч, ближче — будиночок поверх кота: кіт за ним ховається від дверей. */
const HIDE: TraitProp[] = [
  { art: "env/door", state: "closed", x: -112, y: -40, scale: 0.5 },
  BELL(-130, -124),
  { art: "item/house/cheap", state: null, x: -14, y: 18, scale: 0.7, withCat: true, front: true },
];
/** Стіл зі стравою позаду праворуч: кіт сидить коло нього, а не на ньому. */
const TABLE: TraitProp[] = [
  { art: "env/table", state: null, x: 66, y: -12, scale: 0.75 },
  { art: "item/dish/meal", state: "premium", x: 61, y: -53, scale: 0.9 },
];
/** «Згадав ні» — думка гри (подія `cat-remembered`): стіл, перекреслений. */
const REMEMBERED: TraitBubble = { kind: "think", icon: "table", mark: "no" };
const STOVE: TraitProp = { art: "env/stove", state: "off", x: 0, y: 46, scale: 0.75, withCat: true };

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
        props: [VACUUM(50, -6)],
      },
      sulk: {
        idea: "Насуплено сидить верхи на роботі-пилососі поруч із великим пилососом: радості мало, а машини його не лякають.",
        props: RIDE,
      },
      ill: {
        idea: "Хворий міцно спить буханцем на роботі-пилососі (очі заплющені, над ним «zz»), вуха вгору: машина під ним — звичне ліжко.",
        still: { ears: "up", eyes: "closed" },
        props: [ROBOT, DOZE_LOW],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, сховавшись у коробку, а поруч гуде пилосос (хвилі звуку — до коробки): схованка від шуму — найзатишніше місце в домі.",
        props: BOX_HUM,
      },
      calm: {
        idea: "Визирає з коробки, притиснувши вуха, а поруч стоїть пилосос: не вилізе, поки той не стихне.",
        still: { ears: "flat" },
        props: BOX,
      },
      sulk: {
        idea: "Насуплено визирає з коробки, притиснувши вуха, — сховався від пилососа, що гуде поруч (хвилі звуку — до коробки).",
        still: { ears: "flat" },
        props: BOX_HUM,
      },
      ill: {
        idea: "Хворий, з притиснутими вухами, забився в коробку подалі від пилососа.",
        still: { ears: "flat" },
        props: box(6),
      },
    },
  },
  stress: {
    plus: {
      content: {
        idea: "Блаженно спить животом догори просто під гучномовцем, що гримить (над ним «zz»): розбудили — перевернувся й спить далі.",
        still: { base: "belly", eyes: "arc", ears: "up" },
        props: [LOUD, { ...DOZE, x: 52, y: -42 }],
      },
      calm: {
        idea: "Дрімає буханцем, напівзаплющивши очі, а гучномовець гримить просто на нього — навіть вухом не веде.",
        still: { base: "loaf", eyes: "half" },
        props: [LOUD, DOZE],
      },
      sulk: {
        idea: "Насуплено дрімає сидячи, спиною до гучномовця, що гримить (над ним «zz»), і вух не притискає: гуркіт його не будить, хоч і не тішить.",
        still: { eyes: "half", ears: "side" },
        props: [LOUD, DOZE],
      },
      ill: {
        idea: "Хворий міцно спить буханцем, заплющивши очі (над ним «zz»), хоч поодаль гримить гучномовець, — перечікує біду, як негоду.",
        still: { eyes: "closed" },
        props: [{ ...LOUD, x: -80 }, DOZE_LOW],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, вилизуючи лапу, з вухами «літачком», а над ним думка гри «нервово вилизується» (кіт із краплею поту й дрижаками): хвилюється через усе, хоч і щасливий.",
        still: { base: "groom", at: 600, ears: "back" },
        bubbles: [NERVOUS],
      },
      calm: {
        idea: "Прищуливши вуха, зосереджено вилизує лапу, а над ним думка «нервово вилизується» — так заспокоюється після кожної дрібниці.",
        still: { base: "groom", at: 600, eyes: "half", ears: "back" },
        bubbles: [NERVOUS],
      },
      sulk: {
        idea: "Насуплено, притиснувши вуха, вилизує лапу, а над ним думка «нервово вилизується»: дметься й знімає стрес язиком.",
        still: { base: "groom", at: 600, ears: "flat" },
        bubbles: [NERVOUS],
      },
      ill: {
        idea: "Хворий буханцем, вуха притиснуті, а над ним думка «нервово вилизується» (кіт із краплею поту й дрижаками): і хворіє, і нервує.",
        still: { ears: "flat" },
        bubbles: [NERVOUS],
      },
    },
  },
  carrier: {
    plus: {
      content: {
        idea: "Блаженно мружиться, вмостившись буханцем у дверцятах переноски, як у власному будиночку.",
        still: { base: "loaf", eyes: "arc" },
        props: carrierIn(),
      },
      calm: {
        idea: "Дрімає буханцем у дверцятах переноски (над ним «zz») — це його місце для сну.",
        still: { base: "loaf", eyes: "half" },
        props: [...carrierIn(), DOZE_LOW],
      },
      sulk: {
        idea: "Насуплено лежить буханцем у дверцятах переноски: сховався від світу туди, де його ніхто не чіпає.",
        still: { base: "loaf", bones: { head: 12 } },
        props: carrierIn(),
      },
      ill: {
        idea: "Хворий дрімає буханцем у дверцятах переноски (над ним «zz»): відлежується в єдиному місці, що належить тільки йому.",
        props: [...carrierIn(), DOZE_LOW],
      },
    },
    minus: {
      content: {
        idea: "Задоволено мружиться, відвернувшись від відчиненої переноски зі слідом його кігтів на боці й відвівши вуха: знову відбився від поїздки.",
        still: { flip: true, ears: "back" },
        props: SCRATCHED,
      },
      calm: {
        idea: "Сидить навпроти відчиненої переноски, притиснувши вуха й насупившись: туди його не заманиш, посадка щоразу — битва.",
        still: { eyes: "half", ears: "flat" },
        props: [CARRIER_FOE],
      },
      sulk: {
        idea: "Насуплено сидить мордою до відчиненої переноски зі слідом його кігтів на боці, притиснувши вуха: поїздки — зрада, і він її не пробачає.",
        still: { ears: "flat" },
        props: SCRATCHED,
      },
      ill: {
        idea: "Хворий лежить буханцем, а все одно притиснув вуха й шипить (бабл злості) на відчинену переноску зі слідом його кігтів: туди — тільки силоміць.",
        still: { ears: "flat" },
        props: SCRATCHED,
        bubbles: [{ ...ANGRY, dx: LOAF_DX }],
      },
    },
  },
  vet: {
    plus: {
      content: { idea: "Мружиться й муркоче біля стетоскопа й градусника: огляд для нього — як процедура в салоні.", props: EXAM },
      calm: {
        idea: "Спокійно сидить, прикривши очі, під рукою, що його тримає, а до грудей йому притулено стетоскоп, градусник — поруч: огляд іде просто зараз, і він не відсахується.",
        still: { eyes: "half" },
        person: VET_SIT,
        props: [stethoscope(23, -18), EXAM[1]!],
        frame: { w: 124, h: 124 },
      },
      sulk: { idea: "Насуплено сидить біля стетоскопа й градусника, але не тікає — стійко витримує огляд за оглядом.", props: EXAM },
      ill: {
        idea: "Хворий сумирно лежить буханцем з градусником у роті під рукою, що його гладить, до грудей йому притулено стетоскоп, а він думає «приємно»: огляд іде просто зараз, і йому на ньому добре.",
        person: VET_LOAF,
        props: [stethoscope(42, -3)],
        bubbles: [{ kind: "think", icon: "pleasant", dx: 16 }],
      },
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
      sulk: {
        idea: "Насуплено відвернувся від подряпаного стетоскопа й градусника, притиснувши вуха: ветеринарові дісталося, а він ще й ображений після огляду.",
        still: { ears: "flat", flip: true },
        props: [...EXAM, { ...CLAWS, x: 62 }],
      },
      ill: {
        idea: "Хворий буханцем, а все одно притиснув вуха й шипить (бабл злості) на стетоскоп і градусник.",
        still: { ears: "flat" },
        props: EXAM,
        bubbles: [ANGRY],
      },
    },
  },
  guests: {
    plus: {
      content: { idea: "Мружиться й нявкає біля вхідних дверей, у які дзвонять: кожен гість — свято.", still: { mouth: "meow" }, props: DOOR },
      calm: { idea: "Сидить мордою до вхідних дверей, у які дзвонять, і чекає, хто ж прийшов.", still: { flip: true }, props: DOOR },
      sulk: {
        idea: "Насуплено сидить мордою до вхідних дверей, у які дзвонять, і чекає гостей — удома погомоніти нема з ким.",
        still: { flip: true },
        props: DOOR,
      },
      ill: {
        idea: "Хворий лежить буханцем мордою до вхідних дверей, у які дзвонять, і нашорошив вуха — сподівається, що прийшли до нього.",
        still: { flip: true, ears: "up" },
        props: DOOR,
      },
    },
    minus: {
      content: { idea: "Задоволено мружиться, сховавшись за будиночком від дзвінка в двері: щастя — коли вдома лише свої.", still: { base: "crouch", eyes: "arc" }, props: HIDE },
      calm: { idea: "Притиснувши вуха, зіщулився за будиночком: у двері дзвонять, і він не вилізе, поки гості не підуть.", still: { base: "crouch", ears: "flat" }, props: HIDE },
      sulk: { idea: "Насуплено сидить за будиночком, притиснувши вуха, — сховався від дзвінка в двері.", still: { ears: "flat" }, props: HIDE },
      ill: { idea: "Хворий тремтить за будиночком, притиснувши вуха: у двері дзвонять, а він ховається.", still: { base: "crouch", eyes: "sick", ears: "flat" }, props: HIDE },
    },
  },
  obedience: {
    plus: {
      content: {
        idea: "Мружиться, сидячи біля столу зі стравою, а над ним думка гри «згадав ні» (перекреслений стіл): на стіл не лізе.",
        props: TABLE,
        bubbles: [REMEMBERED],
      },
      calm: { idea: "Чемно сидить біля столу зі стравою, а над ним думка «згадав ні»: пам'ятає заборону й не стрибає.", props: TABLE, bubbles: [REMEMBERED] },
      sulk: { idea: "Насуплено сидить біля столу зі стравою, а над ним думка «згадав ні»: шкода, але не можна.", props: TABLE, bubbles: [REMEMBERED] },
      ill: { idea: "Хворий лежить буханцем біля столу зі стравою, а над ним думка «згадав ні»: і не думає туди стрибати.", props: TABLE, bubbles: [REMEMBERED] },
    },
    minus: {
      content: { idea: "Задоволено мружиться, сидячи просто на плиті: усі заборони давно капітулювали.", props: [STOVE] },
      calm: { idea: "Спокійно сидить на кухонній плиті, куди йому сто разів казали «ні».", props: [STOVE] },
      sulk: { idea: "Насуплено сидить на плиті: його знімали — а він знову тут.", props: [STOVE] },
      ill: { idea: "Хворий лежить буханцем на кухонній плиті, куди йому не можна.", props: [STOVE] },
    },
  },
};
