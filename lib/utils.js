var Url = require('url'),
  Base64 = require('base-64'),
  JWT = require('jsonwebtoken'),
  _ = require('lodash');

module.exports = {
  getCardKey: function (url, cardSecret) {
    if (!cardSecret) {
      console.warn('No card secret was provided, your token could easily be compromised. In production please set the CARD_SECRET environment variable.');
    }
    
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

    return Base64.encode(JWT.sign(JSON.stringify(urlObj), cardSecret || '#'));
  },
  
  getLegacyCardKey: function (url, cardSecret) {
    return Base64.encode(JWT.sign(url, cardSecret || '#'));
  }
};