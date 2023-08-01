import lume from "lume/mod.ts";
import jsx from "lume/plugins/jsx.ts";
import metas from "lume/plugins/metas.ts";
import multilanguage from "lume/plugins/multilanguage.ts";
import picture from "lume/plugins/picture.ts";
import imagick from "lume/plugins/imagick.ts";
import sitemap from "lume/plugins/sitemap.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";
import favicon from "https://raw.githubusercontent.com/lumeland/experimental-plugins/main/favicon/mod.ts";

import tailwindConfig from "./tailwind.config.js";

console.log({
  URL: Deno.env.get('URL'),
  DEPLOY_URL: Deno.env.get('DEPLOY_URL'),
  DEPLOY_PRIME_URL: Deno.env.get('DEPLOY_PRIME_URL'),
})

const site = lume({
  location: new URL(Deno.env.get('URL') || 'http://localhost:3000'),
  src: "./src",
});

site.use(jsx());
site.use(metas());
site.use(multilanguage({
  extensions: ['.png', '.tsx'],
  languages: ["en", "uk"], // Available languages
  defaultLanguage: "uk", // The default language
}));
site.use(picture());
site.use(imagick());
site.use(sitemap());
site.use(tailwindcss({ options: tailwindConfig }));
site.use(postcss());
site.use(favicon({
  input: 'images/avatar.png'
}));

export default site;
