// Універсальний магазин (§6.4): один каталог запасів і речей — кожен варіант товару своєю карткою з кількістю кнопками «−» і «+»
// (рішення автора 2026-11-03, «Кожен товар у своїй картці»), а внизу картки — смуга кошика: сума, гроші, «Очистити» й одна
// головна кнопка (рішення автора 2026-11-03, «Бірка знижки й кошик унизу»). Той самий компонент — у телефоні (доставка) і на
// місці: у магазині, а ліки — у ветеринара й лікаря (§8.5).

import { canCheckout, cartDelivery, cartTotal, catalog, coming, discount, fitCart, goodsKey, goodsTotal, room, unavailable, unitPrice, variants, type CartLine, type Goods, type ShopMode, type Unavailable } from "../sim/shop";
import { helps, remedyOf } from "../sim/remedies";
import type { GameState, Quality } from "../sim/types";
import { REMEDY_HINTS } from "../texts";
import type { IconName } from "../view/iconnames";
import { PRODUCT_ICONS, THING_ICONS, VARIANT_ICONS } from "../view/symbols";
import { drawGlyphs } from "./glyphs";
import { iconMark, named } from "./icons";
import { hintBubble } from "./hintbubble";
import { element } from "./overlay";
import { PRODUCT_TITLES, SHOP_SECTION_TITLES, STORE_SECTION_TITLES, VARIANT_TITLES } from "./titles";

/**
 * Назва варіанта товару (§6.4; `VARIANT_TITLES`): стоїть у картці сама, без назви товару, тож каже й що це, й для кого (рішення
 * автора 2026-11-03, «Кожен товар у своїй картці»; `TEXTS.md`, «Назви товарів»).
 */
export function variantTitle(goods: Goods, quality: Quality): string {
  return VARIANT_TITLES[goodsKey(goods)]?.[quality] ?? quality;
}

/**
 * Іконка товару біля його назви (§11.4 «Іконка біля назви», рішення автора 2026-11-02): запас — та сама, що над сховищем, у
 * думці персонажа й на кнопці телефона, коли запас скінчився (`PRODUCT_ICONS`), річ — іконка самої речі (`THING_ICONS`). З
 * якістю — іконка варіанта, коли він має свою (`VARIANT_ICONS`: пластир).
 */
export function goodsIcon(goods: Goods, quality?: Quality): IconName {
  if (!("product" in goods)) return THING_ICONS[goods.thing];
  return (quality && VARIANT_ICONS[goods.product]?.[quality]) || PRODUCT_ICONS[goods.product];
}

/**
 * Назва варіанта в картці каталогу: слово через дефіс («робот-пилосос», «фонтанчик-поїлка») — цілим (`.nowrap`), тож назва у два
 * рядки не рветься на дефісі — «Простий / робот-пилосос», а не «Простий робот- / пилосос» (рецензія 2026-11-03, рішення
 * виконавця; рядки ще й збалансовані, `overlay.css`). Не нерозривний дефіс U+2011: у Pangolin його немає, і браузер малював би
 * його іншим шрифтом.
 */
function nameParts(title: string): (string | HTMLElement)[] {
  return title
    .split(/(\S*-\S*)/u)
    .filter((part) => part !== "")
    .map((part) => (part.includes("-") ? element("span", "nowrap", part) : part));
}

/** Назва кнопки «і» для читача екрана (§6.4, «Від чого товар»). */
const REMEDY_LABEL = "Від чого допомагає";

/** Від чого допомагає варіант (§6.4): текст бабла над «і»; товар, що ні від чого не допомагає, — null. */
function remedyHint(goods: Goods, quality: Quality): string | null {
  if (!("product" in goods) || !helps(remedyOf(goods.product, quality))) return null;
  return REMEDY_HINTS[goods.product]?.[quality] ?? null;
}

/** Назва варіанта з іконкою товару перед нею — так, як її показує картка магазину, і в «Моїх речах» телефона (`icons.ts`). */
export const variantLabel = (goods: Goods, quality: Quality): string => named(goodsIcon(goods, quality), variantTitle(goods, quality));

/** Чому товар не взяти — коротким підписом у рядку (§6.4). */
const UNAVAILABLE: Record<Unavailable, string> = {
  boxes: "у ящиках",
  "no-room": "немає місця",
  "no-bowl": "немає миски без годівниці",
  owned: "уже є",
  ordered: "уже їде",
};

/** Кнопка «Очистити» — без тексту, лише іконка (гліф `⌫` → `ui/glyph/cart-clear`); назва — для підказки й читача екрана. */
export const CLEAR_CART = "Очистити кошик";

