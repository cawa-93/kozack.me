const _t = require('../../utils/fluent.bundle.js');

module.exports = class {
	render(context) {
		const multiLang = new (require('./multilanguage.11ty.js'));
		const openGraph = new (require('./open-graph.11ty.js'));
		const twitter = new (require('./twitter.11ty.js'));
		const schema = new (require('./schema.11ty.js'));

		return `
    <title>${_t('site-title-with-description', context.lang)}</title>
		<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow">
    <meta name="title" content="${_t('site-title', context.lang)}">
    <meta name="description" content="${_t('site-description', context.lang)}">
    
    <link rel="icon" type="image/png" sizes="32x32" href="/images/avatar-face-32.png">
		<link rel="icon" type="image/png" sizes="16x16" href="/images/avatar-face-16.png">
		<link rel="shortcut icon" type="image/x-icon" href="/favicon.ico">
		
		<link rel="apple-touch-icon" sizes="180x180" href="/images/avatar-180.png">
    
    <link rel="stylesheet" href="/styles/styles.css">
    
    ${multiLang.render(context)}
    ${openGraph.render(context)}
    ${twitter.render(context)}
    ${schema.render(context)}
		`;
	}
};


