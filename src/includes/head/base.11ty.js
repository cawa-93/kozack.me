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
    
    <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    <link rel="apple-touch-icon" href="/images/avatar-180.jpg" type="image/jpeg">
    
    <link rel="stylesheet" href="/styles/styles.css">
    
    ${multiLang.render(context)}
    ${openGraph.render(context)}
    ${twitter.render(context)}
    ${schema.render(context)}
		`;
	}
};


