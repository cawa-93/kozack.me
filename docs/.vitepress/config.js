import {defineConfig} from "vitepress";
import {themeConfig} from "./themeConfig";
import {locales} from "./locales";
import {transformHead} from "./transformHead";
import {buildEnd} from "./buildEnd";
import {iconLink} from "./link";


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
})
