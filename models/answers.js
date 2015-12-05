var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');

var answerSchema = mongoose.Schema({
  exercise: [{type: mongoose.Schema.Types.ObjectId, ref: 'Exercises'}],
  user: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
  answer: String,
  pass: Boolean
});


// create the model for users and expose it to our app
module.exports = mongoose.model('Answer', answerSchema);
