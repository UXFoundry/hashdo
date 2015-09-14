var Mongoose = require('mongoose');

var objectSchema = {
  pack: {
    type: String,
    trim: true,
    index: true
  },
  card: {
    type: String,
    trim: true,
    index: true
  },
  key: {
    type: String,
    trim: true,
    index: true
  },
  token: {
    type: String,
    trim: true
  },
  dateTimeStamp: {
    type: Date,
    'default': Date.now
  }
};

var lockSchema = new Mongoose.Schema(objectSchema);

// validation
lockSchema.path('pack').required(true, 'Pack is a required field.');
lockSchema.path('card').required(true, 'Card is a required field.');
lockSchema.path('token').required(true, 'Token is a required field.');

// statics
lockSchema.statics = {
  load: function (pack, card, key, callback) {
    this.findOne({
        pack: pack,
        card: card,
        key: key
      })
      .select('token')
      .exec(function (err, result) {
        callback && callback(err, result ? result.token : null);
      });
  }
};

exports.objectSchema = objectSchema;
exports.modelSchema = lockSchema;

