import type {APIRoute} from 'astro';
import * as siteData from '../../data/site';
import {getLangPaths, type Lang} from '../../i18n';
import {renderOgImage} from '../../og/renderOgImage';

export const getStaticPaths = getLangPaths;

export const GET: APIRoute<{ lang: Lang }> = async ({props}) => {
    const {name, job, tagline} = siteData[props.lang];

    return new Response(new Uint8Array(await renderOgImage({name, job, tagline})), {
        headers: {'Content-Type': 'image/png'},
    });
};
