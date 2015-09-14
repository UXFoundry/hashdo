var Utils = require('../lib/utils'),
  Consolidate = require('consolidate'),
  Path = require('path');

exports.get = function (req, res) {
  if (process.env.NODE_ENV === 'production') {
    Utils.respond(req, res, 404, 'Not available.');
  }
  else {
    var Card = require(Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards'), 'hashdo-' + req.params.pack, req.params.card + '.js'));
    
    Consolidate.handlebars(Path.join(process.cwd(), 'templates/handlebars/harness.hbs'),
      { packName: req.params.pack,
        cardName: req.params.card,
        card: Card
      },
      function (err, html) {
        if (!err) {
          res.status(200);
          res.send(html);
        }
        else {
          console.error('Controller-Index: Error generating test view from Handlebars file harness.hbs', err);
          res.status(500);
          res.send(err);
        }
      });
  }
};

