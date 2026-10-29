// Панель розробника (§11.5): F1 чи кнопка в куті. Розділи «Час», «Персонаж», «Дім», «Події»,
// «Сценарії», приховані числа й журнал.

import { actionSpeed, glitchChance } from "../sim/body";
import { newGame } from "../sim/game";
import { isDrowsy } from "../sim/sleep";
import { formatClock, weekdayOf, WEEKDAY_NAMES, weekOf } from "../sim/time";
import type { Address, Chronotype, Difficulty, Product, Quality, Save, StatName } from "../sim/types";
import { patienceLevel, positionOf } from "../sim/work";
import type { Session } from "../session";
import { DIFFICULTY_TITLES, fill, POSITION_TITLES } from "../texts";
import { courierNow, jumpTo, rebase, setSeed, setTime, skipDays, skipToMonday, sleepNow, type TimeOfDay } from "./commands";
import { CatsSection } from "./cats";
import type { Journal } from "./journal";
import {
  applyScenario,
  deleteLocalScenario,
  FILE_SCENARIOS,
  localScenarios,
  saveLocalScenario,
  scenarioFromSave,
  scenarioId,
  type Scenario,
} from "./scenarios";
import "./panel.css";

const REFRESH_MS = 250;
const SPEEDS = [1, 5, 15, 60] as const;

type Refresh = () => void;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) if (value !== undefined) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

export class DevPanel {
  private readonly root: HTMLElement;
  private readonly refreshers: Refresh[] = [];
  /** Що оновити, коли панель відкривають (а не щокадру): поля, які гравець редагує перед дією. */
  private readonly openers: Refresh[] = [];
  private readonly hidden: HTMLElement;
  private readonly log: HTMLElement;
  private readonly scenarios: HTMLElement;
  private readonly cats: CatsSection;
  private timer: number | null = null;

  constructor(
    private readonly session: Session,
    private readonly journal: Journal,
  ) {
    this.root = el("aside", { class: "dev-panel", "aria-label": "Панель розробника" });
    this.root.hidden = true;
    this.hidden = el("pre", { class: "dev-hidden" });
    this.log = el("ol", { class: "dev-log" });
    this.scenarios = el("div", { class: "dev-scenarios" });
    this.cats = new CatsSection(session, el, (label, action) => this.button(label, action), (what) => this.changed(what, false));

    const close = el("button", { class: "dev-close", type: "button", "aria-label": "Закрити" }, "×");
    close.addEventListener("click", () => this.toggle(false));
    this.root.append(
      el("header", { class: "dev-header" }, el("strong", {}, "Режим розробки"), el("span", { class: "dev-hint" }, "F1"), close),
      this.timeSection(),
      this.characterSection(),
      this.section("Коти", this.cats.root),
      this.homeSection(),
      this.eventsSection(),
      this.scenarioSection(),
      this.section("Приховане", this.hidden),
      this.journalSection(),
    );
    document.body.append(this.root);

    const toggle = el("button", { class: "dev-toggle", type: "button", "aria-label": "Панель розробника" }, "⚙");
    toggle.addEventListener("click", () => this.toggle());
    document.body.append(toggle);
    window.addEventListener("keydown", (event) => {
      if (event.key === "F1" || (event.key === "`" && !isField(event.target))) {
        event.preventDefault();
        this.toggle();
      }
    });
    journal.onChange(() => this.renderLog());
  }

  private get save(): Save {
    return this.session.save;
  }

