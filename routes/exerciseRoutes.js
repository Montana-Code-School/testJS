var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var Exercises = require('../models/exercises');

module.exports = function(app, passport) {

  app.get('/api/exercises/', function(req, res) {
    mongoose.model('Exercises').find({}, function(err, exercise) {
      if (err) {
        return console.log('err');
      } else {
        res.json(exercise);
      }
    });
  });

  app.post('/api/exercises/', function(req, res) {

    var problem = req.body.problem;
    var answer = req.body.answer;
    var pass = req.body.pass;
    mongoose.model('Exercises').create({
      problem: problem,
      answer: answer,
      pass: false

    }, function(err, exercises) {
      if (err) {
        res.send('houston we have a problem');
      } else {
        console.log('New exercise ' + exercises + ' created!');
        res.send(exercises);
      }
    });
  });

  app.get('/api/exercises/:id', function(req, res) {
    mongoose.model('Exercises').findById({
      _id: req.params.id
    }, function(err, exercise) {
      if (err) {
        res.send(err);
      }
      res.json(exercise);
    });
  });

  app.post('/api/answer/:id', function(req, res) {

    mongoose.model('Exercises').findById({
      _id: req.params.id
    }, function(err, exercise) {
      if (err) {
        res.send('houston we have a problem');
      } else {
        var itPasses = exercise.answer === req.body.answer;
        mongoose.model('Answer').create({
          exercise: req.params.id,
          answer: req.body.answer,
          pass: itPasses,
          user: req.user._id
        }, function(answer) {
          if (err) {
            res.send(err);
          } else {
            console.log('New answer ' + answer + ' created!');
            res.json(answer);
          }
        });
      }
    });
  });

  app.put('/api/exercises/:id', function(req, res) {
    mongoose.model('Exercises').findById(req.params.id, function(err, exercise) {
      if (err) {
        res.send(err);
      }

      exercise.name = req.body.name;
      exercise.problem = req.body.problem;
      exercise.answer = req.body.answer;
      exercise.studentAnswer = req.body.studentAnswer;
      exercise.pass = req.body.pass;
      exercise.type = req.body.type;

      console.log(JSON.stringify(exercise));

      exercise.save();
      res.send(exercise);
        // res.json({ message: 'Exercise was updated'});
    });
  });

  app.delete('/api/exercises/:id', function(req, res) {
    mongoose.model('Exercises').remove({
      _id: req.params.id
    }, function(err, exercise) {
      if (err) {
        res.send(err);
      }
      res.json({ message: 'Successfully Deleted'});
    });
  });

};
