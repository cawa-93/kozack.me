import {withSlash} from "./withSlash";

/**
 *
 * @param pagePath
 * @param {import('vitepress').LocaleConfig} locales
 * @return {string}
 */
export function resolveLocaleForPath(pagePath, locales) {

  const pagePathWithSlash = withSlash(pagePath)
  for (const index in locales) {
    if (index === 'root') {
      continue
    }

    if (pagePathWithSlash.startsWith(`/${index}/`)) {
      return index
    }
  }

  return 'root'
}
