var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');

var exerciseSchema = mongoose.Schema({
  type: String,
  name: String,
  problem: String,
  answer: String,
  user: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
  // userAnswer: [{type: mongoose.Schema.Types.ObjectId, ref: 'Answer'}]
});


// create the model for users and expose it to our app
module.exports = mongoose.model('Exercises', exerciseSchema);
