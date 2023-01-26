import {SitemapStream} from "sitemap";
import {createWriteStream} from "node:fs";
import {resolve} from "path";
import {relativePathToUrl} from "./relativePathToUrl";
import {alterLinks} from "./link";

/**
 *
 * @param {import('vitepress').SiteConfig} ctx
 */
export function buildEnd({outDir, pages, site}) {
  const dynamicRoutes = pages.map(relativePath => {
    const pageUrl = relativePathToUrl(relativePath)
    const links = alterLinks(pageUrl, site.locales).map(([, {hreflang, href}]) => ({
      lang: hreflang,
      url: href
    }))
    return ({
      url: pageUrl,
      changefreq: 'weekly',
      links,
    });
  });

  const sitemap = new SitemapStream({hostname: 'https://kozack.me/'})
  const writeStream = createWriteStream(resolve(outDir, 'sitemap.xml'))
  sitemap.pipe(writeStream);
  dynamicRoutes.forEach((link) => sitemap.write(link))
  sitemap.end()

}

