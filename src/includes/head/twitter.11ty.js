const _t = require('../../utils/fluent.bundle.js');

module.exports = class {
	render(context) {

		return `
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${context.env.URL}">
    <meta property="twitter:title" content="${_t('site-title', context.lang)}">
    <meta property="twitter:description" content="${_t('site-description', context.lang)}">
    <meta property="twitter:image" content="${context.env.URL}/images/avatar-origin.png">
		`;
	}
};


