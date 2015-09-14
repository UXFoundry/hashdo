var Utils = require('../lib/utils'),
  Packs = require('../lib/packs'),
  Consolidate = require('consolidate'),
  Path = require('path'),
  _ = require('lodash');

exports = module.exports = function (req, res) {
  if (process.env.NODE_ENV === 'production') {
    Utils.respond(req, res, 422, 'Unknown card pack.');
  }
  else {
    Consolidate.handlebars(Path.join(process.cwd(), 'templates/handlebars/packs.hbs'),
      _.uniq(_.pluck(Packs.cards(), 'pack')),
      function (err, html) {
        if (!err) {
          res.status(200);
          res.send(html);
        }
        else {
          console.error('Controller-Index: Error generating packs view from Handlebars file packs.hbs', err);
          res.status(500);
          res.send(err);
        }
      });
  }
};