/** Головна кнопка мить після покупки на місці (`BOUGHT_PAUSE_MS`): «✓» — зроблено цієї поїздки, як «✓ під контролем». */
export const BOUGHT = "✓ Куплено";

/**
 * Скільки мілісекунд після покупки на місці головна кнопка — неактивна «✓ Куплено», а не «Додому» (рецензія 2026-11-03, рішення
 * виконавця; GAME_DESIGN §6.4, «Бірка знижки й кошик унизу»). Після покупки картка перебудовується, і з порожнім кошиком на тому
 * самому місці, де була «Купити», стає «Додому»: другий дотик подвійного натискання «Купити» інакше одразу вивозив би додому.
 * 600 мс — довше за паузу між дотиками подвійного натискання (≈ 300–500 мс; подвійний клік у Windows — до 500 мс) і досить
 * коротко, щоб не заважати поїхати.
 */
export const BOUGHT_PAUSE_MS = 600;

/**
 * Під назвою варіанта (§6.4, правка автора 2026-10-23): скільки саме цього варіанта вже їде (з тим, що чекає під дверима; рішення
 * автора 2026-11-03, «Кожен товар у своїй картці»: картка — варіант), і чому товар не взяти — з урахуванням кошика (миска в
 * кошику дає місце автогодівниці, §9.12). Скільки вдома — не показуємо: це видно зі сховищ. «×N» — скільки в упаковці — більше
 * не пишемо (те саме рішення).
 */
function stockText(state: GameState, goods: Goods, quality: Quality, reason: Unavailable | null): string {
  const parts: string[] = [];
  const n = coming(state, goods, quality);
  if (n > 0) parts.push(`🚗 ${"product" in goods ? PRODUCT_TITLES[goods.product].unit(n) : `${n} шт.`}`);
  // «Уже їде» дублював би 🚗 у картці варіанта, що їде; у картці іншого варіанта тієї самої речі (техніка, переноска й замок —
  // по одній) — пояснює, чому вона сіра.
  if (reason !== null && !(reason === "ordered" && n > 0)) parts.push(UNAVAILABLE[reason]);
  return parts.join(" · ");
}

/** Бірка знижки «−X%» (§6.4; рішення автора 2026-11-03): червоний цінник із отвором (`art/ui/tag.svg`), трохи навскіс. */
function priceTag(percent: number): HTMLElement {
  return element("span", "price-tag", `−${percent}%`);
}

/**
 * Розділ запасів каталогу: на місці в пункті, що продає частину каталогу, — його назва (`STORE_SECTION_TITLES`: у ветеринара й
 * лікаря — «Ліки», §8.5), деінде — «Запаси».
 */
export function suppliesTitle(state: GameState, mode: ShopMode): string {
  const at = mode === "store" ? state.trip?.destination : undefined;
  return (at === undefined ? undefined : STORE_SECTION_TITLES[at]) ?? SHOP_SECTION_TITLES.supplies;
}

/** Розділи каталогу: запаси (`suppliesTitle`) і речі. Це розділи, як відділи магазину, а не назви товарів: вони лишаються. */
function sections(state: GameState, mode: ShopMode, goods: readonly Goods[]): { title: string; goods: Goods[] }[] {
  return [
    { title: suppliesTitle(state, mode), goods: goods.filter((g) => "product" in g) },
    { title: SHOP_SECTION_TITLES.things, goods: goods.filter((g) => "thing" in g) },
  ];
}

export interface CatalogOptions {
  /** Оплатити кошик (§6.4): на місці — купити, у телефоні — замовити доставку. Отримує лише непорожні рядки й лише тоді, коли кошик можна оплатити. */
  checkout: (cart: CartLine[]) => void;
  /** На місці (§8.5): «Додому» — головна кнопка смуги, доки кошик порожній. У телефоні її немає. */
  home?: () => void;
  /**
   * Картка — перша після покупки на місці: головна кнопка з порожнім кошиком ще `BOUGHT_PAUSE_MS` — неактивна «✓ Куплено», а
   * тоді «Додому» (рецензія 2026-11-03).
   */
  bought?: boolean;
  /**
   * Кошик, що переживає оновлення картки (`goodsKey:якість` → кількість): у ветеринара послуга (огляд, лікування) оновлює картку,
   * і покладене до неї в кошик не зникає (§8.5, рішення виконавця 2026-11-03).
   */
  kept?: Map<string, number>;
}

export interface Catalog {
  /** Розділи з товарами — у тіло картки. */
  list: HTMLElement;
  /** Смуга кошика — внизу картки (`Card.bar`). */
  bar: HTMLElement;
  /**
   * Скільки карток каталогу сьогодні з біркою знижки — для примітки біля заголовка (§8.5). Рахує варіанти, а не товари: знижка
   * випадає для кожного варіанта окремо (§6.4, «Кожен товар у своїй картці»).
   */
  discounted: number;
}

