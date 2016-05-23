/**
 * Requires
 *
 * @ignore
 */
var Async = require('async'),  
  FS = require('fs'),
  Path = require('path'),
  Cuid = require('cuid'),
  Crypto = require('crypto'),
  Firebase = require('./firebase'),
  Utils = require('./utils'),
  Template = require('./template'),
  Style = require('./style'),
  Minify = require('html-minifier').minify,
  Base64 = require('base-64'),
  _ = require('lodash');

/**
 * Private
 *
 * @ignore
 */
function objectToQueryString(urlParams) {
  var queryString = '';
      
  if (urlParams) {
    Object.keys(urlParams).forEach(function (key) {
      if (queryString.length === 0) {
        queryString = '?';
      }
      else {
        queryString += '&';
      }
      
      queryString += key + '=' + encodeURIComponent(urlParams[key] || '');
    });
  }
  
  return queryString;
}

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
  var css = FS.readFileSync(Path.join(__dirname, '../public/css/cards.css'), 'utf-8'),
    publicPath = Path.join(options.directory, 'hashdo-' + options.packName.replace('hashdo-'), 'public', options.cardName);

  Style.generate(publicPath, function (output) {
    if (options.css) {
      callback && callback(css + (output || ''));
    }
    else {
      callback && callback(output || '');
    }
  });
}