  toggle(open = this.root.hidden): void {
    this.root.hidden = !open;
    if (open) {
      for (const opener of this.openers) opener();
      this.cats.render();
      this.refresh();
      this.renderScenarios();
      this.renderLog();
      this.timer = window.setInterval(() => this.refresh(), REFRESH_MS);
    } else if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private refresh(): void {
    for (const refresh of this.refreshers) refresh();
    this.cats.refresh();
    this.hidden.textContent = this.hiddenNumbers();
  }

  /** Стан змінено командою: сцена показує день заново, журнал запам'ятовує дію. */
  private changed(what: string, reset = true): void {
    rebase(this.save);
    if (reset) this.session.replace(this.save);
    this.journal.add(`Режим розробки: ${what}`);
    this.refresh();
  }

  private section(title: string, ...children: Node[]): HTMLElement {
    const details = el("details", { class: "dev-section" }, el("summary", {}, title), ...children);
    details.open = true;
    return details;
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = el("button", { type: "button", class: "dev-button" }, label);
    button.addEventListener("click", action);
    return button;
  }

  /** Числове поле, що показує живе значення, поки його не редагують. */
  private number(label: string, get: () => number, set: (value: number) => void, step = 1, min?: number, max?: number): HTMLElement {
    const input = el("input", { type: "number", step: String(step), ...(min !== undefined ? { min: String(min) } : {}), ...(max !== undefined ? { max: String(max) } : {}) });
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (Number.isFinite(value)) set(value);
    });
    this.refreshers.push(() => {
      if (document.activeElement !== input) input.value = String(Math.round(get() * 100) / 100);
    });
    return el("label", { class: "dev-field" }, el("span", {}, label), input);
  }

  private select<T extends string>(label: string, options: readonly [T, string][], get: () => T, set: (value: T) => void): HTMLElement {
    const select = el("select", {}, ...options.map(([value, text]) => el("option", { value }, text)));
    select.addEventListener("change", () => set(select.value as T));
    this.refreshers.push(() => {
      if (document.activeElement !== select) select.value = get();
    });
    return el("label", { class: "dev-field" }, el("span", {}, label), select);
  }

  private timeSection(): HTMLElement {
    const state = () => this.save.current;
    let week = 1;
    let weekday = 0;
    let hour = 21;
    this.openers.push(() => {
      week = weekOf(state().day);
      weekday = weekdayOf(state().day);
    });
    const days = WEEKDAY_NAMES.map((name, i) => [String(i), name] as [string, string]);
    const jump = (time: TimeOfDay, label: string) =>
      this.button(label, () => {
        jumpTo(this.save, time);
        this.changed(`перехід — ${label.toLowerCase()}`);
      });
    const speed = el("div", { class: "dev-row" });
    const pause = el("input", { type: "checkbox" });
    pause.addEventListener("change", () => (this.session.paused = pause.checked));
    speed.append(el("label", { class: "dev-check" }, pause, "Пауза"));
    for (const value of SPEEDS) {
      const button = this.button(`×${value}`, () => (this.session.speed = value));
      this.refreshers.push(() => button.classList.toggle("active", this.session.speed === value));
      speed.append(button);
    }
    this.refreshers.push(() => (pause.checked = this.session.paused));
    const clock = el("span", { class: "dev-clock" });
    this.refreshers.push(() => (clock.textContent = `${formatClock(state().minute)} · день ${state().day}`));
    return this.section(
      "Час",
      el("div", { class: "dev-row" }, clock),
      el(
        "div",
        { class: "dev-grid" },
        this.number("Тиждень", () => week, (v) => (week = v), 1, 1, 50),
        this.select("День", days, () => String(weekday), (v) => (weekday = Number(v))),
        this.number("Година", () => hour, (v) => (hour = v), 0.25, 0, 23.75),
      ),
      el(
        "div",
        { class: "dev-row" },
        this.button("Встановити", () => {
          setTime(this.save, (week - 1) * 7 + weekday, hour);
          this.changed(`час — тиждень ${week}, ${WEEKDAY_NAMES[weekday]}, ${hour} год`);
        }),
        jump("morning", "Ранок"),
        jump("evening", "Вечір"),
        jump("night", "Ніч"),
      ),
      el(
        "div",
        { class: "dev-row" },
        this.button("Лягти спати", () => {
          sleepNow(this.save);
          this.journal.add("Режим розробки: лягти спати зараз");
        }),
        this.button("+1 день", () => {
          skipDays(this.save, 1);
          this.journal.add("Режим розробки: пропустити день");
        }),
        this.button("До понеділка", () => {
          skipToMonday(this.save);
          this.journal.add("Режим розробки: пропустити до понеділка");
        }),
      ),
      speed,
    );
  }

  private characterSection(): HTMLElement {
    const ch = () => this.save.current.character;
    const job = () => this.save.current.job;
    const stats: [StatName, string][] = [
      ["health", "Здоров'я"],
      ["satiety", "Ситість"],
      ["hygiene", "Гігієна"],
      ["sanity", "Здоровий глузд"],
    ];
    const name = el("input", { type: "text" });
    name.addEventListener("change", () => {
      ch().name = name.value.trim() || ch().name;
      this.changed(`ім'я — ${ch().name}`, false);
    });
    this.refreshers.push(() => {
      if (document.activeElement !== name) name.value = ch().name;
    });
    const address = this.select<Address>("Звертання", [["she", "вона"], ["he", "він"]], () => ch().address, (v) => {
      ch().address = v;
      this.changed(`стать — ${v}`, false);
    });
    const chronotype = this.select<Chronotype>("Хронотип", [["lark", "жайворонок"], ["owl", "сова"]], () => ch().chronotype, (v) => {
      ch().chronotype = v;
      this.changed(`хронотип — ${v}`, false);
    });
    const positions = POSITION_TITLES.map((title, i) => [String(i), fill(title, "male")] as [string, string]);
    return this.section(
      "Персонаж",
      el("div", { class: "dev-grid" }, el("label", { class: "dev-field" }, el("span", {}, "Ім'я"), name), address, chronotype),
      el(
        "div",
        { class: "dev-grid" },
        ...stats.map(([stat, label]) =>
          this.number(label, () => ch().stats[stat], (v) => {
            ch().stats[stat] = Math.max(0, Math.min(100, v));
            this.changed(`${label.toLowerCase()} — ${v}`, false);
          }, 1, 0, 100),
        ),
        this.number("Гроші", () => ch().money, (v) => {
          ch().money = Math.max(0, v);
          this.changed(`гроші — ${v}`, false);
        }),
        this.number("Сон: швидкість", () => ch().sleepSpeed, (v) => {
          ch().sleepSpeed = v;
          this.changed(`ефект сну — ${v}`, false);
        }, 0.05, -0.5, 0.1),
      ),
      el(
        "div",
        { class: "dev-grid" },
        this.select("Посада", positions, () => String(job().position), (v) => {
          job().position = Number(v);
          this.changed(`посада — ${v}`, false);
        }),
        this.number("Репутація", () => job().reputation, (v) => {
          job().reputation = Math.max(0, Math.min(100, v));
          this.changed(`репутація — ${v}`, false);
        }, 1, 0, 100),
        this.number("Терпіння", () => job().patience, (v) => {
          job().patience = Math.max(0, Math.min(100, v));
          this.changed(`терпіння — ${v}`, false);
        }, 1, 0, 100),
      ),
    );
  }

  private homeSection(): HTMLElement {
    const home = () => this.save.current.home;
    const supply = (product: Product, quality: Quality, label: string) =>
      this.number(label, () => home().supplies[product][quality], (v) => {
        home().supplies[product][quality] = Math.max(0, Math.round(v));
        if (v > 0 && !home().acquired.includes(product)) home().acquired.push(product);
        this.changed(`запаси ${product} ${quality} — ${v}`, false);
      }, 1, 0);
    return this.section(
      "Дім",
      el(
        "div",
        { class: "dev-grid" },
        supply("food", "cheap", "Їжа дешева"),
        supply("food", "premium", "Їжа дорога"),
        supply("hygiene", "cheap", "Гігієна дешева"),
        supply("hygiene", "premium", "Гігієна дорога"),
        supply("momMeal", "cheap", "Мамині судочки"),
        this.number("Борг комунальних", () => home().utilitiesDebt, (v) => {
          home().utilitiesDebt = Math.max(0, v);
          this.changed(`борг — ${v}`, false);
        }),
      ),
      el(
        "div",
        { class: "dev-row" },
        this.button("Кур'єр зараз", () => {
          courierNow(this.save.current);
          this.journal.add("Режим розробки: кур'єр зараз");
        }),
      ),
    );
  }

  private eventsSection(): HTMLElement {
    const state = () => this.save.current;
    let seed = state().seed;
    const difficulties = (Object.keys(DIFFICULTY_TITLES) as Difficulty[]).map((d) => [d, DIFFICULTY_TITLES[d]] as [Difficulty, string]);
    return this.section(
      "Події",
      el(
        "div",
        { class: "dev-grid" },
        this.select("Складність", difficulties, () => state().difficulty, (v) => {
          state().difficulty = v;
          this.changed(`складність — ${v}`, false);
        }),
        this.number("Seed", () => seed, (v) => (seed = v)),
      ),
      el(
        "div",
        { class: "dev-row" },
        this.button("Задати seed", () => {
          setSeed(this.save, seed);
          this.changed(`seed — ${seed}`, false);
        }),
      ),
    );
  }

  private scenarioSection(): HTMLElement {
    const name = el("input", { type: "text", placeholder: "Назва сценарію" });
    let address: Address = "she";
    let difficulty: Difficulty = "normal";
    return this.section(
      "Сценарії",
      this.scenarios,
      el(
        "div",
        { class: "dev-row" },
        name,
        this.button("Зберегти поточний", () => {
          const title = name.value.trim() || "Мій сценарій";
          const id = scenarioId(title);
          const scenario = scenarioFromSave(this.save, title);
          saveLocalScenario(id, scenario);
          download(`${id}.json`, JSON.stringify(scenario, null, 2));
          this.journal.add(`Режим розробки: збережено сценарій «${title}» (${id})`);
          this.renderScenarios();
        }),
      ),
      el(
        "div",
        { class: "dev-grid" },
        this.select<Address>("Нова гра: звертання", [["she", "Марта"], ["he", "Тарас"]], () => address, (v) => (address = v)),
        this.select("Складність", (Object.keys(DIFFICULTY_TITLES) as Difficulty[]).map((d) => [d, DIFFICULTY_TITLES[d]] as [Difficulty, string]), () => difficulty, (v) => (difficulty = v)),
      ),
      el(
        "div",
        { class: "dev-row" },
        this.button("Нова гра", () => {
          setScenarioParam(null);
          this.session.persistent = true;
          this.session.replace(newGame({ address, difficulty }));
          this.journal.add("Режим розробки: нова гра");
        }),
      ),
    );
  }

  private renderScenarios(): void {
    const local = localScenarios();
    const rows = [
      ...Object.entries(FILE_SCENARIOS).map(([id, s]) => this.scenarioRow(id, s, false)),
      ...Object.entries(local).map(([id, s]) => this.scenarioRow(id, s, true)),
    ];
    this.scenarios.replaceChildren(...rows);
  }

  private scenarioRow(id: string, scenario: Scenario, local: boolean): HTMLElement {
    const row = el("div", { class: "dev-scenario", title: scenario.description ?? "" });
    row.append(
      this.button(scenario.name, () => this.runScenario(id, scenario)),
      el("code", {}, local ? `${id} · браузер` : id),
    );
    if (local) {
      row.append(
        this.button("×", () => {
          deleteLocalScenario(id);
          this.renderScenarios();
        }),
      );
    }
    return row;
  }

  runScenario(id: string, scenario: Scenario): void {
    setScenarioParam(id);
    // Сценарій не переписує основне збереження гри.
    this.session.persistent = false;
    this.session.replace(applyScenario(scenario));
    this.journal.add(`Режим розробки: сценарій «${scenario.name}»`);
  }

  private journalSection(): HTMLElement {
    return this.section("Журнал", el("div", { class: "dev-row" }, this.button("Очистити", () => this.journal.clear())), this.log);
  }

  private renderLog(): void {
    if (this.root.hidden) return;
    this.log.replaceChildren(
      ...this.journal.entries.slice(0, 120).map((entry) => el("li", {}, el("time", {}, entry.stamp), " ", entry.text)),
    );
  }

  private hiddenNumbers(): string {
    const state = this.save.current;
    const { character: ch, job, home } = state;
    const round = (v: number) => Math.round(v * 100) / 100;
    return [
      `терпіння ${round(job.patience)} (${patienceLevel(state)}) · репутація ${round(job.reputation)}`,
      `посада ${job.position}: ${positionOf(state).pay}/год · летучка ${round(job.standupMinutes)} хв`,
      `швидкість ${round(actionSpeed(state))} · сон ${round(ch.sleepSpeed)} · сонливість ${isDrowsy(state) ? "так" : "ні"}`,
      `збої керування ${round(glitchChance(state) * 100)}%/хв`,
      `тіло ${round(ch.body.x)}, ${round(ch.body.y)} · ривок ${round(ch.body.dashCooldown)} хв`,
      `дія ${ch.activity ? JSON.stringify(ch.activity) : "—"}`,
      `у руках ${ch.held ? (ch.held.kind === "cat" ? `кіт ${ch.held.cat}` : ch.held.kind === "toy" ? "іграшка" : `${ch.held.kind}/${ch.held.quality}`) : "—"} · плита ${home.stove.item?.kind ?? "—"} ${round(home.stove.minutes)} хв`,
      `доставки ${home.deliveries.map((d) => `${"product" in d ? d.product : d.thing}@${formatClock(d.at % 1440)}`).join(", ") || "—"} · під дверима ${home.porch.length}`,
      `борг комунальних ${home.utilitiesDebt}`,
      `seed ${state.seed} · перегравань ${state.replays} · хвилина ${round(state.minute)}`,
      `rng умови ${state.rng.conditions} · поведінка ${state.rng.behavior}`,
    ].join("\n");
  }
}

function isField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Адреса показує поточний сценарій, щоб його можна було перезапустити оновленням сторінки. */
function setScenarioParam(id: string | null): void {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete("scenario");
  else url.searchParams.set("scenario", id);
  window.history.replaceState(null, "", url);
}

function download(filename: string, text: string): void {
  const link = el("a", { href: URL.createObjectURL(new Blob([text], { type: "application/json" })), download: filename });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
