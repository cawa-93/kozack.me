import lume from "lume/mod.ts";
import jsx from "lume/plugins/jsx.ts";
import metas from "lume/plugins/metas.ts";
import multilanguage from "lume/plugins/multilanguage.ts";
import picture from "lume/plugins/picture.ts";
import imagick from "lume/plugins/imagick.ts";
import sitemap from "lume/plugins/sitemap.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";
import resolveUrls from "lume/plugins/resolve_urls.ts";

import tailwindConfig from './tailwind.config.js'

const site = lume({
    src: './src'

});


site.use(jsx());
site.use(metas());
site.use(multilanguage({
    languages: ["en", "uk"], // Available languages
    defaultLanguage: "uk", // The default language
}));
site.use(picture());
site.use(imagick());
site.use(sitemap());
site.use(tailwindcss({options: tailwindConfig}));
site.use(postcss());
site.use(resolveUrls());

export default site;
