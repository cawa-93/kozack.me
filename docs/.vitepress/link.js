import {relativeToAbsolute} from "./relativeToAbsolute";
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
 * @param {string} pageUrl
 * @param {import('vitepress').SiteData} siteData
 **/
export function alterLinks(pageUrl, siteData) {

  /** @type import('vitepress').HeadConfig[] */
  const headConfig = []

  for (const localeIndex in siteData.locales) {
    if (siteData.localeIndex === localeIndex) {
      continue
    }

    if (siteData.localeIndex === 'root') {
      headConfig.push(alterLink(
        `${siteData.locales[localeIndex].lang}${withSlash(pageUrl)}`,
        siteData.locales[localeIndex].lang
      ))
    } else {
      headConfig.push(alterLink(
        pageUrl.replace(`${siteData.lang}/`, localeIndex === 'root' ? '/' : `${siteData.locales[localeIndex].lang}/`),
        siteData.locales[localeIndex].lang
      ))
    }
  }

  return headConfig
}
