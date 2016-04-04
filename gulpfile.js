var gulp = require('gulp'),
  plugins = require('gulp-load-plugins')();
  
var BUILD_PATH = './build/';
var JS_LOCATIONS = [
  './lib/*.js'
];
var AUTOPREFIXER_BROWSERS = [
  'last 2 versions',
  'last 5 chrome versions',
  'safari >= 5',
  'ios >= 6',
  'android >= 2',
  'ff >= 30',
  'opera >= 22',
  'ie >= 8',
  'ie_mob >= 10'
];

gulp.task('jshint', function () {
  return gulp.src(JS_LOCATIONS)
    .pipe(plugins.jshint('.jshintrc'))
    .pipe(plugins.jshint.reporter('jshint-stylish'));
});

gulp.task('less', function (done) {
  gulp.src('styles/less/cards.less')
    .pipe(plugins.less({
      compress: false
    }))
    .pipe(plugins.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('public/css'));

  done();
});

gulp.task('zepto', function () {
  return gulp.src([
    'public/js/zepto.js'
  ])
    .pipe(plugins.uglify())
    .pipe(plugins.rename({
      extname: '.min.js'
    }))
    .pipe(gulp.dest('public/js'))
});

// format JavaScript based on pretty rules
gulp.task('pretty', function () {
  return gulp.src(JS_LOCATIONS, {base: '.'})
    .pipe(plugins.jsbeautifier({ config: '.jsbeautifyrc' }))
    .pipe(gulp.dest('.'))
});

// bump version
gulp.task('bump', function () {
  return gulp.src('./package.json')
    .pipe(plugins.bump({type: 'patch'}))
    .pipe(gulp.dest('./'));
});

// del build
gulp.task('clean', function () {
  return require('del')(BUILD_PATH);
});

// Build documentation
gulp.task('docs', function () {
  return gulp.src(JS_LOCATIONS.concat(['README.md']), {base: '.'})
    .pipe(plugins.doxx({
      title: 'HashDo Framework',
      urlPrefix: ''
    }))
    .pipe(gulp.dest(BUILD_PATH + 'docs'));
});

// Run unit tests
gulp.task('test', function () {
  return gulp.src('tests/**/*.js', {read: false})
    .pipe(plugins.mocha({reporter: 'spec'}))
    .once('error', function () {
      process.exit(1);
    })
    .once('end', function () {
      process.exit();
    });;
});

gulp.task('watch', function () {
  gulp.watch(['styles/less/*.less'], gulp.series('less'));
  gulp.watch(JS_LOCATIONS, gulp.series('jshint', 'test'));
});

gulp.task('default', gulp.series('watch'));