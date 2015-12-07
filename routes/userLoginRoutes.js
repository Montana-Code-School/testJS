var mongoose = require('mongoose');
var User = require('../models/user');

module.exports = function(app, passport) {

  app.get('/', function(req, res) {
    res.render('index.ejs', {
      user  : req.user
    });
  });

    // =====================================
    // LOGIN ===============================
    // =====================================
    // show the login form
  app.get('/login', function(req, res) {

        // render the page and pass in any flash data if it exists
    res.render('login.ejs', { message: req.flash('loginMessage') });
  });

    // process the login form
  app.post('/login', passport.authenticate('local-login', {
    successRedirect: '/profile', // redirect to the secure profile section
    failureRedirect: '/login', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
  }));
    // app.post('/login', do all our passport stuff here);

    // =====================================
    // SIGNUP ==============================
    // =====================================
    // show the signup form
  app.get('/signup', function(req, res) {
        // render the page and pass in any flash data if it exists
    res.render('signup.ejs', { message: req.flash('signupMessage') });
  });

    // process the signup form
  app.post('/signup', passport.authenticate('local-signup', {
    successRedirect: '/', // redirect to the secure profile section
    failureRedirect: '/signup', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
  }));


  app.get('/profile', isLoggedIn, function(req, res) {
    res.render('profile.ejs', {
      user: req.user 
    });
  });

  app.get('/post_exercise', isLoggedIn, function(req, res) {
    res.render('post_exercise.ejs', {
      user: req.user
    });
  });

    
  app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });


  app.get('/admin', isAdmin, function(req, res) {
    mongoose.model('User').find({}, function(err, users){
      if(err){
        return console.log(err);
      } else {
        res.render('adminProfile.ejs', {
          users : users,
          user : req.user
        });
      }
    });
  });

};

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
      return next();
  }
    res.redirect('/');
}


function isAdmin(req, res, next) {
  if(req.isAuthenticated() && req.user.local.role === 'admin')

    return next();

  res.redirect('/');
}