function jsToString(options, callback) {
  var path = Path.join(__dirname, '../public/js/'),
    cardJS = Path.join(options.directory, 'hashdo-' + options.packName.replace('hashdo-'), 'public', options.cardName, 'main.js'),
    start = '(function () { with (this) {var card = {onReady: function () {}, require: function(e,t) {var a=document.getElementsByTagName("head")[0],d=!1,n=document.createElement("script");n.src=e,n.onload=n.onreadystatechange=function(){d||this.readyState&&"loaded"!=this.readyState&&"complete"!=this.readyState||(d=!0,t&&t());},a.appendChild(n);},requireCSS:function(u){var h=document.getElementsByTagName("head")[0], l=document.createElement("link");l.rel="stylesheet";l.type="text/css";l.href=u;l.media="all";h.appendChild(l);}}, locals = ' + JSON.stringify(options.clientLocals) + ';',
    files = [],
    end = 'if(0===document.getElementsByTagName("meta").length){var meta=document.createElement("meta");meta.name="viewport";meta.content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, minimal-ui";document.getElementsByTagName("head")[0].appendChild(meta);}}}).call({});';
  
  Async.series([
      function (cb) {
        if (options) {
          if (options.client$Support && !options.clientStateSupport && !options.clientAnalyticsSupport && !options.clientProxySupport) {
            options.js = true;
            files.push(path + '$.js');
          }

          if (options.clientStateSupport || options.clientAnalyticsSupport || options.clientProxySupport) {

            // if card has state capabilities, default js toggle on
            options.js = true;

            files.push(path + '$.js');

            if (options.clientStateSupport) {
              start += 'var baseUrl = "' + _.trimEnd(process.env.BASE_URL || '', '/') + '";';
              start += 'var firebaseUrl = "' + _.trimEnd(process.env.FIREBASE_URL || '', '/') + '";';
              files.push(path + 'state.js');
            }

            if (options.clientAnalyticsSupport) {
              files.push(path + 'analytics.js');
            }

            if (options.clientProxySupport) {
              files.push(path + 'proxy.js');
            }
          }

          if (options.js) {
            files.push(path + 'lazy.js');
            files.push(path + 'modal.js');
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
  var publicPath = Path.join(options.directory, 'hashdo-' + options.packName.replace('hashdo-'), 'public', options.cardName),
    viewModel = options.viewModel,    
    cacheBuster = (Crypto.createHash('md5').update(require('../package.json').version).digest('hex')).substring(0, 10);

  viewModel.card.css = css;
  viewModel.card.js = js;
  viewModel.card.cacheBuster = cacheBuster;

  Template.generate(publicPath, viewModel, callback);
}

/**
  * Generate the full HTML document to render a card.
  * The document will be optimized in a production environment.
  *
  * @method generateCardDocument
  * @async
  * @param {Object}   options     Rendering options object.
  *   
  *   directory: The directory where the pack and card can be found.
  *   packName: The pack name.
  *   cardName: The card name.
  *   url: the card url.
  *   title: The card's title.
  *   key: The card's unique key which is based on URL.
  *   link: The card's external link.
  *   css: Boolean to determine whether the card CSS will be included.
  *   js: Boolean to determine whether the card JavaScript will be included.
  *   clientStateSupport: Boolean to determine whether client state code needs to be included.
  *   clientProxySupport: Boolean to determin whether client proxy code needs to be included.
  *   clientAnalyticsSupport: Boolean to determine whether client analytics support JavaScript needs to be included.
  *   viewModel: JSON view data object used to render server-side template.
  *   clientLocals: JSON object with any local values that need to be accessible in client JavaScript.
  *
  * @param {Function} [callback]  Optional callback function to retrieve the fully rendered card.
  */
function generateCardDocument(options, callback) {
  var DB = require('../index').db,
    elementId = Cuid();

  // defaults
  options = _.defaultsDeep(options, {
    directory: '.',
    css: true,
    js: false,
    clientStateSupport: false,
    clientProxySupport: false,
    clientAnalyticsSupport: false,
    viewModel: {
      link: options.link,
      card: {
        id: elementId,
        name: options.cardName,
        pack: options.packName
      }
    },
    clientLocals: {
      title: options.title,
      card: {
        id: elementId,
        key: options.key,
        name: options.cardName,
        pack: options.packName,
        url: options.url
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
        if (options.clientStateSupport || options.clientAnalyticsSupport || options.clientProxySupport) {
          // generate a one-time #Do API key.
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
      callback && callback(Minify(html, {
        collapseWhitespace: true,
        removeComments: true,
        removeCommentsFromCDATA: true,
        removeAttributeQuotes: true,
        removeRedundantAttributes: true,
        removeEmptyAttributes: true,
        minifyJS: process.env.NODE_ENV === 'production',
        minifyCSS: process.env.NODE_ENV === 'production'
      }));
    }
  );
}

var card = {
  /**
    * Secure card inputs such as passwords and API keys sop they cannot be read by users.
    *
    * @method secureInputs
    * @async
    * @param {String}   packName     The pack this data belongs to.
    * @param {String}   cardName     The card this data belongs to.
    * @param {Object}   inputValues  The values that you want to be secured.
    * @param {Function} [callback]   Optional callback function to retrieve the secure token that can be used to render a card.
    */
  secureInputs: function (packName, cardName, inputValues, callback) {
    var DB = require('../index').db;
    
    // Go through the input values and base64 them if they aren't already.
    var allBase64 = true;
    _.each(_.keys(inputValues), function (key) {
      if (!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/.test(inputValues[key])) {
        allBase64 = false;
      }
    });
    
    // If not all inputs are base64, then we'll convert them for the user (backward compatibility). 
    if (!allBase64) {
      _.each(_.keys(inputValues), function (key) {
        inputValues[key] = Base64.encode(inputValues[key]);
      });
    }
    
    DB.lock(packName, cardName, inputValues, process.env.LOCK_KEY, function (err, token) {
      if (!err) {
        callback && callback(null, token);
      }
      else {
        callback && callback(err);
      }
    });
  },

  /**
   * Parses and returns a card's input collection.
   *
   * @method getInputs
   * @async
   * @param {Object}   options     Rendering options object.
   *
   *   url: The URL (including query parameters) the card can be accessed from.
   *   directory: The directory where the pack and card code can be found.
   *   packName: The pack name.
   *   cardName: The card name.
   *   inputValues: The input values necessary to render the card.
   *
   * @param {Function} [callback]  Optional callback function to retrieve the input collection.
   */
  getInputs: function (options, callback) {
    if (!options) {
      throw new Error('You must provide an options object.');
    }

    if (!options.packName) {
      throw new Error('You must provide a pack name the card belongs to.');
    }

    if (!options.cardName) {
      throw new Error('You must provide a card name of the card to render.');
    }

    options.directory = options.directory || process.cwd();
    options.inputValues = options.inputValues || {};

    var packPath = Path.join(options.directory, 'hashdo-' + options.packName.replace('hashdo-', '')),
      cardFile = Path.join(packPath, options.cardName) + '.js';

    // check for card pack
    FS.stat(packPath, function (err) {
      if (!err) {

        // check for card
        FS.stat(cardFile, function (err) {
          if (!err) {

            // Remove card from cache to ease development by reloading from disk each time.
            if (process.env.NODE_ENV !== 'production') {
              delete require.cache[require.resolve(Path.join(packPath, options.cardName))];
            }

            var Card = require(Path.join(packPath, options.cardName)),
              DB = require('../index').db;

            Async.waterfall([

                // get required params
                function (cb) {
                  // card key
                  var url = options.url.replace(/light=true/i, ''),
                    params = {
                      legacyCardKey: Utils.getLegacyCardKey(url, process.env.CARD_SECRET),
                      cardKey: Utils.getCardKey(url, process.env.CARD_SECRET)
                    };

                  // extract input values
                  _.each(_.keys(options.inputValues), function (key) {
                    params[key] = options.inputValues[key];
                  });

                  if (options.inputValues.token) {

                    // retrieve previously saved parameters. Add or replace params
                    DB.unlock(options.packName, options.cardName, options.inputValues.token, process.env.LOCK_KEY, function (err, payload) {
                      if (err) {
                        // Ignore error and just return the params.
                        cb(null, params);
                      }
                      else {
                        if (payload && _.isObject(payload)) {
                          _.each(_.keys(Card.inputs), function (key) {
                            if (payload[key]) {
                              params[key] = Base64.decode(payload[key]);
                            }
                          });
                        }

                        cb(null, params);
                      }
                    });
                  }
                  else {
                    cb(null, params);
                  }
                },

                // check for input validation errors
                function (params, cb) {
                  // validate input requirements vs what came back in params
                  var errorMessage = null;

                  _.forEach(Card.inputs, function (input, key) {
                    if (input.required && !params[key]) {
                      if (!errorMessage) {
                        errorMessage = '';
                      }
                      else {
                        errorMessage += ' | ';
                      }

                      errorMessage += 'No value provided for required input: ' + key;
                    }
                  });

                  cb(errorMessage, params);
                }
              ],

              // done - respond with params
              function (err, params) {
                if (!err) {
                  callback && callback(null, params);
                }
                else {
                  callback && callback(err.message || err);
                }
              }
            );
          }
          else {
            callback && callback('Card (' + options.cardName + ') not found within ' + options.packName);
          }
        });
      }
      else {
        // callback && callback('Card not found within ' + cardDirectory);
        callback && callback('Card pack not found (' + options.packName + ').');
      }
    });
  },
  
  /**
    * Generate the full HTML document to render a card.
    * The HTML document, scripts and CSS will be optimized in a production environment.
    *
    * @method generateCard
    * @async
    * @param {Object}   options     Rendering options object.
    *   
    *   url: The URL (including query parameters) the card can be accessed from.
    *   directory: The directory where the pack and card code can be found.
    *   packName: The pack name.
    *   cardName: The card name.
    *   inputValues: The input values necessary to render the card.
    *
    * @param {Function} [callback]  Optional callback function to retrieve the card HTML.
    */
  generateCard: function (options, callback) {
    if (!options) {
      callback && callback('You must provide an options object to render the card.');
    }
    
    if (!options.packName) {
      callback && callback('You must provide a pack name the card belongs to.');
    }
    
    if (!options.cardName) {
      callback && callback('You must provide a card name of the card to render.');
    }
    
    options.directory = options.directory || process.cwd();
    options.inputValues = options.inputValues || {};
    
    var packPath = Path.join(options.directory, 'hashdo-' + options.packName.replace('hashdo-', '')),
      cardFile = Path.join(packPath, options.cardName) + '.js';

    // check for card pack
    FS.stat(packPath, function (err) {
      if (!err) {

        // check for card
        FS.stat(cardFile, function (err) {
          if (!err) {

            // Remove card from cache to ease development by reloading from disk each time.
            if (process.env.NODE_ENV !== 'production') {
              delete require.cache[require.resolve(Path.join(packPath, options.cardName))];
            }

            var Card = require(Path.join(packPath, options.cardName)),
              DB = require('../index').db;

            Async.waterfall([

                // get required params
                function (cb) {
                  // card key
                  var url = options.url.replace(/light=true/i, ''),
                    params = {
                      legacyCardKey: Utils.getLegacyCardKey(url, process.env.CARD_SECRET),
                      cardKey: Utils.getCardKey(url, process.env.CARD_SECRET)
                    };

                  // extract input values
                  _.each(_.keys(options.inputValues), function (key) {
                    params[key] = options.inputValues[key];
                  });

                  if (options.inputValues.token) {

                    // retrieve previously saved parameters. Add or replace params
                    DB.unlock(options.packName, options.cardName, options.inputValues.token, process.env.LOCK_KEY, function (err, payload) {
                      if (err) {
                        // Ignore error and just return the params.
                        cb(null, params);
                      }
                      else {
                        if (payload && _.isObject(payload)) {
                          _.each(_.keys(Card.inputs), function (key) {
                            if (payload[key]) {
                              params[key] = Base64.decode(payload[key]);
                            }
                          });
                        }

                        cb(null, params);
                      }
                    });
                  }
                  else {
                    cb(null, params);
                  }
                },

                // check for input validation errors
                function (params, cb) {
                  // validate input requirements vs what came back in params
                  var errorMessage = null;

                  _.forEach(Card.inputs, function (input, key) {
                    if (input.required && !params[key]) {
                      if (!errorMessage) {
                        errorMessage = '';
                      }
                      else {
                        errorMessage += ' | ';
                      }

                      errorMessage += 'No value provided for required input: ' + key;
                    }
                  });

                  cb(errorMessage, params);
                },

                // load previously saved state
                function (params, cb) {
                  DB.getCardState(params.cardKey, params.legacyCardKey, function (err, state) {
                    cb(null, params, state);
                  });
                },

                // get view model data from the card
                function (params, state, cb) {
                  state = state || {};

                  if (Card.getCardData) {
                    Card.getCardData(params, state, function (err, viewModel, clientLocals) {
                      cb(err, params, state, viewModel, clientLocals);
                    });
                  }
                  else {
                    cb(null, params, state, null, null);
                  }
                },

                // save any state changes made during getCardData
                function (params, state, viewModel, clientLocals, cb) {
                  // don't save if nothing came back, just forward the call
                  if (!_.isEmpty(state)) {
                    DB.saveCardState(params.cardKey, state, function (err) {
                      cb(err, params, viewModel, clientLocals);
                    });
                  }
                  else {
                    cb(null, params, viewModel, clientLocals);
                  }
                },

                // render the options
                function (params, viewModel, clientLocals, cb) {
                  viewModel = viewModel || {};
                  clientLocals = clientLocals || {};

                  var generateOptions = {
                    directory: options.directory,
                    packName: options.packName,
                    cardName: options.cardName,
                    url: options.url,
                    key: params.cardKey,
                    title: viewModel.title || '',
                    link: viewModel.link,
                    css: params.light !== true,
                    client$Support: Card.client$Support || false,
                    clientStateSupport: Card.clientStateSupport || false,
                    clientProxySupport: Card.clientProxySupport || false,
                    clientAnalyticsSupport: Card.clientAnalyticsSupport || false,
                    viewModel: viewModel,
                    clientLocals: clientLocals
                  };

                  generateCardDocument(generateOptions, function (html) {
                    cb(null, html);
                  });
                }
              ],

              // done - respond with HTML
              function (err, html) {
                if (!err) {
                  callback && callback(null, html);
                }
                else {
                  console.error('CARD: Error rendering HashDo card ' + options.packName + '-' + options.cardName + '.', err);
                  callback && callback(err.message || err);
                }
              }
            );
          }
          else {
            callback && callback('Card (' + options.cardName + ') not found within ' + options.packName);
          }
        });
      }
      else {
        // callback && callback('Card not found within ' + cardDirectory);
        callback && callback('Card pack not found (' + options.packName + ').');
      }
    });
  },
  
  /**
    * Provides the functionality to call a card's web hook functionality and save the state.
    *
    * @method webHook
    * @async
    * @param {Object}   options     Hooking options object.
    *   
    *   directory: The directory where the pack and card code can be found.
    *   packName: The pack name.
    *   cardName: The card name.
    *   payload: The values necessary to create new card state.
    *
    * @param {Function} [callback]  Optional callback function to retrieve the card HTML.
    */
  webHook: function (options, callback) {
    if (!options) {
      throw new Error('You must provide an options object to .');
    }
    
    if (!options.packName) {
      throw new Error('You must provide a pack name the card belongs to.');
    }
    
    if (!options.cardName) {
      throw new Error('You must provide a card name of the card to render.');
    }
    
    var packPath = Path.join(options.directory, 'hashdo-' + options.packName.replace('hashdo-', '')),
      cardFile = Path.join(packPath, options.cardName) + '.js';
    
    // check for card pack
    FS.stat(packPath, function (err) {
      if (!err) {

        // check for card
        FS.stat(cardFile, function (err) {
          if (!err) {

            // Remove card from cache to ease development by reloading from disk each time.
            if (process.env.NODE_ENV !== 'production') {
              delete require.cache[require.resolve(Path.join(packPath, options.cardName))];
            }

            var Card = require(Path.join(packPath, options.cardName));

            // If this card has a web hook function then let's call it.
            if (Card.webHook) {
              var DB = require('../index').db;

              Card.webHook(options.payload, function (err, urlParams, state) {
                if (!err) {
                  if (state) {
                    var cardKey = Utils.getCardKey('/' + options.packName + '/' + options.cardName + objectToQueryString(urlParams), process.env.CARD_SECRET),
                      firebaseUrl = 'card/' + cardKey;

                    if (Card.clientStateSupport && process.env.FIREBASE_URL) {
                      Firebase.set(firebaseUrl, state);
                    }

                    DB.getCardState(cardKey, null, function (err, currentCardState) {
                      DB.saveCardState(cardKey, Utils.deepMerge(true, true, currentCardState || {}, state));
                    });
                  }
                }

                callback && callback(null);
              });
            }
            else {
              // No web hook function.
              callback && callback('Web hook not available.');
            }
          }
          else {
            callback && callback('No card found.');
          }
        });
      }
      else {
        // No card pack.
        callback && callback('Pack not found.');
      }
    });
  }
};

/**
 * Exports
 *
 * @ignore
 */
module.exports = card;

