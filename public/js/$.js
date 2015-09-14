/* global jQuery, Zepto, card */

if (typeof jQuery === 'undefined' || typeof Zepto === 'undefined') {
  card.require('http://hashdo.com/js/zepto.min.js', function () {
    card.onReady && card.onReady();
  });
}
else {
  card.onReady && card.onReady();
}