import lume from "lume/mod.ts";
import jsx from "lume/plugins/jsx.ts";
import metas from "lume/plugins/metas.ts";
import multilanguage from "lume/plugins/multilanguage.ts";
import picture from "lume/plugins/picture.ts";
import imagick from "lume/plugins/imagick.ts";
import sitemap from "lume/plugins/sitemap.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";

const site = lume();

site.use(jsx());
site.use(metas());
site.use(multilanguage());
site.use(picture());
site.use(imagick());
site.use(sitemap());
site.use(tailwindcss());
site.use(postcss());

export default site;
