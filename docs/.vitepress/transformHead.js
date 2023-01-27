import {alterLinks, canonicalLink} from "./link";
import {relativePathToUrl} from "./relativePathToUrl";
import {getSitemapInstance} from "./sitemapGenerator";

/**
 *
 * @param {import('vitepress').TransformContext} ctx
 */
export function transformHead({pageData, siteData, siteConfig}) {
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
    return [
      canonicalLink(pageUrl),
      ...alters
    ]
  }
}
