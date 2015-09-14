/**
 * Requires
 *
 * @ignore
 */
var Config = require('../config'),
  Keen = require('keen-js'),
  Client = new Keen(({projectId: Config.keenProjectId, writeKey: Config.keenWriteKey}));

  /**
   * Store new analytics data.
   *
   * @method addEvent
   * @async
   * @param {String}   key         The event key associated with this analytics data.
   * @param {Object}   [data]      Optional analytics data.
   * @param {Function} [callback]  Optional callback function to determine if the event was saved successfully.
   */
exports.addEvent = function (key, data, callback) {
  if (Client) {
    data = data || {};

    Client.addEvent(key, data, function  (err, res) {
      if (err) {
        console.error('ANALYTICS: Add Event error.', err);
      }

      callback && callback(err, res);
    });
  }
  else {
    callback && callback();
  }
};
