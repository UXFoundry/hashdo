/**
 * Requires
 *
 * @ignore
 */
var AutoPrefixer = require('autoprefixer'),
  FS = require('fs'),
  Less = require('less'),
  Path = require('path'),
  PostCSS = require('postcss'),
  Sass = require('node-sass'),
  _ = require('lodash');

/**
 * Private
 *
 * @ignore
 */
function sass(sassFiles, callback) {
  var sassFile = sassFiles[0];

  if (sassFiles.length > 1) {
    console.warn('STYLES: More than one possible SASS file found, will take main or global.');
    sassFile = _.find(sassFiles, function (file) {
      return Path.basename(file, Path.extname(file)) === 'main' || Path.basename(file, Path.extname(file)) === 'global';
    });
  }

  if (sassFile) {
    Sass.render({file: sassFile, omitSourceMapUrl: true}, function (err, result) {
      if (!err) {
        autoPrefix(result.css, callback);
      }
      else {
        console.error('STYLES: Error rendering SASS file ' + sassFile, err);
        callback && callback();
      }
    });
  }
  else {
    console.warn('STYLES: Could not find appropriate main SASS file, please rename your main stylesheet to main.scss or global.scss.');
    callback && callback();
  }
}

function less(lessFiles, callback) {
  var lessFile = lessFiles[0];

  if (lessFiles.length > 1) {
    console.warn('STYLES: More than one possible SASS file found, will take main or global.');
    lessFile = _.find(lessFiles, function (file) {
      return Path.basename(file, Path.extname(file)) === 'main' || Path.basename(file, Path.extname(file)) === 'global';
    });
  }

  if (lessFile) {    
    Less.render(FS.readFileSync(lessFile).toString(), {filename: Path.resolve(lessFile)}, function (err, result) {
      if (!err) {
        autoPrefix(result.css, callback);
      }
      else {
        console.error('STYLES: Error rendering LESS file ' + lessFile, err);
        callback && callback();
      }
    });
  }
  else {
    console.warn('STYLES: Could not find appropriate main LESS file, please rename your main stylesheet to main.less or global.less.');
    callback && callback();
  }
}

function css(styleSheets, callback) {
  var stylesConcat = '';

  // Need to guarantee order.
  _.forEach(styleSheets, function (style) {
    stylesConcat += FS.readFileSync(style).toString();
  });

  if (stylesConcat.length > 0) {
    autoPrefix(stylesConcat, callback);
  }
  else {
    callback && callback();
  }
}

function autoPrefix(css, callback) {
  PostCSS([AutoPrefixer]).process(css).then(function (result) {
    callback && callback(result.css);
  });
}

module.exports = {
  generate: function (styleLocation, callback) {
    FS.readdir(styleLocation, function (err, files) {
      var fullPath = function (file) {
        return Path.join(styleLocation, file);
      };
  
      // Look for LESS files.
      var styleFiles = _.filter(files, function (file) {
        return Path.extname(file) === '.less' && !_.startsWith(file, '_');
      });
  
      if (styleFiles.length > 0) {
        return less(_.map(styleFiles, fullPath), callback);
      }
  
      // Look for SASS files.
      styleFiles = _.filter(files, function (file) {
        return (Path.extname(file) === '.scss' || Path.extname(file) === '.sass') && !_.startsWith(file, '_');
      });
  
      if (styleFiles.length > 0) {
        return sass(_.map(styleFiles, fullPath), callback);
      }
  
      // Look for CSS files.
      styleFiles = _.filter(files, function (file) {
        return Path.extname(file) === '.css';
      });
  
      if (styleFiles.length > 0) {
        return css(_.map(styleFiles, fullPath), callback);
      }
      else {
        callback && callback();
      }
    });
  }
};

