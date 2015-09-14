var Mongoose = require('mongoose');

var objectSchema = {
  cardKey: {
    type: String,
    index: true,
    unique: true
  },
  value: {
    type: Mongoose.Schema.Types.Mixed
  },
  dateTimeStamp: {
    type: Date,
    'default': Date.now
  }
};

var stateSchema = new Mongoose.Schema(objectSchema);

// validation
stateSchema.path('cardKey').required(true, 'Card key is a required field.');
stateSchema.path('value').required(true, 'State value is a required field.');

// statics
stateSchema.statics = {
  load: function (cardKey, callback) {
    this.findOne({
        cardKey: cardKey
      })
      .select('value')
      .exec(function (err, result) {
        callback && callback(err, result ? result.value : null);
      });
  }
};

exports.objectSchema = objectSchema;
exports.modelSchema = stateSchema;

