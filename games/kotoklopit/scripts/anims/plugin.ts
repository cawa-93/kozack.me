// Vite-плагін готових анімацій (§2.1, «Анімація»): у `vite build` модулі груп `src/view/rig/anims/<скелет>/<група>.ts`
// потрапляють у збірку з уже порахованими доріжками (`bake.ts`), тож гра на старті не виконує будівників анімацій. У dev
// і тестах групи лишаються кодом — зміну анімації видно одразу.
//
// Не вдалося порахувати чи замінити — помилка збирання: тихий відкат до коду непомітно повернув би роботу на старт гри.
//
// Цей файл Node завантажує сам (vite.config.ts імпортує його за адресою): тут лише вбудовані модулі Node, `vite` і
// `bake.ts`, а групи анімацій (код гри з імпортами без розширень) виконує Vite (`runnerImport` → `load.ts`).

import path from "node:path";

import { runnerImport, type Plugin } from "vite";

type Bake = typeof import("./bake");
type GroupData = import("./bake").GroupData;

/** `bake.ts` — за адресою файлу: Node потрібне розширення `.ts`, а tsc гри (тести імпортують плагін) його не приймає. */
const loadBake = (): Promise<Bake> => import(new URL("./bake.ts", import.meta.url).href) as Promise<Bake>;

export interface AnimsPluginOptions {
  /** Готові дані й поза збіркою (тест порівнює такі модулі з кодом). */
  always?: boolean;
}

/**
 * Готові дані й у Vitest: `KOTOKLOPIT_BAKED_ANIMS=1 npx vitest run …` проганяє будь-які тести на модулях груп, якими їх
 * бачить збірка.
 */
const FORCE_ENV = "KOTOKLOPIT_BAKED_ANIMS";

/** Модуль групи анімацій від кореня гри: `<скелет>/<група>`. */
const GROUP_FILE = /^src\/view\/rig\/anims\/([^/]+\/[^/]+)\.ts$/;

interface Loader {
  groupData(): Record<string, GroupData>;
}

export function animsPlugin(options: AnimsPluginOptions = {}): Plugin {
  const forced = (): boolean => options.always === true || Boolean(process.env[FORCE_ENV]);
  let root = process.cwd();
  let active = false;
  let loading: Promise<Record<string, GroupData>> | null = null;

  return {
    name: "kotoklopit-anims",
    // До перетворення TypeScript: заміна йде у вихідному коді групи.
    enforce: "pre",
    // Vitest бере vite.config.ts гри: тести працюють із кодом груп.
    apply: () => !process.env["VITEST"] || forced(),

    configResolved(config) {
      root = config.root;
      active = config.command === "build" || forced();
    },

    buildStart() {
      // Нове збирання (`vite build --watch`) — дані рахуються заново.
      loading = null;
    },

    transform: {
      // Лише сам модуль: адреса з параметром (`?raw`) — інший вміст.
      filter: { id: /\/src\/view\/rig\/anims\/[^/]+\/[^/]+\.ts$/ },
      async handler(code, id) {
        if (!active) return null;
        const group = GROUP_FILE.exec(path.relative(root, id).replaceAll("\\", "/"))?.[1];
        if (group === undefined) return null;
        // Усі групи рахуються раз, одним графом модулів.
        loading ??= runnerImport<Loader>(path.join(import.meta.dirname, "load.ts"), { root, logLevel: "error" }).then(({ module }) => module.groupData());
        const data = (await loading)[group];
        if (!data) throw new Error(`Готові анімації: групи «${group}» немає серед порахованих`);
        const unpack = path.join(root, "src", "view", "rig", "animpack.ts").replaceAll("\\", "/");
        const { bakeGroup } = await loadBake();
        return { code: bakeGroup(code, data, { unpack, file: group }), map: null };
      },
    },
  };
}
