/**
 * Requires
 *
 * @ignore
 */
var Firebase = require('firebase'),
  _ = require('lodash');

/**
 * Private
 *
 * @ignore
 */
function parseUrl(url) {
  return _.trimRight(process.env.FIREBASE_URL, '/') + '/' + _.trimLeft(url);
}

  /**
   * Save a new value to Firebase.
   *
   * @method set
   * @async
   * @param {String}        url Firebase URL to save data to.
   * @param {Object|String} value Data to store in Firebase.
   */
exports.set = function (url, value) {
  var fb = new Firebase(parseUrl(url));

  if (fb) {
    fb.set(value);
  }
};

  /**
   * Remove a value from Firebase.
   *
   * @method remove
   * @async
   * @param {Strin     url         Firebase URL to remove data from.
   * @param {Function} [callback]  Optional callback when removal is complete.
   */
exports.remove = function (url, callback) {
  var fb = new Firebase(parseUrl(url));

  if (fb) {
    fb.remove(callback);
  }
};
