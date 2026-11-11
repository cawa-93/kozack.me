// Знімки рис розділу «Їжа» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Щоб групи не плутались між собою, у кожної своя примета: «Апетит» — порожні миски й облизується (чи пів миски, від якої
// відвернувся), «Перебірливість» — простий корм, від якого тхне (чи наминає його), «Жебракування» — просить «стовпчиком» і
// нявчить (чи вмивається по їжі), «Злодійство» — людська страва, «Швидкість їжі» — блювота й порожня миска (чи жує над
// повною), «Пиття» — умивальник і кухоль (чи поїлка з водою).

import type { ArtId } from "../art/types";
import type { TraitPhotoShots, TraitProp } from "./types";

const prop = (art: ArtId, state: string | null, x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => ({ art, state, x, y, ...more });

/** Миска чи поїлка: повномірна — завбільшки з тулуб кота й ховала б його. */
const BOWL_SCALE = 0.7;
const bowl = (state: string, x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => prop("item/bowl/cheap", state, x, y, { scale: BOWL_SCALE, front: y > 0, ...more });
/** Порожня — керамічна: порожня пластикова блакитна всередині й читається поїлкою з водою. */
const emptyBowl = (x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => prop("item/bowl/premium", "empty", x, y, { scale: BOWL_SCALE, front: y > 0, ...more });
/** Простий корм, від якого «Перебірливому» тхне: хвилі запаху над мискою. */
const stink = (x: number, y: number): TraitProp => prop("fx/smell", "a", x, y, { front: true, scale: 0.6 });
const water = (quality: "cheap" | "premium", state: string, x: number, y: number): TraitProp => prop(`item/water/${quality}`, state, x, y, { scale: BOWL_SCALE, front: y > 0 });

/**
 * Миска перед мордою того, хто їсть чи нюхає (`eat`, `sniff`): позаду голови й трохи далі, ніж у грі, — так голова лягає на обідок
 * і видно і корм, і очі, що кажуть про настрій. Ближче до камери обідок закрив би всю морду.
 */
const AT_MOUTH = { x: 46, y: -2 } as const;
/** Поїлка перед мордою того, хто п'є (`drink`): він тягнеться далі вперед. */
const AT_DRINK = { x: 50, y: -2 } as const;
/** Миска біля морди буханця — позаду, як і в того, хто їсть: голова лягає на обідок. */
const AT_LOAF = { x: 50, y: 0 } as const;

/** Умивальник під котом: кіт сидить на його краю (`edge` — на 70 над pivot). */
const SINK_SCALE = 0.5;
const sink = (state: "off" | "running"): TraitProp => prop("env/sink", state, 0, 70 * SINK_SCALE, { scale: SINK_SCALE });

/** Кухонний стіл позаду кота зі стравою на стільниці (`dish` — на 60 над pivot, на 13 лівіше). */
const TABLE_SCALE = 0.36;
const TABLE = { x: -46, y: -20 } as const;
const tableWithDish = (dish: "cheap" | "premium"): TraitProp[] => [
  prop("env/table", null, TABLE.x, TABLE.y, { scale: TABLE_SCALE }),
  prop("item/dish/meal", dish, TABLE.x - 13 * TABLE_SCALE, TABLE.y - 60 * TABLE_SCALE, { scale: 0.75 }),
];

export const SHOTS: TraitPhotoShots = {
  appetite: {
    plus: {
      content: {
        idea: "Мружиться й облизується між двома мисками: одна вже вилизана до дна, друга ще повна — місце для другої порції знайдеться завжди.",
        still: { mouth: "tongue" },
        props: [emptyBowl(36, 8), bowl("cheap-2", -34, 6)],
      },
      calm: {
        idea: "Спокійно сидить і облизується між двома порожніми мисками: з'їв обидві порції й не проти перекусити ще.",
        still: { mouth: "tongue" },
        props: [emptyBowl(36, 8), emptyBowl(-34, 6)],
      },
      sulk: {
        idea: "Ображено сидить спиною, носом до вилизаної порожньої миски: не лишив ні крихти, бо не знає, коли насиплють знову.",
        props: [emptyBowl(30, -10)],
      },
      ill: {
        idea: "Знесилений буханець висолопив язика над порожньою мискою — вилизує її в марній надії на добавку.",
        still: { mouth: "tongue" },
        props: [emptyBowl(AT_LOAF.x - 4, AT_LOAF.y)],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, відвернувшись від миски, де лишилося пів порції делікатесу: йому досить і половини.",
        still: { flip: true },
        props: [prop("item/bowl/premium", "premium-1", 36, 8, { scale: BOWL_SCALE, front: true })],
      },
      calm: {
        idea: "Спокійно йде геть від миски, де лишилася половина корму: перехопив кілька шматочків — і досить.",
        still: { base: "walk", at: 0, flip: true },
        props: [bowl("cheap-1", 40, 10)],
      },
      sulk: {
        idea: "Сидить спиною до камери й до надкльованої миски, яку ніхто не поспішає прибрати.",
        props: [bowl("cheap-1", -32, 12)],
      },
      ill: {
        idea: "Хворий буханець над мискою, з якої з'їдено лише трохи: ледве торкається їжі.",
        props: [bowl("cheap-1", AT_LOAF.x, AT_LOAF.y)],
      },
    },
  },
  picky: {
    plus: {
      content: {
        idea: "Мружиться над дорогою керамічною мискою з кормом «Гурман», а пластикова з простим кормом, від якого йому тхне, стоїть позаду нечіпана: краще він отримує завжди.",
        props: [bowl("cheap-2", -36, -6), stink(-36, -16), prop("item/bowl/premium", "premium-2", 36, 8, { scale: 0.8, front: true })],
      },
      calm: {
        idea: "Спокійно, але прискіпливо обнюхує миску з простим кормом, від якого йому тхне, перш ніж удостоїти її уваги.",
        still: { base: "sniff", at: 0 },
        props: [bowl("cheap-2", AT_MOUTH.x, AT_MOUTH.y), stink(AT_MOUTH.x + 4, AT_MOUTH.y - 12)],
      },
      sulk: {
        idea: "Ображено сидить спиною до повної миски простого корму, від якого йому тхне: знову програв мисці війну за кращий корм.",
        props: [bowl("cheap-2", -34, 12), stink(-34, 0)],
      },
      ill: {
        idea: "Голодний хворий буханець відвернувся від повної миски простого корму, від якої йому аж тхне, — навіть так не їсть.",
        still: { flip: true },
        props: [bowl("cheap-2", 40, 6), stink(40, -6)],
      },
    },
    minus: {
      content: {
        idea: "Уплітає простий корм за обидві щоки, мружачись від щастя: йому смакує будь-що.",
        still: { base: "eat", at: 0, eyes: "arc", mouth: "eat" },
        props: [bowl("cheap-2", AT_MOUTH.x, AT_MOUTH.y)],
      },
      calm: {
        idea: "Спокійно наминає простий корм, а поруч уже вилизана миска з-під делікатесу: однаково охоче їсть і те, і те.",
        still: { base: "eat", at: 0, mouth: "eat" },
        props: [emptyBowl(-36, -4), bowl("cheap-1", AT_MOUTH.x, AT_MOUTH.y)],
      },
      sulk: {
        idea: "Похнюплено, з опущеними вухами їсть що дали, хоч і запізно, — не скаржиться.",
        still: { base: "eat", at: 0, view: "front", eyes: "half", ears: "side", mouth: "eat" },
        props: [bowl("cheap-1", AT_MOUTH.x, AT_MOUTH.y)],
      },
      ill: {
        idea: "Хворий кіт їсть навіть із тарілки зі зіпсованою стравою — не вередує, бо іншого може й не бути.",
        still: { base: "eat", at: 0, eyes: "sick", ears: "side" },
        props: [prop("item/dish/spoiled", null, AT_MOUTH.x, AT_MOUTH.y, { scale: 0.8 })],
      },
    },
  },
  begging: {
    plus: {
      content: {
        idea: "Щасливо підвівся «стовпчиком» і нявчить біля миски — вистава «мене не годували тиждень», за яку дають ласощі.",
        still: { base: "beg", at: 1300, eyes: "arc", mouth: "meow" },
        props: [emptyBowl(34, 8)],
      },
      calm: {
        idea: "Щойно поїв, а вже б'є лапкою повітря й нявчить біля порожньої миски, просячи добавки.",
        still: { base: "beg", at: 300, mouth: "meow" },
        props: [emptyBowl(34, 8)],
      },
      sulk: {
        idea: "Скривджено просить лапкою біля порожньої миски, опустивши вуха, — слухають його через раз.",
        still: { base: "beg", at: 300, view: "front", eyes: "half", ears: "side", mouth: "meow" },
        props: [emptyBowl(34, 8)],
      },
      ill: {
        idea: "Знесилений буханець підвів голову й жалібно нявчить біля порожньої миски — і ніхто не відповідає.",
        still: { mouth: "meow", bones: { neck: -4, head: -14 } },
        props: [emptyBowl(AT_LOAF.x, AT_LOAF.y)],
      },
    },
    minus: {
      content: {
        idea: "Поїв і блаженно вмивається лапкою біля порожньої миски: просити добавки йому й на думку не спадає.",
        still: { base: "groom", at: 220, eyes: "arc" },
        props: [emptyBowl(-34, 6)],
      },
      calm: {
        idea: "Поївши, спокійно влаштувався подрімати буханцем біля порожньої миски — не випрошує.",
        still: { base: "loaf", eyes: "half" },
        props: [emptyBowl(-34, 6)],
      },
      sulk: {
        idea: "Сидить спиною далеко від порожньої миски, умиваючись після їжі: нічого не просить, тож про нього часто й забувають.",
        still: { base: "groom", at: 220, eyes: "half", ears: "side" },
        props: [emptyBowl(-42, 12)],
      },
      ill: {
        idea: "Хворий буханець мовчки лежить носом від порожньої миски — нічого ні в кого не просить.",
        still: { flip: true },
        props: [emptyBowl(40, 6)],
      },
    },
  },
  thief: {
    plus: {
      content: {
        idea: "Мружиться й облизується над тарілкою з людською стравою, стягнутою на підлогу, — і йому все пробачили.",
        still: { mouth: "tongue" },
        props: [prop("item/dish/meal", "premium", 34, 8, { front: true })],
      },
      calm: {
        idea: "Діловито несе в зубах пакунок із м'ясом зі столу, наче то не він.",
        still: { base: "carry", at: 0 },
        props: [prop("item/dish/raw", "cheap", 32, -18, { front: true, scale: 0.65 })],
      },
      sulk: {
        idea: "Насуплено сидить спиною, згорбившись над тарілкою з людською стравою, — найсмачніше завжди на столі.",
        props: [prop("item/dish/meal", "cheap", 38, -12, { scale: 0.85 })],
      },
      ill: {
        idea: "Хворий буханець припав до краденої тарілки з людською стравою — перебивається тим, що поцупив.",
        still: { mouth: "tongue" },
        props: [prop("item/dish/meal", "cheap", AT_LOAF.x - 2, AT_LOAF.y, { scale: 0.85 })],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, гордо сидячи біля столу з тарілкою, — і не торкається її: найкраще йому подадуть і так.",
        props: tableWithDish("premium"),
      },
      calm: {
        idea: "Чемно сидить біля столу й дивиться вгору на тарілку — чекає свого шматочка, але лапою її не чіпає.",
        still: { flip: true, bones: { head: -22 } },
        props: tableWithDish("cheap"),
      },
      sulk: {
        idea: "Сидить спиною до камери й довго, сумно дивиться на тарілку на столі — але лапою ні-ні.",
        still: { flip: true },
        props: tableWithDish("cheap"),
      },
      ill: {
        idea: "Хворий голодний буханець лежить під столом із повною тарілкою і не бере ні крихти.",
        props: tableWithDish("cheap"),
      },
    },
  },
  gulping: {
    plus: {
      content: {
        idea: "Щасливо облизується над уже порожньою мискою, а поруч ще лежить совок із кормом: з'їв порцію, поки її насипали.",
        still: { mouth: "tongue" },
        props: [emptyBowl(34, 8), prop("item/scoop", "cheap", -34, 8, { front: true, scale: 0.8 })],
      },
      calm: {
        idea: "Заглибився в миску, а вона вже порожня: змів порцію за мить і здивовано шукає, куди вона поділася.",
        still: { base: "eat", at: 0, eyes: "round" },
        props: [emptyBowl(AT_MOUTH.x, AT_MOUTH.y)],
      },
      sulk: {
        idea: "Ображено сидить спиною біля порожньої миски й калюжки блювоти: ковтнув порцію за мить — і розплатився.",
        props: [emptyBowl(30, -10), prop("mess/vomit", null, -24, 14, { front: true, scale: 0.8 })],
      },
      ill: {
        idea: "Хворий кіт зригує біля порожньої миски: знову проковтнув їжу не жуючи.",
        still: { base: "vomit", at: 990, eyes: "sick", ears: "side" },
        props: [emptyBowl(-34, -4), prop("mess/vomit", null, 40, 10, { front: true, scale: 0.8 })],
      },
    },
    minus: {
      content: {
        idea: "Підняв голову з повної миски й смакує, заплющивши очі: їсть по шматочку, ніби на званій вечері.",
        still: { base: "eat", at: 1000, eyes: "arc", mouth: "eat" },
        props: [prop("item/bowl/premium", "premium-2", AT_MOUTH.x, AT_MOUTH.y, { scale: BOWL_SCALE })],
      },
      calm: {
        idea: "Неспішно жує над ще повною мискою, а поруч порожня миска того, хто давно пообідав.",
        still: { base: "eat", at: 1000, mouth: "eat" },
        props: [emptyBowl(-36, -4), bowl("cheap-2", AT_MOUTH.x, AT_MOUTH.y)],
      },
      sulk: {
        idea: "Похнюплено пережовує кожну гранулу над повною мискою, коли решта давно пообідала.",
        still: { base: "eat", at: 1000, view: "front", eyes: "half", ears: "side", mouth: "eat" },
        props: [emptyBowl(-36, -4), bowl("cheap-2", AT_MOUTH.x, AT_MOUTH.y)],
      },
      ill: {
        idea: "Хворий кіт ледве жує над мискою з кількома гранулами — розтягує мізерну порцію на весь день.",
        still: { base: "eat", at: 1000, eyes: "sick", ears: "side", mouth: "eat" },
        props: [bowl("cheap-1", AT_MOUTH.x, AT_MOUTH.y)],
      },
    },
  },
  drinking: {
    plus: {
      content: {
        idea: "Сидить на умивальнику й, мружачись, хлебче струмочок із відкритого крана.",
        still: { base: "drink", at: 0, eyes: "arc" },
        props: [sink("running")],
      },
      calm: {
        idea: "Спокійно п'є з вашого кухля з кавою, ніби це найкраща поїлка в домі.",
        still: { base: "drink", at: 0 },
        props: [prop("mess/trinket/mug", "standing", 36, 4, { front: true, scale: 0.55 })],
      },
      sulk: {
        idea: "Ображено сидить спиною на сухому умивальнику під закритим краном: чатує, поки хтось нарешті його відкриє.",
        props: [sink("off")],
      },
      ill: {
        idea: "Знесилений буханець лежить на холодному умивальнику під краном, якого ніхто не відкриває.",
        props: [sink("off")],
      },
    },
    minus: {
      content: {
        idea: "Мружачись, хлебче свіжу воду з повної поїлки: щойно долили — він уже тут.",
        still: { base: "drink", at: 0, eyes: "arc" },
        props: [water("premium", "full", AT_DRINK.x, AT_DRINK.y)],
      },
      calm: {
        idea: "Чемно й охайно п'є з простої металевої поїлки — ні крана, ні фонтанчиків не треба.",
        still: { base: "drink", at: 0 },
        props: [water("cheap", "full", AT_DRINK.x, AT_DRINK.y)],
      },
      sulk: {
        idea: "Ображено сидить спиною над поїлкою, де води лише на донці: доливають її нечасто.",
        props: [water("cheap", "low", 30, -10)],
      },
      ill: {
        idea: "Хворий буханець терпляче лежить біля сухої поїлки, чекаючи, поки хтось згадає долити води.",
        props: [water("cheap", "empty", AT_LOAF.x, AT_LOAF.y)],
      },
    },
  },
};
