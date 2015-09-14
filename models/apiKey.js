var Mongoose = require('mongoose');

var objectSchema = {
  cardKey: {
    type: String,
    index: true
  },
  apiKey: {
    type: String,
    trim: true
  },
  dateTimeStamp: {
    type: Date,
    expires: '1h'
  }
};

var apiKeySchema = new Mongoose.Schema(objectSchema);

// validation
apiKeySchema.path('cardKey').required(true, 'Card key is a required field.');
apiKeySchema.path('apiKey').required(true, 'API Key is a required field.');

// statics
apiKeySchema.statics = {
  load: function (cardKey, callback) {
    this.findOne({
        cardKey: cardKey
      })
      .select('apiKey')
      .exec(function (err, result) {
        callback && callback(err, result ? result.apiKey : null);
      });
  }
};

exports.objectSchema = objectSchema;
exports.modelSchema = apiKeySchema;

