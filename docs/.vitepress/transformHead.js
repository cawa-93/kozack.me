import {alterLinks, canonicalLink} from "./link";
import {relativePathToUrl} from "./relativePathToUrl";
import {getSitemapInstance} from "./sitemapGenerator";
import {relativeToAbsolute} from "./relativeToAbsolute";

/**
 *
 * @param {import('vitepress').TransformContext} ctx
 */
export function transformHead({pageData, siteData, siteConfig}) {

  /** @type import('vitepress').HeadConfig[] */
  const head = []

  head.push(['meta', { property: 'og:title', content: pageData.frontmatter.title || pageData.frontmatter.hero?.name }])
  head.push(['meta', { property: 'og:description', content: pageData.frontmatter.description || (pageData.frontmatter.hero?.text + ' ' + pageData.frontmatter.hero?.tagline) }])
  head.push(['meta', { property: 'og:image', content: relativeToAbsolute(`/og-image-${siteData.localeIndex}.png`) }])



  if (pageData.relativePath) {
    const pageUrl = relativePathToUrl(pageData.relativePath)

    const alters = alterLinks(pageUrl, siteData)

    /** Додає посилання в sitemap */
    const sitemapItem = {
      url: pageUrl,
      changefreq: 'weekly',
      links: alters.map(([, {hreflang, href}]) => ({
        lang: hreflang,
        url: href
      })),
    }

    getSitemapInstance(siteConfig.outDir).write(sitemapItem)

    /**
     * Додає канонічне посилання та посилання на відповідну сторінку іншими мовами в <head>
     */
    head.push(canonicalLink(pageUrl), ...alters)
  }


  return head
}
