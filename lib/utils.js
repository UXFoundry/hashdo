var Url = require('url'),
  Base64 = require('base-64'),
  JWT = require('jsonwebtoken'),
  _ = require('lodash');

var utils = {
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
  },

  /**
   * Merge the contents of two or more objects into the target object
   * @param  {Boolean} deep      If true, the merge becomes recursive (optional)
   * @param  {Object}  target    The object receiving the new properties
   * @param  {Object}  arguments One or more additional objects to merge with the first
   * @return {Object}            The target object with the new contents
   *
   * deepMerge(object, object2)             // shallow copy
   * deepMerge(true, object, object2)       // deep copy
   * deepMerge(true, true, object, object2) // deep copy + dedup arrays
   */
  deepMerge: function (target) {
    var i = 1,
      deep = false,
      dedup = false;

    if (typeof(target) === 'boolean') {
      deep = target;
      target = arguments[1] || {};
      i++;

      if (typeof(target) === 'boolean') {
        dedup = target;
        target = arguments[2] || {};
        i++;
      }
    }

    [].slice.call(arguments, i).forEach(function (obj) {
      var src, copy, isArray, clone;

      if (obj === target) {
        return;
      }

      if (deep && obj instanceof Array) {
        target = dedup ? _.uniq(target.concat(obj)) : target.concat(obj);
      }
      else {
        for (var key in obj) {
          src = target[key];
          copy = obj[key];

          if (target === copy || src === copy) {
            continue;
          }

          if ((isArray = copy instanceof Array) || deep && copy && (_.isPlainObject(copy))) {
            if (isArray) {
              clone = (src && src instanceof Array) ? src : [];
            }
            else {
              clone = (src && _.isPlainObject(src)) ? src : {};
            }

            isArray = false;

            if (dedup) {
              target[key] = utils.deepMerge(deep, dedup, clone, copy);
            }
            else {
              target[key] = utils.deepMerge(deep, clone, copy);
            }
          }
          else if (copy !== undefined) {
            target[key] = copy;
          }
        }
      }
    });

    return target;
  }
};

module.exports = utils;