module.exports = class {
	render(context) {
		const site = context.env.URL
		return `
    <link rel="canonical" href="${site}${ context.lang === 'en' ? '' : ('/' + context.lang) }/"/>
    <link rel="alternate" href="${site}/" hreflang="en"/>
    <link rel="alternate" href="${site}/" hreflang="x-default"/>
    <link rel="alternate" href="${site}/ru/" hreflang="ru"/>
    <link rel="alternate" href="${site}/uk/" hreflang="uk"/>
		`;
	}
};


