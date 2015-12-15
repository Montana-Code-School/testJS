var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var Exercises = require('../models/exercises');
var Answer = require('../models/answers');

module.exports = function(app, passport) {



  

  app.get('/api/exercises/', function(req, res) {
    mongoose.model('Exercises').find({})
    .populate('Users')
    .populate('userAnswer')
    .exec(function(err, exercise) {
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

  app.post('/api/exercises/', function(req, res) {

    var type = req.body.type;
    var name = req.body.name;
    var problem = req.body.problem;
    var answer = req.body.answer;
    var pass = req.body.pass;
    // var user = req.body.user;
    var next = null;
    var prev = null;

    mongoose.model('Exercises').find({
      type: type,
      next: null
    }, function(err, exercise) {
      var prevX = exercise.length === 0 ? null : exercise[0];
      if (err) {
        console.log(err);
      } else {
        mongoose.model('Exercises').create({
          type: type,
          name: name,
          problem: problem,
          answer: answer,
          pass: false,
          // user: user || null,
          next: null,
          prev: prevX ? prevX._id : null
        }, function(err2create, exercises) {
          if (err2create) {
            res.send('error posting an exercise: ' + err2create);
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


// we need to get the answer based on the user
// use case
// get all
//     wehn these are retrieved you need to find that last path and sort by
//     date, need to add date field.  date.now
// get a single answer

// get types

  // app.get('/api/userAnswers/:id/:type', function(req,res) {
  //   mongoose.model('Answer').find({
  //     user: req.params.id,
  //     exercise: { type: req.params.type }
  //   }, function(err, answer) {
  //     if (err) {
  //       res.send(err);
  //     } else {
  //       res.json(answer);
  //     }
  //   });
  // });

  app.get('/api/exercises/:id', function(req, res) {
    mongoose.model('Exercises').findById({
      _id: req.params.id
    }, function(err, exercise) {
      if (err) {
        res.send(err);
      } else {
        res.json(exercise);
      }
    });
  });

  app.get('/api/answer/', function(req, res) {
    mongoose.model('Answer').find({})
      .populate('exercise')
      .exec(function(err, answer) {
        if (err) {
          res.send(err);
        } else {
          res.json(answer);
        }
      });
  });

var validExercises = [];

  app.get('/api/user/exercises/', function(req, res) {
    mongoose.model('Exercises').find({})
    .populate('Users')
    .populate('userAnswer')
    .exec(function(err, exercise) {  
      if (err) {
        return console.log('err');
      } else {
        var uId = req.user._id;

          var filterFunction = function (data) {

            function userAnswerArray (datadata) {
              if(datadata.userAnswer.length > 0) {
                var userAnswers = datadata.userAnswer;
                return filterByUser(userAnswers);
              }
            };

          data.forEach(userAnswerArray);

          function filterByUser(answers) {
                for(var i = 0; i < answers.length; i++) {
                  if(answers[i].pass === true && answers[i].user.toString() == uId.toString()) { 
                    validExercises.push(answers[i]);
                  }  
                }
              };
            return validExercises;
          }
          var hello = filterFunction(exercise);
          res.json(hello);
        };
    });  // exec
  });  //  app.get

  app.get('/api/user/answer/', function(req, res){
    mongoose.model('Answer').find({
      user: req.user._id
    })
      .populate('exercise')
      .exec(function(err, answer) {
        if (err) {
          res.send(err);
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
        }, function(errAns, answer) {
          if (errAns) {
            res.send(errAns);
          } else {
            exercise.userAnswer.push(answer);
            console.log('Answer', exercise.userAnswer)
            exercise.save();
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

  app.delete('/api/exercises/:id', function(req, res) {
    var type = req.body.type;
    mongoose.model('Exercises').find({
      type: type
    }, function(err, exercise) {
      if (err) {
        res.send(err);
      } else {

        mongoose.model('Exercises').findById({
          _id: req.params.id,
        }, function(errInFind, ex2Del) {
          if (errInFind) {
            res.send(errInFind);
          } else {

            mongoose.model('Exercises').remove({
              _id: req.params.id,
            }, function(errInDel, exerciseDel) {
              if (errInDel) {
                res.send(errInDel);
              } else if (ex2Del.next === null && ex2Del.prev === null) {
                res.json({ message: 'Successfully Deleted Only Exercise of Type'});
              } else if (ex2Del.next === null) {
                mongoose.model('Exercises').findById({
                  _id: ex2Del.prev
                }, function(errInDelFind, prevX) {
                  if (errInDelFind) {
                    res.send(errInDelFind);
                  } else {
                    prevX.next = null;
                    prevX.save();
                    res.json({ message: 'Successfully Deleted Last exercise of Type'});
                  }
                });
              } else if (ex2Del.prev === null) {
                mongoose.model('Exercises').findById({
                  _id: ex2Del.next
                }, function(errInNextX, nextX) {
                  if (errInNextX) {
                    res.send(errInNextX);
                  } else {
                    nextX.prev = null;
                    nextX.save();
                    res.json({ message: 'Successfully Deleted First Exercise of Type'});
                  }
                });
              } else {
                mongoose.model('Exercises').find({
                  _id: { $in: [
                    ex2Del.next,
                    ex2Del.prev
                  ]}
                }, function(errInSave, middleX) {
                  if (errInSave) {
                    res.send('this is an: ' + errInSave);
                  } else {
                    middleX[0].next = ex2Del.next;
                    middleX[1].prev = ex2Del.prev;
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
    });
  });
};
