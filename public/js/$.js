/* global jQuery, Zepto, card, baseUrl */

if (typeof jQuery === 'undefined' || typeof Zepto === 'undefined') {
  card.require('https://cdn.hashdo.com/js/zepto.min.js', function () {
    card.onReady && card.onReady();
  });
}
else {
  card.onReady && card.onReady();
}