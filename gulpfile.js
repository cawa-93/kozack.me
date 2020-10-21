const gulp = require('gulp');

// Styles

const cssCompress = () => {
	const postcss = require('gulp-postcss');

	return gulp.src('src/styles/styles.css')
		.pipe(postcss([
			require('postcss-import'),
			require('autoprefixer')(),
			require('postcss-csso')({
				forceMediaMerge: true,
				comments: false,
			}),
		]))
		.pipe(gulp.dest('dist'));
};

module.exports.cssCompress = cssCompress;

const cssInline = () => {
	const replace = require('gulp-replace');
	const fs = require('fs');

	return gulp.src('dist/**/*.html')
		.pipe(replace(
			/<link rel="stylesheet" href="\/styles\/styles.css">/, () => {
				const style = fs.readFileSync('dist/styles.css', 'utf8');
				return '<style>' + style + '</style>';
			},
		))
		.pipe(gulp.dest('dist'));
};

module.exports.cssInline = cssInline;

// HTML

const html = () => {
	const htmlMin = require('gulp-htmlmin');

	return gulp.src('dist/**/*.html')
		.pipe(htmlMin({
			removeEmptyAttributes: true,
			removeRedundantAttributes: true,
			collapseBooleanAttributes: true,
			collapseWhitespace: true,
			minifyJS: true,
			removeComments: true,
		}))
		.pipe(gulp.dest('dist'));
};
module.exports.html = html;

// Clean

const clean = () => {
	const del = require('del');

	return del([
		'dist/styles',
		'dist/styles.css',
	]);
};

module.exports.clean = clean;

// Default task

module.exports.default = gulp.series(
	cssCompress,
	cssInline,
	html,
	clean,
);

