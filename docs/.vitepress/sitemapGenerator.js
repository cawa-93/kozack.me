import {SitemapStream} from "sitemap";
import {createWriteStream} from "node:fs";
import {resolve} from "path";

let instance = null

function createInstance(outDir) {
  instance = new SitemapStream({hostname: 'https://kozack.me/'})
  const writeStream = createWriteStream(resolve(outDir, 'sitemap.xml'))
  instance.pipe(writeStream);
}

export function getSitemapInstance(outDir) {
  if (!instance) {
    createInstance(outDir)
  }

  return instance
}
