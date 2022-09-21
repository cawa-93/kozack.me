import {defineConfig} from "vitepress";
import {resolve} from "path";

import {SitemapStream} from "sitemap";
import {createWriteStream} from 'node:fs'

function languageDisplayName(code) {
  return new Intl.DisplayNames([code], {type: 'language'}).of(code)
}

const locales = {
  '/': {
    lang: 'uk',
    title: 'Олександр Козак',
    description: 'Full-stack веб розробник'
  },
  'en/': {
    lang: 'en',
    title: 'Alex Kozack',
    description: 'Full-stack web developer',
  }
}

function getAlternateForUrl(pageUrl) {
  const langPrefixesRegEx = new RegExp(`^${Object.keys(locales).join('|')}`)
  const pageLocale = pageUrl.match(langPrefixesRegEx)[0]

  return Object.entries(locales)
    .filter(([prefix]) => prefix !== pageLocale)
    .map(([prefix, {lang}]) => {
      return {
        lang,
        url: pageUrl.replace(pageLocale, prefix)
      }
    })
}

/** @type {import('vitepress').LocaleLinks} */
const localeLinks = {
  text: 'Language',
  items: [
    {link: '/', text: languageDisplayName('uk')},
    {link: '/en/', text: languageDisplayName('en')},
  ]
}

function relativePathToUrl(p) {
  return p.replace(/\/?index\.md/, '/');
}

export default defineConfig({
  lastUpdated: true,

  locales,
  themeConfig: {
    localeLinks,
    socialLinks: [
      {
        link: 'mailto:x73blk4om@relay.firefox.com',
        icon: {
          svg: '<svg aria-label="Email" role="img" viewBox="0 0 24 24" ><title>Email</title><path d="M12,15C12.81,15 13.5,14.7 14.11,14.11C14.7,13.5 15,12.81 15,12C15,11.19 14.7,10.5 14.11,9.89C13.5,9.3 12.81,9 12,9C11.19,9 10.5,9.3 9.89,9.89C9.3,10.5 9,11.19 9,12C9,12.81 9.3,13.5 9.89,14.11C10.5,14.7 11.19,15 12,15M12,2C14.75,2 17.1,3 19.05,4.95C21,6.9 22,9.25 22,12V13.45C22,14.45 21.65,15.3 21,16C20.3,16.67 19.5,17 18.5,17C17.3,17 16.31,16.5 15.56,15.5C14.56,16.5 13.38,17 12,17C10.63,17 9.45,16.5 8.46,15.54C7.5,14.55 7,13.38 7,12C7,10.63 7.5,9.45 8.46,8.46C9.45,7.5 10.63,7 12,7C13.38,7 14.55,7.5 15.54,8.46C16.5,9.45 17,10.63 17,12V13.45C17,13.86 17.16,14.22 17.46,14.53C17.76,14.84 18.11,15 18.5,15C18.92,15 19.27,14.84 19.57,14.53C19.87,14.22 20,13.86 20,13.45V12C20,9.81 19.23,7.93 17.65,6.35C16.07,4.77 14.19,4 12,4C9.81,4 7.93,4.77 6.35,6.35C4.77,7.93 4,9.81 4,12C4,14.19 4.77,16.07 6.35,17.65C7.93,19.23 9.81,20 12,20H17V22H12C9.25,22 6.9,21 4.95,19.05C3,17.1 2,14.75 2,12C2,9.25 3,6.9 4.95,4.95C6.9,3 9.25,2 12,2Z"></path></svg>'
        }
      },
      {link: 'https://github.com/cawa-93', icon: 'github'},
      {link: 'https://twitter.com/alex_kozack', icon: 'twitter'},
      {link: 'https://www.linkedin.com/in/alex-kozack', icon: 'linkedin'},
      {
        link: 'https://t.me/kozack',
        icon: {
          svg: '<svg width="1em" height="1em" preserveAspectRatio="xMidYMid meet" role="img" viewBox="0 0 24 24"><title>Telegram</title><path fill="currentColor" fill-rule="evenodd" d="M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12S5.373 0 12 0s12 5.373 12 12ZM12.43 8.859c-1.167.485-3.5 1.49-6.998 3.014c-.568.226-.866.447-.893.663c-.046.366.412.51 1.034.705c.085.027.173.054.263.084c.613.199 1.437.432 1.865.441c.389.008.823-.152 1.302-.48c3.268-2.207 4.955-3.322 5.061-3.346c.075-.017.179-.039.249.024c.07.062.063.18.056.212c-.046.193-1.84 1.862-2.77 2.726c-.29.269-.495.46-.537.504c-.094.097-.19.19-.282.279c-.57.548-.996.96.024 1.632c.49.323.882.59 1.273.856c.427.291.853.581 1.405.943c.14.092.274.187.405.28c.497.355.944.673 1.496.623c.32-.03.652-.331.82-1.23c.397-2.126 1.179-6.73 1.36-8.628a2.111 2.111 0 0 0-.02-.472a.506.506 0 0 0-.172-.325c-.143-.117-.365-.142-.465-.14c-.451.008-1.143.249-4.476 1.635Z" clip-rule="evenodd"/></svg>'
        }
      },
    ],
  },

  transformHead({head, pageData}) {
    if (!pageData.relativePath) {
      return head
    }

    const pageUrl = relativePathToUrl(pageData.relativePath)

    const toAbsolute = (url) => `https://kozack.me${url.startsWith('/') ? url : `/${url}`}`

    const canonical = [
      'link',
      {
        rel: 'canonical',
        href: toAbsolute(pageUrl),
      }
    ]

    const alternates = getAlternateForUrl(pageUrl)
      .map(({lang, url}) => [
        'link',
        {
          rel: 'alternate',
          hreflang: lang,
          href: toAbsolute(url)
        }
      ])
    return [...head, canonical, ...alternates]
  },

  buildEnd: ({outDir, pages, site,}) => {
    const dynamicRoutes = pages.map(relativePath => {

      const pageUrl = relativePathToUrl(relativePath)

      const alternates = getAlternateForUrl(pageUrl)

      return ({
        url: pageUrl,
        changefreq: 'weekly',
        links: alternates,
      });
    });

    const sitemap = new SitemapStream({hostname: 'https://kozack.me/'})
    const writeStream = createWriteStream(resolve(outDir, 'sitemap.xml'))
    sitemap.pipe(writeStream);
    dynamicRoutes.forEach((link) => sitemap.write(link))
    sitemap.end()

  }

})
