module.exports = function(config) {
	config.addPassthroughCopy('src/styles');
	config.addPassthroughCopy('src/images');

	return {
		// templateFormats: [
		// 	// "md",
		// 	// "njk",
		// 	"html",
		// 	// "liquid"
		// ],

		// If your site lives in a different subdirectory, change this.
		// Leading or trailing slashes are all normalized away, so don’t worry about those.

		// If you don’t have a subdirectory, use "" or "/" (they do the same thing)
		// This is only used for link URLs (it does not affect your file structure)
		// Best paired with the `url` filter: https://www.11ty.dev/docs/filters/url/

		// You can also pass this in on the command line using `--pathprefix`
		pathPrefix: "/",

		// markdownTemplateEngine: "liquid",
		// htmlTemplateEngine: "njk",
		// dataTemplateEngine: "njk",

		// These are all optional, defaults are shown:
		dir: {
			input: 'src',
			output: 'dist',
			includes: 'includes',
			data: 'data'
		},
	};
}
