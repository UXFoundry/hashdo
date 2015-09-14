/**
 * Requires
 *
 * @ignore
 */
var Config = require('../config'),
  FS = require('fs'),
  Path = require('path'),
  Fuzzy = require('fuzzysearch'),
  _ = require('lodash');

/**
 * Variables
 *
 * @ignore
 */
var cardCount = 0,
  cardPacks = {};

/**
 * Private
 *
 * @ignore
 */
function getPackCardFiles(dir) {
  var cards = [],
    files = FS.readdirSync(dir);

  for (var i = 0; i < files.length; i++) {
    var fileName = files[i];

    if (Path.extname(fileName) === '.js') {
      cards.push(Path.basename(fileName, Path.extname(fileName)));
    }
  }

  return cards;
}


module.exports = {
  init: function () {
    var cardsDir = Path.join(process.env.CARDS_DIRECTORY || (process.cwd() + '/cards')),
      packs = _.filter(FS.readdirSync(cardsDir), function (dir) { return _.startsWith(dir, 'hashdo-'); });
      
    console.log('PACKS: Cards will be loaded from %d packs found in %s.', packs.length, cardsDir);
  
    for (var i = 0; i < packs.length; i++) {
      var isPackage = false,
        packDir = Path.join(cardsDir, packs[i]);
      
      // Check if the directory has a package.json file, otherwise ignore it, it's not a pack.
      try {
        FS.statSync(Path.join(packDir, 'package.json'));
        isPackage = true;
      }
      catch (err) {}
      
      if (isPackage) {
        var packageJson = FS.readFileSync(Path.join(packDir, 'package.json')),
          packageInfo = JSON.parse(packageJson.toString()),
          packInfo = packageInfo.pack,
          packCardsDir = Path.join(cardsDir, packs[i], packInfo.cardsDir || ''),
          packCards = getPackCardFiles(packCardsDir),
          packName = packageInfo.name.replace('hashdo-', '');
    
        if (!packInfo.hidden) {
          cardPacks[packName] = { 
            name: packInfo.friendlyName,
            cards: {}
          };
      
          for (var j = 0; j < packCards.length; j++) {
            var card = require(Path.join(packCardsDir, packCards[j])),
              cardName = packCards[j];
    
            cardPacks[packName].cards[cardName] = {
              pack: packName,
              card: cardName,
              name: card.name,
              description: card.description || '',
              icon: card.icon || Config.baseUrl + '/' + packName + '/' + cardName + '/icon.png',
              baseUrl: Config.baseUrl + '/' + packName + '/' + cardName,
              inputs: card.inputs
            };
          }
        }
      }
    }
  },
  
  count: function (filter) {
    if (cardCount > 0) {
      return cardCount;
    }
    else {
      cardCount = 0;
  
      if (filter) {
        filter = filter.toLowerCase();
  
        _.each(_.keys(cardPacks), function (packKey) {
          _.each(_.keys(cardPacks[packKey].cards), function (cardKey) {
            var card = cardPacks[packKey].cards[cardKey];
  
            filter = filter.toLowerCase();
  
            if (Fuzzy(filter, card.name.toLowerCase())) {
              cardCount = cardCount + 1;
            }
          });
        });
      }
      else {
        _.each(_.keys(cardPacks), function (packKey) {
          cardCount = cardCount + _.keys(cardPacks[packKey].cards).length;
        });
      }
  
      return cardCount;
    }
  },
  
  cards: function (filter) {
    var list = [];
  
    _.each(_.keys(cardPacks), function (packKey) {
      _.each(_.keys(cardPacks[packKey].cards), function (cardKey) {
        var card = cardPacks[packKey].cards[cardKey],
          item = {
            pack: card.pack,
            card: card.card,
            name: card.name,
            description: card.description,
            icon: card.icon
          };
  
        if (filter) {
          filter = filter.toLowerCase();
  
          if (Fuzzy(filter, card.name.toLowerCase())) {
            list.push(item);
          }
        }
        else {
          list.push(item);
        }
      });
    });
  
    // sort
    list = _.sortBy(list, 'pack card');
  
    return list;
  },
  
  card: function (pack, card) {
    if (cardPacks[pack] && cardPacks[pack].cards[card]) {
      return cardPacks[pack].cards[card];
    }
  }
};