const lineKey = (line: CartLine): string => `${goodsKey(line.goods)}:${line.quality}`;

/**
 * Каталог із кошиком (§6.4): товари — у `list`, смуга кошика — у `bar`. Головна кнопка смуги на місці — «Додому», доки кошик
 * порожній, і «Купити», щойно в ньому щось є (рішення автора 2026-11-03); у телефоні — «Замовити». `checkout` отримує
 * кошик, лише коли його можна оплатити: усе вміщується вдома й грошей досить.
 */
export function shopCatalog(state: GameState, mode: ShopMode, options: CatalogOptions): Catalog {
  const cart: CartLine[] = [];
  const list = element("div", "shop");
  const updaters: (() => void)[] = [];
  const kept = options.kept;
  const remember = (): void => {
    if (!kept) return;
    kept.clear();
    for (const line of cart) if (line.count > 0) kept.set(lineKey(line), line.count);
  };

  const shown = catalog(state, mode);
  let discounted = 0;
  for (const section of sections(state, mode, shown)) {
    // До першого кота речей у магазині немає (§11.3а) — і заголовка без карток теж.
    if (section.goods.length === 0) continue;
    list.append(element("p", "shop-section", section.title));
    for (const g of section.goods) {
      // Кожен варіант — своя картка (рішення автора 2026-11-03, «Кожен товар у своїй картці»): товар за товаром, спершу дешевий,
      // тоді дорогий. Нашийник — один варіант (рішення автора 2026-10-29, `GENERAL_REVIEW.md`, А17), решта — два.
      const qualities = variants(g);
      for (const quality of qualities) {
        const line: CartLine = { goods: g, quality, count: kept?.get(`${goodsKey(g)}:${quality}`) ?? 0 };
        cart.push(line);
        // Картка в один рядок: іконка товару, назва варіанта з підписом під нею, бірка й ціна, «−», кількість, «+».
        const item = element("div", "shop-item");
        // Товар з однією карткою: у двох колонках наступний товар — з нового рядка, щоб рядок лишався одним товаром (`overlay.css`).
        if (qualities.length === 1) item.classList.add("single");
        const icon = element("span", "shop-icon", iconMark(goodsIcon(g, quality)));
        const name = element("span", "shop-name");
        name.append(...nameParts(variantTitle(g, quality)));
        // Від чого товар (§6.4): малопомітна «і» біля назви, бабл — як у чипів рис кота.
        const hint = remedyHint(g, quality);
        const hints = hint === null ? null : hintBubble(item, "hint-bubble");
        if (hints && hint !== null) {
          const info = element("button", "shop-info", "i");
          info.type = "button";
          info.setAttribute("aria-label", REMEDY_LABEL);
          hints.attach(info, hint);
          name.append(" ", info);
        }
        // Підпис оновлюється з кошиком: миска в кошику знімає «немає миски без годівниці» (§9.12).
        const stock = element("span", "shop-stock");
        name.append(stock);
        // Бірка — між назвою й ціною (у двох колонках — над ціною): модифікатор випадає для кожного варіанта окремо;
        // подорожчання — нічим (рішення автора 2026-11-03).
        const cost = element("span", "shop-cost");
        const off = discount(state, g, quality, mode);
        if (off > 0) {
          cost.append(priceTag(off));
          discounted += 1;
        }
        cost.append(element("span", "shop-price", `${unitPrice(state, g, quality, mode)} ₴`));
        const minus = element("button", "button step", "−");
        const count = element("span", "shop-count", "0");
        const plus = element("button", "button step", "+");
        item.append(icon, name, cost, minus, count, plus);
        if (hints) item.append(hints.bubble);
        minus.addEventListener("click", () => {
          line.count = Math.max(0, line.count - 1);
          // Забрали миску — автогодівниця, якій вона давала місце, теж виходить з кошика (§9.12).
          fitCart(state, cart);
          update();
        });
        plus.addEventListener("click", () => {
          if (line.count < room(state, cart, g, quality)) line.count += 1;
          update();
        });
        updaters.push(() => {
          const reason = unavailable(state, g, cart);
          const text = stockText(state, g, quality, reason);
          stock.textContent = text;
          stock.style.display = text === "" ? "none" : "";
          const space = room(state, cart, g, quality);
          count.textContent = String(line.count);
          minus.disabled = line.count === 0;
          plus.disabled = line.count >= space || state.end !== null;
          // Не взяти — сіра вся картка, крім кнопок (`.shop-item.muted`, `overlay.css`), і лише тоді, коли підпис каже чому
          // (`unavailable`). Місце, яке займає інший варіант того самого товару в кошику (остання миска, переноска, п'ять іграшок
          // за раз), картки не сірить: у неї лише неактивний «+», як у картки, що в кошику вже до межі (рецензія 2026-11-03).
          item.classList.toggle("muted", reason !== null && line.count === 0);
          item.classList.toggle("chosen", line.count > 0);
        });
        list.append(item);
      }
    }
  }
  // Збережений кошик — лише те, що й досі вміщується (§6.4).
  fitCart(state, cart);

  // Смуга кошика внизу (рішення автора 2026-11-03): ліворуч «Очистити», далі суми в заглибленому віконці, праворуч головна кнопка.
  // «Очистити» — біля суми, яку очищає, і якнайдалі від «Купити»: промах повз головну кнопку не стирає кошика (рецензія
  // 2026-11-03).
  const bar = element("div", "shop-bar");
  const sums = element("div", "shop-sums");
  const total = element("span", "shop-total");
  const money = element("span", "shop-money", `👛 ${Math.floor(state.character.money)} ₴`);
  drawGlyphs(money);
  sums.append(total, money);
  const clear = element("button", "button shop-clear", "⌫");
  clear.title = CLEAR_CART;
  clear.setAttribute("aria-label", CLEAR_CART);
  drawGlyphs(clear);
  const verb = mode === "store" ? "Купити" : "Замовити";
  const pay = element("button", "button primary shop-pay", verb);
  bar.append(clear, sums, pay);

  const filled = (): CartLine[] => cart.filter((l) => l.count > 0);
  // Щойно купили на місці: поки не минула пауза, з порожнім кошиком головна кнопка — «✓ Куплено», а не «Додому».
  let settling = options.bought === true && options.home !== undefined;
  function update(): void {
    for (const u of updaters) u();
    remember();
    const lines = filled();
    const sum = cartTotal(state, cart, mode);
    // Ціни в каталозі — без доставки; доставка — окремо в смузі (§6.4): 10% бази й надбавка, раз на кошик. Лише з непорожнім
    // кошиком (порожній нічого не везе) і зі словом «доставка»: 🚗 у тій самій картці ще й «уже їде» (рецензія 2026-11-03).
    const delivery = mode === "delivery" && lines.length > 0 ? ` · 🚗 доставка ${cartDelivery(state, lines, mode)} ₴` : "";
    total.textContent = `🛒 ${goodsTotal(state, lines, mode)} ₴${delivery}`;
    drawGlyphs(total);
    total.classList.toggle("short", sum > state.character.money);
    // З порожнім кошиком «Очистити» немає зовсім (§6.4), а не сіра неактивна — віконце сум займає її місце.
    clear.hidden = lines.length === 0;
    payButton();
  }

  /** Головна кнопка смуги: «Додому», «Купити», «✓ Куплено» чи «Замовити». */
  function payButton(): void {
    const sum = cartTotal(state, cart, mode);
    const home = filled().length === 0 && options.home !== undefined;
    // «Додому» — лише з порожнім кошиком; з непорожнім на її місці «Купити» (рішення автора 2026-11-03). Мить після покупки —
    // неактивна «✓ Куплено» (`BOUGHT_PAUSE_MS`). На місці сума кошика — лише у віконці поруч, а не ще й на кнопці (рецензія
    // 2026-11-03): «Додому», «Купити» й «✓ Куплено» тоді майже однакові завширшки, і кнопка не стрибає. У телефоні на
    // кнопці — уся сума з доставкою, якої у віконці окремим числом немає.
    const wait = home && settling;
    const label = mode === "delivery" && sum > 0 ? `${verb} · ${sum} ₴` : verb;
    pay.textContent = wait ? BOUGHT : home ? "Додому" : label;
    pay.disabled = wait || (!home && !canCheckout(state, cart, mode));
  }

  clear.addEventListener("click", () => {
    for (const line of cart) line.count = 0;
    update();
  });
  pay.addEventListener("click", () => {
    const lines = filled();
    if (lines.length === 0) options.home?.();
    else if (canCheckout(state, cart, mode)) options.checkout(lines);
  });
  update();
  if (settling) {
    setTimeout(() => {
      settling = false;
      // Лише кнопка: картку тим часом могла перебудувати послуга, і цей (уже знятий) кошик не має переписати збережений (`kept`).
      payButton();
      // Вимкнена кнопка фокуса не тримає (`Overlay.show` фокусує головну, лише коли вона активна): коли пауза минула й фокус ніде,
      // він — на «Додому», як у щойно відкритій картці, і Enter чи пробіл везуть додому.
      if (pay.isConnected && document.activeElement === document.body) pay.focus({ preventScroll: true });
    }, BOUGHT_PAUSE_MS);
  }
  return { list, bar, discounted };
}
