var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');

var userSchema = mongoose.Schema({

  local: {
    email: String,
    password: String
  },
  arrayExercises: {
    exercise1: Boolean,
    exercise2: Boolean,
    exercise3: Boolean,
    exercise4: Boolean,
    exercise5: Boolean,
    exercise6: Boolean,
    exercise7: Boolean,
    exercise8: Boolean,
    exercise9: Boolean,
    exercise10: Boolean
  },
  mathExercises: {
    exercise1: Boolean,
    exercise2: Boolean,
    exercise3: Boolean,
    exercise4: Boolean,
    exercise5: Boolean,
    exercise6: Boolean,
    exercise7: Boolean,
    exercise8: Boolean,
    exercise9: Boolean,
    exercise10: Boolean
  }
});

userSchema.methods.generateHash = function(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// checking if password is valid
userSchema.methods.validPassword = function(password) {
  return bcrypt.compareSync(password, this.local.password);
};

// create the model for users and expose it to our app
module.exports = mongoose.model('User', userSchema);
