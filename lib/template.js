var Consolidate = require('consolidate'),
  FS = require('fs'),
  Path = require('path'),
  _ = require('lodash');

function renderJade(viewFiles, viewModel, callback) {
  var jadeFile = viewFiles[0];

  if (viewFiles.length > 1) {
    console.warn('Templates-Lib: More than one possible Jade view file found, will take main or index.');
    jadeFile = _.find(viewFiles, function (file) {
      return Path.basename(file, Path.extname(file)) === 'main' || Path.basename(file, Path.extname(file)) === 'index';
    });
  }

  if (jadeFile) {
    // Handle exports.
    viewModel.basedir = Path.join(process.cwd(), 'templates/jade/');
    
    Consolidate.jade(jadeFile, viewModel, function (err, html) {
      if (!err) {
        callback && callback(html);
      }
      else {
        console.error('Templates-Lib: Error generating view from Jade file ' + jadeFile, err);
        callback && callback();
      }
    });
  }
  else {
    console.warn('Templates-Lib: Could not find appropriate main Jade view file, please rename your main template to main.jade or index.jade.');
    callback && callback();
  }
}

function renderHandlebars(viewFiles, viewModel, callback) {
  var hbTemplatePath = Path.join(process.cwd(), 'templates/handlebars/');

  // Consolidate needs partial paths relative to the main tempalte being rendered and without the extension.
  var getRelativePartial = function (file) {
    return Path.join(Path.dirname(Path.relative(hbTemplatePath, file)), Path.basename(file, Path.extname(file)));
  };

  // Handle the various partials since there are no mixins.
  viewModel.partials = {
    card: '_card',
    header: '_header',
    content: '_content',
    footer: '_footer'
  };

  var header = _.find(viewFiles, function (file) {
    return Path.basename(file, Path.extname(file)) === 'header';
  });

  var content = _.find(viewFiles, function (file) {
    return Path.basename(file, Path.extname(file)) === 'content';
  });

  var footer = _.find(viewFiles, function (file) {
    return Path.basename(file, Path.extname(file)) === 'footer';
  });


  if (header) {
    viewModel.partials.header = getRelativePartial(header);
  }

  if (content) {
    viewModel.partials.content = getRelativePartial(content);
  }

  if (footer) {
    viewModel.partials.footer = getRelativePartial(footer);
  }

  Consolidate.handlebars(Path.join(hbTemplatePath, 'card.hbs'), viewModel, function (err, html) {
    if (!err) {
      callback && callback(html);
    }
    else {
      console.error('Templates-Lib: Error generating view from Handlebars file card.hbs', err);
      callback && callback();
    }
  });
}

function renderStaticHtml(viewFiles, callback) {
  var htmlFile = viewFiles[0];

  if (viewFiles.length > 1) {
    console.warn('Templates-Lib: More than one possible HTML view file found, will take main or index.');
    htmlFile = _.find(viewFiles, function (file) {
      return Path.basename(file, Path.extname(file)) === 'main' || Path.basename(file, Path.extname(file)) === 'index';
    });
  }

  if (htmlFile) {
    FS.readFile(htmlFile, function (err, html) {
      if (!err) {
        callback && callback(html);
      }
      else {
        console.error('Templates-Lib: Error reading HTML file ' + htmlFile, err);
        callback && callback();
      }
    });
  }
  else {
    console.warn('Templates-Lib: Could not find appropriate main HTML view file, please rename your main file to main.html or index.html.');
    callback && callback();
  }
}

module.exports = {
  generate: function (viewLocation, viewModel, callback) {
    // Pretty silly way of doing this, need a more elgant way to determine the view files.
    FS.readdir(viewLocation, function (err, files) {
      var fullPath = function (file) {
        return Path.join(viewLocation, file);
      };
  
      // Look for Jade files.
      var viewFiles = _.filter(files, function (file) {
        return Path.extname(file) === '.jade';
      });
  
      if (viewFiles.length > 0) {
        return renderJade(_.map(viewFiles, fullPath), viewModel, callback);
      }
  
      // Look for Handlebars files.
      viewFiles = _.filter(files, function (file) {
        return Path.extname(file) === '.hbs';
      });
  
      if (viewFiles.length > 0) {
        return renderHandlebars(_.map(viewFiles, fullPath), viewModel, callback);
      }
  
      // Look for HTML files.
      viewFiles = _.filter(files, function (file) {
        return Path.extname(file) === '.html' || Path.extname(file) === '.htm';
      });
  
      if (viewFiles.length > 0) {
        return renderStaticHtml(_.map(viewFiles, fullPath), viewModel, callback);
      }
      else {
        callback && callback();
      }
    });
  }
};

