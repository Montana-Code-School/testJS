var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');

var instructorSchema = mongoose.Schema({

  local: {
    userName: String,
    email: String,
    password: String
    }
});

instructorSchema.methods.generateHash = function(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// checking if password is valid
instructorSchema.methods.validPassword = function(password) {
  return bcrypt.compareSync(password, this.local.password);
};

// create the model for users and expose it to our app
module.exports = mongoose.model('Instructor', instructorSchema);
