export const languages = ['uk', 'en'] as const;

export type Lang = typeof languages[number];

export const defaultLang: Lang = 'uk';

// Українська — мова за замовчуванням, тож її сторінки без префікса
export const langPrefix = (lang: Lang) => lang === defaultLang ? '' : `/${lang}`;

// Шлях сторінки без мовного префікса: /en/games/ → /games/
export const pagePath = (pathname: string, lang: Lang) => pathname.slice(langPrefix(lang).length) || '/';

// getStaticPaths для сторінок у src/pages/[...lang]: кожна сторінка існує в усіх мовах
export const getLangPaths = () => languages.map(lang => ({
    params: {lang: lang === defaultLang ? undefined : lang},
    props: {lang},
}));
