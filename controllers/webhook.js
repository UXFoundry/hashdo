var FS = require('fs'),
  Path = require('path'),
  DB = require('../lib/db'),
  Firebase = require('../lib/firebase'),
  Utils = require('../lib/utils');

exports.process = function (req, res) {
  var packName = req.params.pack,
    cardName = req.params.card,
    cardPack = Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards'), 'hashdo-' + packName);
  
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

  FS.stat(cardPack, function (err) {
    if (!err) {
      var Card = require(Path.join(cardPack, cardName));

      // If this card has a web hook function then let's call it.
      if (Card && Card.webHook) {
        var payload = {};
        if (req.body.payload || req.body) {
          try {
            payload = JSON.parse(req.body.payload || req.body);
          }
          catch (err) {
            console.error('WEBHOOK: Request body was not valid JSON data.', err);
          }
        }

        Card.webHook(payload, function (err, urlParams, state) {
          if (!err) {
            if (state) {
              var cardKey = Utils.getCardKey('/' + packName + '/' + cardName + objectToQueryString(urlParams)),
                firebaseUrl = 'card/' + cardKey;

              if (Card.clientStateSupport) {
                Firebase.set(firebaseUrl, state);
              }

              DB.saveCardState(cardKey, state);
            }
          }

          res.status(200);
          res.send({});
        });
      }
      else {
        // No card or web hook function.
        res.status(200);
        res.send({});
      }
    }
    else {
      // No card pack.
      res.status(200);
      res.send({});
    }
  });
};

