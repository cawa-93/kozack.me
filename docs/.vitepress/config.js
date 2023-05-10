import {defineConfig} from "vitepress";
import {themeConfig} from "./themeConfig";
import {locales} from "./locales";
import {transformHead} from "./transformHead";
import {buildEnd} from "./buildEnd";
import {iconLink} from "./link";
import {fileURLToPath} from "node:url";

export default defineConfig({
  lastUpdated: true,
  cleanUrls: 'with-subfolders',
  head: [
    iconLink()
  ],
  locales,
  themeConfig,
  transformHead,
  buildEnd,
  vite: {
    resolve: {
      alias: [
        {
          find: /^.*\/VPHero\.vue$/,
          replacement: fileURLToPath(
            new URL('./theme/components/VPHero.vue', import.meta.url)
          )
        }
      ]
    }
  }
})
