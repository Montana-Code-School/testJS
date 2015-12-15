var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');

var answerSchema = mongoose.Schema({
  date: {type: Date, default: Date.now},
  exercise: {type: mongoose.Schema.Types.ObjectId, ref: 'Exercises'},
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  answer: String,
  pass: Boolean
});

module.exports = mongoose.model('Answer', answerSchema);
