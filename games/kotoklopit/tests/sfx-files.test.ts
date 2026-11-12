import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { soundFile, type EncodedGroup } from "../src/audio/sfx/files";
import { GROUP_FILES, GROUPS } from "../src/audio/sfx/registry";
import { LICENSES, type Sources } from "../src/audio/sfx/sourcetypes";

const SOUNDS = path.resolve(import.meta.dirname, "../audio/sfx");
const groupDirs = existsSync(SOUNDS) ? readdirSync(SOUNDS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

describe("звуки в збірці (§2.1 «Малювання й завантаження»)", () => {
  it("кожен звук — окремим файлом, і малий теж: вбудований у код гри, він тягнувся б разом із ним до першого кадру, хоч звучить лише після дотику", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../src/audio/sfx/files.ts"), "utf8");
    const glob = /import\.meta\.glob<string>\("\/audio\/sfx\/\*\/\*\.mp3", \{ query: "([^"]+)"/.exec(source);
    expect(glob?.[1]).toBe("?no-inline");
  });
});

describe("звуки: групи, файли й ліцензії (§2.1, §11.4а)", () => {
  it("назва файлу групи — її id, і в кожної групи є тека з файлами", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(GROUP_FILES);
    for (const group of GROUPS) expect(groupDirs, group.id).toContain(group.id);
  });

  it("кожен звук групи має закодовані файли, петля — файли-петлі", () => {
    for (const group of GROUPS) {
      for (const [name, def] of Object.entries(group.sounds)) {
        expect(def.files.length, `${group.id}/${name}`).toBeGreaterThan(0);
        if (def.loop) expect(def.files.length, `${group.id}/${name}: петля — один файл`).toBe(1);
        for (const file of def.files) {
          const found = soundFile(group.id, file);
          expect(found, `${group.id}/${name}: немає файлу ${file}`).not.toBeNull();
          expect(found?.loop !== null, `${group.id}/${name}: ${file} ${def.loop ? "не закодовано петлею" : "закодовано петлею, а звук разовий"}`).toBe(!!def.loop);
        }
      }
    }
  });

  it("у теці лише описане: кожен mp3 — з рецептом і закодований, кожен файл ужито", () => {
    for (const dir of groupDirs) {
      const sources = read<Sources>(path.join(SOUNDS, dir, "sources.json"));
      const encoded = read<EncodedGroup>(path.join(SOUNDS, dir, "encoded.json"));
      const mp3 = readdirSync(path.join(SOUNDS, dir)).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)).sort();
      expect(mp3, dir).toEqual(Object.keys(sources.files).sort());
      expect(Object.keys(encoded).sort(), dir).toEqual(mp3);
      const group = GROUPS.find((g) => g.id === dir);
      const used = new Set(Object.values(group?.sounds ?? {}).flatMap((def) => def.files));
      for (const name of mp3) expect(used.has(name), `${dir}/${name} ніде не вжито`).toBe(true);
    }
  });

  it("кожен оригінал — з дозволеною ліцензією, автором, джерелом і хешем; кожен ужито", () => {
    for (const dir of groupDirs) {
      const sources = read<Sources>(path.join(SOUNDS, dir, "sources.json"));
      const used = new Set(Object.values(sources.files).map((recipe) => recipe.from));
      for (const [key, original] of Object.entries(sources.originals)) {
        const where = `${dir}/${key}`;
        expect(LICENSES, where).toContain(original.license);
        expect(original.author.trim(), where).not.toBe("");
        expect(original.author, where).not.toMatch(/невідомо/);
        expect(original.url, where).toMatch(/^https:\/\/(commons\.wikimedia\.org|archive\.org|freesound\.org)\//);
        expect(original.licenseUrl, where).toMatch(/creativecommons\.org|wikimedia|archive\.org/);
        expect(original.sha256, where).toMatch(/^[0-9a-f]{64}$/);
        expect(used.has(key), `${where} ніде не вжито`).toBe(true);
      }
    }
  });

  it("усі звуки разом — у межі: вони в git і вантажаться на старті", () => {
    let bytes = 0;
    for (const dir of groupDirs) for (const file of readdirSync(path.join(SOUNDS, dir))) if (file.endsWith(".mp3")) bytes += statSync(path.join(SOUNDS, dir, file)).size;
    expect(bytes).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
