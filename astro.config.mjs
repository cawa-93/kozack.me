import { existsSync } from 'node:fs';
import { defineConfig } from 'astro/config';

// Netlify передає адресу поточного деплою через змінні оточення
const site = (process.env.CONTEXT === 'production'
    ? process.env.URL
    : process.env.DEPLOY_PRIME_URL || process.env.URL) || 'http://localhost:4321';

// Dev-сервер Astro не віддає index.html для тек у public/, а ігри відкриваються саме так: /games/<slug>/
const publicDirIndex = {
    name: 'public-dir-index',
    configureServer(server) {
        server.middlewares.use((req, _res, next) => {
            const pathname = req.url?.split('?')[0];
            if (pathname?.endsWith('/') && existsSync(new URL(`./public${decodeURI(pathname)}index.html`, import.meta.url))) {
                req.url = req.url.replace(pathname, `${pathname}index.html`);
            }
            next();
        });
    },
};

export default defineConfig({
    site,
    vite: {
        plugins: [publicDirIndex],
    },
});
