/**
 * Exports
 *
 * @ignore
 */
module.exports = {
  /**
   * Store new analytics data.
   *
   * @method addEvent
   * @async
   * @param {String}   key         The event key associated with this analytics data.
   * @param {Object}   [data]      Optional analytics data.
   * @param {Function} [callback]  Optional callback function to determine if the event was saved successfully.
   */
  addEvent: function (key, data, callback) {
    console.log('ANALYTICS: Faking event for %s.', key);
    callback && callback();
  }
};
