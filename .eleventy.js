module.exports = function(config) {
	config.addPassthroughCopy('src/favicon.ico');
	config.addPassthroughCopy('src/styles');
	config.addPassthroughCopy('src/images/**/!(*-origin*)');

	config.addWatchTarget("./src/l10n/");
	config.addWatchTarget(".env.local");

	config.addShortcode('_t', (id, locale, args) => {
		const _ = require('./src/utils/fluent.bundle.js');
		return _(id, locale, args)
	});

	return {
		templateFormats: ['njk', '11ty.js'],

		// If your site lives in a different subdirectory, change this.
		// Leading or trailing slashes are all normalized away, so don’t worry about those.

		// If you don’t have a subdirectory, use "" or "/" (they do the same thing)
		// This is only used for link URLs (it does not affect your file structure)
		// Best paired with the `url` filter: https://www.11ty.dev/docs/filters/url/

		// You can also pass this in on the command line using `--pathprefix`
		pathPrefix: '/',

		// markdownTemplateEngine: "liquid",
		htmlTemplateEngine: 'njk',
		// dataTemplateEngine: "njk",

		// These are all optional, defaults are shown:
		dir: {
			input: 'src',
			output: 'dist',
			includes: 'includes',
			layouts: 'layouts',
			data: 'data',
		},
	};
};
