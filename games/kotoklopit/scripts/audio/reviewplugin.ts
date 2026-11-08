// Vite-плагін сторінки звуків (`sounds.html`, `src/dev/sounds/`): у dev-сервері зберігає рішення автора щодо звуків у
// `audio/sfx/review.json` — звідти їх бере наступна правка звуків. Лише `npm run dev`: на прев'ю Netlify сервера немає, там
// сторінка тримає рішення в браузері.
//
//   GET /__sound-review               усі рішення
//   PUT /__sound-review/<група>/<звук> тіло — рішення (`Review`, `src/dev/sounds/review.ts`) чи null (прибрати)
//
// Цей файл Node завантажує сам (vite.config.ts імпортує його за адресою), тож тут лише вбудовані модулі Node і типи `vite`.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { Plugin } from "vite";

/** Адреса рішень: та сама, що в `src/dev/sounds/store.ts`. */
const ROUTE = "/__sound-review";
const KEY = /^\/([a-z]+\/[a-z0-9-]+)$/;
const DECISIONS = ["ok", "replace", "delete"];
const MAX_BODY = 64 * 1024;
const MAX_COMMENT = 4000;

interface Review {
  decision: string | null;
  variants?: string[];
  comment?: string;
  print: string;
  at: string;
}

export function soundReviewPlugin(): Plugin {
  return {
    name: "kotoklopit-sound-review",
    apply: "serve",
    configureServer(server) {
      const file = path.join(server.config.root, "audio", "sfx", "review.json");
      server.middlewares.use(ROUTE, (req, res) => {
        handle(file, req, res).catch((error: unknown) => send(res, 500, { error: String(error) }));
      });
    },
  };
}

async function handle(file: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  if (req.method === "GET" && (url === "/" || url === "")) {
    send(res, 200, read(file));
    return;
  }
  const key = KEY.exec(url)?.[1];
  if (req.method !== "PUT" || !key) {
    send(res, 404, { error: "немає такої адреси" });
    return;
  }
  const body: unknown = JSON.parse(await readBody(req));
  const reviews = read(file);
  if (body === null) delete reviews[key];
  else {
    const review = validate(body);
    if (!review) {
      send(res, 400, { error: "рішення не в тому форматі" });
      return;
    }
    reviews[key] = review;
  }
  const sorted = Object.fromEntries(Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
  send(res, 200, { ok: true });
}

function read(file: string): Record<string, Review> {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, Review>;
}

/** Лише відомі поля потрібних типів: файл читатиме людина й скрипти. */
function validate(body: unknown): Review | null {
  if (typeof body !== "object" || body === null) return null;
  const { decision, variants, comment, print, at } = body as Record<string, unknown>;
  if (decision !== null && !DECISIONS.includes(decision as string)) return null;
  if (typeof print !== "string" || typeof at !== "string") return null;
  const review: Review = { decision: decision as string | null, print, at };
  if (variants !== undefined) {
    if (!Array.isArray(variants) || !variants.every((v) => typeof v === "string")) return null;
    review.variants = variants;
  }
  if (comment !== undefined) {
    if (typeof comment !== "string" || comment.length > MAX_COMMENT) return null;
    review.comment = comment;
  }
  return review;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("завелике тіло запиту"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}
