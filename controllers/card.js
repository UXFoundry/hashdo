var Async = require('async'),
  Base64 = require('base-64'),
  FS = require('fs'),
  Path = require('path'),
  CardUtil = require('../lib/card'),
  DB = require('../lib/db'),
  Config = require('../config'),
  Utils = require('../lib/utils'),
  _ = require('lodash');

var getCard = _.memoize(function (path) {
  return require(path);
});

function getCardParams(req, packName, cardName, payloadKey, inputs, callback) {
  var params = {};

  if (inputs) {

    // populate inputs from query string or config
    _.each(_.keys(inputs), function (key) {
      if (req.query && req.query[key]) {
        params[key] = req.query[key];
      }
      else if (Config[key]) {
        params[key] = Config[key];
      }
    });
  }

  if (req.query) {

    // add any additional query string params
    _.each(_.keys(req.query), function (key) {
      if (!params[key]) {
        params[key] = req.query[key];
      }
    });
  }

  // IP address
  var ip = req.headers['x-forwarded-for'];
  if (ip) {
    // Found the client IP forwarded for a proxy, take the first one (http://stackoverflow.com/a/19524949/564726).
    params.ipAddress = ip.split(',')[0];
  }
  else {
    params.ipAddress = req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;
  }

  // card key
  var cardUrl = req.url.replace('light=true', '');

  params.legacyCardKey = Utils.getLegacyCardKey(cardUrl);
  params.cardKey = Utils.getCardKey(cardUrl);

  if (payloadKey) {

    // retrieve previously saved parameters. Add or replace params
    DB.unlock(packName, cardName, payloadKey, function (err, payload) {
      if (err) {
        callback(params);
      }
      else {
        if (payload && _.isObject(payload)) {
          _.each(_.keys(inputs), function (key) {
            if (payload[key]) {
              params[key] = Base64.decode(payload[key]);
            }
          });
        }

        callback(params);
      }
    });
  }
  else {
    callback(params);
  }
}

exports.post = function (req, res) {
  var packName = req.params.pack,
    cardName = req.params.card,
    payload = req.body;

  DB.lock(packName, cardName, payload, function (err, token) {
    if (err) {
      Utils.respond(req, res, 500, err);
    }
    else {
      Utils.respond(req, res, 200, token);
    }
  });
};

exports.get = function (req, res) {
  var packName = req.params.pack,
    cardName = req.params.card,
    payloadKey = req.query.token,
    cardPack = Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards'), 'hashdo-' + packName);

  FS.stat(cardPack, function (err) {
    if (!err) {
      // Cache card instances instead of requiring them each time.
      var Card = getCard(Path.join(cardPack, cardName));

      if (Card) {

        Async.waterfall([
            // get required params
            function (cb) {
              getCardParams(req, packName, cardName, payloadKey, Card.inputs, function (params) {

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
              });
            },

            // load and saved state
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

            // save the model data as state
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

              var options = {
                pack: packName,
                card: cardName,
                key: params.cardKey,
                title: viewModel.title || '',
                link: viewModel.link,
                css: params.light !== true,
                clientStateSupport: Card.clientStateSupport || false,
                clientAnalyticsSupport: Card.clientAnalyticsSupport || false,
                viewModel: viewModel,
                clientLocals: clientLocals
              };

              CardUtil.render(options, function (html) {
                cb(null, html);
              });
            }
          ],

          // done - respond with HTML
          function (err, html) {
            if (!err) {
              Utils.respond(req, res, 200, html);
            }
            else {
              console.error('Card-Controller: Error getting HashDo card ' + packName + '-' + cardName, err);
              Utils.respond(req, res, 500, err.message || err);
            }
          }
        );
      }
      else {
        Utils.respond(req, res, 500, 'Card not found within ' + packName);
      }
    }
    else {
      Utils.respond(req, res, 404, 'Card pack not found. (' + packName + ')');
    }
  });
};

