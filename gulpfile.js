var gulp = require('gulp'),
  plugins = require('gulp-load-plugins')(),
  console = require('better-console');  
  
var BUILD_PATH = './build/';
var JS_LOCATIONS = [
  './controllers/*.js',
  './lib/*.js',
  './models/*.js',
  './cards/**/*.js',
  './yeoman/generator-hashdo/generators/**/index.js'
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

gulp.task('less', function () {
  gulp.src('styles/less/cards.less')
    .pipe(plugins.less({
      compress: true
    }))
    .pipe(plugins.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('public/css'));
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
gulp.task('clean', function (cb) {
  require('del').bind(null, [BUILD_PATH]);
  
  return cb();
});

// Build documentation
gulp.task('docs', function () {
  return gulp.src(JS_LOCATIONS.concat(['README.md']), {base: '.'})
    .pipe(plugins.doxx({
      title: 'HashDo',
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

// deploy
gulp.task('deploy', gulp.series('clean', 'docs', 'bump', function () {
  return gulp.src([
    'app.js',
    'config.js',
    'package.json',

    'cards/**/*.*',
    'controllers/**/*.*',
    'templates/**/*.*',
    'styles/**/*.*',
    'lib/**/*.*',
    'models/**/*.*',
    'public/**/*.*'
  ], {base: '.'})
    .pipe(gulp.dest(BUILD_PATH));
}));

gulp.task('watch', function () {
  gulp.watch(['styles/less/*.less'], gulp.series('less'));
  gulp.watch(JS_LOCATIONS, gulp.series('jshint', 'test'));
});

// Node
gulp.task('nodemon', function () {
  plugins.nodemon({
    ignore: ['public/**', 'node_modules/**', '.git/**'],
    ext: 'js',
    script: 'app.js',    
  })
    .on('restart', function () {
      console.clear();
    });
;
});

gulp.task('default', gulp.parallel('nodemon', 'watch'));