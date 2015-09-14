/**
 * Requires
 *
 * @ignore
 */
var JWT = require('jsonwebtoken'),
  Utils = require('./utils'),
  Mongoose = require('mongoose'),
  APIKeySchema = require('../models/apiKey').modelSchema,
  LockSchema = require('../models/lock').modelSchema,
  StateSchema = require('../models/state').modelSchema;

/**
 * Models
 *
 * @ignore
 */
var APIKey = Mongoose.model('APIKey', APIKeySchema),
  Lock = Mongoose.model('Lock', LockSchema),
  State = Mongoose.model('State', StateSchema);

/**
 * Private
 *
 * @ignore
 */
function onError(err) {
  console.error('DB: Error occurred connecting to database.', err);
}

function onDisconnect() {
  console.warn('DB: Connection lost, will retry automatically.');
}

function onReconnect() {
  console.info('DB: Reconnected successfully.');
}

var db = {

  /**
   * Establishes a persistent connection the underlying MongoDB database.
   * Called during application startup.
   *
   * @method connect
   * @async
   * @param {Function} [callback]  Optional callback function to determine when the connection has completed and if it was successful.
   */
  connect: function (callback) {
    var options = {
      server: {
        /*jshint camelcase: false */
        auto_reconnect: true,
        socketOptions: {
          keepAlive: 1
        }
      }
    };

    Mongoose.connection.on('error', onError);

    var connectionString = process.env.MONGO || 'mongodb://localhost/hashdo';
    console.log('DB: Connecting to ' + connectionString);

    Mongoose.connect(connectionString, options, function (err) {
      if (!err) {
        console.log('DB: Successfully connected to the database.');

        Mongoose.connection.on('reconnected', onReconnect);
        Mongoose.connection.on('disconnected', onDisconnect);
      }
      else {
        // Use in memory database when not in production.
        if (process.env.NODE_ENV !== 'production') {
          console.log('DB: Could not connect to database, using in-memory development version.');
          require('mockgoose')(Mongoose);
          
          // Clear the connection error since we handled it.
          err = null;
        }
      }
      
      callback && callback(err);
    });
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
    Mongoose.connection.removeListener('reconnected', onReconnect);
    Mongoose.connection.removeListener('disconnected', onDisconnect);

    Mongoose.connection.close(callback);
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
    State.findOneAndUpdate({ cardKey: cardKey }, { value: value, dateTimeStamp: Date.now() } , { upsert: true }, function (err) {
      callback && callback(err);
    });   
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
    State.load(cardKey, function (err, value) {
      if (!err) {
        // Couldn't find new key? Try the old one if it was provided.
        if (!value && legacyCardKey) {
          State.load(legacyCardKey, function (err, value) {
            callback && callback(err, value);
          });
        }
        else {
          callback && callback(null, value);
        }
      }
      else {
        callback && callback(err, null);
      }
    });
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
    APIKey.load(cardKey, function (err, key) {
      if (key) {
        callback && callback(err, key);
      }
      else {
        var newKey = Utils.generateKey(),
          apiKey = new APIKey({
            cardKey: cardKey,
            apiKey: newKey
          });

        apiKey.save(function (err) {
          callback && callback(err, newKey);
        });
      }
    });
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
    APIKey.load(cardKey, function (err, issuedAPIKey) {
      if (issuedAPIKey === apiKey) {
        callback && callback(err, true);
      }
      else {
        callback && callback(err, false);
      }
    });
  },

  /**
   * Protect any JSON payload using web token.
   *
   * @method lock
   * @async
   * @param {String}   pack         The pack name.
   * @param {String}   card         The card name.
   * @param {Object}   payload      JSON payload to protect. This will normally be secure card inputs and their values.
   * @param {Function} [callback]   Callback function to retrieve unique key required to unlock the data.
   */
  lock: function (pack, card, payload, callback) {
    var key = Utils.generateKey(),
      token = JWT.sign(payload, process.env.LOCK_KEY || '#');

    var lock = new Lock({
      pack: pack,
      card: card,
      key: key,
      token: token
    });

    lock.save(function (err) {
      callback && callback(err, key);
    });
  },

  /**
   * Decode previously protected JSON payload.
   *
   * @method unlock
   * @async
   * @param {String}   pack         The pack name.
   * @param {String}   card         The card name.
   * @param {Object}   key          The unique key that was returned when locking the data.
   * @param {Function} [callback]   Callback function to retrieve decoded JSON payload.
   */
  unlock: function (pack, card, key, callback) {
    Lock.load(pack, card, key, function (err, token) {
      if (!err && token) {
        JWT.verify(token, process.env.LOCK_KEY || '#', function (err, decoded) {
          callback && callback(err, decoded);
        });
      }
      else {
        callback && callback(err);
      }
    });
  }
};

/**
 * Exports
 *
 * @ignore
 */
module.exports = db;

