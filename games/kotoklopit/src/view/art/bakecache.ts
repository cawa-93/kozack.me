// Облік запечених кадрів (крок 16, GRAPHICS_PLAN.md: «Тонування й запікання»): хто ними користується, скільки пам'яті вони
// займають і що звільнити. Чиста логіка без Phaser і DOM — її перевіряють тести в Node, а текстури створює й знищує
// `bake.ts` через `make` / `destroy`.
//
// - Кадр запікається ліниво — коли його вперше попросили (`use`), і ділиться між усіма, хто має той самий рецепт (два
//   однакові коти — одна текстура).
// - Власник — істота (кіт за id, персонаж): у кожного свій бюджет кадрів і пікселів; понад бюджет звільняються кадри, якими
//   він найдовше не користувався (LRU). Є й загальний бюджет на всіх.
// - Кадр, який зараз показує зображення (`retain` / `release`), не звільняється ніколи — навіть понад бюджет: інакше
//   на екрані лишилася б знищена текстура. Бюджет тоді тимчасово перевищено.
// - Рецепт власника змінився (тьмяна шерсть, залисини, нашийник): його кадри зі старим рецептом звільняються, щойно їх
//   ніхто не показує, — нові запікаються з новим. «Рецепт» тут — рід рецепта (`TintRecipe.family`): похідні того самого
//   вигляду (затінення дальніх частин) — той самий рід, тож скелет, що запікає ближні й дальні слоти по черзі, вигляду не
//   міняє.

/**
 * Бюджет запечених кадрів.
 *
 * Чому такі числа: кіт у кадрі — ≈ 8 різних кадрів на ракурс (тулуб, голова, вухо — одне на обидва слоти, морда, очі, рот,
 * передня й задня лапа, хвіст), тобто ≈ 16 на обидва ракурси й ще кілька станів очей і рота для виразів — ≈ 20–24. За
 * роздільності 2 (`DEFAULT_RES`) кадр кота — від ≈ 1 тис. пікселів (рот) до ≈ 16 тис. (тулуб 80 × 50 одиниць), на кота —
 * ≈ 0,1 Мпікс; персонаж (140 одиниць заввишки) — ≈ 0,15 Мпікс. Тож на власника — 32 кадри й 0,25 Мпікс (≈ 1 МБ RGBA у
 * полотні й стільки ж у відеопам'яті): із запасом на обидва ракурси й вирази, але кіт, що перебрав усі стани очей і рота,
 * не тримає їх усіх. Загалом — 6 Мпікс (≈ 24 МБ + 24 МБ): десятки котів на телефоні (§8.5) поміщаються, а понад це старі
 * кадри просто перезапікаються (кадр — частки мілісекунди).
 */
export interface BakeBudget {
  /** Найбільше кадрів на власника. */
  framesPerOwner: number;
  /** Найбільше пікселів (сума `w × h` полотен) на власника. */
  pixelsPerOwner: number;
  /** Найбільше пікселів на всіх. */
  pixelsTotal: number;
}

export const BAKE_BUDGET: BakeBudget = { framesPerOwner: 32, pixelsPerOwner: 250_000, pixelsTotal: 6_000_000 };

/** Власник за замовчуванням — для кадрів, які не належать жодній істоті (галерея). */
export const SHARED_OWNER = "shared";

interface Entry<T> {
  value: T;
  pixels: number;
  /** Рід рецепта, з яким запечено (`TintRecipe.family`, без нього — ключ рецепта). */
  recipe: string;
  owners: Set<string>;
  /** Скільки зображень показує цей кадр зараз. */
  refs: number;
  /** Коли користувалися востаннє (лічильник `use`). */
  tick: number;
}

interface Owner {
  /** Рід рецепта, яким власник користувався востаннє. */
  recipe: string | null;
  /** Його кадри в порядку давності (перший — найдавніший). */
  keys: Map<string, true>;
  pixels: number;
}

export interface BakeStats {
  /** Скільки кадрів запечено. */
  frames: number;
  /** Сума пікселів їхніх полотен. */
  pixels: number;
  /** Скільки власників. */
  owners: number;
  /** Скільки кадрів зараз показують зображення. */
  shown: number;
}

