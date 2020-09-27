module.exports = function(config) {
	config.addPassthroughCopy('src/styles');
	config.addPassthroughCopy('src/images');

	config.addNunjucksAsyncFilter('qrcode', function(text, callback) {
		const QRCode = require('qrcode')
		QRCode.toDataURL(text.trim(), {
			errorCorrectionLevel: "L",
			// version: 1
		}).then(d => {
			callback(null, d)
		})
	})

	config.addPairedShortcode('renderJS', (content, config) => {
		return eval(content)({config})
	});


	return {
		templateFormats: ['html','ejs','njk','11ty.js'],

		// If your site lives in a different subdirectory, change this.
		// Leading or trailing slashes are all normalized away, so don’t worry about those.

		// If you don’t have a subdirectory, use "" or "/" (they do the same thing)
		// This is only used for link URLs (it does not affect your file structure)
		// Best paired with the `url` filter: https://www.11ty.dev/docs/filters/url/

		// You can also pass this in on the command line using `--pathprefix`
		pathPrefix: "/",

		// markdownTemplateEngine: "liquid",
		htmlTemplateEngine: "njk",
		// dataTemplateEngine: "njk",

		// These are all optional, defaults are shown:
		dir: {
			input: 'src',
			output: 'dist',
			includes: 'includes',
			layouts: 'layouts',
			data: 'data'
		},
	};
}
