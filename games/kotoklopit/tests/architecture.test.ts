import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("../src/sim/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("симуляція", () => {
  it("не залежить від Phaser і DOM (§2.1)", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/from\s+["']phaser["']/);
      // Звернення до браузера (`window.`, `localStorage[`), а не слово в рядку: є риса з id "window".
      expect(source, file).not.toMatch(/\b(window|document|localStorage)\s*[.[]/);
    }
  });

  it("не використовує Math.random поза seed нової гри (§6.1)", () => {
    for (const [file, source] of Object.entries(sources)) {
      const uses = source.match(/Math\.random/g) ?? [];
      expect(uses.length, file).toBe(file.endsWith("/game.ts") ? 1 : 0);
    }
  });
});

const app = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });

describe("режим розробки", () => {
  it("підключається лише динамічно з main.ts під __DEV_TOOLS__ (§11.5)", () => {
    for (const [file, source] of Object.entries(app)) {
      if (file.includes("/src/dev/")) continue;
      const imports = source.match(/from\s+["'][^"']*\/dev(\/[^"']*)?["']|import\(["'][^"']*\/dev(\/[^"']*)?["']\)/g) ?? [];
      if (file.endsWith("/src/main.ts")) {
        expect(imports, file).toEqual(['import("./dev")']);
        expect(source).toMatch(/if \(__DEV_TOOLS__\)/);
      } else {
        expect(imports, file).toEqual([]);
      }
    }
  });
});

const pages = import.meta.glob<string>(["../index.html", "../gallery.html"], { query: "?raw", import: "default", eager: true });

describe("галерея арту (крок 16)", () => {
  it("окрема сторінка: gallery.html підключає лише src/dev/gallery/main.ts, а гра й її режим розробки галереї не імпортують", () => {
    const scripts = (html: string | undefined): string[] => [...(html ?? "").matchAll(/<script[^>]*src="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(scripts(pages["../index.html"])).toEqual(["/src/main.ts"]);
    expect(scripts(pages["../gallery.html"])).toEqual(["/src/dev/gallery/main.ts"]);
    for (const [file, source] of Object.entries(app)) {
      if (file.includes("/src/dev/gallery/")) continue;
      expect(source, file).not.toMatch(/from\s+["'][^"']*\/gallery(\/[^"']*)?["']|import\(["'][^"']*\/gallery(\/[^"']*)?["']\)/);
    }
  });

  it("у збірці — лише з режимом розробки: є на прев'ю Netlify, немає в продакшні", async () => {
    const { default: config } = await import("../vite.config");
    const build = (context: string | undefined): { input: string[]; dev: unknown } => {
      const saved = process.env["CONTEXT"];
      if (context === undefined) delete process.env["CONTEXT"];
      else process.env["CONTEXT"] = context;
      try {
        const resolved = typeof config === "function" ? config({ command: "build", mode: "production" }) : config;
        if (resolved instanceof Promise) throw new Error("vite.config.ts має бути синхронним");
        const input = resolved.build?.rolldownOptions?.input;
        return { input: Object.keys(typeof input === "object" && !Array.isArray(input) ? input : {}), dev: resolved.define?.["__DEV_TOOLS__"] };
      } finally {
        if (saved === undefined) delete process.env["CONTEXT"];
        else process.env["CONTEXT"] = saved;
      }
    };
    expect(build(undefined)).toEqual({ input: ["index"], dev: "false" });
    expect(build("production")).toEqual({ input: ["index"], dev: "false" });
    expect(build("deploy-preview")).toEqual({ input: ["index", "gallery"], dev: "true" });
    expect(build("branch-deploy")).toEqual({ input: ["index", "gallery"], dev: "true" });
  });
});
