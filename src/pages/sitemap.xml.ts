import type {APIRoute} from 'astro';
import {languages, langPrefix} from '../i18n';

// Сторінки з src/pages/[...lang] — кожна з них існує в усіх мовах
const pages = Object.keys(import.meta.glob('./\\[...lang\\]/**/*.astro'))
    .map(file => file.replace('./[...lang]', '').replace(/index\.astro$/, ''))
    .sort();

export const GET: APIRoute = ({site}) => {
    const url = (lang: typeof languages[number], page: string) => new URL(langPrefix(lang) + page, site).href;

    const entries = pages.flatMap(page => languages.map(lang => [
        '  <url>',
        `    <loc>${url(lang, page)}</loc>`,
        ...languages.map(alt => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${url(alt, page)}"/>`),
        '  </url>',
    ].join('\n')));

    return new Response([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...entries,
        '</urlset>',
        '',
    ].join('\n'), {headers: {'Content-Type': 'application/xml'}});
};
