var Crypto = require('crypto'),
  Base64 = require('base-64'),
  JWT = require('jsonwebtoken'),
  Cuid = require('cuid'),
  Url = require('url'),
  PackageInfo = require('../package.json'),
  _ = require('lodash');

module.exports = {
  getCacheBuster: function () {
    return (Crypto.createHash('md5').update(PackageInfo.version).digest('hex')).substring(0, 10);
  },

  generateElementId: function () {
    return Cuid();
  },

  generateKey: function () {
    return Cuid();
  },

  getVersion: function () {
    return PackageInfo.version;
  },

  getPort: function () {
    return process.env.PORT || 4000;
  },

  getLegacyCardKey: function (url) {
    return Base64.encode(JWT.sign(url, process.env.CARD_SECRET || '#'));
  },

  getCardKey: function (url) {
    var parsedUrl = Url.parse(url, true);

    // Trim trailing slashes, lower case so URL casing does not matter.
    var urlObj = {
      path: _.trimRight(parsedUrl.pathname, '/').toLowerCase(),
      query: {}
    };

    // Sort keys so parameter order does not matter.
    Object.keys(parsedUrl.query).sort().forEach(function (key) {
      if (parsedUrl.query[key]) {
        urlObj.query[key] = parsedUrl.query[key];
      }
    });

    return Base64.encode(JWT.sign(JSON.stringify(urlObj), process.env.CARD_SECRET || '#'));
  },

  respond: function (req, res, status, message, type) {
    var isJSON = false,
      contentType = req.get('content-type');

    if (contentType && contentType.indexOf('json') > -1) {
      isJSON = true;
    }

    if (!type) {
      if (status === 200) {
        type = 'success';
      }
      else {
        type = 'error';
      }
    }

    if (!isJSON) {
      if (message && message.errors) {
        var errors = [];

        for (var i = 0; i < message.errors.length; i++) {
          errors.push(message.errors[i].reason);
        }

        message = errors.join(', ');
      }

      message = message || '';

      res.status(status);
      res.send(message);
    }
    else {
      var json = {};
      json[type] = message;

      res.status(status);
      res.send(json);
    }
  }
};

