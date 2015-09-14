/**
 * Requires
 *
 * @ignore
 */
var Async = require('async'),
  DB = require('./db'),
  FS = require('fs'),
  Path = require('path'),
  Template = require('./template'),
  Style = require('./style'),
  Utils = require('./utils'),
  Minify = require('html-minifier').minify,
  Img64 = require('img64'),
  _ = require('lodash');

/**
 * Private
 *
 * @ignore
 */
function concatFiles(files) {
  if (!_.isArray(files)) {
    files = [files];
  }

  var content = '';

  _.each(files, function (file) {
    content += FS.readFileSync(file, 'utf-8') + '\n';
  });

  return content;
}

function stylesToString(options, callback) {
  var css = FS.readFileSync(Path.join(process.cwd(), 'public/css/cards.css'), 'utf-8'),
    publicPath = Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards'), 'hashdo-' + options.pack, 'public', options.card);

  Style.generate(publicPath, function (output) {
    if (options.css) {
      callback && callback(css + output);
    }
    else {
      callback && callback(output || '');
    }
  });
}

function jsToString(options, callback) {
  var path = Path.join(process.cwd(), 'public/js/'),
    cardJS = Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards'), 'hashdo-' + options.pack, 'public', options.card, 'main.js'),
    start = '(function () { with (this) {var card = {onReady: function () {}, require: function(e,t) {var a=document.getElementsByTagName("head")[0],d=!1,n=document.createElement("script");n.src=e,n.onload=n.onreadystatechange=function(){d||this.readyState&&"loaded"!=this.readyState&&"complete"!=this.readyState||(d=!0,t&&t());},a.appendChild(n);}}, locals = ' + JSON.stringify(options.clientLocals) + ';',
    files = [],
    end = 'document.title = locals.title;if(0===document.getElementsByTagName("meta").length){var meta=document.createElement("meta");meta.name="viewport",meta.content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, minimal-ui",document.getElementsByTagName("head")[0].appendChild(meta);}}}).call({});';
  
  Async.series([
      function (cb) {
        if (options) {
          if (options.$ && !options.clientStateSupport && !options.clientAnalyticsSupport) {
            files.push(path + '$.js');
          }

          if (options.lazy) {
            files.push(path + 'lazy.js');
          }

          if (options.clientStateSupport || options.clientAnalyticsSupport) {

            // if card has state capabilities, default js toggle on
            options.js = true;

            files.push(path + '$.js');

            if (options.clientStateSupport) {
              files.push(path + 'state.js');
            }

            if (options.clientAnalyticsSupport) {
              files.push(path + 'analytics.js');
            }
          }
        }

        cb();
      },

      function (cb) {
        if (options && options.js) {
          FS.stat(cardJS, function (err) {
            if (!err) {
              files.push(cardJS);
            }

            cb();
          });
        }
        else {
          cb();
        }
      }
    ],

    // done
    function () {
      var jsCode = start + concatFiles(files) + end;
      callback && callback(jsCode);
    }
  );
}

function viewToString(css, js, options, callback) {
  var publicPath = Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards'), 'hashdo-' + options.pack, 'public', options.card),
    viewModel = options.viewModel,
    cacheBuster = Utils.getCacheBuster();

  viewModel.card.css = css;
  viewModel.card.js = js;
  viewModel.card.cacheBuster = cacheBuster;

  Template.generate(publicPath, viewModel, callback);
}

var card = {

  /**
   * Generate the full HTML document to render a card.
   * The document will be optimized in a production environment.
   *
   * @method render
   * @async
   * @param {Object}   options     Rending options object.
   *   
   *   pack: The pack name.
   *   card: The card name,
   *   title: The card's title.
   *   key: The card's unique key which is based on URL.
   *   link: The card's external link.
   *   css: Boolean to determine whether the card CSS will be included.
   *   js: Boolean to determine whether the card JavaScript will be included.
   *   clientStateSupport: Boolean to determine whether client state support JavaScript needs to be included.
   *   clientAnalyticsSupport: Boolean to determine whether client analytics support JavaScript needs to be included.
   *   viewModel: JSON view data object used to render server-side template.
   *   clientLocals: JSON object with any local values that need to be accessible in client JavaScript.
   * @param {Function} [callback]  Optional callback function to retrieve the fully rendered card.
   */
  render: function (options, callback) {
    var elementId = Utils.generateElementId();

    // defaults
    options = _.defaultsDeep(options, {
      css: true,
      js: false,
      clientStateSupport: false,
      clientAnalyticsSupport: false,
      viewModel: {
        link: options.link,
        card: {
          id: elementId,
          name: options.card,
          pack: options.pack
        }
      },
      clientLocals: {
        title: options.title,
        card: {
          id: elementId,
          key: options.key,
          name: options.card,
          pack: options.pack
        }
      }
    });

    Async.waterfall([
        function (cb) {
          stylesToString(options, function (css) {
            cb(null, css);
          });
        },

        function (css, cb) {
          if (options.clientStateSupport || options.clientAnalyticsSupport) {

            // generate a one-time #Do api key.
            DB.issueAPIKey(options.key, function (err, apiKey) {
              if (apiKey) {
                options.clientLocals.card.apiKey = apiKey;
              }

              cb(null, css);
            });
          }
          else {
            cb(null, css);
          }
        },

        function (css, cb) {
          jsToString(options, function (js) {
            cb(null, css, js);
          });
        },

        function (css, js, cb) {
          viewToString(css, js, options, function (html) {
            cb(null, html || '');
          });
        }
      ],

      // done
      function (err, html) {
        // Doesn't encode CSS images, only src tags :(
        Img64.encodeImgs(html, function (err, inlinedHtml) {
          callback && callback(Minify(inlinedHtml, {
            collapseWhitespace: true,
            removeComments: true,
            removeCommentsFromCDATA: true,
            removeAttributeQuotes: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true,
            minifyJS: process.env.NODE_ENV === 'production',
            minifyCSS: process.env.NODE_ENV === 'production'
          }));
        });
      }
    );
  }
};

/**
 * Exports
 *
 * @ignore
 */
module.exports = card;

