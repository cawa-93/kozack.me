module.exports = function(config) {
	config.addPassthroughCopy('src/styles');
	config.addPassthroughCopy('src/images');

	config.addNunjucksAsyncFilter('qrcode', function(text, callback) {
		const QRCode = require('qrcode');
		const oxipng = require('@wasm-codecs/oxipng');

		QRCode
			.toBuffer(text.trim(), {errorCorrectionLevel: 'L'})
			.then(buffer => oxipng(buffer, {level: 3}))
			.then(buffer => callback(null, `data:image/png;base64,${buffer.toString('base64')}`));
	});

	config.addPairedShortcode('renderJS', (content, config) => {
		return '';
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
