import {localesFactory} from "./localesFactory";
import {languageDisplayName} from "./languageDisplayName";

/**
 *
 * @type {import('vitepress').LocaleConfig}
 */
export const locales = localesFactory({
  root: {
    label: languageDisplayName('uk'),
    lang: 'uk',
    title: 'Олександр Козак',
    description: 'Full-stack веброзробник',
  },
  en: {
    title: 'Alex Kozack',
    description: 'Full-stack web-developer',
  },
})
