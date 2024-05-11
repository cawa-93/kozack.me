import lume from "lume/mod.ts";
import jsx from "lume/plugins/jsx.ts";
import metas from "lume/plugins/metas.ts";
import multilanguage from "lume/plugins/multilanguage.ts";
import picture from "lume/plugins/picture.ts";
import transformImages from "lume/plugins/transform_images.ts";
import sitemap from "lume/plugins/sitemap.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";
import favicon from "lume/plugins/favicon.ts";
import resolveUrls from "lume/plugins/resolve_urls.ts";
import nav from "lume/plugins/nav.ts";

import tailwindConfig from "./tailwind.config.js";

const site = lume({
  open: true,
  location: new URL( (Deno.env.get('CONTEXT') === 'production' ? Deno.env.get('URL') : Deno.env.get('DEPLOY_PRIME_URL') || Deno.env.get('URL')) || 'http://localhost:3000'),
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
site.use(transformImages());
site.use(sitemap());
site.use(tailwindcss({ options: tailwindConfig }));
site.use(postcss());
site.use(resolveUrls());
site.use(nav());
site.use(favicon({
  input: 'images/avatar.png'
}));

export default site;
