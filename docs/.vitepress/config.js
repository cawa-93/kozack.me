import {defineConfig} from "vitepress";
import {themeConfig} from "./themeConfig";
import {locales} from "./locales";
import {transformHead} from "./transformHead";
import {buildEnd} from "./buildEnd";


export default defineConfig({
  lastUpdated: true,
  cleanUrls: 'with-subfolders',
  locales,
  themeConfig,
  transformHead,
  buildEnd,
})
