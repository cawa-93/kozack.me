import {relativeToAbsolute} from "./relativeToAbsolute";
import {resolveLocaleForPath} from "./resolveLocaleForPath";
import {withSlash} from "./withSlash";

/**
 * Повертає налаштування для тегу <link>
 * @param {Record<string, string>} attrs
 */
export function link(attrs) {
  return [
    'link', attrs
  ]
}

export function iconLink() {
  return link({
    rel: 'apple-touch-icon',
    href: '/avatar.png'
  })
}

export function canonicalLink(url) {
  return link({
    rel: 'canonical',
    href: relativeToAbsolute(url)
  })
}

/**
 *
 * @param {string} url
 * @param {string} lang
 * @return {[string,Record<string, string>]}
 */
export function alterLink(url, lang) {
  return link({
    rel: 'alternate',
    hreflang: lang,
    href: relativeToAbsolute(url)
  })
}

/**
 *
 * @param {string} url
 * @param {import('vitepress').LocaleConfig} locales
 **/
export function alterLinks(url, locales) {
  const pageLocale = resolveLocaleForPath(url, locales)

  const alters = []

  for (const localeKey in locales) {
    if (pageLocale === localeKey) {
      continue
    }

    if (pageLocale === 'root') {
      alters.push(alterLink(
        `${locales[localeKey].lang}${withSlash(url)}`,
        locales[localeKey].lang
      ))
    } else {
      alters.push(alterLink(
        url.replace(`${locales[pageLocale].lang}/`, localeKey === 'root' ? '/' : `${locales[localeKey].lang}/`),
        locales[localeKey].lang
      ))
    }


  }

  return alters
}
