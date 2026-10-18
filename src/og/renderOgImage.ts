import {readFile} from 'node:fs/promises';
import satori from 'satori';
import sharp from 'sharp';

// Шляхи відносно кореня проєкту: під час збірки код бандлиться, тож import.meta.url тут ненадійний
const fontFile = (subset: string, weight: number) =>
    readFile(`node_modules/@fontsource/inter/files/inter-${subset}-${weight}-normal.woff2`);

// Підмножини мають різні назви: satori бере лише перший шрифт з однаковою назвою,
// а гліфи, яких немає в основному шрифті, шукає в решті завантажених
const fontsPromise = Promise.all(
    [400, 700].flatMap(weight => ['latin', 'cyrillic'].map(async subset => ({
        name: subset === 'latin' ? 'Inter' : 'Inter Cyrillic',
        data: await fontFile(subset, weight),
        weight: weight as 400 | 700,
        style: 'normal' as const,
    }))),
);

const avatarPromise = readFile('src/assets/avatar.png')
    .then(file => `data:image/png;base64,${file.toString('base64')}`);

const el = (type: string, style: Record<string, unknown>, children?: unknown, props: Record<string, unknown> = {}) =>
    ({type, props: {style, children, ...props}});

/** Картинка для og:image 1200 × 630: ім'я, професія, опис і аватар */
export async function renderOgImage({name, job, tagline}: { name: string, job: string, tagline: string }) {
    const svg = await satori(
        el('div', {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 100,
            backgroundColor: '#fff',
            fontFamily: 'Inter',
        }, [
            el('div', {display: 'flex', flexDirection: 'column', width: 620}, [
                el('div', {fontSize: 60, fontWeight: 700, lineHeight: 1.33, color: '#4cafde'}, name),
                el('div', {fontSize: 60, fontWeight: 700, lineHeight: 1.33, color: 'rgb(60, 60, 67)'}, job),
                el('div', {fontSize: 30, lineHeight: 1.33, color: '#6d6d72', marginTop: 16}, tagline),
            ]),
            el('img', {marginLeft: 60}, undefined, {src: await avatarPromise, width: 320, height: 320}),
        ]) as Parameters<typeof satori>[0],
        {width: 1200, height: 630, fonts: await fontsPromise},
    );

    return sharp(Buffer.from(svg)).png().toBuffer();
}
