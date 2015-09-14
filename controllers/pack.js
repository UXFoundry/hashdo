var Utils = require('../lib/utils'),
  Packs = require('../lib/packs'),
  Consolidate = require('consolidate'),
  Path = require('path'),
  _ = require('lodash');

exports = module.exports = function (req, res) {
  if (process.env.NODE_ENV === 'production') {
    Utils.respond(req, res, 422, 'Unknown card.');
  }
  else {
    var cards = _.filter(Packs.cards(), 'pack', req.params.pack);

    if (cards.length > 0) {
      Consolidate.handlebars(Path.join(process.cwd(), 'templates/handlebars/cards.hbs'),
        cards,
        function (err, html) {
          if (!err) {
            res.status(200);
            res.send(html);
          }
          else {
            console.error('Controller-Index: Error generating cards view from Handlebars file cards.hbs', err);
            res.status(500);
            res.send(err);
          }
        });
    }
    else {
      Utils.respond(req, res, 422, 'Unknown pack.');
    }
  }
};

