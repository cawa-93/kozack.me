import {getSitemapInstance} from "./sitemapGenerator";

/**
 *
 * @param {import('vitepress').SiteConfig} ctx
 */
export function buildEnd({outDir}) {
  getSitemapInstance(outDir).end()
}