export class BakeCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly owners = new Map<string, Owner>();
  private tick = 0;
  private pixels = 0;

  constructor(
    /** Знищити запечений кадр (текстуру). */
    private readonly destroy: (key: string, value: T) => void,
    readonly budget: BakeBudget = BAKE_BUDGET,
  ) {}

  /**
   * Кадр `key` для власника: запечений раніше — той самий (і тепер він найсвіжіший у власника), інакше `make` запікає
   * новий. Потім — бюджет: власника й загальний. `recipe` — рід рецепта (`TintRecipe.family ?? key`): інший рід — власник
   * змінив вигляд, і кадри старого йому більше не потрібні.
   */
  use(owner: string, key: string, recipe: string, make: () => { value: T; pixels: number }): T {
    const who = this.owner(owner);
    if (who.recipe !== recipe) {
      if (who.recipe !== null) this.dropRecipe(owner, who, recipe);
      who.recipe = recipe;
    }
    let entry = this.entries.get(key);
    const created = !entry;
    if (!entry) {
      const made = make();
      entry = { value: made.value, pixels: made.pixels, recipe, owners: new Set(), refs: 0, tick: 0 };
      this.entries.set(key, entry);
      this.pixels += entry.pixels;
    }
    entry.tick = ++this.tick;
    const claimed = !entry.owners.has(owner);
    if (claimed) {
      entry.owners.add(owner);
      who.pixels += entry.pixels;
    } else {
      who.keys.delete(key);
    }
    who.keys.set(key, true);
    // Бюджет перевіряється лише тоді, коли щось додалося: звичайний виклик щокадру — два пошуки в Map.
    if (claimed) this.fitOwner(owner, who, key);
    if (created) this.fitTotal(key);
    return entry.value;
  }

  /** Запечений кадр, якщо є (без зміни давності). */
  peek(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }

  /** Зображення почало показувати кадр. */
  retain(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.refs++;
  }

  /** Зображення перестало показувати кадр (змінило кадр чи його знищено): непотрібний нікому кадр звільняється. */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && entry.owners.size === 0) this.free(key, entry);
  }

  /** Власника не стало (кота віддали, гра скінчилася): його кадри звільняються, щойно їх ніхто не показує. */
  dropOwner(owner: string): void {
    const who = this.owners.get(owner);
    if (!who) return;
    for (const key of [...who.keys.keys()]) this.unclaim(owner, who, key);
    this.owners.delete(owner);
  }

  /** Звільнити все: усіх власників; кадри, які ще показують, — коли перестануть. */
  dropAll(): void {
    for (const owner of [...this.owners.keys()]) this.dropOwner(owner);
  }

  /** Забути кадр, не знищуючи (його текстуру вже прибрали повз кеш): наступний `use` запече його знову. */
  forgetKey(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    for (const owner of entry.owners) {
      const who = this.owners.get(owner);
      if (who?.keys.delete(key)) who.pixels -= entry.pixels;
    }
    this.entries.delete(key);
    this.pixels -= entry.pixels;
  }

  /** Забути все одразу, нічого не знищуючи (гру знищено разом із текстурами). */
  forget(): void {
    this.entries.clear();
    this.owners.clear();
    this.pixels = 0;
  }

  stats(): BakeStats {
    let shown = 0;
    for (const entry of this.entries.values()) if (entry.refs > 0) shown++;
    return { frames: this.entries.size, pixels: this.pixels, owners: this.owners.size, shown };
  }

  /** Кадри власника в порядку давності (тести, галерея). */
  ownerKeys(owner: string): string[] {
    return [...(this.owners.get(owner)?.keys.keys() ?? [])];
  }

  private owner(owner: string): Owner {
    let who = this.owners.get(owner);
    if (!who) {
      who = { recipe: null, keys: new Map(), pixels: 0 };
      this.owners.set(owner, who);
    }
    return who;
  }

  /** Рецепт власника змінився: кадри зі старим рецептом йому більше не потрібні. */
  private dropRecipe(owner: string, who: Owner, recipe: string): void {
    for (const key of [...who.keys.keys()]) {
      if (this.entries.get(key)?.recipe !== recipe) this.unclaim(owner, who, key);
    }
  }

  /** Понад бюджет власника — найдавніші його кадри, яких зараз ніхто не показує (крім щойно потрібного `keep`). */
  private fitOwner(owner: string, who: Owner, keep: string): void {
    const { framesPerOwner, pixelsPerOwner } = this.budget;
    if (who.keys.size <= framesPerOwner && who.pixels <= pixelsPerOwner) return;
    for (const key of [...who.keys.keys()]) {
      if (who.keys.size <= framesPerOwner && who.pixels <= pixelsPerOwner) return;
      if (key === keep || (this.entries.get(key)?.refs ?? 0) > 0) continue;
      this.unclaim(owner, who, key);
    }
  }

  /** Понад загальний бюджет — найдавніші кадри всіх власників, яких зараз ніхто не показує. */
  private fitTotal(keep: string): void {
    if (this.pixels <= this.budget.pixelsTotal) return;
    const idle = [...this.entries.entries()].filter(([key, entry]) => key !== keep && entry.refs === 0).sort((a, b) => a[1].tick - b[1].tick);
    for (const [key, entry] of idle) {
      if (this.pixels <= this.budget.pixelsTotal) return;
      for (const owner of [...entry.owners]) {
        const who = this.owners.get(owner);
        if (who) {
          who.keys.delete(key);
          who.pixels -= entry.pixels;
        }
      }
      entry.owners.clear();
      this.free(key, entry);
    }
  }

  private unclaim(owner: string, who: Owner, key: string): void {
    const entry = this.entries.get(key);
    who.keys.delete(key);
    if (!entry) return;
    if (entry.owners.delete(owner)) who.pixels -= entry.pixels;
    if (entry.owners.size === 0 && entry.refs === 0) this.free(key, entry);
  }

  private free(key: string, entry: Entry<T>): void {
    if (!this.entries.delete(key)) return;
    this.pixels -= entry.pixels;
    this.destroy(key, entry.value);
  }
}
