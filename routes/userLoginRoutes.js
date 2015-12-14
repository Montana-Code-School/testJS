var mongoose = require('mongoose');
var User = require('../models/user');

module.exports = function(app, passport) {

  function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/');
  }

  function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.local.role === 'admin') {
      return next();
    }
    res.redirect('/practice.ejs');
  }
  app.get('/', function(req, res) {
    res.render('index.ejs', {
      user: req.user
    });
  });

// LOGIN
  app.get('/login', function(req, res) {
    res.render('login.ejs', { message: req.flash('loginMessage') });
  });

  app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });

// process the login form
  app.post('/login', passport.authenticate('local-login', {
    successRedirect: '/practice',
    failureRedirect: '/login',
  }));

// SIGNUP
  app.get('/signup', function(req, res) {
    res.render('signup.ejs', { message: req.flash('signupMessage') });
  });

  app.post('/signup', passport.authenticate('local-signup', {
    successRedirect: '/',
    failureRedirect: '/signup',
    failureFlash: true
  }));

  app.get('/profile', isLoggedIn, function(req, res) {
    res.render('profile.ejs', {
      user: req.user
    });
  });

  app.get('/practice', isLoggedIn, function(req, res) {
    res.render('practice.ejs', {
      user: req.user
    });
  });

//  Admin Routes
  app.get('/post_exercise', isAdmin, function(req, res) {
    res.render('post_exercise.ejs', {
      user: req.user
    });
  });

  app.get('/api/users/', function(req, res) {
    mongoose.model('User').find({}, function(err, user) {
      if (err) {
        res.send(err);
      }
      res.json(user);
    });
  });

  app.delete('/api/users/:id', isAdmin, function(req, res) {
    mongoose.model('User').findById({
      _id: req.params.id,
    }, function(err, user) {
      if (err) {
        res.send(err);
      } else {
        mongoose.model('User').remove({
          _id: req.params.id,
        }, function(err, user) {
          if (err) {
            res.send(err);
          } else {
            res.json({ message: 'User ' + user.email + ' deleted.'});
          }
        })
      }
    });
  });


  app.get('/admin', isAdmin, function(req, res) {
    mongoose.model('User').find({}, function(err, users) {
      if (err) {
        return console.log(err);
      } else {
        res.render('adminProfile.ejs', {
          users: users,
          user: req.user
        });
      }
    });
  });
};
