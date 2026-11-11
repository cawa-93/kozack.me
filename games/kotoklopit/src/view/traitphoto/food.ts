// Знімки рис розділу «Їжа» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Щоб групи не плутались між собою, у кожної своя примета: «Апетит» — вилизані миски й облизується (чи пів миски делікатесу, від
// якої відходить), «Перебірливість» — простий корм, від якого тхне, і думка «не цей корм» (чи наминає його, а думка перекреслена),
// «Жебракування» — просить «стовпчиком» і нявчить «їсти» (чи вмивається й спить по їжі), «Злодійство» — ваша страва на столі (чи
// думка «на стіл — ні» спиною до нього), «Швидкість їжі» — калюжка зригнутого біля вилизаної миски (чи та сама миска без калюжки),
// «Пиття» — умивальник і кухоль (чи поїлка з водою).

import type { ArtId } from "../art/types";
import type { IconName, Mark } from "../iconnames";
import type { TraitBubble, TraitPhotoShots, TraitProp, TraitStill } from "./types";

const prop = (art: ArtId, state: string | null, x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => ({ art, state, x, y, ...more });
const think = (icon: IconName, mark?: Mark): TraitBubble => ({ kind: "think", icon, ...(mark ? { mark } : {}) });
const say = (icon: IconName): TraitBubble => ({ kind: "say", icon });

/** Миска чи поїлка: повномірна — завбільшки з тулуб кота й ховала б його. */
const BOWL_SCALE = 0.7;
const bowl = (state: string, x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => prop("item/bowl/cheap", state, x, y, { scale: BOWL_SCALE, front: y > 0, ...more });
/** Делікатес — керамічна миска з кормом «Гурман». */
const treat = (state: "premium-1" | "premium-2", x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => prop("item/bowl/premium", state, x, y, { scale: BOWL_SCALE, front: y > 0, ...more });
/** Калюжка зригнутого на виду, перед котом: позаду нього її не видно. */
const vomit = (x: number, y: number): TraitProp => prop("mess/vomit", null, x, y, { front: true });
/** Вилизана дочиста (`licked`): порожню `empty` читали мискою з молоком. */
const licked = (x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => prop("item/bowl/premium", "licked", x, y, { scale: BOWL_SCALE, front: y > 0, ...more });
/**
 * Простий корм, від якого «Перебірливому» тхне: миска й хвилі запаху над нею з проміжком над обідком і трохи вбік, від кота, — щоб
 * корм під ними було видно; хвилі, що росли просто з миски, читалися вазоном із травою.
 */
const stinky = (x: number, y: number): TraitProp[] => [
  bowl("cheap-2", x, y),
  prop("fx/smell", "a", x + Math.sign(x) * 8, y - 26, { front: y > 0, scale: 0.45 }),
];
const water = (quality: "cheap" | "premium", state: string, x: number, y: number): TraitProp => prop(`item/water/${quality}`, state, x, y, { scale: BOWL_SCALE, front: y > 0 });

/**
 * Миска перед мордою того, хто їсть чи нюхає (`eat`, `sniff`): позаду голови й трохи далі, ніж у грі, — так голова лягає на обідок
 * і видно і корм, і очі, що кажуть про настрій. Ближче до камери обідок закрив би всю морду.
 */
const AT_MOUTH = { x: 46, y: -2 } as const;
/** Поїлка перед мордою того, хто п'є (`drink`): він тягнеться далі вперед. */
/** Миска того, хто їсть язиком (`MUNCH`): ближче — язик над кормом, а не перед обідком. */
const AT_TONGUE = { x: 42, y: -2 } as const;
const AT_DRINK = { x: 50, y: -2 } as const;
/** Миска біля морди буханця — позаду, як і в того, хто їсть: голова лягає на обідок. */
const AT_LOAF = { x: 50, y: 0 } as const;

/**
 * Жує, піднявши голову з миски (`eat` на 1000 мс). Спереду голова, опущена в миску, виглядала перевернутою, а кіт — таким, що
 * лежить на боці; піднята — морда рівна, і видно рот, що жує. Лише з очима-дужками: з іншими відкритий рот — гримаса.
 */
const CHEW: TraitStill = { base: "eat", at: 1000, mouth: "eat", bones: { neck: -6, head: -22 } };
/**
 * Їсть, ледь підвівши голову: морда над кормом, язик у мисці — читається їжею за будь-яких очей. Відкритий рот `CHEW` без
 * очей-дужок читали «кривиться, відмовляється», а задерту голову — «відвернувся від їжі».
 */
const MUNCH: TraitStill = { base: "eat", at: 1000, mouth: "tongue", bones: { head: -8 } };
/**
 * Вилизує лапу: лапа нижче, біля рота, язик на ній. Лапу на носі й очах (`groom` як є) без очей-дужок читали «ховає морду».
 */
const LICK_PAW: TraitStill = { base: "groom", at: 220, mouth: "tongue", bones: { "leg-front-near": 42, head: 8 } };
/** П'є з трохи піднятою головою (`drink`): так само, лише голова в нього й так майже рівна. */
const LAP: TraitStill = { base: "drink", at: 0, bones: { head: -10 } };
/** Рамка низької пози (їсть, п'є, лежить): без порожнього тла над котом — кіт і миска більші. */
const LOW = { w: 80, h: 56 } as const;

/**
 * Умивальник під котом: кіт сидить на краю стільниці (`edge` — на 70 над pivot) лівіше від крана, мордою до нього, — посередині він
 * закривав кран собою.
 */
const sink = (state: "off" | "running"): TraitProp => prop("env/sink", state, 20, 70);

/** Кухонний стіл позаду кота зі стравою на стільниці (`dish` — на 60 над pivot, на 13 лівіше). */
const TABLE_SCALE = 0.65;
const TABLE = { x: -46, y: -20 } as const;
const table = (): TraitProp => prop("env/table", null, TABLE.x, TABLE.y, { scale: TABLE_SCALE });
const tableWithDish = (dish: "cheap" | "premium"): TraitProp[] => [table(), prop("item/dish/meal", dish, TABLE.x - 13 * TABLE_SCALE, TABLE.y - 60 * TABLE_SCALE, { scale: 0.75 })];
/** Стіл під котом: кіт стоїть на стільниці (підібрано за знімками), тінь на підлогу не падає. */
const UNDER_TABLE: TraitProp = prop("env/table", null, 4, 36, { scale: 0.76 });
/** Ваша страва — тарілка з гілочкою й золотою цяткою: її читають тарілкою господаря лише на столі (на підлозі — ласощами). */
const meal = (x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => prop("item/dish/meal", "premium", x, y, { front: y > 0, ...more });
/**
 * Думка гри «пам'ятає "ні" про стіл» (`symbols.ts`): без неї кота біля столу з тарілкою читали таким, що чигає на неї чи
 * випрошує. Кіт при цьому — спиною до столу: погляд на тарілку каже «хоче».
 */
const NOT_TABLE = think("table", "no");

export const SHOTS: TraitPhotoShots = {
  appetite: {
    plus: {
      content: {
        idea: "Мружиться й облизується між двома мисками: одна вже вилизана до блиску, друга ще повна — місце для другої порції знайдеться завжди.",
        still: { mouth: "tongue" },
        props: [licked(36, 8), bowl("cheap-2", -34, 6)],
      },
      calm: {
        idea: "Спокійно сидить і облизується між двома вилизаними до блиску мисками: з'їв обидві порції й не проти перекусити ще.",
        still: { mouth: "tongue" },
        props: [licked(36, 8), licked(-34, 6)],
      },
      sulk: {
        idea: "Насуплено сидить між двома вилизаними до блиску мисками й думає про корм: з'їв обидві порції, а добавки не дають.",
        props: [licked(36, 8), licked(-34, 6)],
        bubbles: [think("kibble")],
      },
      ill: {
        idea: "Хворий буханець облизується між двома вилизаними мисками й думає про корм: хворіє, а все одно голодний.",
        still: { mouth: "tongue" },
        props: [licked(-36, -6), licked(AT_LOAF.x - 4, AT_LOAF.y)],
        bubbles: [think("kibble")],
        frame: LOW,
      },
    },
    minus: {
      content: {
        idea: "Блаженно дрімає, розлігшись спиною до миски, де лишилося пів порції делікатесу: наївся половиною, а решта почекає.",
        still: { base: "sprawl", flip: true },
        props: [treat("premium-1", 40, 8)],
        frame: LOW,
      },
      calm: {
        idea: "Спокійно йде геть, углиб кімнати, від миски, де лишилося пів порції делікатесу: перехопив кілька шматочків — і досить.",
        still: { base: "walk", at: 0, view: "back" },
        props: [treat("premium-1", -26, 14, { scale: 0.8 })],
      },
      sulk: {
        idea: "Похнюплено сидить, відвернувшись від недоїденої миски делікатесу: їсти не хочеться, а миску все не прибирають.",
        still: { flip: true },
        props: [treat("premium-1", 36, 10)],
      },
      ill: {
        idea: "Хворий буханець над мискою делікатесу, з якої з'їдено лише трохи: ледве торкається їжі.",
        props: [treat("premium-1", AT_LOAF.x, AT_LOAF.y)],
        frame: LOW,
      },
    },
  },
  picky: {
    plus: {
      content: {
        idea: "Мружиться над керамічною мискою делікатесу, а пластикова з простим кормом, від якого йому тхне, стоїть позаду нечіпана, і він думає «не цей корм»: краще він отримує завжди.",
        props: [...stinky(-36, -6), treat("premium-2", 36, 8, { scale: 0.8 })],
        bubbles: [think("picky")],
      },
      calm: {
        idea: "Спокійно, але прискіпливо гребе лапою біля миски простого корму, над якою тхне, — «закопує» її, як у лотку.",
        still: { base: "bury", at: 120 },
        props: stinky(54, -4),
      },
      sulk: {
        idea: "Ображено сидить, відвернувшись від повної миски простого корму, над якою тхне, і думає «не цей корм»: знову програв мисці війну за кращий.",
        still: { flip: true },
        props: stinky(46, 12),
        bubbles: [think("picky")],
      },
      ill: {
        idea: "Голодний хворий буханець відвернувся від повної миски простого корму, над якою тхне, — «не цей корм», навіть так не їсть.",
        still: { flip: true },
        props: stinky(54, 8),
        bubbles: [think("picky")],
      },
    },
    minus: {
      content: {
        idea: "Підвів голову над мискою простого корму й жує за обидві щоки, мружачись від щастя, а думка «не цей корм» перекреслена: йому смакує будь-що.",
        still: { ...CHEW, eyes: "arc" },
        props: [bowl("cheap-2", AT_MOUTH.x, AT_MOUTH.y)],
        bubbles: [think("picky", "no")],
        frame: LOW,
      },
      calm: {
        idea: "Спокійно їсть простий корм, язик у мисці, а думка «не цей корм» перекреслена: їсть що дали, без жодних церемоній.",
        still: MUNCH,
        props: [bowl("cheap-2", AT_TONGUE.x, AT_TONGUE.y)],
        bubbles: [think("picky", "no")],
        frame: LOW,
      },
      sulk: {
        idea: "Насуплений, з вухами назад, а все одно їсть простий корм із наполовину з'їденої миски, язик у кормі; думка «не цей корм» перекреслена: ображений, але не перебирає.",
        still: MUNCH,
        props: [bowl("cheap-1", AT_TONGUE.x, AT_TONGUE.y)],
        bubbles: [think("picky", "no")],
        frame: LOW,
      },
      ill: {
        idea: "Хворий, а все одно їсть простий корм із наполовину з'їденої миски, язик у кормі; думка «не цей корм» перекреслена: не вередує, їсть що є.",
        still: MUNCH,
        props: [bowl("cheap-1", AT_TONGUE.x, AT_TONGUE.y)],
        bubbles: [think("picky", "no")],
        frame: LOW,
      },
    },
  },
  begging: {
    plus: {
      content: {
        idea: "Щасливо підвівся «стовпчиком» біля вилизаної миски й нявчить «їсти!» — вистава «мене не годували тиждень», за яку дають ласощі.",
        still: { base: "beg", at: 1300, eyes: "arc", mouth: "meow" },
        props: [licked(34, 8)],
        bubbles: [say("kibble")],
      },
      calm: {
        idea: "Щойно поїв, а вже б'є лапкою повітря й нявчить біля вилизаної миски, просячи добавки.",
        still: { base: "beg", at: 300, mouth: "meow" },
        props: [licked(34, 8)],
      },
      sulk: {
        idea: "Скривджено просить лапкою біля вилизаної миски, опустивши вуха, — слухають його через раз.",
        still: { base: "beg", at: 300, view: "front", eyes: "half", ears: "side", mouth: "meow" },
        props: [licked(34, 8)],
      },
      ill: {
        idea: "Знесилений буханець підвів голову й жалібно нявчить біля вилизаної миски — і ніхто не відповідає.",
        still: { mouth: "meow", bones: { neck: -4, head: -14 } },
        props: [licked(AT_LOAF.x, AT_LOAF.y)],
      },
    },
    minus: {
      content: {
        idea: "Поїв і блаженно вмивається лапкою біля вилизаної миски: просити добавки йому й на думку не спадає.",
        still: { base: "groom", at: 220, eyes: "arc" },
        props: [licked(-34, 6)],
      },
      calm: {
        idea: "Поївши, спокійно спить клубочком біля вилизаної миски — добавки не випрошує.",
        still: { base: "sleep", eyes: "closed" },
        props: [licked(-36, -6)],
        frame: LOW,
      },
      sulk: {
        idea: "Насуплено, з вухами назад вилизує лапу після їжі біля вилизаної миски: нічого не просить, тож про нього часто й забувають.",
        still: LICK_PAW,
        props: [licked(-42, 12)],
      },
      ill: {
        idea: "Хворий буханець дрімає, заплющивши очі, біля вилизаної миски: поїв і відпочиває — нічого ні в кого не просить.",
        still: { flip: true, eyes: "closed" },
        props: [licked(40, 6)],
      },
    },
  },
  thief: {
    plus: {
      content: {
        idea: "Сидить просто на кухонному столі біля вашої тарілки й облизується, мружачись: поласував людською стравою — і йому все пробачили.",
        still: { mouth: "tongue", shadow: false },
        props: [UNDER_TABLE, meal(46, 0, { front: false, scale: 0.8 })],
      },
      calm: {
        idea: "Заліз на кухонний стіл і спокійно наминає з вашої тарілки, піднявши голову, щоб пережувати.",
        still: { ...CHEW, shadow: false },
        props: [UNDER_TABLE, meal(50, -2, { front: false, scale: 0.8 })],
      },
      sulk: {
        idea: "Насуплено тягнеться до тарілки з вашою стравою на столі, спиною до нас: найсмачніше завжди там, і він своє візьме.",
        still: { view: "back", flip: true, ears: "flat", bones: { neck: -10, head: -20, tail: -30 } },
        props: tableWithDish("premium"),
      },
      ill: {
        idea: "Хворий буханець припав до вашої тарілки, стягнутої зі столу на підлогу, й хрумтить краденим.",
        still: { mouth: "eat" },
        props: [table(), meal(AT_LOAF.x - 2, AT_LOAF.y, { scale: 0.85 })],
        bubbles: [say("stolen")],
      },
    },
    minus: {
      content: {
        idea: "Мружачись, гордо задер носа спиною до столу з вашою тарілкою й думає «на стіл — ні»: чужого не бере, найкраще йому подадуть і так.",
        still: { eyes: "arc", bones: { head: -24 } },
        props: tableWithDish("cheap"),
        bubbles: [NOT_TABLE],
      },
      calm: {
        idea: "Чемно сидить спиною до столу з тарілкою й думає «на стіл — ні»: страва поруч, а він її не чіпає.",
        props: tableWithDish("cheap"),
        bubbles: [NOT_TABLE],
      },
      sulk: {
        idea: "Насуплено сидить спиною до столу з тарілкою й думає «на стіл — ні»: їсти хочеться, але чуже не чіпає.",
        props: tableWithDish("cheap"),
        bubbles: [NOT_TABLE],
      },
      ill: {
        idea: "Хворий буханець лежить біля столу з повною тарілкою й думає «на стіл — ні»: не бере ні крихти.",
        props: tableWithDish("cheap"),
        bubbles: [NOT_TABLE],
      },
    },
  },
  gulping: {
    plus: {
      content: {
        idea: "Щасливо облизується над уже вилизаною мискою, а поруч — калюжка зригнутого: з'їв порцію за мить, і не вперше.",
        still: { mouth: "tongue" },
        props: [licked(34, 8), vomit(-40, 12)],
      },
      calm: {
        idea: "Підвів голову з уже вилизаної миски й здивовано дивиться: порція зникла за мить, а поруч уже калюжка зригнутого.",
        still: { ...CHEW, eyes: "round", mouth: "closed" },
        props: [licked(AT_MOUTH.x, AT_MOUTH.y), vomit(-36, 12)],
        frame: LOW,
      },
      sulk: {
        idea: "Похнюплено сидить між вилизаною мискою й калюжкою зригнутого: ковтнув порцію за мить — і розплатився.",
        props: [licked(32, 8), vomit(-40, 12)],
      },
      ill: {
        idea: "Хворий кіт зригує біля вилизаної миски: знову проковтнув їжу не жуючи.",
        still: { base: "vomit", at: 990, eyes: "sick", ears: "side" },
        props: [licked(-34, -4), vomit(44, 10)],
      },
    },
    minus: {
      // Ті самі кадри, що в «Квапливого», але без калюжки: їсть спокійно, і нічого не повертається.
      content: {
        idea: "Щасливо облизується над вилизаною мискою, і підлога довкола чиста: їсть не поспішаючи, по зернятку.",
        still: { mouth: "tongue" },
        props: [licked(34, 8)],
      },
      calm: {
        idea: "Підвів голову з вилизаної миски й спокійно дивиться, підлога довкола чиста: смакував кожне зернятко.",
        still: { ...CHEW, eyes: "round", mouth: "closed" },
        props: [licked(AT_MOUTH.x, AT_MOUTH.y)],
        frame: LOW,
      },
      sulk: {
        idea: "Похнюплено сидить біля вилизаної миски, підлога довкола чиста: з'їв по зернятку, а більше не дали.",
        props: [licked(32, 8)],
      },
      ill: {
        idea: "Хворий кіт лежить біля вилизаної миски, підлога довкола чиста: навіть нездужаючи їсть потроху.",
        props: [licked(-34, -4)],
      },
    },
  },
  drinking: {
    plus: {
      content: {
        idea: "Сидить на умивальнику біля відкритого крана й, мружачись, облизується: щойно напився з-під струменя.",
        still: { mouth: "tongue" },
        props: [sink("running")],
      },
      calm: {
        idea: "Спокійно сидить на умивальнику біля відкритого крана й дивиться на струмінь: це найкраща поїлка в домі.",
        props: [sink("running")],
      },
      sulk: {
        idea: "Ображено сидить на сухому умивальнику під закритим краном і нявчить «пити!»: чекає, поки хтось нарешті його відкриє.",
        still: { mouth: "meow" },
        props: [sink("off")],
        bubbles: [say("drink")],
      },
      ill: {
        idea: "Знесилений буханець лежить на сухому умивальнику під закритим краном і думає про воду: з миски йому не те.",
        props: [sink("off")],
        bubbles: [think("drink")],
      },
    },
    minus: {
      content: {
        idea: "Мружачись, хлебче свіжу воду з повної поїлки: щойно долили — він уже тут.",
        still: { ...LAP, eyes: "arc" },
        props: [water("premium", "full", AT_DRINK.x, AT_DRINK.y)],
        frame: LOW,
      },
      calm: {
        idea: "Чемно й охайно п'є з простої металевої поїлки — ні крана, ні фонтанчиків не треба.",
        still: LAP,
        props: [water("cheap", "full", AT_DRINK.x, AT_DRINK.y)],
        frame: LOW,
      },
      sulk: {
        idea: "Насуплено сидить над порожньою поїлкою й просить «пити!»: доливають її нечасто, а пити він ходить лише сюди.",
        props: [water("premium", "empty", 30, 10)],
        bubbles: [say("drink")],
      },
      ill: {
        idea: "Хворий буханець біля порожньої поїлки думає про воду: чекає, поки хтось згадає долити.",
        props: [water("premium", "empty", AT_LOAF.x, AT_LOAF.y)],
        bubbles: [think("drink")],
      },
    },
  },
};
