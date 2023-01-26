import {languageDisplayName} from "./languageDisplayName";

/**
 * @param {import('vitepress').LocaleConfig} locales
 */
export function localesFactory(locales) {
  /** @type {import('vitepress').LocaleConfig} */
  const resolvedLocales = {}

  for (const localeCode in locales) {
    resolvedLocales[localeCode] = locales[localeCode]

    if (!resolvedLocales[localeCode].label) {
      resolvedLocales[localeCode].label = languageDisplayName(localeCode)
    }

    if (!resolvedLocales[localeCode].lang) {
      resolvedLocales[localeCode].lang = localeCode
    }
  }

  return resolvedLocales
}
