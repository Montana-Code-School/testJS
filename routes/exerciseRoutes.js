var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var Exercises = require('../models/exercises');
var Answer = require('../models/answers');

module.exports = function(app, passport) {

  app.get('/api/exercises/', function(req, res) {
    mongoose.model('Exercises').find({})
    .populate('Users').exec(function(err, exercise) {
      if (err) {
        return console.log('err');
      } else {
        res.json(exercise);
      }
    });
  });

  // app.get('/api/user/exercises/', function(req, res) {
  //   mongoose.model('User').findById({
  //     _id: req.user._id
  //   })
  //   .populate('exercises').exec(function(err, exercise) {
  //     if (err) {
  //       return console.log('err');
  //     } else {
  //       res.json(exercise);
  //     }
  //   });
  // });


// two use cases
//  1st cat, test for two exercise inside cat
//  last cat

app.post('/api/exercises/', function(req, res) {

  var type = req.body.type;
  var name = req.body.name;
  var problem = req.body.problem;
  var answer = req.body.answer;
  var pass = req.body.pass;
  var user = req.body.user;
  var next = null;
  var prev = null;

  mongoose.model('Exercises').find({
    type: type,
    next: null
  }, function(err, exercise) {
    var prevX = exercise.length === 0 ? null : exercise[0];
    if (err) {
      console.log(err);
    } else{
      mongoose.model('Exercises').create({
        type: type,
        name: name,
        problem: problem,
        answer: answer,
        pass: false,
        user: user || null,
        next: null,
        prev: prevX ? prevX._id : null
      }, function(err, exercises) {
        if (err) {
          res.send('error posting an exercise: ' + err);
        } else {
          console.log('New exercise ' + exercises + ' created!' + prevX);
          if (prevX) {
            prevX.next = exercises._id;
            prevX.save();
          }
          res.send(exercises);
        }
      });
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

  app.get('/api/answer/', function(req, res) {
    mongoose.model('Answer').find({}, function(err, answer) {
      if (err) {
        return console.log('err');
      } else {
        res.json(answer);
      }
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
    mongoose.model('Exercises').findById({
      _id: req.params.id}, function(err, exercise) {
      if (err) {
        res.send(err);
      } else {

        exercise.name = req.body.name;
        exercise.problem = req.body.problem;
        exercise.answer = req.body.answer;
        exercise.user = req.body.user;
        exercise.type = req.body.type;


        console.log(JSON.stringify(exercise));

        exercise.save();
        res.send(exercise);
          // res.json({ message: 'Exercise was updated'});
      }
    });
  });

  //  Delete the only exercise in a type
  //  Delete the last exercise in a type
  //  Delete the first exercise in a type
  //  Delete an exercise in the middle of a type

  app.delete('/api/exercises/:id', function(req, res) {
    // var firstCase = exercise.length === 1;
    // var secondCase = find by index the final item in an array and delete it


    // var thirdCase = exercise[0];
    // var fourthCase = 
    var type = req.body.type;
 
    mongoose.model('Exercises').find({
      type: type
    }, function(err, exercise){
      var firstCase = exercise.length === 1;
      console.log(firstCase, "firstcase");
      if(err){
        res.send(err)
      } else {

        mongoose.model('Exercises').findById({
          _id: req.params.id,
        }, function(err, ex2Del){
          if(err){
            res.send(err);
          } else {

            mongoose.model('Exercises').remove({
              _id: req.params.id,
            }, function(err, exercise) {
              if (err) {
                res.send(err);
              } else if(firstCase) {
                res.json({ message: 'Successfully Deleted Only Exercise of Type'});
              } else if (ex2Del.next === null) {
                mongoose.model('Exercises').findById({
                  _id: ex2Del.prev
                }, function(err, prevX){
                  if(err) {
                    res.send(err);
                  } else {
                    prevX.next = null;
                    prevX.save();
                    res.json({ message: 'Successfully Deleted Last exercise of Type'});
                  }
                })
              } else if (ex2Del.prev === null) {
                mongoose.model('Exercises').findById({
                  _id: ex2Del.next
                }, function(err, nextX){
                  if(err) {
                    res.send(err);
                  } else {
                    nextX.prev = null;
                    nextX.save();
                    res.json({ message: 'Successfully Deleted First Exercise of Type'});
                  }
                })
              } else {
                console.log(ex2Del.next, ex2Del.prev);
                mongoose.model('Exercises').find({
                  _id: { $in: [
                    ex2Del.next,
                    ex2Del.prev
                    ]}
                  }, function(err, middleX){
                    if(err) {
                      res.send("this is an: " + err);
                    } else {
                      var middleXprev = middleX[0].prev;
                      middleX[0].prev = middleX[1].next;
                      middleX[1].next = middleXprev;
                      middleX[0].save();
                      middleX[1].save();
                      res.json({ message: 'Successfully Deleted Middle Exercise of Type'});
                    }
                  }
                );
              }
            });
          }
        });
      }
    })
  });


};
