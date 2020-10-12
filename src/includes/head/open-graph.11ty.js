const _t = require('../../utils/fluent.bundle.js');

module.exports = class {
	render(context) {

		return `
    <meta property="og:type" content="profile">
    <meta property="profile:first_name" content="${_t('first-name', context.lang)}">
    <meta property="profile:last_name" content="${_t('last-name', context.lang)}">
    <meta property="profile:username" content="${_t('name', context.lang)}">
    <meta property="profile:gender" content="male">
    <meta property="og:title" content="${_t('site-title', context.lang)}">
    <meta property="og:url" content="${context.env.URL}/">
    <meta property="og:description" content="${_t('site-description', context.lang)}">
    <meta property="og:image" content="${context.env.URL}/images/avatar-origin.png">
    <meta property="og:locale" content="${context.lang}">
		`;
	}
};


