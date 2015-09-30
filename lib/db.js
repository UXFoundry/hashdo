/**
 * Requires
 *
 * @ignore
 */
var JWT = require('jsonwebtoken'),
  Cuid = require('cuid');

/**
 * Private
 *
 * @ignore
 */
var database = {
  state: {},
  lock: {},
  apiKey: {}
};

module.exports = {
  /**
   * Establishes a persistent connection the underlying database.
   * Called during application startup.
   *
   * @method connect
   * @async
   * @param {Function} [callback]          Optional callback function to determine when the connection has completed and if it was successful.
   */
  connect: function (callback) {
    console.log('DB: Connecting to in-memory database (only use this for development).');
    
    callback && callback(null);
  },

  /**
   * Closes all connections to the database and de-registers from event handlers.
   * Called during application shutdown.
   *
   * @method disconnect
   * @async
   * @param {Function} [callback]  Optional callback function to determine when the connection has been closed.
   */
  disconnect: function (callback) {
    console.log('DB: Disconnected from the database.');
    callback && callback(null);
  },

  /**
   * Save the state object of a card to the database.
   * Using the same card key will overwrite existing data.
   *
   * @method saveCardState
   * @async
   * @param {String}   cardKey     The unique key assigned to the card, this is normally accessible from inputs.cardKey in the card handler function.
   * @param {Object}   value       JSON object of any state data that needs to be persisted to the database.
   * @param {Function} [callback]  Optional callback function to determine when the data has been saved or failed to save.
   */
  saveCardState: function (cardKey, value, callback) {
    database.state[cardKey] = { 
      value: value,
      dateTimeStamp: Date.now()
    };
    
    callback && callback(null);
  },

  /**
   * Retrieve existing card state from the database.
   *
   * @method getCardState
   * @async
   * @param {String}   cardKey         The unique key assigned to the card, this is normally accessible from inputs.cardKey in the card handler function.
   * @param {String}   legacyCardKey   The legacy key assigned to the card, this is normally accessible from inputs.legacyCardKey in the card handler function.
   * @param {Function} [callback]      Callback function to retrieve the JSON object state data.
   */
  getCardState: function (cardKey, legacyCardKey, callback) {
    if (database.state[cardKey]) {
      callback && callback(null, database.state[cardKey].value);
    }
    else {
      callback && callback(null, null);
    }
  },
  
  /**
   * Create an assign a API call key to a specific card.
   * This key will be required to decode and secure parameters.
   *
   * @method issueAPIKey
   * @async
   * @param {String}   cardKey      The unique key assigned to the card, this is normally accessible from inputs.cardKey in the card handler function.
   * @param {Function} [callback]   Callback function to retrieve the new API key.
   */
  issueAPIKey: function (cardKey, callback) {
    if (database.apiKey[cardKey]) {
      callback && callback(null, database.apiKey[cardKey].apiKey);
    }
    else {
      var newKey = Cuid();
      
      database.apiKey[cardKey] = {
        cardKey: cardKey,
        apiKey: newKey,
        dateTimeStamp: Date.now()
      };
      
      callback && callback(null, newKey);
    }
  },
  
  /**
   * Validate an API key against an existing card.
   *
   * @method validateAPIKey
   * @async
   * @param {String}   cardKey      The unique key assigned to the card, this is normally accessible from inputs.cardKey in the card handler function.
   * @param {String}   apiKey       The API key assigned to the card, this is normally accessible from inputs.token in the card handler function.
   * @param {Function} [callback]   Callback function to retrieve the boolean value of whether the API key is valid.
   */
  validateAPIKey: function (cardKey, apiKey, callback) {
    
    if (database.apiKey[cardKey] && apiKey === database.apiKey[cardKey].apiKey) {
      callback && callback(null, true);
    }
    else {
      callback && callback(null, false);
    }
  },

  /**
   * Protect any JSON payload using web token.
   *
   * @method lock
   * @async
   * @param {String}   pack                 The pack name.
   * @param {String}   card                 The card name.
   * @param {Object}   payload              JSON payload to protect. This will normally be secure card inputs and their values.
   * @param {String}   secretOrPrivateKey   Must be either the secret for HMAC algorithms, or the PEM encoded private key for RSA and ECDSA.
   * @param {Function} [callback]           Callback function to retrieve unique key required to unlock the data.
   */
  lock: function (pack, card, payload, secretOrPrivateKey, callback) {
    var key = Cuid(),
      token = JWT.sign(payload, secretOrPrivateKey || '#');

    database.lock[pack + '_' + card + '_' + key] = {
      pack: pack,
      card: card,
      key: key,
      token: token,
      dateTimeStamp: Date.now()
    };

    callback && callback(null, key);
  },

  /**
   * Decode previously protected JSON payload.
   *
   * @method unlock
   * @async
   * @param {String}   pack                 The pack name.
   * @param {String}   card                 The card name.
   * @param {String}   key                  The unique key that was returned when locking the data.
   * @param {String}   secretOrPrivateKey   Must be either the secret for HMAC algorithms, or the PEM encoded private key for RSA and ECDSA.
   * @param {Function} [callback]           Callback function to retrieve decoded JSON payload.
   */
  unlock: function (pack, card, key, secretOrPrivateKey, callback) {
    if (database.lock[pack + '_' + card + '_' + key]) {
      JWT.verify(database.lock[pack + '_' + card + '_' + key].token, secretOrPrivateKey || '#', function (err, decoded) {
        callback && callback(err, decoded);
      });
    }
    else {
      callback && callback(null, null);
    }
  }
};
