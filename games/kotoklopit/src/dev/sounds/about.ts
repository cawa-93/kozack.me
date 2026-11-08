// Описи звуків для сторінки `sounds.html`: кожна група — свій файл `about/<група>.ts` з експортом `ABOUT`. Що описано, звіряє
// з групами звуків (`src/audio/sfx/groups/`) тест `tests/sounds-page.test.ts`: новий звук без опису — тест падає.

/** Назва звуку й коли він звучить у грі. */
export type SoundAbout = readonly [title: string, when: string];

export interface AboutSection {
  title: string;
  sounds: Readonly<Record<string, SoundAbout>>;
}

export interface AboutGroup {
  /** Назва групи на сторінці. */
  title: string;
  /** Розділи групи в порядку сторінки. */
  sections: readonly AboutSection[];
}

const MODULES = import.meta.glob<AboutGroup>("./about/*.ts", { import: "ABOUT", eager: true });

/** Описи за id групи (назва файлу). */
export const ABOUT: Readonly<Record<string, AboutGroup>> = Object.fromEntries(
  Object.entries(MODULES).map(([path, about]) => [path.slice("./about/".length, -".ts".length), about]),
);
