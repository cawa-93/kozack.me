import {alterLinks, canonicalLink, iconLink} from "./link";
import {relativePathToUrl} from "./relativePathToUrl";

/**
 *
 * @param {import('vitepress').TransformContext} ctx
 */
export function transformHead({pageData, siteConfig}) {
  const headConfig = [
    iconLink()
  ]

  if (pageData.relativePath) {
    const pageUrl = relativePathToUrl(pageData.relativePath)
    headConfig.push(
      canonicalLink(pageUrl),
      ...alterLinks(pageUrl, siteConfig.site.locales)
    )
  }


  return headConfig
}
