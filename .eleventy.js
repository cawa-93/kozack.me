module.exports = function(config) {
	config.addPassthroughCopy('src/styles');
	config.addPassthroughCopy('src/images');

	config.addWatchTarget("./src/l10n/");

	config.addNunjucksAsyncFilter('qrcode', function(text, path, callback) {
		const QRCode = require('qrcode');
		const oxipng = require('@wasm-codecs/oxipng');
		const {promises: fs} = require('fs');

		QRCode
			.toBuffer(text.trim(), {errorCorrectionLevel: 'L'})
			.then(buffer => oxipng(buffer, {level: 3}))
			.then(buffer =>
				fs.writeFile('./dist' + path, buffer)
					.then(() => {
						callback(null, {
							dataurl: `data:image/png;base64,${buffer.toString('base64')}`,
							url: path,
						});
					}),
			);
	});

	config.addShortcode('schema', (config) => {
		const schema = require('./src/includes/schema.11ty.js');
		return schema({config});
	});

	config.addShortcode('_t', (id, locale, args) => {
		const _ = require('./src/utils/fluent.bundle.js');
		return _(id, locale, args)
	});

	return {
		templateFormats: ['html', 'ejs', 'njk', '11ty.js'],

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
