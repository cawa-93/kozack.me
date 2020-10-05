const gulp = require('gulp');

// Styles

gulp.task('styles:compress', () => {
	const postcss = require('gulp-postcss');

	return gulp.src('src/styles/styles.css')
		.pipe(postcss([
			require('postcss-import'),
			require('postcss-csso')({
				forceMediaMerge: true,
				comments: false,
			}),
		]))
		.pipe(gulp.dest('dist'));
});

gulp.task('styles:inline', () => {
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
});

gulp.task('html:compress', () => {
	const htmlmin = require('gulp-htmlmin');
	return gulp.src('dist/**/*.html')
		.pipe(htmlmin({
			removeEmptyAttributes: true,
			removeRedundantAttributes: true,
			collapseBooleanAttributes: true,
			collapseWhitespace: true,
			minifyJS: true,
			removeComments: true,
		}))
		.pipe(gulp.dest('dist'));
});

gulp.task('clean', () => {
	const del = require('del');

	return del([
		'dist/styles',
		'dist/styles.css',
		// 'dist/scripts',
		// 'dist/scripts.js'
	]);
});

gulp.task('build', gulp.series(
	'styles:compress',
	'styles:inline',
	'html:compress',
	'clean',
));
