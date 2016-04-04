/* global data */

function lload(cardId) {
  'use strict';

  var nodes = window.document.querySelectorAll('#' + cardId + ' [data-src]');

  if (nodes.length === undefined) {
    nodes = [nodes];
  }

  var i = 0,
    len = nodes.length,
    node;

  for (i; i < len; i += 1) {
    node = nodes[i];
    node[node.tagName !== 'LINK' ? 'src' : 'href'] = node.getAttribute('data-src');
    node.removeAttribute('data-src');
  }

  return nodes;
}

lload(locals.card.id);